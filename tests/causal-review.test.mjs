import test from 'node:test';
import assert from 'node:assert/strict';
import { causalReviewCases } from '../scripts/automation/causal-review-cases.mjs';
import { buildFieldFactReview, validateFieldFactReview } from '../scripts/automation/free/field-fact-review.mjs';
import { diagnoseFieldReview } from '../scripts/automation/field-review-diagnostic.mjs';
import { requestWorkersAiEditorial } from '../scripts/automation/free/workers-ai.mjs';

// Mock responses test transport and scoring, never model reasoning quality.
const cases = causalReviewCases('Synthetic passage one.\nSynthetic passage two.');
test('causal controls balance outcomes, retain identical context and bind the opt-in policy', () => {
  assert.equal(cases.length, 8);
  assert.equal(cases.filter(c => c.expected).length, 4);
  for (const control of cases) {
    const baseline = buildFieldFactReview(control.input);
    const strict = buildFieldFactReview(control.input, { strictCausality: true });
    assert.equal(Object.hasOwn(baseline.data, 'policy'), false);
    assert.equal(strict.data.policy, 'clause-complete-causal-review-v1');
    assert.notEqual(strict.data.reviewSha256, baseline.data.reviewSha256);
    assert.doesNotMatch(JSON.stringify(strict.data), /"expected"|"caseId"/);
    assert.match(strict.prompt, /every clause separately/);
    assert.doesNotMatch(strict.prompt, /proportionate conditional implication/);
    assert.equal(validateFieldFactReview({ reviewSha256: baseline.data.reviewSha256,
      comparison: 'Mock.', evidenceIds: ['S1P1'], supported: true }, strict).valid, false);
  }
  for (const control of cases.slice(1, 6)) assert.deepEqual(control.input.sources, cases[0].input.sources);
  assert.deepEqual(cases[6].input.sources, cases[7].input.sources);
  assert.throws(() => buildFieldFactReview(cases[0].input, { strictCausality: 'true' }));
});

for (const mode of ['correct', 'all-true', 'all-false', 'wrong-hash', 'malformed', 'quota']) {
  test(`causal diagnostic ${mode} is bounded and cannot send email`, async () => {
    let calls = 0;
    const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + '0'.repeat(32) + '/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    const result = await diagnoseFieldReview({ publicKey: 'mock', accountId: '0'.repeat(32), apiToken: 'synthetic-only',
      now: new Date('2026-09-23T03:00:00Z'), endpoint, controls: cases, strictCausality: true,
      sealDiagnostic: value => value, aiRequestImpl: requestWorkersAiEditorial,
      fetchImpl: async (url, init) => {
        assert.equal(url, endpoint);
        const control = cases[calls++];
        const view = buildFieldFactReview(control.input, { strictCausality: true });
        const body = JSON.parse(init.body);
        assert.equal(body.max_tokens, 400);
        assert.equal(init.redirect, 'error');
        assert.deepEqual(JSON.parse(body.messages[1].content), view.data);
        if (mode === 'quota') return new Response('{"errors":[]}', { status: 429 });
        const payload = { reviewSha256: mode === 'wrong-hash' ? '0'.repeat(64) : view.data.reviewSha256,
          comparison: 'Synthetic mock only.', evidenceIds: ['S1P1'],
          supported: mode === 'all-true' ? true : mode === 'all-false' ? false : control.expected };
        if (mode === 'malformed') payload.extra = true;
        return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload) }, errors: [] }),
          { headers: { 'content-type': 'application/json' } });
      } });
    assert.equal(result.report.status, mode === 'correct' ? 'reviewer-controls-passed' : 'failed');
    assert.equal(calls, ['wrong-hash', 'malformed', 'quota'].includes(mode) ? 1 : 8);
    assert.equal(result.report.networkRequests, calls);
    assert.equal(result.report.modelRequests, calls);
    assert.equal(result.report.outputBudget, calls * 400);
    assert.equal(result.report.emailSent, false);
    assert.equal(result.report.searchQueries, 0);
    assert.equal(result.sealed.calls.length, calls);
  });
}
