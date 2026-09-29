// Opt-in fictional calibration only. No article, writer, retries or delivery.
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {diagnosticPublicKey, sealDiagnostic} from './private-writer-diagnostic.mjs';
import {WATCH_ROLE_CONTROLS, WATCH_ROLE_CONTROLSET_SHA256, watchRoleControlView,
  scoreWatchRoleControl} from './experiments/watch-role-controls.mjs';
import {diagnoseWatchRoleReview} from './experiments/watch-role-review.mjs';
import {buildWorkersAiRequest, requestWorkersAiEditorial, workersAiRunUrl, workersAiFailureDiagnostic,
  FREE_REASONING_WRITER_MODEL} from './free/workers-ai.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const fail = code => Object.assign(new Error(code), {code});
const issued = new WeakSet();
export const ROLE_CALIBRATION_PIN = '5d7a7d4451f66feb6784ef41a9f5990bb2d6be67f52cde838d735d6edb618859';
export function prepareWatchRoleCalibration() {
  if (WATCH_ROLE_CONTROLSET_SHA256 !== ROLE_CALIBRATION_PIN || WATCH_ROLE_CONTROLS.length !== 8) throw fail('ROLE_CALIBRATION_PIN');
  const plan = Object.freeze({corpusSha256: ROLE_CALIBRATION_PIN,
    views: Object.freeze(WATCH_ROLE_CONTROLS.map(watchRoleControlView))});
  issued.add(plan); return plan;
}

export function assertRoleCalibrationAuthority(env) {
  if (env.GITHUB_REPOSITORY !== 'itworksinprod/first-fold' || env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_WORKFLOW_REF !== 'itworksinprod/first-fold/.github/workflows/watch-role-calibration.yml@refs/heads/main' ||
    env.GITHUB_ACTOR !== 'itworksinprod' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1') throw fail('ROLE_CALIBRATION_AUTHORITY');
}

export async function runWatchRoleCalibration({plan, publicKey, accountId, apiToken, now = new Date(),
  aiRequestImpl = requestWorkersAiEditorial, fetchImpl = fetch, sealImpl = sealDiagnostic}) {
  if (!issued.has(plan)) throw fail('ROLE_CALIBRATION_PLAN');
  diagnosticPublicKey(publicKey);
  const capture = {purpose: 'synthetic-watch-role-calibration-awaiting-manual-review', capturedAt: now.toISOString(),
    corpusSha256: plan.corpusSha256, calls: [], cases: [], emailSent: false,
    reviewerQualification: 'unqualified-outside-these-frozen-synthetic-controls'};
  let networkRequests = 0, outputBudget = 0, code = null;
  try {
    for (const [index, view] of plan.views.entries()) {
      const control = WATCH_ROLE_CONTROLS[index], model = FREE_REASONING_WRITER_MODEL;
      const maxTokens = 2400, prompt = `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
      const options = {model, messages: [{role: 'system', content: prompt}, {role: 'user', content: JSON.stringify(view.data)}],
        schema: view.schema, responseFormat: 'json_object', maxTokens, maxAttempts: 1, temperature: 0.1,
        timeoutMs: 90000, maxRequestBytes: 70000, maxResponseBytes: 100000};
      if (capture.calls.length >= 8 || outputBudget + maxTokens > 19200) throw fail('ROLE_CALIBRATION_BUDGET');
      const endpoint = workersAiRunUrl(accountId, model), {body} = buildWorkersAiRequest(options), bodyText = JSON.stringify(body);
      const requestSha256 = sha(JSON.stringify({provider: 'cloudflare-workers-ai', model, body}));
      const call = {caseId: control.id, request: view.data, promptSha256: sha(prompt), requestSha256};
      capture.calls.push(call); outputBudget += maxTokens;
      let active = true, violation = false, attempts = 0, result;
      try {
        result = await aiRequestImpl({...options, accountId, apiToken,
          validatePayload: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
          fetchImpl: async (url, init) => {
            if (!active || violation || url !== endpoint || init?.method !== 'POST' || init.redirect !== 'error' ||
                init.body !== bodyText || attempts >= 1 || networkRequests >= 8) {
              violation = true; throw fail('ROLE_CALIBRATION_NETWORK');
            }
            attempts++; networkRequests++; return fetchImpl(url, init);
          }});
      } finally {active = false;}
      if (violation || attempts !== 1) throw fail('ROLE_CALIBRATION_NETWORK');
      if (result.provider !== 'cloudflare-workers-ai' || result.model !== model || result.requestSha256 !== requestSha256 ||
          !/^[a-f0-9]{64}$/u.test(result.responseSha256 ?? '') || result.attemptCount !== 1) throw fail('ROLE_CALIBRATION_PROVENANCE');
      Object.assign(call, {provider: result.provider, model, responseSha256: result.responseSha256, attemptCount: 1});
      const diagnostic = diagnoseWatchRoleReview(result.editorialPayload, view);
      if (!diagnostic.verdict.valid) {
        call.responseRejectedBeforeCapture = true;
        call.validationReason = diagnostic.reason;
        throw fail('ROLE_CALIBRATION_RESPONSE_INVALID');
      }
      call.response = structuredClone(result.editorialPayload);
      capture.cases.push(scoreWatchRoleControl(control, view, result.editorialPayload));
    }
    // A valid wrong answer is evidence, not a transport error or a retry request.
    if (capture.cases.length !== 8 || capture.cases.some(c => !c.matched)) throw fail('ROLE_CALIBRATION_MISMATCH');
  } catch (error) {
    code = /^[A-Z_]{1,64}$/u.test(error?.code ?? '') ? error.code : 'ROLE_CALIBRATION_FAILED';
    capture.failure = workersAiFailureDiagnostic(error);
  }
  const report = {mode: capture.purpose, status: code ? 'failed' : 'controls-passed-awaiting-manual-review', code,
    modelRequests: capture.calls.length, networkRequests, outputBudget, writerRequests: 0, searchQueries: 0, emailSent: false,
    casesCompleted: capture.cases.length, casesPassed: capture.cases.filter(c => c.matched).length};
  return {report, sealed: sealImpl({...capture, report}, publicKey)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (!((command === 'validate' && args.length === 0) || (command === 'run' && args.length === 1))) throw fail('ROLE_CALIBRATION_ARGUMENTS');
    assertRoleCalibrationAuthority(process.env); diagnosticPublicKey(process.env.DIAGNOSTIC_PUBLIC_KEY);
    const plan = prepareWatchRoleCalibration();
    if (command === 'run') {
      const {sealed, report} = await runWatchRoleCalibration({plan, publicKey: process.env.DIAGNOSTIC_PUBLIC_KEY,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_AI_API_TOKEN});
      await writeFile(args[0], JSON.stringify(sealed), {mode: 0o600, flag: 'wx'});
      console.info(`::notice title=Watch role calibration::${JSON.stringify(report)}`);
      if (report.status === 'failed') process.exitCode = 1;
    }
  } catch (error) {
    console.error(`::error title=Watch role calibration::${/^[A-Z_]{1,64}$/u.test(error?.code ?? '') ? error.code : 'ROLE_CALIBRATION_FAILED'}`);
    process.exitCode = 1;
  }
}
