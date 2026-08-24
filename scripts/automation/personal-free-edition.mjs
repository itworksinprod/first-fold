#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile, lstat, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { validateCanonicalEdition } from "../edition-content.mjs";
import {
  FREE_AUTOMATION_WORKFLOW,
  InsufficientFreeCandidatesError,
  draftFreeEdition,
  validateFreePilotProvenance,
} from "./draft-free-edition.mjs";
import { FREE_FEED_SOURCES } from "./free/feed-sources.mjs";
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

const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const RUN_ID_PATTERN = /^[1-9]\d*$/;
const RESPONSE_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export const PERSONAL_FREE_WORKFLOW = "personal-morning-paper";
export const PERSONAL_FREE_PROVIDER = WORKERS_AI_PROVIDER;
export const PERSONAL_FREE_RESEARCH_METHOD = "curated-live-feeds";
export const PERSONAL_FREE_MODEL = DEFAULT_CLOUDFLARE_AI_MODEL;
export const PERSONAL_FREE_EVIDENCE_POLICY = "authoritative-or-corroborated";
export const PERSONAL_FREE_MAX_MODEL_REQUESTS = 2;
export const PERSONAL_FREE_MAX_TOKENS = 6_000;
export const PERSONAL_FREE_MAX_REQUEST_BYTES = 100_000;
export const PERSONAL_FREE_LOOKBACK_HOURS = 72;
export const PERSONAL_FREE_MINIMUM_SCORE = 70;
export const PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE = 70;
export const PERSONAL_FREE_MINIMUM_STORY_COUNT = 3;
export const PERSONAL_FREE_GITHUB_OUTCOME_FLAG = "--github-actions-outcome";
export const PERSONAL_FREE_RUN_MODES = Object.freeze(["on_time", "same_day_backfill"]);
export const PERSONAL_FREE_DESKS = Object.freeze([
  "ai",
  "work-and-tools",
  "security-and-privacy",
  "platforms-and-power",
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

function buildPersonalCandidate(
  freeCandidate,
  { automation, runMode, expectedFeedSourceCount, repeatHistory },
) {
  validateFreePilotProvenance(freeCandidate, automation, {
    expectedFeedSourceCount,
    expectedRunMode: runMode,
    expectedEvidencePolicy: PERSONAL_FREE_EVIDENCE_POLICY,
    expectedRequiredStoryCount: PERSONAL_FREE_MINIMUM_STORY_COUNT,
    expectedLookbackHours: PERSONAL_FREE_LOOKBACK_HOURS,
    expectedMinimumScore: PERSONAL_FREE_MINIMUM_SCORE,
    expectedMinimumAuthoritativeScore: PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE,
  });
  const freePilot = freeCandidate?.provenance?.freePilot;
  const stories = selectedStories(freeCandidate);
  if (
    freePilot?.workflow !== FREE_AUTOMATION_WORKFLOW ||
    freePilot?.provider !== PERSONAL_FREE_PROVIDER ||
    freePilot?.model !== PERSONAL_FREE_MODEL ||
    freePilot?.inference !== "workers-ai" ||
    freePilot?.responseId === "not-invoked" ||
    freePilot?.lookbackHours !== PERSONAL_FREE_LOOKBACK_HOURS ||
    freePilot?.minimumScore !== PERSONAL_FREE_MINIMUM_SCORE ||
    freePilot?.minimumAuthoritativeScore !== PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE ||
    stories.length < PERSONAL_FREE_MINIMUM_STORY_COUNT ||
    stories.length > PERSONAL_FREE_DESKS.length ||
    stories.some((story) => !hasCompleteSourceSet(story))
  ) {
    throw new Error(
      "Personal free research did not produce at least three populated, source-checked Workers AI stories. No email candidate was returned.",
    );
  }

  const candidate = structuredClone(freeCandidate);
  delete candidate.provenance.freePilot;
  candidate.provenance.personalFreeResearch = {
    workflow: PERSONAL_FREE_WORKFLOW,
    provider: PERSONAL_FREE_PROVIDER,
    researchMethod: PERSONAL_FREE_RESEARCH_METHOD,
    model: PERSONAL_FREE_MODEL,
    runId: automation.runId,
    runUrl: automation.runUrl,
    repository: automation.repository,
    runMode,
    generatedAt: candidate.publication.generatedAt,
    inference: "workers-ai",
    feedSnapshotSha256: freePilot.feedSnapshotSha256,
    requestSha256: freePilot.requestSha256,
    responseSha256: freePilot.responseSha256,
    responseId: freePilot.responseId,
    feedSourceCount: freePilot.feedSourceCount,
    successfulFeedSourceCount: freePilot.successfulFeedSourceCount,
    candidateCount: freePilot.candidateCount,
    evidencePolicy: PERSONAL_FREE_EVIDENCE_POLICY,
    lookbackHours: freePilot.lookbackHours,
    minimumScore: freePilot.minimumScore,
    minimumAuthoritativeScore: freePilot.minimumAuthoritativeScore,
    requiredStoryCount: PERSONAL_FREE_MINIMUM_STORY_COUNT,
    selectedStoryCount: stories.length,
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
    Number.isInteger(research?.candidateCount) &&
    research.candidateCount >= PERSONAL_FREE_MINIMUM_STORY_COUNT &&
    research.candidateCount >= stories.length;

  if (
    !validation.valid ||
    candidate.status !== "validated" ||
    candidate.publication?.publishedAt !== null ||
    Object.hasOwn(candidate.provenance ?? {}, "automation") ||
    Object.hasOwn(candidate.provenance ?? {}, "freePilot") ||
    Object.hasOwn(candidate.provenance ?? {}, "personalResearch") ||
    research?.workflow !== PERSONAL_FREE_WORKFLOW ||
    research?.provider !== PERSONAL_FREE_PROVIDER ||
    research?.researchMethod !== PERSONAL_FREE_RESEARCH_METHOD ||
    research?.model !== PERSONAL_FREE_MODEL ||
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
    research?.inference !== "workers-ai" ||
    !RESPONSE_ID_PATTERN.test(research?.responseId ?? "") ||
    research?.responseId === "not-invoked" ||
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
    research?.requiredStoryCount !== PERSONAL_FREE_MINIMUM_STORY_COUNT ||
    research?.selectedStoryCount !== stories.length ||
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
    stories.length < PERSONAL_FREE_MINIMUM_STORY_COUNT ||
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
 * Generate a complete private candidate from live curated feeds and the fixed
 * Workers AI model. This function does not write, publish, email, or deploy.
 */
export async function generatePersonalFreeEdition({
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
  draftFreeEditionImpl = draftFreeEdition,
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
  const freeCandidate = await draftFreeEditionImpl({
    editionDate,
    priorEditions,
    policyText,
    promptText,
    automation,
    accountId,
    apiToken,
    model: PERSONAL_FREE_MODEL,
    now,
    runMode,
    evidencePolicy: PERSONAL_FREE_EVIDENCE_POLICY,
    requireComplete: false,
    minimumStoryCount: PERSONAL_FREE_MINIMUM_STORY_COUNT,
    lookbackHours: PERSONAL_FREE_LOOKBACK_HOURS,
    minimumScore: PERSONAL_FREE_MINIMUM_SCORE,
    minimumAuthoritativeScore: PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE,
    recentRepeatHistory: repeatHistory.entries,
    repeatFingerprintKey: apiToken,
    maxTokens: PERSONAL_FREE_MAX_TOKENS,
    maxRequestBytes: PERSONAL_FREE_MAX_REQUEST_BYTES,
    researchImpl,
    feedSources: effectiveFeedSources,
    feedRequestImpl,
    feedLookupImpl,
    aiRequestImpl,
    fetchImpl,
    sourceRequestImpl,
    sourceLookupImpl,
    sleepImpl,
  });
  return buildPersonalCandidate(freeCandidate, {
    automation,
    runMode,
    expectedFeedSourceCount: effectiveFeedSources.length,
    repeatHistory,
  });
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

  const candidate = await generatePersonalFreeEdition({ ...options, editionDate, projectRoot });
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

  return {
    destination,
    relativePath: path.relative(projectRoot, destination),
    sha256: createHash("sha256").update(fileContents).digest("hex"),
    candidate,
  };
}

export async function generatePersonalFreeEditionOutcome(options = {}) {
  try {
    return {
      status: "created",
      result: await generatePersonalFreeEditionFile(options),
    };
  } catch (error) {
    if (!(error instanceof InsufficientFreeCandidatesError)) throw error;
    return {
      status: "no-edition",
      availableCount: error.availableCount,
      requiredCount: error.requiredCount,
    };
  }
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
    SHA256_PATTERN.test(outcome.result?.sha256 ?? "")
  ) {
    return outcome;
  }
  if (
    outcome?.status === "no-edition" &&
    Number.isInteger(outcome.availableCount) &&
    Number.isInteger(outcome.requiredCount) &&
    outcome.availableCount >= 0 &&
    outcome.availableCount < outcome.requiredCount &&
    outcome.requiredCount === PERSONAL_FREE_MINIMUM_STORY_COUNT
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
  const outcome = validateGenerationOutcome(await generateOutcomeImpl(generationOptions));
  if (outcome.status === "created") {
    await appendFile(githubOutputPath, "candidate_created=true\n", "utf8");
    logImpl(
      `Created private free candidate ${outcome.result.relativePath} · ` +
        `sha256 ${outcome.result.sha256}`,
    );
    return outcome;
  }

  await appendFile(
    githubOutputPath,
    `candidate_created=false\nqualified_story_count=${outcome.availableCount}\n` +
      `required_story_count=${outcome.requiredCount}\n`,
    "utf8",
  );
  await appendFile(
    githubSummaryPath,
    "### No personal paper sent\n\n" +
      `${outcome.availableCount} of ${outcome.requiredCount} required source-checked stories ` +
      "cleared the editorial threshold. This is an expected no-edition result; " +
      "the quality bar was not lowered, the repeat ledger was not advanced, and no email was sent.\n",
    "utf8",
  );
  logImpl(
    `No private edition created: ${outcome.availableCount} of ${outcome.requiredCount} ` +
      "required source-checked stories cleared the editorial threshold.",
  );
  return outcome;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPersonalFreeEditionCli().catch((error) => {
    console.error(`Personal free edition generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
