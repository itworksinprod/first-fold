import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { diagnoseIsolatedPreservation } from '../scripts/automation/isolated-preservation-diagnostic.mjs';
import { buildIsolatedPreservationReview } from '../scripts/automation/free/isolated-preservation-review.mjs';
import { PRESERVATION_REVIEW_CONTROLS, PRESERVATION_CASESET_SHA256 } from '../scripts/automation/preservation-review-cases.mjs';
import { PRESERVATION_HOLDOUT_CONTROLS, PRESERVATION_HOLDOUT_CASESET_SHA256 } from '../scripts/automation/preservation-holdout-cases.mjs';
import { buildWorkersAiRequest, requestWorkersAiEditorial, DEFAULT_CLOUDFLARE_AI_MODEL } from '../scripts/automation/free/workers-ai.mjs';
import { diagnoseOneWriter, openDiagnostic, resolvePrivateWriterDiagnosticMode } from '../scripts/automation/private-writer-diagnostic.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const dimensions = ['source', 'meaning'];
const keyFor = dimension => dimension === 'source' ? 'sourceSupported' : 'meaningPreserved';
const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
const base = { publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  accountId: '0'.repeat(32), apiToken: 'private-isolated-fixture-token', now: new Date('2026-09-24T04:00:00Z') };
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${base.accountId}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`;
const payloadFor = (data, dimension, supported, index) => ({ reviewSha256: data.reviewSha256,
  judgments: data.claims.map(claim => ({ claimId: claim.claimId,
    comparison: `PRIVATE_ISOLATED_REPLY_${index}: synthetic plumbing only, not semantic qualification.`,
    evidenceIds: supported && dimension === 'source' ? ['S1P1'] : [], [keyFor(dimension)]: supported })) });

async function runFixture({ holdout = false, sources, meanings, corrupt, corruptAt = 0,
  mutateResult, mutateAt = 0, status, statusAt = 0, attack, integration = false } = {}) {
  const controls = holdout ? PRESERVATION_HOLDOUT_CONTROLS : PRESERVATION_REVIEW_CONTROLS;
  sources ??= controls.map(control => holdout ? control.expectedSourceSupported : true);
  meanings ??= controls.map(control => holdout ? control.expectedMeaningPreserved : control.expected);
  const modelCalls = [], networkCalls = [];
  const options = { ...base, endpoint, holdout, sealDiagnostic: value => value,
    // The caller cannot replace fixed cases, inject messages or raise the budget.
    controls: [], cases: [], prompt: 'UNAPPROVED_ISOLATED_PROMPT', model: 'unapproved-model',
    maxTokens: 16000, maxAttempts: 5, timeoutMs: 300000,
    researchImpl: () => assert.fail('Isolated controls must not perform research'),
    aiRequestImpl: async request => {
      const index = modelCalls.length;
      modelCalls.push(request);
      const { body } = buildWorkersAiRequest(request);
      const init = { method: 'POST', redirect: 'error', body: JSON.stringify(body) };
      if (attack === 'skip') return {
        editorialPayload: payloadFor(JSON.parse(request.messages[1].content), 'source', true, index),
        provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, attemptCount: 1,
        responseSha256: 'b'.repeat(64), requestSha256: hash(JSON.stringify({ provider: 'cloudflare-workers-ai',
          model: DEFAULT_CLOUDFLARE_AI_MODEL, body })) };
      if (attack && attack !== 'repeat') {
        try {
          await request.fetchImpl(attack === 'endpoint' ? 'https://unapproved.example/' : endpoint,
            { ...init, ...(attack === 'body' ? { body: '{}' } : {}),
              ...(attack === 'method' ? { method: 'GET' } : {}),
              ...(attack === 'redirect' ? { redirect: 'follow' } : {}) });
        } catch { /* A swallowed denial must still stop the allowed request. */ }
      }
      const response = await requestWorkersAiEditorial(request);
      if (attack === 'repeat') {
        try { await request.fetchImpl(endpoint, init); } catch { /* Denial must remain terminal. */ }
      }
      return mutateResult && index === mutateAt ? mutateResult(response) : response;
    },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body), data = JSON.parse(body.messages[1].content);
      const index = networkCalls.length, caseIndex = Math.floor(index / 2), dimension = dimensions[index % 2];
      networkCalls.push({ url, init, body, data });
      if (status && index === statusAt) {
        if (status === 'throw') throw new Error(`PRIVATE_ISOLATED_PROVIDER_DETAIL ${base.apiToken}`);
        return new Response(JSON.stringify({ success: false, errors: [{ code: status === 429 ? 3036 : 9999,
          message: `PRIVATE_ISOLATED_PROVIDER_DETAIL ${base.apiToken}` }] }),
        { status, headers: { 'content-type': 'application/json' } });
      }
      const payload = payloadFor(data, dimension, (dimension === 'source' ? sources : meanings)[caseIndex], index);
      if (corrupt && index === corruptAt) corrupt(payload);
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload),
        reasoning_content: 'PRIVATE_ISOLATED_REASONING' }, errors: [] }),
      { headers: { 'content-type': 'application/json' } });
    } };
  const result = integration
    ? await diagnoseOneWriter({ ...options, mode: `isolated-preservation-${holdout ? 'holdouts' : 'controls'}` })
    : await diagnoseIsolatedPreservation(options);
  const capture = integration ? openDiagnostic(result.sealed, pair.privateKey) : result.sealed;
  for (const [index, request] of modelCalls.entries()) {
    const control = controls[Math.floor(index / 2)], dimension = dimensions[index % 2];
    const view = buildIsolatedPreservationReview(control.input, dimension);
    const prompt = `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
    assert.deepEqual(request.messages, [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(view.data) }]);
    assert.deepEqual(request.schema, view.schema);
    assert.equal(request.model, DEFAULT_CLOUDFLARE_AI_MODEL);
    assert.equal(request.maxTokens, 600);
    assert.equal(request.maxAttempts, 1);
    assert.equal(request.temperature, 0.1);
    assert.equal(request.responseFormat, 'json_object');
    assert.equal(request.timeoutMs, 30000);
    assert.equal(request.maxRequestBytes, 70000);
    assert.equal(request.maxResponseBytes, 100000);
    assert.equal(capture.calls[index].dimension, dimension);
    assert.equal(capture.calls[index].promptSha256, hash(prompt));
    const data = JSON.parse(request.messages[1].content);
    assert.equal(Object.hasOwn(data, 'previousClaims'), dimension === 'meaning');
    assert.deepEqual(Object.keys(data).sort(), ['claims', 'passages', 'policy', 'reviewSha256', 'statement',
      ...(dimension === 'meaning' ? ['previousClaims'] : [])].sort());
    assert.deepEqual(request.schema.properties.judgments.items.required.slice().sort(),
      ['claimId', 'comparison', 'evidenceIds', keyFor(dimension)].sort());
    const serialized = JSON.stringify(request.messages);
    assert.doesNotMatch(serialized, /PR0[1-6]|PH0[1-4]|"(?:expected|rationale|caseId)"|expectedSourceSupported|expectedMeaningPreserved|PRIVATE_ISOLATED_REPLY_|UNAPPROVED_ISOLATED_PROMPT/);
    for (const item of [...PRESERVATION_REVIEW_CONTROLS, ...PRESERVATION_HOLDOUT_CONTROLS]) {
      assert.ok(!serialized.includes(item.rationale));
    }
  }
  for (const [index, call] of networkCalls.entries()) {
    assert.equal(call.url, endpoint);
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.redirect, 'error');
    assert.equal(call.body.max_tokens, 600);
    assert.equal(call.body.response_format.type, 'json_object');
    assert.deepEqual(capture.calls[index].request, call.data);
    assert.equal(capture.calls[index].requestSha256, hash(JSON.stringify({ provider: 'cloudflare-workers-ai',
      model: DEFAULT_CLOUDFLARE_AI_MODEL, body: call.body })));
    assert.equal(capture.calls[index].requestBytes, Buffer.byteLength(call.init.body));
  }
  assert.equal(result.report.modelRequests, modelCalls.length);
  assert.equal(result.report.networkRequests, networkCalls.length);
  assert.equal(result.report.outputBudget, modelCalls.length * 600);
  assert.ok(modelCalls.length <= controls.length * 2 && networkCalls.length <= controls.length * 2);
  assert.equal(result.report.emailSent, false);
  assert.equal(result.report.searchQueries, 0);
  assert.doesNotMatch(JSON.stringify({ report: result.report, capture }),
    /PRIVATE_ISOLATED_PROVIDER_DETAIL|PRIVATE_ISOLATED_REASONING|private-isolated-fixture-token/);
  return { ...result, capture, modelCalls, networkCalls };
}

test('fixed six controls and four holdouts use twelve and eight isolated bounded requests without sibling leakage', async () => {
  const frozen = value => {
    if (value && typeof value === 'object') { assert.equal(Object.isFrozen(value), true); Object.values(value).forEach(frozen); }
  };
  frozen(PRESERVATION_REVIEW_CONTROLS);
  frozen(PRESERVATION_HOLDOUT_CONTROLS);
  assert.equal(PRESERVATION_CASESET_SHA256, 'd17df1cf570ba50385b56b837c30d566c98ee46777e44cad70ac30169f4e70cb');
  assert.equal(hash(JSON.stringify(PRESERVATION_REVIEW_CONTROLS)), PRESERVATION_CASESET_SHA256);
  assert.equal(hash(JSON.stringify(PRESERVATION_HOLDOUT_CONTROLS)), PRESERVATION_HOLDOUT_CASESET_SHA256);
  assert.deepEqual(PRESERVATION_HOLDOUT_CONTROLS.map(c => [c.expectedSourceSupported, c.expectedMeaningPreserved]),
    [[true, true], [true, false], [false, true], [false, false]]);
  for (const holdout of [false, true]) {
    const controls = holdout ? PRESERVATION_HOLDOUT_CONTROLS : PRESERVATION_REVIEW_CONTROLS;
    const { report, capture } = await runFixture({ holdout });
    assert.equal(report.status, 'reviewer-controls-passed');
    assert.equal(report.code, null);
    assert.equal(report.totalCases, controls.length);
    assert.equal(report.completedCases, controls.length);
    assert.equal(report.correctCases, controls.length);
    assert.equal(report.modelRequests, holdout ? 8 : 12);
    assert.equal(report.networkRequests, holdout ? 8 : 12);
    assert.equal(report.outputBudget, holdout ? 4800 : 7200);
    assert.equal(report.caseSetSha256, holdout ? PRESERVATION_HOLDOUT_CASESET_SHA256 : PRESERVATION_CASESET_SHA256);
    assert.deepEqual(capture.cases, controls);
    assert.equal(capture.capturedAt, base.now.toISOString());
    assert.deepEqual(capture.calls.map(call => [call.caseId, call.dimension]),
      controls.flatMap(control => dimensions.map(dimension => [control.caseId, dimension])));
    for (const call of capture.calls) {
      assert.equal(call.attemptCount, 1);
      assert.match(call.responseSha256, /^[a-f0-9]{64}$/u);
      assert.match(call.response.judgments[0].comparison, /PRIVATE_ISOLATED_REPLY_/);
    }
    if (holdout) {
      const faithfulUnsupported = capture.calls.find(call => call.caseId === 'PH03' && call.dimension === 'meaning');
      assert.equal(faithfulUnsupported.response.judgments[0].meaningPreserved, true);
      assert.deepEqual(faithfulUnsupported.response.judgments[0].evidenceIds, []);
    }
  }
});

test('both dimensions are scored independently for every pair, including rejection for the wrong reason', async () => {
  for (const source of [false, true]) for (const meaning of [false, true]) {
    const { report, capture } = await runFixture({ holdout: true,
      sources: Array(4).fill(source), meanings: Array(4).fill(meaning) });
    assert.equal(report.code, 'PRESERVATION_REVIEW_MISCLASSIFIED');
    assert.equal(report.correctCases, 1);
    assert.equal(report.completedCases, 4);
    assert.equal(report.modelRequests, 8, 'Valid wrong answers must not trigger retries or early stops');
    assert.deepEqual(capture.results.map(r => r.supported), Array(4).fill(source && meaning));
    assert.deepEqual(capture.results.map(r => r.sourceCorrect),
      PRESERVATION_HOLDOUT_CONTROLS.map(c => source === c.expectedSourceSupported));
    assert.deepEqual(capture.results.map(r => r.meaningCorrect),
      PRESERVATION_HOLDOUT_CONTROLS.map(c => meaning === c.expectedMeaningPreserved));
  }
  const { report, capture } = await runFixture({ holdout: true,
    sources: PRESERVATION_HOLDOUT_CONTROLS.map(c => c.expectedMeaningPreserved),
    meanings: PRESERVATION_HOLDOUT_CONTROLS.map(c => c.expectedSourceSupported) });
  assert.deepEqual(capture.results.map(r => r.supported), [true, false, false, false]);
  assert.equal(report.correctCases, 2, 'Correct combined answers cannot hide swapped source and meaning judgments');
});

test('malformed source and meaning replies stop before any later request and are rejected before cloning', async () => {
  const mutations = [
    p => { p.reviewSha256 = '0'.repeat(64); },
    p => { p.judgments[0].claimId = 'C99'; },
    p => { p.judgments[0].comparison = ''; },
    p => { p.judgments[0].evidenceIds = null; },
    p => { p.judgments[0].evidenceIds = ['S1P99']; },
    p => { p.judgments[0].evidenceIds = ['S1P1', 'S1P1']; },
    p => { p.judgments[0].supported = true; },
    p => { p.judgments = []; },
  ];
  for (const corruptAt of [0, 1]) for (const corrupt of mutations) {
    const { report, capture } = await runFixture({ corrupt, corruptAt });
    assert.equal(report.code, 'PRESERVATION_REVIEW_MALFORMED');
    assert.equal(report.modelRequests, corruptAt + 1);
    assert.equal(report.completedCases, 0, 'A source judgment alone is not a completed case');
    assert.equal(capture.results.length, 0);
    assert.equal(capture.calls.at(-1).response, null);
    assert.equal(capture.calls.at(-1).responseRejectedBeforeCapture, true);
  }
  for (const corruptAt of [2, 3]) {
    const { report } = await runFixture({ corruptAt,
      corrupt: p => { p.judgments[0][corruptAt % 2 ? 'sourceSupported' : 'meaningPreserved'] = true; } });
    assert.equal(report.code, 'PRESERVATION_REVIEW_MALFORMED');
    assert.equal(report.modelRequests, corruptAt + 1);
    assert.equal(report.completedCases, 1);
  }
  const missingSourceEvidence = await runFixture({ corrupt: p => { p.judgments[0].evidenceIds = []; } });
  assert.equal(missingSourceEvidence.report.code, 'PRESERVATION_REVIEW_MALFORMED');
  assert.equal(missingSourceEvidence.report.modelRequests, 1);
  let reads = 0;
  for (const mutate of [
    p => { const value = p.reviewSha256; Object.defineProperty(p, 'reviewSha256',
      { enumerable: true, get() { reads++; return value; } }); },
    p => { Object.defineProperty(p, 'hidden', { value: true }); },
    p => { p[Symbol('hidden')] = true; },
    p => { Object.setPrototypeOf(p, { hidden: true }); },
    p => { Object.defineProperty(p.judgments[0], 'toJSON', { value() { reads++; return {}; } }); },
  ]) {
    const { report, capture } = await runFixture({ mutateAt: 1,
      mutateResult: response => { mutate(response.editorialPayload); return response; } });
    assert.equal(report.code, 'PRESERVATION_REVIEW_MALFORMED');
    assert.equal(report.modelRequests, 2);
    assert.equal(report.completedCases, 0);
    assert.equal(capture.calls[1].response, null);
  }
  assert.equal(reads, 0, 'Validation must reject descriptors before cloning can erase or invoke them');
});

test('provider errors, quota and forged provenance stop once and never disclose provider details', async () => {
  for (const status of [429, 503, 'throw']) {
    const { report, capture } = await runFixture({ status, statusAt: 1 });
    assert.equal(report.code, 'PRESERVATION_REVIEW_PROVIDER_FAILED');
    assert.equal(report.modelRequests, 2);
    assert.equal(report.networkRequests, 2);
    assert.equal(report.completedCases, 0);
    assert.equal(capture.results.length, 0);
    if (status !== 'throw') assert.equal(report.failures[0].httpStatus, String(status));
  }
  for (const patch of [{ provider: 'other' }, { model: 'other' }, { requestSha256: '0'.repeat(64) },
    { responseSha256: 'invalid' }, { attemptCount: 2 }]) {
    const { report, capture } = await runFixture({ mutateAt: 1, mutateResult: response => ({ ...response, ...patch }) });
    assert.equal(report.code, 'PRESERVATION_REVIEW_PROVENANCE');
    assert.equal(report.modelRequests, 2);
    assert.equal(report.completedCases, 0);
    assert.equal(capture.results.length, 0);
    assert.equal(Object.hasOwn(capture.calls[1], 'response'), false);
  }
});

test('network denial stays terminal when swallowed and every saved callback closes after completion', async () => {
  for (const attack of ['endpoint', 'body', 'method', 'redirect', 'repeat', 'skip']) {
    const result = await runFixture({ attack });
    assert.equal(result.report.code, 'PRESERVATION_REVIEW_NETWORK');
    assert.equal(result.report.modelRequests, 1);
    assert.equal(result.report.networkRequests, attack === 'repeat' ? 1 : 0);
    const saved = result.modelCalls[0], { body } = buildWorkersAiRequest(saved);
    await assert.rejects(saved.fetchImpl(endpoint, { method: 'POST', redirect: 'error', body: JSON.stringify(body) }),
      error => error.code === 'PRESERVATION_REVIEW_NETWORK');
    assert.equal(result.networkCalls.length, attack === 'repeat' ? 1 : 0,
      'The skipped request has unused quota, so only callback lifetime can block its later request');
  }
  const result = await runFixture({ holdout: true });
  for (const saved of result.modelCalls) {
    const { body } = buildWorkersAiRequest(saved);
    await assert.rejects(saved.fetchImpl(endpoint, { method: 'POST', redirect: 'error', body: JSON.stringify(body) }),
      error => error.code === 'PRESERVATION_REVIEW_NETWORK');
  }
  assert.equal(result.networkCalls.length, 8);
});

test('new private CLI modes encrypt complete captures without research and preserve the old six-call caps', async () => {
  for (const holdout of [false, true]) {
    const mode = `isolated-preservation-${holdout ? 'holdouts' : 'controls'}`;
    assert.equal(resolvePrivateWriterDiagnosticMode(mode), mode);
    const { report, sealed, capture } = await runFixture({ holdout, integration: true });
    assert.equal(report.mode, `${mode}-not-an-edition`);
    assert.equal(report.status, 'reviewer-controls-passed');
    assert.equal(sealed.version, 1);
    assert.equal(typeof sealed.ciphertext, 'string');
    assert.deepEqual(capture.report, report);
    const visible = JSON.stringify({ report, sealed });
    for (const control of capture.cases) for (const text of [control.rationale, control.input.text,
      control.input.previousClaims[0], control.input.sources[0].passages[0].text]) assert.ok(!visible.includes(text));
    assert.doesNotMatch(visible, /PRIVATE_ISOLATED_REPLY_|PRIVATE_ISOLATED_REASONING|private-isolated-fixture-token/);
  }
  for (const holdout of ['true', null, 1]) await assert.rejects(diagnoseIsolatedPreservation({ holdout,
    aiRequestImpl: () => assert.fail('Invalid profile must not call a provider'),
    sealDiagnostic: () => assert.fail('Invalid profile must not create a capture') }),
  error => error.code === 'PRESERVATION_REVIEW_PROFILE');
  for (const mode of ['preservation-review-controls', 'split-preservation-review-controls']) {
    const requests = [], network = [];
    const result = await diagnoseOneWriter({ ...base, mode,
      researchImpl: () => assert.fail('Old fixed controls must not perform research'),
      aiRequestImpl: request => { requests.push(request); return requestWorkersAiEditorial(request); },
      fetchImpl: async (url, init) => {
        const data = JSON.parse(JSON.parse(init.body).messages[1].content), index = network.length;
        network.push({ url, init });
        const expected = PRESERVATION_REVIEW_CONTROLS[index].expected;
        const payload = { reviewSha256: data.reviewSha256, judgments: data.claims.map(claim => ({ claimId: claim.claimId,
          evidenceIds: ['S1P1'], ...(mode.startsWith('split-')
            ? { sourceComparison: 'Synthetic source.', sourceSupported: true,
              preservationComparison: 'Synthetic preservation.', meaningPreserved: expected }
            : { comparison: 'Synthetic combined judgment.', supported: expected }) })) };
        return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload) }, errors: [] }),
          { headers: { 'content-type': 'application/json' } });
      } });
    assert.equal(result.report.status, 'reviewer-controls-passed');
    assert.equal(result.report.modelRequests, 6);
    assert.equal(result.report.networkRequests, 6);
    assert.equal(result.report.outputBudget, 3600);
    assert.equal(requests.length, 6);
    assert.equal(network.length, 6);
    for (const request of requests) {
      assert.equal(request.timeoutMs, 90000);
      assert.equal(request.maxTokens, 600);
      assert.equal(request.maxAttempts, 1);
    }
  }
});
