// Opt-in, pinned, review-only experiment. No writer, research, retries or delivery.
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {diagnosticPublicKey, sealDiagnostic} from './private-writer-diagnostic.mjs';
import {decodeWatchPacket, loadWatchPlan, assertWatchPlan, applyWatchQuestion, buildWatchFieldReview,
  watchSourceRequest, validateWatchSourceResponse} from './experiments/watch-question.mjs';
import {createWatchComposer, composeWatchSelection, WATCH_COMPOSITION_TEMPLATE} from './experiments/watch-composition.mjs';
import {buildWorkersAiRequest, requestWorkersAiEditorial, workersAiRunUrl, workersAiFailureDiagnostic,
  DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL} from './free/workers-ai.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const fail = code => Object.assign(new Error(code), {code});
const issued = new WeakSet();
const freeze = value => {if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value;};
export const COMPOSITION_CATALOG_FILE_SHA256 = '0323b153515678f73ce52e4a4c42decfd23efdf932536eebb9d1d9ae8647f7ee';
export const COMPOSITION_TEMPLATE_SHA256 = '22a5ae0a179e5a479ee725acfd0c182a02fca2ed76f8d267e29b20551380e660';
export const COMPOSITION_DRAFT_SHA256 = '3fc57771ccb552662d242c1e6ab00d14ea9241443dd6edfffac3a441e720ea99';

// Synthetic local tests can build issued plans; the CLI requires the exact pins.
export function buildCompositionReview(watchPlan, catalogInput) {
  assertWatchPlan(watchPlan);
  const composer = createWatchComposer({passages: watchPlan.data.allowedContext, choices: catalogInput});
  if (composer.data.choices.length !== 1) throw fail('COMPOSITION_CHOICE_COUNT');
  const selection = composeWatchSelection(composer, {catalogSha256: composer.catalogSha256,
    decision: 'add', choiceId: composer.data.choices[0].id});
  const applied = applyWatchQuestion(watchPlan, {baselineSha256: watchPlan.data.baselineSha256, decision: 'add', question: selection.question});
  const plan = freeze({watchPlan, applied, composition: {catalog: composer.data, catalogSha256: composer.catalogSha256,
    template: WATCH_COMPOSITION_TEMPLATE, templateSha256: sha(WATCH_COMPOSITION_TEMPLATE),
    selection, draftSha256: sha(JSON.stringify(applied.draft)),
    authorship: 'manually-curated-concepts-and-host-owned-grammar-not-model-authored'}});
  issued.add(plan); return plan;
}

export function prepareCompositionReview(baselineB64, catalogB64) {
  const watchPlan = loadWatchPlan(decodeWatchPacket(baselineB64));
  if (typeof catalogB64 !== 'string' || !catalogB64 || catalogB64.length > 16000 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(catalogB64)) throw fail('COMPOSITION_PACKET_INVALID');
  let text;
  try {
    const bytes = Buffer.from(catalogB64, 'base64');
    if (bytes.toString('base64') !== catalogB64) throw fail('COMPOSITION_PACKET_INVALID');
    text = gunzipSync(bytes, {maxOutputLength: 12000}).toString('utf8');
  } catch { throw fail('COMPOSITION_PACKET_INVALID'); }
  if (sha(text) !== COMPOSITION_CATALOG_FILE_SHA256) throw fail('COMPOSITION_PACKET_INVALID');
  const catalog = JSON.parse(text);
  if (catalog.packetSha256 !== watchPlan.packetSha256) throw fail('COMPOSITION_PACKET_INVALID');
  const plan = buildCompositionReview(watchPlan, catalog.choices);
  if (plan.composition.catalogSha256 !== '6c1804917b1b8e5902e86300c71587e0a250c48e6ef246238d79ba4c8ca30a79' ||
      plan.composition.templateSha256 !== COMPOSITION_TEMPLATE_SHA256 || plan.composition.draftSha256 !== COMPOSITION_DRAFT_SHA256) throw fail('COMPOSITION_PIN_MISMATCH');
  return plan;
}

export function assertCompositionAuthority(env) {
  if (env.GITHUB_REPOSITORY !== 'itworksinprod/first-fold' || env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_WORKFLOW_REF !== 'itworksinprod/first-fold/.github/workflows/composed-watch-review.yml@refs/heads/main' ||
    env.GITHUB_ACTOR !== 'itworksinprod' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1') throw fail('COMPOSITION_AUTHORITY_REJECTED');
}

export async function reviewComposedWatch({plan, publicKey, accountId, apiToken, now = new Date(),
  aiRequestImpl = requestWorkersAiEditorial, fetchImpl = fetch, sealImpl = sealDiagnostic}) {
  if (!issued.has(plan)) throw fail('COMPOSITION_PLAN_INVALID');
  diagnosticPublicKey(publicKey);
  const {watchPlan, applied, composition} = plan;
  const capture = {purpose: 'composed-watch-review-awaiting-manual-review', capturedAt: now.toISOString(),
    packetSha256: watchPlan.packetSha256, originRunId: watchPlan.originRunId, originCaptureSha256: watchPlan.originCaptureSha256,
    source: watchPlan.sourceRecord, beforeCopyedit: watchPlan.baseline, composition,
    draft: applied.draft, reviewUnits: applied.units, draftSha256: composition.draftSha256,
    retainedTextIdentity: applied.retainedTextIdentity, calls: [], fieldReviews: [],
    reviewerQualification: 'experimental-not-general-qualified', emailSent: false};
  let networkRequests = 0, outputBudget = 0, code = null;
  try {
    for (const field of ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch']) {
      const sourceView = buildWatchFieldReview(watchPlan, applied, field);
      const view = watchSourceRequest(sourceView, field);
      const reasoning = field === 'whatToWatch', model = reasoning ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL;
      const maxTokens = reasoning ? 2400 : 600, prompt = `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
      const options = {model, messages: [{role: 'system', content: prompt}, {role: 'user', content: JSON.stringify(view.data)}],
        schema: view.schema, responseFormat: 'json_object', maxTokens, maxAttempts: 1, temperature: 0.1,
        timeoutMs: reasoning ? 90000 : 30000, maxRequestBytes: 70000, maxResponseBytes: 100000};
      if (capture.calls.length >= 4 || outputBudget + maxTokens > 4200) throw fail('COMPOSITION_BUDGET');
      const endpoint = workersAiRunUrl(accountId, model), {body} = buildWorkersAiRequest(options), bodyText = JSON.stringify(body);
      const requestSha256 = sha(JSON.stringify({provider: 'cloudflare-workers-ai', model, body}));
      const call = {stage: 'review', field, dimension: 'source', request: view.data, promptSha256: sha(prompt), requestSha256};
      capture.calls.push(call); outputBudget += maxTokens;
      let attempts = 0, violation = false, active = true, result;
      try {
        result = await aiRequestImpl({...options, accountId, apiToken,
          validatePayload: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
          fetchImpl: async (url, init) => {
            if (!active || violation || url !== endpoint || init?.method !== 'POST' || init.redirect !== 'error' ||
              init.body !== bodyText || attempts >= 1 || networkRequests >= 4) {violation = true; throw fail('COMPOSITION_NETWORK');}
            attempts++; networkRequests++; return fetchImpl(url, init);
          }});
      } finally {active = false;}
      if (violation || attempts !== 1) throw fail('COMPOSITION_NETWORK');
      if (result.provider !== 'cloudflare-workers-ai' || result.model !== model || result.requestSha256 !== requestSha256 ||
        !/^[a-f0-9]{64}$/u.test(result.responseSha256 ?? '') || result.attemptCount !== 1) throw fail('COMPOSITION_PROVENANCE');
      Object.assign(call, {provider: result.provider, model, responseSha256: result.responseSha256, attemptCount: 1});
      const verdict = validateWatchSourceResponse(result.editorialPayload, sourceView, field);
      if (verdict.valid) call.response = structuredClone(result.editorialPayload);
      else call.responseRejectedBeforeCapture = true;
      capture.fieldReviews.push({field, verdict});
      if (!verdict.valid) throw fail('COMPOSITION_REVIEW_INVALID');
      if (!verdict.supported) throw fail('COMPOSITION_SOURCE_REJECTED');
    }
  } catch (error) {
    code = /^[A-Z_]{1,64}$/u.test(error?.code ?? '') ? error.code : 'COMPOSITION_FAILED';
    capture.failure = workersAiFailureDiagnostic(error);
  }
  const report = {mode: capture.purpose, status: code ? 'failed' : 'draft-awaiting-manual-review', code,
    modelRequests: capture.calls.length, networkRequests, outputBudget, writerRequests: 0, searchQueries: 0, emailSent: false,
    fieldsPassed: capture.fieldReviews.filter(r => r.verdict.valid && r.verdict.supported).map(r => r.field)};
  return {report, sealed: sealImpl({...capture, report}, publicKey)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (!((command === 'validate' && args.length === 0) || (command === 'run' && args.length === 1))) throw fail('COMPOSITION_ARGUMENTS_INVALID');
    assertCompositionAuthority(process.env); diagnosticPublicKey(process.env.DIAGNOSTIC_PUBLIC_KEY);
    const plan = prepareCompositionReview(process.env.FIRST_FOLD_WATCH_BASELINE_B64, process.env.FIRST_FOLD_WATCH_COMPOSITION_B64);
    if (command === 'run') {
      const {sealed, report} = await reviewComposedWatch({plan, publicKey: process.env.DIAGNOSTIC_PUBLIC_KEY,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_AI_API_TOKEN});
      await writeFile(args[0], JSON.stringify(sealed), {mode: 0o600, flag: 'wx'});
      console.info(`::notice title=Composed watch review::${JSON.stringify(report)}`);
      if (report.status === 'failed') process.exitCode = 1;
    }
  } catch (error) {
    console.error(`::error title=Composed watch review::${/^[A-Z_]{1,64}$/u.test(error?.code ?? '') ? error.code : 'COMPOSITION_FAILED'}`);
    process.exitCode = 1;
  }
}
