import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewReaderAlarms as alarms,previewReaderObligations} from '../scripts/automation/free/preview-reader-alarms.mjs';
const dossier={sources:[{passages:[{evidenceId:'S1P1',text:'The vendor claims up to 30% price improvement and up to 70% compute improvement.'},
  {evidenceId:'S1P2',text:'There will be preview windows for Free and unauthenticated traffic. Signed-in paid accounts are not affected.'}]}]};
const raw=JSON.parse(readFileSync(new URL('./fixtures/rejected-preview-run12.json',import.meta.url))).records;
const run13=JSON.parse(readFileSync(new URL('./fixtures/rejected-preview-run13.json',import.meta.url))).records;
const run20=JSON.parse(readFileSync(new URL('./fixtures/rejected-preview-run20.json',import.meta.url))).records[0];
test('untouched run20 catches all four independently identified defects, not the supported watch or headline',()=>{
  const copy=structuredClone(run20),found=alarms(run20.draft,run20.dossier,run20.evidenceForFields);
  assert.deepEqual(found,[{code:'CERTAINTY_REVIEW_REQUIRED',field:'whyItMatters'},
    {code:'MAPPED_AUDIENCE_SUPPORT_REQUIRED',field:'deck'},
    {code:'PHASED_ROLLOUT_SCOPE_REQUIRED',field:'claims.0'},
    {code:'ABSENT_CREDENTIALS_SCOPE_REQUIRED',field:'claims.1'}]);
  assert.deepEqual(run20,copy);
});
test('own audience citation and complete phased conditions are required, not a universal date',()=>{
  const ds=run20.dossier,map={deck:['S1P2']};
  const deck='Free accounts and unauthenticated requests are the initial audience.';
  assert.ok(alarms({deck},ds,map).some(a=>a.code==='MAPPED_AUDIENCE_SUPPORT_REQUIRED'));
  assert.deepEqual(alarms({deck},ds,{deck:['S1P4']}),[]);
  assert.deepEqual(alarms({headline:'GitLab rollout begins in October'},ds,{headline:['S1P4']}),[]);
  assert.deepEqual(alarms({claims:[{text:'Each user moves by tier: Free and unauthenticated requests on October 19, Premium and Ultimate in January 2027.',supports:[{evidenceId:'S1P4'}]}]},ds,{}),[]);
  const changed=structuredClone(ds);changed.sources[0].passages[3].text=changed.sources[0].passages[3].text.replaceAll('October 19','November 20').replaceAll('January 2027','March 2027');
  const obligations=previewReaderObligations(changed).filter(o=>o.kind==='phased-rollout-scope');
  assert.equal(obligations.length,1);assert.match(obligations[0].text,/November 20/);assert.match(obligations[0].text,/March 2027/);
  assert.doesNotMatch(obligations[0].instruction,/October|January|2026|2027/);
  assert.ok(alarms({claims:[{text:'Each user gets new limits on November 20.',supports:[{evidenceId:'S1P4'}]}]},changed,{}).some(a=>a.code==='PHASED_ROLLOUT_SCOPE_REQUIRED'));
  changed.sources[0].passages[3].text='All plans change together; no phased rollout is documented.';
  assert.equal(previewReaderObligations(changed).filter(o=>o.kind==='phased-rollout-scope').length,0);
});
test('missing credentials cannot become invalid credentials; ordinary verification advice is not a guarantee',()=>{
  const ds=run20.dossier,c=text=>({claims:[{text,supports:[{evidenceId:'S1P7'}]}]});
  assert.deepEqual(alarms(c('Requests with no credentials receive a limited allowance.'),ds,{}),[]);
  assert.ok(alarms(c('Requests with invalid credentials receive a limited allowance.'),ds,{}).some(a=>a.code==='ABSENT_CREDENTIALS_SCOPE_REQUIRED'));
  const explicit=structuredClone(ds);explicit.sources[0].passages[6].text+=' Requests with invalid credentials receive the same allowance.';
  assert.deepEqual(alarms(c('Requests with invalid credentials receive the same allowance.'),explicit,{}),[]);
  assert.deepEqual(alarms({whatToDoOrWatch:'Consider ensuring that your settings match the documented configuration.'},ds,{}),[]);
  assert.ok(alarms({whyItMatters:'The limits protect speed, ensuring that heavy workloads do not slow other users.'},ds,{}).some(a=>a.code==='CERTAINTY_REVIEW_REQUIRED'));
});
test('untouched live AWS deck and analysis need their own performance attribution',()=>{
  const ds={sources:[{publisher:'AWS',passages:[]}]};
  const held=alarms(run13[1].draft,ds,run13[1].evidenceForFields);
  for(const field of ['deck','whyItMatters'])assert.ok(held.some(a=>a.field===field&&a.code==='PUBLISHER_PERFORMANCE_ATTRIBUTION_REQUIRED'));
  for(const text of ['AWS says this offers better performance.','According to AWS, this is a cost-effective option.'])assert.deepEqual(alarms({deck:text},ds,{}),[]);
  assert.ok(alarms({deck:'Customers of AWS get better performance.'},ds,{}).some(a=>a.code==='PUBLISHER_PERFORMANCE_ATTRIBUTION_REQUIRED'));
  assert.deepEqual(alarms({deck:'The change applies to the listed regions.'},ds,{}),[]);
});
test('untouched live GitLab guarantee and AWS lost upper bound are negative regressions',()=>{
  assert.ok(alarms(raw[0].draft).some(a=>a.code==='CERTAINTY_REVIEW_REQUIRED'));
  const ds={sources:[{passages:[{evidenceId:'S1P3',text:'The vendor reports up to 70% higher compute performance.'}]}]};
  assert.ok(alarms(raw[1].draft,ds,raw[1].evidenceForFields).some(a=>a.field==='claims.1'&&a.code==='PERFORMANCE_UPPER_BOUND_REQUIRED'));
});
test('known live guarantee forms remain held rather than becoming performance assurances',()=>{
  for(const wording of ['ensure','ensures','guarantee','guarantees'])assert.ok(alarms({whyItMatters:`These controls ${wording} performance for everyone.`}).some(a=>a.code==='CERTAINTY_REVIEW_REQUIRED'));
  assert.deepEqual(alarms({whyItMatters:'The vendor describes the change as a way to manage demand.'}),[]);
});
test('every percentage keeps its own upper bound, not another figure’s qualifier',()=>{
  const c=text=>({claims:[{text,supports:[{evidenceId:'S1P1'}]}]});
  assert.ok(alarms(c('The vendor reports up to 30% price improvement and 70% compute improvement.'),dossier,{}).some(a=>a.code==='PERFORMANCE_UPPER_BOUND_REQUIRED'));
  assert.deepEqual(alarms(c('The vendor reports up to 30% price improvement and up to 70 percent compute improvement.'),dossier,{}),[]);
  assert.deepEqual(alarms(c('The vendor reports improved price performance.'),dossier,{}),[]);
});
test('preview-window scope cannot disappear from a field that cites the limited audience',()=>{
  const map={whyItMatters:['S1P2']};
  assert.ok(alarms({whyItMatters:'The preview windows let teams test the changes.'},dossier,map).some(a=>a.code==='PREVIEW_AUDIENCE_SCOPE_REQUIRED'));
  assert.deepEqual(alarms({whyItMatters:'The preview windows cover Free accounts and unauthenticated traffic, not authenticated paid accounts.'},dossier,map),[]);
});
