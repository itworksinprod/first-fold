#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { validateCanonicalEdition } from "../edition-content.mjs";
import {
  draftFreeEdition,
  validateFreePilotProvenance,
} from "./draft-free-edition.mjs";
import { FREE_FEED_SOURCES } from "./free/feed-sources.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

export function freeAutomationFromEnvironment(env) {
  const runId = env.GITHUB_RUN_ID;
  const serverUrl = env.GITHUB_SERVER_URL;
  const repository = env.GITHUB_REPOSITORY;
  if (![runId, serverUrl, repository].every((value) => typeof value === "string" && value.trim())) {
    throw new Error("GITHUB_RUN_ID, GITHUB_SERVER_URL, and GITHUB_REPOSITORY are required.");
  }
  if (serverUrl.replace(/\/$/, "") !== "https://github.com") {
    throw new Error("GITHUB_SERVER_URL must be https://github.com for the free pilot.");
  }
  if (!/^[1-9]\d*$/.test(runId) || !/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error("GitHub run id or repository metadata is invalid.");
  }
  return {
    runId,
    repository,
    runUrl: `https://github.com/${repository}/actions/runs/${runId}`,
  };
}

function assertWritableFreeCandidate(candidate, { editionDate, automation, expectedFeedSourceCount }) {
  const validation = validateCanonicalEdition(candidate);
  if (!validation.valid) {
    throw new Error(`Free candidate failed canonical validation: ${validation.issues.join(" ")}`);
  }
  if (
    candidate.editionDate !== editionDate ||
    candidate.status !== "validated" ||
    candidate.publication.publishedAt !== null ||
    Object.hasOwn(candidate.provenance ?? {}, "automation")
  ) {
    throw new Error("Free candidate does not satisfy the isolated comparison contract.");
  }
  validateFreePilotProvenance(candidate, automation, { expectedFeedSourceCount });
}

/**
 * Generate a separate free comparison candidate. This writes only to
 * content/free-candidates and never commits, pushes, merges, deploys, or
 * publishes the result.
 */
export async function generateFreeEditionFile({
  editionDate,
  projectRoot = defaultProjectRoot,
  env = process.env,
  now,
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
} = {}) {
  requireEditionDate(editionDate);
  const destinationRoot = path.join(projectRoot, "content", "free-candidates");
  const destination = path.join(destinationRoot, `${editionDate}.json`);
  if (await pathExists(destination)) {
    throw new Error(`Free candidate ${editionDate} already exists; nothing was overwritten.`);
  }

  const priorEditions = await loadCanonicalHistory(projectRoot);
  const automation = freeAutomationFromEnvironment(env);
  const effectiveFeedSources = feedSources ?? FREE_FEED_SOURCES;
  const [policyText, promptText] = await Promise.all([
    readFile(path.join(projectRoot, "lib", "editorial", "prompts", "policy.ts"), "utf8"),
    readFile(path.join(projectRoot, "lib", "editorial", "prompts", "daily-run.ts"), "utf8"),
  ]);
  const candidate = await draftFreeEditionImpl({
    editionDate,
    priorEditions,
    policyText,
    promptText,
    automation,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_AI_API_TOKEN,
    model: env.CLOUDFLARE_AI_MODEL,
    now,
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
  assertWritableFreeCandidate(candidate, {
    editionDate,
    automation,
    expectedFeedSourceCount: effectiveFeedSources.length,
  });

  const fileContents = `${JSON.stringify(candidate, null, 2)}\n`;
  await mkdir(destinationRoot, { recursive: true });
  try {
    await writeFile(destination, fileContents, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Free candidate ${editionDate} already exists; nothing was overwritten.`);
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
  if (!editionDate || extraArguments.length > 0 || editionDate === "--help" || editionDate === "-h") {
    throw new Error("Usage: node scripts/automation/generate-free-edition.mjs YYYY-MM-DD");
  }
  const result = await generateFreeEditionFile({ editionDate });
  console.log(`Created isolated free candidate ${result.relativePath} · sha256 ${result.sha256}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Free edition generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
