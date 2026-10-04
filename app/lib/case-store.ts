"use client";
import { parseSavedCases,type Case } from "./workflow";
let snapshot:Case[]=[];
const serverSnapshot:Case[]=[];
const subscribers=new Set<()=>void>();
let versions=new Map<string,number>();
let inFlight:Promise<void>|null=null;
let writing=false;let generation=0;
export function clearCases(){generation++;snapshot=[];versions=new Map();emit();}
export function loadCases(){return snapshot;}
export function getServerSnapshot(){return serverSnapshot;}
export function subscribe(fn:()=>void){subscribers.add(fn);return()=>{subscribers.delete(fn);};}
function emit(){subscribers.forEach(fn=>fn());}
export async function refreshCases() {
  if(writing)return;
  if(inFlight)return inFlight;
  const started=generation;
  inFlight=(async()=>{
    const response=await fetch("/api/cases",{cache:"no-store",signal:AbortSignal.timeout(20000)}),body=await response.json();
    if(started!==generation)return;
    if(!response.ok)throw new Error(body.error||"Database unavailable.");
    const next=Array.isArray(body.rows)&&body.rows.length===0?[]:parseSavedCases(body.rows?.map((r:{payload:Case})=>r.payload));if(!next)throw new Error("Invalid database response.");
    versions=new Map(body.rows.map((r:{payload:Case;version:number})=>[r.payload.id,r.version]));snapshot=next;emit();
  })();
  try {await inFlight;}finally{inFlight=null;}
}
export async function commit(next:Case[]) {
  if(writing)throw new Error("A save is already running. Wait for it to finish.");
  const changes=next.filter(c=>JSON.stringify(c)!==JSON.stringify(snapshot.find(old=>old.id===c.id)));
  if(changes.length!==1)throw new Error("Save one case at a time.");
  const expectedVersion=versions.get(changes[0].id)??null;
  writing=true;
  const started=generation;let conflict=false;
  try {
    if(inFlight)await inFlight;
    if(started!==generation)throw new Error("Your session changed. Sign in and retry.");
    if((versions.get(changes[0].id)??null)!==expectedVersion){conflict=true;throw new Error("This record changed while refreshing. Review the latest details and retry.");}
    const c=changes[0];const response=await fetch("/api/cases",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({patient:c,expectedVersion}),signal:AbortSignal.timeout(30000)}),body=await response.json();
    if(!response.ok){conflict=response.status===409;throw new Error(body.error||"Save failed.");}
    if(started!==generation)throw new Error("Your session changed after saving. Sign in to check the record.");
    const saved=parseSavedCases([body.row?.payload])?.[0];if(!saved)throw new Error("Invalid save response.");
    versions.set(saved.id,body.row.version);snapshot=snapshot.some(item=>item.id===saved.id)?snapshot.map(item=>item.id===saved.id?saved:item):[saved,...snapshot];emit();
  }catch(e){if(e instanceof Error&&["AbortError","TimeoutError","TypeError"].includes(e.name))throw new Error("Save could not be confirmed. Refresh and check the patient record before submitting again.");throw e;}finally{writing=false;if(conflict&&started===generation){try{await refreshCases();}catch{/* The original conflict remains visible; no overwrite was attempted. */}}}
}
