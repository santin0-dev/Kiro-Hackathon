import {staffAccess} from "@/app/lib/staff-auth";
import {json,localRequest,readJson} from "@/app/lib/local-api";
import {readAreas,saveArea} from "@/app/lib/area-registry";
import {ZodError} from "zod";
export const runtime="nodejs";
export async function GET(request:Request){
  const access=await staffAccess(["BHW","Doctor"]);if(access.denied)return access.denied;
if(!localRequest(request))return json({error:"Access denied. Use the deployed app URL and demo login."},403);try{return json({areas:await readAreas()});}catch{return json({error:"Saved barangays could not be loaded."},503);}}
export async function POST(request:Request){
  const access=await staffAccess(["BHW"]);if(access.denied)return access.denied;
if(!localRequest(request,true))return json({error:"Access denied. Refresh the deployed app and sign in again."},403);try{return json({area:await saveArea(await readJson(request,4000))},201);}catch(e){return json({error:e instanceof ZodError?"Enter a barangay, city, province and valid map location.":e instanceof Error&&e.message.startsWith("This barangay")?e.message:"Barangay could not be saved. Try again."},400);}}
