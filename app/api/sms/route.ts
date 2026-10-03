import { SNSClient,PublishCommand } from "@aws-sdk/client-sns";
import { createHash } from "node:crypto";
import { z } from "zod";
import { database } from "@/app/lib/db";
import { localRequest,json,readJson } from "@/app/lib/local-api";
import { planSchema,type Case } from "@/app/lib/workflow";
import { appointmentSms } from "@/app/lib/sms";
export const runtime="nodejs";
const input=z.object({demo:z.literal(true),phone:z.string().regex(/^\+639\d{9}$/),consent:z.literal(true),code:z.string().regex(/^DEMO-[A-Z0-9-]{1,40}$/),plan:planSchema}).strict();
let client:SNSClient|undefined;
function config(){return {region:process.env.AWS_SNS_REGION||process.env.AWS_REGION,sender:process.env.AWS_SMS_SENDER_ID,enabled:process.env.LOCAL_DEMO_SMS_ENABLED==="true",allowed:(process.env.AWS_SMS_ALLOWED_NUMBERS||"").split(",").map(s=>s.trim()).filter(Boolean)};}
export async function GET(){const c=config();return json({configured:!!(c.enabled&&c.region&&c.sender&&c.allowed.length),deliveryVerified:false,provider:"Amazon SNS"});}
export async function POST(request:Request) {
  if(!localRequest(request,true))return json({error:"Same-origin local demo only."},403);
  const cfg=config();if(!cfg.enabled||!cfg.region||!cfg.sender||!cfg.allowed.length)return json({error:"Configure AWS_SNS_REGION (or AWS_REGION), AWS_SMS_SENDER_ID, AWS_SMS_ALLOWED_NUMBERS and LOCAL_DEMO_SMS_ENABLED. No SMS sent."},503);
  let key="",reserved=false;
  try {
    const parsed=input.safeParse(await readJson(request,12000));if(!parsed.success)return json({error:"Valid appointment, verified number and recipient consent required."},400);
    const p=parsed.data;if(!cfg.allowed.includes(p.phone))return json({error:"Number is not on the server demo allowlist."},403);
    const db=database();const row=await db.from("vitality_cases").select("payload").eq("id",p.code).single();
    if(row.error)throw new Error("DATABASE");
    const c=row.data.payload as Case;if(!c.plan||c.status!=="active"||JSON.stringify(c.plan)!==JSON.stringify(p.plan))return json({error:"Confirmed appointment changed or is unavailable. Refresh before sending."},409);
    const message=appointmentSms(c.id,c.plan);if(message.length>1200)return json({error:"Approved instructions exceed this demo's message limit."},400);
    key=createHash("sha256").update(p.phone+message).digest("hex");
    const old=await db.from("vitality_sms").select("state,message_id").eq("id",key).maybeSingle();if(old.error)throw new Error("DATABASE");
    if(old.data?.state==="accepted")return json({messageId:old.data.message_id,status:"accepted",duplicateSuppressed:true,deliveryConfirmed:false});
    if(old.data)return json({error:"Previous submission is pending or unknown. Check AWS before retrying; no duplicate was sent."},409);
    const recent=await db.from("vitality_sms").select("id",{count:"exact",head:true}).gte("created_at",new Date(Date.now()-300000).toISOString());
    if(recent.error)throw new Error("DATABASE");if((recent.count||0)>=10)return json({error:"Demo send limit reached. Wait five minutes."},429);
    const reserve=await db.from("vitality_sms").insert({id:key,case_id:c.id,state:"pending"});
    if(reserve.error)return json({error:"Another request already reserved this message, or SMS logging is unavailable. No new send attempted."},409);
    reserved=true;client??=new SNSClient({region:cfg.region,maxAttempts:1});
    const result=await client.send(new PublishCommand({PhoneNumber:p.phone,Message:message,MessageAttributes:{"AWS.SNS.SMS.SMSType":{DataType:"String",StringValue:"Transactional"},"AWS.SNS.SMS.SenderID":{DataType:"String",StringValue:cfg.sender}}}),{abortSignal:AbortSignal.timeout(15000)});
    if(!result.MessageId)throw new Error("AWS");
    const saved=await db.from("vitality_sms").update({state:"accepted",message_id:result.MessageId}).eq("id",key);
    if(saved.error)return json({error:"AWS accepted the SMS but database logging failed. Check AWS; do not resend."},502);
    return json({messageId:result.MessageId,status:"accepted",deliveryConfirmed:false});
  }catch(e){if(reserved){try{await database().from("vitality_sms").update({state:"unknown"}).eq("id",key);}catch{}}
    const missing=e instanceof Error&&e.message==="SUPABASE_SETUP";
    return json({error:missing ? "Configure Supabase and run supabase/setup.sql before SMS delivery." : reserved ? "AWS submission failed or timed out. Delivery may be unknown; check AWS before retrying." : "SMS request or database preparation failed. No AWS send attempted."},missing?503:502);
  }
}
