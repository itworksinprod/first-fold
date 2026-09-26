import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SENTENCE_REWRITE_PROMPT } from '../scripts/automation/free/sentence-rewrite-prompt.mjs';
import { DEFINITION_FLUENCY_PROMPT, buildDefinitionFluencyPrompt } from '../scripts/automation/experiments/definition-fluency-prompt.mjs';
import { buildSentenceRewriteView, applySentenceRewrite } from '../scripts/automation/free/sentence-rewrite.mjs';
import { buildDefinitionPreservationReview, validateDefinitionPreservationReview } from '../scripts/automation/experiments/definition-preservation.mjs';
import { loadDefinitionGlossary, SYNTHETIC_DEFINITION_SOURCE } from '../scripts/automation/experiments/definition-glossaries.mjs';
import { buildIsolatedPreservationReview, validateIsolatedPreservationReview } from '../scripts/automation/free/isolated-preservation-review.mjs';
import { assertQualifiedDefinitionReviewer } from '../scripts/automation/experiments/qualified-definition-review.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');

test('fluency variant changes only the definition instruction and preserves legacy prompt bytes', () => {
  assert.equal(sha(SENTENCE_REWRITE_PROMPT), 'f67a0e2ad4b38755e35f0a6e73b2e52d7c70a8a21d0124c6dda16f02b1384267');
  assert.equal(sha(DEFINITION_FLUENCY_PROMPT), '53552e27a77bf1f5e53b3030b35e27940fe4ee78958a4b2a57c862b0be89f74c');
  const old = SENTENCE_REWRITE_PROMPT.split('\n'), current = DEFINITION_FLUENCY_PROMPT.split('\n');
  const index = old.findIndex(line => line.startsWith('Use a supplied definition only'));
  assert.notEqual(index, -1);
  assert.deepEqual(current.slice(0, index), old.slice(0, index));
  assert.deepEqual(current.slice(index + 4), old.slice(index + 1));
  assert.match(current[index], /never to add an assertion, example, or broader explanation/);
  assert.match(current[index + 1], /express that obligation explicitly at least once/);
  assert.match(current[index + 1], /original subject, scope, strength, and conditions/);
  assert.match(current[index + 2], /never remove a substantive distinction, qualifier, or condition/);
  assert.match(current[index + 3], /keep the original sentence unchanged/);
  assert.doesNotMatch(DEFINITION_FLUENCY_PROMPT, /HardFlow|MIT|Anthropic|intermediate sample|optimization formulation|meet requirements that must be met/);
  assert.equal(assertQualifiedDefinitionReviewer().runId, '36213351283');
});

test('missing, duplicate or changed derivation anchors cannot silently restore the old prompt', () => {
  const anchor = SENTENCE_REWRITE_PROMPT.split('\n').find(line => line.startsWith('Use a supplied definition only'));
  for (const bad of [undefined, null, '', SENTENCE_REWRITE_PROMPT.replace(anchor, ''),
    `${SENTENCE_REWRITE_PROMPT}\n${anchor}`, `${SENTENCE_REWRITE_PROMPT}\nAdditional instruction.`,
    SENTENCE_REWRITE_PROMPT.replace('110 and 225', '100 and 225')]) {
    assert.throws(() => buildDefinitionFluencyPrompt(bad), /DEFINITION_FLUENCY_PROMPT_DRIFT/);
  }
});

// Synthetic examples exercise containment and veto wiring, not model competence.
const baseline = () => ({ headline: ['Synthetic fluency example'],
  whatHappened: ['Its completed output satisfies all binding rules that must be followed.'],
  whyItMatters: ['The controller checks a route only when its alert is on.'],
  whatToWatch: ['The controller may reduce travel distance.'] });
function exercise(text, sourceSupported, meaningPreserved) {
  const before = baseline(), catalog = buildSentenceRewriteView(before);
  const proposal = { baselineSha256: catalog.data.baselineSha256, decision: 'rewrite',
    sentences: catalog.data.units.map((unit, i) => ({ unitId: unit.unitId, text: i === 0 ? text : unit.text })) };
  const applied = applySentenceRewrite(before, proposal, catalog);
  assert.equal(applied.units.headline[0], before.headline[0]);
  assert.deepEqual(applied.units.whyItMatters, before.whyItMatters);
  assert.deepEqual(applied.units.whatToWatch, before.whatToWatch);
  const sourceView = buildIsolatedPreservationReview({ text, claims: [text], sources: [{ publisher: 'Synthetic Evaluation Lab',
    passages: SYNTHETIC_DEFINITION_SOURCE.split('\n').map((text, i) => ({ evidenceId: `S1P${i + 1}`, text })) }] }, 'source');
  const glossary = loadDefinitionGlossary('synthetic-generation-definitions-v1', SYNTHETIC_DEFINITION_SOURCE);
  const meaningView = buildDefinitionPreservationReview({ claims: [text], previousClaims: before.whatHappened }, glossary);
  const source = validateIsolatedPreservationReview({ reviewSha256: sourceView.data.reviewSha256,
    judgments: [{ claimId: 'C1', comparison: 'Mocked gate test only.', evidenceIds: sourceSupported ? ['S1P4'] : [], sourceSupported }] }, sourceView);
  const meaning = validateDefinitionPreservationReview({ reviewSha256: meaningView.data.reviewSha256,
    judgments: [{ claimId: 'C1', comparison: 'Mocked gate test only.', meaningPreserved }] }, meaningView);
  assert.equal(source.valid, true); assert.equal(meaning.valid, true);
  return source.supported && meaning.supported;
}

test('a whole-sentence definition substitution retains structure and still needs both explicit review verdicts', () => {
  const clearer = 'Its completed output satisfies all nonoptional requirements.';
  assert.equal(exercise(clearer, true, true), true);
  assert.equal(exercise(clearer, false, true), false);
  assert.equal(exercise(clearer, true, false), false);
});

test('smooth wording or removing repetition cannot bypass a veto on lost obligations or categories', () => {
  assert.equal(exercise('Its completed output may ignore binding rules.', false, false), false);
  assert.equal(exercise('Its completed output satisfies safety rules.', true, false), false);
});
