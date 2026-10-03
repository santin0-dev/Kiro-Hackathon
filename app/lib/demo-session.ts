export type DemoRole="BHW"|"Doctor";
export type DemoUser={name:string;email:string;role:DemoRole};
const accountsKey="vitality-demo-accounts-v1",sessionKey="vitality-demo-session-v1";
const builtins:DemoUser[]=[{name:"Demo BHW",email:"bhw@demo.local",role:"BHW"},{name:"Demo Hospital",email:"hospital@demo.local",role:"Doctor"}];
function valid(value:unknown):value is DemoUser{
 if(!value||typeof value!=="object")return false;
 const u=value as DemoUser;return typeof u.name==="string"&&!!u.name&&u.name.length<=100&&typeof u.email==="string"&&u.email.length<=150&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)&&(u.role==="BHW"||u.role==="Doctor");
}
export function workspace(role:DemoRole){return role==="BHW"?"/bhw":"/hospital";}
function accounts():DemoUser[]{try{const saved=JSON.parse(localStorage.getItem(accountsKey)||"[]");return [...builtins,...(Array.isArray(saved)?saved.filter(valid):[])];}catch{return builtins;}}
export function signIn(email:string):DemoUser{
 const user=accounts().find(u=>u.email===email.trim().toLowerCase());
 if(!user)throw new Error("Demo account not found. Sign up or use one of the examples below.");
 sessionStorage.setItem(sessionKey,JSON.stringify(user));return user;
}
export function signUp(name:string,email:string,role:DemoRole):DemoUser{
 const user={name:name.trim(),email:email.trim().toLowerCase(),role};
 if(!valid(user))throw new Error("Enter a name and valid demo email.");
 if(accounts().some(u=>u.email===user.email))throw new Error("This email already has a demo account. Log in instead.");
 const custom=accounts().filter(u=>!builtins.some(b=>b.email===u.email));
 if(custom.length>=100)throw new Error("Demo account limit reached.");
 localStorage.setItem(accountsKey,JSON.stringify([...custom,user]));sessionStorage.setItem(sessionKey,JSON.stringify(user));return user;
}
export function currentUser():DemoUser|null{try{const u=JSON.parse(sessionStorage.getItem(sessionKey)||"null");return valid(u)?u:null;}catch{return null;}}
export function signOut(){sessionStorage.removeItem(sessionKey);}
