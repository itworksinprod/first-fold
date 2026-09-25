// Fixed reviewer-only experiment. No writer, edits, research, delivery or promotion.
import { createHash } from 'node:crypto';
import { PRESERVATION_REVIEW_CONTROLS, PRESERVATION_CASESET_SHA256 } from './preservation-review-cases.mjs';
import { buildClaimwiseFactReview, validateClaimwiseFactReview } from './free/claimwise-fact-review.mjs';
import { buildSplitPreservationReview, validateSplitPreservationReview } from './free/split-preservation-review.mjs';
import { DEFAULT_CLOUDFLARE_AI_MODEL, buildWorkersAiRequest, workersAiFailureDiagnostic } from './free/workers-ai.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const failure = code => Object.assign(new Error(code), { code });
const CAP = 6, TOKENS = 600;
const ownCodes = new Set(['PRESERVATION_REVIEW_NETWORK', 'PRESERVATION_REVIEW_PROVENANCE']);

export async function diagnosePreservationReview({ publicKey, accountId, apiToken, now,
  aiRequestImpl, fetchImpl, endpoint, sealDiagnostic, splitDimensions = false }) {
  if (typeof splitDimensions !== 'boolean') throw failure('PRESERVATION_REVIEW_PROFILE');
  const calls = [], results = [];
  let modelRequests = 0, networkRequests = 0, code = null;
  // No caller-selected cases, model, prompt, labels, budget or retries.
  for (const control of PRESERVATION_REVIEW_CONTROLS) {
    const view = splitDimensions ? buildSplitPreservationReview(control.input) : buildClaimwiseFactReview(control.input);
    // The old mode retains byte-for-byte assembly from the fact-summary reviewer.
    const prompt = `${view.prompt}${splitDimensions ? '' : '\nKeep each comparison under 160 characters. Select only 1–3 decisive evidenceIds for supported claims. Do not list every passage.'}\nJSON schema: ${JSON.stringify(view.schema)}`;
    const options = { model: DEFAULT_CLOUDFLARE_AI_MODEL,
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(view.data) }],
      schema: view.schema, responseFormat: 'json_object', maxTokens: TOKENS, maxAttempts: 1,
      temperature: 0.1, timeoutMs: 90000, maxRequestBytes: 70000, maxResponseBytes: 100000 };
    const { body } = buildWorkersAiRequest(options);
    const bodyText = JSON.stringify(body);
    const requestSha256 = hash(JSON.stringify({ provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, body }));
    // Labels/rationales are recorded only in the encrypted audit, never messages.
    const call = { caseId: control.caseId, request: view.data, prompt, schema: view.schema,
      requestSha256, promptSha256: hash(prompt), requestBytes: Buffer.byteLength(bodyText) };
    calls.push(call);
    let requests = 0, networkViolation = false, active = true;
    try {
      if (modelRequests >= CAP) throw failure('PRESERVATION_REVIEW_NETWORK');
      modelRequests++;
      const result = await aiRequestImpl({ ...options, accountId, apiToken,
        validatePayload: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
        fetchImpl: async (url, init) => {
          if (!active || networkViolation || url !== endpoint || init?.method !== 'POST' || init?.redirect !== 'error' ||
              init.body !== bodyText || requests >= 1 || networkRequests >= CAP) {
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
      // Validate the exact v4 object first: cloning could erase hidden fields or
      // invoke accessors. Invalid v4 objects are not traversed for audit capture.
      const splitChecked = splitDimensions ? validateSplitPreservationReview(result.editorialPayload, view) : null;
      call.response = splitDimensions && !splitChecked.valid ? null : structuredClone(result.editorialPayload);
      if (splitDimensions && !splitChecked.valid) call.responseRejectedBeforeCapture = true;
      call.responseSha256 = result.responseSha256;
      call.provider = result.provider; call.model = result.model; call.attemptCount = result.attemptCount;
      const checked = splitDimensions ? splitChecked : validateClaimwiseFactReview(call.response, view);
      // These frozen controls all have source-supported finals; only two preserve meaning.
      // Correct overall rejection for the wrong reason must not pass this experiment.
      const sourceCorrect = splitDimensions && checked.valid && checked.claims.every(j => j.sourceSupported === true);
      const meaningCorrect = splitDimensions && checked.valid && checked.claims.every(j => j.meaningPreserved === control.expected);
      results.push({ caseId: control.caseId, ...checked, expected: control.expected,
        ...(splitDimensions ? { expectedSourceSupported: true, sourceCorrect, meaningCorrect } : {}),
        rationale: control.rationale, passed: checked.valid && checked.supported === control.expected &&
          (!splitDimensions || (sourceCorrect && meaningCorrect)) });
      if (!checked.valid) { code = 'PRESERVATION_REVIEW_MALFORMED'; break; }
      // A valid wrong answer is data, not grounds for a retry or a corrected prompt.
    } catch (error) {
      code = networkViolation ? 'PRESERVATION_REVIEW_NETWORK'
        : ownCodes.has(error?.code) ? error.code : 'PRESERVATION_REVIEW_PROVIDER_FAILED';
      call.failure = { code, ...workersAiFailureDiagnostic(error) };
      break;
    } finally { active = false; }
  }
  const passed = results.length === CAP && results.every(item => item.passed);
  if (!passed && !code) code = 'PRESERVATION_REVIEW_MISCLASSIFIED';
  const report = { mode: splitDimensions ? 'split-preservation-review-controls-not-an-edition' : 'preservation-review-controls-not-an-edition',
    status: passed ? 'reviewer-controls-passed' : 'failed', code,
    caseSetSha256: PRESERVATION_CASESET_SHA256, totalCases: CAP,
    completedCases: results.filter(item => item.valid).length, correctCases: results.filter(item => item.passed).length,
    modelRequests, networkRequests, outputBudget: modelRequests * TOKENS, searchQueries: 0, emailSent: false,
    cases: results.map(({ caseId, valid, passed, sourceCorrect, meaningCorrect }) => ({ caseId, valid, passed,
      ...(splitDimensions ? { sourceCorrect, meaningCorrect } : {}) })),
    failures: calls.flatMap(call => call.failure ? [call.failure] : []) };
  return { report, sealed: sealDiagnostic({ purpose: report.mode, capturedAt: now.toISOString(),
    cases: PRESERVATION_REVIEW_CONTROLS, calls, results, report }, publicKey) };
}
