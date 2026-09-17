import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewMechanicalRepairAllowed as allowed} from '../scripts/automation/preview-fresh-gemini.mjs';
const raw=JSON.parse(readFileSync(new URL('./fixtures/rejected-preview-run14.json',import.meta.url))).records;
test('untouched live vocabulary and copying failures qualify only for bounded correction, not acceptance',()=>{
  for(const record of raw)assert.equal(allowed(record),true);
  assert.equal(raw[0].report.structuralErrors[0],'SHAPE');
  assert.match(raw[0].rejectedDiagnostic.payload.stories[0].whatToDoOrWatch,/personal access token/);
});
test('shape repairs require recognized field feedback; quota and semantic failures cannot consume a repair',()=>{
  for(const changed of [
    {report:{code:'GEMINI_FREE_QUOTA_EXHAUSTED'}},
    {report:{code:'GEMINI_EDITORIAL_VALIDATION_FAILED',structuralErrors:['ADVISORY_SUBSET_SCOPE_REQUIRED']}},
    {report:{code:'GEMINI_EDITORIAL_VALIDATION_FAILED',structuralErrors:'SHAPE'}},
    {rejectedDiagnostic:{rejectionDetails:[null]}},
    {rejectedDiagnostic:{rejectionDetails:[{reason:'SHAPE',feedback:{field:'story'}}]}},
    {rejectedDiagnostic:{rejectionDetails:[{reason:'ORIGINALITY',feedback:{field:'unknown'}}]}},
  ])assert.equal(allowed({...raw[0],...changed}),false);
  const altered=structuredClone(raw[0]);
  altered.rejectedDiagnostic.rejectionDetails[0].feedback.actualCharacters++;
  assert.equal(allowed(altered),false);
  const ordinary=structuredClone(raw[0]);
  ordinary.rejectedDiagnostic.payload.stories[0].whatToDoOrWatch=ordinary.rejectedDiagnostic.payload.stories[0].whatToDoOrWatch.replace('access token','credential');
  ordinary.rejectedDiagnostic.rejectionDetails[0].feedback.actualCharacters=ordinary.rejectedDiagnostic.payload.stories[0].whatToDoOrWatch.length;
  assert.equal(allowed(ordinary),false,'unexplained in-bounds SHAPE must not trigger speculative repair');
});
