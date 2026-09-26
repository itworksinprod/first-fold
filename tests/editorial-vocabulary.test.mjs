import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildEditorialVocabulary,EDITORIAL_VOCABULARY_PROMPT} from '../scripts/automation/experiments/editorial-vocabulary.mjs';
import {loadDefinitionGlossary,SYNTHETIC_DEFINITION_SOURCE} from '../scripts/automation/experiments/definition-glossaries.mjs';
import {buildDefinitionContext} from '../scripts/automation/experiments/definition-context.mjs';
import {buildDefinitionPreservationReview} from '../scripts/automation/experiments/definition-preservation.mjs';
import {DEFINITION_COMPOSITION_PROMPT} from '../scripts/automation/experiments/definition-composition-prompt.mjs';
import {assertQualifiedDefinitionReviewer} from '../scripts/automation/experiments/qualified-definition-review.mjs';
const glossary=()=>loadDefinitionGlossary('synthetic-generation-definitions-v1',SYNTHETIC_DEFINITION_SOURCE);

test('optional reviewed wording is separately bound to canonical source and manifest',()=>{
  const g=glossary(),context=buildEditorialVocabulary(['Binding rules apply.'],g);
  assert.deepEqual(context.wordingHints,[{term:'binding rules',phrase:'mandatory requirements'}]);
  assert.deepEqual(context.wordingPolicy,{id:'reviewed-editor-wording-v1',sourceSha256:g.sourceSha256,
    glossaryManifestSha256:g.manifestSha256,wordingSha256:'ed34e99a0266da1a6e0792d62c7e13838385e2dddb6f8e84b6d5b020cc6ef482'});
  assert.doesNotMatch(JSON.stringify(context),/"supported"|"approved"|"expected"|"facts"|"passages"/);
});
test('wording selection is minimal and preserves explicit reviewed singular/plural forms',()=>{
  const g=glossary();
  assert.deepEqual(buildEditorialVocabulary(['A BINDING RULE applies.'],g).wordingHints,
    [{term:'binding rule',phrase:'a mandatory requirement'}]);
  for(const text of ['draft candidates','binding rulesets','nonbinding rules','ébinding rules','binding rules_']) {
    assert.deepEqual(buildEditorialVocabulary([text],g).wordingHints,[]);
  }
  assert.deepEqual(buildEditorialVocabulary(['Binding rules are mentioned twice: binding rules.'],g).wordingHints,
    [{term:'binding rules',phrase:'mandatory requirements'}]);
});
test('wording context is immutable and cannot be caller-supplied or source-drifted',()=>{
  const g=glossary(),texts=['Binding rules apply.'],context=buildEditorialVocabulary(texts,g);
  for(const forged of [null,undefined,{},structuredClone(g),{...g}]) {
    assert.throws(()=>buildEditorialVocabulary(texts,forged),/DEFINITION_GLOSSARY_BINDING/);
  }
  for(const bad of [null,{},'Binding rules',Array(1),[42]]) {
    assert.throws(()=>buildEditorialVocabulary(bad,g),/DEFINITION_CONTEXT_INPUT/);
  }
  assert.throws(()=>loadDefinitionGlossary(g.id,SYNTHETIC_DEFINITION_SOURCE+' drift'),/DEFINITION_GLOSSARY_BINDING/);
  texts[0]='No reviewed term.';assert.equal(context.wordingHints.length,1);
  for(const value of [context,context.wordingPolicy,context.wordingHints,context.wordingHints[0]])assert.ok(Object.isFrozen(value));
  assert.throws(()=>{context.wordingHints[0].phrase='optional rules';},TypeError);
});
test('editor hints never replace reviewer definitions, senses or qualification',()=>{
  const g=glossary(),before=['Binding rules constrain the completed output.'];
  const prior=buildDefinitionPreservationReview({previousClaims:before,claims:['Mandatory requirements constrain the completed output.']},g);
  const canonical=buildDefinitionContext(before,g);buildEditorialVocabulary(before,g);
  const after=buildDefinitionPreservationReview({previousClaims:before,claims:['Mandatory requirements constrain the completed output.']},g);
  assert.deepEqual(after,prior);assert.deepEqual(after.data.definitions,canonical.definitions);
  assert.equal(after.data.wordingHints,undefined);assert.equal(after.data.wordingPolicy,undefined);
  assert.equal(assertQualifiedDefinitionReviewer().runId,'36213351283');
});
test('editor instruction retains predecessor and makes wording optional, not new evidence',()=>{
  assert.equal(createHash('sha256').update(EDITORIAL_VOCABULARY_PROMPT).digest('hex'),
    '819f782fdfe725449e85b05fcfd34664ba0c28c61f2f66e9c5b38fd6e0bd7c8c');
  assert.ok(EDITORIAL_VOCABULARY_PROMPT.startsWith(DEFINITION_COMPOSITION_PROMPT));
  assert.match(EDITORIAL_VOCABULARY_PROMPT,/manually reviewed term-level language suggestions, not new evidence/);
  assert.match(EDITORIAL_VOCABULARY_PROMPT,/canonical definition, sense, scope and grammatical role/);
  assert.match(EDITORIAL_VOCABULARY_PROMPT,/never authorizes adding a fact, changing a condition, forcing a rewrite, or passing any review/);
  assert.doesNotMatch(EDITORIAL_VOCABULARY_PROMPT,/mandatory requirements|HardFlow|MIT|Anthropic/);
});
