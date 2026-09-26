import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DEFINITION_INTEGRATION_PROMPT} from '../scripts/automation/experiments/definition-integration-prompt.mjs';
import {DEFINITION_COMPOSITION_PROMPT,buildDefinitionCompositionPrompt} from '../scripts/automation/experiments/definition-composition-prompt.mjs';
import {assertQualifiedDefinitionReviewer} from '../scripts/automation/experiments/qualified-definition-review.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');

test('composition experiment replaces only the term-first priority instruction', () => {
  assert.equal(sha(DEFINITION_COMPOSITION_PROMPT),'936ce587507b25fe0298722062db5f03c6b96df5b2a1d504210fc9aea0687a7e');
  const prior=DEFINITION_INTEGRATION_PROMPT.split('\n'), current=DEFINITION_COMPOSITION_PROMPT.split('\n');
  assert.equal(prior.length,current.length);
  const changed=prior.flatMap((line,i)=>line===current[i]?[]:[i]);
  assert.equal(changed.length,1);
  assert.match(prior[changed[0]],/Prioritize replacing that term.*before considering structural edits/);
  assert.match(current[changed[0]],/compose its containing sentence naturally/);
  assert.match(current[changed[0]],/Definition wording need not be copied verbatim/);
  assert.match(current[changed[0]],/complete meaning, grammatical kind, stated sense, scope, and conditions/);
  assert.match(current[changed[0]],/Do not introduce any concept or assertion absent from the original sentence/);
  assert.doesNotMatch(DEFINITION_COMPOSITION_PROMPT,/Prioritize replacing that term|HardFlow|MIT|Anthropic|intermediate sample|partial solution/);
});

test('composition preserves all prior output, evidence, length and uncertainty safeguards', () => {
  for (const line of DEFINITION_INTEGRATION_PROMPT.split('\n').filter(line=>!line.startsWith('First look for'))) {
    assert.ok(DEFINITION_COMPOSITION_PROMPT.split('\n').includes(line));
  }
  assert.match(DEFINITION_COMPOSITION_PROMPT,/110 and 225 words/);
  assert.match(DEFINITION_COMPOSITION_PROMPT,/headline.*immutable/);
  assert.match(DEFINITION_COMPOSITION_PROMPT,/attribution.*uncertainty.*negation.*caveat/);
  assert.match(DEFINITION_COMPOSITION_PROMPT,/independent source and meaning review/);
  assert.equal(assertQualifiedDefinitionReviewer().runId,'36213351283');
});

test('composition fails closed on predecessor instruction or policy drift', () => {
  for(const bad of [null,undefined,'',DEFINITION_INTEGRATION_PROMPT+'\nExtra.',
    DEFINITION_INTEGRATION_PROMPT.replace('110 and 225','100 and 225'),
    DEFINITION_INTEGRATION_PROMPT.replace('Prioritize replacing','Prefer replacing')]) {
    assert.throws(()=>buildDefinitionCompositionPrompt(bad),/DEFINITION_COMPOSITION_PROMPT_DRIFT/);
  }
  assert.equal(sha(DEFINITION_INTEGRATION_PROMPT),'56cff94f6bc64500881a8b46e08b39d6406e1a13e6d76fdced6f007f93002433');
});
