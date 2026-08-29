#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile, lstat, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { validateCanonicalEdition } from "../edition-content.mjs";
import {
  FREE_AUTOMATION_WORKFLOW,
  draftFreeEditionWithHealth,
  validateFreePilotProvenance,
} from "./draft-free-edition.mjs";
import { FREE_FEED_SOURCES } from "./free/feed-sources.mjs";
import {
  TRUSTED_EVIDENCE_DIGEST_MODE,
  TRUSTED_EVIDENCE_DIGEST_MODEL,
  TRUSTED_EVIDENCE_DIGEST_PROVIDER,
} from "./free/evidence-digest.mjs";
import {
  DEFAULT_CLOUDFLARE_AI_MODEL,
  WORKERS_AI_PROVIDER,
} from "./free/workers-ai.mjs";
import {
  PERSONAL_STORY_LEDGER_MAX_BYTES,
  PERSONAL_STORY_LEDGER_RETENTION_DAYS,
  PERSONAL_STORY_LEDGER_SCHEMA_VERSION,
  buildPersonalRepeatHistory,
  parsePersonalStoryLedger,
} from "./personal-story-ledger.mjs";
import {
  validateSourceHealthSnapshot,
  sourceHealthFailureCode,
  writeSourceHealthBundle,
} from "./source-health.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const RUN_ID_PATTERN = /^[1-9]\d*$/;
const RESPONSE_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const SOURCE_HEALTH_DIRECTORY_PATTERN = /^[^\0]{1,4096}$/;

export const PERSONAL_FREE_WORKFLOW = "personal-morning-paper";
export const PERSONAL_FREE_PROVIDER = WORKERS_AI_PROVIDER;
export const PERSONAL_FREE_RESEARCH_METHOD = "curated-live-feeds";
export const PERSONAL_FREE_MODEL = DEFAULT_CLOUDFLARE_AI_MODEL;
export const PERSONAL_FREE_FALLBACK_PROVIDER = TRUSTED_EVIDENCE_DIGEST_PROVIDER;
export const PERSONAL_FREE_FALLBACK_MODEL = TRUSTED_EVIDENCE_DIGEST_MODEL;
export const PERSONAL_FREE_EVIDENCE_POLICY = "authoritative-or-corroborated";
export const PERSONAL_FREE_MAX_MODEL_REQUESTS = 0;
export const PERSONAL_FREE_MAX_TOKENS = 3_000;
export const PERSONAL_FREE_MAX_REQUEST_BYTES = 100_000;
export const PERSONAL_FREE_AI_TIMEOUT_MS = 240_000;
export const PERSONAL_FREE_SOURCE_CHECK_TIMEOUT_MS = 8_000;
export const PERSONAL_FREE_LOOKBACK_HOURS = 72;
export const PERSONAL_FREE_MINIMUM_SCORE = 70;
export const PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE = 70;
export const PERSONAL_FREE_MINIMUM_STORY_COUNT = 0;
export const PERSONAL_FREE_MAX_RESEARCH_ATTEMPTS = 2;
export const PERSONAL_FREE_RETRY_BELOW_STORY_COUNT = 3;
export const PERSONAL_FREE_GITHUB_OUTCOME_FLAG = "--github-actions-outcome";
export const PERSONAL_FREE_RUN_MODES = Object.freeze(["on_time", "same_day_backfill"]);
export const PERSONAL_FREE_DRAFTING_MODES = Object.freeze([
  TRUSTED_EVIDENCE_DIGEST_MODE,
  "quiet",
]);
export const PERSONAL_FREE_DESKS = Object.freeze([
  "ai",
  "work-and-tools",
  "security-and-privacy",
  "platforms-and-power",
]);

const PERSONAL_GENERATION_FAILURE_CODES = new Set([
  "EDITORIAL_AUTHORITATIVE_STRUCTURE_RETRY_EXHAUSTED",
  "EDITORIAL_CORRECTION_BUDGET_EXHAUSTED",
  "EDITORIAL_FORMAT_RETRY_EXHAUSTED",
  "EDITORIAL_LENGTH_RETRY_EXHAUSTED",
  "EDITORIAL_ORIGINALITY_RETRY_EXHAUSTED",
  "FREE_CANONICAL_VALIDATION_FAILED",
  "FREE_PROVENANCE_VALIDATION_FAILED",
  "FREE_SOURCE_QA_ACCESS_RESTRICTED",
  "FREE_SOURCE_QA_FAILED",
  "FREE_SOURCE_QA_TRANSIENT_RETRY_EXHAUSTED",
  "FREE_TRUSTED_DIGEST_FAILED",
  "PERSONAL_FREE_ADAPTATION_FAILED",
  "WORKERS_AI_CLIENT_TIMEOUT",
  "WORKERS_AI_PROVIDER_TIMEOUT",
]);

const EXPECTED_REPOSITORY = "itworksinprod/first-fold";

function requireNonBlank(value, label, maximumLength = 4_096) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > maximumLength
  ) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function requireEditionDate(value) {
  if (!DATE_PATTERN.test(value ?? "")) throw new Error("Edition date must use YYYY-MM-DD.");
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error(`Edition date ${value} is not a real calendar date.`);
  }
  return value;
}

async function pathExists(filename) {
  try {
    await stat(filename);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function isPathInside(parentDirectory, candidatePath) {
  const relativePath = path.relative(parentDirectory, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  );
}

function containsSourceHealthKey(value, visited = new Set()) {
  if (!value || typeof value !== "object" || visited.has(value)) return false;
  visited.add(value);
  if (Object.hasOwn(value, "sourceHealth")) return true;
  return Object.values(value).some((entry) => containsSourceHealthKey(entry, visited));
}

function resolvePersonalSourceHealthDirectory(env, projectRoot, editionDate) {
  const configuredRoot = env.PERSONAL_SOURCE_HEALTH_ROOT;
  if (
    typeof configuredRoot !== "string" ||
    configuredRoot !== configuredRoot.trim() ||
    !SOURCE_HEALTH_DIRECTORY_PATTERN.test(configuredRoot) ||
    !path.isAbsolute(configuredRoot)
  ) {
    throw new Error("PERSONAL_SOURCE_HEALTH_ROOT must be an absolute runner-temporary directory.");
  }
  const resolvedRoot = path.resolve(configuredRoot);
  if (isPathInside(path.resolve(projectRoot), resolvedRoot)) {
    throw new Error("PERSONAL_SOURCE_HEALTH_ROOT must remain outside the repository checkout.");
  }
  return path.join(resolvedRoot, editionDate);
}

async function appendSourceHealthSummary(markdown, env) {
  if (typeof env.GITHUB_STEP_SUMMARY !== "string" || !env.GITHUB_STEP_SUMMARY.trim()) {
    return false;
  }
  await appendFile(env.GITHUB_STEP_SUMMARY, `\n${markdown.trim()}\n`, "utf8");
  return true;
}

async function writePersonalSourceHealthObservationally({
  sourceHealth,
  editionDate,
  projectRoot,
  env,
  writeSourceHealthBundleImpl = writeSourceHealthBundle,
}) {
  if (!sourceHealth) {
    return { status: "unavailable", reason: "not-captured", summaryAppended: false };
  }

  let outputDirectory;
  try {
    validateSourceHealthSnapshot(sourceHealth);
    outputDirectory = resolvePersonalSourceHealthDirectory(env, projectRoot, editionDate);
    const written = await writeSourceHealthBundleImpl(sourceHealth, outputDirectory);
    const requiredPaths = [written?.jsonPath, written?.markdownPath, written?.htmlPath];
    if (
      requiredPaths.some((filename) => typeof filename !== "string" || !path.isAbsolute(filename)) ||
      requiredPaths.some((filename) => !isPathInside(outputDirectory, path.resolve(filename))) ||
      typeof written?.markdown !== "string" ||
      !written.markdown.trim()
    ) {
      throw new Error("Source-health writer returned an invalid bundle.");
    }
    let summaryAppended = false;
    try {
      summaryAppended = await appendSourceHealthSummary(written.markdown, env);
    } catch {
      // A GitHub summary is useful observability, but never a delivery gate.
    }
    return {
      status: "written",
      jsonPath: written.jsonPath,
      markdownPath: written.markdownPath,
      htmlPath: written.htmlPath,
      summaryAppended,
    };
  } catch {
    return {
      status: "unavailable",
      reason: outputDirectory ? "write-failed" : "output-not-configured",
      summaryAppended: false,
    };
  }
}

function attachSourceHealth(error, sourceHealth) {
  if (
    error &&
    typeof error === "object" &&
    sourceHealth &&
    !Object.hasOwn(error, "sourceHealth")
  ) {
    try {
      Object.defineProperty(error, "sourceHealth", {
        value: sourceHealth,
        configurable: true,
        enumerable: false,
      });
    } catch {
      // Observability must never replace the original generation failure.
    }
  }
  return error;
}

function attachSourceHealthBundle(error, sourceHealthBundle) {
  if (error && typeof error === "object" && sourceHealthBundle) {
    try {
      Object.defineProperty(error, "sourceHealthBundle", {
        value: sourceHealthBundle,
        configurable: true,
        enumerable: false,
      });
    } catch {
      // Observability must never replace the original generation failure.
    }
  }
  return error;
}

function personalFreeDiagnosticError(message, diagnosticCode) {
  const error = new Error(message);
  Object.defineProperty(error, "diagnosticCode", {
    value: diagnosticCode,
    configurable: true,
    enumerable: false,
  });
  return error;
}

export function personalFreeFailureCode(error) {
  if (PERSONAL_GENERATION_FAILURE_CODES.has(error?.diagnosticCode)) {
    return error.diagnosticCode;
  }
  if (PERSONAL_GENERATION_FAILURE_CODES.has(error?.code)) return error.code;
  const researchCode = sourceHealthFailureCode(error);
  if (researchCode !== "RESEARCH_FAILED") return researchCode;
  if (error?.sourceHealth) {
    return Number.isInteger(error.sourceHealth.selectedAttempt)
      ? "EDITION_GENERATION_FAILED"
      : "RESEARCH_FAILED";
  }
  return "PERSONAL_PIPELINE_FAILED";
}

async function reportPersonalFreeFailure(error, { githubSummaryPath, errorImpl }) {
  const failureCode = personalFreeFailureCode(error);
  try {
    await appendFile(
      githubSummaryPath,
      "### Personal paper not sent\n\n" +
        `Failure code: \`${failureCode}\`\n\n` +
        "Candidate generation failed; no private email was sent. " +
        "A source-health report, when present, describes research only.\n",
      "utf8",
    );
  } catch {
    // Reporting must never replace the original generation failure.
  }
  try {
    errorImpl(
      `::error title=Personal Morning Paper not sent::${failureCode} — ` +
        "candidate generation failed; no email was sent.",
    );
  } catch {
    // Reporting must never replace the original generation failure.
  }
}

async function loadPersonalStoryLedger(env, editionDate, fingerprintKey) {
  const ledgerPath = requireNonBlank(
    env.PERSONAL_STORY_LEDGER_PATH,
    "PERSONAL_STORY_LEDGER_PATH",
    4_096,
  );
  let metadata;
  try {
    metadata = await lstat(ledgerPath);
  } catch {
    throw new Error("PERSONAL_STORY_LEDGER_PATH must identify the prepared repeat ledger.");
  }
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size > PERSONAL_STORY_LEDGER_MAX_BYTES
  ) {
    throw new Error("PERSONAL_STORY_LEDGER_PATH must identify the prepared repeat ledger.");
  }
  return parsePersonalStoryLedger(await readFile(ledgerPath, "utf8"), {
    asOfDate: editionDate,
    fingerprintKey,
  });
}

async function loadCanonicalHistory(projectRoot) {
  const contentRoot = path.join(projectRoot, "content", "editions");
  const filenames = (await readdir(contentRoot))
    .filter((filename) => filename.endsWith(".json"))
    .sort();
  if (filenames.length === 0) throw new Error("At least one canonical edition is required.");

  const editions = [];
  for (const filename of filenames) {
    let edition;
    try {
      edition = JSON.parse(await readFile(path.join(contentRoot, filename), "utf8"));
    } catch {
      throw new Error(`Canonical edition ${filename} is not readable JSON.`);
    }
    if (filename !== `${edition.editionDate}.json`) {
      throw new Error(`Canonical edition filename ${filename} does not match its editionDate.`);
    }
    const validation = validateCanonicalEdition(edition);
    if (!validation.valid) {
      throw new Error(`Canonical edition ${filename} is invalid: ${validation.issues.join(" ")}`);
    }
    editions.push(edition);
  }
  return editions;
}

function requireCloudflareConfiguration(env) {
  const accountId = requireNonBlank(env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID", 32);
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal account id.");
  }
  const apiToken = requireNonBlank(env.CLOUDFLARE_AI_API_TOKEN, "CLOUDFLARE_AI_API_TOKEN");
  return { accountId, apiToken };
}

export function personalFreeAutomationFromEnvironment(env) {
  const runId = requireNonBlank(env.GITHUB_RUN_ID, "GITHUB_RUN_ID", 40);
  const serverUrl = requireNonBlank(env.GITHUB_SERVER_URL, "GITHUB_SERVER_URL", 200)
    .replace(/\/$/, "");
  const repository = requireNonBlank(env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY", 200);
  if (serverUrl !== "https://github.com") {
    throw new Error("GITHUB_SERVER_URL must be https://github.com for personal research.");
  }
  if (!RUN_ID_PATTERN.test(runId) || repository !== EXPECTED_REPOSITORY) {
    throw new Error("Personal research requires the trusted First Fold GitHub run identity.");
  }
  return {
    runId,
    repository,
    runUrl: `https://github.com/${repository}/actions/runs/${runId}`,
  };
}

function selectedStories(candidate) {
  return PERSONAL_FREE_DESKS.map((desk) => candidate?.desks?.[desk]?.story)
    .filter((story) => story && typeof story === "object" && !Array.isArray(story));
}

function hasCompleteSourceSet(story) {
  if (!Array.isArray(story?.sources) || story.sources.length < 2) return false;
  const urls = new Set();
  let hasDirectSource = false;
  for (const source of story.sources) {
    if (typeof source?.url !== "string") return false;
    try {
      const parsed = new URL(source.url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
      urls.add(parsed.href);
    } catch {
      return false;
    }
    if (["originating", "independent"].includes(source.relationship)) {
      hasDirectSource = true;
    }
  }
  return urls.size >= 2 && hasDirectSource;
}

function hasPersonalFreeInferenceTuple(provenance, storyCount) {
  if (!provenance || !Number.isInteger(storyCount) || storyCount < 0) return false;
  if (storyCount === 0) {
    return provenance.provider === TRUSTED_EVIDENCE_DIGEST_PROVIDER &&
      provenance.model === TRUSTED_EVIDENCE_DIGEST_MODEL &&
      provenance.draftingMode === "quiet" &&
      provenance.inference === "skipped-no-eligible-candidates" &&
      provenance.responseId === "not-invoked";
  }
  return provenance.provider === TRUSTED_EVIDENCE_DIGEST_PROVIDER &&
    provenance.model === TRUSTED_EVIDENCE_DIGEST_MODEL &&
    provenance.draftingMode === TRUSTED_EVIDENCE_DIGEST_MODE &&
    provenance.inference === TRUSTED_EVIDENCE_DIGEST_MODE &&
    provenance.responseId === "local-digest";
}

function buildPersonalCandidate(
  freeCandidate,
  { automation, runMode, expectedFeedSourceCount, repeatHistory },
) {
  validateFreePilotProvenance(freeCandidate, automation, {
    expectedFeedSourceCount,
    expectedRunMode: runMode,
    expectedEvidencePolicy: PERSONAL_FREE_EVIDENCE_POLICY,
    expectedLookbackHours: PERSONAL_FREE_LOOKBACK_HOURS,
    expectedMinimumScore: PERSONAL_FREE_MINIMUM_SCORE,
    expectedMinimumAuthoritativeScore: PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE,
  });
  const freePilot = freeCandidate?.provenance?.freePilot;
  const stories = selectedStories(freeCandidate);
  const inferenceIsValid = hasPersonalFreeInferenceTuple(freePilot, stories.length);
  if (
    freePilot?.workflow !== FREE_AUTOMATION_WORKFLOW ||
    !inferenceIsValid ||
    freePilot?.coveredDeskCount !== PERSONAL_FREE_DESKS.length ||
    freePilot?.draftSelectedSlate !== true ||
    freePilot?.candidateCount !== stories.length ||
    freePilot?.requiredStoryCount !== stories.length ||
    freePilot?.selectedStoryCount !== stories.length ||
    freePilot?.maxResearchAttempts !== PERSONAL_FREE_MAX_RESEARCH_ATTEMPTS ||
    freePilot?.researchRetryBelowStoryCount !== PERSONAL_FREE_RETRY_BELOW_STORY_COUNT ||
    ![1, 2].includes(freePilot?.researchAttemptCount) ||
    freePilot?.lookbackHours !== PERSONAL_FREE_LOOKBACK_HOURS ||
    freePilot?.minimumScore !== PERSONAL_FREE_MINIMUM_SCORE ||
    freePilot?.minimumAuthoritativeScore !== PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE ||
    stories.length > PERSONAL_FREE_DESKS.length ||
    stories.some((story) => !hasCompleteSourceSet(story))
  ) {
    throw new Error(
      "Personal free research did not produce a valid adaptive source-checked edition.",
    );
  }

  const candidate = structuredClone(freeCandidate);
  delete candidate.provenance.freePilot;
  candidate.provenance.personalFreeResearch = {
    workflow: PERSONAL_FREE_WORKFLOW,
    provider: freePilot.provider,
    researchMethod: PERSONAL_FREE_RESEARCH_METHOD,
    model: freePilot.model,
    runId: automation.runId,
    runUrl: automation.runUrl,
    repository: automation.repository,
    runMode,
    generatedAt: candidate.publication.generatedAt,
    inference: freePilot.inference,
    draftingMode: freePilot.draftingMode,
    feedSnapshotSha256: freePilot.feedSnapshotSha256,
    requestSha256: freePilot.requestSha256,
    responseSha256: freePilot.responseSha256,
    responseId: freePilot.responseId,
    feedSourceCount: freePilot.feedSourceCount,
    successfulFeedSourceCount: freePilot.successfulFeedSourceCount,
    coveredDeskCount: freePilot.coveredDeskCount,
    candidateCount: freePilot.candidateCount,
    candidateSelection: "deterministic-selected-slate",
    evidencePolicy: PERSONAL_FREE_EVIDENCE_POLICY,
    lookbackHours: freePilot.lookbackHours,
    minimumScore: freePilot.minimumScore,
    minimumAuthoritativeScore: freePilot.minimumAuthoritativeScore,
    requiredStoryCount: freePilot.requiredStoryCount,
    selectedStoryCount: stories.length,
    maxResearchAttempts: freePilot.maxResearchAttempts,
    researchRetryBelowStoryCount: freePilot.researchRetryBelowStoryCount,
    researchAttemptCount: freePilot.researchAttemptCount,
    researchRetryOutcome: freePilot.researchRetryOutcome,
    repeatLedgerSchemaVersion: PERSONAL_STORY_LEDGER_SCHEMA_VERSION,
    repeatLookbackDays: PERSONAL_STORY_LEDGER_RETENTION_DAYS,
    repeatStateSha256: repeatHistory.stateSha256,
    priorLedgerEditionCount: repeatHistory.priorEditionCount,
    priorLedgerStoryCount: repeatHistory.priorStoryCount,
    qualityPilotOrdinal: repeatHistory.nextPilotOrdinal,
    maxModelRequests: PERSONAL_FREE_MAX_MODEL_REQUESTS,
    ephemeral: true,
  };
  validatePersonalFreeCandidate(candidate, { runMode, automation, expectedFeedSourceCount });
  return candidate;
}

export function validatePersonalFreeCandidate(
  candidate,
  { runMode, automation, expectedFeedSourceCount } = {},
) {
  const validation = validateCanonicalEdition(candidate);
  const research = candidate?.provenance?.personalFreeResearch;
  const sourceCheck = candidate?.provenance?.sourceCheck;
  const stories = selectedStories(candidate);
  const expectedRun = automation ?? {
    runId: research?.runId,
    runUrl: research?.runUrl,
    repository: research?.repository,
  };
  const countsAreValid =
    Number.isInteger(research?.feedSourceCount) &&
    research.feedSourceCount > 0 &&
    Number.isInteger(research?.successfulFeedSourceCount) &&
    research.successfulFeedSourceCount > 0 &&
    research.successfulFeedSourceCount <= research.feedSourceCount &&
    research.coveredDeskCount === PERSONAL_FREE_DESKS.length &&
    Number.isInteger(research?.candidateCount) &&
    research.candidateCount === stories.length;
  const inferenceIsValid = hasPersonalFreeInferenceTuple(research, stories.length);

  if (
    !validation.valid ||
    candidate.status !== "validated" ||
    candidate.publication?.publishedAt !== null ||
    Object.hasOwn(candidate.provenance ?? {}, "automation") ||
    Object.hasOwn(candidate.provenance ?? {}, "freePilot") ||
    Object.hasOwn(candidate.provenance ?? {}, "personalResearch") ||
    research?.workflow !== PERSONAL_FREE_WORKFLOW ||
    research?.researchMethod !== PERSONAL_FREE_RESEARCH_METHOD ||
    research?.repository !== EXPECTED_REPOSITORY ||
    research?.runId !== expectedRun.runId ||
    research?.runUrl !== expectedRun.runUrl ||
    research?.repository !== expectedRun.repository ||
    research?.runUrl !==
      `https://github.com/${EXPECTED_REPOSITORY}/actions/runs/${research?.runId ?? ""}` ||
    !RUN_ID_PATTERN.test(research?.runId ?? "") ||
    !PERSONAL_FREE_RUN_MODES.includes(research?.runMode) ||
    (runMode !== undefined && research.runMode !== runMode) ||
    research?.generatedAt !== candidate.publication?.generatedAt ||
    !inferenceIsValid ||
    !PERSONAL_FREE_DRAFTING_MODES.includes(research?.draftingMode) ||
    (stories.length === 0 && research?.draftingMode !== "quiet") ||
    (stories.length > 0 && research?.draftingMode !== TRUSTED_EVIDENCE_DIGEST_MODE) ||
    !RESPONSE_ID_PATTERN.test(research?.responseId ?? "") ||
    !SHA256_PATTERN.test(research?.feedSnapshotSha256 ?? "") ||
    !SHA256_PATTERN.test(research?.requestSha256 ?? "") ||
    !SHA256_PATTERN.test(research?.responseSha256 ?? "") ||
    !countsAreValid ||
    (expectedFeedSourceCount !== undefined &&
      research.feedSourceCount !== expectedFeedSourceCount) ||
    research?.evidencePolicy !== PERSONAL_FREE_EVIDENCE_POLICY ||
    research?.lookbackHours !== PERSONAL_FREE_LOOKBACK_HOURS ||
    research?.minimumScore !== PERSONAL_FREE_MINIMUM_SCORE ||
    research?.minimumAuthoritativeScore !== PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE ||
    research?.candidateSelection !== "deterministic-selected-slate" ||
    research?.requiredStoryCount !== stories.length ||
    research?.selectedStoryCount !== stories.length ||
    research?.maxResearchAttempts !== PERSONAL_FREE_MAX_RESEARCH_ATTEMPTS ||
    research?.researchRetryBelowStoryCount !== PERSONAL_FREE_RETRY_BELOW_STORY_COUNT ||
    ![1, 2].includes(research?.researchAttemptCount) ||
    !["not-needed", "improved", "no-improvement", "coverage-fallback"].includes(
      research?.researchRetryOutcome,
    ) ||
    (research.researchAttemptCount === 1 && research.researchRetryOutcome !== "not-needed") ||
    (research.researchAttemptCount === 2 && research.researchRetryOutcome === "not-needed") ||
    research?.repeatLedgerSchemaVersion !== PERSONAL_STORY_LEDGER_SCHEMA_VERSION ||
    research?.repeatLookbackDays !== PERSONAL_STORY_LEDGER_RETENTION_DAYS ||
    !SHA256_PATTERN.test(research?.repeatStateSha256 ?? "") ||
    !Number.isInteger(research?.priorLedgerEditionCount) ||
    research.priorLedgerEditionCount < 0 ||
    !Number.isInteger(research?.priorLedgerStoryCount) ||
    research.priorLedgerStoryCount < 0 ||
    !(
      research?.qualityPilotOrdinal === null ||
      (Number.isInteger(research?.qualityPilotOrdinal) &&
        research.qualityPilotOrdinal >= 1 &&
        research.qualityPilotOrdinal <= 5)
    ) ||
    research.qualityPilotOrdinal !== (
      research.priorLedgerEditionCount < 5
        ? research.priorLedgerEditionCount + 1
        : null
    ) ||
    research?.maxModelRequests !== PERSONAL_FREE_MAX_MODEL_REQUESTS ||
    research?.ephemeral !== true ||
    containsSourceHealthKey(candidate) ||
    stories.length > PERSONAL_FREE_DESKS.length ||
    stories.some((story) => !hasCompleteSourceSet(story)) ||
    !Array.isArray(candidate.frontPage?.storyOrder) ||
    candidate.frontPage.storyOrder.length !== stories.length ||
    sourceCheck?.status !== "passed" ||
    !Number.isInteger(sourceCheck?.checkedSourceCount) ||
    sourceCheck.checkedSourceCount < stories.length * 2 ||
    !Array.isArray(sourceCheck?.issues) ||
    sourceCheck.issues.length !== 0
  ) {
    throw new Error("Personal free candidate failed its private source-checked provenance contract.");
  }
  return true;
}

/**
 * Generate a complete private candidate from live curated feeds. Production
 * uses only the trusted local evidence digest, so optional model availability
 * cannot block the daily paper. This function does not write, publish, email,
 * or deploy.
 */
async function generatePersonalFreeEditionWithHealth({
  editionDate,
  projectRoot = defaultProjectRoot,
  env = process.env,
  now,
  runMode = "on_time",
  researchImpl,
  feedSources,
  feedRequestImpl,
  feedLookupImpl,
  aiRequestImpl,
  fetchImpl = globalThis.fetch,
  sourceRequestImpl,
  sourceLookupImpl,
  sleepImpl,
  draftFreeEditionWithHealthImpl = draftFreeEditionWithHealth,
  draftFreeEditionImpl,
  personalStoryLedger,
} = {}) {
  requireEditionDate(editionDate);
  if (!PERSONAL_FREE_RUN_MODES.includes(runMode)) {
    throw new Error("Personal free runMode must be on_time or same_day_backfill.");
  }
  const automation = personalFreeAutomationFromEnvironment(env);
  const { accountId, apiToken } = requireCloudflareConfiguration(env);
  const priorEditions = await loadCanonicalHistory(projectRoot);
  const repeatLedger = personalStoryLedger ?? await loadPersonalStoryLedger(
    env,
    editionDate,
    apiToken,
  );
  const repeatHistory = buildPersonalRepeatHistory(repeatLedger, {
    asOfDate: editionDate,
    fingerprintKey: apiToken,
  });
  const effectiveFeedSources = feedSources ?? FREE_FEED_SOURCES;
  const [policyText, promptText] = await Promise.all([
    readFile(path.join(projectRoot, "lib", "editorial", "prompts", "policy.ts"), "utf8"),
    readFile(path.join(projectRoot, "lib", "editorial", "prompts", "daily-run.ts"), "utf8"),
  ]);
  const draftingOptions = {
    editionDate,
    priorEditions,
    policyText,
    promptText,
    automation,
    accountId,
    apiToken,
    model: DEFAULT_CLOUDFLARE_AI_MODEL,
    now,
    runMode,
    evidencePolicy: PERSONAL_FREE_EVIDENCE_POLICY,
    requireComplete: false,
    minimumStoryCount: PERSONAL_FREE_MINIMUM_STORY_COUNT,
    draftSelectedSlate: true,
    summarizeSelectedSlate: false,
    trustedEvidenceDigestOnly: true,
    maxResearchAttempts: PERSONAL_FREE_MAX_RESEARCH_ATTEMPTS,
    researchRetryBelowStoryCount: PERSONAL_FREE_RETRY_BELOW_STORY_COUNT,
    lookbackHours: PERSONAL_FREE_LOOKBACK_HOURS,
    minimumScore: PERSONAL_FREE_MINIMUM_SCORE,
    minimumAuthoritativeScore: PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE,
    recentRepeatHistory: repeatHistory.entries,
    repeatFingerprintKey: apiToken,
    maxModelRequests: PERSONAL_FREE_MAX_MODEL_REQUESTS,
    maxTokens: PERSONAL_FREE_MAX_TOKENS,
    maxRequestBytes: PERSONAL_FREE_MAX_REQUEST_BYTES,
    timeoutMs: PERSONAL_FREE_AI_TIMEOUT_MS,
    sourceCheckTimeoutMs: PERSONAL_FREE_SOURCE_CHECK_TIMEOUT_MS,
    researchImpl,
    feedSources: effectiveFeedSources,
    feedRequestImpl,
    feedLookupImpl,
    aiRequestImpl,
    fetchImpl,
    sourceRequestImpl,
    sourceLookupImpl,
    sleepImpl,
  };

  let sourceHealth;
  try {
    const detailedDraft = typeof draftFreeEditionImpl === "function"
      ? {
          candidate: await draftFreeEditionImpl(draftingOptions),
          sourceHealth: null,
        }
      : await draftFreeEditionWithHealthImpl(draftingOptions);
    if (
      !detailedDraft ||
      typeof detailedDraft !== "object" ||
      !detailedDraft.candidate ||
      typeof detailedDraft.candidate !== "object"
    ) {
      throw new Error("Personal free detailed drafting returned an invalid result.");
    }
    sourceHealth = detailedDraft.sourceHealth ?? null;
    let candidate;
    try {
      candidate = buildPersonalCandidate(detailedDraft.candidate, {
        automation,
        runMode,
        expectedFeedSourceCount: effectiveFeedSources.length,
        repeatHistory,
      });
      if (containsSourceHealthKey(candidate)) {
        throw new Error("Personal free candidate must not contain source-health diagnostics.");
      }
    } catch {
      throw personalFreeDiagnosticError(
        "Personal free candidate adaptation failed.",
        "PERSONAL_FREE_ADAPTATION_FAILED",
      );
    }
    return { candidate, sourceHealth };
  } catch (error) {
    throw attachSourceHealth(error, sourceHealth);
  }
}

export async function generatePersonalFreeEdition(options = {}) {
  return (await generatePersonalFreeEditionWithHealth(options)).candidate;
}

/** Write a private candidate exactly once. Nothing is published or committed. */
export async function generatePersonalFreeEditionFile(options = {}) {
  const editionDate = requireEditionDate(options.editionDate);
  const projectRoot = options.projectRoot ?? defaultProjectRoot;
  const destinationRoot = path.join(projectRoot, "content", "personal-candidates");
  const destination = path.join(destinationRoot, `${editionDate}.json`);
  if (await pathExists(destination)) {
    throw new Error(`Personal candidate ${editionDate} already exists; nothing was overwritten.`);
  }

  let generated;
  try {
    generated = await generatePersonalFreeEditionWithHealth({
      ...options,
      editionDate,
      projectRoot,
    });
  } catch (error) {
    const sourceHealthBundle = await writePersonalSourceHealthObservationally({
      sourceHealth: error?.sourceHealth,
      editionDate,
      projectRoot,
      env: options.env ?? process.env,
      writeSourceHealthBundleImpl: options.writeSourceHealthBundleImpl,
    });
    throw attachSourceHealthBundle(error, sourceHealthBundle);
  }
  const { candidate, sourceHealth } = generated;
  const fileContents = `${JSON.stringify(candidate, null, 2)}\n`;
  await mkdir(destinationRoot, { recursive: true });
  try {
    await writeFile(destination, fileContents, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Personal candidate ${editionDate} already exists; nothing was overwritten.`);
    }
    throw error;
  }

  const sourceHealthBundle = await writePersonalSourceHealthObservationally({
    sourceHealth,
    editionDate,
    projectRoot,
    env: options.env ?? process.env,
    writeSourceHealthBundleImpl: options.writeSourceHealthBundleImpl,
  });

  return {
    destination,
    relativePath: path.relative(projectRoot, destination),
    sha256: createHash("sha256").update(fileContents).digest("hex"),
    selectedStoryCount: selectedStories(candidate).length,
    candidate,
    sourceHealthBundle,
  };
}

export async function generatePersonalFreeEditionOutcome(options = {}) {
  return {
    status: "created",
    result: await generatePersonalFreeEditionFile(options),
  };
}

function parseCliArguments(argv) {
  const [editionDate, ...extraArguments] = argv;
  const allowedArguments = new Set(["--same-day-backfill", PERSONAL_FREE_GITHUB_OUTCOME_FLAG]);
  const hasUnknownArgument = extraArguments.some((argument) => !allowedArguments.has(argument));
  const hasDuplicateArgument = new Set(extraArguments).size !== extraArguments.length;
  if (
    !editionDate ||
    extraArguments.length > allowedArguments.size ||
    hasUnknownArgument ||
    hasDuplicateArgument ||
    editionDate === "--help" ||
    editionDate === "-h"
  ) {
    throw new Error(
      "Usage: node scripts/automation/personal-free-edition.mjs YYYY-MM-DD " +
        "[--same-day-backfill] [--github-actions-outcome]",
    );
  }
  return {
    editionDate,
    runMode: extraArguments.includes("--same-day-backfill")
      ? "same_day_backfill"
      : "on_time",
    reportGitHubOutcome: extraArguments.includes(PERSONAL_FREE_GITHUB_OUTCOME_FLAG),
  };
}

function validateGenerationOutcome(outcome) {
  if (
    outcome?.status === "created" &&
    typeof outcome.result?.relativePath === "string" &&
    SHA256_PATTERN.test(outcome.result?.sha256 ?? "") &&
    Number.isInteger(outcome.result?.selectedStoryCount) &&
    outcome.result.selectedStoryCount >= 0 &&
    outcome.result.selectedStoryCount <= PERSONAL_FREE_DESKS.length
  ) {
    return outcome;
  }
  throw new Error("Personal free generation returned an invalid orchestration outcome.");
}

export async function runPersonalFreeEditionCli({
  argv = process.argv.slice(2),
  env = process.env,
  generateFileImpl = generatePersonalFreeEditionFile,
  generateOutcomeImpl = generatePersonalFreeEditionOutcome,
  logImpl = console.log,
  errorImpl = console.error,
} = {}) {
  const { editionDate, runMode, reportGitHubOutcome } = parseCliArguments(argv);
  const generationOptions = { editionDate, runMode, env };
  if (!reportGitHubOutcome) {
    const result = await generateFileImpl(generationOptions);
    logImpl(`Created private free candidate ${result.relativePath} · sha256 ${result.sha256}`);
    return { status: "created", result };
  }

  const githubOutputPath = requireNonBlank(env.GITHUB_OUTPUT, "GITHUB_OUTPUT");
  const githubSummaryPath = requireNonBlank(env.GITHUB_STEP_SUMMARY, "GITHUB_STEP_SUMMARY");
  let outcome;
  try {
    outcome = validateGenerationOutcome(await generateOutcomeImpl(generationOptions));
  } catch (error) {
    await reportPersonalFreeFailure(error, { githubSummaryPath, errorImpl });
    throw error;
  }
  if (outcome.status === "created") {
    const editionFormat = outcome.result.selectedStoryCount >= 2
      ? "regular"
      : outcome.result.selectedStoryCount === 1
        ? "slim"
        : "quiet";
    await appendFile(
      githubOutputPath,
      `candidate_created=true\nselected_story_count=${outcome.result.selectedStoryCount}\n` +
        `edition_format=${editionFormat}\n`,
      "utf8",
    );
    await appendFile(
      githubSummaryPath,
      `### Personal paper ready\n\nPrepared a ${editionFormat} edition with ` +
        `${outcome.result.selectedStoryCount} source-checked ` +
        `${outcome.result.selectedStoryCount === 1 ? "story" : "stories"}. ` +
        "The editorial thresholds were unchanged.\n",
      "utf8",
    );
    logImpl(
      `Created private free candidate ${outcome.result.relativePath} · ` +
        `sha256 ${outcome.result.sha256}`,
    );
    return outcome;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPersonalFreeEditionCli().catch((error) => {
    if (
      process.env.GITHUB_ACTIONS === "true" &&
      process.argv.includes(PERSONAL_FREE_GITHUB_OUTCOME_FLAG)
    ) {
      console.error(`Personal free edition generation failed: ${personalFreeFailureCode(error)}.`);
    } else {
      console.error(`Personal free edition generation failed: ${error.message}`);
    }
    process.exitCode = 1;
  });
}
