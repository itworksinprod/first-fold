import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { diagnosePreservationReview } from '../scripts/automation/preservation-review-diagnostic.mjs';
import { PRESERVATION_REVIEW_CONTROLS, PRESERVATION_CASESET_SHA256 } from '../scripts/automation/preservation-review-cases.mjs';
import { buildClaimwiseFactReview } from '../scripts/automation/free/claimwise-fact-review.mjs';
import { buildWorkersAiRequest, requestWorkersAiEditorial, DEFAULT_CLOUDFLARE_AI_MODEL } from '../scripts/automation/free/workers-ai.mjs';
import { diagnoseOneWriter, openDiagnostic } from '../scripts/automation/private-writer-diagnostic.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const expected = [true, false, false, true, false, false];
const suffix = 'Keep each comparison under 160 characters. Select only 1–3 decisive evidenceIds for supported claims. Do not list every passage.';
const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
const base = { publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  accountId: '0'.repeat(32), apiToken: 'private-fixture-token-must-not-leak', now: new Date('2026-09-24T04:00:00Z') };
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${base.accountId}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`;
const payloadFor = (data, index, supported = expected[index]) => ({ reviewSha256: data.reviewSha256,
  judgments: data.claims.map(claim => ({ claimId: claim.claimId,
    comparison: `Synthetic plumbing judgment ${index + 1}; not semantic qualification.`,
    evidenceIds: supported ? ['S1P1'] : [], supported })) });

async function runFixture({ answers = expected, corruptPayload, corruptAt = 0, status,
  mutateResult, attack, swallow = false, integration = false } = {}) {
  const modelCalls = [], networkCalls = [];
  const options = { ...base, endpoint, sealDiagnostic: value => value,
    // The runner must ignore caller attempts to expand its fixed experiment.
    controls: [], model: 'unapproved-model', maxAttempts: 3, maxTokens: 16000, prompt: 'UNAPPROVED_PROMPT',
    researchImpl: () => assert.fail('Reviewer controls must not perform research'),
    aiRequestImpl: async request => {
      const index = modelCalls.length;
      modelCalls.push(request);
      const { body } = buildWorkersAiRequest(request);
      const init = { method: 'POST', redirect: 'error', body: JSON.stringify(body) };
      if (attack === 'skip') {
        return { editorialPayload: payloadFor(JSON.parse(request.messages[1].content), index),
          provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, attemptCount: 1,
          responseSha256: 'b'.repeat(64), requestSha256: hash(JSON.stringify({ provider: 'cloudflare-workers-ai',
            model: DEFAULT_CLOUDFLARE_AI_MODEL, body })) };
      }
      if (attack && attack !== 'repeat') {
        const url = attack === 'endpoint' ? 'https://unapproved.example/send' : endpoint;
        const invalid = { ...init, ...(attack === 'body' ? { body: '{}' } : {}),
          ...(attack === 'method' ? { method: 'GET' } : {}), ...(attack === 'redirect' ? { redirect: 'follow' } : {}) };
        if (swallow) {
          try { await request.fetchImpl(url, invalid); } catch { /* Simulate a noncompliant adapter. */ }
        } else await request.fetchImpl(url, invalid);
      }
      const response = await requestWorkersAiEditorial(request);
      if (attack === 'repeat') {
        if (swallow) {
          try { await request.fetchImpl(endpoint, init); } catch { /* Guard state must survive this catch. */ }
        } else await request.fetchImpl(endpoint, init);
      }
      return mutateResult ? mutateResult(response) : response;
    },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body), data = JSON.parse(body.messages[1].content);
      const index = networkCalls.length;
      networkCalls.push({ url, init, body, data });
      if (status === 'throw') throw new Error(`PRIVATE_PROVIDER_DETAIL ${base.apiToken}`);
      if (status) return new Response(JSON.stringify({ success: false,
        errors: [{ code: status === 429 ? 3036 : 9999, message: `PRIVATE_PROVIDER_DETAIL ${base.apiToken}` }] }),
      { status, headers: { 'content-type': 'application/json' } });
      const payload = payloadFor(data, index, answers[index]);
      if (corruptPayload && index === corruptAt) corruptPayload(payload);
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload),
        reasoning_content: 'PRIVATE_REASONING_MUST_NOT_BE_CAPTURED' }, errors: [] }),
      { headers: { 'content-type': 'application/json' } });
    } };
  const result = integration
    ? await diagnoseOneWriter({ ...options, mode: 'preservation-review-controls' })
    : await diagnosePreservationReview(options);
  const capture = integration ? openDiagnostic(result.sealed, pair.privateKey) : result.sealed;
  for (const [index, request] of modelCalls.entries()) {
    const view = buildClaimwiseFactReview(PRESERVATION_REVIEW_CONTROLS[index].input);
    const prompt = `${view.prompt}\n${suffix}\nJSON schema: ${JSON.stringify(view.schema)}`;
    assert.equal(request.model, DEFAULT_CLOUDFLARE_AI_MODEL);
    assert.equal(request.maxTokens, 600);
    assert.equal(request.maxAttempts, 1);
    assert.equal(request.temperature, 0.1);
    assert.equal(request.responseFormat, 'json_object');
    assert.equal(request.timeoutMs, 90000);
    assert.equal(request.maxRequestBytes, 70000);
    assert.equal(request.maxResponseBytes, 100000);
    assert.deepEqual(request.schema, view.schema);
    assert.deepEqual(request.messages, [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(view.data) }]);
    assert.equal(hash(view.prompt), '04b918fe7e676bfbbab9e77cc10a343e1e7645d23c64b572a37dfa653e3c612a');
    assert.equal(view.data.policy, 'explicit-claimwise-preservation-v3');
    const serialized = JSON.stringify(request.messages);
    assert.doesNotMatch(serialized, /"(?:expected|rationale|caseId)"|PR0[1-6]|UNAPPROVED_PROMPT|Synthetic plumbing judgment/);
    for (const control of PRESERVATION_REVIEW_CONTROLS) assert.ok(!serialized.includes(control.rationale));
    assert.equal(capture.calls[index].prompt, prompt);
    assert.equal(capture.calls[index].promptSha256, hash(prompt));
  }
  for (const call of networkCalls) {
    assert.equal(call.url, endpoint);
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.redirect, 'error');
    assert.equal(call.body.max_tokens, 600);
    assert.equal(call.body.temperature, 0.1);
    assert.equal(call.body.response_format.type, 'json_object');
  }
  assert.equal(result.report.modelRequests, modelCalls.length);
  assert.equal(result.report.networkRequests, networkCalls.length);
  assert.equal(result.report.outputBudget, modelCalls.length * 600);
  assert.ok(modelCalls.length <= 6 && networkCalls.length <= 6);
  assert.equal(result.report.emailSent, false);
  assert.equal(result.report.searchQueries, 0);
  assert.doesNotMatch(JSON.stringify({ report: result.report, capture }), /PRIVATE_PROVIDER_DETAIL|PRIVATE_REASONING_MUST_NOT_BE_CAPTURED|private-fixture-token-must-not-leak/);
  return { ...result, capture, modelCalls, networkCalls };
}

test('six fixed frozen preservation controls retain two positives, four negatives and the actual reviewer suffix', async () => {
  const visit = value => {
    if (value && typeof value === 'object') {
      assert.equal(Object.isFrozen(value), true);
      Object.values(value).forEach(visit);
    }
  };
  visit(PRESERVATION_REVIEW_CONTROLS);
  assert.equal(PRESERVATION_REVIEW_CONTROLS.length, 6);
  assert.deepEqual(PRESERVATION_REVIEW_CONTROLS.map(control => control.expected), expected);
  assert.equal(PRESERVATION_CASESET_SHA256, 'd17df1cf570ba50385b56b837c30d566c98ee46777e44cad70ac30169f4e70cb');
  assert.equal(hash(JSON.stringify(PRESERVATION_REVIEW_CONTROLS)), PRESERVATION_CASESET_SHA256);
  const views = PRESERVATION_REVIEW_CONTROLS.map(control => buildClaimwiseFactReview(control.input));
  assert.equal(new Set(views.map(view => view.data.reviewSha256)).size, 6);
  assert.deepEqual(views[0].data.passages, views[1].data.passages);
  assert.deepEqual(views[0].data.previousClaims, views[1].data.previousClaims);
  assert.notDeepEqual(views[0].data.claims, views[1].data.claims);
  const factSummary = await readFile(new URL('../scripts/automation/fact-summary-diagnostic.mjs', import.meta.url), 'utf8');
  assert.ok(factSummary.includes('request(`${view.prompt}\\n' + suffix + '`, view.data, view.schema, claimwise ? 600 : 400)'));
});

test('correct mocks pass all six exact reviews while valid misclassifications still run all six', async () => {
  for (const [answers, correctCases] of [[expected, 6], [Array(6).fill(true), 2],
    [Array(6).fill(false), 4], [expected.map((value, index) => index === 2 ? !value : value), 5]]) {
    const { report, capture, networkCalls } = await runFixture({ answers });
    assert.equal(report.status, correctCases === 6 ? 'reviewer-controls-passed' : 'failed');
    assert.equal(report.code, correctCases === 6 ? null : 'PRESERVATION_REVIEW_MISCLASSIFIED');
    assert.equal(report.completedCases, 6);
    assert.equal(report.correctCases, correctCases);
    assert.equal(report.modelRequests, 6);
    assert.equal(report.outputBudget, 3600);
    assert.deepEqual(capture.cases, PRESERVATION_REVIEW_CONTROLS);
    assert.deepEqual(capture.results.map(result => result.supported), answers);
    assert.equal(new Set(capture.calls.map(call => call.requestSha256)).size, 6);
    assert.deepEqual(capture.calls.map(call => call.request), networkCalls.map(call => call.data));
    for (const [index, call] of capture.calls.entries()) {
      assert.equal(call.requestSha256, hash(JSON.stringify({ provider: 'cloudflare-workers-ai',
        model: DEFAULT_CLOUDFLARE_AI_MODEL, body: networkCalls[index].body })));
      assert.equal(call.attemptCount, 1);
      assert.match(call.responseSha256, /^[a-f0-9]{64}$/);
    }
  }
});

test('malformed bindings, judgments and unsupported positive evidence stop without later cases', async () => {
  for (const corruptPayload of [
    payload => { payload.reviewSha256 = '0'.repeat(64); },
    payload => { payload.judgments[0].claimId = 'C99'; },
    payload => { payload.judgments = []; },
    payload => { payload.judgments.push({ ...payload.judgments[0] }); },
    payload => { payload.judgments[0].supported = 'true'; },
    payload => { payload.judgments[0].evidenceIds = []; },
    payload => { payload.judgments[0].evidenceIds = ['S1P99']; },
    payload => { payload.judgments[0].comparison = ''; },
    payload => { payload.extra = true; },
  ]) {
    const { report, capture } = await runFixture({ corruptPayload });
    assert.equal(report.code, 'PRESERVATION_REVIEW_MALFORMED');
    assert.equal(report.status, 'failed');
    assert.equal(report.modelRequests, 1);
    assert.equal(report.completedCases, 0);
    assert.equal(capture.results.length, 1);
    assert.equal(capture.results[0].valid, false);
  }
  const late = await runFixture({ corruptAt: 3, corruptPayload: payload => { payload.reviewSha256 = '0'.repeat(64); } });
  assert.equal(late.report.code, 'PRESERVATION_REVIEW_MALFORMED');
  assert.equal(late.report.modelRequests, 4);
  assert.equal(late.report.completedCases, 3);
});

test('provider errors and quota stop after one bounded request without retries or raw details', async () => {
  for (const status of [403, 429, 503, 'throw']) {
    const { report, capture } = await runFixture({ status });
    assert.equal(report.code, 'PRESERVATION_REVIEW_PROVIDER_FAILED');
    assert.equal(report.modelRequests, 1);
    assert.equal(report.networkRequests, 1);
    assert.equal(report.completedCases, 0);
    assert.equal(capture.results.length, 0);
    assert.equal(report.failures.length, 1);
    if (typeof status === 'number') assert.equal(report.failures[0].httpStatus, String(status));
  }
});

test('wrong provider, model, request hash, response hash and attempt provenance cannot pass', async () => {
  for (const patch of [{ provider: 'other-provider' }, { model: 'other-model' },
    { requestSha256: '0'.repeat(64) }, { responseSha256: 'invalid' }, { attemptCount: 2 }]) {
    const { report, capture } = await runFixture({ mutateResult: result => ({ ...result, ...patch }) });
    assert.equal(report.code, 'PRESERVATION_REVIEW_PROVENANCE');
    assert.equal(report.modelRequests, 1);
    assert.equal(report.networkRequests, 1);
    assert.equal(capture.results.length, 0);
    assert.equal(capture.calls[0].response, undefined);
  }
});

test('network guard denies altered or repeated requests even when the adapter swallows rejection', async () => {
  for (const attack of ['endpoint', 'body', 'method', 'redirect', 'repeat']) {
    for (const swallow of [false, true]) {
      const { report, capture } = await runFixture({ attack, swallow });
      assert.equal(report.code, 'PRESERVATION_REVIEW_NETWORK');
      assert.equal(report.modelRequests, 1);
      assert.equal(report.networkRequests, attack === 'repeat' ? 1 : 0);
      assert.equal(capture.results.length, 0);
    }
  }
  const skipped = await runFixture({ attack: 'skip' });
  assert.equal(skipped.report.code, 'PRESERVATION_REVIEW_NETWORK');
  assert.equal(skipped.report.networkRequests, 0);
  const saved = skipped.modelCalls[0];
  const { body } = buildWorkersAiRequest(saved);
  await assert.rejects(saved.fetchImpl(endpoint, { method: 'POST', redirect: 'error', body: JSON.stringify(body) }),
    error => error.code === 'PRESERVATION_REVIEW_NETWORK');
  assert.equal(skipped.networkCalls.length, 0, 'Closed callbacks cannot issue unreported requests after the diagnostic returns');
});

test('private writer routing performs only fixed controls and encrypts every request and outcome', async () => {
  const { report, sealed, capture } = await runFixture({ integration: true });
  assert.equal(report.mode, 'preservation-review-controls-not-an-edition');
  assert.equal(report.status, 'reviewer-controls-passed');
  assert.equal(capture.calls.length, 6);
  assert.deepEqual(capture.cases, PRESERVATION_REVIEW_CONTROLS);
  const visible = JSON.stringify({ report, sealed });
  for (const control of PRESERVATION_REVIEW_CONTROLS) {
    for (const privateText of [control.rationale, control.input.text, control.input.previousClaims[0],
      control.input.sources[0].passages[0].text]) assert.ok(!visible.includes(privateText));
  }
  assert.doesNotMatch(visible, /Synthetic plumbing judgment|previousClaims|private-fixture-token-must-not-leak/);
});
