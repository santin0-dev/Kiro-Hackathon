"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type Area = { name: string; total: number; completed: number; outstanding: number; overdue: number };
// Illustrative boundaries only. These are not official barangay boundaries.
const shapes = [
  { name: "Demo Mabini", points: [[121.00,14.59],[121.02,14.59],[121.02,14.61],[121.00,14.61],[121.00,14.59]] },
  { name: "Demo Malaya", points: [[121.02,14.59],[121.04,14.59],[121.04,14.61],[121.02,14.61],[121.02,14.59]] },
  { name: "Demo Pag-asa", points: [[121.01,14.61],[121.03,14.61],[121.03,14.63],[121.01,14.63],[121.01,14.61]] },
];
export default function AreaMap({ areas, onSelect }: { areas: Area[]; onSelect: (name: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false; let map: import("leaflet").Map | undefined;
    void import("leaflet").then(L => {
      if (disposed || !container.current) return;
      map = L.map(container.current, { attributionControl: true, scrollWheelZoom: false }).setView([14.61,121.02],13);
      map.attributionControl.addAttribution("Illustrative GeoJSON • no real boundaries or patient coordinates");
      // No external tile requests: the local demo works without a map-service account.
      for (const shape of shapes) {
        const a = areas.find(area => area.name === shape.name);
        const outstanding = a ? a.outstanding : null;
        const feature: GeoJSON.Feature<GeoJSON.Polygon> = { type: "Feature", properties: { areaId: shape.name }, geometry: { type: "Polygon", coordinates: [shape.points] } };
        const layer = L.geoJSON(feature, { style: { color: "#ffffff", weight: 3, fillColor: outstanding === null ? "#cbd5e1" : outstanding > 1 ? "#ca814d" : "#399e91", fillOpacity: .85 } }).addTo(map);
        const label = document.createElement("div"); label.textContent = `${shape.name}: ${a ? `${a.total} recorded episodes; ${a.completed} completed; ${a.overdue} overdue tasks` : "No recorded data"}`;
        layer.bindTooltip(label).on("click", () => onSelect(shape.name));
      }
    });
    return () => { disposed = true; map?.remove(); };
  }, [areas, onSelect]);
  return <div ref={container} className="area-map" aria-label="Interactive illustrative barangay workload map" />;
}
