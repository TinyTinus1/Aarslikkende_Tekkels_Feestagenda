// iCalendar (RFC 5545): UTC-tijden, CRLF, escaping en UTF-8-regelvouwen.
window.AgendaExport = (() => {
  const text = value => String(value || '').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');
  const utc = value => new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  function fold(line) {
    const encoder = new TextEncoder(); let result = '', size = 0;
    for(const char of line) {
      const bytes = encoder.encode(char).length;
      if(size + bytes > 75) {result += '\r\n ';size = 1;}
      result += char;size += bytes;
    }
    return result;
  }
  function build(events) {
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tekkels//Groepsagenda//NL','CALSCALE:GREGORIAN'];
    if(events.some(e=>!e.all_day && e.recurrence && e.recurrence!=='none')) lines.push('BEGIN:VTIMEZONE','TZID:Europe/Amsterdam','BEGIN:DAYLIGHT','DTSTART:19960331T020000','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','END:DAYLIGHT','BEGIN:STANDARD','DTSTART:19961027T030000','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','END:STANDARD','END:VTIMEZONE');
    const wall=(value)=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+p.month+p.day+'T'+p.hour+p.minute+p.second;};
    const emitted=new Set();
    events.forEach(event => {if(emitted.has(event.id))return;emitted.add(event.id);const recurring=event.recurrence&&event.recurrence!=='none',start=event.series_starts_at||event.starts_at,end=event.series_ends_at||event.ends_at;const dateLines=event.all_day?[`DTSTART;VALUE=DATE:${wall(start).slice(0,8)}`,`DTEND;VALUE=DATE:${wall(end).slice(0,8)}`]:recurring?[`DTSTART;TZID=Europe/Amsterdam:${wall(start)}`,`DTEND;TZID=Europe/Amsterdam:${wall(end)}`]:[`DTSTART:${utc(start)}`,`DTEND:${utc(end)}`];
    const repeat=recurring?['RRULE:FREQ='+({daily:'DAILY',weekly:'WEEKLY',yearly:'YEARLY'})[event.recurrence]+(event.recurrence==='yearly'&&wall(start).slice(4,8)==='0229'?';BYMONTH=2;BYMONTHDAY=-1':'')]:[];
    lines.push('BEGIN:VEVENT',`UID:${text(event.id)}@tekkels-agenda`,`DTSTAMP:${utc(new Date())}`,...dateLines,...repeat,`SUMMARY:${text(event.title)}`,`LOCATION:${text(event.location)}`,`DESCRIPTION:${text(event.description)}`,'END:VEVENT');});
    lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
  }
  function download(events, filename='groepsagenda.ics') {
    const url = URL.createObjectURL(new Blob([build(events)],{type:'text/calendar;charset=utf-8'}));
    const link = document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  return {build,download};
})();
