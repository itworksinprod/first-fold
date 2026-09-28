// Frozen synthetic contrast. Expected labels never enter provider requests.
import {createHash} from 'node:crypto';
import {buildIsolatedPreservationReview, validateIsolatedPreservationReview} from '../free/isolated-preservation-review.mjs';
import {watchSourceRequest, WATCH_LABEL} from './watch-question.mjs';
import {buildWorkersAiRequest, workersAiRunUrl, workersAiFailureDiagnostic, DEFAULT_CLOUDFLARE_AI_MODEL} from '../free/workers-ai.mjs';
const freeze = value => {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);}
  return value;
};
const source = freeze({publisher: 'Fictional LumenRoute research', passages: [
  {evidenceId: 'S1P5', text: 'In a laboratory test, LumenRoute found a route that avoided the marked obstacles. Avoiding those obstacles was a required condition.'},
  {evidenceId: 'S1P20', text: 'Route length can be added as a quality goal. A shorter route is a possible aim alongside the required obstacle avoidance.'},
]});
const retained = 'LumenRoute found a route that avoided marked obstacles in a laboratory test.';
export const WATCH_PREMISE_CONTROLS = freeze([
  {id: 'A', question: 'Could route length change if shortening the route were an extra goal while obstacle avoidance remained required?', expected: [true, true]},
  {id: 'B', question: 'Would adding route length as a goal make a route shorter, leave its length unchanged, or make it longer, with obstacle avoidance still required?', expected: [true, true]},
  {id: 'C', question: 'Could route length change in the announced trials next month if shortening the route were an extra goal?', expected: [true, false]},
  {id: 'D', question: 'How much shorter could a route be if LumenRoute’s guarantee of avoiding every real-world collision still held?', expected: [true, false]},
]);
export function watchPremiseControlView(control) {
  if (!WATCH_PREMISE_CONTROLS.includes(control)) throw Object.assign(new Error('WATCH_CONTROL_INVALID'), {code: 'WATCH_CONTROL_INVALID'});
  const claims = [retained, WATCH_LABEL + control.question];
  return buildIsolatedPreservationReview({text: claims.join(' '), claims, sources: [source]}, 'source');
}
const sha = text => createHash('sha256').update(text).digest('hex');
const fail = code => Object.assign(new Error(code), {code});

export async function diagnoseWatchPremiseControls({publicKey, accountId, apiToken, now, aiRequestImpl, fetchImpl, sealDiagnostic}) {
  const capture = {purpose: 'synthetic-watch-premise-controls-not-an-article', capturedAt: now.toISOString(),
    calls: [], cases: [], emailSent: false, reviewerQualification: 'unqualified-outside-these-fixed-controls'};
  let networkRequests = 0, code = null;
  try {
    for (const control of WATCH_PREMISE_CONTROLS) {
      const view = watchPremiseControlView(control), model = DEFAULT_CLOUDFLARE_AI_MODEL;
      const scoped = watchSourceRequest(view, 'whatToWatch');
      const prompt = `${scoped.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
      const options = {model, messages: [{role: 'system', content: prompt}, {role: 'user', content: JSON.stringify(view.data)}],
        schema: view.schema, responseFormat: 'json_object', maxTokens: 600, maxAttempts: 1, temperature: 0.1,
        timeoutMs: 30000, maxRequestBytes: 70000, maxResponseBytes: 100000};
      const endpoint = workersAiRunUrl(accountId, model), {body} = buildWorkersAiRequest(options), bodyText = JSON.stringify(body);
      const requestSha256 = sha(JSON.stringify({provider: 'cloudflare-workers-ai', model, body}));
      const call = {caseId: control.id, request: view.data, promptSha256: sha(prompt), requestSha256};
      capture.calls.push(call);
      let active = true, violation = false, attempts = 0, result;
      try {
        result = await aiRequestImpl({...options, accountId, apiToken,
          validatePayload: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
          fetchImpl: async (url, init) => {
            if (!active || violation || url !== endpoint || init?.method !== 'POST' || init.redirect !== 'error' ||
                init.body !== bodyText || attempts >= 1 || networkRequests >= 4) {
              violation = true; throw fail('WATCH_CONTROL_NETWORK');
            }
            attempts++; networkRequests++;
            return fetchImpl(url, init);
          }});
      } finally {active = false;}
      if (violation || attempts !== 1) throw fail('WATCH_CONTROL_NETWORK');
      if (result.provider !== 'cloudflare-workers-ai' || result.model !== model || result.requestSha256 !== requestSha256 ||
          !/^[a-f0-9]{64}$/u.test(result.responseSha256 ?? '') || result.attemptCount !== 1) throw fail('WATCH_CONTROL_PROVENANCE');
      Object.assign(call, {provider: result.provider, model, responseSha256: result.responseSha256, attemptCount: 1});
      const verdict = validateIsolatedPreservationReview(result.editorialPayload, view);
      if (!verdict.valid) {call.responseRejectedBeforeCapture = true; throw fail('WATCH_CONTROL_RESPONSE_INVALID');}
      call.response = structuredClone(result.editorialPayload);
      const observed = verdict.claims.map(c => c.sourceSupported);
      capture.cases.push({id: control.id, expected: control.expected, observed, passed: JSON.stringify(observed) === JSON.stringify(control.expected)});
    }
    if (capture.cases.length !== 4 || capture.cases.some(c => !c.passed)) throw fail('WATCH_CONTROL_MISMATCH');
  } catch (error) {
    code = /^[A-Z_]{1,64}$/u.test(error?.code ?? '') ? error.code : 'WATCH_CONTROL_FAILED';
    capture.failure = workersAiFailureDiagnostic(error);
  }
  const report = {mode: capture.purpose, status: code ? 'failed' : 'controls-passed-awaiting-manual-review', code,
    modelRequests: capture.calls.length, networkRequests, outputBudget: capture.calls.length * 600,
    casesCompleted: capture.cases.length, casesPassed: capture.cases.filter(c => c.passed).length,
    searchQueries: 0, emailSent: false};
  return {report, sealed: sealDiagnostic({...capture, report}, publicKey)};
}
