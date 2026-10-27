import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const port=4349,base=`http://127.0.0.1:${port}`,fixture=mkdtempSync(join(tmpdir(),"infinite-x-presentation-"));
const server=spawn(process.execPath,["server.mjs"],{cwd:new URL("..",import.meta.url),env:{...process.env,PORT:String(port),IX_DATA_DIR:fixture},stdio:"ignore"});
const request=async(path,{token,method="GET",body}={})=>{const response=await fetch(`${base}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||`${path} returned ${response.status}`),{status:response.status});return result};

try{
  let ready=false;
  for(let attempt=0;attempt<50;attempt++){try{const response=await fetch(base);if(response.ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
  if(!ready)throw new Error("Isolated presentation server did not start.");
  const employee=await request("/api/auth/login",{method:"POST",body:{userId:"sc",password:"Demo!2026"}}),employeeState=await request("/api/state",{token:employee.token}),task=employeeState.tasks.find(item=>item.assignee_id==="sc");
  if(!task)throw new Error("The isolated fixture has no Sipho task.");
  const marker="Presentation fixture: client drawing approval pending";
  await request(`/api/tasks/${task.id}/update`,{token:employee.token,method:"POST",body:{status:"Blocked",progress:62,blocker:marker,evidence:"Fixture evidence reference"}});
  const director=await request("/api/auth/login",{method:"POST",body:{userId:"director",password:"Demo!2026"}}),directorState=await request("/api/state",{token:director.token}),saved=directorState.updates.find(item=>item.blocker===marker);
  let preflight=null,preflightError=null;
  try{preflight=await request("/api/avatar/preflight",{token:director.token,method:"POST",body:{sessionType:"sandbox"}})}catch(error){preflightError=error.message}
  const tasksSummary=preflight?.outboundContext?.tasks_summary||"",businessSummary=preflight?.outboundContext?.business_summary||"",financeSummary=preflight?.outboundContext?.finance_summary||"";
  const result={isolatedFixture:true,task:task.title,project:task.project,employee:saved?.author||null,dashboardUpdateVisible:Boolean(saved),waynePayloadContainsUpdate:tasksSummary.includes(marker),waynePayloadContainsProject:tasksSummary.includes(task.project),identityCorrect:/Alex Mokoena.*Director.*Wayne.*operations assistant/i.test(businessSummary),cashUnavailable:financeSummary.includes("Cash or bank balance: Not available"),presentationSessionCreated:false,preflightError};
  if(!result.dashboardUpdateVisible)throw new Error("The director state did not contain the employee update.");
  if(preflight&&!result.waynePayloadContainsUpdate)throw new Error("Wayne's reviewed tasks summary omitted the latest employee update.");
  console.log(JSON.stringify(result,null,2));
}finally{
  server.kill();
  await new Promise(resolve=>server.once("exit",resolve));
  rmSync(fixture,{recursive:true,force:true});
}
