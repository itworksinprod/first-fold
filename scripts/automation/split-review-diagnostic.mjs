// Synthetic-only qualification. No research, delivery or production approval.
import { createHash } from "node:crypto";
import { reviewerClauseControls } from "../../tests/fixtures/reviewer-clause-controls.mjs";
import { buildSplitClaimReview, validateSplitClaimReview } from "./free/split-claim-review.mjs";
import { scoreReviewerControls } from "./reviewer-transport-diagnostic.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, buildWorkersAiRequest, workersAiFailureDiagnostic } from "./free/workers-ai.mjs";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const failure = code => Object.assign(new Error(code), { code });

export async function diagnoseSplitReview({ publicKey, accountId, apiToken, now, aiRequestImpl, fetchImpl, endpoint, sealDiagnostic }) {
  const cases = reviewerClauseControls();
  const bundle = buildSplitClaimReview({ drafts: cases.map(item => item.draft), dossiers: cases.map(item => item.dossier) });
  const capture = { purpose: "synthetic-split-review-controls-not-an-edition", capturedAt: now.toISOString(), calls: [], emailSent: false };
  let modelRequests = 0, networkRequests = 0;
  for (const stage of ["claims", "editorial"]) {
    const view = bundle[stage];
    const call = { stage, request: view.data };
    capture.calls.push(call);
    const options = { model: DEFAULT_CLOUDFLARE_AI_MODEL,
      messages: [{ role: "system", content: `${view.prompt}\nReturn only this JSON schema:\n${JSON.stringify(view.schema)}` },
        { role: "user", content: JSON.stringify(view.data) }],
      schema: view.schema, responseFormat: "json_object", maxTokens: 1800, maxAttempts: 1, temperature: 0.1,
      timeoutMs: 90_000, maxRequestBytes: 70_000, maxResponseBytes: 100_000 };
    const { body } = buildWorkersAiRequest(options);
    const bodyText = JSON.stringify(body);
    const requestSha256 = hash({ provider: "cloudflare-workers-ai", model: DEFAULT_CLOUDFLARE_AI_MODEL, body });
    let callRequests = 0;
    try {
      if (++modelRequests > 2) throw failure("DIAGNOSTIC_REQUEST_BUDGET");
      const result = await aiRequestImpl({ ...options, accountId, apiToken,
        validatePayload: value => Boolean(value && typeof value === "object" && !Array.isArray(value)),
        fetchImpl: async (url, init) => {
          if (url !== endpoint || init?.method !== "POST" || init?.redirect !== "error" || init.body !== bodyText ||
              ++callRequests > 1 || ++networkRequests > 2) throw failure("DIAGNOSTIC_NETWORK_CONTRACT");
          return fetchImpl(url, init);
        } });
      if (result.provider !== "cloudflare-workers-ai" || result.model !== DEFAULT_CLOUDFLARE_AI_MODEL ||
          result.requestSha256 !== requestSha256 || !/^[a-f0-9]{64}$/u.test(result.responseSha256 ?? "") || result.attemptCount !== 1) {
        throw failure("DIAGNOSTIC_PROVENANCE_INVALID");
      }
      call.editorialPayload = structuredClone(result.editorialPayload);
    } catch (error) {
      call.failure = { code: /^[A-Z_]{1,64}$/u.test(error?.code ?? "") ? error.code : "DIAGNOSTIC_FAILED",
        ...workersAiFailureDiagnostic(error) };
      break; // No quota/format/provider retry and no alternate model.
    }
  }
  const checked = validateSplitClaimReview(capture.calls[0]?.editorialPayload, capture.calls[1]?.editorialPayload, bundle);
  const score = checked.errors.length ? { passed: false, protocolValid: false, cases: [], errors: checked.errors }
    : scoreReviewerControls({ reviews: checked.reviews }, cases);
  const report = { mode: capture.purpose, status: score.passed ? "reviewer-controls-passed" : "failed",
    modelRequests, networkRequests, outputBudget: modelRequests * 1800, searchQueries: 0, emailSent: false,
    protocolValid: score.protocolValid,
    cases: score.cases.map(item => ({ caseId: item.caseId, passed: item.passed })),
    failures: capture.calls.filter(call => call.failure).map(call => ({ stage: call.stage, ...call.failure })) };
  return { report, sealed: sealDiagnostic({ ...capture, score, report }, publicKey) };
}
