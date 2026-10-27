import { createRequire } from "node:module";

const require=createRequire(import.meta.url),{chromium}=require("playwright"),base=process.env.IX_BASE_URL||"http://127.0.0.1:4319",taskId="t-test",marker="Presentation demonstration: supplier witness confirmation pending",evidence="Demo witness request DEMO-2026-10-27";
const request=async(path,{token,method="GET",body}={})=>{const response=await fetch(`${base}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});const result=await response.json().catch(()=>({}));return{response,result}};
const login=async userId=>{const {response,result}=await request("/api/auth/login",{method:"POST",body:{userId,password:"Demo!2026"}});if(!response.ok)throw new Error(`Login failed for ${userId}: ${result.error||response.status}`);return result};

const employee=await login("sc"),before=(await request("/api/state",{token:employee.token})).result,task=before.tasks.find(item=>item.id===taskId&&item.assignee_id==="sc");
if(!task)throw new Error("The designated fictional demonstration task is unavailable to Sipho Cele.");
const original={id:task.id,title:task.title,project:task.project,status:task.status,blocker:task.blocker||"",evidence:task.evidence||""};
const alreadyRecorded=before.updates.some(item=>item.task_id===taskId&&item.blocker===marker&&item.evidence===evidence);
let uiUpdatePerformed=false;
if(!alreadyRecorded){
  const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:850}});
    await page.goto(`${base}/#team`,{waitUntil:"networkidle"});
    await page.locator("#account").selectOption("sc");await page.locator("#password").fill("Demo!2026");await page.locator("#login-form button[type=submit]").click();
    await page.locator(`[data-task="${taskId}"]`).click();await page.locator("#dialog-form select[name=status]").selectOption("Blocked");await page.locator("#dialog-form input[name=progress]").fill("55");await page.locator("#dialog-form textarea[name=blocker]").fill(marker);await page.locator("#dialog-form input[name=evidence]").fill(evidence);await page.locator("#dialog-form button.primary").click();await page.locator("#dialog-form").waitFor({state:"detached"});
    uiUpdatePerformed=true;
  }finally{await browser.close()}
}

const employeeAfter=(await request("/api/state",{token:employee.token})).result,saved=employeeAfter.updates.find(item=>item.task_id===taskId&&item.blocker===marker);
if(!saved)throw new Error("The employee update was not returned by the application after save.");
const otherTask=employeeAfter.tasks.find(item=>item.assignee_id!=="sc"),forbidden=otherTask?await request(`/api/tasks/${otherTask.id}/update`,{token:employee.token,method:"POST",body:{status:"Blocked",progress:1,blocker:"Isolation check",evidence:""}}):null;
if(forbidden&&forbidden.response.status!==403)throw new Error("Employee task ownership was not enforced.");
await request("/api/mode",{token:employee.token,method:"POST",body:{mode:"REAL"}});const realState=(await request("/api/state",{token:employee.token})).result;if(realState.updates.some(item=>item.blocker===marker))throw new Error("The Demo update crossed into Real Mode.");
const director=await login("director"),directorState=(await request("/api/state",{token:director.token})).result,dashboardUpdate=directorState.updates.find(item=>item.blocker===marker),preflight=(await request("/api/avatar/preflight",{token:director.token,method:"POST",body:{sessionType:"sandbox"}})).result;
if(!dashboardUpdate)throw new Error("The director dashboard state omitted the employee update.");
if(!preflight?.outboundContext?.tasks_summary?.includes(marker)||!preflight.outboundContext.tasks_summary.includes(task.project))throw new Error("Wayne's reviewed context omitted the task update or project name.");
if(!/Alex Mokoena.*Director.*Wayne.*operations assistant/i.test(preflight.outboundContext.business_summary))throw new Error("Wayne's identity context is incorrect.");
if(!preflight.outboundContext.finance_summary.includes("Cash or bank balance: Not available"))throw new Error("Wayne's finance labels do not state unavailable cash honestly.");
console.log(JSON.stringify({intentionalDemoChange:true,uiUpdatePerformed,recordWasAlreadyPresent:alreadyRecorded,original,saved:{task:saved.title,project:saved.project,author:saved.author,status:saved.status,blocker:saved.blocker,evidence:saved.evidence,createdAt:saved.created_at},directorDashboardContainsUpdate:true,wayneContextContainsUpdate:true,wayneIdentityCorrect:true,financeLabelsAccurate:true,employeeOwnershipBlocked:forbidden?forbidden.response.status===403:"No unassigned task visible",demoRealIsolation:true,providerSessionCreated:false},null,2));
