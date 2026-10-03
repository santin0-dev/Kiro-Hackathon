import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentSms } from '../app/lib/sms.ts';
test('SMS uses approved action, destination and preparation, with Manila appointment time',()=>{
  const plan={action:'Attend assessment',destination:'Demo desk',due:'2026-10-05T01:00:00Z',bring:'Previous records. No fasting specified.',contact:'Assigned BHW'};
  const text=appointmentSms('DEMO-001',plan);
  assert.ok(text.includes(plan.bring));assert.ok(text.includes(plan.action));assert.match(text,/9:00 AM/);assert.match(text,/fictional appointment/);
});
