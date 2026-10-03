"use client";
import { useState } from "react";
import { appointmentSms } from "../lib/sms";
import type { Case } from "../lib/workflow";
export default function SmsPanel({patient,onAccepted}:{patient:Case;onAccepted:(id:string)=>void}) {
  const [phone,setPhone]=useState("");
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  if (!patient.plan) return null;
  const message=appointmentSms(patient.id,patient.plan);
  async function send() {
    if (!patient.plan || busy || !consent) return;
    setBusy(true);setStatus("");
    try {
      const response=await fetch("/api/sms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({demo:true,phone,consent,code:patient.id,plan:patient.plan}),signal:AbortSignal.timeout(20000)});
      const body=await response.json();
      if (!response.ok) throw new Error(body.error || "SMS could not be submitted.");
      setStatus("AWS accepted the message. Delivery and patient receipt are not yet confirmed.");onAccepted(body.messageId);
    } catch(e) {setStatus(e instanceof Error ? e.message : "SMS status unknown. Check AWS before retrying.");}
    finally {setBusy(false);}
  }
  return <section className="panel sms-panel"><h2>Patient notification by SMS</h2><p>Patient needs no app account. Review these hospital-approved instructions before sending.</p><pre className="sms-preview">{message}</pre><label className="field">Verified demo recipient (+63)<input type="tel" inputMode="tel" placeholder="+639XXXXXXXXX" value={phone} onChange={e=>setPhone(e.target.value)}/></label><label className="sms-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Recipient agreed to receive this fictional test message; I checked the number and instructions.</label><button className="primary" disabled={busy || !consent || !/^\+639\d{9}$/.test(phone)} onClick={send}>{busy ? "Submitting..." : "Send test SMS through AWS"}</button><p className="muted">AWS configuration, sandbox verification and a recipient allowlist are required. SMS may incur charges. Preview works without AWS.</p>{status && <p role="status">{status}</p>}</section>;
}
