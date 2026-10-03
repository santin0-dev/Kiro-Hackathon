"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {patientSms,smsEstimate} from "../lib/sms";
import {sourceOf,type Case} from "../lib/workflow";
export default function SmsPanel({patient,onAccepted}:{patient:Case;onAccepted:(id:string)=>void}){
  const [busy,setBusy]=useState(false);
  const [checking,setChecking]=useState(true);
  const [submission,setSubmission]=useState("loading");
  const [status,setStatus]=useState("");
  const lock=useRef(false);
  const message=patientSms(patient),estimate=smsEstimate(message);
  const check=useCallback(async(signal?:AbortSignal)=>{
    try{
      const r=await fetch(`/api/sms?case=${encodeURIComponent(patient.id)}`,{cache:"no-store",signal:signal||AbortSignal.timeout(15000)}),b=await r.json();
      if(!r.ok)throw new Error(b.error||"Could not check message status.");
      setSubmission(b.submission||"none");
      if(b.providerStatus)setStatus(`Provider status: ${b.providerStatus}.${b.providerType==="voice"?" Unexpected voice report â€” ask the administrator to check.":""}`);
      else setStatus(b.submission==="accepted"?"Submitted to the SMS provider. Delivery not confirmed.":b.submission==="pending"||b.submission==="unknown"?"Message status is uncertain. Ask the administrator to check before resending.":"");
    }catch(e){if(!signal?.aborted){setSubmission("check_failed");setStatus(e instanceof Error?e.message:"Could not check message status.");}}
    finally{if(!signal?.aborted)setChecking(false);}
  },[patient.id]);
  useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>{if(!controller.signal.aborted)return check(controller.signal);});return()=>controller.abort();},[check]);
  async function send(){
    if(lock.current||!patient.phone||submission!=="none")return;lock.current=true;setBusy(true);setStatus("");
    try{
      const r=await fetch("/api/sms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({demo:true,phone:patient.phone,code:patient.id,plan:patient.plan,source:sourceOf(patient)}),signal:AbortSignal.timeout(40000)}),b=await r.json();
      if(!r.ok)throw new Error(b.error||"Message could not be submitted.");
      setSubmission("accepted");setStatus(b.duplicateSuppressed?"This message was already submitted. No duplicate was sent.":"Submitted to the SMS provider. Delivery not confirmed.");onAccepted(b.messageId);
    }catch(e){setSubmission("check_failed");setStatus(e instanceof Error?e.message:"Submission status unknown. Check before retrying.");}
    finally{lock.current=false;setBusy(false);}
  }
  return <section className="panel patient-message"><div className="panel-heading"><h2>Text the patient’s next step</h2></div><div className="message-content"><p className="message-recipient">To: <strong>{patient.phone||"Phone number missing"}</strong></p><pre className="sms-preview">{message}</pre>{!patient.phone&&<p className="muted">The BHW needs to save the patient’s phone number first.</p>}{estimate.segments>4&&<p className="connection-warning">Instructions are too long for the demo send limit. Shorten the saved instructions first.</p>}<div className="message-actions"><button className="primary" disabled={busy||checking||!patient.phone||estimate.segments>4||submission!=="none"} onClick={()=>void send()}>{busy?"Sending...":checking?"Checking message...":submission==="accepted"?"Message submitted":submission==="pending"||submission==="unknown"?"Check message status":"Send instructions by SMS"}</button><button className="text-button" disabled={busy||checking} onClick={()=>{setChecking(true);void check();}}>Refresh message status</button></div>{status&&<p className="message-status" role="status">{status}</p>}</div></section>;
}
