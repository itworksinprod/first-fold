// This is a copy-integrity gate, not a fact checker or a prose repair routine.
// Callers keep the original text and reject a field when any reason is returned.
// In particular, HTML escaping and provider schema validation remain separate.

const SCHEMA_KEYS = [
  "candidateId", "headline", "deck", "claims", "supports", "evidenceId",
  "whatHappened", "whyItMatters", "whatToDoOrWatch", "stories", "reviews",
  "draftSha256", "factsSupported", "attributionAccurate", "analysisSupported",
  "usefulAndSpecific", "sourceIds", "sources", "editorialPayload", "text",
].join("|");
const QUOTED_SCHEMA_KEY = new RegExp(`["'](?:${SCHEMA_KEYS})["']\\s*:`, "i");
const BARE_CAMEL_CASE_KEY = /\b(?:candidateId|evidenceId|whatHappened|whyItMatters|whatToDoOrWatch|draftSha256|factsSupported|attributionAccurate|analysisSupported|usefulAndSpecific|sourceIds|editorialPayload)\s*:/i;
const JSON_VALUE = /["'][A-Za-z_][A-Za-z0-9_]{0,63}["']\s*:\s*(?:["'\[{]|-?\d|true\b|false\b|null\b)/i;
const JSON_STRUCTURES = /(?:[}\]]\s*){2,}|\[\s*\{|\}\s*,\s*\{/;
const DANGLING_ENDING = /\b(?:and|or|but|because|although|unless|whether|whereas|despite|including|such as|due to|as well as|in order to)[.!?]$/i;

function detectionText(text) {
  return text
    .replace(/&(?:quot|#0*34|#x0*22|#8220|#8221|#x201c|#x201d);/giu, '"')
    .replace(/&(?:apos|#0*39|#x0*27|#8216|#8217|#x2018|#x2019);/giu, "'")
    .replace(/[“”„‟]/gu, '"').replace(/[‘’‚‛]/gu, "'")
    .replace(/\\(["'])/gu, "$1");
}

function hasUnbalancedQuotes(text) {
  // Apostrophes inside words, possessives, and measurement marks are not prose
  // delimiters. A final quote after a period, however, needs an opening quote.
  for (const quote of ['"', "'"]) {
    let opened = false;
    for (let index = 0; index < text.length; index++) {
      if (text[index] !== quote || text[index - 1] === "\\") continue;
      const before = text[index - 1] || "";
      const after = text[index + 1] || "";
      if (quote === "'" && /[\p{L}\p{N}]/u.test(before) && /[\p{L}\p{N}]/u.test(after)) continue;
      if (!opened) {
        if (/\d/u.test(before) && (!after || /\s|[.,;:!?)]/u.test(after))) continue;
        if (quote === "'" && /s/i.test(before) && (!after || /\s|[,;:!?)]/u.test(after))) continue;
        if (quote === "'" && /^\d{2}(?:\s|[.,;:!?)]|$)/u.test(text.slice(index + 1))) continue;
      }
      opened = !opened;
    }
    if (opened) return true;
  }
  return false;
}

/**
 * Return stable diagnostic reason codes for damaged reader-facing copy.
 * Headline/deck fragments are valid by default. Generated body paragraphs must
 * opt into paragraph mode, which requires a complete sentence ending.
 * Passing this gate says nothing about whether the text is factually true.
 */
export function readerProseErrors(text, { paragraph = false } = {}) {
  if (typeof text !== "string") return ["READER_PROSE_TYPE"];
  if (!text.trim()) return ["READER_PROSE_EMPTY"];

  const normalized = detectionText(text.trim());
  const errors = [];
  if (QUOTED_SCHEMA_KEY.test(normalized) || BARE_CAMEL_CASE_KEY.test(normalized) || JSON_VALUE.test(normalized)) {
    errors.push("READER_PROSE_SCHEMA_FRAGMENT");
  }
  if (JSON_STRUCTURES.test(normalized) || /(?:^|\n)\s*```/u.test(normalized)) {
    errors.push("READER_PROSE_STRUCTURE");
  }
  if (paragraph) {
    // Remove only ordinary closing punctuation for the ending check. Curly
    // braces are never sentence closers; bracket tails are checked above.
    const ending = normalized.replace(/["')\]»]+$/u, "").trimEnd();
    if (!/[.!?]$/u.test(ending) || /(?:\.{2,}|…)$/u.test(ending)) {
      errors.push("READER_PROSE_INCOMPLETE");
    }
    if (DANGLING_ENDING.test(ending)) errors.push("READER_PROSE_DANGLING_ENDING");
    if (hasUnbalancedQuotes(normalized)) errors.push("READER_PROSE_UNBALANCED_QUOTE");
  }
  return errors;
}

export function assertReaderProse(text, options) {
  const errors = readerProseErrors(text, options);
  if (errors.length) throw new Error(`Reader-facing copy failed validation: ${errors.join(", ")}.`);
  return text;
}
