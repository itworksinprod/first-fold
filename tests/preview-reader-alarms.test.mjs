import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewReaderAlarms as alarms} from '../scripts/automation/free/preview-reader-alarms.mjs';
const dossier={sources:[{passages:[{evidenceId:'S1P1',text:'The vendor claims up to 30% price improvement and up to 70% compute improvement.'},
  {evidenceId:'S1P2',text:'There will be preview windows for Free and unauthenticated traffic. Signed-in paid accounts are not affected.'}]}]};
const raw=JSON.parse(readFileSync(new URL('./fixtures/rejected-preview-run12.json',import.meta.url))).records;
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
