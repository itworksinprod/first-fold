import test from 'node:test';
import assert from 'node:assert/strict';
import { assertQualifiedDefinitionReviewer, validateDefinitionReviewerIdentity,
  loadQualifiedMitGlossary, DEFINITION_REVIEW_QUALIFICATION } from '../scripts/automation/experiments/qualified-definition-review.mjs';
import { SYNTHETIC_DEFINITION_SOURCE } from '../scripts/automation/experiments/definition-glossaries.mjs';

test('current reviewer identities match the independently audited live qualification', () => {
  const receipt = assertQualifiedDefinitionReviewer();
  assert.equal(receipt.runId, '36213351283');
  assert.equal(receipt.scope, 'fixed-controls-only-not-article-approval');
  assert.equal(Object.isFrozen(receipt), true);
});
test('model, either prompt, control set and glossary identity drift invalidate qualification', () => {
  for (const key of ['model', 'sourcePromptSha256', 'meaningPromptSha256', 'caseSetSha256',
    'syntheticManifestSha256', 'syntheticSourceSha256']) {
    assert.throws(() => validateDefinitionReviewerIdentity({ ...DEFINITION_REVIEW_QUALIFICATION, [key]: 'changed' }),
      /DEFINITION_QUALIFICATION_CHANGED/);
  }
  assert.throws(() => validateDefinitionReviewerIdentity(null), /DEFINITION_QUALIFICATION_CHANGED/);
});
test('production glossary loader refuses synthetic and unbound source content', () => {
  for (const text of [SYNTHETIC_DEFINITION_SOURCE, '', 'A caller claims these definitions are approved.', null]) {
    assert.throws(() => loadQualifiedMitGlossary(text), /DEFINITION_GLOSSARY_BINDING/);
  }
});
