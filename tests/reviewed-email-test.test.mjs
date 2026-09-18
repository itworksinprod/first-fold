import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { correctedGooglePreview } from './fixtures/corrected-google-preview.mjs';
import { buildPreviewReviewPacket } from '../scripts/automation/free/preview-editorial-review.mjs';
import { captureStructuredArticle } from '../scripts/automation/free/structured-article-evidence.mjs';
import { prepareReviewedPreviewEmail, REVIEWED_EMAIL_TEST_VERSION, REVIEWED_EMAIL_TEST_CONFIRMATION } from '../scripts/automation/reviewed-preview-email.mjs';
import { REVIEWED_EMAIL_TEST_MANIFEST } from '../scripts/automation/reviewed-email-test-manifest.mjs';
import { sealReviewedEmailTestPackage, openReviewedEmailTestPackage, assertReviewedEmailTestContext, runReviewedEmailTest,
  REVIEWED_TEST_ARTIFACT_PATH, REVIEWED_TEST_PACKAGE_VERSION, REVIEWED_TEST_MANIFEST_VERSION } from '../scripts/automation/reviewed-email-test.mjs';

const hash = x => createHash('sha256').update(x).digest('hex');
const current = new Date('2026-09-18T03:20:00.000Z');
const sourceRunId = '12345678', sourceGitSha = 'a'.repeat(40), headSha = 'b'.repeat(40);
const key = Buffer.alloc(32, 7).toString('base64');
const url = 'https://workspaceupdates.googleblog.com/2026/09/connect-to-google-meet-hardware-with-room-codes.html';
const escape = x => x.replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const env = () => ({ GITHUB_REPOSITORY: 'itworksinprod/first-fold', GITHUB_REF: 'refs/heads/main',
  GITHUB_ACTOR: 'itworksinprod', GITHUB_TRIGGERING_ACTOR: 'itworksinprod', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '23456789', GITHUB_SHA: headSha, GITHUB_WORKFLOW_SHA: headSha,
  GITHUB_WORKFLOW_REF: 'itworksinprod/first-fold/.github/workflows/reviewed-email-test.yml@refs/heads/main' });

async function fixture(researchMode = 'fresh-research') {
  const x = correctedGooglePreview(), source = x.dossier.sources[0];
  const title = source.passages[0].text;
  const page = { finalUrl: url, redirects: [], retrievedAt: '2026-09-18T03:01:00.000Z',
    body: `<html><head><link rel="canonical" href="${url}"></head><body><article><h1>${escape(title)}</h1>${source.passages.slice(1).map(p => `<p>${escape(p.text)}</p>`).join('')}</article></body></html>` };
  const capture = await captureStructuredArticle({ url, publisherKey: source.publisherKey, title }, async () => page);
  assert.equal(capture.status, 'usable');
  source.passages = capture.blocks.map((text, index) => ({ evidenceId: `S1P${index + 1}`, text }));
  source.text = capture.excerpt;
  source.articleIdentity = { ...capture.identity, inspectedAt: '2026-09-18T03:01:01.000Z' };
  const packet = buildPreviewReviewPacket(x.draft, x.dossier, x.evidenceForFields);
  assert.deepEqual(packet.holds, []);
  // Unit-test controls only, not a real editorial approval or fresh report.
  const review = { version: packet.version, binding: packet.binding,
    reviewer: { kind: 'independent-ai', name: 'SYNTHETIC TEST ONLY', reference: 'synthetic-contract-control' },
    reviewedAt: '2026-09-18T03:05:00.000Z', fullContextChecked: true, renderedContentChecked: true,
    limitations: ['Synthetic test fixture; not factual approval.'],
    fields: packet.units.map(u => ({ field: u.field, supportedByMappedPassages: true, conditionsPreserved: true,
      noUnsupportedInference: true, rationale: 'Synthetic test control only.' })) };
  const input = { editionDate: '2026-09-17', researchMode, stories: [{ packet, review,
    sources: [{ sourceId: source.sourceId, publisher: source.publisher, url }] }] };
  const full = { version: REVIEWED_TEST_PACKAGE_VERSION, input, metadata: { sourceRunId, sourceGitSha,
    retrievedAt: '2026-09-18T03:00:00.000Z', reportingWindow: { startInclusive: '2026-09-15T03:00:00.000Z',
      endExclusive: '2026-09-18T03:00:00.000Z', displayLabel: 'Manual rolling 72-hour research preview' },
    recipientSha256: hash('owner@example.com'), captures: [{ candidateId: x.draft.candidateId, sourceId: source.sourceId,
      identity: source.articleIdentity, sourceTextSha256: hash(source.text) }] } };
  const prepared = prepareReviewedPreviewEmail(input);
  const authorization = { version: REVIEWED_EMAIL_TEST_VERSION, purpose: 'one-shot-reviewed-email-test',
    confirmation: REVIEWED_EMAIL_TEST_CONFIRMATION, testId: 'synthetic-transport-test', editionDate: input.editionDate,
    researchMode: input.researchMode, storyCount: prepared.storyCount, contentSha256: prepared.contentSha256,
    reviewSha256: prepared.reviewSha256, issuedAt: '2026-09-18T03:10:00.000Z', expiresAt: '2026-09-18T04:00:00.000Z',
    recipientSource: 'PERSONAL_PAPER_EMAIL', emailRequests: 1, dailyDelivery: false, publicEdition: false, enableBilling: false };
  const sealed = sealReviewedEmailTestPackage(full, key, authorization.testId);
  const manifest = { version: REVIEWED_TEST_MANIFEST_VERSION, cipherSha256: sealed.cipherSha256,
    inputSha256: sealed.inputSha256, sourceRunId, sourceGitSha, authorization };
  return { full, page, prepared, manifest, artifact: sealed.bytes };
}
function options(x, extras = {}) {
  return { mode: '--validate', artifact: x.artifact, key, manifest: x.manifest, env: env(), headSha,
    now: current, clock: () => current, pageFetcher: async () => structuredClone(x.page), ...extras };
}
function repack(x) {
  const sealed = sealReviewedEmailTestPackage(x.full, key, x.manifest.authorization.testId);
  x.artifact = sealed.bytes; x.manifest.cipherSha256 = sealed.cipherSha256; x.manifest.inputSha256 = sealed.inputSha256;
}

test('encrypted transport is closed by default and publishes no plaintext authorization', () => {
  // null is the shipped inactive state. An explicitly activated test must keep
  // both its trusted manifest and nested authorization immutable.
  if (REVIEWED_EMAIL_TEST_MANIFEST !== null) {
    assert.ok(Object.isFrozen(REVIEWED_EMAIL_TEST_MANIFEST));
    assert.ok(Object.isFrozen(REVIEWED_EMAIL_TEST_MANIFEST.authorization));
  }
  assert.throws(() => assertReviewedEmailTestContext(null, env(), headSha, current), /MANIFEST_INVALID/);
  assert.equal(REVIEWED_TEST_ARTIFACT_PATH, 'content/private-tests/reviewed-email-test.encrypted.json');
});

test('AES-GCM round trip binds ciphertext, full input, test identity and canonical base64', async () => {
  const x = await fixture();
  assert.deepEqual(openReviewedEmailTestPackage(x.artifact, key, x.manifest), x.full);
  assert.ok(!x.artifact.toString().includes('Google'));
  assert.ok(!x.artifact.toString().includes('owner@example.com'));
  const changed = Buffer.from(x.artifact); changed[10] ^= 1;
  assert.throws(() => openReviewedEmailTestPackage(changed, key, x.manifest), /CIPHER_CHANGED/);
  assert.throws(() => openReviewedEmailTestPackage(x.artifact, randomBytes(32).toString('base64'), x.manifest), /DECRYPTION_FAILED/);
  const differentTest = structuredClone(x.manifest); differentTest.authorization.testId = 'different-test-id';
  assert.throws(() => openReviewedEmailTestPackage(x.artifact, key, differentTest), /DECRYPTION_FAILED/);
  for (const bad of [key + '\n', key.replace(/=$/u, ''), 'a'.repeat(44), Buffer.alloc(31).toString('base64')]) {
    assert.throws(() => openReviewedEmailTestPackage(x.artifact, bad, x.manifest), /ENCODING_INVALID/);
  }
  const envelope = JSON.parse(x.artifact); envelope.tag = Buffer.alloc(16).toString('base64');
  const bytes = Buffer.from(JSON.stringify(envelope));
  assert.throws(() => openReviewedEmailTestPackage(bytes, key, { ...x.manifest, cipherSha256: hash(bytes) }), /DECRYPTION_FAILED/);
});

test('email transport accepts only equivalent canonical 32-byte base64 or lowercase-hex keys', async () => {
  const x = await fixture(), hex = Buffer.from(key, 'base64').toString('hex');
  assert.deepEqual(openReviewedEmailTestPackage(x.artifact, hex, x.manifest), x.full);
  const viaHex = sealReviewedEmailTestPackage(x.full, hex, x.manifest.authorization.testId);
  const manifest = { ...x.manifest, inputSha256: viaHex.inputSha256, cipherSha256: viaHex.cipherSha256 };
  assert.equal(viaHex.inputSha256, x.manifest.inputSha256);
  assert.deepEqual(openReviewedEmailTestPackage(viaHex.bytes, key, manifest), x.full);
  assert.deepEqual(openReviewedEmailTestPackage(viaHex.bytes, hex, manifest), x.full);
  const malformed = [null, {}, hex + '\n', ' ' + hex, '0x' + hex, hex.slice(1), hex + '0', 'g'.repeat(64),
    'AB'.repeat(32), 'a'.repeat(1_000_000), key + '\n', key.slice(0, -1), key + '=',
    '-'.repeat(43) + '=', Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64')];
  for (const candidate of malformed) {
    assert.throws(() => sealReviewedEmailTestPackage(x.full, candidate, x.manifest.authorization.testId), /ENCODING_INVALID/);
    assert.throws(() => openReviewedEmailTestPackage(x.artifact, candidate, x.manifest), /ENCODING_INVALID/);
  }
  assert.throws(() => openReviewedEmailTestPackage(x.artifact, '00'.repeat(32), x.manifest), /DECRYPTION_FAILED/);
  const envelope = { ...JSON.parse(x.artifact), iv: '00'.repeat(12) };
  const bytes = Buffer.from(JSON.stringify(envelope));
  assert.throws(() => openReviewedEmailTestPackage(bytes, hex, { ...x.manifest, cipherSha256: hash(bytes) }), /ENCODING_INVALID/);
});

test('bounds artifacts and rejects hooks and unknown envelope keys', async () => {
  const x = await fixture();
  assert.throws(() => openReviewedEmailTestPackage(Buffer.alloc(2 * 1024 * 1024 + 1), key, x.manifest), /ARTIFACT_INVALID/);
  let ran = false;
  assert.throws(() => sealReviewedEmailTestPackage({ toJSON() { ran = true; return {}; } }, key, 'test-fixture-only'), /INPUT_INVALID/);
  const obj = {}; Object.defineProperty(obj, 'secret', { get() { ran = true; } });
  assert.throws(() => sealReviewedEmailTestPackage(obj, key, 'test-fixture-only'), /INPUT_INVALID/);
  assert.equal(ran, false);
  const bytes = Buffer.from(JSON.stringify({ ...JSON.parse(x.artifact), extra: true }));
  assert.throws(() => openReviewedEmailTestPackage(bytes, key, { ...x.manifest, cipherSha256: hash(bytes) }), /ENVELOPE_INVALID/);
});

test('validates full unchanged review and freshly re-captured text with no email credentials or send', async () => {
  const x = await fixture(); let fetches = 0, sends = 0;
  const result = await runReviewedEmailTest(options(x, {
    pageFetcher: async item => { fetches++; assert.equal(item.url, url); return structuredClone(x.page); },
    sender: async () => { sends++; },
  }));
  assert.deepEqual(result, { status: 'validated', storyCount: 1, emailRequests: 0 });
  assert.equal(fetches, 1); assert.equal(sends, 0);
});

test('recent stored-evidence revisions retain their honest label and every source/review/send gate', async () => {
  const x = await fixture('stored-evidence'); let fetches = 0, sends = 0;
  assert.equal(x.prepared.researchMode, 'stored-evidence');
  const result = await runReviewedEmailTest(options(x, { mode: '--send',
    env: { ...env(), PERSONAL_PAPER_EMAIL: 'owner@example.com', RESEND_API_KEY: 're_test_only_key' },
    pageFetcher: async () => { fetches++; return structuredClone(x.page); },
    sender: async (prepared, opts) => {
      sends++; assert.equal(fetches, 1); assert.deepEqual(prepared, x.prepared);
      assert.equal(prepared.researchMode, 'stored-evidence');
      assert.equal(opts.authorization.researchMode, 'stored-evidence');
      assert.equal(opts.recipient, 'owner@example.com');
      return { status: 'accepted', emailRequests: 1 };
    },
  }));
  assert.equal(sends, 1); assert.equal(result.status, 'accepted');
  x.manifest.authorization.researchMode = 'fresh-research';
  await assert.rejects(runReviewedEmailTest(options(x)), /AUTHORIZATION_INVALID/);
});

test('stored-evidence label cannot relax research age, capture age, provenance or independent review', async () => {
  for (const mutate of [
    x => { x.full.metadata.retrievedAt = '2026-09-17T21:19:59.999Z';
      x.full.metadata.reportingWindow.endExclusive = x.full.metadata.retrievedAt;
      x.full.metadata.reportingWindow.startInclusive = '2026-09-14T21:19:59.999Z'; },
    x => { x.full.metadata.captures[0].identity.retrievedAt = '2026-09-17T21:19:59.999Z'; },
    x => { x.full.metadata.sourceRunId = '99999999'; },
    x => { x.full.metadata.reportingWindow.startInclusive = '2026-09-14T03:00:00.000Z'; },
    x => { x.full.input.stories[0].review.fields[0].conditionsPreserved = false; },
  ]) {
    const x = await fixture('stored-evidence'); mutate(x); repack(x);
    let fetches = 0, sends = 0;
    await assert.rejects(runReviewedEmailTest(options(x, { mode: '--send',
      pageFetcher: async () => { fetches++; return x.page; }, sender: async () => { sends++; } })), /REVIEWED_/);
    assert.equal(fetches, 0); assert.equal(sends, 0);
  }
});

test('sends only the exact prepared message to the encrypted-pinned existing recipient after source checks', async () => {
  const x = await fixture(); let sends = 0, checked = false;
  const result = await runReviewedEmailTest(options(x, { mode: '--send',
    env: { ...env(), PERSONAL_PAPER_EMAIL: 'owner@example.com', RESEND_API_KEY: 're_test_only_key' },
    pageFetcher: async () => { checked = true; return structuredClone(x.page); },
    sender: async (message, opts) => {
      sends++; assert.ok(checked); assert.deepEqual(message, x.prepared); assert.deepEqual(opts.authorization, x.manifest.authorization);
      assert.equal(opts.recipient, 'owner@example.com'); assert.equal(opts.apiKey, 're_test_only_key');
      return { status: 'accepted', providerMessageId: 'synthetic-id', emailRequests: 1 };
    },
  }));
  assert.equal(sends, 1); assert.equal(result.status, 'accepted');
  for (const recipient of [undefined, 'other@example.com', 'owner@example.com ']) {
    await assert.rejects(runReviewedEmailTest(options(x, { mode: '--send', env: { ...env(), PERSONAL_PAPER_EMAIL: recipient },
      sender: async () => { throw Error('sender must not execute'); } })), /RECIPIENT_MISMATCH/);
  }
});

test('only exact owner/main/manual/run-attempt-one workflow context and checkout SHA may proceed', async () => {
  const x = await fixture();
  for (const [field, value] of Object.entries({ GITHUB_REPOSITORY: 'other/first-fold', GITHUB_REF: 'refs/heads/feature',
    GITHUB_ACTOR: 'other', GITHUB_TRIGGERING_ACTOR: 'other', GITHUB_EVENT_NAME: 'schedule', GITHUB_RUN_ATTEMPT: '2',
    GITHUB_RUN_ID: '0', GITHUB_SHA: 'not-a-sha', GITHUB_WORKFLOW_SHA: sourceGitSha,
    GITHUB_WORKFLOW_REF: 'itworksinprod/first-fold/.github/workflows/other.yml@refs/heads/main' })) {
    assert.throws(() => assertReviewedEmailTestContext(x.manifest, { ...env(), [field]: value }, headSha, current), /CONTEXT_INVALID/);
  }
  assert.throws(() => assertReviewedEmailTestContext(x.manifest, env(), sourceGitSha, current), /CONTEXT_INVALID/);
  await assert.rejects(runReviewedEmailTest(options(x, { mode: '--send-now' })), /MODE_INVALID/);
});

test('rejects stale/future research, expired authorization, wrong original provenance and wrong date before fetch', async () => {
  for (const mutate of [
    x => x.full.metadata.retrievedAt = '2026-09-17T01:00:00.000Z',
    x => x.full.metadata.retrievedAt = '2026-09-18T05:00:00.000Z',
    x => x.full.metadata.sourceRunId = '87654321',
    x => x.full.metadata.sourceGitSha = 'c'.repeat(40),
    x => x.full.metadata.reportingWindow.startInclusive = '2026-09-14T03:00:00.000Z',
    x => x.full.metadata.captures[0].identity.title = 'Wrong article',
    x => x.full.metadata.captures[0].sourceTextSha256 = '0'.repeat(64),
    x => x.full.metadata.captures = [],
  ]) {
    const x = await fixture(); mutate(x); repack(x); let fetches = 0;
    await assert.rejects(runReviewedEmailTest(options(x, { pageFetcher: async () => { fetches++; } })), /REVIEWED_TRANSPORT_/);
    assert.equal(fetches, 0);
  }
  const x = await fixture();
  await assert.rejects(runReviewedEmailTest(options(x, { now: new Date('2026-09-18T04:01:00.000Z') })), /AUTHORIZATION_EXPIRED/);
  const boundary = structuredClone(x.manifest); boundary.authorization.expiresAt = '2026-09-18T09:10:00.000Z';
  assert.doesNotThrow(() => assertReviewedEmailTestContext(boundary, env(), headSha, current));
  assert.throws(() => assertReviewedEmailTestContext(boundary, env(), headSha, new Date(boundary.authorization.expiresAt)), /AUTHORIZATION_EXPIRED/);
  const extended = structuredClone(x.manifest); extended.authorization.expiresAt = '2026-09-18T09:10:00.001Z';
  assert.throws(() => assertReviewedEmailTestContext(extended, env(), headSha, current), /AUTHORIZATION_EXPIRED/);
});

test('changed independent review, source prose, identity and inaccessible publishers never reach sender', async () => {
  const x = await fixture();
  for (const pageFetcher of [
    async () => { throw Error('private provider body must never escape'); },
    async () => ({ ...x.page, finalUrl: 'https://evil.example/report' }),
    async () => ({ ...x.page, body: x.page.body.replace('Google Meet users', 'Other people') }),
    async () => ({ ...x.page, body: x.page.body.replace('</article>', '<p>A new caveat appeared after review.</p></article>') }),
  ]) {
    let sends = 0;
    await assert.rejects(runReviewedEmailTest(options(x, { mode: '--send', pageFetcher, sender: async () => { sends++; } })), /SOURCE_RECHECK_FAILED/);
    assert.equal(sends, 0);
  }
  x.full.input.stories[0].review.fields[0].conditionsPreserved = false; repack(x);
  await assert.rejects(runReviewedEmailTest(options(x)), /REVIEW_HELD/);
});

test('rechecks time after source requests and cannot send when authorization expires in flight', async () => {
  const x = await fixture(); let sends = 0;
  await assert.rejects(runReviewedEmailTest(options(x, { mode: '--send', clock: () => new Date('2026-09-18T04:00:00.000Z'),
    sender: async () => { sends++; } })), /AUTHORIZATION_EXPIRED/);
  assert.equal(sends, 0);
});

test('manual workflow isolates credentials, has pinned actions and does not upload or publish private packets', () => {
  const workflow = readFileSync(new URL('../.github/workflows/reviewed-email-test.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:\s*\npermissions: \{\}/);
  assert.ok(!/inputs:|schedule:|pull_request|workflow_run|GEMINI|TAVILY|CLOUDFLARE|OPENAI|upload-artifact|git push|contents: write/u.test(workflow));
  assert.match(workflow, /github.triggering_actor == 'itworksinprod'/);
  assert.match(workflow, /github.run_attempt == 1/);
  assert.match(workflow, /persist-credentials: false/);
  assert.equal((workflow.match(/uses: actions\/[a-z-]+@[a-f0-9]{40}/gu) ?? []).length, 2);
  const before = workflow.split('- name: Revalidate and send')[0];
  assert.ok(!/RESEND_API_KEY|PERSONAL_PAPER_EMAIL/u.test(before));
  assert.match(workflow, /reviewed-email-test\.mjs --validate/);
  assert.match(workflow, /reviewed-email-test\.mjs --send/);
});
