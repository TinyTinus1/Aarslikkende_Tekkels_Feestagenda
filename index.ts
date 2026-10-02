import nodemailer from 'npm:nodemailer@10.0.13';
const recipient='aarslikkendetekkels@gmail.com';
const site='https://tinytinus1.github.io/Aarslikkende_Tekkels_Feestagenda/';
const cors={'Access-Control-Allow-Origin':'https://tinytinus1.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply(405,{error:'method'});
 const bearer=req.headers.get('Authorization')||'';
 if(!/^Bearer [^ ]+$/.test(bearer))return reply(401,{error:'login_required'});
 const base=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!base||!key)return reply(503,{error:'configuration'});
 try{
  const authResponse=await fetch(base+'/auth/v1/user',{headers:{apikey:key,Authorization:bearer}});
  if(!authResponse.ok)return reply(401,{error:'login_required'});
  const current=await authResponse.json();
  if(!current.id||!current.email_confirmed_at||!current.email)return reply(403,{error:'verified_email_required'});
  const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const body=await req.json().catch(()=>({}));
  const action=body.action==='test'?'test':'request';
  let pending;
  if(action==='test'){
   const r=await fetch(base+'/rest/v1/members?select=is_admin&email=eq.'+encodeURIComponent(current.email.toLowerCase()),{headers});
   if(!r.ok)return reply(503,{error:'database'});
   const m=await r.json();if(!m[0]?.is_admin)return reply(403,{error:'admin_required'});
  }else{
   const r=await fetch(base+'/rest/v1/membership_requests?select=user_id,email,display_name,status,notification_sent_at&user_id=eq.'+encodeURIComponent(current.id),{headers});
   if(!r.ok)return reply(503,{error:'database'});
   [pending]=await r.json();
   if(!pending||pending.status!=='pending')return reply(409,{error:'no_pending_request'});
   if(pending.notification_sent_at)return reply(200,{sent:true,already_sent:true});
  }
  const username=Deno.env.get('AGENDA_SMTP_USER'),password=Deno.env.get('AGENDA_SMTP_PASSWORD');
  if(!username||!password)return reply(503,{error:'mail_not_configured'});
  if(action==='request'){
   const r=await fetch(base+'/rest/v1/rpc/claim_membership_notification',{method:'POST',headers,body:JSON.stringify({p_user_id:current.id})});
   if(!r.ok)return reply(503,{error:'database'});
   if(!(await r.json()))return reply(429,{error:'try_later'});
  }
  const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:username,pass:password.replace(/\s/g,'')},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
  try{
   await transport.sendMail({from:{name:'Aarslikkende Tekkels Agenda',address:username},to:recipient,
    subject:action==='test'?'Test: beheerdermail groepsagenda':'Nieuwe aanmeldingsaanvraag voor de groepsagenda',
    text:action==='test'?'De beheerdermail werkt. Nieuwe aanmeldingsaanvragen worden naar deze mailbox gestuurd. Beoordelen doe je ingelogd als beheerder op '+site+'?aanvragen=1':
     'Een nieuwe gebruiker vraagt toegang tot de groepsagenda.\n\nGegevens van de aanvrager:\nNaam: '+pending.display_name+'\nBevestigd e-mailadres: '+pending.email+'\n\nOpen de agenda en log in met je bestaande beheerdersaccount om goed te keuren of af te wijzen:\n'+site+'?aanvragen=1\n\nZonder goedkeuring krijgt deze gebruiker geen toegang tot activiteiten.'});
  }finally{transport.close();}
  if(action==='request'){
   const r=await fetch(base+'/rest/v1/membership_requests?user_id=eq.'+encodeURIComponent(current.id),{method:'PATCH',headers,body:JSON.stringify({notification_sent_at:new Date().toISOString()})});
   if(!r.ok)return reply(503,{error:'delivery_record_failed'});
  }
  return reply(200,{sent:true});
 }catch{
  // Never log SMTP errors, credentials, tokens or applicant details.
  console.error('Membership notification failed');return reply(502,{error:'mail_failed'});
 }
});
