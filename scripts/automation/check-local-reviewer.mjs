#!/usr/bin/env node
// Manual synthetic diagnostic only. No news, credentials, cloud calls or email.
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { reviewerHoldoutCases } from "../../tests/fixtures/reviewer-holdouts.mjs";
import { buildExplicitClaimReview, validateExplicitClaimReview } from "./free/explicit-claim-review.mjs";
import { buildLocalAiRequest, requestLocalAiEditorial, localAiFailureDiagnostic,
  LOCAL_AI_MODEL, LOCAL_AI_PROVIDER } from "./free/local-ai.mjs";

const fields = ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"];
// Diagnostic-only allowance after an observed 4,000-token truncation. This is
// not a caller-selected budget or a change to the production writer/reviewer.
const maxOutputTokens = 8_000;
const safeErrors = new Set(["LOCAL_AI_CONFIGURATION_INVALID", "LOCAL_AI_CLIENT_TIMEOUT",
  "LOCAL_AI_EDITORIAL_FORMAT_INVALID", "LOCAL_AI_EDITORIAL_UNAVAILABLE", "LOCAL_REVIEW_PROVENANCE"]);
const safeFormatReasons = new Set(["RESPONSE_SHAPE", "OUTPUT_TOKEN_LIMIT", "PAYLOAD_MISSING",
  "PAYLOAD_JSON_INVALID", "SCHEMA_VALIDATION_FAILED"]);

export async function checkLocalReviewer({ aiRequestImpl = requestLocalAiEditorial,
  fetchImpl = globalThis.fetch, think = true, formatMode = "native" } = {}) {
  const cases = reviewerHoldoutCases();
  const bundle = buildExplicitClaimReview({ drafts: cases.map(item => item.draft),
    dossiers: cases.map(item => item.dossier) });
  const started = Date.now();
  let reviews = [], usage, formatReason, outputDiagnostic, requestSha256, modelRequests = 0, code = null;
  try {
    const request = { model: LOCAL_AI_MODEL,
      messages: [{ role: "system", content: bundle.prompt },
        { role: "user", content: JSON.stringify(bundle.data) }],
      schema: bundle.schema, responseFormat: "json_schema", maxTokens: maxOutputTokens,
      temperature: 0.6, think, formatMode, timeoutMs: 300_000, maxAttempts: 1,
      maxRequestBytes: 70_000, maxResponseBytes: 100_000, fetchImpl,
      validatePayload: payload => validateExplicitClaimReview(payload, bundle).errors.length === 0 };
    const { body } = buildLocalAiRequest(request);
    requestSha256 = createHash("sha256").update(JSON.stringify({ provider: LOCAL_AI_PROVIDER,
      model: LOCAL_AI_MODEL, body })).digest("hex");
    modelRequests++;
    const result = await aiRequestImpl(request);
    if (result.provider !== LOCAL_AI_PROVIDER || result.model !== LOCAL_AI_MODEL ||
        result.requestSha256 !== requestSha256 ||
        ![result.requestSha256, result.responseSha256].every(value => /^[a-f0-9]{64}$/.test(value ?? ""))) {
      throw Object.assign(new Error(), { code: "LOCAL_REVIEW_PROVENANCE" });
    }
    const checked = validateExplicitClaimReview(result.editorialPayload, bundle);
    if (checked.errors.length) throw Object.assign(new Error(), { code: "LOCAL_AI_EDITORIAL_FORMAT_INVALID" });
    reviews = checked.reviews;
    if (["prompt_tokens", "completion_tokens", "total_tokens"].every(field =>
      Number.isInteger(result.usage?.[field]) && result.usage[field] >= 0 && result.usage[field] <= 32_768)) {
      usage = Object.fromEntries(["prompt_tokens", "completion_tokens", "total_tokens"].map(field => [field, result.usage[field]]));
    }
  } catch (error) {
    code = safeErrors.has(error?.code) ? error.code : "LOCAL_REVIEW_FAILED";
    if (code === "LOCAL_AI_EDITORIAL_FORMAT_INVALID" && safeFormatReasons.has(error?.formatReason)) {
      formatReason = error.formatReason;
      ({ outputDiagnostic } = localAiFailureDiagnostic(error));
    }
  }
  const results = cases.map(item => {
    const review = reviews.find(value => value.candidateId === item.draft.candidateId);
    const actual = review ? { claims: review.claimSupport.map(ids => ids.length > 0),
      ...Object.fromEntries(fields.map(field => [field, review[field]])) } : null;
    if (actual) actual.accepted = actual.claims.every(Boolean) && fields.every(field => actual[field] === true);
    const passed = actual !== null && Object.entries(item.expected).every(([key, value]) =>
      key === "claims" ? JSON.stringify(value) === JSON.stringify(actual.claims) : actual[key] === value);
    return { caseId: item.caseId, expected: item.expected, actual, passed };
  });
  if (!code && !results.every(item => item.passed)) code = "LOCAL_REVIEW_VERDICT_MISMATCH";
  return { status: code ? "failed" : "passed", code, mode: "synthetic-local-review-not-a-paper",
    provider: LOCAL_AI_PROVIDER, model: LOCAL_AI_MODEL, modelRequests,
    ...(typeof think === "boolean" ? { requestedThinking: think } : {}),
    ...(["native", "prompt-json"].includes(formatMode) ? { requestedFormatMode: formatMode } : {}),
    ...(requestSha256 ? { requestSha256 } : {}),
    requestedOutputTokens: maxOutputTokens, timeoutMs: 300_000, elapsedMs: Date.now() - started,
    cloudRequests: 0, emailRequests: 0, ...(usage ? { usage } : {}),
    ...(formatReason ? { formatReason } : {}), ...(outputDiagnostic ? { outputDiagnostic } : {}), cases: results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || !["--synthetic-only", "--synthetic-direct", "--synthetic-reasoning-json"].includes(process.argv[2])) {
    console.error("Use --synthetic-only, --synthetic-direct or --synthetic-reasoning-json for this manual, one-request local diagnostic.");
    process.exitCode = 1;
  } else {
    const report = await checkLocalReviewer({ think: process.argv[2] !== "--synthetic-direct",
      formatMode: process.argv[2] === "--synthetic-reasoning-json" ? "prompt-json" : "native" });
    console.info(JSON.stringify(report));
    if (report.status !== "passed") process.exitCode = 1;
  }
}
