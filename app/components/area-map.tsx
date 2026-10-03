"use client";
import {useEffect,useRef,useState} from "react";
import "leaflet/dist/leaflet.css";

type Area={name:string;lat:number;lng:number};

export default function AreaMap({onSelect,areas,onPick,selectedArea}:{selectedArea?:string;onSelect?:(name:string)=>void;areas:Area[];onPick?:(lat:number,lng:number)=>void}){
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
      if(onPick){let pin:import("leaflet").CircleMarker|undefined;map.on("click",(event:import("leaflet").LeafletMouseEvent)=>{pin?.remove();pin=L.circleMarker(event.latlng,{radius:9,color:"#02aac1"}).addTo(map!);onPick(event.latlng.lat,event.latlng.lng);});}
      const areaLayer=L.layerGroup().addTo(map);
      const markers:import("leaflet").Circle[]=[];
      for(const area of areas){
        const marker=L.circle([area.lat,area.lng],{radius:250,color:"#02aac1",weight:3,fillColor:"#14cfe5",fillOpacity:.8}).addTo(areaLayer);
        markers.push(marker);
        const label=document.createElement("div");label.textContent=area.name;
        marker.bindTooltip(label,{permanent:true,direction:"top",className:"barangay-label"});
        marker.on("click",()=>{if(!onPick)onSelect?.(area.name);});
      }
      const scale=()=>{if(!map)return;const zoom=map.getZoom();if(zoom<11){map.removeLayer(areaLayer);}else if(!map.hasLayer(areaLayer)){areaLayer.addTo(map);}for(const marker of markers){marker.setStyle({weight:zoom<13?1:3,fillOpacity:zoom<13?.45:.8});marker.getTooltip()?.setOpacity(zoom<13?0:1);}};map.on("zoomend",scale);
      if(areas.length)map.fitBounds(areas.map(a=>[a.lat,a.lng] as [number,number]),{padding:[65,65],maxZoom:14});
      const focused=areas.find(a=>a.name===selectedArea);if(focused)map.setView([focused.lat,focused.lng],14);
      scale();
      observer=new ResizeObserver(()=>map?.invalidateSize());observer.observe(container.current);
    }).catch(()=>{if(!disposed)setFailed(true);});
    return()=>{disposed=true;observer?.disconnect();map?.remove();};
  },[onSelect,areas,onPick,selectedArea]);
  return <><div ref={container} className="area-map" aria-label="Click the demo barangay circle, or use View patients below."/>{failed&&<p className="map-note">Map unavailable. Use View patients below.</p>}{tilesUnavailable&&!failed&&<p className="map-note">Background map could not load. The circle and View patients button still work.</p>}</>;
}
