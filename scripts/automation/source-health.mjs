import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { FREE_DESKS } from "./free/feed-engine.mjs";
import { FREE_FEED_SOURCES } from "./free/feed-sources.mjs";

export const SOURCE_HEALTH_SCHEMA_VERSION = "first-fold-source-health-v1";
export const SOURCE_HEALTH_MAX_JSON_BYTES = 256 * 1024;
export const SOURCE_HEALTH_MAX_HTML_BYTES = 512 * 1024;

const EXPECTED_REPOSITORY = "itworksinprod/first-fold";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RUN_ID_PATTERN = /^[1-9]\d{0,39}$/;
const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_COUNT = 1_000_000;
const REQUIRED_PUBLISHER_COUNT = 2;
const RUN_MODES = new Set(["on_time", "same_day_backfill"]);
const EVIDENCE_POLICIES = new Set(["corroborated", "authoritative-or-corroborated"]);
const RESEARCH_OUTCOMES = new Set([
  "not-needed",
  "improved",
  "no-improvement",
  "coverage-fallback",
  "failed",
]);
const ATTEMPT_STATUSES = new Set([
  "healthy",
  "healthy-quiet",
  "degraded",
  "degraded-quiet",
  "ingestion-failure",
  "research-failure",
]);
const SOURCE_STATUSES = new Set(["ok", "failed", "not-observed"]);
const COVERAGE_STATUSES = new Set([
  "covered",
  "insufficient-corroboration",
  "not-observed",
]);
const SOURCE_FAILURE_CODES = new Set([
  "BODY_INVALID",
  "BODY_TOO_LARGE",
  "CONTENT_TYPE_INVALID",
  "DNS_EMPTY",
  "DNS_FAILED",
  "DNS_UNSAFE",
  "ENCODING_UNSUPPORTED",
  "FEED_EMPTY_OR_UNPARSEABLE",
  "FEED_FAILED",
  "HOST_NOT_ALLOWED",
  "HOST_UNSAFE",
  "HTTP_STATUS",
  "JSON_INVALID",
  "JSON_SHAPE_INVALID",
  "REDIRECT_INVALID",
  "REDIRECT_LIMIT",
  "REQUEST_FAILED",
  "STATUS_INVALID",
  "TIMEOUT",
  "TOTAL_BODY_LIMIT",
  "TOTAL_ITEM_LIMIT",
  "URL_INVALID",
  "URL_TOO_LONG",
  "URL_UNSAFE",
  "XML_COMPLEXITY",
  "XML_DTD_REJECTED",
  "XML_SHAPE_INVALID",
]);
const REJECTION_CODES = new Set([
  "BELOW_EDITORIAL_THRESHOLD",
  "INSUFFICIENT_SOURCE_EVIDENCE",
  "INSUFFICIENT_TOPICALITY",
  "OPINION_OR_COMMENTARY",
  "OTHER_REJECTION",
  "PROMOTIONAL_OR_DEAL_CONTENT",
  "RECENT_DUPLICATE",
  "REVIEW_OR_LIFESTYLE_CONTENT",
  "ROUTINE_OR_MINOR_ANNOUNCEMENT",
  "SPECULATIVE_OR_RUMOR",
]);

const DESK_LABELS = Object.freeze({
  ai: "AI & Models",
  "work-and-tools": "Work & Tools",
  "security-and-privacy": "Security & Privacy",
  "platforms-and-power": "Platforms & Power",
});

const SOURCE_METADATA = Object.freeze(FREE_FEED_SOURCES.map((source) => Object.freeze({
  sourceId: source.id,
  publisherKey: source.publisherKey,
  publisher: source.publisher,
  desks: Object.freeze(FREE_DESKS.filter((desk) => source.coverageDesks.includes(desk))),
  relationship: source.relationship,
})));
const SOURCE_BY_ID = new Map(SOURCE_METADATA.map((source) => [source.sourceId, source]));

const TOP_LEVEL_KEYS = [
  "schemaVersion",
  "editionDate",
  "run",
  "settings",
  "attempts",
  "selectedAttempt",
  "outcome",
];
const RUN_KEYS = ["repository", "runId", "runUrl", "mode"];
const SETTINGS_KEYS = [
  "evidencePolicy",
  "lookbackHours",
  "minimumScore",
  "minimumAuthoritativeScore",
  "draftSelectedSlate",
  "maxResearchAttempts",
  "researchRetryBelowStoryCount",
];
const ATTEMPT_KEYS = ["number", "status", "code", "aggregate", "desks", "sources"];
const AGGREGATE_KEYS = [
  "configuredSourceCount",
  "successfulSourceCount",
  "failedSourceCount",
  "unobservedSourceCount",
  "parsedItemCount",
  "eligibleItemCount",
  "candidateCount",
  "rankedCandidateCount",
  "rejectedCandidateCount",
  "selectedCount",
  "rejectionCounts",
];
const REJECTION_KEYS = ["code", "count"];
const DESK_KEYS = [
  "desk",
  "configuredSourceCount",
  "configuredPublisherCount",
  "successfulSourceCount",
  "successfulPublisherCount",
  "failedSourceCount",
  "unobservedSourceCount",
  "requiredPublisherCount",
  "coverageStatus",
  "shortlistCount",
  "selectedCount",
];
const SOURCE_KEYS = [
  "sourceId",
  "publisherKey",
  "publisher",
  "desks",
  "relationship",
  "status",
  "code",
  "parsedItemCount",
  "eligibleItemCount",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} contains unexpected or missing fields.`);
  }
  return value;
}

function requireCount(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_COUNT) {
    throw new Error(`${label} must be an integer from 0 through ${MAX_COUNT}.`);
  }
  return value;
}

function requireScore(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be a finite number from 0 through 100.`);
  }
  return value;
}

function requireEditionDate(value) {
  if (!DATE_PATTERN.test(value ?? "")) throw new Error("Source health editionDate must use YYYY-MM-DD.");
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error("Source health editionDate must be a real calendar date.");
  }
  return value;
}

function safeSourceFailureCode(value) {
  return typeof value === "string" && SOURCE_FAILURE_CODES.has(value) ? value : "FEED_FAILED";
}

function safeRejectionCode(value) {
  return typeof value === "string" && REJECTION_CODES.has(value) ? value : "OTHER_REJECTION";
}

export function sourceHealthFailureCode(error) {
  if (typeof error?.code === "string" && SOURCE_FAILURE_CODES.has(error.code)) return error.code;
  if (error?.code === "DESK_COVERAGE_FAILED") return "DESK_COVERAGE_FAILED";
  return "RESEARCH_FAILED";
}

function normalizedSettings(settings) {
  assertExactKeys(settings, SETTINGS_KEYS, "Source health settings");
  if (!EVIDENCE_POLICIES.has(settings.evidencePolicy)) {
    throw new Error("Source health settings contain an invalid evidence policy.");
  }
  if (!Number.isInteger(settings.lookbackHours) || settings.lookbackHours < 1 || settings.lookbackHours > 168) {
    throw new Error("Source health lookbackHours must be an integer from 1 through 168.");
  }
  requireScore(settings.minimumScore, "Source health minimumScore");
  requireScore(settings.minimumAuthoritativeScore, "Source health minimumAuthoritativeScore");
  if (typeof settings.draftSelectedSlate !== "boolean") {
    throw new Error("Source health draftSelectedSlate must be boolean.");
  }
  if (![1, 2].includes(settings.maxResearchAttempts)) {
    throw new Error("Source health maxResearchAttempts must be 1 or 2.");
  }
  if (
    !Number.isInteger(settings.researchRetryBelowStoryCount) ||
    settings.researchRetryBelowStoryCount < 0 ||
    settings.researchRetryBelowStoryCount > FREE_DESKS.length ||
    (settings.maxResearchAttempts === 1 && settings.researchRetryBelowStoryCount !== 0)
  ) {
    throw new Error("Source health researchRetryBelowStoryCount is invalid.");
  }
  return { ...settings };
}

function normalizedRun(automation, runMode) {
  if (!isObject(automation)) throw new Error("Source health requires trusted GitHub automation metadata.");
  const repository = automation.repository;
  const runId = automation.runId;
  const runUrl = automation.runUrl;
  if (
    repository !== EXPECTED_REPOSITORY ||
    typeof runId !== "string" ||
    !RUN_ID_PATTERN.test(runId) ||
    runUrl !== `https://github.com/${EXPECTED_REPOSITORY}/actions/runs/${runId}` ||
    !RUN_MODES.has(runMode)
  ) {
    throw new Error("Source health requires the trusted First Fold GitHub run identity.");
  }
  return { repository, runId, runUrl, mode: runMode };
}

function normalizeRejectionCounts(value) {
  if (value === undefined) return [];
  if (!isObject(value)) throw new Error("Source health rejectionCounts must be an object.");
  const counts = new Map();
  for (const [rawCode, rawCount] of Object.entries(value)) {
    const code = safeRejectionCode(rawCode);
    counts.set(code, (counts.get(code) ?? 0) + requireCount(rawCount, `Rejection count ${code}`));
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => ({ code, count }));
}

function buildUnobservedAttempt(number, rawAttempt) {
  // No source observations exist, so even a caller-supplied uppercase error
  // is reduced to the fixed public code rather than becoming a covert label.
  void rawAttempt;
  const code = "RESEARCH_FAILED";
  const sources = SOURCE_METADATA.map((source) => ({
    ...source,
    desks: [...source.desks],
    status: "not-observed",
    code: null,
    parsedItemCount: 0,
    eligibleItemCount: 0,
  }));
  const desks = FREE_DESKS.map((desk) => {
    const configured = SOURCE_METADATA.filter((source) => source.desks.includes(desk));
    return {
      desk,
      configuredSourceCount: configured.length,
      configuredPublisherCount: new Set(configured.map((source) => source.publisherKey)).size,
      successfulSourceCount: 0,
      successfulPublisherCount: 0,
      failedSourceCount: 0,
      unobservedSourceCount: configured.length,
      requiredPublisherCount: REQUIRED_PUBLISHER_COUNT,
      coverageStatus: "not-observed",
      shortlistCount: 0,
      selectedCount: 0,
    };
  });
  return {
    number,
    status: "research-failure",
    code,
    aggregate: {
      configuredSourceCount: SOURCE_METADATA.length,
      successfulSourceCount: 0,
      failedSourceCount: 0,
      unobservedSourceCount: SOURCE_METADATA.length,
      parsedItemCount: 0,
      eligibleItemCount: 0,
      candidateCount: 0,
      rankedCandidateCount: 0,
      rejectedCandidateCount: 0,
      selectedCount: 0,
      rejectionCounts: [],
    },
    desks,
    sources,
  };
}

function buildObservedAttempt(number, research) {
  if (!isObject(research) || !isObject(research.diagnostics)) {
    throw new Error(`Source health attempt ${number} is missing research diagnostics.`);
  }
  const rawResults = research.diagnostics.sourceResults;
  if (!Array.isArray(rawResults) || rawResults.length !== SOURCE_METADATA.length) {
    throw new Error(`Source health attempt ${number} must report every checked-in source exactly once.`);
  }
  const resultById = new Map();
  for (const result of rawResults) {
    if (!isObject(result) || typeof result.sourceId !== "string" || resultById.has(result.sourceId)) {
      throw new Error(`Source health attempt ${number} contains an invalid or duplicate source result.`);
    }
    const metadata = SOURCE_BY_ID.get(result.sourceId);
    if (!metadata || result.publisherKey !== metadata.publisherKey) {
      throw new Error(`Source health attempt ${number} contains an unreviewed source result.`);
    }
    resultById.set(result.sourceId, result);
  }
  const sources = SOURCE_METADATA.map((metadata) => {
    const result = resultById.get(metadata.sourceId);
    if (!result || !["ok", "failed"].includes(result.status)) {
      throw new Error(`Source health attempt ${number} contains an invalid source status.`);
    }
    const parsedItemCount = requireCount(
      result.parsedItemCount,
      `Source health parsed count for ${metadata.sourceId}`,
    );
    const eligibleItemCount = requireCount(
      result.eligibleItemCount,
      `Source health eligible count for ${metadata.sourceId}`,
    );
    if (eligibleItemCount > parsedItemCount || (result.status === "failed" && (parsedItemCount || eligibleItemCount))) {
      throw new Error(`Source health counts for ${metadata.sourceId} are inconsistent.`);
    }
    return {
      ...metadata,
      desks: [...metadata.desks],
      status: result.status,
      code: result.status === "failed" ? safeSourceFailureCode(result.code) : null,
      parsedItemCount,
      eligibleItemCount,
    };
  });
  const desks = FREE_DESKS.map((desk) => {
    const configured = sources.filter((source) => source.desks.includes(desk));
    const successful = configured.filter((source) => source.status === "ok");
    const failed = configured.filter((source) => source.status === "failed");
    const successfulPublisherCount = new Set(successful.map((source) => source.publisherKey)).size;
    const rawDesk = research.desks?.[desk];
    if (!isObject(rawDesk) || !Array.isArray(rawDesk.candidates)) {
      throw new Error(`Source health attempt ${number} is missing the ${desk} shortlist.`);
    }
    if (rawDesk.selectedCandidate !== null && !isObject(rawDesk.selectedCandidate)) {
      throw new Error(`Source health attempt ${number} contains an invalid ${desk} selection.`);
    }
    const selectedCount = rawDesk.selectedCandidate === null ? 0 : 1;
    return {
      desk,
      configuredSourceCount: configured.length,
      configuredPublisherCount: new Set(configured.map((source) => source.publisherKey)).size,
      successfulSourceCount: successful.length,
      successfulPublisherCount,
      failedSourceCount: failed.length,
      unobservedSourceCount: 0,
      requiredPublisherCount: REQUIRED_PUBLISHER_COUNT,
      coverageStatus: successfulPublisherCount >= REQUIRED_PUBLISHER_COUNT
        ? "covered"
        : "insufficient-corroboration",
      shortlistCount: requireCount(rawDesk.candidates.length, `Source health shortlist count for ${desk}`),
      selectedCount,
    };
  });
  const parsedItemCount = sources.reduce((sum, source) => sum + source.parsedItemCount, 0);
  const eligibleItemCount = sources.reduce((sum, source) => sum + source.eligibleItemCount, 0);
  const candidateCount = requireCount(
    research.diagnostics.candidateCount ?? research.candidates?.length ?? 0,
    "Source health candidateCount",
  );
  const rankedCandidateCount = requireCount(
    research.diagnostics.rankedCandidateCount ?? candidateCount,
    "Source health rankedCandidateCount",
  );
  const rejectedCandidateCount = requireCount(
    research.diagnostics.rejectedCandidateCount ?? 0,
    "Source health rejectedCandidateCount",
  );
  const selectedCount = desks.reduce((sum, desk) => sum + desk.selectedCount, 0);
  const rejectionCounts = normalizeRejectionCounts(research.diagnostics.rejectionCounts);
  if (
    research.diagnostics.parsedItemCount !== undefined &&
    research.diagnostics.parsedItemCount !== parsedItemCount
  ) {
    throw new Error(`Source health attempt ${number} parsed count does not match its sources.`);
  }
  if (
    research.diagnostics.eligibleItemCount !== undefined &&
    research.diagnostics.eligibleItemCount !== eligibleItemCount
  ) {
    throw new Error(`Source health attempt ${number} eligible count does not match its sources.`);
  }
  if (
    research.diagnostics.selectedCount !== undefined &&
    research.diagnostics.selectedCount !== selectedCount
  ) {
    throw new Error(`Source health attempt ${number} selected count does not match its desks.`);
  }
  if (rankedCandidateCount < candidateCount || selectedCount > candidateCount || candidateCount > eligibleItemCount) {
    throw new Error(`Source health attempt ${number} aggregate candidate counts are inconsistent.`);
  }
  const hasCoverageFailure = desks.some((desk) => desk.coverageStatus !== "covered");
  const hasSourceFailure = sources.some((source) => source.status === "failed");
  const status = hasCoverageFailure
    ? "ingestion-failure"
    : selectedCount === 0
      ? hasSourceFailure ? "degraded-quiet" : "healthy-quiet"
      : hasSourceFailure ? "degraded" : "healthy";
  return {
    number,
    status,
    code: hasCoverageFailure ? "DESK_COVERAGE_FAILED" : null,
    aggregate: {
      configuredSourceCount: sources.length,
      successfulSourceCount: sources.filter((source) => source.status === "ok").length,
      failedSourceCount: sources.filter((source) => source.status === "failed").length,
      unobservedSourceCount: 0,
      parsedItemCount,
      eligibleItemCount,
      candidateCount,
      rankedCandidateCount,
      rejectedCandidateCount,
      selectedCount,
      rejectionCounts,
    },
    desks,
    sources,
  };
}

function buildAttempt(number, rawAttempt) {
  if (!isObject(rawAttempt)) throw new Error(`Source health attempt ${number} must be an object.`);
  if (isObject(rawAttempt.research)) return buildObservedAttempt(number, rawAttempt.research);
  return buildUnobservedAttempt(number, rawAttempt);
}

export function buildSourceHealthSnapshot({
  editionDate,
  automation,
  runMode,
  settings,
  attempts,
  selectedAttempt,
  outcome,
} = {}) {
  if (!Array.isArray(attempts) || attempts.length < 1 || attempts.length > 2) {
    throw new Error("Source health requires one or two bounded research attempts.");
  }
  const snapshot = {
    schemaVersion: SOURCE_HEALTH_SCHEMA_VERSION,
    editionDate: requireEditionDate(editionDate),
    run: normalizedRun(automation, runMode),
    settings: normalizedSettings(settings),
    attempts: attempts.map((attempt, index) => buildAttempt(index + 1, attempt)),
    selectedAttempt,
    outcome,
  };
  return validateSourceHealthSnapshot(snapshot);
}

function validateSource(source, expected, attemptNumber) {
  assertExactKeys(source, SOURCE_KEYS, `Source health source in attempt ${attemptNumber}`);
  if (
    source.sourceId !== expected.sourceId ||
    source.publisherKey !== expected.publisherKey ||
    source.publisher !== expected.publisher ||
    source.relationship !== expected.relationship ||
    !Array.isArray(source.desks) ||
    source.desks.length !== expected.desks.length ||
    source.desks.some((desk, index) => desk !== expected.desks[index]) ||
    !SOURCE_STATUSES.has(source.status)
  ) {
    throw new Error(`Source health source ${expected.sourceId} does not match checked-in metadata.`);
  }
  requireCount(source.parsedItemCount, `Source health parsed count for ${source.sourceId}`);
  requireCount(source.eligibleItemCount, `Source health eligible count for ${source.sourceId}`);
  if (source.eligibleItemCount > source.parsedItemCount) {
    throw new Error(`Source health source ${source.sourceId} has inconsistent item counts.`);
  }
  if (source.status === "ok" && source.code !== null) {
    throw new Error(`Healthy source ${source.sourceId} cannot contain a failure code.`);
  }
  if (
    source.status === "failed" &&
    (!SOURCE_FAILURE_CODES.has(source.code) || source.parsedItemCount !== 0 || source.eligibleItemCount !== 0)
  ) {
    throw new Error(`Failed source ${source.sourceId} is not safely represented.`);
  }
  if (
    source.status === "not-observed" &&
    (source.code !== null || source.parsedItemCount !== 0 || source.eligibleItemCount !== 0)
  ) {
    throw new Error(`Unobserved source ${source.sourceId} is not safely represented.`);
  }
}

function validateRejectionCounts(rejectionCounts, rejectedCandidateCount, attemptNumber) {
  if (!Array.isArray(rejectionCounts) || rejectionCounts.length > REJECTION_CODES.size) {
    throw new Error(`Source health attempt ${attemptNumber} has invalid rejection counts.`);
  }
  let previous = "";
  let total = 0;
  for (const entry of rejectionCounts) {
    assertExactKeys(entry, REJECTION_KEYS, `Source health rejection count in attempt ${attemptNumber}`);
    if (!REJECTION_CODES.has(entry.code) || entry.code <= previous) {
      throw new Error(`Source health attempt ${attemptNumber} has invalid rejection codes.`);
    }
    previous = entry.code;
    total += requireCount(entry.count, `Source health rejection count ${entry.code}`);
  }
  if (total < rejectedCandidateCount) {
    throw new Error(`Source health attempt ${attemptNumber} understates rejected candidates.`);
  }
}

function validateAttempt(attempt, expectedNumber) {
  assertExactKeys(attempt, ATTEMPT_KEYS, `Source health attempt ${expectedNumber}`);
  if (attempt.number !== expectedNumber || !ATTEMPT_STATUSES.has(attempt.status)) {
    throw new Error(`Source health attempt ${expectedNumber} has invalid identity or status.`);
  }
  const codeIsValid = attempt.code === null ||
    attempt.code === "DESK_COVERAGE_FAILED" ||
    attempt.code === "RESEARCH_FAILED";
  if (!codeIsValid || (typeof attempt.code === "string" && !SAFE_CODE_PATTERN.test(attempt.code))) {
    throw new Error(`Source health attempt ${expectedNumber} has an unsafe code.`);
  }
  assertExactKeys(attempt.aggregate, AGGREGATE_KEYS, `Source health aggregate ${expectedNumber}`);
  const aggregate = attempt.aggregate;
  for (const key of AGGREGATE_KEYS.filter((key) => key !== "rejectionCounts")) {
    requireCount(aggregate[key], `Source health aggregate ${key}`);
  }
  validateRejectionCounts(aggregate.rejectionCounts, aggregate.rejectedCandidateCount, expectedNumber);
  if (!Array.isArray(attempt.sources) || attempt.sources.length !== SOURCE_METADATA.length) {
    throw new Error(`Source health attempt ${expectedNumber} has an invalid source roster.`);
  }
  attempt.sources.forEach((source, index) => validateSource(source, SOURCE_METADATA[index], expectedNumber));
  const successfulSourceCount = attempt.sources.filter((source) => source.status === "ok").length;
  const failedSourceCount = attempt.sources.filter((source) => source.status === "failed").length;
  const unobservedSourceCount = attempt.sources.filter((source) => source.status === "not-observed").length;
  const parsedItemCount = attempt.sources.reduce((sum, source) => sum + source.parsedItemCount, 0);
  const eligibleItemCount = attempt.sources.reduce((sum, source) => sum + source.eligibleItemCount, 0);
  if (
    aggregate.configuredSourceCount !== SOURCE_METADATA.length ||
    aggregate.successfulSourceCount !== successfulSourceCount ||
    aggregate.failedSourceCount !== failedSourceCount ||
    aggregate.unobservedSourceCount !== unobservedSourceCount ||
    aggregate.parsedItemCount !== parsedItemCount ||
    aggregate.eligibleItemCount !== eligibleItemCount ||
    aggregate.rankedCandidateCount < aggregate.candidateCount ||
    aggregate.candidateCount > aggregate.eligibleItemCount ||
    aggregate.selectedCount > aggregate.candidateCount
  ) {
    throw new Error(`Source health attempt ${expectedNumber} has inconsistent aggregate totals.`);
  }
  if (!Array.isArray(attempt.desks) || attempt.desks.length !== FREE_DESKS.length) {
    throw new Error(`Source health attempt ${expectedNumber} has an invalid desk roster.`);
  }
  let selectedByDesk = 0;
  attempt.desks.forEach((desk, deskIndex) => {
    const expectedDesk = FREE_DESKS[deskIndex];
    assertExactKeys(desk, DESK_KEYS, `Source health desk ${expectedDesk}`);
    if (desk.desk !== expectedDesk || !COVERAGE_STATUSES.has(desk.coverageStatus)) {
      throw new Error(`Source health desk ${expectedDesk} has invalid identity or coverage.`);
    }
    for (const key of DESK_KEYS.filter((key) => !["desk", "coverageStatus"].includes(key))) {
      requireCount(desk[key], `Source health desk ${expectedDesk} ${key}`);
    }
    if (desk.selectedCount > 1 || desk.selectedCount > desk.shortlistCount) {
      throw new Error(`Source health desk ${expectedDesk} has invalid selection counts.`);
    }
    const configured = attempt.sources.filter((source) => source.desks.includes(expectedDesk));
    const successful = configured.filter((source) => source.status === "ok");
    const failed = configured.filter((source) => source.status === "failed");
    const unobserved = configured.filter((source) => source.status === "not-observed");
    const successfulPublisherCount = new Set(successful.map((source) => source.publisherKey)).size;
    const configuredPublisherCount = new Set(configured.map((source) => source.publisherKey)).size;
    const expectedCoverage = unobserved.length === configured.length
      ? "not-observed"
      : successfulPublisherCount >= REQUIRED_PUBLISHER_COUNT
        ? "covered"
        : "insufficient-corroboration";
    if (
      desk.configuredSourceCount !== configured.length ||
      desk.configuredPublisherCount !== configuredPublisherCount ||
      desk.successfulSourceCount !== successful.length ||
      desk.successfulPublisherCount !== successfulPublisherCount ||
      desk.failedSourceCount !== failed.length ||
      desk.unobservedSourceCount !== unobserved.length ||
      desk.requiredPublisherCount !== REQUIRED_PUBLISHER_COUNT ||
      desk.coverageStatus !== expectedCoverage
    ) {
      throw new Error(`Source health desk ${expectedDesk} totals do not match its sources.`);
    }
    selectedByDesk += desk.selectedCount;
  });
  if (selectedByDesk !== aggregate.selectedCount) {
    throw new Error(`Source health attempt ${expectedNumber} selected total does not match its desks.`);
  }
  const anyCoverageFailure = attempt.desks.some((desk) => desk.coverageStatus === "insufficient-corroboration");
  const allUnobserved = unobservedSourceCount === SOURCE_METADATA.length;
  const expectedStatus = allUnobserved
    ? "research-failure"
    : anyCoverageFailure
      ? "ingestion-failure"
      : aggregate.selectedCount === 0
        ? failedSourceCount > 0 ? "degraded-quiet" : "healthy-quiet"
        : failedSourceCount > 0 ? "degraded" : "healthy";
  const expectedCode = expectedStatus === "research-failure"
    ? "RESEARCH_FAILED"
    : expectedStatus === "ingestion-failure"
      ? "DESK_COVERAGE_FAILED"
      : null;
  if (attempt.status !== expectedStatus || attempt.code !== expectedCode) {
    throw new Error(`Source health attempt ${expectedNumber} status does not match its observations.`);
  }
}

function validateOutcome(snapshot) {
  const { attempts, selectedAttempt, outcome } = snapshot;
  if (!RESEARCH_OUTCOMES.has(outcome)) throw new Error("Source health outcome is invalid.");
  if (selectedAttempt !== null && (!Number.isInteger(selectedAttempt) || selectedAttempt < 1 || selectedAttempt > attempts.length)) {
    throw new Error("Source health selectedAttempt is invalid.");
  }
  if (selectedAttempt !== null && ["ingestion-failure", "research-failure"].includes(attempts[selectedAttempt - 1].status)) {
    throw new Error("Source health cannot select a failed research attempt.");
  }
  const valid =
    (outcome === "not-needed" && attempts.length === 1 && selectedAttempt === 1) ||
    (outcome === "improved" && attempts.length === 2 && selectedAttempt === 2 &&
      attempts[1].aggregate.selectedCount > attempts[0].aggregate.selectedCount) ||
    (outcome === "no-improvement" && attempts.length === 2 && selectedAttempt === 1 &&
      !["ingestion-failure", "research-failure"].includes(attempts[1].status) &&
      attempts[1].aggregate.selectedCount <= attempts[0].aggregate.selectedCount) ||
    (outcome === "coverage-fallback" && attempts.length === 2 && selectedAttempt === 1 &&
      attempts[1].status === "ingestion-failure") ||
    (outcome === "failed" && selectedAttempt === null);
  if (!valid) throw new Error("Source health selected attempt and outcome are inconsistent.");
}

export function validateSourceHealthSnapshot(snapshot) {
  assertExactKeys(snapshot, TOP_LEVEL_KEYS, "Source health snapshot");
  if (snapshot.schemaVersion !== SOURCE_HEALTH_SCHEMA_VERSION) {
    throw new Error("Source health schemaVersion is unsupported.");
  }
  requireEditionDate(snapshot.editionDate);
  assertExactKeys(snapshot.run, RUN_KEYS, "Source health run");
  normalizedRun({
    repository: snapshot.run.repository,
    runId: snapshot.run.runId,
    runUrl: snapshot.run.runUrl,
  }, snapshot.run.mode);
  normalizedSettings(snapshot.settings);
  if (
    !Array.isArray(snapshot.attempts) ||
    snapshot.attempts.length < 1 ||
    snapshot.attempts.length > snapshot.settings.maxResearchAttempts
  ) {
    throw new Error("Source health attempts do not match the configured maximum.");
  }
  snapshot.attempts.forEach((attempt, index) => validateAttempt(attempt, index + 1));
  validateOutcome(snapshot);
  const bytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
  if (bytes > SOURCE_HEALTH_MAX_JSON_BYTES) {
    throw new Error(`Source health JSON exceeds ${SOURCE_HEALTH_MAX_JSON_BYTES} bytes.`);
  }
  return snapshot;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function statusLabel(status) {
  return status.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

export function renderSourceHealthMarkdown(snapshot) {
  validateSourceHealthSnapshot(snapshot);
  const selected = snapshot.selectedAttempt === null
    ? "None"
    : `Attempt ${snapshot.selectedAttempt}`;
  const lines = [
    `# First Fold source health — ${snapshot.editionDate}`,
    "",
    `- Run: [${snapshot.run.runId}](${snapshot.run.runUrl})`,
    `- Mode: ${snapshot.run.mode}`,
    `- Research outcome: ${snapshot.outcome}`,
    `- Selected research: ${selected}`,
    `- Policy: ${snapshot.settings.evidencePolicy}; ${snapshot.settings.lookbackHours}h lookback; score thresholds ${snapshot.settings.minimumScore}/${snapshot.settings.minimumAuthoritativeScore}`,
    "",
  ];
  for (const attempt of snapshot.attempts) {
    lines.push(
      `## Attempt ${attempt.number}: ${statusLabel(attempt.status)}`,
      "",
      `Sources: ${attempt.aggregate.successfulSourceCount} healthy, ${attempt.aggregate.failedSourceCount} failed, ${attempt.aggregate.unobservedSourceCount} not observed. Items: ${attempt.aggregate.parsedItemCount} parsed, ${attempt.aggregate.eligibleItemCount} eligible. Candidates: ${attempt.aggregate.candidateCount} shortlisted, ${attempt.aggregate.selectedCount} selected.`,
      "",
      "| Desk | Coverage | Publishers | Sources | Shortlist | Selected |",
      "| --- | --- | ---: | ---: | ---: | ---: |",
      ...attempt.desks.map((desk) =>
        `| ${DESK_LABELS[desk.desk]} | ${desk.coverageStatus} | ${desk.successfulPublisherCount}/${desk.configuredPublisherCount} | ${desk.successfulSourceCount}/${desk.configuredSourceCount} | ${desk.shortlistCount} | ${desk.selectedCount} |`),
      "",
      "| Source | Desk coverage | Status | Code | Parsed | Eligible |",
      "| --- | --- | --- | --- | ---: | ---: |",
      ...attempt.sources.map((source) =>
        `| ${source.publisher} (${source.sourceId}) | ${source.desks.map((desk) => DESK_LABELS[desk]).join(", ")} | ${source.status} | ${source.code ?? "—"} | ${source.parsedItemCount} | ${source.eligibleItemCount} |`),
      "",
    );
  }
  lines.push(
    "This report is observational only. It contains no feed URLs, article text, story identifiers, recipient data, provider responses, hashes, or secrets, and it cannot change editorial policy.",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderSourceHealthHtml(snapshot) {
  validateSourceHealthSnapshot(snapshot);
  const attempts = snapshot.attempts.map((attempt) => {
    const deskRows = attempt.desks.map((desk) => `<tr><td>${escapeHtml(DESK_LABELS[desk.desk])}</td><td><span class="status">${escapeHtml(desk.coverageStatus)}</span></td><td>${desk.successfulPublisherCount}/${desk.configuredPublisherCount}</td><td>${desk.successfulSourceCount}/${desk.configuredSourceCount}</td><td>${desk.shortlistCount}</td><td>${desk.selectedCount}</td></tr>`).join("");
    const sourceRows = attempt.sources.map((source) => `<tr><td><strong>${escapeHtml(source.publisher)}</strong><br><code>${escapeHtml(source.sourceId)}</code></td><td>${escapeHtml(source.desks.map((desk) => DESK_LABELS[desk]).join(", "))}</td><td><span class="status">${escapeHtml(source.status)}</span></td><td><code>${escapeHtml(source.code ?? "—")}</code></td><td>${source.parsedItemCount}</td><td>${source.eligibleItemCount}</td></tr>`).join("");
    return `<section><h2>Attempt ${attempt.number}: ${escapeHtml(statusLabel(attempt.status))}</h2><p class="summary">Sources: ${attempt.aggregate.successfulSourceCount} healthy, ${attempt.aggregate.failedSourceCount} failed, ${attempt.aggregate.unobservedSourceCount} not observed. Items: ${attempt.aggregate.parsedItemCount} parsed, ${attempt.aggregate.eligibleItemCount} eligible. Candidates: ${attempt.aggregate.candidateCount} shortlisted, ${attempt.aggregate.selectedCount} selected.</p><h3>Desk coverage</h3><div class="scroll"><table><thead><tr><th>Desk</th><th>Coverage</th><th>Publishers</th><th>Sources</th><th>Shortlist</th><th>Selected</th></tr></thead><tbody>${deskRows}</tbody></table></div><h3>Checked-in sources</h3><div class="scroll"><table><thead><tr><th>Source</th><th>Desk coverage</th><th>Status</th><th>Code</th><th>Parsed</th><th>Eligible</th></tr></thead><tbody>${sourceRows}</tbody></table></div></section>`;
  }).join("");
  const selected = snapshot.selectedAttempt === null ? "None" : `Attempt ${snapshot.selectedAttempt}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>First Fold source health — ${escapeHtml(snapshot.editionDate)}</title><style>:root{color-scheme:light;--ink:#171512;--paper:#f5f0e6;--muted:#6d665c;--rule:#aaa08e;--accent:#712b27}*{box-sizing:border-box}body{margin:0;background:#ded8cc;color:var(--ink);font:15px/1.5 Georgia,'Times New Roman',serif}.page{width:min(1120px,calc(100% - 24px));margin:24px auto;padding:32px;background:var(--paper);border:1px solid var(--rule)}h1,h2,h3{line-height:1.1}h1{font-size:clamp(32px,6vw,60px);margin:0}h2{margin-top:36px;border-top:4px double var(--ink);padding-top:24px}h3{margin-top:24px}.kicker,.meta,.note{font-family:Arial,Helvetica,sans-serif}.kicker{color:var(--accent);font-weight:700;letter-spacing:.12em;text-transform:uppercase}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px 20px;padding:16px 0;border-bottom:1px solid var(--rule)}a{color:var(--accent)}.summary{font-size:18px}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px}th,td{padding:9px 8px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}th{letter-spacing:.05em;text-transform:uppercase}.status{font-weight:700}.note{margin-top:32px;padding-top:16px;border-top:1px solid var(--rule);color:var(--muted);font-size:13px}code{font-size:12px}@media(max-width:600px){.page{width:100%;margin:0;padding:20px 14px;border:0}}</style></head><body><main class="page"><p class="kicker">Operations view</p><h1>Source health</h1><div class="meta"><span>Edition <strong>${escapeHtml(snapshot.editionDate)}</strong></span><span>Mode <strong>${escapeHtml(snapshot.run.mode)}</strong></span><span>Outcome <strong>${escapeHtml(snapshot.outcome)}</strong></span><span>Selected <strong>${escapeHtml(selected)}</strong></span><span>Run <a href="${escapeHtml(snapshot.run.runUrl)}">${escapeHtml(snapshot.run.runId)}</a></span><span>Policy <strong>${escapeHtml(snapshot.settings.evidencePolicy)}</strong></span></div>${attempts}<p class="note">Observational only. This file contains no feed URLs, article text, story identifiers, recipient data, provider responses, hashes, or secrets, and it cannot change editorial policy.</p></main></body></html>`;
  if (Buffer.byteLength(html, "utf8") > SOURCE_HEALTH_MAX_HTML_BYTES) {
    throw new Error(`Source health HTML exceeds ${SOURCE_HEALTH_MAX_HTML_BYTES} bytes.`);
  }
  return html;
}

async function removeIfSameInode(filename, temporary) {
  try {
    const [published, staged] = await Promise.all([lstat(filename), lstat(temporary)]);
    if (published.dev === staged.dev && published.ino === staged.ino) await unlink(filename);
  } catch {
    // Cleanup is best effort; the original publication error is more useful.
  }
}

async function exclusiveBundleWrite(entries) {
  const staged = entries.map((entry) => ({
    ...entry,
    temporary: `${entry.filename}.${randomUUID()}.tmp`,
  }));
  const published = [];
  try {
    await Promise.all(staged.map((entry) => writeFile(entry.temporary, entry.contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    })));
    for (const entry of staged) {
      // A same-directory hard link publishes the completed inode atomically
      // and fails with EEXIST rather than replacing a prior trusted report.
      await link(entry.temporary, entry.filename);
      published.push(entry);
    }
  } catch (error) {
    await Promise.all(published.map((entry) => removeIfSameInode(entry.filename, entry.temporary)));
    throw error;
  } finally {
    await Promise.all(staged.map((entry) => unlink(entry.temporary).catch(() => {})));
  }
}

export async function writeSourceHealthBundle(snapshot, outputDirectory) {
  validateSourceHealthSnapshot(snapshot);
  if (typeof outputDirectory !== "string" || !outputDirectory.trim()) {
    throw new Error("Source health outputDirectory is required.");
  }
  const directory = path.resolve(outputDirectory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Source health outputDirectory must be a real directory.");
  }
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  const markdown = renderSourceHealthMarkdown(snapshot);
  const html = renderSourceHealthHtml(snapshot);
  if (Buffer.byteLength(json, "utf8") > SOURCE_HEALTH_MAX_JSON_BYTES) {
    throw new Error(`Source health JSON exceeds ${SOURCE_HEALTH_MAX_JSON_BYTES} bytes.`);
  }
  const jsonPath = path.join(directory, "source-health.json");
  const markdownPath = path.join(directory, "source-health.md");
  const htmlPath = path.join(directory, "source-health.html");
  await exclusiveBundleWrite([
    { filename: jsonPath, contents: json },
    { filename: markdownPath, contents: markdown },
    { filename: htmlPath, contents: html },
  ]);
  return { jsonPath, markdownPath, htmlPath, markdown, html };
}
