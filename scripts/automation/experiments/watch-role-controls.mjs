// Predeclared fictional cases for isolated calibration. Labels/decisive anchors stay host-side.
// Never use matches on this reused set as broad reviewer or article qualification.
import {createHash} from 'node:crypto';
import {buildWatchRoleReview, validateWatchRoleReview} from './watch-role-review.mjs';
const freeze = value => {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);}
  return value;
};
const passages = freeze([
  {evidenceId: 'S1P5', text: 'In a laboratory test, LumenRoute found a route that avoided the marked obstacles. Avoiding those obstacles was a required condition.'},
  {evidenceId: 'S1P20', text: 'Minimizing route length can be added as an extra quality goal alongside the required obstacle avoidance.'},
]);
const expectation = (anchor, role, grounded) => ({anchor, role, grounded});
export const WATCH_ROLE_CONTROLS = freeze([
  {id: 'A', question: 'How would route length differ for the same route planning task under the same obstacle avoidance requirements, with and without the extra goal of minimizing length?',
    expected: true, checks: [
      expectation('How would route length differ', 'unknown_outcome', true),
      expectation('same route planning task', 'hypothetical_control', true),
      expectation('same obstacle avoidance requirements', 'hypothetical_control', true),
      expectation('extra goal of minimizing length', 'factual_premise', true),
    ]},
  {id: 'B', question: 'For the same hypothetical route planning task, could adding the extra length goal leave route length unchanged, with obstacle avoidance still required?',
    expected: true, checks: [
      expectation('leave route length unchanged', 'unknown_outcome', true),
      expectation('same hypothetical route planning task', 'hypothetical_control', true),
      expectation('obstacle avoidance still required', 'hypothetical_control', true),
      expectation('extra length goal', 'factual_premise', true),
    ]},
  {id: 'C', question: 'How did route length differ in LumenRoute’s completed comparison of the same task with and without the extra length goal?',
    expected: false, checks: [expectation('completed comparison', 'factual_premise', false)]},
  {id: 'D', question: 'How would route length differ in LumenRoute’s announced trials next month with and without the extra length goal?',
    expected: false, checks: [expectation('announced trials next month', 'factual_premise', false)]},
  {id: 'E', question: 'How would route length differ while LumenRoute guarantees avoidance of every real-world collision?',
    expected: false, checks: [expectation('guarantees avoidance of every real-world collision', 'factual_premise', false)]},
  {id: 'F', question: 'How much of LumenRoute’s demonstrated path shortening comes from its extra length goal?',
    expected: false, checks: [expectation('demonstrated path shortening', 'factual_premise', false)]},
  {id: 'G', question: 'How would route length differ if LumenRoute’s documented obstacle-only mode were compared with its extra length goal?',
    expected: false, checks: [expectation('documented obstacle-only mode', 'factual_premise', false)]},
  {id: 'H', question: 'For the same hypothetical task, how would LumenRoute’s proven real-world collision guarantee affect route length?',
    expected: false, checks: [expectation('proven real-world collision guarantee', 'factual_premise', false)]},
]);
// Includes host-only labels and decisive roles for an immutable pre-results record.
export const WATCH_ROLE_CONTROLSET_SHA256 = createHash('sha256')
  .update(JSON.stringify({passages, controls: WATCH_ROLE_CONTROLS})).digest('hex');
const views = new WeakMap();

export function watchRoleControlView(control) {
  if (!WATCH_ROLE_CONTROLS.includes(control)) throw new Error('WATCH_ROLE_CONTROL_INVALID');
  const view = buildWatchRoleReview({question: control.question, passages});
  views.set(view, control);
  return view;
}

// Scoring is explicit and separate from parsing. Exact anchors do NOT prove the
// explanations are sound; independent coverage/meaning review remains mandatory.
export function scoreWatchRoleControl(control, view, response) {
  if (!WATCH_ROLE_CONTROLS.includes(control) || views.get(view) !== control) throw new Error('WATCH_ROLE_CONTROL_BINDING');
  const verdict = validateWatchRoleReview(response, view);
  const rolesMatched = verdict.valid && control.checks.every(check => response.findings.some(f =>
    f.anchor.includes(check.anchor) && f.role === check.role && f.grounded === check.grounded));
  return {id: control.id, expected: control.expected, observed: verdict.valid ? verdict.reportedGrounded : null,
    valid: verdict.valid, rolesMatched,
    matched: verdict.valid && verdict.reportedGrounded === control.expected && rolesMatched,
    status: 'offline-score-requires-independent-explanation-review'};
}
