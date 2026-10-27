import { routeLabel } from "./app-routes.mjs";
import { canOpenPresentationRoute } from "./wayne-presentation.mjs";

export async function dispatchWayneCommand({command,heard,expectedSessionId,activeSessionId,permissions,role,navigate,presentCurrent,fullscreen,stopPresenting,onStatus=()=>{}}) {
  if (!command || expectedSessionId !== activeSessionId) return { ok:false, ignored:"stale-session" };
  if (command.type === "unknown-route") {
    onStatus({heard,failure:`Unknown section: ${command.label}`});
    return {ok:false,error:"unknown-route",label:command.label};
  }
  if (command.type === "open") {
    const label=routeLabel(command.route);
    if (!canOpenPresentationRoute(command.route,permissions,role)) {
      onStatus({heard,opening:label,failure:`Access denied: ${label}`});
      return {ok:false,error:"permission",route:command.route,label};
    }
    onStatus({heard,opening:label});
    const rendered=await navigate(command.route);
    if (!rendered?.ok) {
      onStatus({heard,opening:label,failure:rendered?.error||`${label} could not be opened`});
      return {ok:false,error:"navigation",route:command.route,label};
    }
    if(command.present)await presentCurrent();
    onStatus({heard,opening:label,success:`${label} opened${command.present?" in presentation mode":""}`});
    return {ok:true,route:command.route,label,heading:rendered.heading||"",presented:Boolean(command.present)};
  }
  if(command.type==="present-current"){await presentCurrent();onStatus({heard,success:"Current section presented"});return{ok:true,presented:true}}
  if(command.type==="fullscreen"){await fullscreen();onStatus({heard,success:"Fullscreen requested"});return{ok:true}}
  if(command.type==="stop-presenting"){await stopPresenting();onStatus({heard,success:"Presentation stopped"});return{ok:true}}
  return {ok:false,error:"unsupported-command"};
}
