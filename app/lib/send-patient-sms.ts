import {sourceOf,type Case} from "./workflow";
export async function sendPatientSms(patient:Case){
 const response=await fetch("/api/sms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({demo:true,phone:patient.phone,code:patient.id,plan:patient.plan,source:sourceOf(patient)}),signal:AbortSignal.timeout(40000)});
 const body=await response.json();if(!response.ok)throw new Error(body.error||"SMS submission could not be confirmed. Check message status before retrying.");
 return body as {messageId:string;duplicateSuppressed?:boolean};
}
