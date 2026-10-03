import type { Case, Plan } from "./workflow";
export function appointmentSms(code:string,plan:Plan):string {
  const when = new Date(plan.due).toLocaleString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
  return normalizeSmsText(`VITALITY DEMO - fictional appointment. Code: ${code}. Action: ${plan.action}. Where: ${plan.destination}. When: ${when} (Philippine time). Bring: ${plan.bring}. Contact: ${plan.contact}`);
}

// Compare appointment content independently of JSON property order.
export function sameAppointment(a:Plan,b:Plan):boolean {
  return a.action===b.action && a.destination===b.destination && a.due===b.due && a.bring===b.bring && a.contact===b.contact;
}

export function normalizeSmsText(text:string):string {
  return text.replace(/[\u2013\u2014]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\u00a0/g,' ');
}
export function smsEstimate(text:string):{encoding:'plain'|'unicode';segments:number} {
  // Conservative GSM estimate for our English templates; extension characters use two units.
  const plain=/^[\x20-\x5f\x61-\x7e\n\r]*$/.test(text);
  const units=plain?text.length+(text.match(/[\^{}\[\]~|\\]/g)||[]).length:text.length;
  const single=plain?160:70,joined=plain?153:67;
  return {encoding:plain?'plain':'unicode',segments:units<=single?1:Math.ceil(units/joined)};
}

// Patient instructions are built from the saved doctor's plan, never AI guesses.
export function patientSms(c:Case):string {
  if(!c.plan)throw new Error("Save hospital instructions before texting.");
  if(!c.outcome)return appointmentSms(c.id,c.plan);
  const when=new Date(c.outcome.followUpDue).toLocaleString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
  return normalizeSmsText(`VITALITY DEMO - fictional instructions. Code: ${c.id}. Next: ${c.outcome.followUp}. When: ${when} (Philippine time). Contact: ${c.plan.contact}`);
}
