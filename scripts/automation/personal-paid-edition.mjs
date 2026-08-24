#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { validateCanonicalEdition } from "../edition-content.mjs";
import { buildEditionDraft, localTimeToIso } from "../new-edition.mjs";
import {
  DEFAULT_OPENAI_MODEL,
  runWebSearchEditorial,
} from "./draft-edition.mjs";
import { runNewsroomQa } from "./newsroom-qa.mjs";

const modulePath = fileURLToPath(import.meta.url);
const defaultProjectRoot = path.resolve(path.dirname(modulePath), "..", "..");

export const PERSONAL_PAID_WORKFLOW = "personal-morning-paper";
export const PERSONAL_PAID_PROVIDER = "openai-responses";
export const PERSONAL_PAID_RESEARCH_TOOL = "web_search";
export const PERSONAL_PAID_WINDOW_POLICY =
  "previous-day-05:00-to-edition-day-05:00-America/New_York";
export const PERSONAL_PAID_RUN_MODES = Object.freeze(["on_time", "same_day_backfill"]);
export const PERSONAL_PAID_DESKS = Object.freeze([
  "ai",
  "work-and-tools",
  "security-and-privacy",
  "platforms-and-power",
]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const localDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireNonBlank(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function requireEditionDate(value) {
  if (!DATE_PATTERN.test(value ?? "")) {
    throw new Error("editionDate must use YYYY-MM-DD.");
  }
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("editionDate must be a real calendar date.");
  }
  return value;
}

function shiftDate(editionDate, days) {
  const instant = Date.parse(`${requireEditionDate(editionDate)}T12:00:00.000Z`);
  return new Date(instant + (days * 86_400_000)).toISOString().slice(0, 10);
}

function issueNumberForDate(latestEdition, editionDate) {
  const latest = Date.parse(`${requireEditionDate(latestEdition.editionDate)}T12:00:00.000Z`);
  const target = Date.parse(`${requireEditionDate(editionDate)}T12:00:00.000Z`);
  const elapsedDays = Math.round((target - latest) / 86_400_000);
  if (elapsedDays < 1) {
    throw new Error(
      `Personal paid edition date must be later than the latest canonical edition (${latestEdition.editionDate}).`,
    );
  }
  return latestEdition.issueNumber + elapsedDays;
}

function localDate(instant) {
  const parts = localDateFormatter.formatToParts(new Date(instant));
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function resolveNow(now) {
  const supplied = typeof now === "function" ? now() : now;
  const resolved = supplied === undefined ? new Date() : new Date(supplied);
  if (!Number.isFinite(resolved.getTime())) {
    throw new Error("The personal research clock returned an invalid instant.");
  }
  return resolved.toISOString();
}

function reportingWindowLabel(startInclusive, endExclusive) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${formatter.format(new Date(startInclusive))} at 5:00 AM ET through ${formatter.format(new Date(endExclusive))} at 5:00 AM ET`;
}

export function assertPersonalPaidGenerationTime({
  editionDate,
  now,
  cutoffInstant,
  publishInstant,
  runMode = "on_time",
}) {
  const generatedAt = resolveNow(now);
  if (!PERSONAL_PAID_RUN_MODES.includes(runMode)) {
    throw new Error("Personal paid runMode must be on_time or same_day_backfill.");
  }
  if (localDate(generatedAt) !== editionDate) {
    throw new Error("The requested edition date must equal the current America/New_York date.");
  }
  if (Date.parse(generatedAt) < Date.parse(cutoffInstant)) {
    throw new Error("Personal paid research cannot begin before the 05:00 New York cutoff.");
  }
  if (runMode === "same_day_backfill") {
    if (Date.parse(generatedAt) < Date.parse(publishInstant)) {
      throw new Error("A same-day personal paid backfill cannot begin before 06:00 New York time.");
    }
    return generatedAt;
  }
  if (Date.parse(generatedAt) >= Date.parse(publishInstant)) {
    throw new Error("On-time personal paid research must begin before 06:00 New York time.");
  }
  return generatedAt;
}

function automationFromEnvironment(env) {
  const runId = requireNonBlank(env.GITHUB_RUN_ID, "GITHUB_RUN_ID");
  const repository = requireNonBlank(env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const serverUrl = requireNonBlank(env.GITHUB_SERVER_URL, "GITHUB_SERVER_URL").replace(/\/$/, "");
  if (!/^[1-9]\d*$/.test(runId) || !/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error("GitHub run id or repository metadata is invalid.");
  }
  if (serverUrl !== "https://github.com") {
    throw new Error("GITHUB_SERVER_URL must be https://github.com.");
  }
  return {
    runId,
    repository,
    runUrl: `${serverUrl}/${repository}/actions/runs/${runId}`,
  };
}

async function loadCanonicalHistory(projectRoot) {
  const contentRoot = path.join(projectRoot, "content", "editions");
  const filenames = (await readdir(contentRoot))
    .filter((filename) => filename.endsWith(".json"))
    .sort();
  if (filenames.length === 0) {
    throw new Error("At least one canonical edition is required for personal paid research.");
  }

  const editions = [];
  for (const filename of filenames) {
    let edition;
    try {
      edition = JSON.parse(await readFile(path.join(contentRoot, filename), "utf8"));
    } catch {
      throw new Error(`Canonical edition ${filename} is not readable JSON.`);
    }
    const validation = validateCanonicalEdition(edition);
    if (!validation.valid || filename !== `${edition.editionDate}.json`) {
      throw new Error(`Canonical edition ${filename} is invalid or misnamed.`);
    }
    editions.push(edition);
  }
  const sorted = editions.sort((left, right) => left.editionDate.localeCompare(right.editionDate));
  if (sorted.at(-1).status !== "published") {
    throw new Error("The latest canonical edition must be published before personal research can run.");
  }
  return sorted;
}

function prepareScaffold(priorEditions, editionDate) {
  const latestEdition = priorEditions.at(-1);
  const issueNumber = issueNumberForDate(latestEdition, editionDate);
  const scaffold = buildEditionDraft({ latestEdition, editionDate, issueNumber });
  const startInclusive = localTimeToIso(shiftDate(editionDate, -1), 5, 0);
  const endExclusive = localTimeToIso(editionDate, 5, 0);
  scaffold.reportingWindow = {
    startInclusive,
    endExclusive,
    displayLabel: reportingWindowLabel(startInclusive, endExclusive),
  };
  return scaffold;
}

function selectedStoryCount(candidate) {
  return PERSONAL_PAID_DESKS.filter((desk) => isObject(candidate.desks?.[desk]?.story)).length;
}

function assertAllDesksPopulated(candidate) {
  const quietDesks = PERSONAL_PAID_DESKS.filter((desk) => !isObject(candidate.desks?.[desk]?.story));
  if (quietDesks.length > 0) {
    throw new Error(
      `Personal paid research did not produce one validated story for every desk; quiet desks: ${quietDesks.join(", ")}. No email candidate was returned.`,
    );
  }
}

function buildCandidate({ scaffold, editorial, research, automation, runMode }) {
  const storyCount = PERSONAL_PAID_DESKS.filter(
    (desk) => isObject(editorial.desks?.[desk]?.story),
  ).length;
  return {
    ...scaffold,
    status: "validated",
    publication: {
      ...scaffold.publication,
      publishedAt: null,
    },
    frontPage: editorial.frontPage,
    desks: editorial.desks,
    backPage: editorial.backPage,
    corrections: [],
    provenance: {
      ...scaffold.provenance,
      personalResearch: {
        workflow: PERSONAL_PAID_WORKFLOW,
        provider: PERSONAL_PAID_PROVIDER,
        researchTool: PERSONAL_PAID_RESEARCH_TOOL,
        model: requireNonBlank(research.requestBody.model, "Paid research model"),
        responseId: requireNonBlank(research.responseId, "OpenAI response id"),
        runId: automation.runId,
        runUrl: automation.runUrl,
        repository: automation.repository,
        generatedAt: scaffold.publication.generatedAt,
        runMode,
        webSearchCompleted: true,
        selectedStoryCount: storyCount,
        promptSha256: createHash("sha256")
          .update(JSON.stringify(research.requestBody.input))
          .digest("hex"),
        schemaSha256: createHash("sha256")
          .update(JSON.stringify(research.requestBody.text?.format?.schema))
          .digest("hex"),
        windowPolicy: PERSONAL_PAID_WINDOW_POLICY,
        ephemeral: true,
      },
      sourceCheck: {
        status: "not-run",
        checkedAt: null,
        checkedSourceCount: 0,
        issues: [],
      },
    },
  };
}

export function validatePersonalPaidCandidate(candidate, { runMode } = {}) {
  const validation = validateCanonicalEdition(candidate);
  const personal = candidate?.provenance?.personalResearch;
  const sourceCheck = candidate?.provenance?.sourceCheck;
  const exactStart = localTimeToIso(shiftDate(candidate?.editionDate, -1), 5, 0);
  const exactEnd = localTimeToIso(candidate?.editionDate, 5, 0);
  if (
    !validation.valid ||
    candidate.status !== "validated" ||
    candidate.publication?.publishedAt !== null ||
    Object.hasOwn(candidate.provenance ?? {}, "automation") ||
    Object.hasOwn(candidate.provenance ?? {}, "freePilot") ||
    personal?.workflow !== PERSONAL_PAID_WORKFLOW ||
    personal?.provider !== PERSONAL_PAID_PROVIDER ||
    personal?.researchTool !== PERSONAL_PAID_RESEARCH_TOOL ||
    personal?.webSearchCompleted !== true ||
    personal?.selectedStoryCount !== 4 ||
    personal?.windowPolicy !== PERSONAL_PAID_WINDOW_POLICY ||
    personal?.ephemeral !== true ||
    !PERSONAL_PAID_RUN_MODES.includes(personal?.runMode) ||
    (runMode !== undefined && personal.runMode !== runMode) ||
    candidate.reportingWindow?.startInclusive !== exactStart ||
    candidate.reportingWindow?.endExclusive !== exactEnd ||
    selectedStoryCount(candidate) !== 4 ||
    sourceCheck?.status !== "passed" ||
    !Array.isArray(sourceCheck?.issues) ||
    sourceCheck.issues.length !== 0
  ) {
    throw new Error("Personal paid candidate failed its private source-checked provenance contract.");
  }
  return true;
}

/**
 * Run paid Responses web research and return one source-checked personal
 * candidate entirely in memory. This does not write, publish, email, or deploy.
 */
export async function generatePersonalPaidEdition({
  editionDate,
  projectRoot = defaultProjectRoot,
  env = process.env,
  now,
  runMode = "on_time",
  fetchImpl = globalThis.fetch,
  sourceRequestImpl,
  sourceLookupImpl,
  sourceCheckTimeoutMs = 5_000,
  timeoutMs = 120_000,
  maxAttempts = 2,
  sleepImpl,
  runWebSearchEditorialImpl = runWebSearchEditorial,
} = {}) {
  requireEditionDate(editionDate);
  requireNonBlank(env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const automation = automationFromEnvironment(env);
  const priorEditions = await loadCanonicalHistory(projectRoot);
  const [policyText, promptText] = await Promise.all([
    readFile(path.join(projectRoot, "lib", "editorial", "prompts", "policy.ts"), "utf8"),
    readFile(path.join(projectRoot, "lib", "editorial", "prompts", "daily-run.ts"), "utf8"),
  ]);
  const scaffold = prepareScaffold(priorEditions, editionDate);
  const generatedAt = assertPersonalPaidGenerationTime({
    editionDate,
    now,
    cutoffInstant: scaffold.reportingWindow.endExclusive,
    publishInstant: scaffold.publication.publishAt,
    runMode,
  });
  scaffold.publication.generatedAt = generatedAt;

  const research = await runWebSearchEditorialImpl({
    scaffold,
    priorEditions,
    policyText,
    promptText,
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    selectionMode: "personal-complete",
    fetchImpl,
    timeoutMs,
    maxAttempts,
    sleepImpl,
  });
  if (
    !Array.isArray(research?.webSearchCalls) ||
    !research.webSearchCalls.some(
      (call) => call?.type === "web_search_call" && call?.status === "completed",
    )
  ) {
    throw new Error("Personal paid research did not complete the required web search.");
  }
  const candidate = buildCandidate({
    scaffold,
    editorial: research.editorial,
    research,
    automation,
    runMode,
  });
  assertAllDesksPopulated(candidate);

  const checkedAt = resolveNow(now);
  if (
    localDate(checkedAt) !== editionDate ||
    Date.parse(checkedAt) < Date.parse(generatedAt) ||
    (runMode === "on_time" && Date.parse(checkedAt) >= Date.parse(scaffold.publication.publishAt))
  ) {
    throw new Error("Personal paid research did not complete in its allowed same-day delivery window.");
  }
  const qaResult = await runNewsroomQa(candidate, {
    allowedSourceUrls: research.allowedSourceUrls,
    priorEditions,
    checkedAt,
    checkLinks: true,
    requestImpl: sourceRequestImpl,
    lookupImpl: sourceLookupImpl,
    timeoutMs: sourceCheckTimeoutMs,
    temporalMode: runMode === "same_day_backfill" ? "personal-same-day-backfill" : undefined,
  });
  candidate.provenance.sourceCheck = qaResult.sourceCheck;
  validatePersonalPaidCandidate(candidate, { runMode });
  return candidate;
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

/**
 * Write the private candidate exactly once to content/personal-candidates.
 * The workflow must email and remove its checkout; this function never commits,
 * pushes, creates a PR, publishes Pages, or sends the email itself.
 */
export async function generatePersonalPaidEditionFile(options = {}) {
  const editionDate = requireEditionDate(options.editionDate);
  const projectRoot = options.projectRoot ?? defaultProjectRoot;
  const destinationRoot = path.join(projectRoot, "content", "personal-candidates");
  const destination = path.join(destinationRoot, `${editionDate}.json`);
  if (await pathExists(destination)) {
    throw new Error(`Personal paid candidate ${editionDate} already exists; nothing was overwritten.`);
  }

  const candidate = await generatePersonalPaidEdition({ ...options, editionDate, projectRoot });
  validatePersonalPaidCandidate(candidate, { runMode: options.runMode ?? "on_time" });
  const fileContents = `${JSON.stringify(candidate, null, 2)}\n`;
  await mkdir(destinationRoot, { recursive: true });
  try {
    await writeFile(destination, fileContents, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Personal paid candidate ${editionDate} already exists; nothing was overwritten.`);
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

async function main() {
  const [editionDate, ...extraArguments] = process.argv.slice(2);
  const isBackfill = extraArguments.length === 1 && extraArguments[0] === "--same-day-backfill";
  if (
    !editionDate ||
    extraArguments.length > (isBackfill ? 1 : 0) ||
    (extraArguments.length > 0 && !isBackfill) ||
    editionDate === "--help" ||
    editionDate === "-h"
  ) {
    throw new Error(
      "Usage: node scripts/automation/personal-paid-edition.mjs YYYY-MM-DD [--same-day-backfill]",
    );
  }
  const runMode = isBackfill ? "same_day_backfill" : "on_time";
  const result = await generatePersonalPaidEditionFile({ editionDate, runMode });
  console.log(`Created private paid candidate ${result.relativePath} · sha256 ${result.sha256}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Personal paid edition generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
