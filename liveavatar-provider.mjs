const BASE_URL="https://api.liveavatar.com";
const WAYNE_SANDBOX_AVATAR_ID="dd73ea75-1218-4ef3-92ce-606d5f7fbc0a";
const REQUIRED_CONTEXT_VARIABLES=["user_name","name_pronunciation","snapshot_time","workspace_mode","business_summary","tenders_summary","projects_summary","tasks_summary","finance_summary","quotations_summary","funding_summary","compliance_summary","crm_summary","meetings_summary"];

function providerError(message,status=503,detail=""){
  return Object.assign(new Error(message),{status,detail});
}

async function request(path,options,label){
  let response;
  try{response=await fetch(`${BASE_URL}${path}`,{...options,signal:AbortSignal.timeout(15000)});}
  catch(error){throw providerError(`${label} could not be reached.`,502,error.message);}
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw providerError(`${label} failed (${response.status}).`,502,payload?.message||payload?.detail||"");
  return payload;
}

export function createLiveAvatarProvider(env=process.env){
  const apiKey=env.LIVEAVATAR_API_KEY||"";
  const agentId=env.LIVEAVATAR_VOICE_AGENT_ID||"";
  const zeroPayment=String(env.PATHBRIDGE_ZERO_PAYMENT||"true").toLowerCase()==="true";
  const sandbox=String(env.PATHBRIDGE_AVATAR_SANDBOX||"true").toLowerCase()==="true";
  const configured=Boolean(apiKey&&agentId&&zeroPayment&&sandbox);
  let capabilityCache=null;

  async function capabilities(){
    if(!configured){const missing=[];if(!apiKey)missing.push("LIVEAVATAR_API_KEY");if(!agentId)missing.push("LIVEAVATAR_VOICE_AGENT_ID");if(!zeroPayment)missing.push("PATHBRIDGE_ZERO_PAYMENT=true");if(!sandbox)missing.push("PATHBRIDGE_AVATAR_SANDBOX=true");return{configured:false,sandbox:true,zeroPayment,limitSeconds:60,businessContext:false,customGreeting:true,transcriptEvents:true,missing,reason:`Missing server-side configuration: ${missing.join(", ")}.`};}
    if(capabilityCache)return capabilityCache;
    try{
      const agent=(await request(`/v1/voice_agents/${encodeURIComponent(agentId)}`,{headers:{"X-API-KEY":apiKey}},"LiveAvatar voice-agent inspection"))?.data;
      const contextId=agent?.agent_configuration?.context_id;
      const context=contextId?(await request(`/v1/contexts/${encodeURIComponent(contextId)}`,{headers:{"X-API-KEY":apiKey}},"LiveAvatar context inspection"))?.data:null;
      const variables=[...new Set(context?.required_dynamic_variables||[])];
      const acceptsBriefing=REQUIRED_CONTEXT_VARIABLES.every(name=>variables.includes(name));
      capabilityCache={configured:true,sandbox:true,zeroPayment:true,limitSeconds:60,businessContext:acceptsBriefing,customGreeting:true,transcriptEvents:true,contextVariables:variables,reason:acceptsBriefing?"The configured Wayne voice agent declares every required INFINITE-X context variable.":`The configured voice agent is missing required context variables: ${REQUIRED_CONTEXT_VARIABLES.filter(name=>!variables.includes(name)).join(", ")}.`};
    }catch(error){capabilityCache={configured:true,sandbox:true,zeroPayment:true,limitSeconds:60,businessContext:false,customGreeting:true,transcriptEvents:true,contextVariables:[],reason:`Provider capability inspection failed: ${error.message}`};}
    return capabilityCache;
  }

  async function credits(){
    if(!configured)throw providerError("LiveAvatar sandbox is not configured.",503);
    const result=await request("/v1/users/credits",{headers:{"X-API-KEY":apiKey}},"LiveAvatar credit balance");
    const balance=Number(result?.data?.credits_left);if(!Number.isFinite(balance))throw providerError("LiveAvatar returned an unreadable credit balance.",502);return balance;
  }

  async function start({dynamicVariables,sessionType="sandbox"}){
    const support=await capabilities();
    if(!configured)throw providerError(support.reason,503);
    const presentation=sessionType==="presentation",maxSessionDuration=presentation?120:60;
    const voiceAgent={id:agentId,language:"en",dynamic_variables:Object.fromEntries(REQUIRED_CONTEXT_VARIABLES.map(name=>[name,String(dynamicVariables?.[name]||"Not available").slice(0,1000)]))};
    const tokenBody=await request("/v1/sessions/token",{method:"POST",headers:{"Content-Type":"application/json","X-API-KEY":apiKey},body:JSON.stringify({mode:"FULL",is_sandbox:!presentation,avatar_id:WAYNE_SANDBOX_AVATAR_ID,max_session_duration:maxSessionDuration,video_settings:{quality:"high",encoding:"H264"},voice_agent:voiceAgent})},`LiveAvatar FULL ${presentation?"presentation":"sandbox"} token request`);
    const sessionToken=tokenBody?.data?.session_token;
    if(!sessionToken)throw providerError("LiveAvatar did not return a session token.",502);
    const startBody=await request("/v1/sessions/start",{method:"POST",headers:{Authorization:`Bearer ${sessionToken}`}},"LiveAvatar FULL sandbox start");
    const data=startBody?.data||{};
    if(!data.session_id||!data.livekit_url||!data.livekit_client_token)throw providerError("LiveAvatar returned incomplete sandbox room details.",502);
    return{sessionId:data.session_id,livekitUrl:data.livekit_url,livekitClientToken:data.livekit_client_token,maxSessionDuration,sessionType,providerExpiresAt:data.expires_at||data.session_expiry||null,businessContext:support.businessContext,capabilityReason:support.reason};
  }

  async function stop(sessionId){
    if(!configured)throw providerError("LiveAvatar sandbox is not configured.",503);
    await request("/v1/sessions/stop",{method:"POST",headers:{"Content-Type":"application/json","X-API-KEY":apiKey},body:JSON.stringify({session_id:sessionId,reason:"USER_CLOSED"})},"LiveAvatar sandbox stop");
    return{stopped:true};
  }

  async function transcript(sessionId){
    if(!configured)throw providerError("LiveAvatar is not configured.",503);
    return (await request(`/v1/sessions/${encodeURIComponent(sessionId)}/transcript`,{headers:{"X-API-KEY":apiKey}},"LiveAvatar transcript retrieval"))?.data||[];
  }

  async function deleteSessionEvents(sessionId){
    if(!configured)throw providerError("LiveAvatar is not configured.",503);
    await request(`/v1/sessions/${encodeURIComponent(sessionId)}/events`,{method:"DELETE",headers:{"X-API-KEY":apiKey}},"LiveAvatar session-event deletion");return{deleted:true};
  }

  return{configured,capabilities,credits,start,stop,transcript,deleteSessionEvents};
}
