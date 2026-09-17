// Known overstatement alarm; absence is not proof of entailment. Kept shared
// between raw writer checks and final independent-review packet reconstruction.
export function previewReaderAlarms(draft, dossier, map) {
  const alarms=['headline','deck','whyItMatters','whatToDoOrWatch'].flatMap(field=>
    /\bensure[sd]?\b|\bguarantee[sd]?\b|\bprevents connection hurdles\b/iu.test(draft?.[field]??'')
      ? [{code:'CERTAINTY_REVIEW_REQUIRED',field}] : []);
  const units=[...['headline','deck','whyItMatters','whatToDoOrWatch'].map(field=>({field,text:draft?.[field]??'',ids:map?.[field]??[]})),
    ...(draft?.claims??[]).map((c,i)=>({field:`claims.${i}`,text:c.text,ids:c.supports?.map(s=>s.evidenceId)??[]}))];
  for(const unit of units) {
    const passages=(dossier?.sources??[]).flatMap(s=>s.passages).filter(p=>unit.ids.includes(p.evidenceId));
    for(const p of passages) for(const match of p.text.matchAll(/\bup to (\d+(?:\.\d+)?)%/giu)) {
      const n=match[1].replace('.', '\\.');
      if(new RegExp(`\\b${n}(?:%| percent\\b)`,'iu').test(unit.text)&&!new RegExp(`\\bup to ${n}(?:%| percent\\b)`,'iu').test(unit.text)) alarms.push({code:'PERFORMANCE_UPPER_BOUND_REQUIRED',field:unit.field});
    }
    if(/\bpreview windows?\b/iu.test(unit.text)&&passages.some(p=>/preview windows for Free and unauthenticated traffic/iu.test(p.text))&&
      !/\bFree\b[\s\S]*\bunauthenticated\b|\bunauthenticated\b[\s\S]*\bFree\b/iu.test(unit.text)) alarms.push({code:'PREVIEW_AUDIENCE_SCOPE_REQUIRED',field:unit.field});
  }
  return alarms;
}
