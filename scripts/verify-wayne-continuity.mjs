const base=process.env.WAYNE_VERIFY_URL||"http://127.0.0.1:4332";

async function request(path,{token,method="GET",body,allowError=false}={}){
  const response=await fetch(`${base}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  const result=await response.json();if(!response.ok&&!allowError)throw new Error(`${path}: ${response.status} ${result.error}`);return{status:response.status,result};
}
async function login(userId="director"){
  return (await request("/api/auth/login",{method:"POST",body:{userId,password:"Demo!2026"}})).result.token;
}
async function stop(token,id){return request("/api/avatar/session/stop",{token,method:"POST",body:{id},allowError:true})}
async function startSandbox(token){const preflight=(await request("/api/avatar/preflight",{token,method:"POST",body:{sessionType:"sandbox"}})).result;return (await request("/api/avatar/session",{token,method:"POST",body:{sessionType:"sandbox",preflightToken:preflight.preflightToken,confirmed:true}})).result}

const token=await login(),first=await startSandbox(token);
await request("/api/avatar/session/event",{token,method:"POST",body:{id:first.id,role:"user",content:"Let us discuss the Clinic electrical upgrade. What is blocking it?"}});
await request("/api/avatar/session/event",{token,method:"POST",body:{id:first.id,role:"assistant",content:"The current record says drawing approval is outstanding and the project is at risk."}});

// Simulate a reload or interrupted browser close that leaves the provider session active.
// The next explicitly confirmed start must close that same user's same-mode session,
// persist its recap, and replace it without producing the former 409 dead end.
const replacementPreflight=(await request("/api/avatar/preflight",{token,method:"POST",body:{sessionType:"sandbox"}})).result;
if(!replacementPreflight.activeSession||!replacementPreflight.warning.includes("session before connecting"))throw new Error("Preflight did not disclose the active-session handoff.");
const restarted=(await request("/api/avatar/session",{token,method:"POST",body:{sessionType:"sandbox",preflightToken:replacementPreflight.preflightToken,confirmed:true}})).result;
if(!restarted.continuity?.continued||!restarted.continuity.recap.includes("Clinic electrical upgrade"))throw new Error("Replacement did not receive the protected named-project conversation recap.");

const afterHandoff=(await request("/api/state",{token})).result;
if(!afterHandoff.wayneSessionSummaries?.length||!afterHandoff.wayneSessionSummaries[0].summary.includes("Clinic electrical upgrade"))throw new Error("The interrupted session summary was not stored.");

if(restarted.continuity.recap.length>1000)throw new Error("Continuity summary exceeded 1,000 characters.");
await request("/api/avatar/session/event",{token,method:"POST",body:{id:restarted.id,role:"user",content:"What were we discussing?"}});
await stop(token,restarted.id);

const reloadToken=await login(),reloaded=(await request("/api/state",{token:reloadToken})).result;
if(!reloaded.wayneConversation.entries.some(x=>x.content==="What were we discussing?"))throw new Error("Reload did not restore the transcript.");
const afterReload=await startSandbox(reloadToken);
if(!afterReload.continuity.recap.includes("unresolved user question"))throw new Error("Reloaded session did not receive the protected unresolved-question indicator.");
await stop(reloadToken,afterReload.id);

await request("/api/mode",{token:reloadToken,method:"POST",body:{mode:"REAL"}});
const real=(await request("/api/state",{token:reloadToken})).result;
if(real.wayneConversation.entries.length)throw new Error("Demo transcript crossed into Real Mode.");
const otherToken=await login("tm"),other=(await request("/api/state",{token:otherToken})).result;
if(other.wayneConversation.entries.length)throw new Error("Transcript crossed into another user's account.");

await request("/api/avatar/conversation/new",{token:otherToken,method:"POST",body:{}});
const fresh=(await request("/api/state",{token:otherToken})).result;
if(fresh.wayneConversation.entries.length||fresh.wayneConversation.transcriptAvailable)throw new Error("Start new conversation did not create a fresh boundary.");

console.log(JSON.stringify({
  restart:{activeSessionDisclosed:replacementPreflight.activeSession,continued:restarted.continuity.continued,recap:restarted.continuity.recap,length:restarted.continuity.recap.length,storedSummaries:afterHandoff.wayneSessionSummaries.length},
  reload:{restoredEntries:reloaded.wayneConversation.entries.length,unresolvedQuestionRestored:afterReload.continuity.recap.includes("unresolved user question")},
  isolation:{realModeEntries:real.wayneConversation.entries.length,otherUserEntries:other.wayneConversation.entries.length},
  newConversation:{entries:fresh.wayneConversation.entries.length,transcriptAvailable:fresh.wayneConversation.transcriptAvailable}
},null,2));
