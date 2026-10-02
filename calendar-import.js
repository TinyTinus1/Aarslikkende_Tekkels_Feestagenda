window.AgendaImport=(()=>{
 const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 async function parse(text,library){
  if(text.length>1048576)throw new Error('Het bestand is te groot (maximaal 1 MB).');
  const ICAL=library||(await import('https://cdn.jsdelivr.net/npm/ical.js@2.2.1/dist/ical.js')).default;
  let cal;try{cal=new ICAL.Component(ICAL.parse(text.replace(/^\uFEFF/,'')));}catch{throw new Error('Dit is geen leesbaar .ics-agendabestand.');}
  if(cal.name!=='vcalendar')throw new Error('Het bestand bevat geen iCalendar-agenda.');
  ICAL.TimezoneService.reset();
  for(const component of cal.getAllSubcomponents('vtimezone')){
   const tzid=component.getFirstPropertyValue('tzid');if(tzid)ICAL.TimezoneService.register(tzid,new ICAL.Timezone({component,tzid}));
  }
  const rows=[],skipped=[],seen=new Set(),entries=cal.getAllSubcomponents('vevent');
  if(entries.length>200)throw new Error('Kies een bestand met maximaal 200 activiteiten.');
  for(const component of entries){
   const title=String(component.getFirstPropertyValue('summary')||'').trim();
   try{
    if(component.hasProperty('rrule')||component.hasProperty('rdate')||component.hasProperty('recurrence-id'))throw new Error('terugkerende afspraak');
    if(String(component.getFirstPropertyValue('status')||'').toUpperCase()==='CANCELLED'||String(cal.getFirstPropertyValue('method')||'').toUpperCase()==='CANCEL')throw new Error('geannuleerde afspraak');
    if(!title||Array.from(title).length>100)throw new Error('titel ontbreekt of is langer dan 100 tekens');
    const startProp=component.getFirstProperty('dtstart');if(!startProp)throw new Error('begindatum ontbreekt');
    for(const prop of [startProp,component.getFirstProperty('dtend')].filter(Boolean)){
     const tzid=prop.getParameter('tzid');if(tzid&&!ICAL.TimezoneService.has(tzid))throw new Error('tijdzonedefinitie ontbreekt: '+tzid);
    }
    const event=new ICAL.Event(component),start=event.startDate.toJSDate();let end;
    if(component.hasProperty('dtend')||component.hasProperty('duration'))end=event.endDate.toJSDate();
    else{end=new Date(start);if(event.startDate.isDate)end.setDate(end.getDate()+1);else end.setHours(end.getHours()+1);}
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error('ongeldige begin- of eindtijd');
    const location=String(event.location||''),description=String(event.description||'');
    if(Array.from(location).length>200||Array.from(description).length>2000)throw new Error('adres of beschrijving is te lang');
    const row={title,starts_at:start.toISOString(),ends_at:end.toISOString(),location,description};
    row.import_key=await digest(event.uid?'uid:'+event.uid:'event:'+JSON.stringify(row));
    if(seen.has(row.import_key))throw new Error('dubbele activiteit in bestand');seen.add(row.import_key);rows.push(row);
   }catch(error){skipped.push((title||'Naamloze activiteit')+': '+error.message);}
  }
  return {rows,skipped,total:entries.length};
 }
 return {parse};
})();
