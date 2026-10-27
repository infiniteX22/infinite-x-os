import { DatabaseSync } from "node:sqlite";
const base=process.env.WAYNE_VERIFY_URL||"http://127.0.0.1:4334";
const request=async(path,{token,method="GET",body,allowError=false}={})=>{const response=await fetch(`${base}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined}),result=await response.json();if(!response.ok&&!allowError)throw new Error(`${path}: ${response.status} ${result.error}`);return{status:response.status,result}};
const login=async(userId="director")=>(await request("/api/auth/login",{method:"POST",body:{userId,password:"Demo!2026"}})).result.token;
const prepare=async(token,body)=>(await request("/api/avatar/meetings",{token,method:"POST",body})).result.meeting;
const start=async(token,meetingId)=>{const p=(await request("/api/avatar/preflight",{token,method:"POST",body:{sessionType:"sandbox",meetingId}})).result;return{preflight:p,session:(await request("/api/avatar/session",{token,method:"POST",body:{sessionType:"sandbox",preflightToken:p.preflightToken,confirmed:true}})).result}};
const stop=async(token,id,keepMeetingOpen)=>(await request("/api/avatar/session/stop",{token,method:"POST",body:{id,keepMeetingOpen}})).result;

const token=await login(),distinctive="Discuss clinic drawing approval and transformer funding Delta-47 before energisation";
const meeting=await prepare(token,{kind:"new",agenda:"Quick-launch fixture"});
const first=await start(token,meeting.id);
const firstEvent=await request("/api/avatar/session/event",{token,method:"POST",body:{id:first.session.id,role:"user",content:distinctive,providerEventId:"fixture-user-1",occurredAt:"2026-10-24T08:00:00+02:00"}});
const duplicate=await request("/api/avatar/session/event",{token,method:"POST",body:{id:first.session.id,role:"user",content:distinctive,providerEventId:"fixture-user-1",occurredAt:"2026-10-24T08:00:00+02:00"}});
await request("/api/avatar/session/event",{token,method:"POST",body:{id:first.session.id,role:"assistant",content:"The recorded topic is the Delta-47 thermal survey exception. No decision has been confirmed.",providerEventId:"fixture-assistant-1",occurredAt:"2026-10-24T08:00:05+02:00"}});
let generated=(await request("/api/state",{token})).result.wayneMeetings.find(x=>x.id===meeting.id);
if(generated.title==="Untitled meeting"||!generated.title.toLowerCase().includes("clinic")||generated.title_manual)throw new Error("Transcript-based subject was not generated.");
await request(`/api/avatar/meetings/${meeting.id}/title`,{token,method:"PATCH",body:{title:"Manual Delta-47 review"}});
await stop(token,first.session.id,true);

const restarted=await start(token,meeting.id);
await request("/api/avatar/session/event",{token,method:"POST",body:{id:restarted.session.id,role:"user",content:"The unresolved question is whether the survey must be repeated.",providerEventId:"fixture-user-2",occurredAt:"2026-10-24T08:01:00+02:00"}});
await stop(token,restarted.session.id,false);

let state=(await request("/api/state",{token})).result,stored=state.wayneMeetings.find(x=>x.id===meeting.id);
if(state.wayneMeetings.some((row,index,rows)=>index>0&&Date.parse(rows[index-1].started_at)<Date.parse(row.started_at)))throw new Error("Meeting history is not sorted newest first.");
if(!stored||!stored.recap.includes("Delta-47")||/Project [1-5]/.test(stored.recap))throw new Error("Transcript-only recap is incorrect.");
if(stored.transcript.filter(x=>x.provider_event_id==="fixture-user-1").length!==1||duplicate.result.deduplicated!==true)throw new Error("Transcript event deduplication failed.");
if(stored.transcript_revision!==stored.recap_revision)throw new Error("Recap revision does not match transcript revision.");
if(stored.title!=="Manual Delta-47 review"||stored.title_manual!==1)throw new Error("Manual meeting subject was overwritten.");
if(state.wayneMeetings.filter(x=>x.id===meeting.id).length!==1)throw new Error("Restart created a duplicate logical meeting.");

const reloadToken=await login(),reloaded=(await request("/api/state",{token:reloadToken})).result.wayneMeetings.find(x=>x.id===meeting.id);
if(!reloaded||!reloaded.transcript.some(x=>x.content.includes("Delta-47")))throw new Error("Meeting history did not survive reload.");

const fromLast=(await request("/api/avatar/preflight",{token:reloadToken,method:"POST",body:{sessionType:"sandbox",followUpMeetingId:"__last__"}})).result;
if(!fromLast.outboundContext.meetings_summary.includes("Delta-47"))throw new Error("From Last Session did not resolve the newest saved discussion.");

const fresh=await prepare(reloadToken,{kind:"new",title:"Fresh agenda test",agenda:"Discuss only the new agenda"}),freshPreflight=(await request("/api/avatar/preflight",{token:reloadToken,method:"POST",body:{sessionType:"sandbox",meetingId:fresh.id}})).result;
if(freshPreflight.outboundContext.meetings_summary.includes("Delta-47")||!freshPreflight.outboundContext.meetings_summary.includes("fresh conversation"))throw new Error("A new meeting automatically continued old history.");
await request(`/api/avatar/meetings/${fresh.id}/end`,{token:reloadToken,method:"POST",body:{}});

const followup=await prepare(reloadToken,{kind:"followup",meetingId:meeting.id}),followupPreflight=(await request("/api/avatar/preflight",{token:reloadToken,method:"POST",body:{sessionType:"sandbox",meetingId:followup.id}})).result;
if(!followupPreflight.outboundContext.meetings_summary.includes("Delta-47")||/Project [1-5]/.test(followupPreflight.outboundContext.meetings_summary))throw new Error("Follow-up context did not use the selected transcript recap.");
await request(`/api/avatar/meetings/${followup.id}/end`,{token:reloadToken,method:"POST",body:{}});

const recordedDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Johannesburg",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(stored.started_at)),found=(await request(`/api/avatar/history?date=${recordedDate}`,{token:reloadToken})).result,missing=(await request("/api/avatar/history?date=1999-01-01",{token:reloadToken})).result;
if(!found.matches.some(x=>x.id===meeting.id))throw new Error("Date retrieval did not return the recorded meeting.");
if(missing.message!=="I couldn’t find a recorded meeting on that date.")throw new Error("Missing-date response is not explicit.");

const incomplete=await prepare(reloadToken,{kind:"new",title:"Transcript unavailable fixture",agenda:"No provider transcript"});await request(`/api/avatar/meetings/${incomplete.id}/end`,{token:reloadToken,method:"POST",body:{}});state=(await request("/api/state",{token:reloadToken})).result;const unavailable=state.wayneMeetings.find(x=>x.id===incomplete.id);if(unavailable.transcript_completeness!=="No transcript captured"||!unavailable.recap.includes("No transcript"))throw new Error("Missing transcript was not disclosed.");
await request("/api/mode",{token:reloadToken,method:"POST",body:{mode:"REAL"}});const real=(await request("/api/state",{token:reloadToken})).result;if(real.wayneMeetings.length)throw new Error("Demo meeting history crossed into Real Mode.");
const otherToken=await login("tm"),other=(await request("/api/state",{token:otherToken})).result;if(other.wayneMeetings.length)throw new Error("Meeting history crossed into another user account.");
await request("/api/avatar/retention",{token,method:"POST",body:{retentionDays:30}});const retained=(await request("/api/state",{token})).result.wayneMeetings.find(x=>x.id===meeting.id);if(!retained?.recap.includes("Delta-47"))throw new Error("In-policy history was removed by retention.");
let expiredCleared="not-run";if(process.env.WAYNE_VERIFY_DB){const fixtureDb=new DatabaseSync(process.env.WAYNE_VERIFY_DB);fixtureDb.prepare("UPDATE wayne_meetings SET started_at='2020-01-01T00:00:00.000Z',ended_at='2020-01-01T00:01:00.000Z' WHERE id=?").run(meeting.id);fixtureDb.close();await request("/api/avatar/retention",{token,method:"POST",body:{retentionDays:1}});const expired=(await request("/api/state",{token})).result.wayneMeetings.find(x=>x.id===meeting.id);if(expired.transcript.length||expired.transcript_completeness!=="No transcript captured"||!expired.recap.includes("retention"))throw new Error("Expired transcript/recap retention cleanup failed.");expiredCleared=true}

console.log(JSON.stringify({distinctiveRecap:stored.recap,generatedSubject:generated.title,manualSubject:stored.title,restart:{logicalMeetingCount:1,providerSessions:2,transcriptEvents:stored.transcript.length},deduplication:{firstSaved:firstEvent.result.saved,duplicateRejected:duplicate.result.deduplicated},revision:{transcript:stored.transcript_revision,recap:stored.recap_revision},reloadPersisted:true,newMeetingFresh:true,followupRecall:true,fromLastSession:true,dateLookupMatches:found.matches.length,missingDate:missing.message,incompleteTranscript:unavailable.transcript_completeness,retentionExpiredHistoryCleared:expiredCleared,isolation:{real:real.wayneMeetings.length,otherUser:other.wayneMeetings.length},presentationSessionsStarted:0},null,2));
