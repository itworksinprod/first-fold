// Curated prototype: manually curated concepts, host-owned contrast grammar.
// Source-span binding proves provenance, not semantic support or editorial quality.
// Only the isolated review-only experiment may use it; never daily delivery.
import {createHash} from 'node:crypto';

const issued = new WeakMap();
export const WATCH_COMPOSITION_TEMPLATE = 'How would {measure} differ for the same {task} under the same {requirements}, with and without the extra goal of {goal}?';
const slots = ['measure', 'task', 'requirements', 'goal'];
const sha = text => createHash('sha256').update(text).digest('hex');
const fail = code => Object.assign(new Error(code), {code});
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).length === keys.length && keys.every(key =>
    Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], 'value') && descriptors[key].enumerable);
};
const dense = (value, max) => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype &&
  value.length > 0 && value.length <= max && Reflect.ownKeys(value).length === value.length + 1 &&
  Array.from({length: value.length}, (_, i) => Object.getOwnPropertyDescriptor(value, String(i)))
    .every(d => d && Object.hasOwn(d, 'value') && d.enumerable);
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

// These are reviewed catalog labels, not arbitrary model-authored sentence parts.
// A noun/goal phrase can still be semantically wrong: exact manual review is required.
const boundedPhrase = value => typeof value === 'string' && value.length > 0 && value.length <= 90 &&
  value === value.trim() && !/\s{2}|[^\p{L}\p{M} -]/u.test(value) && value.split(' ').length <= 8 &&
  !/\b(?:guarantee\w*|ensur\w*|prevent\w*|eliminat\w*|only|without|with|versus|would|could|scheduled|announced|upcoming|forthcoming|planned|expected|launch\w*|releas\w*|deploy\w*|rollout\w*)\b/iu.test(value.normalize('NFKC'));

function questionFor(concepts) {
  return WATCH_COMPOSITION_TEMPLATE.replace(/\{(measure|task|requirements|goal)\}/gu, (_, slot) => concepts[slot].phrase);
}

export function createWatchComposer(input) {
  if (!exact(input, ['passages', 'choices']) || !dense(input.passages, 2) || !dense(input.choices, 4)) throw fail('WATCH_COMPOSITION_INPUT');
  const passages = new Map();
  for (const p of input.passages) {
    if (!exact(p, ['evidenceId', 'text']) || !['S1P5', 'S1P20'].includes(p.evidenceId) || passages.has(p.evidenceId) ||
      typeof p.text !== 'string' || !p.text.trim() || p.text.length > 6000) throw fail('WATCH_COMPOSITION_EVIDENCE');
    passages.set(p.evidenceId, p.text);
  }
  const ids = new Set(), questions = new Set();
  for (const c of input.choices) {
    if (!exact(c, ['id', 'concepts']) || typeof c.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/u.test(c.id) ||
      ids.has(c.id) || !exact(c.concepts, slots)) throw fail('WATCH_COMPOSITION_CHOICE');
    ids.add(c.id);
    for (const slot of slots) {
      const s = c.concepts[slot];
      if (!exact(s, ['phrase', 'evidenceId', 'sourceSpan']) || !boundedPhrase(s.phrase) ||
        !passages.has(s.evidenceId) || typeof s.sourceSpan !== 'string' || !s.sourceSpan.trim() ||
        s.sourceSpan.length > 400 || !passages.get(s.evidenceId).includes(s.sourceSpan)) throw fail('WATCH_COMPOSITION_CONCEPT');
    }
    const q = questionFor(c.concepts);
    if (q.split(/\s+/u).length > 36 || questions.has(q)) throw fail('WATCH_COMPOSITION_TEXT');
    questions.add(q);
  }
  const data = freeze(structuredClone(input));
  const catalogSha256 = sha(JSON.stringify(data));
  const plan = freeze({catalogSha256, data, status: 'offline-prototype-requires-exact-review',
    assistance: 'manually-curated-concepts-and-host-owned-comparison-grammar'});
  issued.set(plan, new Map(data.choices.map(c => [c.id, questionFor(c.concepts)])));
  return plan;
}

// A future model could select only an issued ID or abstain. It cannot author the
// missing-goal baseline, conditions or another operating-mode description.
export function composeWatchSelection(plan, selection) {
  const choices = issued.get(plan);
  if (!choices) throw fail('WATCH_COMPOSITION_PLAN');
  if (!exact(selection, ['catalogSha256', 'decision', 'choiceId']) || selection.catalogSha256 !== plan.catalogSha256) throw fail('WATCH_COMPOSITION_SELECTION');
  if (selection.decision === 'abstain' && selection.choiceId === '') return {decision: 'abstain'};
  if (selection.decision !== 'add' || !choices.has(selection.choiceId)) throw fail('WATCH_COMPOSITION_SELECTION');
  return freeze({decision: 'add', question: choices.get(selection.choiceId), choiceId: selection.choiceId,
    catalogSha256: plan.catalogSha256, status: 'requires-existing-source-and-editorial-gates',
    assistance: plan.assistance});
}
