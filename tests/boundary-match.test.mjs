import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {areasInBoundary} from "../app/lib/boundary-match.ts";
const ring=[[0,0],[10,0],[10,10],[0,10],[0,0]];
test("matches longitude/latitude, excludes holes and other areas",()=>{const shape={type:"Polygon",coordinates:[ring,[[4,4],[6,4],[6,6],[4,6],[4,4]]]};assert.deepEqual(areasInBoundary(shape,[{name:"inside",lat:2,lng:2},{name:"hole",lat:5,lng:5},{name:"outside",lat:20,lng:2}]).map(a=>a.name),["inside"]);});
test("supports disconnected MultiPolygon areas and missing geometry",()=>{assert.equal(areasInBoundary({type:"MultiPolygon",coordinates:[[ring]]},[{name:"a",lat:3,lng:2}]).length,1);assert.deepEqual(areasInBoundary(null,[]),[]);});
test("all bundled city boundaries have a barangay asset, with unavailable Manila explicit",()=>{const cities=readdirSync("public/maps/cities").flatMap(file=>JSON.parse(readFileSync(`public/maps/cities/${file}`,"utf8")).features);assert.equal(cities.length,17);for(const city of cities){const code=String(city.properties.adm3_psgc??city.id);const data=JSON.parse(readFileSync(`public/maps/barangays/${code}.json`,"utf8"));if(code==="1380600000"){assert.equal(data.type,"GeometryCollection");assert.equal(data.geometries.length,0);}else{assert.equal(data.type,"FeatureCollection");assert.ok(data.features.length>0);}}});
