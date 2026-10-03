"use client";
import {useEffect,useRef,useState} from "react";
import "leaflet/dist/leaflet.css";
import {DEMO_BARANGAY} from "../lib/workflow";

export default function AreaMap({onSelect}:{onSelect:()=>void}){
  const container=useRef<HTMLDivElement>(null);
  const [failed,setFailed]=useState(false);
  const [tilesUnavailable,setTilesUnavailable]=useState(false);
  useEffect(()=>{
    let disposed=false,map:import("leaflet").Map|undefined,observer:ResizeObserver|undefined;
    void import("leaflet").then(L=>{
      if(disposed||!container.current)return;
      // Illustrative location. No household coordinates or official boundary claim.
      map=L.map(container.current,{scrollWheelZoom:false}).setView([14.60,121.01],14);
      map.attributionControl.addAttribution("Demo barangay location");
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).on("tileerror",()=>{if(!disposed)setTilesUnavailable(true);}).addTo(map);
      const marker=L.circle([14.60,121.01],{radius:350,color:"#02aac1",weight:3,fillColor:"#14cfe5",fillOpacity:.8}).addTo(map);
      const label=document.createElement("div");label.textContent=DEMO_BARANGAY;
      marker.bindTooltip(label,{permanent:true,direction:"top",className:"barangay-label"});
      marker.on("click",onSelect);
      observer=new ResizeObserver(()=>map?.invalidateSize());observer.observe(container.current);
    }).catch(()=>{if(!disposed)setFailed(true);});
    return()=>{disposed=true;observer?.disconnect();map?.remove();};
  },[onSelect]);
  return <><div ref={container} className="area-map" aria-label="Click the demo barangay circle, or use View patients below."/>{failed&&<p className="map-note">Map unavailable. Use View patients below.</p>}{tilesUnavailable&&!failed&&<p className="map-note">Background map could not load. The circle and View patients button still work.</p>}</>;
}
