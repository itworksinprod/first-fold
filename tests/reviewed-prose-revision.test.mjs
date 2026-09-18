import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { citationCorrectionFixture } from './fixtures/citation-correction.mjs';
import { REVIEWED_REVISION_PURPOSE, assertReviewedRevisionAuthority, sealReviewedRevisionPackage,
  openReviewedRevisionPackage, validateReviewedRevisionManifest, validateReviewedRevisionCipher,
  validateReviewedRevisionInput, reviseReviewedPreview, safeReviewedRevisionFailure } from '../scripts/automation/revise-reviewed-preview.mjs';
import { previewGeminiLite } from '../scripts/automation/preview-gemini-lite.mjs';
import { openDiagnostic } from '../scripts/automation/private-writer-diagnostic.mjs';
import { GEMINI_FREE_MODEL, GEMINI_LITE_MODEL } from '../scripts/automation/free/gemini-ai.mjs';
import { buildPreviewReviewPacket } from '../scripts/automation/free/preview-editorial-review.mjs';
import { FRESH_PREVIEW_WRITER_PROFILE } from '../scripts/automation/free/fresh-preview-writer-prompt.mjs';

const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const secret = randomBytes(32).toString('base64');
const now = new Date('2028-10-02T10:00:00.000Z');
const settings = { apiKey: 'synthetic-free-revision-key-not-real', freeProjectConfirmation: 'FREE PROJECT BILLING DISABLED' };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(count = 1) {
  const records = Array.from({ length: count }, (_, i) => {
    const { dossier, result } = citationCorrectionFixture();
    dossier.candidateId += `-${i}`;
    result.rejectedDiagnostic.payload.stories[0].candidateId = dossier.candidateId;
    dossier.sources[0].articleIdentity = { requestedUrl: 'https://example.com/announcement', finalUrl: 'https://example.com/announcement',
      title: 'Synthetic workspace announcement', bodySha256: 'a'.repeat(64), retrievedAt: '2028-10-02T09:05:00.000Z' };
    return { dossier, result, feedback: [{ field: 'deck', issue: 'The cited passage does not name Free accounts. Cite the actual first-phase passage and preserve its limits.' }] };
  });
  return { version: 'reviewed-prose-revision-input-v1', purpose: REVIEWED_REVISION_PURPOSE, testId: 'synthetic-revision-test',
    sourceRunId: '35302533558', sourceGitSha: 'b'.repeat(40), retrievedAt: '2028-10-02T09:00:00.000Z',
    expiresAt: '2028-10-02T15:00:00.000Z', publicKey, records };
}
function sealed(input = fixture()) {
  const sealed = sealReviewedRevisionPackage(input, secret);
  const manifest = { version: 'reviewed-prose-revision-manifest-v1', purpose: REVIEWED_REVISION_PURPOSE,
    ...Object.fromEntries(['testId', 'sourceRunId', 'sourceGitSha', 'retrievedAt', 'expiresAt'].map(k => [k, input[k]])),
    recordCount: input.records.length, inputSha256: sealed.inputSha256, cipherSha256: sealed.cipherSha256 };
  return { bytes: sealed.bytes, keyBase64: secret, manifest, now, clockImpl: () => new Date(now) };
}
function fixedPayload(record) {
  const payload = structuredClone(record.result.rejectedDiagnostic.payload);
  payload.evidenceForFields.deck.push('S1P4');
  return payload;
}
const response = (payload, model = GEMINI_FREE_MODEL) => new Response(JSON.stringify({ modelVersion: model,
  candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(payload) }] } }] }),
  { headers: { 'content-type': 'application/json' } });

test('revision manifest is closed until explicitly pinned; ciphertext has purpose and time bounds', () => {
  assert.throws(() => validateReviewedRevisionManifest(null, { now }), /MANIFEST_CLOSED/);
  const input = fixture(), item = sealed(input);
  assert.deepEqual(openReviewedRevisionPackage(item.bytes, secret, item.manifest, { now }), input);
  assert.doesNotMatch(item.bytes.toString(), /Acme|Synthetic workspace|first-phase passage/);
  for (const alteration of [{ purpose: 'email-send' }, { version: 'v2' }, { recordCount: 3 },
    { sourceGitSha: 'branch/main' }, { extra: true }]) {
    assert.throws(() => validateReviewedRevisionManifest({ ...item.manifest, ...alteration }, { now }));
  }
  for (const clock of ['2028-10-02T08:59:59.999Z', '2028-10-02T15:00:00.000Z']) {
    assert.throws(() => validateReviewedRevisionManifest(item.manifest, { now: new Date(clock) }), /EXPIRED/);
  }
  assert.throws(() => validateReviewedRevisionManifest({ ...item.manifest, expiresAt: '2028-10-02T15:00:00.001Z' }, { now }), /EXPIRED/);
  assert.throws(() => validateReviewedRevisionManifest(item.manifest, { now, testId: 'different-test' }), /MANIFEST_CLOSED/);
});

test('cipher changes, wrong secrets, purpose swaps and noncanonical encodings cannot decrypt', () => {
  const item = sealed(), changed = Buffer.from(item.bytes); changed[20] ^= 1;
  assert.throws(() => openReviewedRevisionPackage(changed, secret, item.manifest, { now }), /CIPHER_BINDING/);
  assert.throws(() => openReviewedRevisionPackage(item.bytes, randomBytes(32).toString('base64'), item.manifest, { now }), /DECRYPTION_FAILED/);
  assert.throws(() => openReviewedRevisionPackage(item.bytes, secret + '\n', item.manifest, { now }));
  for (const alteration of [{ purpose: 'first-fold-private-reviewed-email-test' }, { version: 2 },
    { inputSha256: 'c'.repeat(64) }, { iv: Buffer.alloc(13).toString('base64') }, { extra: true }]) {
    const bytes = Buffer.from(JSON.stringify({ ...JSON.parse(item.bytes), ...alteration }));
    assert.throws(() => validateReviewedRevisionCipher(bytes, { ...item.manifest, cipherSha256: digest(bytes) }, { now }));
  }
});

test('revision transport accepts only equivalent canonical 32-byte base64 or lowercase-hex keys', () => {
  const input = fixture(), item = sealed(input), hex = Buffer.from(secret, 'base64').toString('hex');
  assert.deepEqual(openReviewedRevisionPackage(item.bytes, hex, item.manifest, { now }), input);
  const viaHex = sealReviewedRevisionPackage(input, hex);
  const manifest = { ...item.manifest, inputSha256: viaHex.inputSha256, cipherSha256: viaHex.cipherSha256 };
  assert.equal(viaHex.inputSha256, item.manifest.inputSha256);
  assert.deepEqual(openReviewedRevisionPackage(viaHex.bytes, secret, manifest, { now }), input);
  assert.deepEqual(openReviewedRevisionPackage(viaHex.bytes, hex, manifest, { now }), input);
  const malformed = [null, {}, hex + '\n', ' ' + hex, '0x' + hex, hex.slice(1), hex + '0', 'g'.repeat(64),
    'AB'.repeat(32), 'a'.repeat(1_000_000), secret + '\n', secret.slice(0, -1), secret + '=',
    '-'.repeat(43) + '=', Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64')];
  for (const key of malformed) {
    assert.throws(() => sealReviewedRevisionPackage(input, key), /CIPHER_INVALID/);
    assert.throws(() => openReviewedRevisionPackage(item.bytes, key, item.manifest, { now }), /CIPHER_INVALID/);
  }
  assert.throws(() => openReviewedRevisionPackage(item.bytes, '00'.repeat(32), item.manifest, { now }), /DECRYPTION_FAILED/);
  const envelope = { ...JSON.parse(item.bytes), iv: '00'.repeat(12) };
  const bytes = Buffer.from(JSON.stringify(envelope));
  assert.throws(() => openReviewedRevisionPackage(bytes, hex, { ...item.manifest, cipherSha256: digest(bytes) }, { now }), /CIPHER_INVALID/);
});

test('only current main owner manual attempt one can run a revision', () => {
  const env = { GITHUB_REPOSITORY: 'itworksinprod/first-fold', GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: 'itworksinprod/first-fold/.github/workflows/gemini-reviewed-revision.yml@refs/heads/main',
    GITHUB_ACTOR: 'itworksinprod', GITHUB_TRIGGERING_ACTOR: 'itworksinprod', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1' };
  assert.doesNotThrow(() => assertReviewedRevisionAuthority(env));
  for (const field of Object.keys(env)) assert.throws(() => assertReviewedRevisionAuthority({ ...env, [field]: 'other' }), /AUTHORITY_REJECTED/);
});

test('input requires bounded trusted feedback, recent intact article identity and immutable original', () => {
  const mutate = [
    p => { p.records[0].feedback = []; },
    p => { p.records[0].feedback[0].field = 'systemPrompt'; },
    p => { p.records[0].feedback[0].issue = 'x'.repeat(1601); },
    p => { p.records[0].feedback.push(p.records[0].feedback[0]); },
    p => { p.records[0].result.report.approved = true; },
    p => { p.records[0].result.report.emailRequests = 1; },
    p => { p.records[0].result.rejectedDiagnostic.unapproved = false; },
    p => { p.records[0].result.rejectedDiagnostic.payload.stories[0].candidateId = 'other'; },
    p => { p.records[0].dossier.sources[0].articleIdentity.retrievedAt = '2028-10-02T03:59:59.000Z'; },
    p => { p.records[0].dossier.sources[0].articleIdentity.retrievedAt = '2028-10-02T10:00:01.000Z'; },
    p => { p.records[0].dossier.sources[0].articleIdentity.finalUrl = 'https://example.com/other'; },
    p => { p.records[0].dossier.sources[0].articleIdentity.requestedUrl = 'http://example.com/announcement'; },
    p => { p.records[0].dossier.sources[0].passages[0].text = 'Unbound replacement'; },
    p => { p.records[0].dossier.sources[0].passages[1].evidenceId = 'S1P1'; },
    p => { p.records[0].dossier.sources[0].text += '\nUpdate to V'; },
  ];
  for (const change of mutate) {
    const p = fixture(); change(p); const item = sealed(p);
    assert.throws(() => validateReviewedRevisionInput(p, item.manifest, { now }));
  }
  const p = fixture(), item = sealed(p);
  p.records[0].feedback[0].issue += ' altered';
  assert.throws(() => validateReviewedRevisionInput(p, item.manifest, { now }), /INPUT_BINDING/);
  const withGetter = fixture(); let invoked = false;
  Object.defineProperty(withGetter, 'records', { get() { invoked = true; return []; }, enumerable: true });
  assert.throws(() => sealReviewedRevisionPackage(withGetter, secret)); assert.equal(invoked, false);
});

test('preview model defaults to Lite but supports exact opt-in free model with truthful reports', async () => {
  const input = fixture(), record = input.records[0], payload = fixedPayload(record);
  for (const model of [undefined, GEMINI_LITE_MODEL, GEMINI_FREE_MODEL]) {
    let calls = 0; const selected = model ?? GEMINI_LITE_MODEL;
    const result = await previewGeminiLite({ ...settings, model, dossier: record.dossier, fresh: true,
      writerProfile: FRESH_PREVIEW_WRITER_PROFILE, fetchImpl: async (url, options) => {
        calls++; assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${selected}:generateContent`);
        assert.equal(options.redirect, 'error'); return response(payload, selected);
      } });
    assert.equal(calls, 1); assert.equal(result.report.model, selected);
    assert.equal(result.report.status, 'human-review-required'); assert.equal(result.report.approved, false);
  }
  for (const model of ['paid-model', '', null, true]) {
    const result = await previewGeminiLite({ ...settings, model, dossier: record.dossier, fetchImpl: () => assert.fail('unsupported model must not run') });
    assert.equal(result.report.status, 'failed'); assert.equal(result.report.model, null);
  }
});

test('two immutable source-bound revisions make at most one request each and remain unapproved', async () => {
  const input = fixture(2), item = sealed(input), before = structuredClone(input);
  let calls = 0;
  const output = await reviseReviewedPreview({ ...settings, ...item, fetchImpl: async (url, options) => {
    const record = before.records[calls++];
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FREE_MODEL}:generateContent`);
    const body = JSON.parse(options.body), prompt = JSON.parse(body.contents[0].parts[0].text);
    assert.equal(body.generationConfig.maxOutputTokens, 8000);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'medium');
    assert.equal(body.tools, undefined);
    assert.deepEqual(prompt.rejectedDraft, record.result.rejectedDiagnostic.payload);
    assert.deepEqual(prompt.validationFeedback, record.feedback.map(f => ({ reason: 'INDEPENDENT_EDITORIAL_REJECTION', feedback: { field: f.field, issue: f.issue } })));
    // Caller mutations while a request is pending cannot rewrite the baseline.
    input.records[0].dossier.sources[0].text = 'Mutated caller copy';
    return response(fixedPayload(record));
  } });
  assert.equal(calls, 2); assert.equal(output.report.status, 'human-review-required');
  assert.equal(output.report.modelRequests, 2); assert.equal(output.report.maxModelRequests, 2);
  assert.equal(output.report.freshResearch, false); assert.equal(output.report.emailRequests, 0);
  assert.equal(output.report.approved, false); assert.equal(output.report.qualified, false); assert.equal(output.report.productionEnabled, false);
  assert.equal(output.report.manualProseEdits, 0); assert.equal(output.report.articleRequests, 0); assert.equal(output.report.searchRequests, 0);
  const packet = openDiagnostic(output.sealed, pair.privateKey);
  assert.equal(packet.records.length, 2);
  for (const [i, r] of packet.records.entries()) {
    assert.deepEqual(r.dossier, before.records[i].dossier);
    assert.deepEqual(r.originalPayload, before.records[i].result.rejectedDiagnostic.payload);
    assert.deepEqual(r.feedback, before.records[i].feedback);
    assert.deepEqual(r.originalBinding, buildPreviewReviewPacket(r.originalPayload.stories[0], r.dossier, r.originalPayload.evidenceForFields).binding);
    assert.deepEqual(r.revisedBinding, buildPreviewReviewPacket(r.result.draft, r.dossier, r.result.evidenceForFields).binding);
    assert.equal(r.result.html, undefined); assert.equal(r.result.hasDraftPreview, true);
  }
  assert.doesNotMatch(JSON.stringify(output.report), /Acme|first-phase|synthetic-free/);
});

test('all validation gates still apply and a rejected revision stops before the second story', async () => {
  const input = fixture(2), item = sealed(input);
  for (const failure of ['quota', 'citation', 'certainty', 'malformed']) {
    let calls = 0;
    const output = await reviseReviewedPreview({ ...settings, ...item, fetchImpl: async () => {
      calls++;
      if (failure === 'quota') return new Response('private provider details', { status: 429 });
      const payload = failure === 'citation' ? input.records[0].result.rejectedDiagnostic.payload : fixedPayload(input.records[0]);
      if (failure === 'certainty') payload.stories[0].whyItMatters = 'This guarantees performance for everyone. Customers can see information about the workspace they operate and compare their current configuration with the listed requirements.';
      if (failure === 'malformed') payload.stories[0].claims[0].text = null;
      return response(payload);
    } });
    assert.equal(calls, 1, failure); assert.equal(output.report.status, 'failed', failure);
    assert.equal(output.report.draftCount, 0); assert.equal(output.report.emailRequests, 0);
    assert.doesNotMatch(JSON.stringify(output.report), /private provider details/);
    const packet = openDiagnostic(output.sealed, pair.privateKey);
    assert.equal(packet.records.length, 1); assert.equal(packet.records[0].result.hasDraftPreview, false);
    assert.equal(packet.records[0].revisedBinding, null);
  }
});

test('explicit reviewer feedback can revise an automatically clear draft without treating it as approval', async () => {
  const input = fixture(), record = input.records[0], fixed = fixedPayload(record);
  record.result = { report: { status: 'human-review-required', approved: false, qualified: false, productionEnabled: false, emailRequests: 0 },
    draft: fixed.stories[0], evidenceForFields: fixed.evidenceForFields };
  record.feedback = [{ field: 'headline', issue: 'The evidence map is valid, but confirm that the headline preserves the limited platform scope.' }];
  const item = sealed(input); let calls = 0;
  const result = await reviseReviewedPreview({ ...settings, ...item, fetchImpl: async () => { calls++; return response(fixed); } });
  assert.equal(calls, 1); assert.equal(result.report.status, 'human-review-required'); assert.equal(result.report.approved, false);
});

test('configuration and input rejection happen before any provider request', async () => {
  const item = sealed();
  for (const patch of [{ freeProjectConfirmation: 'yes' }, { apiKey: '' }, { testId: 'other' },
    { now: new Date('2028-10-03T10:00:00.000Z') }, { manifest: null }]) {
    await assert.rejects(reviseReviewedPreview({ ...settings, ...item, ...patch, fetchImpl: () => assert.fail('must not call') }));
  }
});

test('live expiry before a network request or after the first response produces a sealed hold with no second request', async () => {
  const input = fixture(2), item = sealed(input), expired = new Date(input.expiresAt);
  for (const phase of ['before-first', 'at-first-network', 'after-first-response', 'before-second']) {
    let calls = 0, clocks = 0, current = now;
    const clockImpl = () => {
      clocks++;
      if (phase === 'before-first' || phase === 'at-first-network' && clocks >= 2 || phase === 'before-second' && clocks >= 4) return expired;
      return current;
    };
    const output = await reviseReviewedPreview({ ...settings, ...item, clockImpl, fetchImpl: async () => {
      const payload = fixedPayload(input.records[calls++]);
      if (phase === 'after-first-response') current = expired;
      return response(payload);
    } });
    assert.equal(calls, phase === 'before-first' || phase === 'at-first-network' ? 0 : 1, phase);
    assert.equal(output.report.code, 'REVIEWED_REVISION_EXPIRED', phase);
    assert.equal(output.report.status, 'failed'); assert.equal(output.report.emailRequests, 0);
    assert.equal(output.report.approved, false); assert.equal(output.report.qualified, false);
    const packet = openDiagnostic(output.sealed, pair.privateKey);
    assert.equal(packet.report.modelRequests, calls);
    assert.equal(packet.report.code, 'REVIEWED_REVISION_EXPIRED');
  }
});

test('manual workflow exposes only revision secrets after tests and ciphertext checks, never mail or research', () => {
  const workflow = readFileSync(new URL('../.github/workflows/gemini-reviewed-revision.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/); assert.match(workflow, /github\.triggering_actor == 'itworksinprod'/);
  assert.match(workflow, /github\.run_attempt == 1/); assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/); assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /RESEND|OPENAI|TAVILY|schedule:|contents: write|pull_request|workflow_run/);
  assert.equal((workflow.match(/secrets\./gu) ?? []).length, 2);
  assert.ok(workflow.indexOf('npm test') < workflow.indexOf('--validate-only'));
  assert.ok(workflow.indexOf('--validate-only') < workflow.indexOf('secrets.'));
  assert.equal((workflow.match(/--human-review-only/gu) ?? []).length, 1);
});

test('CLI failure diagnostics allow only fixed revision codes and omit keys, provider text and crypto internals', () => {
  const sensitive = 'synthetic-private-key-and-provider-body';
  for (const code of ['REVIEWED_REVISION_CIPHER_INVALID', 'REVIEWED_REVISION_DECRYPTION_FAILED',
    'REVIEWED_REVISION_CONFIGURATION_INVALID', 'REVIEWED_REVISION_INPUT_BINDING', 'REVIEWED_REVISION_EXPIRED']) {
    const error = Object.assign(new Error(sensitive), { code, stack: sensitive, key: sensitive, body: sensitive });
    assert.equal(safeReviewedRevisionFailure(error), code);
    assert.doesNotMatch(safeReviewedRevisionFailure(error), /synthetic-private|provider-body/);
  }
  for (const error of [null, undefined, sensitive, new Error(sensitive), { code: sensitive },
    { code: 'REVIEWED_REVISION_' + sensitive }, { code: 'ERR_OSSL_BAD_DECRYPT', message: sensitive },
    { code: 'GEMINI_HTTP_ERROR', body: sensitive }, { code: { toString: () => sensitive } },
    { code: 'REVIEWED_REVISION_DECRYPTION_FAILED\n' + sensitive }]) {
    assert.equal(safeReviewedRevisionFailure(error), 'REVIEWED_REVISION_FAILED');
  }
  let getterCalled = false;
  const accessor = Object.defineProperty({}, 'code', { get() { getterCalled = true; throw Error(sensitive); } });
  assert.equal(safeReviewedRevisionFailure(accessor), 'REVIEWED_REVISION_FAILED');
  assert.equal(getterCalled, false);
  const script = readFileSync(new URL('../scripts/automation/revise-reviewed-preview.mjs', import.meta.url), 'utf8');
  assert.match(script, /console\.error\(`\$\{safeReviewedRevisionFailure\(error\)\}/);
  assert.doesNotMatch(script, /console\.error\([^\n]*(?:error\.message|error\.stack|JSON\.stringify\(error)/);
});
