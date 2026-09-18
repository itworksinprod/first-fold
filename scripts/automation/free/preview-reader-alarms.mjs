// Known overstatement alarm; absence is not proof of entailment. Kept shared
// between raw writer checks and final independent-review packet reconstruction.
const phasedRollout = text => text.match(/Starting ([A-Z][a-z]+ \d{1,2}), (\d{4}),[\s\S]*Free accounts and unauthenticated requests happen first[\s\S]*Premium and Ultimate move in ([A-Z][a-z]+ \d{4})/u);
const sourceContracts = dossier => (dossier?.sources??[]).flatMap(source=>source.passages.flatMap(p=>{
  const phased=phasedRollout(p.text),absence=/A request that arrives with no credentials gets /u.test(p.text);
  return [
    ...(phased?[{kind:'phased-rollout-scope',sourceId:source.sourceId,evidenceId:p.evidenceId,text:p.text,
      instruction:'This passage explicitly separates rollout phases and audiences. Preserve the relevant audience and its date together; do not imply the first date applies to every user or subscription tier. Map any named audience to a passage that actually names it. A headline may say the rollout begins without claiming every phase begins then.'}]:[]),
    ...(absence?[{kind:'absent-credentials-scope',sourceId:source.sourceId,evidenceId:p.evidenceId,text:p.text,
      instruction:'This passage establishes behavior when credentials are absent. Do not broaden that condition to supplied-but-invalid credentials unless a cited passage separately establishes that behavior.'}]:[]),
  ];
}));
export function previewReaderObligations(dossier) {
  // Exact source passages, not summaries or inferred audience classifications.
  return [...(dossier?.sources??[]).flatMap(source=>source.passages.filter(p=>
    /preview windows for Free and unauthenticated traffic/iu.test(p.text)).map(p=>({
      kind:'preview-audience-scope',sourceId:source.sourceId,evidenceId:p.evidenceId,text:p.text,
      instruction:'If a field mentions these preview windows, preserve the source-stated audiences and any explicitly stated exemptions. Never infer an exemption or exclusion that this passage does not establish. Cite this intact passage in that field. Any other field mentioning unauthenticated traffic also needs its own passage that explicitly supports that audience. Recheck every field, including the deck; a citation elsewhere cannot supply its support.',
    }))),...sourceContracts(dossier)].slice(0,8);
}

export function previewReaderAlarms(draft, dossier, map) {
  const alarms=['headline','deck','whyItMatters','whatToDoOrWatch'].flatMap(field=>
    /\bensure[sd]?\b|\bguarantee[sd]?\b|\bprevents connection hurdles\b|\bensuring (?:that (?!your\b|the (?:installed|configured|selected)\b)|(?:service |platform )?(?:performance|responsiveness|reliability|safety))/iu.test(draft?.[field]??'')
      ? [{code:'CERTAINTY_REVIEW_REQUIRED',field}] : []);
  const units=[...['headline','deck','whyItMatters','whatToDoOrWatch'].map(field=>({field,text:draft?.[field]??'',ids:map?.[field]??[]})),
    ...(draft?.claims??[]).map((c,i)=>({field:`claims.${i}`,text:c.text,ids:c.supports?.map(s=>s.evidenceId)??[]}))];
  for(const unit of units) {
    const passages=(dossier?.sources??[]).flatMap(s=>s.passages).filter(p=>unit.ids.includes(p.evidenceId));
    const contracts=sourceContracts(dossier),mapped=passages.map(p=>p.text).join('\n');
    if(contracts.some(c=>c.kind==='phased-rollout-scope')){
      // These are source-present named populations, not a general entity or
      // entailment check. Missing own-field evidence requires semantic review.
      for(const audience of ['Free','Premium','Ultimate','unauthenticated'])if(new RegExp(`\\b${audience}\\b`,'u').test(unit.text)&&
        !new RegExp(`\\b${audience}\\b`,'u').test(mapped)&&!(audience==='unauthenticated'&&/no credentials/u.test(mapped))){
        alarms.push({code:'MAPPED_AUDIENCE_SUPPORT_REQUIRED',field:unit.field});break;
      }
      for(const c of contracts.filter(c=>c.kind==='phased-rollout-scope')){
        const phase=phasedRollout(c.text);
        if(unit.text.includes(phase[1])&&/\b(?:each user|every user|all users|all accounts|every (?:plan|tier)|all subscription tiers)\b/iu.test(unit.text)&&
          !(['Free','unauthenticated','Premium','Ultimate',phase[3]].every(value=>unit.text.includes(value)))){
          alarms.push({code:'PHASED_ROLLOUT_SCOPE_REQUIRED',field:unit.field});break;
        }
      }
    }
    if(contracts.some(c=>c.kind==='absent-credentials-scope'&&unit.ids.includes(c.evidenceId))&&
      /\b(?:without valid credentials|no valid credentials|invalid credentials)\b/iu.test(unit.text)&&
      /\b(?:receive\w*|gets?|allowance|limit\w*|cap\w*)\b/iu.test(unit.text)&&
      !/\binvalid credentials\b/iu.test(mapped))alarms.push({code:'ABSENT_CREDENTIALS_SCOPE_REQUIRED',field:unit.field});
    const publisher=dossier?.sources?.length===1?dossier.sources[0].publisher:null;
    if(publisher&&['deck','whyItMatters'].includes(unit.field)&&
      /\b(?:performance|cost[ -]effective\w*|lower\w* (?:the |their |your )?(?:total )?cost|saving[sd]?)\b/iu.test(unit.text)) {
      const name=publisher.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
      const attribution=new RegExp(`\\b(?:According to ${name}|${name} (?:says|states|reports|claims|describes|explains|notes|estimates))\\b`,'iu');
      if(!attribution.test(unit.text))alarms.push({code:'PUBLISHER_PERFORMANCE_ATTRIBUTION_REQUIRED',field:unit.field});
    }
    for(const p of passages) for(const match of p.text.matchAll(/\bup to (\d+(?:\.\d+)?)%/giu)) {
      const n=match[1].replace('.', '\\.');
      if(new RegExp(`\\b${n}(?:%| percent\\b)`,'iu').test(unit.text)&&!new RegExp(`\\bup to ${n}(?:%| percent\\b)`,'iu').test(unit.text)) alarms.push({code:'PERFORMANCE_UPPER_BOUND_REQUIRED',field:unit.field});
    }
    if(/\bpreview windows?\b/iu.test(unit.text)&&passages.some(p=>/preview windows for Free and unauthenticated traffic/iu.test(p.text))&&
      !/\bFree\b[\s\S]*\bunauthenticated\b|\bunauthenticated\b[\s\S]*\bFree\b/iu.test(unit.text)) alarms.push({code:'PREVIEW_AUDIENCE_SCOPE_REQUIRED',field:unit.field});
  }
  return alarms;
}
