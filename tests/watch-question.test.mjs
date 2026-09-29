import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {watchFixture, mockQuestionAudit} from './fixtures/watch-fixture.mjs';
import {sha} from './fixtures/significance-fixture.mjs';
import {buildWatchPlan, decodeWatchPacket, loadWatchPlan, applyWatchQuestion,
  buildWatchFieldReview, watchSourceRequest, validateWatchSourceResponse, stripWatchDisplayLabel, WATCH_PROMPT, WATCH_PASSAGES, WATCH_LABEL, WATCH_TEXT_REASONS} from '../scripts/automation/experiments/watch-question.mjs';
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

test('text failure reasons preserve the original rejection order and public code without rejected prose', () => {
  const {plan, proposal} = watchFixture();
  const cases = [[42, 'TYPE'], ['', 'EMPTY'], [' Could this change?', 'TRIM'], ['Could ' + 'x'.repeat(600) + '?', 'CHARACTER_LIMIT'],
    ['Could ' + 'word '.repeat(36) + 'change?', 'WORD_LIMIT'], ['Could this: change?', 'PLAINTEXT'],
    ['Could this change', 'QUESTION_ENDING'], ['Could this change? What could follow?', 'QUESTION_COUNT'],
    ['For the same task, how could results differ?', 'STARTER'], ['Could this change. another output?', 'PUNCTUATION'],
    ['Could this change. Another output?', 'SENTENCE_COUNT']];
  assert.deepEqual(cases.map(([, reason]) => reason), WATCH_TEXT_REASONS);
  assert.equal(Object.isFrozen(WATCH_TEXT_REASONS), true);
  for (const [question, reason] of cases) assert.throws(() => applyWatchQuestion(plan, {...proposal, question}), error => {
    assert.equal(error.code, 'WATCH_RESPONSE_TEXT'); assert.equal(error.message, 'WATCH_RESPONSE_TEXT');
    assert.equal(error.textReason, reason);
    assert.deepEqual(Object.keys(error).sort(), ['code', 'textReason']);
    return true;
  });
  for (const [question, reason] of [
    [' Could <markup>', 'TRIM'],
    ['Could ' + 'longword '.repeat(80) + '<markup>', 'CHARACTER_LIMIT'],
    ['Could ' + 'word '.repeat(40) + '<markup>', 'WORD_LIMIT'],
    ['For <markup>', 'PLAINTEXT'],
    ['For a task? Another question?', 'QUESTION_COUNT'],
  ]) assert.throws(() => applyWatchQuestion(plan, {...proposal, question}), error =>
    error.code === 'WATCH_RESPONSE_TEXT' && error.textReason === reason);
  // A malformed shape must not reach text diagnostics or invoke a getter.
  const getter = {...proposal}; Object.defineProperty(getter, 'question', {get() {assert.fail('never invoke getter');}});
  assert.throws(() => applyWatchQuestion(plan, getter), error => error.code === 'WATCH_RESPONSE_SHAPE' && !('textReason' in error));
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
  assert.match(WATCH_PROMPT, /Frame the possible output itself as hypothetical/);
  assert.match(WATCH_PROMPT, /Use explicit hypothetical wording with would or could/);
  assert.match(WATCH_PROMPT, /Do not refer to studies, tests, future measurements or further research/);
  assert.doesNotMatch(WATCH_PROMPT, /A concrete unanswered comparison|prefer a hypothetical comparison|Ask what hypothetical measurements would show/);
});

test('writer distinguishes a hypothetical optional-goal contrast from repeated capability or measured results', () => {
  assert.match(WATCH_PROMPT, /source explicitly allows an additional quality goal/);
  assert.match(WATCH_PROMPT, /the SAME hypothetical task; the SAME source-named requirements as assumptions/);
  assert.match(WATCH_PROMPT, /only that particular extra goal present versus absent/);
  assert.match(WATCH_PROMPT, /Make both presence and absence of the extra goal and the same-task setting explicit/);
  assert.match(WATCH_PROMPT, /absence does not mean removing every objective or required condition/);
  assert.match(WATCH_PROMPT, /Do not assert an implemented switch, an existing operating mode, a measured baseline or a completed comparison/);
  assert.match(WATCH_PROMPT, /without assuming improvement or even a difference/);
  assert.match(WATCH_PROMPT, /Keep an unchanged or worse result possible/);
  assert.match(WATCH_PROMPT, /asking again whether documented goals can coexist, does not add a useful thing to watch/);
  assert.match(WATCH_PROMPT, /abstain instead of omitting a role or inventing setup details/);
  assert.match(WATCH_PROMPT, /Do not invent task details or comparisons to other methods/);
  assert.doesNotMatch(WATCH_PROMPT, /whether that SAME output meets|do not introduce a baseline|new comparison group/);
  // Contract text only: these assertions cannot establish generated novelty or usefulness.
});

test('writer treats required conditions as hypothetical setup, never as operational assurance', () => {
  assert.match(WATCH_PROMPT, /Required conditions describe the shared hypothetical setup, not an action or promise performed by the method/);
  assert.match(WATCH_PROMPT, /Express them as conditions, such as under the same requirements/);
  assert.match(WATCH_PROMPT, /Do not broaden a requirement on a generated output into an assurance about real operation/);
  assert.match(WATCH_PROMPT, /cannot fit naturally within the word limit using only allowedContext, abstain/);
  const {plan, proposal} = watchFixture();
  // Synthetic analogue of the observed assurance failure; no output rewriting.
  assert.throws(() => applyWatchQuestion(plan, {...proposal,
    question: 'How could an extra quality goal change an output while guaranteeing correct operation?'}), /WATCH_UNSUPPORTED_PRESUPPOSITION/);
});

test('observed achieved-result question fails the hypothetical form requirement before factual review', () => {
  const {plan, proposal} = watchFixture();
  for (const question of ['What is the shortest path length achieved by HardFlow while remaining collision‑free?',
    'What result wouldbe shown?', 'Does it measure what it couldhave achieved?',
    'What couldé be observed?', 'What éwould be observed?', 'What could\u0301 be observed?', 'What _could be observed?']) {
    assert.throws(() => applyWatchQuestion(plan, {...proposal, question}), /WATCH_QUESTION_NOT_HYPOTHETICAL/);
  }
  assert.match(WATCH_PROMPT, /MUST contain the word would or could/);
  // Even a form-valid question can invent a result: the semantic review is still required.
  const possible = applyWatchQuestion(plan, {...proposal, question: 'Could the observed result change?'});
  assert.equal(possible.decision, 'add');
});

test('all four fields reviewed, added question premises scoped only to two saved passages', () => {
  const {plan, proposal} = watchFixture(), result = applyWatchQuestion(plan, proposal);
  for (const field of ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch']) {
    const view = buildWatchFieldReview(plan, result, field);
    assert.equal(view.data.policy, 'isolated-claimwise-source-v1');
    assert.equal(view.data.claims.length, result.units[field].length);
    assert.equal(view.data.passages.some(p => p.evidenceId === 'S2P1'), ['whatHappened', 'whatToWatch'].includes(field));
    const request = watchSourceRequest(view, field);
    assert.deepEqual(request.data, view.data);
    if (field === 'whatToWatch') {
      assert.equal(view.data.claims.at(-1).text, proposal.question);
      assert.equal(WATCH_LABEL + view.data.claims.at(-1).text, result.units.whatToWatch.at(-1));
      assert.deepEqual(view.data.claims.slice(0, -1).map(c => c.text), plan.baseline.units.whatToWatch);
      assert.equal(view.data.statement, view.data.claims.map(c => c.text).join(' '));
      assert.ok(!request.prompt.startsWith(view.prompt));
      assert.match(request.prompt, /QUESTION PREMISE AUDIT: C2 is our editorial question/);
      assert.match(request.prompt, /ONLY S1P5, S1P20/);
      assert.match(request.prompt, /This judges premises, not the question's future answer/);
      assert.match(request.prompt, /Alternative answers explicitly left open are not separate assertions/);
      assert.match(request.prompt, /Conditional wording does not excuse an invented plan, guarantee/);
      assert.match(request.prompt, /no source needs to say First Fold already asked it/);
      assert.match(request.prompt, /For all claimIds EXCEPT C2/);
      assert.deepEqual(request.schema.properties.questionAudit.properties.question.enum, [proposal.question]);
      assert.deepEqual(request.schema.required, ['reviewSha256', 'judgments', 'questionAudit']);
      assert.deepEqual(request.schema.properties.judgments, view.schema.properties.judgments);
    } else {
      assert.equal(request, view);
      assert.deepEqual(view.data.claims.map(c => c.text), result.units[field]);
    }
  }
  for (const mutate of [r => {r.draft.headline = 'Changed';}, r => {r.units.whatHappened[0] = 'Changed';},
    r => {r.units.whatToWatch.reverse();}]) {
    const altered = structuredClone(result); mutate(altered);
    assert.throws(() => buildWatchFieldReview(plan, altered, 'headline'), /BASELINE_CHANGED/);
  }
});

test('only the exact app-owned prefix is excluded; every generated character stays in review', () => {
  const text = 'Could an unsupported guarantee hold?';
  assert.equal(stripWatchDisplayLabel(WATCH_LABEL + text), text);
  for (const wrong of [text, '', WATCH_LABEL, 'Some other label: ' + text, 'Before ' + WATCH_LABEL + text, null]) assert.throws(() => stripWatchDisplayLabel(wrong), /DISPLAY_LABEL_INVALID/);
  assert.equal(stripWatchDisplayLabel(WATCH_LABEL + WATCH_LABEL + text), WATCH_LABEL + text);
});

test('typed premise audit enforces exact text, closed structure, evidence scope and consistent verdicts', () => {
  const {plan, proposal} = watchFixture(), applied = applyWatchQuestion(plan, proposal);
  const view = buildWatchFieldReview(plan, applied, 'whatToWatch');
  const valid = {reviewSha256: view.data.reviewSha256, judgments: view.data.claims.map(c => ({
    claimId: c.claimId, comparison: 'Synthetic judgment only.', evidenceIds: ['S1P5'], sourceSupported: true}))};
  valid.questionAudit = mockQuestionAudit(view.data, valid.judgments.at(-1));
  assert.equal(validateWatchSourceResponse(valid, view, 'whatToWatch').supported, true);
  const negative = structuredClone(valid);
  negative.questionAudit.premises.push({text: 'An invented plan.', supported: false, evidenceIds: []});
  negative.judgments[1].sourceSupported = false; negative.judgments[1].evidenceIds = [];
  assert.deepEqual(validateWatchSourceResponse(negative, view, 'whatToWatch'), {
    valid: true, supported: false, claims: [{claimId: 'C1', sourceSupported: true}, {claimId: 'C2', sourceSupported: false}]});
  for (const mutate of [p => {delete p.questionAudit;}, p => {p.extra = 'hidden';},
    p => {p.questionAudit.extra = 'hidden';}, p => {p.questionAudit.question += 'Changed';},
    p => {p.questionAudit.unknownAnswer = ' ';}, p => {p.questionAudit.unknownAnswer = 'x'.repeat(241);},
    p => {p.questionAudit.premises = [];}, p => {p.questionAudit.premises = Array(2);},
    p => {p.questionAudit.premises = Array(7).fill(p.questionAudit.premises[0]);},
    p => {p.questionAudit.premises[0].evidenceIds = [];},
    p => {p.questionAudit.premises[0].evidenceIds = ['S2P1'];},
    p => {p.questionAudit.premises[0].evidenceIds = ['S1P5', 'S1P5'];},
    p => {p.questionAudit.premises[0].evidenceIds = ['S1P20'];},
    p => {p.questionAudit.premises[0].text = '';}, p => {p.questionAudit.premises[0].supported = 'true';},
    p => {p.questionAudit.premises[0].supported = false;}, p => {p.judgments[1].sourceSupported = false;},
    p => {p.judgments[0].extra = 'hidden';}, p => {p.reviewSha256 = '0'.repeat(64);},
    p => {Object.defineProperty(p.questionAudit, 'premises', {get() {assert.fail('getter invoked');}});},
    p => {Object.defineProperty(p.questionAudit.premises, '0', {get() {assert.fail('getter invoked');}});},
    p => {Object.defineProperty(p.questionAudit.premises[0], 'supported', {get() {assert.fail('getter invoked');}});},
  ]) {
    const bad = structuredClone(valid); mutate(bad);
    assert.deepEqual(validateWatchSourceResponse(bad, view, 'whatToWatch'), {valid: false, supported: false});
  }
  assert.equal(validateWatchSourceResponse(valid, structuredClone(view), 'whatToWatch').valid, false);
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
