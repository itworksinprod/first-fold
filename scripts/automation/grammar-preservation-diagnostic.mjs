// Fixed, synthetic, meaning-only diagnostic. Never an article approval path.
import { createHash } from 'node:crypto';
import { GRAMMAR_PRESERVATION_CONTROLS, GRAMMAR_PRESERVATION_PROBES,
  GRAMMAR_CONTRAST_SHA256, buildGrammarPreservationViews } from './experiments/grammar-preservation-cases.mjs';
import { validateDefinitionPreservationReview } from './experiments/definition-preservation.mjs';
import { DEFAULT_CLOUDFLARE_AI_MODEL, buildWorkersAiRequest, workersAiFailureDiagnostic } from './free/workers-ai.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const failure = code => Object.assign(new Error(code), { code });
const CAP = 11, TOKENS = 600;
const ownCodes = new Set(['GRAMMAR_REVIEW_NETWORK', 'GRAMMAR_REVIEW_PROVENANCE', 'GRAMMAR_REVIEW_MALFORMED']);

export async function diagnoseGrammarPreservation({ publicKey, accountId, apiToken, now,
  aiRequestImpl, fetchImpl, endpoint, sealDiagnostic }) {
  const controls = [...GRAMMAR_PRESERVATION_CONTROLS, ...GRAMMAR_PRESERVATION_PROBES];
  const views = buildGrammarPreservationViews(), calls = [], results = [];
  let modelRequests = 0, networkRequests = 0, code = null;
  // No configurable cases, labels, model, prompt, budget, retries or identity bypass.
  for (const [index, { caseId, view }] of views.entries()) {
    const control = controls[index];
    const prompt = `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
    const options = { model: DEFAULT_CLOUDFLARE_AI_MODEL,
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(view.data) }],
      schema: view.schema, responseFormat: 'json_object', maxTokens: TOKENS, maxAttempts: 1,
      temperature: 0.1, timeoutMs: 30000, maxRequestBytes: 70000, maxResponseBytes: 100000 };
    const { body } = buildWorkersAiRequest(options), bodyText = JSON.stringify(body);
    const requestSha256 = hash(JSON.stringify({ provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, body }));
    const call = { caseId, dimension: 'meaning', request: view.data, prompt, schema: view.schema,
      requestSha256, promptSha256: hash(prompt), requestBytes: Buffer.byteLength(bodyText) };
    calls.push(call);
    let requests = 0, networkViolation = false, active = true;
    try {
      if (modelRequests >= CAP) throw failure('GRAMMAR_REVIEW_NETWORK');
      modelRequests++;
      const result = await aiRequestImpl({ ...options, accountId, apiToken,
        validatePayload: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
        fetchImpl: async (url, init) => {
          if (!active || networkViolation || url !== endpoint || init?.method !== 'POST' || init?.redirect !== 'error' ||
              init.body !== bodyText || requests >= 1 || networkRequests >= CAP) {
            networkViolation = true;
            throw failure('GRAMMAR_REVIEW_NETWORK');
          }
          requests++; networkRequests++;
          return fetchImpl(url, init);
        } });
      active = false;
      if (networkViolation || requests !== 1) throw failure('GRAMMAR_REVIEW_NETWORK');
      if (result.provider !== 'cloudflare-workers-ai' || result.model !== DEFAULT_CLOUDFLARE_AI_MODEL ||
          result.requestSha256 !== requestSha256 || !/^[a-f0-9]{64}$/u.test(result.responseSha256 ?? '') ||
          result.attemptCount !== 1) throw failure('GRAMMAR_REVIEW_PROVENANCE');
      // Strict validation precedes cloning so accessors/extras cannot be erased.
      const checked = validateDefinitionPreservationReview(result.editorialPayload, view);
      call.response = checked.valid ? structuredClone(result.editorialPayload) : null;
      if (!checked.valid) call.responseRejectedBeforeCapture = true;
      Object.assign(call, { responseSha256: result.responseSha256, provider: result.provider,
        model: result.model, attemptCount: result.attemptCount });
      if (!checked.valid) throw failure('GRAMMAR_REVIEW_MALFORMED');
      const scored = control.expectedMeaningPreserved !== null;
      results.push({ caseId, valid: true, scored, verdict: checked,
        expectedMeaningPreserved: control.expectedMeaningPreserved,
        passed: scored ? checked.claims.every(j => j.meaningPreserved === control.expectedMeaningPreserved) : null,
        rationale: control.rationale });
      // Wrong but valid answers are observations, not grounds for a repair/retry.
    } catch (error) {
      code = networkViolation ? 'GRAMMAR_REVIEW_NETWORK' : ownCodes.has(error?.code)
        ? error.code : 'GRAMMAR_REVIEW_PROVIDER_FAILED';
      call.failure = { code, ...workersAiFailureDiagnostic(error) };
      break;
    } finally { active = false; }
  }
  const scoredResults = results.filter(r => r.scored);
  const passed = !code && results.length === CAP && scoredResults.length === 10 && scoredResults.every(r => r.passed);
  if (!passed && !code) code = 'GRAMMAR_REVIEW_MISCLASSIFIED';
  const report = { mode: 'grammar-preservation-controls-not-an-edition',
    status: passed ? 'reviewer-controls-passed' : 'failed', code,
    caseSetSha256: GRAMMAR_CONTRAST_SHA256,
    reviewerPromptSha256: hash(views[0].view.prompt),
    glossaryBinding: views[0].view.data.glossaryBinding,
    totalCases: CAP, totalScoredCases: 10, totalUnscoredProbes: 1,
    completedCases: results.length, correctCases: scoredResults.filter(r => r.passed).length,
    maximumModelRequests: CAP, maximumOutputBudget: CAP * TOKENS,
    modelRequests, networkRequests, outputBudget: modelRequests * TOKENS, searchQueries: 0, emailSent: false,
    cases: results.map(({ caseId, valid, scored, passed, verdict }) => ({ caseId, valid, scored, passed,
      meaningPreserved: verdict.supported })),
    failures: calls.flatMap(call => call.failure ? [call.failure] : []) };
  return { report, sealed: sealDiagnostic({ purpose: report.mode, capturedAt: now.toISOString(),
    cases: controls, calls, results, report }, publicKey) };
}
