const $ = (id) => document.getElementById(id);
const demo = new URLSearchParams(location.search).get('demo') === '1';
const config = window.AGENDA_CONFIG || {};
let client, user, member, events = [], editingId = null, selectedDay = null, requestId = 0;
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const weekdays = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
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
    const sameDate = dateKey(new Date(event.starts_at)) === dateKey(new Date(event.ends_at));
    content.append(element('div','event-meta', `${format(event.starts_at,{hour:'2-digit',minute:'2-digit'})} – ${sameDate ? '' : format(event.ends_at,{day:'numeric',month:'short'})+' · '}${format(event.ends_at,{hour:'2-digit',minute:'2-digit'})}`));
    if(event.location) content.append(element('div','event-meta',event.location));
    if(event.description) content.append(element('p','event-description',event.description));
    const bottom = element('div','event-bottom'); bottom.append(element('span','event-author',`Door ${event.author_name}`));
    if(user && event.owner_id === user.id) { const edit = element('button','quiet edit','Bewerken'); edit.addEventListener('click',()=>openEditor(event)); bottom.append(edit); }
    content.append(bottom);card.append(badge,content);list.append(card);
  });
}
async function loadEvents() {
  const id = ++requestId;
  if(demo) { events.sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)); render(); return; }
  if(!client || !member) return;
  const start = new Date(month); start.setDate(start.getDate()-(start.getDay()+6)%7);
  const end = new Date(start); end.setDate(end.getDate()+42);
  const {data,error} = await client.from('events').select('*').lt('starts_at',end.toISOString()).gt('ends_at',start.toISOString()).order('starts_at');
  if(id !== requestId) return;
  if(error) { notice('De agenda kon niet worden geladen. Probeer Agenda vernieuwen.',true); return; }
  events = data || []; render();
}
async function applySession(session) {
  const id = ++requestId; user = session?.user || null; member = null; events = [];
  $('event-dialog').close(); $('agenda-view').hidden = true; $('login-view').hidden = false;
  $('logout').hidden = !user; $('account-name').textContent = '';
  if(!user) { render(); return; }
  const {data,error} = await client.from('members').select('display_name').maybeSingle();
  if(id !== requestId) return;
  if(error) { notice('Je groepslidmaatschap kon niet worden gecontroleerd. Probeer opnieuw in te loggen.',true); return; }
  if(!data) { notice('Je bent ingelogd, maar nog geen lid van deze groep. Vraag de beheerder om jouw e-mailadres toe te voegen.',true); return; }
  member = data; $('account-name').textContent = member.display_name;
  $('login-view').hidden = true; $('agenda-view').hidden = false; notice(''); await loadEvents();
}
function openEditor(event) {
  editingId = event?.id || null; $('event-form').reset(); $('form-error').textContent = '';
  $('dialog-title').textContent = event ? 'Activiteit bewerken' : 'Nieuwe activiteit'; $('delete-event').hidden = !event;
  let start = selectedDay ? new Date(`${selectedDay}T19:00:00`) : new Date(month.getFullYear(), month.getMonth(), month.getFullYear()===new Date().getFullYear() && month.getMonth()===new Date().getMonth() ? new Date().getDate() : 1, 19);
  if(event) start = new Date(event.starts_at);
  const end = event ? new Date(event.ends_at) : new Date(start.getTime()+2*60*60*1000);
  $('title').value = event?.title || ''; $('starts').value = localInput(start); $('ends').value = localInput(end);
  $('location').value = event?.location || ''; $('description').value = event?.description || '';
  $('event-dialog').showModal(); $('title').focus();
}
function editorBusy(busy) { $('save-event').disabled = busy; $('delete-event').disabled = busy; $('close-dialog').disabled = busy; }
$('event-form').addEventListener('submit',async (e)=>{
  e.preventDefault(); if($('save-event').disabled) return;
  const start = new Date($('starts').value), end = new Date($('ends').value);
  if(!user || !member) { $('form-error').textContent = 'Log opnieuw in om op te slaan.'; return; }
  if(!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end<=start) { $('form-error').textContent = 'De eindtijd moet na de begintijd liggen.'; return; }
  const payload = {title:$('title').value.trim(),starts_at:start.toISOString(),ends_at:end.toISOString(),location:$('location').value.trim(),description:$('description').value.trim()};
  if(!payload.title) { $('form-error').textContent = 'Vul een titel in.'; return; }
  editorBusy(true); $('form-error').textContent = '';
  try {
    if(demo) {
      if(editingId) events = events.map(x=>x.id===editingId ? {...x,...payload} : x);
      else events.push({...payload,id:crypto.randomUUID(),owner_id:user.id,author_name:member.display_name});
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
  if(!editingId || !confirm('Deze activiteit verwijderen?')) return;
  editorBusy(true);
  try {
    if(demo) events = events.filter(x=>x.id !== editingId);
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
    notice('Controleer je e-mail voor de inloglink. Kijk ook in je spammap.');
  } catch {notice('De inloglink kon niet worden verstuurd. Controleer het e-mailadres of probeer het later opnieuw.',true);}
  finally {button.disabled=false;}
});
async function init() {
  render();
  if(demo) {
    user={id:'demo-member'};member={display_name:'Jij'};
    const sample = (day,hour,duration)=> {const d = new Date(month.getFullYear(),month.getMonth(),day,hour);return {starts_at:d.toISOString(),ends_at:new Date(d.getTime()+duration*3600000).toISOString()};};
    events = [
      {id:'sample-1',...sample(9,20,4),title:'Verjaardagsfeest',location:'Bij Noor thuis',description:'Een gezellige avond met de hele groep.',owner_id:'noor',author_name:'Noor'},
      {id:'sample-2',...sample(17,15,3),title:'Samen naar het park',location:'Bij de ingang van het park',description:'Neem iets lekkers mee voor de picknick.',owner_id:user.id,author_name:'Jij'},
      {id:'sample-3',...sample(24,19,4),title:'Spelletjesavond',location:'Bij Sam',description:'Neem je favoriete spel mee.',owner_id:'sam',author_name:'Sam'}
    ];
    $('login-view').hidden=true;$('agenda-view').hidden=false;$('account-name').textContent='Voorbeeldagenda';$('logout').hidden=false;
    $('footer-note').textContent='Dit is een voorbeeld met fictieve activiteiten. Er wordt niets online opgeslagen.';
    notice('Voorbeeldagenda: je wijzigingen zijn tijdelijk en verdwijnen bij het herladen.');render();return;
  }
  if(!config.supabaseUrl || !config.supabasePublishableKey) { $('setup').hidden=false;$('login-form').querySelector('button').disabled=true;return; }
  try {
    const {createClient} = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm');
    client = createClient(config.supabaseUrl,config.supabasePublishableKey);
    // Auth callbacks remain synchronous to avoid nested Supabase auth-lock calls.
    client.auth.onAuthStateChange((event,session)=>{if(event !== 'TOKEN_REFRESHED')setTimeout(()=>applySession(session).catch(()=>notice('De verbinding is onderbroken. Herlaad de pagina.',true)),0);});
    setInterval(()=>{if(user && member && !document.hidden && !$('event-dialog').open)loadEvents();},30000);
    window.addEventListener('focus',()=>{if(user && member && !$('event-dialog').open)loadEvents();});
  } catch {notice('De verbinding kon niet worden gestart. Controleer config.js en je internetverbinding.',true);}
}
init();
