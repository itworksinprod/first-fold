// Addressing-only control. A valid catalog ID establishes WHERE an edit goes,
// not whether the replacement preserves meaning or improves the article.
import { createHash } from 'node:crypto';
import { applyPhraseCopyedits, assertPhraseCopyeditUnits, phraseCopyeditFindSpan,
  phraseCopyeditUnitsHash, PHRASE_COPYEDIT_LIMITS } from './phrase-copyedit.mjs';

const issued = new WeakMap();
const fields = ['whatHappened', 'whyItMatters', 'whatToWatch'];
const fail = reason => Object.assign(new Error(`FACT_SUMMARY_PHRASE_CATALOG_${reason}`), { code: `FACT_SUMMARY_PHRASE_CATALOG_${reason}` });
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const count = text => (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const PHRASE_CATALOG_LIMITS = Object.freeze({ maxSpans: 512, maxCatalogBytes: 40000 });
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

export function buildPhraseCopyeditCatalog(beforeUnits) {
  assertPhraseCopyeditUnits(beforeUnits);
  const units = [], spans = [];
  for (const field of fields) {
    for (const [unitIndex, text] of beforeUnits[field].entries()) {
      const unitId = `U${units.length + 1}`;
      units.push({ unitId, field, unitIndex, text });
      const tokens = [...text.matchAll(/[a-z]+(?:[-'][a-z]+)*/gu)];
      const allowance = Math.min(PHRASE_COPYEDIT_LIMITS.maxFindWords,
        PHRASE_COPYEDIT_LIMITS.maxChangedWordsPerUnit, Math.floor(count(text) * PHRASE_COPYEDIT_LIMITS.maxChangedFraction));
      for (let first = 0; first < tokens.length; first++) {
        for (let last = first; last < Math.min(tokens.length, first + PHRASE_COPYEDIT_LIMITS.maxFindWords); last++) {
          if (last > first && text.slice(tokens[last - 1].index + tokens[last - 1][0].length, tokens[last].index) !== ' ') break;
          const start = tokens[first].index, end = tokens[last].index + tokens[last][0].length;
          const find = text.slice(start, end);
          if (find.length > PHRASE_COPYEDIT_LIMITS.maxPhraseChars || count(find) > allowance) break;
          try {
            // Share exactly the existing grammar/protected-word/unique-boundary
            // policy. Catalog generation cannot widen the old editing contract.
            const located = phraseCopyeditFindSpan(text, find);
            if (located.start !== start || located.end !== end) continue;
          } catch (error) {
            if (!['FACT_SUMMARY_PHRASE_EDIT_SPAN', 'FACT_SUMMARY_PHRASE_EDIT_PROTECTED', 'FACT_SUMMARY_PHRASE_EDIT_MATCH'].includes(error.code)) throw error;
            continue;
          }
          spans.push({ spanId: `P${spans.length + 1}`, unitId, find, start, end });
          if (spans.length > PHRASE_CATALOG_LIMITS.maxSpans) throw fail('BUDGET');
        }
      }
    }
  }
  if (!spans.length) throw fail('EMPTY');
  const data = { version: 'phrase-span-catalog-v1', unitsSha256: phraseCopyeditUnitsHash(beforeUnits), units, spans };
  data.catalogSha256 = hash(data);
  if (Buffer.byteLength(JSON.stringify(data)) > PHRASE_CATALOG_LIMITS.maxCatalogBytes) throw fail('BUDGET');
  const schema = { type: 'object', additionalProperties: false, required: ['catalogSha256', 'replacements'], properties: {
    catalogSha256: { type: 'string', enum: [data.catalogSha256] },
    replacements: { type: 'array', minItems: 1, maxItems: PHRASE_COPYEDIT_LIMITS.maxEdits, items: {
      type: 'object', additionalProperties: false, required: ['spanId', 'replace'], properties: {
        spanId: { type: 'string', enum: spans.map(span => span.spanId) },
        replace: { type: 'string', minLength: 1, maxLength: PHRASE_COPYEDIT_LIMITS.maxPhraseChars },
      },
    } },
  } };
  const catalog = freeze({ data, schema });
  issued.set(catalog, { unitsSha256: data.unitsSha256, catalogSha256: data.catalogSha256,
    targets: new Map(spans.map(span => {
      const unit = units.find(unit => unit.unitId === span.unitId);
      return [span.spanId, { field: unit.field, unitIndex: unit.unitIndex, find: span.find }];
    })) });
  return catalog;
}

export function applyCatalogPhraseCopyedits(beforeUnits, proposal, catalog) {
  const bound = issued.get(catalog);
  if (!bound) throw fail('BINDING');
  assertPhraseCopyeditUnits(beforeUnits);
  if (phraseCopyeditUnitsHash(beforeUnits) !== bound.unitsSha256) throw fail('BINDING');
  if (!exact(proposal, ['catalogSha256', 'replacements']) || proposal.catalogSha256 !== bound.catalogSha256 ||
      !Array.isArray(proposal.replacements) || !proposal.replacements.length ||
      proposal.replacements.length > PHRASE_COPYEDIT_LIMITS.maxEdits) throw fail('SHAPE');
  const seen = new Set(), replacements = [];
  for (const edit of proposal.replacements) {
    if (!exact(edit, ['spanId', 'replace']) || typeof edit.spanId !== 'string' ||
        !bound.targets.has(edit.spanId) || seen.has(edit.spanId)) throw fail('TARGET');
    seen.add(edit.spanId);
    replacements.push({ ...bound.targets.get(edit.spanId), replace: edit.replace });
  }
  return applyPhraseCopyedits(beforeUnits, { unitsSha256: bound.unitsSha256, replacements }, bound.unitsSha256);
}
