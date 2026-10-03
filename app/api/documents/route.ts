import { database,BUCKET } from "@/app/lib/db";
import { json,localRequest } from "@/app/lib/local-api";
import type { Case } from "@/app/lib/workflow";
export const runtime="nodejs";
export async function GET(request:Request) {
  if(!localRequest(request))return json({error:"Local fictional demo only."},403);
  const query=new URL(request.url).searchParams;
  try {
    const db=database(),row=await db.from("vitality_cases").select("payload").eq("id",query.get("case")||"").single();
    const doc=(row.data?.payload as Case|undefined)?.documents?.find(d=>d.id===query.get("document"));
    if(!doc?.storagePath)return json({error:"Document unavailable."},404);
    const file=await db.storage.from(BUCKET).download(doc.storagePath);if(file.error || !file.data)throw new Error("STORAGE");
    return new Response(await file.data.arrayBuffer(),{headers:{"Content-Type":doc.mime,"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }catch{return json({error:"Document download failed. Check Supabase configuration."},503);}
}
