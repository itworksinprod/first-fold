import {
  MAX_READER_FACING_STORY_WORDS,
  MIN_READER_FACING_STORY_WORDS,
  countReaderFacingStoryWords,
} from "../../edition-content.mjs";

export const TRUSTED_EVIDENCE_DIGEST_MODE = "trusted-evidence-digest";
export const TRUSTED_EVIDENCE_DIGEST_DRAFTING_MODE = TRUSTED_EVIDENCE_DIGEST_MODE;
export const TRUSTED_EVIDENCE_DIGEST_PROVIDER = "local-deterministic";
export const TRUSTED_EVIDENCE_DIGEST_MODEL = "not-invoked";
export const MAX_TRUSTED_EVIDENCE_EXCERPT_WORDS = 10;
// The caller must opt into this range only for an unpublished personal brief.
// The default payload keeps the public edition's existing word contract.
export const MIN_CONCISE_TRUSTED_EVIDENCE_DIGEST_WORDS = 60;
const MAX_TRUSTED_EVIDENCE_PUBLISHER_CHARACTERS = 160;
const MAX_TRUSTED_EVIDENCE_HEADLINE_CHARACTERS = 500;
const AUTHORITATIVE_HEADLINE_WRAPPER_CHARACTERS = " reports “”".length;
export const MAX_TRUSTED_EVIDENCE_EXCERPT_CHARACTERS =
  MAX_TRUSTED_EVIDENCE_HEADLINE_CHARACTERS -
  MAX_TRUSTED_EVIDENCE_PUBLISHER_CHARACTERS -
  AUTHORITATIVE_HEADLINE_WRAPPER_CHARACTERS;

const DESKS = Object.freeze([
  "ai",
  "work-and-tools",
  "security-and-privacy",
  "platforms-and-power",
]);

const DESK_LABELS = Object.freeze({
  ai: "AI & Models",
  "work-and-tools": "Work & Tools",
  "security-and-privacy": "Security & Privacy",
  "platforms-and-power": "Platforms & Power",
});

const SOURCE_RELATIONSHIPS = new Set(["originating", "independent", "context"]);
const EVIDENCE_TIERS = new Set(["corroborated", "authoritative-single"]);
const SOURCE_WORD_PATTERN = /[\p{L}\p{N}]+(?:[’'./:+#%-][\p{L}\p{N}]+)*/gu;
const READER_WORD_PATTERN = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;
const BIDI_CONTROL_PATTERN = /\p{Bidi_Control}/gu;
const UNSAFE_SOURCE_INSTRUCTION_PATTERN =
  /\b(?:ignore (?:all |any |the )?(?:previous|prior) instructions?|system prompt|developer message|assistant message|reveal (?:a |the )?(?:secret|token|password)|execute (?:this |the )?(?:code|command)|click here|subscribe now)\b/i;
const SOURCE_LINKLIKE_PATTERN =
  /(?:\[[^\]\r\n]{1,200}\]\(\s*[^)\s]{1,2048}\s*\)|https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|www\.[^\s<>"']+|[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,63}|\b(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,63}(?::\d{1,5})?(?:\/[^\s<>"']*)?)/giu;
const SAFE_DOTTED_PRODUCT_PATTERN =
  /(^|[\s("'“‘[{])(?:next\.js|node\.js)(?![\p{L}\p{N}./:@?#_-])/giu;
const SOURCE_FORMAT_CONTROL_PATTERN = /\p{Cf}/u;
const SOURCE_QUOTATION_MARK_PATTERN = /\p{Quotation_Mark}/u;
const SOURCE_WORD_CHARACTER_PATTERN = /[\p{L}\p{N}]/u;
const INTRAWORD_APOSTROPHES = new Set(["'", "’"]);
const UNICODE_DOT_PATTERN = /[\u2024\u3002\uFE52\uFF0E\uFF61]/gu;
const IMPERATIVE_ACTION_WORDS = new Set([
  "activate", "add", "allow", "apply", "approve", "authorize", "change",
  "click", "configure", "connect", "copy", "delete", "disable", "download",
  "enable", "enter", "execute", "follow", "give", "grant", "install", "learn",
  "open", "paste", "provide", "read", "remove", "reveal", "rotate", "run",
  "reset", "select", "send", "set", "share", "submit", "switch", "turn", "update",
  "upload", "use", "verify", "visit", "wipe",
]);
const IMPERATIVE_LEAD_MODIFIERS = new Set([
  "always", "immediately", "kindly", "never", "now", "please",
]);
const INSTRUCTION_SUBJECT_WORDS = new Set([
  "admin", "admins", "administrator", "administrators", "customer", "customers",
  "operator", "operators", "reader", "readers", "team", "teams", "user", "users",
  "you",
]);
const NON_MEANINGFUL_EXCERPT_WORDS = new Set([
  "a", "advertisement", "an", "and", "are", "as", "at", "available", "be",
  "breaking", "by", "continue", "details", "for", "from", "in", "is", "it",
  "its", "latest", "learn", "more", "new", "news", "now", "of", "on", "or",
  "read", "sponsored", "the", "this", "to", "today", "update", "updated",
]);
const FEED_BOILERPLATE_PATTERNS = Object.freeze([
  /\bcontinue reading(?:\.{3}|…)?[\s\S]*$/i,
  /\bthe post\b[\s\S]{0,500}\bappeared first on\b[\s\S]*$/i,
  /\bread more(?:\.{3}|…)?[\s\S]*$/i,
  /\[\s*(?:\.{3}|…)?\s*\]/g,
]);

// An authoritative-single story is normalized through a closed-world
// attribution validator. Never allow a source excerpt to smuggle a second
// attribution verb into that single attributed clause.
const ATTRIBUTION_WORDS = new Set([
  "according", "accuse", "accused", "accuses", "accusing", "acknowledged",
  "acknowledges", "advised", "advises", "allege",
  "alleged", "alleges", "alleging", "announced", "announces", "argued", "argues",
  "arguing", "asserted", "asserts", "believed", "believes", "claim", "claimed",
  "claiming", "claims", "concluded", "concludes", "confirmed", "confirms",
  "attributed", "attributes", "attributing", "described", "describes", "disclosed",
  "discloses", "documented", "documents",
  "estimated", "estimates", "finds", "found", "indicated", "indicates", "maintained",
  "maintains", "noted", "notes", "published", "publishes", "recommended",
  "recommends", "reported", "reports", "revealed", "reveals", "say", "said",
  "saying", "says", "stated", "states", "suggested", "suggests", "tells", "told",
  "urged", "urges", "warned", "warns", "writes", "wrote",
]);

const DEFAULT_EVENT_PROFILE_BY_DESK = Object.freeze({
  ai: {
    why:
      "An AI development can affect capability claims, model access, data handling, purchasing choices, and deployment expectations.",
    watch:
      "Watch technical documentation, access terms, pricing, evaluation methods, data-handling rules, and independent tests of material claims.",
  },
  "work-and-tools": {
    why:
      "A work-tool change can affect team routines, administrative controls, compatibility, and access to existing material.",
    watch:
      "Watch rollout dates, affected plans, administrative controls, compatibility, export paths, and whether teams retain a practical rollback option.",
  },
  "security-and-privacy": {
    why:
      "A security or privacy development can change exposure, remediation priorities, data obligations, and operational risk.",
    watch:
      "Watch affected products, versions, severity, exploitation evidence, fixes, mitigations, disclosure dates, and guidance from the responsible authority.",
  },
  "platforms-and-power": {
    why:
      "A platform development can affect architecture, capacity, market access, procurement, regional availability, and operating cost.",
    watch:
      "Watch availability, regions, account requirements, pricing, quotas, compatibility, regulatory consequences, and the smallest reversible response.",
  },
});

const DESK_CONTEXT = Object.freeze({
  ai:
    "For AI readers, the practical question is whether access, capability, safety, or governance changes in a measurable way.",
  "work-and-tools":
    "For teams, the practical question is whether workflows, controls, compatibility, or ownership of existing work will change.",
  "security-and-privacy":
    "For defenders, the practical question is whether the development changes exposure or the order of remediation work.",
  "platforms-and-power":
    "For platform users, the practical question is whether cost, availability, architecture, leverage, or market access will change.",
});

const DESK_WATCH = Object.freeze({
  ai:
    "Compare later claims with model documentation and measured evaluations before changing a deployment or purchase.",
  "work-and-tools":
    "Test consequential workflow changes in a noncritical environment and preserve export and rollback paths.",
  "security-and-privacy":
    "Match any response to the products and versions actually present, using the relevant vendor or government advisory for action.",
  "platforms-and-power":
    "Check provider documentation and contractual terms before changing architecture, capacity, procurement, or regional plans.",
});

const SAFE_PADDING_SENTENCES = Object.freeze([
  "The linked reports provide the audit trail for every detail retained in this brief.",
  "Differences between the available descriptions should remain unresolved until later reporting explains them.",
  "Keep consequential decisions reversible while the development and its practical effects continue to emerge.",
]);

// These lenses ask concrete questions about a source topic; they never infer
// that a launch, exploit, fix, outage, or ruling happened merely from keywords.
// Only fixed repository-owned language is rendered. Source text chooses the
// lens but cannot supply an action, number, entity, or factual assertion here.
const CONCISE_TOPIC_PROFILES = Object.freeze([
  {
    desks: ["security-and-privacy"],
    signals: [/\b(?:driver|kernel|backupper)\b/i, /\b(?:disk|disks)\b/i, /\b(?:write|writes|writing)\b/i],
    topic: "driver access to disk devices",
    why: "The useful distinction is whether an application account can cross into disk-level permissions. Risk depends on the access an attacker already needs and the system conditions attached to each claimed impact; those limits belong with the claim.",
    watch: "Check the driver and application versions, the allowed disk operations, and any boot-setting or encryption conditions. Look for a vendor-identified fix and its exact scope. A disclosure alone does not establish active exploitation or identify a corrected version.",
  },
  {
    desks: ["work-and-tools"],
    signals: [/\bretention\b/i, /\b(?:workflow|repository|checks|logs?|records?)\b/i],
    topic: "workflow record retention",
    why: "Retention settings determine how far back a team can inspect build history and investigate failures. The practical question is which records a policy covers, who can change it, and whether existing records follow the same rules as newly created ones.",
    watch: "Compare the documented retention scope with the history your team needs for audits and debugging. Check defaults, administrator permissions, and deletion timing before changing a policy; verify export options instead of assuming deleted records can be recovered.",
  },
  {
    desks: ["ai", "work-and-tools", "platforms-and-power"],
    signals: [/\b(?:price|prices|pricing|cost|costs)\b/i, /\b(?:api|inference|cloud|model|compute|subscription)\b/i],
    topic: "technology pricing and usage costs",
    why: "A headline rate is only one part of the cost of a workload. The useful comparison includes usage units, request limits, required plans, and the amount of work completed, so a lower advertised rate need not mean a lower total bill.",
    watch: "Check when the rate applies, which customers qualify, and whether it is permanent or introductory. Compare the same workload under both sets of terms, including storage or transfer charges where relevant, before changing a budget or provider.",
  },
  {
    desks: ["ai", "work-and-tools"],
    signals: [/\b(?:model|models|llm|ai)\b/i, /\b(?:benchmark|benchmarks|evaluation|evaluations|reasoning)\b/i],
    topic: "model capabilities and evaluation",
    why: "A model comparison is useful when the test resembles the work you need it to do. Evaluation setup, baseline choice, and failure cases matter alongside an aggregate score; results from one task should not be treated as a guarantee for another.",
    watch: "Look for the test method, the exact model version, and independent attempts to reproduce the result. Compare quality, latency, and usage cost on representative tasks, keeping sensitive data out of an unfamiliar service while assessing its terms.",
  },
  {
    desks: ["ai", "work-and-tools"],
    signals: [/\b(?:model|models|llm|gemini|claude)\b/i, /\b(?:access|available|availability|release|launch|license|licence|weights)\b/i],
    topic: "model access and deployment terms",
    why: "Access to a model is not the same as permission or readiness to use it in production. The useful questions concern where it runs, who can obtain it, and which data-handling or licensing terms apply to the intended workload.",
    watch: "Check the exact model version, availability channel, license, and usage restrictions. Look for practical evaluations on your own task and any documented rollout limits; distinguish publisher claims from separately reproduced results before replacing an existing workflow.",
  },
  {
    desks: ["security-and-privacy"],
    signals: [/\b(?:privilege|privileges)\b/i, /\b(?:escalation|elevation|elevated|unauthorized)\b/i],
    topic: "privilege boundaries in affected software",
    why: "A privilege issue is actionable only when the starting access and resulting permissions are clear. Local access, authentication, and configuration requirements can change who is exposed, so a severity label should not replace the advisory's specific attack conditions.",
    watch: "Match the advisory to deployed products and versions, then check the required starting privileges and the boundary crossed. Look for a vendor-identified correction and evidence about exploitation; do not treat a proposed mitigation as proof that the underlying flaw is fixed.",
  },
  {
    desks: ["platforms-and-power"],
    signals: [/\b(?:court|ruling|regulator|regulatory|antitrust|legislation)\b/i],
    topic: "platform rules and legal scope",
    why: "The practical effect of a legal update depends on its scope and procedural stage. A proposal, an initial decision, and an enforceable obligation are different signals; the important question is which services, users, or business practices would actually be covered.",
    watch: "Check the jurisdiction, effective date, and any appeal or implementation process in the originating document. Look for concrete changes to access, contracts, or product behavior rather than assuming a headline immediately changes how a service operates.",
  },
  {
    desks: ["security-and-privacy"],
    signals: [/\b(?:vulnerability|vulnerabilities|zero-day|patch|advisory)\b/i],
    topic: "software exposure and remediation",
    why: "A security advisory helps set priorities when it can be matched to software actually in use. The decisive details are the affected versions, prerequisites for attack, and available correction; an urgent headline alone does not establish the exposure of a particular system.",
    watch: "Compare the affected product and version range with the installed inventory. Check the originating advisory for exploitation evidence, a fixed release, and any limits on proposed mitigations. Keep a workaround distinct from a permanent correction when planning follow-up verification.",
  },
  {
    desks: ["work-and-tools", "platforms-and-power"],
    signals: [/\b(?:outage|disruption|unavailable)\b/i],
    topic: "service availability and recovery",
    why: "Service continuity depends on the functions and regions a workflow actually uses. The useful distinction is between the scope of an interruption and its current status; a recovery notice does not by itself explain the cause or establish that every dependency is healthy.",
    watch: "Check timestamps, affected services, and the provider's current status record. Look for a later incident explanation and evidence that normal operations have resumed for the relevant workload before undoing a temporary contingency plan.",
  },
]);

const CONCISE_DEFAULT_TOPICS = Object.freeze({
  ai: "AI research and model access",
  "work-and-tools": "work tools and administrative controls",
  "security-and-privacy": "security and privacy",
  "platforms-and-power": "platform services and operating terms",
});

function conciseTopicProfile(candidate, selectedEvidence) {
  const sourceText = selectedEvidence.flatMap((evidence) =>
    [evidence.title, evidence.summary].flatMap(declarativeSourceSegments)
      .filter((segment) => !hasUnsafeLink(segment) && !looksLikeInstruction(segment)))
    .join(" ");
  return CONCISE_TOPIC_PROFILES.find((profile) =>
    profile.desks.includes(candidate.suggestedDesk) &&
    profile.signals.every((pattern) => pattern.test(sourceText))) ?? {
    topic: CONCISE_DEFAULT_TOPICS[candidate.suggestedDesk],
    why: "Treat this as a source lead, not a full summary: the retained excerpt is too limited to establish practical consequences. The original report is the place to check what changed, whom it affects, and what remains uncertain.",
    watch: "Check the report's date, exact subject, and scope before drawing conclusions. Look for a later, separately reported account of the same event, and compare any disagreement with the originating record rather than treating a second link as confirmation.",
  };
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanInline(value, maximum, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  const cleaned = value
    .slice(0, Math.max(maximum * 8, 4_096))
    .replace(BIDI_CONTROL_PATTERN, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
  if (!allowEmpty && !cleaned) throw new Error(`${label} must not be blank.`);
  return cleaned;
}

function requireInstantOrNull(value, label, { nullable = true } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be ${nullable ? "null or " : ""}an ISO instant.`);
  }
  return value;
}

function requireHttpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(cleanInline(value, 2_048, label));
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${label} must be a credential-free HTTPS URL.`);
  }
  return parsed.href;
}

function sourceWords(value) {
  return cleanInline(String(value ?? ""), 4_000, "Source text", { allowEmpty: true })
    .match(SOURCE_WORD_PATTERN) ?? [];
}

function normalizedWord(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function readerWordCount(value) {
  return String(value ?? "").match(READER_WORD_PATTERN)?.length ?? 0;
}

function cleanFeedText(value) {
  return cleanInline(value, 1_200, "feedEvidence summary", { allowEmpty: true });
}

function containsFeedBoilerplate(value) {
  return FEED_BOILERPLATE_PATTERNS.some((pattern) =>
    new RegExp(pattern.source, pattern.flags).test(value));
}

function sourceSafetyShadow(value) {
  return String(value).normalize("NFKC").replace(UNICODE_DOT_PATTERN, ".");
}

function isSafeIntrawordApostrophe(characters, index) {
  if (
    !INTRAWORD_APOSTROPHES.has(characters[index]) ||
    !SOURCE_WORD_CHARACTER_PATTERN.test(characters[index - 1] ?? "") ||
    !SOURCE_WORD_CHARACTER_PATTERN.test(characters[index + 1] ?? "")
  ) {
    return false;
  }
  let start = index;
  while (
    start > 0 &&
    (
      SOURCE_WORD_CHARACTER_PATTERN.test(characters[start - 1]) ||
      INTRAWORD_APOSTROPHES.has(characters[start - 1])
    )
  ) {
    start -= 1;
  }
  let end = index + 1;
  while (
    end < characters.length &&
    (
      SOURCE_WORD_CHARACTER_PATTERN.test(characters[end]) ||
      INTRAWORD_APOSTROPHES.has(characters[end])
    )
  ) {
    end += 1;
  }
  return characters
    .slice(start, end)
    .filter((character) => INTRAWORD_APOSTROPHES.has(character))
    .length === 1;
}

function hasUnsafeQuotationDelimiter(value) {
  const characters = [...sourceSafetyShadow(value)];
  return characters.some((character, index) => {
    if (!SOURCE_QUOTATION_MARK_PATTERN.test(character)) return false;
    return !isSafeIntrawordApostrophe(characters, index);
  });
}

function declarativeSourceSegments(value) {
  return String(value)
    // Split only at unambiguous sentence endings. Unicode's
    // Terminal_Punctuation property also contains comma-, colon-, and
    // semicolon-like separators; splitting at those characters can detach a
    // limiting continuation from the clause it qualifies.
    .split(/(?<=\p{Sentence_Terminal})\s+/u)
    .map((segment) => segment.trim())
    .filter((segment) =>
      segment &&
      !SOURCE_FORMAT_CONTROL_PATTERN.test(segment) &&
      !sourceSafetyShadow(segment).includes("?") &&
      !containsFeedBoilerplate(segment) &&
      !UNSAFE_SOURCE_INSTRUCTION_PATTERN.test(segment));
}

function hasUnsafeLink(value) {
  const normalized = sourceSafetyShadow(value).replace(
    SAFE_DOTTED_PRODUCT_PATTERN,
    (_match, prefix) => `${prefix}firstfolddottedproduct`,
  );
  const matcher = new RegExp(SOURCE_LINKLIKE_PATTERN.source, SOURCE_LINKLIKE_PATTERN.flags);
  return matcher.test(normalized);
}

function isAdjectivalAlleged(words, index) {
  return words[index] === "alleged" &&
    new Set(["a", "an", "another", "any", "the"]).has(words[index - 1]);
}

function hasNestedAttribution(words) {
  const normalized = words.map((word) =>
    normalizedWord(word).replace(/[\p{Pd}.]/gu, ""));
  return normalized.some((word, index) =>
    ATTRIBUTION_WORDS.has(word) && !isAdjectivalAlleged(normalized, index));
}

function authoritativeSegmentIsStructurallySafe(segment) {
  const withoutTerminal = sourceSafetyShadow(segment).replace(/[.!]+$/u, "").trim();
  const masked = withoutTerminal
    .replace(/\b(?:next\.js|node\.js)\b/giu, "firstfolddottedproduct")
    .replace(/\b\d+(?:\.\d+)+\b/gu, "firstfoldnumericversion");
  return !/[.!?;:]/u.test(masked);
}

function looksLikeInstruction(segment) {
  const shadow = sourceSafetyShadow(segment);
  const letterTokens = shadow.match(/\p{L}+/gu) ?? [];
  if (letterTokens.some((token) => {
    const hasLatin = /\p{Script=Latin}/u.test(token);
    const hasNonLatinLetter = [...token].some((character) =>
      /\p{L}/u.test(character) && !/\p{Script=Latin}/u.test(character));
    return hasLatin && hasNonLatinLetter;
  })) return true;
  const words = sourceWords(shadow).map(normalizedWord).filter(Boolean);
  if (words.length === 0) return false;
  if (["kindly", "never", "please"].includes(words[0])) return true;
  if (words[0] === "do" && words[1] === "not") return true;
  let leadIndex = 0;
  while (IMPERATIVE_LEAD_MODIFIERS.has(words[leadIndex])) leadIndex += 1;
  if (words[leadIndex] === "do" && words[leadIndex + 1] === "not") leadIndex += 2;
  if (IMPERATIVE_ACTION_WORDS.has(words[leadIndex])) return true;
  for (let index = 0; index < words.length; index += 1) {
    if (!INSTRUCTION_SUBJECT_WORDS.has(words[index])) continue;
    const nextWords = words.slice(index + 1, index + 6).join(" ");
    if (IMPERATIVE_ACTION_WORDS.has(words[index + 1])) return true;
    if (/^(?:should|must|needs? to|are (?:advised|required|urged) to)\b/u.test(nextWords)) {
      return true;
    }
  }
  return false;
}

function meaningfulSignalWords(candidate, evidence) {
  return new Set([
    candidate?.title,
    candidate?.primaryEntity,
    evidence?.title,
    ...(Array.isArray(evidence?.categories) ? evidence.categories : []),
  ].flatMap((value) => sourceWords(String(value ?? "")))
    .map(normalizedWord)
    .filter((word) => word && !NON_MEANINGFUL_EXCERPT_WORDS.has(word)));
}

function hasMeaningfulEventSignal(segment, candidate, evidence) {
  const contentWords = sourceWords(sourceSafetyShadow(segment))
    .map(normalizedWord)
    .filter((word) => word && !NON_MEANINGFUL_EXCERPT_WORDS.has(word));
  if (contentWords.length === 0) return false;
  const signals = meaningfulSignalWords(candidate, evidence);
  return contentWords.some((word) => signals.has(word)) || contentWords.length >= 2;
}

function originalExcerptText(segment) {
  return segment.replace(/[.!\u3002\uFF01]+$/u, "").trim();
}

function completeEvidenceExcerpt(sourceText, {
  authoritative = false,
  candidate = null,
  evidence = null,
  requireMeaningfulSignal = false,
} = {}) {
  for (const segment of declarativeSourceSegments(sourceText)) {
    if (hasUnsafeLink(segment)) continue;
    if (looksLikeInstruction(segment)) continue;
    // Reject every terminal separator except a true full stop or exclamation
    // mark. Check both the original and an NFKC shadow: some characters (for
    // example GREEK ANO TELEIA) are Terminal_Punctuation before normalization
    // but normalize to a non-terminal middle dot. The accepted excerpt itself
    // remains byte-for-byte source text.
    const separatorSafetyShadow = segment.normalize("NFKC");
    const endsWithTerminalPunctuation = /\p{Terminal_Punctuation}\s*$/u.test(segment) ||
      /\p{Terminal_Punctuation}\s*$/u.test(separatorSafetyShadow);
    if (endsWithTerminalPunctuation && !/[.!]\s*$/u.test(sourceSafetyShadow(segment))) continue;
    const words = sourceWords(segment);
    if (words.length === 0 || words.length > MAX_TRUSTED_EVIDENCE_EXCERPT_WORDS) continue;
    // The final originality gate separates punctuation-delimited words after
    // NFKC normalization. Compound words must not make a ten-token excerpt
    // exceed that gate's twelve-word limit. Reject the complete segment rather
    // than truncating a quotation or weakening the downstream check.
    const originalityWords = segment.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
    if (originalityWords.length > MAX_TRUSTED_EVIDENCE_EXCERPT_WORDS) continue;
    if (requireMeaningfulSignal && !hasMeaningfulEventSignal(segment, candidate, evidence)) continue;
    const excerpt = originalExcerptText(segment);
    if (
      excerpt.length > MAX_TRUSTED_EVIDENCE_EXCERPT_CHARACTERS ||
      hasUnsafeQuotationDelimiter(excerpt)
    ) {
      continue;
    }
    if (
      authoritative &&
      (
        hasNestedAttribution(words) ||
        !authoritativeSegmentIsStructurallySafe(segment)
      )
    ) {
      continue;
    }
    // Preserve source punctuation inside the complete accepted segment. Only
    // terminal punctuation is removed so the surrounding attributed template
    // owns its sentence boundary.
    return excerpt;
  }
  return null;
}

function evidenceExcerpt(evidence, candidate, { authoritative = false } = {}) {
  const cleanedSummary = cleanFeedText(evidence.summary);
  const trustedTitle = cleanInline(evidence.title, 300, "feedEvidence title");
  if (cleanedSummary && cleanedSummary !== trustedTitle) {
    const summaryExcerpt = completeEvidenceExcerpt(cleanedSummary, {
      authoritative,
      candidate,
      evidence,
      requireMeaningfulSignal: true,
    });
    if (summaryExcerpt !== null) return summaryExcerpt;
  }
  return completeEvidenceExcerpt(trustedTitle, { authoritative, candidate, evidence });
}

function trustedSource(source, index) {
  if (!isObject(source)) throw new Error(`Candidate source ${index + 1} must be an object.`);
  const id = cleanInline(source.id, 160, `Candidate source ${index + 1} id`);
  const title = cleanInline(source.title, 300, `Candidate source ${index + 1} title`);
  const publisher = cleanInline(
    source.publisher,
    MAX_TRUSTED_EVIDENCE_PUBLISHER_CHARACTERS,
    `Candidate source ${index + 1} publisher`,
  );
  const publisherKey = cleanInline(
    source.publisherKey,
    120,
    `Candidate source ${index + 1} publisherKey`,
  );
  const url = requireHttpsUrl(source.url, `Candidate source ${index + 1} URL`);
  if (!SOURCE_RELATIONSHIPS.has(source.relationship)) {
    throw new Error(`Candidate source ${index + 1} has an invalid relationship.`);
  }
  const publishedAt = requireInstantOrNull(
    source.publishedAt ?? null,
    `Candidate source ${index + 1} publishedAt`,
  );
  const retrievedAt = requireInstantOrNull(
    source.retrievedAt,
    `Candidate source ${index + 1} retrievedAt`,
    { nullable: false },
  );
  return {
    id,
    title,
    publisher,
    publisherKey,
    url,
    relationship: source.relationship,
    publishedAt,
    retrievedAt,
  };
}

function trustedFeedEvidence(record, index, sourceById) {
  if (!isObject(record)) throw new Error(`feedEvidence ${index + 1} must be an object.`);
  const sourceId = cleanInline(record.sourceId, 160, `feedEvidence ${index + 1} sourceId`);
  const source = sourceById.get(sourceId);
  if (!source || source.relationship === "context") {
    throw new Error(`feedEvidence ${index + 1} must bind to a non-context candidate source.`);
  }
  const publisher = cleanInline(
    record.publisher,
    MAX_TRUSTED_EVIDENCE_PUBLISHER_CHARACTERS,
    `feedEvidence ${index + 1} publisher`,
  );
  const title = cleanInline(record.title, 300, `feedEvidence ${index + 1} title`);
  const summary = cleanInline(
    record.summary,
    1_200,
    `feedEvidence ${index + 1} summary`,
    { allowEmpty: true },
  );
  const categories = Array.isArray(record.categories)
    ? record.categories.map((category, categoryIndex) => cleanInline(
      category,
      80,
      `feedEvidence ${index + 1} category ${categoryIndex + 1}`,
    ))
    : null;
  if (categories === null || categories.length > 12) {
    throw new Error(`feedEvidence ${index + 1} categories must be an array of at most 12 strings.`);
  }
  const publishedAt = requireInstantOrNull(
    record.publishedAt,
    `feedEvidence ${index + 1} publishedAt`,
    { nullable: false },
  );
  if (
    publisher !== source.publisher ||
    title !== source.title ||
    publishedAt !== source.publishedAt
  ) {
    throw new Error(`feedEvidence ${index + 1} changed trusted source metadata.`);
  }
  return { sourceId, publisher, title, summary, categories, publishedAt };
}

function editorialSource(source) {
  return {
    id: source.id,
    title: source.title,
    publisher: source.publisher,
    url: source.url,
    relationship: source.relationship,
    publishedAt: source.publishedAt,
    retrievedAt: source.retrievedAt,
  };
}

function distinctEvidenceByPublisher(candidate) {
  const sourceById = new Map(candidate.sources.map((source) => [source.id, source]));
  const chosen = [];
  const seenPublisherKeys = new Set();
  for (const evidence of candidate.feedEvidence) {
    const source = sourceById.get(evidence.sourceId);
    if (!source || seenPublisherKeys.has(source.publisherKey)) continue;
    seenPublisherKeys.add(source.publisherKey);
    chosen.push(evidence);
    if (chosen.length === 2) break;
  }
  return chosen;
}

function validateEvidenceTier(candidate) {
  const factualSources = candidate.sources.filter((source) => source.relationship !== "context");
  const contextSources = candidate.sources.filter((source) => source.relationship === "context");
  const factualUrls = new Set(factualSources.map((source) => source.url));
  const factualPublisherKeys = new Set(factualSources.map((source) => source.publisherKey));
  const evidencePublisherKeys = new Set(candidate.feedEvidence.map((evidence) =>
    candidate.sources.find((source) => source.id === evidence.sourceId)?.publisherKey));
  if (candidate.evidenceTier === "corroborated") {
    if (
      candidate.ranking?.corroborated !== true ||
      factualUrls.size < 2 ||
      factualPublisherKeys.size < 2 ||
      evidencePublisherKeys.size < 2
    ) {
      throw new Error("A corroborated digest needs source-bound feed evidence from two publishers.");
    }
    return;
  }
  const [originating] = factualSources;
  if (
    candidate.ranking?.corroborated !== false ||
    factualSources.length !== 1 ||
    originating?.relationship !== "originating" ||
    factualPublisherKeys.size !== 1 ||
    candidate.feedEvidence.length !== 1 ||
    contextSources.length < 1 ||
    contextSources.some((source) => source.publisherKey !== originating.publisherKey)
  ) {
    throw new Error("An authoritative-single digest needs one originating item and its context feed.");
  }
}

function normalizeCandidate(candidate, index) {
  if (!isObject(candidate)) throw new Error(`Candidate ${index + 1} must be an object.`);
  const suggestedDesk = candidate.suggestedDesk;
  if (!DESKS.includes(suggestedDesk)) throw new Error(`Candidate ${index + 1} has an invalid desk.`);
  const sources = Array.isArray(candidate.sources)
    ? candidate.sources.map(trustedSource)
    : [];
  if (sources.length < 2 || sources.length > 8) {
    throw new Error(`Candidate ${index + 1} must contain two through eight sources.`);
  }
  const sourceIds = new Set(sources.map((source) => source.id));
  const sourceUrls = new Set(sources.map((source) => source.url));
  if (sourceIds.size !== sources.length || sourceUrls.size !== sources.length) {
    throw new Error(`Candidate ${index + 1} repeats source metadata.`);
  }
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const feedEvidence = Array.isArray(candidate.feedEvidence)
    ? candidate.feedEvidence.map((record, evidenceIndex) =>
      trustedFeedEvidence(record, evidenceIndex, sourceById))
    : [];
  if (feedEvidence.length < 1 || feedEvidence.length > 4) {
    throw new Error(`Candidate ${index + 1} must contain one through four feedEvidence records.`);
  }
  if (new Set(feedEvidence.map((evidence) => evidence.sourceId)).size !== feedEvidence.length) {
    throw new Error(`Candidate ${index + 1} repeats a feedEvidence sourceId.`);
  }
  const evidenceTier = candidate.ranking?.evidenceTier;
  if (!EVIDENCE_TIERS.has(evidenceTier)) {
    throw new Error(`Candidate ${index + 1} has an unsupported evidence tier.`);
  }
  const score = candidate.ranking?.score;
  if (!Number.isFinite(score) || score < 70 || score > 100) {
    throw new Error(`Candidate ${index + 1} has an invalid editorial score.`);
  }
  const normalized = {
    candidateId: cleanInline(candidate.candidateId, 200, `Candidate ${index + 1} candidateId`),
    canonicalEventKey: cleanInline(
      candidate.canonicalEventKey,
      240,
      `Candidate ${index + 1} canonicalEventKey`,
    ),
    suggestedDesk,
    primaryEntity: cleanInline(candidate.primaryEntity, 160, `Candidate ${index + 1} primaryEntity`),
    aiAdjacent: candidate.aiAdjacent === true,
    maturity: candidate.maturity,
    title: cleanInline(candidate.title, 300, `Candidate ${index + 1} title`),
    eventAt: requireInstantOrNull(candidate.eventAt ?? null, `Candidate ${index + 1} eventAt`),
    firstPublishedAt: requireInstantOrNull(
      candidate.firstPublishedAt,
      `Candidate ${index + 1} firstPublishedAt`,
      { nullable: false },
    ),
    materiallyUpdatedAt: requireInstantOrNull(
      candidate.materiallyUpdatedAt ?? null,
      `Candidate ${index + 1} materiallyUpdatedAt`,
    ),
    sources,
    feedEvidence,
    evidenceTier,
    ranking: candidate.ranking,
  };
  if (normalized.maturity !== "verified-development") {
    throw new Error(`Candidate ${index + 1} has an invalid maturity.`);
  }
  validateEvidenceTier(normalized);
  return normalized;
}

function naturalList(values) {
  return new Intl.ListFormat("en-US", { style: "long", type: "conjunction" }).format(values);
}

function ensureReaderWordRange(story, { concise = false } = {}) {
  const minimum = concise ? MIN_CONCISE_TRUSTED_EVIDENCE_DIGEST_WORDS : MIN_READER_FACING_STORY_WORDS;
  let words = countReaderFacingStoryWords(story);
  if (!concise) {
    for (const sentence of SAFE_PADDING_SENTENCES) {
      if (words >= minimum) break;
      story.whatToDoOrWatch = `${story.whatToDoOrWatch} ${sentence}`;
      words = countReaderFacingStoryWords(story);
    }
  }
  if (
    words < minimum ||
    words > MAX_READER_FACING_STORY_WORDS
  ) {
    throw new Error(
      `Trusted evidence digest produced ${words} reader-facing words; ` +
        `${minimum}–${MAX_READER_FACING_STORY_WORDS} are required.`,
    );
  }
  return story;
}

function corroboratedHeadline(candidate, excerptRecords, deskLabel) {
  const leadRecord = excerptRecords.find(({ excerpt }) => excerpt !== null);
  return leadRecord === undefined
    ? `${candidate.primaryEntity}: a new ${deskLabel} development`
    : `${leadRecord.source.publisher} reports “${leadRecord.excerpt}”`;
}

function corroboratedAccount({ source, excerpt }, deskLabel) {
  return excerpt === null
    ? `${source.publisher} covers the same ${deskLabel} development in the report linked below, but the available ` +
      "description did not contain a short passage that could be safely reproduced."
    : `${source.publisher} reports “${excerpt}”.`;
}

function authoritativeNarrativeSubject(primaryEntity) {
  // The downstream authoritative passage validator intentionally treats most
  // punctuation as a clause boundary. Keep a trusted entity verbatim only
  // when it can remain inside that single attributed clause without widening
  // the validator's small dotted-product allowlist.
  return /^[\p{L}\p{N}][\p{L}\p{N} &'’()+/#%-]{0,159}$/u.test(primaryEntity)
    ? primaryEntity
    : "the selected subject";
}

function authoritativeCopy({ publisher, excerpt, deskLabel, primaryEntity }) {
  const subject = authoritativeNarrativeSubject(primaryEntity);
  const boundedContext =
    `and this brief associates the update with ${subject} while noting that no second factual account appears ` +
    "in the reviewed material and the details therefore remain provisional";
  if (excerpt === null) {
    return {
      headline: `${publisher} reports a new ${deskLabel} development`,
      deck: `${publisher} reports the development in one originating account`,
      whatHappened:
        `${publisher} reports a new ${deskLabel} development in the originating publication linked below, ` +
        boundedContext,
    };
  }
  return {
    headline: `${publisher} reports “${excerpt}”`,
    deck: `${publisher} reports the development in one originating account`,
    whatHappened:
      `${publisher} reports “${excerpt}” in the originating publication linked below, ${boundedContext}`,
  };
}

function corroboratedWhatHappened(excerptRecords, deskLabel, primaryEntity) {
  const accounts = excerptRecords.map((record) => corroboratedAccount(record, deskLabel)).join(" ");
  const context = `The distinct reports concern ${primaryEntity}; differences in their details remain unresolved, ` +
    "and each publisher’s account stays separate.";
  let copy = `${accounts} ${context}`;
  if (readerWordCount(copy) < 35) {
    copy += " A detail from one publisher should not be read as agreement by the other.";
  }
  return copy;
}

function buildStory(candidate, { concise = false } = {}) {
  const profile = DEFAULT_EVENT_PROFILE_BY_DESK[candidate.suggestedDesk];
  const authoritative = candidate.evidenceTier === "authoritative-single";
  const selectedEvidence = authoritative
    ? [candidate.feedEvidence[0]]
    : distinctEvidenceByPublisher(candidate);
  if ((!authoritative && selectedEvidence.length < 2) || selectedEvidence.length === 0) {
    throw new Error("Trusted evidence digest could not retain the required publisher evidence.");
  }
  const sourceById = new Map(candidate.sources.map((source) => [source.id, source]));
  const excerptRecords = selectedEvidence.map((evidence) => ({
    evidence,
    source: sourceById.get(evidence.sourceId),
    excerpt: evidenceExcerpt(evidence, candidate, { authoritative }),
  }));
  const publishers = excerptRecords.map(({ source }) => source.publisher);
  const deskLabel = DESK_LABELS[candidate.suggestedDesk];
  const status = candidate.ranking?.eligibility === "material-update" ||
      candidate.materiallyUpdatedAt !== null
    ? "material-update"
    : "new-development";
  const authoritativeFields = authoritative
    ? authoritativeCopy({
      publisher: publishers[0],
      excerpt: excerptRecords[0].excerpt,
      deskLabel,
      primaryEntity: candidate.primaryEntity,
    })
    : null;
  const headline = authoritativeFields?.headline ??
    corroboratedHeadline(candidate, excerptRecords, deskLabel);
  const deck = authoritativeFields?.deck ??
    `Separate reports from ${naturalList(publishers)} cover the same ${deskLabel} development involving ` +
      `${candidate.primaryEntity}`;
  const whatHappened = authoritativeFields?.whatHappened ??
    corroboratedWhatHappened(excerptRecords, deskLabel, candidate.primaryEntity);
  const tierContext = authoritative
    ? `Only ${publishers[0]} supplies the factual account in this brief, so the development remains provisional.`
    : `${publishers.length} separate publishers support the event grouping, although their descriptions may ` +
      "emphasize different details.";
  const story = {
    id: `trusted-evidence-digest-${candidate.candidateId}`,
    canonicalEventKey: candidate.canonicalEventKey,
    desk: candidate.suggestedDesk,
    headline,
    deck,
    status,
    priority: candidate.ranking.score >= 85 ? "high" : "notable",
    timing: {
      eventAt: candidate.eventAt,
      firstPublishedAt: candidate.firstPublishedAt,
      materiallyUpdatedAt: status === "material-update" ? candidate.materiallyUpdatedAt : null,
    },
    whatHappened,
    whyItMatters:
      `${profile.why} ${DESK_CONTEXT[candidate.suggestedDesk]} ${tierContext} ` +
      "The analysis stays within the source excerpts shown here; a working link confirms access, not every claim " +
      "on the full page.",
    whatToDoOrWatch:
      `${profile.watch} ${DESK_WATCH[candidate.suggestedDesk]} ` +
      "Read the linked reports as the evidence trail, and do not treat this brief as a substitute for applicable " +
      "official documentation.",
    editorial: {
      primaryEntity: candidate.primaryEntity,
      aiAdjacent: candidate.aiAdjacent,
      maturity: "verified-development",
      deskFit: `The selected reports belong on the ${deskLabel} desk.`,
    },
    selection: {
      score: candidate.ranking.score,
      selectedBecause: authoritative
        ? "A timely originating report cleared the configured evidence and editorial thresholds."
        : "Separate publisher reports cleared the configured evidence and editorial thresholds.",
      materialDelta: status === "material-update"
        ? "The selected report materially changed during the reporting period."
        : null,
    },
    confidence: {
      level: authoritative ? "developing" : "medium",
      rationale: authoritative
        ? `Only ${publishers[0]} supplies the factual account used by this brief.`
        : `${publishers.length} distinct publishers supplied reports for this brief.`,
    },
    sources: candidate.sources.map(editorialSource),
    evidence: excerptRecords.map(({ source, excerpt }, index) => ({
      id: `trusted-evidence-digest-claim-${candidate.candidateId}-${index + 1}`,
      statement: excerpt === null
        ? `${source.publisher} reports the development in the linked publication without a quoted excerpt`
        : `${source.publisher} reports “${excerpt}”`,
      sourceIds: [source.id],
      verification: "preliminary",
    })),
    securityAction: null,
  };
  if (concise) {
    const conciseProfile = conciseTopicProfile(candidate, selectedEvidence);
    const lead = excerptRecords.find(({ excerpt }) => excerpt !== null);
    story.id = `trusted-evidence-brief-${candidate.candidateId}`;
    story.headline = lead
      ? `${lead.source.publisher} reports “${lead.excerpt}”`
      : `${publishers[0]} reports on ${conciseProfile.topic}`;
    story.deck = authoritative
      ? `${publishers[0]} reports the source item summarized in this short brief`
      : `A short source digest with separate accounts from ${naturalList(publishers)}`;
    story.whatHappened = authoritative
      ? lead
        ? `${publishers[0]} reports “${lead.excerpt}” in its originating account, with no second factual source included in this brief.`
        : `${publishers[0]} reports on ${conciseProfile.topic}, with the original source linked below because the available text does not support a short direct quotation.`
      : excerptRecords.map(({ source, excerpt }) => excerpt === null
        ? `${source.publisher} covers the linked source item, but no short direct quotation was safe to retain.`
        : `${source.publisher} reports “${excerpt}”.`).join(" ");
    story.whyItMatters = conciseProfile.why;
    story.whatToDoOrWatch = conciseProfile.watch;
    story.evidence = story.evidence.map((claim, index) => ({
      ...claim,
      id: `trusted-evidence-brief-claim-${candidate.candidateId}-${index + 1}`,
    }));
  }
  return ensureReaderWordRange(story, { concise });
}

function normalizedQuietReasons(quietReasons) {
  if (!isObject(quietReasons)) throw new Error("quietReasons must be an object keyed by desk.");
  return Object.fromEntries(DESKS.map((desk) => [
    desk,
    typeof quietReasons[desk] === "string" && quietReasons[desk].trim()
      ? cleanInline(quietReasons[desk], 500, `quietReasons.${desk}`)
      : `No qualifying ${DESK_LABELS[desk]} development cleared the evidence and editorial thresholds.`,
  ]));
}

/**
 * Build a complete FREE_EDITORIAL_OUTPUT_SCHEMA-compatible payload without a
 * network request or model call. Candidates must already be compact, selected,
 * and validated by the feed pipeline. `feedEvidence` is untrusted source text;
 * its trusted metadata is rebound to candidate.sources by exact sourceId.
 */
export function buildTrustedEvidenceDigestPayload({
  candidates,
  quietReasons = {},
  concise = false,
} = {}) {
  if (typeof concise !== "boolean") throw new Error("concise must be a boolean.");
  if (!Array.isArray(candidates) || candidates.length > DESKS.length) {
    throw new Error("candidates must be an array containing at most four selected candidates.");
  }
  const normalizedCandidates = candidates.map(normalizeCandidate);
  const deskSet = new Set(normalizedCandidates.map((candidate) => candidate.suggestedDesk));
  const eventSet = new Set(normalizedCandidates.map((candidate) => candidate.canonicalEventKey));
  if (deskSet.size !== normalizedCandidates.length || eventSet.size !== normalizedCandidates.length) {
    throw new Error("Trusted evidence digest candidates must use unique desks and events.");
  }
  const reasons = normalizedQuietReasons(quietReasons);
  const storyByDesk = new Map(normalizedCandidates.map((candidate) => [
    candidate.suggestedDesk,
    buildStory(candidate, { concise }),
  ]));
  const orderedStories = normalizedCandidates
    .map((candidate, index) => ({
      story: storyByDesk.get(candidate.suggestedDesk),
      score: candidate.ranking.score,
      index,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ story }) => story);
  const entityCounts = new Map();
  for (const story of orderedStories) {
    const key = story.editorial.primaryEntity.toLocaleLowerCase("en-US");
    entityCounts.set(key, (entityCounts.get(key) ?? 0) + 1);
  }
  const hasRepeatedEntity = [...entityCounts.values()].some((count) => count > 1);
  const authoritativeCount = normalizedCandidates.filter((candidate) =>
    candidate.evidenceTier === "authoritative-single").length;
  const corroboratedCount = normalizedCandidates.length - authoritativeCount;
  const note = concise && normalizedCandidates.length > 0
    ? "Short source digests link today's selected reports, with focused questions about what to check next."
    : normalizedCandidates.length === 0
    ? "No selected development required a source digest in this edition."
    : authoritativeCount === 0
      ? "Today’s source-checked briefs draw on separate reports from distinct publishers."
      : corroboratedCount === 0
        ? "Today’s clearly attributed primary-source briefs remain developing until more reporting appears."
        : "Today’s source-checked edition combines distinct-publisher reporting with clearly attributed primary-source briefs.";
  const totalReaderWords = orderedStories.reduce((sum, story) =>
    sum + countReaderFacingStoryWords(story), 0);
  return {
    frontPage: {
      note,
      estimatedMinutes: Math.max(1, Math.min(6, Math.ceil(totalReaderWords / 180))),
      leadStoryId: orderedStories[0]?.id ?? null,
      storyOrder: orderedStories.map((story) => story.id),
      stopThePressesStoryId: null,
      diversityException: hasRepeatedEntity
        ? "More than one selected development concerns the same primary entity."
        : null,
    },
    desks: Object.fromEntries(DESKS.map((desk) => [desk, storyByDesk.has(desk)
      ? { desk, story: storyByDesk.get(desk), emptyReason: null }
      : { desk, story: null, emptyReason: reasons[desk] }])),
    backPage: { tryThisTomorrow: null },
  };
}

export function countTrustedEvidenceExcerptWords(value) {
  return readerWordCount(value);
}
