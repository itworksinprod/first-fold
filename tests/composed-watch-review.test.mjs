import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {watchFixture, mockQuestionAudit} from './fixtures/watch-fixture.mjs';
import {buildCompositionReview, prepareCompositionReview, assertCompositionAuthority, reviewComposedWatch} from '../scripts/automation/composed-watch-review.mjs';
import {buildWatchFieldReview, watchSourceRequest} from '../scripts/automation/experiments/watch-question.mjs';
import {requestWorkersAiEditorial, buildWorkersAiRequest, workersAiRunUrl, DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';

const pair = generateKeyPairSync('rsa', {modulusLength: 3072});
const publicKey = pair.publicKey.export({type: 'spki', format: 'der'}).toString('base64');
function fixture() {
  const {plan: watchPlan} = watchFixture();
  // Mechanics-only catalog; source entailment is supplied by mocks, not qualified.
  const labels = {measure: 'file size', task: 'compression task', requirements: 'legibility requirements', goal: 'reducing file size'};
  const choices = [{id: 'synthetic', concepts: Object.fromEntries(Object.entries(labels).map(([key, phrase]) =>
    [key, {phrase, evidenceId: 'S1P5', sourceSpan: watchPlan.data.allowedContext[0].text.slice(0, 80)}]))}];
  return buildCompositionReview(watchPlan, choices);
}

async function run(failure, at = 3) {
  const plan = fixture(), requests = [], late = [], network = [];
  const accountId = '0'.repeat(32);
  const result = await reviewComposedWatch({plan, publicKey, accountId, apiToken: 'PRIVATE_TEST_TOKEN',
    now: new Date('2026-09-29T02:00:00Z'), sealImpl: value => value,
    aiRequestImpl: async request => {
      const index = requests.length; requests.push(request); late.push(request.fetchImpl);
      const field = ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch'][index];
      const expected = watchSourceRequest(buildWatchFieldReview(plan.watchPlan, plan.applied, field), field);
      assert.deepEqual(JSON.parse(request.messages[1].content), expected.data);
      assert.equal(request.messages[0].content, `${expected.prompt}\nJSON schema: ${JSON.stringify(expected.schema)}`);
      assert.equal(request.model, index === 3 ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(request.maxTokens, index === 3 ? 2400 : 600);
      assert.equal(request.timeoutMs, index === 3 ? 90000 : 30000);
      assert.equal(request.maxAttempts, 1); assert.equal(request.temperature, 0.1);
      const {body} = buildWorkersAiRequest(request);
      const url = workersAiRunUrl(accountId, request.model), init = {method: 'POST', redirect: 'error', body: JSON.stringify(body)};
      if (index === at && failure === 'no-network') return {};
      if (index === at && ['endpoint', 'method', 'body', 'redirect'].includes(failure)) {
        const altered = {...init}; if (failure === 'method') altered.method = 'GET';
        if (failure === 'body') altered.body = '{}'; if (failure === 'redirect') altered.redirect = 'follow';
        try {await request.fetchImpl(failure === 'endpoint' ? 'https://unapproved.test' : url, altered);} catch { /* sticky */ }
      }
      const answer = await requestWorkersAiEditorial(request);
      if (index === at && failure === 'retry') try {await request.fetchImpl(url, init);} catch { /* sticky */ }
      if (index === at && failure === 'provenance') answer.requestSha256 = '0'.repeat(64);
      if (index === at && failure === 'model') answer.model = 'unapproved';
      return answer;
    }, fetchImpl: async (url, init) => {
      const index = network.length; network.push(url);
      if (index === at && failure === 'quota') return new Response(JSON.stringify({success: false, errors: [{code: 3036, message: 'PRIVATE_QUOTA_DETAIL'}]}), {status: 429});
      const data = JSON.parse(JSON.parse(init.body).messages[1].content);
      const payload = {reviewSha256: data.reviewSha256, judgments: data.claims.map(c => ({claimId: c.claimId,
        comparison: 'Synthetic mock, not a real qualification.', evidenceIds: ['S1P5'], sourceSupported: !(index === at && failure === 'unsupported')}))};
      if (index === 3) payload.questionAudit = mockQuestionAudit(data, payload.judgments.at(-1));
      if (index === at && failure === 'malformed') payload.extra = 'PRIVATE_INVALID_PROSE';
      if (index === 3 && failure === 'scope') {payload.questionAudit.premises[0].evidenceIds = ['S2P1'];}
      return new Response(JSON.stringify({success: true, result: {response: JSON.stringify(payload)}, errors: []}), {headers: {'content-type': 'application/json'}});
    }});
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST_TOKEN'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_INVALID_PROSE'));
  assert.ok(!JSON.stringify(result.report).includes('PRIVATE_QUOTA_DETAIL'));
  const previous = network.length;
  for (const fetcher of late) await assert.rejects(fetcher('https://unapproved.test', {}), /COMPOSITION_NETWORK/);
  assert.equal(network.length, previous);
  return {result, requests, network};
}

test('review-only path uses four unchanged source requests, no writer and a 4200-token ceiling', async () => {
  const {result, requests, network} = await run();
  assert.equal(result.report.status, 'draft-awaiting-manual-review');
  assert.equal(requests.length, 4); assert.equal(network.length, 4);
  assert.equal(result.report.outputBudget, 4200); assert.equal(result.report.writerRequests, 0);
  assert.equal(result.report.searchQueries, 0); assert.equal(result.report.emailSent, false);
  assert.equal(result.report.fieldsPassed.length, 4);
  assert.match(result.sealed.composition.authorship, /not-model-authored/);
  assert.equal(result.sealed.retainedTextIdentity, true);
});
for (const failure of ['quota', 'no-network', 'endpoint', 'method', 'body', 'redirect', 'retry', 'provenance', 'model', 'unsupported', 'malformed', 'scope']) {
  test(`review-only ${failure} holds without a retry, repaired payload, or alternate provider`, async () => {
    const {result, requests} = await run(failure);
    assert.equal(result.report.status, 'failed'); assert.equal(requests.length, 4);
    assert.equal(result.report.fieldsPassed.length, 3);
    if (['malformed', 'scope'].includes(failure)) assert.equal(result.report.code, 'COMPOSITION_REVIEW_INVALID');
    if (failure === 'unsupported') assert.equal(result.report.code, 'COMPOSITION_SOURCE_REJECTED');
  });
}
test('early rejection stops remaining reviews', async () => {
  const {result, requests} = await run('quota', 0);
  assert.equal(requests.length, 1); assert.equal(result.report.outputBudget, 600);
  assert.equal(result.report.status, 'failed');
});
test('unissued plans, invalid keys, missing pins and authority mismatch fail before providers', async () => {
  const plan = fixture();
  await assert.rejects(reviewComposedWatch({plan: structuredClone(plan), publicKey, aiRequestImpl: () => assert.fail('no provider')}), /PLAN_INVALID/);
  await assert.rejects(reviewComposedWatch({plan, publicKey: 'invalid', aiRequestImpl: () => assert.fail('no provider')}), /KEY_INVALID/);
  for (const b64 of [undefined, '', 'not base64', 'AAAA', 'a'.repeat(24001)]) assert.throws(() => prepareCompositionReview(b64, b64));
  const env = {GITHUB_REPOSITORY: 'itworksinprod/first-fold', GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: 'itworksinprod/first-fold/.github/workflows/composed-watch-review.yml@refs/heads/main',
    GITHUB_ACTOR: 'itworksinprod', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1'};
  assert.doesNotThrow(() => assertCompositionAuthority(env));
  for (const key of Object.keys(env)) assert.throws(() => assertCompositionAuthority({...env, [key]: 'other'}), /AUTHORITY_REJECTED/);
});
test('workflow is manual trusted-main only, tests and pins before credentials, ciphertext only', async () => {
  const w = await readFile(new URL('../.github/workflows/composed-watch-review.yml', import.meta.url), 'utf8');
  assert.match(w, /workflow_dispatch/); assert.match(w, /github.run_attempt == 1/);
  assert.match(w, /contents: read/); assert.match(w, /persist-credentials: false/);
  assert.ok(w.indexOf('tests/composed-watch-review.test.mjs') < w.indexOf('secrets.FIRST_FOLD_WATCH_BASELINE_B64'));
  assert.ok(w.indexOf('composed-watch-review.mjs validate') < w.indexOf('secrets.CLOUDFLARE_AI_API_TOKEN'));
  assert.match(w, /path: \$\{\{ runner.temp \}\}\/composed-watch.encrypted.json/);
  assert.match(w, /retention-days: 1/);
  assert.doesNotMatch(w, /RESEND|OPENAI_API|TAVILY|schedule:|pull_request:|contents: write/);
});
