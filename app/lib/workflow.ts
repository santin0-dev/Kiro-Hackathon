import { z } from "zod";

export type Role = "BHW" | "Doctor" | "Patient" | "Supervisor";
export type StepKind = "attendance" | "assessment" | "communication" | "follow_up";
export type Step = { id: string; kind: StepKind; title: string; owner: string; due: string; state: "pending" | "reported" | "confirmed"; confirmedBy?: Role };
export type Plan = { action: string; destination: string; due: string; bring: string; contact: string };
export type Outcome = { kind: "diagnosis_confirmed" | "not_confirmed" | "more_assessment_needed"; diagnosis: string; explanation: string; followUp: string; followUpDue: string };
export type AiDraft = { summary: string; patientExplanation: string; missingFields: string[]; evidenceIds: string[] };
export type Case = {
  id: string; name: string; age: number; barangay: string; screenedAt: string;
  readings: { systolic: number; diastolic: number; measuredAt: string }[];
  history: string; status: "awaiting_review" | "active" | "completed" | "declined";
  plan: Plan | null; outcome: Outcome | null; steps: Step[];
  events: { at: string; actor: Role; text: string }[];
  documents?: { id: string; name: string; mime: "application/pdf" | "image/jpeg" | "image/png"; dataUrl?: string; storagePath?: string; addedAt: string }[];
  draft?: { value: AiDraft; source: string; approved: boolean; latencyMs: number; cached: boolean };
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
  id: z.string().min(1), name: z.string().min(1).max(100), age: z.number().int().min(18).max(120), barangay: z.string().min(1), screenedAt: z.string().datetime({ offset: true }),
  readings: aiInputSchema.shape.readings, history: boundedText, status: z.enum(["awaiting_review", "active", "completed", "declined"]), plan: planSchema.nullable(), outcome: aiInputSchema.shape.outcome,
  steps: z.array(z.object({ id: z.string(), kind: z.enum(["attendance","assessment","communication","follow_up"]), title: z.string(), owner: z.string(), due: z.string().datetime({ offset: true }), state: z.enum(["pending","reported","confirmed"]), confirmedBy: z.enum(["BHW","Doctor","Patient","Supervisor"]).optional() })),
  events: z.array(z.object({ at: z.string().datetime({ offset: true }), actor: z.enum(["BHW","Doctor","Patient","Supervisor"]), text: z.string() })),
  documents: z.array(z.object({ id: z.string(), name: z.string().max(200), mime: z.enum(["application/pdf","image/jpeg","image/png"]), dataUrl: z.string().max(700000).regex(/^data:(application\/pdf|image\/(jpeg|png));base64,[A-Za-z0-9+/=]+$/).optional(), storagePath: z.string().max(250).regex(/^[A-Za-z0-9/-]+$/).optional(), addedAt: z.string().datetime({offset:true}) }).strict().refine(d => !!d.dataUrl !== !!d.storagePath)).max(3).optional(),
  draft: z.object({ value: aiDraftSchema, source: z.string(), approved: z.boolean(), latencyMs: z.number(), cached: z.boolean() }).optional(),
});
export function parseSavedCases(value: unknown): Case[] | null { const result = z.array(persistedCaseSchema).min(1).max(500).safeParse(value); return result.success ? result.data : null; }

export function aiInput(c: Case): AiInput { return { demo: true, readings: c.readings, history: c.history, approvedPlan: c.plan, outcome: c.outcome }; }
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
    if (i > 0) c = savePlan(c, { action: "Clinic assessment of the recorded screening findings", destination: "Demo RHU — consultation desk", due, bring: "Referral code and any available previous records. No other preparation specified.", contact: "Ask your assigned BHW to confirm the clinic schedule.", }, "Doctor");
    if (i === 2) c = updateStep(c, `${c.id}-attendance`, "Patient", true);
    if (i === 3) { c = updateStep(c, `${c.id}-assessment`, "Doctor"); c = recordOutcome(c, { kind: "more_assessment_needed", diagnosis: "", explanation: "Fictional clinician: assessment is not yet conclusive.", followUp: "Arrange further assessment with the clinic; confirm the required details.", followUpDue: due }, "Doctor"); }
    if (i === 4) { for (const s of c.steps.filter(s => s.kind !== "communication")) c = updateStep(c, s.id, "Doctor"); c = recordOutcome(c, { kind: "diagnosis_confirmed", diagnosis: "Hypertension — fictional clinician-entered outcome", explanation: "This is a simulated clinical outcome, not a diagnosis produced by the app.", followUp: "Contact the BHW to coordinate the clinician's ongoing follow-up plan.", followUpDue: due }, "Doctor"); c = updateStep(c, `${c.id}-communication`, "Doctor"); c = closeCase(c, "Doctor"); }
    if (i === 5) c = declineCase(c, "Doctor", "Fictional patient declined the next assessment; reason documented for demonstration.");
    return c;
  });
}


export const HOSPITAL = "Demo City Hospital — outpatient assessment desk";
export const BRING = "Referral code and available previous medical records. No fasting or other preparation has been specified. Contact the hospital before attending if you need clarification.";
export const CONTACT = "Simulated hospital desk: coordinate through your BHW. This is not a real booking.";
export function referralFixtures(): Case[] {
  return fixtures().slice(0,5).map((c,i) => ({...c,barangay:i%2 ? "Demo Malaya" : "Demo Mabini",status:"awaiting_review",plan:null,outcome:null,steps:[],documents:[],draft:undefined,events:c.events.slice(0,1)}));
}
// Fixed Manila business hours for the next day. These are illustrative slots,
// not fetched from a hospital scheduler. Slot availability is browser-local.
export function demoSlots(now = Date.now()): string[] {
  const localDay = new Date(now + 8*3600000).toISOString().slice(0,10);
  const tomorrow = new Date(Date.parse(`${localDay}T00:00:00+08:00`) + 86400000);
  const day = new Date(tomorrow.getTime() + 8*3600000).toISOString().slice(0,10);
  return [9,10,11,13,14].map(hour => new Date(`${day}T${String(hour).padStart(2,"0")}:00:00+08:00`).toISOString());
}
export function availableSlots(cases:Case[], slots:string[], now = Date.now()):string[] {
  const booked = new Set(cases.filter(c => c.plan?.destination === HOSPITAL && ["active","completed"].includes(c.status)).map(c => c.plan!.due));
  return slots.filter(slot => Date.parse(slot)>now && !booked.has(slot));
}
export function confirmAppointment(c:Case,cases:Case[],slot:string,slots:string[],role:Role,now=Date.now()):Case {
  if (role !== "Doctor") throw new Error("Hospital staff must accept the referral and confirm the slot.");
  if (c.status !== "awaiting_review" || c.plan) throw new Error("This referral is already handled.");
  if (!slots.includes(slot) || !availableSlots(cases,slots,now).includes(slot)) throw new Error("That slot is no longer available. Choose another.");
  const accepted = savePlan(c,{action:"Attend hospital assessment of the submitted screening and available records",destination:HOSPITAL,due:slot,bring:BRING,contact:CONTACT},role);
  return {...accepted,events:[...accepted.events,{at:new Date(now).toISOString(),actor:role,text:"Demo hospital accepted the referral and confirmed an illustrative appointment."}]};
}
