const base=process.env.WAYNE_VERIFY_URL||"http://127.0.0.1:4337";

async function request(path,{token,method="GET",body,allowError=false}={}){
  const response=await fetch(`${base}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  const result=await response.json();
  if(!response.ok&&!allowError)throw new Error(`${path}: ${response.status} ${result.error}`);
  return{status:response.status,result};
}
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const login=async userId=>(await request("/api/auth/login",{method:"POST",body:{userId,password:"Demo!2026"}})).result.token;
const state=token=>request("/api/state",{token}).then(x=>x.result);
const preflight=(token,body={sessionType:"sandbox"})=>request("/api/avatar/preflight",{token,method:"POST",body}).then(x=>x.result);
const connect=(token,review)=>request("/api/avatar/session",{token,method:"POST",body:{sessionType:"sandbox",preflightToken:review.preflightToken,confirmed:true}}).then(x=>x.result);
const event=(token,id,role,content,providerEventId)=>request("/api/avatar/session/event",{token,method:"POST",body:{id,role,content,providerEventId}}).then(x=>x.result);
const stop=(token,id,keepMeetingOpen=false)=>request("/api/avatar/session/stop",{token,method:"POST",body:{id,keepMeetingOpen},allowError:true});

const token=await login("director");
let active=null;
try{
  const before=await state(token),review=await preflight(token);
  assert((await state(token)).wayneMeetings.length===before.wayneMeetings.length,"Preflight/cancellation created a logical meeting.");
  const variables=review.outboundContext;
  assert(Object.values(variables).every(value=>String(value).length<=1000),"A dynamic variable exceeds 1,000 characters.");
  assert(variables.business_summary.includes("Alex Mokoena")&&variables.business_summary.includes("Director")&&variables.business_summary.includes("Wayne is the operations assistant"),"Director/Wayne roles are not explicit.");
  assert(variables.projects_summary.includes("Clinic electrical upgrade")&&!/Project [A-E]\b/.test(variables.projects_summary),"Actual project names were not supplied.");
  assert(variables.finance_summary.includes("Total invoiced")&&variables.finance_summary.includes("Recorded receipts")&&variables.finance_summary.includes("Recorded expenses")&&variables.finance_summary.includes("Outstanding receivables")&&variables.finance_summary.includes("Cash or bank balance: Not available"),"Financial categories are incomplete.");
  assert(/less than total invoiced/i.test(variables.finance_summary),"The 207,000 versus 255,000 comparison is not stated accurately.");
  assert(!variables.meetings_summary.includes("26 Oct")&&!variables.meetings_summary.includes("Scheduled"),"An upcoming scheduled meeting leaked into recorded discussion history.");

  active=await connect(token,review);
  const meetingId=active.meetingId;
  assert(meetingId&&meetingId===active.meetingId,"Direct launch did not create a logical meeting after confirmation.");
  await event(token,active.id,"user","Discuss the distinctive clinic switchgear approval and prepare an email for the client.","accuracy-user-1");
  const draft=await event(token,active.id,"assistant","EMAIL DRAFT\nSubject: Clinic switchgear approval follow-up\nBody: Dear Riverside Clinic team,\n\nThe drawing approval remains outstanding for the Clinic electrical upgrade. Please confirm the review status and expected approval date so the project team can plan the next activity.\n\nRegards,\nAlex","accuracy-assistant-1");
  assert(draft.emailDraft?.subject==="Clinic switchgear approval follow-up"&&draft.emailDraft.body.includes("drawing approval"),"A complete email draft was not captured.");

  const restartReview=await preflight(token,{sessionType:"sandbox",meetingId});
  assert(restartReview.outboundContext.meetings_summary.includes("distinctive clinic switchgear approval"),"Latest recorded discussion was not passed into restart context.");
  const restarted=await connect(token,restartReview);
  active=restarted;
  assert(restarted.meetingId===meetingId,"Explicit restart created a duplicate logical meeting.");
  assert(restarted.continuity.continued&&!/I.m Wayne/i.test(restarted.greeting),"Restart did not use a short continuation greeting.");
  await stop(token,restarted.id,false);active=null;

  const after=await state(token),record=after.wayneMeetings.find(x=>x.id===meetingId);
  assert(record&&record.transcript.some(x=>x.content.includes("distinctive clinic switchgear approval")),"Transcript did not persist across the explicit restart.");
  assert(record.emailDrafts?.some(x=>x.subject==="Clinic switchgear approval follow-up"),"Email draft was not restored with meeting history.");
  const followUp=await preflight(token,{sessionType:"sandbox",followUpMeetingId:meetingId});
  assert(followUp.outboundContext.meetings_summary.includes("distinctive clinic switchgear approval"),"Optional follow-up did not select the recorded meeting.");
  assert((await state(token)).wayneMeetings.length===after.wayneMeetings.length,"Optional follow-up preflight created a meeting before acceptance.");

  await request("/api/mode",{token,method:"POST",body:{mode:"REAL"}});
  assert((await state(token)).wayneMeetings.length===0,"Demo meeting history crossed into Real Mode.");
  const employee=await login("tm");
  assert((await state(employee)).wayneMeetings.length===0,"Director meeting history crossed into another user account.");

  console.log(JSON.stringify({
    quickLaunch:{cancelCreatedMeeting:false,confirmedMeetingId:meetingId},
    context:{directorIdentity:true,actualProjectNames:true,financeLabels:true,comparisonCorrect:true,scheduledMeetingExcluded:true,maxVariableLength:Math.max(...Object.values(variables).map(x=>String(x).length))},
    continuity:{sameLogicalMeeting:true,discussionPersisted:true,shortContinuationGreeting:true,optionalFollowUp:true},
    emailDraft:{captured:true,subject:draft.emailDraft.subject},
    isolation:{realMode:true,otherUser:true},
    provider:{sandboxSessionsStarted:2,presentationSessionsStarted:0}
  },null,2));
}finally{
  if(active?.id)await stop(token,active.id,false).catch(()=>{});
}
