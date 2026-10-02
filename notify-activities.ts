import nodemailer from 'npm:nodemailer@10.0.13';
// Public wake-up endpoint: no caller-supplied message, event, address or access to data.
// Queue entries are created by protected event/approval database triggers. JWT verification remains enabled.
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response(null,{status:405});
 const base=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const username=Deno.env.get('AGENDA_SMTP_USER'),password=Deno.env.get('AGENDA_SMTP_PASSWORD');
 const reply=(status:number)=>new Response(JSON.stringify({ok:status===200}),{status,headers:{'Content-Type':'application/json'}});
 if(!base||!key||!username||!password)return reply(503);
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 const rpc=async(name:string,body:unknown)=>{const r=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body)});if(!r.ok)throw new Error('database');return r.status===204?null:r.json();};
 let transport:any;
 try{
  const jobs=await rpc('claim_activity_mail',{});if(!jobs.length)return reply(200);
  transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:username,pass:password.replace(/\s/g,'')},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
  for(const job of jobs){
   let delivered=false;
   try{
    if(job.kind==='approval'){
     const site='https://tinytinus1.github.io/Aarslikkende_Tekkels_Feestagenda/';
     const name=String(job.items[0]?.display_name||'groepslid');
     const safeName=name.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as any)[c]);
     await transport.sendMail({from:{name:'Agenda Aarslikkende tekkels',address:username},to:job.recipient,subject:'Je bent toegelaten tot de groep',text:'Hoi '+name+',\n\nJe aanmelding voor Agenda Aarslikkende tekkels is goedgekeurd. Je kunt nu de activiteiten bekijken, zelf plannen toevoegen en aangeven waar je bij bent.\n\nOpen de agenda en log in met dit e-mailadres:\n'+site+'\n\nTot bij het volgende feestje!',html:'<div style="font-family:Arial,sans-serif;color:#18283b;line-height:1.6"><h1>Welkom bij de groep!</h1><p>Hoi '+safeName+',</p><p>Je aanmelding voor <strong>Agenda Aarslikkende tekkels</strong> is goedgekeurd. Je kunt nu de activiteiten bekijken, zelf plannen toevoegen en aangeven waar je bij bent.</p><p><a href="'+site+'" style="display:inline-block;background:#c74b0a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px">Open de agenda</a></p><p>Log in met het e-mailadres waarop je deze mail hebt ontvangen.</p><p>Tot bij het volgende feestje!</p></div>'});
    }else{
    const items=job.items;const format=(d:string)=>new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'full',timeStyle:'short'}).format(new Date(d));
    const listed=items.slice(0,20).map((e:any)=>e.title+'\n'+format(e.starts_at)+(e.location?'\nLocatie: '+e.location:'')+'\nToegevoegd door '+e.author_name+(e.recurrence!=='none'?'\nHerhaalt '+({daily:'elke dag',weekly:'elke week',yearly:'elk jaar'} as any)[e.recurrence]:'')).join('\n\n');
    await transport.sendMail({from:{name:'Agenda Aarslikkende tekkels',address:username},to:job.recipient,subject:items.length===1?'Nieuwe activiteit in de groepsagenda':'Nieuwe activiteiten in de groepsagenda',text:'Er '+(items.length===1?'is een nieuwe activiteit':'zijn '+items.length+' nieuwe activiteiten')+' toegevoegd.\n\n'+listed+(items.length>20?'\n\nBekijk de overige activiteiten in de agenda.':'')+'\n\nBekijk de agenda en meld je aan als je erbij bent:\nhttps://tinytinus1.github.io/Aarslikkende_Tekkels_Feestagenda/'});
    }
    delivered=true;
   }catch{console.error('Activity mail delivery failed');}
   await rpc('finish_activity_mail',{job_id:job.id,job_lease:job.lease,delivered});
  }
  return reply(200);
 }catch{console.error('Activity mail worker failed');return reply(502);}finally{transport?.close();}
});
