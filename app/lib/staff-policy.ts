import type {Case} from "./workflow";
export type StaffRole="BHW"|"Doctor";
export function approvedRole(profile:unknown):StaffRole|null{if(!profile||typeof profile!=="object")return null;const p=profile as {approved?:boolean;role?:string};return p.approved===true&&(p.role==="BHW"||p.role==="Doctor")?p.role:null;}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function assertCaseWrite(role:StaffRole,previous:Case|undefined,next:Case){
 if(!previous){if(next.events.some(e=>e.actor!=="BHW"))throw new Error("Invalid audit event.");if(role!=="BHW"||next.status!=="awaiting_review"||next.plan||next.outcome||next.steps.length||next.draft)throw new Error("Only BHWs can submit a new screening.");return;}
 const excluded=role==="BHW"?["phone","documents","steps","events"]:["status","plan","outcome","steps","draft","events"];
 for(const key of new Set([...Object.keys(previous),...Object.keys(next)])){if(!excluded.includes(key)&&!equal(previous[key as keyof Case],next[key as keyof Case]))throw new Error(role==="BHW"?"BHWs cannot change hospital decisions.":"Hospital users cannot change the BHW screening or patient identity.");}
 if(role==="BHW"){if(previous.steps.length!==next.steps.length)throw new Error("BHWs cannot create hospital tasks.");for(let i=0;i<next.steps.length;i++){const old=previous.steps[i],step=next.steps[i];if(equal(old,step))continue;if(!["attendance","follow_up"].includes(old.kind)||step.state!=="confirmed"||step.confirmedBy!=="BHW"||!equal({...old,state:"confirmed",confirmedBy:"BHW"},step))throw new Error("This task requires hospital review.");}}
 if(!equal(previous.events,next.events.slice(0,previous.events.length))||next.events.slice(previous.events.length).some(e=>e.actor!==role))throw new Error("Invalid audit event.");
}
