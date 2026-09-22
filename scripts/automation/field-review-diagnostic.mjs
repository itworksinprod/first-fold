// Synthetic-only, encrypted qualification; no research, email, or production approval.
import { createHash } from "node:crypto";
import { fieldReviewControls } from "../../tests/fixtures/field-review-controls.mjs";
import { buildFieldFactReview, validateFieldFactReview } from "./free/field-fact-review.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, buildWorkersAiRequest, workersAiFailureDiagnostic } from "./free/workers-ai.mjs";

export async function diagnoseFieldReview({ publicKey, accountId, apiToken, now, aiRequestImpl, fetchImpl, endpoint, sealDiagnostic }) {
  const cases = fieldReviewControls();
  const calls = [], results = [];
  let modelRequests = 0, networkRequests = 0;
  for (const control of cases) {
    const view = buildFieldFactReview(control.input);
    const call = { request: view.data };
    calls.push(call);
    const options = { model: DEFAULT_CLOUDFLARE_AI_MODEL,
      messages: [{ role: "system", content: `${view.prompt}\nJSON schema:\n${JSON.stringify(view.schema)}` },
        { role: "user", content: JSON.stringify(view.data) }],
      schema: view.schema, responseFormat: "json_object", maxTokens: 400, maxAttempts: 1,
      temperature: 0.1, timeoutMs: 90000, maxRequestBytes: 70000, maxResponseBytes: 100000 };
    const { body } = buildWorkersAiRequest(options);
    const bodyText = JSON.stringify(body);
    const requestSha256 = createHash("sha256").update(JSON.stringify({ provider: "cloudflare-workers-ai",
      model: DEFAULT_CLOUDFLARE_AI_MODEL, body })).digest("hex");
    let requests = 0;
    try {
      if (++modelRequests > 8) throw new Error("FIELD_DIAGNOSTIC_BUDGET");
      const result = await aiRequestImpl({ ...options, accountId, apiToken,
        validatePayload: value => Boolean(value && typeof value === "object" && !Array.isArray(value)),
        fetchImpl: async (url, init) => {
          if (url !== endpoint || init?.method !== "POST" || init?.redirect !== "error" ||
              init.body !== bodyText || ++requests > 1 || ++networkRequests > 8) throw new Error("FIELD_DIAGNOSTIC_NETWORK");
          return fetchImpl(url, init);
        } });
      if (result.provider !== "cloudflare-workers-ai" || result.model !== DEFAULT_CLOUDFLARE_AI_MODEL ||
          result.requestSha256 !== requestSha256 || !/^[a-f0-9]{64}$/u.test(result.responseSha256 ?? "") ||
          result.attemptCount !== 1) throw new Error("FIELD_DIAGNOSTIC_PROVENANCE");
      call.response = structuredClone(result.editorialPayload);
      const checked = validateFieldFactReview(call.response, view);
      results.push({ caseId: control.caseId, ...checked, expected: control.expected,
        passed: checked.valid && checked.supported === control.expected });
      if (!checked.valid) break;
    } catch (error) {
      call.failure = workersAiFailureDiagnostic(error);
      break; // No provider, quota, or format retry; no alternate model.
    }
  }
  const passed = results.length === cases.length && results.every(result => result.passed);
  const report = { mode: "synthetic-field-review-controls-not-an-edition", status: passed ? "reviewer-controls-passed" : "failed",
    modelRequests, networkRequests, outputBudget: modelRequests * 400, searchQueries: 0, emailSent: false,
    cases: results.map(({ caseId, valid, passed }) => ({ caseId, valid, passed })),
    failures: calls.filter(call => call.failure).map(call => call.failure) };
  return { report, sealed: sealDiagnostic({ purpose: report.mode, capturedAt: now.toISOString(), calls, results, report }, publicKey) };
}
