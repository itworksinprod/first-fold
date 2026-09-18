import test from 'node:test';
import assert from 'node:assert/strict';
import { previewNumericAnchors as tokens, previewEvidenceNumericAnchors as evidenceTokens } from '../scripts/automation/free/preview-numeric-anchors.mjs';
import { validateGroundedStory } from '../scripts/automation/free/grounded-draft.mjs';
import { advisoryDraftAlarms } from '../scripts/automation/free/preview-advisory-contract.mjs';
import { storedAdvisoryCorrectionFixture } from './fixtures/stored-advisory-correction.mjs';
import { reviewerResearchScopeCases } from './fixtures/reviewer-research-scope.mjs';
import { citationCorrectionFixture } from './fixtures/citation-correction.mjs';

function syntheticMonthCase(sourceText = 'The workspace transition starts on October 19, 2026.') {
  const { result, dossier } = citationCorrectionFixture();
  const { stories: [draft], evidenceForFields: map } = result.rejectedDiagnostic.payload;
  dossier.sources[0].passages[3].text = sourceText;
  dossier.sources[0].text = dossier.sources[0].passages.map(p => p.text).join('\n');
  draft.deck = 'Acme’s workspace rollout begins in October 2026.';
  map.deck = ['S1P4'];
  const failures = (changed = draft, evidenceMap = map, preview = true) => {
    const reasons = [];
    const valid = validateGroundedStory(changed, dossier, code => reasons.push(code),
      preview ? { previewFieldEvidence: evidenceMap } : {});
    return { valid, reasons };
  };
  return { draft, dossier, map, failures };
}

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

test('month-year references are atomic and valid complete dates support only their exact month-year', () => {
  assert.deepEqual(tokens('October 2026'), ['calendar-month:2026-10']);
  assert.deepEqual(tokens('october 2026.'), ['calendar-month:2026-10']);
  assert.deepEqual(tokens('October 19, 2026'), ['calendar:2026-10-19']);
  assert.deepEqual(evidenceTokens('October 19, 2026'), ['calendar:2026-10-19', 'calendar-month:2026-10']);
  assert.deepEqual(evidenceTokens('2026-10-19'), evidenceTokens('October 19, 2026'));
  assert.deepEqual(evidenceTokens('October 2026'), ['calendar-month:2026-10']);
  assert.ok(!evidenceTokens('October 19, 2026').includes('2026'));
  assert.ok(!evidenceTokens('October 19, 2026').includes('19'));
  assert.deepEqual(tokens('October 0000'), ['invalid-calendar-date']);
  assert.deepEqual(evidenceTokens('February 29, 2024'), ['calendar:2024-02-29', 'calendar-month:2024-02']);
  for (const invalid of ['February 29, 2026', 'October 32, 2026', '2026-13-19']) {
    assert.deepEqual(evidenceTokens(invalid), ['invalid-calendar-date']);
  }
});

test('synthetic run24 deck month-year is accepted only through its own complete-date evidence', () => {
  for (const text of ['The transition starts on October 19, 2026.', 'The transition starts on 2026-10-19.']) {
    const fixture = syntheticMonthCase(text);
    assert.deepEqual(fixture.failures(), { valid: true, reasons: [] });
    assert.ok(fixture.failures(fixture.draft, { ...fixture.map, deck: ['S1P3'] }).reasons.includes('NUMERIC_ANCHOR'));
    assert.ok(fixture.failures(fixture.draft, fixture.map, false).reasons.includes('NUMERIC_ANCHOR'), 'production branch is unchanged');
  }
});

test('preview month-year equivalence does not expose bare numbers, wrong months, wrong years or versions', () => {
  const { draft, failures } = syntheticMonthCase();
  for (const phrase of ['November 2026', 'October 2025', '2026', '19', 'version 2026.10.19', 'October 0000']) {
    const changed = structuredClone(draft); changed.deck = `Acme’s workspace rollout begins in ${phrase}.`;
    assert.ok(failures(changed).reasons.includes('NUMERIC_ANCHOR'), phrase);
  }
  for (const version of ['v2026-10-19', 'CVE-2026-10-19', 'version 2026.10.19', '2026-10-19.1', 'October 2026.1',
    'version 2026-10-19', 'v 2026-10-19', 'build: 2026-10-19', 'revision = 2026-10-19', 'release 2026-10-19',
    'version October 19, 2026', 'version October 2026']) {
    const fixture = syntheticMonthCase(`The published identifier is ${version}.`);
    assert.ok(fixture.failures().reasons.includes('NUMERIC_ANCHOR'), version);
    assert.ok(!evidenceTokens(version).some(token => token.startsWith('calendar-month:')), version);
  }
});

test('month and year cannot be combined from different dates, passages or another field', () => {
  const splitDates = syntheticMonthCase('The first stage starts October 19, 2025. Another stage starts November 20, 2026.');
  assert.ok(splitDates.failures().reasons.includes('NUMERIC_ANCHOR'));
  const splitPassages = syntheticMonthCase('October');
  splitPassages.dossier.sources[0].passages.push({ evidenceId: 'S1P7', text: '19, 2026' });
  assert.ok(splitPassages.failures(splitPassages.draft, { ...splitPassages.map, deck: ['S1P4', 'S1P7'] }).reasons.includes('NUMERIC_ANCHOR'));
  const otherField = syntheticMonthCase();
  assert.ok(otherField.failures(otherField.draft, { ...otherField.map, headline: ['S1P4'], deck: ['S1P3'] }).reasons.includes('NUMERIC_ANCHOR'));
  const invalidDate = syntheticMonthCase('The transition starts October 32, 2026.');
  assert.ok(invalidDate.failures().reasons.includes('NUMERIC_ANCHOR'));
  for (const fragments of ['October 2027-01-01 2026', 'October February 30, 2027 2026', 'October version 2027-01-01 2026']) {
    const separated = syntheticMonthCase(fragments);
    assert.ok(separated.failures().reasons.includes('NUMERIC_ANCHOR'), fragments);
    assert.ok(!evidenceTokens(fragments).includes('calendar-month:2026-10'), fragments);
  }
});

test('claim month-year uses its own complete-date support, and month-only evidence cannot invent a day', () => {
  const fixture = syntheticMonthCase('The transition starts on 2026-10-19.');
  fixture.draft.claims[0] = { text: 'Acme schedules the start of its workspace request-limit transition for October 2026, with later phases remaining separate in the source account.',
    supports: [{ evidenceId: 'S1P4' }] };
  assert.deepEqual(fixture.failures(), { valid: true, reasons: [] });
  assert.ok(fixture.failures(fixture.draft, fixture.map, false).reasons.includes('NUMERIC_CITATION'));
  const borrowed = structuredClone(fixture.draft); borrowed.claims[0].supports = [{ evidenceId: 'S1P3' }];
  assert.ok(fixture.failures(borrowed).reasons.includes('NUMERIC_CITATION'));
  const bareYear = structuredClone(fixture.draft); bareYear.claims[0].text = bareYear.claims[0].text.replace('October 2026', '2026');
  assert.ok(fixture.failures(bareYear).reasons.includes('NUMERIC_CITATION'));
  const monthOnly = syntheticMonthCase('The transition starts in October 2026.');
  const inventedDay = structuredClone(monthOnly.draft); inventedDay.deck = 'Acme’s workspace rollout begins on October 19, 2026.';
  assert.ok(monthOnly.failures(inventedDay).reasons.includes('NUMERIC_ANCHOR'));
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
