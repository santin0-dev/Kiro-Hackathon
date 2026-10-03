import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSavedCases,referralFixtures,DEMO_AREAS,hospitalCases} from '../app/lib/workflow.ts';
test('age capture accepts children and infants without accepting invalid ages',()=>{
 const c=referralFixtures()[0];
 for(const age of [0,12,17,18,120])assert.equal(parseSavedCases([{...c,age}])[0].age,age);
 for(const age of [-1,121,NaN])assert.equal(parseSavedCases([{...c,age}]),null);
});
test('all demo areas have patients and route to the configured hospital',()=>{
 const cases=referralFixtures();assert.equal(cases.length,15);
 for(const area of DEMO_AREAS)assert.ok(cases.some(c=>c.barangay===area.name));
 assert.equal(new Set(cases.map(c=>c.id)).size,15);
 assert.equal(hospitalCases(cases).length,15);
});
