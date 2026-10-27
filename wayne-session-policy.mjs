export const SESSION_TYPES={
  sandbox:{label:"Sandbox",isSandbox:true,maxDuration:60,expectedCredits:0},
  presentation:{label:"Presentation",isSandbox:false,maxDuration:120,expectedCredits:4}
};

export function sessionPolicy(type="sandbox"){
  const policy=SESSION_TYPES[type];if(!policy)throw Object.assign(new Error("Unknown Wayne session type."),{status:400});return{type,...policy};
}

export function validateSessionCredit({type="sandbox",balance,confirmed=false}={}){
  const policy=sessionPolicy(type),credits=Number(balance);if(!Number.isFinite(credits)||credits<0)throw Object.assign(new Error("LiveAvatar credit balance is unavailable."),{status:503});
  if(!confirmed)throw Object.assign(new Error("Confirm the displayed balance and expected credit usage before connecting."),{status:409});
  if(policy.expectedCredits>credits)throw Object.assign(new Error(`Presentation requires ${policy.expectedCredits} credits; the verified balance is ${credits}.`),{status:409});
  return{...policy,balance:credits,warning:type==="sandbox"&&credits<4?"This practice session does not reserve credits. The current balance is below the 4 credits expected for a full presentation session.":"Credits are not reserved at provider level; the balance can change before connection."};
}
