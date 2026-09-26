import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDefinitionContext } from '../scripts/automation/experiments/definition-context.mjs';
import { buildDefinitionPreservationReview } from '../scripts/automation/experiments/definition-preservation.mjs';
import { loadDefinitionGlossary, SYNTHETIC_DEFINITION_SOURCE } from '../scripts/automation/experiments/definition-glossaries.mjs';
import { assertQualifiedDefinitionReviewer } from '../scripts/automation/experiments/qualified-definition-review.mjs';

const glossary = () => loadDefinitionGlossary('synthetic-generation-definitions-v1', SYNTHETIC_DEFINITION_SOURCE);

test('editor and reviewer share exact relevant definition, sense and source-binding entries', () => {
  const g = glossary();
  const texts = ['Binding rules constrain each draft candidate.', 'The controller checks a route.'];
  const editor = buildDefinitionContext(texts, g);
  const reviewer = buildDefinitionPreservationReview({previousClaims:texts, claims:texts}, g);
  assert.deepEqual(editor.definitions, reviewer.data.definitions);
  assert.deepEqual(editor.glossaryBinding, reviewer.data.glossaryBinding);
  assert.deepEqual(editor.definitions.map(d => d.term), ['binding rules', 'draft candidate']);
  for (const entry of editor.definitions) {
    assert.equal(entry, g.definitions.find(d => d.term === entry.term));
    assert.deepEqual(Object.keys(entry), ['term', 'definition', 'sense']);
  }
  assert.deepEqual(Object.keys(editor), ['glossaryBinding', 'definitions']);
  assert.doesNotMatch(JSON.stringify(editor), /"claims"|"passages"|"expected|"judgments"|"approved"|"rationale"/);
  assert.equal(assertQualifiedDefinitionReviewer().runId, '36213351283');
});

test('selection is minimal and respects case, singular forms and whole-word boundaries', () => {
  const g = glossary();
  assert.deepEqual(buildDefinitionContext(['A BINDING RULE applies.'], g).definitions.map(d => d.term), ['binding rule']);
  for (const text of ['nonbinding rules', 'binding rulesets', '_binding rules', 'ébinding rules',
    'binding rulesé', 'unrecognized jargon', 'nonoptional requirements']) {
    assert.deepEqual(buildDefinitionContext([text], g).definitions, []);
  }
  const context = buildDefinitionContext(['The book’s binding rules are obscure.'], g);
  assert.equal(context.definitions[0].sense, 'Requirements for completed outputs.');
  assert.equal(Object.hasOwn(context, 'supported'), false, 'A lexical match never grants semantic approval');
});

test('caller-created glossaries and invalid text lists cannot supply editor definitions', () => {
  const g = glossary();
  for (const fake of [undefined, null, {}, {...g}, structuredClone(g)]) {
    assert.throws(() => buildDefinitionContext(['Binding rules apply.'], fake), /DEFINITION_GLOSSARY_BINDING/);
  }
  for (const texts of [null, 'binding rules', {}, [null], [42], Array(1)]) {
    assert.throws(() => buildDefinitionContext(texts, g), /DEFINITION_CONTEXT_INPUT/);
  }
  assert.throws(() => loadDefinitionGlossary('synthetic-generation-definitions-v1', `${SYNTHETIC_DEFINITION_SOURCE} changed`), /DEFINITION_GLOSSARY_BINDING/);
});

test('selected context is immutable and cannot be altered through its input array', () => {
  const texts = ['Binding rules apply.'], context = buildDefinitionContext(texts, glossary());
  const before = JSON.stringify(context);
  texts[0] = 'Draft candidates change.';
  assert.equal(JSON.stringify(context), before);
  for (const value of [context, context.glossaryBinding, context.definitions, context.definitions[0]]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => { context.definitions[0].sense = 'A different sense'; }, TypeError);
  assert.throws(() => { context.definitions.push({term:'new'}); }, TypeError);
  assert.throws(() => { context.glossaryBinding.sourceSha256 = '0'.repeat(64); }, TypeError);
});

test('shared selection does not merge output-derived terms or whole-article facts into editor context', () => {
  const g = glossary();
  const original = 'Binding rules apply.', changed = 'Binding rules apply to draft candidates.';
  const editor = buildDefinitionContext([original], g);
  const reviewer = buildDefinitionPreservationReview({previousClaims:[original], claims:[changed]}, g);
  assert.deepEqual(editor.definitions.map(d => d.term), ['binding rules']);
  assert.deepEqual(reviewer.data.definitions.map(d => d.term), ['binding rules', 'draft candidates']);
  assert.deepEqual(editor.definitions[0], reviewer.data.definitions[0]);
  assert.ok(!JSON.stringify(editor).includes(SYNTHETIC_DEFINITION_SOURCE));
});
