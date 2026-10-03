import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {registerHooks} from "node:module";
registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier==="./workflow"?"./workflow.ts":specifier,context);}});
const {readAreas,saveArea,newAreaSchema}=await import("../app/lib/area-registry.ts");
import {routeScreening,referralFixtures} from "../app/lib/workflow.ts";
test("barangays persist, reject duplicates and route custom screenings",async()=>{const directory=await mkdtemp(join(tmpdir(),"vitality-areas-"));try{const input={barangay:"San Jose",city:"Test City",province:"Test Province",lat:14.5,lng:121};const area=await saveArea(input,directory);const areas=await readAreas(directory);assert.equal(areas.length,4);assert.deepEqual(areas.at(-1),area);await assert.rejects(saveArea(input,directory),/already saved/);const patient={...referralFixtures()[0],barangay:area.name,referral:null};assert.throws(()=>routeScreening(patient));assert.equal(routeScreening(patient,Date.now(),areas).referral.hospitalId,"demo-city-hospital");assert.equal(newAreaSchema.safeParse({...input,lat:100}).success,false);await Promise.all([saveArea({...input,barangay:"Second"},directory),saveArea({...input,barangay:"Third"},directory)]);assert.equal((await readAreas(directory)).length,6);}finally{await rm(directory,{recursive:true,force:true});}});

