import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertPhraseCopyeditContext } from '../scripts/automation/free/phrase-copyedit-context.mjs';
import { applyPhraseCopyedits } from '../scripts/automation/free/phrase-copyedit.mjs';

const contextError = error => error.code === 'FACT_SUMMARY_PHRASE_EDIT_CONTEXT';
const hold = (before, after) => assert.throws(() => assertPhraseCopyeditContext(before, after), contextError);
const apply = (sentence, replacements) => {
  const units = { headline: ['Synthetic context fixture'], whatHappened: [sentence],
    whyItMatters: ['A separate synthetic sentence.'], whatToWatch: ['A final synthetic sentence.'] };
  const snapshot = structuredClone(units);
  const unitsSha256 = createHash('sha256').update(JSON.stringify(units)).digest('hex');
  try {
    return applyPhraseCopyedits(units, { unitsSha256, replacements: replacements.map(([find, replace]) =>
      ({ field: 'whatHappened', unitIndex: 0, find, replace })) }, unitsSha256);
  } finally {
    assert.deepEqual(units, snapshot, 'The context check must leave baseline text unchanged');
  }
};

test('context guard rejects nonstrings and newly increased adjacent duplicate pairs', () => {
  for (const invalid of [null, undefined, 42, [], {}, '', '   ']) {
    hold(invalid, 'A synthetic sentence.');
    hold('A synthetic sentence.', invalid);
  }
  for (const [before, after] of [
    ['The amber panel moves.', 'The amber amber panel moves.'],
    ['The amber amber panel moves.', 'The amber amber amber panel moves.'],
    ['The amber amber panel moves.', 'The blue blue panel moves.'],
    ['The panel moves.', 'The panel, PANEL moves.'],
    ['The panel moves.', 'The panel ｐａｎｅｌ moves.'],
    ['The panel moves.', 'The panel-panel moves.'],
    ['The marker moves.', 'The marker 7 7 moves.'],
  ]) hold(before, after);
});

test('bounded input permits the character and token limits and holds larger strings', () => {
  const atCharacterLimit = 'x'.repeat(2000);
  const atTokenLimit = Array(512).fill('x').join(' ');
  assert.doesNotThrow(() => assertPhraseCopyeditContext(atCharacterLimit, atCharacterLimit));
  assert.doesNotThrow(() => assertPhraseCopyeditContext(atTokenLimit, atTokenLimit));
  for (const oversized of ['x'.repeat(2001), Array(513).fill('x').join(' ')]) {
    hold(oversized, 'A synthetic sentence.');
    hold('A synthetic sentence.', oversized);
  }
});

test('repeated lexical ngrams include punctuation, compounds and overlapping windows', () => {
  for (const [before, after] of [
    ['The red blue panel moves.', 'The red blue panel rests beside the red blue panel.'],
    ['The red blue panel moves.', 'The RED, blue-panel rests beside the red blue panel.'],
    ["The keeper's panel moves.", "The keeper's panel rests beside the keeper s panel."],
    ['The unit 7 marker moves.', 'The unit 7 marker rests beside the UNIT 7 marker.'],
    ['Red blue red turns.', 'Red blue red blue red turns.'],
  ]) hold(before, after);
});

test('existing repetition may remain or decrease and ordinary edits may pass', () => {
  for (const [before, after] of [
    ['The amber panel moves.', 'The golden panel moves.'],
    ['The amber amber panel moves.', 'The amber amber panel turns.'],
    ['The amber amber amber panel moves.', 'The amber amber panel moves.'],
    ['The red blue panel rests beside the red blue panel.', 'The red blue panel waits beside the red blue panel.'],
    ['The red blue panel rests beside the red blue panel.', 'The red blue panel rests beside a golden frame.'],
    ['The red blue panel rests beside the red blue panel.', 'The RED blue-panel rests beside the red blue panel.'],
  ]) assert.doesNotThrow(() => assertPhraseCopyeditContext(before, after));
});

test('a repeated nine-word phrase is held even when shorter ngram counts do not increase', () => {
  const before = 'a b c d e f g h i x a b c d e f g h x b c d e f g h i';
  const after = 'a b c d e f g h i a b c d e f g h i';
  hold(before, after);
});

test('assembled phrase edits reject duplicate seams and duplication inside replacements', () => {
  const sentence = 'The panel carries polished tiles along the narrow walkway while workers label wooden crates beside the quiet garden wall today.';
  for (const replacement of ['carries polished', 'polished tiles', 'smooth smooth', 'smooth-smooth']) {
    assert.throws(() => apply(sentence, [['polished', replacement]]), contextError);
  }
});

test('two individually valid edits are checked together for newly repeated phrases', () => {
  const sentence = 'The red amber panel rests beside a red wooden panel while workers label crates along the quiet garden wall today.';
  assert.doesNotThrow(() => apply(sentence, [['amber', 'blue']]));
  assert.doesNotThrow(() => apply(sentence, [['wooden', 'blue']]));
  assert.throws(() => apply(sentence, [['amber', 'blue'], ['wooden', 'blue']]), contextError);
});

test('manual semantic regression examples can pass lexical checks without preserving meaning', () => {
  // These synthetic category-to-example and lost-quality changes require
  // independent semantic review. Passing this lexical guard is not approval.
  for (const [find, replace] of [
    ['constrained generation tasks', 'images and designs'],
    ['quality objectives', 'general objectives'],
  ]) {
    const before = `The method addresses ${find} during a local exercise while reviewers compare notes beside the laboratory display before recording their conclusions.`;
    const after = before.replace(find, replace);
    assert.doesNotThrow(() => assertPhraseCopyeditContext(before, after));
    assert.equal(apply(before, [[find, replace]]).units.whatHappened[0], after);
  }
});
