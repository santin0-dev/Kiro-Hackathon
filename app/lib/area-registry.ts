import "server-only";
import {database} from "./db";
import {z} from "zod";
export const newAreaSchema=z.object({barangay:z.string().trim().min(1).max(80),city:z.string().trim().min(1).max(80),province:z.string().trim().min(1).max(80),lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180)}).strict();
export type SavedArea={name:string;lat:number;lng:number;city?:string;province?:string};
const savedSchema=z.object({name:z.string().min(1).max(250),lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180),city:z.string(),province:z.string()});
export async function readAreas():Promise<SavedArea[]>{const result=await database().from("vitality_areas").select("name,lat,lng,city,province").order("name").limit(500);if(result.error)throw new Error("Barangay database unavailable. Run supabase/shared-data.sql.");return z.array(savedSchema).parse(result.data);}
export async function saveArea(input:unknown):Promise<SavedArea>{const v=newAreaSchema.parse(input);const result=await database().from("vitality_areas").insert({name:`${v.barangay}, ${v.city}, ${v.province}`,lat:v.lat,lng:v.lng,city:v.city,province:v.province,hospital_id:"demo-city-hospital"}).select("name,lat,lng,city,province").single();if(result.error){if(result.error.code==="23505")throw new Error("This barangay is already saved. Select its circle instead.");throw new Error("Barangay database unavailable. Run supabase/shared-data.sql.");}return savedSchema.parse(result.data);}
