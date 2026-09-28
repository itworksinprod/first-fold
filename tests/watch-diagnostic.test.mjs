import test from 'node:test';
import assert from 'node:assert/strict';
import {watchFixture} from './fixtures/watch-fixture.mjs';
import {diagnoseWatch} from '../scripts/automation/watch-diagnostic.mjs';
import {requestWorkersAiEditorial, buildWorkersAiRequest, workersAiRunUrl,
  FREE_REASONING_WRITER_MODEL, DEFAULT_CLOUDFLARE_AI_MODEL} from '../scripts/automation/free/workers-ai.mjs';

async function run({failure, at = 0, changeProposal} = {}) {
  const {plan, proposal} = watchFixture(), requests = [], network = [];
  if (changeProposal) changeProposal(proposal);
  const accountId = '0'.repeat(32);
  const result = await diagnoseWatch({plan, publicKey: 'synthetic', accountId, apiToken: 'PRIVATE_TEST_TOKEN',
    now: new Date('2026-09-27T18:00:00Z'), sealDiagnostic: value => value,
    aiRequestImpl: async request => {
      const index = requests.length; requests.push(request);
      assert.equal(request.model, index === 0 ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(request.maxTokens, index === 0 ? 2400 : 600);
      assert.equal(request.maxAttempts, 1); assert.equal(request.temperature, 0.1);
      const {body} = buildWorkersAiRequest(request), init = {method: 'POST', redirect: 'error', body: JSON.stringify(body)};
      if (failure === 'no-network' && index === at) return {};
      if (failure === 'wrong-endpoint' && index === at) {
        try { await request.fetchImpl('https://not-approved.test/', init); } catch { /* sticky denial */ }
      }
      const answer = await requestWorkersAiEditorial(request);
      if (index === at && failure === 'retry') {
        try { await request.fetchImpl(workersAiRunUrl(accountId, request.model), init); } catch { /* sticky denial */ }
      }
      if (index === at && failure === 'provenance') answer.requestSha256 = '0'.repeat(64);
      if (index === at && failure === 'model') answer.model = 'unapproved';
      return answer;
    }, fetchImpl: async (url, init) => {
      const index = requests.length - 1, request = requests[index];
      assert.equal(url, workersAiRunUrl(accountId, request.model));
      network.push(url);
      const data = JSON.parse(JSON.parse(init.body).messages[1].content);
      if (index === at && failure === 'quota') return new Response(JSON.stringify({success: false,
        errors: [{code: 3036, message: 'PRIVATE_QUOTA_DETAIL'}]}), {status: 429});
      const payload = index === 0 ? proposal : {reviewSha256: data.reviewSha256,
        judgments: data.claims.map((claim, i) => ({claimId: claim.claimId, comparison: 'Synthetic mock judgment.',
          evidenceIds: index === 4 && i === data.claims.length - 1 && failure === 'question-unsupported' ? [] :
            [index === 4 && i === data.claims.length - 1 ? failure === 'scope' ? 'S1P6' : 'S1P5' : 'S1P1'],
          sourceSupported: !(index === at && failure === 'unsupported') &&
            !(index === 4 && i === data.claims.length - 1 && failure === 'question-unsupported')}))};
      if (index === at && failure === 'malformed-review') payload.extra = 'PRIVATE_UNEXPECTED_RESPONSE';
      return new Response(JSON.stringify({success: true, result: {response: JSON.stringify(payload)}, errors: []}),
        {headers: {'content-type': 'application/json'}});
    }});
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST_TOKEN'));
  assert.ok(!JSON.stringify(result.report).includes('PRIVATE_QUOTA_DETAIL'));
  assert.ok(network.length <= 5);
  return {result, requests, network};
}

test('five single-attempt calls produce a manual-review candidate, not editorial approval or delivery', async () => {
  const {result, requests, network} = await run();
  assert.equal(result.report.status, 'draft-awaiting-manual-review');
  assert.equal(result.report.outputBudget, 4800); assert.equal(requests.length, 5); assert.equal(network.length, 5);
  assert.equal(result.report.searchQueries, 0); assert.equal(result.report.emailSent, false);
  assert.deepEqual(result.report.fieldsPassed, ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch']);
  assert.deepEqual(result.sealed.calls.slice(1).map(c => c.field), result.report.fieldsPassed);
  assert.equal(result.sealed.retainedTextIdentity, true);
  assert.equal(result.sealed.reviewUnits.whatToWatch.length, 2);
  assert.match(result.sealed.additionScope.status, /manual/);
  assert.equal(result.sealed.additionScope.type, 'editorial-question-not-a-reported-plan-or-prediction');
});

for (const failure of ['quota', 'wrong-endpoint', 'retry', 'no-network', 'provenance', 'model']) {
  test(`${failure} stops the experiment without fallback or another provider attempt`, async () => {
    const {result, requests} = await run({failure});
    assert.equal(result.report.status, 'failed'); assert.equal(requests.length, 1);
    assert.equal(result.sealed.draft, undefined);
  });
}
for (const failure of ['unsupported', 'malformed-review', 'scope', 'question-unsupported']) {
  test(`${failure} review holds without sending or accepting an addition`, async () => {
    const {result, requests} = await run({failure, at: 4});
    assert.equal(result.report.status, 'failed'); assert.equal(requests.length, 5);
    assert.ok(!result.report.fieldsPassed.includes('whatToWatch'));
    if (failure === 'scope') {
      const review = result.sealed.fieldReviews.find(r => r.field === 'whatToWatch');
      assert.equal(review.source.verdict.supported, true);
      assert.equal(review.additionCitationScope.passed, false);
      assert.equal(review.verdict.supported, false);
    }
    if (failure === 'malformed-review') assert.ok(!JSON.stringify(result).includes('PRIVATE_UNEXPECTED_RESPONSE'));
    if (failure === 'question-unsupported') {
      const verdict = result.sealed.fieldReviews.at(-1).verdict;
      assert.equal(verdict.valid, true);
      assert.deepEqual(verdict.claims.map(c => c.sourceSupported), [true, false]);
    }
  });
}
test('abstention and invalid edit proposals stop before source calls', async () => {
  for (const changeProposal of [p => {p.question = 'PRIVATE_UNEXPECTED_RESPONSE';}, p => {p.decision = 'abstain'; p.question = '';},
    p => {p.question = 'Can a synthetic method guarantee a safe outcome for users?';},
    p => {p.question = 'Will upcoming studies compare the results?';},
    p => {p.headline = 'PRIVATE_UNEXPECTED_RESPONSE';}]) {
    const {result, requests} = await run({changeProposal});
    assert.equal(result.report.status, 'failed'); assert.equal(requests.length, 1);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_UNEXPECTED_RESPONSE'));
  }
});

test('a bound plaintext question stopped only by the premise guard remains encrypted-only diagnostic evidence', async () => {
  const text = 'Will upcoming studies compare the results?';
  const {result, requests} = await run({changeProposal: p => {p.question = text;}});
  assert.equal(requests.length, 1); assert.equal(result.report.code, 'WATCH_UNSUPPORTED_PRESUPPOSITION');
  assert.equal(result.sealed.draft, undefined); assert.equal(result.report.emailSent, false);
  assert.deepEqual(result.sealed.rejectedQuestion, {text, code: 'WATCH_UNSUPPORTED_PRESUPPOSITION', accepted: false});
  assert.ok(!JSON.stringify(result.report).includes(text));
  assert.equal(result.sealed.calls[0].responseRejected, true);
  assert.equal(result.sealed.calls[0].response, undefined);
});

test('malformed or misbound questions never enter rejected-question capture', async () => {
  for (const changeProposal of [p => {p.question = 'Will upcoming <script> tests work?';},
    p => {p.baselineSha256 = '0'.repeat(64); p.question = 'Will upcoming tests work?';},
    p => {p.extra = 'untrusted'; p.question = 'Will upcoming tests work?';},
    p => {p.question = 'Will upcoming ' + 'tests '.repeat(40) + 'work?';}]) {
    const {result} = await run({changeProposal});
    assert.equal(result.sealed.rejectedQuestion, undefined);
    assert.equal(result.sealed.calls[0].responseRejectedBeforeCapture, true);
    assert.equal(result.sealed.calls[0].response, undefined);
  }
});
