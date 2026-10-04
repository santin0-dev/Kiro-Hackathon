"use client";

import dynamic from "next/dynamic";
import {useRouter} from "next/navigation";
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import type {FormEvent,ReactNode} from "react";
import {clearCases,loadCases,commit,subscribe,getServerSnapshot,refreshCases} from "../lib/case-store";
import {screeningSchema,hasRedFlags,RED_FLAG_LABELS,isReferred,hospitalCases,routeScreening,demoSlots,availableSlots,confirmAppointment,savePlan,updateStep,recordOutcome,closeCase,canClose,HOSPITAL,BRING,CONTACT,aiInput,sourceOf,validateDraft,approveDraft,type Case,type Outcome} from "../lib/workflow";
import {RedFlagFields,ExpandedFields,AssessmentDetails} from "./expanded-screening";
import type {MapAreaSelection} from "./metro-manila-map";
import AddBarangay from "./add-barangay";
import SmsPanel from "./sms-panel";
import {signOut,type DemoRole} from "../lib/demo-session";

const AreaMap=dynamic(()=>import("./metro-manila-map").then(m=>m.MetroManilaMap),{ssr:false,loading:()=> <div className="area-map skeleton">Loading the area map...</div>});
const date=(value:string)=>new Date(value).toLocaleString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const localInput=(value:string)=>{const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
function status(c:Case){
  if(hasRedFlags(c)&&c.status==="awaiting_review")return "Immediate assessment needed";
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
export default function StaffDashboard({role,userName}:{role:DemoRole;userName:string}){
  const router=useRouter();
  const cases=useSyncExternalStore(subscribe,loadCases,getServerSnapshot);
  const [area,setArea]=useState("");
  const [areas,setAreas]=useState<{name:string;lat:number;lng:number}[]>([]);
  const [addingArea,setAddingArea]=useState(false);

  const [patientsOpen,setPatientsOpen]=useState(false);
  const [filter,setFilter]=useState("all");
  const [selected,setSelected]=useState<string|null>(null);
  const [search,setSearch]=useState("");
  const [create,setCreate]=useState(false);
  const [toast,setToast]=useState("");
  const [dbError,setDbError]=useState("");
  const [casesLoaded,setCasesLoaded]=useState(false);
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{void fetch("/api/areas").then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);setAreas(data.areas);setArea(current=>data.areas.some((a:{name:string})=>a.name===current)?current:(data.areas[0]?.name||""));}).catch(()=>setToast("Saved barangays could not load. Refresh before adding a screening."));},[]);
  const saveLock=useRef(false);
  const aiLock=useRef(false);
  const inbox=useMemo(()=>hospitalCases(cases),[cases]);
  const visible=useMemo(()=>(role==="BHW"?cases.filter(c=>c.barangay===area):inbox).filter(c=>`${c.name} ${c.id}`.toLowerCase().includes(search.toLowerCase()) && matchesFilter(c,filter)).sort((a,b)=>Number(hasRedFlags(b)&&b.status==="awaiting_review")-Number(hasRedFlags(a)&&a.status==="awaiting_review")||Date.parse(b.screenedAt)-Date.parse(a.screenedAt)),[cases,inbox,role,area,search,filter]);
  const c=(role==="Doctor"?inbox:cases.filter(c=>c.barangay===area)).find(c=>c.id===selected);
  const slots=useMemo(()=>demoSlots(now,3),[now]);
  const freeSlots=useMemo(()=>availableSlots(cases,slots,now),[cases,slots,now]);
  const patientCounts=useMemo(()=>Object.fromEntries(areas.map(a=>[a.name,cases.filter(c=>c.barangay===a.name).length])),[areas,cases]);
  const mapSelectionVersion=useRef(0);
  const [selectingArea,setSelectingArea]=useState(false);
  async function selectBoundary(selection:MapAreaSelection|null){
    const version=++mapSelectionVersion.current;
    if(!selection){setSelectingArea(false);setPatientsOpen(false);setArea("");setSelected(null);return;}
    const canonicalName=`${selection.barangayName}, ${selection.cityName}, Metro Manila`;
    const existing=areas.find(a=>a.name===canonicalName||(a.name===selection.name&&a.name.split(",")[0].trim()===selection.barangayName));
    if(existing){setSelectingArea(false);selectArea(existing.name);return;}
    setSelectingArea(true);
    try{
      const response=await fetch("/api/areas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({barangay:selection.barangayName,city:selection.cityName,province:"Metro Manila",lat:selection.lat,lng:selection.lng}),signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      let saved=data.area;
      if(!response.ok){if(response.status===401||response.status===403)throw new Error(data.error||"Log in with your BHW account to select a new barangay.");const refreshed=await fetch("/api/areas",{cache:"no-store"});const list=await refreshed.json();saved=list.areas?.find((a:{name:string})=>a.name===`${selection.barangayName}, ${selection.cityName}, Metro Manila`);if(!saved)throw new Error(data.error||"Could not select this barangay.");}
      setAreas(current=>current.some(a=>a.name===saved.name)?current:[...current,saved]);
      if(version===mapSelectionVersion.current)selectArea(saved.name);
    }catch(e){if(version===mapSelectionVersion.current)setToast(e instanceof Error?e.message:"Could not select barangay.");}
    finally{if(version===mapSelectionVersion.current)setSelectingArea(false);}
  }
  const selectArea=useCallback((name:string)=>{mapSelectionVersion.current++;setSelectingArea(false);setArea(name);setPatientsOpen(true);setSelected(null);setSearch("");},[]);
  useEffect(()=>{const refresh=()=>void refreshCases().then(()=>{setDbError("");setCasesLoaded(true);}).catch(e=>setDbError(e instanceof Error?e.message:"Connection unavailable."));refresh();const timer=setInterval(refresh,10000);return()=>clearInterval(timer);},[]);
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
      if(!name || !Number.isInteger(age)||age<0||age>120||!Number.isFinite(systolic)||!Number.isFinite(diastolic)||diastolic<=0||systolic<=diastolic)throw new Error("Check the name, age and blood pressure readings.");
      if(!/^\+639\d{9}$/.test(phone))throw new Error("Use a Philippine phone number like +639171234567.");
      if(loadCases().length>=500)throw new Error("The demo patient limit has been reached.");
      const at=new Date().toISOString(),barangay=String(f.get("area"));
      const measuredAt=new Date(String(f.get("bpTime"))).toISOString();
      const readings=[{systolic,diastolic,measuredAt}];
      const expanded=f.get("expanded")==="on";
      if(expanded&&age<20)throw new Error("The expanded adult assessment is for ages 20 and above. Use the basic referral for younger patients.");
      if(expanded){for(const n of [2,3]){const top=String(f.get(`systolic${n}`)||""),bottom=String(f.get(`diastolic${n}`)||"");if(n===3&&!top&&!bottom)continue;const systolic=Number(top),diastolic=Number(bottom);if(!top||!bottom||diastolic<=0||systolic<=diastolic)throw new Error(`Check BP reading ${n}.`);readings.push({systolic,diastolic,measuredAt:new Date(String(f.get(`bpTime${n}`))).toISOString()});}}
      const redFlags=Object.fromEntries(Object.keys(RED_FLAG_LABELS).map(key=>[key,String(f.get(`red_${key}`)||"Not assessed")]));
      const immediate=Object.values(redFlags).includes("Yes");
      const measurement=(name:string)=>String(f.get(name)||"").trim()?Number(f.get(name)):null;
      const assessment=expanded?{assessmentDate:new Date(String(f.get("assessmentDate"))).toISOString(),sex:f.get("sex"),civilStatus:f.get("civilStatus"),address:String(f.get("address")||""),employment:f.get("employment"),conditions:f.getAll("conditions"),conditionsAssessed:f.get("conditionsAssessed")==="on"||f.getAll("conditions").length>0,familyHistory:f.getAll("familyHistory"),familyAssessed:f.get("familyAssessed")==="on"||f.getAll("familyHistory").length>0,tobacco:f.get("tobacco"),alcohol:f.get("alcohol"),binge:f.get("binge"),exercise:f.get("exercise"),nutrition:f.get("nutrition"),heightCm:measurement("heightCm"),weightKg:measurement("weightKg"),waistCm:measurement("waistCm")}:undefined;
      const glucoseValue=String(f.get("glucose")||"").trim();
      const screening=screeningSchema.parse({chiefComplaint:String(f.get("complaint")),urgency:immediate?"Emergency":String(f.get("urgency")),redFlags,immediateAction:String(f.get("immediateAction")||""),...(assessment?{assessment}:{}),arm:String(f.get("arm")),medications:String(f.get("medications")||"Unknown").trim()||"Unknown",allergies:String(f.get("allergies")||"Unknown").trim()||"Unknown",glucose:glucoseValue?{value:Number(glucoseValue),unit:String(f.get("glucoseUnit")),context:String(f.get("glucoseContext")),measuredAt:new Date(String(f.get("glucoseTime"))).toISOString()}:null});
      const documents=await readDocuments(f.getAll("documents").filter((value):value is File=>value instanceof File && value.name!==""));
      const patient:Case={id:String(f.get("caseId")),name,age,barangay,screenedAt:at,readings,screening,history:String(f.get("history")),...(phone?{phone}:{}),referral:null,status:"awaiting_review",plan:null,outcome:null,steps:[],documents,events:[{at,actor:"BHW",text:documents.length?"Screening saved with attached documents.":"Screening saved."}]};
      await commit([routeScreening(patient,Date.now(),areas),...loadCases()]);setPatientsOpen(true);setSelected(patient.id);setCreate(false);setToast(immediate?"Red flag recorded and sent to hospital. Do not wait for this inbox; complete the immediate clinical handoff.":"Screening saved and routed to the hospital automatically.");
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
    void change(item=>{if(hasRedFlags(item))return savePlan(item,{action:String(f.get("action")),destination:HOSPITAL,due:new Date().toISOString(),bring:String(f.get("bring")),contact:String(f.get("contact"))},"Doctor");const booked=confirmAppointment(item,loadCases(),String(f.get("due")),slots,"Doctor",Date.now());return savePlan(booked,{...booked.plan!,action:String(f.get("action")),bring:String(f.get("bring")),contact:String(f.get("contact"))},"Doctor");},"Hospital instructions saved. You can now text the patient.");
  }
  function outcome(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget);
    try{const value:Outcome={kind:String(f.get("kind")) as Outcome["kind"],diagnosis:String(f.get("diagnosis")),explanation:String(f.get("explanation")),followUp:String(f.get("followUp")),followUpDue:new Date(String(f.get("followUpDue"))).toISOString()};void change(item=>recordOutcome(item,value,"Doctor"),"Results and next steps saved. The BHW can see them now.");}catch{setToast("Choose a valid return date.");}
  }
  async function generate(){
    if(!c||aiLock.current)return;aiLock.current=true;setBusy(true);const id=c.id,input=aiInput(c),source=sourceOf(c);
    try{const r=await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(20000)}),b=await r.json();if(!r.ok)throw new Error(b.error||"Writing assistant unavailable.");const draft=validateDraft(b.draft,input),current=loadCases(),target=current.find(c=>c.id===id);if(!target||sourceOf(target)!==source)throw new Error("The record changed. Try again.");await commit(current.map(c=>c.id===id?{...c,draft:{value:draft,source,approved:false,latencyMs:b.latencyMs,cached:b.cached,generationMode:b.generationMode,warning:b.warning}}:c));setToast(b.generationMode==="recorded-facts"?"Recorded-facts summary ready. AI was unavailable; check the notice beside the summary.":"AI draft ready for the doctor's review.");}catch(e){setToast(e instanceof Error?e.message:"Writing assistant unavailable.");}finally{aiLock.current=false;setBusy(false);}
  }
  const attendanceDone=c?.steps.some(s=>s.kind==="attendance"&&s.state==="confirmed");
  const assessmentDone=c?.steps.some(s=>s.kind==="assessment"&&s.state==="confirmed");
  return <div className={`staff-app ${role==="BHW"?"bhw-app":"hospital-app"}`}>
    <header className="staff-header"><strong className="staff-brand">vitality.</strong><div className="staff-user"><div><strong>{userName}</strong><small>{role==="BHW"?"BHW workspace":"Hospital workspace"}</small></div><button className="secondary" disabled={saving||uploading||busy} onClick={()=>void signOut().then(()=>{clearCases();router.replace("/login");}).catch(()=>setToast("Could not sign out. Try again."))}>Log out</button></div></header>
    <div className="demo-banner"><span>FICTIONAL DEMO</span> Simulated areas, patients and hospital appointments.<button onClick={()=>void refreshCases().catch(e=>setDbError(e instanceof Error?e.message:"Connection unavailable."))}>Refresh</button></div>
    <main className="staff-content" aria-busy={saving||uploading} inert={!!c||create||addingArea}>
      <div className="page-heading"><div><h1>{role==="BHW"?"Dashboard":"Hospital referrals"}</h1><p>{role==="BHW"?"Choose your barangay to view screened patients.":"Review patients sent to your hospital and tell them what to do next."}</p></div>{role==="BHW"&&<button className="primary" disabled={selectingArea} onClick={()=>{setSelected(null);setCreate(true);}}>+ Add patient</button>}</div>
      {dbError&&<div className="connection-warning" role="status">Patient records could not refresh. <details><summary>Connection details</summary>{dbError}</details></div>}
      {role==="BHW"?<div className={`bare-dashboard ${patientsOpen?"patients-visible":""}`}>
        <section className="panel map-panel"><div className="panel-heading"><h2>{area||"Choose or add a barangay"}</h2><span className="badge neutral">{cases.filter(c=>c.barangay===area).length} screened</span></div>{selectingArea&&<p role="status">Selecting barangay...</p>}<AreaMap savedAreas={areas} patientCounts={patientCounts} selectedBarangayId={null} onAreaSelect={selection=>void selectBoundary(selection)}/><button className="map-open-button" onClick={()=>setAddingArea(true)}>Add barangay</button><div className="area-buttons">{areas.map(a=><button key={a.name} className={a.name===area?"selected":""} onClick={()=>selectArea(a.name)}>{a.name}<span>{cases.filter(c=>c.barangay===a.name).length} patients</span></button>)}</div><button className="map-open-button" disabled={!area} onClick={()=>selectArea(area)}>View patients in this barangay</button><p className="map-note">Click a city, then a barangay. Saved areas outside Metro Manila remain available using the buttons above. Selecting a new barangay saves its name and approximate location for this demo. New screenings use the selected barangay automatically.</p></section>
        {patientsOpen&&<section className="panel patients-side"><div className="panel-heading"><h2>Patients</h2><button className="icon-button" aria-label="Close patient panel" onClick={()=>setPatientsOpen(false)}>&times;</button></div><div className="patient-tools"><input aria-label="Search patients" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or patient code..."/><div><StatusFilter value={filter} onChange={setFilter}/><button className="primary" disabled={selectingArea} onClick={()=>{setSelected(null);setCreate(true);}}>+ Add patient</button></div></div><PatientList patients={visible} selected={selected} onSelect={setSelected}/></section>}
      </div>:<section className="panel hospital-folders"><div className="panel-heading"><h2>Patients sent to your hospital</h2><span className="badge neutral">{visible.length}</span></div><div className="patient-tools"><input aria-label="Search hospital patients" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or patient code..."/><StatusFilter value={filter} onChange={setFilter}/></div>{Array.from(new Set(visible.map(c=>c.barangay))).map(name=><details className="barangay-folder" key={name} open><summary><span><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{display:"inline-block",verticalAlign:"middle",marginRight:8}}><path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"/></svg>{name}</span><span>{visible.filter(c=>c.barangay===name).length} patients</span></summary><PatientList patients={visible.filter(c=>c.barangay===name)} selected={selected} onSelect={setSelected}/></details>)}{!visible.length&&<p className="empty">No matching referrals.</p>}</section>}
      {role==="BHW"&&<AvailableTimes times={freeSlots} loading={!casesLoaded} error={!!dbError}/>}
      {!cases.length&&!dbError&&<p role="status">No patients in the database yet.</p>}
    </main>
    {c&&!create&&<PatientDialog onClose={()=>{if(!saving&&!uploading&&!busy)setSelected(null);}} name={c.name}><div className="patient-popup-content">
            {hasRedFlags(c)&&<div className="connection-warning" role="alert"><strong>Immediate-assessment flag</strong><p>Routine appointment booking is disabled. Follow the immediate clinical handoff protocol; a saved record or SMS does not confirm that help has arrived.</p></div>}
            <section className="panel"><div className="panel-heading"><div><h2 className="patient-title">{c.name}</h2><p>{c.age} years - {c.barangay} - {c.id}</p></div><span className={`badge ${c.status}`}>{status(c)}</span></div><div className="clinical-facts"><div><small>BLOOD PRESSURE</small><strong>{c.readings.map(r=>`${r.systolic}/${r.diastolic}`).join(" - ")}<span> mmHg</span></strong></div><div><small>SYMPTOMS AND HISTORY</small><p>{c.history||"No history recorded."}</p></div></div>
              {c.screening&&<div className="documents"><h3>Referral screening</h3><p><strong>Main concern:</strong> {c.screening.chiefComplaint}</p><p><strong>BHW urgency:</strong> {c.screening.urgency}</p><p>BP measured: {date(c.readings[0].measuredAt)} - {c.screening.arm} arm</p><p><strong>Glucose:</strong> {c.screening.glucose?`${c.screening.glucose.value} ${c.screening.glucose.unit} - ${c.screening.glucose.context} - ${date(c.screening.glucose.measuredAt)}`:"Not measured"}</p><p><strong>Medicines:</strong> {c.screening.medications}</p><p><strong>Allergies:</strong> {c.screening.allergies}</p><p>Referred from {c.barangay} - {date(c.referral?.sentAt||c.screenedAt)}</p></div>}
              {c.screening&&<AssessmentDetails patient={c}/>}
              {role==="BHW"?<form className="phone-form" key={`${c.id}-${c.phone||""}`} onSubmit={e=>{e.preventDefault();const phone=String(new FormData(e.currentTarget).get("phone")).trim();if(!/^\+639\d{9}$/.test(phone)){setToast("Use a number like +639171234567.");return;}void change(item=>({...item,phone}),"Phone number saved for hospital texts.");}}><label htmlFor="patient-phone">Patient phone number</label><div><input id="patient-phone" name="phone" type="tel" placeholder="+639171234567" defaultValue={c.phone||""} required/><button className="secondary" disabled={saving}>Save number</button></div></form>:<p className="patient-phone">Phone: {c.phone||"Not recorded - ask the BHW to add it."}</p>}
              <div className="documents"><h3>Documents</h3>{c.documents?.map(doc=><a className="document-link" key={doc.id} href={doc.storagePath?`/api/documents?case=${encodeURIComponent(c.id)}&document=${encodeURIComponent(doc.id)}`:doc.dataUrl} download={doc.name}>{doc.name}</a>)}{!c.documents?.length&&<p className="muted">No documents attached.</p>}{role==="BHW"&&<label className="field">Add PDF or photos (up to 3, 500 KB each)<input type="file" accept="application/pdf,image/jpeg,image/png" multiple disabled={uploading||saving} onChange={e=>{void attach(Array.from(e.target.files||[]));e.target.value="";}}/></label>}</div>

              {role==="BHW"&&isReferred(c)&&!c.plan&&<div className="plan-section"><h3>Sent to hospital</h3><p>Waiting for the hospital to review the screening and confirm the next step.</p></div>}
              {role==="BHW"&&c.status==="awaiting_review"&&!hasRedFlags(c)&&<AvailableTimes times={freeSlots} loading={!casesLoaded} error={!!dbError}/>}
              {c.plan&&<div className="plan-section"><h3>Hospital instructions</h3><div className="plan-grid"><div><small>WHAT TO DO</small><p>{c.plan.action}</p></div><div><small>WHERE TO GO</small><p>{c.plan.destination}</p></div><div><small>WHEN</small><p>{date(c.plan.due)}</p></div><div><small>WHAT TO BRING</small><p>{c.plan.bring}</p></div></div></div>}
              {c.outcome&&<div className="outcome-box"><h3>{resultLabels[c.outcome.kind]}</h3>{c.outcome.diagnosis&&<strong>{c.outcome.diagnosis}</strong>}<p>{c.outcome.explanation}</p><p><strong>Next:</strong> {c.outcome.followUp}</p><small>{date(c.outcome.followUpDue)}</small></div>}
              {c.steps.length>0&&<div className="steps"><h3>{role==="BHW"?"Patient progress":"Visit progress"}</h3>{c.steps.map((s,i)=><div className="step" key={s.id}><span className={`step-number ${s.state==="confirmed"?"done":""}`}>{s.state==="confirmed"?"\u2713":i+1}</span><div><strong>{progressLabels[s.kind]}</strong><small>{s.title}</small><small>{date(s.due)} - {s.state==="confirmed"?"Done":"Not yet confirmed"}</small></div>{s.state!=="confirmed"&&c.status!=="declined"&&(c.status!=="completed"||s.kind==="follow_up")&&((role==="Doctor")||(s.kind==="attendance"||s.kind==="follow_up"))&&<button className="secondary" disabled={saving||(s.kind==="assessment"&&!attendanceDone)||(s.kind==="communication"&&!c.outcome)} onClick={()=>void change(item=>updateStep(item,s.id,role),"Progress updated.")}>{s.kind==="attendance"?"Confirm visit":s.kind==="assessment"?"Assessment done":s.kind==="communication"?"Results explained":"Follow-up done"}</button>}</div>)}</div>}
            </section>
            {role==="Doctor"&&c.status==="awaiting_review"&&<section className="panel clinician-form"><form key={`${c.id}-plan`} onSubmit={book}><h2>Set the patient&apos;s next step</h2><p className="muted">Review the screening first. These instructions will be sent exactly as saved.</p><div className="form-grid"><label className="field">What to do<textarea name="action" defaultValue={hasRedFlags(c)?"Immediate clinical assessment required. Follow the recorded clinician handoff instructions.":"Attend hospital assessment of the recorded screening and available records."} required maxLength={500}/></label><label className="field">Hospital<input value={HOSPITAL} readOnly/></label>{hasRedFlags(c)?<p>Immediate assessment: record instructions for the clinical handoff, not a future appointment.</p>:<label className="field">Appointment (demo slots)<select name="due" required>{freeSlots.map(s=><option value={s} key={s}>{date(s)}</option>)}</select></label>}<label className="field">What to bring<textarea name="bring" defaultValue={BRING} required maxLength={500}/></label><label className="field">Who to contact<input name="contact" defaultValue={CONTACT} required maxLength={300}/></label></div><button className="primary" disabled={saving||(!hasRedFlags(c)&&!freeSlots.length)}>{saving?"Saving...":"Accept referral and save instructions"}</button>{!hasRedFlags(c)&&!freeSlots.length&&<p>No demo appointments are available.</p>}</form></section>}
            {role==="Doctor"&&c.plan&&c.status!=="declined"&&<SmsPanel key={`${c.id}-${sourceOf(c)}-${c.phone||""}`} patient={c} onAccepted={()=>setToast("Message submitted. Delivery status is shown below the send button.")}/>}
            {role==="Doctor"&&c.status==="active"&&assessmentDone&&<section className="panel clinician-form"><form onSubmit={outcome} key={`${c.id}-${c.outcome?.followUpDue||"results"}`}><h2>Record assessment results</h2><div className="form-grid"><label className="field">Result<select name="kind" defaultValue={c.outcome?.kind||"more_assessment_needed"}><option value="more_assessment_needed">More checks needed</option><option value="diagnosis_confirmed">Diagnosis confirmed</option><option value="not_confirmed">Condition not confirmed</option></select></label><label className="field">Diagnosis, if confirmed<input name="diagnosis" defaultValue={c.outcome?.diagnosis||""} maxLength={300}/></label><label className="field">Explain the result<textarea name="explanation" defaultValue={c.outcome?.explanation||""} required maxLength={1500}/></label><label className="field">Next instructions: what to do, where to go and what to bring<textarea name="followUp" defaultValue={c.outcome?.followUp||""} required maxLength={500}/></label><label className="field">Return date<input name="followUpDue" type="datetime-local" defaultValue={localInput(c.outcome?.followUpDue||c.plan!.due)} required/></label></div><button className="primary" disabled={saving}>Save results and next steps</button></form></section>}
            {role==="Doctor"&&canClose(c)&&<button className="primary" disabled={saving} onClick={()=>void change(item=>closeCase(item,"Doctor"),"Results returned. Follow-up stays visible to the BHW.")}>Finish review and return results</button>}
            {role==="Doctor"&&<details className="panel writing-help"><summary>Help write a summary</summary><div><p>Optional AI draft from the recorded facts. Check it against the original information.</p><button className="secondary" disabled={busy||saving} onClick={()=>void generate()}>{busy?"Writing...":"Draft summary"}</button>{c.draft?.source===sourceOf(c)&&<><p className="muted"><strong>{c.draft.generationMode==="recorded-facts"?"Recorded-facts template (not AI)":"Bedrock AI draft"}</strong></p>{c.draft.warning&&<p role="status" className="connection-warning">{c.draft.warning}</p>}<p>{c.draft.value.summary}</p>{c.draft.value.patientExplanation&&<p>{c.draft.value.patientExplanation}</p>}{!c.draft.approved?<button className="secondary" disabled={saving} onClick={()=>void change(item=>approveDraft(item,"Doctor"),"Summary checked.")}>Mark as checked</button>:<small>Checked by doctor</small>}</>}</div></details>}
    </div></PatientDialog>}
    {addingArea&&role==="BHW"&&<AddBarangay areas={areas} onClose={()=>setAddingArea(false)} onSaved={a=>{setAreas(current=>[...current,a]);selectArea(a.name);setAddingArea(false);setToast("Barangay saved. You can now add its patients.");}}/>}
    {create&&role==="BHW"&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-screening"><div className="panel-heading"><h2 id="new-screening">Record screening</h2><button className="icon-button" aria-label="Close" disabled={saving} onClick={()=>setCreate(false)}>&times;</button></div><ScreeningForm onSubmit={addCase} saving={saving} area={area} areas={areas}/></section></div>}
    {toast&&<div className="toast" role="status">{toast}<button aria-label="Dismiss message" onClick={()=>setToast("")}>&times;</button></div>}
  </div>;
}
function AvailableTimes({times,loading,error}:{times:string[];loading:boolean;error:boolean}){
  return <section className="panel available-times"><div className="panel-heading"><h2>Available appointment times (demo)</h2></div>{error?<p role="status">Availability could not refresh. Try refreshing before checking times.</p>:loading?<p role="status">Checking available times...</p>:times.length?<ul aria-label="Available appointment times">{times.map(slot=><li key={slot}><time dateTime={slot}>{date(slot)}</time></li>)}</ul>:<p>No available times.</p>}<p className="muted">Philippine time. The hospital confirms the booking.</p></section>;
}
function PatientList({patients,selected,onSelect}:{patients:Case[];selected:string|null;onSelect:(id:string)=>void}){
  return <div className="case-list">{patients.map(c=><button key={c.id} className={`case-row ${selected===c.id?"active-row":""}`} onClick={()=>onSelect(c.id)}><span className="avatar">{c.name.split(" ").map(n=>n[0]).join("")}</span><div><strong>{c.name}</strong><small>{c.barangay}</small><span className={`badge ${c.status}`}>{status(c)}</span></div><span className="chevron">&rsaquo;</span></button>)}{!patients.length&&<p className="empty">No patients here yet.</p>}</div>;
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
  return <div className="modal-backdrop patient-popup-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={dialog} className="patient-popup" role="dialog" aria-modal="true" aria-labelledby="patient-popup-title"><div className="patient-popup-header"><div><small>SCREENING AND PROGRESS</small><h2 id="patient-popup-title">{name}</h2></div><button ref={close} className="icon-button" aria-label="Close patient details" onClick={onClose}>&times;</button></div>{children}</section></div>;
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

function ScreeningForm({onSubmit,saving,area,areas}:{onSubmit:(e:FormEvent<HTMLFormElement>)=>void;saving:boolean;area:string;areas:{name:string;lat:number;lng:number}[]}){
 const form=useRef<HTMLFormElement>(null);const [diabetes,setDiabetes]=useState(false);const [demoFilled,setDemoFilled]=useState(false);const [expanded,setExpanded]=useState(false);
 function fill(){setDemoFilled(true);setDiabetes(true);const values:Record<string,string>={name:"Maria Demo Reyes",age:"52",phone:"+639000000000",complaint:"Request assessment of recorded blood pressure and glucose readings.",systolic:"146",diastolic:"92",arm:"Left",urgency:"Routine",medications:"Unknown",allergies:"Unknown",history:"Fictional demonstration only.",systolic2:"144",diastolic2:"90",heightCm:"160",weightKg:"64",waistCm:"82",sex:"Female",civilStatus:"Married",employment:"Self-employed",address:"Fictional demonstration address"};for(const [key,value] of Object.entries(values)){const input=form.current?.elements.namedItem(key) as HTMLInputElement|HTMLSelectElement|null;if(input)input.value=value;}}
 const [caseId]=useState(()=>`DEMO-${crypto.randomUUID().toUpperCase()}`);
 return <form ref={form} onSubmit={onSubmit}><input type="hidden" name="caseId" value={caseId}/><p className="muted">{area} &rarr; Demo City Hospital - Automatically routed when saved.</p><button type="button" className="secondary" disabled={saving} onClick={fill}>Fill demo example</button><p className="muted">The demo phone is a placeholder. Use your approved test number to demonstrate SMS.</p><RedFlagFields/><div className="form-grid">
 <label className="field">Barangay<select name="area" required defaultValue={area}><option value="" disabled>Select a saved barangay</option>{areas.map(a=><option key={a.name}>{a.name}</option>)}</select></label><label className="field">Full name<input name="name" required maxLength={100}/></label><label className="field">Age in years (under 1: enter 0)<input name="age" type="number" min={0} max={120} required/></label><label className="field">Patient / guardian phone number<input name="phone" type="tel" placeholder="+639171234567" required/></label><label className="field">Urgency (BHW selected)<select name="urgency" required defaultValue=""><option value="" disabled>Select urgency</option><option>Routine</option><option>Urgent</option><option>Emergency</option></select></label>
 <label className="field">Main concern / reason for referral<textarea name="complaint" required maxLength={500}/></label><label className="field">Blood pressure: top number<input name="systolic" type="number" min={1} required/></label><label className="field">Blood pressure: bottom number<input name="diastolic" type="number" min={1} required/></label><label className="field">BP measurement time<input name="bpTime" type="datetime-local" defaultValue={localInput(new Date().toISOString())} required/></label><label className="field">Arm used<select name="arm" required defaultValue=""><option value="" disabled>Select arm</option><option>Left</option><option>Right</option><option>Unknown</option></select></label></div>
 <label className="assessment-check"><input type="checkbox" name="expanded" checked={expanded} onChange={e=>setExpanded(e.target.checked)}/>Expanded adult assessment (20+)</label>{expanded&&<ExpandedFields/>}
 <label className="sms-consent"><input type="checkbox" checked={diabetes} onChange={e=>setDiabetes(e.target.checked)} style={{width:18,minHeight:18}}/> Add a diabetes reading</label>
 {diabetes&&<div className="form-grid"><label className="field">Blood glucose (leave blank if not measured)<input name="glucose" type="number" min={0.1} step="any" defaultValue={demoFilled?"156":undefined}/></label><label className="field">Unit<select name="glucoseUnit"><option>mg/dL</option><option>mmol/L</option></select></label><label className="field">Measurement context<select name="glucoseContext" defaultValue={demoFilled?"Random":"Unknown"}><option>Unknown</option><option>Fasting</option><option>Random</option></select></label><label className="field">Glucose measurement time<input name="glucoseTime" type="datetime-local" defaultValue={localInput(new Date().toISOString())} required/></label></div>}
 <details><summary className="form-summary">More patient information (optional)</summary><div className="form-grid"><label className="field">Current medicines<input name="medications" placeholder="Unknown" maxLength={500}/></label><label className="field">Known allergies<input name="allergies" placeholder="Unknown" maxLength={500}/></label><label className="field">Relevant medical history<textarea name="history" maxLength={2000} placeholder="Unknown"/></label></div></details>
 <label className="field">Documents (optional)<input name="documents" type="file" accept="application/pdf,image/jpeg,image/png" multiple disabled={saving}/><small>Up to 3 PDF, JPG or PNG files, 500 KB each.</small></label><p className="muted">Readings are screening findings. Urgency follows your local protocol; emergency care should not wait for this inbox.</p><button className="primary" disabled={saving}>{saving?"Saving...":"Save and route screening"}</button></form>;
}


