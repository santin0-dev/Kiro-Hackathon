import "server-only";
import {allowLocalRequest} from "./request-origin";
export const localRequest=allowLocalRequest;
export function json(body:unknown,status=200) {return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}
export async function readJson(request:Request,max=2200000):Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))throw new Error("JSON_REQUIRED");
  const reader=request.body?.getReader();if(!reader)throw new Error("INVALID_INPUT");
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Error("TOO_LARGE");}chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
