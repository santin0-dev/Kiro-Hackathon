"use client";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useState} from "react";
import type {FormEvent} from "react";
import {signIn,signUp,workspace,type DemoRole} from "../lib/demo-session";
export default function AuthForm({signup=false}:{signup?:boolean}){
 const router=useRouter();
 const [email,setEmail]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setError("");setBusy(true);const f=new FormData(e.currentTarget);
  try{const u=signup?signUp(String(f.get("name")),email,String(f.get("role")) as DemoRole):signIn(email);router.replace(workspace(u.role));}
  catch(e){setError(e instanceof Error?e.message:"Demo sign-in unavailable. Check browser storage.");setBusy(false);}
 }
 return <main className="auth-page"><section className="auth-card"><Link href="/login" className="staff-brand">vitality.</Link><span className="badge neutral">DEMO ACCOUNTS</span><h1>{signup?"Create your workspace account":"Welcome back"}</h1><p>{signup?"Choose your BHW or hospital workspace.":"Log in to your BHW or hospital workspace."}</p><form onSubmit={submit}>{signup&&<label className="field">Full name<input name="name" required maxLength={100} autoComplete="name"/></label>}<label className="field">Demo email<input name="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="bhw@demo.local" required maxLength={150} autoComplete="email"/></label>{signup&&<label className="field">Workspace<select name="role"><option value="BHW">Barangay Health Worker</option><option value="Doctor">Hospital</option></select></label>}{error&&<p className="auth-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?"Opening workspace...":signup?"Create demo account":"Log in"}</button></form>{!signup&&<div className="demo-account-options"><p>Use a ready-made account:</p><button className="secondary" onClick={()=>{setEmail("bhw@demo.local");setError("");}}>BHW · bhw@demo.local</button><button className="secondary" onClick={()=>{setEmail("hospital@demo.local");setError("");}}>Hospital · hospital@demo.local</button></div>}<p className="auth-switch">{signup?"Already have an account?":"Need an account?"} <Link href={signup?"/login":"/signup"}>{signup?"Log in":"Sign up"}</Link></p><small>Demo only. No password or email verification. Use fictional details; accounts are saved in this browser.</small></section></main>;
}
