import test from 'node:test';
import assert from 'node:assert/strict';
import { causalReviewCases } from '../scripts/automation/causal-review-cases.mjs';
import { claimwiseReviewCases } from '../scripts/automation/claimwise-review-cases.mjs';
import { buildClaimwiseFactReview, validateClaimwiseFactReview } from '../scripts/automation/free/claimwise-fact-review.mjs';
import { diagnoseFieldReview } from '../scripts/automation/field-review-diagnostic.mjs';
import { requestWorkersAiEditorial } from '../scripts/automation/free/workers-ai.mjs';
const original = causalReviewCases('Mock passage only.\nNot evidence for semantic qualification.');
const cases = claimwiseReviewCases(original);
const reply = (view, labels) => ({ reviewSha256: view.data.reviewSha256,
  judgments: view.data.claims.map((c, i) => ({ claimId: c.claimId, comparison: 'Mock transport check only.', evidenceIds: ['S1P1'], supported: labels[i] })) });

test('fixed manual claim decomposition preserves old statements and hides labels', () => {
  assert.equal(cases.length, 10);
  assert.equal(cases.filter(c => c.expected).length, 5);
  cases.slice(0, 8).forEach((c, i) => {
    assert.equal(c.input.text, original[i].input.text);
    assert.deepEqual(c.input.sources, original[i].input.sources);
    assert.equal(c.expected, original[i].expected);
  });
  for (const c of cases) {
    const view = buildClaimwiseFactReview(c.input);
    assert.doesNotMatch(JSON.stringify(view.data), /expected|caseId/);
    assert.equal(validateClaimwiseFactReview(reply(view, c.expectedClaims), view).supported, c.expected);
    assert.throws(() => { view.data.claims.pop(); });
  }
});

test('all claims required, exact binding and false veto cannot be bypassed', () => {
  const view = buildClaimwiseFactReview(cases[0].input);
  const good = reply(view, [true, false]);
  assert.deepEqual(validateClaimwiseFactReview(good, view), { valid: true, supported: false, claims: [true, false] });
  assert.equal(validateClaimwiseFactReview({ ...good, judgments: [...good.judgments].reverse() }, view).supported, false);
  for (const mutate of [
    v => v.judgments.pop(), v => v.judgments.push(v.judgments[0]),
    v => { v.judgments[1] = v.judgments[0]; }, v => { v.judgments[0].claimId = 'C99'; },
    v => { v.reviewSha256 = '0'.repeat(64); }, v => { v.supported = true; },
    v => { v.judgments[0].supported = 'false'; }, v => { v.judgments[0].comparison = 'x'.repeat(241); },
    v => { v.judgments[0].evidenceIds = ['S99P1']; }, v => { v.judgments[0].evidenceIds = []; },
    v => { v.judgments[0].evidenceIds = ['S1P1', 'S1P1']; },
  ]) { const bad = structuredClone(good); mutate(bad); assert.equal(validateClaimwiseFactReview(bad, view).valid, false); }
  assert.equal(validateClaimwiseFactReview(good, structuredClone(view)).valid, false);
  const changed = structuredClone(cases[0].input); changed.claims[1] += ' Changed.';
  assert.equal(validateClaimwiseFactReview(good, buildClaimwiseFactReview(changed)).valid, false);
});

for (const mode of ['correct', 'all-true', 'all-false', 'wrong-claim', 'omitted', 'quota']) {
  test(`claimwise ${mode} respects no-email budget and per-claim expected decisions`, async () => {
    let calls = 0;
    const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + '0'.repeat(32) + '/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    const result = await diagnoseFieldReview({ publicKey: 'mock', accountId: '0'.repeat(32), apiToken: 'mock',
      now: new Date('2026-09-23T03:00:00Z'), endpoint, controls: cases, claimwise: true,
      sealDiagnostic: v => v, aiRequestImpl: requestWorkersAiEditorial, fetchImpl: async (url, init) => {
        assert.equal(url, endpoint); assert.equal(init.redirect, 'error');
        const c = cases[calls++], view = buildClaimwiseFactReview(c.input), body = JSON.parse(init.body);
        assert.equal(body.max_tokens, 600);
        assert.deepEqual(JSON.parse(body.messages[1].content), view.data);
        if (mode === 'quota') return new Response('{"errors":[]}', { status: 429 });
        const labels = mode === 'all-true' ? c.expectedClaims.map(() => true) : mode === 'all-false' ? c.expectedClaims.map(() => false) : [...c.expectedClaims];
        if (mode === 'wrong-claim' && calls === 1) labels.reverse(); // Same overall false, wrong claim.
        const payload = reply(view, labels);
        if (mode === 'omitted') payload.judgments.pop();
        return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload) }, errors: [] }),
          { headers: { 'content-type': 'application/json' } });
      } });
    assert.equal(result.report.status, mode === 'correct' ? 'reviewer-controls-passed' : 'failed');
    assert.equal(calls, ['omitted', 'quota'].includes(mode) ? 1 : 10);
    assert.equal(result.report.outputBudget, calls * 600);
    assert.equal(result.report.networkRequests, calls);
    assert.equal(result.report.emailSent, false);
    assert.equal(result.report.searchQueries, 0);
  });
}
