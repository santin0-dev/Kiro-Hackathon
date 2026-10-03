import test from 'node:test';
import assert from 'node:assert/strict';
import {referralFixtures,isReferred,hospitalCases,referCase,parseSavedCases,demoSlots,confirmAppointment,savePlan,updateStep,recordOutcome,sourceOf,routeScreening} from '../app/lib/workflow.ts';
import {patientSms,smsEstimate} from '../app/lib/sms.ts';
const now=Date.parse('2026-10-04T04:00:00Z');
test('screened patients stay out of hospital inbox until explicitly referred',()=>{
 const cases=referralFixtures().map(c=>({...c,referral:null}));assert.equal(hospitalCases(cases).length,0);
 assert.throws(()=>referCase(cases[0],'Doctor'));
 const sent=referCase(cases[0],'BHW',now);
 assert.equal(hospitalCases([sent,...cases.slice(1)]).length,1);
 assert.equal(sent.referral.hospitalId,'demo-city-hospital');
 assert.throws(()=>referCase(sent,'BHW'));
});
test('unsent screening cannot be booked and old automatic referrals stay compatible',()=>{
 const c={...referralFixtures()[0],referral:null},slots=demoSlots(now);
 assert.throws(()=>confirmAppointment(c,[c],slots[0],slots,'Doctor',now));
 const legacy={...c};delete legacy.referral;
 assert.equal(isReferred(legacy),true);
 assert.equal(hospitalCases([legacy]).length,1);
});
test('phone and referral persist, malformed phone and unknown hospital rejected',()=>{
 const c={...referralFixtures()[0],phone:'+639171234567'};
 assert.equal(parseSavedCases([c])[0].phone,c.phone);
 assert.deepEqual(parseSavedCases([c])[0].referral,c.referral);
 assert.equal(parseSavedCases([{...c,phone:'0917'}]),null);
 assert.equal(parseSavedCases([{...c,referral:{...c.referral,hospitalId:'elsewhere'}}]),null);
});
test('text uses exact saved doctor instructions, and result text replaces old appointment instructions',()=>{
 const sent=referralFixtures()[0],slots=demoSlots(now);
 let c=confirmAppointment(sent,[sent],slots[0],slots,'Doctor',now);
 c=savePlan(c,{...c.plan,action:'Visit outpatient desk',bring:'Bring previous records',contact:'Call your BHW'},'Doctor');
 assert.match(patientSms(c),/Visit outpatient desk/);assert.match(patientSms(c),/Bring previous records/);
 c=updateStep(c,c.id+'-assessment','Doctor');
 c=recordOutcome(c,{kind:'more_assessment_needed',diagnosis:'',explanation:'More checks are needed.',followUp:'Go to the RHU, bring the referral form for further assessment.',followUpDue:slots[1]},'Doctor');
 const text=patientSms(c);assert.match(text,/Go to the RHU/);assert.doesNotMatch(text,/Where: Demo City Hospital/);assert.doesNotMatch(text,/Visit outpatient desk/);assert.ok(smsEstimate(text).segments<=4);
});

test('saved JSON property order cannot invalidate a current SMS request',()=>{
 const sent=referralFixtures()[0],slots=demoSlots(now);
 const c=confirmAppointment(sent,[sent],slots[0],slots,'Doctor',now);
 function reorder(x){if(Array.isArray(x))return x.map(reorder);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).reverse().map(([k,v])=>[k,reorder(v)]));return x;}
 assert.equal(sourceOf(parseSavedCases([reorder(c)])[0]),sourceOf(parseSavedCases([c])[0]));
});

test('new screenings route to the configured hospital once; unknown areas do not guess',()=>{
 const c={...referralFixtures()[0],referral:null};
 const routed=routeScreening(c,now);
 assert.equal(hospitalCases([routed]).length,1);
 assert.equal(routed.referral.hospitalId,'demo-city-hospital');
 assert.equal(routeScreening(routed,now+1000),routed);
 assert.throws(()=>routeScreening({...c,barangay:'Unknown barangay'}));
});
