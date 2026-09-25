import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applyPhraseCopyedits } from '../scripts/automation/free/phrase-copyedit.mjs';

// Synthetic text exercises edit boundaries and transport contracts only. A
// passing phrase edit does not establish factual support or unchanged meaning.
const sentence = 'The amber panel carries polished tiles along the narrow walkway while workers label every wooden crate beside the quiet garden wall today.';
const units = () => ({ headline: ['Synthetic phrase editing fixture'], whatHappened: [sentence],
  whyItMatters: [sentence], whatToWatch: [sentence] });
const hashUnits = before => createHash('sha256').update(JSON.stringify(Object.fromEntries(
  ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch'].map(field => [field, before[field]])))).digest('hex');
const digest = hashUnits(units());
const edit = (find = 'amber', replace = 'golden', patch = {}) =>
  ({ field: 'whatHappened', unitIndex: 0, find, replace, ...patch });
const proposal = (replacements = [edit()], patch = {}, before = units()) =>
  ({ unitsSha256: hashUnits(before), replacements, ...patch });
const rejects = (before, candidate, expected = hashUnits(before)) => {
  const snapshot = structuredClone(before);
  assert.throws(() => applyPhraseCopyedits(before, candidate, expected),
    error => /^FACT_SUMMARY_PHRASE_EDIT_/.test(error.code ?? ''));
  assert.deepEqual(before, snapshot, 'Rejected proposals must leave the baseline untouched');
};

test('phrase replacements use immutable baseline offsets and preserve every untouched byte', () => {
  const before = units();
  const first = edit('polished tiles', 'tiles with a smooth surface');
  const second = edit('narrow walkway', 'short path');
  Object.values(before).forEach(Object.freeze);
  Object.freeze(before);
  const candidate = proposal([first, second]);
  candidate.replacements.forEach(Object.freeze);
  Object.freeze(candidate.replacements);
  Object.freeze(candidate);
  const result = applyPhraseCopyedits(before, candidate, digest);
  const expected = units();
  expected.whatHappened[0] = 'The amber panel carries tiles with a smooth surface along the short path while workers label every wooden crate beside the quiet garden wall today.';
  assert.deepEqual(result, { units: expected, editsApplied: [first, second].map(replacement => ({
    ...replacement, start: sentence.indexOf(replacement.find),
    end: sentence.indexOf(replacement.find) + replacement.find.length,
  })) });
  assert.deepEqual(before, units());
  assert.deepEqual(applyPhraseCopyedits(before, proposal([second, first]), digest), result);

  const swapped = applyPhraseCopyedits(before, proposal([edit('amber', 'wooden'), edit('wooden', 'amber')]), digest);
  assert.equal(swapped.units.whatHappened[0], sentence.replace('amber', 'wooden').replace('wooden crate', 'amber crate'));
  rejects(before, proposal([edit('amber', 'golden'), edit('golden', 'yellow')]));
});

test('closed proposal shape, bound hash and body-only indices reject before mutation', () => {
  const inheritedProposal = Object.create(proposal());
  const inheritedEdit = Object.create(edit());
  for (const candidate of [
    null, [], { ...proposal(), extra: true }, { replacements: [edit()] },
    proposal([], {}), proposal(Array.from({ length: 7 }, () => edit())),
    proposal([edit()], { unitsSha256: 'b'.repeat(64) }), inheritedProposal, proposal([inheritedEdit]),
    JSON.parse(JSON.stringify(proposal()).replace(/}$/, ',"__proto__":{}}')),
    proposal([{ ...edit(), constructor: 'extra' }]), proposal([{ ...edit(), extra: true }]),
  ]) rejects(units(), candidate);
  for (const field of ['headline', 'unknown', '__proto__', 'constructor', 'toString']) {
    rejects(units(), proposal([edit('amber', 'golden', { field })]));
  }
  for (const unitIndex of [-1, 1, 1.5, NaN, Infinity, '0', null, true]) {
    rejects(units(), proposal([edit('amber', 'golden', { unitIndex })]));
  }
  const inheritedFind = { field: 'whatHappened', unitIndex: 0, replace: 'golden' };
  Object.setPrototypeOf(inheritedFind, { find: 'amber' });
  rejects(units(), proposal([inheritedFind]));

  const segmented = units();
  const words = sentence.split(' ');
  segmented.whatHappened = [words.slice(0, 10).join(' '), words.slice(10).join(' ')];
  assert.equal(segmented.whatHappened.join(' '), sentence);
  assert.notEqual(hashUnits(segmented), digest);
  rejects(segmented, proposal());
  rejects(segmented, proposal(), digest);
});

test('baseline requires the fixed field inventory and bounded arrays of strings', () => {
  for (const before of [
    { ...units(), extra: ['Unreviewed text'] }, { ...units(), headline: [] },
    { ...units(), headline: ['First', 'Second'] }, { ...units(), whatHappened: sentence },
    { ...units(), whatHappened: [] }, { ...units(), whatHappened: Array(5).fill(sentence) },
    { ...units(), whyItMatters: [false] },
  ]) rejects(before, proposal());
  const missing = units();
  delete missing.whatToWatch;
  rejects(missing, proposal());
});

test('phrase grammar excludes omissions, whole rewrites, non-ASCII text and hidden delimiters', () => {
  for (const value of ['', 'Amber', 'amber2', '<amber>', 'amber.', ' amber', 'amber ',
    'amber  panel', 'amber\tpanel', 'amber\npanel', 'café', 'keeper’s', 'well‑worn',
    'аmber', '-amber', 'amber-', "'amber", 'amber--panel', 'x'.repeat(81)]) {
    rejects(units(), proposal([edit(value, 'golden')]));
    rejects(units(), proposal([edit('amber', value)]));
  }
  rejects(units(), proposal([edit('amber', 'amber')]));
  rejects(units(), proposal([edit('amber panel carries polished tiles along', 'simple tiles')]));
  rejects(units(), proposal([edit('amber', 'one two three four five six seven eight nine')]));
  rejects(units(), proposal([edit(sentence, 'A replacement story.')]));
  for (const [find, replace] of [["keeper's", "worker's"], ['well-worn', 'weather-beaten']]) {
    const before = units();
    before.whatHappened[0] = sentence.replace('amber', find);
    assert.equal(applyPhraseCopyedits(before, proposal([edit(find, replace)], {}, before), hashUnits(before)).units.whatHappened[0],
      sentence.replace('amber', replace));
  }
});

test('only one complete literal token occurrence can be replaced', () => {
  rejects(units(), proposal([edit('missing', 'golden')]));
  for (const target of ['amber amber', 'éamber', 'amberé', 'amber\u0301', '𝑥amber', 'amber𝑥', 'amber-like', "amber's", 'amber2', '_amber']) {
    const before = units();
    before.whatHappened[0] = sentence.replace('amber', target);
    rejects(before, proposal([edit()], {}, before));
  }
  const punctuated = units();
  punctuated.whatHappened[0] = sentence.replace('amber', '(amber)');
  assert.equal(applyPhraseCopyedits(punctuated, proposal([edit()], {}, punctuated), hashUnits(punctuated)).units.whatHappened[0],
    sentence.replace('amber', '(golden)'));
});

test('per-unit edit limits reject whole rewrites, overlap and neighboring phrase spans', () => {
  for (const replacements of [
    [edit('amber', 'golden'), edit('narrow', 'short'), edit('wooden', 'oak')],
    [edit('polished tiles', 'smooth pieces'), edit('tiles along', 'pieces beside')],
    [edit('polished', 'smooth'), edit('tiles', 'pieces')],
    [edit('polished', 'smooth'), edit('polished', 'shiny')],
    [edit('amber panel carries', 'golden frame holds'), edit('quiet garden wall', 'calm yard fence')],
  ]) rejects(units(), proposal(replacements));

  // Twenty-two baseline words permit five find-words, not six.
  assert.equal(sentence.split(/\s+/).length, 22);
  const atLimit = applyPhraseCopyedits(units(), proposal([
    edit('amber panel carries', 'golden frame holds'), edit('narrow walkway', 'short path'),
  ]), digest);
  assert.equal(atLimit.editsApplied.length, 2);
  const six = ['whatHappened', 'whyItMatters', 'whatToWatch'].flatMap(field =>
    [edit('amber', 'golden', { field }), edit('wooden', 'oak', { field })]);
  assert.equal(applyPhraseCopyedits(units(), proposal(six), digest).editsApplied.length, 6);

  const long = units();
  long.whatHappened[0] = `${sentence} ${'filler '.repeat(20).trim()}`;
  rejects(long, proposal([edit('amber panel carries polished tiles', 'golden frame holds smooth pieces'),
    edit('wooden crate beside the', 'oak box near a')], {}, long));
});

test('protected token edits and changed qualifier multisets are held', () => {
  for (const cue of ['can', 'could', 'may', 'must', 'should', 'better', 'best', 'not', 'no', 'never', 'unless', 'cannot', "can't", "won't"]) {
    const before = units();
    before.whatHappened[0] = sentence.replace('amber', cue);
    rejects(before, proposal([edit(cue, 'golden')], {}, before));
    rejects(before, proposal([edit(`${cue} panel`, `${cue} frame`)], {}, before));
  }
  for (const replacement of ['can move', 'best', 'not amber', 'never']) {
    rejects(units(), proposal([edit('amber', replacement)]));
  }
});

test('hyphen and apostrophe components count toward phrase and per-unit word limits', () => {
  for (const separator of ['-', "'"]) {
    const find = ['amber', 'panel', 'frame', 'tiles', 'path', 'crate'].join(separator);
    const before = units();
    before.whatHappened[0] = sentence.replace('amber', find);
    rejects(before, proposal([edit(find, 'golden')], {}, before));
    const replacement = ['golden', 'frame', 'with', 'smooth', 'tiles', 'beside', 'the', 'short', 'path'].join(separator);
    rejects(units(), proposal([edit('amber', replacement)]));

    const compound = ['amber', 'panel', 'frame'].join(separator);
    const bounded = units();
    bounded.whatHappened[0] = `The ${compound} panel carries polished tiles along the narrow walkway while workers label wooden crates beside the garden wall.`;
    // Twenty-one components permit five changed components. These two edits
    // consume six even though the first find has no whitespace.
    rejects(bounded, proposal([edit(compound, 'golden'), edit('wooden crates beside', 'oak boxes near')], {}, bounded));
  }
});

test('small accepted phrase edits still do not establish semantic preservation', () => {
  for (const [find, replace] of [['deployed system', 'tested system'], ['supports', 'opposes']]) {
    const before = units();
    before.whatHappened[0] = sentence.replace('amber', find);
    const result = applyPhraseCopyedits(before, proposal([edit(find, replace)], {}, before), hashUnits(before));
    assert.equal(result.units.whatHappened[0], sentence.replace('amber', replace));
    assert.equal(result.editsApplied.length, 1);
    // Neither bounded character spans nor unchanged qualification cues can
    // judge these changes in meaning; independent comparison remains required.
  }
});
