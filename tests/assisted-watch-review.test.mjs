import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {watchFixture} from './fixtures/watch-fixture.mjs';
import {buildAssistedWatchPlan, prepareAssistedWatchReview, assertAssistedWatchAuthority,
  reviewAssistedWatch, ASSISTED_WATCH_METHOD} from '../scripts/automation/assisted-watch-review.mjs';
import {buildWatchFieldReview, watchSourceRequest} from '../scripts/automation/experiments/watch-question.mjs';
import {validateIsolatedPreservationReview} from '../scripts/automation/free/isolated-preservation-review.mjs';
import {requestWorkersAiEditorial, buildWorkersAiRequest, workersAiRunUrl,
  DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';

const pair = generateKeyPairSync('rsa', {modulusLength: 3072});
const publicKey = pair.publicKey.export({type: 'spki', format: 'der'}).toString('base64');
function inputs() {
  const {plan: watchPlan} = watchFixture();
  const labels = {measure: 'file size', task: 'compression task', requirements: 'legibility requirements', goal: 'reducing file size'};
  const choices = [{id: 'synthetic', concepts: Object.fromEntries(Object.entries(labels).map(([key, phrase]) =>
    [key, {phrase, evidenceId: 'S1P5', sourceSpan: watchPlan.data.allowedContext[0].text.slice(0, 80)}]))}];
  // These are mechanics-only mock assertions, never claimed as source-qualified.
  const assertions = ['capability', 'optional-goal', 'measure-link'].map(id => ({id,
    assertion: `Synthetic ${id} assertion.`, relationship: `Complete synthetic ${id} relationship.`, evidenceIds: ['S1P20']}));
  return {watchPlan, choices, assertions};
}
function fixture() {const {watchPlan, choices, assertions} = inputs(); return buildAssistedWatchPlan(watchPlan, choices, assertions);}
const reply = data => ({reviewSha256: data.reviewSha256, judgments: data.claims.map(c => ({claimId: c.claimId,
  comparison: 'Structural test fixture, not model factuality evidence.', evidenceIds: ['S1P20'], sourceSupported: true}))});

async function run(failure, at = 4) {
  const plan = fixture(), requests = [], late = [], network = [], accountId = '0'.repeat(32);
  const result = await reviewAssistedWatch({plan, publicKey, accountId, apiToken: 'PRIVATE_TEST_TOKEN',
    now: new Date('2026-09-29T05:00:00Z'), sealImpl: x => x,
    aiRequestImpl: async request => {
      const index = requests.length; requests.push(request); late.push(request.fetchImpl);
      const {view} = plan.views[index];
      assert.deepEqual(JSON.parse(request.messages[1].content), view.data);
      assert.equal(request.messages[0].content, `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`);
      assert.equal(request.model, index === 4 ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(request.maxTokens, index === 4 ? 2400 : 600);
      assert.equal(request.timeoutMs, index === 4 ? 90000 : 30000);
      assert.equal(request.maxAttempts, 1); assert.equal(request.temperature, 0.1);
      const {body} = buildWorkersAiRequest(request);
      const url = workersAiRunUrl(accountId, request.model), init = {method: 'POST', redirect: 'error', body: JSON.stringify(body)};
      if (index === at && failure === 'no-network') return {};
      if (index === at && ['endpoint', 'method', 'body', 'redirect'].includes(failure)) {
        const altered = {...init};
        if (failure === 'method') altered.method = 'GET';
        if (failure === 'body') altered.body = '{}';
        if (failure === 'redirect') altered.redirect = 'follow';
        try {await request.fetchImpl(failure === 'endpoint' ? 'https://unapproved.test' : url, altered);} catch { /* sticky guard */ }
      }
      const answer = await requestWorkersAiEditorial(request);
      if (index === at && failure === 'retry') try {await request.fetchImpl(url, init);} catch { /* sticky guard */ }
      if (index === at && failure === 'provenance') answer.requestSha256 = '0'.repeat(64);
      if (index === at && failure === 'model') answer.model = 'unapproved';
      if (index === at && failure === 'provider') answer.provider = 'unapproved';
      if (index === at && failure === 'attempt') answer.attemptCount = 2;
      if (index === at && failure === 'response-hash') answer.responseSha256 = 'invalid';
      return answer;
    }, fetchImpl: async (url, init) => {
      const index = network.length; network.push(url);
      if (index === at && failure === 'quota') return new Response(JSON.stringify({success: false,
        errors: [{code: 3036, message: 'PRIVATE_QUOTA_DETAIL'}]}), {status: 429});
      if (index === at && failure === 'transport') throw new Error('PRIVATE_TRANSPORT_DETAIL');
      const data = JSON.parse(JSON.parse(init.body).messages[1].content), payload = reply(data);
      if (index === at && failure === 'unsupported') payload.judgments[1].sourceSupported = false;
      if (index === at && failure === 'malformed') payload.extra = 'PRIVATE_INVALID_PROSE';
      if (index === at && failure === 'scope') payload.judgments[0].evidenceIds = ['S2P1'];
      if (index === at && failure === 'empty-citation') payload.judgments[0].evidenceIds = [];
      if (index === at && failure === 'missing') payload.judgments.pop();
      if (index === at && failure === 'duplicate') payload.judgments[1].claimId = payload.judgments[0].claimId;
      if (index === at && failure === 'hash') payload.reviewSha256 = '0'.repeat(64);
      const result = index === at && failure === 'truncated'
        ? {choices: [{index: 0, message: {role: 'assistant', content: JSON.stringify(payload)}, finish_reason: 'length'}]}
        : {response: JSON.stringify(payload)};
      return new Response(JSON.stringify({success: true, result, errors: []}), {headers: {'content-type': 'application/json'}});
    }});
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST_TOKEN'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_INVALID_PROSE'));
  assert.ok(!JSON.stringify(result.report).includes('PRIVATE_QUOTA_DETAIL'));
  assert.ok(!JSON.stringify(result.report).includes('PRIVATE_TRANSPORT_DETAIL'));
  const previous = network.length;
  for (const fetcher of late) await assert.rejects(fetcher('https://unapproved.test', {}), /ASSISTED_NETWORK/);
  assert.equal(network.length, previous);
  assert.ok(network.length <= 5); assert.ok(result.report.outputBudget <= 4800);
  return {result, requests, network};
}

test('first three source requests are unchanged; retained watch keeps full evidence and no question', () => {
  const p = fixture(), c = p.composition;
  for (const {field, view} of p.views.slice(0, 3)) {
    const old = watchSourceRequest(buildWatchFieldReview(c.watchPlan, c.applied, field), field);
    assert.deepEqual(view, old);
  }
  const retained = p.views[3].view;
  assert.deepEqual(retained.data.claims.map(x => x.text), c.watchPlan.baseline.units.whatToWatch);
  assert.equal(retained.data.passages.length, c.watchPlan.source.passages.length + c.watchPlan.supplementSource.passages.length);
  assert.ok(retained.data.passages.some(x => x.evidenceId === 'S2P1'));
  assert.doesNotMatch(JSON.stringify(retained), /questionAudit/);
  assert.ok(!JSON.stringify(retained).includes(c.composition.selection.question));
});
test('ingredient request checks every complete assertion AND relationship with only P5/P20', () => {
  const p = fixture(), view = p.views[4].view;
  assert.deepEqual(view.data.claims.map(x => x.text), p.assertions.map(a => `${a.assertion} ${a.relationship}`));
  assert.deepEqual(view.data.passages.map(x => x.evidenceId), ['S1P5', 'S1P20']);
  assert.ok(!JSON.stringify(view).includes(p.composition.composition.selection.question));
  const {watchPlan, choices, assertions} = inputs();
  assertions[0].relationship = 'Changed relationship requiring a different review.';
  const changed = buildAssistedWatchPlan(watchPlan, choices, assertions).views[4].view;
  assert.notEqual(changed.data.reviewSha256, view.data.reviewSha256);
  assert.equal(validateIsolatedPreservationReview(reply(view.data), changed).valid, false);
});
test('five passing model checks only await independent review; no workflow editorial approval', async () => {
  const {result, requests, network} = await run();
  assert.equal(result.report.status, 'awaiting-independent-review');
  assert.equal(result.report.method, ASSISTED_WATCH_METHOD);
  assert.equal(requests.length, 5); assert.equal(network.length, 5); assert.equal(result.report.outputBudget, 4800);
  assert.equal(result.report.writerRequests, 0); assert.equal(result.report.searchQueries, 0); assert.equal(result.report.emailSent, false);
  assert.deepEqual(result.report.fieldsPassed, ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch', 'ingredients']);
  assert.equal(result.sealed.retainedTextIdentity, true);
  assert.equal(result.sealed.independentReview, 'required-not-performed-by-this-workflow');
  assert.equal(result.sealed.previousWholeQuestionHold, 'preserved-not-overridden');
});
for (const failure of ['quota', 'transport', 'no-network', 'endpoint', 'method', 'body', 'redirect', 'retry',
  'provenance', 'model', 'provider', 'attempt', 'response-hash', 'unsupported', 'malformed', 'scope', 'empty-citation', 'missing', 'duplicate', 'hash', 'truncated']) {
  test(`${failure} holds without rewriting judgments, retrying or changing providers`, async () => {
    const {result, requests} = await run(failure);
    assert.equal(result.report.status, 'failed'); assert.equal(requests.length, 5);
    assert.equal(result.report.fieldsPassed.length, 4);
    if (['malformed', 'scope', 'empty-citation', 'missing', 'duplicate', 'hash'].includes(failure)) {
      assert.equal(result.report.code, 'ASSISTED_REVIEW_INVALID');
      assert.equal(result.sealed.calls[4].response, undefined);
    }
    if (failure === 'unsupported') {
      assert.equal(result.report.code, 'ASSISTED_SOURCE_REJECTED');
      assert.equal(result.sealed.calls[4].response.judgments[1].sourceSupported, false);
    }
  });
}
for (let at = 0; at < 4; at++) test(`retained field ${at} still holds the experiment on a negative judgment`, async () => {
  // A shape error is enough to hold for single-claim fields, but this test uses
  // a schema-valid false answer on the selected retained view explicitly.
  const plan = fixture(); let calls = 0;
  const result = await reviewAssistedWatch({plan, publicKey, accountId: '0'.repeat(32), apiToken: 'TEST', sealImpl: x => x,
    fetchImpl: async (_url, init) => {
      const data = JSON.parse(JSON.parse(init.body).messages[1].content), value = reply(data);
      if (calls++ === at) value.judgments[0].sourceSupported = false;
      return new Response(JSON.stringify({success: true, result: {response: JSON.stringify(value)}}), {headers: {'content-type': 'application/json'}});
    }});
  assert.equal(calls, at + 1); assert.equal(result.report.code, 'ASSISTED_SOURCE_REJECTED');
  assert.equal(result.report.fieldsPassed.length, at);
});
test('zero provider contact for unissued plans, invalid keys, malformed input and authority mismatch', async () => {
  const p = fixture();
  await assert.rejects(reviewAssistedWatch({plan: structuredClone(p), publicKey, aiRequestImpl: () => assert.fail('provider')}), /PLAN_INVALID/);
  await assert.rejects(reviewAssistedWatch({plan: p, publicKey: 'invalid', aiRequestImpl: () => assert.fail('provider')}), /KEY_INVALID/);
  for (const b64 of [undefined, '', 'invalid', 'AAAA', 'a'.repeat(24001)]) assert.throws(() => prepareAssistedWatchReview(b64, b64, b64));
  const env = {GITHUB_REPOSITORY: 'itworksinprod/first-fold', GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: 'itworksinprod/first-fold/.github/workflows/assisted-watch-review.yml@refs/heads/main',
    GITHUB_ACTOR: 'itworksinprod', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1'};
  assert.doesNotThrow(() => assertAssistedWatchAuthority(env));
  for (const key of Object.keys(env)) assert.throws(() => assertAssistedWatchAuthority({...env, [key]: 'other'}), /AUTHORITY_REJECTED/);
});
test('ingredient inventory is closed, bounded, dense, copied and frozen', () => {
  for (const alter of [a => a.pop(), a => delete a[1], a => a.push(a[0]), a => a[0].extra = 'x',
    a => a[1].id = a[0].id, a => a[0].assertion = '', a => a[0].relationship = 'x'.repeat(601),
    a => a[0].evidenceIds = ['S2P1'], a => a[0].relationship = ' text ', a => a[0].relationship = 'text\nnewline']) {
    const {watchPlan, choices, assertions} = inputs(); alter(assertions);
    assert.throws(() => buildAssistedWatchPlan(watchPlan, choices, assertions), /INGREDIENTS_INVALID/);
  }
  const {watchPlan, choices, assertions} = inputs(), p = buildAssistedWatchPlan(watchPlan, choices, assertions);
  assertions[0].assertion = 'Changed';
  assert.notEqual(p.assertions[0].assertion, 'Changed');
  assert.throws(() => p.assertions[0].relationship = 'Changed');
  assert.throws(() => p.views.pop());
});
test('v2 editorial checks cannot replace any positive assertion/relationship in the model input', () => {
  const {watchPlan, choices, assertions} = inputs();
  const checks = Array.from({length:7}, (_,i) => ({id:`check-${String.fromCharCode(97+i)}`,check:`Synthetic editorial obligation ${i}.`}));
  const v1=buildAssistedWatchPlan(watchPlan,choices,assertions);
  const v2=buildAssistedWatchPlan(watchPlan,choices,assertions,checks);
  assert.deepEqual(v2.views,v1.views); // New checklist cannot cause a fact/relationship to disappear.
  assert.deepEqual(v2.assertions,v1.assertions);
  checks[0].check='Changed';assert.notEqual(v2.editorialChecks[0].check,'Changed');
  assert.throws(()=>v2.editorialChecks.pop());
});
test('v2 checklist is complete, dense and bounded; missing obligations cannot be silently ignored', () => {
  for(const alter of [x=>x.pop(),x=>delete x[2],x=>x[0].extra='x',x=>x[1].id=x[0].id,
    x=>x[0].check='',x=>x[0].check='x'.repeat(601)]){
    const {watchPlan,choices,assertions}=inputs();
    const checks=Array.from({length:7},(_,i)=>({id:`check-${String.fromCharCode(97+i)}`,check:`Synthetic obligation ${i}.`}));
    alter(checks);assert.throws(()=>buildAssistedWatchPlan(watchPlan,choices,assertions,checks),/EDITORIAL_CHECKS_INVALID/);
  }
});
test('v2 all-positive model responses retain mandatory editorial checklist and still require independent review',async()=>{
  const {watchPlan,choices,assertions}=inputs();
  const checks=Array.from({length:7},(_,i)=>({id:`check-${String.fromCharCode(97+i)}`,check:`Synthetic obligation ${i}.`}));
  const plan=buildAssistedWatchPlan(watchPlan,choices,assertions,checks);
  let calls=0;
  const result=await reviewAssistedWatch({plan,publicKey,accountId:'0'.repeat(32),apiToken:'TEST',sealImpl:x=>x,
    fetchImpl:async(_url,init)=>{calls++;const data=JSON.parse(JSON.parse(init.body).messages[1].content);
      return new Response(JSON.stringify({success:true,result:{response:JSON.stringify(reply(data))}}),{headers:{'content-type':'application/json'}});}});
  assert.equal(calls,5);assert.equal(result.report.outputBudget,4800);
  assert.equal(result.report.status,'awaiting-independent-review');
  assert.equal(result.report.ingredientContract,'source-assertions-with-mandatory-editorial-checklist-v2');
  assert.deepEqual(result.sealed.editorialChecks,checks);
  assert.equal(result.sealed.independentReview,'required-not-performed-by-this-workflow');
});
test('encryption hides text and does not turn fixture success into independent approval', async () => {
  const plan = fixture();
  const result = await reviewAssistedWatch({plan, publicKey, accountId: '0'.repeat(32), apiToken: 'PRIVATE',
    aiRequestImpl: async () => {throw Object.assign(new Error('PRIVATE_ERROR_DETAIL'), {code: 'FIXTURE'});}});
  const capture = openDiagnostic(result.sealed, pair.privateKey);
  assert.equal(capture.purpose, 'assisted-watch-review-awaiting-independent-review');
  assert.equal(capture.report.code, 'FIXTURE');
  assert.ok(!JSON.stringify(result).includes('Synthetic')); assert.ok(!JSON.stringify(result).includes('PRIVATE_ERROR_DETAIL'));
  assert.ok(JSON.stringify(capture).includes('Synthetic'));
});
test('manual trusted-main workflow is read-only, credential scoped and ciphertext only', async () => {
  const w = await readFile(new URL('../.github/workflows/assisted-watch-review.yml', import.meta.url), 'utf8');
  assert.match(w, /workflow_dispatch/); assert.match(w, /github.run_attempt == 1/); assert.match(w, /timeout-minutes: 8/);
  assert.match(w, /contents: read/); assert.match(w, /persist-credentials: false/);
  assert.ok(w.indexOf('tests/assisted-watch-review.test.mjs') < w.indexOf('secrets.FIRST_FOLD_WATCH_BASELINE_B64'));
  assert.ok(w.indexOf('assisted-watch-review.mjs validate') < w.indexOf('secrets.CLOUDFLARE_AI_API_TOKEN'));
  assert.match(w, /path: \$\{\{ runner.temp \}\}\/assisted-watch.encrypted.json/); assert.match(w, /retention-days: 1/);
  assert.deepEqual([...new Set([...w.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1]))],
    ['FIRST_FOLD_WATCH_BASELINE_B64', 'FIRST_FOLD_WATCH_COMPOSITION_B64', 'FIRST_FOLD_WATCH_INGREDIENTS_B64', 'CLOUDFLARE_AI_API_TOKEN']);
  assert.doesNotMatch(w, /RESEND|OPENAI_API|TAVILY|schedule:|pull_request:|contents: write/);
});
