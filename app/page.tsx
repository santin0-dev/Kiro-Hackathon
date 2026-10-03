"use client";

import { cloneElement, isValidElement, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, ReactElement, ReactNode } from "react";
import { demoSlots, availableSlots, confirmAppointment, updateStep, recordOutcome, closeCase, approveDraft, declineCase, canClose, summarize, aiInput, sourceOf, validateDraft, type Case, type Outcome } from "./lib/workflow";

import SmsPanel from "./components/sms-panel";

import {loadCases,commit,subscribe,getServerSnapshot,refreshCases} from "./lib/case-store";
function useCases(){return useSyncExternalStore(subscribe,loadCases,getServerSnapshot);}
const statusLabels = { awaiting_review: "Referral sent", active: "Appointment confirmed", completed: "Assessment completed", declined: "Care declined" };
function date(value: string) { return new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function localInput(value: string) { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); }
function Field({ label, children }: { label: string; children: ReactNode }) { const id = useId(); return <div className="field"><label htmlFor={id}>{label}</label>{isValidElement(children) ? cloneElement(children as ReactElement<{id?:string}>, {id}) : children}</div>; }

export default function Home() {
  const cases = useCases();
  const [role,setRole] = useState<"BHW"|"Doctor">("BHW");
  const patientView = false;
  const [dbError,setDbError]=useState("");
  const [view,setView] = useState("workspace");
  const [detailOpen,setDetailOpen] = useState(false);
  const [selected,setSelected] = useState("DEMO-001");
  const [search,setSearch] = useState("");
  const [toast,setToast] = useState("");
  const [create,setCreate] = useState(false);
  const [busy,setBusy] = useState(false);
  const [uploading,setUploading] = useState(false);
  const [now,setNow] = useState(() => Date.now());
  const busyRef = useRef(false);
  const [aiStatus,setAiStatus] = useState<{configured:boolean}>({configured:false});
  const c = cases.find(item => item.id === selected) ?? cases[0];
  const stats = useMemo(() => summarize(cases, now),[cases,now]);
  const slots = useMemo(() => demoSlots(now),[now]);
  const freeSlots = useMemo(() => availableSlots(cases,slots,now),[cases,slots,now]);
  const filtered = useMemo(() => cases.filter(item => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase())),[cases,search]);
  useEffect(() => { const refresh=()=>void refreshCases().then(()=>setDbError("")).catch(e=>setDbError(e instanceof Error?e.message:"Database unavailable.")); refresh(); const timer=setInterval(refresh,10000); return()=>clearInterval(timer); },[]);
  useEffect(() => { void fetch("/api/assistant").then(r => r.json()).then(setAiStatus).catch(() => {}); },[]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()),60000); return () => clearInterval(timer); },[]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""),6000); return () => clearTimeout(timer); },[toast]);
  async function change(fn: (item:Case) => Case, message:string) {
    try { const current = loadCases(); const target = current.find(item => item.id === selected); if (!target) throw new Error("Encounter unavailable."); await commit(current.map(item => item.id === selected ? fn(target) : item)); setToast(message); }
    catch(e) { setToast(e instanceof Error ? e.message : "Unable to save. Your record is unchanged."); }
  }
  function open(id:string) { setSelected(id); setDetailOpen(true); setView("workspace"); }
  async function generate() {
    if (!c || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const id = c.id, input = aiInput(c), source = sourceOf(c);
    try {
      const response = await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(20000)});
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "AI unavailable. Use the original plan.");
      const draft = validateDraft(body.draft,input), current = loadCases(), target = current.find(item => item.id === id);
      if (!target || sourceOf(target) !== source) throw new Error("Record changed. Request a fresh draft.");
      await commit(current.map(item => item.id === id ? {...item,draft:{value:draft,source,approved:false,latencyMs:body.latencyMs,cached:body.cached}} : item));
      setToast("Draft ready for clinician review.");
    } catch(e) { setToast(e instanceof Error ? e.message : "AI unavailable. Use the original plan."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function addCase(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget);
    try {
      if (cases.length >= 500) throw new Error("Demo capacity reached.");
      const systolic = Number(f.get("systolic")), diastolic = Number(f.get("diastolic")), age = Number(f.get("age")), name = String(f.get("name")).trim();
      if (!name || !Number.isInteger(age) || age < 18 || age > 120 || !Number.isFinite(systolic) || !Number.isFinite(diastolic) || diastolic <= 0 || systolic <= diastolic) throw new Error("Check name, adult age, and numeric readings. Systolic must exceed diastolic.");
      const at = new Date().toISOString();
      const created:Case = {id:`DEMO-${crypto.randomUUID().slice(0,8).toUpperCase()}`,name,age,barangay:String(f.get("area")),screenedAt:at,readings:[{systolic,diastolic,measuredAt:at}],history:String(f.get("history")),status:"awaiting_review",plan:null,outcome:null,steps:[],events:[{at,actor:"BHW",text:"Fictional screening submitted for clinician review."}]};
      await commit([created,...loadCases()]); open(created.id); setCreate(false); setToast("Referral sent to the simulated hospital queue. Attach available documents in this case.");
    } catch(e) { setToast(e instanceof Error ? e.message : "Unable to save."); }
  }
  function book() {
    change(item => confirmAppointment(item,loadCases(),freeSlots[0] || "",slots,role,Date.now()),"Demo hospital accepted the referral and confirmed the appointment.");
  }
  async function attach(files:File[]) {
    if (!c || !files.length) return;
    const targetId = c.id; setUploading(true);
    try {
      if (files.length + (c.documents?.length || 0) > 3) throw new Error("Maximum three documents per case.");
      const documents = await Promise.all(files.map(async file => {
        if (!["application/pdf","image/jpeg","image/png"].includes(file.type) || file.size > 500000 || file.size === 0) throw new Error("Use PDF, JPG or PNG files, up to 500 KB each.");
        const dataUrl = await new Promise<string>((resolve,reject) => {const reader = new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Could not read file."));reader.readAsDataURL(file);});
        return {id:crypto.randomUUID(),name:file.name.slice(0,200),mime:file.type as "application/pdf"|"image/jpeg"|"image/png",dataUrl,addedAt:new Date().toISOString()};
      }));
      const current = loadCases(), target = current.find(item => item.id === targetId);
      if (!target || documents.length + (target.documents?.length || 0) > 3) throw new Error("Case changed. Try again.");
      await commit(current.map(item => item.id === targetId ? {...item,documents:[...(item.documents || []),...documents],events:[...item.events,{at:new Date().toISOString(),actor:role,text:"Available documents attached; authenticity and clinical meaning are not verified."}]} : item));
      setToast("Original documents saved to private Supabase storage. No AI extraction performed.");
    } catch(e) {setToast(e instanceof Error ? e.message : "Storage full. Documents were not saved.");}
    finally {setUploading(false);}
  }
  function submitOutcome(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const d = new FormData(event.currentTarget);
    try { const outcome:Outcome = {kind:String(d.get("kind")) as Outcome["kind"],diagnosis:String(d.get("diagnosis")),explanation:String(d.get("explanation")),followUp:String(d.get("followUp")),followUpDue:new Date(String(d.get("followUpDue"))).toISOString()}; change(item => recordOutcome(item,outcome,role),"Outcome saved. Confirm it was explained to the patient."); }
    catch { setToast("Choose a valid follow-up date."); }
  }
  if (!c) return <main className="loading"><h1>{dbError ? "Database setup needed" : "Connecting to Supabase..."}</h1><p>{dbError || "Loading shared fictional cases."}</p><button className="secondary" onClick={()=>void refreshCases().catch(e=>setDbError(e instanceof Error?e.message:"Connection failed."))}>Retry connection</button></main>;
  const draftCurrent = c.draft?.source === sourceOf(c);
  return <div className={`shell ${patientView ? "patient-mode" : ""}`}>
    {!patientView && <aside className="sidebar"><div className="brand">vitality.</div><p className="nav-label">CARE WORKSPACE</p><button className={`nav-item ${view === "workspace" ? "selected" : ""}`} onClick={() => {setView("workspace");setDetailOpen(false);}}>Patients <span>{cases.length}</span></button><button className={`nav-item ${view === "followup" ? "selected" : ""}`} onClick={() => setView("followup")}>Follow-up <span>{stats.openTasks}</span></button><div className="sidebar-bottom"><div className="assistant-note"><strong>Screen. Review. Follow up.</strong><p>BHW referral. Hospital assessment. Findings returned.</p></div></div></aside>}
    <div className="main-wrap">
      <header className="topbar"><strong>vitality.</strong><label className="role-control">Demo workspace <select aria-label="Demo role" value={role} onChange={e=>setRole(e.target.value as "BHW"|"Doctor")}><option>BHW</option><option value="Doctor">Hospital</option></select></label></header>
      <div className="demo-banner"><span>FICTIONAL DEMO</span> Shared Supabase cases · fictional hospital & slots · simulated roles. {dbError && <strong role="status">Sync failed: {dbError}</strong>}<button onClick={()=>void refreshCases().catch(e=>setDbError(e instanceof Error?e.message:"Sync failed."))}>Refresh</button></div>
      <main className="content">
        <div className="page-heading"><div><h1>{patientView ? "Your hospital appointment." : view === "followup" ? "Follow-up." : "Screening to hospital assessment."}</h1><p>{patientView ? "Your confirmed instructions and returned assessment outcome." : "Demo City · two illustrative barangays · five starting patients."}</p></div>{!patientView && role === "BHW" && view === "workspace" && <button className="primary" onClick={() => setCreate(true)}>+ Record screening & refer</button>}</div>
        {!patientView && view === "followup" ? <section className="panel"><div className="panel-heading"><div><h2>Needs follow-up</h2><p>No confirmation does not prove a missed visit.</p></div></div><div className="task-list">{cases.filter(item => item.status !== "declined").flatMap(item => item.steps.filter(step => step.state !== "confirmed").map(step => <button className="queue-row" key={step.id} onClick={() => open(item.id)}><div><strong>{item.name}</strong><small>{step.title}</small></div><span className="queue-date">{date(step.due)}<small>{step.state === "reported" ? "Reported; confirm with staff" : "Status unconfirmed"}</small></span></button>))}{stats.openTasks === 0 && <p className="empty">No outstanding steps.</p>}</div></section> : <div className={`workspace ${detailOpen ? "show-detail" : "show-list"}`}>
          {!patientView && <section className="panel encounter-list"><div className="panel-heading"><h2>Patients</h2><span className="badge neutral">{filtered.length}</span></div><div className="filters"><input aria-label="Search encounters" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient or code..."/></div><div className="case-list">{filtered.map(item => <button key={item.id} className={`case-row ${item.id === selected ? "active-row" : ""}`} onClick={() => open(item.id)}><span className="avatar">{item.name.split(" ").map(x => x[0]).join("")}</span><div><strong>{item.name}</strong><small>{item.id} · {item.barangay}</small><span className={`badge ${item.status}`}>{statusLabels[item.status]}</span></div><span className="chevron">›</span></button>)}{!filtered.length && <p className="empty">No matching patients.</p>}</div></section>}
          <div className="case-detail">
            {!patientView && <button className="secondary mobile-back" onClick={() => setDetailOpen(false)}>← All patients</button>}
            <section className="panel"><div className="panel-heading"><div><p className="eyebrow">{c.id}</p><h2 className="patient-title">{c.name}</h2><p>{c.age} years · {c.barangay}</p></div><span className={`badge ${c.status}`}>{statusLabels[c.status]}</span></div>
              {!patientView && <div className="clinical-facts"><div><small>RECORDED BLOOD PRESSURE</small><strong>{c.readings.map(r => `${r.systolic}/${r.diastolic}`).join(" · ")}<span> mmHg</span></strong><p>Screening readings are not a diagnosis.</p></div><div><small>SCREENING CONTEXT</small><p>{c.history}</p></div></div>}
              {!patientView && <div className="documents"><h3>Available patient documents</h3><p className="muted">Original files only. No authenticity checks or AI extraction.</p>{(c.documents || []).map(doc => <a className="document-link" key={doc.id} href={doc.storagePath ? `/api/documents?case=${encodeURIComponent(c.id)}&document=${encodeURIComponent(doc.id)}` : doc.dataUrl} download={doc.name}>{doc.name} · Download original</a>)}{!c.documents?.length && <p className="muted">No documents attached. Referral can proceed without them.</p>}{role === "BHW" && <Field label="Attach fictional documents (PDF/JPG/PNG, 500 KB each, maximum 3)"><input type="file" accept="application/pdf,image/jpeg,image/png" multiple disabled={uploading} onChange={e => {void attach(Array.from(e.target.files || []));e.target.value="";}}/></Field>}</div>}
              <div className="plan-section"><h3>{c.plan ? "Confirmed appointment · simulated hospital" : "Referral sent — appointment not confirmed"}</h3>{c.plan ? <div className="plan-grid"><div><small>WHAT TO DO</small><p>{c.plan.action}</p></div><div><small>WHERE TO GO</small><p>{c.plan.destination}</p></div><div><small>WHEN</small><p>{date(c.plan.due)}</p></div><div><small>WHAT TO BRING / PREPARATION</small><p>{c.plan.bring}</p></div><div className="wide"><small>CONTACT / CONFIRM AVAILABILITY</small><p>{c.plan.contact}</p></div></div> : <p className="empty">Hospital staff must accept the referral and confirm a slot. No appointment is booked yet.</p>}</div>
              {c.outcome && <div className="outcome-box"><p className="eyebrow">DOCTOR ASSESSMENT OUTCOME</p><h3>{c.outcome.kind.replaceAll("_"," ")}</h3>{c.outcome.diagnosis && <strong>{c.outcome.diagnosis}</strong>}<p>{c.outcome.explanation}</p><p><strong>Next / ongoing care:</strong> {c.outcome.followUp}</p><small>{date(c.outcome.followUpDue)} · Simulated clinical decisions.</small></div>}
              {c.steps.length > 0 && <div className="steps"><h3>Care progress</h3>{c.steps.map((step,i) => <div className="step" key={step.id}><span className={`step-number ${step.state === "confirmed" ? "done" : ""}`}>{step.state === "confirmed" ? "✓" : i+1}</span><div><strong>{step.title}</strong><small>{date(step.due)}</small><span className="step-state">{step.state === "confirmed" ? `Confirmed by ${step.confirmedBy}` : step.state === "reported" ? "Patient-reported; staff confirmation needed" : "Status unconfirmed"}</span></div>{step.state !== "confirmed" && c.status !== "declined" && <>{patientView && step.kind === "attendance" && step.state === "pending" && <button className="secondary compact" onClick={() => change(item => updateStep(item,step.id,"Patient",true),"Attendance reported. Staff still need to confirm it.")}>I attended</button>}{!patientView && (role === "Doctor" || ["attendance","follow_up"].includes(step.kind)) && <button className="secondary compact" onClick={() => change(item => updateStep(item,step.id,role),"Progress confirmed.")}>Confirm</button>}</>}</div>)}</div>}
            </section>
            {c.plan && <SmsPanel key={c.id+"-"+c.plan.due} patient={c} onAccepted={messageId=>change(item=>({...item,events:[...item.events,{at:new Date().toISOString(),actor:role,text:`SMS accepted by AWS (${messageId}); delivery unconfirmed.`}]}),"AWS accepted the SMS. Patient receipt is unconfirmed.")}/>}
            {!patientView && role === "Doctor" && !["completed","declined"].includes(c.status) && <section className="panel clinician-form"><div className="panel-heading"><h2>Hospital review</h2></div>{!c.plan && <div className="booking"><p>Review screening and original documents before accepting. Slots and hospital are fictional.</p><p><strong>Suggested slot:</strong> {freeSlots[0] ? date(freeSlots[0]) : "No demo slots available"}</p><button className="primary" disabled={!freeSlots.length} onClick={book}>Accept referral & confirm demo appointment</button><p className="muted">Standard hospital instructions are attached automatically. AI may explain them after clinician review.</p></div>}
              {c.status === "active" && <><form onSubmit={submitOutcome} key={`${c.id}-outcome`}><h3>Return assessment outcome to patient & BHW</h3><p className="muted">Confirm assessment before a final outcome.</p><div className="form-grid"><Field label="Assessment outcome"><select name="kind" defaultValue={c.outcome?.kind || "more_assessment_needed"}><option value="more_assessment_needed">More assessment needed</option><option value="diagnosis_confirmed">Diagnosis confirmed</option><option value="not_confirmed">Suspected condition not confirmed</option></select></Field><Field label="Diagnosis label (if confirmed)"><input name="diagnosis" maxLength={300} defaultValue={c.outcome?.diagnosis || ""}/></Field><Field label="Patient-facing explanation"><textarea name="explanation" maxLength={2000} defaultValue={c.outcome?.explanation || ""} required/></Field><Field label="Next assessment / ongoing follow-up plan"><textarea name="followUp" maxLength={2000} defaultValue={c.outcome?.followUp || ""} required/></Field><Field label="Next action date and time"><input name="followUpDue" type="datetime-local" defaultValue={localInput(c.outcome?.followUpDue || c.plan!.due)} required/></Field></div><button className="primary">Record clinical outcome</button></form><div className="closure"><button className="primary" disabled={!canClose(c)} onClick={() => change(item => closeCase(item,role),"Assessment completed. Ongoing follow-up stays on the queue.")}>Mark outcome returned</button><p>Requires final outcome and confirmed communication.</p></div></>}
              <button className="text-button danger" onClick={() => {const reason = prompt("Reason for declined care? Fictional information only.");if (reason) change(item => declineCase(item,role,reason),"Declined care recorded separately.");}}>Record declined care</button>
            </section>}
            {!patientView && <details className="panel ai-panel"><summary className="form-summary">AI documentation assistant · {aiStatus.configured ? "Configured; live use unverified" : "Setup needed"}</summary><div className="assistant-body"><p>Bedrock drafts a summary and explains the approved plan. Doctors choose clinical care.</p><button className="primary ai-button" disabled={busy} onClick={generate}>{busy ? "Drafting..." : "Generate AI draft"}</button>{!aiStatus.configured && <p className="setup-hint">AWS configuration is still needed. Manual care plans work without AI.</p>}{c.draft && <div className="draft"><span className="badge neutral">{c.draft.approved && draftCurrent ? "Clinician-reviewed wording" : "Unapproved AI draft"}</span><h3>Summary</h3><p>{c.draft.value.summary}</p><h3>Patient explanation</h3><p>{c.draft.value.patientExplanation}</p>{c.draft.value.missingFields.length > 0 && <ul>{c.draft.value.missingFields.map((field,i) => <li key={i}>{field}</li>)}</ul>}<small>{c.draft.latencyMs} ms · {c.draft.cached ? "Cached identical request" : "Bedrock invocation"}. Schema checks do not prove clinical correctness.</small>{role === "Doctor" && !c.draft.approved && <button className="secondary" onClick={() => change(item => approveDraft(item,role),"Wording reviewed against the original facts.")}>I checked the wording against the original facts</button>}</div>}</div></details>}
            {patientView && c.draft?.approved && draftCurrent && c.draft.value.patientExplanation && <section className="panel patient-explanation"><h3>Explanation reviewed by your clinician</h3><p>{c.draft.value.patientExplanation}</p><small>The original plan remains the source of instructions.</small></section>}
            {!patientView && <details className="panel timeline"><summary>Activity history</summary>{[...c.events].reverse().map((event,i) => <div className="timeline-row" key={i}><div><p>{event.text}</p><small>{event.actor} · {date(event.at)}</small></div></div>)}</details>}
          </div>
        </div>}
        <footer>Vitality · local prototype<span>AI drafts are not diagnoses. Patient notifications use SMS. No patient account required.</span></footer>
      </main>
      {!patientView && <nav className="mobile-nav" aria-label="Care workspace"><button className={view === "workspace" ? "selected" : ""} onClick={() => {setView("workspace");setDetailOpen(false);}}>Patients</button><button className={view === "followup" ? "selected" : ""} onClick={() => setView("followup")}>Follow-up ({stats.openTasks})</button></nav>}
    </div>
    {toast && <div className="toast" role="status"><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast("")}>×</button></div>}
    {create && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="panel-heading"><h2 id="create-title">Record a screening</h2><button className="icon-button" aria-label="Close screening form" onClick={() => setCreate(false)}>×</button></div><form onSubmit={addCase}><div className="form-grid"><Field label="Fictional patient name"><input name="name" maxLength={100} required/></Field><Field label="Age"><input name="age" type="number" min="18" max="120" required/></Field><Field label="Illustrative barangay"><select name="area">{stats.areas.map(area => <option key={area.name}>{area.name}</option>)}</select></Field><Field label="Blood pressure (mmHg)"><div className="bp-input"><input name="systolic" type="number" min="1" required aria-label="Systolic" placeholder="Systolic"/><span>/</span><input name="diastolic" type="number" min="1" required aria-label="Diastolic" placeholder="Diastolic"/></div></Field><Field label="Relevant history / reason for referral"><textarea name="history" maxLength={2000} required/></Field></div><p className="muted">Fictional data only. This demo does not diagnose or classify readings.</p><button className="primary">Submit referral to demo hospital</button></form></section></div>}
  </div>;
}
