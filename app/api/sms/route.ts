import { sendPhilSms, checkPhilSms, PhilSmsRejected, philSmsReport } from "@/app/lib/philsms";
import { createHash } from "node:crypto";
import { z } from "zod";
import { database } from "@/app/lib/db";
import { localRequest,json,readJson } from "@/app/lib/local-api";
import { planSchema,sourceOf,isReferred,parseSavedCases,type Case } from "@/app/lib/workflow";
import { patientSms, sameAppointment, smsEstimate } from "@/app/lib/sms";
export const runtime="nodejs";
const input=z.object({demo:z.literal(true),phone:z.string().regex(/^\+639\d{9}$/),source:z.string().max(12000),code:z.string().regex(/^DEMO-[A-Z0-9-]{1,40}$/),plan:planSchema,retryAfterReportCheck:z.boolean().optional()}).strict();
function config(){return {token:process.env.PHILSMS_API_TOKEN,sender:process.env.PHILSMS_SENDER_ID||"PhilSMS",enabled:process.env.LOCAL_DEMO_SMS_ENABLED==="true",allowed:(process.env.SMS_ALLOWED_NUMBERS||process.env.AWS_SMS_ALLOWED_NUMBERS||"").split(",").map(s=>s.trim()).filter(Boolean)};}
export async function GET(request:Request){
  if(!localRequest(request))return json({error:"Local demo only."},403);
  const cfg=config(),code=new URL(request.url).searchParams.get("case");
  if(!code)return json({configured:!!(cfg.enabled&&cfg.token&&cfg.allowed.length),deliveryVerified:false,provider:"PhilSMS"});
  if(!/^DEMO-[A-Z0-9-]{1,40}$/.test(code))return json({error:"Invalid case."},400);
  try{
    const db=database();
    const patient=await db.from("vitality_cases").select("payload").eq("id",code).single();
    if(patient.error)throw new Error("DATABASE");
    const c=patient.data.payload as Case;
    if(!c.phone||!c.plan)return json({submission:"none",patientReceiptConfirmed:false});
    const key=createHash("sha256").update(c.phone+patientSms(c)).digest("hex");
    const row=await db.from("vitality_sms").select("state,message_id").eq("id",key).maybeSingle();
    if(row.error)throw new Error("DATABASE");
    if(!row.data)return json({submission:"none",patientReceiptConfirmed:false});
    if(!row.data.message_id)return json({submission:row.data.state,patientReceiptConfirmed:false,warning:"No provider message ID saved. Check PhilSMS reports manually."});
    if(!cfg.token)return json({submission:row.data.state,patientReceiptConfirmed:false});
    try {
      const report=await philSmsReport(cfg.token,row.data.message_id);
      return json({submission:row.data.state,providerStatus:report.status,providerType:report.type,segments:report.segments,patientReceiptConfirmed:false});
    }catch{return json({submission:row.data.state,patientReceiptConfirmed:false,warning:"Provider delivery report unavailable. Submission status is saved; no new SMS was sent."});}
  }catch{return json({error:"Delivery report unavailable. No message was sent. Check PhilSMS reports."},502);}
}
export async function POST(request:Request) {
  if(!localRequest(request,true))return json({error:"Same-origin local demo only."},403);
  const cfg=config();if(!cfg.enabled||!cfg.token||!cfg.sender||!cfg.allowed.length)return json({error:"Configure PHILSMS_API_TOKEN, SMS_ALLOWED_NUMBERS and LOCAL_DEMO_SMS_ENABLED. No SMS sent."},503);
  let key="",reserved=false;
  try {
    const parsed=input.safeParse(await readJson(request,12000));if(!parsed.success)return json({error:"Saved instructions and patient phone number required."},400);
    const p=parsed.data;if(!cfg.allowed.includes(p.phone))return json({error:"Number is not on the server demo allowlist."},403);
    const db=database();const row=await db.from("vitality_cases").select("payload").eq("id",p.code).single();
    if(row.error)throw new Error("DATABASE");
    const c=parseSavedCases([row.data.payload])?.[0];if(!c)throw new Error("DATABASE");if(!isReferred(c)||!c.plan||!["active","completed"].includes(c.status)||c.phone!==p.phone||sourceOf(c)!==p.source||!sameAppointment(c.plan,p.plan))return json({error:"Confirmed appointment changed or is unavailable. Refresh before sending."},409);
    const message=patientSms(c);if(smsEstimate(message).segments>4)return json({error:"This text exceeds the four-segment demo cost limit. Shorten the approved instructions before sending; nothing was sent."},400);
    key=createHash("sha256").update(p.phone+message).digest("hex");
    const old=await db.from("vitality_sms").select("state,message_id").eq("id",key).maybeSingle();if(old.error)throw new Error("DATABASE");
    if(old.data?.state==="accepted")return json({messageId:old.data.message_id||key,status:"accepted",duplicateSuppressed:true,deliveryConfirmed:false});
    if(old.data && !(old.data.state==="unknown" && p.retryAfterReportCheck))return json({error:"Previous submission is pending or unknown. Check PhilSMS reports before retrying; no duplicate was sent.",canRecover:old.data.state==="unknown"},409);
    // Read-only token check before reserving or retrying any paid SMS.
    await checkPhilSms(cfg.token!);
    const recent=await db.from("vitality_sms").select("id",{count:"exact",head:true}).gte("created_at",new Date(Date.now()-300000).toISOString());
    if(recent.error)throw new Error("DATABASE");if((recent.count||0)>=10)return json({error:"Demo send limit reached. Wait five minutes."},429);
    const reserve=old.data?.state==="unknown" && p.retryAfterReportCheck
      ? await db.from("vitality_sms").update({state:"pending",created_at:new Date().toISOString()}).eq("id",key).eq("state","unknown").select("id")
      : await db.from("vitality_sms").insert({id:key,case_id:c.id,state:"pending"}).select("id");
    if(reserve.error || !reserve.data?.length)return json({error:"Another request already reserved this message, or SMS logging is unavailable. No new send attempted."},409);
    reserved=true;
    const result=await sendPhilSms({token:cfg.token!,sender:cfg.sender,phone:p.phone,message,encoding:smsEstimate(message).encoding});
    const saved=await db.from("vitality_sms").update({state:"accepted",message_id:result.messageId}).eq("id",key);
    if(saved.error)return json({error:"PhilSMS accepted the SMS but database logging failed. Check PhilSMS; do not resend."},502);
    return json({messageId:result.messageId||key,messageIdKind:result.messageId?"provider":"local",status:"accepted",deliveryConfirmed:false});
  }catch(e){if(reserved){try{await database().from("vitality_sms").update({state:"unknown"}).eq("id",key);}catch{}}
    if(e instanceof PhilSmsRejected)return json({error:e.message,canRecover:reserved,providerRejected:true},502);
    const missing=e instanceof Error&&e.message==="SUPABASE_SETUP";
    return json({error:missing ? "Configure Supabase and run supabase/setup.sql before SMS delivery." : reserved ? "PhilSMS submission failed or timed out. Delivery may be unknown; check PhilSMS before retrying." : "SMS request or database preparation failed. No PhilSMS send attempted."},missing?503:502);
  }
}
