#!/usr/bin/env node

// One reviewer-only request against synthetic evidence. Never current news,
// research, an edition, an email, or authorization to change the daily profile.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildExplicitClaimReview, validateExplicitClaimReview } from "./free/explicit-claim-review.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, WORKERS_AI_PROVIDER, buildWorkersAiRequest,
  requestWorkersAiEditorial, workersAiRunUrl } from "./free/workers-ai.mjs";

const MAX_TOKENS = 1_800;
const MAX_REQUEST_BYTES = 70_000;
const SAFE_CODES = new Set(["REVIEW_EVAL_AUTHORITY_REJECTED", "REVIEW_EVAL_CONFIGURATION_INVALID",
  "REVIEW_EVAL_REQUEST_SIZE", "REVIEW_EVAL_ENDPOINT_REJECTED", "REVIEW_EVAL_REQUEST_BUDGET",
  "REVIEW_EVAL_PROVENANCE_INVALID", "REVIEW_EVAL_CONTRACT_INVALID", "REVIEW_EVAL_VERDICT_MISMATCH",
  "REVIEW_EVAL_PROVIDER_FAILURE"]);
const failure = code => Object.assign(new Error(code), { code });
const safeCode = code => SAFE_CODES.has(code) ? code : "REVIEW_EVAL_PROVIDER_FAILURE";
const bodyFields = ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"];

export function assertFreeReviewerAuthority(env) {
  if (env.GITHUB_REPOSITORY !== "itworksinprod/first-fold" || env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_WORKFLOW_REF !== "itworksinprod/first-fold/.github/workflows/free-reviewer-quality-check.yml@refs/heads/main" ||
      env.GITHUB_ACTOR !== "itworksinprod" || env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GITHUB_RUN_ATTEMPT !== "1") throw failure("REVIEW_EVAL_AUTHORITY_REJECTED");
}

function syntheticCases() {
  const source = { sourceId: "synthetic-meridian-release", publisher: "Synthetic Meridian Laboratory",
    publisherKey: "synthetic-meridian", relationship: "originating", publishedAt: "2026-01-10T08:00:00.000Z",
    passages: [
      { evidenceId: "S1P1", text: "Synthetic Meridian Laboratory announces Harbor Agent version 3.2 for Linux servers." },
      { evidenceId: "S1P2", text: "Version 3.2 gives signed-in team administrators a read-only inventory report. It does not change installed services or their configuration." },
      { evidenceId: "S1P3", text: "The laboratory has moved its annual staff conference to Bristol." },
    ] };
  source.text = source.passages.map(passage => passage.text).join(" ");
  const draft = { candidateId: "review-fixture-a",
    headline: "Harbor Agent adds a read-only inventory report",
    deck: "Synthetic Meridian Laboratory announces a Linux-server release for team administrators.",
    claims: [
      { text: "Synthetic Meridian Laboratory has announced Harbor Agent 3.2 for Linux servers.", supports: [{ evidenceId: "S1P1" }] },
      { text: "According to the laboratory, signed-in team administrators can inspect an inventory report without the report changing installed services or configuration.", supports: [{ evidenceId: "S1P2" }] },
    ],
    whyItMatters: "A read-only inventory could help an administrator inspect a server before considering changes. The release announcement does not establish any measured time saving or guarantee that an inventory is complete.",
    whatToDoOrWatch: "Check the release documentation for the scope of the report and its administrator sign-in requirements. That scope would clarify which inventory questions the report can answer before a team relies on it.",
  };
  const item = (caseId, candidateId, expected) => ({ caseId, expected,
    draft: { ...structuredClone(draft), candidateId },
    dossier: { candidateId, desk: "work-and-tools", evidenceTier: "authoritative-single", sources: [structuredClone(source)] } });
  const positive = item("supported-control", "review-fixture-a", {
    claims: [true, true], factsSupported: true, attributionAccurate: true,
    analysisSupported: true, usefulAndSpecific: true, accepted: true,
  });
  const falseClaims = item("wrong-facts-and-prerequisite", "review-fixture-b", {
    claims: [false, false], factsSupported: false, accepted: false,
  });
  const advisory = falseClaims.dossier.sources[0];
  advisory.passages = [
    { evidenceId: "S1P1", text: "Synthetic Meridian Laboratory says Harbor Agent 3.2 produces eight inventory checks. Beacon Console is a different product." },
    { evidenceId: "S1P2", text: "Remote code execution is possible only when the optional maintenance endpoint is enabled and the attacker already has an authenticated administrator session." },
  ];
  advisory.text = advisory.passages.map(passage => passage.text).join(" ");
  falseClaims.draft.claims = [
    { text: "Synthetic Meridian Laboratory says Beacon Console produces twelve inventory checks in the newly announced release.", supports: [{ evidenceId: "S1P1" }] },
    { text: "The laboratory reports that any unauthenticated internet user can execute remote code while the optional maintenance endpoint is disabled.", supports: [{ evidenceId: "S1P2" }] },
  ];
  const promotion = item("unsupported-benefit", "review-fixture-c", {
    claims: [true, true], factsSupported: false, analysisSupported: false, accepted: false,
  });
  promotion.draft.whyItMatters = "Independent timed trials prove this release cuts operating costs by fifty percent and prevents every service outage. Every team is guaranteed these improvements immediately, without any change in its existing workflow.";
  const irrelevant = item("irrelevant-extra-citation", "review-fixture-d", {
    claims: [false, true], accepted: false,
  });
  irrelevant.draft.claims[0].supports.push({ evidenceId: "S1P3" });
  return [positive, falseClaims, promotion, irrelevant];
}

function compareCase(item, review) {
  const actual = review ? { claims: review.claimSupport.map(ids => ids.length > 0),
    ...Object.fromEntries(bodyFields.map(field => [field, review[field]])) } : null;
  if (actual) actual.accepted = actual.claims.every(Boolean) && bodyFields.every(field => actual[field] === true);
  const passed = actual !== null && Object.entries(item.expected).every(([key, expected]) =>
    key === "claims" ? actual.claims.length === 2 && actual.claims.every((value, index) => value === expected[index])
      : actual[key] === expected);
  return { caseId: item.caseId, expected: item.expected, actual, passed };
}

export async function checkFreeReviewer({ env = process.env, accountId, apiToken,
  aiRequestImpl = requestWorkersAiEditorial, fetchImpl = globalThis.fetch } = {}) {
  // Authority is checked before credentials, fixture construction or provider use.
  assertFreeReviewerAuthority(env);
  if (!/^[a-f0-9]{32}$/iu.test(accountId ?? "") || typeof apiToken !== "string" || !apiToken ||
      apiToken !== apiToken.trim() || apiToken.length > 4_096 || /[\p{Cc}\p{Cf}]/u.test(apiToken)) {
    throw failure("REVIEW_EVAL_CONFIGURATION_INVALID");
  }
  const cases = syntheticCases();
  const bundle = buildExplicitClaimReview({ drafts: cases.map(item => item.draft), dossiers: cases.map(item => item.dossier) });
  const messages = [{ role: "system", content: bundle.prompt }, { role: "user", content: JSON.stringify(bundle.data) }];
  const request = buildWorkersAiRequest({ model: DEFAULT_CLOUDFLARE_AI_MODEL, messages, schema: bundle.schema,
    responseFormat: "json_schema", maxTokens: MAX_TOKENS, temperature: 0.1 });
  if (new TextEncoder().encode(JSON.stringify(request.body)).byteLength > MAX_REQUEST_BYTES) throw failure("REVIEW_EVAL_REQUEST_SIZE");
  const endpoint = workersAiRunUrl(accountId, DEFAULT_CLOUDFLARE_AI_MODEL);
  let modelRequests = 0;
  let networkRequests = 0;
  let reviews = [];
  let code = null;
  try {
    modelRequests++;
    const response = await aiRequestImpl({ accountId, apiToken, model: DEFAULT_CLOUDFLARE_AI_MODEL,
      messages, schema: bundle.schema, responseFormat: "json_schema", maxTokens: MAX_TOKENS,
      temperature: 0.1, maxAttempts: 1, timeoutMs: 90_000, maxRequestBytes: MAX_REQUEST_BYTES, maxResponseBytes: 100_000,
      validatePayload: payload => validateExplicitClaimReview(payload, bundle).errors.length === 0,
      fetchImpl: async (url, options) => {
        if (url !== endpoint || options?.method !== "POST" || options?.redirect !== "error") {
          throw failure("REVIEW_EVAL_ENDPOINT_REJECTED");
        }
        if (networkRequests >= 1) throw failure("REVIEW_EVAL_REQUEST_BUDGET");
        networkRequests++;
        return fetchImpl(url, options);
      },
    });
    if (response?.provider !== WORKERS_AI_PROVIDER || response.model !== DEFAULT_CLOUDFLARE_AI_MODEL ||
        !/^[a-f0-9]{64}$/u.test(response.requestSha256 ?? "") || !/^[a-f0-9]{64}$/u.test(response.responseSha256 ?? "")) {
      throw failure("REVIEW_EVAL_PROVENANCE_INVALID");
    }
    const validation = validateExplicitClaimReview(response.editorialPayload, bundle);
    if (validation.errors.length || validation.reviews.length !== cases.length) throw failure("REVIEW_EVAL_CONTRACT_INVALID");
    reviews = validation.reviews;
  } catch (error) { code = safeCode(error?.code); }
  const results = cases.map(item => compareCase(item, reviews.find(review => review.candidateId === item.draft.candidateId)));
  if (!code && !results.every(result => result.passed)) code = "REVIEW_EVAL_VERDICT_MISMATCH";
  return { mode: "synthetic-reviewer-evaluation-not-news-or-delivery", status: code ? "failed" : "passed", code,
    modelRequests, networkRequests, requestedOutputTokens: modelRequests * MAX_TOKENS,
    maxModelRequests: 1, researchQueries: 0, emailRequests: 0, cases: results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw failure("REVIEW_EVAL_CONFIGURATION_INVALID");
    const report = await checkFreeReviewer({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_AI_API_TOKEN });
    console.info(`::notice title=Synthetic reviewer evaluation::${JSON.stringify(report)}`);
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(`::error title=Synthetic reviewer evaluation::${safeCode(error?.code)}`);
    process.exitCode = 1;
  }
}
