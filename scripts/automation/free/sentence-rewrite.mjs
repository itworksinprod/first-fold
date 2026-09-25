// Mechanical sentence-by-sentence containment only. IDs, hashes and exact
// cardinality do not establish factual support or semantic equivalence.
import { createHash } from 'node:crypto';
export { SENTENCE_REWRITE_PROMPT } from './sentence-rewrite-prompt.mjs';

const fields = ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch'];
const bodyFields = fields.slice(1);
const issued = new WeakMap();
const fail = reason => Object.assign(new Error(`FACT_SUMMARY_SENTENCE_REWRITE_${reason}`),
  { code: `FACT_SUMMARY_SENTENCE_REWRITE_${reason}` });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).length === keys.length && keys.every(key =>
    Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], 'value') && descriptors[key].enumerable);
};
const dense = (value, minimum, maximum) => {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length < minimum || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) return false;
  const length = Object.getOwnPropertyDescriptor(value, 'length');
  if (!length || !Object.hasOwn(length, 'value') || length.value !== value.length || length.enumerable) return false;
  return Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, String(index)))
    .every(descriptor => descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable);
};
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const unsafeText = /[{}<>]|```|[\p{Cc}\p{Cf}]|["“”]\s*[:,]|\b(?:whatHappened|whyItMatters|whatToWatch)\s*["“”]?\s*:/u;
// This rejects only conspicuous additional sentences. It is deliberately not
// a grammatical proof: naive sentence splitting misclassifies names such as
// Dr. Smith and A. B. Chen, acronyms such as U.S., and decimal values.
const abbreviation = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|No|Fig|Eq|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)|\b[ei]\.g|\bi\.e|\b(?:[A-Z]\.){0,7}[A-Z])\.$/u;
const hasObviousExtraSentence = text => {
  const boundary = /[.!?](?:["'’”\)\]]*)\s+(?=[A-Z0-9"“'])/gu;
  for (const match of text.matchAll(boundary)) {
    if (match[0][0] !== '.' || !abbreviation.test(text.slice(0, match.index + 1))) return true;
  }
  return false;
};

function snapshotUnits(units) {
  if (!exact(units, fields)) throw fail('INPUT');
  const descriptors = Object.getOwnPropertyDescriptors(units), snapshot = {};
  for (const field of fields) {
    const parts = descriptors[field].value, maximum = field === 'headline' ? 1 : 4;
    if (!dense(parts, 1, maximum) || (field === 'headline' && parts.length !== 1)) throw fail('INPUT');
    snapshot[field] = [];
    for (let index = 0; index < parts.length; index++) {
      const text = Object.getOwnPropertyDescriptor(parts, String(index)).value;
      if (typeof text !== 'string' || !text || text !== text.trim() ||
          text.length > (field === 'headline' ? 160 : 1000) || unsafeText.test(text)) throw fail('INPUT');
      snapshot[field].push(text);
    }
  }
  return snapshot;
}

export function buildSentenceRewriteView(beforeUnits) {
  const baseline = snapshotUnits(beforeUnits), baselineSha256 = hash(baseline);
  const units = [];
  for (const field of bodyFields) {
    for (let unitIndex = 0; unitIndex < baseline[field].length; unitIndex++) {
      units.push({ unitId: `U${units.length + 1}`, field, unitIndex, text: baseline[field][unitIndex] });
    }
  }
  const unitIds = units.map(unit => unit.unitId);
  const data = { policy: 'sentence-rewrite-v1', baselineSha256, units };
  const schema = { type: 'object', additionalProperties: false,
    required: ['baselineSha256', 'decision', 'sentences'], properties: {
      baselineSha256: { type: 'string', enum: [baselineSha256] },
      decision: { type: 'string', enum: ['rewrite', 'abstain'] },
      sentences: { type: 'array', minItems: units.length, maxItems: units.length, items: {
        type: 'object', additionalProperties: false, required: ['unitId', 'text'], properties: {
          unitId: { type: 'string', enum: unitIds },
          text: { type: 'string', minLength: 1, maxLength: 1000 },
        },
      } },
    } };
  const view = freeze({ data, schema });
  issued.set(view, { baselineSha256, baseline, units });
  return view;
}

export function applySentenceRewrite(beforeUnits, proposal, view) {
  const bound = issued.get(view);
  if (!bound) throw fail('BINDING');
  const baseline = snapshotUnits(beforeUnits);
  if (hash(baseline) !== bound.baselineSha256) throw fail('BINDING');
  if (!exact(proposal, ['baselineSha256', 'decision', 'sentences']) ||
      proposal.baselineSha256 !== bound.baselineSha256 ||
      !dense(proposal.sentences, bound.units.length, bound.units.length)) throw fail('SHAPE');
  if (!['rewrite', 'abstain'].includes(proposal.decision)) throw fail('DECISION');

  const units = structuredClone(baseline), editsApplied = [];
  for (let index = 0; index < bound.units.length; index++) {
    const sentence = Object.getOwnPropertyDescriptor(proposal.sentences, String(index)).value;
    if (!exact(sentence, ['unitId', 'text'])) throw fail('SHAPE');
    const expected = bound.units[index];
    if (sentence.unitId !== expected.unitId) throw fail('TARGET');
    if (typeof sentence.text !== 'string' || !sentence.text || sentence.text !== sentence.text.trim() ||
        sentence.text.length > 1000 || unsafeText.test(sentence.text) ||
        !/[.!?](?:["'’”\)\]]*)$/u.test(sentence.text) || hasObviousExtraSentence(sentence.text)) throw fail('TEXT');
    units[expected.field][expected.unitIndex] = sentence.text;
    if (sentence.text !== expected.text) editsApplied.push({ unitId: expected.unitId, field: expected.field,
      unitIndex: expected.unitIndex, before: expected.text, after: sentence.text });
  }
  if (!editsApplied.length) {
    if (proposal.decision !== 'abstain') throw fail('DECISION');
    return { decision: 'abstain' };
  }
  if (proposal.decision !== 'rewrite') throw fail('DECISION');
  return { decision: 'rewrite', units, editsApplied };
}
