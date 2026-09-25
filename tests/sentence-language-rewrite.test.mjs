import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSentenceRewriteView, applySentenceRewrite } from '../scripts/automation/free/sentence-rewrite.mjs';

// Synthetic mechanical checks only. Acceptance here does not establish factual
// support, complete meaning preservation, or suitability for publication.
const fields = ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch'];
const fixture = () => ({ headline: ['Synthetic sentence rewrite fixture'],
  whatHappened: ['During the morning session, the committee evaluated the amber panel.',
    'The workshop displayed the completed panel beside the entrance.'],
  whyItMatters: ['The panel provides a surface for the workshop display.'],
  whatToWatch: ['The committee will examine the revised display during the next session.',
    'A separate group will record the participants’ comments.'] });
const rewriteText = 'The committee checked the amber panel in the morning session.';
const proposalFor = (view, decision = 'rewrite') => ({ baselineSha256: view.data.baselineSha256, decision,
  sentences: view.data.units.map(unit => ({ unitId: unit.unitId, text: unit.text })) });
const rewriteFor = view => {
  const proposal = proposalFor(view);
  proposal.sentences[0].text = rewriteText;
  return proposal;
};
const helperError = error => /^FACT_SUMMARY_SENTENCE_REWRITE_(?:INPUT|BINDING|SHAPE|DECISION|TEXT|TARGET)$/.test(error.code ?? '');
const freezeCheck = value => {
  if (value && typeof value === 'object') { assert.equal(Object.isFrozen(value), true); Object.values(value).forEach(freezeCheck); }
};

test('issued views deeply freeze the ordered body inventory and exact response schema', () => {
  const before = fixture(), snapshot = structuredClone(before), view = buildSentenceRewriteView(before);
  freezeCheck(view);
  assert.equal(view.data.policy, 'sentence-rewrite-v1');
  assert.match(view.data.baselineSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(Object.keys(view.data).sort(), ['baselineSha256', 'policy', 'units']);
  let index = 0;
  assert.deepEqual(view.data.units, fields.slice(1).flatMap(field => before[field].map((text, unitIndex) =>
    ({ unitId: `U${++index}`, field, unitIndex, text }))));
  assert.ok(view.data.units.every(unit => unit.field !== 'headline'));
  assert.ok(!JSON.stringify(view.data).includes(before.headline[0]));
  assert.equal(view.schema.additionalProperties, false);
  assert.deepEqual(view.schema.required.slice().sort(), ['baselineSha256', 'decision', 'sentences']);
  assert.deepEqual(view.schema.properties.decision.enum.slice().sort(), ['abstain', 'rewrite']);
  assert.equal(view.schema.properties.sentences.minItems, view.data.units.length);
  assert.equal(view.schema.properties.sentences.maxItems, view.data.units.length);
  assert.equal(view.schema.properties.sentences.items.additionalProperties, false);
  assert.deepEqual(view.schema.properties.sentences.items.required.slice().sort(), ['text', 'unitId']);
  assert.deepEqual(before, snapshot);
  before.whatHappened[0] = 'The caller changed its local inventory.';
  assert.equal(view.data.units[0].text, snapshot.whatHappened[0]);
  assert.throws(() => { view.data.units[0].text = 'Changed.'; }, TypeError);
});

test('one complete-sentence rewrite preserves headline, order and cardinality without mutating inputs', () => {
  const before = fixture(), baseline = structuredClone(before), view = buildSentenceRewriteView(before);
  const proposal = rewriteFor(view), proposalSnapshot = structuredClone(proposal);
  const result = applySentenceRewrite(before, proposal, view);
  const expected = fixture();
  expected.whatHappened[0] = rewriteText;
  assert.deepEqual(Object.keys(result).sort(), ['decision', 'editsApplied', 'units']);
  assert.equal(result.decision, 'rewrite');
  assert.deepEqual(result.units, expected);
  assert.deepEqual(result.units.headline, before.headline);
  assert.deepEqual(result.editsApplied, [{ unitId: 'U1', field: 'whatHappened', unitIndex: 0,
    before: before.whatHappened[0], after: rewriteText }]);
  for (const field of fields) assert.equal(result.units[field].length, before[field].length);
  assert.deepEqual(before, baseline);
  assert.deepEqual(proposal, proposalSnapshot);
  assert.notEqual(result.units, before);
  for (const field of fields) assert.notEqual(result.units[field], before[field]);
});

test('issued view identity and full baseline hash bind every original field including the hidden headline', () => {
  const before = fixture(), view = buildSentenceRewriteView(before), proposal = rewriteFor(view);
  for (const forged of [null, {}, { ...view }, structuredClone(view)]) {
    assert.throws(() => applySentenceRewrite(before, proposal, forged), helperError);
  }
  for (const field of fields) {
    const changed = fixture();
    changed[field][0] += ' Changed.';
    assert.notEqual(buildSentenceRewriteView(changed).data.baselineSha256, view.data.baselineSha256);
    assert.throws(() => applySentenceRewrite(changed, proposal, view), helperError);
  }
  const reordered = fixture();
  reordered.whatHappened.reverse();
  assert.throws(() => applySentenceRewrite(reordered, proposal, view), helperError);
  const stale = { ...proposal, baselineSha256: '0'.repeat(64) };
  assert.throws(() => applySentenceRewrite(before, stale, view), helperError);
  assert.doesNotThrow(() => applySentenceRewrite(structuredClone(before), proposal, view));
  assert.equal(buildSentenceRewriteView(structuredClone(before)).data.baselineSha256, view.data.baselineSha256);
});

test('malformed baselines and dropped, reordered, duplicated or headline-targeting proposal units fail', () => {
  for (const mutate of [
    input => { delete input.whatToWatch; }, input => { input.extra = []; },
    input => { input.headline.push('A second headline'); }, input => { input.whatHappened = []; },
    input => { input.whatHappened = Array(2); }, input => { input.whatHappened = Array(5).fill('A sentence.'); },
    input => { input.whyItMatters[0] = ''; }, input => { input.whyItMatters[0] = ' Trimmed incorrectly.'; },
    input => { input.whyItMatters[0] = 42; },
  ]) {
    const input = fixture(); mutate(input);
    assert.throws(() => buildSentenceRewriteView(input), helperError);
  }
  assert.throws(() => buildSentenceRewriteView(Object.create(fixture())), helperError);
  const before = fixture(), view = buildSentenceRewriteView(before);
  for (const mutate of [
    p => { p.sentences.pop(); }, p => { p.sentences = []; }, p => { p.sentences.reverse(); },
    p => { p.sentences.push({ unitId: 'U99', text: 'An extra sentence.' }); },
    p => { p.sentences[1].unitId = p.sentences[0].unitId; }, p => { p.sentences[0].unitId = 'U99'; },
    p => { p.sentences[0].unitId = 'headline'; }, p => { p.headline = 'An altered headline'; },
    p => { p.sentences[0].field = 'headline'; }, p => { p.sentences[0].unitIndex = 0; },
    p => { delete p.sentences[0].text; }, p => { p.sentences = Array(view.data.units.length); },
  ]) {
    const proposal = rewriteFor(view); mutate(proposal);
    assert.throws(() => applySentenceRewrite(before, proposal, view), helperError);
  }
});

test('unsafe text and accessor or hidden shapes are rejected without executing serialization hooks', () => {
  const before = fixture(), view = buildSentenceRewriteView(before);
  for (const text of ['', ' ', 'Missing terminal punctuation', ' Leading space.', 'Trailing space. ',
    'One sentence. Another sentence.', 'One line.\nA second line.',
    'A sentence.\tAnother part.', 'An invisible\u200b boundary.', '<script>run()</script>',
    '{"extra":"field"}', '```text```', 'x'.repeat(1001), null, 1]) {
    const proposal = rewriteFor(view); proposal.sentences[0].text = text;
    assert.throws(() => applySentenceRewrite(before, proposal, view), helperError);
  }
  let reads = 0;
  for (const key of ['baselineSha256', 'decision', 'sentences']) {
    const proposal = rewriteFor(view), value = proposal[key];
    Object.defineProperty(proposal, key, { enumerable: true, get() { reads++; return value; } });
    assert.throws(() => applySentenceRewrite(before, proposal, view), helperError);
  }
  for (const makeTarget of [p => p, p => p.sentences, p => p.sentences[0]]) {
    for (const key of ['hidden', 'toJSON', Symbol('hidden')]) {
      const proposal = rewriteFor(view);
      Object.defineProperty(makeTarget(proposal), key, { value() { reads++; return {}; } });
      assert.throws(() => applySentenceRewrite(before, proposal, view), helperError);
    }
  }
  for (const mutate of [
    p => { Object.defineProperty(p.sentences, '0', { enumerable: true, get() { reads++; return {}; } }); },
    p => { Object.defineProperty(p.sentences[0], 'text', { enumerable: true, get() { reads++; return rewriteText; } }); },
    p => { Object.setPrototypeOf(p.sentences, Object.create(Array.prototype)); },
    p => { p.sentences[0] = Object.create(p.sentences[0]); },
    p => { Object.defineProperty(p.sentences, Symbol.iterator, { value() { reads++; return [][Symbol.iterator](); } }); },
  ]) {
    const proposal = rewriteFor(view); mutate(proposal);
    assert.throws(() => applySentenceRewrite(before, proposal, view), helperError);
  }
  for (const mutate of [
    input => { Object.defineProperty(input, 'whatHappened', { enumerable: true, get() { reads++; return []; } }); },
    input => { Object.defineProperty(input.whatHappened, '0', { enumerable: true, get() { reads++; return 'Unsafe getter.'; } }); },
    input => { Object.defineProperty(input, 'toJSON', { value() { reads++; return fixture(); } }); },
  ]) {
    const input = fixture(); mutate(input);
    assert.throws(() => buildSentenceRewriteView(input), helperError);
  }
  assert.equal(reads, 0);
});

test('unchanged units are allowed inside a rewrite; full identity is an explicit hold and semantic drift still needs reviewers', () => {
  const before = fixture(), view = buildSentenceRewriteView(before);
  const unchanged = proposalFor(view, 'abstain');
  assert.deepEqual(applySentenceRewrite(before, unchanged, view), { decision: 'abstain' });
  assert.throws(() => applySentenceRewrite(before, proposalFor(view), view), helperError);
  assert.throws(() => applySentenceRewrite(before, { ...rewriteFor(view), decision: 'abstain' }, view), helperError);
  assert.throws(() => applySentenceRewrite(before, { ...unchanged, sentences: [] }, view), helperError);
  assert.throws(() => applySentenceRewrite(before, { ...unchanged, decision: 'approve' }, view), helperError);
  const rewritten = applySentenceRewrite(before, rewriteFor(view), view);
  assert.deepEqual(rewritten.units.whatHappened.slice(1), before.whatHappened.slice(1));
  assert.deepEqual(rewritten.units.whyItMatters, before.whyItMatters);
  assert.deepEqual(rewritten.units.whatToWatch, before.whatToWatch);
  const drift = rewriteFor(view);
  drift.sentences[0].text = 'The committee approved every panel for permanent installation.';
  const mechanicallyAccepted = applySentenceRewrite(before, drift, view);
  assert.equal(mechanicallyAccepted.decision, 'rewrite');
  assert.equal(mechanicallyAccepted.units.whatHappened[0], drift.sentences[0].text);
  for (const key of ['supported', 'meaningPreserved', 'sourceSupported', 'approved']) {
    assert.equal(Object.hasOwn(mechanicallyAccepted, key), false);
  }
});
