import { createLiveAvatarProvider } from "../liveavatar-provider.mjs";
import { validateSessionCredit } from "../wayne-session-policy.mjs";

const calls=[],required=["user_name","name_pronunciation","snapshot_time","workspace_mode","business_summary","tenders_summary","projects_summary","tasks_summary","finance_summary","quotations_summary","funding_summary","compliance_summary","crm_summary","meetings_summary"];
globalThis.fetch=async(url,options={})=>{
  calls.push({url:String(url),method:options.method||"GET",body:options.body?JSON.parse(options.body):null});
  if(String(url).endsWith("/v1/voice_agents/agent"))return Response.json({data:{agent_configuration:{context_id:"context"}}});
  if(String(url).endsWith("/v1/contexts/context"))return Response.json({data:{required_dynamic_variables:required}});
  if(String(url).endsWith("/v1/users/credits"))return Response.json({data:{credits_left:"6"}});
  if(String(url).endsWith("/v1/sessions/token"))return Response.json({data:{session_token:"test-token"}});
  if(String(url).endsWith("/v1/sessions/start"))return Response.json({data:{session_id:`session-${calls.length}`,livekit_url:"wss://example.invalid",livekit_client_token:"client-token"}});
  if(String(url).endsWith("/events")&&options.method==="DELETE")return Response.json({code:100,data:null,message:"deleted"});
  throw new Error(`Unexpected provider call: ${url}`);
};

const provider=createLiveAvatarProvider({LIVEAVATAR_API_KEY:"test-key",LIVEAVATAR_VOICE_AGENT_ID:"agent",PATHBRIDGE_ZERO_PAYMENT:"true",PATHBRIDGE_AVATAR_SANDBOX:"true"}),context=Object.fromEntries(required.map(key=>[key,"Allowed summary"]));
const balance=await provider.credits(),presentationCheck=validateSessionCredit({type:"presentation",balance,confirmed:true}),presentation=await provider.start({dynamicVariables:context,sessionType:"presentation"}),sandbox=await provider.start({dynamicVariables:context,sessionType:"sandbox"});await provider.deleteSessionEvents("provider-session");
const tokenBodies=calls.filter(x=>x.url.endsWith("/v1/sessions/token")).map(x=>x.body);
if(tokenBodies[0].is_sandbox!==false||tokenBodies[0].max_session_duration!==120)throw new Error("Presentation token policy failed.");
if(tokenBodies[1].is_sandbox!==true||tokenBodies[1].max_session_duration!==60)throw new Error("Sandbox token policy failed.");
if("dynamic_variables" in tokenBodies[0])throw new Error("Dynamic variables were duplicated at token top level.");
if(tokenBodies[0].voice_agent.dynamic_variables.meetings_summary!=="Allowed summary")throw new Error("Voice-agent context was not supplied.");
let insufficient=false,unconfirmed=false;try{validateSessionCredit({type:"presentation",balance:3,confirmed:true})}catch{insufficient=true}try{validateSessionCredit({type:"presentation",balance:6,confirmed:false})}catch{unconfirmed=true}if(!insufficient||!unconfirmed)throw new Error("Presentation credit confirmation rules failed.");
console.log(JSON.stringify({providerCalls:calls.map(x=>`${x.method} ${new URL(x.url).pathname}`),balance,presentationCheck,presentation,sandbox,insufficientBlocked:insufficient,unconfirmedBlocked:unconfirmed,providerDeletionCalled:calls.some(x=>x.method==="DELETE"&&x.url.endsWith("/events"))},null,2));
