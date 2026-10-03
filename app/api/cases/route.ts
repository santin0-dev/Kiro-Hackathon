import { database, BUCKET } from "@/app/lib/db";
import { json,localRequest,readJson } from "@/app/lib/local-api";
import { parseSavedCases,referralFixtures,routeScreening,type Case } from "@/app/lib/workflow";
import { z } from "zod";
export const runtime="nodejs";
function fail(e:unknown) {const msg=e instanceof Error ? e.message : "";return json({error:msg==="SUPABASE_SETUP" ? "Add SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) to .env.local; run supabase/setup.sql and restart Next.js." : msg==="TOO_LARGE" ? "Upload too large." : "Database operation failed. Check Supabase setup and connection. No success was reported."},msg==="TOO_LARGE"?413:503);}
export async function GET(request:Request) {
  if(!localRequest(request))return json({error:"Local fictional demo only."},403);
  try {
    const db=database();let result=await db.from("vitality_cases").select("payload,version").order("id").limit(500);
    if(result.error)throw new Error("DATABASE");
    if(!result.data.length) {
      const seed=await db.from("vitality_cases").upsert(referralFixtures().map(c=>({id:c.id,payload:c,status:c.status})),{onConflict:"id",ignoreDuplicates:true});
      if(seed.error)throw new Error("DATABASE");result=await db.from("vitality_cases").select("payload,version").order("id").limit(500);
    }
    if(result.error || !result.data || !parseSavedCases(result.data.map(r=>r.payload)))throw new Error("DATABASE");
    // Upgrade older, explicitly unsent demo screenings using optimistic versions.
    // Do not reassign records that already have a referral or clinical plan.
    for(const row of result.data){
      const patient=parseSavedCases([row.payload])?.[0];
      if(patient?.referral===null && patient.barangay==="Demo Mabini" && patient.status==="awaiting_review" && !patient.plan){
        const routed=routeScreening(patient);
        const saved=await db.rpc("vitality_save_case",{p_id:patient.id,p_payload:routed,p_expected:row.version});
        if(saved.error)throw new Error("DATABASE");
        if(saved.data?.length){row.payload=saved.data[0].payload;row.version=saved.data[0].version;}
      }
    }
    return json({rows:result.data});
  }catch(e){return fail(e);}
}
export async function POST(request:Request) {
  if(!localRequest(request,true))return json({error:"Same-origin local fictional demo only."},403);
  const uploaded:string[]=[];
  try {
    const body=z.object({patient:z.unknown(),expectedVersion:z.number().int().positive().nullable()}).strict().parse(await readJson(request));
    let c=parseSavedCases([body.patient])?.[0];if(!c || !/^DEMO-[A-Z0-9-]{1,40}$/.test(c.id))return json({error:"Invalid case."},400);
    const db=database();const previous=await db.from("vitality_cases").select("payload,version").eq("id",c.id).maybeSingle();
    if(previous.error)throw new Error("DATABASE");
    if(body.expectedVersion!==null && previous.data?.version!==body.expectedVersion)return json({error:"Another user changed this case. Refresh and try again."},409);
    const old=previous.data?.payload as Case|undefined;
    if(!old){
      try{c=routeScreening({...c,referral:null});}catch{return json({error:"No receiving hospital configured for this barangay. Screening was not saved."},400);}
    }
    const docs:NonNullable<Case["documents"]>=[];
    for(const d of c.documents||[]) {
      if(d.storagePath) {const match=old?.documents?.find(item=>item.id===d.id&&item.storagePath===d.storagePath);if(!match)throw new Error("INVALID_DOCUMENT");docs.push(match);continue;}
      const prefix=`data:${d.mime};base64,`;if(!d.dataUrl?.startsWith(prefix))throw new Error("INVALID_INPUT");
      const bytes=Buffer.from(d.dataUrl.slice(prefix.length),"base64");if(!bytes.length || bytes.length>500000)throw new Error("TOO_LARGE");
      const path=`${c.id}/${crypto.randomUUID()}`;
      const upload=await db.storage.from(BUCKET).upload(path,bytes,{contentType:d.mime,upsert:false});
      if(upload.error)throw new Error("STORAGE");uploaded.push(path);docs.push({id:d.id,name:d.name,mime:d.mime,addedAt:d.addedAt,storagePath:path});
    }
    const patient={...c,documents:docs};
    const save=await db.rpc("vitality_save_case",{p_id:c.id,p_payload:patient,p_expected:body.expectedVersion});
    if(save.error || !save.data?.length) {
      if(uploaded.length)await db.storage.from(BUCKET).remove(uploaded);
      return json({error:save.error?.code==="23505" ? "Appointment slot or case ID already taken. Refresh and try again." : "Case changed or could not be saved. Refresh and try again."},409);
    }
    return json({row:{payload:save.data[0].payload,version:save.data[0].version}});
  }catch(e){if(uploaded.length){try{await database().storage.from(BUCKET).remove(uploaded);}catch{ /* orphan cleanup can be retried manually */ }}return fail(e);}
}
