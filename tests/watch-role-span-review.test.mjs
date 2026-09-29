import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildWatchRoleSpanReview, diagnoseWatchRoleSpanReview, WATCH_ROLE_SPAN_CONTRACT} from '../scripts/automation/experiments/watch-role-span-review.mjs';
import {buildWatchRoleReview, validateWatchRoleReview} from '../scripts/automation/experiments/watch-role-review.mjs';
import {WATCH_ROLE_CONTROLS, watchRoleControlView, scoreWatchRoleControl} from '../scripts/automation/experiments/watch-role-controls.mjs';
const input = () => ({question: 'How would  output differ, with the extra goal?', passages: [
  {evidenceId: 'S1P5', text: 'Fictional required output.'}, {evidenceId: 'S1P20', text: 'Fictional optional goal.'}]});
const fixture = view => ({reviewSha256: view.data.reviewSha256, question: view.data.question,
  unknownAnswer: 'A hypothetical difference, not an asserted result.', findings: [
    {startWord: 1, endWord: 4, role: 'unknown_outcome', reason: 'Structure-only fixture.', evidenceIds: ['S1P20'], grounded: true},
    {startWord: 7, endWord: 8, role: 'factual_premise', reason: 'Structure-only fixture.', evidenceIds: ['S1P20'], grounded: true}]});

test('v2 binds immutable word inventory and reconstructs original whitespace and punctuation exactly', () => {
  const data = input(), view = buildWatchRoleSpanReview(data), response = fixture(view);
  const {reviewSha256, ...hashed} = view.data;
  assert.equal(reviewSha256, createHash('sha256').update(JSON.stringify(hashed)).digest('hex'));
  assert.equal(view.data.policy, WATCH_ROLE_SPAN_CONTRACT);
  assert.deepEqual(view.data.words.map(w => w.wordId), [1,2,3,4,5,6,7,8]);
  assert.equal(Object.isFrozen(view.data.words[0]), true);
  assert.equal(Object.isFrozen(view.schema), true);
  assert.match(view.prompt, /Indices are 1-based, both boundaries are inclusive/);
  assert.match(view.prompt, /Do not return an anchor string/);
  const result = diagnoseWatchRoleSpanReview(response, view);
  assert.equal(result.verdict.valid, true);
  assert.equal(result.canonical.findings[0].anchor, 'How would  output differ,');
  assert.equal(result.canonical.findings[1].anchor, 'extra goal?');
  assert.deepEqual(validateWatchRoleReview(result.canonical, buildWatchRoleReview(data)), result.verdict);
  data.question = 'Changed?'; data.passages[0].text = 'Changed';
  assert.equal(view.data.question, response.question);
  assert.equal(Object.isFrozen(result.canonical.findings[0]), true);
});

test('ranges are strict integers with no clamping, normalization, guessing or free-text override', () => {
  const view = buildWatchRoleSpanReview(input());
  for (const [startWord, endWord] of [[0,2],[-1,2],[2,1],[1,9],[1.5,2],[1,2.5],['1',2],[1,'2'],[NaN,2],[1,Infinity],[1,null]]) {
    const response = fixture(view); Object.assign(response.findings[0], {startWord,endWord});
    const result = diagnoseWatchRoleSpanReview(response, view);
    assert.equal(result.reason, 'ANCHOR_RANGE'); assert.equal(result.canonical, undefined);
  }
  const old = fixture(view); old.findings[0].anchor = 'invented';
  assert.equal(diagnoseWatchRoleSpanReview(old, view).reason, 'FINDING_SHAPE');
});

test('wrong view, source version, question echo and response hash cannot be rebound', () => {
  const view = buildWatchRoleSpanReview(input()), response = fixture(view);
  assert.equal(diagnoseWatchRoleSpanReview(response, structuredClone(view)).reason, 'VIEW');
  const other = input(); other.passages[0].text += ' Changed evidence.';
  assert.equal(diagnoseWatchRoleSpanReview(response, buildWatchRoleSpanReview(other)).reason, 'REVIEW_HASH');
  for (const key of ['question','reviewSha256']) {
    const changed = fixture(view); changed[key] = 'wrong';
    assert.equal(diagnoseWatchRoleSpanReview(changed, view).verdict.valid, false);
  }
  const legacy = buildWatchRoleReview(input()); response.reviewSha256 = legacy.data.reviewSha256;
  assert.equal(diagnoseWatchRoleSpanReview(response, view).reason, 'REVIEW_HASH');
});

test('closed shapes, dense arrays and accessors fail before any untrusted execution', () => {
  const view = buildWatchRoleSpanReview(input());
  for (const mutate of [
    x => {x.extra = true;}, x => {x[Symbol('extra')] = true;},
    x => {x.findings = Array(2);}, x => {x.findings.extra = true;},
    x => Object.defineProperty(x, 'question', {get() {assert.fail('getter');}}),
    x => Object.defineProperty(x.findings, '0', {get() {assert.fail('getter');}}),
    x => Object.defineProperty(x.findings[0], 'startWord', {get() {assert.fail('getter');}}),
    x => Object.defineProperty(x.findings[0].evidenceIds, '0', {get() {assert.fail('getter');}}),
  ]) {const response = fixture(view); mutate(response); assert.equal(diagnoseWatchRoleSpanReview(response, view).verdict.valid, false);}
});

test('existing role, reason, citations, duplicate and minimum coverage gates still apply', () => {
  const view = buildWatchRoleSpanReview(input());
  for (const mutate of [
    x => {x.findings[0].role = 'approved';}, x => {x.findings[0].reason = 'x'.repeat(241);},
    x => {x.findings[0].evidenceIds = [];}, x => {x.findings[0].evidenceIds = ['S2P1'];},
    x => {x.findings[0].evidenceIds = ['S1P20','S1P20'];}, x => {x.findings[0].grounded = 'true';},
    x => {x.findings.push(structuredClone(x.findings[0]));}, x => {x.findings[1].role = 'hypothetical_control';},
    x => {x.unknownAnswer = 'x'.repeat(241);},
  ]) {const response = fixture(view); mutate(response); assert.equal(diagnoseWatchRoleSpanReview(response, view).verdict.valid, false);}
  const response = fixture(view); response.findings[1].grounded = false; response.findings[1].evidenceIds = [];
  assert.equal(diagnoseWatchRoleSpanReview(response, view).verdict.status, 'model-hold-awaiting-independent-review');
});

test('240-character anchor bound and repeated-word positional identity are preserved', () => {
  const data = input(); data.question = 'How would ' + 'x'.repeat(241) + ' differ?';
  const view = buildWatchRoleSpanReview(data), response = fixture(view);
  response.findings[0].endWord = 3;
  response.findings[1].startWord = 3; response.findings[1].endWord = 3;
  assert.equal(diagnoseWatchRoleSpanReview(response, view).reason, 'ANCHOR_TEXT');
  const repeat = input(); repeat.question = 'How would goal compare with goal?';
  const r = buildWatchRoleSpanReview(repeat), answer = fixture(r);
  answer.findings[1].startWord = 6; answer.findings[1].endWord = 6;
  assert.equal(diagnoseWatchRoleSpanReview(answer, r).canonical.findings[1].anchor, 'goal?');
});

test('all frozen questions and gold roles remain host-only; spans retain decisive scoring', () => {
  for (const control of WATCH_ROLE_CONTROLS) {
    const old = watchRoleControlView(control), view = buildWatchRoleSpanReview({question: old.data.question, passages: old.data.passages});
    assert.deepEqual(view.data.passages, old.data.passages); assert.equal(view.data.question, control.question);
    assert.doesNotMatch(JSON.stringify(view), /"expected"|"checks"|"caseId"|"gold"/);
    const tokens = [...control.question.matchAll(/\S+/gu)];
    const checks = [...control.checks];
    if (!checks.some(c => c.role === 'unknown_outcome')) checks.push({anchor: tokens[0][0],role:'unknown_outcome',grounded:true});
    const response = {reviewSha256: view.data.reviewSha256, question: control.question, unknownAnswer: 'Structure-only fixture.',
      findings: checks.map(({anchor,role,grounded}) => {
        const first = control.question.indexOf(anchor), last = first + anchor.length - 1;
        return {startWord: tokens.findIndex(t => t.index <= first && t.index+t[0].length > first)+1,
          endWord: tokens.findIndex(t => t.index <= last && t.index+t[0].length > last)+1,
          role,grounded,reason:'Structure-only fixture.',evidenceIds:grounded ? ['S1P20'] : []};
      })};
    const decoded = diagnoseWatchRoleSpanReview(response, view);
    assert.equal(decoded.verdict.valid, true);
    assert.equal(scoreWatchRoleControl(control, old, decoded.canonical).matched, true);
    const wrong = structuredClone(response); wrong.findings[0].role = 'hypothetical_control';
    if (!wrong.findings.some(f => f.role === 'factual_premise')) wrong.findings.push({...wrong.findings[0],startWord:1,endWord:1,role:'factual_premise'});
    if (!wrong.findings.some(f => f.role === 'unknown_outcome')) wrong.findings.push({...wrong.findings[0],startWord:1,endWord:1,role:'unknown_outcome'});
    const changed = diagnoseWatchRoleSpanReview(wrong, view);
    assert.equal(changed.verdict.valid, true);
    assert.equal(scoreWatchRoleControl(control, old, changed.canonical).matched, false);
  }
});

test('index validity does not prove meaningful selection or faithful explanations', () => {
  const view = buildWatchRoleSpanReview(input()), response = fixture(view);
  response.findings[0].reason = 'Wrong semantic claim: this proves an improved output.';
  response.findings[1].startWord = 1; response.findings[1].endWord = 1;
  const decoded = diagnoseWatchRoleSpanReview(response, view);
  assert.equal(decoded.verdict.valid, true);
  assert.equal(decoded.canonical.findings[1].anchor, 'How');
  assert.equal(decoded.verdict.status, 'model-positive-awaiting-independent-review');
  assert.equal(decoded.verdict.approved, undefined);
});
