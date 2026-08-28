import { randomUUID } from "node:crypto";
import { appendFile, link, lstat, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildFreeReportingWindow } from "./draft-free-edition.mjs";
import { ingestCuratedFeeds } from "./free/feed-engine.mjs";
import {
  assertShadowFeedSourceManifest,
  SHADOW_FEED_SOURCES,
} from "./free/shadow-feed-sources.mjs";

export const SHADOW_FEED_TRIAL_SCHEMA_VERSION = "first-fold-shadow-feed-trial-v1";
export const SHADOW_FEED_TRIAL_START_DATE = "2026-08-29";
export const SHADOW_FEED_TRIAL_END_EXCLUSIVE = "2026-09-12";
export const SHADOW_FEED_TRIAL_MINIMUM_EDITIONS = 14;
export const SHADOW_FEED_TRIAL_MAX_JSON_BYTES = 64 * 1024;
export const SHADOW_FEED_TRIAL_MAX_HTML_BYTES = 128 * 1024;

export const SHADOW_FEED_TRIAL_SETTINGS = Object.freeze({
  lookbackHours: 72,
  concurrency: 2,
  maxBytes: 512 * 1024,
  maxTotalBytes: 4 * 1024 * 1024,
  maxTotalItems: 64,
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_COUNT = 1_000_000;
const SOURCE_STATUSES = new Set(["ok", "failed"]);
const SAFE_FAILURE_CODES = new Set([
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

const TOP_LEVEL_KEYS = [
  "schemaVersion",
  "editionDate",
  "trial",
  "settings",
  "aggregate",
  "sources",
];
const TRIAL_KEYS = ["startDate", "endExclusive", "minimumEditions"];
const SETTINGS_KEYS = ["lookbackHours", "concurrency", "maxBytes", "maxTotalBytes", "maxTotalItems"];
const AGGREGATE_KEYS = [
  "configuredSourceCount",
  "successfulSourceCount",
  "failedSourceCount",
  "parsedItemCount",
  "eligibleItemCount",
  "retainedItemCount",
  "consumedBytes",
];
const SOURCE_KEYS = [
  "sourceId",
  "publisher",
  "owner",
  "desk",
  "relationship",
  "status",
  "code",
  "parsedItemCount",
  "eligibleItemCount",
];

const SHADOW_SOURCE_METADATA = Object.freeze(SHADOW_FEED_SOURCES.map((source) => Object.freeze({
  sourceId: source.id,
  publisher: source.publisher,
  owner: source.publisherKey,
  desk: source.coverageDesks[0],
  relationship: source.relationship,
})));

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

function requireEditionDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new Error("Shadow feed trial edition date must use YYYY-MM-DD.");
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error("Shadow feed trial edition date must be a real calendar date.");
  }
  return value;
}

function requireCount(value, label, maximum = MAX_COUNT) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${label} must be an integer from 0 through ${maximum}.`);
  }
  return value;
}

function requireOutputPath(value, label) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > 4_096 ||
    /[\0\r\n]/.test(value)
  ) {
    throw new Error(`${label} must be a bounded single-line path.`);
  }
  return value;
}

export function isShadowFeedTrialEdition(editionDate) {
  const normalized = requireEditionDate(editionDate);
  return normalized >= SHADOW_FEED_TRIAL_START_DATE &&
    normalized < SHADOW_FEED_TRIAL_END_EXCLUSIVE;
}

function safeFailureCode(value) {
  return typeof value === "string" && SAFE_FAILURE_CODES.has(value)
    ? value
    : "FEED_FAILED";
}

function normalizedSourceObservation(result, metadata) {
  if (!isObject(result) || result.sourceId !== metadata.sourceId || !SOURCE_STATUSES.has(result.status)) {
    throw new Error(`Shadow observation for ${metadata.sourceId} is invalid.`);
  }
  const parsedItemCount = requireCount(
    result.parsedItemCount,
    `Shadow parsed count for ${metadata.sourceId}`,
  );
  const eligibleItemCount = requireCount(
    result.eligibleItemCount,
    `Shadow eligible count for ${metadata.sourceId}`,
  );
  if (eligibleItemCount > parsedItemCount) {
    throw new Error(`Shadow observation for ${metadata.sourceId} has inconsistent item counts.`);
  }
  const failed = result.status === "failed";
  if (failed && (parsedItemCount !== 0 || eligibleItemCount !== 0)) {
    throw new Error(`Failed shadow source ${metadata.sourceId} cannot contain item counts.`);
  }
  if (!failed && result.code !== null) {
    throw new Error(`Healthy shadow source ${metadata.sourceId} cannot contain a failure code.`);
  }
  return {
    ...metadata,
    status: result.status,
    code: failed ? safeFailureCode(result.code) : null,
    parsedItemCount,
    eligibleItemCount,
  };
}

export function buildShadowFeedTrialReport({ editionDate, ingestion } = {}) {
  const normalizedDate = requireEditionDate(editionDate);
  if (!isShadowFeedTrialEdition(normalizedDate)) {
    throw new Error("A shadow feed report can only be built inside the fixed trial window.");
  }
  if (!isObject(ingestion) || !Array.isArray(ingestion.sourceResults) ||
      !Array.isArray(ingestion.items)) {
    throw new Error("Shadow feed ingestion result is invalid.");
  }
  const byId = new Map();
  for (const result of ingestion.sourceResults) {
    if (!isObject(result) || typeof result.sourceId !== "string" || byId.has(result.sourceId)) {
      throw new Error("Shadow feed ingestion contains an invalid or duplicate source result.");
    }
    byId.set(result.sourceId, result);
  }
  if (byId.size !== SHADOW_SOURCE_METADATA.length ||
      [...byId.keys()].some((sourceId) => !SHADOW_SOURCE_METADATA.some((source) => source.sourceId === sourceId))) {
    throw new Error("Shadow feed ingestion does not match the checked-in source roster.");
  }
  const sources = SHADOW_SOURCE_METADATA.map((metadata) =>
    normalizedSourceObservation(byId.get(metadata.sourceId), metadata));
  const parsedItemCount = sources.reduce((sum, source) => sum + source.parsedItemCount, 0);
  const eligibleItemCount = sources.reduce((sum, source) => sum + source.eligibleItemCount, 0);
  const report = {
    schemaVersion: SHADOW_FEED_TRIAL_SCHEMA_VERSION,
    editionDate: normalizedDate,
    trial: {
      startDate: SHADOW_FEED_TRIAL_START_DATE,
      endExclusive: SHADOW_FEED_TRIAL_END_EXCLUSIVE,
      minimumEditions: SHADOW_FEED_TRIAL_MINIMUM_EDITIONS,
    },
    settings: { ...SHADOW_FEED_TRIAL_SETTINGS },
    aggregate: {
      configuredSourceCount: sources.length,
      successfulSourceCount: sources.filter((source) => source.status === "ok").length,
      failedSourceCount: sources.filter((source) => source.status === "failed").length,
      parsedItemCount,
      eligibleItemCount,
      retainedItemCount: requireCount(
        ingestion.items.length,
        "Shadow retained item count",
        SHADOW_FEED_TRIAL_SETTINGS.maxTotalItems,
      ),
      consumedBytes: requireCount(
        ingestion.consumedBytes,
        "Shadow consumed byte count",
        SHADOW_FEED_TRIAL_SETTINGS.maxTotalBytes,
      ),
    },
    sources,
  };
  return validateShadowFeedTrialReport(report);
}

function validateFixedMetadata(actual, expected, keys, label) {
  assertExactKeys(actual, keys, label);
  for (const key of keys) {
    if (actual[key] !== expected[key]) throw new Error(`${label} does not match checked-in metadata.`);
  }
}

export function validateShadowFeedTrialReport(report) {
  assertExactKeys(report, TOP_LEVEL_KEYS, "Shadow feed trial report");
  if (report.schemaVersion !== SHADOW_FEED_TRIAL_SCHEMA_VERSION) {
    throw new Error("Shadow feed trial schemaVersion is unsupported.");
  }
  const editionDate = requireEditionDate(report.editionDate);
  if (!isShadowFeedTrialEdition(editionDate)) {
    throw new Error("Shadow feed trial report falls outside the fixed trial window.");
  }
  validateFixedMetadata(report.trial, {
    startDate: SHADOW_FEED_TRIAL_START_DATE,
    endExclusive: SHADOW_FEED_TRIAL_END_EXCLUSIVE,
    minimumEditions: SHADOW_FEED_TRIAL_MINIMUM_EDITIONS,
  }, TRIAL_KEYS, "Shadow feed trial metadata");
  validateFixedMetadata(
    report.settings,
    SHADOW_FEED_TRIAL_SETTINGS,
    SETTINGS_KEYS,
    "Shadow feed trial settings",
  );
  assertExactKeys(report.aggregate, AGGREGATE_KEYS, "Shadow feed trial aggregate");
  for (const key of AGGREGATE_KEYS) {
    const maximum = key === "consumedBytes"
      ? SHADOW_FEED_TRIAL_SETTINGS.maxTotalBytes
      : key === "retainedItemCount"
        ? SHADOW_FEED_TRIAL_SETTINGS.maxTotalItems
        : MAX_COUNT;
    requireCount(report.aggregate[key], `Shadow feed trial aggregate ${key}`, maximum);
  }
  if (!Array.isArray(report.sources) || report.sources.length !== SHADOW_SOURCE_METADATA.length) {
    throw new Error("Shadow feed trial report has an invalid source roster.");
  }
  report.sources.forEach((source, index) => {
    const expected = SHADOW_SOURCE_METADATA[index];
    assertExactKeys(source, SOURCE_KEYS, `Shadow feed trial source ${expected.sourceId}`);
    for (const key of ["sourceId", "publisher", "owner", "desk", "relationship"]) {
      if (source[key] !== expected[key]) {
        throw new Error(`Shadow feed trial source ${expected.sourceId} does not match checked-in metadata.`);
      }
    }
    if (!SOURCE_STATUSES.has(source.status)) {
      throw new Error(`Shadow feed trial source ${expected.sourceId} has an invalid status.`);
    }
    requireCount(source.parsedItemCount, `Shadow parsed count for ${expected.sourceId}`);
    requireCount(source.eligibleItemCount, `Shadow eligible count for ${expected.sourceId}`);
    if (source.eligibleItemCount > source.parsedItemCount) {
      throw new Error(`Shadow feed trial source ${expected.sourceId} has inconsistent counts.`);
    }
    if (source.status === "ok" && source.code !== null) {
      throw new Error(`Healthy shadow source ${expected.sourceId} cannot contain a failure code.`);
    }
    if (source.status === "failed" &&
        (!SAFE_FAILURE_CODES.has(source.code) || source.parsedItemCount !== 0 || source.eligibleItemCount !== 0)) {
      throw new Error(`Failed shadow source ${expected.sourceId} is not safely represented.`);
    }
  });
  const successful = report.sources.filter((source) => source.status === "ok").length;
  const failed = report.sources.filter((source) => source.status === "failed").length;
  const parsed = report.sources.reduce((sum, source) => sum + source.parsedItemCount, 0);
  const eligible = report.sources.reduce((sum, source) => sum + source.eligibleItemCount, 0);
  if (
    report.aggregate.configuredSourceCount !== SHADOW_SOURCE_METADATA.length ||
    report.aggregate.successfulSourceCount !== successful ||
    report.aggregate.failedSourceCount !== failed ||
    successful + failed !== SHADOW_SOURCE_METADATA.length ||
    report.aggregate.parsedItemCount !== parsed ||
    report.aggregate.eligibleItemCount !== eligible ||
    report.aggregate.retainedItemCount > eligible
  ) {
    throw new Error("Shadow feed trial aggregate totals do not match its sources.");
  }
  if (Buffer.byteLength(JSON.stringify(report), "utf8") > SHADOW_FEED_TRIAL_MAX_JSON_BYTES) {
    throw new Error("Shadow feed trial JSON exceeds its size limit.");
  }
  return report;
}

export async function observeShadowFeedTrial({
  editionDate,
  retrievedAt = new Date().toISOString(),
  lookupImpl,
  requestImpl,
} = {}) {
  const normalizedDate = requireEditionDate(editionDate);
  if (!isShadowFeedTrialEdition(normalizedDate)) {
    return { active: false, available: false, report: null };
  }
  assertShadowFeedSourceManifest();
  const reportingWindow = buildFreeReportingWindow(normalizedDate, {
    lookbackHours: SHADOW_FEED_TRIAL_SETTINGS.lookbackHours,
  });
  // This is intentionally ingestion-only. No candidate assessment, drafting,
  // provider call, or production manifest mutation is reachable from here.
  const ingestion = await ingestCuratedFeeds({
    sources: SHADOW_FEED_SOURCES,
    reportingWindow,
    retrievedAt,
    concurrency: SHADOW_FEED_TRIAL_SETTINGS.concurrency,
    maxBytes: SHADOW_FEED_TRIAL_SETTINGS.maxBytes,
    maxTotalBytes: SHADOW_FEED_TRIAL_SETTINGS.maxTotalBytes,
    maxTotalItems: SHADOW_FEED_TRIAL_SETTINGS.maxTotalItems,
    lookupImpl,
    requestImpl,
  });
  return {
    active: true,
    available: true,
    report: buildShadowFeedTrialReport({ editionDate: normalizedDate, ingestion }),
  };
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

export function renderShadowFeedTrialJson(report) {
  validateShadowFeedTrialReport(report);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (Buffer.byteLength(json, "utf8") > SHADOW_FEED_TRIAL_MAX_JSON_BYTES) {
    throw new Error("Shadow feed trial JSON exceeds its size limit.");
  }
  return json;
}

export function renderShadowFeedTrialHtml(report) {
  validateShadowFeedTrialReport(report);
  const rows = report.sources.map((source) =>
    `<tr><td>${escapeHtml(source.publisher)}</td><td><code>${escapeHtml(source.sourceId)}</code></td>` +
    `<td>${escapeHtml(source.desk)}</td><td>${escapeHtml(source.relationship)}</td>` +
    `<td>${escapeHtml(source.status)}</td><td><code>${escapeHtml(source.code ?? "—")}</code></td>` +
    `<td>${source.parsedItemCount}</td><td>${source.eligibleItemCount}</td></tr>`).join("");
  const aggregate = report.aggregate;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>First Fold shadow feed trial — ${escapeHtml(report.editionDate)}</title><style>:root{color-scheme:light;--ink:#171512;--paper:#f5f0e6;--rule:#aaa08e;--accent:#712b27}*{box-sizing:border-box}body{margin:0;background:#ded8cc;color:var(--ink);font:15px/1.5 Georgia,'Times New Roman',serif}.page{width:min(1080px,calc(100% - 24px));margin:24px auto;padding:32px;background:var(--paper);border:1px solid var(--rule)}h1{font-size:clamp(32px,6vw,58px);line-height:1;margin:.2em 0}.kicker,.summary,.note,table{font-family:Arial,Helvetica,sans-serif}.kicker{color:var(--accent);font-weight:700;letter-spacing:.12em;text-transform:uppercase}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;padding:16px 0;border-block:3px double var(--ink)}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px 8px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}th{letter-spacing:.05em;text-transform:uppercase}.note{margin-top:28px;font-size:13px}code{font-size:12px}@media(max-width:600px){.page{width:100%;margin:0;padding:20px 14px;border:0}}</style></head><body><main class="page"><p class="kicker">Observational trial</p><h1>Shadow feed health</h1><p>Edition ${escapeHtml(report.editionDate)} · fixed 14-edition window</p><div class="summary"><span><strong>${aggregate.successfulSourceCount}/${aggregate.configuredSourceCount}</strong><br>healthy sources</span><span><strong>${aggregate.parsedItemCount}</strong><br>parsed entries</span><span><strong>${aggregate.eligibleItemCount}</strong><br>eligible entries</span><span><strong>${aggregate.retainedItemCount}</strong><br>retained entries</span><span><strong>${aggregate.consumedBytes}</strong><br>bytes consumed</span></div><div class="scroll"><table><thead><tr><th>Publisher</th><th>Source</th><th>Desk</th><th>Relationship</th><th>Status</th><th>Code</th><th>Parsed</th><th>Eligible</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">Counts-only observation. Shadow sources cannot nominate or publish stories. This report contains no feed URLs, redirect trails, messages, article text, candidates, story identifiers, hashes, recipient data, or provider data.</p></main></body></html>`;
  if (Buffer.byteLength(html, "utf8") > SHADOW_FEED_TRIAL_MAX_HTML_BYTES) {
    throw new Error("Shadow feed trial HTML exceeds its size limit.");
  }
  return html;
}

async function removeIfSameInode(filename, temporary) {
  try {
    const [published, staged] = await Promise.all([lstat(filename), lstat(temporary)]);
    if (published.dev === staged.dev && published.ino === staged.ino) await unlink(filename);
  } catch {
    // Cleanup is best effort; preserve the original exclusive-write error.
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

export async function writeShadowFeedTrialBundle(report, outputDirectory) {
  validateShadowFeedTrialReport(report);
  const requested = requireOutputPath(outputDirectory, "Shadow feed trial outputDirectory");
  const directory = path.resolve(requested);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Shadow feed trial outputDirectory must be a real non-symlink directory.");
  }
  const json = renderShadowFeedTrialJson(report);
  const html = renderShadowFeedTrialHtml(report);
  const jsonPath = path.join(directory, "shadow-feed-trial.json");
  const htmlPath = path.join(directory, "shadow-feed-trial.html");
  await exclusiveBundleWrite([
    { filename: jsonPath, contents: json },
    { filename: htmlPath, contents: html },
  ]);
  return { directory, jsonPath, htmlPath, json, html };
}

function parseCliArguments(argv) {
  if (!Array.isArray(argv) || argv.length !== 2 || argv.some((argument) => argument === "--help" || argument === "-h")) {
    throw new Error(
      "Usage: node scripts/automation/shadow-feed-trial.mjs YYYY-MM-DD OUTPUT_DIRECTORY",
    );
  }
  return {
    editionDate: requireEditionDate(argv[0]),
    outputDirectory: requireOutputPath(argv[1], "Shadow feed trial output directory"),
  };
}

function renderStepSummary(outcome) {
  if (!outcome.active) {
    return "### Shadow feed trial\n\nInactive for this edition; no shadow feeds were requested and no artifact was written.\n";
  }
  const aggregate = outcome.report.aggregate;
  return "### Shadow feed trial\n\n" +
    `Observed ${aggregate.successfulSourceCount}/${aggregate.configuredSourceCount} healthy trial sources; ` +
    `${aggregate.parsedItemCount} entries parsed, ${aggregate.eligibleItemCount} eligible, and ` +
    `${aggregate.retainedItemCount} retained within the fixed safety limits. ` +
    "The observation was counts-only and could not affect the paper.\n";
}

export async function runShadowFeedTrialCli({
  argv = process.argv.slice(2),
  env = process.env,
  retrievedAt = new Date().toISOString(),
  lookupImpl,
  requestImpl,
  logImpl = console.log,
} = {}) {
  const { editionDate, outputDirectory } = parseCliArguments(argv);
  const githubOutputPath = requireOutputPath(env.GITHUB_OUTPUT, "GITHUB_OUTPUT");
  const githubSummaryPath = requireOutputPath(env.GITHUB_STEP_SUMMARY, "GITHUB_STEP_SUMMARY");
  const outcome = await observeShadowFeedTrial({
    editionDate,
    retrievedAt,
    lookupImpl,
    requestImpl,
  });
  if (!outcome.active) {
    await appendFile(githubOutputPath, "active=false\navailable=false\npath=\n", "utf8");
    await appendFile(githubSummaryPath, `\n${renderStepSummary(outcome)}`, "utf8");
    logImpl("Shadow feed trial inactive; no artifact was written.");
    return outcome;
  }
  const bundle = await writeShadowFeedTrialBundle(outcome.report, outputDirectory);
  await appendFile(
    githubOutputPath,
    `active=true\navailable=true\npath=${bundle.directory}\n`,
    "utf8",
  );
  await appendFile(githubSummaryPath, `\n${renderStepSummary(outcome)}`, "utf8");
  logImpl(`Created counts-only shadow feed report for ${editionDate}.`);
  return { ...outcome, bundle };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runShadowFeedTrialCli().catch((error) => {
    console.error(`Shadow feed trial failed: ${error.message}`);
    process.exitCode = 1;
  });
}
