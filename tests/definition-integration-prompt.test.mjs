import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DEFINITION_FLUENCY_PROMPT} from '../scripts/automation/experiments/definition-fluency-prompt.mjs';
import {DEFINITION_INTEGRATION_PROMPT,buildDefinitionIntegrationPrompt} from '../scripts/automation/experiments/definition-integration-prompt.mjs';
import {buildSentenceRewriteView,applySentenceRewrite} from '../scripts/automation/free/sentence-rewrite.mjs';
import {buildTextPreservationReview,validateTextPreservationReview} from '../scripts/automation/free/text-preservation-review.mjs';
import {assertQualifiedDefinitionReviewer} from '../scripts/automation/experiments/qualified-definition-review.mjs';

const sha=text=>createHash('sha256').update(text).digest('hex');
const original='Applicants may skip orientation only if they have an orientation waiver and have submitted proof of prior training.';
const fluent='Applicants may skip orientation only if they have written permission and have submitted proof of prior training.';

test('integration example appends style guidance without changing any prior editor instruction',()=>{
  assert.equal(sha(DEFINITION_INTEGRATION_PROMPT),'56cff94f6bc64500881a8b46e08b39d6406e1a13e6d76fdced6f007f93002433');
  assert.ok(DEFINITION_INTEGRATION_PROMPT.startsWith(DEFINITION_FLUENCY_PROMPT));
  assert.match(DEFINITION_INTEGRATION_PROMPT,/Fictional style example only — never article evidence/);
  assert.match(DEFINITION_INTEGRATION_PROMPT,/exact action and referent remain unambiguous/);
  assert.match(DEFINITION_INTEGRATION_PROMPT,/Return only the originally required JSON/);
  assert.doesNotMatch(DEFINITION_INTEGRATION_PROMPT,/HardFlow|MIT|Anthropic|intermediate sample|partial solution|requirements that must be met/);
  assert.equal(assertQualifiedDefinitionReviewer().runId,'36213351283');
});

test('example derivation refuses drift rather than silently weakening an earlier safeguard',()=>{
  for(const bad of [null,undefined,'',`${DEFINITION_FLUENCY_PROMPT}\nChanged.`,DEFINITION_FLUENCY_PROMPT.replace('110 and 225','100 and 225')]) {
    assert.throws(()=>buildDefinitionIntegrationPrompt(bad),/DEFINITION_INTEGRATION_PROMPT_DRIFT/);
  }
});

test('natural integration example retains actor, possibility and both necessary conditions',()=>{
  assert.ok(DEFINITION_INTEGRATION_PROMPT.includes(`Original: ${original}`));
  assert.ok(DEFINITION_INTEGRATION_PROMPT.includes(`Natural integration: ${fluent}`));
  for(const invariant of ['Applicants may skip orientation only if','and have submitted proof of prior training.']) {
    assert.ok(original.includes(invariant)); assert.ok(fluent.includes(invariant));
  }
  const units={headline:['Synthetic orientation procedure'],whatHappened:[original],
    whyItMatters:['The description supplies no outcome evidence.'],whatToWatch:['Additional conditions are not described.']};
  const catalog=buildSentenceRewriteView(units);
  const applied=applySentenceRewrite(units,{baselineSha256:catalog.data.baselineSha256,decision:'rewrite',
    sentences:catalog.data.units.map((unit,i)=>({unitId:unit.unitId,text:i===0?fluent:unit.text}))},catalog);
  assert.deepEqual(applied.units.whatHappened,[fluent]);
  assert.deepEqual(applied.units.headline,units.headline);
  assert.equal(applied.editsApplied.length,1);
});

test('style guidance does not turn a lost condition or added example fact into automatic approval',()=>{
  // Mock verdicts test unchanged veto wiring, not a model's semantic ability.
  for(const changed of ['Applicants may skip orientation if they have written permission.',
    'Applicants must skip orientation after submitting proof of prior training.',
    'Applicants may skip orientation, which saves every applicant two hours.']) {
    const view=buildTextPreservationReview({previousClaims:[original],claims:[changed]});
    const veto=validateTextPreservationReview({reviewSha256:view.data.reviewSha256,
      judgments:[{claimId:'C1',comparison:'Synthetic preservation veto.',meaningPreserved:false}]},view);
    assert.equal(veto.valid,true); assert.equal(veto.supported,false);
  }
});
