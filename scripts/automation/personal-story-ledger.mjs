#!/usr/bin/env node

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { lstat, mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateCanonicalEdition } from "../edition-content.mjs";

export const PERSONAL_STORY_LEDGER_SCHEMA_VERSION = 2;
export const PERSONAL_STORY_LEDGER_RETENTION_DAYS = 30;
export const PERSONAL_STORY_LEDGER_MAX_BYTES = 256 * 1024;
export const PERSONAL_STORY_LEDGER_FINGERPRINT_ALGORITHM = "hmac-sha256-v1";
// Persist the current edition plus the 30 prior calendar dates. Before the
// current edition is recorded, this exposes exactly the previous 30 days to
// repeat matching.
export const PERSONAL_STORY_LEDGER_MAX_EDITIONS = 31;
export const PERSONAL_STORY_LEDGER_MAX_STORIES = 124;

const MAX_STORIES_PER_EDITION = 4;
const MAX_SOURCE_FINGERPRINTS = 8;
const MAX_TITLE_TOKEN_FINGERPRINTS = 12;
const MAX_RECORDED_EDITION_COUNT = 1_000_000;
const MINIMUM_FINGERPRINT_KEY_BYTES = 32;
const MAXIMUM_FINGERPRINT_KEY_BYTES = 4_096;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STRONG_IDENTIFIER_PATTERN = /\b(?:CVE-\d{4}-\d{4,}|GHSA-[a-z0-9-]{8,})\b/i;
const DESKS = Object.freeze([
  "ai",
  "work-and-tools",
  "security-and-privacy",
  "platforms-and-power",
]);
const DESK_ORDER = new Map(DESKS.map((desk, index) => [desk, index]));
const EVIDENCE_TIERS = new Set(["authoritative-single", "corroborated"]);
const TRACKING_PARAMETER = /^(?:utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid)$/i;
const STOP_WORDS = new Set([
  "a", "about", "after", "an", "and", "are", "as", "at", "be", "by",
  "for", "from", "has", "have", "how", "in", "into", "is", "it", "its",
  "new", "of", "on", "or", "our", "that", "the", "their", "this", "to",
  "using", "was", "we", "what", "when", "with", "you", "your",
]);

const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "retentionDays",
  "fingerprintAlgorithm",
  "keyCheckHmacSha256",
  "recordedEditionCount",
  "updatedThrough",
  "editions",
]);
const LEGACY_TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "retentionDays",
  "recordedEditionCount",
  "updatedThrough",
  "editions",
]);
const EDITION_KEYS = Object.freeze(["editionDate", "stories"]);
const STORY_KEYS = Object.freeze([
  "desk",
  "eventKeySha256",
  "sourceUrlSha256",
  "strongIdentifierSha256",
  "entitySha256",
  "titleTokenSha256",
  "score",
  "evidenceTier",
  "factualSourceCount",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new Error(`${label} contains missing or unsupported fields.`);
  }
}

function requireDate(value, label = "Date") {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const instant = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a real calendar date.`);
  }
  return value;
}

function dateEpoch(value) {
  return Date.parse(`${requireDate(value)}T00:00:00.000Z`);
}

function earliestRetainedDate(asOfDate) {
  return new Date(
    dateEpoch(asOfDate) - PERSONAL_STORY_LEDGER_RETENTION_DAYS * 86_400_000,
  ).toISOString().slice(0, 10);
}

function requireDigest(value, label) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 fingerprint.`);
  }
  return value;
}

function requireSortedUniqueDigests(value, label, { minimum = 0, maximum } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} has an invalid fingerprint count.`);
  }
  value.forEach((digest, index) => requireDigest(digest, `${label}[${index}]`));
  if (new Set(value).size !== value.length || value.some((digest, index) => index > 0 && value[index - 1] >= digest)) {
    throw new Error(`${label} fingerprints must be unique and canonically sorted.`);
  }
  return [...value];
}

function requireBoundedText(value, label, maximum) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requireFingerprintKey(value) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("A valid personal repeat-ledger fingerprint key is required.");
  }
  const byteLength = Buffer.byteLength(value, "utf8");
  if (
    byteLength < MINIMUM_FINGERPRINT_KEY_BYTES ||
    byteLength > MAXIMUM_FINGERPRINT_KEY_BYTES
  ) {
    throw new Error("A valid personal repeat-ledger fingerprint key is required.");
  }
  return value;
}

export function assertPersonalStoryLedgerFingerprintKey(value) {
  requireFingerprintKey(value);
  return true;
}

function derivedFingerprintKey(fingerprintKey) {
  const key = requireFingerprintKey(fingerprintKey);
  return createHmac("sha256", key)
    .update("first-fold:personal-story-ledger:v2:key-derivation\u0000repeat-identities", "utf8")
    .digest();
}

function hmacSha256(label, value, fingerprintKey) {
  return createHmac("sha256", derivedFingerprintKey(fingerprintKey))
    .update(`first-fold:personal-story-ledger:v2:${label}\u0000${value}`, "utf8")
    .digest("hex");
}

function fingerprintKeyCheck(fingerprintKey) {
  return createHmac("sha256", derivedFingerprintKey(fingerprintKey))
    .update("first-fold:personal-story-ledger:v2:key-check\u0000bound-ledger", "utf8")
    .digest("hex");
}

function requireMatchingFingerprintKey(keyCheck, fingerprintKey) {
  const stored = Buffer.from(requireDigest(keyCheck, "Personal story ledger key check"), "hex");
  const expected = Buffer.from(fingerprintKeyCheck(fingerprintKey), "hex");
  if (stored.length !== expected.length || !timingSafeEqual(stored, expected)) {
    throw new Error("The personal repeat-ledger fingerprint key does not match this ledger.");
  }
}

function normalizedIdentityText(value, label, maximum) {
  return requireBoundedText(value, label, maximum)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

function canonicalSourceUrl(value) {
  const raw = requireBoundedText(value, "Source URL", 2_048);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Source URL must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Source URL must be a valid HTTPS URL.");
  }
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMETER.test(key)) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  return parsed.href;
}

function normalizedEntity(value) {
  const normalized = normalizedIdentityText(value, "Primary entity", 120);
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

function normalizeTitleToken(token) {
  const aliases = { children: "child", layoffs: "layoff", laid: "layoff" };
  if (aliases[token]) return aliases[token];
  const compactMagnitude = /^(\d+)(?:m|bn|b)$/.exec(token);
  if (compactMagnitude) return compactMagnitude[1];
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("s") && !/(?:ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

function titleTokens(value) {
  const title = requireBoundedText(value, "Title", 240);
  const tokens = title
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .map(normalizeTitleToken)
    .filter((token) => token.length > 1 && !/^\d{4}$/.test(token));
  return [...new Set(tokens)].sort().slice(0, MAX_TITLE_TOKEN_FINGERPRINTS);
}

function normalizeStrongIdentifier(value) {
  if (value === null || value === undefined || value === "") return null;
  const candidate = requireBoundedText(value, "Strong identifier", 80);
  const match = candidate.match(STRONG_IDENTIFIER_PATTERN);
  if (!match || match[0].length !== candidate.length) {
    throw new Error("Strong identifier must be a CVE or GHSA identifier.");
  }
  return candidate.toLocaleLowerCase("en-US");
}

function extractStrongIdentifier(values) {
  for (const value of values.flat(Infinity)) {
    if (typeof value !== "string") continue;
    const match = value.slice(0, 20_000).match(STRONG_IDENTIFIER_PATTERN);
    if (match) return match[0].toLocaleLowerCase("en-US");
  }
  return null;
}

/**
 * Produces domain-separated HMAC-SHA-256 identities. No supplied cleartext or
 * reusable unkeyed digest is returned or persisted.
 */
export function fingerprintRepeatIdentity({
  canonicalEventKey,
  sourceUrls,
  strongIdentifier = null,
  primaryEntity,
  title,
} = {}, { fingerprintKey } = {}) {
  const normalizedEventKey = normalizedIdentityText(canonicalEventKey, "Canonical event key", 240);
  if (!Array.isArray(sourceUrls) || sourceUrls.length < 1 || sourceUrls.length > MAX_SOURCE_FINGERPRINTS) {
    throw new Error("sourceUrls must contain between one and eight factual source URLs.");
  }
  const normalizedUrls = [...new Set(sourceUrls.map(canonicalSourceUrl))].sort();
  if (normalizedUrls.length < 1 || normalizedUrls.length > MAX_SOURCE_FINGERPRINTS) {
    throw new Error("sourceUrls must contain between one and eight distinct factual source URLs.");
  }
  const identifier = normalizeStrongIdentifier(strongIdentifier);
  const tokens = titleTokens(title);
  if (tokens.length === 0) throw new Error("Title must contain at least one identifying token.");
  return {
    eventKeySha256: hmacSha256("event-key", normalizedEventKey, fingerprintKey),
    sourceUrlSha256: normalizedUrls
      .map((url) => hmacSha256("source-url", url, fingerprintKey))
      .sort(),
    strongIdentifierSha256: identifier === null
      ? null
      : hmacSha256("strong-identifier", identifier, fingerprintKey),
    entitySha256: hmacSha256("entity", normalizedEntity(primaryEntity), fingerprintKey),
    titleTokenSha256: tokens
      .map((token) => hmacSha256("title-token", token, fingerprintKey))
      .sort(),
  };
}

function factualSourceUrls(sources) {
  if (!Array.isArray(sources)) throw new Error("Story sources must be an array.");
  return sources
    .filter((source) => isObject(source) && source.relationship !== "context")
    .map((source) => source.url);
}

export function fingerprintFeedCandidate(candidate, { fingerprintKey } = {}) {
  if (!isObject(candidate)) throw new Error("Feed candidate must be an object.");
  return fingerprintRepeatIdentity({
    canonicalEventKey: candidate.canonicalEventKey,
    sourceUrls: factualSourceUrls(candidate.sources),
    strongIdentifier: extractStrongIdentifier([
      candidate.title,
      Array.isArray(candidate.verifiedFacts) ? candidate.verifiedFacts : [],
    ]),
    primaryEntity: candidate.primaryEntity,
    title: candidate.title,
  }, { fingerprintKey });
}

function inferEvidenceTier(story, factualSources) {
  const distinctUrls = new Set(factualSources.map((source) => canonicalSourceUrl(source.url)));
  if (distinctUrls.size >= 2) return "corroborated";
  if (distinctUrls.size === 1 && factualSources.some((source) => source.relationship === "originating")) {
    return "authoritative-single";
  }
  throw new Error("Story does not have authoritative or corroborated factual evidence.");
}

export function fingerprintPersonalStory(story, { fingerprintKey } = {}) {
  if (!isObject(story)) throw new Error("Personal story must be an object.");
  const factualSources = Array.isArray(story.sources)
    ? story.sources.filter((source) => isObject(source) && source.relationship !== "context")
    : [];
  const identity = fingerprintRepeatIdentity({
    canonicalEventKey: story.canonicalEventKey,
    sourceUrls: factualSources.map((source) => source.url),
    strongIdentifier: extractStrongIdentifier([
      story.headline,
      story.deck,
      story.whatHappened,
      story.whyItMatters,
      story.whatToDoOrWatch,
      Array.isArray(story.evidence) ? story.evidence.map((claim) => claim?.statement) : [],
    ]),
    primaryEntity: story.editorial?.primaryEntity,
    title: story.headline,
  }, { fingerprintKey });
  const score = story.selection?.score;
  if (!Number.isInteger(score) || score < 70 || score > 100) {
    throw new Error("Story score must be an integer between 70 and 100.");
  }
  return {
    desk: story.desk,
    ...identity,
    score,
    evidenceTier: inferEvidenceTier(story, factualSources),
    factualSourceCount: identity.sourceUrlSha256.length,
  };
}

export function createEmptyPersonalStoryLedger({
  recordedEditionCount = 0,
  fingerprintKey,
} = {}) {
  if (
    !Number.isInteger(recordedEditionCount) ||
    recordedEditionCount < 0 ||
    recordedEditionCount > MAX_RECORDED_EDITION_COUNT
  ) {
    throw new Error("Personal story ledger recordedEditionCount is invalid.");
  }
  return {
    schemaVersion: PERSONAL_STORY_LEDGER_SCHEMA_VERSION,
    retentionDays: PERSONAL_STORY_LEDGER_RETENTION_DAYS,
    fingerprintAlgorithm: PERSONAL_STORY_LEDGER_FINGERPRINT_ALGORITHM,
    keyCheckHmacSha256: fingerprintKeyCheck(fingerprintKey),
    recordedEditionCount,
    updatedThrough: null,
    editions: [],
  };
}

function canonicalStoryFingerprint(story, label) {
  requireExactKeys(story, STORY_KEYS, label);
  if (!DESK_ORDER.has(story.desk)) throw new Error(`${label}.desk is invalid.`);
  const canonical = {
    desk: story.desk,
    eventKeySha256: requireDigest(story.eventKeySha256, `${label}.eventKeySha256`),
    sourceUrlSha256: requireSortedUniqueDigests(story.sourceUrlSha256, `${label}.sourceUrlSha256`, {
      minimum: 1,
      maximum: MAX_SOURCE_FINGERPRINTS,
    }),
    strongIdentifierSha256: story.strongIdentifierSha256 === null
      ? null
      : requireDigest(story.strongIdentifierSha256, `${label}.strongIdentifierSha256`),
    entitySha256: requireDigest(story.entitySha256, `${label}.entitySha256`),
    titleTokenSha256: requireSortedUniqueDigests(story.titleTokenSha256, `${label}.titleTokenSha256`, {
      minimum: 1,
      maximum: MAX_TITLE_TOKEN_FINGERPRINTS,
    }),
    score: story.score,
    evidenceTier: story.evidenceTier,
    factualSourceCount: story.factualSourceCount,
  };
  if (!Number.isInteger(canonical.score) || canonical.score < 70 || canonical.score > 100) {
    throw new Error(`${label}.score is invalid.`);
  }
  if (!EVIDENCE_TIERS.has(canonical.evidenceTier)) throw new Error(`${label}.evidenceTier is invalid.`);
  if (
    !Number.isInteger(canonical.factualSourceCount) ||
    canonical.factualSourceCount !== canonical.sourceUrlSha256.length
  ) {
    throw new Error(`${label}.factualSourceCount is invalid.`);
  }
  if (canonical.evidenceTier === "corroborated" && canonical.factualSourceCount < 2) {
    throw new Error(`${label} claims corroboration without two factual URLs.`);
  }
  if (canonical.evidenceTier === "authoritative-single" && canonical.factualSourceCount !== 1) {
    throw new Error(`${label} has an invalid authoritative-single source count.`);
  }
  return canonical;
}

function canonicalizeLedgerContents(value, { asOfDate, prune = true } = {}) {
  if (
    !Number.isInteger(value.recordedEditionCount) ||
    value.recordedEditionCount < 0 ||
    value.recordedEditionCount > MAX_RECORDED_EDITION_COUNT
  ) {
    throw new Error("Personal story ledger recordedEditionCount is invalid.");
  }
  if (value.updatedThrough !== null) requireDate(value.updatedThrough, "updatedThrough");
  if (!Array.isArray(value.editions) || value.editions.length > PERSONAL_STORY_LEDGER_MAX_EDITIONS) {
    throw new Error("Personal story ledger contains too many editions.");
  }
  const effectiveAsOfDate = requireDate(asOfDate ?? value.updatedThrough ?? new Date().toISOString().slice(0, 10), "asOfDate");
  if (value.updatedThrough !== null && value.updatedThrough > effectiveAsOfDate) {
    throw new Error("Personal story ledger is from the future.");
  }

  const editions = [];
  let priorDate = null;
  let totalStories = 0;
  for (let editionIndex = 0; editionIndex < value.editions.length; editionIndex += 1) {
    const edition = value.editions[editionIndex];
    const label = `Personal story ledger edition ${editionIndex + 1}`;
    requireExactKeys(edition, EDITION_KEYS, label);
    const editionDate = requireDate(edition.editionDate, `${label}.editionDate`);
    if (editionDate > effectiveAsOfDate) throw new Error(`${label} is from the future.`);
    if (priorDate !== null && priorDate >= editionDate) {
      throw new Error("Personal story ledger editions must be unique and canonically sorted.");
    }
    priorDate = editionDate;
    if (!Array.isArray(edition.stories) || edition.stories.length < 1 || edition.stories.length > MAX_STORIES_PER_EDITION) {
      throw new Error(`${label} has an invalid story count.`);
    }
    const stories = edition.stories.map((story, storyIndex) =>
      canonicalStoryFingerprint(story, `${label} story ${storyIndex + 1}`));
    if (stories.some((story, index) => index > 0 && DESK_ORDER.get(stories[index - 1].desk) >= DESK_ORDER.get(story.desk))) {
      throw new Error(`${label} stories must have unique desks in canonical order.`);
    }
    const eventDigests = stories.map((story) => story.eventKeySha256);
    if (new Set(eventDigests).size !== eventDigests.length) {
      throw new Error(`${label} repeats an event fingerprint.`);
    }
    totalStories += stories.length;
    editions.push({ editionDate, stories });
  }
  if (totalStories > PERSONAL_STORY_LEDGER_MAX_STORIES) {
    throw new Error("Personal story ledger contains too many stories.");
  }
  if (value.recordedEditionCount < editions.length) {
    throw new Error("Personal story ledger recordedEditionCount is inconsistent.");
  }
  const lastRecordedDate = editions.at(-1)?.editionDate ?? null;
  if (lastRecordedDate !== null && (value.updatedThrough === null || value.updatedThrough < lastRecordedDate)) {
    throw new Error("Personal story ledger updatedThrough is inconsistent.");
  }

  const cutoff = earliestRetainedDate(effectiveAsOfDate);
  const retainedEditions = prune
    ? editions.filter((edition) => edition.editionDate >= cutoff)
    : editions;
  return {
    recordedEditionCount: value.recordedEditionCount,
    updatedThrough: value.updatedThrough,
    editions: retainedEditions,
  };
}

function canonicalizeLedger(value, { asOfDate, prune = true, fingerprintKey } = {}) {
  requireExactKeys(value, TOP_LEVEL_KEYS, "Personal story ledger");
  if (value.schemaVersion !== PERSONAL_STORY_LEDGER_SCHEMA_VERSION) {
    throw new Error("Personal story ledger schemaVersion is unsupported.");
  }
  if (value.retentionDays !== PERSONAL_STORY_LEDGER_RETENTION_DAYS) {
    throw new Error("Personal story ledger retentionDays is invalid.");
  }
  if (value.fingerprintAlgorithm !== PERSONAL_STORY_LEDGER_FINGERPRINT_ALGORITHM) {
    throw new Error("Personal story ledger fingerprintAlgorithm is unsupported.");
  }
  requireMatchingFingerprintKey(value.keyCheckHmacSha256, fingerprintKey);
  return {
    schemaVersion: PERSONAL_STORY_LEDGER_SCHEMA_VERSION,
    retentionDays: PERSONAL_STORY_LEDGER_RETENTION_DAYS,
    fingerprintAlgorithm: PERSONAL_STORY_LEDGER_FINGERPRINT_ALGORITHM,
    keyCheckHmacSha256: value.keyCheckHmacSha256,
    ...canonicalizeLedgerContents(value, { asOfDate, prune }),
  };
}

function canonicalizeLegacyLedger(value, { asOfDate, prune = true } = {}) {
  requireExactKeys(value, LEGACY_TOP_LEVEL_KEYS, "Legacy personal story ledger");
  if (value.schemaVersion !== 1) {
    throw new Error("Legacy personal story ledger schemaVersion is unsupported.");
  }
  if (value.retentionDays !== PERSONAL_STORY_LEDGER_RETENTION_DAYS) {
    throw new Error("Legacy personal story ledger retentionDays is invalid.");
  }
  return {
    schemaVersion: 1,
    retentionDays: PERSONAL_STORY_LEDGER_RETENTION_DAYS,
    ...canonicalizeLedgerContents(value, { asOfDate, prune }),
  };
}

/** Returns a validated, canonical clone and removes entries at least 30 days old. */
export function validatePersonalStoryLedger(value, options = {}) {
  return canonicalizeLedger(value, options);
}

export function prunePersonalStoryLedger(value, { asOfDate, fingerprintKey } = {}) {
  return canonicalizeLedger(value, { asOfDate, prune: true, fingerprintKey });
}

export function parsePersonalStoryLedger(text, { asOfDate, fingerprintKey } = {}) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > PERSONAL_STORY_LEDGER_MAX_BYTES) {
    throw new Error("Personal story ledger exceeds the byte limit.");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Personal story ledger is not valid JSON.");
  }
  return canonicalizeLedger(parsed, { asOfDate, prune: true, fingerprintKey });
}

export function serializePersonalStoryLedger(value, { asOfDate, fingerprintKey } = {}) {
  const canonical = canonicalizeLedger(value, { asOfDate, prune: true, fingerprintKey });
  const serialized = `${JSON.stringify(canonical, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > PERSONAL_STORY_LEDGER_MAX_BYTES) {
    throw new Error("Personal story ledger exceeds the byte limit.");
  }
  return serialized;
}

export function buildPersonalRepeatHistory(value, { asOfDate, fingerprintKey } = {}) {
  const ledger = canonicalizeLedger(value, { asOfDate, prune: true, fingerprintKey });
  const entries = ledger.editions.flatMap((edition) => edition.stories.map((story) => ({
    editionDate: edition.editionDate,
    desk: story.desk,
    eventKeySha256: story.eventKeySha256,
    sourceUrlSha256: [...story.sourceUrlSha256],
    strongIdentifierSha256: story.strongIdentifierSha256,
    entitySha256: story.entitySha256,
    titleTokenSha256: [...story.titleTokenSha256],
    score: story.score,
    evidenceTier: story.evidenceTier,
    factualSourceCount: story.factualSourceCount,
  })));
  const stateSha256 = createHash("sha256")
    .update(serializePersonalStoryLedger(ledger, { asOfDate, fingerprintKey }), "utf8")
    .digest("hex");
  return {
    entries,
    priorEditionCount: ledger.recordedEditionCount,
    priorStoryCount: entries.length,
    nextPilotOrdinal: ledger.recordedEditionCount < 5 ? ledger.recordedEditionCount + 1 : null,
    stateSha256,
  };
}

export function updatePersonalStoryLedger(
  value,
  edition,
  { asOfDate = edition?.editionDate, fingerprintKey } = {},
) {
  const editionDate = requireDate(edition?.editionDate, "Candidate editionDate");
  if (editionDate !== requireDate(asOfDate, "asOfDate")) {
    throw new Error("Candidate editionDate must match asOfDate.");
  }
  const ledger = canonicalizeLedger(value, {
    asOfDate: editionDate,
    prune: true,
    fingerprintKey,
  });
  if (ledger.updatedThrough !== null && editionDate < ledger.updatedThrough) {
    throw new Error("Candidate edition predates the ledger's latest recorded edition.");
  }
  if (!isObject(edition.desks)) throw new Error("Candidate edition has no desks.");
  const stories = DESKS
    .map((desk) => edition.desks[desk]?.story)
    .filter((story) => story !== null && story !== undefined)
    .map((story) => fingerprintPersonalStory(story, { fingerprintKey }))
    .sort((left, right) => DESK_ORDER.get(left.desk) - DESK_ORDER.get(right.desk));
  if (stories.length < 1 || stories.length > MAX_STORIES_PER_EDITION) {
    throw new Error("Candidate edition must contain between one and four selected stories.");
  }
  if (new Set(stories.map((story) => story.desk)).size !== stories.length) {
    throw new Error("Candidate edition repeats a desk.");
  }

  const existing = ledger.editions.find((item) => item.editionDate === editionDate);
  if (existing) {
    const same = JSON.stringify(existing.stories) === JSON.stringify(stories);
    if (!same) throw new Error("Ledger already contains a different edition for this date.");
    return ledger;
  }
  const next = {
    ...ledger,
    recordedEditionCount: ledger.recordedEditionCount + 1,
    updatedThrough: editionDate,
    editions: [...ledger.editions, { editionDate, stories }],
  };
  return canonicalizeLedger(next, {
    asOfDate: editionDate,
    prune: true,
    fingerprintKey,
  });
}

async function readBoundedRegularFile(filename, maximumBytes, label) {
  let metadata;
  try {
    metadata = await lstat(filename);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} must be a regular file.`);
  if (metadata.size > maximumBytes) throw new Error(`${label} exceeds the byte limit.`);
  return readFile(filename, "utf8");
}

async function writeAtomic(filename, text) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, filename);
}

function parseCliOptions(args, requiredNames, allowedNames = requiredNames) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!allowedNames.includes(name) || value === undefined || Object.hasOwn(values, name)) {
      throw new Error("Ledger CLI options are invalid.");
    }
    values[name] = value;
  }
  if (requiredNames.some((name) => !Object.hasOwn(values, name))) {
    throw new Error("Ledger CLI options are incomplete.");
  }
  return values;
}

function parseLegacyPersonalStoryLedger(text, { asOfDate } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Legacy personal story ledger is not valid JSON.");
  }
  return canonicalizeLegacyLedger(parsed, { asOfDate, prune: true });
}

export async function runPersonalStoryLedgerCli(
  args,
  { stdout = process.stdout, env = process.env } = {},
) {
  if (!Array.isArray(args) || args.length < 1) throw new Error("Ledger CLI command is required.");
  const command = args[0];
  if (command === "prepare") {
    if (![6, 7, 8, 9].includes(args.length)) {
      throw new Error("prepare requires a ledger path, edition date, and rollout date.");
    }
    const ledgerPath = requireBoundedText(args[1], "Ledger path", 4_096);
    const optionArgs = args.slice(2);
    const bootstrapFlags = optionArgs.filter((value) => value === "--allow-bootstrap");
    if (bootstrapFlags.length > 1) throw new Error("Ledger CLI options are invalid.");
    const allowBootstrap = bootstrapFlags.length === 1;
    const options = parseCliOptions(
      optionArgs.filter((value) => value !== "--allow-bootstrap"),
      ["--edition-date", "--rollout-date"],
      ["--edition-date", "--rollout-date", "--recorded-edition-count"],
    );
    const editionDate = requireDate(options["--edition-date"], "edition date");
    const rolloutDate = requireDate(options["--rollout-date"], "rollout date");
    const fingerprintKey = requireFingerprintKey(env.CLOUDFLARE_AI_API_TOKEN);
    const requestedRecordedEditionCount = options["--recorded-edition-count"] === undefined
      ? null
      : Number(options["--recorded-edition-count"]);
    if (
      requestedRecordedEditionCount !== null &&
      (
        !Number.isSafeInteger(requestedRecordedEditionCount) ||
        requestedRecordedEditionCount < 0 ||
        requestedRecordedEditionCount > MAX_RECORDED_EDITION_COUNT ||
        !allowBootstrap
      )
    ) {
      throw new Error("A bootstrap recorded-edition count requires a valid guarded bootstrap.");
    }
    const text = await readBoundedRegularFile(ledgerPath, PERSONAL_STORY_LEDGER_MAX_BYTES, "Personal story ledger");
    if (text === null && editionDate !== rolloutDate && !(allowBootstrap && editionDate > rolloutDate)) {
      throw new Error("Personal story ledger is missing after the rollout date.");
    }
    if (text !== null && requestedRecordedEditionCount !== null) {
      throw new Error("A bootstrap recorded-edition count cannot replace an existing ledger.");
    }
    let ledger;
    let migratedLegacyLedger = false;
    if (text === null) {
      ledger = createEmptyPersonalStoryLedger({
        recordedEditionCount: requestedRecordedEditionCount ?? 0,
        fingerprintKey,
      });
    } else {
      let schemaVersion;
      try {
        schemaVersion = JSON.parse(text)?.schemaVersion;
      } catch {
        throw new Error("Personal story ledger is not valid JSON.");
      }
      if (schemaVersion === 1) {
        const legacy = parseLegacyPersonalStoryLedger(text, { asOfDate: editionDate });
        ledger = createEmptyPersonalStoryLedger({
          recordedEditionCount: legacy.recordedEditionCount,
          fingerprintKey,
        });
        migratedLegacyLedger = true;
      } else {
        ledger = parsePersonalStoryLedger(text, { asOfDate: editionDate, fingerprintKey });
      }
    }
    const serialized = serializePersonalStoryLedger(ledger, {
      asOfDate: editionDate,
      fingerprintKey,
    });
    await writeAtomic(ledgerPath, serialized);
    const history = buildPersonalRepeatHistory(ledger, { asOfDate: editionDate, fingerprintKey });
    if (migratedLegacyLedger) {
      stdout.write(
        "Migrated the legacy unkeyed repeat ledger to keyed HMAC fingerprints; prior unkeyed story identities were discarded.\n",
      );
    }
    stdout.write(
      `Prepared personal repeat ledger through ${editionDate}: ${history.priorEditionCount} editions, ${history.priorStoryCount} stories.\n`,
    );
    return ledger;
  }
  if (command === "record") {
    if (args.length !== 5) throw new Error("record requires ledger path, candidate path, and edition date.");
    const ledgerPath = requireBoundedText(args[1], "Ledger path", 4_096);
    const candidatePath = requireBoundedText(args[2], "Candidate path", 4_096);
    const options = parseCliOptions(args.slice(3), ["--edition-date"]);
    const editionDate = requireDate(options["--edition-date"], "edition date");
    const fingerprintKey = requireFingerprintKey(env.CLOUDFLARE_AI_API_TOKEN);
    const ledgerText = await readBoundedRegularFile(
      ledgerPath,
      PERSONAL_STORY_LEDGER_MAX_BYTES,
      "Personal story ledger",
    );
    if (ledgerText === null) throw new Error("Personal story ledger is missing.");
    const candidateText = await readBoundedRegularFile(candidatePath, 1024 * 1024, "Candidate edition");
    if (candidateText === null) throw new Error("Candidate edition is missing.");
    let candidate;
    try {
      candidate = JSON.parse(candidateText);
    } catch {
      throw new Error("Candidate edition is not valid JSON.");
    }
    const validation = validateCanonicalEdition(candidate);
    if (!validation.valid) throw new Error("Candidate edition is not a valid canonical edition.");
    if (candidate.editionDate !== editionDate) throw new Error("Candidate editionDate does not match the CLI edition date.");
    const ledger = parsePersonalStoryLedger(ledgerText, { asOfDate: editionDate, fingerprintKey });
    const updated = updatePersonalStoryLedger(ledger, candidate, {
      asOfDate: editionDate,
      fingerprintKey,
    });
    await writeAtomic(
      ledgerPath,
      serializePersonalStoryLedger(updated, { asOfDate: editionDate, fingerprintKey }),
    );
    const history = buildPersonalRepeatHistory(updated, {
      asOfDate: editionDate,
      fingerprintKey,
    });
    stdout.write(
      `Recorded personal repeat ledger for ${editionDate}: ${history.priorEditionCount} editions, ${history.priorStoryCount} stories.\n`,
    );
    return updated;
  }
  throw new Error("Ledger CLI command is unsupported.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runPersonalStoryLedgerCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`Personal story ledger failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
