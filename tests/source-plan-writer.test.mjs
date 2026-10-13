import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, generateKeyPairSync} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildSourcePlanView, acceptSourcePlan, buildPlannedRewriteView, attachPlannedReferences,
  SOURCE_PLAN_PROMPT, PLANNED_REWRITE_PROMPT} from '../scripts/automation/experiments/source-plan-writer.mjs';
import {sourceSentenceSegments} from '../scripts/automation/experiments/source-plan-segmentation.mjs';
import {prepareBenchmark, BENCHMARK_DESKS, compactReferenceWriterView, normalizeCompactReferenceSummary,
  runBenchmark} from '../scripts/automation/article-benchmark.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
import {buildWorkersAiRequest, FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';

const sha = s => createHash('sha256').update(s).digest('hex');
const fields = ['whatHappened', 'whyItMatters', 'whatToWatch'];
const source = Array.from({length: 8}, (_, i) =>
  `Fictional passage ${i + 1}: a synthetic service has policy conditions, eligibility limitations and exclusions that a reader-facing summary must preserve.`).join('\n');
const encode = value => {const body = JSON.stringify(value); return [gzipSync(body).toString('base64'), sha(body)];};
const packet = (s = source) => ({version: 1, articles: Array.from({length: 10}, (_, i) => ({
  id: `A${String(i + 1).padStart(2, '0')}`, desk: BENCHMARK_DESKS[i % 4], title: `Fictional policy ${i}`,
  url: `https://github.blog/changelog/plan-fixture-${i}/`, publisherKey: 'microsoft', sourceText: s,
  sourceSha256: sha(s), captureNote: 'Fictional structural fixture, not article quality evidence.'}))});
const corpus = s => prepareBenchmark(...encode(packet(s)));
const mixedCorpus = s => {
  const p = packet(); p.articles[0].sourceText = s; p.articles[0].sourceSha256 = sha(s);
  return prepareBenchmark(...encode(p));
};
const article = () => corpus().articles[0];
const input = a => ({articleId: a.id, sourceSha256: a.sourceSha256, ...compactReferenceWriterView(a).data});
const view = () => buildSourcePlanView(input(article()));
const selection = () => ({decision: 'plan', headline: ['P1S1'], whatHappened: ['P1S1'], whyItMatters: ['P2S1'], whatToWatch: ['P3S1']});
const abstention = () => ({decision: 'abstain', headline: [], whatHappened: [], whyItMatters: [], whatToWatch: []});
// Intentionally synthetic: passing transport tests cannot qualify prose or facts.
const rewrite = (hash, n = 130) => ({planSha256: hash, headline: 'A fictional service revises its policy',
  whatHappened: [['GitHub', ...Array.from({length: n - 3}, (_, i) => `v${i}`)].join(' ') + '.'],
  whyItMatters: ['Context.'], whatToWatch: ['Limitations.']});
const pair = generateKeyPairSync('rsa', {modulusLength: 3072});
const publicKey = pair.publicKey.export({type: 'spki', format: 'der'}).toString('base64');
const response = x => new Response(JSON.stringify({success: true, result: {response: JSON.stringify(x)}}), {headers: {'content-type': 'application/json'}});
async function execute({sourceText = source, firstOnly = false, answer, storageFailure, ...extra} = {}) {
  const plan = firstOnly ? mixedCorpus(sourceText) : corpus(sourceText), saved = [], seen = []; let calls = 0;
  const result = await runBenchmark({plan, sourcePlan: true, publicKey, accountId: '0'.repeat(32), apiToken: 'TEST_ONLY',
    save: async (id, sealed) => {
      if (storageFailure?.(id)) throw Error('storage unavailable');
      saved.push({id, data: openDiagnostic(sealed, pair.privateKey)});
    }, fetchImpl: async (_url, init) => {
      calls++; const b = JSON.parse(init.body), d = JSON.parse(b.messages[1].content);
      seen.push({body: b, data: d, redirect: init.redirect, bytes: Buffer.byteLength(init.body)});
      return answer ? answer({b, d, calls, saved}) : response(d.planSha256 ? rewrite(d.planSha256) : selection());
    }, ...extra});
  return {result, saved, seen, calls, plan};
}

test('planning has all source text, conservative offsets and exclusions, not model-written facts', () => {
  const a = article(), c = structuredClone(input(a));
  c.passages.push({id: 'P9', text: 'Unterminated version: 8.0'});
  c.sourceSha256 = sha(c.passages.map(p => p.text).join('\n'));
  const v = buildSourcePlanView(c);
  assert.equal(v.prompt, SOURCE_PLAN_PROMPT); assert.equal(v.data.catalog.length, 8);
  assert.deepEqual(v.data.context.passages, c.passages); assert.equal(v.data.excluded[0].reason, 'unterminated');
  for (const s of v.data.catalog) assert.equal(c.passages.find(p => p.id === s.passageId).text.slice(s.start, s.end), s.text);
  const {contextSha256, ...hashed} = v.data; assert.equal(contextSha256, sha(JSON.stringify(hashed)));
  assert.ok(Object.isFrozen(v.data.context.passages[0])); c.passages[0].text = 'altered';
  assert.notEqual(v.data.context.passages[0].text, 'altered');
  assert.doesNotMatch(JSON.stringify(v.schema), /supported|reason|quote|confidence|fact/);
  const units = sourceSentenceSegments('An eligible sentence. A field without terminal punctuation');
  assert.equal(units[0].reason, null); assert.equal(units[1].reason, 'unterminated'); assert.ok(Object.isFrozen(units[0]));
});

test('empty selectable catalog allows explicit abstention while preserving full excluded evidence', () => {
  const c = input(article()); c.passages = c.passages.map(p => ({...p, text: p.text.slice(0, -1)}));
  c.sourceSha256 = sha(c.passages.map(p => p.text).join('\n'));
  const v = buildSourcePlanView(c), p = acceptSourcePlan(abstention(), v);
  assert.equal(v.data.catalog.length, 0); assert.equal(v.data.excluded.length, 8);
  assert.equal(v.schema.properties.headline.maxItems, 0);
  assert.throws(() => buildPlannedRewriteView(v, p), /SOURCE_PLAN_ABSTAINED/);
});

test('source identity covers article ID, title, URL, publisher, capture note, attribution and exact source', () => {
  const original = input(article()), baseline = buildSourcePlanView(original);
  for (const field of ['articleId', 'title', 'sourceUrl', 'publisher', 'sourceScope', 'requiredAttribution']) {
    const c = structuredClone(original); c[field] = field === 'articleId' ? 'A02' : c[field] + ' changed';
    assert.notEqual(buildSourcePlanView(c).data.contextSha256, baseline.data.contextSha256);
  }
  for (const mutate of [c => c.sourceSha256 = '0'.repeat(64), c => c.passages.reverse(),
    c => c.passages[0].id = 'P8', c => c.passages[0].text += ' changed', c => c.passages[0].extra = true,
    c => delete c.passages[2], c => c.passages = new Array(8), c => c.sourceScope = '',
    c => c.articleId = 'not-an-id', c => c.extra = true, c => c.passages[0].text = '\ud800']) {
    const c = structuredClone(original); mutate(c); assert.throws(() => buildSourcePlanView(c), /SOURCE_PLAN_CONTEXT/);
  }
  let accessed = false; const c = structuredClone(original);
  Object.defineProperty(c, 'title', {enumerable: true, get() {accessed = true; return 'title';}});
  assert.throws(() => buildSourcePlanView(c), /SOURCE_PLAN_CONTEXT/); assert.equal(accessed, false);
  assert.throws(() => buildSourcePlanView(new Proxy(original, {})), /SOURCE_PLAN_CONTEXT/);
});

test('accepted source selections are copied, deep frozen and bound to one issued view', () => {
  const v = view(), raw = selection(), p = acceptSourcePlan(raw, v), w = buildPlannedRewriteView(v, p);
  const {contextSha256, selection: selected, slots} = p;
  assert.equal(p.planSha256, sha(JSON.stringify({contextSha256, selection: selected, slots})));
  assert.equal(w.prompt, PLANNED_REWRITE_PROMPT); assert.deepEqual(w.data.context, v.data.context);
  assert.equal(w.data.planSha256, p.planSha256); assert.equal(w.data.slots.whatHappened[0].text, v.data.catalog[0].text);
  assert.equal(p.semanticApproval, false); assert.equal(p.productionApproved, false);
  raw.whatHappened[0] = 'P8S1'; assert.equal(p.selection.whatHappened[0], 'P1S1');
  assert.ok(Object.isFrozen(p.slots.whatHappened[0]));
  for (const [wrongView, wrongPlan] of [[view(), p], [v, structuredClone(p)], [structuredClone(v), p]])
    assert.throws(() => buildPlannedRewriteView(wrongView, wrongPlan), /SOURCE_PLAN_IDENTITY/);
  assert.throws(() => acceptSourcePlan(selection(), structuredClone(v)), /SOURCE_PLAN_IDENTITY/);
});

test('plan cannot add prose, unknown IDs, reordered IDs, duplicate body IDs or sparse slots', () => {
  for (const mutate of [s => s.facts = ['invented'], s => s.decision = 'approved', s => s.headline = [],
    s => s.whatHappened = ['P999S1'], s => s.whatHappened = ['P1'], s => s.whatToWatch = ['P2S1'],
    s => s.headline = ['P2S1', 'P1S1'], s => s.headline = ['P1S1', 'P1S1'],
    s => s.whatHappened = ['P1S1', 'P4S1', 'P5S1', 'P6S1'], s => delete s.whatHappened[0],
    s => s.decision = 'abstain', s => s.whyItMatters = null]) {
    const s = selection(); mutate(s); assert.throws(() => acceptSourcePlan(s, view()), /SOURCE_PLAN_(SHAPE|ANCHOR)/);
  }
  let read = false; const s = selection();
  Object.defineProperty(s, 'decision', {enumerable: true, get() {read = true; return 'plan';}});
  assert.throws(() => acceptSourcePlan(s, view()), /SOURCE_PLAN_SHAPE/); assert.equal(read, false);
});

test('writer cannot change plan hash, number of slots or host-attached references', () => {
  const v = view(), p = acceptSourcePlan(selection(), v), r = rewrite(p.planSha256);
  const x = attachPlannedReferences(r, v, p);
  assert.deepEqual(x.whatHappened[0].passageIds, ['P1']); assert.deepEqual(x.whyItMatters[0].passageIds, ['P2']);
  assert.equal(x.whatToWatch[0].text, r.whatToWatch[0]); r.whatToWatch[0] = 'changed';
  assert.notEqual(x.whatToWatch[0].text, 'changed'); assert.ok(Object.isFrozen(x.whatToWatch[0]));
  for (const mutate of [r => r.planSha256 = '0'.repeat(64), r => r.whatHappened = [],
    r => r.whyItMatters.push('Extra.'), r => r.whatToWatch[0] = {text: 'New.', passageIds: ['P8']},
    r => delete r.whatToWatch[0], r => r.facts = [], r => r.headline = 'x'.repeat(181)]) {
    const r = rewrite(p.planSha256); mutate(r); assert.throws(() => attachPlannedReferences(r, v, p), /PLANNED_REWRITE_SHAPE/);
  }
});

test('unsupported clauses and meaning swaps can remain mechanically valid but never semantically approved', () => {
  const v = view(), p = acceptSourcePlan(selection(), v);
  for (const mutate of [r => r.whyItMatters[0] = 'This guarantees universal safety and eliminates every adoption risk.',
    r => [r.whyItMatters, r.whatToWatch] = [r.whatToWatch, r.whyItMatters]]) {
    const r = rewrite(p.planSha256); mutate(r);
    const x = attachPlannedReferences(r, v, p), summary = normalizeCompactReferenceSummary(x, article());
    assert.equal(summary.semanticApproval, false); assert.equal(summary.productionApproved, false);
    assert.equal(summary.qualificationCoverageVerified, false); assert.equal(summary.independentReview, 'required');
    assert.deepEqual(x.whyItMatters[0].passageIds, ['P2']); // Binding is not entailment.
  }
});

test('existing reader word, copying and attribution checks still govern planned rewrites', () => {
  const v = view(), p = acceptSourcePlan(selection(), v), a = article();
  for (const n of [109, 110, 225, 226]) {
    const x = attachPlannedReferences(rewrite(p.planSha256, n), v, p);
    if (n < 110 || n > 225) assert.throws(() => normalizeCompactReferenceSummary(x, a), /DRAFT_LENGTH/);
    else assert.equal(normalizeCompactReferenceSummary(x, a).bodyWords, n);
  }
  for (const mutate of [r => r.whatHappened[0] = r.whatHappened[0].replace('GitHub', 'Someone'),
    r => r.whyItMatters[0] = a.passages[0].text, r => r.whatToWatch[0] = 'garbled “whatToWatch”: answer.',
    r => r.whatToWatch[0] = 'unfinished']) {
    const r = rewrite(p.planSha256); mutate(r);
    assert.throws(() => normalizeCompactReferenceSummary(attachPlannedReferences(r, v, p), a));
  }
});

test('twenty bounded mock calls preserve both native answers before validation and keep judgments unset', async () => {
  const {result: r, saved, seen, calls, plan} = await execute({answer: ({d, calls, saved}) => {
    if (d.planSha256) assert.ok(saved.find(s => s.id === `${d.context.articleId}-planner`));
    return response(d.planSha256 ? rewrite(d.planSha256) : selection());
  }});
  assert.equal(calls, 20); assert.equal(r.requests, 20); assert.equal(r.networkRequests, 20);
  assert.equal(r.requestedOutputTokens, 52000); assert.equal(r.mode, 'source-plan-writer');
  assert.equal(r.results.length, 10); assert.equal(saved.length, 30); assert.equal(r.emailSent, false); assert.equal(r.productionApproved, false);
  assert.ok(r.results.every(x => x.status === 'awaiting-independent-review' && x.draftStructural && !x.reviewerStructural && x.sourceSupported === null && x.faithful === null));
  for (const [i, s] of seen.entries()) {
    assert.equal(s.body.max_tokens, i % 2 ? 4000 : 1200); assert.equal(s.body.reasoning_effort, 'medium');
    assert.equal(s.redirect, 'error'); assert.ok(s.bytes < 90000); assert.equal(s.body.model, undefined);
    assert.deepEqual(s.data.context.passages, plan.articles[Math.floor(i / 2)].passages);
  }
  for (const s of saved.filter(x => /-(planner|writer)$/.test(x.id))) {
    const raw = Buffer.from(s.data.nativeResponseBase64, 'base64');
    assert.equal(s.data.nativeResponseSha256, sha(raw)); assert.equal(s.data.responseSha256, sha(raw));
    assert.equal(s.data.requestSha256, sha(JSON.stringify({provider: 'cloudflare-workers-ai', model: '@cf/openai/gpt-oss-120b', body: s.data.body})));
    assert.ok(Buffer.byteLength(JSON.stringify(s.data)) < 350000);
  }
  assert.doesNotMatch(JSON.stringify(r), /Fictional|v20|TEST_ONLY/);
  assert.ok(saved.filter(s => /^A\d+$/.test(s.id)).every(s => s.data.sourcePlan.semanticApproval === false));
});

for (const bad of ['abstain', 'invalid']) test(`planner ${bad} does not call writer or remove any denominator article`, async () => {
  const {result: r, saved, calls} = await execute({answer: () => response(bad === 'abstain' ? abstention() : {decision: 'plan'})});
  assert.equal(calls, 10); assert.equal(r.requestedOutputTokens, 12000); assert.equal(r.results.length, 10);
  assert.ok(r.results.every(s => s.code === (bad === 'abstain' ? 'BENCHMARK_SOURCE_PLAN_ABSTAINED' : 'BENCHMARK_SOURCE_PLAN_SHAPE')));
  assert.equal(saved.filter(s => s.id.endsWith('-writer')).length, 0);
  assert.equal(saved.filter(s => s.id.endsWith('-planner') && s.data.nativeResponseBase64).length, 10);
});

for (const stage of ['planner', 'writer']) test(`${stage} provider refusal stops entire remaining batch without retries`, async () => {
  const {result: r, calls} = await execute({answer: ({d}) => Boolean(d.planSha256) === (stage === 'writer') ? new Response('{}', {status: 429}) : response(selection())});
  assert.equal(calls, stage === 'planner' ? 1 : 2); assert.equal(r.stoppedOnProviderBlocker, true);
  assert.equal(r.results[0].code, 'BENCHMARK_PROVIDER_STOP'); assert.equal(r.results.filter(s => s.status === 'not-attempted-provider-blocker').length, 9);
});

for (const stage of ['planner', 'writer']) test(`${stage} evidence storage failure stops later stages and articles`, async () => {
  const {result: r, calls} = await execute({storageFailure: id => id.endsWith(`-${stage}`)});
  assert.equal(calls, stage === 'planner' ? 1 : 2); assert.equal(r.stoppedOnEvidenceBlocker, true);
  assert.equal(r.results[0].code, 'BENCHMARK_EVIDENCE_STORAGE'); assert.equal(r.results.filter(s => s.status === 'not-attempted-evidence-blocker').length, 9);
});

test('invalid writer remains encrypted; ordinary holds continue to all ten cases', async () => {
  const {result: r, calls, saved} = await execute({answer: ({d}) => response(d.planSha256 ? {planSha256: d.planSha256, headline: 'Incomplete'} : selection())});
  assert.equal(calls, 20); assert.ok(r.results.every(s => s.code === 'BENCHMARK_PLANNED_REWRITE_SHAPE'));
  assert.equal(saved.filter(s => s.id.endsWith('-writer') && s.data.nativeResponseBase64).length, 10);
});

test('planned version-boundary violations hold exact text without provider repair or threshold changes', async () => {
  const sourceText = 'Synthetic agents below version 4.8.2 cannot register.\n' + source;
  const {result: r, calls, saved} = await execute({sourceText, answer: ({d}) => {
    if (!d.planSha256) return response({...selection(), headline: ['P2S1'], whatHappened: ['P2S1'], whyItMatters: ['P1S1']});
    const x = rewrite(d.planSha256); x.whyItMatters[0] = 'Agents on version 4.8.2 or older cannot register.'; return response(x);
  }});
  assert.equal(calls, 20); assert.ok(r.results.every(s => s.code === 'BENCHMARK_VERSION_BOUNDARY_REVIEW' && s.draftStructural));
  assert.match(saved.find(s => s.id === 'A01').data.summary.raw.whyItMatters[0], /or older/);
});

test('mode is opt-in and cannot mix with another writer; workflow tests run before secrets', async () => {
  for (const modes of [{sourcePlan: 'yes'}, {sourcePlan: true, compactReference: true}, {sourcePlan: true, sourceFirst: true}, {sourcePlan: true, scopeFirst: true}])
    await assert.rejects(runBenchmark({plan: corpus(), ...modes, publicKey, save: async () => {}}), /BENCHMARK_MODE/);
  const workflow = await readFile(new URL('../.github/workflows/article-benchmark.yml', import.meta.url), 'utf8');
  assert.match(workflow, /default: write-and-review/); assert.match(workflow, /- source-plan-writer/);
  assert.ok(workflow.indexOf('tests/source-plan-writer.test.mjs') < workflow.indexOf('CLOUDFLARE_AI_API_TOKEN'));
  assert.doesNotMatch(workflow, /RESEND|OPENAI_API_KEY|schedule:|contents: write/);
  const [encoded, digest] = encode(packet());
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/automation/article-benchmark.mjs', import.meta.url)), 'validate'],
    {encoding: 'utf8', env: {GITHUB_REPOSITORY: 'itworksinprod/first-fold', GITHUB_ACTOR: 'itworksinprod',
      GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_WORKFLOW_REF: 'itworksinprod/first-fold/.github/workflows/article-benchmark.yml@refs/heads/main',
      GITHUB_SHA: '1'.repeat(40), BENCHMARK_REVISION: '1'.repeat(40), DIAGNOSTIC_PUBLIC_KEY: publicKey,
      FIRST_FOLD_BENCHMARK_B64: encoded, BENCHMARK_PACKET_SHA256: digest, BENCHMARK_MODE: 'source-plan-writer'}});
  assert.equal(result.status, 0); assert.equal(result.stderr.trim(), '');
});

test('isolated segmentation preserves the byte-pinned legacy algorithm without revising historical evidence', async () => {
  const dir = new URL('../scripts/automation/experiments/', import.meta.url);
  const legacy = await readFile(new URL('source-sentence-review.mjs', dir), 'utf8');
  const isolated = await readFile(new URL('source-plan-segmentation.mjs', dir), 'utf8');
  assert.equal(sha(legacy), '906fcf509072e3a92f9dd1f4de4a435bbc9d3a48b3678a886d910fa22c0d4653');
  assert.equal(isolated.slice(isolated.indexOf('const letter='), isolated.indexOf('export function sourceSentenceSegments')).trim(),
    legacy.slice(legacy.indexOf('const letter='), legacy.indexOf('export function buildSourceSentenceReview')).trim());
  for (const value of [null, '', 'x'.repeat(6001), '\ud800']) assert.throws(() => sourceSentenceSegments(value), /SOURCE_SENTENCE_INPUT/);
  for (const [s, reason] of [['Unbalanced (sentence.', 'unbalanced'], ['Too.', 'too-short'], ['Large ' + 'x'.repeat(410) + '.', 'too-long']])
    assert.equal(sourceSentenceSegments(s)[0].reason, reason);
  const joined = sourceSentenceSegments('Dr. Bright uses version 3.2.1. A new sentence follows.');
  assert.equal(joined.length, 2); assert.equal(joined[0].reason, null);
});

const stressSource = unit => Array.from({length: 3}, () => Array(42).fill(unit).join(' ')).join('\n');
const actualBytes = v => Buffer.byteLength(JSON.stringify(buildWorkersAiRequest({model: FREE_REASONING_WRITER_MODEL,
  messages: [{role: 'system', content: v.prompt + '\nJSON schema: ' + JSON.stringify(v.schema)},
    {role: 'user', content: JSON.stringify(v.data)}], schema: v.schema, responseFormat: 'json_object',
  maxTokens: 4000, reasoningEffort: 'medium', temperature: 0.1}).body));

for (const unit of ['Fictional ' + '\\'.repeat(110) + ' unit.', 'Fictional ' + '漢'.repeat(110) + ' unit.'])
test('oversized escaped/UTF-8 case holds without a call; ordinary cases remain in the batch', async () => {
  const s = stressSource(unit), a = mixedCorpus(s).articles[0];
  assert.throws(() => buildSourcePlanView(input(a)), /SOURCE_PLAN_SIZE/);
  const {result: r, calls, saved} = await execute({sourceText: s, firstOnly: true});
  assert.equal(calls, 18); assert.equal(r.requests, 18); assert.equal(r.requestedOutputTokens, 46800);
  assert.equal(r.results.length, 10); assert.equal(r.results[0].code, 'BENCHMARK_SOURCE_PLAN_SIZE');
  assert.ok(r.results.slice(1).every(x => x.status === 'awaiting-independent-review'));
  assert.ok(!saved.some(s => s.id === 'A01-planner' || s.id === 'A01-writer'));
  assert.equal(r.stoppedOnProviderBlocker, false); assert.equal(r.stoppedOnEvidenceBlocker, false);
});

test('admitted quote-heavy, escaped, and Unicode requests fit actual adapter payload and encrypted evidence caps', async () => {
  for (const unit of ['Fictional ' + '"x" '.repeat(26) + ' unit.', 'Fictional ' + '\\'.repeat(50) + ' unit.',
    'Fictional ' + '漢'.repeat(40) + ' unit.']) {
    const s = stressSource(unit), a = mixedCorpus(s).articles[0], v = buildSourcePlanView(input(a));
    assert.ok(actualBytes(v) <= 90000);
    const p = acceptSourcePlan({decision: 'plan', headline: ['P1S1', 'P1S2', 'P1S3'],
      whatHappened: ['P1S1', 'P1S2', 'P1S3'], whyItMatters: ['P1S4', 'P1S5', 'P1S6'], whatToWatch: ['P1S7', 'P1S8', 'P1S9']}, v);
    assert.ok(actualBytes(buildPlannedRewriteView(v, p)) <= 90000);
    const {result, seen, saved} = await execute({sourceText: s, firstOnly: true});
    assert.equal(result.networkRequests, 20); assert.equal(result.stoppedOnEvidenceBlocker, false);
    assert.ok(seen.every(s => s.bytes <= 90000)); assert.ok(saved.every(s => Buffer.byteLength(JSON.stringify(s.data)) <= 350000));
  }
});

test('segment count and context bounds reject excessive evidence before any provider use', () => {
  const c = input(article()); c.passages = [{id: 'P1', text: Array(161).fill('A complete sentence.').join(' ')}];
  c.sourceSha256 = sha(c.passages[0].text);
  assert.throws(() => buildSourcePlanView(c), /SOURCE_PLAN_COMPLEXITY/);
  c.passages[0].text = 'x'.repeat(6001); c.sourceSha256 = sha(c.passages[0].text);
  assert.throws(() => buildSourcePlanView(c), /SOURCE_PLAN_CONTEXT/);
});

test('oversized parsed planner answers preserve native evidence before the validation cap, without writer calls', async () => {
  const {result: r, calls, saved} = await execute({answer: () => response({invalid: 'x'.repeat(60000)})});
  assert.equal(calls, 10); assert.ok(r.results.every(x => x.code === 'BENCHMARK_RESPONSE_SIZE'));
  assert.equal(saved.filter(s => s.id.endsWith('-planner') && Buffer.from(s.data.nativeResponseBase64, 'base64').length > 60000).length, 10);
  assert.ok(saved.every(s => Buffer.byteLength(JSON.stringify(s.data)) < 350000));
});
