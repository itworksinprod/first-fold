import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {watchFixture} from './fixtures/watch-fixture.mjs';
import {sha} from './fixtures/significance-fixture.mjs';
import {buildWatchPlan, decodeWatchPacket, loadWatchPlan, applyWatchQuestion,
  buildWatchFieldReview, watchSourceRequest, WATCH_PROMPT, WATCH_PASSAGES, WATCH_LABEL} from '../scripts/automation/experiments/watch-question.mjs';
import {prepareWatchDiagnostic, resolvePrivateWriterDiagnosticMode, diagnoseOneWriter} from '../scripts/automation/private-writer-diagnostic.mjs';

test('one labeled editorial question preserves every old unit, order and headline byte-for-byte', () => {
  const {plan, proposal} = watchFixture(), before = JSON.stringify(plan);
  const result = applyWatchQuestion(plan, proposal);
  assert.equal(result.retainedTextIdentity, true);
  for (const field of ['headline', 'whatHappened', 'whyItMatters']) assert.deepEqual(result.units[field], plan.baseline.units[field]);
  assert.deepEqual(result.units.whatToWatch, [...plan.baseline.units.whatToWatch, WATCH_LABEL + proposal.question]);
  assert.equal(JSON.stringify(plan), before);
  assert.deepEqual(plan.data.allowedContext.map(p => p.evidenceId), WATCH_PASSAGES);
  assert.equal(Object.isFrozen(plan.baseline.units.whatHappened), true);
});

test('response boundaries reject edits, getters, multiple sentences, questions and markup', () => {
  const {plan, proposal} = watchFixture();
  const getter = {...proposal}; Object.defineProperty(getter, 'question', {get: () => assert.fail('must not invoke getter')});
  for (const value of [null, {...proposal, headline: 'Changed'}, {...proposal, baselineSha256: '0'.repeat(64)}, getter,
    {...proposal, decision: 'rewrite'}, {...proposal, decision: 'abstain'},
    ...['', ' unfinished?', 'What changed', 'First sentence. What next?', 'What changed? What next?',
      'What changed. another thing?', 'What <script> changed?', 'What hidden\u200b text?', 'What line\nbreak?',
      'What ' + 'word '.repeat(36) + 'next?', 'What changed: today?', 'What changed? extra']
      .map(question => ({...proposal, question}))]) assert.throws(() => applyWatchQuestion(plan, value));
  assert.deepEqual(applyWatchQuestion(plan, {...proposal, decision: 'abstain', question: ''}), {decision: 'abstain'});
  assert.throws(() => applyWatchQuestion(structuredClone(plan), proposal), /PLAN_INVALID/);
});

test('whole-body ceiling, baseline hashes and source context remain enforced', () => {
  const {packet, proposal} = watchFixture();
  for (const changed of [{...packet, draftSha256: '0'.repeat(64)},
    {...packet, source: {...packet.source, excerptSha256: '0'.repeat(64)}},
    {...packet, units: {...packet.units, whatToWatch: [...packet.units.whatToWatch, 'Another sentence.']}}]) {
    assert.throws(() => buildWatchPlan(changed));
  }
  const nearLimit = structuredClone(packet);
  const otherWords = ['whatHappened', 'whyItMatters'].flatMap(f => nearLimit.units[f]).join(' ').split(/\s+/u).length;
  nearLimit.units.whatToWatch = [Array.from({length: 220 - otherWords}, () => 'word').join(' ') + '.'];
  nearLimit.draftSha256 = sha(JSON.stringify(Object.fromEntries(Object.entries(nearLimit.units).map(([k,v]) => [k,v.join(' ')]))));
  const plan = buildWatchPlan(nearLimit);
  assert.throws(() => applyWatchQuestion(plan, {...proposal, baselineSha256: plan.data.baselineSha256}), /LENGTH/);
  const missing = structuredClone(packet); missing.source.excerpt = 'Only one source passage.';
  missing.source.excerptSha256 = sha(missing.source.excerpt);
  assert.throws(() => buildWatchPlan(missing), /CONTEXT_INVALID/);
});

test('known risky presuppositions and new numbers are vetoed without claiming a semantic proof', () => {
  const {plan, proposal} = watchFixture();
  for (const question of ['Can it guarantee safe results?', 'Will deployment begin soon?', 'When is a release scheduled?',
    'Can it prevent accidents?', 'What announced tests come next?', 'Could it ensure correctness?',
    'Can it eliminate failures?', 'Will the rollout start?', 'Could launch happen soon?',
    'Could ｇｕａｒａｎｔｅｅｓ follow?', 'Could results improve by 5 percent?', 'Will ２０２７ tests follow?',
    'Will upcoming studies compare the results?', 'Will forthcoming studies test more quality goals?',
    'Could planned tests answer this question?', 'What will expected trials show?', 'Will ｕｐｃｏｍｉｎｇ studies test the results?']) {
    assert.throws(() => applyWatchQuestion(plan, {...proposal, question}));
  }
  assert.match(WATCH_PROMPT, /not a statement of the publisher's plans/);
  assert.match(WATCH_PROMPT, /Do not recast a demonstrated result as an unresolved question/);
  assert.match(WATCH_PROMPT, /ONLY allowedContext/);
  assert.match(WATCH_PROMPT, /Frame additional evidence as hypothetical/);
});

test('all four fields reviewed, added question premises scoped only to two saved passages', () => {
  const {plan, proposal} = watchFixture(), result = applyWatchQuestion(plan, proposal);
  for (const field of ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch']) {
    const view = buildWatchFieldReview(plan, result, field);
    assert.equal(view.data.policy, 'isolated-claimwise-source-v1');
    assert.equal(view.data.claims.length, result.units[field].length);
    assert.equal(view.data.passages.some(p => p.evidenceId === 'S2P1'), ['whatHappened', 'whatToWatch'].includes(field));
    const request = watchSourceRequest(view, field);
    assert.deepEqual(request.data, view.data); assert.deepEqual(request.schema, view.schema);
    if (field === 'whatToWatch') {
      assert.ok(request.prompt.startsWith(view.prompt));
      assert.match(request.prompt, /C2 is explicitly First Fold's editorial watch question/);
      assert.match(request.prompt, /using ONLY S1P5, S1P20/);
      assert.match(request.prompt, /True means source-supported factual premises, not that the question's future answer is established/);
      assert.match(request.prompt, /For the other claimIds use the full supplied evidence/);
    } else assert.equal(request, view);
  }
  for (const mutate of [r => {r.draft.headline = 'Changed';}, r => {r.units.whatHappened[0] = 'Changed';},
    r => {r.units.whatToWatch.reverse();}]) {
    const altered = structuredClone(result); mutate(altered);
    assert.throws(() => buildWatchFieldReview(plan, altered, 'headline'), /BASELINE_CHANGED/);
  }
});

test('only canonical bounded pinned secrets enter the opt-in mode', async () => {
  for (const encoded of [undefined, '', 'AAA', 'AAAA ', 'a'.repeat(24001), Buffer.from('not gzip').toString('base64'),
    gzipSync('{}').toString('base64'), gzipSync('x'.repeat(20001)).toString('base64')]) assert.throws(() => decodeWatchPacket(encoded), /PACKET_INVALID/);
  for (const text of [undefined, '{}', 'x'.repeat(20001)]) assert.throws(() => loadWatchPlan(text), /PACKET_INVALID/);
  assert.equal(resolvePrivateWriterDiagnosticMode('saved-meaningful-watch'), 'saved-meaningful-watch');
  assert.equal(await prepareWatchDiagnostic('source', ''), undefined);
  await assert.rejects(prepareWatchDiagnostic('source', 'private'), /UNEXPECTED_WATCH_PACKET/);
  await assert.rejects(prepareWatchDiagnostic('saved-meaningful-watch', ''), /PACKET_INVALID/);
  await assert.rejects(diagnoseOneWriter({mode: 'saved-meaningful-watch', publicKey: 'invalid',
    aiRequestImpl: () => assert.fail('no inference'), researchImpl: () => assert.fail('no research')}), /KEY_INVALID/);
});

test('workflow scopes the new secret and runs tests before credentials, with no delivery path', async () => {
  const workflow = await readFile(new URL('../.github/workflows/private-writer-diagnostic.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/inputs.mode == 'saved-meaningful-watch' && secrets.FIRST_FOLD_WATCH_BASELINE_B64 \|\| ''/gu) ?? []).length, 2);
  assert.ok(workflow.indexOf('tests/watch-question.test.mjs') < workflow.indexOf('secrets.FIRST_FOLD_WATCH_BASELINE_B64'));
  assert.match(workflow, /contents: read/); assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /RESEND|OPENAI_API|schedule:|pull_request:/);
});
