import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { correctedGooglePreview } from './fixtures/corrected-google-preview.mjs';
import { buildPreviewReviewPacket } from '../scripts/automation/free/preview-editorial-review.mjs';
import { prepareReviewedPreviewEmail, sendReviewedPreviewTestEmail, sendAuthorizedReviewedPreviewEmail,
  assertReviewedTestAuthorization, REVIEWED_EMAIL_TEST_VERSION, REVIEWED_EMAIL_TEST_CONFIRMATION } from '../scripts/automation/reviewed-preview-email.mjs';
import { RESEND_EMAIL_ENDPOINT, PERSONAL_EMAIL_FROM, MAX_RESEND_RESPONSE_BYTES } from '../scripts/automation/personal-email.mjs';

const now = new Date('2026-09-18T04:00:00.000Z');
let nextId = 0;
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
function inputFixture() {
  const x = correctedGooglePreview();
  const packet = buildPreviewReviewPacket(x.draft, x.dossier, x.evidenceForFields);
  // Pure synthetic interface control. This record is NOT a factual approval.
  const review = { version: packet.version, binding: packet.binding,
    reviewer: { kind: 'independent-ai', name: 'SYNTHETIC TEST ONLY', reference: 'unit-test-control' },
    reviewedAt: '2026-09-18T03:00:00.000Z', fullContextChecked: true, renderedContentChecked: true,
    limitations: ['Synthetic test record, never an actual editorial approval.'],
    fields: packet.units.map(unit => ({ field: unit.field, supportedByMappedPassages: true,
      conditionsPreserved: true, noUnsupportedInference: true, rationale: 'Synthetic contract control only.' })) };
  return { editionDate: '2026-09-18', researchMode: 'stored-evidence', stories: [{ packet, review,
    sources: [{ sourceId: packet.dossier.sources[0].sourceId, publisher: packet.dossier.sources[0].publisher,
      url: 'https://workspaceupdates.googleblog.com/2026/09/connect-to-google-meet-hardware-with-room-codes.html' }] }] };
}
function authorization(prepared, overrides = {}) {
  return { version: REVIEWED_EMAIL_TEST_VERSION, purpose: 'one-shot-reviewed-email-test',
    confirmation: REVIEWED_EMAIL_TEST_CONFIRMATION, testId: `synthetic-test-${++nextId}`,
    editionDate: prepared.editionDate, researchMode: prepared.researchMode, storyCount: prepared.storyCount,
    contentSha256: prepared.contentSha256, reviewSha256: prepared.reviewSha256,
    issuedAt: '2026-09-18T03:30:00.000Z', expiresAt: '2026-09-18T04:30:00.000Z',
    recipientSource: 'PERSONAL_PAPER_EMAIL', emailRequests: 1, dailyDelivery: false, publicEdition: false,
    enableBilling: false, ...overrides };
}
function options(prepared, extras = {}) {
  return { authorization: authorization(prepared), apiKey: 're_unit_test_key', recipient: 'owner@example.com', now,
    clock: () => now, fetchImpl: async () => new Response(JSON.stringify({ id: 'synthetic-message-1' }), { status: 200 }), ...extras };
}

test('prepares an exact six-field reviewed HTML and text email with only factual publisher links', () => {
  const input = inputFixture(), prepared = prepareReviewedPreviewEmail(input);
  assert.equal(prepared.storyCount, 1);
  assert.equal(prepared.contentSha256, hash(prepared.message));
  assert.match(prepared.message.subject, /^\[Reviewed test\]/);
  assert.match(prepared.message.html, /saved research, not a freshly researched daily edition/);
  assert.match(prepared.message.text, /1 story · Only the desks shown are covered/);
  for (const unit of input.stories[0].packet.units) {
    assert.ok(prepared.message.text.includes(unit.text));
    const escaped = unit.text.replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    assert.ok(prepared.message.html.includes(escaped));
  }
  for (const excluded of ['No email sent', 'Complete captured context', 'Field-by-field evidence trail', 'S1P13', 'test-fixture', 'toJSON']) {
    assert.ok(!prepared.message.html.includes(excluded));
    assert.ok(!prepared.message.text.includes(excluded));
  }
  assert.ok(!prepared.message.text.includes(input.stories[0].packet.dossier.sources[0].text));
  assert.ok(!prepared.message.text.includes(input.stories[0].review.limitations[0]));
  assert.match(prepared.message.html, /href="https:\/\/workspaceupdates\.googleblog\.com\//);
  assert.match(prepared.message.text, /Google Workspace Updates · Primary source/);
});

test('labels fresh research distinctly and binds mode, date, review and sources into digest', () => {
  const a = inputFixture(), original = prepareReviewedPreviewEmail(a);
  a.researchMode = 'fresh-research';
  const fresh = prepareReviewedPreviewEmail(a);
  assert.match(fresh.message.text, /newly collected research/);
  assert.notEqual(fresh.contentSha256, original.contentSha256);
  a.stories[0].sources[0].url += '?source=reviewed';
  const newLink = prepareReviewedPreviewEmail(a);
  assert.notEqual(newLink.contentSha256, fresh.contentSha256);
  assert.notEqual(newLink.reviewSha256, fresh.reviewSha256);
  a.stories[0].review.fields[0].rationale += ' An additional note.';
  assert.notEqual(prepareReviewedPreviewEmail(a).reviewSha256, newLink.reviewSha256);
});

test('rejects missing, stale, held and negative reviews without sending', async () => {
  for (const mutate of [
    x => x.stories[0].review = null,
    x => x.stories[0].review.fields[0].supportedByMappedPassages = false,
    x => x.stories[0].review.renderedContentChecked = false,
    x => x.stories[0].packet.draft.headline += ' Changed after review.',
    x => x.stories[0].packet.holds = ['BLOCKED'],
    x => x.stories[0].packet.units[0].text = 'Unbound replacement',
  ]) {
    const input = inputFixture(); mutate(input); let calls = 0;
    await assert.rejects(sendReviewedPreviewTestEmail(input, { fetchImpl: async () => { calls++; } }), /REVIEWED_TEST_REVIEW_HELD/);
    assert.equal(calls, 0);
  }
});

test('rejects source additions, mismatches, disallowed hosts, credentials, fragments and non-HTTPS URLs', () => {
  for (const url of ['http://workspaceupdates.googleblog.com/report', 'javascript:alert(1)', 'https://localhost/report',
    'https://127.0.0.1/report', 'https://workspaceupdates.googleblog.com.evil.example/report',
    'https://user:password@workspaceupdates.googleblog.com/report', 'https://workspaceupdates.googleblog.com:444/report',
    'https://workspaceupdates.googleblog.com/report#token=secret', 'https://workspaceupdates.googleblog.com/report\n']) {
    const input = inputFixture(); input.stories[0].sources[0].url = url;
    assert.throws(() => prepareReviewedPreviewEmail(input), /SOURCES_INVALID/);
  }
  for (const mutate of [x => x.stories[0].sources.push({ ...x.stories[0].sources[0] }),
    x => x.stories[0].sources = [], x => x.stories[0].sources[0].sourceId = 'made-up',
    x => x.stories[0].sources[0].publisher = 'Made up publisher', x => x.stories[0].sources[0].title = 'Injected title']) {
    const input = inputFixture(); mutate(input);
    assert.throws(() => prepareReviewedPreviewEmail(input), /SOURCES_INVALID/);
  }
});

test('rejects unknown fields, duplicate stories, unknown desks, bad dates and executable input', () => {
  for (const mutate of [x => x.recipient = 'other@example.com', x => x.editionDate = '2026-02-30',
    x => x.editionDate = '2026-09-18\r\nBcc: victim@example.com', x => x.researchMode = 'daily',
    x => x.stories.push(structuredClone(x.stories[0])), x => x.stories[0].packet.dossier.desk = 'unknown']) {
    const input = inputFixture(); mutate(input);
    assert.throws(() => prepareReviewedPreviewEmail(input), /REVIEWED_TEST_/);
  }
  let executions = 0;
  const getter = inputFixture(); Object.defineProperty(getter, 'hidden', { get() { executions++; return true; } });
  assert.throws(() => prepareReviewedPreviewEmail(getter), /INPUT_INVALID/);
  const hook = inputFixture(); hook.toJSON = () => { executions++; return inputFixture(); };
  assert.throws(() => prepareReviewedPreviewEmail(hook), /INPUT_INVALID/);
  assert.equal(executions, 0);
});

test('sends only the bound exact message once to the fixed endpoint and existing sender', async () => {
  const input = inputFixture(), prepared = prepareReviewedPreviewEmail(input); let calls = 0, request;
  const opts = options(prepared, { fetchImpl: async (url, init) => {
    calls++; request = { url, init };
    return new Response(JSON.stringify({ id: 'synthetic-message-1', other: 'provider noise is not returned' }), { status: 200 });
  } });
  const result = await sendReviewedPreviewTestEmail(input, opts);
  assert.equal(calls, 1);
  assert.equal(request.url, RESEND_EMAIL_ENDPOINT);
  assert.equal(request.init.redirect, 'error');
  assert.equal(request.init.method, 'POST');
  assert.deepEqual(JSON.parse(request.init.body), { from: PERSONAL_EMAIL_FROM, to: ['owner@example.com'], ...prepared.message });
  assert.equal(request.init.headers['Idempotency-Key'], `first-fold-reviewed-test-${opts.authorization.testId}`);
  assert.deepEqual(result, { status: 'accepted', providerMessageId: 'synthetic-message-1',
    idempotencyKey: request.init.headers['Idempotency-Key'], contentSha256: prepared.contentSha256, emailRequests: 1 });
  assert.equal(Object.hasOwn(result, 'delivered'), false);
  assert.ok(!JSON.stringify(result).includes('owner@example.com'));
  assert.ok(!JSON.stringify(result).includes('re_unit_test_key'));
  await assert.rejects(sendAuthorizedReviewedPreviewEmail(prepared, opts), /AUTHORIZATION_CONSUMED/);
  assert.equal(calls, 1);
});

test('authorization rejects changed body, counts, digests, scope, recipient override and missing explicit approval', async () => {
  const original = prepareReviewedPreviewEmail(inputFixture());
  for (const change of [{ contentSha256: '0'.repeat(64) }, { reviewSha256: '0'.repeat(64) }, { storyCount: 3 },
    { researchMode: 'fresh-research' }, { confirmation: 'APPROVE' }, { purpose: 'daily-email' },
    { dailyDelivery: true }, { publicEdition: true }, { enableBilling: true }, { emailRequests: 2 },
    { recipient: 'other@example.com' }, { recipientSource: 'USER_INPUT' }, { testId: 'too\nshort' }, { testId: 12345678 }]) {
    const auth = authorization(original, change); let calls = 0;
    await assert.rejects(sendAuthorizedReviewedPreviewEmail(original, options(original, { authorization: auth, fetchImpl: async () => { calls++; } })), /AUTHORIZATION_INVALID/);
    assert.equal(calls, 0);
  }
  const changed = structuredClone(original); changed.message.text += '\nUnreviewed edit.';
  await assert.rejects(sendAuthorizedReviewedPreviewEmail(changed, options(original)), /MESSAGE_INVALID/);
  changed.contentSha256 = hash(changed.message);
  await assert.rejects(sendAuthorizedReviewedPreviewEmail(changed, options(original)), /AUTHORIZATION_INVALID/);
});

test('authorization expires before send, has a bounded validity window and checks real send time again', async () => {
  const prepared = prepareReviewedPreviewEmail(inputFixture());
  for (const change of [{ issuedAt: '2026-09-18T04:01:00Z' }, { expiresAt: now.toISOString() },
    { issuedAt: '2026-09-16T03:30:00Z' }, { expiresAt: 'not-a-date' }]) {
    assert.throws(() => assertReviewedTestAuthorization(prepared, authorization(prepared, change), now), /AUTHORIZATION_EXPIRED/);
  }
  let calls = 0;
  await assert.rejects(sendAuthorizedReviewedPreviewEmail(prepared, options(prepared, {
    clock: () => new Date('2026-09-18T04:31:00Z'), fetchImpl: async () => { calls++; }
  })), /AUTHORIZATION_EXPIRED/);
  assert.equal(calls, 0);
});

test('six-hour authorization is accepted before expiry; six hours plus one millisecond and exact expiry are rejected', () => {
  const prepared = prepareReviewedPreviewEmail(inputFixture());
  const issuedAt = '2026-09-18T03:30:00.000Z', expiresAt = '2026-09-18T09:30:00.000Z';
  const auth = authorization(prepared, { issuedAt, expiresAt });
  assert.equal(assertReviewedTestAuthorization(prepared, auth, new Date('2026-09-18T09:29:59.999Z')),
    `first-fold-reviewed-test-${auth.testId}`);
  assert.throws(() => assertReviewedTestAuthorization(prepared, auth, new Date(expiresAt)), /AUTHORIZATION_EXPIRED/);
  assert.throws(() => assertReviewedTestAuthorization(prepared, { ...auth, expiresAt: '2026-09-18T09:30:00.001Z' }, now), /AUTHORIZATION_EXPIRED/);
});

test('only one syntactically valid recipient and a bounded key and timeout are accepted', async () => {
  const prepared = prepareReviewedPreviewEmail(inputFixture());
  for (const recipient of [undefined, ['owner@example.com'], 'a@example.com,b@example.com', 'Name <owner@example.com>',
    'owner@example.com\r\nBcc:other@example.com', 'owner@example.com ', 'bad-address']) {
    let calls = 0;
    await assert.rejects(sendAuthorizedReviewedPreviewEmail(prepared, options(prepared, { recipient, fetchImpl: async () => { calls++; } })), /RECIPIENT_INVALID/);
    assert.equal(calls, 0);
  }
  for (const change of [{ apiKey: undefined }, { apiKey: 're_invalid\n' }, { apiKey: 'secret' }, { timeoutMs: 15001 }, { timeoutMs: 0 }]) {
    await assert.rejects(sendAuthorizedReviewedPreviewEmail(prepared, options(prepared, change)), /REVIEWED_TEST_(KEY|OPTIONS)_INVALID/);
  }
});

test('redirects, provider failures, invalid/oversized responses are sanitized and never retried', async () => {
  const prepared = prepareReviewedPreviewEmail(inputFixture());
  for (const response of [
    () => new Response('Secret provider rejection owner@example.com re_secret', { status: 403 }),
    () => new Response('', { status: 302, headers: { location: 'https://evil.example' } }),
    () => new Response('{"id":"owner@example.com"}', { status: 200 }),
    () => new Response('re_secret invalid JSON', { status: 200 }),
    () => new Response('{"id":"ok"}', { status: 200, headers: { 'content-length': MAX_RESEND_RESPONSE_BYTES + 1 } }),
    () => new Response('x'.repeat(MAX_RESEND_RESPONSE_BYTES + 1), { status: 200 }),
    () => { throw new Error('re_secret owner@example.com raw network text'); },
  ]) {
    let calls = 0;
    const opts = options(prepared, { fetchImpl: async () => { calls++; return response(); } });
    await assert.rejects(sendAuthorizedReviewedPreviewEmail(prepared, opts), error => {
      assert.match(error.message, /^REVIEWED_TEST_/);
      assert.doesNotMatch(error.message, /owner@|re_secret|raw network|provider rejection/);
      return true;
    });
    assert.equal(calls, 1);
    await assert.rejects(sendAuthorizedReviewedPreviewEmail(prepared, opts), /AUTHORIZATION_CONSUMED/);
    assert.equal(calls, 1);
  }
});

test('a stalled request or response is aborted, reports uncertainty and consumes the one-shot test', async () => {
  const prepared = prepareReviewedPreviewEmail(inputFixture()); let calls = 0, signal;
  const opts = options(prepared, { timeoutMs: 5, fetchImpl: async (_url, init) => {
    calls++; signal = init.signal; return new Promise(() => {});
  } });
  await assert.rejects(sendAuthorizedReviewedPreviewEmail(prepared, opts), /DELIVERY_UNCERTAIN/);
  assert.equal(calls, 1); assert.equal(signal.aborted, true);
  await assert.rejects(sendAuthorizedReviewedPreviewEmail(prepared, opts), /AUTHORIZATION_CONSUMED/);
  let bodySignal;
  await assert.rejects(sendAuthorizedReviewedPreviewEmail(prepared, options(prepared, { timeoutMs: 5, fetchImpl: async (_url, init) => {
    bodySignal = init.signal;
    return new Response(new ReadableStream({ start() {} }), { status: 200 });
  } })), /DELIVERY_UNCERTAIN/);
  assert.equal(bodySignal.aborted, true);
});

test('snapshots input before the first await so callback mutation cannot alter submitted body or binding', async () => {
  const prepared = prepareReviewedPreviewEmail(inputFixture()), original = structuredClone(prepared); let posted;
  const opts = options(prepared, { fetchImpl: async (_url, init) => {
    prepared.message.text = 'Unreviewed replacement'; opts.authorization.contentSha256 = '0'.repeat(64);
    posted = JSON.parse(init.body); return new Response('{"id":"snapshot-ok"}', { status: 200 });
  } });
  const result = await sendAuthorizedReviewedPreviewEmail(prepared, opts);
  assert.equal(posted.text, original.message.text);
  assert.equal(result.contentSha256, original.contentSha256);
});
