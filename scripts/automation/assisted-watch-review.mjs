// Explicitly approved alternative method, isolated from the old failed gate.
// Model source checks plus pinned assembly NEVER replace independent exact review.
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildCompositionReview, prepareCompositionReview} from './composed-watch-review.mjs';
import {buildWatchFieldReview} from './experiments/watch-question.mjs';
import {buildIsolatedPreservationReview, validateIsolatedPreservationReview} from './free/isolated-preservation-review.mjs';
import {diagnosticPublicKey, sealDiagnostic} from './private-writer-diagnostic.mjs';
import {buildWorkersAiRequest, requestWorkersAiEditorial, workersAiRunUrl, workersAiFailureDiagnostic,
  DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL} from './free/workers-ai.mjs';

export const ASSISTED_WATCH_METHOD = 'source-ingredients-constrained-composition-independent-review-v1';
export const ASSISTED_MAP_FILE_SHA256 = 'e0aedeb00c07b6c96fcf1e37c5f81d0488b3dceaacd2ea235815a3e438539165';
const sha = text => createHash('sha256').update(text).digest('hex');
const fail = code => Object.assign(new Error(code), {code});
const issued = new WeakSet();
const freeze = value => {if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value;};
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const d = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(d).length === keys.length && keys.every(k => d[k] && Object.hasOwn(d[k], 'value') && d[k].enumerable);
};
const dense = (value, n) => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length === n &&
  Reflect.ownKeys(value).length === n + 1 && Array.from({length: n}, (_, i) => Object.getOwnPropertyDescriptor(value, String(i)))
    .every(d => d && Object.hasOwn(d, 'value') && d.enumerable);
const text = s => typeof s === 'string' && s === s.trim() && s.length > 0 && s.length <= 600 && !/[\p{Cc}\p{Cf}]/u.test(s);

// Synthetic fixtures may build issued plans. The CLI additionally pins every input.
export function buildAssistedWatchPlan(watchPlan, choices, assertions) {
  const composition = buildCompositionReview(watchPlan, choices);
  if (!dense(assertions, 3)) throw fail('ASSISTED_INGREDIENTS_INVALID');
  const ids = new Set();
  for (const a of assertions) {
    if (!exact(a, ['id', 'assertion', 'evidenceIds', 'relationship']) || typeof a.id !== 'string' || !/^[a-z][a-z-]{0,39}$/u.test(a.id) ||
        ids.has(a.id) || !text(a.assertion) || !text(a.relationship) || !dense(a.evidenceIds, 1) ||
        a.evidenceIds[0] !== 'S1P20') throw fail('ASSISTED_INGREDIENTS_INVALID');
    ids.add(a.id);
  }
  // The entire relationship is part of the judged claim, never omitted metadata.
  const claims = assertions.map(a => `${a.assertion} ${a.relationship}`);
  const ingredientView = buildIsolatedPreservationReview({text: claims.join(' '),
    sources: [{publisher: 'MIT', passages: watchPlan.data.allowedContext}], claims}, 'source');
  const views = ['headline', 'whatHappened', 'whyItMatters'].map(field => ({field,
    view: buildWatchFieldReview(watchPlan, composition.applied, field)}));
  // Retained What to watch is an assertion. Keep its full source context and
  // original text, but do not send our question to the retired whole-question gate.
  views.push({field: 'whatToWatch', view: buildIsolatedPreservationReview({
    text: watchPlan.baseline.draft.whatToWatch, claims: watchPlan.baseline.units.whatToWatch,
    sources: [watchPlan.source, watchPlan.supplementSource]}, 'source')});
  views.push({field: 'ingredients', view: ingredientView});
  const plan = freeze({composition, assertions: structuredClone(assertions), views});
  issued.add(plan); return plan;
}

export function prepareAssistedWatchReview(baselineB64, catalogB64, mapB64) {
  const composition = prepareCompositionReview(baselineB64, catalogB64);
  if (typeof mapB64 !== 'string' || !mapB64 || mapB64.length > 24000 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(mapB64)) throw fail('ASSISTED_MAP_INVALID');
  let source;
  try {
    const bytes = Buffer.from(mapB64, 'base64');
    if (bytes.toString('base64') !== mapB64) throw fail('ASSISTED_MAP_INVALID');
    source = gunzipSync(bytes, {maxOutputLength: 20000}).toString('utf8');
  } catch {throw fail('ASSISTED_MAP_INVALID');}
  if (sha(source) !== ASSISTED_MAP_FILE_SHA256) throw fail('ASSISTED_MAP_INVALID');
  const map = JSON.parse(source);
  if (map.baselinePacketSha256 !== composition.watchPlan.packetSha256 ||
      map.candidateDraftSha256 !== composition.composition.draftSha256 ||
      map.question !== composition.composition.selection.question) throw fail('ASSISTED_MAP_BINDING');
  return buildAssistedWatchPlan(composition.watchPlan, composition.composition.catalog.choices, map.sourceAssertions);
}

export function assertAssistedWatchAuthority(env) {
  if (env.GITHUB_REPOSITORY !== 'itworksinprod/first-fold' || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_WORKFLOW_REF !== 'itworksinprod/first-fold/.github/workflows/assisted-watch-review.yml@refs/heads/main' ||
      env.GITHUB_ACTOR !== 'itworksinprod' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1') throw fail('ASSISTED_AUTHORITY_REJECTED');
}

export async function reviewAssistedWatch({plan, publicKey, accountId, apiToken, now = new Date(),
  aiRequestImpl = requestWorkersAiEditorial, fetchImpl = fetch, sealImpl = sealDiagnostic}) {
  if (!issued.has(plan)) throw fail('ASSISTED_PLAN_INVALID');
  diagnosticPublicKey(publicKey);
  const {composition: c} = plan, {watchPlan, applied, composition} = c;
  const capture = {purpose: 'assisted-watch-review-awaiting-independent-review', method: ASSISTED_WATCH_METHOD,
    capturedAt: now.toISOString(), packetSha256: watchPlan.packetSha256, originRunId: watchPlan.originRunId,
    originCaptureSha256: watchPlan.originCaptureSha256, source: watchPlan.sourceRecord,
    supplementSource: watchPlan.supplementSource, beforeCopyedit: watchPlan.baseline, composition,
    ingredientAssertions: plan.assertions, ingredientMapFileSha256: ASSISTED_MAP_FILE_SHA256,
    draft: applied.draft, reviewUnits: applied.units, draftSha256: composition.draftSha256,
    retainedTextIdentity: applied.retainedTextIdentity, calls: [], fieldReviews: [], emailSent: false,
    independentReview: 'required-not-performed-by-this-workflow', previousWholeQuestionHold: 'preserved-not-overridden'};
  let networkRequests = 0, outputBudget = 0, code = null;
  try {
    for (const {field, view} of plan.views) {
      const reasoning = field === 'ingredients', model = reasoning ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL;
      const maxTokens = reasoning ? 2400 : 600, prompt = `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
      const options = {model, messages: [{role: 'system', content: prompt}, {role: 'user', content: JSON.stringify(view.data)}],
        schema: view.schema, responseFormat: 'json_object', maxTokens, maxAttempts: 1, temperature: 0.1,
        timeoutMs: reasoning ? 90000 : 30000, maxRequestBytes: 70000, maxResponseBytes: 100000};
      if (capture.calls.length >= 5 || outputBudget + maxTokens > 4800) throw fail('ASSISTED_BUDGET');
      const endpoint = workersAiRunUrl(accountId, model), {body} = buildWorkersAiRequest(options), bodyText = JSON.stringify(body);
      const requestSha256 = sha(JSON.stringify({provider: 'cloudflare-workers-ai', model, body}));
      const call = {stage: 'review', field, dimension: 'source', request: view.data,
        promptSha256: sha(prompt), requestSha256};
      capture.calls.push(call); outputBudget += maxTokens;
      let attempts = 0, violation = false, active = true, result;
      try {
        result = await aiRequestImpl({...options, accountId, apiToken,
          validatePayload: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
          fetchImpl: async (url, init) => {
            if (!active || violation || url !== endpoint || init?.method !== 'POST' || init.redirect !== 'error' ||
                init.body !== bodyText || attempts >= 1 || networkRequests >= 5) {violation = true; throw fail('ASSISTED_NETWORK');}
            attempts++; networkRequests++; return fetchImpl(url, init);
          }});
      } finally {active = false;}
      if (violation || attempts !== 1) throw fail('ASSISTED_NETWORK');
      if (result.provider !== 'cloudflare-workers-ai' || result.model !== model || result.requestSha256 !== requestSha256 ||
          !/^[a-f0-9]{64}$/u.test(result.responseSha256 ?? '') || result.attemptCount !== 1) throw fail('ASSISTED_PROVENANCE');
      Object.assign(call, {provider: result.provider, model, responseSha256: result.responseSha256, attemptCount: 1});
      const verdict = validateIsolatedPreservationReview(result.editorialPayload, view);
      if (verdict.valid) call.response = structuredClone(result.editorialPayload);
      else call.responseRejectedBeforeCapture = true;
      capture.fieldReviews.push({field, verdict});
      if (!verdict.valid) throw fail('ASSISTED_REVIEW_INVALID');
      if (!verdict.supported) throw fail('ASSISTED_SOURCE_REJECTED');
    }
  } catch (error) {
    code = /^[A-Z_]{1,64}$/u.test(error?.code ?? '') ? error.code : 'ASSISTED_FAILED';
    capture.failure = workersAiFailureDiagnostic(error);
  }
  const report = {mode: capture.purpose, method: ASSISTED_WATCH_METHOD,
    status: code ? 'failed' : 'awaiting-independent-review', code,
    modelRequests: capture.calls.length, networkRequests, outputBudget, writerRequests: 0, searchQueries: 0, emailSent: false,
    fieldsPassed: capture.fieldReviews.filter(r => r.verdict.valid && r.verdict.supported).map(r => r.field)};
  return {report, sealed: sealImpl({...capture, report}, publicKey)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (!((command === 'validate' && args.length === 0) || (command === 'run' && args.length === 1 &&
        process.env.RUNNER_TEMP && resolve(args[0]) === resolve(process.env.RUNNER_TEMP, 'assisted-watch.encrypted.json')))) throw fail('ASSISTED_ARGUMENTS_INVALID');
    assertAssistedWatchAuthority(process.env); diagnosticPublicKey(process.env.DIAGNOSTIC_PUBLIC_KEY);
    const plan = prepareAssistedWatchReview(process.env.FIRST_FOLD_WATCH_BASELINE_B64,
      process.env.FIRST_FOLD_WATCH_COMPOSITION_B64, process.env.FIRST_FOLD_WATCH_INGREDIENTS_B64);
    if (command === 'run') {
      const {sealed, report} = await reviewAssistedWatch({plan, publicKey: process.env.DIAGNOSTIC_PUBLIC_KEY,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_AI_API_TOKEN});
      await writeFile(args[0], JSON.stringify(sealed), {mode: 0o600, flag: 'wx'});
      console.info(`::notice title=Assisted watch review::${JSON.stringify(report)}`);
      if (report.status === 'failed') process.exitCode = 1;
    }
  } catch (error) {
    console.error(`::error title=Assisted watch review::${/^[A-Z_]{1,64}$/u.test(error?.code ?? '') ? error.code : 'ASSISTED_FAILED'}`);
    process.exitCode = 1;
  }
}
