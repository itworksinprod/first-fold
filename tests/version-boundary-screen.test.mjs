import test from 'node:test';
import assert from 'node:assert/strict';
import {screenVersionBoundaries} from '../scripts/automation/experiments/version-boundary-screen.mjs';

const input = (source, draft) => ({units: [{id: 'U0', text: draft}],
  sourceReferences: [{unitId: 'U0', passageIds: ['P1']}], passages: [{id: 'P1', text: source}]});
const screen = (source, draft) => screenVersionBoundaries(input(source, draft));

for (const v of ['3.7.2', '11.00.00', '8.20', '4.2.1.6']) {
  for (const [strict, inclusive] of [
    [`below version ${v}`, `version ${v} or older`],
    [`earlier than ${v}`, `at most ${v}`],
    [`above ${v}`, `${v} or later`],
    [`newer than version ${v}`, `at least version ${v}`],
  ]) test(`inclusion drift is held in both directions: ${strict}`, () => {
    for (const [source, draft] of [[strict, inclusive], [inclusive, strict]]) {
      const r = screen(`The fictional agent uses ${source}.`, `The agent uses ${draft}.`);
      assert.equal(r.status, 'needs-review'); assert.equal(r.issues.length, 1);
      assert.equal(r.issues[0].code, 'VERSION_ENDPOINT_INCLUSION_DRIFT');
      assert.equal(r.semanticApproval, false);
      assert.equal(r.issues[0].draft.version, v);
    }
  });
}

for (const [source, draft] of [
  ['below version 4.8.2', 'older than 4.8.2'], ['under v4.8.2', 'before 4.8.2'],
  ['<= 4.8.2', '4.8.2 or earlier'], ['≤4.8.2', 'no later than version 4.8.2'],
  ['4.8.2 and older', 'at most 4.8.2'], ['>4.8.2', 'later than 4.8.2'],
  ['≥4.8.2', 'no earlier than version 4.8.2'], ['>=4.8.2', '4.8.2 or newer'],
  ['at\u00a0least\u202fversion 4.8.2', '4.8.2 and higher'],
]) test(`equivalent lexical boundary is not held: ${source}`, () => {
  const r = screen(`Agent ${source}.`, `Agent ${draft}.`);
  assert.equal(r.status, 'no-detected-boundary-conflict');
  assert.equal(r.coverage.length, 1); assert.equal(r.coverage[0].checked, true);
  assert.equal(r.semanticApproval, false); assert.equal(r.independentReview, 'required');
});

test('returns exact original spans, including Unicode spacing, without changing draft', () => {
  const value = input('Agents below version 4.8.2 cannot register.', 'Agents on version 4.8.2\u202for older cannot register.');
  const original = structuredClone(value), r = screenVersionBoundaries(value);
  assert.deepEqual(value, original);
  const s = r.issues[0].source[0];
  assert.equal(value.passages[0].text.slice(s.start, s.end), 'below version 4.8.2');
  const c = r.issues[0].draft;
  assert.equal(value.units[0].text.slice(c.start, c.end), '4.8.2\u202for older');
  assert.ok(Object.isFrozen(r.issues[0].source[0]));
});

test('matching comparator is not a semantic verdict, including wrong subject/action/negation', () => {
  const source = 'Amber agents below version 4.8.2 cannot register.';
  for (const draft of ['Blue agents below version 4.8.2 cannot register.',
    'Amber agents below version 4.8.2 can register.', 'Amber agents not below version 4.8.2 cannot register.']) {
    const r = screen(source, draft);
    assert.equal(r.issues.length, 0); assert.equal(r.semanticApproval, false);
  }
});

test('opposite-direction, different endpoints and ambiguous source are not certified', () => {
  for (const [source, draft, reason] of [
    ['Agents below version 4.8.2 cannot register.', 'Agents at least version 4.8.2 can register.', 'no-comparable-selected-boundary'],
    ['Agents below version 4.8.2 cannot register.', 'Agents at most version 4.8.1 cannot register.', 'no-comparable-selected-boundary'],
    ['One cohort below 4.8.2 and another at most 4.8.2.', 'Agents at most 4.8.2 cannot register.', 'ambiguous-selected-boundary'],
  ]) {
    const r = screen(source, draft);
    assert.equal(r.issues.length, 0); assert.equal(r.coverage[0].checked, false);
    assert.equal(r.coverage[0].reason, reason); assert.equal(r.semanticApproval, false);
  }
});

test('no accidental partial matching of prereleases, build metadata or long dotted identifiers', () => {
  for (const v of ['4.8.2-beta', '4.8.2+build7', '4.8.2.5.6', '4.8.2suffix',
    ...['\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2212'].map(d => `4.8.2${d}beta`)]) {
    const r = screen(`Agents below ${v} cannot register.`, `Agents on ${v} or older cannot register.`);
    assert.deepEqual(r.coverage, []); assert.equal(r.semanticApproval, false);
  }
});

test('only this unit’s selected passages are compared, never another unit’s citations', () => {
  const value = input('Agents below version 4.8.2 cannot register.', 'Agents on 4.8.2 or older cannot register.');
  value.passages.push({id: 'P2', text: 'An unrelated product supports 4.8.2 or older.'});
  assert.equal(screenVersionBoundaries(value).issues.length, 1);
  value.sourceReferences[0].passageIds = ['P2'];
  assert.equal(screenVersionBoundaries(value).issues.length, 0); // Not subject validation.
});

test('malformed and sparse mappings fail closed before screen results', () => {
  for (const mutate of [v => v.units = null, v => v.units = new Array(1), v => v.passages = new Array(1),
    v => v.sourceReferences = new Array(1), v => v.passages.push(v.passages[0]),
    v => v.sourceReferences[0].unitId = 'wrong', v => v.sourceReferences[0].passageIds = ['P404'],
    v => v.sourceReferences[0].passageIds = ['P1', 'P1'], v => v.units[0].text = 'x'.repeat(1201),
    v => v.passages[0].text = 'x'.repeat(6001), v => v.sourceReferences[0].passageIds = new Array(1)]) {
    const value = input('Agents below 4.8.2.', 'Agents at most 4.8.2.'); mutate(value);
    assert.throws(() => screenVersionBoundaries(value), /BENCHMARK_VERSION_SCREEN_INPUT/);
  }
});

test('many matching comparisons retain bounded offset evidence without hiding later conflicts', () => {
  const value = input(Array(200).fill('below version 4.8.2').join('; '), Array(40).fill('at most 4.8.2').join('; '));
  value.units = Array.from({length: 10}, (_, i) => ({id: `U${i}`, text: value.units[0].text}));
  value.sourceReferences = value.units.map(u => ({unitId: u.id, passageIds: ['P1']}));
  const r = screenVersionBoundaries(value);
  assert.equal(r.status, 'needs-review'); assert.equal(r.issueCount, 400);
  assert.equal(r.recognizedComparisons, 400); assert.equal(r.checkedComparisons, 400);
  assert.equal(r.coverage.length, 32); assert.equal(r.issues.length, 16);
  assert.ok(r.issues.every(x => x.sourceComparisonCount === 200 && x.source.length === 3));
  assert.equal(r.detailsTruncated, true); assert.ok(Buffer.byteLength(JSON.stringify(r)) < 18000);
  // An actual conflict after the detail cap must still hold the whole draft.
  value.units[0].text = Array(35).fill('below 4.8.2').join('; ');
  const mixed = screenVersionBoundaries(value);
  assert.equal(mixed.status, 'needs-review'); assert.equal(mixed.issueCount, 360);
  assert.ok(mixed.coverage.every(x => x.reason === 'same-comparison'));
});
