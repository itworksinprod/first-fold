// Isolated, operator-selected saved-article trial. Never imported by delivery.
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {types} from 'node:util';
import {reviewedSearchPublisher} from './free/publisher-registry.mjs';
import {GENERIC_FACT_SUMMARY_PROMPT} from './free/generic-fact-summary-prompt.mjs';
import {buildIsolatedPreservationReview, validateIsolatedPreservationReview} from './free/isolated-preservation-review.mjs';
import {diagnosticPublicKey, sealDiagnostic} from './private-writer-diagnostic.mjs';
import {buildWorkersAiRequest, requestWorkersAiEditorial, workersAiRunUrl, workersAiFailureDiagnostic,
  DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL} from './free/workers-ai.mjs';

export const ARTICLE_TRIAL_PROMPT = GENERIC_FACT_SUMMARY_PROMPT
  .replaceAll('reviewed facts', 'supplied publisher passages') + '\nThe passages are one publisher account, not independently verified facts. Use no outside information. Preserve absolute dates as written; do not turn them into claims about today or an upcoming event. A source-backed next step or limitation is sufficient for whatToWatch; a hypothetical comparison or question is not required.';
export const ARTICLE_TRIAL_LIMITS = Object.freeze({requests: 5, outputTokens: 4800, minimumWords: 110, maximumWords: 225});
const fields = ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch'];
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = code => Object.assign(new Error(code), {code});
const exact = (v, keys) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) return false;
  const d = Object.getOwnPropertyDescriptors(v);
  return Reflect.ownKeys(d).length === keys.length && keys.every(k => d[k] && Object.hasOwn(d[k], 'value') && d[k].enumerable);
};
const dense = (a, max) => Array.isArray(a) && Object.getPrototypeOf(a) === Array.prototype && a.length > 0 && a.length <= max &&
  Reflect.ownKeys(a).length === a.length + 1 && Array.from({length: a.length}, (_, i) => Object.getOwnPropertyDescriptor(a, String(i)))
    .every(d => d && Object.hasOwn(d, 'value') && d.enumerable);
const freeze = v => {if (v && typeof v === 'object') {Object.values(v).forEach(freeze); Object.freeze(v);} return v;};
const plain = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max && s === s.trim() &&
  !/[{}<>`]|[\p{Cc}\p{Cf}]|["“”]\s*[:,]|\b(?:whatHappened|whyItMatters|whatToWatch)\s*["“”]?\s*:/u.test(s);
const tokens = s => s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const issued = new WeakSet();

// Native JSON has no behavior. Reject a noncompliant adapter's behavior-bearing
// objects before serializing or cloning even when retaining a rejected response.
function assertPlainJson(root) {
  let count = 0, characters = 0;
  const ancestors = new WeakSet();
  const walk = (value, depth) => {
    if (++count > 6000 || depth > 20) throw fail('ARTICLE_RESPONSE_DATA');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value === 'string') {
      characters += value.length;
      if (characters > 20000) throw fail('ARTICLE_RESPONSE_DATA');
      return;
    }
    if (typeof value !== 'object' || types.isProxy(value) || ancestors.has(value)) throw fail('ARTICLE_RESPONSE_DATA');
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw fail('ARTICLE_RESPONSE_DATA');
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
    if (keys.length > 501 || keys.some(k => typeof k !== 'string')) throw fail('ARTICLE_RESPONSE_DATA');
    if (array && (!Object.hasOwn(descriptors.length ?? {}, 'value') || descriptors.length.value > 500 ||
        keys.length !== descriptors.length.value + 1)) throw fail('ARTICLE_RESPONSE_DATA');
    ancestors.add(value);
    for (const key of keys) {
      const d = descriptors[key];
      if (array && key === 'length') continue;
      if (!Object.hasOwn(d, 'value') || !d.enumerable || (array && !/^(?:0|[1-9]\d*)$/.test(key))) throw fail('ARTICLE_RESPONSE_DATA');
      characters += key.length;
      if (characters > 20000) throw fail('ARTICLE_RESPONSE_DATA');
      walk(d.value, depth + 1);
    }
    ancestors.delete(value);
  };
  walk(root, 0);
}

export function prepareArticleTrial(encoded, expectedSha256) {
  if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256) || typeof encoded !== 'string' ||
      !encoded || encoded.length > 24000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw fail('ARTICLE_PACKET_INVALID');
  let text;
  try {
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded) throw fail('ARTICLE_PACKET_INVALID');
    text = gunzipSync(bytes, {maxOutputLength: 20000}).toString('utf8');
  } catch {throw fail('ARTICLE_PACKET_INVALID');}
  if (sha(text) !== expectedSha256) throw fail('ARTICLE_PACKET_HASH');
  let packet;
  try {packet = JSON.parse(text);} catch {throw fail('ARTICLE_PACKET_INVALID');}
  if (!exact(packet, ['version', 'url', 'publisherKey', 'excerpt', 'excerptSha256']) || packet.version !== 1 ||
      typeof packet.publisherKey !== 'string' || !packet.publisherKey || typeof packet.excerpt !== 'string' ||
      packet.excerpt.length < 120 || packet.excerpt.length > 12000 || sha(packet.excerpt) !== packet.excerptSha256) throw fail('ARTICLE_PACKET_INVALID');
  const reviewed = reviewedSearchPublisher(packet.url, packet.publisherKey);
  if (!reviewed || reviewed.url !== packet.url) throw fail('ARTICLE_SOURCE_NOT_REVIEWED');
  const blocks = packet.excerpt.split('\n');
  if (blocks.length > 40 || blocks.some(p => !plain(p, 5000))) throw fail('ARTICLE_PASSAGES_INVALID');
  const source = {publisher: reviewed.source.publisher, passages: blocks.map((text, i) => ({evidenceId: `S1P${i + 1}`, text}))};
  const plan = freeze({packetSha256: expectedSha256, packet, source,
    data: {publisher: source.publisher, sourceUrl: packet.url, passages: source.passages}});
  issued.add(plan); return plan;
}

export function normalizeArticleTrialSummary(raw, plan) {
  if (!issued.has(plan)) throw fail('ARTICLE_PLAN_INVALID');
  if (!exact(raw, fields) || !plain(raw.headline, 160)) throw fail('ARTICLE_SUMMARY_SHAPE');
  const units = {headline: [raw.headline]}, draft = {headline: raw.headline};
  for (const field of fields.slice(1)) {
    if (!dense(raw[field], 4) || raw[field].some(s => !plain(s, 1000) || !/[.!?]$/.test(s)) ||
        new Set(raw[field]).size !== raw[field].length) throw fail('ARTICLE_SUMMARY_UNITS');
    units[field] = [...raw[field]]; draft[field] = raw[field].join(' ');
    if (draft[field].length > 1800) throw fail('ARTICLE_SUMMARY_TEXT');
  }
  const bodyWords = fields.slice(1).map(f => draft[f]).join(' ').split(/\s+/u).length;
  if (bodyWords < 110 || bodyWords > 225) throw fail('ARTICLE_SUMMARY_LENGTH');
  const attribution = tokens(plan.source.publisher).join(' ');
  if (!` ${tokens(draft.whatHappened).join(' ')} `.includes(` ${attribution} `)) throw fail('ARTICLE_SUMMARY_ATTRIBUTION');
  const original = ` ${tokens(plan.packet.excerpt).join(' ')} `, copy = tokens(fields.map(f => draft[f]).join(' '));
  for (let i = 0; i + 12 <= copy.length; i++) {
    if (original.includes(` ${copy.slice(i, i + 12).join(' ')} `)) throw fail('ARTICLE_SUMMARY_ORIGINALITY');
  }
  return freeze({draft, units, bodyWords, draftSha256: sha(JSON.stringify(draft))});
}

export function articleTrialWriterView(plan) {
  if (!issued.has(plan)) throw fail('ARTICLE_PLAN_INVALID');
  return freeze({prompt: ARTICLE_TRIAL_PROMPT, data: plan.data, schema: {type: 'object', additionalProperties: false,
    required: fields, properties: {headline: {type: 'string', maxLength: 160},
      ...Object.fromEntries(fields.slice(1).map(f => [f, {type: 'array', minItems: 1, maxItems: 4,
        items: {type: 'string', maxLength: 1000}}]))}}});
}

export function articleTrialReviewViews(summary, plan) {
  // Re-normalize instead of trusting a caller's separately supplied text/hash.
  const checked = normalizeArticleTrialSummary({...summary.units, headline: summary.units.headline[0]}, plan);
  if (JSON.stringify(summary) !== JSON.stringify(checked)) throw fail('ARTICLE_SUMMARY_BINDING');
  return fields.map(field => ({field, view: buildIsolatedPreservationReview({
    text: checked.draft[field], claims: checked.units[field], sources: [plan.source]}, 'source')}));
}

export function assertArticleTrialAuthority(env) {
  if (env.GITHUB_REPOSITORY !== 'itworksinprod/first-fold' || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_WORKFLOW_REF !== 'itworksinprod/first-fold/.github/workflows/article-summary-trial.yml@refs/heads/main' ||
      env.GITHUB_ACTOR !== 'itworksinprod' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1') throw fail('ARTICLE_AUTHORITY_REJECTED');
}

export async function runArticleTrial({plan, publicKey, accountId, apiToken, now = new Date(),
  aiRequestImpl = requestWorkersAiEditorial, fetchImpl = fetch, sealImpl = sealDiagnostic}) {
  if (!issued.has(plan)) throw fail('ARTICLE_PLAN_INVALID');
  diagnosticPublicKey(publicKey);
  const capture = {purpose: 'article-neutral-summary-awaiting-independent-review', capturedAt: now.toISOString(),
    packetSha256: plan.packetSha256, source: plan.packet, publisher: plan.source.publisher,
    writerPromptSha256: sha(ARTICLE_TRIAL_PROMPT), calls: [], fieldReviews: [], emailSent: false,
    inputSelection: 'operator-selected-saved-source-not-automatic-research',
    independentReview: 'required-not-performed-by-this-workflow'};
  let networkRequests = 0, outputBudget = 0, code = null;
  const request = async (view, field) => {
    const writer = field === 'writer', model = writer ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL;
    const maxTokens = writer ? 2400 : 600, prompt = `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
    const options = {model, messages: [{role: 'system', content: prompt}, {role: 'user', content: JSON.stringify(view.data)}],
      schema: view.schema, responseFormat: 'json_object', maxTokens, maxAttempts: 1, temperature: 0.1,
      timeoutMs: writer ? 90000 : 30000, maxRequestBytes: 70000, maxResponseBytes: 100000};
    if (capture.calls.length >= 5 || outputBudget + maxTokens > 4800) throw fail('ARTICLE_BUDGET');
    const endpoint = workersAiRunUrl(accountId, model), {body} = buildWorkersAiRequest(options), bodyText = JSON.stringify(body);
    const requestSha256 = sha(JSON.stringify({provider: 'cloudflare-workers-ai', model, body}));
    const call = {stage: writer ? 'writer' : 'review', field, request: view.data, promptSha256: sha(prompt), requestSha256};
    capture.calls.push(call); outputBudget += maxTokens;
    let attempts = 0, violation = false, active = true, result;
    try {
      result = await aiRequestImpl({...options, accountId, apiToken,
        validatePayload: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
        fetchImpl: async (url, init) => {
          if (!active || violation || url !== endpoint || init?.method !== 'POST' || init.redirect !== 'error' ||
              init.body !== bodyText || attempts >= 1 || networkRequests >= 5) {violation = true; throw fail('ARTICLE_NETWORK');}
          attempts++; networkRequests++; return fetchImpl(url, init);
        }});
    } finally {active = false;}
    if (violation || attempts !== 1) throw fail('ARTICLE_NETWORK');
    assertPlainJson(result);
    if (result.provider !== 'cloudflare-workers-ai' || result.model !== model || result.requestSha256 !== requestSha256 ||
        !/^[a-f0-9]{64}$/.test(result.responseSha256 ?? '') || result.attemptCount !== 1) throw fail('ARTICLE_PROVENANCE');
    Object.assign(call, {provider: result.provider, model, responseSha256: result.responseSha256, attemptCount: 1});
    // Keep parsed rejected text only inside encryption so length/prose failures
    // can be inspected without regenerating or changing the original evidence.
    const payload = result.editorialPayload;
    assertPlainJson(payload);
    if (Buffer.byteLength(JSON.stringify(payload)) > 20000) throw fail('ARTICLE_RESPONSE_SIZE');
    call.response = structuredClone(payload);
    return payload;
  };
  try {
    const raw = await request(articleTrialWriterView(plan), 'writer');
    const summary = normalizeArticleTrialSummary(raw, plan);
    Object.assign(capture, summary);
    for (const {field, view} of articleTrialReviewViews(summary, plan)) {
      const verdict = validateIsolatedPreservationReview(await request(view, field), view);
      capture.fieldReviews.push({field, verdict});
      if (!verdict.valid) throw fail('ARTICLE_REVIEW_INVALID');
      if (!verdict.supported) throw fail('ARTICLE_SOURCE_REJECTED');
    }
  } catch (error) {
    code = /^[A-Z_]{1,64}$/.test(error?.code ?? '') ? error.code : 'ARTICLE_TRIAL_FAILED';
    capture.failure = workersAiFailureDiagnostic(error);
  }
  const report = {status: code ? 'failed' : 'awaiting-independent-review', code,
    modelRequests: capture.calls.length, networkRequests, outputBudget, emailSent: false,
    fieldsPassed: capture.fieldReviews.filter(x => x.verdict.valid && x.verdict.supported).map(x => x.field)};
  return {report, sealed: sealImpl({...capture, report}, publicKey)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (!((command === 'validate' && args.length === 0) || (command === 'run' && args.length === 1 && process.env.RUNNER_TEMP &&
        resolve(args[0]) === resolve(process.env.RUNNER_TEMP, 'article-summary-trial.encrypted.json')))) throw fail('ARTICLE_ARGUMENTS_INVALID');
    assertArticleTrialAuthority(process.env); diagnosticPublicKey(process.env.DIAGNOSTIC_PUBLIC_KEY);
    const plan = prepareArticleTrial(process.env.FIRST_FOLD_ARTICLE_TRIAL_B64, process.env.ARTICLE_PACKET_SHA256);
    if (command === 'run') {
      const {sealed, report} = await runArticleTrial({plan, publicKey: process.env.DIAGNOSTIC_PUBLIC_KEY,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_AI_API_TOKEN});
      await writeFile(args[0], JSON.stringify(sealed), {mode: 0o600, flag: 'wx'});
      console.info(`::notice title=Article summary trial::${JSON.stringify(report)}`);
      if (report.status === 'failed') process.exitCode = 1;
    }
  } catch (error) {
    console.error(`::error title=Article summary trial::${/^[A-Z_]{1,64}$/.test(error?.code ?? '') ? error.code : 'ARTICLE_TRIAL_FAILED'}`);
    process.exitCode = 1;
  }
}
