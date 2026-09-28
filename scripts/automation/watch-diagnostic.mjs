// Saved-article experiment only. No research, delivery, retries or paid fallback.
import {createHash} from 'node:crypto';
import {buildWorkersAiRequest, workersAiRunUrl, workersAiFailureDiagnostic,
  DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL} from './free/workers-ai.mjs';
import {validateIsolatedPreservationReview} from './free/isolated-preservation-review.mjs';
import {assertWatchPlan, applyWatchQuestion, buildWatchFieldReview,
  WATCH_PASSAGES, watchSourceRequest} from './experiments/watch-question.mjs';
const fields = ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch'];
const sha = text => createHash('sha256').update(text).digest('hex');
const fail = code => Object.assign(new Error(code), {code});

export async function diagnoseWatch({plan, publicKey, accountId, apiToken, now,
  aiRequestImpl, fetchImpl, sealDiagnostic}) {
  assertWatchPlan(plan);
  const capture = {purpose: 'saved-meaningful-watch-awaiting-manual-review', capturedAt: now.toISOString(),
    packetSha256: plan.packetSha256, originRunId: plan.originRunId, originCaptureSha256: plan.originCaptureSha256,
    source: plan.sourceRecord, beforeCopyedit: plan.baseline, calls: [], fieldReviews: [],
    reviewerQualification: 'experimental-not-general-qualified', emailSent: false};
  let modelRequests = 0, networkRequests = 0, outputBudget = 0, code = null;
  const request = async (view, stage, field) => {
    const editing = stage === 'question', model = editing ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL;
    if ((editing && modelRequests !== 0) || modelRequests >= 5) throw fail('WATCH_BUDGET');
    const maxTokens = editing ? 2400 : 600;
    if (outputBudget + maxTokens > 4800) throw fail('WATCH_BUDGET');
    const prompt = `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
    const options = {model, messages: [{role: 'system', content: prompt}, {role: 'user', content: JSON.stringify(view.data)}],
      schema: view.schema, responseFormat: 'json_object', maxTokens, maxAttempts: 1, temperature: 0.1,
      timeoutMs: editing ? 90000 : 30000, maxRequestBytes: 70000, maxResponseBytes: 100000};
    const endpoint = workersAiRunUrl(accountId, model), {body} = buildWorkersAiRequest(options), bodyText = JSON.stringify(body);
    const requestSha256 = sha(JSON.stringify({provider: 'cloudflare-workers-ai', model, body}));
    const call = {stage, ...(field ? {field, dimension: 'source'} : {}), request: view.data,
      promptSha256: sha(prompt), requestSha256};
    capture.calls.push(call); modelRequests++; outputBudget += maxTokens;
    let attempts = 0, violation = false, active = true, result;
    try {
      result = await aiRequestImpl({...options, accountId, apiToken,
        validatePayload: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
        fetchImpl: async (url, init) => {
          if (!active || violation || url !== endpoint || init?.method !== 'POST' || init.redirect !== 'error' ||
              init.body !== bodyText || attempts >= 1 || networkRequests >= 5) {
            violation = true; throw fail('WATCH_NETWORK');
          }
          attempts++; networkRequests++;
          return fetchImpl(url, init);
        }});
    } finally { active = false; }
    if (violation || attempts !== 1) throw fail('WATCH_NETWORK');
    if (result.provider !== 'cloudflare-workers-ai' || result.model !== model || result.requestSha256 !== requestSha256 ||
        !/^[a-f0-9]{64}$/u.test(result.responseSha256 ?? '') || result.attemptCount !== 1) throw fail('WATCH_PROVENANCE');
    Object.assign(call, {provider: result.provider, model, responseSha256: result.responseSha256, attemptCount: 1});
    return {call, payload: result.editorialPayload};
  };
  try {
    const editor = await request(plan, 'question');
    let applied;
    try { applied = applyWatchQuestion(plan, editor.payload); }
    catch (error) { editor.call.responseRejectedBeforeCapture = true; throw error; }
    editor.call.response = structuredClone(editor.payload);
    if (applied.decision === 'abstain') throw fail('WATCH_EDITOR_ABSTAINED');
    capture.draft = applied.draft; capture.reviewUnits = applied.units;
    capture.draftSha256 = sha(JSON.stringify(applied.draft));
    capture.retainedTextIdentity = applied.retainedTextIdentity;
    capture.additionScope = {allowedPassageIds: WATCH_PASSAGES, type: 'editorial-question-not-a-reported-plan-or-prediction',
      status: 'requires-exact-manual-premise-and-usefulness-review'};
    // No future answer or equivalence is claimed for the question. Older text is identical.
    for (const field of fields) {
      const view = buildWatchFieldReview(plan, applied, field);
      const response = await request(watchSourceRequest(view, field), 'review', field);
      const verdict = validateIsolatedPreservationReview(response.payload, view);
      if (!verdict.valid) response.call.responseRejectedBeforeCapture = true;
      else response.call.response = structuredClone(response.payload);
      const entry = {field, source: {verdict}, verdict};
      capture.fieldReviews.push(entry);
      if (!verdict.valid || !verdict.supported) throw fail('WATCH_SOURCE_REJECTED');
      if (field === 'whatToWatch') {
        const question = response.payload.judgments.find(j => j.claimId === view.data.claims.at(-1).claimId);
        // Citation membership is a mechanical gate, not proof of scoped entailment.
        const citationScopePassed = question.evidenceIds.every(id => WATCH_PASSAGES.includes(id));
        entry.additionCitationScope = {passed: citationScopePassed, semanticScopeReview: 'manual-pending'};
        entry.verdict = {...verdict, supported: verdict.supported && citationScopePassed};
        if (!citationScopePassed) throw fail('WATCH_SCOPE_REJECTED');
      }
    }
  } catch (error) {
    code = /^[A-Z_]{1,64}$/u.test(error?.code ?? '') ? error.code : 'WATCH_FAILED';
    capture.failure = workersAiFailureDiagnostic(error);
  }
  const report = {mode: capture.purpose, status: code ? 'failed' : 'draft-awaiting-manual-review', code,
    modelRequests, networkRequests, outputBudget, searchQueries: 0, emailSent: false,
    fieldsPassed: capture.fieldReviews.filter(r => r.verdict.valid && r.verdict.supported).map(r => r.field)};
  return {report, sealed: sealDiagnostic({...capture, report}, publicKey)};
}
