export type DemoRole="BHW"|"Doctor";
export type DemoUser={id?:string;name:string;email:string;role:DemoRole};
export function workspace(role:DemoRole){return role==="BHW"?"/bhw":"/hospital";}
function valid(value:unknown):value is DemoUser{if(!value||typeof value!=="object")return false;const u=value as DemoUser;return typeof u.name==="string"&&typeof u.email==="string"&&(u.role==="BHW"||u.role==="Doctor");}
async function request(method:string,body?:unknown){const r=await fetch("/api/demo-session",{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw new Error(data.error||"Authentication unavailable.");return data;}
export async function signIn(email:string,password:string):Promise<DemoUser>{const data=await request("POST",{action:"login",email:email.trim().toLowerCase(),password});if(!valid(data.user))throw new Error("Invalid staff response.");return data.user;}
export async function signUp(name:string,email:string,role:DemoRole,password:string):Promise<string>{const data=await request("POST",{action:"signup",name:name.trim(),email:email.trim().toLowerCase(),role,password});return data.message;}
export async function currentUser():Promise<DemoUser|null>{const data=await request("GET");return valid(data.user)?data.user:null;}
export async function signOut():Promise<void>{await request("DELETE");}
