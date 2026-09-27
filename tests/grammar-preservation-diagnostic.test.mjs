import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { diagnoseGrammarPreservation } from '../scripts/automation/grammar-preservation-diagnostic.mjs';
import { diagnoseOneWriter, openDiagnostic, resolvePrivateWriterDiagnosticMode } from '../scripts/automation/private-writer-diagnostic.mjs';
import { requestWorkersAiEditorial, buildWorkersAiRequest, DEFAULT_CLOUDFLARE_AI_MODEL } from '../scripts/automation/free/workers-ai.mjs';
import { GRAMMAR_PRESERVATION_CONTROLS, GRAMMAR_PRESERVATION_PROBES,
  GRAMMAR_CONTRAST_SHA256, buildGrammarPreservationViews } from '../scripts/automation/experiments/grammar-preservation-cases.mjs';

const mode = 'grammar-preservation-controls';
const controls = [...GRAMMAR_PRESERVATION_CONTROLS, ...GRAMMAR_PRESERVATION_PROBES];
const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
const base = { publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  accountId: '0'.repeat(32), apiToken: 'private-grammar-fixture-token', now: new Date('2026-09-27T01:00:00Z') };
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${base.accountId}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`;
const hash = text => createHash('sha256').update(text).digest('hex');

async function fixture({ integration = false, overrideMeaning, probe = false, corrupt, at = 0, status, mutateResult, attack } = {}) {
  const model = [], network = [];
  const options = { ...base, endpoint, sealDiagnostic: value => value,
    controls: [], model: 'unapproved', prompt: 'INJECTED_PROMPT', maxTokens: 16000, maxAttempts: 99,
    researchImpl: () => assert.fail('No research in a grammar control run'),
    aiRequestImpl: async request => {
      const index = model.length; model.push(request);
      const init = { method: 'POST', redirect: 'error', body: JSON.stringify(buildWorkersAiRequest(request).body) };
      if (attack && !['repeat', 'skip'].includes(attack)) {
        try { await request.fetchImpl(attack === 'endpoint' ? 'https://unapproved.example/' : endpoint,
          { ...init, ...(attack === 'body' ? { body: '{}' } : {}), ...(attack === 'method' ? { method: 'GET' } : {}),
            ...(attack === 'redirect' ? { redirect: 'follow' } : {}) }); } catch { /* Denial must stick. */ }
      }
      if (attack === 'skip') return { provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL,
        requestSha256: 'a'.repeat(64), responseSha256: 'b'.repeat(64), attemptCount: 1, editorialPayload: {} };
      const result = await requestWorkersAiEditorial(request);
      if (attack === 'repeat') { try { await request.fetchImpl(endpoint, init); } catch { /* Terminal. */ } }
      return mutateResult && index === at ? mutateResult(result) : result;
    },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body), data = JSON.parse(body.messages[1].content), index = network.length;
      network.push({ url, init, body, data });
      if (status && index === at) return new Response(JSON.stringify({ success: false,
        errors: [{ code: 9999, message: `PRIVATE_PROVIDER_DETAIL ${base.apiToken}` }] }),
      { status, headers: { 'content-type': 'application/json' } });
      const meaning = index === 10 ? probe : overrideMeaning ?? controls[index].expectedMeaningPreserved;
      const payload = { reviewSha256: data.reviewSha256, judgments: data.claims.map(({ claimId }) => ({ claimId,
        comparison: `PRIVATE_REPLY_${index}: mock plumbing verdict, not semantic evidence.`, meaningPreserved: meaning })) };
      if (corrupt && index === at) corrupt(payload);
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload),
        reasoning_content: 'PRIVATE_REASONING' }, errors: [] }), { headers: { 'content-type': 'application/json' } });
    } };
  const r = integration ? await diagnoseOneWriter({ ...options, mode }) : await diagnoseGrammarPreservation(options);
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
  assert.match(workflow, /timeout-minutes: \$\{\{ inputs.mode == 'definition-preservation-controls' && 15 \|\| inputs.mode == 'grammar-preservation-controls' && 10 \|\| 8 \}\}/);
  assert.ok(11 * 30 + 180 < 10 * 60);
  assert.ok(workflow.indexOf('Test synthetic grammar reviewer boundaries') < workflow.indexOf('secrets.CLOUDFLARE_AI_API_TOKEN'));
  assert.match(workflow, /node --test tests\/grammar-preservation-cases.test.mjs tests\/grammar-preservation-diagnostic.test.mjs/);
  assert.match(workflow, /github.actor == 'itworksinprod' && github.run_attempt == 1/);
  assert.match(workflow, /persist-credentials: false/); assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /RESEND|OPENAI_API_KEY|schedule:|contents: write|pull-requests: write/);
  assert.deepEqual([...new Set([...workflow.matchAll(/secrets\.([A-Z0-9_]+)/gu)].map(m => m[1]))].sort(),
    ['CLOUDFLARE_AI_API_TOKEN', 'FIRST_FOLD_FINAL_REVIEW_PACKET_B64', 'FIRST_FOLD_FROZEN_BASELINE_B64']);
  assert.equal((workflow.match(/inputs.mode == 'saved-final-review' && secrets.FIRST_FOLD_FINAL_REVIEW_PACKET_B64 \|\| ''/gu) ?? []).length, 2);
  assert.equal((workflow.match(/\(inputs.mode == 'frozen-sentence-language' \|\| inputs.mode == 'frozen-definition-language' \|\| inputs.mode == 'frozen-vocabulary-language' \|\| inputs.mode == 'frozen-reasoning-language'\) && secrets.FIRST_FOLD_FROZEN_BASELINE_B64/gu) ?? []).length, 2);
});
