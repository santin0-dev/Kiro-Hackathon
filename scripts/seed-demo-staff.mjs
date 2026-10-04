import nextEnv from '@next/env';
const {loadEnvConfig}=nextEnv;
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';
loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key||new URL(url).hostname!=='qbngjsbuqutmurdkicgj.supabase.co')throw new Error('Expected app Supabase project and server credentials are required.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
for(const [email,name,role] of [['bhw.demo@example.com','Demo BHW','BHW'],['hospital.demo@example.com','Demo Hospital Doctor','Doctor']]){
 const password='Vitality!'+randomBytes(10).toString('hex');
 const made=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name,demo:true}});
 if(made.error){console.log(JSON.stringify({email,error:made.error.message}));continue;}
 const id=made.data.user.id;
 const saved=await db.from('vitality_staff').insert({auth_user_id:id,email,name,role,approved:true});
 if(saved.error){console.log(JSON.stringify({email,error:'Staff profile creation failed; account not approved.'}));continue;}
 const tester=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const login=await tester.auth.signInWithPassword({email,password});
 const profile=await db.from('vitality_staff').select('role,approved').eq('auth_user_id',id).single();
 if(login.error||!profile.data?.approved||profile.data.role!==role)throw new Error('Demo login verification failed.');
 await tester.auth.signOut();
 console.log(JSON.stringify({email,password,role,verified:true}));
}

