import "server-only";
const local=new Set(["localhost","127.0.0.1","[::1]"]);
export function localRequest(request:Request,mutation=false):boolean {
  const url=new URL(request.url);
  if (!local.has(url.hostname)) return false;
  const host=request.headers.get("host");
  try {if (!host || !local.has(new URL(`http://${host}`).hostname)) return false;}catch{return false;}
  if (mutation) {try {const origin=new URL(request.headers.get("origin")||"");return local.has(origin.hostname)&&origin.host===host;}catch{return false;}}
  return true;
}
export function json(body:unknown,status=200) {return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}
export async function readJson(request:Request,max=2200000):Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))throw new Error("JSON_REQUIRED");
  const reader=request.body?.getReader();if(!reader)throw new Error("INVALID_INPUT");
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Error("TOO_LARGE");}chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
