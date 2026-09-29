// Versioned representation: the model selects word spans instead of copying
// anchor prose. Reconstruction is protocol decoding, never repair of v1 output.
import {createHash} from 'node:crypto';
import {buildWatchRoleReview, diagnoseWatchRoleReview, WATCH_ROLE_PROMPT} from './watch-role-review.mjs';

export const WATCH_ROLE_SPAN_CONTRACT = 'watch-role-word-spans-v2';
const issued = new WeakMap();
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).length === keys.length && keys.every(key =>
    Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], 'value') && descriptors[key].enumerable);
};
const dense = value => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype &&
  value.length >= 2 && value.length <= 10 && Reflect.ownKeys(value).length === value.length + 1 &&
  Array.from({length: value.length}, (_, i) => Object.getOwnPropertyDescriptor(value, String(i)))
    .every(d => d && Object.hasOwn(d, 'value') && d.enumerable);
const freeze = value => {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);}
  return value;
};

export function buildWatchRoleSpanReview(input) {
  const sourceView = buildWatchRoleReview(input); // All original input restrictions.
  const question = sourceView.data.question;
  const boundaries = [...question.matchAll(/\S+/gu)].map(m => ({start: m.index, end: m.index + m[0].length}));
  const words = boundaries.map((b, i) => ({wordId: i + 1, text: question.slice(b.start, b.end)}));
  const data = {policy: WATCH_ROLE_SPAN_CONTRACT, question, passages: sourceView.data.passages, words};
  data.reviewSha256 = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const schema = structuredClone(sourceView.schema);
  schema.properties.reviewSha256.enum = [data.reviewSha256];
  const finding = schema.properties.findings.items;
  finding.required = ['startWord', 'endWord', 'role', 'reason', 'evidenceIds', 'grounded'];
  delete finding.properties.anchor;
  finding.properties.startWord = {type: 'integer', minimum: 1, maximum: words.length};
  finding.properties.endWord = {type: 'integer', minimum: 1, maximum: words.length};
  const prompt = WATCH_ROLE_PROMPT.replace(
    'Each anchor must be an exact contiguous excerpt of the question; use a short, decisive excerpt and a reason explaining its meaning in the WHOLE question.',
    'For each finding select a short, decisive contiguous excerpt using startWord and endWord from the supplied numbered words. Indices are 1-based, both boundaries are inclusive, and startWord must not exceed endWord. Do not return an anchor string or paraphrase. Code reconstructs the exact question slice, including its original punctuation and spacing. Keep that slice at most 240 characters. Explain its meaning in the WHOLE question in reason.');
  const view = freeze({data, schema, prompt});
  issued.set(view, {sourceView, boundaries});
  return view;
}

export function diagnoseWatchRoleSpanReview(value, view) {
  const invalid = {valid: false, reportedGrounded: false, status: 'invalid-response'};
  const reject = reason => ({verdict: invalid, reason});
  const record = issued.get(view);
  if (!record) return reject('VIEW');
  if (!exact(value, ['reviewSha256', 'question', 'unknownAnswer', 'findings'])) return reject('ENVELOPE_SHAPE');
  if (value.reviewSha256 !== view.data.reviewSha256) return reject('REVIEW_HASH');
  if (value.question !== view.data.question) return reject('QUESTION_ECHO');
  if (!dense(value.findings)) return reject('FINDINGS_ARRAY');
  const findings = [];
  for (const f of value.findings) {
    if (!exact(f, ['startWord', 'endWord', 'role', 'reason', 'evidenceIds', 'grounded'])) return reject('FINDING_SHAPE');
    if (!Number.isSafeInteger(f.startWord) || !Number.isSafeInteger(f.endWord) || f.startWord < 1 ||
        f.endWord < f.startWord || f.endWord > record.boundaries.length) return reject('ANCHOR_RANGE');
    const anchor = value.question.slice(record.boundaries[f.startWord - 1].start, record.boundaries[f.endWord - 1].end);
    findings.push({anchor, role: f.role, reason: f.reason, evidenceIds: f.evidenceIds, grounded: f.grounded});
  }
  // Exact raw v2 identity is checked above. The internal canonical view carries
  // its own issued hash; a model cannot choose or correct that binding.
  const canonical = {reviewSha256: record.sourceView.data.reviewSha256, question: value.question,
    unknownAnswer: value.unknownAnswer, findings};
  const diagnostic = diagnoseWatchRoleReview(canonical, record.sourceView);
  if (!diagnostic.verdict.valid) return {verdict: diagnostic.verdict, reason: diagnostic.reason};
  return {...diagnostic, canonical: freeze(structuredClone(canonical))};
}
