import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWatchComposer, composeWatchSelection} from '../scripts/automation/experiments/watch-composition.mjs';
import {watchFixture} from './fixtures/watch-fixture.mjs';
import {applyWatchQuestion} from '../scripts/automation/experiments/watch-question.mjs';

// Unrelated invented examples, not source qualification of the MIT article.
const inputFor = (measure, task, requirements, goal) => {
  const text = `For the ${task}, outputs must meet ${requirements}. An extra goal of ${goal} is optional; ${measure} is the output measure.`;
  return {passages: [{evidenceId: 'S1P20', text}], choices: [{id: 'example', concepts:
    Object.fromEntries(Object.entries({measure, task, requirements, goal}).map(([key, phrase]) =>
      [key, {phrase, evidenceId: 'S1P20', sourceSpan: phrase}]))}]};
};
const examples = [
  ['file size', 'image compression task', 'legibility requirements', 'reducing file size'],
  ['total wire length', 'circuit layout task', 'connection requirements', 'shortening the wires'],
  ['material use', 'container design task', 'strength requirements', 'reducing material use'],
];
const select = plan => ({catalogSha256: plan.catalogSha256, decision: 'add', choiceId: 'example'});

for (const example of examples) test(`generic same-task optional-goal composition: ${example[1]}`, () => {
  const plan = createWatchComposer(inputFor(...example)), result = composeWatchSelection(plan, select(plan));
  const [measure, task, requirements, goal] = example;
  assert.equal(result.question, `How would ${measure} differ for the same ${task} under the same ${requirements}, with and without the extra goal of ${goal}?`);
  assert.ok(result.question.split(/\s+/u).length <= 36);
  assert.equal(result.status, 'requires-existing-source-and-editorial-gates');
  assert.match(result.assistance, /manually-curated/);
  const fixture = watchFixture();
  // Plumbing/identity only; this synthetic fixture cannot grant factual support.
  const applied = applyWatchQuestion(fixture.plan, {...fixture.proposal, question: result.question});
  assert.equal(applied.retainedTextIdentity, true);
  assert.equal(applied.units.whatToWatch.at(-1).endsWith(result.question), true);
});

test('a selector cannot rewrite comparison roles, add free text, cross catalogs or forge a plan', () => {
  const plan = createWatchComposer(inputFor(...examples[0]));
  for (const selection of [{...select(plan), question: 'How would an exclusive operating mode work?'},
    {...select(plan), choiceId: 'unknown'}, {...select(plan), catalogSha256: '0'.repeat(64)},
    {...select(plan), decision: 'rewrite'}, {...select(plan), decision: 'abstain'}]) {
    assert.throws(() => composeWatchSelection(plan, selection), /SELECTION/);
  }
  assert.deepEqual(composeWatchSelection(plan, {catalogSha256: plan.catalogSha256, decision: 'abstain', choiceId: ''}), {decision: 'abstain'});
  assert.throws(() => composeWatchSelection(structuredClone(plan), select(plan)), /PLAN/);
  const getter = select(plan); Object.defineProperty(getter, 'choiceId', {get() {assert.fail('never invoke accessor');}});
  assert.throws(() => composeWatchSelection(plan, getter), /SELECTION/);
});

test('catalogs bind bounded source spans and reject injection, accessors, duplicates and excess length', () => {
  const input = inputFor(...examples[0]);
  for (const mutate of [x => {x.choices[0].concepts.goal.sourceSpan = 'Not in the evidence';},
    x => {x.choices[0].concepts.goal.evidenceId = 'S2P1';},
    x => {x.choices[0].concepts.goal.phrase = 'only one goal';},
    x => {x.choices[0].concepts.goal.phrase = 'guaranteeing safe operation';},
    x => {x.choices[0].concepts.goal.phrase = '<script>';},
    x => {x.choices[0].concepts.goal.phrase = 'goal\u200b';},
    x => {x.choices[0].concepts.goal.phrase = 'goal 2';},
    x => {x.choices.push(structuredClone(x.choices[0]));},
    x => {x.passages.push(structuredClone(x.passages[0]));},
    x => {x.choices = Array(2);},
    x => {x.passages = Array(2);},
    x => {x.choices[0].concepts.extra = 'new fact';},
    x => {Object.defineProperty(x.choices[0].concepts.goal, 'phrase', {get() {assert.fail('never invoke accessor');}});},
    x => {for (const slot of Object.values(x.choices[0].concepts)) slot.phrase = 'many words in each of these long slots';},
  ]) {
    const changed = structuredClone(input); mutate(changed);
    assert.throws(() => createWatchComposer(changed));
  }
});

test('catalog and evidence changes bind a new hash; issued plans are deeply frozen', () => {
  const input = inputFor(...examples[0]), plan = createWatchComposer(input);
  const changed = structuredClone(input); changed.passages[0].text += ' Another detail.';
  assert.notEqual(createWatchComposer(changed).catalogSha256, plan.catalogSha256);
  changed.passages = input.passages; changed.choices[0].concepts.goal.phrase = 'reducing the file size';
  assert.notEqual(createWatchComposer(changed).catalogSha256, plan.catalogSha256);
  input.choices[0].concepts.goal.phrase = 'changed outside';
  assert.equal(plan.data.choices[0].concepts.goal.phrase, examples[0][3]);
  assert.equal(Object.isFrozen(plan.data.choices[0].concepts.goal), true);
});

test('prototype stays outside the live diagnostic and provider workflow', async () => {
  for (const file of ['../scripts/automation/private-writer-diagnostic.mjs', '../scripts/automation/watch-diagnostic.mjs',
    '../.github/workflows/private-writer-diagnostic.yml']) {
    assert.doesNotMatch(await readFile(new URL(file, import.meta.url), 'utf8'), /watch-composition|composeWatchSelection|createWatchComposer/);
  }
});
