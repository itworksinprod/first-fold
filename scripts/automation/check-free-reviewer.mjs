#!/usr/bin/env node

// One reviewer-only request against synthetic evidence. Never current news,
// research, an edition, an email, or authorization to change the daily profile.
import { writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { reviewerHoldoutCases } from "../../tests/fixtures/reviewer-holdouts.mjs";
import { freeReviewerSyntheticCases } from "../../tests/fixtures/reviewer-controls.mjs";
import { buildExplicitClaimReview, validateExplicitClaimReview } from "./free/explicit-claim-review.mjs";
import { buildReviewRejectionDiagnostic, validateReviewRejectionDiagnostic,
  REVIEW_REJECTION_MAX_TOKENS, REVIEW_REJECTION_TIMEOUT_MS } from "./free/review-rejections.mjs";
import { diagnosticPublicKey, sealDiagnostic } from "./private-writer-diagnostic.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL, WORKERS_AI_PROVIDER, buildWorkersAiRequest,
  requestWorkersAiEditorial, workersAiRunUrl, workersAiFailureDiagnostic } from "./free/workers-ai.mjs";

const MAX_TOKENS = 1_800;
// Isolated diagnostic only: the reasoning model exhausted 1,800 output tokens
// in run 34896041465. This does not change any production writer budget.
const REASONING_MAX_TOKENS = 4_000;
const MAX_REQUEST_BYTES = 70_000;
const REVIEW_MODELS = new Set([DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL]);
export const FREE_REVIEWER_CASE_SETS = Object.freeze(["regression", "holdouts"]);
const SAFE_CODES = new Set(["REVIEW_EVAL_AUTHORITY_REJECTED", "REVIEW_EVAL_CONFIGURATION_INVALID",
  "REVIEW_EVAL_REQUEST_SIZE", "REVIEW_EVAL_ENDPOINT_REJECTED", "REVIEW_EVAL_REQUEST_BUDGET",
  "REVIEW_EVAL_PROVENANCE_INVALID", "REVIEW_EVAL_CONTRACT_INVALID", "REVIEW_EVAL_VERDICT_MISMATCH",
  "REVIEW_EVAL_DIAGNOSTIC_INVALID", "REVIEW_EVAL_DIAGNOSTIC_KEY_INVALID", "REVIEW_EVAL_PROVIDER_FAILURE"]);
const failure = code => Object.assign(new Error(code), { code });
const safeCode = code => SAFE_CODES.has(code) ? code : "REVIEW_EVAL_PROVIDER_FAILURE";
const bodyFields = ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"];

export function assertFreeReviewerAuthority(env) {
  if (env.GITHUB_REPOSITORY !== "itworksinprod/first-fold" || env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_WORKFLOW_REF !== "itworksinprod/first-fold/.github/workflows/free-reviewer-quality-check.yml@refs/heads/main" ||
      env.GITHUB_ACTOR !== "itworksinprod" || env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GITHUB_RUN_ATTEMPT !== "1") throw failure("REVIEW_EVAL_AUTHORITY_REJECTED");
}

export function validateFreeReviewerDiagnosticKey(encoded) {
  if (encoded === undefined || encoded === "") return false;
  try { diagnosticPublicKey(encoded); } catch { throw failure("REVIEW_EVAL_DIAGNOSTIC_KEY_INVALID"); }
  return true;
}

export function resolveFreeReviewerCaseSet(value = "regression") {
  if (!FREE_REVIEWER_CASE_SETS.includes(value)) throw failure("REVIEW_EVAL_CONFIGURATION_INVALID");
  return value;
}

function privateFailureRecord(record, apiToken) {
  // Accept only the existing adapter's bounded/redacted non-2xx hook record,
  // never a request, successful envelope, completion or reasoning transcript.
  const fields = ["status", "contentType", "cfRay", "requestId", "retryAfter", "bodyText", "bodyTruncated"];
  return record && typeof record === "object" && !Array.isArray(record) &&
    Object.keys(record).sort().join() === fields.sort().join() &&
    Number.isInteger(record.status) && record.status >= 300 && record.status <= 599 &&
    typeof record.bodyTruncated === "boolean" &&
    (record.bodyText === null || (typeof record.bodyText === "string" && Buffer.byteLength(record.bodyText) <= 8_192)) &&
    ["contentType", "cfRay", "requestId", "retryAfter"].every(field => record[field] === null ||
      (typeof record[field] === "string" && record[field].length <= (field === "contentType" ? 160 : 128))) &&
    !fields.some(field => typeof record[field] === "string" && record[field].includes(apiToken));
}

export { freeReviewerSyntheticCases } from "../../tests/fixtures/reviewer-controls.mjs";

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
  model = DEFAULT_CLOUDFLARE_AI_MODEL,
  explainRejections = false,
  caseSet = "regression",
  diagnosticPublicKey: publicKey, onEncryptedFailure,
  aiRequestImpl = requestWorkersAiEditorial, fetchImpl = globalThis.fetch } = {}) {
  // Authority is checked before credentials, fixture construction or provider use.
  assertFreeReviewerAuthority(env);
  caseSet = resolveFreeReviewerCaseSet(caseSet);
  // Validate the public key before credentials or any provider work. No key is
  // the backward-compatible opt-out; no private key ever enters this process.
  const captureFailure = validateFreeReviewerDiagnosticKey(publicKey);
  if ((captureFailure && typeof onEncryptedFailure !== "function") ||
      (onEncryptedFailure !== undefined && typeof onEncryptedFailure !== "function")) {
    throw failure("REVIEW_EVAL_CONFIGURATION_INVALID");
  }
  if (!REVIEW_MODELS.has(model) || typeof explainRejections !== "boolean" ||
      (explainRejections && model !== FREE_REASONING_WRITER_MODEL) ||
      !/^[a-f0-9]{32}$/iu.test(accountId ?? "") || typeof apiToken !== "string" || !apiToken ||
      apiToken !== apiToken.trim() || apiToken.length > 4_096 || /[\p{Cc}\p{Cf}]/u.test(apiToken)) {
    throw failure("REVIEW_EVAL_CONFIGURATION_INVALID");
  }
  // A dispatch evaluates exactly one fixed set, never both or caller-supplied
  // cases. Expected labels remain local and do not enter provider messages.
  const cases = caseSet === "holdouts" ? reviewerHoldoutCases() : freeReviewerSyntheticCases();
  const maxTokens = explainRejections ? REVIEW_REJECTION_MAX_TOKENS
    : model === FREE_REASONING_WRITER_MODEL ? REASONING_MAX_TOKENS : MAX_TOKENS;
  const timeoutMs = explainRejections ? REVIEW_REJECTION_TIMEOUT_MS : 90_000;
  const originalBundle = buildExplicitClaimReview({ drafts: cases.map(item => item.draft), dossiers: cases.map(item => item.dossier) });
  const bundle = explainRejections ? buildReviewRejectionDiagnostic(originalBundle) : originalBundle;
  const validate = payload => explainRejections ? validateReviewRejectionDiagnostic(payload, bundle)
    : validateExplicitClaimReview(payload, bundle);
  const messages = [{ role: "system", content: bundle.prompt }, { role: "user", content: JSON.stringify(bundle.data) }];
  const request = buildWorkersAiRequest({ model, messages, schema: bundle.schema,
    responseFormat: "json_schema", maxTokens, temperature: 0.1 });
  if (new TextEncoder().encode(JSON.stringify(request.body)).byteLength > MAX_REQUEST_BYTES) throw failure("REVIEW_EVAL_REQUEST_SIZE");
  const endpoint = workersAiRunUrl(accountId, model);
  let modelRequests = 0;
  let networkRequests = 0;
  let reviews = [];
  let rejectionDiagnostics = [];
  let diagnosticErrors = [];
  let code = null;
  let providerFailure;
  let privateCaptureAttempted = false;
  try {
    modelRequests++;
    const response = await aiRequestImpl({ accountId, apiToken, model,
      messages, schema: bundle.schema, responseFormat: "json_schema", maxTokens,
      temperature: 0.1, maxAttempts: 1, timeoutMs, maxRequestBytes: MAX_REQUEST_BYTES, maxResponseBytes: 100_000,
      ...(captureFailure ? { onPrivateFailure: async record => {
        if (privateCaptureAttempted) return;
        privateCaptureAttempted = true;
        try {
          if (privateFailureRecord(record, apiToken)) await onEncryptedFailure(sealDiagnostic(record, publicKey));
        } catch { /* Best-effort capture cannot replace the provider error or verdict. */ }
      } } : {}),
      validatePayload: payload => {
        const checked = validate(payload);
        // Only fixed local error codes, never provider prose, may survive a
        // schema failure. Negative verdicts themselves remain valid responses.
        if (explainRejections) diagnosticErrors = checked.errors;
        return checked.errors.length === 0;
      },
      fetchImpl: async (url, options) => {
        if (url !== endpoint || options?.method !== "POST" || options?.redirect !== "error") {
          throw failure("REVIEW_EVAL_ENDPOINT_REJECTED");
        }
        if (networkRequests >= 1) throw failure("REVIEW_EVAL_REQUEST_BUDGET");
        networkRequests++;
        return fetchImpl(url, options);
      },
    });
    if (response?.provider !== WORKERS_AI_PROVIDER || response.model !== model ||
        !/^[a-f0-9]{64}$/u.test(response.requestSha256 ?? "") || !/^[a-f0-9]{64}$/u.test(response.responseSha256 ?? "")) {
      throw failure("REVIEW_EVAL_PROVENANCE_INVALID");
    }
    const validation = validate(response.editorialPayload);
    if (explainRejections) diagnosticErrors = validation.errors;
    if (validation.errors.length || validation.reviews.length !== cases.length) {
      throw failure(explainRejections ? "REVIEW_EVAL_DIAGNOSTIC_INVALID" : "REVIEW_EVAL_CONTRACT_INVALID");
    }
    reviews = validation.reviews;
    if (explainRejections) rejectionDiagnostics = validation.diagnostics;
  } catch (error) {
    code = safeCode(error?.code);
    if (explainRejections && diagnosticErrors.length > 0 && code === "REVIEW_EVAL_PROVIDER_FAILURE") {
      code = "REVIEW_EVAL_DIAGNOSTIC_INVALID";
    }
    if (code === "REVIEW_EVAL_PROVIDER_FAILURE") providerFailure = workersAiFailureDiagnostic(error);
  }
  const results = cases.map(item => compareCase(item, reviews.find(review => review.candidateId === item.draft.candidateId)));
  if (!code && !results.every(result => result.passed)) code = "REVIEW_EVAL_VERDICT_MISMATCH";
  return { mode: "synthetic-reviewer-evaluation-not-news-or-delivery", model, caseSet, status: code ? "failed" : "passed", code,
    ...(explainRejections ? { diagnosticProfile: "sentence-bound-rejections-v1", rejectionDiagnostics, diagnosticErrors } : {}),
    ...(providerFailure ? { providerFailure } : {}),
    modelRequests, networkRequests, requestedOutputTokens: modelRequests * maxTokens,
    maxModelRequests: 1, researchQueries: 0, emailRequests: 0, cases: results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2 && !(process.argv.length === 3 &&
        ["--explain-rejections", "--validate-diagnostic-key"].includes(process.argv[2]))) {
      throw failure("REVIEW_EVAL_CONFIGURATION_INVALID");
    }
    assertFreeReviewerAuthority(process.env);
    const caseSet = resolveFreeReviewerCaseSet(process.env.FREE_REVIEWER_CASE_SET);
    const publicKey = process.env.DIAGNOSTIC_PUBLIC_KEY;
    const captureFailure = validateFreeReviewerDiagnosticKey(publicKey);
    if (process.argv[2] !== "--validate-diagnostic-key") {
      const runnerTemp = process.env.RUNNER_TEMP;
      if (captureFailure && (typeof runnerTemp !== "string" || !isAbsolute(runnerTemp) || /[\p{Cc}\p{Cf}]/u.test(runnerTemp))) {
        throw failure("REVIEW_EVAL_CONFIGURATION_INVALID");
      }
      const report = await checkFreeReviewer({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: process.env.CLOUDFLARE_AI_API_TOKEN, model: process.env.FREE_REVIEWER_MODEL,
        caseSet,
        explainRejections: process.argv[2] === "--explain-rejections", diagnosticPublicKey: publicKey,
        ...(captureFailure ? { onEncryptedFailure: sealed => writeFile(join(runnerTemp, "reviewer-provider-failure.encrypted.json"),
          JSON.stringify(sealed), { mode: 0o600, flag: "wx" }) } : {}),
      });
      console.info(`::notice title=Synthetic reviewer evaluation::${JSON.stringify(report)}`);
      if (report.status !== "passed") process.exitCode = 1;
    }
  } catch (error) {
    console.error(`::error title=Synthetic reviewer evaluation::${safeCode(error?.code)}`);
    process.exitCode = 1;
  }
}
