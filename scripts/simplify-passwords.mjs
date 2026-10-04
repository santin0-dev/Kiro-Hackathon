import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key||new URL(url).hostname!=='qbngjsbuqutmurdkicgj.supabase.co')throw new Error('Expected project credentials required.');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const db=createClient(url,key,options);
for(const [email,password,role] of [['bhw.demo@example.com','BhwDemo123!','BHW'],['hospital.demo@example.com','Hospital123!','Doctor']]){
 const profile=await db.from('vitality_staff').select('auth_user_id,role,approved').eq('email',email).single();
 if(profile.error||profile.data.role!==role||!profile.data.approved)throw new Error('Expected demo staff profile missing.');
 const changed=await db.auth.admin.updateUserById(profile.data.auth_user_id,{password});
 if(changed.error)throw new Error(changed.error.message);
 const tester=createClient(url,key,options);
 const login=await tester.auth.signInWithPassword({email,password});
 if(login.error||login.data.user.id!==profile.data.auth_user_id)throw new Error('Login verification failed.');
 await tester.auth.signOut();
 console.log(JSON.stringify({email,password,verified:true}));
}
