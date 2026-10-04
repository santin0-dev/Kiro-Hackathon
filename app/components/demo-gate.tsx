"use client";
import {useRouter} from "next/navigation";
import {useEffect,useRef,useState} from "react";
import {currentUser,workspace,type DemoUser,type DemoRole} from "../lib/demo-session";
import {clearCases} from "../lib/case-store";
import StaffDashboard from "./staff-dashboard";
export default function DemoGate({role}:{role:DemoRole}){
 const router=useRouter(),[user,setUser]=useState<DemoUser|null>(null),[error,setError]=useState("");const verified=useRef<DemoUser|null>(null);
 useEffect(()=>{
  let cancelled=false,running=false;
  async function verify(){
   if(cancelled||running)return;running=true;
   try{const u=await currentUser();if(cancelled)return;
    if(!u){verified.current=null;clearCases();setUser(null);router.replace("/login");return;}
    if(u.role!==role){verified.current=null;clearCases();setUser(null);router.replace(workspace(u.role));return;}
    if(verified.current?.id&&verified.current.id!==u.id)clearCases();
    if(JSON.stringify(verified.current)!==JSON.stringify(u)){verified.current=u;setUser(u);}setError("");
   }catch(e){if(!cancelled&&!verified.current)setError(e instanceof Error?e.message:"Account unavailable.");}
   finally{running=false;}
  }
  void verify();const timer=setInterval(()=>void verify(),15000);
  const focus=()=>void verify(),visible=()=>{if(document.visibilityState==="visible")void verify();};
  window.addEventListener("focus",focus);document.addEventListener("visibilitychange",visible);
  const channel=typeof BroadcastChannel!=="undefined"?new BroadcastChannel("vitality-staff-session"):null;
  if(channel)channel.onmessage=()=>void verify();
  return()=>{cancelled=true;clearInterval(timer);window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",visible);channel?.close();};
 },[role,router]);
 if(error)return <main className="loading"><h1>Could not open workspace</h1><p role="alert">{error}</p><button onClick={()=>router.replace("/login")}>Back to login</button></main>;
 if(!user)return <main className="loading"><h1>Opening your workspace...</h1></main>;
 return <StaffDashboard role={role} userName={user.name}/>;
}
