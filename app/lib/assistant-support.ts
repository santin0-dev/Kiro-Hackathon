import type {AiInput,AiDraft} from "./workflow";
export function bedrockConfig(env:Record<string,string|undefined>){return {region:env.AWS_BEDROCK_REGION||env.BEDROCK_REGION||env.AWS_REGION,model:env.AWS_BEDROCK_MODEL_ID||env.BEDROCK_MODEL_ID||env.BEDROCK_MODEL,enabled:(env.BEDROCK_AI_ENABLED??env.LOCAL_DEMO_AI_ENABLED)==="true"};}
export function parseModelJson(text:string):unknown{const cleaned=text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");const parsed=JSON.parse(cleaned);if(parsed&&typeof parsed==="object"&&Array.isArray(parsed.evidenceIds))parsed.evidenceIds=parsed.evidenceIds.map((id:unknown)=>id==="approvedPlan"?"plan":id);return parsed;}
// A factual template, never an AI prediction or a clinical interpretation.
export function recordedDraft(input:AiInput):AiDraft{
 const readings=input.readings.map(r=>`${r.systolic}/${r.diastolic} mmHg (${r.measuredAt})`).join("; ");
 const summary=`Recorded blood pressure: ${readings}. Recorded notes: ${input.history||"Not provided."}`.slice(0,1200);
 const plan=input.approvedPlan;
 return {summary,patientExplanation:plan?`Approved instructions: ${plan.action}. Location: ${plan.destination}. Bring: ${plan.bring}. Contact: ${plan.contact}.`.slice(0,1000):"",missingFields:input.history?[]:["Patient history not recorded"],evidenceIds:["readings",...(input.history?["history" as const]:[]),...(plan?["plan" as const]:[])]};
}
export function bedrockProblem(error:unknown):{code:string;message:string}{
 const e=error as {name?:string;message?:string};
 if(e?.message==="INVALID_OUTPUT")return {code:"invalid_output",message:"AI returned an invalid draft. Showing recorded facts instead."};
 if(e?.message==="BUSY"||e?.name==="ThrottlingException")return {code:"busy",message:"AI is busy. Showing recorded facts instead; try AI again shortly."};
 if(["AbortError","TimeoutError"].includes(e?.name||""))return {code:"timeout",message:"AI took too long. Showing recorded facts instead."};
 if(["CredentialsProviderError","UnrecognizedClientException","InvalidSignatureException","ExpiredTokenException"].includes(e?.name||""))return {code:"credentials",message:"AWS credentials are missing, invalid or expired on this server. Showing recorded facts instead."};
 if(e?.name==="AccessDeniedException")return {code:"access_denied",message:"AWS denied model access. Check bedrock:InvokeModel permission and model access. Showing recorded facts instead."};
 if(e?.name==="ValidationException"||e?.name==="ResourceNotFoundException")return {code:"model_configuration",message:"Check the Bedrock model or inference-profile ID and its region. Showing recorded facts instead."};
 return {code:"unavailable",message:"AI is unavailable. Showing recorded facts instead; saved clinical instructions remain available."};
}
