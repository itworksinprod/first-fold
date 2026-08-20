#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { validateCanonicalEdition } from "../edition-content.mjs";
import {
  AUTOMATION_WORKFLOW,
  deriveNextPilotSequence,
  draftEdition,
} from "./draft-edition.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = path.resolve(path.dirname(scriptPath), "..", "..");

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
    editions.push(edition);
  }
  return editions;
}

function automationFromEnvironment(env) {
  const runId = env.GITHUB_RUN_ID;
  const serverUrl = env.GITHUB_SERVER_URL;
  const repository = env.GITHUB_REPOSITORY;
  if (![runId, serverUrl, repository].every((value) => typeof value === "string" && value.trim())) {
    throw new Error("GITHUB_RUN_ID, GITHUB_SERVER_URL, and GITHUB_REPOSITORY are required.");
  }
  if (serverUrl.replace(/\/$/, "") !== "https://github.com") {
    throw new Error("GITHUB_SERVER_URL must be https://github.com for the pilot.");
  }
  if (!/^[1-9]\d*$/.test(runId) || !/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error("GitHub run id or repository metadata is invalid.");
  }
  const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
  return { runId, runUrl, repository };
}

function assertWritableCandidate(candidate, { editionDate, pilotSequence }) {
  const validation = validateCanonicalEdition(candidate);
  if (!validation.valid) {
    throw new Error(`Candidate failed canonical validation: ${validation.issues.join(" ")}`);
  }
  if (
    candidate.editionDate !== editionDate ||
    candidate.status !== "published" ||
    candidate.publication.publishedAt !== candidate.publication.publishAt ||
    candidate.provenance?.automation?.workflow !== AUTOMATION_WORKFLOW ||
    candidate.provenance?.automation?.candidate !== true ||
    candidate.provenance?.automation?.pilotSequence !== pilotSequence ||
    candidate.provenance?.sourceCheck?.status !== "passed" ||
    candidate.backPage?.watchNext?.length !== 0
  ) {
    throw new Error("Candidate does not satisfy the publication-ready automatic review contract.");
  }
}

/**
 * Generate one PR candidate and create its canonical file exactly once. This
 * writes only to the local automation branch; it never commits, pushes, merges,
 * deploys, or publishes externally.
 */
export async function generateEditionFile({
  editionDate,
  projectRoot = defaultProjectRoot,
  env = process.env,
  now,
  fetchImpl = globalThis.fetch,
  sourceRequestImpl,
  sourceLookupImpl,
  sleepImpl,
  draftEditionImpl = draftEdition,
} = {}) {
  const destination = path.join(projectRoot, "content", "editions", `${editionDate}.json`);
  if (await pathExists(destination)) {
    throw new Error(`Edition ${editionDate} already exists; nothing was overwritten.`);
  }

  const priorEditions = await loadCanonicalHistory(projectRoot);
  const pilotSequence = deriveNextPilotSequence(priorEditions);
  const automation = automationFromEnvironment(env);
  const [policyText, promptText] = await Promise.all([
    readFile(path.join(projectRoot, "lib", "editorial", "prompts", "policy.ts"), "utf8"),
    readFile(path.join(projectRoot, "lib", "editorial", "prompts", "daily-run.ts"), "utf8"),
  ]);

  const candidate = await draftEditionImpl({
    editionDate,
    priorEditions,
    policyText,
    promptText,
    automation,
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    now,
    fetchImpl,
    sourceRequestImpl,
    sourceLookupImpl,
    sleepImpl,
  });
  assertWritableCandidate(candidate, { editionDate, pilotSequence });

  const fileContents = `${JSON.stringify(candidate, null, 2)}\n`;
  try {
    await writeFile(destination, fileContents, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Edition ${editionDate} already exists; nothing was overwritten.`);
    }
    throw error;
  }

  return {
    destination,
    relativePath: path.relative(projectRoot, destination),
    pilotSequence,
    sha256: createHash("sha256").update(fileContents).digest("hex"),
    candidate,
  };
}

async function main() {
  const [editionDate, ...extraArguments] = process.argv.slice(2);
  if (!editionDate || extraArguments.length > 0 || editionDate === "--help" || editionDate === "-h") {
    throw new Error("Usage: node scripts/automation/generate-edition.mjs YYYY-MM-DD");
  }

  const result = await generateEditionFile({ editionDate });
  console.log(
    `Created ${result.relativePath} · automatic pilot ${result.pilotSequence}/5 · sha256 ${result.sha256}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Edition generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
