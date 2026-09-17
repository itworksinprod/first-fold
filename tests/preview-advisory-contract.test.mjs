import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { storedAdvisoryCorrectionFixture } from './fixtures/stored-advisory-correction.mjs';
import { advisoryWritingContract, advisoryDraftAlarms } from '../scripts/automation/free/preview-advisory-contract.mjs';
import { buildPreviewReviewPacket, checkPreviewReview } from '../scripts/automation/free/preview-editorial-review.mjs';
import { assertStoredCorrectionAuthority, previewStoredCorrection } from '../scripts/automation/preview-stored-correction.mjs';
import { openDiagnostic } from '../scripts/automation/private-writer-diagnostic.mjs';
import { GEMINI_LITE_MODEL } from '../scripts/automation/free/gemini-ai.mjs';
import { captureStructuredArticle } from '../scripts/automation/free/structured-article-evidence.mjs';
const { record, previousCorrection, dossier, provenance } = await storedAdvisoryCorrectionFixture();
const rawCitationGap=JSON.parse(await readFile(new URL('./fixtures/raw-citation-gap-preview.json',import.meta.url),'utf8'));
const sha = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const alarms = (draft = record.draft, map = record.evidenceForFields) => advisoryDraftAlarms(draft, dossier, map).map(a => a.code);

test('stored evidence matches run11 passages, not its original HTTP capture or review binding', () => {
  assert.equal(dossier.sources[0].passages.length, 59);
  assert.equal(sha(dossier.sources[0].passages), record.passagesSha256);
  assert.equal(sha(record.draft), record.originalDraftSha256);
  assert.equal(provenance.identicalHttpResponse, false);
  assert.equal(provenance.freshResearch, false);
  assert.equal(dossier.sources[0].articleIdentity.retrievedAt, null);
  assert.notEqual(sha(dossier), '527d57604ba33e398eb1170bf089200c0df7ebc15e5370a1a5433561563ab2f7');
});
test('outline uses supplied evidence categories without prewriting a news story', () => {
  const c = advisoryWritingContract(dossier);
  assert.deepEqual(c.outline.whyItMatters.evidenceIds, ['S1P23']);
  assert.deepEqual(c.outline.whatToDoOrWatch.evidenceIds, ['S1P23','S1P26','S1P27','S1P28']);
  assert.deepEqual(c.checks.republication, {vendor:'Siemens ProductCERT',originalDate:'2026-09-03',republicationDate:'2026-09-15'});
  assert.match(c.limitation, /not semantic approval/);
  assert.equal(advisoryWritingContract({sources:[]}), null);
  const broken=structuredClone(dossier);broken.sources[0].text+=' changed';assert.equal(advisoryWritingContract(broken),null);
});
test('untouched live citation gaps are held; exact reviewer-assisted additions resolve only those alarms',()=>{
  const raw=advisoryDraftAlarms(rawCitationGap.draft,dossier,rawCitationGap.evidenceForFields);
  assert.deepEqual(raw,[{code:'ADVISORY_HEADLINE_TECHNICAL_EVIDENCE_REQUIRED',field:'headline'},{code:'ADVISORY_ORIGIN_EVIDENCE_REQUIRED',field:'claims.0'}]);
  const d=structuredClone(rawCitationGap.draft),m=structuredClone(rawCitationGap.evidenceForFields);
  d.claims[0].supports.push({evidenceId:'S1P54'});m.headline.push('S1P18');
  assert.deepEqual(advisoryDraftAlarms(d,dossier,m),[]);
  assert.deepEqual(d.claims.map(c=>c.text),rawCitationGap.draft.claims.map(c=>c.text));
  const wrong=structuredClone(d);wrong.claims[0].supports[2]={evidenceId:'S1P54-unknown'};
  assert.ok(advisoryDraftAlarms(wrong,dossier,m).some(a=>a.code==='ADVISORY_ORIGIN_EVIDENCE_REQUIRED'));
});
test('origin evidence in another field cannot justify conversion in this claim',()=>{
  const d=structuredClone(rawCitationGap.draft),m=structuredClone(rawCitationGap.evidenceForFields);
  m.headline.push('S1P18','S1P54');
  assert.ok(advisoryDraftAlarms(d,dossier,m).some(a=>a.field==='claims.0'));
  d.claims[0].text=d.claims[0].text.replace('verbatim vendor advisory conversion','vendor conversion');
  assert.ok(advisoryDraftAlarms(d,dossier,m).some(a=>a.field==='claims.0'));
});
test('unchanged rejected run11 cannot pass the preview gate with a synthetic positive review', () => {
  assert.deepEqual(alarms(), ['ADVISORY_ATTACK_CONDITION_REQUIRED','ADVISORY_SCOPE_EVIDENCE_REQUIRED','ADVISORY_SCORE_CAUSALITY_REVIEW','ADVISORY_OPERATOR_FAULT_REVIEW','ADVISORY_FIX_COMPATIBILITY_REVIEW','ADVISORY_ORIGIN_CHRONOLOGY_REQUIRED','ADVISORY_UNPAIRED_FIX_VERSION_REVIEW']);
  const p=buildPreviewReviewPacket(record.draft,dossier,record.evidenceForFields);
  const r={version:p.version,binding:p.binding,reviewer:{kind:'independent-ai',name:'SYNTHETIC TEST',reference:'not-a-verdict'},reviewedAt:'2026-09-17T23:00:00Z',fullContextChecked:true,renderedContentChecked:true,limitations:['Synthetic test only'],fields:p.units.map(u=>({field:u.field,supportedByMappedPassages:true,conditionsPreserved:true,noUnsupportedInference:true,rationale:'Synthetic boundary test'}))};
  assert.equal(checkPreviewReview(p,r).readyForPrivatePreview,false);
});
test('original CISA advisory does not receive a fabricated vendor republication requirement', async () => {
  const {body}=JSON.parse(await readFile(new URL('./fixtures/cisa-bransys-http-main.json',import.meta.url),'utf8'));
  const url='https://www.cisa.gov/news-events/ics-advisories/icsa-26-260-01';
  const capture=await captureStructuredArticle({title:'Bransys ELD',url,publisherKey:'cisa'},async()=>({body,finalUrl:url,redirects:[]}));
  assert.equal(capture.status,'usable',JSON.stringify(capture.holds));
  const c=advisoryWritingContract({sources:[{text:capture.excerpt,structuredContext:capture.structuredContext,passages:capture.blocks.map((text,i)=>({evidenceId:`S1P${i+1}`,text}))}]});
  assert.equal(c.checks.republication,null);assert.equal(c.checks.chronologyIncomplete,false);
  assert.match(c.outline.claims.task,/Do not infer a separate vendor release/);
  assert.doesNotMatch(c.outline.claims.task,/Use the supplied exact dates/);
  assert.equal(c.checks.ambiguousRemedyLists,false);
  assert.match(c.outline.whatToDoOrWatch.task,/Identical remedy instructions/);
  const d={claims:[{text:'CISA reports read access across connected carriers.',supports:[{evidenceId:'S1P17'}]}],whatToDoOrWatch:'Check the source-stated Android and iOS update versions.'};
  const ds={sources:[{text:capture.excerpt,structuredContext:capture.structuredContext,passages:capture.blocks.map((text,i)=>({evidenceId:`S1P${i+1}`,text}))}]};
  assert.ok(advisoryDraftAlarms(d,ds,{}).some(a=>a.code==='ADVISORY_SUBSET_SCOPE_REQUIRED'));
  assert.ok(!advisoryDraftAlarms(d,ds,{}).some(a=>a.code==='ADVISORY_FIX_COMPATIBILITY_REVIEW'));
  d.claims[0].text='CISA reports read access across a subset of carriers connected to the affected broker.';
  assert.ok(!advisoryDraftAlarms(d,ds,{}).some(a=>a.code==='ADVISORY_SUBSET_SCOPE_REQUIRED'));
  const live=JSON.parse(await readFile(new URL('./fixtures/rejected-preview-run12.json',import.meta.url),'utf8')).records[2];
  const liveHolds=advisoryDraftAlarms(live.draft,ds,live.evidenceForFields);
  assert.ok(liveHolds.some(a=>a.code==='ADVISORY_SUBSET_SCOPE_REQUIRED'&&a.field==='deck'));
  assert.ok(liveHolds.some(a=>a.code==='ADVISORY_SUBSET_SCOPE_REQUIRED'&&a.field==='claims.0'));
  assert.ok(!liveHolds.some(a=>a.code==='ADVISORY_FIX_COMPATIBILITY_REVIEW'));
});
test('declared republication with missing chronology is explicitly held, not invented',()=>{
  const d=structuredClone(dossier);d.sources[0].passages=d.sources[0].passages.filter(p=>p.evidenceId!=='S1P56');
  d.sources[0].text=d.sources[0].passages.map(p=>p.text).join('\n');
  d.sources[0].structuredContext.textSha256=createHash('sha256').update(d.sources[0].text).digest('hex');
  const c=advisoryWritingContract(d);assert.equal(c.checks.republication,null);assert.equal(c.checks.chronologyIncomplete,true);
  assert.match(c.outline.claims.task,/Do not invent dates/);
  assert.ok(advisoryDraftAlarms(record.draft,d,record.evidenceForFields).some(a=>a.code==='ADVISORY_CHRONOLOGY_CONTEXT_REQUIRED'));
});
test('known-defect alarms catch nearby score-causality and operator-fault paraphrases', () => {
  for(const text of ['Its CVSS rating is high due to the industries using it.','The score is high owing to deployment worldwide.','The module is configured improperly.','This follows an incorrect deployment.','An administrator misconfiguration causes it.']) {
    const d=structuredClone(record.draft);d.whyItMatters=text;
    assert.ok(alarms(d).some(c=>['ADVISORY_SCORE_CAUSALITY_REVIEW','ADVISORY_OPERATOR_FAULT_REVIEW'].includes(c)),text);
  }
});
test('SSO qualifier must be in the deck with its own condition evidence; a cited condition elsewhere is insufficient', () => {
  const d=structuredClone(record.draft),m=structuredClone(record.evidenceForFields);
  d.deck+=' in certain single-sign-on configurations';
  assert.ok(!alarms(d,m).includes('ADVISORY_ATTACK_CONDITION_REQUIRED'));
  m.deck=['S1P1'];assert.ok(alarms(d,m).includes('ADVISORY_ATTACK_CONDITION_REQUIRED'));
});
test('alarms are not an entailment checker: unknown fabricated nonnumeric assertions still require independent review', () => {
  const d=structuredClone(record.draft),m=structuredClone(record.evidenceForFields);
  d.deck='The module issue permits account hijacking in specific SSO configurations.';
  d.whyItMatters='The product is used on the moon.';m.whyItMatters=['S1P23'];
  d.whatToDoOrWatch='Verify the compatible vendor fix for the installed branch.';m.whatToDoOrWatch=['S1P23'];
  d.claims[0].text+=' Siemens ProductCERT original release 2026-09-03; CISA republication 2026-09-15.';
  assert.deepEqual(alarms(d,m),[]); // Deliberately NOT a positive factual verdict.
});
const keys=generateKeyPairSync('rsa',{modulusLength:3072});
const settings={publicKey:keys.publicKey.export({type:'spki',format:'der'}).toString('base64'),apiKey:'synthetic-key-never-real',freeProjectConfirmation:'FREE PROJECT BILLING DISABLED'};
test('one real call budget retains the rejected response encrypted, with no retry or delivery',async()=>{
  let calls=0;
  const result=await previewStoredCorrection({...settings,fetchImpl:async(url,options)=>{
    calls++;assert.match(url,/gemini-3\.5-flash-lite:generateContent$/);
    const user=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    assert.deepEqual(user.rejectedDraft,previousCorrection.payload);
    assert.equal(user.advisoryWritingObligations.version,'advisory-writing-obligations-v1');
    return new Response(JSON.stringify({modelVersion:GEMINI_LITE_MODEL,candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify({stories:[record.draft],evidenceForFields:record.evidenceForFields})}]}}]}),{headers:{'content-type':'application/json'}});
  }});
  assert.equal(calls,1);assert.equal(result.report.status,'failed');assert.equal(result.report.modelRequests,1);
  assert.equal(result.report.emailRequests,0);assert.equal(result.report.freshResearch,false);
  assert.doesNotMatch(JSON.stringify(result),/hijacking|CVE-2026-80465|synthetic-key/);
  const opened=openDiagnostic(result.sealed,keys.privateKey);
  assert.deepEqual(opened.originalRejection,record);
  assert.deepEqual(opened.result.rejectedDiagnostic.payload.stories,[record.draft]);
  assert.equal(opened.result.html,null);
});
test('free quota, bad configuration and encryption failures cannot retry or leak inputs',async()=>{
  let calls=0;
  const result=await previewStoredCorrection({...settings,fetchImpl:async()=>{calls++;return new Response('private error text',{status:429});}});
  assert.equal(calls,1);assert.equal(result.report.code,'GEMINI_FREE_QUOTA_EXHAUSTED');
  for(const changed of [{publicKey:'bad'},{freeProjectConfirmation:'not confirmed'},{apiKey:''}])await assert.rejects(()=>previewStoredCorrection({...settings,...changed,fetchImpl:()=>assert.fail('must not call')}));
});
test('manual experiment authority and workflow never expose research or email credentials',async()=>{
  const env={GITHUB_REPOSITORY:'itworksinprod/first-fold',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'itworksinprod/first-fold/.github/workflows/gemini-stored-correction.yml@refs/heads/main',GITHUB_ACTOR:'itworksinprod',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1'};
  assert.doesNotThrow(()=>assertStoredCorrectionAuthority(env));
  for(const k of Object.keys(env))assert.throws(()=>assertStoredCorrectionAuthority({...env,[k]:'wrong'}));
  const w=await readFile(new URL('../.github/workflows/gemini-stored-correction.yml',import.meta.url),'utf8');
  assert.equal((w.match(/secrets\./g)??[]).length,1);
  assert.doesNotMatch(w,/TAVILY|RESEND|OPENAI|schedule:|contents: write/);
  assert.match(w,/persist-credentials: false/);assert.match(w,/retention-days: 1/);
});
