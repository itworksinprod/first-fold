import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { isPublicNetworkAddress } from "../newsroom-qa.mjs";
import {
  assertPersonalStoryLedgerFingerprintKey,
  fingerprintFeedCandidate,
} from "../personal-story-ledger.mjs";
import { FREE_FEED_SOURCES } from "./feed-sources.mjs";

export const FREE_DESKS = Object.freeze([
  "ai",
  "work-and-tools",
  "security-and-privacy",
  "platforms-and-power",
]);

export const DEFAULT_FEED_TIMEOUT_MS = 8_000;
export const DEFAULT_MAX_FEED_BYTES = 1_000_000;
export const DEFAULT_MAX_TOTAL_FEED_BYTES = 10_000_000;
export const DEFAULT_MAX_REDIRECTS = 2;
export const DEFAULT_MAX_ENTRIES_PER_FEED = 80;
export const DEFAULT_MAX_TOTAL_ITEMS = 320;
export const DEFAULT_MAX_CANDIDATES_PER_DESK = 3;
export const DEFAULT_MINIMUM_SCORE = 70;
export const DEFAULT_FREE_EVIDENCE_POLICY = "corroborated";
export const AUTHORITATIVE_FREE_EVIDENCE_POLICY = "authoritative-or-corroborated";
export const FREE_FEED_USER_AGENT =
  "Mozilla/5.0 (compatible; First-Fold-Free-Pilot/1.0; +https://github.com/itworksinprod/first-fold)";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const TRACKING_PARAMETER = /^(?:utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid)$/i;
const SOURCE_RELATIONSHIPS = new Set(["originating", "independent", "context"]);
const FREE_EVIDENCE_POLICIES = new Set([
  DEFAULT_FREE_EVIDENCE_POLICY,
  AUTHORITATIVE_FREE_EVIDENCE_POLICY,
]);
const DESK_LABELS = {
  ai: "AI & Models",
  "work-and-tools": "Work & Tools",
  "security-and-privacy": "Security & Privacy",
  "platforms-and-power": "Platforms & Power",
};

const STOP_WORDS = new Set([
  "a", "about", "after", "an", "and", "are", "as", "at", "be", "by",
  "for", "from", "has", "have", "how", "in", "into", "is", "it", "its",
  "new", "of", "on", "or", "our", "that", "the", "their", "this", "to",
  "using", "was", "we", "what", "when", "with", "you", "your",
]);

// These words describe the broad technology beat or routine publication
// actions; sharing them does not establish that two headlines cover the same
// event. They are excluded only from cross-feed event matching, not ranking.
const EVENT_MATCH_STOP_WORDS = new Set([
  ...STOP_WORDS,
  "add", "added", "adds", "advisory", "ai", "announce", "announced", "announces",
  "announcement", "app", "april", "august", "available", "bring", "brings",
  "antitrust", "cloud", "company", "court", "critical",
  "companies", "coupon", "coupons", "cut", "data", "developer", "developers",
  "debut", "debuted", "debuts", "december", "discount", "disruption",
  "february", "feature", "features", "first", "fix", "fixed", "fixes",
  "flagship", "hit", "introduce", "introduced", "introduces", "january",
  "job", "july", "june", "launch", "launched", "lawsuit", "laying", "layoff",
  "launches", "latest", "million", "billion", "promo",
  "march", "may", "model", "models", "november", "now", "october",
  "down", "downtime", "off", "outage", "patch", "patched", "patches", "people", "plan", "plans",
  "platform", "product",
  "products", "release", "released", "releases", "report", "reported", "over",
  "reports", "research", "ruling", "said", "says", "security", "september",
  "service", "services", "settlement", "software", "unveil", "unveiled", "unveils",
  "vulnerability",
  "study", "tech", "technology", "tool", "tools", "update", "updated",
  "updates", "user", "users", "version", "versions",
]);

const KNOWN_ENTITIES = [
  "OpenAI", "Anthropic", "Google", "Microsoft", "GitHub", "Cloudflare",
  "Amazon", "AWS", "Apple", "Meta", "Mozilla", "NVIDIA", "AMD", "Intel",
  "Oracle", "CISA", "FTC", "CMA", "Hugging Face", "TikTok",
];
const KNOWN_ENTITY_TOKENS = new Set(KNOWN_ENTITIES.flatMap((entity) =>
  entity.toLowerCase().split(/\s+/).map(normalizeEventToken)));

const DESK_TERMS = {
  ai: [
    ["artificial intelligence", 8], ["machine learning", 7], ["language model", 8],
    ["foundation model", 8], ["model", 4], ["llm", 7], ["benchmark", 5],
    ["inference", 5], ["training", 4], ["agent", 4], ["ai", 6],
    ["ai model", 8], ["generative ai", 8], ["ai safety", 9],
    ["ai safety bill", 10], ["model safety", 8],
  ],
  "work-and-tools": [
    ["workflow", 7], ["developer", 5], ["productivity", 7], ["workplace", 7],
    ["collaboration", 5], ["code", 4], ["tool", 5], ["github", 5],
    ["browser", 4], ["automation", 5], ["office", 4], ["api", 3],
    ["browser engine", 9], ["code review", 9], ["work profile", 8],
    ["developer tool", 8], ["source code", 6], ["google workspace", 9],
    ["workspace", 6], ["gitlab", 6], ["devops", 7], ["ci cd", 7],
    ["layoff", 9], ["laying off", 9], ["job", 6], ["staff", 5],
    ["worker", 5], ["labor", 7], ["employment", 7],
  ],
  "security-and-privacy": [
    ["actively exploited", 10], ["zero-day", 9], ["vulnerability", 8],
    ["security", 6], ["privacy", 7], ["breach", 9], ["ransomware", 9],
    ["malware", 7], ["patch", 6], ["cve", 8], ["ghsa", 8],
    ["authentication", 5], ["surveillance", 6], ["data leak", 8],
    ["memory isolation", 9], ["memory safety", 8], ["exploit", 7],
    ["botnet", 8], ["threat actor", 8],
  ],
  "platforms-and-power": [
    ["antitrust", 9], ["competition", 7], ["regulator", 7], ["ruling", 7],
    ["court", 6], ["app store", 7], ["operating system", 6], ["cloud", 5],
    ["chip", 6], ["semiconductor", 7], ["infrastructure", 6], ["platform", 5],
    ["market access", 8], ["investigation", 6], ["merger", 7],
    ["cloud infrastructure", 9], ["cloud computing", 8], ["data center", 7],
    ["amazon ec2", 8], ["kubernetes", 6], ["serverless", 7], ["compute", 6],
  ],
};

// Source priors help break ties between genuinely topical items, but they are
// never evidence that an item belongs on a desk. A story must carry at least
// one strong signal in its title/categories or two strong signals in its
// summary before a prior is allowed to influence classification.
const MINIMUM_STRONG_DESK_TERM_WEIGHT = 5;
const PROMOTIONAL_TITLE_PATTERNS = [
  /\b(?:buying|shopping|gift) guide\b/i,
  /\b(?:coupon|coupons|promo code|promotional offer|limited[- ]time offer|affiliate links?)\b/i,
  /\b(?:price drop|shop now|buy now|save \$|black friday|cyber monday)\b/i,
  /\b(?:best|top|today'?s|limited[- ]time)\b[^.!?]{0,60}\b(?:deal|deals|discount|discounts|sale)\b/i,
  /\b(?:deal|deals|discount|discounts|sale)\b[^.!?]{0,60}\b(?:off|coupon|save|shop|buy)\b/i,
  /\b(?:sponsored|advertorial|paid content|partner content)\b/i,
];
const REVIEW_OR_LIFESTYLE_TITLE_PATTERNS = [
  /\b(?:mattress|bedding|recipe|restaurant|wildlife|birdwatch|gardening|horoscope)\b/i,
  /\b(?:beauty|fashion|fitness|wellness|vacation|travel destination)\b/i,
  /\b(?:movie|television|tv show|streaming picks) review\b/i,
  /\b(?:phone|laptop|tablet|headphone|television|tv|camera|appliance|car) review\b/i,
  /\b(?:hands[- ]on|we tested|review:)\s/i,
];
const SPECULATIVE_TITLE_PATTERNS = [
  /\b(?:rumou?r|rumou?red|rumou?rs|unconfirmed|purported)\b/i,
  /\b(?:leaked|leak)\b[^.!?]{0,45}\b(?:photo|image|roadmap|spec|specification|render|prototype)\b/i,
  /\b(?:might|could|may)\b[^.!?]{0,80}\b(?:launch|release|announce|acquire|buy|replace|cancel|shut down)\b/i,
];
const SOFT_SPECULATIVE_TITLE_PATTERNS = [
  /\b(?:reportedly|is said to|sources say|people familiar|expected to|set to)\b/i,
];
const ROUTINE_OR_MINOR_TITLE_PATTERNS = [
  /\b(?:daily|weekly|monthly)\b[^.!?]{0,40}\b(?:digest|roundup|recap)\b/i,
  /\b(?:newsletter|podcast|webinar|office hours|community spotlight|event recap)\b/i,
  /\b(?:tips|how to|getting started|beginner'?s guide|meet the team)\b/i,
  /\b(?:minor|routine|maintenance)\b[^.!?]{0,35}\b(?:update|release|change|fix)\b/i,
  /\b(?:release notes|changelog|bug[- ]fix release)\b/i,
  /\b(?:adds?|introduces?|ships?)\b[^.!?]{0,45}\b(?:emoji|icon|wallpaper|theme|sticker|reaction)\b/i,
];

export const EDITORIAL_SCORECARD_MAXIMUMS = Object.freeze({
  materialityNewsworthiness: 30,
  deskRelevance: 20,
  sourceStrength: 20,
  readerUsefulnessActionability: 15,
  freshness: 15,
});

const IMPACT_TERMS = [
  "actively exploited", "zero-day", "breach", "ransomware", "critical",
  "vulnerability", "launch", "release", "generally available", "ruling",
  "court", "ban", "antitrust", "merger", "acquisition", "law", "regulation",
  "shutdown", "outage", "recall", "millions", "billion",
  "settlement", "lawsuit", "fine", "layoff", "laying off", "job cuts",
  "hundreds of jobs", "child privacy",
];
const ACTION_TERMS = [
  "patch", "update", "upgrade", "deadline", "mitigation", "fix", "disable",
  "migrate", "available now", "rollout", "required", "advisory", "change",
  "administrator", "developer", "user", "customer",
];
const NOVELTY_TERMS = [
  "launch", "release", "announces", "announced", "available", "ruling",
  "finds", "orders", "files", "patch", "update", "published", "introduces",
];

class FeedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FeedError";
    this.code = code;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireEvidencePolicy(value) {
  if (!FREE_EVIDENCE_POLICIES.has(value)) {
    throw new Error(
      `evidencePolicy must be ${DEFAULT_FREE_EVIDENCE_POLICY} or ${AUTHORITATIVE_FREE_EVIDENCE_POLICY}.`,
    );
  }
  return value;
}

function cleanText(value, maxLength = 1_200) {
  if (typeof value !== "string") return "";
  // Bound regex work per field independently of the aggregate response cap.
  // A malicious JSON feed otherwise gets the full body budget for one string
  // containing pathological unmatched HTML-like input.
  const rawLimit = Math.max(4_096, Math.min(100_000, maxLength * 8));
  return value.slice(0, rawLimit)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&#(\d+);/g, (_match, decimal) => safeCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeCodePoint(value) {
  if (!Number.isInteger(value) || value < 32 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    return " ";
  }
  return String.fromCodePoint(value);
}

function requireInstant(value, label) {
  if (typeof value !== "string") throw new Error(`${label} must be an ISO instant.`);
  const trimmed = value.trim();
  const explicitIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const rfc2822 = /^((?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+)?\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+)(\d{2}|\d{4})(\s+\d{2}:\d{2}(?::\d{2})?\s+(?:GMT|UTC|[+-]\d{4}))$/i.exec(trimmed);
  const explicitRfc2822 = Boolean(rfc2822);
  // Date-only, named-zone, and timezone-free strings are rejected. Their
  // interpretation depends on runner locale and cannot enforce a half-open
  // reporting window exactly.
  if (!explicitIso && !explicitRfc2822) {
    throw new Error(`${label} must include an explicit timezone.`);
  }
  // RFC 2822's obsolete two-digit year form is still emitted by CISA's
  // current feed. Normalize it narrowly and deterministically: 00-49 map to
  // 2000-2049; 50-99 map to 1950-1999. All other syntax still requires a
  // four-digit year and explicit GMT/UTC/numeric offset.
  const parseable = rfc2822?.[2]?.length === 2
    ? `${rfc2822[1]}${Number(rfc2822[2]) <= 49
      ? 2_000 + Number(rfc2822[2])
      : 1_900 + Number(rfc2822[2])}${rfc2822[3]}`
    : trimmed;
  const timestamp = Date.parse(parseable);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be a valid instant.`);
  return new Date(timestamp).toISOString();
}

function optionalFeedInstant(value) {
  const cleaned = cleanText(value, 100);
  if (!cleaned) return null;
  try {
    return requireInstant(cleaned, "Feed timestamp");
  } catch {
    return null;
  }
}

export function assertReportingWindow(reportingWindow) {
  if (!isObject(reportingWindow)) throw new Error("reportingWindow is required.");
  const startInclusive = requireInstant(reportingWindow.startInclusive, "reportingWindow.startInclusive");
  const endExclusive = requireInstant(reportingWindow.endExclusive, "reportingWindow.endExclusive");
  if (Date.parse(startInclusive) >= Date.parse(endExclusive)) {
    throw new Error("reportingWindow must end after it starts.");
  }
  return { startInclusive, endExclusive };
}

function isInWindow(value, window) {
  if (!value) return false;
  const instant = Date.parse(value);
  return instant >= Date.parse(window.startInclusive) && instant < Date.parse(window.endExclusive);
}

function eligibilityForItem(item, window) {
  if (isInWindow(item.publishedAt, window)) {
    return { instant: item.publishedAt, kind: "new-development" };
  }
  return null;
}

export function filterItemsToReportingWindow(items, reportingWindow) {
  const window = assertReportingWindow(reportingWindow);
  if (!Array.isArray(items)) throw new Error("items must be an array.");
  return items.flatMap((item) => {
    const eligibility = eligibilityForItem(item, window);
    return eligibility ? [{ ...item, eligibility }] : [];
  });
}

function normalizeHostname(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
}

function validateAllowedUrl(value, allowedHosts, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new FeedError("URL_INVALID", `${label} must be an absolute URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new FeedError("URL_UNSAFE", `${label} must be credential-free HTTPS on the default port.`);
  }
  const hostname = normalizeHostname(url.hostname);
  const allowed = new Set((allowedHosts ?? []).map(normalizeHostname));
  if (!allowed.has(hostname)) {
    throw new FeedError("HOST_NOT_ALLOWED", `${label} host is not on the reviewed allowlist.`);
  }
  if (url.href.length > 2_048) throw new FeedError("URL_TOO_LONG", `${label} is too long.`);
  return url;
}

function normalizeItemUrl(value, source) {
  if (typeof value !== "string" || !value.trim()) return null;
  let resolved;
  try {
    resolved = new URL(cleanText(value, 2_048), source.url);
    if (resolved.protocol === "http:") {
      const hostname = normalizeHostname(resolved.hostname);
      const reviewedItemHosts = new Set(source.itemHosts.map(normalizeHostname));
      // Some legacy feeds still serialize an HTTP article permalink even
      // though the reviewed host serves HTTPS. Normalize only that exact,
      // credential-free, default-port case; this never follows the HTTP URL.
      if (resolved.username || resolved.password || resolved.port || !reviewedItemHosts.has(hostname)) {
        throw new FeedError("URL_UNSAFE", "Feed item HTTP URL is not safely upgradeable.");
      }
      resolved.protocol = "https:";
    }
    resolved = validateAllowedUrl(resolved.href, source.itemHosts, "Feed item URL");
  } catch {
    return null;
  }
  resolved.hash = "";
  for (const key of [...resolved.searchParams.keys()]) {
    if (TRACKING_PARAMETER.test(key)) resolved.searchParams.delete(key);
  }
  resolved.searchParams.sort();
  return resolved.href;
}

function validateSource(source) {
  if (!isObject(source) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id ?? "")) {
    throw new Error("Every feed source needs a stable lowercase id.");
  }
  if (!cleanText(source.publisher, 120)) throw new Error(`Feed source ${source.id} needs a publisher.`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.publisherKey ?? "")) {
    throw new Error(`Feed source ${source.id} needs a stable publisherKey.`);
  }
  if (!SOURCE_RELATIONSHIPS.has(source.relationship)) {
    throw new Error(`Feed source ${source.id} has an invalid relationship.`);
  }
  if (!new Set(["xml", "json"]).has(source.format)) {
    throw new Error(`Feed source ${source.id} has an unsupported format.`);
  }
  validateAllowedUrl(source.url, source.feedHosts, `Feed source ${source.id} URL`);
  if (!Array.isArray(source.itemHosts) || source.itemHosts.length === 0) {
    throw new Error(`Feed source ${source.id} needs an item-host allowlist.`);
  }
  if (!Array.isArray(source.coverageDesks) || source.coverageDesks.length === 0 ||
      source.coverageDesks.some((desk) => !FREE_DESKS.includes(desk))) {
    throw new Error(`Feed source ${source.id} needs valid coverage desks.`);
  }
  for (const [desk, weight] of Object.entries(source.deskPriors ?? {})) {
    if (!FREE_DESKS.includes(desk) || !Number.isFinite(weight) || weight < 0 || weight > 40) {
      throw new Error(`Feed source ${source.id} has an invalid desk prior.`);
    }
  }
  return source;
}

function xmlTag(block, structure, localName) {
  const pattern = new RegExp(
    `<(?:[a-z][\\w.-]*:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-z][\\w.-]*:)?${localName}\\s*>`,
    "id",
  );
  const match = pattern.exec(structure);
  return match?.indices?.[1] ? block.slice(match.indices[1][0], match.indices[1][1]) : "";
}

function xmlTags(block, structure, localName, limit = 12) {
  const pattern = new RegExp(
    `<(?:[a-z][\\w.-]*:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-z][\\w.-]*:)?${localName}\\s*>`,
    "gid",
  );
  const values = [];
  for (const match of structure.matchAll(pattern)) {
    const range = match.indices?.[1];
    const value = range ? cleanText(block.slice(range[0], range[1]), 160) : "";
    if (value) values.push(value);
    if (values.length >= limit) break;
  }
  return values;
}

function atomLink(structure) {
  for (const match of structure.matchAll(/<(?:[a-z][\w.-]*:)?link\b([^>]*)\/?\s*>/gi)) {
    const attributes = match[1];
    if (/\brel\s*=\s*["'](?!alternate\b)[^"']+["']/i.test(attributes)) continue;
    return /\bhref\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] ?? "";
  }
  return "";
}

function stableId(...parts) {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 16);
}

function normalizeParsedItem(raw, source, retrievedAt, position) {
  const title = cleanText(raw.title, 240);
  const url = normalizeItemUrl(raw.url, source);
  const publishedAt = optionalFeedInstant(raw.publishedAt);
  const updatedCandidate = optionalFeedInstant(raw.updatedAt);
  const updatedAt = updatedCandidate && publishedAt && Date.parse(updatedCandidate) >= Date.parse(publishedAt)
    ? updatedCandidate
    : null;
  if (!title || !url || !publishedAt) return null;
  const guid = cleanText(raw.guid, 300) || url;
  return {
    itemId: `${source.id}-${stableId(guid, title)}`,
    sourceId: source.id,
    publisher: cleanText(source.publisher, 120),
    publisherKey: source.publisherKey,
    relationship: source.relationship,
    primaryEntity: cleanText(source.primaryEntity, 120) || null,
    title,
    summary: cleanText(raw.summary, 1_200),
    url,
    feedUrl: validateAllowedUrl(source.url, source.feedHosts, `Feed source ${source.id} URL`).href,
    publishedAt,
    updatedAt,
    categories: [...new Set((raw.categories ?? []).map((value) => cleanText(value, 80)).filter(Boolean))].slice(0, 12),
    retrievedAt,
    deskPriors: Object.fromEntries(FREE_DESKS.map((desk) => [desk, Number(source.deskPriors?.[desk] ?? 0)])),
    feedPosition: position,
  };
}

function parseXmlFeed(body, source, retrievedAt, maxEntries) {
  const structure = maskXmlOpaqueSections(body);
  if (/<!DOCTYPE|<!ENTITY/i.test(structure)) {
    throw new FeedError("XML_DTD_REJECTED", "XML DTDs and entity declarations are not accepted.");
  }
  assertBoundedXml(structure);
  const blocks = extractXmlEntryBlocks(body, structure, maxEntries);
  return blocks.flatMap(({ kind, body: block, structure: blockStructure }, position) => {
    const raw = {
      title: xmlTag(block, blockStructure, "title"),
      url: kind === "entry"
        ? atomLink(blockStructure) || xmlTag(block, blockStructure, "link")
        : xmlTag(block, blockStructure, "link"),
      guid: xmlTag(block, blockStructure, "guid") || xmlTag(block, blockStructure, "id"),
      summary: xmlTag(block, blockStructure, "description") ||
        xmlTag(block, blockStructure, "summary") || xmlTag(block, blockStructure, "content") ||
        xmlTag(block, blockStructure, "encoded"),
      publishedAt: xmlTag(block, blockStructure, "pubDate") ||
        xmlTag(block, blockStructure, "published") || xmlTag(block, blockStructure, "date"),
      updatedAt: xmlTag(block, blockStructure, "updated") || xmlTag(block, blockStructure, "modified"),
      categories: xmlTags(block, blockStructure, "category"),
    };
    const normalized = normalizeParsedItem(raw, source, retrievedAt, position);
    return normalized ? [normalized] : [];
  });
}

function maskXmlOpaqueSections(body) {
  let cursor = 0;
  const chunks = [];
  while (cursor < body.length) {
    const cdataStart = body.indexOf("<![CDATA[", cursor);
    const commentStart = body.indexOf("<!--", cursor);
    const candidates = [cdataStart, commentStart].filter((index) => index >= 0);
    if (candidates.length === 0) {
      chunks.push(body.slice(cursor));
      break;
    }
    const start = Math.min(...candidates);
    const isCdata = start === cdataStart;
    const terminator = isCdata ? "]]>": "-->";
    const end = body.indexOf(terminator, start + (isCdata ? 9 : 4));
    if (end < 0) throw new FeedError("XML_SHAPE_INVALID", "XML contains an unterminated opaque section.");
    chunks.push(body.slice(cursor, start));
    const opaqueEnd = end + terminator.length;
    chunks.push(body.slice(start, opaqueEnd).replace(/[^\r\n]/g, " "));
    cursor = opaqueEnd;
  }
  return chunks.join("");
}

function extractXmlEntryBlocks(body, structure, maxEntries) {
  const blocks = [];
  const tokens = /<(item|entry)\b[^>]*>|<\/(item|entry)\s*>/gi;
  let open = null;
  for (const match of structure.matchAll(tokens)) {
    const openingKind = match[1]?.toLowerCase() ?? null;
    const closingKind = match[2]?.toLowerCase() ?? null;
    if (openingKind) {
      if (open) throw new FeedError("XML_COMPLEXITY", "Nested feed entries are not accepted.");
      open = { kind: openingKind, bodyStart: match.index + match[0].length };
      continue;
    }
    if (!open || closingKind !== open.kind) {
      throw new FeedError("XML_SHAPE_INVALID", "Feed entry tags are unbalanced.");
    }
    const blockLength = match.index - open.bodyStart;
    if (blockLength > 200_000) throw new FeedError("XML_COMPLEXITY", "A feed entry is too large.");
    blocks.push({
      kind: open.kind,
      body: body.slice(open.bodyStart, match.index),
      structure: structure.slice(open.bodyStart, match.index),
    });
    open = null;
    if (blocks.length >= maxEntries) break;
  }
  if (open) throw new FeedError("XML_SHAPE_INVALID", "Feed entry tags are unbalanced.");
  return blocks;
}

function assertBoundedXml(body) {
  let depth = 0;
  let tokens = 0;
  for (const match of body.matchAll(/<\/?[a-z][^>]*>/gi)) {
    tokens += 1;
    if (tokens > 25_000) throw new FeedError("XML_COMPLEXITY", "XML feed contains too many elements.");
    const token = match[0];
    if (/^<\//.test(token)) depth = Math.max(0, depth - 1);
    else if (!/\/\s*>$/.test(token)) depth += 1;
    if (depth > 40) throw new FeedError("XML_COMPLEXITY", "XML feed nesting is too deep.");
  }
}

function parseJsonFeed(body, source, retrievedAt, maxEntries) {
  let document;
  try {
    document = JSON.parse(body);
  } catch {
    throw new FeedError("JSON_INVALID", "Feed response is not valid JSON.");
  }
  if (!isObject(document) || !Array.isArray(document.items)) {
    throw new FeedError("JSON_SHAPE_INVALID", "JSON feed must contain an items array.");
  }
  return document.items.slice(0, maxEntries).flatMap((item, position) => {
    if (!isObject(item)) return [];
    const raw = {
      title: item.title,
      url: item.url ?? item.external_url,
      guid: item.id,
      summary: item.summary ?? item.content_text ?? item.content_html,
      publishedAt: item.date_published,
      updatedAt: item.date_modified,
      categories: Array.isArray(item.tags) ? item.tags : [],
    };
    const normalized = normalizeParsedItem(raw, source, retrievedAt, position);
    return normalized ? [normalized] : [];
  });
}

export function parseFeedPayload({ source, body, retrievedAt, maxEntries = DEFAULT_MAX_ENTRIES_PER_FEED }) {
  validateSource(source);
  const normalizedRetrievedAt = requireInstant(retrievedAt, "retrievedAt");
  if (typeof body !== "string") throw new Error("Feed body must be a string.");
  if (Buffer.byteLength(body) > DEFAULT_MAX_FEED_BYTES) {
    throw new FeedError("BODY_TOO_LARGE", `Feed exceeded ${DEFAULT_MAX_FEED_BYTES} bytes.`);
  }
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 500) {
    throw new Error("maxEntries must be an integer between 1 and 500.");
  }
  return source.format === "xml"
    ? parseXmlFeed(body, source, normalizedRetrievedAt, maxEntries)
    : parseJsonFeed(body, source, normalizedRetrievedAt, maxEntries);
}

function withTimeout(operation, timeoutMs, onTimeout = () => {}) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(new FeedError("TIMEOUT", `Feed operation exceeded ${timeoutMs}ms.`));
      }, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function resolvePublicAddresses(hostname, lookupImpl, timeoutMs) {
  if (isIP(hostname)) {
    if (!isPublicNetworkAddress(hostname)) throw new FeedError("HOST_UNSAFE", "Feed host is not publicly routed.");
    return [hostname];
  }
  let results;
  try {
    results = await withTimeout(() => lookupImpl(hostname, { all: true, verbatim: true }), timeoutMs);
  } catch (error) {
    if (error instanceof FeedError) throw error;
    throw new FeedError("DNS_FAILED", "Feed hostname lookup failed.");
  }
  const addresses = (Array.isArray(results) ? results : [results])
    .map((result) => typeof result === "string" ? result : result?.address)
    .filter((address) => typeof address === "string");
  if (addresses.length === 0) throw new FeedError("DNS_EMPTY", "Feed hostname returned no addresses.");
  if (addresses.some((address) => !isPublicNetworkAddress(address))) {
    throw new FeedError("DNS_UNSAFE", "Feed hostname resolved to a non-public address.");
  }
  return addresses;
}

function headerValue(headers, name) {
  if (typeof headers?.get === "function") return headers.get(name);
  const value = headers?.[name.toLowerCase()] ?? headers?.[name];
  return Array.isArray(value) ? value[0] : value ?? null;
}

function pinnedGet(url, options) {
  return new Promise((resolve, reject) => {
    const address = options.addresses[0];
    const family = isIP(address);
    let settled = false;
    let totalDeadline;
    let request;
    const finish = (operation) => {
      if (settled) return;
      settled = true;
      clearTimeout(totalDeadline);
      operation();
    };
    request = httpsRequest(url, {
      method: "GET",
      agent: false,
      servername: isIP(options.hostname) ? undefined : options.hostname,
      headers: {
        accept: "application/rss+xml,application/atom+xml,application/feed+json,application/json,text/xml;q=0.9,*/*;q=0.2",
        "accept-encoding": "identity",
        "user-agent": FREE_FEED_USER_AGENT,
        connection: "close",
      },
      lookup(_hostname, lookupOptions, callback) {
        if (lookupOptions?.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
    }, (response) => {
      const status = Number(response.statusCode);
      // Redirect and error bodies are never feed evidence. Stop at headers so
      // a redirect cannot spend the body budget or keep streaming after the
      // next allowlist check should have begun.
      if (REDIRECT_STATUSES.has(status) || status < 200 || status >= 300) {
        response.destroy();
        finish(() => resolve({ status, headers: response.headers, body: "", byteLength: 0 }));
        return;
      }
      const declaredLength = Number(headerValue(response.headers, "content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
        response.destroy();
        finish(() => reject(new FeedError("BODY_TOO_LARGE", `Feed exceeded ${options.maxBytes} bytes.`)));
        return;
      }
      const encoding = String(headerValue(response.headers, "content-encoding") ?? "identity").toLowerCase();
      if (encoding !== "identity") {
        response.destroy();
        finish(() => reject(new FeedError("ENCODING_UNSUPPORTED", "Compressed feed responses are not accepted.")));
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > options.maxBytes) {
          response.destroy(new FeedError("BODY_TOO_LARGE", `Feed exceeded ${options.maxBytes} bytes.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        finish(() => resolve({
          status,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
          byteLength: bytes,
        }));
      });
      response.on("error", (error) => {
        finish(() => reject(error));
      });
    });
    totalDeadline = setTimeout(() => {
      request.destroy(new FeedError("TIMEOUT", `Feed request exceeded its total ${options.timeoutMs}ms deadline.`));
    }, options.timeoutMs);
    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new FeedError("TIMEOUT", `Feed request exceeded ${options.timeoutMs}ms.`));
    });
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        request.destroy(new FeedError("TIMEOUT", "Feed request was aborted."));
      }, { once: true });
    }
    request.on("error", (error) => {
      finish(() => reject(error));
    });
    request.end();
  });
}

async function readResponseBody(response, maxBytes) {
  const direct = response?.body;
  if (typeof direct === "string") {
    if (Buffer.byteLength(direct) > maxBytes) throw new FeedError("BODY_TOO_LARGE", `Feed exceeded ${maxBytes} bytes.`);
    return direct;
  }
  if (Buffer.isBuffer(direct) || direct instanceof Uint8Array) {
    if (direct.byteLength > maxBytes) throw new FeedError("BODY_TOO_LARGE", `Feed exceeded ${maxBytes} bytes.`);
    return Buffer.from(direct).toString("utf8");
  }
  throw new FeedError("BODY_INVALID", "Feed request returned an unreadable body.");
}

export async function fetchFeedSource(source, options = {}) {
  validateSource(source);
  const timeoutMs = options.timeoutMs ?? DEFAULT_FEED_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_FEED_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const lookupImpl = options.lookupImpl ?? dnsLookup;
  const requestImpl = options.requestImpl ?? pinnedGet;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) throw new Error("timeoutMs is out of range.");
  if (!Number.isInteger(maxBytes) || maxBytes < 1_024 || maxBytes > 5_000_000) throw new Error("maxBytes is out of range.");
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 5) throw new Error("maxRedirects is out of range.");

  let current = validateAllowedUrl(source.url, source.feedHosts, `Feed source ${source.id} URL`);
  const redirects = [];
  for (let redirectCount = 0; ; redirectCount += 1) {
    const addresses = await resolvePublicAddresses(normalizeHostname(current.hostname), lookupImpl, timeoutMs);
    let response;
    const controller = new AbortController();
    try {
      response = await withTimeout(() => requestImpl(current.href, {
        timeoutMs,
        maxBytes,
        hostname: normalizeHostname(current.hostname),
        addresses,
        signal: controller.signal,
      }), timeoutMs, () => controller.abort());
    } catch (error) {
      if (error instanceof FeedError) throw error;
      throw new FeedError("REQUEST_FAILED", "Feed request failed.");
    }
    const status = Number(response?.status);
    if (!Number.isInteger(status)) throw new FeedError("STATUS_INVALID", "Feed returned an invalid status.");
    if (REDIRECT_STATUSES.has(status)) {
      if (redirectCount >= maxRedirects) throw new FeedError("REDIRECT_LIMIT", "Feed exceeded its redirect limit.");
      const location = headerValue(response.headers, "location");
      if (!location) throw new FeedError("REDIRECT_INVALID", "Feed redirect omitted its Location header.");
      let next;
      try {
        next = new URL(location, current);
      } catch {
        throw new FeedError("REDIRECT_INVALID", "Feed redirect target is invalid.");
      }
      current = validateAllowedUrl(next.href, source.feedHosts, "Feed redirect target");
      redirects.push(current.href);
      continue;
    }
    if (status < 200 || status >= 300) throw new FeedError("HTTP_STATUS", `Feed returned HTTP ${status}.`);
    const contentEncoding = String(headerValue(response.headers, "content-encoding") ?? "identity").toLowerCase();
    if (contentEncoding !== "identity") {
      throw new FeedError("ENCODING_UNSUPPORTED", "Compressed feed responses are not accepted.");
    }
    const body = await readResponseBody(response, maxBytes);
    const contentType = String(headerValue(response.headers, "content-type") ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const allowedTypes = source.format === "xml"
      ? new Set(["application/atom+xml", "application/rss+xml", "application/xml", "text/xml"])
      : new Set(["application/feed+json", "application/json"]);
    if (!allowedTypes.has(contentType)) {
      throw new FeedError("CONTENT_TYPE_INVALID", `Feed returned unsupported content type ${contentType || "(missing)"}.`);
    }
    return {
      body,
      byteLength: Buffer.byteLength(body),
      finalUrl: current.href,
      redirects,
      status,
    };
  }
}

function tokenize(value) {
  return cleanText(value, 2_000)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function normalizeEventToken(token) {
  const aliases = {
    children: "child",
    layoffs: "layoff",
    laid: "layoff",
  };
  if (aliases[token]) return aliases[token];
  const compactMagnitude = /^(\d+)(?:m|bn|b)$/.exec(token);
  if (compactMagnitude) return compactMagnitude[1];
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("s") && !/(?:ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

function meaningfulTitleTokenSet(item) {
  return new Set(tokenize(item.title)
    .map(normalizeEventToken)
    // A bare four-digit number in a headline is overwhelmingly a calendar
    // year. It can improve neither overlap nor anchoring: otherwise unrelated
    // monthly patch roundups can corroborate each other merely via "2026".
    // Structured CVE/GHSA identifiers remain available through strongIdentifier.
    .filter((token) => token.length > 1 && !/^\d{4}$/.test(token) && !EVENT_MATCH_STOP_WORDS.has(token)));
}

function eventTitleTokenSet(item) {
  return new Set([
    ...[...meaningfulTitleTokenSet(item)].filter((token) => !KNOWN_ENTITY_TOKENS.has(token)),
    ...[...productIdentifiers(item)].map((identifier) => `product:${identifier}`),
  ]);
}

function setsEqual(left, right) {
  return left.size === right.size && [...left].every((token) => right.has(token));
}

function productIdentifiers(item) {
  const identifiers = String(item.title ?? "").toLowerCase().match(
    /\b(?:gpt|claude|gemini|llama|mistral|deepseek|grok)[\s-]?\d+(?:\.\d+)*(?:[\s-](?:flash|haiku|max|mini|opus|pro|sonnet|ultra))?\b/g,
  ) ?? [];
  return new Set(identifiers.map((value) => value.replace(/\s+/g, "-").replace(/--+/g, "-")));
}

function eventActionFamilies(item) {
  const title = String(item.title ?? "");
  const families = new Set();
  if (/\b(?:announce(?:d|s)?|debut(?:ed|s|ing)?|flagship|introduc(?:e|ed|es|ing)|launch(?:ed|es|ing)?|releas(?:e|ed|es|ing)|unveil(?:ed|s|ing)?)\b/i.test(title)) {
    families.add("release");
  }
  if (/\b(?:disruption|down|downtime|outage)\b/i.test(title)) families.add("outage");
  if (/\b(?:layoff|layoffs|laying\s+off|job\s+cuts?|cut(?:s|ting)?(?:\s+[a-z0-9-]+){0,4}\s+(?:employees?|jobs|roles|staff|staffers?|workers?))\b/i.test(title)) {
    families.add("layoff");
  }
  if (/\b(?:antitrust|court|lawsuit|settlement)\b/i.test(title)) families.add("legal");
  if (/\b(?:advisory|fix(?:ed|es)?|patch(?:ed|es)?|vulnerabilit(?:y|ies))\b/i.test(title)) families.add("security-fix");
  return families;
}

function jaccard(left, right) {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function strongIdentifier(item) {
  const match = `${item.title} ${item.summary}`.match(/\b(?:CVE-\d{4}-\d{4,}|GHSA-[a-z0-9-]{8,})\b/i);
  return match?.[0].toLowerCase() ?? null;
}

function titleEntityKeys(item) {
  const title = String(item.title ?? "");
  const aliases = { aws: "amazon" };
  return new Set(KNOWN_ENTITIES.flatMap((entity) => {
    const expression = entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    if (!new RegExp(`\\b${expression}\\b`, "i").test(title)) return [];
    const key = entity.toLowerCase();
    return [aliases[key] ?? key];
  }));
}

function titleFingerprint(item) {
  return [...meaningfulTitleTokenSet(item)].sort().slice(0, 12).join("-") || item.itemId;
}

function itemsMatch(left, right) {
  if (left.url === right.url) return true;
  const leftIdentifier = strongIdentifier(left);
  const rightIdentifier = strongIdentifier(right);
  if (leftIdentifier && leftIdentifier === rightIdentifier) return true;
  const leftEntities = titleEntityKeys(left);
  const rightEntities = titleEntityKeys(right);
  if (leftEntities.size > 0 && rightEntities.size > 0 &&
      ![...leftEntities].some((entity) => rightEntities.has(entity))) {
    return false;
  }
  const leftEventTokens = eventTitleTokenSet(left);
  const rightEventTokens = eventTitleTokenSet(right);
  const sharedEventCount = [...leftEventTokens].filter((token) => rightEventTokens.has(token)).length;
  const eventSimilarity = jaccard(leftEventTokens, rightEventTokens);
  const leftActions = eventActionFamilies(left);
  const rightActions = eventActionFamilies(right);
  const hasActionSignal = leftActions.size > 0 || rightActions.size > 0;
  const sharesActionFamily = [...leftActions].some((family) => rightActions.has(family));
  if (hasActionSignal && !sharesActionFamily) return false;
  const leftProducts = productIdentifiers(left);
  const rightProducts = productIdentifiers(right);
  const sharesExactProduct = [...leftProducts].some((identifier) => rightProducts.has(identifier));
  if (sharesExactProduct && sharesActionFamily) return true;
  if (leftEventTokens.size >= 3 && setsEqual(leftEventTokens, rightEventTokens)) return true;
  if (left.publisherKey !== right.publisherKey) {
    return sharedEventCount >= 3 && eventSimilarity >= 0.2;
  }
  return sharedEventCount >= 3 && eventSimilarity >= 0.58;
}

export function deduplicateFeedItems(items) {
  if (!Array.isArray(items)) throw new Error("items must be an array.");
  const ordered = [...items].sort((left, right) =>
    left.title.localeCompare(right.title) || left.url.localeCompare(right.url) || left.sourceId.localeCompare(right.sourceId));
  const groups = [];
  for (const item of ordered) {
    const existing = groups.find((group) => group.items.some((candidate) => itemsMatch(item, candidate)));
    if (existing) existing.items.push(item);
    else groups.push({ items: [item] });
  }
  return groups.map((group) => {
    group.items.sort((left, right) =>
      relationshipRank(left.relationship) - relationshipRank(right.relationship) ||
      Date.parse(right.eligibility?.instant ?? right.updatedAt ?? right.publishedAt) -
        Date.parse(left.eligibility?.instant ?? left.updatedAt ?? left.publishedAt) ||
      left.sourceId.localeCompare(right.sourceId));
    const identifier = group.items.map(strongIdentifier).find(Boolean);
    const seed = identifier ?? titleFingerprint(group.items[0]);
    return {
      canonicalEventKey: `free-${stableId(seed)}`,
      items: group.items,
    };
  });
}

function relationshipRank(value) {
  return value === "originating" ? 0 : value === "independent" ? 1 : 2;
}

function containsTerm(text, term) {
  const parts = String(term).toLowerCase().split(/[\s/-]+/).filter(Boolean);
  if (parts.length === 0) return false;
  const expression = parts
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s/-]+");
  return new RegExp(`(?:^|[^a-z0-9])${expression}(?=$|[^a-z0-9])`, "i").test(text);
}

function termScore(text, terms, multiplier = 1) {
  return terms.reduce((sum, [term, weight]) => sum + (containsTerm(text, term) ? weight * multiplier : 0), 0);
}

function matchedStrongDeskTerms(text, terms) {
  return terms
    .filter(([, weight]) => weight >= MINIMUM_STRONG_DESK_TERM_WEIGHT)
    .filter(([term]) => containsTerm(text, term))
    .map(([term]) => term);
}

function rejectionReason(code, message) {
  return { code, message };
}

function sourceEvidenceForItems(items) {
  const factualItems = items.filter((item) => item.relationship !== "context");
  const itemSourceCount = new Set(factualItems.map((item) => item.url)).size;
  const publisherKeys = [...new Set(factualItems.map((item) => item.publisherKey))].sort();
  const corroborated = itemSourceCount >= 2 && publisherKeys.length >= 2;
  const authoritativeSingle = itemSourceCount === 1 && publisherKeys.length === 1 &&
    factualItems[0]?.relationship === "originating";
  return {
    itemSourceCount,
    publisherKeys,
    corroborated,
    authoritativeSingle,
    evidenceTier: corroborated
      ? "corroborated"
      : authoritativeSingle
        ? "authoritative-single"
        : "insufficient",
  };
}

function contentVetoReasons(items) {
  const titleCategoryText = items
    .map((item) => `${item.title} ${item.categories.join(" ")}`)
    .join(" ");
  // Do not turn legitimate editorial processes such as code/security review
  // into consumer-product-review false positives.
  const reviewSafeText = titleCategoryText.replace(
    /\b(?:code|security|privacy|antitrust|regulatory) review\b/gi,
    "",
  );
  const reasons = [];
  if (PROMOTIONAL_TITLE_PATTERNS.some((pattern) => pattern.test(titleCategoryText))) {
    reasons.push(rejectionReason(
      "PROMOTIONAL_OR_DEAL_CONTENT",
      "Advertising, affiliate promotions, shopping deals, and sales content are not editorial candidates.",
    ));
  }
  if (REVIEW_OR_LIFESTYLE_TITLE_PATTERNS.some((pattern) => pattern.test(reviewSafeText))) {
    reasons.push(rejectionReason(
      "REVIEW_OR_LIFESTYLE_CONTENT",
      "Consumer reviews and lifestyle coverage are outside the paper's editorial remit.",
    ));
  }
  if (SPECULATIVE_TITLE_PATTERNS.some((pattern) => pattern.test(titleCategoryText))) {
    reasons.push(rejectionReason(
      "SPECULATIVE_OR_RUMOR",
      "Rumors, leaks, and hypothetical future announcements are not verified developments.",
    ));
  } else if (SOFT_SPECULATIVE_TITLE_PATTERNS.some((pattern) => pattern.test(titleCategoryText))) {
    const evidence = sourceEvidenceForItems(items);
    if (!evidence.corroborated && !evidence.authoritativeSingle) {
      reasons.push(rejectionReason(
        "SPECULATIVE_OR_RUMOR",
        "A tentative or attributed report requires corroboration or an originating source.",
      ));
    }
  }
  if (ROUTINE_OR_MINOR_TITLE_PATTERNS.some((pattern) => pattern.test(titleCategoryText))) {
    reasons.push(rejectionReason(
      "ROUTINE_OR_MINOR_ANNOUNCEMENT",
      "Routine recaps, how-to content, maintenance notes, and cosmetic updates are not material news.",
    ));
  }
  return reasons;
}

function deskClassification(items) {
  const titleCategoryText = items
    .map((item) => `${item.title} ${item.categories.join(" ")}`.toLowerCase())
    .join(" ");
  const summaryText = items.map((item) => item.summary.toLowerCase()).join(" ");
  const signals = Object.fromEntries(FREE_DESKS.map((desk) => {
    const titleCategoryTerms = matchedStrongDeskTerms(titleCategoryText, DESK_TERMS[desk]);
    const summaryTerms = matchedStrongDeskTerms(summaryText, DESK_TERMS[desk]);
    return [desk, {
      titleCategoryTerms,
      summaryTerms,
      eligible: titleCategoryTerms.length >= 1 || summaryTerms.length >= 2,
    }];
  }));
  const eligibleDesks = FREE_DESKS.filter((desk) => signals[desk].eligible);
  if (eligibleDesks.length === 0) return null;
  const scores = Object.fromEntries(FREE_DESKS.map((desk) => {
    const prior = Math.max(...items.map((item) => item.deskPriors?.[desk] ?? 0));
    const titleCategoryScore = termScore(titleCategoryText, DESK_TERMS[desk], 1.35);
    const summaryScore = termScore(summaryText, DESK_TERMS[desk], 0.55);
    return [desk, Math.round((prior + titleCategoryScore + summaryScore) * 100) / 100];
  }));
  const desk = eligibleDesks.sort((left, right) =>
    scores[right] - scores[left] || FREE_DESKS.indexOf(left) - FREE_DESKS.indexOf(right))[0];
  return { desk, scores, signals };
}

function countTerms(text, terms) {
  return terms.filter((term) => containsTerm(text, term)).length;
}

function freshnessScore(group, reportingWindow) {
  const firstPublishedAt = group.items.map((item) => item.publishedAt).sort()[0];
  const ageHours = Math.max(
    0,
    (Date.parse(reportingWindow.endExclusive) - Date.parse(firstPublishedAt)) / 3_600_000,
  );
  if (ageHours <= 6) return 15;
  if (ageHours <= 24) return 13;
  if (ageHours <= 48) return 10;
  if (ageHours <= 72) return 8;
  if (ageHours <= 168) return 5;
  return 2;
}

function scoreGroup(group, classification, evidence, reportingWindow) {
  const text = group.items.map((item) => `${item.title} ${item.summary}`.toLowerCase()).join(" ");
  const deskSignals = classification.signals[classification.desk];
  const hasSpecificNumber = /\b\d+(?:\.\d+)?(?:m|bn|b|million|billion|%)?\b/i.test(text);
  const hasStrongIdentifier = Boolean(strongIdentifier(group.items[0]));
  const materialityNewsworthiness = Math.min(
    EDITORIAL_SCORECARD_MAXIMUMS.materialityNewsworthiness,
    8 + Math.min(16, countTerms(text, IMPACT_TERMS) * 4) +
      Math.min(4, countTerms(text, NOVELTY_TERMS) * 2) +
      (hasStrongIdentifier ? 3 : 0) + (hasSpecificNumber ? 2 : 0),
  );
  const deskRelevance = Math.min(
    EDITORIAL_SCORECARD_MAXIMUMS.deskRelevance,
    10 + Math.min(6, deskSignals.titleCategoryTerms.length * 3) +
      Math.min(4, deskSignals.summaryTerms.length * 2) +
      (classification.scores[classification.desk] >= 35 ? 2 : 0),
  );
  const sourceStrength = evidence.corroborated
    ? 20
    : evidence.authoritativeSingle
      ? 16
      : 6;
  const readerUsefulnessActionability = Math.min(
    EDITORIAL_SCORECARD_MAXIMUMS.readerUsefulnessActionability,
    4 + Math.min(7, countTerms(text, ACTION_TERMS) * 2) +
      (hasStrongIdentifier ? 2 : 0) + (hasSpecificNumber ? 2 : 0),
  );
  const freshness = freshnessScore(group, reportingWindow);
  const components = {
    materialityNewsworthiness,
    deskRelevance,
    sourceStrength,
    readerUsefulnessActionability,
    freshness,
  };
  const score = Math.min(100, Object.values(components).reduce((sum, value) => sum + value, 0));
  return {
    score,
    components,
    componentMaximums: EDITORIAL_SCORECARD_MAXIMUMS,
    version: "editorial-v1",
  };
}

function inferEntity(items) {
  const text = items.map((item) => item.title).join(" ");
  const originatingEntity = items.find((item) =>
    item.relationship === "originating" && cleanText(item.primaryEntity, 120))?.primaryEntity;
  if (originatingEntity) {
    const entityTerms = {
      Amazon: ["amazon", "aws"],
      GitHub: ["github"],
      Google: ["google"],
      Microsoft: ["microsoft"],
    }[originatingEntity] ?? [originatingEntity];
    if (entityTerms.some((term) => containsTerm(text, term))) return originatingEntity;
  }
  const named = KNOWN_ENTITIES.find((entity) => new RegExp(`\\b${entity.replace(/\s+/g, "\\s+")}\\b`, "i").test(text));
  return named ?? originatingEntity ?? items[0].primaryEntity ?? items[0].publisher;
}

function candidateSource(item, index) {
  return {
    id: `source-${index + 1}-${item.sourceId}`,
    title: item.title,
    publisher: item.publisher,
    publisherKey: item.publisherKey,
    url: item.url,
    relationship: item.relationship,
    publishedAt: item.publishedAt,
    retrievedAt: item.retrievedAt,
  };
}

function feedEndpointSource(item, index) {
  return {
    id: `source-${index + 1}-${item.sourceId}-feed`,
    title: `${item.publisher} feed index`,
    publisher: item.publisher,
    publisherKey: item.publisherKey,
    url: item.feedUrl,
    relationship: "context",
    publishedAt: null,
    retrievedAt: item.retrievedAt,
  };
}

function groupToCandidate(group, reportingWindow) {
  const classification = deskClassification(group.items);
  if (!classification) return null;
  const sources = [];
  const seenUrls = new Set();
  for (const item of group.items) {
    if (sources.length >= 8) break;
    if (seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    sources.push(candidateSource(item, sources.length));
    if (sources.length < 8 && !seenUrls.has(item.feedUrl)) {
      seenUrls.add(item.feedUrl);
      sources.push(feedEndpointSource(item, sources.length));
    }
  }
  const firstPublishedAt = group.items.map((item) => item.publishedAt).sort()[0];
  const primary = group.items[0];
  const emittedFactualSources = sources.filter((source) => source.relationship !== "context");
  const evidence = sourceEvidenceForItems(emittedFactualSources);
  const ranking = scoreGroup(group, classification, evidence, reportingWindow);
  const itemSourceCount = new Set(emittedFactualSources.map((source) => source.url)).size;
  const publisherKeys = [...new Set(emittedFactualSources.map((source) => source.publisherKey))].sort();
  const facts = group.items.slice(0, 4).map((item) => {
    const detail = item.summary ? ` ${item.summary}` : "";
    return `${item.publisher}'s feed reports: ${item.title}.${detail}`.slice(0, 900);
  });
  const aiScore = classification.scores.ai;
  return {
    candidateId: `candidate-${stableId(group.canonicalEventKey, primary.title)}`,
    canonicalEventKey: group.canonicalEventKey,
    suggestedDesk: classification.desk,
    primaryEntity: inferEntity(group.items),
    aiAdjacent: classification.desk === "ai" || aiScore >= 24,
    maturity: "verified-development",
    title: primary.title,
    eventAt: null,
    firstPublishedAt,
    materiallyUpdatedAt: null,
    verifiedFacts: facts,
    unresolvedQuestions: [],
    sources,
    ranking: {
      ...ranking,
      deskScores: classification.scores,
      deskSignals: classification.signals,
      sourceIds: group.items.map((item) => item.itemId),
      eligibility: "new-development",
      corroborated: evidence.corroborated,
      evidenceTier: evidence.evidenceTier,
      itemSourceCount,
      publisherCount: publisherKeys.length,
      publisherKeys,
    },
  };
}

export function assessFeedCandidates({
  items,
  reportingWindow,
  recentArchive = [],
  recentRepeatHistory = [],
  repeatFingerprintKey,
  minimumScore = DEFAULT_MINIMUM_SCORE,
  minimumAuthoritativeScore = minimumScore,
  evidencePolicy = DEFAULT_FREE_EVIDENCE_POLICY,
} = {}) {
  if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) {
    throw new Error("minimumScore must be between 0 and 100.");
  }
  if (!Number.isFinite(minimumAuthoritativeScore) ||
      minimumAuthoritativeScore < 0 || minimumAuthoritativeScore > 100) {
    throw new Error("minimumAuthoritativeScore must be between 0 and 100.");
  }
  const normalizedEvidencePolicy = requireEvidencePolicy(evidencePolicy);
  const eligibleItems = filterItemsToReportingWindow(items, reportingWindow);
  const recentStories = (Array.isArray(recentArchive) ? recentArchive : []).flatMap((edition) =>
    Array.isArray(edition?.stories)
      ? edition.stories.filter(isObject)
      : FREE_DESKS.map((desk) => edition?.desks?.[desk]?.story).filter(isObject));
  const recentKeys = new Set(recentStories.map((story) => story.canonicalEventKey).filter(Boolean));
  if (!Array.isArray(recentRepeatHistory) || recentRepeatHistory.length > 124) {
    throw new Error("recentRepeatHistory must be a bounded array.");
  }
  if (recentRepeatHistory.length > 0) {
    assertPersonalStoryLedgerFingerprintKey(repeatFingerprintKey);
  }
  return deduplicateFeedItems(eligibleItems).map((group) => {
    const reasons = contentVetoReasons(group.items);
    const candidate = groupToCandidate(group, assertReportingWindow(reportingWindow));
    if (!candidate) {
      reasons.push(rejectionReason(
        "INSUFFICIENT_TOPICALITY",
        "The title, categories, and feed summary do not contain enough desk-specific evidence.",
      ));
    } else {
      const evidenceAccepted = candidate.ranking.evidenceTier === "corroborated" ||
        (normalizedEvidencePolicy === AUTHORITATIVE_FREE_EVIDENCE_POLICY &&
          candidate.ranking.evidenceTier === "authoritative-single");
      if (!evidenceAccepted) {
        reasons.push(rejectionReason(
          "INSUFFICIENT_SOURCE_EVIDENCE",
          normalizedEvidencePolicy === DEFAULT_FREE_EVIDENCE_POLICY
            ? "The comparison edition requires distinct factual URLs from at least two reviewed publishers."
            : "The personal edition requires either an originating source or distinct reports from two reviewed publishers.",
        ));
      }
      const threshold = candidate.ranking.evidenceTier === "authoritative-single"
        ? minimumAuthoritativeScore
        : minimumScore;
      if (candidate.ranking.score < threshold) {
        reasons.push(rejectionReason(
          "BELOW_EDITORIAL_THRESHOLD",
          `The editorial score ${candidate.ranking.score} is below the required ${threshold}.`,
        ));
      }
      if (recentKeys.has(candidate.canonicalEventKey) ||
          recentStories.some((story) => candidateMatchesRecentStory(candidate, story)) ||
          candidateMatchesRepeatHistory(candidate, recentRepeatHistory, {
            fingerprintKey: repeatFingerprintKey,
          })) {
        reasons.push(rejectionReason(
          "RECENT_DUPLICATE",
          "The same development already appeared in the supplied recent-edition archive.",
        ));
      }
      candidate.ranking.editorialValidation = {
        decision: reasons.length === 0 ? "accepted" : "rejected",
        requiredScore: threshold,
        rejectionReasons: reasons,
      };
    }
    return {
      decision: reasons.length === 0 ? "accepted" : "rejected",
      canonicalEventKey: group.canonicalEventKey,
      title: group.items[0]?.title ?? "Untitled feed item",
      candidate,
      rejectionReasons: reasons,
    };
  });
}

function requireRepeatDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validatedRepeatEntry(value) {
  if (!isObject(value)) throw new Error("recentRepeatHistory contains an invalid entry.");
  const sourceDigests = value.sourceUrlSha256;
  const titleDigests = value.titleTokenSha256;
  if (
    !requireRepeatDigest(value.eventKeySha256) ||
    !requireRepeatDigest(value.entitySha256) ||
    (value.strongIdentifierSha256 !== null && !requireRepeatDigest(value.strongIdentifierSha256)) ||
    !Array.isArray(sourceDigests) ||
    sourceDigests.length < 1 ||
    sourceDigests.length > 8 ||
    sourceDigests.some((digest) => !requireRepeatDigest(digest)) ||
    new Set(sourceDigests).size !== sourceDigests.length ||
    !Array.isArray(titleDigests) ||
    titleDigests.length < 1 ||
    titleDigests.length > 12 ||
    titleDigests.some((digest) => !requireRepeatDigest(digest)) ||
    new Set(titleDigests).size !== titleDigests.length
  ) {
    throw new Error("recentRepeatHistory contains an invalid entry.");
  }
  return value;
}

export function candidateMatchesRepeatHistory(
  candidate,
  recentRepeatHistory = [],
  { fingerprintKey } = {},
) {
  if (!Array.isArray(recentRepeatHistory) || recentRepeatHistory.length > 124) {
    throw new Error("recentRepeatHistory must be a bounded array.");
  }
  if (recentRepeatHistory.length === 0) return false;
  assertPersonalStoryLedgerFingerprintKey(fingerprintKey);
  const identity = fingerprintFeedCandidate(candidate, { fingerprintKey });
  return recentRepeatHistory.some((rawEntry) => {
    const entry = validatedRepeatEntry(rawEntry);
    if (identity.eventKeySha256 === entry.eventKeySha256) return true;
    if (
      identity.strongIdentifierSha256 !== null &&
      identity.strongIdentifierSha256 === entry.strongIdentifierSha256
    ) return true;
    const priorSources = new Set(entry.sourceUrlSha256);
    if (identity.sourceUrlSha256.some((digest) => priorSources.has(digest))) return true;
    if (identity.entitySha256 !== entry.entitySha256) return false;
    return jaccard(
      new Set(identity.titleTokenSha256),
      new Set(entry.titleTokenSha256),
    ) >= 0.7;
  });
}

export function rankFeedCandidates(options = {}) {
  return sortRankedCandidates(assessFeedCandidates(options)
    .filter((assessment) => assessment.decision === "accepted")
    .map((assessment) => assessment.candidate));
}

function sortRankedCandidates(candidates) {
  return candidates.sort((left, right) =>
      right.ranking.score - left.ranking.score ||
      Date.parse(right.materiallyUpdatedAt ?? right.firstPublishedAt) - Date.parse(left.materiallyUpdatedAt ?? left.firstPublishedAt) ||
      left.canonicalEventKey.localeCompare(right.canonicalEventKey));
}

function candidateMatchesRecentStory(candidate, story) {
  const candidateIdentifier = `${candidate.title} ${candidate.verifiedFacts.join(" ")}`
    .match(/\b(?:CVE-\d{4}-\d{4,}|GHSA-[a-z0-9-]{8,})\b/i)?.[0]?.toLowerCase();
  const storyIdentifier = `${story.headline ?? story.title ?? ""} ${(story.lastKnownFacts ?? []).join(" ")}`
    .match(/\b(?:CVE-\d{4}-\d{4,}|GHSA-[a-z0-9-]{8,})\b/i)?.[0]?.toLowerCase();
  if (candidateIdentifier && candidateIdentifier === storyIdentifier) return true;
  const sameEntity = typeof story.primaryEntity === "string" &&
    story.primaryEntity.trim().toLowerCase() === candidate.primaryEntity.trim().toLowerCase();
  if (!sameEntity) return false;
  const recentTitle = story.headline ?? story.title;
  return typeof recentTitle === "string" &&
    jaccard(new Set(tokenize(candidate.title)), new Set(tokenize(recentTitle))) >= 0.7;
}

function canonicalEntityKey(value) {
  const normalized = cleanText(value, 120).toLowerCase();
  const aliases = {
    aws: "amazon",
    github: "microsoft",
    "google research": "google",
    "google workspace": "google",
    "google workspace updates": "google",
    "microsoft research": "microsoft",
    "microsoft security": "microsoft",
  };
  return aliases[normalized] ?? normalized;
}

export function selectFreeDeskCandidates(candidates, {
  maxCandidatesPerDesk = DEFAULT_MAX_CANDIDATES_PER_DESK,
  evidencePolicy = DEFAULT_FREE_EVIDENCE_POLICY,
} = {}) {
  if (!Array.isArray(candidates)) throw new Error("candidates must be an array.");
  if (!Number.isInteger(maxCandidatesPerDesk) || maxCandidatesPerDesk < 1 || maxCandidatesPerDesk > 10) {
    throw new Error("maxCandidatesPerDesk must be an integer between 1 and 10.");
  }
  const normalizedEvidencePolicy = requireEvidencePolicy(evidencePolicy);
  const shortlists = Object.fromEntries(FREE_DESKS.map((desk) => [desk,
    candidates.filter((candidate) => candidate.suggestedDesk === desk).slice(0, maxCandidatesPerDesk),
  ]));
  // Four desks and at most ten candidates per desk make exhaustive assignment
  // tiny. Optimize for a complete, entity-diverse slate before aggregate score;
  // a greedy global sort can otherwise spend Google/Amazon on an early desk and
  // leave a later desk empty even when a safe four-story assignment exists.
  let bestSelection = null;
  const selectedByDesk = new Map();
  const selectedEntities = new Set();
  function considerSelection() {
    const count = selectedByDesk.size;
    const score = [...selectedByDesk.values()]
      .reduce((sum, candidate) => sum + candidate.ranking.score, 0);
    const identity = FREE_DESKS
      .map((desk) => selectedByDesk.get(desk)?.canonicalEventKey ?? "~")
      .join("\u0000");
    if (
      !bestSelection ||
      count > bestSelection.count ||
      (count === bestSelection.count && score > bestSelection.score) ||
      (count === bestSelection.count && score === bestSelection.score &&
        identity.localeCompare(bestSelection.identity) < 0)
    ) {
      bestSelection = {
        count,
        score,
        identity,
        selectedByDesk: new Map(selectedByDesk),
      };
    }
  }
  function assignDesk(index, selectedAiAdjacent = 0) {
    if (index === FREE_DESKS.length) {
      considerSelection();
      return;
    }
    const desk = FREE_DESKS[index];
    for (const candidate of shortlists[desk]) {
      const entityKey = canonicalEntityKey(candidate.primaryEntity) || candidate.canonicalEventKey;
      if (selectedEntities.has(entityKey)) continue;
      if (candidate.aiAdjacent && selectedAiAdjacent >= 2) continue;
      selectedByDesk.set(desk, candidate);
      selectedEntities.add(entityKey);
      assignDesk(index + 1, selectedAiAdjacent + (candidate.aiAdjacent ? 1 : 0));
      selectedEntities.delete(entityKey);
      selectedByDesk.delete(desk);
    }
    assignDesk(index + 1, selectedAiAdjacent);
  }
  assignDesk(0);
  const optimizedSelection = bestSelection?.selectedByDesk ?? new Map();
  const desks = Object.fromEntries(FREE_DESKS.map((desk) => {
    const selectedCandidate = optimizedSelection.get(desk) ?? null;
    const emptyReason = selectedCandidate
      ? null
      : shortlists[desk].length === 0
        ? normalizedEvidencePolicy === AUTHORITATIVE_FREE_EVIDENCE_POLICY
          ? `No authoritative or independently corroborated ${DESK_LABELS[desk]} feed development cleared the editorial threshold.`
          : `No independently corroborated ${DESK_LABELS[desk]} feed development cleared the editorial threshold.`
        : `Qualifying ${DESK_LABELS[desk]} feed items overlapped with a stronger edition-wide selection.`;
    return [desk, { desk, candidates: shortlists[desk], selectedCandidate, emptyReason }];
  }));
  return {
    desks,
    selectedCandidates: FREE_DESKS.flatMap((desk) =>
      optimizedSelection.has(desk) ? [optimizedSelection.get(desk)] : []),
  };
}

function sanitizeFailure(source, error) {
  const knownCode = typeof error?.code === "string" && /^[A-Z_]+$/.test(error.code) ? error.code : "FEED_FAILED";
  return {
    sourceId: source.id,
    publisherKey: source.publisherKey,
    status: "failed",
    code: knownCode,
    message: knownCode === "HTTP_STATUS" ? cleanText(error.message, 120) : "Feed could not be ingested safely.",
    itemCount: 0,
    parsedItemCount: 0,
    eligibleItemCount: 0,
  };
}

export async function ingestCuratedFeeds({
  sources = FREE_FEED_SOURCES,
  reportingWindow,
  retrievedAt,
  concurrency = 4,
  maxTotalBytes = DEFAULT_MAX_TOTAL_FEED_BYTES,
  maxTotalItems = DEFAULT_MAX_TOTAL_ITEMS,
  ...networkOptions
} = {}) {
  const window = assertReportingWindow(reportingWindow);
  const normalizedRetrievedAt = requireInstant(retrievedAt, "retrievedAt");
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("At least one feed source is required.");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("concurrency must be an integer between 1 and 8.");
  }
  if (!Number.isInteger(maxTotalBytes) || maxTotalBytes < 1_024 || maxTotalBytes > 25_000_000) {
    throw new Error("maxTotalBytes is out of range.");
  }
  if (!Number.isInteger(maxTotalItems) || maxTotalItems < 1 || maxTotalItems > 2_000) {
    throw new Error("maxTotalItems is out of range.");
  }
  const perRequestMaxBytes = networkOptions.maxBytes ?? DEFAULT_MAX_FEED_BYTES;
  if (!Number.isInteger(perRequestMaxBytes) || perRequestMaxBytes < 1_024 || perRequestMaxBytes > 5_000_000) {
    throw new Error("maxBytes is out of range.");
  }
  const uniqueIds = new Set();
  sources.forEach((source) => {
    validateSource(source);
    if (uniqueIds.has(source.id)) throw new Error(`Duplicate feed source id: ${source.id}.`);
    uniqueIds.add(source.id);
  });
  const results = Array(sources.length);
  let cursor = 0;
  let consumedBytes = 0;
  let reservedBytes = 0;
  const failUnstartedForAggregateLimit = () => {
    while (cursor < sources.length) {
      const index = cursor;
      cursor += 1;
      results[index] = {
        items: [],
        result: sanitizeFailure(
          sources[index],
          new FeedError("TOTAL_BODY_LIMIT", "Aggregate feed limit reached."),
        ),
      };
    }
  };
  const worker = async () => {
    while (true) {
      if (cursor >= sources.length) return;
      const availableBytes = maxTotalBytes - consumedBytes - reservedBytes;
      if (availableBytes < 1_024) {
        // Another worker owns the remaining budget. It will continue the queue
        // after refunding unused bytes; if no request is active, the hard run
        // cap cannot admit even the smallest permitted feed response.
        if (reservedBytes > 0) return;
        failUnstartedForAggregateLimit();
        return;
      }
      const index = cursor;
      cursor += 1;
      const source = sources[index];
      let reservation = Math.min(perRequestMaxBytes, availableBytes);
      reservedBytes += reservation;
      try {
        const response = await fetchFeedSource(source, { ...networkOptions, maxBytes: reservation });
        reservedBytes -= reservation;
        reservation = 0;
        consumedBytes += response.byteLength;
        const parsed = parseFeedPayload({ source, body: response.body, retrievedAt: normalizedRetrievedAt });
        if (parsed.length === 0) {
          throw new FeedError(
            "FEED_EMPTY_OR_UNPARSEABLE",
            "Feed returned no valid allowlisted entries.",
          );
        }
        const items = filterItemsToReportingWindow(parsed, window);
        results[index] = {
          items,
          result: {
            sourceId: source.id,
            publisherKey: source.publisherKey,
            status: "ok",
            code: null,
            message: null,
            itemCount: items.length,
            parsedItemCount: parsed.length,
            eligibleItemCount: items.length,
            finalUrl: response.finalUrl,
            redirects: response.redirects,
          },
        };
      } catch (error) {
        if (reservation > 0) {
          // A failed request may have consumed any portion of its body before
          // rejecting. Charge the full reservation so retries/format errors
          // can never make aggregate network use exceed the hard cap.
          reservedBytes -= reservation;
          consumedBytes += reservation;
          reservation = 0;
        }
        results[index] = { items: [], result: sanitizeFailure(source, error) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, worker));
  const items = results.flatMap((result) => result.items).sort((left, right) =>
    Date.parse(right.eligibility.instant) - Date.parse(left.eligibility.instant) ||
    left.sourceId.localeCompare(right.sourceId) || left.itemId.localeCompare(right.itemId));
  if (items.length > maxTotalItems) {
    throw new FeedError("TOTAL_ITEM_LIMIT", `Eligible feed items exceeded the ${maxTotalItems}-item run limit.`);
  }
  const sourceResults = results.map((result) => result.result);
  const parsedItemCount = sourceResults.reduce((sum, result) => sum + result.parsedItemCount, 0);
  const coverageByDesk = Object.fromEntries(FREE_DESKS.map((desk) => {
    const configuredSources = sources.filter((source) => source.coverageDesks.includes(desk));
    const configuredSourceIds = configuredSources.map((source) => source.id);
    const configuredPublisherKeys = [...new Set(configuredSources.map((source) => source.publisherKey))].sort();
    const successfulSourceIds = configuredSourceIds.filter((sourceId) =>
      sourceResults.some((result) => result.sourceId === sourceId && result.status === "ok"));
    const successfulPublisherKeys = [...new Set(configuredSources
      .filter((source) => successfulSourceIds.includes(source.id))
      .map((source) => source.publisherKey))].sort();
    const failedSourceIds = configuredSourceIds.filter((sourceId) => !successfulSourceIds.includes(sourceId));
    return [desk, {
      configuredSourceIds,
      configuredPublisherKeys,
      successfulSourceIds,
      successfulPublisherKeys,
      failedSourceIds,
      requiredPublisherCount: 2,
      status: successfulPublisherKeys.length >= 2 ? "covered" : "insufficient-corroboration",
    }];
  }));
  return {
    reportingWindow: window,
    retrievedAt: normalizedRetrievedAt,
    items,
    parsedItemCount,
    sourceResults,
    coverageByDesk,
    consumedBytes,
  };
}

export async function researchFreeEdition(options = {}) {
  const {
    sources: _ignoredSources,
    evidencePolicy = DEFAULT_FREE_EVIDENCE_POLICY,
    ...runtimeOptions
  } = options;
  const normalizedEvidencePolicy = requireEvidencePolicy(evidencePolicy);
  // The production entry point always uses the reviewed, checked-in manifest.
  // Tests can exercise custom fixtures through ingestCuratedFeeds directly.
  const ingestion = await ingestCuratedFeeds({ ...runtimeOptions, sources: FREE_FEED_SOURCES });
  assertSufficientFeedCoverage(ingestion.coverageByDesk);
  const assessments = assessFeedCandidates({
    items: ingestion.items,
    reportingWindow: ingestion.reportingWindow,
    recentArchive: options.recentArchive,
    recentRepeatHistory: options.recentRepeatHistory,
    repeatFingerprintKey: options.repeatFingerprintKey,
    minimumScore: options.minimumScore,
    minimumAuthoritativeScore: options.minimumAuthoritativeScore,
    evidencePolicy: normalizedEvidencePolicy,
  });
  const rankedCandidates = sortRankedCandidates(assessments
    .filter((assessment) => assessment.decision === "accepted")
    .map((assessment) => assessment.candidate));
  const rejectionCounts = {};
  for (const assessment of assessments) {
    for (const reason of assessment.rejectionReasons) {
      rejectionCounts[reason.code] = (rejectionCounts[reason.code] ?? 0) + 1;
    }
  }
  const selection = selectFreeDeskCandidates(rankedCandidates, {
    maxCandidatesPerDesk: options.maxCandidatesPerDesk,
    evidencePolicy: normalizedEvidencePolicy,
  });
  const candidates = Object.values(selection.desks)
    .flatMap((desk) => desk.candidates)
    .sort((left, right) =>
      right.ranking.score - left.ranking.score ||
      Date.parse(right.firstPublishedAt) - Date.parse(left.firstPublishedAt) ||
      left.canonicalEventKey.localeCompare(right.canonicalEventKey));
  return {
    reportingWindow: ingestion.reportingWindow,
    retrievedAt: ingestion.retrievedAt,
    candidates,
    ...selection,
    diagnostics: {
      sourceResults: ingestion.sourceResults,
      parsedItemCount: ingestion.parsedItemCount,
      eligibleItemCount: ingestion.items.length,
      candidateCount: candidates.length,
      rankedCandidateCount: rankedCandidates.length,
      rejectedCandidateCount: assessments.filter((assessment) =>
        assessment.decision === "rejected").length,
      rejectionCounts: Object.fromEntries(Object.entries(rejectionCounts).sort(([left], [right]) =>
        left.localeCompare(right))),
      selectedCount: selection.selectedCandidates.length,
      repeatHistoryCount: Array.isArray(options.recentRepeatHistory)
        ? options.recentRepeatHistory.length
        : 0,
      evidencePolicy: normalizedEvidencePolicy,
      coverageByDesk: ingestion.coverageByDesk,
      consumedBytes: ingestion.consumedBytes,
    },
    sourceTextTrust: "untrusted",
    citationUrlAllowlist: [...new Set(candidates.flatMap((candidate) =>
      candidate.sources.map((source) => source.url)))].sort(),
  };
}

export function assertSufficientFeedCoverage(coverageByDesk) {
  const failedDesks = FREE_DESKS.filter((desk) => coverageByDesk?.[desk]?.status !== "covered");
  if (failedDesks.length > 0) {
    const error = new FeedError(
      "DESK_COVERAGE_FAILED",
      `Fewer than two distinct reviewed feed publishers completed for: ${failedDesks
        .map((desk) => DESK_LABELS[desk]).join(", ")}.`,
    );
    error.desks = failedDesks;
    throw error;
  }
  return coverageByDesk;
}
