import nextEnv from '@next/env';
import {BedrockRuntimeClient,ConverseCommand} from '@aws-sdk/client-bedrock-runtime';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const region=process.env.AWS_BEDROCK_REGION||process.env.AWS_REGION;
const model=process.env.AWS_BEDROCK_MODEL_ID||process.env.BEDROCK_MODEL_ID||process.env.BEDROCK_MODEL||process.argv[2];
console.log(JSON.stringify({region:region||null,model:model||null,enabled:process.env.LOCAL_DEMO_AI_ENABLED==='true',accessKeyPresent:!!process.env.AWS_ACCESS_KEY_ID,secretPresent:!!process.env.AWS_SECRET_ACCESS_KEY,sessionTokenPresent:!!process.env.AWS_SESSION_TOKEN,profilePresent:!!process.env.AWS_PROFILE,bearerTokenPresent:!!process.env.AWS_BEARER_TOKEN_BEDROCK}));
if(!region||!model)process.exit(2);
try{const client=new BedrockRuntimeClient({region,maxAttempts:1});const start=Date.now();const result=await client.send(new ConverseCommand({modelId:model,messages:[{role:'user',content:[{text:'For a software connectivity test, reply only OK.'}]}],inferenceConfig:{maxTokens:20}}),{abortSignal:AbortSignal.timeout(15000)});console.log(JSON.stringify({verified:true,latencyMs:Date.now()-start,stopReason:result.stopReason,text:result.output?.message?.content?.filter(x=>'text' in x).map(x=>x.text).join('')}));}catch(e){console.log(JSON.stringify({verified:false,errorName:e.name,httpStatus:e.$metadata?.httpStatusCode,requestId:e.$metadata?.requestId,message:String(e.message).replace(/arn:aws:[^\s]+/g,'[AWS resource]').replace(/AKIA[A-Z0-9]+/g,'[access key]')}));process.exitCode=1;}

