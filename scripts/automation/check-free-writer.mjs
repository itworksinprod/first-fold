#!/usr/bin/env node

// Real Workers AI smoke against synthetic sources only. This is neither live
// news research nor a delivery path, and it cannot create or send an edition.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildFreeEditorialBaselines } from "../../tests/fixtures/free-editorial-evals.mjs";
import { groundedRequestBudget, synthesizeGroundedEditorial } from "./free/grounded-draft.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, WORKERS_AI_PROVIDER, requestWorkersAiEditorial,
  workersAiRunUrl, workersAiFailureDiagnostic, resolveCloudflareAiModel } from "./free/workers-ai.mjs";

const SAFE_CODES = new Set([
  "SHAPE", "CLAIM_SHAPE", "READER_COPY", "CITATION_UNKNOWN", "NUMERIC_CITATION", "SOURCE_CAVEAT",
  "CORROBORATION", "WORD_COUNT", "GENERIC_COPY", "NUMERIC_ANCHOR", "ATTRIBUTION", "ORIGINALITY",
  "EDITORIAL_FORMAT", "WORKERS_AI_EDITORIAL_FORMAT_INVALID", "WORKERS_AI_EDITORIAL_UNAVAILABLE",
  "PROVIDER_OR_FORMAT_ERROR", "SMOKE_REQUEST_BUDGET", "SMOKE_REQUEST_CONTRACT",
  "REVIEW_SHAPE", "REVIEW_BINDING", "REVIEW_CLAIM_SUPPORT", "REVIEW_FACTS", "REVIEW_ATTRIBUTION",
  "REVIEW_ANALYSIS", "REVIEW_USEFULNESS",
  "READER_PROSE_TYPE", "READER_PROSE_EMPTY", "READER_PROSE_SCHEMA_FRAGMENT", "READER_PROSE_STRUCTURE",
  "READER_PROSE_INCOMPLETE", "READER_PROSE_DANGLING_ENDING", "READER_PROSE_UNBALANCED_QUOTE",
  "SMOKE_ENDPOINT_REJECTED", "SMOKE_CONFIGURATION_INVALID", "SMOKE_AUTHORITY_REJECTED",
  "SMOKE_GROUNDED_SUMMARIES_INCOMPLETE", "SMOKE_REVIEW_INCOMPLETE", "SMOKE_UNCLASSIFIED_FAILURE",
]);
const SAFE_STAGES = new Set([
  "local-evidence-check", "draft-repair", "draft-format-repair", "semantic-evidence-check", "free-writer-unavailable",
]);
const safeCode = value => SAFE_CODES.has(value) ? value : "SMOKE_UNCLASSIFIED_FAILURE";
const failure = code => Object.assign(new Error(code), { code });

export function assertFreeWriterSmokeAuthority(env) {
  if (env.GITHUB_REPOSITORY !== "itworksinprod/first-fold" || env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_ACTOR !== "itworksinprod" || env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GITHUB_RUN_ATTEMPT !== "1") throw failure("SMOKE_AUTHORITY_REJECTED");
}

/** Test hooks replace only the provider request/transport. The CLI does not
 * expose those hooks: its writer, optional repair and semantic review are real. */
export async function checkFreeWriter({ accountId, apiToken,
  model = DEFAULT_CLOUDFLARE_AI_MODEL,
  aiRequestImpl = requestWorkersAiEditorial, fetchImpl = globalThis.fetch } = {}) {
  if (!/^[a-f0-9]{32}$/iu.test(accountId ?? "") || typeof apiToken !== "string" ||
      apiToken !== apiToken.trim() || !apiToken || apiToken.length > 4_096 || /[\p{Cc}\p{Cf}]/u.test(apiToken)) {
    throw failure("SMOKE_CONFIGURATION_INVALID");
  }
  try { model = resolveCloudflareAiModel(model); } catch { throw failure("SMOKE_CONFIGURATION_INVALID"); }
  const maxModelRequests = groundedRequestBudget(model);
  const fixtures = buildFreeEditorialBaselines();
  const candidates = fixtures.map(({ candidate }) => candidate);
  const baseline = {
    frontPage: { note: "Synthetic writer smoke; no current reporting and no email.", estimatedMinutes: 1 },
    desks: Object.fromEntries(fixtures.map(({ id, desk, candidate }) => [desk, { story: {
      id, headline: "SYNTHETIC UNACCEPTED BASELINE", deck: "No model draft accepted yet.",
      whatHappened: "", whyItMatters: "", whatToDoOrWatch: "", evidence: [],
      sources: candidate.sources, selection: { score: 80 },
    } }])),
  };
  let modelRequests = 0;
  let networkRequests = 0;
  const diagnostics = [];
  const endpoint = workersAiRunUrl(accountId, model);
  const boundedFetch = async (url, options) => {
    if (url !== endpoint || options?.method !== "POST" || options?.redirect !== "error") {
      throw failure("SMOKE_ENDPOINT_REJECTED");
    }
    if (networkRequests >= maxModelRequests) throw failure("SMOKE_REQUEST_BUDGET");
    networkRequests++;
    return fetchImpl(url, options);
  };
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates, accountId, apiToken, model,
    fetchImpl: boundedFetch,
    aiRequestImpl: async options => {
      if (modelRequests >= maxModelRequests) throw failure("SMOKE_REQUEST_BUDGET");
      if (options.model !== model || options.maxAttempts !== 1 ||
          options.maxTokens > 4_000 || options.timeoutMs > 90_000 ||
          options.maxRequestBytes > 70_000 || options.maxResponseBytes > 100_000) {
        throw failure("SMOKE_REQUEST_CONTRACT");
      }
      modelRequests++;
      return aiRequestImpl(options);
    },
    onDiagnostic: event => {
      const diagnostic = { stage: SAFE_STAGES.has(event?.stage) ? event.stage : "unknown-stage" };
      for (const field of ["submitted", "accepted"]) {
        if (Number.isInteger(event?.[field]) && event[field] >= 0 && event[field] <= 4) diagnostic[field] = event[field];
      }
      if (event?.stage === "free-writer-unavailable" && typeof event.httpStatus === "string" &&
          /^[1-5]\d{2}$/u.test(event.httpStatus)) {
        diagnostic.httpStatus = Number(event.httpStatus);
      }
      const providerCode = workersAiFailureDiagnostic(event).providerCode;
      if (event?.stage === "free-writer-unavailable" && providerCode !== null) diagnostic.providerCode = providerCode;
      const formatReason = workersAiFailureDiagnostic(event).formatReason;
      if (event?.stage === "free-writer-unavailable" && formatReason) diagnostic.formatReason = formatReason;
      const codes = [...(Array.isArray(event?.rejectionCodes) ? event.rejectionCodes : []),
        ...[event?.rejectionCode, event?.code].filter(Boolean)];
      if (codes.length) diagnostic.codes = [...new Set(codes.map(safeCode))].slice(0, 8);
      diagnostics.push(diagnostic);
    },
  });
  const acceptedStories = fixtures.filter(({ id, desk }) => {
    const story = result?.editorial?.desks?.[desk]?.story;
    return story?.id === id && story.evidence?.length === 2 && story.evidence.every(claim =>
      typeof claim?.id === "string" && claim.id.startsWith(`${id}-grounded-`));
  }).length;
  const checkedStories = diagnostics.findLast(event => event.stage === "semantic-evidence-check")?.accepted ?? 0;
  const complete = acceptedStories === fixtures.length && checkedStories === fixtures.length &&
    result?.inference?.provider === WORKERS_AI_PROVIDER && result.inference.model === model;
  const codes = [...new Set(diagnostics.flatMap(event => event.codes ?? []))];
  if (acceptedStories !== fixtures.length) codes.push("SMOKE_GROUNDED_SUMMARIES_INCOMPLETE");
  if (checkedStories !== fixtures.length) codes.push("SMOKE_REVIEW_INCOMPLETE");
  return {
    mode: "synthetic-free-writer-only-not-current-news",
    model,
    status: complete ? "passed" : "failed",
    stories: fixtures.length, acceptedStories, checkedStories,
    modelRequests, networkRequests, maxModelRequests,
    researchQueries: 0, emailRequests: 0,
    codes: [...new Set(codes)], diagnostics,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw failure("SMOKE_CONFIGURATION_INVALID");
    assertFreeWriterSmokeAuthority(process.env);
    const report = await checkFreeWriter({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_AI_API_TOKEN, model: process.env.FREE_WRITER_MODEL });
    console.info(`::notice title=Synthetic free writer only::${JSON.stringify(report)}`);
    if (report.status !== "passed") {
      console.error("::error title=Synthetic writer quality failure::SMOKE_GROUNDED_SUMMARIES_INCOMPLETE");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`::error title=Synthetic writer smoke failure::${safeCode(error?.code)}`);
    process.exitCode = 1;
  }
}
