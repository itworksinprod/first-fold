// Experimental mechanical containment, not proof that a paraphrase means the
// same thing. Exact-text factual and independent before/after review remain required.
import { createHash } from 'node:crypto';
import { assertCopyeditQualifications } from './copyedit-qualification-guard.mjs';
import { assertPhraseCopyeditContext } from './phrase-copyedit-context.mjs';

const fields = ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch'];
const bodyFields = fields.slice(1);
const fail = reason => Object.assign(new Error(`FACT_SUMMARY_PHRASE_EDIT_${reason}`), { code: `FACT_SUMMARY_PHRASE_EDIT_${reason}` });
const exactKeys = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
  });
const phrasePattern = /^[a-z]+(?:[-'][a-z]+)*(?: [a-z]+(?:[-'][a-z]+)*)*$/u;
const tokenCharacter = /[\p{L}\p{M}\p{N}_'’\-]/u;
const wordCount = text => (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
// Protect qualifications and evidence-status language even when a replacement
// would contain the same words. This is intentionally conservative, not exhaustive.
export const PHRASE_COPYEDIT_PROTECTED_WORDS = Object.freeze('can could may might must should better worse best worst more less most least than not no none nothing never without unless cannot always guarantee guarantees guaranteed all any every each only some certain potentially possibly likely unlikely rather evidence reported reports according described demonstrated observed experimental experiments'.split(' '));
export const PHRASE_COPYEDIT_LIMITS = Object.freeze({ maxEdits: 6, maxEditsPerUnit: 2,
  maxFindWords: 5, maxReplacementWords: 8, maxPhraseChars: 80, maxChangedWordsPerUnit: 8, maxChangedFraction: 0.25 });
export const PHRASE_COPYEDIT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['unitsSha256', 'replacements'],
  properties: {
    unitsSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    replacements: { type: 'array', minItems: 1, maxItems: 6, items: {
      type: 'object', additionalProperties: false, required: ['field', 'unitIndex', 'find', 'replace'],
      properties: { field: { type: 'string', enum: bodyFields }, unitIndex: { type: 'integer', minimum: 0, maximum: 3 },
        find: { type: 'string', minLength: 1, maxLength: 80 }, replace: { type: 'string', minLength: 1, maxLength: 80 } },
    } },
  },
};

export const phraseCopyeditUnitsHash = units => createHash('sha256')
  .update(JSON.stringify(Object.fromEntries(fields.map(field => [field, units[field]])))).digest('hex');

export function assertPhraseCopyeditUnits(beforeUnits) {
  if (!exactKeys(beforeUnits, fields) || fields.some(field => {
    const parts = beforeUnits[field];
    if (!Array.isArray(parts) || Object.getPrototypeOf(parts) !== Array.prototype ||
        parts.length < 1 || parts.length > (field === 'headline' ? 1 : 4) ||
        Reflect.ownKeys(parts).length !== parts.length + 1) return true;
    for (let index = 0; index < parts.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(parts, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return true;
      const unit = descriptor.value;
      if (typeof unit !== 'string' || !unit || unit !== unit.trim() || unit.length > (field === 'headline' ? 160 : 1000)) return true;
    }
    return false;
  })) throw fail('INPUT');
}

export function assertPhraseCopyeditPhrase(phrase, maxWords) {
  if (typeof phrase !== 'string' || phrase.length > 80 || !phrasePattern.test(phrase) ||
      wordCount(phrase) > maxWords || phrase.normalize('NFKC') !== phrase) throw fail('SPAN');
  const words = phrase.match(/[\p{L}]+/gu);
  if (words.some(word => PHRASE_COPYEDIT_PROTECTED_WORDS.includes(word)) || /n't\b/u.test(phrase)) throw fail('PROTECTED');
}

export function phraseCopyeditFindSpan(unit, find) {
  assertPhraseCopyeditPhrase(find, PHRASE_COPYEDIT_LIMITS.maxFindWords);
  const start = unit.indexOf(find), end = start + find.length;
  if (start < 0 || unit.indexOf(find, start + 1) !== -1 ||
      tokenCharacter.test([...unit.slice(0, start)].at(-1) ?? '') || tokenCharacter.test([...unit.slice(end)][0] ?? '')) throw fail('MATCH');
  return { start, end };
}

export function applyPhraseCopyedits(beforeUnits, proposal, expectedUnitsSha256) {
  assertPhraseCopyeditUnits(beforeUnits);
  const actualHash = phraseCopyeditUnitsHash(beforeUnits);
  if (expectedUnitsSha256 !== actualHash || !exactKeys(proposal, ['unitsSha256', 'replacements']) ||
      proposal.unitsSha256 !== actualHash || !Array.isArray(proposal.replacements) ||
      !proposal.replacements.length || proposal.replacements.length > PHRASE_COPYEDIT_LIMITS.maxEdits) throw fail('SHAPE');
  const byUnit = new Map();
  for (const edit of proposal.replacements) {
    if (!exactKeys(edit, ['field', 'unitIndex', 'find', 'replace']) || !bodyFields.includes(edit.field) ||
        !Number.isInteger(edit.unitIndex) || edit.unitIndex < 0 || edit.unitIndex >= beforeUnits[edit.field].length) throw fail('TARGET');
    for (const [key, maxWords] of [['find', 5], ['replace', 8]]) {
      assertPhraseCopyeditPhrase(edit[key], maxWords);
    }
    if (edit.find === edit.replace) throw fail('UNCHANGED');
    const unit = beforeUnits[edit.field][edit.unitIndex];
    // Literal, unique, whole-token matches only. No fuzzy matching, regex supplied
    // by the model, or applying later edits against an already modified sentence.
    const { start, end } = phraseCopyeditFindSpan(unit, edit.find);
    const key = `${edit.field}:${edit.unitIndex}`;
    const edits = byUnit.get(key) ?? [];
    edits.push({ ...edit, start, end });
    byUnit.set(key, edits);
  }
  const units = structuredClone(beforeUnits), editsApplied = [];
  for (const edits of byUnit.values()) {
    edits.sort((a, b) => a.start - b.start);
    const { field, unitIndex } = edits[0], baseline = beforeUnits[field][unitIndex];
    const changedWords = edits.reduce((sum, edit) => sum + wordCount(edit.find), 0);
    if (edits.length > 2 || changedWords > Math.min(8, Math.floor(wordCount(baseline) * 0.25))) throw fail('COVERAGE');
    for (let i = 1; i < edits.length; i++) {
      if (edits[i].start < edits[i - 1].end || !/[\p{L}\p{N}]/u.test(baseline.slice(edits[i - 1].end, edits[i].start))) throw fail('OVERLAP');
    }
    let cursor = 0, output = '';
    for (const edit of edits) {
      output += baseline.slice(cursor, edit.start) + edit.replace;
      cursor = edit.end;
      editsApplied.push(edit);
    }
    const assembled = output + baseline.slice(cursor);
    assertPhraseCopyeditContext(baseline, assembled);
    units[field][unitIndex] = assembled;
  }
  assertCopyeditQualifications(beforeUnits, units);
  return { units, editsApplied };
}
