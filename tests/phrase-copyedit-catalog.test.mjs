import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildPhraseCopyeditCatalog, applyCatalogPhraseCopyedits } from '../scripts/automation/free/phrase-copyedit-catalog.mjs';

// Neutral synthetic fixtures exercise catalog and edit mechanics, not semantic quality.
const sentence = 'The amber panel carries polished tiles along the narrow walkway while workers label wooden crates beside the quiet garden wall today.';
const fields = ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch'];
const beforeUnits = () => ({ headline: ['Synthetic catalog fixture'], whatHappened: [sentence],
  whyItMatters: [sentence], whatToWatch: [sentence] });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const catalogError = error => /^FACT_SUMMARY_PHRASE_CATALOG_/.test(error.code ?? '');
const editError = error => /^FACT_SUMMARY_PHRASE_EDIT_/.test(error.code ?? '');
const spanFor = (catalog, find, field = 'whatHappened', unitIndex = 0) => {
  const unit = catalog.data.units.find(unit => unit.field === field && unit.unitIndex === unitIndex);
  assert.ok(unit, 'The expected body unit must be catalogued');
  const span = catalog.data.spans.find(span => span.unitId === unit.unitId && span.find === find);
  assert.ok(span, `Expected eligible phrase: ${find}`);
  return span;
};
const proposal = (catalog, replacements = [[spanFor(catalog, 'amber'), 'golden']]) => ({
  catalogSha256: catalog.data.catalogSha256,
  replacements: replacements.map(([span, replace]) => ({ spanId: span.spanId, replace })),
});
const assertDeeplyFrozen = value => {
  if (value && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(assertDeeplyFrozen);
  }
};

test('catalog is deterministic, deeply frozen and bound to all exact ordered units', () => {
  const before = beforeUnits();
  const catalog = buildPhraseCopyeditCatalog(before);
  const repeated = buildPhraseCopyeditCatalog(structuredClone(before));
  assert.deepEqual(catalog, repeated);
  assertDeeplyFrozen(catalog);
  assert.equal(catalog.data.version, 'phrase-span-catalog-v1');
  assert.deepEqual(Object.keys(catalog.data).sort(), ['catalogSha256', 'spans', 'units', 'unitsSha256', 'version']);
  assert.equal(catalog.data.unitsSha256, hash(Object.fromEntries(fields.map(field => [field, before[field]]))));
  const { catalogSha256, ...boundData } = catalog.data;
  assert.equal(catalogSha256, hash(boundData));
  assert.deepEqual(catalog.data.units.map(({ field, unitIndex, text }) => ({ field, unitIndex, text })),
    fields.slice(1).map(field => ({ field, unitIndex: 0, text: before[field][0] })));
  assert.equal(new Set(catalog.data.spans.map(span => span.spanId)).size, catalog.data.spans.length);
  assert.equal(new Set(catalog.data.units.map(unit => unit.unitId)).size, catalog.data.units.length);
  assert.deepEqual(catalog.data.units.map(unit => unit.unitId), catalog.data.units.map((_, index) => `U${index + 1}`));
  assert.deepEqual(catalog.data.spans.map(span => span.spanId), catalog.data.spans.map((_, index) => `P${index + 1}`));
  for (const span of catalog.data.spans) {
    const unit = catalog.data.units.find(unit => unit.unitId === span.unitId);
    assert.equal(unit.text.slice(span.start, span.end), span.find);
    assert.notEqual(unit.field, 'headline');
  }
  assert.throws(() => { catalog.data.spans[0].find = 'changed'; }, TypeError);
  assert.throws(() => catalog.data.units.push({}), TypeError);
  assert.equal(catalog.schema.additionalProperties, false);
  assert.deepEqual(catalog.schema.required.slice().sort(), ['catalogSha256', 'replacements']);
  assert.equal(catalog.schema.properties.replacements.minItems, 1);
  assert.equal(catalog.schema.properties.replacements.maxItems, 6);
  assert.equal(catalog.schema.properties.replacements.items.additionalProperties, false);
  assert.deepEqual(catalog.schema.properties.replacements.items.required.slice().sort(), ['replace', 'spanId']);
  assert.deepEqual(catalog.schema.properties.replacements.items.properties.spanId.enum, catalog.data.spans.map(span => span.spanId));
});

test('catalog enumerates every eligible short span without article-specific vocabulary', () => {
  for (const words of [
    ['Amber', 'ceramic', 'panel', 'carries', 'polished', 'tiles', 'along', 'walkway'],
    ['Copper', 'rounded', 'vessel', 'holds', 'fragrant', 'herbs', 'beside', 'window'],
  ]) {
    const before = beforeUnits();
    before.whatHappened = [`${words.join(' ')}.`];
    const catalog = buildPhraseCopyeditCatalog(before);
    const unitId = catalog.data.units.find(unit => unit.field === 'whatHappened').unitId;
    const expected = words.slice(1).flatMap((word, index) =>
      index < words.length - 2 ? [word, `${word} ${words[index + 2]}`] : [word]);
    assert.deepEqual(catalog.data.spans.filter(span => span.unitId === unitId).map(span => span.find).sort(), expected.sort());
  }
  const before = beforeUnits();
  before.whatHappened = ["The amber panel may carry amber-panel tiles beside a keeper's well-worn crate near the garden wall today."];
  const catalog = buildPhraseCopyeditCatalog(before);
  const unitId = catalog.data.units.find(unit => unit.field === 'whatHappened').unitId;
  const finds = catalog.data.spans.filter(span => span.unitId === unitId).map(span => span.find);
  assert.ok(!finds.includes('amber'), 'Ambiguous literal substrings must not become selectable');
  assert.ok(!finds.some(find => /\bmay\b/.test(find)), 'Protected cues remain outside every target span');
  assert.ok(finds.includes("keeper's"));
  assert.ok(finds.includes('well-worn'));
});

test('same phrase in different units has distinct IDs and edits only the selected target', () => {
  const before = beforeUnits();
  before.whatHappened.push(sentence);
  const snapshot = structuredClone(before);
  const catalog = buildPhraseCopyeditCatalog(before);
  const first = spanFor(catalog, 'amber', 'whatHappened', 0);
  const second = spanFor(catalog, 'amber', 'whatHappened', 1);
  assert.notEqual(first.spanId, second.spanId);
  assert.notEqual(first.unitId, second.unitId);
  const result = applyCatalogPhraseCopyedits(before, proposal(catalog, [[second, 'golden']]), catalog);
  const expected = structuredClone(before);
  expected.whatHappened[1] = sentence.replace('amber', 'golden');
  assert.deepEqual(result.units, expected);
  assert.deepEqual(before, snapshot);
  assert.equal(result.editsApplied.length, 1);
  assert.equal(result.editsApplied[0].field, 'whatHappened');
  assert.equal(result.editsApplied[0].unitIndex, 1);
});

test('issued catalog identity and baseline hashes reject clones, mutations and stale segmentation', () => {
  const before = beforeUnits();
  const catalog = buildPhraseCopyeditCatalog(before);
  const candidate = proposal(catalog);
  for (const counterfeit of [{ ...catalog }, structuredClone(catalog), JSON.parse(JSON.stringify(catalog)), null]) {
    assert.throws(() => applyCatalogPhraseCopyedits(before, candidate, counterfeit), catalogError);
  }
  const modified = structuredClone(catalog);
  modified.data.spans[0].start++;
  assert.throws(() => applyCatalogPhraseCopyedits(before, candidate, modified), catalogError);
  assert.doesNotThrow(() => applyCatalogPhraseCopyedits(structuredClone(before), candidate, catalog));
  for (const field of fields) {
    const changed = structuredClone(before);
    changed[field][0] += ' Changed.';
    assert.throws(() => applyCatalogPhraseCopyedits(changed, candidate, catalog), catalogError);
  }
  const segmented = structuredClone(before);
  const words = sentence.split(' ');
  segmented.whatHappened = [words.slice(0, 10).join(' '), words.slice(10).join(' ')];
  assert.equal(segmented.whatHappened.join(' '), sentence);
  assert.throws(() => applyCatalogPhraseCopyedits(segmented, candidate, catalog), catalogError);
});

test('proposal accepts IDs only and rejects holes, inherited keys and target overrides', () => {
  const before = beforeUnits();
  const catalog = buildPhraseCopyeditCatalog(before);
  const valid = proposal(catalog);
  const replacement = valid.replacements[0];
  for (const candidate of [
    null, [], { ...valid, catalogSha256: '0'.repeat(64) }, { ...valid, extra: true },
    { ...valid, replacements: [] }, { ...valid, replacements: Array(1) },
    { ...valid, replacements: [replacement, replacement] },
    { ...valid, replacements: Array(7).fill(replacement) },
    { ...valid, replacements: [{ ...replacement, spanId: 'unknown' }] },
    { ...valid, replacements: [{ ...replacement, spanId: '__proto__' }] },
    { ...valid, replacements: [{ ...replacement, field: 'whyItMatters', find: 'amber' }] },
    { ...valid, replacements: [Object.create(replacement)] }, Object.create(valid),
    JSON.parse(JSON.stringify(valid).replace(/}$/, ',"__proto__":{}}')),
    ...['find', 'field', 'unitIndex', 'start', 'end', 'unitId', 'constructor'].map(key =>
      ({ ...valid, replacements: [{ ...replacement, [key]: 'untrusted' }] })),
  ]) assert.throws(() => applyCatalogPhraseCopyedits(before, candidate, catalog), catalogError);
});

test('hidden array serialization cannot disguise a changed baseline', () => {
  const before = beforeUnits();
  Object.defineProperty(before.whatHappened, 'toJSON', { value: () => [sentence] });
  let catalog;
  try {
    catalog = buildPhraseCopyeditCatalog(before);
  } catch (error) {
    assert.ok(catalogError(error) || editError(error), 'Rejecting non-data arrays at construction is safe');
    return;
  }
  before.whatHappened[0] = sentence.replace('carries', 'destroys');
  assert.throws(() => applyCatalogPhraseCopyedits(before, proposal(catalog), catalog),
    error => catalogError(error) || editError(error));
});

test('catalog construction holds sparse, inherited or oversized input instead of silently truncating', () => {
  const sparse = beforeUnits();
  sparse.whatHappened = Array(2);
  sparse.whatHappened[0] = sentence;
  const inherited = beforeUnits();
  inherited.whatHappened = Array(1);
  Object.setPrototypeOf(inherited.whatHappened, Object.assign(Object.create(Array.prototype), { 0: sentence }));
  for (const before of [sparse, inherited, Object.create(beforeUnits()), { ...beforeUnits(), extra: [] }]) {
    assert.throws(() => buildPhraseCopyeditCatalog(before), error => catalogError(error) || editError(error));
  }
  const overflowing = beforeUnits();
  for (const field of fields.slice(1)) overflowing[field] = Array(4).fill(sentence);
  assert.throws(() => buildPhraseCopyeditCatalog(overflowing), catalogError);
  const huge = beforeUnits();
  huge.whatHappened[0] = `${'X'.repeat(100000)} ${sentence}`;
  assert.throws(() => buildPhraseCopyeditCatalog(huge), error => catalogError(error) || editError(error));
});

test('span and serialized-byte budgets include exact limits and never truncate', () => {
  const words = Array.from({ length: 43 }, (_, i) =>
    String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26));
  const before = beforeUnits();
  for (const field of fields.slice(1)) before[field] = Array(4).fill(words.join(','));
  before.whatToWatch[3] = words.slice(0, 39).join(',');
  const full = buildPhraseCopyeditCatalog(before);
  assert.equal(full.data.spans.length, 512);
  const extra = structuredClone(before);
  extra.whatToWatch[3] = words.slice(0, 40).join(',');
  assert.throws(() => buildPhraseCopyeditCatalog(extra), catalogError);

  const atBytes = desired => {
    const padded = structuredClone(before);
    let remaining = desired - Buffer.byteLength(JSON.stringify(full.data));
    assert.ok(remaining > 0);
    for (const field of fields.slice(1)) {
      for (let i = 0; i < padded[field].length; i++) {
        const amount = Math.min(remaining, 1000 - padded[field][i].length);
        if (amount > 0) padded[field][i] += `,${'X'.repeat(amount - 1)}`;
        remaining -= amount;
      }
    }
    assert.equal(remaining, 0);
    return padded;
  };
  const maximum = buildPhraseCopyeditCatalog(atBytes(40000));
  assert.equal(maximum.data.spans.length, 512);
  assert.equal(Buffer.byteLength(JSON.stringify(maximum.data)), 40000);
  assert.throws(() => buildPhraseCopyeditCatalog(atBytes(40001)), catalogError);
  const multibyte = atBytes(39999);
  multibyte.whatHappened[0] = multibyte.whatHappened[0].replace('XX', 'ÉÉ');
  assert.throws(() => buildPhraseCopyeditCatalog(multibyte), catalogError);
});

test('catalog IDs retain the existing overlap, qualifier, context and grammar holds', () => {
  const before = beforeUnits();
  const catalog = buildPhraseCopyeditCatalog(before);
  for (const replacements of [
    [[spanFor(catalog, 'polished tiles'), 'smooth pieces'], [spanFor(catalog, 'tiles along'), 'pieces beside']],
    [[spanFor(catalog, 'polished'), 'smooth'], [spanFor(catalog, 'tiles'), 'pieces']],
    [[spanFor(catalog, 'amber'), 'may move']],
    [[spanFor(catalog, 'polished'), 'carries polished']],
    [[spanFor(catalog, 'amber'), '<script>']],
  ]) assert.throws(() => applyCatalogPhraseCopyedits(before, proposal(catalog, replacements), catalog), editError);
});

test('a valid catalog address does not establish that its replacement preserves meaning', () => {
  const before = beforeUnits();
  before.whatHappened[0] = 'The method addresses quality objectives during a local exercise while reviewers compare notes beside the laboratory display before recording their conclusions.';
  const catalog = buildPhraseCopyeditCatalog(before);
  const result = applyCatalogPhraseCopyedits(before,
    proposal(catalog, [[spanFor(catalog, 'quality objectives'), 'general objectives']]), catalog);
  assert.equal(result.units.whatHappened[0], before.whatHappened[0].replace('quality objectives', 'general objectives'));
  // Lost quality scope still needs manual semantic review despite a valid span ID.
});
