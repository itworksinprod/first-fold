// Atomic calendar-date equivalence for evidence-mapped previews only. Never
// expand a date into free-standing day/year numbers or reinterpret versions.
const numbers = text => text.match(/\d+(?:[.,-]\d+)*(?:%|[a-z]+)?/gi) ?? [];
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const dates = new RegExp(`(?<![\\w.-])(?:(\\d{4})-(\\d{2})-(\\d{2})|(${months.join('|')})\\s+(\\d{1,2})(?:,\\s+|\\s+)(\\d{4}))(?![\\w-]|\\.\\d)`, 'giu');
const monthYears = new RegExp(`(?<![\\w.-])(${months.join('|')})\\s+(\\d{4})(?![\\w-]|\\.\\d)`, 'giu');
export function previewNumericAnchors(text) {
  const anchors=[];
  const withoutDates=text.replace(dates,(whole,y,m,d,month,day,year)=>{
    if(month){y=year;m=months.findIndex(x=>x.toLowerCase()===month.toLowerCase())+1;d=day;}
    y=Number(y);m=Number(m);d=Number(d);
    const date=new Date(Date.UTC(y,m-1,d));
    if(y<1000||y>9999||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d){anchors.push('invalid-calendar-date');return ' [invalid-date] ';}
    anchors.push(`calendar:${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    // A nonnumeric separator prevents a later month-year match from joining
    // words/numbers that were originally separated by this complete date.
    return ' [calendar-date] ';
  });
  const rest=withoutDates.replace(monthYears,(_whole,month,year)=>{
    const y=Number(year),m=months.findIndex(value=>value.toLowerCase()===month.toLowerCase())+1;
    anchors.push(y<1000||y>9999?'invalid-calendar-date':`calendar-month:${y}-${String(m).padStart(2,'0')}`);
    return ' ';
  });
  return [...numbers(rest).map(x=>x.toLowerCase()),...anchors];
}

// Evidence alone can support a less precise reference to the SAME month/year.
// It cannot authorize a bare year/day, another month, or a complete date when
// the source only gives a month. Call per passage, never on joined fragments.
export function previewEvidenceNumericAnchors(text) {
  const anchors=previewNumericAnchors(text);
  // Preserve the existing full-date/number contract while preventing this new
  // month projection from treating explicitly labelled build/version IDs as
  // calendar evidence. The parser already excludes compact v/CVE prefixes.
  const omitVersion = (whole,...parts) => /\b(?:version|ver\.?|v|build|revision|rev\.?|release)\s*[:=]?\s*$/iu
    .test(parts.at(-1).slice(0,parts.at(-2))) ? ' [version-identifier] ' : whole;
  const dateEvidence=previewNumericAnchors(text.replace(dates,omitVersion).replace(monthYears,omitVersion));
  return [...anchors.filter(token=>!token.startsWith('calendar-month:')),
    ...dateEvidence.filter(token=>token.startsWith('calendar-month:')),
    ...dateEvidence.filter(token=>/^calendar:\d{4}-\d{2}-\d{2}$/u.test(token))
    .map(token=>`calendar-month:${token.slice('calendar:'.length, -3)}`)];
}
