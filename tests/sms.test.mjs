import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentSms, sameAppointment, smsEstimate } from '../app/lib/sms.ts';
test('SMS uses approved action, destination and preparation, with Manila appointment time',()=>{
  const plan={action:'Attend assessment',destination:'Demo desk',due:'2026-10-05T01:00:00Z',bring:'Previous records. No fasting specified.',contact:'Assigned BHW'};
  const text=appointmentSms('DEMO-001',plan);
  assert.ok(text.includes(plan.bring));assert.ok(text.includes(plan.action));assert.match(text,/9:00 AM/);assert.match(text,/fictional appointment/);
});

test('Appointment comparison ignores property order but rejects each changed field',()=>{
  const plan={action:'Attend assessment',destination:'Demo desk',due:'2026-10-05T01:00:00Z',bring:'Previous records',contact:'Assigned BHW'};
  const reordered={contact:plan.contact,bring:plan.bring,due:plan.due,destination:plan.destination,action:plan.action};
  assert.equal(sameAppointment(plan,reordered),true);
  for(const key of Object.keys(plan))assert.equal(sameAppointment(plan,{...reordered,[key]:plan[key]+' changed'}),false);
});

test('Smart punctuation does not force Unicode or lose approved instructions',()=>{
 const plan={action:'Attend assessment',destination:'Hospital \u2014 outpatient desk',due:'2026-10-05T01:00:00Z',bring:'Previous records',contact:'BHW'};
 const text=appointmentSms('DEMO-001',plan);
 assert.ok(text.includes('Hospital - outpatient desk'));
 assert.equal(smsEstimate(text).encoding,'plain');
 assert.equal(smsEstimate('a'.repeat(511)).segments,4);
 assert.equal(smsEstimate('\u2014'.repeat(511)).segments,8);
 assert.equal(smsEstimate('^'.repeat(81)).segments,2);
});
