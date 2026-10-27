import net from "node:net";
import tls from "node:tls";

const encode=value=>Buffer.from(String(value)).toString("base64");
const cleanHeader=value=>String(value||"").replace(/[\r\n]+/g," ").trim();

function smtpConversation(socket){
  let buffer="",pending=[];
  socket.setEncoding("utf8");
  socket.on("data",chunk=>{buffer+=chunk;while(buffer.includes("\r\n")){const at=buffer.indexOf("\r\n"),line=buffer.slice(0,at);buffer=buffer.slice(at+2);const match=line.match(/^(\d{3})([ -])(.*)$/);if(!match)continue;const current=pending[0];if(current){current.lines.push(line);if(match[2]===" "){pending.shift();current.resolve({code:Number(match[1]),text:current.lines.join("\n")});}}}});
  socket.on("error",error=>{while(pending.length)pending.shift().reject(error)});
  const receive=()=>new Promise((resolve,reject)=>pending.push({resolve,reject,lines:[]}));
  const command=async(value,expected=[250])=>{socket.write(`${value}\r\n`);const reply=await receive();if(!expected.includes(reply.code))throw new Error(`SMTP ${reply.code}: ${reply.text.slice(0,300)}`);return reply};
  return{receive,command};
}

export function createEmailDelivery(env=process.env){
  const config={host:env.SMTP_HOST||"",port:Number(env.SMTP_PORT||587),secure:String(env.SMTP_SECURE||"false").toLowerCase()==="true",user:env.SMTP_USER||"",password:env.SMTP_PASSWORD||"",from:env.SMTP_FROM||""};
  const configured=Boolean(config.host&&config.port&&config.from&&(!config.user||config.password));
  async function send({to,subject,text}){
    if(!configured)throw new Error("SMTP delivery is awaiting server-side configuration.");
    const connect=()=>new Promise((resolve,reject)=>{const socket=config.secure?tls.connect({host:config.host,port:config.port,servername:config.host},()=>resolve(socket)):net.connect({host:config.host,port:config.port},()=>resolve(socket));socket.setTimeout(15000,()=>socket.destroy(new Error("SMTP connection timed out.")));socket.once("error",reject)});
    let socket=await connect(),smtp=smtpConversation(socket);const greeting=await smtp.receive();if(greeting.code!==220)throw new Error(`SMTP greeting failed: ${greeting.text}`);
    await smtp.command(`EHLO ${env.SMTP_HELO||"localhost"}`);
    if(!config.secure&&Number(config.port)!==25){await smtp.command("STARTTLS",[220]);socket=tls.connect({socket,servername:config.host});await new Promise((resolve,reject)=>{socket.once("secureConnect",resolve);socket.once("error",reject)});smtp=smtpConversation(socket);await smtp.command(`EHLO ${env.SMTP_HELO||"localhost"}`);}
    if(config.user){await smtp.command("AUTH LOGIN",[334]);await smtp.command(encode(config.user),[334]);await smtp.command(encode(config.password),[235]);}
    await smtp.command(`MAIL FROM:<${config.from}>`);await smtp.command(`RCPT TO:<${to}>`,[250,251]);await smtp.command("DATA",[354]);
    const body=String(text||"").replace(/\r?\n/g,"\r\n").replace(/^\./gm,"..");socket.write(`From: ${cleanHeader(config.from)}\r\nTo: ${cleanHeader(to)}\r\nSubject: ${cleanHeader(subject)}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}\r\n.\r\n`);const accepted=await smtp.receive();if(accepted.code!==250)throw new Error(`SMTP message rejected: ${accepted.text}`);await smtp.command("QUIT",[221]);socket.end();return{accepted:true,provider:"smtp",response:accepted.text};
  }
  return{configured,mode:env.EMAIL_MODE||"preview",send,status:{configured,host:config.host||null,port:config.port,from:config.from||null,mode:env.EMAIL_MODE||"preview",missing:[!config.host&&"SMTP_HOST",!config.from&&"SMTP_FROM",config.user&&!config.password&&"SMTP_PASSWORD"].filter(Boolean)}};
}
