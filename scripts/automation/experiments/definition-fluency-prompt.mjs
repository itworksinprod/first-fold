// Editor-only experiment. It changes no factual/meaning reviewer or daily path.
import { createHash } from 'node:crypto';
import { SENTENCE_REWRITE_PROMPT } from '../free/sentence-rewrite-prompt.mjs';

const baseSha256 = 'f67a0e2ad4b38755e35f0a6e73b2e52d7c70a8a21d0124c6dda16f02b1384267';
const anchor = 'Use a supplied definition only as a substitution for the existing term, never as an added clause, assertion, example, or broader explanation. If the reviewed facts do not establish a complete equivalent, leave the term and its sentence untouched.';
const replacement = `Use a supplied definition only to express an existing concept equivalently, never to add an assertion, example, or broader explanation. If the reviewed facts do not establish a complete equivalent, leave the term and its sentence untouched.
After choosing an equivalent definition, rewrite the containing sentence to read naturally as a whole instead of inserting the definition mechanically. You may adjust the surrounding grammar and remove wording that repeats the same obligation, but express that obligation explicitly at least once, retaining its original subject, scope, strength, and conditions.
Read the assembled sentence for redundant phrasing and nested clauses. Prefer a direct grammatical construction that preserves every assertion and relationship; never remove a substantive distinction, qualifier, or condition merely to make the prose smoother.
Compare the completed sentence with the original before responding. If it is not genuinely clearer without any loss or addition of meaning, keep the original sentence unchanged.`;

// Fail on drift instead of silently leaving the old instruction in place.
export function buildDefinitionFluencyPrompt(base) {
  if (typeof base !== 'string' || base.split(anchor).length !== 2 ||
      createHash('sha256').update(base).digest('hex') !== baseSha256) {
    throw Object.assign(new Error('DEFINITION_FLUENCY_PROMPT_DRIFT'), { code: 'DEFINITION_FLUENCY_PROMPT_DRIFT' });
  }
  return base.replace(anchor, replacement);
}

export const DEFINITION_FLUENCY_PROMPT = buildDefinitionFluencyPrompt(SENTENCE_REWRITE_PROMPT);
