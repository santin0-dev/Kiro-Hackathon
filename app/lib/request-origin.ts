
type Settings={origin?:string;password?:string;vercelUrl?:string;productionUrl?:string;branchUrl?:string};
export function deploymentSettings():Settings{return {origin:process.env.APP_ORIGIN,password:process.env.DEMO_ACCESS_PASSWORD,vercelUrl:process.env.VERCEL_URL,productionUrl:process.env.VERCEL_PROJECT_PRODUCTION_URL,branchUrl:process.env.VERCEL_BRANCH_URL};}
export function deploymentOrigins(settings:Settings):string[]{const values=[settings.origin,...[settings.vercelUrl,settings.productionUrl,settings.branchUrl].filter(Boolean).map(v=>`https://${v}`)];return [...new Set(values.filter(Boolean).flatMap(value=>{try{const u=new URL(value!);return u.protocol==="https:"&&u.pathname==="/"&&!u.search&&!u.hash&&!u.username&&!u.password?[u.origin]:[];}catch{return [];}}))];}
function sameOrigin(request:Request,expected:string){const origin=request.headers.get("origin");if(origin){try{return new URL(origin).origin===expected;}catch{return false;}}const referer=request.headers.get("referer");if(referer){try{return new URL(referer).origin===expected;}catch{return false;}}return request.headers.get("sec-fetch-site")==="same-origin";}

export function allowLocalRequest(request:Request,mutation=false,settings:Settings=deploymentSettings()):boolean {
  try {
    const host=request.headers.get("host");if(!host)return false;
    const origins=deploymentOrigins(settings);
    if(settings.origin||settings.vercelUrl||settings.productionUrl||settings.branchUrl){
      const expectedOrigin=origins.find(value=>new URL(value).host.toLowerCase()===host.toLowerCase());
      if(!expectedOrigin)return false;
      if(mutation&&!sameOrigin(request,expectedOrigin))return false;
      return true;
    }
    return localOnlyRequest(request,mutation);
  }catch{return false;}
}

const local=new Set(["localhost","127.0.0.1","[::1]"]);
function localOnlyRequest(request:Request,mutation=false):boolean{
 try{const url=new URL(request.url),host=request.headers.get("host");if(!host)return false;const publicUrl=new URL(`${url.protocol}//${host}`);if(publicUrl.username||publicUrl.password||!local.has(publicUrl.hostname))return false;
 if(!mutation)return true;
 // Use the public Host, not Next's internal bind address. Reject an explicit wrong Origin.
 const origin=request.headers.get("origin");if(origin)return new URL(origin).origin===publicUrl.origin;
 const referer=request.headers.get("referer");if(referer)return new URL(referer).origin===publicUrl.origin;
 return request.headers.get("sec-fetch-site")==="same-origin";
 }catch{return false;}
}

