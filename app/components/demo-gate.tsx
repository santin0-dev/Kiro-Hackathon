"use client";
import {useRouter} from "next/navigation";
import {useEffect,useState} from "react";
import {currentUser,workspace,type DemoUser,type DemoRole} from "../lib/demo-session";
import StaffDashboard from "./staff-dashboard";
export default function DemoGate({role}:{role:DemoRole}){
 const router=useRouter();
 const [user,setUser]=useState<DemoUser|null>(null);
 useEffect(()=>{const u=currentUser();if(!u){router.replace("/login");return;}if(u.role!==role){router.replace(workspace(u.role));return;}void Promise.resolve().then(()=>setUser(u));},[role,router]);
 if(!user)return <main className="loading"><h1>Opening your workspace...</h1></main>;
 return <StaffDashboard role={role} userName={user.name}/>;
}
