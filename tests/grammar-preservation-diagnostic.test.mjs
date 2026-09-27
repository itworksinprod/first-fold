import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { diagnoseGrammarPreservation } from '../scripts/automation/grammar-preservation-diagnostic.mjs';
import { diagnoseOneWriter, openDiagnostic, resolvePrivateWriterDiagnosticMode } from '../scripts/automation/private-writer-diagnostic.mjs';
import { requestWorkersAiEditorial, buildWorkersAiRequest, DEFAULT_CLOUDFLARE_AI_MODEL,
  FREE_REASONING_WRITER_MODEL } from '../scripts/automation/free/workers-ai.mjs';
import { assertQualifiedDefinitionReviewer } from '../scripts/automation/experiments/qualified-definition-review.mjs';
import { GRAMMAR_PRESERVATION_CONTROLS, GRAMMAR_PRESERVATION_PROBES,
  GRAMMAR_CONTRAST_SHA256, buildGrammarPreservationViews } from '../scripts/automation/experiments/grammar-preservation-cases.mjs';
import { MEANING_HOLDOUT_CONTROLS, MEANING_HOLDOUT_PROBES, MEANING_HOLDOUT_SHA256,
  buildMeaningHoldoutViews } from '../scripts/automation/experiments/meaning-holdout-cases.mjs';

const mode = 'grammar-preservation-controls';
const controls = [...GRAMMAR_PRESERVATION_CONTROLS, ...GRAMMAR_PRESERVATION_PROBES];
const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
const base = { publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  accountId: '0'.repeat(32), apiToken: 'private-grammar-fixture-token', now: new Date('2026-09-27T01:00:00Z') };
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${base.accountId}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`;
const hash = text => createHash('sha256').update(text).digest('hex');

async function fixture({ integration = false, overrideMeaning, probe = false, corrupt, at = 0, status, mutateResult, attack,
  reasoningReviewer = false, holdouts = false, formatFailure } = {}) {
  const model = [], network = [];
  const selectedModel = reasoningReviewer ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL;
  const selectedEndpoint = endpoint.replace(DEFAULT_CLOUDFLARE_AI_MODEL, selectedModel);
  const selectedMode = holdouts ? 'grammar-reasoning-holdouts' : reasoningReviewer ? 'grammar-reasoning-controls' : mode;
  const selectedCases = holdouts ? [...MEANING_HOLDOUT_CONTROLS, ...MEANING_HOLDOUT_PROBES] : controls;
  const options = { ...base, endpoint, reasoningReviewer, holdouts, sealDiagnostic: value => value,
    controls: [], model: 'unapproved', prompt: 'INJECTED_PROMPT', maxTokens: 16000, maxAttempts: 99,
    researchImpl: () => assert.fail('No research in a grammar control run'),
    aiRequestImpl: async request => {
      const index = model.length; model.push(request);
      const init = { method: 'POST', redirect: 'error', body: JSON.stringify(buildWorkersAiRequest(request).body) };
      if (attack && !['repeat', 'skip'].includes(attack)) {
        try { await request.fetchImpl(attack === 'endpoint' ? 'https://unapproved.example/'
          : attack === 'old-model-endpoint' ? endpoint : selectedEndpoint,
          { ...init, ...(attack === 'body' ? { body: '{}' } : {}), ...(attack === 'method' ? { method: 'GET' } : {}),
            ...(attack === 'redirect' ? { redirect: 'follow' } : {}) }); } catch { /* Denial must stick. */ }
      }
      if (attack === 'skip') return { provider: 'cloudflare-workers-ai', model: selectedModel,
        requestSha256: 'a'.repeat(64), responseSha256: 'b'.repeat(64), attemptCount: 1, editorialPayload: {} };
      const result = await requestWorkersAiEditorial(request);
      if (attack === 'repeat') { try { await request.fetchImpl(selectedEndpoint, init); } catch { /* Terminal. */ } }
      return mutateResult && index === at ? mutateResult(result) : result;
    },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body), data = JSON.parse(body.messages[1].content), index = network.length;
      network.push({ url, init, body, data });
      if (status && index === at) return new Response(JSON.stringify({ success: false,
        errors: [{ code: 9999, message: `PRIVATE_PROVIDER_DETAIL ${base.apiToken}` }] }),
      { status, headers: { 'content-type': 'application/json' } });
      const meaning = index === 10 ? probe : overrideMeaning ?? selectedCases[index].expectedMeaningPreserved;
      const payload = { reviewSha256: data.reviewSha256, judgments: data.claims.map(({ claimId }) => ({ claimId,
        comparison: `PRIVATE_REPLY_${index}: mock plumbing verdict, not semantic evidence.`, meaningPreserved: meaning })) };
      if (corrupt && index === at) corrupt(payload);
      if (reasoningReviewer) {
        const broken = index === at && formatFailure;
        return new Response(JSON.stringify({ success: true, errors: [], result: {
          model: selectedModel, choices: [{ index: 0, finish_reason: broken === 'length' ? 'length' : 'stop',
            message: { role: 'assistant', content: broken === 'empty' ? '' : broken === 'json' ? '{' : JSON.stringify(payload),
              reasoning_content: 'PRIVATE_REASONING' } }],
          usage: { prompt_tokens: 100, completion_tokens: broken === 'length' ? 600 : 100 },
        } }), { headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload),
        reasoning_content: 'PRIVATE_REASONING' }, errors: [] }), { headers: { 'content-type': 'application/json' } });
    } };
  const r = integration ? await diagnoseOneWriter({ ...options, mode: selectedMode }) : await diagnoseGrammarPreservation(options);
  const capture = integration ? openDiagnostic(r.sealed, pair.privateKey) : r.sealed;
  assert.equal(r.report.modelRequests, model.length); assert.equal(r.report.networkRequests, network.length);
  assert.equal(r.report.outputBudget, model.length * 600);
  assert.equal(r.report.emailSent, false); assert.equal(r.report.searchQueries, 0);
  assert.equal(r.report.maximumModelRequests, 11); assert.equal(r.report.maximumOutputBudget, 6600);
  assert.ok(model.length <= 11 && network.length <= 11);
  assert.doesNotMatch(JSON.stringify({ report: r.report, capture }), /PRIVATE_PROVIDER_DETAIL|PRIVATE_REASONING|private-grammar-fixture-token/);
  return { ...r, capture, model, network };
}

test('eleven fixed single-attempt meaning requests retain exact qualified prompt and no gold-label leakage', async () => {
  const r = await fixture(), views = buildGrammarPreservationViews();
  assert.equal(r.report.status, 'reviewer-controls-passed'); assert.equal(r.report.code, null);
  assert.equal(r.report.modelRequests, 11); assert.equal(r.report.outputBudget, 6600);
  assert.equal(r.report.totalCases, 11); assert.equal(r.report.completedCases, 11); assert.equal(r.report.correctCases, 10);
  assert.equal(r.report.totalScoredCases, 10); assert.equal(r.report.totalUnscoredProbes, 1);
  assert.equal(r.report.caseSetSha256, GRAMMAR_CONTRAST_SHA256);
  assert.equal(r.report.reviewerPromptSha256, 'b0711232aac6664bf9ff040aa4edb61a8e2c3bac199949adea8132db299c9785');
  assert.equal(r.report.mode, `${mode}-not-an-edition`);
  assert.equal(Object.hasOwn(r.report, 'localIdentityReviews'), false);
  assert.deepEqual(r.capture.calls.map(c => [c.caseId, c.dimension]), controls.map(c => [c.caseId, 'meaning']));
  for (const [index, request] of r.model.entries()) {
    const { view } = views[index], prompt = `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
    assert.deepEqual(request.messages, [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(view.data) }]);
    assert.deepEqual(request.schema, view.schema);
    assert.equal(request.model, DEFAULT_CLOUDFLARE_AI_MODEL); assert.equal(request.maxTokens, 600);
    assert.equal(request.maxAttempts, 1); assert.equal(request.timeoutMs, 30000); assert.equal(request.temperature, 0.1);
    assert.equal(request.responseFormat, 'json_object'); assert.equal(request.maxRequestBytes, 70000);
    assert.equal(request.maxResponseBytes, 100000);
    const net = r.network[index], call = r.capture.calls[index];
    assert.equal(net.url, endpoint); assert.equal(net.init.method, 'POST'); assert.equal(net.init.redirect, 'error');
    assert.equal(net.body.max_tokens, 600); assert.deepEqual(net.data, view.data);
    assert.equal(call.promptSha256, hash(prompt)); assert.equal(call.requestBytes, Buffer.byteLength(net.init.body));
    assert.equal(call.requestSha256, hash(JSON.stringify({ provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, body: net.body })));
    const serialized = JSON.stringify(request.messages);
    assert.doesNotMatch(serialized, /"caseId"|"rationale"|expectedMeaningPreserved|PRIVATE_REPLY_|INJECTED_PROMPT|"passages"|"sources"/);
    for (const c of controls) assert.ok(!serialized.includes(c.rationale));
  }
});

test('wrong answers finish the fixed set without repairs; either probe answer stays unscored', async () => {
  for (const probe of [false, true]) {
    const r = await fixture({ probe });
    assert.equal(r.report.status, 'reviewer-controls-passed'); assert.equal(r.report.correctCases, 10);
    assert.deepEqual(r.report.cases.at(-1), { caseId: 'P01', valid: true, scored: false, passed: null, meaningPreserved: probe });
    for (const overrideMeaning of [false, true]) {
      const wrong = await fixture({ overrideMeaning, probe });
      assert.equal(wrong.report.status, 'failed'); assert.equal(wrong.report.code, 'GRAMMAR_REVIEW_MISCLASSIFIED');
      assert.equal(wrong.report.completedCases, 11); assert.equal(wrong.report.modelRequests, 11);
      assert.equal(wrong.report.correctCases, overrideMeaning ? 4 : 6);
      assert.equal(wrong.capture.results.at(-1).passed, null);
    }
  }
});

test('malformed or misbound replies stop, including an invalid unscored probe', async () => {
  for (const at of [0, 1, 9, 10]) for (const corrupt of [
    p => { p.reviewSha256 = '0'.repeat(64); }, p => { p.judgments = []; },
    p => { p.judgments[0].claimId = 'C2'; }, p => { p.judgments[0].comparison = ''; },
    p => { p.judgments[0].approved = true; }, p => { p.judgments[0].meaningPreserved = 'true'; },
  ]) {
    const r = await fixture({ at, corrupt });
    assert.equal(r.report.code, 'GRAMMAR_REVIEW_MALFORMED'); assert.equal(r.report.modelRequests, at + 1);
    assert.equal(r.report.completedCases, at); assert.equal(r.capture.calls.at(-1).response, null);
    assert.equal(r.capture.calls.at(-1).responseRejectedBeforeCapture, true);
  }
  let invoked = false;
  const r = await fixture({ mutateResult: r => {
    Object.defineProperty(r.editorialPayload.judgments[0], 'comparison', { get() { invoked = true; throw new Error('getter'); } });
    return r;
  } });
  assert.equal(r.report.code, 'GRAMMAR_REVIEW_MALFORMED'); assert.equal(invoked, false);
});

test('provider quota, redirect, errors and provenance drift stop without retry or model switch', async () => {
  for (const status of [302, 401, 403, 429, 500, 503]) for (const at of [0, 5, 10]) {
    const r = await fixture({ status, at });
    assert.equal(r.report.status, 'failed'); assert.equal(r.report.code, 'GRAMMAR_REVIEW_PROVIDER_FAILED');
    assert.equal(r.report.modelRequests, at + 1); assert.equal(r.report.completedCases, at);
  }
  for (const mutateResult of [r => ({ ...r, model: 'other' }), r => ({ ...r, provider: 'other' }),
    r => ({ ...r, attemptCount: 2 }), r => ({ ...r, requestSha256: '0'.repeat(64) }),
    r => ({ ...r, responseSha256: 'invalid' })]) {
    const r = await fixture({ mutateResult, at: 1 });
    assert.equal(r.report.code, 'GRAMMAR_REVIEW_PROVENANCE'); assert.equal(r.report.completedCases, 1);
  }
});

test('network guards reject bypasses, swallowed denials, repeat and delayed requests', async () => {
  for (const attack of ['endpoint', 'body', 'method', 'redirect', 'repeat', 'skip']) {
    const r = await fixture({ attack });
    assert.equal(r.report.code, 'GRAMMAR_REVIEW_NETWORK'); assert.equal(r.report.modelRequests, 1);
    assert.equal(r.report.networkRequests, attack === 'repeat' ? 1 : 0); assert.equal(r.report.completedCases, 0);
  }
  const r = await fixture();
  await assert.rejects(r.model[0].fetchImpl(endpoint, r.network[0].init), /GRAMMAR_REVIEW_NETWORK/);
  assert.equal(r.network.length, 11);
});

test('entrypoint encrypts exact audit and rejects article secrets or invalid configuration before inference', async () => {
  assert.equal(resolvePrivateWriterDiagnosticMode(mode), mode);
  const r = await fixture({ integration: true });
  assert.equal(r.sealed.version, 1); assert.deepEqual(r.capture.report, r.report);
  assert.deepEqual(r.capture.cases, controls); assert.equal(r.capture.capturedAt, base.now.toISOString());
  const visible = JSON.stringify({ report: r.report, sealed: r.sealed });
  assert.doesNotMatch(visible, /PRIVATE_REPLY_|previousClaims|PRIVATE_REASONING|private-grammar-fixture-token/);
  for (const c of controls) assert.ok(!visible.includes(c.rationale) && !visible.includes(c.input.previousClaims[0]));
  assert.ok(Buffer.byteLength(JSON.stringify(r.capture)) + 11 * 240 < 350000);
  for (const [override, code] of [
    [{ frozenBaselineB64: 'unexpected' }, 'DIAGNOSTIC_UNEXPECTED_BASELINE'],
    [{ savedFinalReviewB64: 'unexpected' }, 'DIAGNOSTIC_UNEXPECTED_SAVED_PACKET'],
    [{ apiToken: '' }, 'DIAGNOSTIC_CONFIGURATION_INVALID'],
    [{ publicKey: 'bad' }, 'DIAGNOSTIC_KEY_INVALID'],
  ]) await assert.rejects(diagnoseOneWriter({ ...base, mode, ...override,
    aiRequestImpl: () => assert.fail('Invalid configuration must not infer'),
    researchImpl: () => assert.fail('Must not research') }), new RegExp(code));
});

test('workflow isolates synthetic mode, tests before credentials and preserves existing authority and secret scope', async () => {
  const workflow = await readFile(new URL('../.github/workflows/private-writer-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /- grammar-preservation-controls/);
  assert.match(workflow, /timeout-minutes: \$\{\{ inputs.mode == 'definition-preservation-controls' && 15 \|\| \(inputs.mode == 'grammar-preservation-controls' \|\| inputs.mode == 'grammar-reasoning-controls' \|\| inputs.mode == 'grammar-reasoning-holdouts'\) && 10 \|\| 8 \}\}/);
  assert.ok(11 * 30 + 180 < 10 * 60);
  assert.ok(workflow.indexOf('Test synthetic grammar reviewer boundaries') < workflow.indexOf('secrets.CLOUDFLARE_AI_API_TOKEN'));
  assert.match(workflow, /node --test tests\/grammar-preservation-cases.test.mjs tests\/grammar-preservation-diagnostic.test.mjs/);
  assert.match(workflow, /github.actor == 'itworksinprod' && github.run_attempt == 1/);
  assert.match(workflow, /persist-credentials: false/); assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /RESEND|OPENAI_API_KEY|schedule:|contents: write|pull-requests: write/);
  assert.deepEqual([...new Set([...workflow.matchAll(/secrets\.([A-Z0-9_]+)/gu)].map(m => m[1]))].sort(),
    ['CLOUDFLARE_AI_API_TOKEN', 'FIRST_FOLD_CONTEXT_EDITOR_PACKET_B64', 'FIRST_FOLD_FINAL_REVIEW_PACKET_B64', 'FIRST_FOLD_FROZEN_BASELINE_B64', 'FIRST_FOLD_SENTENCE_REPAIR_B64']);
  assert.equal((workflow.match(/\(inputs.mode == 'context-two-unit-repair' \|\| inputs.mode == 'context-two-unit-plain-repair' \|\| inputs.mode == 'context-complete-repair' \|\| inputs.mode == 'context-span-repair'\) && secrets.FIRST_FOLD_SENTENCE_REPAIR_B64 \|\| ''/gu)??[]).length,2);
  assert.equal((workflow.match(/inputs.mode == 'saved-final-review' && secrets.FIRST_FOLD_FINAL_REVIEW_PACKET_B64 \|\| ''/gu) ?? []).length, 2);
  assert.equal((workflow.match(/\(inputs.mode == 'frozen-sentence-language' \|\| inputs.mode == 'frozen-definition-language' \|\| inputs.mode == 'frozen-vocabulary-language' \|\| inputs.mode == 'frozen-reasoning-language'\) && secrets.FIRST_FOLD_FROZEN_BASELINE_B64/gu) ?? []).length, 2);
});

test('reasoning reviewer comparison changes only fixed model identity and endpoint, not the eleven request bodies', async () => {
  const legacy = await fixture(), next = await fixture({ reasoningReviewer: true });
  assert.equal(next.report.mode, 'grammar-reasoning-controls-not-an-edition');
  assert.equal(next.report.reviewerModel, '@cf/openai/gpt-oss-120b');
  assert.equal(next.report.status, 'reviewer-controls-passed');
  const { mode: changedMode, reviewerModel, ...nextReport } = next.report;
  const { mode: oldMode, ...legacyReport } = legacy.report;
  assert.deepEqual(nextReport, legacyReport);
  for (const [i, request] of next.model.entries()) {
    const old = legacy.model[i];
    for (const key of ['messages', 'schema', 'maxTokens', 'maxAttempts', 'timeoutMs', 'temperature',
      'responseFormat', 'maxRequestBytes', 'maxResponseBytes']) assert.deepEqual(request[key], old[key]);
    assert.equal(request.model, FREE_REASONING_WRITER_MODEL);
    assert.equal(next.network[i].url, endpoint.replace(DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL));
    assert.equal(next.network[i].init.body, legacy.network[i].init.body);
    assert.equal(next.capture.calls[i].requestSha256, hash(JSON.stringify({
      provider: 'cloudflare-workers-ai', model: FREE_REASONING_WRITER_MODEL, body: next.network[i].body })));
    assert.notEqual(next.capture.calls[i].requestSha256, legacy.capture.calls[i].requestSha256);
    assert.equal(Object.hasOwn(next.network[i].body, 'reasoning_effort'), false);
  }
  assert.equal(DEFAULT_CLOUDFLARE_AI_MODEL, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(assertQualifiedDefinitionReviewer().model, DEFAULT_CLOUDFLARE_AI_MODEL);
});

test('reasoning reviewer wrong answers remain failed, without retries or scoring the ambiguous probe', async () => {
  for (const overrideMeaning of [true, false]) for (const probe of [true, false]) {
    const r = await fixture({ reasoningReviewer: true, overrideMeaning, probe });
    assert.equal(r.report.code, 'GRAMMAR_REVIEW_MISCLASSIFIED');
    assert.equal(r.report.modelRequests, 11); assert.equal(r.report.correctCases, overrideMeaning ? 4 : 6);
    assert.equal(r.report.cases.at(-1).passed, null);
  }
});

test('reasoning reviewer truncated, empty, malformed, quota or provider responses stop with unchanged budgets', async () => {
  for (const at of [0, 5, 10]) {
    for (const formatFailure of ['length', 'empty', 'json']) {
      const r = await fixture({ reasoningReviewer: true, at, formatFailure });
      assert.equal(r.report.code, 'GRAMMAR_REVIEW_PROVIDER_FAILED');
      assert.equal(r.report.modelRequests, at + 1); assert.equal(r.report.completedCases, at);
      assert.equal(r.report.failures[0].formatReason, formatFailure === 'length' ? 'OUTPUT_TOKEN_LIMIT'
        : formatFailure === 'empty' ? 'PAYLOAD_MISSING' : 'PAYLOAD_JSON_INVALID');
    }
    for (const status of [302, 403, 429, 503]) {
      const r = await fixture({ reasoningReviewer: true, at, status });
      assert.equal(r.report.code, 'GRAMMAR_REVIEW_PROVIDER_FAILED'); assert.equal(r.report.completedCases, at);
      assert.equal(r.report.modelRequests, at + 1);
    }
    const malformed = await fixture({ reasoningReviewer: true, at, corrupt: p => { p.reviewSha256 = '0'.repeat(64); } });
    assert.equal(malformed.report.code, 'GRAMMAR_REVIEW_MALFORMED'); assert.equal(malformed.report.completedCases, at);
  }
});

test('reasoning model cannot fall back to Llama, accept its provenance or bypass the exact request boundary', async () => {
  for (const attack of ['endpoint', 'old-model-endpoint', 'body', 'method', 'redirect', 'repeat', 'skip']) {
    const r = await fixture({ reasoningReviewer: true, attack });
    assert.equal(r.report.code, 'GRAMMAR_REVIEW_NETWORK'); assert.equal(r.report.modelRequests, 1);
    assert.equal(r.report.networkRequests, attack === 'repeat' ? 1 : 0);
  }
  for (const mutateResult of [r => ({ ...r, model: DEFAULT_CLOUDFLARE_AI_MODEL }),
    r => ({ ...r, requestSha256: '0'.repeat(64) }), r => ({ ...r, attemptCount: 2 })]) {
    const r = await fixture({ reasoningReviewer: true, mutateResult, at: 3 });
    assert.equal(r.report.code, 'GRAMMAR_REVIEW_PROVENANCE'); assert.equal(r.report.completedCases, 3);
    assert.equal(r.report.modelRequests, 4);
  }
  const r = await fixture({ reasoningReviewer: true });
  await assert.rejects(r.model[0].fetchImpl(r.network[0].url, r.network[0].init), /GRAMMAR_REVIEW_NETWORK/);
  assert.equal(r.network.length, 11);
});

test('reasoning mode encrypts only synthetic audit and rejects private article packets before inference', async () => {
  const nextMode = 'grammar-reasoning-controls';
  assert.equal(resolvePrivateWriterDiagnosticMode(nextMode), nextMode);
  const r = await fixture({ reasoningReviewer: true, integration: true });
  assert.equal(r.sealed.version, 1); assert.deepEqual(r.capture.report, r.report);
  assert.doesNotMatch(JSON.stringify({ report: r.report, sealed: r.sealed }), /PRIVATE_REPLY_|PRIVATE_REASONING|previousClaims/);
  for (const override of [{ frozenBaselineB64: 'unexpected' }, { savedFinalReviewB64: 'unexpected' }]) {
    await assert.rejects(diagnoseOneWriter({ ...base, mode: nextMode, ...override,
      aiRequestImpl: () => assert.fail('Must reject before model'), researchImpl: () => assert.fail('No research') }), /DIAGNOSTIC_UNEXPECTED/);
  }
  for (const reasoningReviewer of [null, 'true', 1, {}, []]) await assert.rejects(diagnoseGrammarPreservation({
    ...base, reasoningReviewer, aiRequestImpl: () => assert.fail('Must reject invalid profile') }), /GRAMMAR_REVIEW_PROFILE/);
  const workflow = await readFile(new URL('../.github/workflows/private-writer-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /- grammar-reasoning-controls/);
  assert.doesNotMatch(workflow, /grammar-reasoning-controls[^\n]*secrets\./);
});

test('fresh holdout mode is fixed to the frozen set, unchanged reviewer and prior single-attempt limits', async () => {
  const r = await fixture({ reasoningReviewer: true, holdouts: true, integration: true });
  const views = buildMeaningHoldoutViews(), known = await fixture({ reasoningReviewer: true });
  assert.equal(r.report.mode,'grammar-reasoning-holdouts-not-an-edition');
  assert.equal(r.report.reviewerModel,FREE_REASONING_WRITER_MODEL);
  assert.equal(r.report.status,'reviewer-controls-passed'); assert.equal(r.report.correctCases,10);
  assert.equal(r.report.caseSetSha256,MEANING_HOLDOUT_SHA256);
  assert.deepEqual(r.capture.cases,[...MEANING_HOLDOUT_CONTROLS,...MEANING_HOLDOUT_PROBES]);
  assert.equal(r.sealed.version,1);
  for(const [i,request] of r.model.entries()) {
    const {view}=views[i];
    assert.deepEqual(request.messages,[{role:'system',content:`${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`},
      {role:'user',content:JSON.stringify(view.data)}]);
    assert.deepEqual(request.schema,view.schema);
    for(const key of ['model','maxTokens','maxAttempts','timeoutMs','temperature','responseFormat','maxRequestBytes','maxResponseBytes'])
      assert.equal(request[key],known.model[i][key]);
    assert.equal(r.network[i].url,known.network[i].url);
    assert.equal(r.capture.calls[i].requestSha256,hash(JSON.stringify({provider:'cloudflare-workers-ai',
      model:FREE_REASONING_WRITER_MODEL,body:r.network[i].body})));
    assert.doesNotMatch(JSON.stringify(request.messages),/expectedMeaningPreserved|rationale|caseId|INJECTED_PROMPT|PRIVATE_REPLY_/);
  }
  assert.doesNotMatch(JSON.stringify({report:r.report,sealed:r.sealed}),/PRIVATE_REPLY_|previousClaims/);
  assert.equal(assertQualifiedDefinitionReviewer().model,DEFAULT_CLOUDFLARE_AI_MODEL);
});

test('fresh holdouts never retry a wrong answer or count either probe answer as a scored success', async () => {
  for(const probe of [true,false]) {
    const good=await fixture({reasoningReviewer:true,holdouts:true,probe});
    assert.equal(good.report.correctCases,10); assert.equal(good.report.status,'reviewer-controls-passed');
    assert.deepEqual(good.report.cases.at(-1),{caseId:'P02',valid:true,scored:false,passed:null,meaningPreserved:probe});
    for(const overrideMeaning of [true,false]) {
      const bad=await fixture({reasoningReviewer:true,holdouts:true,probe,overrideMeaning});
      assert.equal(bad.report.code,'GRAMMAR_REVIEW_MISCLASSIFIED'); assert.equal(bad.report.correctCases,5);
      assert.equal(bad.report.completedCases,11); assert.equal(bad.report.modelRequests,11);
    }
  }
});

test('fresh holdouts stop on malformed, truncated, quota, network or provenance failures, even for the probe', async () => {
  for(const at of [0,5,10]) for(const variant of [
    {formatFailure:'length'}, {formatFailure:'empty'}, {formatFailure:'json'}, {status:429},
    {corrupt:p=>{p.reviewSha256='0'.repeat(64);}}, {mutateResult:r=>({...r,model:DEFAULT_CLOUDFLARE_AI_MODEL})},
  ]) {
    const r=await fixture({reasoningReviewer:true,holdouts:true,at,...variant});
    assert.equal(r.report.status,'failed'); assert.equal(r.report.completedCases,at);
    assert.equal(r.report.modelRequests,at+1);
  }
  for(const attack of ['endpoint','old-model-endpoint','body','method','redirect','repeat','skip']) {
    const r=await fixture({reasoningReviewer:true,holdouts:true,attack});
    assert.equal(r.report.code,'GRAMMAR_REVIEW_NETWORK'); assert.equal(r.report.modelRequests,1);
    assert.equal(r.report.networkRequests,attack==='repeat'?1:0);
  }
  const r=await fixture({reasoningReviewer:true,holdouts:true});
  await assert.rejects(r.model[0].fetchImpl(r.network[0].url,r.network[0].init),/GRAMMAR_REVIEW_NETWORK/);
  assert.equal(r.network.length,11);
});

test('fresh holdout entrypoint rejects article inputs and nonfixed profiles before inference', async () => {
  const nextMode='grammar-reasoning-holdouts';
  assert.equal(resolvePrivateWriterDiagnosticMode(nextMode),nextMode);
  for(const override of [{frozenBaselineB64:'unexpected'},{savedFinalReviewB64:'unexpected'}]) {
    await assert.rejects(diagnoseOneWriter({...base,mode:nextMode,...override,
      aiRequestImpl:()=>assert.fail('No model call'),researchImpl:()=>assert.fail('No research')}),/DIAGNOSTIC_UNEXPECTED/);
  }
  for(const holdouts of [null,'true',1,{},[]]) await assert.rejects(diagnoseGrammarPreservation({
    ...base,reasoningReviewer:true,holdouts,aiRequestImpl:()=>assert.fail('Invalid profile')}),/GRAMMAR_REVIEW_PROFILE/);
  await assert.rejects(diagnoseGrammarPreservation({...base,holdouts:true,reasoningReviewer:false,
    aiRequestImpl:()=>assert.fail('No Llama holdout mode')}),/GRAMMAR_REVIEW_PROFILE/);
  const workflow=await readFile(new URL('../.github/workflows/private-writer-diagnostic.yml',import.meta.url),'utf8');
  assert.match(workflow,/- grammar-reasoning-holdouts/);
  assert.doesNotMatch(workflow,/grammar-reasoning-holdouts[^\n]*secrets\./);
  assert.ok(workflow.indexOf('tests/meaning-holdout-cases.test.mjs')<workflow.indexOf('secrets.CLOUDFLARE_AI_API_TOKEN'));
});
