export type SavedArea={name:string;lat:number;lng:number};
type Position=number[];
function inRing(point:Position,ring:Position[]):boolean{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function inPolygon(point:Position,rings:Position[][]):boolean{return !!rings.length&&inRing(point,rings[0])&&!rings.slice(1).some(r=>inRing(point,r));}
// GeoJSON coordinates are longitude then latitude. Do not merge patients by name alone.
export function areasInBoundary(geometry:unknown,areas:SavedArea[]):SavedArea[]{if(!geometry||typeof geometry!=="object")return [];const g=geometry as {type:string;coordinates:unknown};if(g.type!=="Polygon"&&g.type!=="MultiPolygon")return [];const polygons=g.type==="Polygon"?[g.coordinates as Position[][]]:g.coordinates as Position[][][];return areas.filter(a=>polygons.some(p=>inPolygon([a.lng,a.lat],p)));}
