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
    events.forEach(event => lines.push('BEGIN:VEVENT',`UID:${text(event.id)}@tekkels-agenda`,`DTSTAMP:${utc(new Date())}`,`DTSTART:${utc(event.starts_at)}`,`DTEND:${utc(event.ends_at)}`,`SUMMARY:${text(event.title)}`,`LOCATION:${text(event.location)}`,`DESCRIPTION:${text(event.description)}`,'END:VEVENT'));
    lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
  }
  function download(events, filename='groepsagenda.ics') {
    const url = URL.createObjectURL(new Blob([build(events)],{type:'text/calendar;charset=utf-8'}));
    const link = document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  return {build,download};
})();
