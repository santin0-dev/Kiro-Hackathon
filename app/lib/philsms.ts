// Server routes only. Uses the official PhilSMS v3 API.
export class PhilSmsRejected extends Error {}
function rejectedMessage(body:unknown):string {
  const message=typeof body==='object' && body!==null && 'message' in body ? String(body.message).toLowerCase() : '';
  if(message.includes('unauthenticated') || message.includes('unauthorized'))return 'PhilSMS rejected the API token (Unauthenticated). Copy the API token from Developers into PHILSMS_API_TOKEN and restart Next.js.';
  if(message.includes('balance') || message.includes('credit') || message.includes('unit'))return 'PhilSMS rejected the request: check SMS credits in the dashboard.';
  if(message.includes('sender'))return 'PhilSMS rejected the sender ID. Check that PhilSMS is active for this Globe demo recipient.';
  return 'PhilSMS explicitly rejected the request. Check your API token, sender ID and credits in its dashboard.';
}
export async function checkPhilSms(token:string,transport:typeof fetch=fetch):Promise<void> {
  if(!token.trim())throw new PhilSmsRejected('PhilSMS API token is missing.');
  const response=await transport('https://dashboard.philsms.com/api/v3/balance',{
    headers:{Authorization:`Bearer ${token.trim()}`,Accept:'application/json'},
    cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),
  });
  const body=await response.json();
  if(!response.ok || body?.status!=='success')throw new PhilSmsRejected(rejectedMessage(body));
}
export async function sendPhilSms(input:{token:string;sender:string;phone:string;message:string;encoding?:'plain'|'unicode'},transport:typeof fetch=fetch):Promise<{messageId:string|null}> {
  if(!input.token.trim() || !/^\+639\d{9}$/.test(input.phone))throw new PhilSmsRejected('PhilSMS token or recipient format is invalid.');
  const response=await transport('https://dashboard.philsms.com/api/v3/sms/send',{
    method:'POST',redirect:'error',cache:'no-store',
    headers:{Authorization:`Bearer ${input.token.trim()}`,Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify({recipient:input.phone.slice(1),sender_id:input.sender,type:input.encoding||(/[^\x00-\x7F]/.test(input.message)?'unicode':'plain'),message:input.message}),
    signal:AbortSignal.timeout(15000),
  });
  const body=await response.json();
  if(body?.status==='error' || response.status===401 || response.status===403 || response.status===422)throw new PhilSmsRejected(rejectedMessage(body));
  if(!response.ok || body?.status!=='success')throw new Error('PHILSMS_RESPONSE_UNKNOWN');
  const data=Array.isArray(body.data)?body.data[0]:body.data;
  const id=data?.uid ?? data?.message_id ?? data?.id;
  // Official docs guarantee status=success, but do not specify a fixed data/ID shape.
  return {messageId:(typeof id==='string'||typeof id==='number') && String(id).trim()?String(id):null};
}

export async function philSmsReport(token:string,id:string):Promise<{status:string;type:string;segments:number|null}> {
  const r=await fetch(`https://dashboard.philsms.com/api/v3/sms/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${token.trim()}`,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  const body=await r.json();
  if(!r.ok || body?.status!=='success')throw new Error('REPORT_UNAVAILABLE');
  const data=Array.isArray(body.data)?body.data[0]:body.data;
  if(!data || typeof data.status!=='string')throw new Error('REPORT_UNAVAILABLE');
  return {status:data.status,type:String(data.sms_type||'unknown'),segments:Number.isFinite(Number(data.sms_count))?Number(data.sms_count):null};
}
