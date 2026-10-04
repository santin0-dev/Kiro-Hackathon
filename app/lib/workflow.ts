import { z } from "zod";

export type Role = "BHW" | "Doctor" | "Patient" | "Supervisor";
export type StepKind = "attendance" | "assessment" | "communication" | "follow_up";
export type Step = { id: string; kind: StepKind; title: string; owner: string; due: string; state: "pending" | "reported" | "confirmed"; confirmedBy?: Role };
export type Plan = { action: string; destination: string; due: string; bring: string; contact: string };
export type Outcome = { kind: "diagnosis_confirmed" | "not_confirmed" | "more_assessment_needed"; diagnosis: string; explanation: string; followUp: string; followUpDue: string };
export type AiDraft = { summary: string; patientExplanation: string; missingFields: string[]; evidenceIds: string[] };
export const RED_FLAG_LABELS={chestPain:"Chest pain",breathing:"Difficulty breathing",unconscious:"Loss of consciousness",speech:"Difficulty speaking / slurred speech",face:"Facial asymmetry",weakness:"Sudden one-sided weakness / numbness"} as const;
const answer=z.enum(["Yes","No","Not assessed"]);
export const assessmentSchema=z.object({
 assessmentDate:z.string().datetime({offset:true}),sex:z.enum(["Male","Female","Not recorded"]),civilStatus:z.enum(["Single","Married","Widowed","Other","Not recorded"]),address:z.string().trim().max(500),employment:z.enum(["Employed","Self-employed","Unemployed","Retired","Not recorded"]),
 conditions:z.array(z.enum(["Hypertension","Diabetes","Asthma","Cancer","Kidney disease"])).max(5),conditionsAssessed:z.boolean(),familyHistory:z.array(z.enum(["Stroke","Heart attack","Diabetes","Hypertension","Kidney disease"])).max(5),familyAssessed:z.boolean(),
 tobacco:z.enum(["Never used","Secondhand smoke exposure","Former smoker","Current smoker","Not assessed"]),alcohol:answer,binge:answer,exercise:answer,nutrition:answer,
 heightCm:z.number().positive().max(300).nullable(),weightKg:z.number().positive().max(700).nullable(),waistCm:z.number().positive().max(400).nullable()
}).strict();
const redFlagsSchema=z.object({chestPain:answer,breathing:answer,unconscious:answer,speech:answer,face:answer,weakness:answer}).strict();
export const screeningSchema=z.object({chiefComplaint:z.string().trim().min(1).max(500),urgency:z.enum(["Routine","Urgent","Emergency"]),arm:z.enum(["Left","Right","Unknown"]),medications:z.string().max(500),allergies:z.string().max(500),redFlags:redFlagsSchema.optional(),immediateAction:z.string().trim().max(500).optional(),assessment:assessmentSchema.optional(),glucose:z.object({value:z.number().positive(),unit:z.enum(["mg/dL","mmol/L"]),context:z.enum(["Fasting","Random","Unknown"]),measuredAt:z.string().datetime({offset:true})}).strict().nullable()}).strict().superRefine((value,ctx)=>{if(value.redFlags&&Object.values(value.redFlags).includes("Yes")){if(value.urgency!=="Emergency")ctx.addIssue({code:"custom",message:"Red flags require immediate assessment priority.",path:["urgency"]});if(!value.immediateAction?.trim())ctx.addIssue({code:"custom",message:"Record the immediate handoff action.",path:["immediateAction"]});}});
export type Screening=z.infer<typeof screeningSchema>;
export function hasRedFlags(c:Case):boolean{return !!c.screening?.redFlags&&Object.values(c.screening.redFlags).includes("Yes");}
export function waistAboveReference(c:Case):boolean|null{const a=c.screening?.assessment;if(!a?.waistCm||a.sex==="Not recorded")return null;return a.waistCm>(a.sex==="Male"?90:80);}
export function screeningMetrics(c:Case){const a=c.screening?.assessment;return {bpCount:c.readings.length,systolic:Math.round(c.readings.reduce((sum,r)=>sum+r.systolic,0)/c.readings.length),diastolic:Math.round(c.readings.reduce((sum,r)=>sum+r.diastolic,0)/c.readings.length),bmi:a?.heightCm&&a.weightKg?Math.round(a.weightKg/(a.heightCm/100)**2*10)/10:null};}

export type Case = {
  id: string; name: string; age: number; barangay: string; screenedAt: string;
  readings: { systolic: number; diastolic: number; measuredAt: string }[];
  screening?: Screening;
  phone?: string; referral?: { hospitalId: string; sentAt: string } | null;
  history: string; status: "awaiting_review" | "active" | "completed" | "declined";
  plan: Plan | null; outcome: Outcome | null; steps: Step[];
  events: { at: string; actor: Role; text: string }[];
  documents?: { id: string; name: string; mime: "application/pdf" | "image/jpeg" | "image/png"; dataUrl?: string; storagePath?: string; addedAt: string }[];
  draft?: { value: AiDraft; source: string; approved: boolean; latencyMs: number; cached: boolean; generationMode?: "bedrock" | "recorded-facts"; warning?: string };
};

const boundedText = z.string().trim().max(2000);
export const planSchema = z.object({ action: boundedText.min(1), destination: boundedText.min(1), due: z.string().datetime({ offset: true }), bring: boundedText.min(1), contact: boundedText.min(1) }).strict();
export const aiInputSchema = z.object({
  demo: z.literal(true),
  readings: z.array(z.object({ systolic: z.number().positive(), diastolic: z.number().positive(), measuredAt: z.string().datetime({ offset: true }) }).strict().refine(r => r.diastolic < r.systolic)).min(1).max(5),
  history: boundedText,
  approvedPlan: planSchema.nullable(),
  outcome: z.object({ kind: z.enum(["diagnosis_confirmed", "not_confirmed", "more_assessment_needed"]), diagnosis: boundedText, explanation: boundedText, followUp: boundedText, followUpDue: z.string().datetime({ offset: true }) }).strict().nullable(),
}).strict();
export type AiInput = z.infer<typeof aiInputSchema>;
export const aiDraftSchema = z.object({ summary: z.string().min(1).max(1200), patientExplanation: z.string().max(1000), missingFields: z.array(z.string().max(150)).max(6), evidenceIds: z.array(z.enum(["readings", "history", "plan", "outcome"])).max(4) }).strict();
const persistedCaseSchema = z.object({
  id: z.string().min(1), name: z.string().min(1).max(100), age: z.number().int().min(0).max(120), barangay: z.string().min(1), screenedAt: z.string().datetime({ offset: true }),
  screening: screeningSchema.optional(),
  phone: z.string().regex(/^\+639\d{9}$/).optional(), referral: z.object({hospitalId:z.literal("demo-city-hospital"),sentAt:z.string().datetime({offset:true})}).strict().nullable().optional(),
  readings: aiInputSchema.shape.readings, history: boundedText, status: z.enum(["awaiting_review", "active", "completed", "declined"]), plan: planSchema.nullable(), outcome: aiInputSchema.shape.outcome,
  steps: z.array(z.object({ id: z.string(), kind: z.enum(["attendance","assessment","communication","follow_up"]), title: z.string(), owner: z.string(), due: z.string().datetime({ offset: true }), state: z.enum(["pending","reported","confirmed"]), confirmedBy: z.enum(["BHW","Doctor","Patient","Supervisor"]).optional() })),
  events: z.array(z.object({ at: z.string().datetime({ offset: true }), actor: z.enum(["BHW","Doctor","Patient","Supervisor"]), text: z.string() })),
  documents: z.array(z.object({ id: z.string(), name: z.string().max(200), mime: z.enum(["application/pdf","image/jpeg","image/png"]), dataUrl: z.string().max(700000).regex(/^data:(application\/pdf|image\/(jpeg|png));base64,[A-Za-z0-9+/=]+$/).optional(), storagePath: z.string().max(250).regex(/^[A-Za-z0-9/-]+$/).optional(), addedAt: z.string().datetime({offset:true}) }).strict().refine(d => !!d.dataUrl !== !!d.storagePath)).max(3).optional(),
  draft: z.object({ value: aiDraftSchema, source: z.string(), approved: z.boolean(), latencyMs: z.number(), cached: z.boolean(), generationMode:z.enum(["bedrock","recorded-facts"]).optional(),warning:z.string().max(500).optional() }).optional(),
});
export function parseSavedCases(value: unknown): Case[] | null { const result = z.array(persistedCaseSchema.refine(c=>!c.screening?.assessment||(c.age>=20&&c.readings.length>=2),"Adult expanded assessment requires age 20+ and at least two BP readings.")).min(1).max(500).safeParse(value); return result.success ? result.data : null; }

export function aiInput(c:Case):AiInput{const a=c.screening?.assessment,s=c.screening;const facts=s?[`Main concern: ${s.chiefComplaint}`,`BHW urgency: ${s.urgency}`,`Red flags: ${s.redFlags?JSON.stringify(s.redFlags):"Not assessed"}`,`Immediate handoff: ${s.immediateAction||"Not recorded"}`,a?`Adult assessment: ${JSON.stringify({sex:a.sex,conditions:a.conditionsAssessed?a.conditions:"Not assessed",family:a.familyAssessed?a.familyHistory:"Not assessed",tobacco:a.tobacco,alcohol:a.alcohol,binge:a.binge,exercise:a.exercise,nutrition:a.nutrition,heightCm:a.heightCm,weightKg:a.weightKg,waistCm:a.waistCm,bmi:screeningMetrics(c).bmi})}`:"",`Glucose: ${s.glucose?JSON.stringify(s.glucose):"Not measured"}`,`Medicines: ${s.medications}`,`Allergies: ${s.allergies}`,`History: ${c.history}`].filter(Boolean).join("\n"):c.history;return {demo:true,readings:c.readings,history:facts.slice(0,2000),approvedPlan:c.plan,outcome:c.outcome};}
export function sourceOf(c: Case): string { return JSON.stringify(aiInput(c)); }
export function validateDraft(value: unknown, input: AiInput): AiDraft {
  const draft = aiDraftSchema.parse(value);
  if ((!input.approvedPlan && draft.evidenceIds.includes("plan")) || (!input.outcome && draft.evidenceIds.includes("outcome"))) throw new Error("The AI cited information that was not provided.");
  if (!input.approvedPlan && draft.patientExplanation) throw new Error("Patient wording requires an approved plan.");
  return draft;
}
function requireDoctor(role: Role) { if (role !== "Doctor") throw new Error("Only the clinician can make this change."); }
function event(c: Case, role: Role, text: string): Case { return { ...c, events: [...c.events, { at: new Date().toISOString(), actor: role, text }] }; }

export function savePlan(c: Case, plan: Plan, role: Role): Case {
  requireDoctor(role);
  if (c.status === "completed" || c.status === "declined") throw new Error("This episode is closed.");
  const p = planSchema.parse(plan);
  const existingFollowups = c.steps.filter(s => s.kind === "follow_up");
  const steps: Step[] = [
    { id: `${c.id}-attendance`, kind: "attendance", title: "Attend the planned consultation", owner: "BHW / clinic staff", due: p.due, state: "pending" },
    { id: `${c.id}-assessment`, kind: "assessment", title: p.action, owner: "Assigned doctor", due: p.due, state: "pending" },
    { id: `${c.id}-communication`, kind: "communication", title: "Explain the assessment outcome and care plan", owner: "Assigned doctor", due: p.due, state: "pending" }, ...existingFollowups,
  ];
  return event({ ...c, status: "active", plan: p, outcome: null, steps, draft: undefined }, role, "Clinician approved an assessment plan; tasks were created automatically.");
}
export function updateStep(c: Case, id: string, role: Role, report = false): Case {
  const step = c.steps.find(s => s.id === id);
  if (!step) throw new Error("Task not found.");
  if (c.status === "declined" || (c.status === "completed" && step.kind !== "follow_up")) throw new Error("This episode is closed.");
  if (report) { if (role !== "Patient" || step.kind !== "attendance") throw new Error("Only attendance may be patient-reported."); }
  else if (role !== "Doctor" && !(role === "BHW" && (step.kind === "attendance" || step.kind === "follow_up"))) throw new Error("This task needs clinician confirmation.");
  if (step.kind === "communication" && !c.outcome) throw new Error("Record a clinical outcome before confirming communication.");
  if (step.state === "confirmed") return c;
  return event({ ...c, steps: c.steps.map(s => s.id === id ? { ...s, state: report ? "reported" : "confirmed", confirmedBy: report ? undefined : role } : s) }, role, report ? "Patient reported attendance; staff confirmation is still needed." : `Confirmed: ${step.title}`);
}
export function recordOutcome(c: Case, outcome: Outcome, role: Role): Case {
  requireDoctor(role);
  if (c.status !== "active") throw new Error("Review the case and approve an assessment plan first.");
  if (!outcome.explanation.trim() || !outcome.followUp.trim()) throw new Error("Explanation and next/follow-up plan are required.");
  if (!Number.isFinite(Date.parse(outcome.followUpDue))) throw new Error("Choose the next assessment/follow-up date.");
  if (outcome.kind === "diagnosis_confirmed" && !outcome.diagnosis.trim()) throw new Error("Enter the clinician's diagnosis.");
  if (outcome.kind !== "more_assessment_needed" && !c.steps.some(s => s.kind === "assessment" && s.state === "confirmed")) throw new Error("Confirm assessment before recording a final outcome.");
  let steps = c.steps.map(s => s.kind === "communication" ? { ...s, state: "pending" as const, confirmedBy: undefined } : s);
  if (outcome.kind === "more_assessment_needed") {
    steps = steps.map(s => s.kind === "assessment" ? { ...s, state: "pending" as const, title: outcome.followUp, due: outcome.followUpDue, confirmedBy: undefined } : s);
  } else {
    if (steps.some(s => s.kind === "follow_up")) steps = steps.map(s => s.kind === "follow_up" ? { ...s, title: outcome.followUp, due: outcome.followUpDue, state: "pending" as const, confirmedBy: undefined } : s);
    else steps.push({ id: `${c.id}-followup`, kind: "follow_up", title: outcome.followUp, owner: "BHW / clinic staff", due: outcome.followUpDue, state: "pending" });
  }
  return event({ ...c, outcome, steps, draft: undefined }, role, `Clinical outcome recorded: ${outcome.kind.replaceAll("_", " ")}. ${outcome.explanation}`);
}
export function canClose(c: Case): boolean { return c.status === "active" && !!c.outcome && c.outcome.kind !== "more_assessment_needed" && c.steps.filter(s => s.kind !== "follow_up").every(s => s.state === "confirmed"); }
export function closeCase(c: Case, role: Role): Case { requireDoctor(role); if (!canClose(c)) throw new Error("Confirm the required steps, final outcome, and outcome communication before closing."); return event({ ...c, status: "completed" }, role, "Assessment episode completed. Ongoing follow-up remains visible."); }
export function approveDraft(c: Case, role: Role): Case { requireDoctor(role); if (!c.draft || c.draft.source !== sourceOf(c)) throw new Error("The source changed. Generate a fresh draft."); return event({ ...c, draft: { ...c.draft, approved: true } }, role, "Clinician reviewed the AI wording against the original plan."); }
export function declineCase(c: Case, role: Role, reason: string): Case { requireDoctor(role); if (c.status === "completed" || c.status === "declined") throw new Error("Episode already closed."); if (!reason.trim()) throw new Error("Record the reason."); return event({ ...c, status: "declined" }, role, `Further care declined: ${reason}`); }

export function summarize(cases: Case[], now = Date.now()) {
  const areas = new Map<string, { name: string; total: number; completed: number; outstanding: number; awaiting: number; overdue: number }>();
  let overdue = 0, openTasks = 0;
  for (const c of cases) {
    const area = areas.get(c.barangay) ?? { name: c.barangay, total: 0, completed: 0, outstanding: 0, awaiting: 0, overdue: 0 };
    area.total++; if (c.status === "completed") area.completed++; if (c.status === "awaiting_review") area.awaiting++; if (["awaiting_review","active"].includes(c.status)) area.outstanding++;
    if (c.status !== "declined") for (const s of c.steps) if (s.state !== "confirmed") { openTasks++; if (Date.parse(s.due) < now) { overdue++; area.overdue++; } }
    areas.set(c.barangay, area);
  }
  return { total: cases.length, awaiting: cases.filter(c => c.status === "awaiting_review").length, completed: cases.filter(c => c.status === "completed").length, openTasks, overdue, areas: [...areas.values()] };
}
export function fixtures(): Case[] {
  const now = new Date(); const due = new Date(now.getTime() + 86400000).toISOString();
  const names = ["Elena Reyes", "Miguel Santos", "Luz Mendoza", "Ramon Cruz", "Ana Garcia", "Paolo Ramos"];
  return names.map((name, i) => {
    let c: Case = { id: `DEMO-${String(i + 1).padStart(3, "0")}`, name, age: 42 + i * 3, barangay: ["Demo Mabini", "Demo Malaya", "Demo Pag-asa"][i % 3], screenedAt: now.toISOString(), readings: [{ systolic: 142 + i * 2, diastolic: 88 + i, measuredAt: now.toISOString() }], history: "Fictional screening encounter. No diagnosis has been made from these readings.", status: "awaiting_review", plan: null, outcome: null, steps: [], events: [{ at: now.toISOString(), actor: "BHW", text: "Fictional screening submitted for clinician review." }] };
    if (i > 0) c = savePlan(c, { action: "Clinic assessment of the recorded screening findings", destination: "Demo RHU \u2014 consultation desk", due, bring: "Referral code and any available previous records. No other preparation specified.", contact: "Ask your assigned BHW to confirm the clinic schedule.", }, "Doctor");
    if (i === 2) c = updateStep(c, `${c.id}-attendance`, "Patient", true);
    if (i === 3) { c = updateStep(c, `${c.id}-assessment`, "Doctor"); c = recordOutcome(c, { kind: "more_assessment_needed", diagnosis: "", explanation: "Fictional clinician: assessment is not yet conclusive.", followUp: "Arrange further assessment with the clinic; confirm the required details.", followUpDue: due }, "Doctor"); }
    if (i === 4) { for (const s of c.steps.filter(s => s.kind !== "communication")) c = updateStep(c, s.id, "Doctor"); c = recordOutcome(c, { kind: "diagnosis_confirmed", diagnosis: "Hypertension \u2014 fictional clinician-entered outcome", explanation: "This is a simulated clinical outcome, not a diagnosis produced by the app.", followUp: "Contact the BHW to coordinate the clinician's ongoing follow-up plan.", followUpDue: due }, "Doctor"); c = updateStep(c, `${c.id}-communication`, "Doctor"); c = closeCase(c, "Doctor"); }
    if (i === 5) c = declineCase(c, "Doctor", "Fictional patient declined the next assessment; reason documented for demonstration.");
    return c;
  });
}


export const HOSPITAL = "Demo City Hospital \u2014 outpatient assessment desk";
export const BRING = "Referral code and available previous medical records. No fasting or other preparation has been specified. Contact the hospital before attending if you need clarification.";
export const CONTACT = "Simulated hospital desk: coordinate through your BHW. This is not a real booking.";
export const DEMO_BARANGAY="Demo Mabini";
export const DEMO_AREAS=[{name:"Demo Mabini",lat:14.60,lng:121.01},{name:"Demo Malaya",lat:14.61,lng:121.03},{name:"Demo Pag-asa",lat:14.62,lng:121.005}];
export function referralFixtures(): Case[] {
  const base=fixtures().slice(0,5);
  const names=["Carlo Demo Santos","Nina Demo Cruz","Jose Demo Ramos","Rosa Demo Lim","Luis Demo Tan","Mila Demo Perez","Leo Demo Garcia","Dina Demo Flores","Ben Demo Torres","Cora Demo Reyes"];
  const extra=names.map((name,i)=>({...base[0],id:`DEMO-${String(i+6).padStart(3,"0")}`,name,age:i===0?12:i===1?17:30+i*4,readings:[{systolic:120+i,diastolic:75+i,measuredAt:base[0].screenedAt}]}));
  return [...base,...extra].map((c,i)=>routeScreening({...c,barangay:DEMO_AREAS[i%DEMO_AREAS.length].name,status:"awaiting_review",referral:null,plan:null,outcome:null,steps:[],documents:[],draft:undefined,events:[{at:c.screenedAt,actor:"BHW",text:"Fictional screening saved."}]}));
}
// Fixed Manila business hours for the next day. These are illustrative slots,
// not fetched from a hospital scheduler. Slot availability is checked against shared database cases; the database is authoritative.
export function demoSlots(now = Date.now(), days = 1): string[] {
  const localDay = new Date(now + 8*3600000).toISOString().slice(0,10);
  const tomorrow = new Date(Date.parse(`${localDay}T00:00:00+08:00`) + 86400000);
  const day = new Date(tomorrow.getTime() + 8*3600000).toISOString().slice(0,10);
  return Array.from({length:Math.max(1,Math.min(7,Math.floor(days)))},(_,i)=>{const next=new Date(Date.parse(`${day}T00:00:00+08:00`)+i*86400000+8*3600000).toISOString().slice(0,10);return [9,10,11,13,14].map(hour=>new Date(`${next}T${String(hour).padStart(2,"0")}:00:00+08:00`).toISOString());}).flat();
}
export function availableSlots(cases:Case[], slots:string[], now = Date.now()):string[] {
  // The database enforces one slot per timestamp across this demo inbox.
  // Display labels and equivalent timezone strings must not change availability.
  const booked = new Set(cases.filter(c => c.plan && ["active","completed"].includes(c.status)).map(c => Date.parse(c.plan!.due)));
  return slots.filter(slot => Date.parse(slot)>now && !booked.has(Date.parse(slot)));
}
export function confirmAppointment(c:Case,cases:Case[],slot:string,slots:string[],role:Role,now=Date.now()):Case {
  if (role !== "Doctor") throw new Error("Hospital staff must accept the referral and confirm the slot.");
  if(hasRedFlags(c))throw new Error("Red flags need immediate clinical assessment, not a routine appointment.");
  if (!isReferred(c)) throw new Error("The BHW must send this screening first.");
  if (c.status !== "awaiting_review" || c.plan) throw new Error("This referral is already handled.");
  if (!slots.includes(slot) || !availableSlots(cases,slots,now).includes(slot)) throw new Error("That slot is no longer available. Choose another.");
  const accepted = savePlan(c,{action:"Attend hospital assessment of the submitted screening and available records",destination:HOSPITAL,due:slot,bring:BRING,contact:CONTACT},role);
  return {...accepted,events:[...accepted.events,{at:new Date(now).toISOString(),actor:role,text:"Demo hospital accepted the referral and confirmed an illustrative appointment."}]};
}

// Older records were submitted automatically. Keep those referrals visible;
// explicit null denotes a locally saved screening that has not been referred.
export function isReferred(c:Case):boolean { return c.referral !== null; }
export function hospitalCases(cases:Case[]):Case[] { return cases.filter(c=>isReferred(c) && (!c.referral || c.referral.hospitalId === "demo-city-hospital")); }
export function referCase(c:Case,role:Role,now=Date.now()):Case {
  if(role !== "BHW")throw new Error("Only the BHW can send a screening.");
  if(isReferred(c) || c.status !== "awaiting_review")throw new Error("This screening has already been referred.");
  return event({...c,referral:{hospitalId:"demo-city-hospital",sentAt:new Date(now).toISOString()}},role,"Screening and documents referred to Demo City Hospital.");
}

// Deterministic assignment to the configured demo receiving hospital.
// This does not search for hospital capacity or confirm an appointment.
export function routeScreening(c:Case,now=Date.now(),areas:ReadonlyArray<{name:string}>=DEMO_AREAS):Case {
  if(!areas.some(a=>a.name===c.barangay))throw new Error("No receiving hospital configured for this barangay.");
  if(c.referral)return c;
  return event({...c,referral:{hospitalId:"demo-city-hospital",sentAt:new Date(now).toISOString()}},"BHW",hasRedFlags(c)?"Immediate-assessment flag sent to Demo City Hospital. Digital routing does not confirm an emergency handoff.":"Screening automatically routed to Demo City Hospital.");
}
