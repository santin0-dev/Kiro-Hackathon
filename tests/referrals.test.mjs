import test from 'node:test';
import assert from 'node:assert/strict';
import { referralFixtures, demoSlots, availableSlots, confirmAppointment } from '../app/lib/workflow.ts';
import { parseSavedCases } from '../app/lib/workflow.ts';
const now=Date.parse('2026-10-04T04:00:00Z');
test('five patients in one barangay are routed without inventing appointments',()=>{
  const cases=referralFixtures(); assert.equal(cases.length,5); assert.equal(new Set(cases.map(c=>c.barangay)).size,1); assert.ok(cases.every(c=>c.status==='awaiting_review'&&!c.plan));
});
test('slot confirmation needs hospital acceptance and rejects occupied slots',()=>{
  const cases=referralFixtures(), slots=demoSlots(now);
  assert.throws(()=>confirmAppointment(cases[0],cases,slots[0],slots,'BHW',now));
  const accepted=confirmAppointment(cases[0],cases,slots[0],slots,'Doctor',now);
  const current=[accepted,...cases.slice(1)]; assert.equal(accepted.steps.length,3); assert.equal(availableSlots(current,slots,now).length,4);
  assert.throws(()=>confirmAppointment(cases[1],current,slots[0],slots,'Doctor',now));
  assert.throws(()=>confirmAppointment(accepted,current,slots[1],slots,'Doctor',now));
});
test('documents persist with original content; unsafe file URLs rejected',()=>{
  const cases=referralFixtures(); cases[0].documents=[{id:'doc',name:'demo.pdf',mime:'application/pdf',dataUrl:'data:application/pdf;base64,JVBERg==',addedAt:new Date(now).toISOString()}];
  assert.equal(parseSavedCases(cases)[0].documents[0].name,'demo.pdf');
  cases[0].documents[0].dataUrl='javascript:alert(1)'; assert.equal(parseSavedCases(cases),null);
});
