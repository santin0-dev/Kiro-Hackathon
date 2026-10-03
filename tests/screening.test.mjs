import test from 'node:test';
import assert from 'node:assert/strict';
import {screeningSchema,referralFixtures,parseSavedCases,aiInput} from '../app/lib/workflow.ts';
const screening={chiefComplaint:'Request assessment of recorded readings',urgency:'Routine',arm:'Left',medications:'Unknown',allergies:'Unknown',glucose:null};
test('unmeasured glucose stays null and structured referral details survive persistence',()=>{
 const c={...referralFixtures()[0],screening:screeningSchema.parse(screening)};
 const saved=parseSavedCases([c])[0];
 assert.deepEqual(saved.screening,screening);
 assert.match(aiInput(saved).history,/Glucose: Not measured/);
});
test('glucose keeps units, context and time; invalid urgency and missing context rejected',()=>{
 const glucose={value:156,unit:'mg/dL',context:'Random',measuredAt:'2026-10-04T04:00:00Z'};
 const c={...referralFixtures()[0],screening:{...screening,glucose}};
 assert.deepEqual(parseSavedCases([c])[0].screening.glucose,glucose);
 assert.equal(parseSavedCases([{...c,screening:{...c.screening,urgency:'AI guessed'}}]),null);
 assert.equal(screeningSchema.safeParse({...screening,glucose:{value:156,unit:'mg/dL'}}).success,false);
});
