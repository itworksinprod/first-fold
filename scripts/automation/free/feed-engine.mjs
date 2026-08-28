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
const TRACKING_PARAMETER =
  /^(?:utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid|at_campaign|at_medium)$/i;
const SOURCE_RELATIONSHIPS = new Set(["originating", "independent", "context"]);
const ITEM_PATH_POLICIES = new Set(["append-trailing-slash"]);
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
  "announcement", "april", "august", "availability", "available", "bring", "brings",
  "antitrust", "can", "cloud", "company", "court", "critical",
  "companies", "coupon", "coupons", "cut", "data", "developer", "developers",
  "debut", "debuted", "debuts", "december", "discount", "disruption",
  "eliminate", "eliminated", "eliminates", "eliminating",
  "face", "faced", "faces", "facing",
  "back", "february", "feature", "features", "first", "fix", "fixed", "fixes",
  "flagship", "fully", "hit", "inquiries", "inquiry", "investigate", "investigated",
  "investigates", "investigating", "investigation", "introduce", "introduced",
  "introduces", "introducing", "january",
  "job", "july", "june", "launch", "launched", "lawsuit", "laying", "layoff",
  "launches", "latest", "million", "billion", "promo",
  "generally", "march", "may", "model", "models", "november", "now", "october",
  "down", "downtime", "off", "open", "opened", "opening", "opens", "outage",
  "patch", "patched", "patches", "people", "plan", "plans", "probe", "probes", "probing",
  "platform", "product",
  "out", "products", "release", "released", "releases", "report", "reported", "over",
  "reports", "research", "reduce", "reduced", "reduces", "reducing", "resolved",
  "resolves", "resolving", "restore", "restored", "restores", "restoring", "return",
  "returned", "returning", "returns", "roll", "rolled", "rolling", "rolls", "ruling",
  "said", "says", "security", "september", "shed", "shedding", "sheds",
  "service", "services", "settlement", "software", "unveil", "unveiled", "unveils",
  "vulnerability",
  "normal", "online", "operational", "study", "tech", "technology", "tool", "tools",
  "under", "update", "updated",
  "updates", "user", "users", "version", "versions",
]);

const GENERIC_EVENT_CONTEXT_TOKENS = new Set([
  "acquisition", "active", "actively", "against", "allow", "allows", "allowing", "cloud", "code",
  "back", "company", "confirm", "confirmed", "confirms", "cost", "costs", "critical",
  "customer", "customers", "deal", "division", "employee", "employees",
  "enterprise", "execution", "exploit", "exploited", "fee", "fees", "flaw",
  "global", "go", "goes", "going", "investigate", "job", "jobs", "live", "online", "price", "prices", "pricing",
  "probe", "regulatory", "remote", "restore", "retire", "restriction",
  "restrictions", "review", "role", "roles", "rule", "rules", "service",
  "staff", "startup", "store", "team", "unit", "workforce", "worker",
  "workers", "zero-day",
]);
const NON_DISTINGUISHING_SUBJECT_DETAIL_TOKENS = new Set([
  "cutting", "detailed", "frontier", "hundred", "offering", "promise", "reportedly",
  "staffer", "working",
]);
const CLAUDE_MEMORY_DETAIL_TOKENS = new Set(["chat", "paid", "past"]);
const CHATGPT_YOUNG_USERS_DETAIL_TOKENS = new Set([
  "backed", "built", "designed", "human", "learning", "less", "make",
  "protection", "safety", "teen", "younger",
]);
const LEGAL_PAYMENT_DETAIL_TOKENS = new Set(["pay", "will"]);
const PRICING_DETAIL_TOKENS = new Set(["cheaper", "percent"]);
const ACQUISITION_TARGET_NOISE_TOKENS = new Set([
  "corp", "corporation", "firm", "inc", "incorporated", "ltd", "maker",
]);
const SECURITY_IMPACT_NOISE_TOKENS = new Set([
  "allow", "allowed", "allowing", "arbitrary", "attack", "attacker", "enable",
  "enabled", "enabling", "impact", "impacted", "impacting", "permit",
  "permitted", "permitting", "remote", "system",
]);

const EVENT_ENTITY_ALIASES = Object.freeze([
  ["openai", ["OpenAI", "Open AI"]],
  ["anthropic", ["Anthropic"]],
  ["google", ["Google", "Google Chrome", "Chrome"]],
  ["microsoft", ["Microsoft", "Azure", "Visual Studio Code", "VS Code", "VSCode"]],
  ["github", ["GitHub"]],
  ["cloudflare", ["Cloudflare"]],
  ["amazon", ["Amazon", "AWS"]],
  ["apple", ["Apple"]],
  ["meta", ["Meta", "Facebook"]],
  ["mozilla", ["Mozilla"]],
  ["nvidia", ["NVIDIA"]],
  ["amd", ["AMD"]],
  ["intel", ["Intel"]],
  ["oracle", ["Oracle"]],
  ["cisa", ["CISA"]],
  ["ftc", ["FTC"]],
  ["cma", ["CMA"]],
  ["hugging-face", ["Hugging Face"]],
  ["tiktok", ["TikTok"]],
  ["gitlab", ["GitLab"]],
  ["atlassian", ["Atlassian"]],
  ["salesforce", ["Salesforce"]],
  ["slack", ["Slack"]],
  ["adobe", ["Adobe"]],
  ["zoom", ["Zoom"]],
  ["docker", ["Docker"]],
  ["ibm", ["IBM"]],
  ["xai", ["xAI"]],
  ["perplexity", ["Perplexity"]],
  ["cohere", ["Cohere"]],
  ["mistral-ai", ["Mistral AI"]],
  ["deepseek", ["DeepSeek"]],
  ["servicenow", ["ServiceNow"]],
  ["sap", ["SAP"]],
  ["cisco", ["Cisco"]],
  ["fortinet", ["Fortinet"]],
  ["palo-alto-networks", ["Palo Alto Networks", "Palo Alto"]],
  ["ivanti", ["Ivanti"]],
  ["broadcom", ["Broadcom", "VMware"]],
  ["ai2", ["Ai2", "Allen Institute for AI"]],
  ["mit", ["MIT"]],
  ["uc-berkeley", ["UC Berkeley", "Berkeley AI Research", "BAIR"]],
  ["jetbrains", ["JetBrains"]],
  ["nodejs", ["Node.js", "NodeJS"]],
  ["postman", ["Postman"]],
  ["hashicorp", ["HashiCorp"]],
  ["netlify", ["Netlify"]],
  ["papercut", ["PaperCut"]],
  ["rust", ["Rust"]],
  ["ieee", ["IEEE"]],
]);
const KNOWN_ENTITIES = EVENT_ENTITY_ALIASES.flatMap(([, aliases]) => aliases);
const KNOWN_ENTITY_TOKENS = new Set(EVENT_ENTITY_ALIASES.flatMap(([, aliases]) =>
  aliases.flatMap((entity) => entity.toLowerCase().split(/\s+/).map(normalizeEventToken))));

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
const SPONSORED_METADATA_PATTERN =
  /\b(?:sponsored feature|sponsored post|advertorial|paid content|partner content)\b/i;
const SPONSORED_PATH_PATTERN = /\/(?:sponsored|paid-content)(?:[-/]|$)/i;
const OPINION_TITLE_PATTERN = /\|\s*(?:opinion|commentary)\s*$/i;
const OPINION_CATEGORY_PATTERN = /^(?:opinion|commentary)$/i;
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
const ROUTINE_CLOUD_NOTICE_PATTERNS = [
  /\bnow supports?\b.{0,100}\b(?:amazon\s+)?(?:ec2\s+)?instance types?\b/i,
  /\b(?:is\s+)?now available\b.{0,100}\b(?:cloud\s+)?regions?\b/i,
  /\b(?:availability|service)\b.{0,80}\b(?:expands?|expanded|expansion)\b.{0,60}\b(?:cloud\s+)?regions?\b/i,
  /\b(?:expands?|expanded|expansion)\b.{0,80}\b(?:availability|service)\b.{0,60}\b(?:cloud\s+)?regions?\b/i,
];
const BROAD_IMPACT_TITLE_PATTERNS = [
  /\b(?:actively exploited|zero-day|0-day|breach|ransomware|critical vulnerability|emergency patch)\b/i,
  /\b(?:major outage|shutdown|recall|antitrust ruling|court ruling|new law|new regulation|regulatory mandate)\b/i,
  /\b(?:all customers|all users|worldwide|global rollout|globally available)\b/i,
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
  if (
    source.itemPathPolicy === "append-trailing-slash" &&
    resolved.pathname !== "/" &&
    !resolved.pathname.endsWith("/")
  ) {
    // Some reviewed feeds publish a redirecting form of their own canonical
    // article path. Apply only the source-owned, checked-in path policy before
    // fingerprinting and source binding so final newsroom QA can keep its
    // strict zero-redirect contract.
    resolved.pathname = `${resolved.pathname}/`;
  }
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
  if (
    source.itemPathPolicy !== undefined &&
    !ITEM_PATH_POLICIES.has(source.itemPathPolicy)
  ) {
    throw new Error(`Feed source ${source.id} has an unsupported item path policy.`);
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

function normalizeEventText(value, maxLength = 2_000) {
  return cleanText(value, maxLength)
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-");
}

function tokenize(value) {
  return normalizeEventText(value)
    .replace(/\bnode\.js\b/gi, "nodejs")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function normalizeEventToken(token) {
  const aliases = {
    application: "app",
    applications: "app",
    children: "child",
    cuts: "cut",
    layoffs: "layoff",
    laid: "layoff",
    lays: "layoff",
    remembered: "memory",
    remembering: "memory",
    remembers: "memory",
    remember: "memory",
  };
  if (aliases[token]) return aliases[token];
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("s") && !/(?:ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

function meaningfulTitleTokenSet(item) {
  return new Set(tokenize(item.title)
    .filter((token) => !EVENT_MATCH_STOP_WORDS.has(token))
    .map(normalizeEventToken)
    .flatMap((token) =>
      token.includes("-") && !GENERIC_EVENT_CONTEXT_TOKENS.has(token)
        ? [token, ...token.split("-")]
        : [token])
    // A bare four-digit number in a headline is overwhelmingly a calendar
    // year. It can improve neither overlap nor anchoring: otherwise unrelated
    // monthly patch roundups can corroborate each other merely via "2026".
    // Structured CVE/GHSA identifiers remain available through strongIdentifiers.
    .filter((token) => token.length > 1 && !/^\d{4}$/.test(token) && !EVENT_MATCH_STOP_WORDS.has(token)));
}

function productIdentifiers(item) {
  const normalizedTitle = normalizeEventText(item.title, 240);
  const title = normalizedTitle.toLowerCase();
  const identifiers = title.match(
    /\b(?:gpt|claude|gemini|llama|mistral|deepseek|grok)[\s-]?\d+(?:\.\d+)*(?:[\s-](?:flash|haiku|max|mini|opus|pro|sonnet|ultra))?\b/g,
  ) ?? [];
  const products = new Set(identifiers.map((value) =>
    `model:${value.replace(/\s+/g, "-").replace(/--+/g, "-")}`));
  for (const match of title.matchAll(/\bo[134](?:[\s-]?(?:pro|mini))?\b/g)) {
    products.add(`model:${match[0].replace(/\s+/g, "-")}`);
  }
  const namedProducts = [
    [/\bclaude[\s-]+code\b/g, "claude-code"],
    [/\bclaude\b/g, "claude"],
    [/\b(?:github[\s-]+)?copilot[\s-]+coding[\s-]+agent\b/g, "github-copilot-coding-agent"],
    [/\bcopilot[\s-]+spaces\b/g, "copilot-spaces"],
    [/\bgemini[\s-]+code[\s-]+assist\b/g, "gemini-code-assist"],
    [/\bchrome\b/g, "chrome"],
    [/\bandroid\b/g, "android"],
    [/\bwindows\b/g, "windows"],
    [/\bfirefox\b/g, "firefox"],
    [/\bgemini\b/g, "gemini"],
    [/\bazure\b/g, "azure"],
    [/\b(?:aws[\s-]+)?glue\b/g, "aws-glue"],
    [/\b(?:aws[\s-]+)?lambda\b/g, "aws-lambda"],
    [/\bazure[\s-]+devops\b/g, "azure-devops"],
    [/\bxbox\b/g, "xbox"],
    [/\bgithub[\s-]+actions\b/g, "github-actions"],
    [/\bgithub[\s-]+codespaces\b/g, "github-codespaces"],
    [/\bgithub[\s-]+projects\b/g, "github-projects"],
    [/\bwhatsapp\b/g, "whatsapp"],
    [/\binstagram\b/g, "instagram"],
    [/\bslack\b/g, "slack"],
    [/\btableau\b/g, "tableau"],
    [/\bgoogle[\s-]+docs\b/g, "google-docs"],
    [/\bgoogle[\s-]+sheets\b/g, "google-sheets"],
    [/\b(?:aws[\s-]+)?ec2\b/g, "aws-ec2"],
    [/\b(?:aws[\s-]+)?s3\b/g, "aws-s3"],
    [/\b(?:aws[\s-]+)?redshift\b/g, "aws-redshift"],
    [/\b(?:aws[\s-]+)?dynamodb\b/g, "aws-dynamodb"],
    [/\bgoogle[\s-]+workspace\b/g, "google-workspace"],
    [/\bvisual[\s-]+studio[\s-]+code\b/g, "visual-studio-code"],
    [/\bnode(?:\.js|js)\b/g, "nodejs"],
    [/\bios\b/g, "ios"],
    [/\bchatgpt\b/g, "chatgpt"],
    [/\bpapercut\b/g, "papercut"],
  ];
  for (const [pattern, identifier] of namedProducts) {
    if (pattern.test(title)) products.add(`named:${identifier}`);
  }
  const googleContext = /\bgoogle\b/i.test(title) || canonicalEntityAlias(item.primaryEntity) === "google";
  if (googleContext && /\bdocs\b/i.test(title)) products.add("named:google-docs");
  if (googleContext && /\bsheets\b/i.test(title)) products.add("named:google-sheets");
  if (googleContext && /\bworkspace\b/i.test(title)) products.add("named:google-workspace");
  if (googleContext && /\bgmail\b/i.test(title)) products.add("named:google-gmail");
  if (googleContext && /\bcalendar\b/i.test(title)) products.add("named:google-calendar");
  if (googleContext && /\bmeet\b/i.test(title)) products.add("named:google-meet");
  if (googleContext && /\bchat\b/i.test(title)) products.add("named:google-chat");
  const acronymNoise = new Set([
    "AI", "API", "AWS", "CISA", "CMA", "CVE", "EU", "FTC", "GA", "GHSA",
    "GPT", "LLM", "RCE", "RSS", "UK", "US", "USD", "EUR", "GBP",
  ]);
  for (const match of normalizedTitle.matchAll(/\b[A-Z][A-Z0-9]{1,9}\b/g)) {
    if (!acronymNoise.has(match[0])) {
      const acronym = /^(?:SMB|SME)$/.test(match[0]) ? "smb-sme" : match[0].toLowerCase();
      products.add(`acronym:${acronym}`);
    }
  }
  const featureProducts = [
    [/\bchatgpt\s+tasks\b/g, "chatgpt-tasks"],
    [/\bchatgpt\s+projects\b/g, "chatgpt-projects"],
    [/\bclaude\s+projects\b/g, "claude-projects"],
    [/\bclaude\b[^.!?]{0,40}\b(?:memory|remember(?:ed|ing|s)?)\b|\b(?:memory|remember(?:ed|ing|s)?)\b[^.!?]{0,40}\bclaude\b/g, "claude-memory"],
    [/\b(?:chatgpt\s+)?study\s+mode\b/g, "chatgpt-study-mode"],
    [/\b(?:chatgpt\s+)?voice\s+mode\b/g, "chatgpt-voice-mode"],
    [/\bchatgpt\s+canvas\b|\bcanvas\s+in\s+chatgpt\b/g, "chatgpt-canvas"],
    [/\bchatgpt\s+agent\b|\bagent\s+(?:mode\s+)?in\s+chatgpt\b/g, "chatgpt-agent"],
    [/\bchatgpt\s+search\b|\bsearch\s+in\s+chatgpt\b/g, "chatgpt-search"],
    [/\b(?:chatgpt\s+)?learn\s+mode\b/g, "chatgpt-learn-mode"],
    [/\bmanifest\s+v?2\b/g, "chrome-manifest-v2"],
    [/\bchrome\s+sync\b/g, "chrome-sync"],
  ];
  for (const [pattern, identifier] of featureProducts) {
    if (pattern.test(title)) products.add(`feature:${identifier}`);
  }
  if (
    products.has("named:chatgpt") &&
    /\b(?:teen|teens|teenager|teenagers|younger\s+(?:people|users)|young\s+(?:people|users))\b/i.test(title)
  ) products.add("feature:chatgpt-young-users");
  const unitProducts = [
    [/\blinkedin\b/g, "linkedin"],
    [/\bnuance\b/g, "nuance"],
  ];
  for (const [pattern, identifier] of unitProducts) {
    if (pattern.test(title)) products.add(`unit:${identifier}`);
  }
  const componentProducts = [
    [/\bwebrtc\b/g, "webrtc"],
    [/\bv8\b/g, "v8"],
    [/\bkernel\b/g, "kernel"],
    [/\bframework\b/g, "framework"],
    [/\bbrowsers?\b/g, "browser"],
    [/\bpapercut\s+(?:ng\s*\/\s*mf|ng\s+and\s+mf|ng|mf)\b/g, "papercut-ng-mf"],
    [/\bpapercut\s+mobility\s+print\b/g, "papercut-mobility-print"],
  ];
  for (const [pattern, identifier] of componentProducts) {
    if (pattern.test(title)) products.add(`component:${identifier}`);
  }
  if ([...products].some((identifier) => identifier.startsWith("model:"))) {
    if (/\bapi\b/i.test(title)) products.add("channel:api");
    if (/\bchatgpt\b/i.test(title)) products.add("channel:chatgpt");
  }
  const softwareVersions = [
    [/\bchrome\s+(?:version\s+|v)?(\d+(?:\.\d+){0,3})\b/gi, "chrome"],
    [/\bfirefox\s+(?:version\s+|v)?(\d+(?:\.\d+){0,3})\b/gi, "firefox"],
    [/\bwindows\s+(?:version\s+|v)?(\d+(?:\.\d+){0,3})\b/gi, "windows"],
    [/\bandroid\s+(?:version\s+|v)?(\d+(?:\.\d+){0,3})\b/gi, "android"],
    [/\b(?:ios|ipados|macos)\s+(?:version\s+|v)?(\d+(?:\.\d+){0,3})\b/gi, "apple-os"],
    [/\bnode(?:\.js|js)\s+(?:version\s+|v)?(\d+(?:\.\d+){0,3})\b/gi, "nodejs"],
    [/\b(?:visual studio code|vs code|vscode)\s+(?:version\s+)?(\d+(?:\.\d+){0,3})\b/gi, "visual-studio-code"],
  ];
  for (const [pattern, product] of softwareVersions) {
    for (const match of title.matchAll(pattern)) products.add(`version:${product}:${match[1]}`);
  }
  for (const match of title.matchAll(/\bwindows\s+\d+(?:\.\d+)?\s+(\d{2}h[12])\b/gi)) {
    products.add(`channel:windows-servicing:${match[1].toLowerCase()}`);
  }
  for (const match of title.matchAll(/\b(?:ios|ipados|macos)\s+\d+(?:\.\d+){0,3}\s+beta\s+(\d+)\b/gi)) {
    products.add(`channel:apple-os-beta:${match[1]}`);
  }
  return products;
}

function identifiersWithPrefix(identifiers, prefix) {
  return new Set([...identifiers].filter((identifier) => identifier.startsWith(prefix)));
}

function identifiersConflict(left, right) {
  for (const prefix of ["channel:", "feature:", "unit:"]) {
    const leftTyped = identifiersWithPrefix(left, prefix);
    const rightTyped = identifiersWithPrefix(right, prefix);
    if ((leftTyped.size > 0 || rightTyped.size > 0) && setIntersection(leftTyped, rightTyped).size === 0) {
      return true;
    }
  }
  const leftComponents = identifiersWithPrefix(left, "component:");
  const rightComponents = identifiersWithPrefix(right, "component:");
  if (
    leftComponents.size > 0 &&
    rightComponents.size > 0 &&
    setIntersection(leftComponents, rightComponents).size === 0
  ) return true;
  const leftAcronyms = identifiersWithPrefix(left, "acronym:");
  const rightAcronyms = identifiersWithPrefix(right, "acronym:");
  if (
    leftAcronyms.size > 0 &&
    rightAcronyms.size > 0 &&
    setIntersection(leftAcronyms, rightAcronyms).size === 0
  ) return true;
  const parentProducts = new Set(["named:chatgpt", "named:claude"]);
  const leftSpecific = new Set([...left].filter((identifier) =>
    identifier.startsWith("named:") && !parentProducts.has(identifier)));
  const rightSpecific = new Set([...right].filter((identifier) =>
    identifier.startsWith("named:") && !parentProducts.has(identifier)));
  return (leftSpecific.size > 0 || rightSpecific.size > 0) &&
    setIntersection(leftSpecific, rightSpecific).size === 0;
}

function eventActionFamilies(item) {
  const title = normalizeEventText(item.title, 240);
  const families = new Set();
  if (
    /\b(?:announce(?:d|s)?|debut(?:ed|s|ing)?|flagship|introduc(?:e|ed|es|ing)|launch(?:ed|es|ing)?|releas(?:e|ed|es|ing)|ship(?:ped|s|ping)?|unveil(?:ed|s|ing)?)\b/i.test(title) ||
    /\broll(?:ed|s|ing)?\s+out\b/i.test(title) ||
    /\b(?:general(?:ly)?\s+availab(?:ility|le)|now\s+available|goes?\s+live)\b/i.test(title) ||
    /\breach(?:ed|es|ing)?\s+(?:general availability|ga|the\s+(?:api|web)|developers?|users?|customers?)\b/i.test(title)
  ) {
    families.add("release");
  }
  if (
    /\b(?:disruption|downtime|offline|outage|service interruption|unavailable)\b/i.test(title) ||
    /\b(?:api|network|platform|service|site)\s+(?:is\s+)?down\b/i.test(title) ||
    /\b(?:recover(?:ed|s|ing)?|restor(?:e|ed|es|ing))\b[^.!?]{0,35}\b(?:availability|outage|service)\b/i.test(title) ||
    /\b(?:availability|network|platform|service|site)\b[^.!?]{0,35}\b(?:back\s+(?:online|up)|return(?:ed|s|ing)?\s+to\s+normal)\b/i.test(title)
  ) families.add("outage");
  if (
    /\b(?:layoff|layoffs|lay(?:s|ing)?\s+off|job\s+cuts?|workforce reduction|staff reduction)\b/i.test(title) ||
    /\bcut(?:s|ting)?(?:\s+[a-z0-9-]+){0,4}\s+(?:employees?|jobs|roles|staff|staffers?|workers?)\b/i.test(title) ||
    /\b(?:eliminat(?:e|ed|es|ing)|reduc(?:e|ed|es|ing)|shed(?:s|ding)?)\b[^.!?]{0,45}\b(?:employees?|jobs|roles|staff|workforce|workers?)\b/i.test(title)
  ) {
    families.add("layoff");
  }
  if (/\b(?:creat(?:e|ed|es|ing)|hir(?:e|ed|es|ing)|recruit(?:ed|s|ing)?|adds?)\b[^.!?]{0,35}\b(?:employees?|jobs?|positions?|roles?|staff|workers?)\b/i.test(title)) {
    families.add("hiring");
  }
  if (
    /\b(?:acquisition|acquir(?:e|ed|es|ing)|buy(?:s|ing)?|bought|merg(?:e|ed|es|ing|er)|purchas(?:e|ed|es|ing)|takeover)\b/i.test(title) ||
    /\b(?:tak(?:e|es|ing)|took)\s+over\b/i.test(title) ||
    /\b(?:bid|offer)\s+for\b/i.test(title)
  ) families.add("acquisition");
  if (/\b(?:accus(?:e|ed|es|ing)|alleg(?:e|ed|es|ing)|antitrust|case|charg(?:e|ed|es|ing)|complaint|court|fine(?:d|s|ing)?|lawsuit|legal\s+action|penalt(?:y|ies)|penaliz(?:e|ed|es|ing)|rulings?|sanction(?:ed|s|ing)?|settlement|suit|sue|sued|sues|suing)\b/i.test(title)) {
    families.add("legal");
  }
  if (
    /\b(?:advisory|fix(?:ed|es)?|patch(?:ed|es)?|remediat(?:e|ed|es|ing)|vulnerabilit(?:y|ies))\b/i.test(title) ||
    /\b(?:clos(?:e|ed|es|ing)|resolv(?:e|ed|es|ing))\b[^.!?]{0,35}\b(?:bug|cve|flaw|vulnerabilit(?:y|ies))\b/i.test(title)
  ) families.add("security-fix");
  if (
    /\b(?:inquiry|investigat(?:e|ed|es|ing|ion)|probe|probes|probing)\b/i.test(title) ||
    /\bunder\b[^.!?]{0,35}\binvestigation\b/i.test(title) ||
    /\bfaces?\b[^.!?]{0,35}\bprobe\b/i.test(title)
  ) {
    families.add("investigation");
  }
  if (
    /\b(?:cheaper|price reduction|pricing reduction)\b/i.test(title) ||
    /\b(?:cut|cuts|cutting|lower|lowers|lowered|lowering|reduce|reduces|reduced|reducing)\b[^.!?]{0,35}\b(?:cost|costs|fee|fees|price|prices|pricing)\b/i.test(title) ||
    /\b(?:cost|costs|fee|fees|price|prices|pricing)\b[^.!?]{0,25}\b(?:down|lower)\b/i.test(title)
  ) families.add("pricing-decrease");
  if (
    /\b(?:increase|increases|increased|increasing|raise|raises|raised|raising|higher)\b[^.!?]{0,35}\b(?:cost|costs|fee|fees|price|prices|pricing)\b/i.test(title) ||
    /\b(?:cost|costs|fee|fees|price|prices|pricing)\b[^.!?]{0,25}\b(?:higher|up)\b/i.test(title)
  ) families.add("pricing-increase");
  if (/\b(?:deprecat(?:e|ed|es|ing)|discontinu(?:e|ed|es|ing)|retir(?:e|ed|es|ing)|sunset(?:s|ted|ting)?|shut(?:s|ting)?\s+down)\b/i.test(title)) {
    families.add("termination");
  }
  return families;
}

function eventArtifactFamilies(item) {
  const title = normalizeEventText(item.title, 240);
  const families = new Set();
  if (/\b(?:model|system|safety)\s+(?:card|report)\b|\bsafety\s+evaluation\b/i.test(title)) {
    families.add("safety-artifact");
  }
  if (/\b(?:benchmark|research paper|technical paper|white paper)\b/i.test(title)) {
    families.add("research-artifact");
  }
  return families;
}

function eventObjectKinds(item) {
  const title = normalizeEventText(item.title, 240);
  const documentTitle = title.replace(/\bstudy\s+mode\b/gi, "");
  const kinds = new Set();
  const objectPatterns = [
    [/\badvis(?:ory|ories)\b/i, "advisory"],
    [/\b(?:analys(?:is|es)|assessments?|evaluations?)\b/i, "analysis"],
    [/\bbenchmarks?\b/i, "benchmark"],
    [/\b(?:model|safety|system)\s+cards?\b/i, "card"],
    [/\breports?\b/i, "report"],
    [/\bresearch\b/i, "research"],
    [/\b(?:papers?|stud(?:y|ies)|whitepapers?)\b/i, "study"],
    [/\b(?:apps?|applications?)\b/i, "app"],
    [/\bapis?\b/i, "api"],
    [/\bextensions?\b/i, "extension"],
    [/\bplugins?\b/i, "plugin"],
    [/\bmodels?\b/i, "model"],
    [/\b(?:chips?|processors?|semiconductors?)\b/i, "processor"],
    [/\baccelerators?\b/i, "accelerator"],
    [/\b(?:devices?|hardware)\b/i, "hardware"],
    [/\balgorithms?\b/i, "algorithm"],
    [/\bcompilers?\b/i, "compiler"],
    [/\bdecoders?\b/i, "decoder"],
    [/\bframeworks?\b/i, "framework"],
    [/\blibraries?\b/i, "library"],
    [/\bruntimes?\b/i, "runtime"],
    [/\bsdks?\b/i, "sdk"],
    [/\btools?\b/i, "tool"],
    [/\bplatforms?\b/i, "platform"],
    [/\bservices?\b/i, "service"],
    [/\bsoftware\b/i, "software"],
    [/\bfeatures?\b/i, "feature"],
    [/\bproducts?\b/i, "product"],
    [/\bdata\b/i, "data"],
    [/\bdatasets?\b/i, "dataset"],
    [/\broadmaps?\b/i, "roadmap"],
    [/\bsystems?\b/i, "system"],
    [/\b(?:flaws?|vulnerabilit(?:y|ies))\b/i, "vulnerability"],
    [/\b(?:disruptions?|downtime|outages?)\b/i, "outage"],
  ];
  for (const [pattern, kind] of objectPatterns) {
    if (pattern.test(documentTitle)) kinds.add(kind);
  }
  // These generic nouns are removed from fuzzy subject overlap, but when no
  // concrete object is named they still distinguish different events.
  if (kinds.size === 0) {
    if (/\bupdates?\b/i.test(documentTitle)) kinds.add("update");
    else if (/\bplans?\b/i.test(documentTitle)) kinds.add("plan");
    else if (/\bannouncements?\b/i.test(documentTitle)) kinds.add("announcement");
    else if (/\bavailability\b/i.test(documentTitle)) kinds.add("availability");
    else if (/\brulings?\b/i.test(documentTitle)) kinds.add("legal-decision");
  }
  return kinds;
}

function eventLifecycleFamilies(item) {
  const title = normalizeEventText(item.title, 240);
  const families = new Set();
  if (/\b(?:investigat(?:e|ed|es|ing|ion)|open(?:ed|s|ing)?\s+(?:an?\s+)?(?:inquiry|probe)|probe|probes|probing)\b/i.test(title)) {
    families.add("investigation");
  }
  if (/\b(?:approv(?:e|ed|es|ing|al)|authoriz(?:e|ed|es|ing)|clear(?:ed|s|ing)|greenlight(?:ed|s|ing)?)\b/i.test(title)) {
    families.add("approval");
  }
  if (/\b(?:block(?:ed|s|ing)?|prohibit(?:ed|s|ing)?|veto(?:ed|es|ing)?)\b/i.test(title)) {
    families.add("blocked");
  }
  if (/\b(?:dismiss(?:ed|es|ing)?|toss(?:ed|es|ing)?(?:\s+out)?|throw(?:s|ing)?\s+out|threw\s+out)\b[^.!?]{0,35}\b(?:case|complaint|lawsuit)\b/i.test(title)) {
    families.add("dismissed");
  }
  if (
    /\b(?:file(?:d|s|ing)?|bring(?:s|ing)?|brought|lodg(?:e|ed|es|ing)|tak(?:e|es|ing)|took)\b[^.!?]{0,40}\b(?:case|complaint|lawsuit|legal\s+action|suit)\b/i.test(title) ||
    /\b(?:sue(?:d|s)?|suing)\b/i.test(title) ||
    /^[^.!?]+[’']?s?\s+(?:(?:[a-z0-9-]+)\s+){0,3}(?:complaint|lawsuit|suit)\s+against\b/i.test(title) ||
    /\bfaces?\s+(?:an?\s+)?(?:complaint|lawsuit|legal\s+action|suit)\s+from\b/i.test(title)
  ) {
    families.add("filed");
  }
  if (/\bsettlement\b|\b(?:resolv(?:e|ed|es|ing)|settle(?:d|s|ment|ments|ing))\b[^.!?]{0,35}\b(?:case|complaint|dispute|lawsuit|suit)\b|\b(?:case|complaint|dispute|lawsuit|suit)\b[^.!?]{0,35}\bsettle(?:d|s|ment|ments|ing)\b/i.test(title)) {
    families.add("settled");
  }
  return families;
}

function eventFacetFamilies(item) {
  const title = normalizeEventText(item.title, 240);
  const families = new Set();
  if (/\b(?:data\s+)?retention\b|\b(?:retain|retains|retained|retaining)\s+(?:customer|enterprise|user|workspace)?\s*data\b/i.test(title)) {
    families.add("retention");
  }
  if (/\b(?:price|prices|pricing|subscription cost|usage cost)\b/i.test(title)) {
    families.add("pricing");
  }
  return families;
}

function canonicalDecimal(value) {
  const cleaned = String(value ?? "").replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const [wholePart, fractionPart = ""] = cleaned.split(".");
  const whole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionPart.replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function scaledNumericValue(value, unit) {
  const normalized = canonicalDecimal(value);
  if (normalized === null) return null;
  const multiplier = {
    "": 1,
    k: 1_000,
    thousand: 1_000,
    m: 1_000_000,
    million: 1_000_000,
    b: 1_000_000_000,
    bn: 1_000_000_000,
    billion: 1_000_000_000,
    t: 1_000_000_000_000,
    tn: 1_000_000_000_000,
    trillion: 1_000_000_000_000,
  }[String(unit ?? "").toLowerCase()];
  if (!multiplier) return null;
  const scaled = Number(normalized) * multiplier;
  return Number.isSafeInteger(scaled) ? String(scaled) : `${normalized}:${multiplier}`;
}

function numericEventAnchors(item) {
  const title = normalizeEventText(item.title, 240);
  const anchors = new Map([
    ["currency-usd", new Set()],
    ["currency-eur", new Set()],
    ["currency-gbp", new Set()],
    ["percent", new Set()],
    ["percentage-point", new Set()],
    ["basis-point", new Set()],
    ["headcount", new Set()],
  ]);
  const writtenValues = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  for (const match of title.matchAll(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|k|m|bn|b|tn|t)?\b/gi)) {
    const value = scaledNumericValue(match[1], match[2]);
    if (value !== null) anchors.get("currency-usd").add(value);
  }
  for (const [kind, pattern] of [
    ["currency-eur", /€\s*(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|k|m|bn|b|tn|t)?\b/gi],
    ["currency-gbp", /£\s*(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|k|m|bn|b|tn|t)?\b/gi],
  ]) {
    for (const match of title.matchAll(pattern)) {
      const value = scaledNumericValue(match[1], match[2]);
      if (value !== null) anchors.get(kind).add(value);
    }
  }
  for (const [kind, pattern] of [
    ["currency-usd", /\bUSD\s*(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|k|m|bn|b|tn|t)?\b/gi],
    ["currency-eur", /\bEUR\s*(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|k|m|bn|b|tn|t)?\b/gi],
    ["currency-gbp", /\bGBP\s*(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|k|m|bn|b|tn|t)?\b/gi],
  ]) {
    for (const match of title.matchAll(pattern)) {
      const value = scaledNumericValue(match[1], match[2]);
      if (value !== null) anchors.get(kind).add(value);
    }
  }
  for (const match of title.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(thousand|million|billion|trillion)?\s*(dollars?|euros?|pounds?)\b/gi)) {
    const unit = match[3].toLowerCase();
    const kind = unit.startsWith("dollar")
      ? "currency-usd"
      : unit.startsWith("euro")
        ? "currency-eur"
        : "currency-gbp";
    const value = scaledNumericValue(String(writtenValues[match[1].toLowerCase()]), match[2]);
    if (value !== null) anchors.get(kind).add(value);
  }
  for (const [kind, pattern] of [
    ["currency-usd", /\b(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|k|m|bn|b|tn|t)?\s*(?:u\.?s\.?\s+)?dollars?\b/gi],
    ["currency-eur", /\b(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|k|m|bn|b|tn|t)?\s*euros?\b/gi],
    ["currency-gbp", /\b(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|k|m|bn|b|tn|t)?\s*(?:british\s+)?pounds?\b/gi],
  ]) {
    for (const match of title.matchAll(pattern)) {
      const value = scaledNumericValue(match[1], match[2]);
      if (value !== null) anchors.get(kind).add(value);
    }
  }
  for (const match of title.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s*percentage\s+points?\b/gi)) {
    const value = canonicalDecimal(match[1]);
    if (value !== null) anchors.get("percentage-point").add(value);
  }
  for (const match of title.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s*basis\s+points?\b/gi)) {
    const value = canonicalDecimal(match[1]);
    if (value !== null) anchors.get("basis-point").add(value);
  }
  for (const match of title.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s*(?:%(?!\w)|pct\.?\b|percent\b|per\s+cent\b)/gi)) {
    const value = canonicalDecimal(match[1]);
    if (value !== null) anchors.get("percent").add(value);
  }
  const headcountPattern = /\b(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|k|m)?(?![\d,.])\s+(?!percent\b)(?:(?:[a-z][a-z-]*)\s+){0,2}(?:employees?|jobs?|people|positions?|posts?|roles?|staff(?:ers)?|workers?)\b/gi;
  for (const match of title.matchAll(headcountPattern)) {
    const value = scaledNumericValue(match[1], match[2]);
    if (value !== null) anchors.get("headcount").add(value);
  }
  const writtenHeadcountPattern = /\b(one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+(hundred|thousand))?\s+(?:(?:[a-z][a-z-]*)\s+){0,3}(?:employees?|jobs?|people|positions?|posts?|roles?|staff(?:ers)?|workers?)\b/gi;
  for (const match of title.matchAll(writtenHeadcountPattern)) {
    const base = writtenValues[match[1].toLowerCase()];
    const multiplier = match[2]?.toLowerCase() === "hundred"
      ? 100
      : match[2]?.toLowerCase() === "thousand"
        ? 1_000
        : 1;
    anchors.get("headcount").add(String(base * multiplier));
  }
  return anchors;
}

function flattenedNumericAnchors(item) {
  const flattened = new Set();
  for (const [kind, values] of numericEventAnchors(item)) {
    for (const value of values) flattened.add(`${kind}:${value}`);
  }
  return flattened;
}

function setIntersection(left, right) {
  return new Set([...left].filter((value) => right.has(value)));
}

function setsEqual(left, right) {
  return left.size === right.size && [...left].every((token) => right.has(token));
}

function subjectDetailsCompatible(left, right, additionalAllowed = new Set()) {
  const unmatched = (source, target) => new Set([...source].filter((token) =>
    !target.has(token) &&
    !(token.includes("-") && token.split("-").every((part) => target.has(part)))));
  const leftOnly = unmatched(left, right);
  const rightOnly = unmatched(right, left);
  return [...leftOnly, ...rightOnly].every((token) =>
    NON_DISTINGUISHING_SUBJECT_DETAIL_TOKENS.has(token) || additionalAllowed.has(token));
}

function numericAnchorsConflict(left, right) {
  for (const [kind, leftValues] of left) {
    const rightValues = right.get(kind);
    if (leftValues.size > 0 && rightValues?.size > 0 && setIntersection(leftValues, rightValues).size === 0) {
      return true;
    }
  }
  const leftKinds = new Set([...left]
    .filter(([, values]) => values.size > 0)
    .map(([kind]) => kind));
  const rightKinds = new Set([...right]
    .filter(([, values]) => values.size > 0)
    .map(([kind]) => kind));
  if (
    leftKinds.size > 0 &&
    rightKinds.size > 0 &&
    setIntersection(leftKinds, rightKinds).size === 0
  ) return true;
  const leftCurrencies = new Set([...left]
    .filter(([kind]) => kind.startsWith("currency-"))
    .flatMap(([kind, values]) => [...values].map((value) => `${kind}:${value}`)));
  const rightCurrencies = new Set([...right]
    .filter(([kind]) => kind.startsWith("currency-"))
    .flatMap(([kind, values]) => [...values].map((value) => `${kind}:${value}`)));
  if (
    leftCurrencies.size > 0 &&
    rightCurrencies.size > 0 &&
    setIntersection(leftCurrencies, rightCurrencies).size === 0
  ) return true;
  return false;
}

function eventNumericRoleAnchors(item) {
  const title = normalizeEventText(item.title, 240);
  const anchors = new Map([
    ["deal-offer", new Set()],
    ["workforce-change", new Set()],
  ]);
  const currencyAmount = String.raw`(?:(?:[$€£]\s*|(?:USD|EUR|GBP)\s*)\d[\d,]*(?:\.\d+)?\s*(?:thousand|million|billion|trillion|k|m|bn|b|tn|t)?)`;
  const bidPatterns = [
    new RegExp(`${currencyAmount}\\s+(?:bid|offer)\\b`, "gi"),
    new RegExp(`\\b(?:bid|offer)\\b[^.!?]{0,18}\\b(?:of|worth|for)?\\s*${currencyAmount}`, "gi"),
  ];
  for (const pattern of bidPatterns) {
    for (const match of title.matchAll(pattern)) {
      for (const anchor of flattenedNumericAnchors({ title: match[0] })) {
        if (anchor.startsWith("currency-")) anchors.get("deal-offer").add(anchor);
      }
    }
  }
  const workforceChange = /\b(?:cut(?:s|ting)?|eliminat(?:e|ed|es|ing)|lay(?:s|ing)?\s+off|laid\s+off|reduc(?:e|ed|es|ing)|shed(?:s|ding)?)\s+(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|k|m)?\b/gi;
  for (const match of title.matchAll(workforceChange)) {
    const value = scaledNumericValue(match[1], match[2]);
    if (value !== null) anchors.get("workforce-change").add(value);
  }
  return anchors;
}

function eventNumericRolesConflict(left, right) {
  for (const [role, leftValues] of left) {
    const rightValues = right.get(role);
    if (
      leftValues.size > 0 &&
      rightValues?.size > 0 &&
      setIntersection(leftValues, rightValues).size === 0
    ) return true;
  }
  return false;
}

function productSurfaceTokenSet(item) {
  const tokens = new Set();
  const identifiers = productIdentifiers(item);
  for (const identifier of identifiers) {
    const surface = identifier.slice(identifier.indexOf(":") + 1);
    for (const variant of [surface, surface.replace(/-/g, " ")]) {
      for (const token of tokenize(variant).map(normalizeEventToken)) tokens.add(token);
    }
  }
  if ([...identifiers].some((identifier) =>
    identifier === "named:nodejs" || identifier.startsWith("version:nodejs:"))) {
    tokens.add("node");
    tokens.add("js");
    tokens.add("nodejs");
  }
  return tokens;
}

function lexicalEventTokenSet(item) {
  const productTokens = productSurfaceTokenSet(item);
  return new Set([...meaningfulTitleTokenSet(item)].filter((token) =>
    !KNOWN_ENTITY_TOKENS.has(token) &&
    !productTokens.has(token) &&
    !/^\d+(?:[.,]\d+)*(?:k|m|bn|b|tn|t)?$/i.test(token)));
}

function subjectEventTokenSet(item) {
  const securityFix = eventActionFamilies(item).has("security-fix");
  return new Set([...lexicalEventTokenSet(item)].filter((token) =>
    !GENERIC_EVENT_CONTEXT_TOKENS.has(token) &&
    !(securityFix && SECURITY_IMPACT_NOISE_TOKENS.has(token))));
}

function normalizedEntityName(value) {
  return normalizeEventText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalEntityAlias(value) {
  const normalized = normalizedEntityName(value);
  if (!normalized) return null;
  for (const [key, aliases] of EVENT_ENTITY_ALIASES) {
    if (aliases.some((alias) => normalizedEntityName(alias) === normalized)) return key;
  }
  return null;
}

function eventTitleTokenSet(item) {
  return new Set([
    ...lexicalEventTokenSet(item),
    ...[...productIdentifiers(item)].map((identifier) => `product:${identifier}`),
    ...[...flattenedNumericAnchors(item)].map((anchor) => `number:${anchor}`),
  ]);
}

function jaccard(left, right) {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function strongIdentifiersForText(value) {
  const identifiers = normalizeEventText(value).match(/\b(?:CVE-\d{4}-\d{4,}|GHSA-[a-z0-9-]{8,})\b/gi) ?? [];
  return new Set(identifiers.map((identifier) => identifier.toLowerCase()));
}

function strongIdentifiers(item) {
  return strongIdentifiersForText(`${item.title ?? ""} ${item.summary ?? ""}`);
}

function titleStrongIdentifiers(item) {
  return strongIdentifiersForText(item.title ?? "");
}

function titleEntityKeys(item) {
  const title = normalizeEventText(item.title, 240);
  const keys = new Set(EVENT_ENTITY_ALIASES.flatMap(([key, aliases]) => {
    const matched = aliases.some((entity) => {
      const expression = entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      return new RegExp(`\\b${expression}\\b`, "i").test(title);
    });
    return matched ? [key] : [];
  }));
  if (item.relationship === "originating") {
    const primaryKey = canonicalEntityAlias(item.primaryEntity);
    if (primaryKey) keys.add(primaryKey);
  }
  return keys;
}

function titleEntityMentions(item) {
  const title = normalizeEventText(item.title, 240);
  const mentions = [];
  for (const [key, aliases] of EVENT_ENTITY_ALIASES) {
    for (const entity of aliases) {
      const expression = entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      for (const match of title.matchAll(new RegExp(`\\b${expression}\\b`, "gi"))) {
        mentions.push({ key, start: match.index, end: match.index + match[0].length });
      }
    }
  }
  return mentions.sort((left, right) => left.start - right.start || right.end - left.end);
}

function legalRoleAnchor(item) {
  const title = normalizeEventText(item.title, 240);
  const mentions = titleEntityMentions(item);
  const before = (index) => mentions.filter((mention) => mention.end <= index).at(-1);
  const after = (index) => mentions.find((mention) => mention.start >= index);
  const roleBoundary = String.raw`(?=\s+(?:after|amid|as|at|before|for|following|from|in|over|target(?:s|ed|ing)?|under|with|worth)\b|[,;:]|$)`;
  const directedEnforcement = new RegExp(
    String.raw`^(.+?)\s+(?:accus(?:e|ed|es|ing)|charg(?:e|ed|es|ing)|sanction(?:ed|s|ing)?)\s+(.+?)\s+(?:of|over|with)\b`,
    "i",
  ).exec(title) ?? new RegExp(
    String.raw`^(.+?)\s+alleg(?:e|ed|es|ing)\s+(.+?)\s+(?:breach(?:ed|es|ing)?|broke|violat(?:e|ed|es|ing))\b`,
    "i",
  ).exec(title);
  if (directedEnforcement) {
    const enforcer = normalizeActorAnchor(directedEnforcement[1]);
    const defendant = normalizeActorAnchor(directedEnforcement[2]);
    if (enforcer && defendant && enforcer !== defendant) return `enforcer:${enforcer}->${defendant}`;
  }
  const passiveClaim = new RegExp(
    String.raw`^(.+?)\s+(?:(?:is|was|were|gets?|has\s+been)\s+)?sued\s+by\s+(.+?)${roleBoundary}`,
    "i",
  ).exec(title);
  if (passiveClaim) {
    const defendant = normalizeActorAnchor(passiveClaim[1]);
    const claimant = normalizeActorAnchor(passiveClaim[2]);
    if (claimant && defendant && claimant !== defendant) return `claimant:${claimant}->${defendant}`;
  }
  const filedByClaim = new RegExp(
    String.raw`^(?:.+?\s+)?(?:lawsuit|suit|complaint|legal\s+action)\s+against\s+(.+?)\s+filed\s+by\s+(.+?)${roleBoundary}`,
    "i",
  ).exec(title);
  if (filedByClaim) {
    const defendant = normalizeActorAnchor(filedByClaim[1]);
    const claimant = normalizeActorAnchor(filedByClaim[2]);
    if (claimant && defendant && claimant !== defendant) return `claimant:${claimant}->${defendant}`;
  }
  const nounClaim = /\b(?:lawsuit|suit|complaint|legal\s+action)\s+against\b/i.exec(title);
  if (nounClaim) {
    const claimant = before(nounClaim.index);
    const defendant = after(nounClaim.index + nounClaim[0].length);
    if (claimant && defendant && claimant.key !== defendant.key) {
      return `claimant:${claimant.key}->${defendant.key}`;
    }
  }
  const possessiveClaim = new RegExp(
    String.raw`^(.+?)[’']s\s+(?:(?:[a-z0-9-]+)\s+){0,3}(?:lawsuit|suit|complaint|legal\s+action)\s+against\s+(.+?)${roleBoundary}`,
    "i",
  ).exec(title);
  if (possessiveClaim) {
    const claimant = normalizeActorAnchor(possessiveClaim[1]);
    const defendant = normalizeActorAnchor(possessiveClaim[2]);
    if (claimant && defendant && claimant !== defendant) return `claimant:${claimant}->${defendant}`;
  }
  const activeClaim = new RegExp(
    String.raw`^(.+?)\s+(?:(?:sue(?:d|s)?|suing)\s+|(?:file(?:d|s|ing)?|bring(?:s|ing)?|brought|lodg(?:e|ed|es|ing)|tak(?:e|es|ing)|took)\s+(?:an?\s+)?(?:(?:[a-z0-9-]+)\s+){0,3}(?:lawsuit|suit|complaint|legal\s+action)\s+against\s+)(.+?)${roleBoundary}`,
    "i",
  ).exec(title);
  if (activeClaim) {
    const claimant = normalizeActorAnchor(activeClaim[1]);
    const defendant = normalizeActorAnchor(activeClaim[2]);
    if (claimant && defendant && claimant !== defendant) return `claimant:${claimant}->${defendant}`;
  }
  const facesClaim = new RegExp(
    String.raw`^(.+?)\s+faces?\s+(?:an?\s+)?(?:lawsuit|suit|complaint|legal\s+action)\s+from\s+(.+?)${roleBoundary}`,
    "i",
  ).exec(title);
  if (facesClaim) {
    const defendant = normalizeActorAnchor(facesClaim[1]);
    const claimant = normalizeActorAnchor(facesClaim[2]);
    if (claimant && defendant && claimant !== defendant) return `claimant:${claimant}->${defendant}`;
  }
  if (/\b(?:settle(?:d|s|ment|ments|ing)|reaches?\b[^.!?]{0,50}\bsettlement)\b/i.test(title)) {
    const parties = [...new Set(mentions.map((mention) => mention.key))].sort();
    if (parties.length === 2) return `settlement:${parties.join("+")}`;
  }
  const passiveEnforcement = /\b(?:(?:is|was|were|has\s+been)\s+)?(?:fined|penalized|hit\s+with\b[^.!?]{0,60}\b(?:fine|penalty))\b[^.!?]{0,60}\bby\b/i.exec(title);
  if (passiveEnforcement) {
    const defendant = before(passiveEnforcement.index);
    const enforcer = after(passiveEnforcement.index + passiveEnforcement[0].length);
    if (enforcer && defendant && enforcer.key !== defendant.key) {
      return `enforcer:${enforcer.key}->${defendant.key}`;
    }
  }
  const receivedEnforcement = /\breceiv(?:e|ed|es|ing)\b[^.!?]{0,60}\b(?:fine|penalty)\b/i.exec(title);
  if (receivedEnforcement) {
    const defendant = before(receivedEnforcement.index);
    const enforcer = after(receivedEnforcement.index + /\breceiv(?:e|ed|es|ing)\b/i.exec(receivedEnforcement[0])[0].length);
    if (enforcer && defendant && enforcer.key !== defendant.key) {
      return `enforcer:${enforcer.key}->${defendant.key}`;
    }
  }
  const leviedEnforcement = /\b(?:levy|levied|levies|levying|impose|imposed|imposes|imposing)\b[^.!?]{0,45}\b(?:fine|penalty)\b/i.exec(title);
  if (leviedEnforcement) {
    const enforcer = before(leviedEnforcement.index);
    const defendant = after(leviedEnforcement.index + leviedEnforcement[0].length);
    if (enforcer && defendant && enforcer.key !== defendant.key) {
      return `enforcer:${enforcer.key}->${defendant.key}`;
    }
  }
  const paymentOrder = /\borders?\b/i.exec(title);
  const payment = /\bto\s+pay\b/i.exec(title);
  if (paymentOrder && payment && payment.index > paymentOrder.index) {
    const payer = after(paymentOrder.index + paymentOrder[0].length);
    const payee = after(payment.index + payment[0].length);
    if (payer && payee && payer.key !== payee.key) return `payer:${payer.key}->${payee.key}`;
  }
  const receivedPayment = /\breceiv(?:e|ed|es|ing)\b[^.!?]{0,50}\bfrom\b/i.exec(title);
  if (receivedPayment && /\b(?:award|court|damages|judgment|payment)\b/i.test(title)) {
    const payee = before(receivedPayment.index);
    const payer = after(receivedPayment.index + receivedPayment[0].length);
    if (payer && payee && payer.key !== payee.key) return `payer:${payer.key}->${payee.key}`;
  }
  const wonPayment = /\b(?:secure(?:d|s|ing)?|win(?:s|ning)?|won)\b[^.!?]{0,60}\b(?:award|damages|judgment|payment)\b[^.!?]{0,45}\bfrom\b/i.exec(title);
  if (wonPayment) {
    const payee = before(wonPayment.index);
    const payer = after(wonPayment.index + wonPayment[0].length);
    if (payer && payee && payer.key !== payee.key) return `payer:${payer.key}->${payee.key}`;
  }
  const enforcement = /\b(?:fine(?:d|s|ing)?|penaliz(?:e|ed|es|ing))\b/i.exec(title);
  if (enforcement) {
    const enforcer = before(enforcement.index);
    const defendant = after(enforcement.index + enforcement[0].length);
    if (enforcer && defendant && enforcer.key !== defendant.key) {
      return `enforcer:${enforcer.key}->${defendant.key}`;
    }
  }
  const passiveLawsuit = /\b(?:is|was|were|gets?|has\s+been)\s+sued\s+by\b/i.exec(title);
  if (passiveLawsuit) {
    const defendant = before(passiveLawsuit.index);
    const claimant = after(passiveLawsuit.index + passiveLawsuit[0].length);
    if (claimant && defendant) return `claimant:${claimant.key}->${defendant.key}`;
  }
  const filedBy = /\blawsuit\s+against\b[^.!?]{0,60}\bfiled\s+by\b/i.exec(title);
  if (filedBy) {
    const defendant = after(filedBy.index + "lawsuit against".length);
    const claimant = after(filedBy.index + filedBy[0].length);
    if (claimant && defendant && claimant.key !== defendant.key) {
      return `claimant:${claimant.key}->${defendant.key}`;
    }
  }
  const lawsuit = /\b(?:(?:sue(?:d|s)?|suing)|files?\s+(?:an?\s+)?lawsuit\s+against)\b/i.exec(title);
  if (lawsuit) {
    const subject = before(lawsuit.index);
    const object = after(lawsuit.index + lawsuit[0].length);
    if (subject && object) return `claimant:${subject.key}->${object.key}`;
  }
  const facesLawsuit = /\bfaces?\b/i.exec(title);
  if (facesLawsuit && /\blawsuit\b/i.test(title.slice(facesLawsuit.index))) {
    const defendant = before(facesLawsuit.index);
    const claimant = after(facesLawsuit.index + facesLawsuit[0].length);
    if (claimant && defendant && claimant.key !== defendant.key) {
      return `claimant:${claimant.key}->${defendant.key}`;
    }
  }
  const passiveOutcome = /\b(?:is|was|were|gets?|has\s+been)\s+(?:beaten|defeated)\s+by\b/i.exec(title);
  if (passiveOutcome) {
    const loser = before(passiveOutcome.index);
    const winner = after(passiveOutcome.index + passiveOutcome[0].length);
    if (winner && loser) return `winner:${winner.key}->${loser.key}`;
  }
  const victoryOver = /\b(?:secure(?:d|s|ing)?|score(?:d|s|ing)?)\b[^.!?]{0,35}\b(?:court\s+)?victory\s+over\b/i.exec(title);
  if (victoryOver) {
    const winner = before(victoryOver.index);
    const loser = after(victoryOver.index + victoryOver[0].length);
    if (winner && loser && winner.key !== loser.key) return `winner:${winner.key}->${loser.key}`;
  }
  const winnerOutcome = /\b(?:beat(?:s|ing)?|defeat(?:ed|s|ing)?|prevail(?:ed|s|ing)?\s+over)\b/i.exec(title);
  if (winnerOutcome) {
    const winner = before(winnerOutcome.index);
    const loser = after(winnerOutcome.index + winnerOutcome[0].length);
    if (winner && loser) return `winner:${winner.key}->${loser.key}`;
  }
  const winAgainst = /\b(?:win(?:s|ning)?|won)\b.{0,80}\bagainst\b/i.exec(title);
  if (winAgainst) {
    const winner = before(winAgainst.index);
    const loser = after(winAgainst.index + winAgainst[0].length);
    if (winner && loser) return `winner:${winner.key}->${loser.key}`;
  }
  const loseTo = /\b(?:lose(?:s|ing)?|lost)\b.{0,80}\bto\b/i.exec(title);
  if (loseTo) {
    const loser = before(loseTo.index);
    const winner = after(loseTo.index + loseTo[0].length);
    if (winner && loser) return `winner:${winner.key}->${loser.key}`;
  }
  const sidesWith = /\bsides?\s+with\b[^.!?]{0,60}\bagainst\b/i.exec(title);
  if (sidesWith) {
    const winner = after(sidesWith.index + "sides with".length);
    const loser = after(sidesWith.index + sidesWith[0].length);
    if (winner && loser && winner.key !== loser.key) return `winner:${winner.key}->${loser.key}`;
  }
  return null;
}

function hasDirectedLegalSyntax(item) {
  const title = normalizeEventText(item.title, 240);
  return /\b(?:accus(?:e|ed|es|ing)|alleg(?:e|ed|es|ing)|charg(?:e|ed|es|ing)|sanction(?:ed|s|ing)?|sue(?:d|s)?|suing)\b/i.test(title) ||
    /\b(?:lawsuit|suit|complaint|legal\s+action)\s+against\b/i.test(title) ||
    /\b(?:fined|penalized|fine|penalty)\b[^.!?]{0,60}\b(?:against|by)\b/i.test(title) ||
    /\borders?\b[^.!?]{0,60}\bto\s+pay\b/i.test(title) ||
    /\b(?:receiv(?:e|ed|es|ing)|secure(?:d|s|ing)?|win(?:s|ning)?|won)\b[^.!?]{0,70}\b(?:award|damages|judgment|payment)\b[^.!?]{0,45}\bfrom\b/i.test(title) ||
    /\b(?:victory\s+over|win(?:s|ning)?\b[^.!?]{0,60}\bagainst|won\b[^.!?]{0,60}\bagainst|lose(?:s|ing)?\b[^.!?]{0,60}\bto|lost\b[^.!?]{0,60}\bto)\b/i.test(title) ||
    /\bsides?\s+with\b[^.!?]{0,60}\bagainst\b/i.test(title);
}

function investigationRoleAnchor(item) {
  const title = normalizeEventText(item.title, 240);
  const mentions = titleEntityMentions(item);
  const roleBoundary = String.raw`(?=\s+(?:after|amid|as|at|before|for|following|from|in|over|under|with|worth)\b|[,;:]|$)`;
  const passive = new RegExp(
    String.raw`^(.+?)\s+(?:(?:is|was|were|has\s+been)\s+)?investigated\s+by\s+(.+?)${roleBoundary}`,
    "i",
  ).exec(title);
  if (passive) {
    const target = normalizeActorAnchor(passive[1]);
    const investigator = normalizeActorAnchor(passive[2]);
    if (investigator && target && investigator !== target) {
      return `investigator:${investigator}->${target}`;
    }
  }
  const active = new RegExp(
    String.raw`^(.+?)\s+(?:investigat(?:e|ed|es|ing)|probes|probing)\s+(.+?)${roleBoundary}`,
    "i",
  ).exec(title);
  if (active) {
    const investigator = normalizeActorAnchor(active[1]);
    const target = normalizeActorAnchor(active[2]);
    if (investigator && target && investigator !== target) {
      return `investigator:${investigator}->${target}`;
    }
  }
  const underInvestigation = new RegExp(
    String.raw`^(.+?)\s+(?:is\s+)?under\s+(.+?)\s+investigation${roleBoundary}`,
    "i",
  ).exec(title);
  if (underInvestigation) {
    const target = normalizeActorAnchor(underInvestigation[1]);
    const investigator = normalizeActorAnchor(underInvestigation[2]);
    if (investigator && target && investigator !== target) {
      return `investigator:${investigator}->${target}`;
    }
  }
  const facesProbe = new RegExp(
    String.raw`^(.+?)\s+faces?\s+(.+?)\s+probe${roleBoundary}`,
    "i",
  ).exec(title);
  if (facesProbe) {
    const target = normalizeActorAnchor(facesProbe[1]);
    const investigator = normalizeActorAnchor(facesProbe[2]);
    if (investigator && target && investigator !== target) {
      return `investigator:${investigator}->${target}`;
    }
  }
  const openedInquiryAction = /\bopen(?:ed|s|ing)?\s+(?:an?\s+)?(?:inquiry|probe)\s+into\b/i.exec(title);
  if (openedInquiryAction) {
    const investigator = mentions
      .filter((mention) => mention.end <= openedInquiryAction.index)
      .at(-1);
    const target = mentions.find(
      (mention) => mention.start >= openedInquiryAction.index + openedInquiryAction[0].length,
    );
    if (investigator && target && investigator.key !== target.key) {
      return `investigator:${investigator.key}->${target.key}`;
    }
  }
  const opensInquiry = new RegExp(
    String.raw`^(.+?)\s+open(?:ed|s|ing)?\s+(?:an?\s+)?(?:inquiry|probe)\s+into\s+(.+?)${roleBoundary}`,
    "i",
  ).exec(title);
  if (opensInquiry) {
    const investigator = normalizeActorAnchor(opensInquiry[1]);
    const target = normalizeActorAnchor(opensInquiry[2]);
    if (investigator && target && investigator !== target) {
      return `investigator:${investigator}->${target}`;
    }
  }
  const action = /\b(?:investigat(?:e|ed|es|ing|ion)|open(?:ed|s|ing)?\b[^.!?]{0,25}\bprobe|probe|probes|probing)\b/i.exec(title);
  if (!action) return null;
  const investigator = mentions.filter((mention) => mention.end <= action.index).at(-1);
  const target = mentions.find((mention) => mention.start >= action.index + action[0].length);
  if (investigator && target && investigator.key !== target.key) {
    return `investigator:${investigator.key}->${target.key}`;
  }
  return null;
}

const LEGAL_ISSUE_NOISE_TOKENS = new Set([
  "action", "advertising", "award", "case", "complaint", "fine", "fined", "lawsuit", "legal", "levied",
  "levy", "mobile", "order", "ordered", "pay", "penalty", "penalize", "policy",
  "practice", "protect", "protected", "protecting", "protection", "receive",
  "reache", "reach", "reached", "reaches", "received", "right", "secure", "secured", "settle", "settled", "settlement", "suit", "victory",
  "beat", "beaten", "defeat", "defeated", "dismiss", "dismissed", "file",
  "filed", "filing", "lose", "lost", "prevail", "sue", "sued", "suing",
  "sues", "win", "winner", "wins", "won",
]);

function legalIssueTokenSet(item) {
  if (!eventActionFamilies(item).has("legal")) return new Set();
  return new Set([...subjectEventTokenSet(item)]
    .map((token) => token === "billing" ? "payment" : token)
    .filter((token) => !LEGAL_ISSUE_NOISE_TOKENS.has(token)));
}

function hasDenialPolarity(item) {
  const title = normalizeEventText(item.title, 240);
  return /\b(?:den(?:y|ies|ied|ying)|disput(?:e|ed|es|ing)|refut(?:e|ed|es|ing))\b/i.test(title) ||
    /\b(?:debunk(?:ed|s|ing)?|rebut(?:s|ted|ting)?)\b/i.test(title) ||
    /\b(?:bogus|fabricated|fake|hoax)\b/i.test(title) ||
    /\b(?:allegation|claim|report|rumou?r)s?\b.{0,100}\b(?:false|not\s+true|untrue)\b/i.test(title) ||
    /\bdismiss(?:ed|es|ing)?\b.{0,35}\b(?:allegation|claim|report|rumou?r)s?\b/i.test(title) ||
    /\breject(?:s|ed|ing)?\b.{0,45}\b(?:allegation|claim|launch|release|report|rumou?r)s?\b/i.test(title) ||
    /\bpush(?:ed|es|ing)?\s+back(?:\s+(?:against|on))?\b.{0,55}\b(?:allegation|claim|launch|release|report|rollout|rumou?r)s?\b/i.test(title) ||
    /\bshoot(?:s|ing)?\s+down\b.{0,35}\b(?:allegation|claim|report|rumou?r)s?\b/i.test(title) ||
    /\bcall(?:ed|s|ing)?\b.{0,45}\b(?:allegation|claim|report|rumou?r)s?\b.{0,20}\b(?:false|inaccurate|misleading|wrong)\b/i.test(title) ||
    /\brules?\s+out\b|\b(?:has\s+no\s+intention\s+of|no\s+plans?\s+to|not\s+planning\s+to)\b/i.test(title) ||
    /\b(?:does\s+not|doesn[’']t|is\s+not|isn[’']t|will\s+not|won[’']t|not\s+going\s+to)\b.{0,24}\b(?:acquire|build|buy|deploy|fix|launch|offer|patch|release|remediate|sell|ship|unveil)\b/i.test(title) ||
    /\b(?:does\s+not|doesn[’']t|has\s+no|is\s+not|isn[’']t|not)\b.{0,18}\b(?:affect(?:ed)?|at\s+risk|expos(?:e|ed|ure)|exploitable|impact(?:ed)?|vulnerable)\b/i.test(title) ||
    /\b(?:immune\s+to|not\s+(?:at\s+risk|exploitable|exposed\s+to)|unaffected\s+by)\b/i.test(title) ||
    /\bunaffected\b/i.test(title);
}

function hasCancellationPolarity(item) {
  const title = normalizeEventText(item.title, 240);
  return /\b(?:abandon(?:ed|s|ing)?|abort(?:ed|s|ing)?|ax(?:e|ed|es|ing)|cancel(?:ed|led|s|ing|ling)?|nix(?:ed|es|ing)?|scrap(?:ped|s|ping)?|withdraw(?:n|s|ing)?|withdrew)\b/i.test(title) ||
    /\bcall(?:ed|s|ing)?\s+off\b/i.test(title) ||
    /\bend(?:ed|s|ing)?\s+(?:(?:deal|merger|takeover|acquisition)\s+)?(?:talks|negotiations)\b/i.test(title) ||
    /\bwalk(?:ed|s|ing)?\s+away\s+from\b/i.test(title) ||
    /\b(?:drop(?:ped|s|ping)?|withdraw(?:n|s|ing)?|withdrew)\s+(?:its\s+|the\s+)?(?:bid|case|complaint|lawsuit|offer)\b/i.test(title) ||
    /\b(?:halt(?:ed|s|ing)?|stop(?:ped|s|ping)?|terminat(?:e|ed|es|ing))\b.{0,30}\b(?:acquisition|deal|lawsuit|launch|merger|rollout|takeover|talks)\b/i.test(title) ||
    /\b(?:deal|merger|takeover|acquisition)\s+(?:collapse(?:d|s|ing)?|falls?\s+through|fell\s+through|is\s+dead)\b/i.test(title);
}

function hasDeferredPolarity(item) {
  const title = normalizeEventText(item.title, 240);
  return /\b(?:delay(?:ed|s|ing)?|defer(?:red|s|ring)?|postpone(?:d|s|ing)?|reschedul(?:e|ed|es|ing)|shelv(?:e|ed|es|ing)|suspend(?:ed|s|ing)?)\b.{0,35}\b(?:debut|deployment|launch|release|rollout|shipment|unveiling)\b/i.test(title) ||
    /\b(?:pause(?:d|s|ing)?|put(?:s|ting)?\s+on\s+hold|freeze(?:s|ing)?|froze)\b.{0,35}\b(?:debut|deployment|launch|release|rollout|shipment|unveiling)\b/i.test(title);
}

function hasTerminationPolarity(item) {
  const title = normalizeEventText(item.title, 240);
  return /\b(?:deprecat(?:e|ed|es|ing)|discontinu(?:e|ed|es|ing)|retir(?:e|ed|es|ing)|sunset(?:s|ted|ting)?|shut(?:s|ting)?\s+down)\b/i.test(title) ||
    /\bend(?:ed|s|ing)?\s+(?:support|service)\b/i.test(title);
}

function hasRecoveryPolarity(item) {
  const title = normalizeEventText(item.title, 240);
  return /\b(?:recover(?:ed|s|ing)?|restor(?:e|ed|es|ing)|resum(?:e|ed|es|ing))\b[^.!?]{0,45}\b(?:availability|network|outage|platform|service|site)\b/i.test(title) ||
    /\b(?:availability|network|outage|platform|service|site)\b[^.!?]{0,55}\b(?:back\s+(?:online|up)|fully\s+operational|is\s+over|recover(?:ed|s|ing)?|resolv(?:e|ed|es|ing)|restor(?:e|ed|es|ing)|resum(?:e|ed|es|ing)|return(?:ed|s|ing)?\s+to\s+normal)\b/i.test(title);
}

function hasContradictorySecurityState(item) {
  const title = normalizeEventText(item.title, 240);
  return /\b(?:failed|failing|incomplete|unsuccessful)\s+(?:fix|patch|remediation)\b|\b(?:fix|patch|remediation)\b[^.!?]{0,30}\b(?:failed|fails|failing|incomplete|unsuccessful)\b/i.test(title) ||
    /\b(?:remain(?:s|ed|ing)?|still)\b[^.!?]{0,25}\b(?:exposed|unpatched|vulnerable)\b|\b(?:not\s+fixed|unpatched)\b/i.test(title) ||
    /\b(?:cve-\d{4}-\d{4,}|ghsa-[a-z0-9-]{8,}|bug|flaw|issue|vulnerabilit(?:y|ies))\b[^.!?]{0,55}\b(?:persist(?:ed|s|ing)?|remain(?:ed|s|ing)?)\b[^.!?]{0,45}\bafter\b[^.!?]{0,20}\b(?:fix|patch|remediation)\b/i.test(title) ||
    /\b(?:cve-\d{4}-\d{4,}|ghsa-[a-z0-9-]{8,}|bug|flaw|issue|vulnerabilit(?:y|ies))\b[^.!?]{0,55}\b(?:is\s+)?(?:still\s+)?(?:exists?|exploitable)\b[^.!?]{0,45}\bafter\b[^.!?]{0,20}\b(?:fix|patch|remediation)\b/i.test(title) ||
    /\b(?:roll(?:ed|s|ing)?\s+back|revert(?:ed|s|ing)?)\b[^.!?]{0,40}\b(?:fix|patch|remediation)\b|\b(?:fix|patch|remediation)\b[^.!?]{0,40}\b(?:roll(?:ed|s|ing)?\s+back|revert(?:ed|s|ing)?|(?:was\s+)?undone)\b/i.test(title) ||
    /\b(?:cve-\d{4}-\d{4,}|ghsa-[a-z0-9-]{8,})\b[^.!?]{0,25}\b(?:invalid|rejected|withdrawn)\b|\b(?:invalid|rejected|withdrawn)\b[^.!?]{0,25}\b(?:cve-\d{4}-\d{4,}|ghsa-[a-z0-9-]{8,})\b/i.test(title);
}

function normalizeActorAnchor(value) {
  const cleaned = normalizeEventText(value, 100)
    .replace(/[’']s\b/gi, "")
    .trim();
  const canonical = canonicalEntityAlias(cleaned);
  if (canonical) return canonical;
  const tokens = tokenize(cleaned)
    .map(normalizeEventToken)
    .filter((token) =>
      !EVENT_MATCH_STOP_WORDS.has(token) &&
      !GENERIC_EVENT_CONTEXT_TOKENS.has(token) &&
      !ACQUISITION_TARGET_NOISE_TOKENS.has(token) &&
      !/^\d/.test(token));
  return tokens.length > 0 ? [...new Set(tokens)].sort().join(":") : null;
}

function acquisitionRoleAnchor(item) {
  const title = normalizeEventText(item.title, 240);
  const boundary = String.raw`(?=\s+(?:after|amid|as|at|before|for|following|from|in|over|under|with|worth)\b|[,;:]|$)`;
  const mentions = titleEntityMentions(item);
  const partyBefore = (index, fallback) =>
    mentions.filter((mention) => mention.end <= index).at(-1)?.key ?? normalizeActorAnchor(fallback);
  const partiesAgreeToMerge = /^(.+?)\s+and\s+(.+?)\s+agree(?:d|s|ing)?\s+to\s+merge\b/i.exec(title);
  if (partiesAgreeToMerge) {
    const parties = [normalizeActorAnchor(partiesAgreeToMerge[1]), normalizeActorAnchor(partiesAgreeToMerge[2])]
      .filter(Boolean)
      .sort();
    if (parties.length === 2 && parties[0] !== parties[1]) return `merger:${parties.join("+")}`;
  }
  const agreesToMergeWith = new RegExp(
    String.raw`^(.+?)\s+agree(?:d|s|ing)?\s+to\s+merge\s+with\s+(.+?)${boundary}`,
    "i",
  ).exec(title);
  if (agreesToMergeWith) {
    const parties = [normalizeActorAnchor(agreesToMergeWith[1]), normalizeActorAnchor(agreesToMergeWith[2])]
      .filter(Boolean)
      .sort();
    if (parties.length === 2 && parties[0] !== parties[1]) return `merger:${parties.join("+")}`;
  }
  const agreedMerger = /^(.+?)\s+and\s+(.+?)\s+(?:agree(?:d|s|ing)?(?:\s+to)?|announce(?:d|s)?|approv(?:e|ed|es|ing)|complete(?:d|s|ing)?)\s+(?:a\s+)?merger\b/i.exec(title);
  if (agreedMerger) {
    const parties = [normalizeActorAnchor(agreedMerger[1]), normalizeActorAnchor(agreedMerger[2])]
      .filter(Boolean)
      .sort();
    if (parties.length === 2 && parties[0] !== parties[1]) return `merger:${parties.join("+")}`;
  }
  const possessive = new RegExp(
    String.raw`^(.+?)[’']s\s+(.+?)\s+(?:acquisition|purchase|takeover)\s+(?:clos(?:e|ed|es|ing)|complet(?:e|ed|es|ing))\b`,
    "i",
  ).exec(title);
  if (possessive) {
    const buyer = normalizeActorAnchor(possessive[1]);
    const target = normalizeActorAnchor(possessive[2]);
    if (buyer && target) return `acquirer:${buyer}->${target}`;
  }
  const passive = new RegExp(
    String.raw`^(.+?)\s+(?:(?:is|was|were|will\s+be|has\s+been)\s+)?(?:acquired|bought|purchased|taken\s+over)\s+by\s+(.+?)${boundary}`,
    "i",
  ).exec(title);
  if (passive) {
    const target = normalizeActorAnchor(passive[1]);
    const buyer = normalizeActorAnchor(passive[2]);
    if (buyer && target) return `acquirer:${buyer}->${target}`;
  }
  const active = new RegExp(
    String.raw`^(.+?)\s+(?:acquir(?:e|ed|es|ing)|buy(?:s|ing)?|bought|purchas(?:e|ed|es|ing)|(?:tak(?:e|es|ing)|took)\s+over)\s+(.+?)${boundary}`,
    "i",
  ).exec(title);
  if (active) {
    const action = /\b(?:acquir(?:e|ed|es|ing)|buy(?:s|ing)?|bought|purchas(?:e|ed|es|ing)|(?:tak(?:e|es|ing)|took)\s+over)\b/i.exec(title);
    const buyer = partyBefore(action.index, active[1]);
    const target = normalizeActorAnchor(active[2]);
    if (buyer && target) return `acquirer:${buyer}->${target}`;
  }
  const bid = new RegExp(
    String.raw`^(.+?)\s+(?:(?:submits?|makes?)\s+)?(?:[$€£]\s*\d[\d,.]*\s*(?:million|billion|m|bn|b)?\s+)?(?:bid|offer)\s+for\s+(.+?)${boundary}`,
    "i",
  ).exec(title);
  if (bid) {
    const buyer = normalizeActorAnchor(bid[1]);
    const target = normalizeActorAnchor(bid[2]);
    if (buyer && target) return `acquirer:${buyer}->${target}`;
  }
  const noun = new RegExp(
    String.raw`\b(?:acquisition|purchase|takeover)\s+of\s+(.+?)${boundary}`,
    "i",
  ).exec(title);
  if (noun) {
    const buyer = mentions.filter((mention) => mention.end <= noun.index).at(-1)?.key;
    const target = normalizeActorAnchor(noun[1]);
    if (buyer && target) return `acquirer:${buyer}->${target}`;
  }
  const prenominal = new RegExp(
    String.raw`\b(?:announce(?:d|s)?|approv(?:e|ed|es|ing)|confirm(?:ed|s)?|complet(?:e|ed|es|ing))\s+(?:an?\s+)?(?:[$€£]\s*\d[\d,.]*\s*(?:million|billion|m|bn|b)?\s+)?(.+?)\s+(?:acquisition|purchase|takeover)\b`,
    "i",
  ).exec(title);
  if (prenominal) {
    const buyer = mentions.filter((mention) => mention.end <= prenominal.index).at(-1)?.key;
    const target = normalizeActorAnchor(prenominal[1]);
    if (buyer && target) return `acquirer:${buyer}->${target}`;
  }
  return null;
}

function acquisitionStageAnchor(item) {
  const title = normalizeEventText(item.title, 240);
  if (/\b(?:clos(?:e|ed|es|ing)|complet(?:e|ed|es|ing)|finaliz(?:e|ed|es|ing))\b[^.!?]{0,40}\b(?:acquisition|deal|merger|purchase|takeover)\b|\b(?:acquisition|deal|merger|purchase|takeover)\b[^.!?]{0,40}\b(?:clos(?:e|ed|es|ing)|complet(?:e|ed|es|ing)|finaliz(?:e|ed|es|ing))\b/i.test(title)) {
    return "completed";
  }
  if (/\b(?:agree(?:d|s|ing)?\s+to\s+(?:a\s+)?(?:merge|merger)|agreement\s+to\s+merge)\b/i.test(title)) {
    return "agreed";
  }
  if (/\b(?:bid|offer)\s+for\b|\b(?:submits?|makes?)\b[^.!?]{0,45}\b(?:bid|offer)\b/i.test(title)) {
    return "proposed";
  }
  if (/\bapprov(?:e|ed|es|ing)\b[^.!?]{0,35}\bmerger\b/i.test(title)) {
    return "approved";
  }
  if (/\bannounce(?:d|s|ment)?\b[^.!?]{0,45}\b(?:acquisition|deal|merger|purchase|takeover)\b|\b(?:acquisition|deal|merger|purchase|takeover)\b[^.!?]{0,45}\bannounc(?:e|ed|es|ement)\b/i.test(title)) {
    return "announced";
  }
  if (/\b(?:acquir(?:e|ed|es|ing)|buy(?:s|ing)?|bought|purchas(?:e|ed|es|ing)|(?:tak(?:e|es|ing)|took)\s+over)\b|\bconfirms?\b[^.!?]{0,45}\b(?:acquisition|purchase|takeover)\b/i.test(title)) {
    return "completed";
  }
  return null;
}

function entitySetsCompatible(left, right, sharedProducts) {
  if (left.size === 0 || right.size === 0 || setIntersection(left, right).size > 0) return true;
  const pair = new Set([...left, ...right]);
  const githubMicrosoft = pair.size === 2 && pair.has("github") && pair.has("microsoft");
  const githubProduct = [...sharedProducts].some((identifier) =>
    identifier === "named:github-copilot-coding-agent" ||
    identifier === "named:copilot-spaces" ||
    identifier === "named:github-actions");
  return githubMicrosoft && githubProduct;
}

function hasActiveZeroDayExploitationSignal(item) {
  const title = normalizeEventText(item.title, 240);
  return /\b(?:zero|0)[- ]day\b/i.test(title) &&
    /\b(?:attack(?:ed|s|ing)?|exploit(?:ed|s|ing)?|in\s+the\s+wild|under\s+attack)\b/i.test(title);
}

const PAPERCUT_ZERO_DAY_GENERIC_TOKENS = new Set([
  "0", "0-day", "attack", "blood", "customer", "day", "drawing", "emergency",
  "exploit", "exploited", "exploiting", "flaw", "management", "mf", "ng", "outfit",
  "papercut", "print", "warn", "warning", "zero", "zero-day",
]);

function paperCutZeroDayDetailTokens(item) {
  return new Set([...meaningfulTitleTokenSet(item)]
    .filter((token) => !PAPERCUT_ZERO_DAY_GENERIC_TOKENS.has(token)));
}

function reviewedPaperCutZeroDayPair(left, right, sharedProducts) {
  if (!(left.publisherKey !== right.publisherKey &&
    sharedProducts.has("named:papercut") &&
    hasActiveZeroDayExploitationSignal(left) &&
    hasActiveZeroDayExploitationSignal(right))) return false;
  const leftDetails = paperCutZeroDayDetailTokens(left);
  const rightDetails = paperCutZeroDayDetailTokens(right);
  return leftDetails.size === 0 && rightDetails.size === 0 ||
    leftDetails.size > 0 && rightDetails.size > 0 && setsEqual(leftDetails, rightDetails);
}

function hasAnthropicBlacklistRulingSignal(item) {
  const title = normalizeEventText(item.title, 240);
  return /\banthropic\b/i.test(title) &&
    /\bblacklist(?:ed|ing|s)?\b/i.test(title) &&
    /\b(?:court|judge|judicial|rul(?:e|ed|es|ing))\b/i.test(title) &&
    /\b(?:illegal(?:ly)?|unlawful|unconstitutional|not\s+lawful)\b/i.test(title);
}

function hasAnthropicDefenseBlacklistAuthoritySignal(item) {
  const title = normalizeEventText(item.title, 240);
  return /\b(?:pentagon|(?:department\s+of\s+)?defen[cs]e\s+department|department\s+of\s+defen[cs]e|trump\s+administration)\b/i.test(title);
}

const ANTHROPIC_DEFENSE_BLACKLIST_GENERIC_TOKENS = new Set([
  "administration", "anthropic", "blacklist", "blacklisted", "blacklisting",
  "court", "defence", "defense", "department", "illegal", "illegally", "judge",
  "pentagon", "trump", "unconstitutional", "unlawful", "us",
]);

function anthropicDefenseBlacklistDetailTokens(item) {
  return new Set([...meaningfulTitleTokenSet(item)]
    .filter((token) => !ANTHROPIC_DEFENSE_BLACKLIST_GENERIC_TOKENS.has(token)));
}

function reviewedAnthropicBlacklistRulingPair(left, right) {
  if (!(left.publisherKey !== right.publisherKey &&
    hasAnthropicBlacklistRulingSignal(left) &&
    hasAnthropicBlacklistRulingSignal(right) &&
    hasAnthropicDefenseBlacklistAuthoritySignal(left) &&
    hasAnthropicDefenseBlacklistAuthoritySignal(right))) return false;
  const leftDetails = anthropicDefenseBlacklistDetailTokens(left);
  const rightDetails = anthropicDefenseBlacklistDetailTokens(right);
  return leftDetails.size === 0 && rightDetails.size === 0 ||
    leftDetails.size > 0 && rightDetails.size > 0 && setsEqual(leftDetails, rightDetails);
}

function titleFingerprint(item) {
  return [...meaningfulTitleTokenSet(item)].sort().slice(0, 12).join("-") || item.itemId;
}

function itemsMatch(left, right) {
  if (left.url === right.url) return true;
  const leftIdentifiers = strongIdentifiers(left);
  const rightIdentifiers = strongIdentifiers(right);
  const sharedIdentifiers = setIntersection(leftIdentifiers, rightIdentifiers);
  if (leftIdentifiers.size > 0 && rightIdentifiers.size > 0 && sharedIdentifiers.size === 0) {
    return false;
  }
  const leftTitleIdentifiers = titleStrongIdentifiers(left);
  const rightTitleIdentifiers = titleStrongIdentifiers(right);
  const sharedTitleIdentifiers = setIntersection(leftTitleIdentifiers, rightTitleIdentifiers);
  const sharedIdentifiersInAnyTitle = setIntersection(
    sharedIdentifiers,
    new Set([...leftTitleIdentifiers, ...rightTitleIdentifiers]),
  );
  const leftProducts = productIdentifiers(left);
  const rightProducts = productIdentifiers(right);
  const sharedProducts = setIntersection(leftProducts, rightProducts);
  if (leftProducts.size > 0 && rightProducts.size > 0 && sharedProducts.size === 0) return false;
  if (identifiersConflict(leftProducts, rightProducts)) return false;
  const leftVersionedProducts = new Set([...leftProducts].filter((identifier) =>
    identifier.startsWith("model:") || identifier.startsWith("version:")));
  const rightVersionedProducts = new Set([...rightProducts].filter((identifier) =>
    identifier.startsWith("model:") || identifier.startsWith("version:")));
  if (
    leftVersionedProducts.size > 0 &&
    rightVersionedProducts.size > 0 &&
    setIntersection(leftVersionedProducts, rightVersionedProducts).size === 0
  ) return false;
  const leftEntities = titleEntityKeys(left);
  const rightEntities = titleEntityKeys(right);
  if (!entitySetsCompatible(leftEntities, rightEntities, sharedProducts)) return false;
  const paperCutZeroDayPair = reviewedPaperCutZeroDayPair(left, right, sharedProducts);
  const anthropicBlacklistRulingPair = reviewedAnthropicBlacklistRulingPair(left, right);
  const leftActions = eventActionFamilies(left);
  const rightActions = eventActionFamilies(right);
  const leftAcquisitionRole = acquisitionRoleAnchor(left);
  const rightAcquisitionRole = acquisitionRoleAnchor(right);
  const leftAcquisitionStage = acquisitionStageAnchor(left);
  const rightAcquisitionStage = acquisitionStageAnchor(right);
  const acquisitionInEither = leftActions.has("acquisition") || rightActions.has("acquisition");
  if (
    acquisitionInEither &&
    (!leftActions.has("acquisition") ||
      !rightActions.has("acquisition") ||
      !leftAcquisitionRole ||
      !rightAcquisitionRole)
  ) return false;
  if (
    leftAcquisitionRole &&
    rightAcquisitionRole &&
    leftAcquisitionRole !== rightAcquisitionRole
  ) return false;
  if (
    leftAcquisitionStage &&
    rightAcquisitionStage &&
    leftAcquisitionStage !== rightAcquisitionStage
  ) return false;
  const leftLegalRole = legalRoleAnchor(left);
  const rightLegalRole = legalRoleAnchor(right);
  const legalInEither = leftActions.has("legal") || rightActions.has("legal");
  const directedLegalInEither = hasDirectedLegalSyntax(left) || hasDirectedLegalSyntax(right);
  const multiPartyLegal = Math.max(leftEntities.size, rightEntities.size) >= 2;
  if (
    legalInEither &&
    (multiPartyLegal || directedLegalInEither) &&
    (!leftActions.has("legal") || !rightActions.has("legal") || !leftLegalRole || !rightLegalRole)
  ) return false;
  if (
    Boolean(leftLegalRole) !== Boolean(rightLegalRole) &&
    leftActions.has("legal") &&
    rightActions.has("legal")
  ) return false;
  if (leftLegalRole && rightLegalRole && leftLegalRole !== rightLegalRole) return false;
  const leftInvestigationRole = investigationRoleAnchor(left);
  const rightInvestigationRole = investigationRoleAnchor(right);
  const investigationInEither = leftActions.has("investigation") || rightActions.has("investigation");
  if (
    investigationInEither &&
    (!leftActions.has("investigation") ||
      !rightActions.has("investigation") ||
      !leftInvestigationRole ||
      !rightInvestigationRole ||
      leftInvestigationRole !== rightInvestigationRole)
  ) return false;
  const leftLegalIssues = legalIssueTokenSet(left);
  const rightLegalIssues = legalIssueTokenSet(right);
  const sharedLegalIssues = setIntersection(leftLegalIssues, rightLegalIssues);
  if (leftLegalIssues.size > 0 && rightLegalIssues.size > 0) {
    const leftContained = [...leftLegalIssues].every((token) => rightLegalIssues.has(token));
    const rightContained = [...rightLegalIssues].every((token) => leftLegalIssues.has(token));
    if (
      !anthropicBlacklistRulingPair &&
      (sharedLegalIssues.size === 0 || (!leftContained && !rightContained))
    ) return false;
  }
  if (hasDenialPolarity(left) !== hasDenialPolarity(right)) return false;
  if (hasCancellationPolarity(left) !== hasCancellationPolarity(right)) return false;
  if (hasDeferredPolarity(left) !== hasDeferredPolarity(right)) return false;
  if (hasTerminationPolarity(left) !== hasTerminationPolarity(right)) return false;
  const leftRecovered = hasRecoveryPolarity(left);
  const rightRecovered = hasRecoveryPolarity(right);
  if (leftRecovered !== rightRecovered) return false;
  if (hasContradictorySecurityState(left) !== hasContradictorySecurityState(right)) return false;
  const sharedActions = setIntersection(leftActions, rightActions);
  const leftOnlyActions = new Set([...leftActions].filter((action) => !rightActions.has(action)));
  const rightOnlyActions = new Set([...rightActions].filter((action) => !leftActions.has(action)));
  const actionDifferences = new Set([...leftOnlyActions, ...rightOnlyActions]);
  // A headline may add generic release wording to a more specific action
  // (for example, "releases a patch" versus "patches"). Any other extra
  // action family is event-defining and cannot be discarded by fuzzy title
  // matching.
  const releaseWordingOnly = sharedActions.size > 0 &&
    actionDifferences.size > 0 &&
    [...actionDifferences].every((action) => action === "release");
  if (
    leftActions.size > 0 &&
    rightActions.size > 0 &&
    (sharedActions.size === 0 || (!setsEqual(leftActions, rightActions) && !releaseWordingOnly))
  ) return false;
  const leftLifecycle = eventLifecycleFamilies(left);
  const rightLifecycle = eventLifecycleFamilies(right);
  if (
    (leftLifecycle.size > 0 || rightLifecycle.size > 0) &&
    setIntersection(leftLifecycle, rightLifecycle).size === 0
  ) return false;
  const leftArtifacts = eventArtifactFamilies(left);
  const rightArtifacts = eventArtifactFamilies(right);
  if (
    (leftArtifacts.size > 0 || rightArtifacts.size > 0) &&
    setIntersection(leftArtifacts, rightArtifacts).size === 0
  ) return false;
  const leftEventObjects = eventObjectKinds(left);
  const rightEventObjects = eventObjectKinds(right);
  const sharedEventObjects = setIntersection(leftEventObjects, rightEventObjects);
  const eventObjectDifferences = [
    ...[...leftEventObjects].filter((kind) => !rightEventObjects.has(kind)),
    ...[...rightEventObjects].filter((kind) => !leftEventObjects.has(kind)),
  ];
  const outageServiceWordingOnly = sharedEventObjects.has("outage") &&
    eventObjectDifferences.length > 0 &&
    eventObjectDifferences.every((kind) => kind === "service");
  const exactSecurityIdentifier = sharedIdentifiers.size > 0 && sharedActions.has("security-fix");
  const oneObjectSideEmpty = (leftEventObjects.size === 0) !== (rightEventObjects.size === 0);
  const nonemptyEventObjects = leftEventObjects.size > 0 ? leftEventObjects : rightEventObjects;
  const sharedVersionedProducts = setIntersection(leftVersionedProducts, rightVersionedProducts);
  const optionalVersionedModelNoun = oneObjectSideEmpty &&
    nonemptyEventObjects.size === 1 &&
    nonemptyEventObjects.has("model") &&
    sharedVersionedProducts.size > 0;
  const optionalNamedFeatureUpdateNoun = oneObjectSideEmpty &&
    nonemptyEventObjects.size === 1 &&
    nonemptyEventObjects.has("update") &&
    sharedProducts.has("feature:chatgpt-young-users");
  if (
    !setsEqual(leftEventObjects, rightEventObjects) &&
    !outageServiceWordingOnly &&
    !exactSecurityIdentifier &&
    !optionalVersionedModelNoun &&
    !optionalNamedFeatureUpdateNoun &&
    !paperCutZeroDayPair &&
    !anthropicBlacklistRulingPair
  ) return false;
  const leftFacets = eventFacetFamilies(left);
  const rightFacets = eventFacetFamilies(right);
  const sharedFacets = setIntersection(leftFacets, rightFacets);
  if (leftFacets.size > 0 && rightFacets.size > 0 && sharedFacets.size === 0) {
    return false;
  }
  const leftNumericAnchors = numericEventAnchors(left);
  const rightNumericAnchors = numericEventAnchors(right);
  if (numericAnchorsConflict(leftNumericAnchors, rightNumericAnchors)) return false;
  if (eventNumericRolesConflict(eventNumericRoleAnchors(left), eventNumericRoleAnchors(right))) {
    return false;
  }
  // These two reviewed, product-specific paraphrase families are accepted
  // only after all identifier, entity, action, lifecycle, object, polarity,
  // and numeric conflict checks above have completed. Grouping remains
  // complete-link, so every additional report must independently satisfy the
  // same narrow rule.
  if (paperCutZeroDayPair || anthropicBlacklistRulingPair) return true;
  const leftEventTokens = eventTitleTokenSet(left);
  const rightEventTokens = eventTitleTokenSet(right);
  const sharedEventCount = setIntersection(leftEventTokens, rightEventTokens).size;
  const eventSimilarity = jaccard(leftEventTokens, rightEventTokens);
  const leftSubjectTokens = subjectEventTokenSet(left);
  const rightSubjectTokens = subjectEventTokenSet(right);
  const sharedSubjectCount = setIntersection(leftSubjectTokens, rightSubjectTokens).size;
  const subjectSimilarity = jaccard(leftSubjectTokens, rightSubjectTokens);
  // Without a typed event anchor, unmatched title detail is event-defining
  // unless every extra token is an explicitly reviewed wording variant.
  const compatibleSubjectDetails = subjectDetailsCompatible(leftSubjectTokens, rightSubjectTokens);
  const sharesEntity = setIntersection(leftEntities, rightEntities).size > 0;
  const sharesActionFamily = sharedActions.size > 0;
  const sharesNumericAnchor = setIntersection(
    flattenedNumericAnchors(left),
    flattenedNumericAnchors(right),
  ).size > 0;
  const oneActionMissing = (leftActions.size === 0) !== (rightActions.size === 0);
  const sharedFeatureProducts = setIntersection(
    identifiersWithPrefix(leftProducts, "feature:"),
    identifiersWithPrefix(rightProducts, "feature:"),
  );
  const sharesFeatureProduct = sharedFeatureProducts.size > 0;
  const compatibleFeatureDetails =
    (sharedFeatureProducts.has("feature:claude-memory") && subjectDetailsCompatible(
      leftSubjectTokens,
      rightSubjectTokens,
      CLAUDE_MEMORY_DETAIL_TOKENS,
    )) ||
    (sharedFeatureProducts.has("feature:chatgpt-young-users") && subjectDetailsCompatible(
      leftSubjectTokens,
      rightSubjectTokens,
      CHATGPT_YOUNG_USERS_DETAIL_TOKENS,
    ));
  const sharesAcronymProduct = setIntersection(
    identifiersWithPrefix(leftProducts, "acronym:"),
    identifiersWithPrefix(rightProducts, "acronym:"),
  ).size > 0;
  const bothContextsSparse = leftSubjectTokens.size === 0 && rightSubjectTokens.size === 0;
  const sharesProductContext =
    (sharedSubjectCount >= 2 && subjectSimilarity >= 0.4) ||
    (sharesAcronymProduct && sharedSubjectCount >= 1 && setsEqual(leftSubjectTokens, rightSubjectTokens)) ||
    (leftRecovered && rightRecovered && sharedSubjectCount >= 1);
  if (
    sharedProducts.size > 0 &&
    sharedIdentifiersInAnyTitle.size === 0 &&
    leftSubjectTokens.size > 0 &&
    rightSubjectTokens.size > 0 &&
    !sharesProductContext &&
    !sharesFeatureProduct &&
    !(sharesNumericAnchor && sharesActionFamily)
  ) return false;
  if (
    sharedIdentifiers.size > 0 &&
    (sharedProducts.size > 0 ||
      (sharesEntity && sharedSubjectCount >= 2) ||
      sharedSubjectCount >= 3)
  ) return true;
  if (
    sharedIdentifiersInAnyTitle.size > 0 &&
    sharesEntity &&
    sharedActions.has("security-fix")
  ) return true;
  if (sharedTitleIdentifiers.size > 0) return true;
  if (
    leftAcquisitionRole &&
    leftAcquisitionRole === rightAcquisitionRole &&
    sharesEntity &&
    sharesActionFamily
  ) return true;
  if (
    leftLegalRole &&
    leftLegalRole === rightLegalRole &&
    sharedLegalIssues.size >= 1 &&
    sharesActionFamily
  ) return true;
  if (
    sharedProducts.size > 0 &&
    (sharesFeatureProduct || bothContextsSparse || sharesProductContext) &&
    (compatibleSubjectDetails || compatibleFeatureDetails) &&
    (sharesActionFamily || (
      oneActionMissing &&
      (sharesFeatureProduct || bothContextsSparse || sharesProductContext)
    ))
  ) return true;
  if (
    left.publisherKey !== right.publisherKey &&
    sharesEntity &&
    sharedFacets.size > 0 &&
    (sharedProducts.size > 0 || sharedSubjectCount >= 2) &&
    compatibleSubjectDetails
  ) return true;
  if (
    left.publisherKey !== right.publisherKey &&
    sharesEntity &&
    sharesActionFamily &&
    sharesNumericAnchor &&
    (sharedProducts.size > 0 || sharedSubjectCount >= 2) &&
    (compatibleSubjectDetails ||
      (sharedActions.has("legal") && subjectDetailsCompatible(
        leftSubjectTokens,
        rightSubjectTokens,
        LEGAL_PAYMENT_DETAIL_TOKENS,
      )) ||
      (["pricing-decrease", "pricing-increase"].some((action) => sharedActions.has(action)) &&
        subjectDetailsCompatible(
          leftSubjectTokens,
          rightSubjectTokens,
          PRICING_DETAIL_TOKENS,
        )))
  ) return true;
  if (
    left.publisherKey !== right.publisherKey &&
    sharesEntity &&
    sharesActionFamily &&
    sharedSubjectCount >= 3 &&
    subjectSimilarity >= 0.35 &&
    compatibleSubjectDetails
  ) return true;
  if (
    leftEventTokens.size >= 3 &&
    setsEqual(leftEventTokens, rightEventTokens) &&
    (left.publisherKey === right.publisherKey || sharesEntity || sharedProducts.size > 0 || sharedIdentifiers.size > 0)
  ) return true;
  if (left.publisherKey !== right.publisherKey) {
    return sharesEntity &&
      sharedSubjectCount >= 3 &&
      subjectSimilarity >= 0.35 &&
      compatibleSubjectDetails;
  }
  return sharedEventCount >= 3 && eventSimilarity >= 0.58;
}

export function deduplicateFeedItems(items) {
  if (!Array.isArray(items)) throw new Error("items must be an array.");
  const ordered = [...items].sort((left, right) =>
    left.title.localeCompare(right.title) || left.url.localeCompare(right.url) || left.sourceId.localeCompare(right.sourceId));
  const groups = [];
  for (const item of ordered) {
    const existing = groups.find((group) => group.items.every((candidate) => itemsMatch(item, candidate)));
    if (existing) existing.items.push(item);
    else groups.push({ items: [item] });
  }
  return groups.map((group) => {
    group.items.sort((left, right) =>
      relationshipRank(left.relationship) - relationshipRank(right.relationship) ||
      Date.parse(right.eligibility?.instant ?? right.updatedAt ?? right.publishedAt) -
        Date.parse(left.eligibility?.instant ?? left.updatedAt ?? left.publishedAt) ||
      left.sourceId.localeCompare(right.sourceId));
    const commonIdentifiers = group.items
      .map(strongIdentifiers)
      .reduce((common, identifiers) => common === null ? identifiers : setIntersection(common, identifiers), null);
    const identifier = [...(commonIdentifiers ?? [])].sort()[0];
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

function isOpinionItem(item) {
  return OPINION_TITLE_PATTERN.test(item.title) ||
    item.categories.some((category) => OPINION_CATEGORY_PATTERN.test(category));
}

function hasBroadScaleQuantitySignal(value) {
  const text = normalizeEventText(value, 4_000);
  return /(?:[$€£]\s*\d[\d,.]*(?:\s*(?:thousand|million|billion|trillion|k|m|bn|b|tn|t))?\b|\b\d[\d,.]*(?:\s*(?:thousand|million|billion|trillion|k|m|bn|b|tn|t))?\s*(?:dollars?|euros?|pounds?)\b)/i.test(text) ||
    /\b\d[\d,.]*\s*(?:%|pct\.?\b|percent\b|per\s+cent\b)/i.test(text) ||
    /\b(?:\d[\d,.]*(?:\s*(?:thousand|million|billion|trillion|k|m|bn|b|tn|t))?|hundreds?|thousands?|millions?|billions?)\s+(?:accounts?|customers?|devices?|employees?|jobs?|people|records?|roles?|staff|systems?|users?|workers?)\b/i.test(text);
}

function hasReviewedBroadImpactSignal(items) {
  const reviewedText = items
    .map((item) => `${item.title} ${item.summary} ${item.categories.join(" ")}`)
    .join(" ");
  return BROAD_IMPACT_TITLE_PATTERNS.some((pattern) => pattern.test(reviewedText)) ||
    strongIdentifiersForText(reviewedText).size > 0 ||
    hasBroadScaleQuantitySignal(reviewedText);
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
  const hasSponsoredMetadata = items.some((item) =>
    SPONSORED_METADATA_PATTERN.test(`${item.title} ${item.summary} ${item.categories.join(" ")}`) ||
    SPONSORED_PATH_PATTERN.test(new URL(item.url).pathname));
  if (
    hasSponsoredMetadata ||
    PROMOTIONAL_TITLE_PATTERNS.some((pattern) => pattern.test(titleCategoryText))
  ) {
    reasons.push(rejectionReason(
      "PROMOTIONAL_OR_DEAL_CONTENT",
      "Advertising, affiliate promotions, shopping deals, and sales content are not editorial candidates.",
    ));
  }
  if (items.some(isOpinionItem)) {
    reasons.push(rejectionReason(
      "OPINION_OR_COMMENTARY",
      "Opinion and commentary cannot serve as factual corroboration for the automatic paper.",
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
  if (
    ROUTINE_CLOUD_NOTICE_PATTERNS.some((pattern) => pattern.test(titleCategoryText)) &&
    !hasReviewedBroadImpactSignal(items)
  ) {
    reasons.push(rejectionReason(
      "ROUTINE_CLOUD_CAPACITY_NOTICE",
      "A routine cloud instance or regional-availability notice needs a reviewed broad-impact signal to enter the paper.",
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
  const hasBroadScaleQuantity = hasBroadScaleQuantitySignal(text);
  const hasStrongIdentifier = strongIdentifiers(group.items[0]).size > 0;
  const materialityNewsworthiness = Math.min(
    EDITORIAL_SCORECARD_MAXIMUMS.materialityNewsworthiness,
    8 + Math.min(16, countTerms(text, IMPACT_TERMS) * 4) +
      Math.min(4, countTerms(text, NOVELTY_TERMS) * 2) +
      (hasStrongIdentifier ? 3 : 0) + (hasBroadScaleQuantity ? 2 : 0),
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
      (hasStrongIdentifier ? 2 : 0) + (hasBroadScaleQuantity ? 2 : 0),
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
  const named = KNOWN_ENTITIES.find((entity) => {
    const expression = entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`\\b${expression}\\b`, "i").test(text);
  });
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
  const feedEvidence = [];
  const seenEvidenceSourceIds = new Set();
  for (const item of group.items) {
    if (feedEvidence.length >= 4) break;
    const source = sources.find((candidate) =>
      candidate.relationship !== "context" && candidate.url === item.url);
    if (!source || seenEvidenceSourceIds.has(source.id)) continue;
    seenEvidenceSourceIds.add(source.id);
    feedEvidence.push({
      sourceId: source.id,
      publisher: item.publisher,
      title: item.title,
      summary: item.summary,
      categories: item.categories.slice(0, 12),
      publishedAt: item.publishedAt,
    });
  }
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
    feedEvidence,
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
  const factualGroups = deduplicateFeedItems(eligibleItems.filter((item) => !isOpinionItem(item)));
  const opinionGroups = eligibleItems
    .filter(isOpinionItem)
    .sort((left, right) => left.itemId.localeCompare(right.itemId))
    .map((item) => ({
      canonicalEventKey: `free-${stableId("opinion-only", item.itemId)}`,
      items: [item],
    }));
  return [...factualGroups, ...opinionGroups].map((group) => {
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
      if (candidate.ranking.evidenceTier === "authoritative-single") {
        const materiality = candidate.ranking.components.materialityNewsworthiness;
        const usefulness = candidate.ranking.components.readerUsefulnessActionability;
        if (materiality < 20 || (materiality < 24 && usefulness < 8)) {
          reasons.push(rejectionReason(
            "AUTHORITATIVE_SINGLE_COMPONENT_FLOOR",
            `A single originating source needs materiality of at least 20 and usefulness of at least 8, unless materiality reaches 24; this candidate scored ${materiality} and ${usefulness}.`,
          ));
        }
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

function compareEligibleFeedItems(left, right) {
  return Date.parse(right.eligibility.instant) - Date.parse(left.eligibility.instant) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.itemId.localeCompare(right.itemId);
}

function selectSourceFairEligibleItems(results, maxTotalItems) {
  const queues = results
    .map((result) => ({
      sourceId: result.result.sourceId,
      items: [...result.items].sort(compareEligibleFeedItems),
      next: 0,
    }))
    .filter((queue) => queue.items.length > 0)
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const selected = [];
  while (selected.length < maxTotalItems) {
    const round = [];
    for (const queue of queues) {
      const item = queue.items[queue.next];
      if (!item) continue;
      round.push({ queue, item });
    }
    if (round.length === 0) break;
    const remaining = maxTotalItems - selected.length;
    if (round.length > remaining) {
      selected.push(...round
        .sort((left, right) => compareEligibleFeedItems(left.item, right.item))
        .slice(0, remaining)
        .map(({ item }) => item));
      break;
    }
    for (const { queue, item } of round) {
      queue.next += 1;
      selected.push(item);
    }
  }
  return selected.sort(compareEligibleFeedItems);
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
      if (availableBytes < perRequestMaxBytes && reservedBytes > 0) {
        // Do not give a queued source an artificially small body allowance
        // merely because other workers still hold worst-case reservations.
        // An in-flight worker will refund its unused bytes, then continue the
        // queue. The final source may use the genuine aggregate remainder.
        return;
      }
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
  const eligibleItemCount = results.reduce((sum, result) => sum + result.items.length, 0);
  // Keep downstream ranking bounded without allowing one high-volume source
  // to crowd every other reviewed source out of the candidate pool. The
  // checked-in source id provides a deterministic round-robin order. Complete
  // rounds are source-fair; if the final round is partial, its freshest items
  // win with source id and item id as stable tie-breakers.
  const items = selectSourceFairEligibleItems(results, maxTotalItems);
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
    eligibleItemCount,
    parsedItemCount,
    sourceResults,
    coverageByDesk,
    consumedBytes,
  };
}

/**
 * Collect one bounded feed-research snapshot without deciding whether the
 * edition-wide coverage gate passed. This lets trusted orchestration retain
 * diagnostics from a failed attempt for observability while keeping the
 * production research entry point fail-closed.
 */
export async function collectFreeResearchSnapshot(options = {}) {
  const {
    sources: _ignoredSources,
    evidencePolicy = DEFAULT_FREE_EVIDENCE_POLICY,
    ...runtimeOptions
  } = options;
  const normalizedEvidencePolicy = requireEvidencePolicy(evidencePolicy);
  // The production entry point always uses the reviewed, checked-in manifest.
  // Tests can exercise custom fixtures through ingestCuratedFeeds directly.
  const ingestion = await ingestCuratedFeeds({ ...runtimeOptions, sources: FREE_FEED_SOURCES });
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
      eligibleItemCount: ingestion.eligibleItemCount,
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

/**
 * Production research remains strict: a snapshot with insufficient desk
 * coverage is observable to callers that explicitly request collection, but
 * it can never proceed to edition drafting through this entry point.
 */
export async function researchFreeEdition(options = {}) {
  const research = await collectFreeResearchSnapshot(options);
  assertSufficientFeedCoverage(research.diagnostics.coverageByDesk);
  return research;
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
