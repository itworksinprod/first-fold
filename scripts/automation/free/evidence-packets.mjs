// Local extractive selection only: publisher text remains untrusted data.
// No provider, fetch, host admission, scoring threshold, or request budget lives here.
export const MAX_PACKET_SOURCE_CHARS = 5_800;
export const MAX_PACKET_SOURCES = 2;
export const MAX_PACKET_PASSAGES = 40;
const MAX_INPUT_CHARS = 600_000;
const MAX_INPUT_BLOCKS = 6_000;
const clean = (text) => text.replace(/\s+/gu, " ").trim();
const identity = (text) => text.normalize("NFKC").toLowerCase();
const caveat = /\b(?:unless|provided that|requires?|prerequisites?|only (?:if|when|with|available|supported)|does not|has not|no (?:evidence|fixed|patch|fix|known)|not (?:available|supported|confirmed|established)|cannot|must|limited to|restricted to|except|availability|rollout|mitigations?|remediation|fixed in|patched in|secure boot|authentication|exploitation)\b/iu;
const conditional = /\b(?:when|if|without)\b/iu;
const concreteDetail = /\b(?:adds?|introduc(?:e[sd]?|ing)|supports?|changes?|enables?|allows?|permits?|releases?|launch(?:es|ed)?|available|versions?|regions?|customers?|users?|pricing|costs?|limits?|latency|performance|affected|driver|vulnerabilit(?:y|ies)|fix(?:es|ed)?|patch(?:es|ed)?)\b|\b\d+(?:\.\d+)+(?:\b)|\bCVE-\d{4}-\d+\b/iu;
const referentialStart = /^(?:it|they|these|those|this|that|such|however|unless|only if|when|if|without|availability|mitigation|remediation)\b/iu;
const stopWords = new Set("a an and are as at be been by can for from has have in into is it its new of on or our the their this to update updates was were will with your today reports report says said".split(" "));

function boundedBlocks(blocks, minChars) {
  if (!Array.isArray(blocks) || blocks.length > MAX_INPUT_BLOCKS) return [];
  let inputChars = 0;
  const seen = new Set();
  const result = [];
  for (const block of blocks) {
    if (typeof block !== "string" || (inputChars += block.length) > MAX_INPUT_CHARS) return [];
    const text = clean(block);
    const key = identity(text);
    if (text.length < minChars || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function titleTerms(title) {
  return new Set((typeof title === "string" ? title.slice(0, 1_000).normalize("NFKC").toLowerCase() : "")
    .match(/[\p{L}\p{N}][\p{L}\p{N}._-]{1,}/gu)?.filter((term) => !stopWords.has(term)).slice(0, 24) ?? []);
}

function selfContainedBlock(text) {
  // A paragraph with an explicit opening subject and its own consequence and
  // caveat already carries local context. Mere proximity must not attach an
  // unrelated oversized paragraph to it. A referential opening still needs
  // nearby source context even when the rest of the paragraph is long.
  return !referentialStart.test(text) && concreteDetail.test(text) &&
    text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/u).filter(Boolean).length >= 2;
}

/**
 * Select complete supplied blocks across a page, not an arbitrary prefix.
 * A caveat and its needed nearby context form one indivisible unit. Oversized units
 * are omitted rather than publishing the impact while dropping its condition.
 * Returns only source text, in source order; an empty result is a safe fallback.
 */
export function selectEvidencePassages(blocks, {
  title = "", maxChars = MAX_PACKET_SOURCE_CHARS, maxPassages = MAX_PACKET_PASSAGES, minChars = 20,
} = {}) {
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > MAX_PACKET_SOURCE_CHARS ||
      !Number.isInteger(maxPassages) || maxPassages < 1 || maxPassages > MAX_PACKET_PASSAGES ||
      !Number.isInteger(minChars) || minChars < 1 || minChars > maxChars) return [];
  const entries = boundedBlocks(blocks, minChars);
  if (!entries.length) return [];
  if (entries.length <= maxPassages && entries.join("\n").length <= maxChars) return entries;
  const terms = titleTerms(title);
  const relevance = (text) => {
    const tokens = new Set(identity(text).match(/[\p{L}\p{N}][\p{L}\p{N}._-]{1,}/gu) ?? []);
    return [...terms].filter((term) => tokens.has(term)).length;
  };
  const ranges = [];
  for (let index = 0; index < entries.length; index++) {
    if (!caveat.test(entries[index]) && !(conditional.test(entries[index]) &&
        concreteDetail.test(entries[index]))) continue;
    const complete = selfContainedBlock(entries[index]);
    const previousText = entries[index - 1] ?? "";
    const nextText = entries[index + 1] ?? "";
    const needsPrevious = !complete && (referentialStart.test(entries[index]) ||
      concreteDetail.test(previousText) || caveat.test(previousText));
    const needsNext = referentialStart.test(nextText) || (!complete &&
      (concreteDetail.test(nextText) || caveat.test(nextText)));
    const range = { start: Math.max(0, index - (needsPrevious ? 1 : 0)),
      end: Math.min(entries.length - 1, index + (needsNext ? 1 : 0)), caveat: true };
    const previous = ranges.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else ranges.push(range);
  }
  const units = [];
  let rangeIndex = 0;
  for (let index = 0; index < entries.length;) {
    const range = ranges[rangeIndex];
    const unit = range?.start === index ? range : { start: index, end: index, caveat: false };
    if (unit === range) rangeIndex++;
    const text = entries.slice(unit.start, unit.end + 1).join("\n");
    units.push({ ...unit, chars: text.length, count: unit.end - unit.start + 1,
      score: (unit.caveat ? 100 : 0) + Math.min(36, relevance(text) * 6) +
        (concreteDetail.test(text) ? 18 : 0) + (unit.start === 0 ? 24 : unit.start === 1 ? 10 : 0) });
    index = unit.end + 1;
  }
  const selected = [];
  let usedChars = 0;
  let usedPassages = 0;
  for (const unit of units.sort((a, b) => b.score - a.score || a.start - b.start)) {
    const additionalChars = unit.chars + (selected.length ? 1 : 0);
    if (usedChars + additionalChars > maxChars || usedPassages + unit.count > maxPassages) continue;
    selected.push(unit);
    usedChars += additionalChars;
    usedPassages += unit.count;
  }
  return selected.sort((a, b) => a.start - b.start).flatMap((unit) => entries.slice(unit.start, unit.end + 1));
}

function sourceSentences(record) {
  if (record.articleExtraction?.version === 'structured-complete-preview-v1') {
    if (record.articleExtraction.status !== 'usable' || !Array.isArray(record.articleBlocks) ||
        record.articleBlocks.length > 96 || record.articleBlocks.some(b => typeof b !== 'string') ||
        record.articleBlocks.join('\n') !== record.articleExcerpt || record.articleExcerpt.length > 12_000) return [];
    return record.articleBlocks;
  }
  if (record.articleExtraction?.version === "structured-advisory-preview-v1") {
    if (record.articleExtraction.status !== "usable" || !Array.isArray(record.articleBlocks) ||
        record.articleBlocks.length > 128 || record.articleBlocks.join("\n") !== record.articleExcerpt ||
        record.articleExcerpt.length > 18_000) return [];
    return record.articleBlocks; // complete source-order context; no further selection
  }
  if (record.articleExtraction?.version === "structured-preview-v1") {
    if (record.articleExtraction.status !== "usable" || !Array.isArray(record.articleBlocks) ||
        record.articleBlocks.length > 32 || record.articleBlocks.join("\n") !== record.articleExcerpt ||
        record.articleExcerpt.length > 5_000) return [];
    // These atomic units already carry headings and table/definition labels.
    // Never re-split them or mix in title/summary feed fragments.
    return boundedBlocks(record.articleBlocks, 1);
  }
  // Sentence boundaries preserve version decimals and driver filenames. Titles
  // remain their own passage, so the existing short-source evidence IDs agree.
  const blocks = [record.title, record.summary, record.articleExcerpt ?? ""];
  if (blocks.some((block) => typeof block !== "string") || blocks.join("").length > MAX_INPUT_CHARS) return [];
  return boundedBlocks(blocks.flatMap((block) => block.split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/u)), 20);
}

/** Build the existing grounded source contract, with deterministic publisher diversity. */
export function buildEvidencePacketSources(candidate) {
  if (!Array.isArray(candidate?.feedEvidence) || candidate.feedEvidence.length > 4 ||
      !Array.isArray(candidate.sources) || candidate.sources.length > 8) {
    throw new Error("Grounded evidence exceeds its bounded source contract.");
  }
  const seen = new Map();
  const bound = candidate.feedEvidence.map((record) => {
    const matches = candidate.sources.filter((source) => source.id === record.sourceId && source.relationship !== "context");
    const source = matches[0];
    if (matches.length !== 1 || !source || source.title !== record.title || source.publisher !== record.publisher ||
        !["originating", "independent"].includes(source.relationship) ||
        (record.publishedAt != null && source.publishedAt != null && record.publishedAt !== source.publishedAt)) {
      throw new Error("Grounded evidence is not bound to the selected source.");
    }
    const serialized = JSON.stringify(record);
    if (seen.has(record.sourceId) && seen.get(record.sourceId) !== serialized) {
      throw new Error("Grounded evidence has conflicting records for a source.");
    }
    seen.set(record.sourceId, serialized);
    const allPassages = sourceSentences(record);
    const advisory = record.articleExtraction?.version === "structured-advisory-preview-v1";
    const completePreview = record.articleExtraction?.version === 'structured-complete-preview-v1';
    const selected = (advisory || completePreview) ? allPassages : selectEvidencePassages(allPassages, { title: record.title,
      ...(record.articleExtraction?.version === "structured-preview-v1" ? { minChars: 1 } : {}) });
    return { sourceId: source.id, publisher: source.publisher, publisherKey: source.publisherKey ?? source.publisher,
      relationship: source.relationship, publishedAt: source.publishedAt,
      text: selected.join("\n"), selected, allPassages,
      completePreview,
      ...(record.articleExtraction?.identity ? { articleIdentity: record.articleExtraction.identity } : {}),
      ...(advisory ? { structuredContext: record.articleExtraction.structuredContext } : {}),
      hasArticle: Boolean(record.articleExcerpt?.trim()) };
  }).filter((source) => source.selected.length > 0);
  const priority = (source) => source.relationship === "originating" ? 0 : 1;
  const ordered = bound.sort((a, b) => priority(a) - priority(b) || Number(b.hasArticle) - Number(a.hasArticle) ||
    b.text.length - a.text.length || a.publisherKey.localeCompare(b.publisherKey) || a.sourceId.localeCompare(b.sourceId));
  const first = ordered[0];
  if (!first) return [];
  const otherPublishers = ordered.filter((source) => source.publisherKey !== first.publisherKey);
  const second = otherPublishers.find((source) => source.relationship !== first.relationship) ?? otherPublishers[0];
  return [first, second].filter(Boolean).slice(0, MAX_PACKET_SOURCES).map((source, index) => {
    const { selected, allPassages, hasArticle: _hasArticle, completePreview, ...fields } = source;
    return { ...fields, passages: selected.map((text, passageIndex) => ({
      evidenceId: `S${index + 1}P${source.structuredContext || completePreview ? passageIndex + 1 : allPassages.indexOf(text) + 1}`, text,
    })) };
  });
}
