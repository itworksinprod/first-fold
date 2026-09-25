// Experimental decision boundary only. Abstention is a hold, not an approved
// original draft; a single mechanically valid edit still needs semantic review.
import { buildPhraseCopyeditCatalog, applyCatalogPhraseCopyedits } from './phrase-copyedit-catalog.mjs';
import { assertPhraseCopyeditUnits, phraseCopyeditUnitsHash, PHRASE_COPYEDIT_LIMITS } from './phrase-copyedit.mjs';

const issued = new WeakMap();
const fail = reason => Object.assign(new Error(`FACT_SUMMARY_SINGLE_PHRASE_${reason}`), { code: `FACT_SUMMARY_SINGLE_PHRASE_${reason}` });
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
  });
const dense = value => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype &&
  value.length <= 1 && Reflect.ownKeys(value).length === value.length + 1 &&
  (value.length === 0 || (() => {
    const descriptor = Object.getOwnPropertyDescriptor(value, '0');
    return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
  })());
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const SINGLE_PHRASE_COPYEDIT_LIMITS = Object.freeze({ ...PHRASE_COPYEDIT_LIMITS, maxEdits: 1, maxEditsPerUnit: 1 });

export function buildSinglePhraseCopyeditView(beforeUnits) {
  const catalog = buildPhraseCopyeditCatalog(beforeUnits);
  const schema = structuredClone(catalog.schema);
  schema.required = ['catalogSha256', 'decision', 'replacements'];
  schema.properties.decision = { type: 'string', enum: ['replace', 'abstain'] };
  schema.properties.replacements.minItems = 0;
  schema.properties.replacements.maxItems = 1;
  // Runtime enforces the decision/cardinality pair even if JSON mode ignores
  // the schema. Keep the same catalog issuance and literal edit protections.
  const view = freeze({ data: catalog.data, schema });
  issued.set(view, catalog);
  return view;
}

export function applySinglePhraseCopyedit(beforeUnits, proposal, view) {
  const catalog = issued.get(view);
  if (!catalog) throw fail('BINDING');
  assertPhraseCopyeditUnits(beforeUnits);
  if (phraseCopyeditUnitsHash(beforeUnits) !== catalog.data.unitsSha256) throw fail('BINDING');
  if (!exact(proposal, ['catalogSha256', 'decision', 'replacements']) ||
      proposal.catalogSha256 !== catalog.data.catalogSha256 || !dense(proposal.replacements)) throw fail('SHAPE');
  if (proposal.decision === 'abstain' && proposal.replacements.length === 0) return { decision: 'abstain' };
  if (proposal.decision !== 'replace' || proposal.replacements.length !== 1) throw fail('DECISION');
  if (!exact(proposal.replacements[0], ['spanId', 'replace'])) throw fail('SHAPE');
  const result = applyCatalogPhraseCopyedits(beforeUnits,
    { catalogSha256: proposal.catalogSha256, replacements: proposal.replacements }, catalog);
  return { decision: 'replace', ...result };
}
