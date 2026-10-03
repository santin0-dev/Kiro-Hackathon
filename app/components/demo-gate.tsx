"use client";
import {useRouter} from "next/navigation";
import {useEffect,useState} from "react";
import {currentUser,workspace,type DemoUser,type DemoRole} from "../lib/demo-session";
import StaffDashboard from "./staff-dashboard";
export default function DemoGate({role}:{role:DemoRole}){const router=useRouter();const [user,setUser]=useState<DemoUser|null>(null),[error,setError]=useState("");useEffect(()=>{let cancelled=false;void currentUser().then(u=>{if(cancelled)return;if(!u){router.replace("/login");return;}if(u.role!==role){router.replace(workspace(u.role));return;}setUser(u);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"Account unavailable.");});return()=>{cancelled=true;};},[role,router]);if(error)return <main className="loading"><h1>Could not open workspace</h1><p role="alert">{error}</p><button onClick={()=>router.replace("/login")}>Back to login</button></main>;if(!user)return <main className="loading"><h1>Opening your workspace...</h1></main>;return <StaffDashboard role={role} userName={user.name}/>;}
