import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { diagnoseIsolatedPreservation } from '../scripts/automation/isolated-preservation-diagnostic.mjs';
import { diagnoseOneWriter, openDiagnostic, resolvePrivateWriterDiagnosticMode } from '../scripts/automation/private-writer-diagnostic.mjs';
import { requestWorkersAiEditorial, buildWorkersAiRequest, DEFAULT_CLOUDFLARE_AI_MODEL } from '../scripts/automation/free/workers-ai.mjs';
import { DEFINITION_PRESERVATION_CONTROLS as controls, DEFINITION_CASESET_SHA256 } from '../scripts/automation/experiments/definition-preservation-cases.mjs';
import { loadDefinitionGlossary, SYNTHETIC_DEFINITION_SOURCE } from '../scripts/automation/experiments/definition-glossaries.mjs';
import { buildDefinitionPreservationReview } from '../scripts/automation/experiments/definition-preservation.mjs';
import { buildIsolatedPreservationReview } from '../scripts/automation/free/isolated-preservation-review.mjs';

const mode = 'definition-preservation-controls';
const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
const base = { publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  accountId: '0'.repeat(32), apiToken: 'private-definition-fixture-token', now: new Date('2026-09-25T20:00:00Z') };
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${base.accountId}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`;
const hash = text => createHash('sha256').update(text).digest('hex');
const glossary = loadDefinitionGlossary('synthetic-generation-definitions-v1', SYNTHETIC_DEFINITION_SOURCE);
const schedule = controls.flatMap(control => ['source', 'meaning'].map(dimension => ({ control, dimension })));

async function fixture({ integration = false, overrideSource, overrideMeaning, corrupt, at = 0, status, mutateResult, attack } = {}) {
  const model = [], network = [];
  const options = { ...base, endpoint, definitionContext: true, sealDiagnostic: value => value,
    // None of these caller-supplied values may change a fixed trial.
    controls: [], cases: [], glossary: {}, model: 'unapproved', prompt: 'INJECTED_PROMPT',
    maxTokens: 16000, maxAttempts: 99, timeoutMs: 999999,
    researchImpl: () => assert.fail('No research or article generation in a reviewer-control run'),
    aiRequestImpl: async request => {
      const index = model.length; model.push(request);
      const init = { method: 'POST', redirect: 'error', body: JSON.stringify(buildWorkersAiRequest(request).body) };
      if (attack && !['repeat', 'skip'].includes(attack)) {
        try { await request.fetchImpl(attack === 'endpoint' ? 'https://unapproved.example/' : endpoint,
          { ...init, ...(attack === 'body' ? { body: '{}' } : {}), ...(attack === 'method' ? { method: 'GET' } : {}),
            ...(attack === 'redirect' ? { redirect: 'follow' } : {}) }); } catch { /* A swallowed denial must stick. */ }
      }
      if (attack === 'skip') return { provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL,
        requestSha256: 'a'.repeat(64), responseSha256: 'b'.repeat(64), attemptCount: 1, editorialPayload: {} };
      const result = await requestWorkersAiEditorial(request);
      if (attack === 'repeat') { try { await request.fetchImpl(endpoint, init); } catch { /* Must remain terminal. */ } }
      return mutateResult && index === at ? mutateResult(result) : result;
    },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body), data = JSON.parse(body.messages[1].content), index = network.length;
      network.push({ url, init, body, data });
      const { control, dimension } = schedule[index];
      if (status && index === at) return new Response(JSON.stringify({ success: false,
        errors: [{ code: 9999, message: `PRIVATE_PROVIDER_DETAIL ${base.apiToken}` }] }),
      { status, headers: { 'content-type': 'application/json' } });
      const source = overrideSource ?? control.expectedSourceSupported;
      const meaning = overrideMeaning ?? control.expectedMeaningPreserved;
      const payload = { reviewSha256: data.reviewSha256, judgments: data.claims.map(({ claimId }) => ({ claimId,
        comparison: `PRIVATE_REPLY_${index}: simulated plumbing response, not model qualification.`,
        ...(dimension === 'source' ? { evidenceIds: source ? ['S1P1'] : [], sourceSupported: source }
          : { meaningPreserved: meaning }) })) };
      if (corrupt && index === at) corrupt(payload);
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload),
        reasoning_content: 'PRIVATE_REASONING' }, errors: [] }), { headers: { 'content-type': 'application/json' } });
    } };
  const result = integration ? await diagnoseOneWriter({ ...options, mode }) : await diagnoseIsolatedPreservation(options);
  const capture = integration ? openDiagnostic(result.sealed, pair.privateKey) : result.sealed;
  assert.equal(result.report.modelRequests, model.length); assert.equal(result.report.networkRequests, network.length);
  assert.equal(result.report.outputBudget, model.length * 600);
  assert.equal(result.report.emailSent, false); assert.equal(result.report.searchQueries, 0);
  assert.equal(result.report.maximumModelRequests, 22); assert.equal(result.report.maximumOutputBudget, 13200);
  assert.ok(model.length <= 22 && network.length <= 22);
  assert.doesNotMatch(JSON.stringify({ report: result.report, capture }), /PRIVATE_PROVIDER_DETAIL|PRIVATE_REASONING|private-definition-fixture-token/);
  return { ...result, capture, model, network };
}

test('eleven fixed controls get exactly twenty-two separate bound reviews without expected-label leakage', async () => {
  const r = await fixture();
  assert.equal(r.report.status, 'reviewer-controls-passed'); assert.equal(r.report.code, null);
  assert.equal(r.report.modelRequests, 22); assert.equal(r.report.networkRequests, 22); assert.equal(r.report.outputBudget, 13200);
  assert.equal(r.report.totalCases, 11); assert.equal(r.report.completedCases, 11); assert.equal(r.report.correctCases, 11);
  assert.equal(r.report.caseSetSha256, DEFINITION_CASESET_SHA256);
  assert.equal(r.report.glossarySourceSha256, glossary.sourceSha256);
  assert.equal(r.report.glossaryManifestSha256, glossary.manifestSha256);
  assert.equal(r.report.mode, `${mode}-not-an-edition`);
  assert.equal(Object.hasOwn(r.report, 'localIdentityReviews'), false);
  assert.deepEqual(r.capture.results.filter(c => c.supported).map(c => c.caseId), ['G01', 'G02']);
  assert.deepEqual(r.capture.calls.map(c => [c.caseId, c.dimension]), schedule.map(c => [c.control.caseId, c.dimension]));
  for (const [index, request] of r.model.entries()) {
    const { control, dimension } = schedule[index];
    const view = dimension === 'meaning' ? buildDefinitionPreservationReview(control.input, glossary)
      : buildIsolatedPreservationReview(control.input, 'source');
    const prompt = `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
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
    assert.doesNotMatch(serialized, /"caseId"|"rationale"|expectedSourceSupported|expectedMeaningPreserved|PRIVATE_REPLY_|INJECTED_PROMPT/);
    for (const c of controls) assert.ok(!serialized.includes(c.rationale));
    assert.equal(Object.hasOwn(view.data, 'previousClaims'), dimension === 'meaning');
    assert.equal(Object.hasOwn(view.data, 'definitions'), dimension === 'meaning');
    assert.equal(Object.hasOwn(view.data, 'passages'), dimension === 'source');
  }
});

test('every dimension is scored, and wrong semantic answers never get retries or partial qualification', async () => {
  for (const overrideSource of [false, true]) for (const overrideMeaning of [false, true]) {
    const r = await fixture({ overrideSource, overrideMeaning });
    assert.equal(r.report.status, 'failed'); assert.equal(r.report.code, 'PRESERVATION_REVIEW_MISCLASSIFIED');
    assert.equal(r.report.modelRequests, 22); assert.equal(r.report.completedCases, 11);
    assert.equal(r.report.correctCases, controls.filter(c => c.expectedSourceSupported === overrideSource && c.expectedMeaningPreserved === overrideMeaning).length);
    assert.deepEqual(r.capture.results.map(c => c.supported), Array(11).fill(overrideSource && overrideMeaning));
  }
});

test('malformed or incomplete replies stop at either role and preserve completed earlier cases', async () => {
  for (const at of [0, 1, 2, 3, 21]) for (const corrupt of [
    p => { p.reviewSha256 = '0'.repeat(64); }, p => { p.judgments = []; },
    p => { p.judgments[0].claimId = 'C2'; }, p => { p.judgments[0].comparison = ''; },
    p => { p.judgments[0].approved = true; },
  ]) {
    const r = await fixture({ at, corrupt });
    assert.equal(r.report.code, 'PRESERVATION_REVIEW_MALFORMED');
    assert.equal(r.report.modelRequests, at + 1); assert.equal(r.report.completedCases, Math.floor(at / 2));
    assert.equal(r.capture.calls.at(-1).response, null); assert.equal(r.capture.calls.at(-1).responseRejectedBeforeCapture, true);
  }
});

test('quota, provider errors, redirects and provenance drift cannot pass or switch providers', async () => {
  for (const status of [302, 401, 403, 429, 500, 503]) for (const at of [0, 1, 8]) {
    const r = await fixture({ status, at });
    assert.equal(r.report.status, 'failed'); assert.equal(r.report.code, 'PRESERVATION_REVIEW_PROVIDER_FAILED');
    assert.equal(r.report.modelRequests, at + 1); assert.equal(r.report.networkRequests, at + 1);
    assert.equal(r.report.completedCases, Math.floor(at / 2));
  }
  for (const mutateResult of [
    r => ({ ...r, model: 'unapproved' }), r => ({ ...r, provider: 'other' }),
    r => ({ ...r, attemptCount: 2 }), r => ({ ...r, requestSha256: '0'.repeat(64) }),
    r => ({ ...r, responseSha256: 'invalid' }),
  ]) {
    const r = await fixture({ mutateResult, at: 1 });
    assert.equal(r.report.code, 'PRESERVATION_REVIEW_PROVENANCE'); assert.equal(r.report.completedCases, 0);
    assert.equal(r.report.modelRequests, 2);
  }
});

test('network guards reject bypasses, swallowed denials, repeats and delayed calls', async () => {
  for (const attack of ['endpoint', 'body', 'method', 'redirect', 'repeat', 'skip']) {
    const r = await fixture({ attack });
    assert.equal(r.report.code, 'PRESERVATION_REVIEW_NETWORK'); assert.equal(r.report.modelRequests, 1);
    assert.equal(r.report.networkRequests, attack === 'repeat' ? 1 : 0); assert.equal(r.report.completedCases, 0);
  }
  const r = await fixture(), request = r.model[0], previousCount = r.network.length;
  await assert.rejects(request.fetchImpl(endpoint, r.network[0].init), /PRESERVATION_REVIEW_NETWORK/);
  assert.equal(r.network.length, previousCount);
});

test('CLI mode retains owner/manual authority and encrypts all prompts and responses', async () => {
  assert.equal(resolvePrivateWriterDiagnosticMode(mode), mode);
  const r = await fixture({ integration: true });
  assert.equal(r.sealed.version, 1); assert.deepEqual(r.capture.report, r.report);
  assert.deepEqual(r.capture.cases, controls); assert.equal(r.capture.capturedAt, base.now.toISOString());
  const visible = JSON.stringify({ report: r.report, sealed: r.sealed });
  assert.doesNotMatch(visible, /PRIVATE_REPLY_|previousClaims|passages|PRIVATE_REASONING|private-definition-fixture-token/);
  for (const c of controls) assert.ok(!visible.includes(c.rationale) && !visible.includes(c.input.text));
  // Even maximum schema-valid comparisons fit the existing encrypted-size cap.
  assert.ok(Buffer.byteLength(JSON.stringify(r.capture)) + 22 * 240 < 350000);
  for (const flags of [{ definitionContext: 'true' }, { definitionContext: null },
    { definitionContext: true, holdout: true }, { definitionContext: true, textOnly: true },
    { definitionContext: true, paraphrase: true }]) {
    await assert.rejects(diagnoseIsolatedPreservation({ ...flags,
      aiRequestImpl: () => assert.fail('Invalid profile must fail before inference') }), /PRESERVATION_REVIEW_PROFILE/);
  }
});

test('workflow tests the new mode before credentials and grants neither delivery access nor new secrets', async () => {
  const workflow = await readFile(new URL('../.github/workflows/private-writer-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /- definition-preservation-controls/);
  assert.match(workflow, /timeout-minutes: \$\{\{ inputs.mode == 'definition-preservation-controls' && 15 \|\| 8 \}\}/);
  assert.ok(22 * 30 + 180 < 15 * 60, 'Per-call worst case leaves setup/artifact time');
  assert.ok(workflow.indexOf('Test definition-aware reviewer boundaries') < workflow.indexOf('secrets.CLOUDFLARE_AI_API_TOKEN'));
  assert.match(workflow, /node --test tests\/definition-preservation.test.mjs tests\/definition-preservation-diagnostic.test.mjs/);
  assert.match(workflow, /github.actor == 'itworksinprod' && github.run_attempt == 1/);
  assert.match(workflow, /persist-credentials: false/); assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /RESEND|OPENAI_API_KEY|schedule:|contents: write|pull-requests: write/);
  const secrets = [...workflow.matchAll(/secrets\.([A-Z0-9_]+)/gu)].map(m => m[1]);
  assert.deepEqual([...new Set(secrets)].sort(), ['CLOUDFLARE_AI_API_TOKEN', 'FIRST_FOLD_FROZEN_BASELINE_B64']);
  assert.equal((workflow.match(/inputs.mode == 'frozen-sentence-language' && secrets.FIRST_FOLD_FROZEN_BASELINE_B64/gu) ?? []).length, 2);
});
