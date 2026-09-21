// Synthetic-only comparison. It cannot generate an edition or approve a draft.
import { createHash } from "node:crypto";
import { freeReviewerSyntheticCases } from "./check-free-reviewer.mjs";
import { dailyReviewerControlBundle } from "./free/grounded-draft.mjs";
import { sealDiagnostic } from "./private-writer-diagnostic.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, buildWorkersAiRequest, workersAiFailureDiagnostic,
  WORKERS_AI_EDITORIAL_FORMAT_INVALID } from "./free/workers-ai.mjs";

const flags = ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"];
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join();
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const failure = code => Object.assign(new Error(code), { code });

export function scoreReviewerControls(payload, cases) {
  if (!exact(payload, ["reviews"]) || !Array.isArray(payload.reviews) || payload.reviews.length !== cases.length ||
      new Set(payload.reviews.map(review => review?.candidateId)).size !== cases.length ||
      payload.reviews.some(review => !cases.some(item => item.draft.candidateId === review?.candidateId))) {
    return { passed: false, protocolValid: false, cases: [] };
  }
  const results = cases.map(item => {
    const review = payload.reviews.find(value => value.candidateId === item.draft.candidateId);
    const protocolValid = exact(review, ["candidateId", "draftSha256", "claimSupport", ...flags]) &&
      review.draftSha256 === hash(item.draft) && flags.every(field => typeof review[field] === "boolean") &&
      Array.isArray(review.claimSupport) && review.claimSupport.length === 2 && review.claimSupport.every((ids, index) =>
        Array.isArray(ids) && ids.length <= 2 && new Set(ids).size === ids.length && ids.every(id => typeof id === "string") &&
        (ids.length === 0 || [...ids].sort().join() === item.draft.claims[index].supports.map(value => value.evidenceId).sort().join()));
    if (!protocolValid) return { caseId: item.caseId, protocolValid: false, passed: false };
    const actual = { claims: review.claimSupport.map(ids => ids.length > 0),
      ...Object.fromEntries(flags.map(field => [field, review[field]])) };
    actual.accepted = actual.claims.every(Boolean) && flags.every(field => actual[field]);
    const passed = Object.entries(item.expected).every(([field, value]) => JSON.stringify(actual[field]) === JSON.stringify(value));
    return { caseId: item.caseId, protocolValid: true, passed, actual, expected: item.expected };
  });
  return { protocolValid: results.every(result => result.protocolValid), passed: results.every(result => result.passed), cases: results };
}

export async function diagnoseReviewerTransports({ publicKey, accountId, apiToken, now,
  aiRequestImpl, fetchImpl, endpoint }) {
  const cases = freeReviewerSyntheticCases();
  const bundle = dailyReviewerControlBundle(cases.map(item => item.draft), cases.map(item => item.dossier));
  const capture = { purpose: "synthetic-reviewer-transport-controls-not-an-edition", capturedAt: now.toISOString(), calls: [], emailSent: false };
  let modelRequests = 0, networkRequests = 0;
  for (const responseFormat of ["json_schema", "json_object"]) {
    const call = { responseFormat, request: bundle.data };
    capture.calls.push(call);
    // Identical semantic criteria and examples. Expected labels never enter a request.
    const options = { model: DEFAULT_CLOUDFLARE_AI_MODEL,
      messages: [{ role: "system", content: `${bundle.prompt}\nReturn only a JSON object matching this schema:\n${JSON.stringify(bundle.schema)}` },
        { role: "user", content: JSON.stringify(bundle.data) }],
      schema: bundle.schema, responseFormat, maxTokens: 1800, maxAttempts: 1, temperature: 0.1,
      timeoutMs: 90_000, maxRequestBytes: 70_000, maxResponseBytes: 100_000 };
    const { body } = buildWorkersAiRequest(options);
    const bodyText = JSON.stringify(body);
    const requestSha256 = hash({ provider: "cloudflare-workers-ai", model: DEFAULT_CLOUDFLARE_AI_MODEL, body });
    let callNetworkRequests = 0;
    try {
      if (++modelRequests > 2) throw failure("DIAGNOSTIC_REQUEST_BUDGET");
      const result = await aiRequestImpl({ ...options, accountId, apiToken,
        validatePayload: value => Boolean(value && typeof value === "object" && !Array.isArray(value)),
        fetchImpl: async (url, init) => {
          if (url !== endpoint || init?.method !== "POST" || init?.redirect !== "error" || init.body !== bodyText ||
              ++callNetworkRequests > 1 || ++networkRequests > 2) throw failure("DIAGNOSTIC_NETWORK_CONTRACT");
          return fetchImpl(url, init);
        } });
      if (result.provider !== "cloudflare-workers-ai" || result.model !== DEFAULT_CLOUDFLARE_AI_MODEL ||
          result.requestSha256 !== requestSha256 || !/^[a-f0-9]{64}$/u.test(result.responseSha256 ?? "") || result.attemptCount !== 1) {
        throw failure("DIAGNOSTIC_PROVENANCE_INVALID");
      }
      call.editorialPayload = structuredClone(result.editorialPayload);
      call.score = scoreReviewerControls(call.editorialPayload, cases);
    } catch (error) {
      call.failure = { code: /^[A-Z_]{1,64}$/u.test(error?.code ?? "") ? error.code : "DIAGNOSTIC_FAILED",
        ...workersAiFailureDiagnostic(error) };
      // Do not retry quota, account or provider failures in another format.
      if (error?.code !== WORKERS_AI_EDITORIAL_FORMAT_INVALID) break;
    }
  }
  const report = { mode: capture.purpose,
    status: capture.calls.length === 2 && capture.calls.every(call => call.score?.passed) ? "reviewer-controls-passed" : "failed",
    modelRequests, networkRequests, outputBudget: modelRequests * 1800, searchQueries: 0, emailSent: false,
    comparisons: capture.calls.map(call => ({ responseFormat: call.responseFormat,
      passed: call.score?.passed ?? false, protocolValid: call.score?.protocolValid ?? false,
      cases: call.score?.cases.map(item => ({ caseId: item.caseId, passed: item.passed })) ?? [],
      ...(call.failure ? { failure: call.failure } : {}) })) };
  return { report, sealed: sealDiagnostic({ ...capture, report }, publicKey) };
}
