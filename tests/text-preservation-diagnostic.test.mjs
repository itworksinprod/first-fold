import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { diagnoseIsolatedPreservation } from '../scripts/automation/isolated-preservation-diagnostic.mjs';
import { buildIsolatedPreservationReview } from '../scripts/automation/free/isolated-preservation-review.mjs';
import { buildTextPreservationReview } from '../scripts/automation/free/text-preservation-review.mjs';
import { PRESERVATION_REVIEW_CONTROLS, PRESERVATION_CASESET_SHA256 } from '../scripts/automation/preservation-review-cases.mjs';
import { PRESERVATION_HOLDOUT_CONTROLS, PRESERVATION_HOLDOUT_CASESET_SHA256 } from '../scripts/automation/preservation-holdout-cases.mjs';
import { PRESERVATION_PARAPHRASE_CONTROLS, PRESERVATION_PARAPHRASE_CASESET_SHA256 } from '../scripts/automation/preservation-paraphrase-case.mjs';
import { requestWorkersAiEditorial, DEFAULT_CLOUDFLARE_AI_MODEL } from '../scripts/automation/free/workers-ai.mjs';
import { diagnoseOneWriter, openDiagnostic, resolvePrivateWriterDiagnosticMode } from '../scripts/automation/private-writer-diagnostic.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
const base = { publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  accountId: '0'.repeat(32), apiToken: 'private-text-preservation-token', now: new Date('2026-09-24T04:00:00Z') };
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${base.accountId}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`;

async function runFixture({ holdout = false, paraphrase = false, textOnly = true, integration = false,
  corrupt, corruptAt = 0, status, statusAt = 0, sourceOverride, meaningOverride } = {}) {
  const controls = paraphrase ? PRESERVATION_PARAPHRASE_CONTROLS : holdout ? PRESERVATION_HOLDOUT_CONTROLS : PRESERVATION_REVIEW_CONTROLS;
  const mode = `${textOnly ? 'text' : 'isolated'}-preservation-${paraphrase ? 'paraphrase' : holdout ? 'holdouts' : 'controls'}`;
  // The sole byte-identical fixture is PH03; never derive this expectation from
  // the production identity helper whose routing this test is checking.
  const schedule = controls.flatMap(control => ['source', 'meaning']
    .filter(dimension => !(textOnly && control.caseId === 'PH03' && dimension === 'meaning'))
    .map(dimension => ({ control, dimension })));
  const modelCalls = [], networkCalls = [];
  const options = { ...base, endpoint, holdout, paraphrase, textOnly, sealDiagnostic: value => value,
    controls: [], cases: [], maxAttempts: 5, maxTokens: 16000, model: 'unapproved', prompt: 'UNAPPROVED_TEXT_PROMPT',
    researchImpl: () => assert.fail('Fixed text-preservation diagnostics must not perform research'),
    aiRequestImpl: async request => { modelCalls.push(request); return requestWorkersAiEditorial(request); },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body), data = JSON.parse(body.messages[1].content), index = networkCalls.length;
      networkCalls.push({ url, init, body, data });
      const { control, dimension } = schedule[index];
      if (status && index === statusAt) return new Response(JSON.stringify({ success: false,
        errors: [{ code: 9999, message: `PRIVATE_TEXT_PROVIDER_DETAIL ${base.apiToken}` }] }),
      { status, headers: { 'content-type': 'application/json' } });
      const source = sourceOverride ?? (holdout ? control.expectedSourceSupported : true);
      const meaning = meaningOverride ?? (holdout ? control.expectedMeaningPreserved : control.expected);
      const payload = { reviewSha256: data.reviewSha256, judgments: data.claims.map(claim => ({ claimId: claim.claimId,
        comparison: `PRIVATE_TEXT_REPLY_${index}: synthetic plumbing, not semantic qualification.`,
        ...(dimension === 'source' ? { evidenceIds: source ? ['S1P1'] : [], sourceSupported: source }
          : { ...(!textOnly ? { evidenceIds: [] } : {}), meaningPreserved: meaning }) })) };
      if (corrupt && index === corruptAt) corrupt(payload);
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload),
        reasoning_content: 'PRIVATE_TEXT_REASONING' }, errors: [] }),
      { headers: { 'content-type': 'application/json' } });
    } };
  const result = integration ? await diagnoseOneWriter({ ...options, mode }) : await diagnoseIsolatedPreservation(options);
  const capture = integration ? openDiagnostic(result.sealed, pair.privateKey) : result.sealed;
  for (const [index, request] of modelCalls.entries()) {
    const { control, dimension } = schedule[index], textMeaning = textOnly && dimension === 'meaning';
    const view = textMeaning ? buildTextPreservationReview(control.input) : buildIsolatedPreservationReview(control.input, dimension);
    const prompt = `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
    assert.deepEqual(request.messages, [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(view.data) }]);
    assert.deepEqual(request.schema, view.schema);
    assert.equal(request.model, DEFAULT_CLOUDFLARE_AI_MODEL);
    assert.equal(request.maxTokens, 600);
    assert.equal(request.maxAttempts, 1);
    assert.equal(request.temperature, 0.1);
    assert.equal(request.timeoutMs, 30000);
    assert.equal(request.responseFormat, 'json_object');
    assert.equal(request.maxRequestBytes, 70000);
    assert.equal(request.maxResponseBytes, 100000);
    assert.equal(capture.calls[index].caseId, control.caseId);
    assert.equal(capture.calls[index].dimension, dimension);
    assert.equal(capture.calls[index].promptSha256, hash(prompt));
    const data = JSON.parse(request.messages[1].content), serialized = JSON.stringify(request.messages);
    assert.doesNotMatch(serialized, /PR0[1-6]|PH0[1-5]|"(?:expected|caseId|rationale)"|expectedSourceSupported|expectedMeaningPreserved|PRIVATE_TEXT_REPLY_|UNAPPROVED_TEXT_PROMPT/);
    for (const item of controls) assert.ok(!serialized.includes(item.rationale));
    if (dimension === 'source') assert.equal(Object.hasOwn(data, 'previousClaims'), false);
    if (textMeaning) {
      assert.deepEqual(Object.keys(data).sort(), ['claims', 'policy', 'previousClaims', 'reviewSha256']);
      assert.deepEqual(request.schema.properties.judgments.items.required.slice().sort(),
        ['claimId', 'comparison', 'meaningPreserved']);
      const serializedData = JSON.stringify(data);
      assert.doesNotMatch(serializedData, /"(?:passages|sources|publisher|contexts|evidenceIds|sourceSupported|statement)"/);
      for (const item of controls) for (const source of item.input.sources) {
        assert.ok(!serializedData.includes(source.publisher));
        for (const passage of source.passages) assert.ok(!serializedData.includes(passage.text));
      }
    }
  }
  for (const [index, request] of networkCalls.entries()) {
    assert.equal(request.url, endpoint);
    assert.equal(request.init.method, 'POST');
    assert.equal(request.init.redirect, 'error');
    assert.equal(request.body.max_tokens, 600);
    assert.deepEqual(capture.calls[index].request, request.data);
    assert.equal(capture.calls[index].requestSha256, hash(JSON.stringify({ provider: 'cloudflare-workers-ai',
      model: DEFAULT_CLOUDFLARE_AI_MODEL, body: request.body })));
  }
  assert.equal(result.report.modelRequests, modelCalls.length);
  assert.equal(result.report.networkRequests, networkCalls.length);
  assert.equal(result.report.outputBudget, modelCalls.length * 600);
  assert.ok(modelCalls.length <= schedule.length);
  assert.equal(result.report.searchQueries, 0);
  assert.equal(result.report.emailSent, false);
  assert.doesNotMatch(JSON.stringify({ report: result.report, capture }),
    /PRIVATE_TEXT_PROVIDER_DETAIL|PRIVATE_TEXT_REASONING|private-text-preservation-token/);
  return { ...result, capture, modelCalls, networkCalls };
}

test('text controls, holdouts and changed paraphrase use twelve, seven and two isolated requests', async () => {
  for (const [profile, cases, requests, identities, digest] of [
    [{}, 6, 12, 0, PRESERVATION_CASESET_SHA256],
    [{ holdout: true }, 4, 7, 1, PRESERVATION_HOLDOUT_CASESET_SHA256],
    [{ holdout: true, paraphrase: true }, 1, 2, 0, PRESERVATION_PARAPHRASE_CASESET_SHA256],
  ]) {
    const { report, capture } = await runFixture(profile);
    assert.equal(report.status, 'reviewer-controls-passed');
    assert.equal(report.code, null);
    assert.equal(report.totalCases, cases);
    assert.equal(report.completedCases, cases);
    assert.equal(report.correctCases, cases);
    assert.equal(report.modelRequests, requests);
    assert.equal(report.networkRequests, requests);
    assert.equal(report.outputBudget, requests * 600);
    assert.equal(report.localIdentityReviews, identities);
    assert.equal(capture.localDecisions.length, identities);
    assert.equal(report.caseSetSha256, digest);
    assert.equal(hash(JSON.stringify(capture.cases)), digest);
  }
});

test('PH03 exact identity removes only its meaning request while source support remains mandatory', async () => {
  const { report, capture } = await runFixture({ holdout: true });
  assert.equal(report.modelRequests, 7);
  assert.deepEqual(capture.calls.filter(call => call.caseId === 'PH03').map(call => call.dimension), ['source']);
  assert.deepEqual(capture.localDecisions.map(item => [item.caseId, item.dimension]), [['PH03', 'meaning']]);
  const local = capture.localDecisions[0], result = capture.results.find(item => item.caseId === 'PH03');
  assert.equal(local.verdict.method, 'exact-text-identity');
  assert.equal(local.verdict.reviewSha256, local.request.reviewSha256);
  assert.deepEqual(Object.keys(local.request).sort(), ['claims', 'policy', 'previousClaims', 'reviewSha256']);
  assert.deepEqual(result.verdicts.meaning, local.verdict);
  assert.equal(result.verdicts.meaning.supported, true);
  assert.equal(result.verdicts.source.supported, false);
  assert.equal(result.supported, false, 'Text identity must not turn a contradicted claim into approval');
  assert.equal(result.passed, true);
  const wrong = await runFixture({ holdout: true, sourceOverride: true });
  assert.equal(wrong.report.code, 'PRESERVATION_REVIEW_MISCLASSIFIED');
  assert.equal(wrong.capture.results.find(item => item.caseId === 'PH03').sourceCorrect, false);
  assert.equal(wrong.report.localIdentityReviews, 1);
});

test('PH03 malformed source or provider failure stops before an identity decision or later case', async () => {
  for (const failure of [
    { corruptAt: 4, corrupt: payload => { payload.reviewSha256 = '0'.repeat(64); } },
    { corruptAt: 4, corrupt: payload => { delete payload.judgments[0].sourceSupported; } },
    { statusAt: 4, status: 503 },
  ]) {
    const { report, capture } = await runFixture({ holdout: true, ...failure });
    assert.equal(report.code, failure.status ? 'PRESERVATION_REVIEW_PROVIDER_FAILED' : 'PRESERVATION_REVIEW_MALFORMED');
    assert.equal(report.modelRequests, 5);
    assert.equal(report.networkRequests, 5);
    assert.equal(report.completedCases, 2);
    assert.equal(report.localIdentityReviews, 0);
    assert.deepEqual(capture.localDecisions, []);
    assert.equal(capture.calls.at(-1).caseId, 'PH03');
    assert.equal(capture.calls.at(-1).dimension, 'source');
    assert.deepEqual(capture.results.map(item => item.caseId), ['PH01', 'PH02']);
  }
});

test('PH05 changed wording requires a model meaning judgment even when both sentences lack source support', async () => {
  const fixture = PRESERVATION_PARAPHRASE_CONTROLS[0];
  assert.equal(fixture.caseId, 'PH05');
  assert.notEqual(fixture.input.previousClaims[0], fixture.input.claims[0]);
  for (const meaningOverride of [true, false]) {
    const { report, capture } = await runFixture({ holdout: true, paraphrase: true, meaningOverride });
    assert.equal(report.modelRequests, 2);
    assert.equal(report.localIdentityReviews, 0);
    assert.deepEqual(capture.calls.map(call => call.dimension), ['source', 'meaning']);
    assert.equal(capture.results[0].verdicts.source.supported, false);
    assert.equal(capture.results[0].verdicts.meaning.supported, meaningOverride);
    assert.equal(capture.results[0].supported, false);
    assert.equal(report.correctCases, Number(meaningOverride));
    assert.equal(report.code, meaningOverride ? null : 'PRESERVATION_REVIEW_MISCLASSIFIED');
  }
  for (const corrupt of [
    payload => { payload.judgments[0].evidenceIds = []; },
    payload => { payload.judgments[0].sourceSupported = false; },
    payload => { payload.judgments[0].comparison = ''; },
  ]) {
    const { report, capture } = await runFixture({ holdout: true, paraphrase: true, corruptAt: 1, corrupt });
    assert.equal(report.code, 'PRESERVATION_REVIEW_MALFORMED');
    assert.equal(report.modelRequests, 2);
    assert.equal(report.completedCases, 0);
    assert.equal(report.localIdentityReviews, 0);
    assert.equal(capture.calls[1].response, null);
    assert.equal(capture.calls[1].responseRejectedBeforeCapture, true);
  }
});

test('all three CLI profiles encrypt text and local decisions, and invalid flags stop before inference', async () => {
  for (const profile of [{}, { holdout: true }, { holdout: true, paraphrase: true }]) {
    const suffix = profile.paraphrase ? 'paraphrase' : profile.holdout ? 'holdouts' : 'controls';
    const mode = `text-preservation-${suffix}`;
    assert.equal(resolvePrivateWriterDiagnosticMode(mode), mode);
    const { report, sealed, capture } = await runFixture({ ...profile, integration: true });
    assert.equal(report.mode, `${mode}-not-an-edition`);
    assert.equal(report.status, 'reviewer-controls-passed');
    assert.equal(sealed.version, 1);
    assert.equal(typeof sealed.ciphertext, 'string');
    assert.deepEqual(capture.report, report);
    const visible = JSON.stringify({ report, sealed });
    for (const control of capture.cases) for (const privateText of [control.rationale, control.input.text,
      control.input.previousClaims[0], control.input.sources[0].passages[0].text]) assert.ok(!visible.includes(privateText));
    assert.doesNotMatch(visible, /PRIVATE_TEXT_REPLY_|exact-text-identity|previousClaims|private-text-preservation-token/);
  }
  for (const flags of [{ textOnly: 'true' }, { textOnly: null }, { paraphrase: 1 },
    { paraphrase: true }, { holdout: true, paraphrase: true, textOnly: false },
    { holdout: false, paraphrase: true, textOnly: true }]) {
    await assert.rejects(diagnoseIsolatedPreservation({ ...flags,
      aiRequestImpl: () => assert.fail('Invalid profiles must not invoke a provider'),
      sealDiagnostic: () => assert.fail('Invalid profiles must not create a capture') }),
    error => error.code === 'PRESERVATION_REVIEW_PROFILE');
  }
});

test('existing isolated profiles retain twelve and eight provider requests with source-bearing meaning data', async () => {
  for (const holdout of [false, true]) {
    const { report, capture } = await runFixture({ holdout, textOnly: false, integration: true });
    assert.equal(report.mode, `isolated-preservation-${holdout ? 'holdouts' : 'controls'}-not-an-edition`);
    assert.equal(report.status, 'reviewer-controls-passed');
    assert.equal(report.modelRequests, holdout ? 8 : 12);
    assert.equal(report.networkRequests, holdout ? 8 : 12);
    assert.equal(report.outputBudget, holdout ? 4800 : 7200);
    assert.equal(Object.hasOwn(report, 'localIdentityReviews'), false);
    assert.equal(Object.hasOwn(capture, 'localDecisions'), false);
    for (const call of capture.calls.filter(item => item.dimension === 'meaning')) {
      assert.ok(call.request.passages.length);
      assert.ok(call.request.previousClaims.length);
      assert.ok(Object.hasOwn(call.response.judgments[0], 'evidenceIds'));
    }
    if (holdout) assert.deepEqual(capture.calls.filter(call => call.caseId === 'PH03').map(call => call.dimension),
      ['source', 'meaning']);
  }
});
