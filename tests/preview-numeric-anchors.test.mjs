import test from 'node:test';
import assert from 'node:assert/strict';
import { previewNumericAnchors as tokens } from '../scripts/automation/free/preview-numeric-anchors.mjs';
import { validateGroundedStory } from '../scripts/automation/free/grounded-draft.mjs';
import { advisoryDraftAlarms } from '../scripts/automation/free/preview-advisory-contract.mjs';
import { storedAdvisoryCorrectionFixture } from './fixtures/stored-advisory-correction.mjs';
import { reviewerResearchScopeCases } from './fixtures/reviewer-research-scope.mjs';

test('complete valid calendar dates are atomic, format-equivalent anchors',()=>{
  assert.deepEqual(tokens('September 3, 2026 and September 15, 2026'),tokens('2026-09-03 and 2026-09-15'));
  assert.deepEqual(tokens('2024-02-29'),tokens('February 29, 2024'));
  assert.deepEqual(tokens('2026-09-03'),['calendar:2026-09-03']);
  assert.deepEqual(tokens('September 3, 2026.'),tokens('2026-09-03.'));
  assert.ok(!tokens('2026-09-03.1').some(t=>t.startsWith('calendar:')));
  for(const t of ['September 4, 2026','October 3, 2026','September 3, 2025'])assert.notDeepEqual(tokens(t),tokens('2026-09-03'));
  for(const t of ['February 30, 2026','February 29, 2026','2026-13-03','2026-09-31'])assert.deepEqual(tokens(t),['invalid-calendar-date']);
  assert.deepEqual(tokens('Version 3.6.27, 8.7 points, 75% and CVE-2026-80465'),['3.6.27','8.7','75%','2026-80465']);
  assert.ok(!tokens('CVE-2026-09-03').some(t=>t.startsWith('calendar:')));
  assert.ok(!tokens('v2026-09-03').some(t=>t.startsWith('calendar:')));
});
test('claim and analysis date equivalence uses only their own mapped evidence, leaving production unchanged',()=>{
  const {draft,dossier}=structuredClone(reviewerResearchScopeCases()[0]);
  dossier.sources[0].passages.push({evidenceId:'S1P98',text:'The originating notice publication date is 2026-09-03.'},{evidenceId:'S1P99',text:'A separate unrelated release date is 2026-10-04.'});
  dossier.sources[0].text+='\nThe originating notice publication date is 2026-09-03.\nA separate unrelated release date is 2026-10-04.';
  draft.claims[0]={text:'MIT News originally published this particular source notice on September 3, 2026.',supports:[{evidenceId:'S1P98'}]};
  const map=Object.fromEntries(['headline','deck','whyItMatters','whatToDoOrWatch'].map(f=>[f,['S1P98']]));
  const failures=(d,m=map,preview=true)=>{const r=[];validateGroundedStory(d,dossier,code=>r.push(code),preview?{previewFieldEvidence:m}:{});return r;};
  assert.ok(!failures(draft).includes('NUMERIC_CITATION'));
  assert.ok(failures(draft,map,false).includes('NUMERIC_CITATION'));
  for(const text of ['October 3, 2026','September 4, 2026','September 3, 2025','October 4, 2026','February 30, 2026','3 tasks in 2026']){
    const d=structuredClone(draft);d.claims[0].text=d.claims[0].text.replace('September 3, 2026',text);
    assert.ok(failures(d).includes('NUMERIC_CITATION'),text);
  }
  const d=structuredClone(draft);d.whatToDoOrWatch='Check the notice published on September 3, 2026, and compare the documented research scope with the requirements of your intended application before drawing conclusions about suitability outside the stated assumptions.';
  assert.ok(!failures(d).includes('NUMERIC_ANCHOR'));
  assert.ok(failures(d,{...map,whatToDoOrWatch:['S1P99']}).includes('NUMERIC_ANCHOR'));
});
test('stored correction natural chronology is no longer falsely rejected, while genuine editorial defects remain',async()=>{
  const {previousCorrection,dossier}=await storedAdvisoryCorrectionFixture();
  const {stories:[draft],evidenceForFields:map}=previousCorrection.payload;
  const reasons=[];validateGroundedStory(draft,dossier,r=>reasons.push(r),{previewFieldEvidence:map});
  assert.ok(!reasons.includes('NUMERIC_CITATION'));
  const alarms=advisoryDraftAlarms(draft,dossier,map).map(a=>a.code);
  assert.ok(!alarms.includes('ADVISORY_ORIGIN_CHRONOLOGY_REQUIRED'));
  assert.ok(alarms.includes('ADVISORY_TECHNICAL_CLAIM_EVIDENCE_REQUIRED'));
  assert.ok(alarms.includes('ADVISORY_UNPAIRED_FIX_VERSION_REVIEW'));
  assert.ok(!alarms.includes('ADVISORY_SCORE_CAUSALITY_REVIEW'));
});
