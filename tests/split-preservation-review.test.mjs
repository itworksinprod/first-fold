import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { buildSplitPreservationReview, validateSplitPreservationReview } from '../scripts/automation/free/split-preservation-review.mjs';
import { buildClaimwiseFactReview } from '../scripts/automation/free/claimwise-fact-review.mjs';
import { PRESERVATION_REVIEW_CONTROLS, PRESERVATION_CASESET_SHA256 } from '../scripts/automation/preservation-review-cases.mjs';
import { diagnosePreservationReview } from '../scripts/automation/preservation-review-diagnostic.mjs';
import { buildWorkersAiRequest, requestWorkersAiEditorial, DEFAULT_CLOUDFLARE_AI_MODEL } from '../scripts/automation/free/workers-ai.mjs';
import { diagnoseOneWriter, openDiagnostic } from '../scripts/automation/private-writer-diagnostic.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const expectedMeaning = [true, false, false, true, false, false];
const sourceTrue = Array(6).fill(true);
const views = PRESERVATION_REVIEW_CONTROLS.map(control => buildSplitPreservationReview(control.input));
const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
const base = { publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  accountId: '0'.repeat(32), apiToken: 'split-private-fixture-token', now: new Date('2026-09-24T04:00:00Z') };
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${base.accountId}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`;
const payloadFor = (data, sourceSupported = true, meaningPreserved = true) => ({ reviewSha256: data.reviewSha256,
  judgments: data.claims.map(claim => ({ claimId: claim.claimId,
    sourceComparison: 'Synthetic source judgment only; not semantic qualification.', evidenceIds: sourceSupported ? ['S1P1'] : [], sourceSupported,
    preservationComparison: 'Synthetic preservation judgment only; not semantic qualification.', meaningPreserved })) });
const invalid = { valid: false, supported: false };

async function runFixture({ sources = sourceTrue, meanings = expectedMeaning, corrupt, corruptAt = 0,
  status, mutateResult, attack, integration = false } = {}) {
  const modelCalls = [], networkCalls = [];
  const options = { ...base, endpoint, splitDimensions: true, sealDiagnostic: value => value,
    controls: [], model: 'unapproved', maxTokens: 16000, maxAttempts: 3,
    researchImpl: () => assert.fail('Fixed controls must not research'),
    aiRequestImpl: async request => {
      const index = modelCalls.length;
      modelCalls.push(request);
      const { body } = buildWorkersAiRequest(request);
      const init = { method: 'POST', redirect: 'error', body: JSON.stringify(body) };
      if (attack === 'skip') return { editorialPayload: payloadFor(views[index].data),
        provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, attemptCount: 1,
        responseSha256: 'b'.repeat(64), requestSha256: hash(JSON.stringify({ provider: 'cloudflare-workers-ai',
          model: DEFAULT_CLOUDFLARE_AI_MODEL, body })) };
      if (attack && attack !== 'repeat') {
        try {
          await request.fetchImpl(attack === 'endpoint' ? 'https://unapproved.example/' : endpoint,
            { ...init, ...(attack === 'body' ? { body: '{}' } : {}), ...(attack === 'method' ? { method: 'GET' } : {}),
              ...(attack === 'redirect' ? { redirect: 'follow' } : {}) });
        } catch { /* A swallowed violation must remain terminal. */ }
      }
      const response = await requestWorkersAiEditorial(request);
      if (attack === 'repeat') {
        try { await request.fetchImpl(endpoint, init); } catch { /* Rejection must survive this catch. */ }
      }
      return mutateResult ? mutateResult(response) : response;
    }, fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body), data = JSON.parse(body.messages[1].content), index = networkCalls.length;
      networkCalls.push({ url, init, body, data });
      if (status) return new Response(JSON.stringify({ success: false,
        errors: [{ code: status === 429 ? 3036 : 9999, message: 'PRIVATE_SPLIT_PROVIDER_DETAIL' }] }),
      { status, headers: { 'content-type': 'application/json' } });
      const payload = payloadFor(data, sources[index], meanings[index]);
      if (corrupt && index === corruptAt) corrupt(payload);
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload),
        reasoning_content: 'PRIVATE_SPLIT_REASONING' }, errors: [] }), { headers: { 'content-type': 'application/json' } });
    } };
  const result = integration ? await diagnoseOneWriter({ ...options, mode: 'split-preservation-review-controls' })
    : await diagnosePreservationReview(options);
  const capture = integration ? openDiagnostic(result.sealed, pair.privateKey) : result.sealed;
  for (const [index, request] of modelCalls.entries()) {
    const view = views[index];
    const prompt = `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
    assert.deepEqual(request.messages, [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(view.data) }]);
    assert.deepEqual(request.schema, view.schema);
    assert.equal(request.model, DEFAULT_CLOUDFLARE_AI_MODEL);
    assert.equal(request.maxTokens, 600);
    assert.equal(request.maxAttempts, 1);
    assert.equal(request.temperature, 0.1);
    assert.equal(request.responseFormat, 'json_object');
    assert.equal(request.timeoutMs, 90000);
    assert.equal(request.maxRequestBytes, 70000);
    assert.equal(request.maxResponseBytes, 100000);
    assert.equal(capture.calls[index].promptSha256, hash(prompt));
    const serialized = JSON.stringify(request.messages);
    assert.doesNotMatch(serialized, /PR0[1-6]|"expected"|"rationale"|"caseId"|expectedSourceSupported|Synthetic source judgment|Synthetic preservation judgment/);
    for (const control of PRESERVATION_REVIEW_CONTROLS) assert.ok(!serialized.includes(control.rationale));
  }
  for (const call of networkCalls) {
    assert.equal(call.url, endpoint);
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.redirect, 'error');
    assert.equal(call.body.max_tokens, 600);
    assert.equal(call.body.response_format.type, 'json_object');
  }
  assert.equal(result.report.modelRequests, modelCalls.length);
  assert.equal(result.report.networkRequests, networkCalls.length);
  assert.equal(result.report.outputBudget, modelCalls.length * 600);
  assert.ok(modelCalls.length <= 6 && networkCalls.length <= 6);
  assert.equal(result.report.emailSent, false);
  assert.equal(result.report.searchQueries, 0);
  assert.doesNotMatch(JSON.stringify({ report: result.report, capture }), /PRIVATE_SPLIT_PROVIDER_DETAIL|PRIVATE_SPLIT_REASONING|split-private-fixture-token/);
  return { ...result, capture, modelCalls, networkCalls };
}

test('v4 frozen views require previous text, retain fixed controls and bind a distinct policy hash', () => {
  const freezeCheck = value => {
    if (value && typeof value === 'object') { assert.equal(Object.isFrozen(value), true); Object.values(value).forEach(freezeCheck); }
  };
  assert.equal(PRESERVATION_CASESET_SHA256, 'd17df1cf570ba50385b56b837c30d566c98ee46777e44cad70ac30169f4e70cb');
  assert.equal(hash(JSON.stringify(PRESERVATION_REVIEW_CONTROLS)), PRESERVATION_CASESET_SHA256);
  assert.deepEqual(PRESERVATION_REVIEW_CONTROLS.map(control => control.expected), expectedMeaning);
  for (const [index, view] of views.entries()) {
    freezeCheck(view);
    assert.equal(hash(view.prompt), 'c017f5f4154c07e31f3e82f2ac4eda4ca0d517c4c91ebecb92b82c898609459a');
    assert.equal(view.data.policy, 'explicit-claimwise-preservation-v4');
    const { reviewSha256, ...boundData } = view.data;
    assert.equal(reviewSha256, hash(JSON.stringify(boundData)));
    const old = buildClaimwiseFactReview(PRESERVATION_REVIEW_CONTROLS[index].input);
    assert.notEqual(reviewSha256, old.data.reviewSha256);
    assert.deepEqual(view.data.previousClaims, old.data.previousClaims);
    assert.deepEqual(view.schema.properties.judgments.items.required.slice().sort(),
      ['claimId', 'evidenceIds', 'meaningPreserved', 'preservationComparison', 'sourceComparison', 'sourceSupported']);
    assert.deepEqual(validateSplitPreservationReview(payloadFor(view.data), structuredClone(view)), invalid);
    assert.deepEqual(validateSplitPreservationReview({ ...payloadFor(view.data), reviewSha256: old.data.reviewSha256 }, view), invalid);
  }
  const missing = structuredClone(PRESERVATION_REVIEW_CONTROLS[0].input);
  delete missing.previousClaims;
  assert.throws(() => buildSplitPreservationReview(missing), /SPLIT_PRESERVATION_PREVIOUS_REQUIRED/);
  assert.throws(() => buildSplitPreservationReview({ ...missing, previousClaims: [] }));
  for (const key of ['claims', 'previousClaims']) {
    const sparse = structuredClone(PRESERVATION_REVIEW_CONTROLS[0].input);
    sparse[key] = Array(1);
    assert.throws(() => buildSplitPreservationReview(sparse), 'Sparse inventories cannot create vacuous claim approval');
  }
});

test('source-only clarification preserves the prior introduction, meaning block, schemas and six bound inputs', () => {
  // These snapshots were verified against HEAD before the SOURCE SUPPORT-only
  // checkpoint. Prompt clarification must not silently redefine the experiment.
  for (const { prompt } of views) {
    const sourceStart = prompt.indexOf('\n\nSOURCE SUPPORT:');
    const meaningStart = prompt.indexOf('\n\nMEANING PRESERVATION:');
    assert.ok(sourceStart > 0 && meaningStart > sourceStart);
    assert.equal(hash(prompt.slice(0, sourceStart)), 'ee4645d21ba84b3f609a9fb99ea4dd7cc9410b52a617549a0e428c9d3ae877dc');
    assert.equal(hash(prompt.slice(meaningStart)), '6c8aa92a334d3c6b1254f5f46114e311bba27847ddfd436470945c3f8a1328fb');
  }
  assert.equal(hash(JSON.stringify(views.map(view => view.schema))), 'a390f94d55b330a9b63605ea5e80ccbe07cc42c4612849f7133867a98596c908');
  assert.equal(hash(JSON.stringify(views.map(view => view.data))), 'd77c548850c3a5c6ebfc0ca968f779c64ca05cfe09eee145a21ae84f5342c008');
});

test('local acceptance requires source and preservation true for every canonically ordered claim', () => {
  const input = structuredClone(PRESERVATION_REVIEW_CONTROLS[0].input);
  input.claims.push(PRESERVATION_REVIEW_CONTROLS[3].input.claims[0]);
  input.previousClaims.push(PRESERVATION_REVIEW_CONTROLS[3].input.previousClaims[0]);
  input.text = input.claims.join(' ');
  const view = buildSplitPreservationReview(input);
  for (const sourceSupported of [false, true]) for (const meaningPreserved of [false, true]) {
    const payload = payloadFor(view.data);
    Object.assign(payload.judgments[1], { sourceSupported, meaningPreserved, evidenceIds: sourceSupported ? ['S1P1'] : [] });
    payload.judgments.reverse();
    assert.deepEqual(validateSplitPreservationReview(payload, view), { valid: true,
      supported: sourceSupported && meaningPreserved,
      claims: [{ claimId: 'C1', sourceSupported: true, meaningPreserved: true },
        { claimId: 'C2', sourceSupported, meaningPreserved }] });
  }
  const missingEvidence = payloadFor(views[1].data, true, false);
  missingEvidence.judgments[0].evidenceIds = [];
  assert.deepEqual(validateSplitPreservationReview(missingEvidence, views[1]), invalid);
});

test('strict response shapes, dense evidence and data descriptors reject malformed judgments without getters', () => {
  const view = views[0];
  let reads = 0;
  const mutations = [
    p => { p.extra = true; }, p => { p.supported = true; }, p => { p.reviewSha256 = '0'.repeat(64); },
    p => { p.judgments = []; }, p => { p.judgments = Array(1); }, p => { p.judgments.push({ ...p.judgments[0] }); },
    p => { p.judgments[0].claimId = 'C99'; }, p => { p.judgments[0].sourceSupported = 'true'; },
    p => { p.judgments[0].meaningPreserved = 1; }, p => { p.judgments[0].sourceComparison = ''; },
    p => { p.judgments[0].preservationComparison = 'x'.repeat(241); },
    p => { p.judgments[0].evidenceIds = []; }, p => { p.judgments[0].evidenceIds = Array(1); },
    p => { p.judgments[0].evidenceIds = ['S1P1', 'S1P1']; }, p => { p.judgments[0].evidenceIds = ['S1P99']; },
    p => { p.judgments[0].extra = true; }, p => { Object.setPrototypeOf(p.judgments[0], { extra: true }); },
    p => { Object.defineProperty(p, 'hidden', { value: true }); }, p => { p[Symbol('hidden')] = true; },
    p => { Object.defineProperty(p, 'reviewSha256', { enumerable: true, get() { reads++; return view.data.reviewSha256; } }); },
    p => { Object.defineProperty(p.judgments, '0', { enumerable: true, get() { reads++; return {}; } }); },
    p => { Object.defineProperty(p.judgments[0], 'sourceSupported', { enumerable: true, get() { reads++; return true; } }); },
    p => { Object.defineProperty(p.judgments[0].evidenceIds, 'toJSON', { value() { reads++; return ['S1P1']; } }); },
  ];
  for (const mutate of mutations) {
    const payload = payloadFor(view.data); mutate(payload);
    assert.deepEqual(validateSplitPreservationReview(payload, view), invalid);
  }
  assert.equal(reads, 0);
});

test('all six controls require both dimensions correct, including rejection for the correct reason', async () => {
  for (const [sources, meanings, correct] of [[sourceTrue, expectedMeaning, 6],
    [sourceTrue, sourceTrue, 2], [sourceTrue, Array(6).fill(false), 4],
    [Array(6).fill(false), sourceTrue, 0], [Array(6).fill(false), Array(6).fill(false), 0],
    [expectedMeaning, sourceTrue, 2]]) {
    const { report, capture } = await runFixture({ sources, meanings });
    assert.equal(report.status, correct === 6 ? 'reviewer-controls-passed' : 'failed');
    assert.equal(report.code, correct === 6 ? null : 'PRESERVATION_REVIEW_MISCLASSIFIED');
    assert.equal(report.correctCases, correct);
    assert.equal(report.completedCases, 6);
    assert.equal(report.modelRequests, 6);
    assert.equal(report.outputBudget, 3600);
    assert.deepEqual(capture.results.map(result => result.supported), sources.map((source, i) => source && meanings[i]));
    assert.deepEqual(capture.results.map(result => result.sourceCorrect), sources);
    assert.deepEqual(capture.results.map(result => result.meaningCorrect), meanings.map((value, i) => value === expectedMeaning[i]));
    if (sources === expectedMeaning) assert.deepEqual(capture.results.map(result => result.supported), expectedMeaning,
      'Correct combined answers must still fail when the source and preservation dimensions are wrong');
  }
});

test('malformed split replies stop early, including missing source evidence when preservation is false', async () => {
  for (const corrupt of [
    p => { p.reviewSha256 = '0'.repeat(64); }, p => { p.judgments[0].claimId = 'C99'; },
    p => { p.judgments[0].sourceSupported = 'true'; }, p => { p.judgments[0].meaningPreserved = 'false'; },
    p => { p.judgments[0].preservationComparison = ''; }, p => { p.judgments[0].evidenceIds = []; },
  ]) {
    const { report } = await runFixture({ corrupt, corruptAt: 1 });
    assert.equal(report.code, 'PRESERVATION_REVIEW_MALFORMED');
    assert.equal(report.modelRequests, 2);
    assert.equal(report.completedCases, 1);
  }
  let reads = 0;
  for (const mutate of [
    p => { const value = p.reviewSha256; Object.defineProperty(p, 'reviewSha256',
      { enumerable: true, get() { reads++; return value; } }); },
    p => { Object.defineProperty(p, 'hidden', { value: true }); },
    p => { p[Symbol('hidden')] = true; },
    p => { Object.setPrototypeOf(p, { hidden: true }); },
  ]) {
    const { report } = await runFixture({ mutateResult: response => { mutate(response.editorialPayload); return response; } });
    assert.equal(report.code, 'PRESERVATION_REVIEW_MALFORMED');
    assert.equal(report.modelRequests, 1, 'Validation must run before cloning can erase an invalid response shape');
    assert.equal(report.completedCases, 0);
  }
  assert.equal(reads, 0, 'The diagnostic must reject response getters without executing them');
});

test('split controls stop on provider failure and quota without retry or public provider detail', async () => {
  for (const status of [429, 503]) {
    const { report, capture } = await runFixture({ status });
    assert.equal(report.code, 'PRESERVATION_REVIEW_PROVIDER_FAILED');
    assert.equal(report.modelRequests, 1);
    assert.equal(report.networkRequests, 1);
    assert.equal(report.completedCases, 0);
    assert.equal(capture.results.length, 0);
    assert.equal(report.failures[0].httpStatus, String(status));
  }
});

test('split mode retains exact provider provenance and rejects modified result metadata', async () => {
  for (const patch of [{ provider: 'other' }, { model: 'other' }, { requestSha256: '0'.repeat(64) },
    { responseSha256: 'invalid' }, { attemptCount: 2 }]) {
    const { report, capture } = await runFixture({ mutateResult: response => ({ ...response, ...patch }) });
    assert.equal(report.code, 'PRESERVATION_REVIEW_PROVENANCE');
    assert.equal(report.modelRequests, 1);
    assert.equal(report.networkRequests, 1);
    assert.equal(capture.results.length, 0);
  }
});

test('split mode reuses sticky request denial, one-request limits and closed callback lifetime', async () => {
  for (const attack of ['endpoint', 'body', 'method', 'redirect', 'repeat', 'skip']) {
    const result = await runFixture({ attack });
    assert.equal(result.report.code, 'PRESERVATION_REVIEW_NETWORK');
    assert.equal(result.report.modelRequests, 1);
    assert.equal(result.report.networkRequests, attack === 'repeat' ? 1 : 0);
    const saved = result.modelCalls[0], { body } = buildWorkersAiRequest(saved);
    await assert.rejects(saved.fetchImpl(endpoint, { method: 'POST', redirect: 'error', body: JSON.stringify(body) }),
      error => error.code === 'PRESERVATION_REVIEW_NETWORK');
    assert.equal(result.networkCalls.length, attack === 'repeat' ? 1 : 0);
  }
});

test('new private CLI mode uses encrypted controls only and rejects invalid split profile flags', async () => {
  const { report, sealed, capture } = await runFixture({ integration: true });
  assert.equal(report.mode, 'split-preservation-review-controls-not-an-edition');
  assert.equal(report.status, 'reviewer-controls-passed');
  assert.deepEqual(capture.cases, PRESERVATION_REVIEW_CONTROLS);
  const visible = JSON.stringify({ report, sealed });
  for (const control of PRESERVATION_REVIEW_CONTROLS) {
    for (const text of [control.rationale, control.input.text, control.input.previousClaims[0],
      control.input.sources[0].passages[0].text]) assert.ok(!visible.includes(text));
  }
  assert.doesNotMatch(visible, /Synthetic source judgment|Synthetic preservation judgment|split-private-fixture-token/);
  for (const splitDimensions of ['true', null, 1]) {
    await assert.rejects(diagnosePreservationReview({ splitDimensions,
      aiRequestImpl: () => assert.fail('No provider call'), sealDiagnostic: () => assert.fail('No capture') }),
    error => error.code === 'PRESERVATION_REVIEW_PROFILE');
  }
});
