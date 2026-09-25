// Opt-in, fixed controls only. Independent requests, not independent providers.
import { createHash } from 'node:crypto';
import { PRESERVATION_REVIEW_CONTROLS, PRESERVATION_CASESET_SHA256 } from './preservation-review-cases.mjs';
import { PRESERVATION_HOLDOUT_CONTROLS, PRESERVATION_HOLDOUT_CASESET_SHA256 } from './preservation-holdout-cases.mjs';
import { PRESERVATION_PARAPHRASE_CONTROLS, PRESERVATION_PARAPHRASE_CASESET_SHA256 } from './preservation-paraphrase-case.mjs';
import { buildIsolatedPreservationReview, validateIsolatedPreservationReview } from './free/isolated-preservation-review.mjs';
import { buildTextPreservationReview, validateTextPreservationReview, exactTextPreservation } from './free/text-preservation-review.mjs';
import { DEFAULT_CLOUDFLARE_AI_MODEL, buildWorkersAiRequest, workersAiFailureDiagnostic } from './free/workers-ai.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const failure = code => Object.assign(new Error(code), { code });
const TOKENS = 600;
const ownCodes = new Set(['PRESERVATION_REVIEW_NETWORK', 'PRESERVATION_REVIEW_PROVENANCE', 'PRESERVATION_REVIEW_MALFORMED']);

export async function diagnoseIsolatedPreservation({ publicKey, accountId, apiToken, now,
  aiRequestImpl, fetchImpl, endpoint, sealDiagnostic, holdout = false, textOnly = false, paraphrase = false }) {
  if ([holdout, textOnly, paraphrase].some(v => typeof v !== 'boolean') ||
      (paraphrase && (!holdout || !textOnly))) throw failure('PRESERVATION_REVIEW_PROFILE');
  const controls = paraphrase ? PRESERVATION_PARAPHRASE_CONTROLS : holdout ? PRESERVATION_HOLDOUT_CONTROLS : PRESERVATION_REVIEW_CONTROLS;
  const cap = controls.length * 2, calls = [], results = [], localDecisions = [];
  let modelRequests = 0, networkRequests = 0, code = null;
  // No caller-controlled text, case labels, budget, model, prompt or retries.
  outer: for (const control of controls) {
    const verdicts = {};
    for (const dimension of ['source', 'meaning']) {
      const textMeaning = textOnly && dimension === 'meaning';
      const view = textMeaning ? buildTextPreservationReview(control.input) : buildIsolatedPreservationReview(control.input, dimension);
      if (textMeaning) {
        const identity = exactTextPreservation(view);
        if (identity) {
          verdicts.meaning = identity;
          localDecisions.push({ caseId: control.caseId, dimension, request: view.data, verdict: identity });
          continue;
        }
      }
      const prompt = `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
      const options = { model: DEFAULT_CLOUDFLARE_AI_MODEL,
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(view.data) }],
        schema: view.schema, responseFormat: 'json_object', maxTokens: TOKENS, maxAttempts: 1,
        temperature: 0.1, timeoutMs: 30000, maxRequestBytes: 70000, maxResponseBytes: 100000 };
      const { body } = buildWorkersAiRequest(options), bodyText = JSON.stringify(body);
      const requestSha256 = hash(JSON.stringify({ provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, body }));
      const call = { caseId: control.caseId, dimension, request: view.data, prompt, schema: view.schema,
        requestSha256, promptSha256: hash(prompt), requestBytes: Buffer.byteLength(bodyText) };
      calls.push(call);
      let requests = 0, networkViolation = false, active = true;
      try {
        if (modelRequests >= cap) throw failure('PRESERVATION_REVIEW_NETWORK');
        modelRequests++;
        const result = await aiRequestImpl({ ...options, accountId, apiToken,
          validatePayload: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
          fetchImpl: async (url, init) => {
            if (!active || networkViolation || url !== endpoint || init?.method !== 'POST' || init?.redirect !== 'error' ||
                init.body !== bodyText || requests >= 1 || networkRequests >= cap) {
              networkViolation = true;
              throw failure('PRESERVATION_REVIEW_NETWORK');
            }
            requests++; networkRequests++;
            return fetchImpl(url, init);
          } });
        active = false;
        if (networkViolation || requests !== 1) throw failure('PRESERVATION_REVIEW_NETWORK');
        if (result.provider !== 'cloudflare-workers-ai' || result.model !== DEFAULT_CLOUDFLARE_AI_MODEL ||
            result.requestSha256 !== requestSha256 || !/^[a-f0-9]{64}$/u.test(result.responseSha256 ?? '') ||
            result.attemptCount !== 1) throw failure('PRESERVATION_REVIEW_PROVENANCE');
        const checked = textMeaning ? validateTextPreservationReview(result.editorialPayload, view)
          : validateIsolatedPreservationReview(result.editorialPayload, view);
        call.response = checked.valid ? structuredClone(result.editorialPayload) : null;
        if (!checked.valid) call.responseRejectedBeforeCapture = true;
        Object.assign(call, { responseSha256: result.responseSha256, provider: result.provider,
          model: result.model, attemptCount: result.attemptCount });
        if (!checked.valid) throw failure('PRESERVATION_REVIEW_MALFORMED');
        verdicts[dimension] = checked;
      } catch (error) {
        code = networkViolation ? 'PRESERVATION_REVIEW_NETWORK' : ownCodes.has(error?.code)
          ? error.code : 'PRESERVATION_REVIEW_PROVIDER_FAILED';
        call.failure = { code, ...workersAiFailureDiagnostic(error) };
        break outer;
      } finally { active = false; }
    }
    const expectedSourceSupported = holdout ? control.expectedSourceSupported : true;
    const expectedMeaningPreserved = holdout ? control.expectedMeaningPreserved : control.expected;
    const sourceCorrect = verdicts.source.claims.every(j => j.sourceSupported === expectedSourceSupported);
    const meaningCorrect = verdicts.meaning.claims.every(j => j.meaningPreserved === expectedMeaningPreserved);
    results.push({ caseId: control.caseId, valid: true, verdicts, expectedSourceSupported, expectedMeaningPreserved,
      supported: verdicts.source.supported && verdicts.meaning.supported,
      sourceCorrect, meaningCorrect, passed: sourceCorrect && meaningCorrect, rationale: control.rationale });
  }
  const passed = results.length === controls.length && results.every(r => r.passed);
  if (!passed && !code) code = 'PRESERVATION_REVIEW_MISCLASSIFIED';
  const report = { mode: `${textOnly ? 'text' : 'isolated'}-preservation-${paraphrase ? 'paraphrase' : holdout ? 'holdouts' : 'controls'}-not-an-edition`,
    status: passed ? 'reviewer-controls-passed' : 'failed', code,
    caseSetSha256: paraphrase ? PRESERVATION_PARAPHRASE_CASESET_SHA256 : holdout ? PRESERVATION_HOLDOUT_CASESET_SHA256 : PRESERVATION_CASESET_SHA256,
    totalCases: controls.length, completedCases: results.length, correctCases: results.filter(r => r.passed).length,
    modelRequests, networkRequests, outputBudget: modelRequests * TOKENS, searchQueries: 0, emailSent: false,
    ...(textOnly ? { localIdentityReviews: localDecisions.length } : {}),
    cases: results.map(({ caseId, valid, passed, sourceCorrect, meaningCorrect }) => ({ caseId, valid, passed, sourceCorrect, meaningCorrect })),
    failures: calls.flatMap(call => call.failure ? [call.failure] : []) };
  return { report, sealed: sealDiagnostic({ purpose: report.mode, capturedAt: now.toISOString(),
    cases: controls, calls, results, report, ...(textOnly ? { localDecisions } : {}) }, publicKey) };
}
