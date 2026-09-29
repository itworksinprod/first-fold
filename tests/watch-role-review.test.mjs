import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {buildWatchRoleReview, validateWatchRoleReview, WATCH_ROLE_PROMPT} from '../scripts/automation/experiments/watch-role-review.mjs';
import {WATCH_ROLE_CONTROLS, WATCH_ROLE_CONTROLSET_SHA256, watchRoleControlView, scoreWatchRoleControl} from '../scripts/automation/experiments/watch-role-controls.mjs';

const source = [
  {evidenceId: 'S1P5', text: 'Fictional layouts must connect the specified terminals.'},
  {evidenceId: 'S1P20', text: 'Minimizing wire length can be an extra goal for a circuit layout.'},
];
const question = 'How would wire length differ for the same layout with and without the extra goal of minimizing wire length?';
const input = () => ({question, passages: structuredClone(source)});
const finding = (anchor, role, grounded = true) => ({anchor, role,
  reason: 'Structure-only fixture; no model response or semantic qualification.', evidenceIds: grounded ? ['S1P20'] : [], grounded});
const fixture = view => ({reviewSha256: view.data.reviewSha256, question: view.data.question,
  unknownAnswer: 'The hypothetical difference in wire length, if any.', findings: [
    finding('How would wire length differ', 'unknown_outcome'),
    finding('same layout', 'hypothetical_control'),
    finding('extra goal of minimizing wire length', 'factual_premise'),
  ]});

// Host-label-derived mocks test the scorer only, NOT model understanding. Expected
// labels and this function are never included in request data or the prompt.
function controlFixture(control, view) {
  const findings = control.checks.map(c => finding(c.anchor, c.role, c.grounded));
  if (!findings.some(f => f.role === 'unknown_outcome')) findings.push(finding(control.question.split(' ').slice(0, 3).join(' '), 'unknown_outcome'));
  return {reviewSha256: view.data.reviewSha256, question: control.question,
    unknownAnswer: 'Structure-only neutral outcome placeholder; exact meaning still needs manual review.', findings};
}

test('offline role contract binds exact input and returns no publication approval', () => {
  const view = buildWatchRoleReview(input()), response = fixture(view), verdict = validateWatchRoleReview(response, view);
  assert.deepEqual(verdict, {valid: true, reportedGrounded: true, status: 'model-positive-awaiting-independent-review'});
  assert.equal(Object.isFrozen(view.data.passages[0]), true);
  assert.equal(Object.isFrozen(view.schema.properties.findings.items), true);
  assert.equal(view.data.policy, 'offline-watch-role-review-v1');
  const {reviewSha256, ...data} = view.data;
  assert.equal(reviewSha256, createHash('sha256').update(JSON.stringify(data)).digest('hex'));
  const changed = input(); changed.passages[0].text += ' Changed evidence.';
  assert.notEqual(buildWatchRoleReview(changed).data.reviewSha256, reviewSha256);
});

test('question roles stay separate; overlap is allowed without pretending anchors prove coverage', () => {
  const view = buildWatchRoleReview(input()), response = fixture(view);
  response.findings.push(finding('with and without the extra goal of minimizing wire length', 'hypothetical_control'));
  assert.equal(validateWatchRoleReview(response, view).valid, true);
  for (const phrase of ['not its answer', 'Anchors may overlap', 'NOT source proof of the answer',
    'not a claim that a trial occurred', 'hypothetical wording is not permission']) {
    assert.ok(WATCH_ROLE_PROMPT.includes(phrase), phrase);
  }
  assert.match(WATCH_ROLE_PROMPT, /factual presuppositions inside if\/would\/hypothetical/);
  assert.match(WATCH_ROLE_PROMPT, /complete question exactly/);
  assert.match(WATCH_ROLE_PROMPT, /Do not convert presence\/absence of one optional goal into an exclusive baseline/);
  assert.match(WATCH_ROLE_PROMPT, /those require independent exact-text review/);
});

test('all roles need evidence for true judgments and a false finding remains a hold', () => {
  const view = buildWatchRoleReview(input());
  for (let index = 0; index < 3; index++) {
    const response = fixture(view); response.findings[index].evidenceIds = [];
    assert.equal(validateWatchRoleReview(response, view).valid, false);
    response.findings[index].grounded = false;
    assert.deepEqual(validateWatchRoleReview(response, view), {valid: true, reportedGrounded: false, status: 'model-hold-awaiting-independent-review'});
  }
});

test('moved, missing, paraphrased or duplicate anchors and foreign evidence fail structurally', () => {
  const view = buildWatchRoleReview(input());
  for (const mutate of [
    x => {x.question += ' Changed';}, x => {x.reviewSha256 = '0'.repeat(64);},
    x => {x.findings[0].anchor = 'How much shorter the wire would be';},
    x => {x.findings[0].anchor = 'Not in this question';},
    x => {x.findings.push(structuredClone(x.findings[0]));},
    x => {x.findings[0].evidenceIds = ['S2P2'];},
    x => {x.findings[0].evidenceIds = ['S1P20', 'S1P20'];},
    x => {x.findings[0].evidenceIds = ['S1P5', 'S1P20', 'S1P5'];},
    x => {x.findings = x.findings.filter(f => f.role !== 'factual_premise');},
    x => {x.findings = x.findings.filter(f => f.role !== 'unknown_outcome');},
    x => {x.findings[0].role = 'approved_question';},
    x => {x.findings[0].grounded = 'true';},
    x => {x.findings[0].approved = true;},
    x => {x.findings[0].reason = '';},
    x => {x.findings[0].reason = 'x'.repeat(241);},
    x => {x.findings[0].reason = 'hidden\u200btext';},
    x => {x.unknownAnswer = 'x'.repeat(241);},
    x => {x.unknownAnswer = ' ';},
    x => {x.unknownAnswer = 'line\nbreak';},
    x => {x.extra = 'unexpected';},
    x => {x.findings = Array(3);},
    x => {x.findings.length = 11;},
    x => {x.findings[0].evidenceIds = Array(1);},
    x => {Object.setPrototypeOf(x, null);},
  ]) {
    const response = fixture(view); mutate(response);
    assert.equal(validateWatchRoleReview(response, view).valid, false);
  }
  assert.equal(validateWatchRoleReview(fixture(view), structuredClone(view)).valid, false);
  const other = buildWatchRoleReview({...input(), question: question.replace('wire length differ', 'length vary')});
  assert.equal(validateWatchRoleReview(fixture(view), other).valid, false);
});

test('accessors and array decorations are rejected without execution', () => {
  const view = buildWatchRoleReview(input());
  for (const decorate of [
    x => Object.defineProperty(x, 'unknownAnswer', {get() {assert.fail('accessor');}}),
    x => Object.defineProperty(x.findings[0], 'grounded', {get() {assert.fail('accessor');}}),
    x => Object.defineProperty(x.findings, '0', {get() {assert.fail('accessor');}}),
    x => Object.defineProperty(x.findings[0].evidenceIds, '0', {get() {assert.fail('accessor');}}),
    x => {x.findings.extra = true;}, x => {x.findings[0].evidenceIds.extra = true;},
    x => {x[Symbol('extra')] = true;},
  ]) {
    const response = fixture(view); decorate(response);
    assert.equal(validateWatchRoleReview(response, view).valid, false);
  }
  for (const mutate of [
    x => {Object.defineProperty(x, 'question', {get() {assert.fail('accessor');}});},
    x => {Object.defineProperty(x.passages[0], 'text', {get() {assert.fail('accessor');}});},
    x => {Object.defineProperty(x.passages, '0', {get() {assert.fail('accessor');}});},
  ]) {const changed = input(); mutate(changed); assert.throws(() => buildWatchRoleReview(changed));}
});

test('builder bounds and clones the evidence without accepting external policies or unchecked passage IDs', () => {
  for (const mutate of [
    x => {x.question = '';}, x => {x.question = 'x'.repeat(600) + '?';},
    x => {x.question = 'No question';}, x => {x.question = '\tCould it?';},
    x => {x.question = 'Could it\u200b?';}, x => {x.question += ' ';},
    x => {x.passages = [];}, x => {x.passages.push(structuredClone(x.passages[0]));},
    x => {x.passages[1].evidenceId = x.passages[0].evidenceId;},
    x => {x.passages[1].evidenceId = 'S2P2';},
    x => {x.passages[0].text = 'x'.repeat(6001);},
    x => {x.passages[0].extra = true;}, x => {x.policy = 'accept-all';},
  ]) {const changed = input(); mutate(changed); assert.throws(() => buildWatchRoleReview(changed));}
  const original = input(), view = buildWatchRoleReview(original);
  original.passages[0].text = 'External edit.';
  assert.equal(view.data.passages[0].text, source[0].text);
});

test('predeclared synthetic labels and role expectations are immutable and hidden from requests', () => {
  assert.deepEqual(WATCH_ROLE_CONTROLS.map(c => c.expected), [true, true, false, false, false, false, false, false]);
  // Predeclared before any model run; re-review source/questions/labels before
  // intentionally changing this pin. Recomputed hashes alone do not freeze it.
  assert.equal(WATCH_ROLE_CONTROLSET_SHA256, '5d7a7d4451f66feb6784ef41a9f5990bb2d6be67f52cde838d735d6edb618859');
  const views = WATCH_ROLE_CONTROLS.map(watchRoleControlView);
  for (const [index, view] of views.entries()) {
    assert.deepEqual(view.data.passages, views[0].data.passages);
    assert.match(view.data.passages[1].text, /^Minimizing route length can be added/);
    assert.equal(Object.isFrozen(WATCH_ROLE_CONTROLS[index].checks[0]), true);
    assert.equal(view.prompt, views[0].prompt);
    assert.doesNotMatch(JSON.stringify(view), /"expected"|"checks"|"caseId"|"gold"|positive control|negative control/);
    assert.equal(view.data.question, WATCH_ROLE_CONTROLS[index].question);
  }
});

test('scorer requires BOTH expected verdict and decisive role coverage; correct booleans alone do not pass', () => {
  for (const control of WATCH_ROLE_CONTROLS) {
    const view = watchRoleControlView(control), response = controlFixture(control, view);
    assert.equal(scoreWatchRoleControl(control, view, response).matched, true);
    response.findings[0].grounded = !response.findings[0].grounded;
    response.findings[0].evidenceIds = ['S1P20'];
    assert.equal(scoreWatchRoleControl(control, view, response).matched, false);
  }
  const c = WATCH_ROLE_CONTROLS[2], view = watchRoleControlView(c), response = controlFixture(c, view);
  response.findings[0].role = 'hypothetical_control';
  response.findings.push(finding('extra length goal', 'factual_premise'));
  const score = scoreWatchRoleControl(c, view, response);
  assert.equal(score.valid, true); assert.equal(score.observed, false);
  assert.equal(score.rolesMatched, false); assert.equal(score.matched, false);
});

test('shared hypothetical conditions rejected as real executions remain a visible calibration mismatch', () => {
  const c = WATCH_ROLE_CONTROLS[0], view = watchRoleControlView(c), response = controlFixture(c, view);
  response.findings[1] = finding(c.checks[1].anchor, 'factual_premise', false);
  response.findings[2] = finding(c.checks[2].anchor, 'factual_premise', false);
  const score = scoreWatchRoleControl(c, view, response);
  assert.equal(score.valid, true); assert.equal(score.observed, false);
  assert.equal(score.matched, false);
});

test('a proven guarantee cannot be excused by a hypothetical task in the control scoring', () => {
  const c = WATCH_ROLE_CONTROLS[7], view = watchRoleControlView(c), response = controlFixture(c, view);
  response.findings[0] = finding(c.checks[0].anchor, 'hypothetical_control', true);
  response.findings.push(finding('LumenRoute', 'factual_premise'));
  const score = scoreWatchRoleControl(c, view, response);
  assert.equal(score.valid, true); assert.equal(score.observed, true);
  assert.equal(score.rolesMatched, false); assert.equal(score.matched, false);
});

test('anchor membership cannot prove faithful explanations and never grants editorial approval', () => {
  const view = buildWatchRoleReview(input()), response = fixture(view);
  response.unknownAnswer = 'A falsely asserted improvement in the exclusive implemented mode.';
  response.findings[0].reason = 'Wrong interpretation: this promises a measured reduction.';
  const verdict = validateWatchRoleReview(response, view);
  // An explicit limitation, not an acceptable semantic result: independent
  // explanation review must catch this even if structural validation is green.
  assert.equal(verdict.valid, true);
  assert.equal(verdict.status, 'model-positive-awaiting-independent-review');
  assert.equal(Object.hasOwn(verdict, 'approved'), false);
});

test('control views cannot be forged or scored against the wrong case', () => {
  const [a, b] = WATCH_ROLE_CONTROLS, view = watchRoleControlView(a);
  assert.throws(() => watchRoleControlView({...a}), /CONTROL_INVALID/);
  assert.throws(() => scoreWatchRoleControl(b, view, controlFixture(a, view)), /CONTROL_BINDING/);
  assert.throws(() => scoreWatchRoleControl(a, structuredClone(view), controlFixture(a, view)), /CONTROL_BINDING/);
  const malformed = controlFixture(a, view); malformed.findings = [];
  assert.equal(scoreWatchRoleControl(a, view, malformed).observed, null);
});

test('role candidate is wired only to its opt-in synthetic calibration, never an article or daily path', async () => {
  const scripts = new URL('../scripts/automation/', import.meta.url);
  const workflows = new URL('../.github/workflows/', import.meta.url);
  async function checkTree(dir) {
    for (const entry of await readdir(dir, {withFileTypes: true})) {
      if (entry.isDirectory()) {await checkTree(new URL(`${entry.name}/`, dir)); continue;}
      if (!entry.isFile()) continue;
      if (dir.href === new URL('experiments/', scripts).href &&
          ['watch-role-review.mjs', 'watch-role-controls.mjs'].includes(entry.name)) continue;
      if (dir.href === scripts.href && entry.name === 'watch-role-calibration.mjs') continue;
      if (dir.href === workflows.href && entry.name === 'watch-role-calibration.yml') continue;
      assert.doesNotMatch(await readFile(new URL(entry.name, dir), 'utf8'), /watch-role-(?:review|controls)/);
    }
  }
  for (const dir of [scripts, workflows]) await checkTree(dir);
  const module = await readFile(new URL('../scripts/automation/experiments/watch-role-review.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(module, /fetch\(|process\.env|apiToken|apiKey|CLOUDFLARE|RESEND|writeFile|child_process/);
});
