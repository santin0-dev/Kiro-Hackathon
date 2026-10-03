import {mkdir,readFile,writeFile,rename} from "node:fs/promises";
import {join} from "node:path";
import {DEMO_AREAS} from "./workflow";
import {z} from "zod";
export const newAreaSchema=z.object({barangay:z.string().trim().min(1).max(80),city:z.string().trim().min(1).max(80),province:z.string().trim().min(1).max(80),lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180)}).strict();
export type SavedArea={name:string;lat:number;lng:number;city?:string;province?:string};
const savedSchema=z.object({name:z.string().min(1).max(250),lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180),city:z.string().optional(),province:z.string().optional()});
export async function readAreas(directory=join(process.cwd(),".data")):Promise<SavedArea[]>{
 try{const custom=z.array(savedSchema).max(100).parse(JSON.parse(await readFile(join(directory,"barangays.json"),"utf8")));return [...DEMO_AREAS,...custom];}
 catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return [...DEMO_AREAS];throw e;}
}
let queue:Promise<unknown>=Promise.resolve();
export function saveArea(input:unknown,directory=join(process.cwd(),".data")):Promise<SavedArea>{
 const operation=queue.catch(()=>{}).then(async()=>{
 const v=newAreaSchema.parse(input);const name=`${v.barangay}, ${v.city}, ${v.province}`;
 const existing=await readAreas(directory);
 if(existing.some(a=>a.name.toLowerCase()===name.toLowerCase()))throw new Error("This barangay is already saved. Select its circle instead.");
 if(existing.length>=103)throw new Error("The demo supports up to 100 added barangays.");
 const area={name,lat:v.lat,lng:v.lng,city:v.city,province:v.province};
 await mkdir(directory,{recursive:true});const temporary=join(directory,`barangays-${crypto.randomUUID()}.tmp`);
 await writeFile(temporary,JSON.stringify([...existing.slice(DEMO_AREAS.length),area]),"utf8");await rename(temporary,join(directory,"barangays.json"));return area;
 });queue=operation;return operation;
}


