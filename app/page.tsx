"use client";

import dynamic from "next/dynamic";
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import type {FormEvent,ReactNode} from "react";
import {loadCases,commit,subscribe,getServerSnapshot,refreshCases} from "./lib/case-store";
import {isReferred,hospitalCases,routeScreening,DEMO_BARANGAY,demoSlots,availableSlots,confirmAppointment,savePlan,updateStep,recordOutcome,closeCase,canClose,HOSPITAL,BRING,CONTACT,aiInput,sourceOf,validateDraft,approveDraft,type Case,type Outcome} from "./lib/workflow";
import SmsPanel from "./components/sms-panel";

const AreaMap=dynamic(()=>import("./components/area-map"),{ssr:false,loading:()=> <div className="area-map skeleton">Loading the area map...</div>});
const date=(value:string)=>new Date(value).toLocaleString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const localInput=(value:string)=>{const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
function status(c:Case){
  if(!isReferred(c))return "Not yet referred";
  if(c.status==="awaiting_review")return "Sent to hospital";
  if(c.status==="completed")return "Results returned";
  if(c.status==="declined")return "Care declined";
  if(c.outcome?.kind==="more_assessment_needed")return "More checks needed";
  if(c.outcome)return "Results ready";
  return "Hospital visit booked";
}
const resultLabels={diagnosis_confirmed:"Diagnosis confirmed",not_confirmed:"Condition not confirmed",more_assessment_needed:"More checks needed"};
const progressLabels={attendance:"Hospital visit",assessment:"Doctor's assessment",communication:"Results explained",follow_up:"Follow-up"};
export default function Home(){
  const cases=useSyncExternalStore(subscribe,loadCases,getServerSnapshot);
  const [role,setRole]=useState<"BHW"|"Doctor">("BHW");
  const area=DEMO_BARANGAY;
  const [patientsOpen,setPatientsOpen]=useState(false);
  const [filter,setFilter]=useState("all");
  const [selected,setSelected]=useState<string|null>(null);
  const [search,setSearch]=useState("");
  const [create,setCreate]=useState(false);
  const [toast,setToast]=useState("");
  const [dbError,setDbError]=useState("");
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [now,setNow]=useState(()=>Date.now());
  const saveLock=useRef(false);
  const aiLock=useRef(false);
  const inbox=useMemo(()=>hospitalCases(cases),[cases]);
  const visible=useMemo(()=>(role==="BHW"?cases.filter(c=>c.barangay===area):inbox).filter(c=>`${c.name} ${c.id}`.toLowerCase().includes(search.toLowerCase()) && matchesFilter(c,filter)).sort((a,b)=>Date.parse(b.screenedAt)-Date.parse(a.screenedAt)),[cases,inbox,role,area,search,filter]);
  const c=(role==="Doctor"?inbox:cases.filter(c=>c.barangay===area)).find(c=>c.id===selected);
  const slots=useMemo(()=>demoSlots(now),[now]);
  const freeSlots=useMemo(()=>availableSlots(cases,slots,now),[cases,slots,now]);
  const selectArea=useCallback(()=>{setPatientsOpen(true);setSelected(null);setSearch("");},[]);
  useEffect(()=>{const refresh=()=>void refreshCases().then(()=>setDbError("")).catch(e=>setDbError(e instanceof Error?e.message:"Connection unavailable."));refresh();const timer=setInterval(refresh,10000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(""),8000);return()=>clearTimeout(timer);},[toast]);
  async function change(fn:(c:Case)=>Case,message:string){
    if(!c || saveLock.current)return;
    const id=c.id;saveLock.current=true;setSaving(true);
    try{const current=loadCases(),target=current.find(c=>c.id===id);if(!target)throw new Error("Patient unavailable. Refresh the page.");const updated=fn(target);if(JSON.stringify(updated)!==JSON.stringify(target))await commit(current.map(c=>c.id===id?updated:c));setToast(message);}
    catch(e){setToast(e instanceof Error?e.message:"Could not save. Try again.");}
    finally{saveLock.current=false;setSaving(false);}
  }
  async function addCase(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(saveLock.current)return;const f=new FormData(e.currentTarget);saveLock.current=true;setSaving(true);
    try{
      const name=String(f.get("name")).trim(),age=Number(f.get("age")),systolic=Number(f.get("systolic")),diastolic=Number(f.get("diastolic")),phone=String(f.get("phone")).trim();
      if(!name || !Number.isInteger(age)||age<18||age>120||!Number.isFinite(systolic)||!Number.isFinite(diastolic)||diastolic<=0||systolic<=diastolic)throw new Error("Check the name, age and blood pressure readings.");
      if(phone&&!/^\+639\d{9}$/.test(phone))throw new Error("Use a Philippine phone number like +639171234567.");
      if(loadCases().length>=500)throw new Error("The demo patient limit has been reached.");
      const at=new Date().toISOString(),barangay=String(f.get("area"));
      const documents=await readDocuments(f.getAll("documents").filter((value):value is File=>value instanceof File && value.name!==""));
      const patient:Case={id:`DEMO-${crypto.randomUUID().slice(0,8).toUpperCase()}`,name,age,barangay,screenedAt:at,readings:[{systolic,diastolic,measuredAt:at}],history:String(f.get("history")),...(phone?{phone}:{}),referral:null,status:"awaiting_review",plan:null,outcome:null,steps:[],documents,events:[{at,actor:"BHW",text:documents.length?"Screening saved with attached documents.":"Screening saved."}]};
      await commit([routeScreening(patient),...loadCases()]);setPatientsOpen(true);setSelected(patient.id);setCreate(false);setToast("Screening saved and routed to the hospital automatically.");
    }catch(e){setToast(e instanceof Error?e.message:"Could not save the screening.");}finally{saveLock.current=false;setSaving(false);}
  }
  async function attach(files:File[]){
    if(!c||!files.length||saveLock.current)return;const id=c.id;saveLock.current=true;setUploading(true);
    try{
      if(files.length+(c.documents?.length||0)>3)throw new Error("Add up to three documents.");
      const docs=await readDocuments(files);
      const current=loadCases(),target=current.find(c=>c.id===id);if(!target||docs.length+(target.documents?.length||0)>3)throw new Error("Record changed. Try again.");
      await commit(current.map(c=>c.id===id?{...c,documents:[...(c.documents||[]),...docs],events:[...c.events,{at:new Date().toISOString(),actor:"BHW",text:"Documents attached to the screening."}]}:c));setToast("Documents saved.");
    }catch(e){setToast(e instanceof Error?e.message:"Could not save the documents.");}finally{saveLock.current=false;setUploading(false);}
  }
  function book(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget);
    void change(item=>{const booked=confirmAppointment(item,loadCases(),String(f.get("due")),slots,"Doctor",Date.now());return savePlan(booked,{...booked.plan!,action:String(f.get("action")),bring:String(f.get("bring")),contact:String(f.get("contact"))},"Doctor");},"Hospital instructions saved. You can now text the patient.");
  }
  function outcome(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget);
    try{const value:Outcome={kind:String(f.get("kind")) as Outcome["kind"],diagnosis:String(f.get("diagnosis")),explanation:String(f.get("explanation")),followUp:String(f.get("followUp")),followUpDue:new Date(String(f.get("followUpDue"))).toISOString()};void change(item=>recordOutcome(item,value,"Doctor"),"Results and next steps saved. The BHW can see them now.");}catch{setToast("Choose a valid return date.");}
  }
  async function generate(){
    if(!c||aiLock.current)return;aiLock.current=true;setBusy(true);const id=c.id,input=aiInput(c),source=sourceOf(c);
    try{const r=await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(20000)}),b=await r.json();if(!r.ok)throw new Error(b.error||"Writing assistant unavailable.");const draft=validateDraft(b.draft,input),current=loadCases(),target=current.find(c=>c.id===id);if(!target||sourceOf(target)!==source)throw new Error("The record changed. Try again.");await commit(current.map(c=>c.id===id?{...c,draft:{value:draft,source,approved:false,latencyMs:b.latencyMs,cached:b.cached}}:c));setToast("Draft ready for the doctor's review.");}catch(e){setToast(e instanceof Error?e.message:"Writing assistant unavailable.");}finally{aiLock.current=false;setBusy(false);}
  }
  const attendanceDone=c?.steps.some(s=>s.kind==="attendance"&&s.state==="confirmed");
  const assessmentDone=c?.steps.some(s=>s.kind==="assessment"&&s.state==="confirmed");
  return <div className={`staff-app ${role==="BHW"?"bhw-app":"hospital-app"}`}>
    <header className="staff-header"><strong className="staff-brand">vitality.</strong><div className="staff-switch" aria-label="Demo workspace"><button className={role==="BHW"?"selected":""} onClick={()=>{setRole("BHW");setSelected(null);setSearch("");setFilter("all");}}>BHW</button><button className={role==="Doctor"?"selected":""} onClick={()=>{setRole("Doctor");setSelected(null);setSearch("");setFilter("all");}}>Hospital</button></div></header>
    <div className="demo-banner"><span>FICTIONAL DEMO</span> Simulated areas, patients and hospital appointments.<button onClick={()=>void refreshCases().catch(e=>setDbError(e instanceof Error?e.message:"Connection unavailable."))}>Refresh</button></div>
    <main className="staff-content" aria-busy={saving||uploading} inert={!!c||create}>
      <div className="page-heading"><div><h1>{role==="BHW"?"Dashboard":"Hospital referrals"}</h1><p>{role==="BHW"?"Choose your barangay to view screened patients.":"Review patients sent to your hospital and tell them what to do next."}</p></div>{role==="BHW"&&<button className="primary" onClick={()=>{setSelected(null);setCreate(true);}}>+ Add patient</button>}</div>
      {dbError&&<div className="connection-warning" role="status">Patient records could not refresh. <details><summary>Connection details</summary>{dbError}</details></div>}
      {role==="BHW"?<div className={`bare-dashboard ${patientsOpen?"patients-visible":""}`}>
        <section className="panel map-panel"><div className="panel-heading"><h2>{area}</h2><span className="badge neutral">{cases.filter(c=>c.barangay===area).length} screened</span></div><AreaMap onSelect={selectArea}/><button className="map-open-button" onClick={selectArea}>View patients in this barangay</button><p className="map-note">Demo location only. The circle represents the barangay, not patient homes.</p></section>
        {patientsOpen&&<section className="panel patients-side"><div className="panel-heading"><h2>Patients</h2><button className="icon-button" aria-label="Close patient panel" onClick={()=>setPatientsOpen(false)}>×</button></div><div className="patient-tools"><input aria-label="Search patients" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or patient code..."/><div><StatusFilter value={filter} onChange={setFilter}/><button className="primary" onClick={()=>{setSelected(null);setCreate(true);}}>+ Add patient</button></div></div><PatientList patients={visible} selected={selected} onSelect={setSelected}/></section>}
      </div>:<section className="panel hospital-folders"><div className="panel-heading"><h2>Patients sent to your hospital</h2><span className="badge neutral">{visible.length}</span></div><div className="patient-tools"><input aria-label="Search hospital patients" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or patient code..."/><StatusFilter value={filter} onChange={setFilter}/></div>{Array.from(new Set(visible.map(c=>c.barangay))).map(name=><details className="barangay-folder" key={name} open><summary><span>▱ {name}</span><span>{visible.filter(c=>c.barangay===name).length} patients</span></summary><PatientList patients={visible.filter(c=>c.barangay===name)} selected={selected} onSelect={setSelected}/></details>)}{!visible.length&&<p className="empty">No matching referrals.</p>}</section>}
      {!cases.length&&!dbError&&<p role="status">Loading screened patients...</p>}
    </main>
    {c&&!create&&<PatientDialog onClose={()=>{if(!saving&&!uploading&&!busy)setSelected(null);}} name={c.name}><div className="patient-popup-content">
            <section className="panel"><div className="panel-heading"><div><h2 className="patient-title">{c.name}</h2><p>{c.age} years · {c.barangay} · {c.id}</p></div><span className={`badge ${c.status}`}>{status(c)}</span></div><div className="clinical-facts"><div><small>BLOOD PRESSURE</small><strong>{c.readings.map(r=>`${r.systolic}/${r.diastolic}`).join(" · ")}<span> mmHg</span></strong></div><div><small>SYMPTOMS AND HISTORY</small><p>{c.history||"No history recorded."}</p></div></div>
              {role==="BHW"?<form className="phone-form" key={`${c.id}-${c.phone||""}`} onSubmit={e=>{e.preventDefault();const phone=String(new FormData(e.currentTarget).get("phone")).trim();if(!/^\+639\d{9}$/.test(phone)){setToast("Use a number like +639171234567.");return;}void change(item=>({...item,phone}),"Phone number saved for hospital texts.");}}><label htmlFor="patient-phone">Patient phone number</label><div><input id="patient-phone" name="phone" type="tel" placeholder="+639171234567" defaultValue={c.phone||""} required/><button className="secondary" disabled={saving}>Save number</button></div></form>:<p className="patient-phone">Phone: {c.phone||"Not recorded — ask the BHW to add it."}</p>}
              <div className="documents"><h3>Documents</h3>{c.documents?.map(doc=><a className="document-link" key={doc.id} href={doc.storagePath?`/api/documents?case=${encodeURIComponent(c.id)}&document=${encodeURIComponent(doc.id)}`:doc.dataUrl} download={doc.name}>{doc.name}</a>)}{!c.documents?.length&&<p className="muted">No documents attached.</p>}{role==="BHW"&&<label className="field">Add PDF or photos (up to 3, 500 KB each)<input type="file" accept="application/pdf,image/jpeg,image/png" multiple disabled={uploading||saving} onChange={e=>{void attach(Array.from(e.target.files||[]));e.target.value="";}}/></label>}</div>

              {role==="BHW"&&isReferred(c)&&!c.plan&&<div className="plan-section"><h3>Sent to hospital</h3><p>Waiting for the hospital to review the screening and confirm the next step.</p></div>}
              {c.plan&&<div className="plan-section"><h3>Hospital instructions</h3><div className="plan-grid"><div><small>WHAT TO DO</small><p>{c.plan.action}</p></div><div><small>WHERE TO GO</small><p>{c.plan.destination}</p></div><div><small>WHEN</small><p>{date(c.plan.due)}</p></div><div><small>WHAT TO BRING</small><p>{c.plan.bring}</p></div></div></div>}
              {c.outcome&&<div className="outcome-box"><h3>{resultLabels[c.outcome.kind]}</h3>{c.outcome.diagnosis&&<strong>{c.outcome.diagnosis}</strong>}<p>{c.outcome.explanation}</p><p><strong>Next:</strong> {c.outcome.followUp}</p><small>{date(c.outcome.followUpDue)}</small></div>}
              {c.steps.length>0&&<div className="steps"><h3>{role==="BHW"?"Patient progress":"Visit progress"}</h3>{c.steps.map((s,i)=><div className="step" key={s.id}><span className={`step-number ${s.state==="confirmed"?"done":""}`}>{s.state==="confirmed"?"✓":i+1}</span><div><strong>{progressLabels[s.kind]}</strong><small>{s.title}</small><small>{date(s.due)} · {s.state==="confirmed"?"Done":"Not yet confirmed"}</small></div>{s.state!=="confirmed"&&c.status!=="declined"&&(c.status!=="completed"||s.kind==="follow_up")&&((role==="Doctor")||(s.kind==="attendance"||s.kind==="follow_up"))&&<button className="secondary" disabled={saving||(s.kind==="assessment"&&!attendanceDone)||(s.kind==="communication"&&!c.outcome)} onClick={()=>void change(item=>updateStep(item,s.id,role),"Progress updated.")}>{s.kind==="attendance"?"Confirm visit":s.kind==="assessment"?"Assessment done":s.kind==="communication"?"Results explained":"Follow-up done"}</button>}</div>)}</div>}
            </section>
            {role==="Doctor"&&c.status==="awaiting_review"&&<section className="panel clinician-form"><form key={`${c.id}-plan`} onSubmit={book}><h2>Set the patient’s next step</h2><p className="muted">Review the screening first. These instructions will be sent exactly as saved.</p><div className="form-grid"><label className="field">What to do<textarea name="action" defaultValue="Attend hospital assessment of the recorded screening and available records." required maxLength={500}/></label><label className="field">Hospital<input value={HOSPITAL} readOnly/></label><label className="field">Appointment<select name="due" required>{freeSlots.map(s=><option value={s} key={s}>{date(s)}</option>)}</select></label><label className="field">What to bring<textarea name="bring" defaultValue={BRING} required maxLength={500}/></label><label className="field">Who to contact<input name="contact" defaultValue={CONTACT} required maxLength={300}/></label></div><button className="primary" disabled={saving||!freeSlots.length}>{saving?"Saving...":"Accept referral and save instructions"}</button>{!freeSlots.length&&<p>No demo appointments are available.</p>}</form></section>}
            {role==="Doctor"&&c.plan&&c.status!=="declined"&&<SmsPanel key={`${c.id}-${sourceOf(c)}-${c.phone||""}`} patient={c} onAccepted={()=>setToast("Message submitted. Delivery status is shown below the send button.")}/>}
            {role==="Doctor"&&c.status==="active"&&assessmentDone&&<section className="panel clinician-form"><form onSubmit={outcome} key={`${c.id}-${c.outcome?.followUpDue||"results"}`}><h2>Record assessment results</h2><div className="form-grid"><label className="field">Result<select name="kind" defaultValue={c.outcome?.kind||"more_assessment_needed"}><option value="more_assessment_needed">More checks needed</option><option value="diagnosis_confirmed">Diagnosis confirmed</option><option value="not_confirmed">Condition not confirmed</option></select></label><label className="field">Diagnosis, if confirmed<input name="diagnosis" defaultValue={c.outcome?.diagnosis||""} maxLength={300}/></label><label className="field">Explain the result<textarea name="explanation" defaultValue={c.outcome?.explanation||""} required maxLength={1500}/></label><label className="field">Next instructions: what to do, where to go and what to bring<textarea name="followUp" defaultValue={c.outcome?.followUp||""} required maxLength={500}/></label><label className="field">Return date<input name="followUpDue" type="datetime-local" defaultValue={localInput(c.outcome?.followUpDue||c.plan!.due)} required/></label></div><button className="primary" disabled={saving}>Save results and next steps</button></form></section>}
            {role==="Doctor"&&canClose(c)&&<button className="primary" disabled={saving} onClick={()=>void change(item=>closeCase(item,"Doctor"),"Results returned. Follow-up stays visible to the BHW.")}>Finish review and return results</button>}
            {role==="Doctor"&&<details className="panel writing-help"><summary>Help write a summary</summary><div><p>Optional AI draft from the recorded facts. Check it against the original information.</p><button className="secondary" disabled={busy||saving} onClick={()=>void generate()}>{busy?"Writing...":"Draft summary"}</button>{c.draft?.source===sourceOf(c)&&<><p>{c.draft.value.summary}</p>{c.draft.value.patientExplanation&&<p>{c.draft.value.patientExplanation}</p>}{!c.draft.approved?<button className="secondary" disabled={saving} onClick={()=>void change(item=>approveDraft(item,"Doctor"),"Summary checked.")}>Mark as checked</button>:<small>Checked by doctor</small>}</>}</div></details>}
    </div></PatientDialog>}
    {create&&role==="BHW"&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-screening"><div className="panel-heading"><h2 id="new-screening">Record screening</h2><button className="icon-button" aria-label="Close" disabled={saving} onClick={()=>setCreate(false)}>×</button></div><form onSubmit={addCase}><p className="muted">Save the screening to route it to the hospital automatically. Fictional information only.</p><div className="form-grid"><label className="field">Patient name<input name="name" required maxLength={100}/></label><label className="field">Age<input name="age" type="number" min={18} max={120} required/></label><label className="field">Barangay<select name="area" defaultValue={area}><option>{DEMO_BARANGAY}</option></select></label><label className="field">Phone number<input name="phone" type="tel" placeholder="+639171234567"/></label><label className="field">Blood pressure: top number<input name="systolic" type="number" min={1} required/></label><label className="field">Blood pressure: bottom number<input name="diastolic" type="number" min={1} required/></label><label className="field">Symptoms and medical history<textarea name="history" maxLength={2000}/></label><label className="field">Patient documents (optional)<input name="documents" type="file" accept="application/pdf,image/jpeg,image/png" multiple disabled={saving}/><small>Add up to 3 PDF, JPG or PNG files, 500 KB each. They will be sent with the screening.</small></label></div><button className="primary" disabled={saving}>{saving?"Saving...":"Save screening"}</button></form></section></div>}
    {toast&&<div className="toast" role="status">{toast}<button aria-label="Dismiss message" onClick={()=>setToast("")}>×</button></div>}
  </div>;
}
function PatientList({patients,selected,onSelect}:{patients:Case[];selected:string|null;onSelect:(id:string)=>void}){
  return <div className="case-list">{patients.map(c=><button key={c.id} className={`case-row ${selected===c.id?"active-row":""}`} onClick={()=>onSelect(c.id)}><span className="avatar">{c.name.split(" ").map(n=>n[0]).join("")}</span><div><strong>{c.name}</strong><small>{c.barangay}</small><span className={`badge ${c.status}`}>{status(c)}</span></div><span className="chevron">›</span></button>)}{!patients.length&&<p className="empty">No patients here yet.</p>}</div>;
}

function matchesFilter(c:Case,value:string){
  if(value==="all")return true;
  if(value==="waiting")return c.status==="awaiting_review";
  if(value==="checks")return c.outcome?.kind==="more_assessment_needed";
  if(value==="results")return !!c.outcome && c.outcome.kind!=="more_assessment_needed";
  return c.status==="active"&&!c.outcome;
}
function StatusFilter({value,onChange}:{value:string;onChange:(value:string)=>void}){
  return <select aria-label="Filter patients by status" value={value} onChange={e=>onChange(e.target.value)}><option value="all">All statuses</option><option value="waiting">Waiting for hospital</option><option value="booked">Visit booked</option><option value="checks">More checks needed</option><option value="results">Results ready</option></select>;
}
function PatientDialog({name,onClose,children}:{name:string;onClose:()=>void;children:ReactNode}){
  const dialog=useRef<HTMLElement>(null),close=useRef<HTMLButtonElement>(null);
  const closeHandler=useRef(onClose);
  useEffect(()=>{closeHandler.current=onClose;},[onClose]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow="hidden";close.current?.focus();
    const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();closeHandler.current();}if(e.key==="Tab"){const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary')||[]);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    document.addEventListener("keydown",key);return()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",key);previous?.focus();};
  },[]);
  return <div className="modal-backdrop patient-popup-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={dialog} className="patient-popup" role="dialog" aria-modal="true" aria-labelledby="patient-popup-title"><div className="patient-popup-header"><div><small>SCREENING AND PROGRESS</small><h2 id="patient-popup-title">{name}</h2></div><button ref={close} className="icon-button" aria-label="Close patient details" onClick={onClose}>×</button></div>{children}</section></div>;
}

async function readDocuments(files:File[]):Promise<NonNullable<Case["documents"]>>{
  if(files.length>3)throw new Error("Add up to three documents.");
  for(const file of files){
    if(!["application/pdf","image/jpeg","image/png"].includes(file.type)||!file.size||file.size>500000)throw new Error("Use PDF, JPG or PNG up to 500 KB each.");
  }
  return Promise.all(files.map(async file=>{
    const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Could not read this file. Try selecting it again."));reader.readAsDataURL(file);});
    return {id:crypto.randomUUID(),name:file.name.slice(0,200),mime:file.type as "application/pdf"|"image/jpeg"|"image/png",dataUrl,addedAt:new Date().toISOString()};
  }));
}
