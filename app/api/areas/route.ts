import {json,localRequest,readJson} from "@/app/lib/local-api";
import {readAreas,saveArea} from "@/app/lib/area-registry";
import {ZodError} from "zod";
export const runtime="nodejs";
export async function GET(request:Request){if(!localRequest(request))return json({error:"Local demo only."},403);try{return json({areas:await readAreas()});}catch{return json({error:"Saved barangays could not be loaded."},503);}}
export async function POST(request:Request){if(!localRequest(request,true))return json({error:"Same-origin local demo only."},403);try{return json({area:await saveArea(await readJson(request,4000))},201);}catch(e){return json({error:e instanceof ZodError?"Enter a barangay, city, province and valid map location.":e instanceof Error&&e.message.startsWith("This barangay")?e.message:"Barangay could not be saved. Try again."},400);}}
