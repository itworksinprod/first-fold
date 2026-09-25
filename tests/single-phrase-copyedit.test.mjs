import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSinglePhraseCopyeditView, applySinglePhraseCopyedit } from '../scripts/automation/free/single-phrase-copyedit.mjs';
import { buildPhraseCopyeditCatalog, applyCatalogPhraseCopyedits } from '../scripts/automation/free/phrase-copyedit-catalog.mjs';

// Synthetic mechanics tests: an accepted edit does not establish usefulness,
// factual support, or preservation of meaning.
const sentence = 'The amber panel carries polished tiles along the narrow walkway while workers label wooden crates beside the quiet garden wall today.';
const fixture = () => ({ headline: ['Synthetic single edit fixture'], whatHappened: [sentence],
  whyItMatters: [sentence], whatToWatch: [sentence] });
const singleError = error => /^FACT_SUMMARY_SINGLE_PHRASE_(?:BINDING|SHAPE|DECISION)$/.test(error.code ?? '');
const spanFor = (view, find = 'amber', field = 'whatHappened') => {
  const unit = view.data.units.find(unit => unit.field === field && unit.unitIndex === 0);
  const span = view.data.spans.find(span => span.unitId === unit.unitId && span.find === find);
  assert.ok(span, `Expected eligible span ${find}`);
  return span;
};
const replace = view => ({ catalogSha256: view.data.catalogSha256, decision: 'replace',
  replacements: [{ spanId: spanFor(view).spanId, replace: 'golden' }] });
const abstain = view => ({ catalogSha256: view.data.catalogSha256, decision: 'abstain', replacements: [] });
const assertDeeplyFrozen = value => {
  if (value && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(assertDeeplyFrozen);
  }
};

test('single edit view freezes the unchanged catalog with a one-or-zero replacement schema', () => {
  const before = fixture();
  const view = buildSinglePhraseCopyeditView(before);
  assert.deepEqual(view.data, buildPhraseCopyeditCatalog(before).data);
  assertDeeplyFrozen(view);
  assert.deepEqual(Object.keys(view).sort(), ['data', 'schema']);
  assert.equal(view.schema.additionalProperties, false);
  assert.deepEqual(view.schema.required.slice().sort(), ['catalogSha256', 'decision', 'replacements']);
  assert.deepEqual(view.schema.properties.decision.enum.slice().sort(), ['abstain', 'replace']);
  assert.equal(view.schema.properties.replacements.minItems, 0);
  assert.equal(view.schema.properties.replacements.maxItems, 1);
  assert.equal(view.schema.properties.replacements.items.additionalProperties, false);
  assert.deepEqual(view.schema.properties.replacements.items.required.slice().sort(), ['replace', 'spanId']);
  assert.throws(() => { view.schema.properties.replacements.maxItems = 6; }, TypeError);
});

test('one selected edit returns its exact result and abstention returns no draft or approval', () => {
  const before = fixture();
  const snapshot = structuredClone(before);
  const view = buildSinglePhraseCopyeditView(before);
  const candidate = replace(view);
  const result = applySinglePhraseCopyedit(before, candidate, view);
  const expected = structuredClone(before);
  expected.whatHappened[0] = sentence.replace('amber', 'golden');
  assert.deepEqual(Object.keys(result).sort(), ['decision', 'editsApplied', 'units']);
  assert.equal(result.decision, 'replace');
  assert.deepEqual(result.units, expected);
  assert.equal(result.editsApplied.length, 1);
  assert.equal(result.editsApplied[0].find, 'amber');
  assert.equal(result.editsApplied[0].replace, 'golden');
  assert.deepEqual(applySinglePhraseCopyedit(before, abstain(view), view), { decision: 'abstain' });
  assert.deepEqual(before, snapshot);
  assert.deepEqual(candidate, replace(view));
});

test('decision cardinality rejects omitted or extra edits instead of silently dropping them', () => {
  const before = fixture();
  const view = buildSinglePhraseCopyeditView(before);
  const candidate = replace(view);
  const second = { spanId: spanFor(view, 'wooden').spanId, replace: 'oak' };
  for (const invalid of [
    { ...candidate, replacements: [] }, { ...candidate, replacements: [...candidate.replacements, second] },
    { ...abstain(view), replacements: candidate.replacements },
    { ...candidate, decision: 'skip' }, { ...candidate, decision: null },
    { catalogSha256: view.data.catalogSha256, replacements: [] },
    { ...abstain(view), reason: 'Extra explanation' },
  ]) assert.throws(() => applySinglePhraseCopyedit(before, invalid, view), singleError);
});

test('issued identity, exact baseline and catalog hash are required even for abstention', () => {
  const before = fixture();
  const view = buildSinglePhraseCopyeditView(before);
  for (const candidate of [replace(view), abstain(view)]) {
    for (const forged of [null, { ...view }, structuredClone(view), buildPhraseCopyeditCatalog(before)]) {
      assert.throws(() => applySinglePhraseCopyedit(before, candidate, forged), singleError);
    }
    const stale = { ...candidate, catalogSha256: '0'.repeat(64) };
    assert.throws(() => applySinglePhraseCopyedit(before, stale, view), singleError);
    for (const field of ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch']) {
      const changed = structuredClone(before);
      changed[field][0] += ' Changed.';
      assert.throws(() => applySinglePhraseCopyedit(changed, candidate, view), singleError);
    }
    assert.doesNotThrow(() => applySinglePhraseCopyedit(structuredClone(before), candidate, view));
  }
});

test('proposal object descriptors reject getters, inherited fields and hidden data without executing them', () => {
  const before = fixture();
  const view = buildSinglePhraseCopyeditView(before);
  let reads = 0;
  const candidates = [Object.create(replace(view)), Object.assign(Object.create(null), replace(view))];
  for (const key of ['catalogSha256', 'decision', 'replacements']) {
    const getter = replace(view);
    const value = getter[key];
    Object.defineProperty(getter, key, { enumerable: true, get() { reads++; return value; } });
    candidates.push(getter);
    const hidden = replace(view);
    Object.defineProperty(hidden, key, { enumerable: false });
    candidates.push(hidden);
  }
  for (const key of ['hidden', 'toJSON', Symbol('hidden')]) {
    const extra = abstain(view);
    Object.defineProperty(extra, key, { value() { reads++; return abstain(view); } });
    candidates.push(extra);
  }
  for (const candidate of candidates) {
    assert.throws(() => applySinglePhraseCopyedit(before, candidate, view), singleError);
  }
  const forgedView = { get data() { reads++; return view.data; }, schema: view.schema };
  assert.throws(() => applySinglePhraseCopyedit(before, abstain(view), forgedView), singleError);
  assert.equal(reads, 0);
});

test('replacement arrays and records must be dense plain data without getters or serialization hooks', () => {
  const before = fixture();
  const view = buildSinglePhraseCopyeditView(before);
  const record = replace(view).replacements[0];
  let reads = 0;
  const arrays = [Array(1), [null], [Object.create(record)]];
  const inherited = Array(1);
  Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype), { 0: record }));
  arrays.push(inherited);
  const getterIndex = [record];
  Object.defineProperty(getterIndex, '0', { enumerable: true, get() { reads++; return record; } });
  arrays.push(getterIndex);
  for (const key of ['toJSON', Symbol.iterator, 'hidden']) {
    const hooked = [record];
    Object.defineProperty(hooked, key, { value() { reads++; return [record]; } });
    arrays.push(hooked);
  }
  for (const key of ['spanId', 'replace']) {
    const getterRecord = { ...record };
    Object.defineProperty(getterRecord, key, { enumerable: true, get() { reads++; return record[key]; } });
    arrays.push([getterRecord]);
  }
  for (const key of ['toJSON', Symbol('hidden')]) {
    const hookedRecord = { ...record };
    Object.defineProperty(hookedRecord, key, { value() { reads++; return record; } });
    arrays.push([hookedRecord]);
  }
  for (const replacements of arrays) {
    assert.throws(() => applySinglePhraseCopyedit(before, { ...replace(view), replacements }, view), singleError);
  }
  for (const key of ['toJSON', Symbol.iterator, Symbol('hidden')]) {
    const candidate = abstain(view);
    Object.defineProperty(candidate.replacements, key, { get() { reads++; return () => []; } });
    assert.throws(() => applySinglePhraseCopyedit(before, candidate, view), singleError);
  }
  assert.equal(reads, 0);
});

test('no-op, unknown IDs and protected or duplicated prose retain delegated rejections', () => {
  const before = fixture();
  const view = buildSinglePhraseCopyeditView(before);
  const candidate = replace(view);
  for (const [replacement, expectedCode] of [
    ['amber', 'FACT_SUMMARY_PHRASE_EDIT_UNCHANGED'],
    ['may move', 'FACT_SUMMARY_PHRASE_EDIT_PROTECTED'],
    ['golden golden', 'FACT_SUMMARY_PHRASE_EDIT_CONTEXT'],
  ]) {
    const proposal = { ...candidate, replacements: [{ ...candidate.replacements[0], replace: replacement }] };
    assert.throws(() => applySinglePhraseCopyedit(before, proposal, view), error => error.code === expectedCode);
  }
  const unknown = { ...candidate, replacements: [{ spanId: 'unknown', replace: 'golden' }] };
  assert.throws(() => applySinglePhraseCopyedit(before, unknown, view), error => /^FACT_SUMMARY_PHRASE_CATALOG_/.test(error.code));
});

test('the batch API still applies multiple edits and a single edit still needs semantic review', () => {
  const before = fixture();
  const catalog = buildPhraseCopyeditCatalog(before);
  const batch = applyCatalogPhraseCopyedits(before, { catalogSha256: catalog.data.catalogSha256,
    replacements: [{ spanId: spanFor(catalog).spanId, replace: 'golden' },
      { spanId: spanFor(catalog, 'wooden').spanId, replace: 'oak' }] }, catalog);
  assert.equal(batch.editsApplied.length, 2);
  const semanticFixture = fixture();
  semanticFixture.whatHappened[0] = 'The method addresses quality objectives during a local exercise while reviewers compare notes beside the laboratory display before recording their conclusions.';
  const view = buildSinglePhraseCopyeditView(semanticFixture);
  const result = applySinglePhraseCopyedit(semanticFixture, { catalogSha256: view.data.catalogSha256,
    decision: 'replace', replacements: [{ spanId: spanFor(view, 'quality objectives').spanId, replace: 'general objectives' }] }, view);
  assert.equal(result.decision, 'replace');
  assert.equal(result.units.whatHappened[0], semanticFixture.whatHappened[0].replace('quality objectives', 'general objectives'));
  // One selected span does not automatically justify the loss of quality scope.
});
