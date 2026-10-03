import type { Plan } from "./workflow";
export function appointmentSms(code:string,plan:Plan):string {
  const when = new Date(plan.due).toLocaleString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
  return `VITALITY DEMO - fictional appointment. Code: ${code}. Action: ${plan.action}. Where: ${plan.destination}. When: ${when} (Philippine time). Bring: ${plan.bring}. Contact: ${plan.contact}`;
}
