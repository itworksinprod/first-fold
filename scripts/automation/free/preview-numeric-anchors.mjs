// Atomic calendar-date equivalence for evidence-mapped previews only. Never
// expand a date into free-standing day/year numbers or reinterpret versions.
const numbers = text => text.match(/\d+(?:[.,-]\d+)*(?:%|[a-z]+)?/gi) ?? [];
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const dates = new RegExp(`(?<![\\w.-])(?:(\\d{4})-(\\d{2})-(\\d{2})|(${months.join('|')})\\s+(\\d{1,2})(?:,\\s+|\\s+)(\\d{4}))(?![\\w-]|\\.\\d)`, 'giu');
export function previewNumericAnchors(text) {
  const anchors=[];
  const rest=text.replace(dates,(whole,y,m,d,month,day,year)=>{
    if(month){y=year;m=months.findIndex(x=>x.toLowerCase()===month.toLowerCase())+1;d=day;}
    y=Number(y);m=Number(m);d=Number(d);
    const date=new Date(Date.UTC(y,m-1,d));
    if(y<1000||y>9999||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d){anchors.push('invalid-calendar-date');return ' ';}
    anchors.push(`calendar:${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    return ' ';
  });
  return [...numbers(rest).map(x=>x.toLowerCase()),...anchors];
}
