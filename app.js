const $ = (id) => document.getElementById(id);
const demo = new URLSearchParams(location.search).get('demo') === '1';
const config = window.AGENDA_CONFIG || {};
let client, user, member, events = [], editingId = null, selectedDay = null, requestId = 0;
let demoSeries = [];
const authReturn = new URLSearchParams(location.hash.slice(1));
let authReturnError = authReturn.has('error') ? (authReturn.get('error_code')==='otp_expired' ? 'Deze inloglink is al gebruikt of verlopen. Vraag hieronder een nieuwe e-mail aan. Nieuw account? Gebruik de bevestigingscode uit de nieuwste mail.' : 'Inloggen is niet gelukt. Vraag hieronder een nieuwe e-mail aan.') : '';
if(authReturnError)history.replaceState(null,'',location.pathname+location.search);
function showCodeStep(email='') {
 $('login-form').hidden=true;$('code-step').hidden=false;$('code-email').value=email;$('email-code').value='';
}
function resetCodeStep() {
 $('login-form').hidden=false;$('code-step').hidden=true;$('email-code').value='';
}
$('code-open').addEventListener('click',()=>{showCodeStep($('email').value.trim());notice('');$('code-email').focus();});
$('code-back').addEventListener('click',()=>{resetCodeStep();notice('');$('email').focus();});
$('code-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!client)return;
 const button=e.currentTarget.querySelector('button');button.disabled=true;
 try {
  const {data,error}=await client.auth.verifyOtp({email:$('code-email').value.trim(),token:$('email-code').value.trim(),type:'email'});
  if(error||!data.session)throw error||new Error('session');
  $('email-code').value='';authReturnError='';await applySession(data.session);
 }catch{notice('De code klopt niet of is verlopen. Gebruik de code uit de nieuwste e-mail, of vraag een nieuwe e-mail aan.',true);}
 finally{button.disabled=false;}
});
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const weekdays = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme-toggle').textContent = dark ? 'Licht thema' : 'Donker thema';
  $('theme-toggle').setAttribute('aria-pressed',String(dark));
  try {localStorage.setItem('agenda-theme',dark ? 'dark' : 'light');} catch {}
}
let savedTheme;try {savedTheme = localStorage.getItem('agenda-theme');} catch {}
setTheme(savedTheme ? savedTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
$('theme-toggle').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme !== 'dark'));
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const localInput = (d) => `${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const format = (date, options) => new Intl.DateTimeFormat('nl-NL', options).format(new Date(date));
function element(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function notice(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); $('notice').hidden = !message; }
function overlapsDay(event, day) { const end = new Date(day); end.setDate(end.getDate()+1); return new Date(event.starts_at) < end && new Date(event.ends_at) > day; }
function render() {
  $('month-title').textContent = format(month, {month:'long',year:'numeric'});
  const calendar = $('calendar'); calendar.replaceChildren();
  const start = new Date(month); start.setDate(start.getDate() - (start.getDay()+6)%7);
  for (let i=0; i<42; i++) {
    const date = new Date(start); date.setDate(date.getDate()+i);
    const key = dateKey(date), plans = events.filter(e => overlapsDay(e,date));
    const cell = element('button','day'); cell.type = 'button';
    cell.classList.toggle('outside',date.getMonth() !== month.getMonth());
    cell.classList.toggle('today',key === dateKey(new Date())); cell.classList.toggle('selected',key === selectedDay);
    cell.setAttribute('aria-pressed', String(key === selectedDay));
    cell.setAttribute('aria-label', `${weekdays[(date.getDay()+6)%7]} ${format(date,{day:'numeric',month:'long',year:'numeric'})}, ${plans.length} activiteiten`);
    cell.append(element('span','day-number',date.getDate()));
    plans.slice(0,2).forEach(e => cell.append(element('span','day-event',e.title)));
    if(plans.length > 2) cell.append(element('span','day-more',`+${plans.length-2} meer`));
    cell.addEventListener('click',async () => {
      selectedDay = key;
      if(date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) { month = new Date(date.getFullYear(),date.getMonth(),1); await loadEvents(); }
      else render();
    }); calendar.append(cell);
  }
  const monthEnd = new Date(month.getFullYear(),month.getMonth()+1,1);
  const filtered = events.filter(e => selectedDay ? overlapsDay(e,new Date(`${selectedDay}T00:00:00`)) : new Date(e.starts_at) < monthEnd && new Date(e.ends_at) > month);
  $('event-count').textContent = filtered.length;
  $('list-kicker').textContent = selectedDay ? 'GESELECTEERDE DAG' : 'DEZE MAAND';
  $('list-title').textContent = selectedDay ? format(`${selectedDay}T00:00:00`,{day:'numeric',month:'long'}) : 'Op de planning';
  const list = $('events'); list.replaceChildren();
  if(!filtered.length) {
    const empty = element('div','empty'); empty.append(element('strong','', 'Nog geen plannen'),element('p','', 'Zet de eerste activiteit in de agenda.')); list.append(empty);
  }
  filtered.forEach(event => {
    const card = element('article','event-card'), badge = element('div','date-badge');
    badge.append(element('strong','',format(event.starts_at,{day:'numeric'})),element('span','',format(event.starts_at,{month:'short'})));
    const content = element('div','event-content');
    content.append(element('div','event-title',event.title));
    if(event.recurrence && event.recurrence !== 'none') content.append(element('div','event-meta',({daily:'Herhaalt elke dag',weekly:'Herhaalt elke week',yearly:'Herhaalt elk jaar'})[event.recurrence]));
    const sameDate = dateKey(new Date(event.starts_at)) === dateKey(new Date(event.ends_at));
    content.append(element('div','event-meta', event.all_day ? 'Hele dag' : `${format(event.starts_at,{hour:'2-digit',minute:'2-digit'})} – ${sameDate ? '' : format(event.ends_at,{day:'numeric',month:'short'})+' · '}${format(event.ends_at,{hour:'2-digit',minute:'2-digit'})}`));
    if(event.location) content.append(element('div','event-meta',event.location));
    if(event.description) content.append(element('p','event-description',event.description));
    const bottom = element('div','event-bottom'); bottom.append(element('span','event-author',`Door ${event.author_name}`));
    if(user && (event.owner_id === user.id || member?.is_admin)) { const edit = element('button','quiet edit','Bewerken'); edit.addEventListener('click',()=>openEditor(event)); bottom.append(edit); }
    content.append(bottom);
    const attendees = event.attendance || [], attending = attendees.some(a=>a.user_id === user?.id);
    const attendance = element('div','attendance');
    attendance.append(element('div','attendance-names',attendees.length ? `Aanwezig (${attendees.length}): ${attendees.map(a=>a.display_name).join(', ')}` : 'Nog niemand aangemeld'));
    const actions = element('div','event-actions');
    const attend = element('button','attendance-button',attending ? 'Aanwezig · Afmelden' : 'Ik ben aanwezig');
    attend.setAttribute('aria-pressed',String(attending));
    attend.addEventListener('click',()=>toggleAttendance(event,attend));
    const exportButton = element('button','quiet calendar-export','Voeg toe aan persoonlijke agenda');
    exportButton.addEventListener('click',()=>window.AgendaExport.download([event],`activiteit-${event.id}.ics`));
    actions.append(attend,exportButton);attendance.append(actions);content.append(attendance);
    card.append(badge,content);list.append(card);
  });
}
async function loadEvents() {
  const id = ++requestId;
  if(demo) {const start=new Date(month);start.setDate(start.getDate()-(start.getDay()+6)%7);const end=new Date(start);end.setDate(end.getDate()+42);events=window.AgendaRecurrence.expand(demoSeries,start,end);render();return;}
  if(!client || !member) return;
  const start = new Date(month); start.setDate(start.getDate()-(start.getDay()+6)%7);
  const end = new Date(start); end.setDate(end.getDate()+42);
  const {data,error} = await client.rpc('calendar_occurrences',{window_start:start.toISOString(),window_end:end.toISOString()});
  if(id !== requestId) return;
  if(error) { notice('De agenda kon niet worden geladen. Probeer Agenda vernieuwen.',true); return; }
  events = data || []; render();
}

let accessRequest = null, pendingRequests = [], demoRequests = [{user_id:'demo-request',email:'nieuw-lid@voorbeeld.nl',display_name:'Nieuw groepslid',status:'pending'}];
function showRequestStatus(row) {
 accessRequest=row;$('request-form').hidden=!!row;$('request-mail').hidden=!row||row.status!=='pending'||!!row.notification_sent_at;
 $('request-status').textContent=!row?'Je e-mailadres is bevestigd. Vul je naam en geboortedatum in om de beheerder om toegang te vragen.':row.status==='rejected'?'De beheerder heeft je aanvraag afgewezen. Neem contact op met de beheerder als je denkt dat dit niet klopt.':row.status==='approved'?'Je eerdere aanvraag was goedgekeurd, maar je hebt momenteel geen toegang. Neem contact op met de beheerder.':'Je aanvraag wacht op goedkeuring. Je krijgt een bevestigingsmail zodra je bent toegelaten. Tot die tijd heb je geen toegang tot activiteiten.';
}
async function loadOwnRequest() {
 const {data,error}=await client.from('membership_requests').select('*').eq('user_id',user.id).maybeSingle();
 if(error)throw error;showRequestStatus(data);
}
async function notifyRequest(action='request') {
 const {data,error}=await client.functions.invoke('notify-membership',{body:{action}});
 if(error||!data?.sent)throw new Error('mail');
 return data;
}
$('request-form').addEventListener('submit',async e=>{
 e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;
 try{
  const name=$('request-name').value.trim();if(!name)throw new Error('name');
  const birthDate=$('request-birth-date').value;if(!birthDate || birthDate<'1900-01-01' || birthDate>dateKey(new Date()))throw new Error('birth-date');
  const {error}=await client.from('membership_requests').insert({display_name:name,birth_date:birthDate});if(error)throw error;
  await loadOwnRequest();notice('Je aanvraag is opgeslagen. Je krijgt pas toegang na goedkeuring.');
  try{await notifyRequest();await loadOwnRequest();}catch{notice('Je aanvraag is opgeslagen en zichtbaar voor de beheerder. De e-mailmelding kon niet worden verstuurd; probeer de melding later opnieuw.',true);}
 }catch{notice('Je aanvraag kon niet worden opgeslagen. Controleer je verbinding en probeer opnieuw.',true);}
 finally{button.disabled=false;}
});
$('request-refresh').addEventListener('click',async()=>{const {data}=await client.auth.getSession();await applySession(data.session);});
$('request-mail').addEventListener('click',async()=>{
 const button=$('request-mail');button.disabled=true;
 try{await notifyRequest();await loadOwnRequest();notice('De beheerder heeft een e-mailmelding gekregen.');}catch{notice('De e-mailmelding kon niet worden verstuurd. Je aanvraag blijft staan. Probeer het over een uur opnieuw.',true);}finally{button.disabled=false;}
});
async function loadRequests() {
 if(!member?.is_admin)return;
 let rows=demoRequests;
 if(!demo){const {data,error}=await client.from('membership_requests').select('user_id,email,display_name,created_at').eq('status','pending').order('created_at');if(error){notice('Aanvragen konden niet worden geladen.',true);return;}rows=data||[];}
 pendingRequests=rows;const list=$('request-list');list.replaceChildren();
 if(!rows.length)list.append(element('p','','Geen openstaande aanvragen.'));
 rows.forEach(row=>{
  const card=element('div','request-card');const info=element('div');info.append(element('strong','',row.display_name),element('p','',row.email));card.append(info);
  const actions=element('div','request-actions');
  for(const [status,label] of [['approved','Goedkeuren'],['rejected','Afwijzen']]){
   const b=element('button',status==='approved'?'primary':'quiet',label);b.addEventListener('click',async()=>{
    if(!confirm((status==='approved'?'Toegang geven aan ':'Aanvraag afwijzen van ')+row.display_name+' ('+row.email+')?'))return;
    actions.querySelectorAll('button').forEach(x=>x.disabled=true);
    try{
     if(demo)demoRequests=demoRequests.filter(x=>x.user_id!==row.user_id);
     else{const {data,error}=await client.from('membership_requests').update({status}).eq('user_id',row.user_id).eq('status','pending').select('user_id');if(error||!data?.length)throw new Error('review');}
     notice(demo?'Voorbeeld: aanvraag beoordeeld. Er zijn geen echte accounts gewijzigd.':status==='approved'?'Gebruiker goedgekeurd. De gebruiker kan nu de agenda openen en krijgt automatisch een bevestigingsmail.':'Aanvraag afgewezen. De gebruiker krijgt geen toegang.');await loadRequests();
    }catch{notice('Beoordelen is niet gelukt. Vernieuw de aanvragen en probeer opnieuw.',true);actions.querySelectorAll('button').forEach(x=>x.disabled=false);}
   });actions.append(b);
  }card.append(actions);list.append(card);
 });
}
$('refresh-requests').addEventListener('click',loadRequests);
$('test-admin-mail').addEventListener('click',async()=>{
 if(demo){notice('Een testmail versturen kan alleen met je echte beheerdersaccount.');return;}
 const button=$('test-admin-mail');button.disabled=true;
 try{await notifyRequest('test');notice('Testmail verstuurd naar de beheerdersmailbox.');}catch{notice('Testmail kon niet worden verstuurd. Controleer de mailinstellingen voor beheerdersmeldingen.',true);}finally{button.disabled=false;}
});

async function applySession(session) {
  const id = ++requestId; user = session?.user || null; member = null; events = [];
  $('event-dialog').close();$('import-dialog').close();$('import-ics').hidden=true;$('admin-requests').hidden=true;$('request-view').hidden=true; $('agenda-view').hidden = true; $('login-view').hidden = false;
  $('logout').hidden = !user; $('account-name').textContent = '';
  if(!user) { resetCodeStep();render();if(authReturnError)notice(authReturnError,true);return; }
  const {data,error} = await client.from('members').select('display_name,is_admin').maybeSingle();
  if(id !== requestId) return;
  if(error) { notice('Je groepslidmaatschap kon niet worden gecontroleerd. Probeer opnieuw in te loggen.',true); return; }
  if(!data) { $('login-view').hidden=true;$('request-view').hidden=false;$('account-name').textContent='Toegang aanvragen';notice('');try{await loadOwnRequest();}catch{notice('Je aanvraagstatus kon niet worden geladen. Probeer opnieuw.',true);}return; }
  member = data; $('account-name').textContent = member.display_name + (member.is_admin ? ' · Beheerder' : '');
  $('login-view').hidden = true; $('agenda-view').hidden = false;$('import-ics').hidden=!member.is_admin;$('admin-requests').hidden=!member.is_admin;notice('');await loadEvents();await loadRequests();
}
function updateMapsSearch() {
  const query = $('location').value.trim(), link = $('maps-search');
  link.setAttribute('aria-disabled', String(!query));
  if(query) {link.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);link.removeAttribute('tabindex');}
  else {link.removeAttribute('href');link.setAttribute('tabindex','-1');}
}
$('location').addEventListener('input',updateMapsSearch);
updateMapsSearch();
function openEditor(event) {
  editingId = event?.id || null; $('event-form').reset(); $('form-error').textContent = '';
  $('dialog-title').textContent = event ? 'Activiteit bewerken' : 'Nieuwe activiteit'; $('delete-event').hidden = !event;
  let start = selectedDay ? new Date(`${selectedDay}T19:00:00`) : new Date(month.getFullYear(), month.getMonth(), month.getFullYear()===new Date().getFullYear() && month.getMonth()===new Date().getMonth() ? new Date().getDate() : 1, 19);
  if(event) start = new Date(event.birthday_user_id?event.starts_at:event.series_starts_at||event.starts_at);
  const end = event ? new Date(event.birthday_user_id?event.ends_at:event.series_ends_at||event.ends_at) : new Date(start.getTime()+2*60*60*1000);
  $('title').value = event?.title || ''; $('starts').value = localInput(start); $('ends').value = localInput(end);
  $('location').value = event?.location || ''; updateMapsSearch(); $('description').value = event?.description || '';
  $('recurrence').value=event?.recurrence||'none';$('recurrence').disabled=!!event?.birthday_user_id;$('starts').readOnly=!!event?.birthday_user_id;$('ends').readOnly=!!event?.birthday_user_id;
  $('series-help').textContent=event?.birthday_user_id?'Deze verjaardag herhaalt ieder jaar als hele dag. De datum is gebaseerd op de geboortedatum.':'Bewerken of verwijderen geldt voor de hele reeks. De herhaling volgt Nederlandse tijd. Wijzig je de datums of herhaling, dan worden aanwezigheidsmeldingen opnieuw ingesteld. Jaarlijks op 29 februari wordt in andere jaren 28 februari.';
  $('event-dialog').showModal(); $('title').focus();
}
function editorBusy(busy) { $('save-event').disabled = busy; $('delete-event').disabled = busy; $('close-dialog').disabled = busy; }
async function toggleAttendance(event,button) {
  if(!user || !member) return;
  button.disabled=true;
  try {
    const attending = (event.attendance || []).some(a=>a.user_id === user.id);
    if(demo) {
      const series=demoSeries.find(x=>x.id===event.id);series.attendance=attending?(series.attendance||[]).filter(a=>a.user_id!==user.id||a.occurrence_start!==event.starts_at):[...(series.attendance||[]),{user_id:user.id,display_name:member.display_name,occurrence_start:event.starts_at}];
    } else {
      const query = attending ? client.from('attendance').delete().eq('event_id',event.id).eq('user_id',user.id).eq('occurrence_start',event.starts_at) : client.from('attendance').insert({event_id:event.id,occurrence_start:event.starts_at});
      const {error} = await query; if(error)throw error;
    }
    await loadEvents();
  } catch {notice('Je aanwezigheid kon niet worden opgeslagen. Probeer opnieuw.',true);}
  finally {button.disabled=false;}
}
$('export-all').addEventListener('click',async()=>{
  const button=$('export-all');button.disabled=true;
  try {
    let all=demo?demoSeries:events;
    if(!demo) {
      all=[];
      for(let from=0;;from+=1000) {
        const {data,error}=await client.from('events').select('*').order('starts_at').order('id').range(from,from+999);
        if(error)throw error;all.push(...data);if(data.length<1000)break;
      }
    }
    if(!all.length) {notice('Er zijn nog geen activiteiten om toe te voegen.');return;}
    window.AgendaExport.download(all);
    notice('Het .ics-bestand is gedownload. Open het in je agenda-app om de activiteiten te importeren.');
  } catch {notice('Het agendabestand kon niet worden gemaakt. Probeer opnieuw.',true);}
  finally {button.disabled=false;}
});
$('event-form').addEventListener('submit',async (e)=>{
  e.preventDefault(); if($('save-event').disabled) return;
  const start = new Date($('starts').value), end = new Date($('ends').value);
  if(!user || !member) { $('form-error').textContent = 'Log opnieuw in om op te slaan.'; return; }
  if(!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end<=start) { $('form-error').textContent = 'De eindtijd moet na de begintijd liggen.'; return; }
  const payload = {title:$('title').value.trim(),starts_at:start.toISOString(),ends_at:end.toISOString(),location:$('location').value.trim(),description:$('description').value.trim(),recurrence:$('recurrence').value,time_zone:'Europe/Amsterdam'};
  if(payload.recurrence!=='none'&&end-start>31*86400000){$('form-error').textContent='Een herhaalactiviteit mag per keer maximaal 31 dagen duren.';return;}
  if(!payload.title) { $('form-error').textContent = 'Vul een titel in.'; return; }
  editorBusy(true); $('form-error').textContent = '';
  try {
    if(demo) {
      if(editingId) demoSeries = demoSeries.map(x=>x.id===editingId ? {...x,...payload,attendance:(x.starts_at===payload.starts_at&&x.ends_at===payload.ends_at&&x.recurrence===payload.recurrence)?x.attendance:[]} : x);
      else demoSeries.push({...payload,id:crypto.randomUUID(),owner_id:user.id,author_name:member.display_name});
    } else {
      const query = editingId ? client.from('events').update(payload).eq('id',editingId) : client.from('events').insert(payload);
      const {data,error} = await query.select('id');
      if(error || !data?.length) throw new Error('save');
    }
    month = new Date(start.getFullYear(),start.getMonth(),1); selectedDay = null;
    $('event-dialog').close(); notice(demo ? 'Voorbeeldagenda: je wijzigingen zijn tijdelijk en verdwijnen bij het herladen.' : 'Je activiteit is opgeslagen.'); await loadEvents();
  } catch { $('form-error').textContent = 'Opslaan is niet gelukt. Je invoer blijft staan; probeer opnieuw of controleer je groepslidmaatschap.'; }
  finally {editorBusy(false);}
});
$('delete-event').addEventListener('click',async ()=>{
  if(!editingId || !confirm('Deze activiteit verwijderen? Bij een herhaling wordt de hele reeks verwijderd.')) return;
  editorBusy(true);
  try {
    if(demo) demoSeries = demoSeries.filter(x=>x.id !== editingId);
    else { const {data,error} = await client.from('events').delete().eq('id',editingId).select('id'); if(error || !data?.length) throw new Error('delete'); }
    $('event-dialog').close(); await loadEvents(); notice(demo ? 'Voorbeeldagenda: de activiteit is tijdelijk verwijderd.' : 'De activiteit is verwijderd.');
  } catch { $('form-error').textContent = 'Verwijderen is niet gelukt. Probeer opnieuw.'; }
  finally {editorBusy(false);}
});
$('close-dialog').addEventListener('click',()=> $('event-dialog').close());
$('event-dialog').addEventListener('cancel',e=>{if($('save-event').disabled)e.preventDefault();});
$('add-event').addEventListener('click',()=>openEditor());
$('prev-month').addEventListener('click',()=>changeMonth(-1)); $('next-month').addEventListener('click',()=>changeMonth(1));
function changeMonth(delta) {month = new Date(month.getFullYear(),month.getMonth()+delta,1);selectedDay = null;render();loadEvents();}
$('today').addEventListener('click',()=>{const now = new Date();month = new Date(now.getFullYear(),now.getMonth(),1);selectedDay = dateKey(now);render();loadEvents();});
$('all-days').addEventListener('click',()=>{selectedDay=null;render();});
$('refresh').addEventListener('click',()=>{if(!demo)notice('');loadEvents();});
$('logout').addEventListener('click',async()=>{
  if(demo){location.href='./';return;}
  const {error} = await client.auth.signOut(); if(error)notice('Uitloggen is niet gelukt. Probeer opnieuw.',true);
});
$('login-form').addEventListener('submit',async(e)=>{
  e.preventDefault(); if(!client) {notice('Verbind eerst het Supabase-project via config.js.',true);return;}
  const button = e.currentTarget.querySelector('button');button.disabled=true;
  try {
    const redirect = new URL(location.href);redirect.hash='';redirect.search='';
    const {error} = await client.auth.signInWithOtp({email:$('email').value.trim(),options:{emailRedirectTo:redirect.href}});
    if(error)throw error;
    authReturnError='';showCodeStep($('email').value.trim());notice('E-mail aangevraagd. Vul de bevestigingscode in als je nieuw bent, of open je inloglink. Kijk ook in je spammap.');
  } catch(error) {notice(error?.status===429?'Wacht minstens een minuut voordat je opnieuw een e-mail aanvraagt.':'De e-mail kon niet worden verstuurd. Controleer het e-mailadres of probeer het later opnieuw.',true);}
  finally {button.disabled=false;}
});

let importRows=[],importBusy=false,importGeneration=0;
$('import-ics').addEventListener('click',()=>{
 if(!member?.is_admin)return;
 importRows=[];importGeneration++;$('import-form').reset();$('import-preview').replaceChildren();$('import-status').textContent='';$('confirm-import').disabled=true;$('import-dialog').showModal();
});
$('close-import').addEventListener('click',()=>{if(!importBusy){importGeneration++;$('import-dialog').close();}});
$('import-dialog').addEventListener('cancel',e=>{if(importBusy)e.preventDefault();else importGeneration++;});
$('ics-file').addEventListener('change',async()=>{
 const generation=++importGeneration;importRows=[];$('confirm-import').disabled=true;$('import-preview').replaceChildren();
 const file=$('ics-file').files[0];if(!file)return;
 try{
  if(file.size>1048576)throw new Error('Het bestand is te groot (maximaal 1 MB).');
  $('import-status').textContent='Agendabestand lezen…';
  const result=await window.AgendaImport.parse(await file.text());if(generation!==importGeneration)return;
  let existing=new Set(demo?demoSeries.map(e=>e.import_key).filter(Boolean):[]);
  if(!demo&&result.rows.length){const {data,error}=await client.from('events').select('import_key').eq('owner_id',user.id).in('import_key',result.rows.map(e=>e.import_key));if(error)throw new Error('Bestaande imports konden niet worden gecontroleerd.');existing=new Set(data.map(e=>e.import_key));}
  if(generation!==importGeneration)return;
  importRows=result.rows.filter(e=>!existing.has(e.import_key));const duplicates=result.rows.length-importRows.length;
  $('import-status').textContent=importRows.length+' activiteiten klaar om toe te voegen. '+duplicates+' eerder geïmporteerd; '+result.skipped.length+' overgeslagen.';
  const preview=$('import-preview');
  importRows.forEach(row=>{const item=element('div','import-item');item.append(element('strong','',row.title),element('p','',format(row.starts_at,{dateStyle:'medium',timeStyle:'short'})+' – '+format(row.ends_at,{dateStyle:'medium',timeStyle:'short'})));preview.append(item);});
  if(result.skipped.length){const details=element('details');details.append(element('summary','','Waarom zijn activiteiten overgeslagen?'));result.skipped.forEach(reason=>details.append(element('p','',reason)));preview.append(details);}
  if(!result.total)$('import-status').textContent='Dit bestand bevat geen activiteiten.';
  $('confirm-import').disabled=!importRows.length;
 }catch(error){if(generation===importGeneration)$('import-status').textContent=error.message;}
});
$('import-form').addEventListener('submit',async e=>{
 e.preventDefault();if(importBusy||!member?.is_admin||!importRows.length)return;
 importBusy=true;$('confirm-import').disabled=true;$('close-import').disabled=true;$('ics-file').disabled=true;
 try{
  let count=importRows.length;
  if(demo){importRows.forEach(row=>demoSeries.push({...row,id:crypto.randomUUID(),owner_id:user.id,author_name:member.display_name}));}
  else{const {data,error}=await client.rpc('import_calendar_events',{items:importRows});if(error)throw new Error('import');count=data;}
  const first=new Date(importRows[0].starts_at);month=new Date(first.getFullYear(),first.getMonth(),1);selectedDay=null;
  $('import-dialog').close();notice((demo?'Voorbeeld: ':'')+count+' activiteiten geïmporteerd.');importRows=[];await loadEvents();
 }catch{$('import-status').textContent='Importeren is niet gelukt. Er zijn geen gedeeltelijke wijzigingen opgeslagen. Controleer je beheerdersrechten en probeer opnieuw.';}
 finally{importBusy=false;$('confirm-import').disabled=!importRows.length;$('close-import').disabled=false;$('ics-file').disabled=false;}
});

$('request-birth-date').max=dateKey(new Date());
async function init() {
  render();
  if(demo) {
    user={id:'demo-member'};member={display_name:'Tinus',is_admin:true};
    const sample = (day,hour,duration)=> {const d = new Date(month.getFullYear(),month.getMonth(),day,hour);return {starts_at:d.toISOString(),ends_at:new Date(d.getTime()+duration*3600000).toISOString()};};
    demoSeries = [
      {id:'sample-1',...sample(9,20,4),title:'Verjaardagsfeest',location:'Bij Noor thuis',description:'Een gezellige avond met de hele groep.',owner_id:'noor',author_name:'Noor'},
      {id:'sample-2',...sample(17,15,3),title:'Samen naar het park',location:'Bij de ingang van het park',description:'Neem iets lekkers mee voor de picknick.',owner_id:user.id,author_name:'Jij'},
      {id:'sample-3',...sample(24,19,4),title:'Spelletjesavond',location:'Bij Sam',description:'Neem je favoriete spel mee.',owner_id:'sam',author_name:'Sam'}
    ];
    demoSeries[0].attendance=[{user_id:'noor',display_name:'Noor'},{user_id:'sam',display_name:'Sam'}];
    $('login-view').hidden=true;$('agenda-view').hidden=false;$('account-name').textContent='Voorbeeldagenda · Beheerder';$('logout').hidden=false;
    $('footer-note').textContent='Dit is een voorbeeld met fictieve activiteiten. Er wordt niets online opgeslagen.';
    $('import-ics').hidden=false;$('admin-requests').hidden=false;notice('Voorbeeldagenda: je wijzigingen zijn tijdelijk en verdwijnen bij het herladen.');await loadEvents();await loadRequests();return;
  }
  if(!config.supabaseUrl || !config.supabasePublishableKey) { $('setup').hidden=false;$('login-form').querySelector('button').disabled=true;return; }
  try {
    const {createClient} = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm');
    client = createClient(config.supabaseUrl,config.supabasePublishableKey);
    // Auth callbacks remain synchronous to avoid nested Supabase auth-lock calls.
    client.auth.onAuthStateChange((event,session)=>{
      // SIGNED_IN can fire again when returning from another app. Preserve open forms for the same user.
      if(event==='SIGNED_IN' && session?.user?.id===user?.id && (member || !$('request-view').hidden))return;
      if(event !== 'TOKEN_REFRESHED')setTimeout(()=>applySession(session).catch(()=>notice('De verbinding is onderbroken. Herlaad de pagina.',true)),0);
    });
    setInterval(()=>{if(user && member && !document.hidden && !$('event-dialog').open)loadEvents();},30000);
    window.addEventListener('focus',()=>{if(user && member && !$('event-dialog').open)loadEvents();});
  } catch {notice('De verbinding kon niet worden gestart. Controleer config.js en je internetverbinding.',true);}
}
init();
