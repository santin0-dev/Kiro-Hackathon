import test from 'node:test';
import assert from 'node:assert/strict';
import { sendPhilSms, checkPhilSms, PhilSmsRejected } from '../app/lib/philsms.ts';
const input={token:'fake-test-token',sender:'PhilSMS',phone:'+639171234567',message:'Fictional demo'};
test('PhilSMS authenticates and converts E.164 recipient to API format',async()=>{
  const result=await sendPhilSms(input,async(url,opts)=>{
    assert.equal(url,'https://dashboard.philsms.com/api/v3/sms/send');
    assert.equal(opts.headers.Authorization,'Bearer fake-test-token');
    assert.deepEqual(JSON.parse(opts.body),{recipient:'639171234567',sender_id:'PhilSMS',type:'plain',message:'Fictional demo'});
    return Response.json({status:'success',data:{uid:'demo-message'}});
  });
  assert.equal(result.messageId,'demo-message');
});
test('Explicit rejection is distinguished from acceptance without an ID',async()=>{
 await assert.rejects(()=>sendPhilSms(input,async()=>Response.json({status:'error',message:'Unauthenticated.'})),e=>e instanceof PhilSmsRejected && e.message.includes('API token'));
 assert.equal((await sendPhilSms(input,async()=>Response.json({status:'success',data:'sms reports with all details'}))).messageId,null);
});
test('Documented balance preflight detects HTTP 200 authentication errors',async()=>{
 await assert.rejects(()=>checkPhilSms(input.token,async(url,opts)=>{
  assert.equal(url,'https://dashboard.philsms.com/api/v3/balance');
  assert.equal(opts.method,undefined);
  return Response.json({status:'error',message:'Unauthenticated.'});
 }),PhilSmsRejected);
});
test('Transport failure remains uncertain, not a definite provider rejection',async()=>{
 await assert.rejects(()=>sendPhilSms(input,async()=>{throw new TypeError('fetch failed');}),e=>!(e instanceof PhilSmsRejected));
});
test('Invalid recipients never invoke provider',async()=>{
  let called=false;
  await assert.rejects(()=>sendPhilSms({...input,phone:'0917'},async()=>{called=true;return Response.json({});}));
  assert.equal(called,false);
});
