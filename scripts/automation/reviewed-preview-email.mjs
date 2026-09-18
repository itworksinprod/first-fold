// Explicit, one-shot TEST delivery only. This module is not imported by the
// daily paper. Review records and authorization manifests are trusted manual
// inputs; hashes bind bytes, they do not authenticate an editor or an approval.
import { createHash } from 'node:crypto';
import { checkPreviewReview } from './free/preview-editorial-review.mjs';
import { FREE_FEED_SOURCES } from './free/feed-sources.mjs';
import { PERSONAL_EMAIL_FROM, RESEND_EMAIL_ENDPOINT, DEFAULT_RESEND_TIMEOUT_MS,
  MAX_RESEND_TIMEOUT_MS, MAX_RESEND_REQUEST_BYTES, MAX_RESEND_RESPONSE_BYTES } from './personal-email.mjs';

export const REVIEWED_EMAIL_TEST_VERSION = 'reviewed-preview-email-test-v1';
export const REVIEWED_EMAIL_TEST_CONFIRMATION = 'SEND EXACT REVIEWED TEST ONCE';
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_AUTH_WINDOW_MS = 6 * 60 * 60 * 1000;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const SHA = /^[a-f0-9]{64}$/u;
const DESKS = Object.freeze({ ai: 'AI & Models', 'work-and-tools': 'Work & Tools',
  'security-and-privacy': 'Security & Privacy', 'platforms-and-power': 'Platforms & Power' });
const consumedTests = new Set();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const escape = value => value.replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fail = code => { throw new Error(code); };
const exact = (object, keys) => object && !Array.isArray(object) && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
const text = (value, max = 5000) => typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() && !CONTROL.test(value);

// Do not execute getters/toJSON hooks while hashing or cloning trusted input.
function snapshot(value) {
  let nodes = 0;
  const ancestors = new Set();
  function check(item, depth) {
    if (++nodes > 100000 || depth > 32) fail('REVIEWED_TEST_INPUT_INVALID');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail('REVIEWED_TEST_INPUT_INVALID'); return; }
    if (typeof item === 'string') { if (item.length > MAX_INPUT_BYTES) fail('REVIEWED_TEST_INPUT_INVALID'); return; }
    if (typeof item !== 'object' || ancestors.has(item) ||
      (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)) fail('REVIEWED_TEST_INPUT_INVALID');
    ancestors.add(item);
    for (const key of Reflect.ownKeys(item)) {
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key)) fail('REVIEWED_TEST_INPUT_INVALID');
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('REVIEWED_TEST_INPUT_INVALID');
      check(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
  }
  check(value, 0);
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > MAX_INPUT_BYTES) fail('REVIEWED_TEST_INPUT_INVALID');
  return JSON.parse(json);
}

function requireDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
      !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) fail('REVIEWED_TEST_DATE_INVALID');
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
}

function verifiedSources(story) {
  const ids = new Set(story.packet.units.flatMap(unit => unit.evidenceIds));
  const factualSources = story.packet.dossier.sources.filter(source => source.relationship !== 'context' && source.passages.some(passage => ids.has(passage.evidenceId)));
  if (!Array.isArray(story.sources) || !factualSources.length || story.sources.length !== factualSources.length ||
      new Set(story.sources.map(source => source?.sourceId)).size !== factualSources.length) fail('REVIEWED_TEST_SOURCES_INVALID');
  return story.sources.map(link => {
    const source = factualSources.find(item => item.sourceId === link?.sourceId);
    if (!exact(link, ['sourceId', 'publisher', 'url']) || !source || !['originating', 'independent'].includes(source.relationship) || link.publisher !== source.publisher || !text(link.publisher, 150) ||
        !text(link.url, 4096) || /\s|\\/u.test(link.url)) fail('REVIEWED_TEST_SOURCES_INVALID');
    let parsed;
    try { parsed = new URL(link.url); } catch { fail('REVIEWED_TEST_SOURCES_INVALID'); }
    const hosts = new Set(FREE_FEED_SOURCES.filter(feed => feed.publisherKey === source.publisherKey && feed.publisher === source.publisher).flatMap(feed => feed.itemHosts));
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.hash ||
        !hosts.has(parsed.hostname) || parsed.href !== link.url) fail('REVIEWED_TEST_SOURCES_INVALID');
    return { ...link, relationship: source.relationship };
  });
}

/** Local preparation only: requires full unchanged packets plus genuine,
 * independent per-field review. Never serialize full packets into an email or
 * public dispatch. The resulting compact message can be separately pinned in a
 * trusted test manifest by the human-authorized caller. */
export function prepareReviewedPreviewEmail(input) {
  const clean = snapshot(input);
  if (!exact(clean, ['editionDate', 'researchMode', 'stories']) || !['fresh-research', 'stored-evidence'].includes(clean.researchMode) ||
      !Array.isArray(clean.stories) || clean.stories.length < 1 || clean.stories.length > 4) fail('REVIEWED_TEST_INPUT_INVALID');
  const displayDate = requireDate(clean.editionDate);
  const candidateIds = new Set(), desks = new Set();
  const stories = clean.stories.map(story => {
    if (!exact(story, ['packet', 'review', 'sources']) || !checkPreviewReview(story.packet, story.review).readyForPrivatePreview) fail('REVIEWED_TEST_REVIEW_HELD');
    const draft = story.packet.draft, desk = story.packet.dossier.desk;
    if (!Object.hasOwn(DESKS, desk) || desks.has(desk) || candidateIds.has(draft.candidateId) ||
        !Array.isArray(draft.claims) || draft.claims.length !== 2 || story.packet.units.length !== 6 ||
        ![draft.headline, draft.deck, ...draft.claims.map(claim => claim.text), draft.whyItMatters, draft.whatToDoOrWatch].every(value => text(value))) fail('REVIEWED_TEST_STORY_INVALID');
    desks.add(desk); candidateIds.add(draft.candidateId);
    return { draft, desk, sources: verifiedSources(story) };
  });
  const count = `${stories.length} ${stories.length === 1 ? 'story' : 'stories'}`;
  const notice = clean.researchMode === 'stored-evidence'
    ? 'Experimental email test using saved research, not a freshly researched daily edition.'
    : 'Experimental email test using newly collected research, not your scheduled daily edition.';
  const reviewNotice = 'The exact summary text received independent AI review. That review is not a guarantee of factual accuracy. Original publisher links are below each story.';
  const scope = `${count} · Only the desks shown are covered. Daily delivery and public editions are unchanged.`;
  const subject = `[Reviewed test] First Fold — ${displayDate}`;
  const storyHtml = stories.map(({ draft, desk, sources }) => `<section style="padding:26px 30px;border-top:2px solid #24211d;">
<p style="color:#712b27;font:700 12px Arial,sans-serif;">${escape(DESKS[desk])}</p>
<h2>${escape(draft.headline)}</h2><p><em>${escape(draft.deck)}</em></p>
<h3>What happened</h3>${draft.claims.map(claim => `<p>${escape(claim.text)}</p>`).join('')}
<h3>Why it matters</h3><p>${escape(draft.whyItMatters)}</p>
<h3>What to watch</h3><p>${escape(draft.whatToDoOrWatch)}</p>
<h3>Sources</h3><ul>${sources.map(source => `<li><a href="${escape(source.url)}">${escape(source.publisher)}</a> · ${source.relationship === 'originating' ? 'Primary source' : 'Independent reporting'}</li>`).join('')}</ul>
</section>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:20px;background:#ded8cc;color:#171512;font:17px/1.55 Georgia,serif;"><main style="max-width:680px;margin:auto;background:#f5f0e6;border:1px solid #b9b09f;">
<header style="padding:26px 30px;border-top:7px solid #712b27;"><p>Washington, D.C. · ${escape(displayDate)}</p><h1>First Fold</h1><p><em>Printed for the screen. Finished by breakfast.</em></p><h2>Reviewed test edition</h2><p>${escape(notice)}</p><p>${escape(scope)}</p><p style="font:13px/1.5 Arial,sans-serif;">${escape(reviewNotice)}</p></header>
${storyHtml}<footer style="padding:24px 30px;border-top:3px double #24211d;">Your private First Fold email test. No public edition was created.</footer></main></body></html>`;
  const plainText = ['FIRST FOLD', 'Printed for the screen. Finished by breakfast.', `Washington, D.C. · ${displayDate}`, '',
    'REVIEWED TEST EDITION', notice, scope, reviewNotice, '',
    ...stories.flatMap(({ draft, desk, sources }) => [DESKS[desk], draft.headline, draft.deck, '', 'What happened', ...draft.claims.map(claim => claim.text), '',
      'Why it matters', draft.whyItMatters, '', 'What to watch', draft.whatToDoOrWatch, '', 'Sources',
      ...sources.map(source => `${source.publisher} · ${source.relationship === 'originating' ? 'Primary source' : 'Independent reporting'}\n${source.url}`), '', '----------------------------------------', '']),
    'Your private First Fold email test. No public edition was created.'].join('\n');
  const message = { subject, html, text: plainText };
  if (Buffer.byteLength(JSON.stringify(message)) > MAX_RESEND_REQUEST_BYTES - 1024) fail('REVIEWED_TEST_MESSAGE_TOO_LARGE');
  return { version: REVIEWED_EMAIL_TEST_VERSION, editionDate: clean.editionDate, researchMode: clean.researchMode, storyCount: stories.length,
    message, contentSha256: digest(message), reviewSha256: digest(clean.stories.map(story => ({ binding: story.packet.binding, review: story.review, sources: story.sources }))) };
}

export const renderReviewedPreviewEmail = prepareReviewedPreviewEmail;

function validPrepared(prepared) {
  if (!exact(prepared, ['version', 'editionDate', 'researchMode', 'storyCount', 'message', 'contentSha256', 'reviewSha256']) ||
      prepared.version !== REVIEWED_EMAIL_TEST_VERSION || !['fresh-research', 'stored-evidence'].includes(prepared.researchMode) ||
      !Number.isInteger(prepared.storyCount) || prepared.storyCount < 1 || prepared.storyCount > 4 ||
      !exact(prepared.message, ['subject', 'html', 'text']) || !text(prepared.message.subject, 200) ||
      !prepared.message.subject.startsWith('[Reviewed test] First Fold — ') || typeof prepared.message.html !== 'string' ||
      typeof prepared.message.text !== 'string' || !prepared.message.html.length || !prepared.message.text.length ||
      Buffer.byteLength(JSON.stringify(prepared.message)) > MAX_RESEND_REQUEST_BYTES - 1024 ||
      !SHA.test(prepared.contentSha256) || !SHA.test(prepared.reviewSha256) || prepared.contentSha256 !== digest(prepared.message)) fail('REVIEWED_TEST_MESSAGE_INVALID');
  requireDate(prepared.editionDate);
}

/** This is a validation boundary, not an authorization issuer. The caller must
 * load the immutable authorization from trusted reviewed code, never arbitrary
 * workflow-dispatch input. Freshness/audit verification belongs to that caller. */
export function assertReviewedTestAuthorization(prepared, authorization, now = new Date()) {
  validPrepared(prepared);
  if (!exact(authorization, ['version', 'purpose', 'confirmation', 'testId', 'editionDate', 'researchMode', 'storyCount',
    'contentSha256', 'reviewSha256', 'issuedAt', 'expiresAt', 'recipientSource', 'emailRequests', 'dailyDelivery', 'publicEdition', 'enableBilling']) ||
    authorization.version !== REVIEWED_EMAIL_TEST_VERSION || authorization.purpose !== 'one-shot-reviewed-email-test' ||
    authorization.confirmation !== REVIEWED_EMAIL_TEST_CONFIRMATION || typeof authorization.testId !== 'string' || !/^[a-z0-9][a-z0-9-]{7,79}$/u.test(authorization.testId) ||
    authorization.recipientSource !== 'PERSONAL_PAPER_EMAIL' || authorization.emailRequests !== 1 || authorization.dailyDelivery !== false ||
    authorization.publicEdition !== false || authorization.enableBilling !== false ||
    ['editionDate', 'researchMode', 'storyCount', 'contentSha256', 'reviewSha256'].some(key => authorization[key] !== prepared[key])) fail('REVIEWED_TEST_AUTHORIZATION_INVALID');
  if (!text(authorization.issuedAt, 40) || !text(authorization.expiresAt, 40)) fail('REVIEWED_TEST_AUTHORIZATION_EXPIRED');
  const issued = Date.parse(authorization.issuedAt), expires = Date.parse(authorization.expiresAt), current = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || !Number.isFinite(current) || expires <= issued ||
      expires - issued > MAX_AUTH_WINDOW_MS || current < issued || current >= expires) fail('REVIEWED_TEST_AUTHORIZATION_EXPIRED');
  return `first-fold-reviewed-test-${authorization.testId}`;
}

async function responseId(response) {
  if (!response || !Number.isInteger(response.status)) fail('REVIEWED_TEST_RESPONSE_INVALID');
  if (response.redirected || (response.status >= 300 && response.status < 400)) fail('REVIEWED_TEST_REDIRECT_REJECTED');
  if (response.status < 200 || response.status >= 300) fail('REVIEWED_TEST_PROVIDER_REJECTED');
  const declared = response.headers?.get?.('content-length');
  if (/^\d+$/u.test(declared ?? '') && Number(declared) > MAX_RESEND_RESPONSE_BYTES) fail('REVIEWED_TEST_RESPONSE_TOO_LARGE');
  if (!response.body || typeof response.body.getReader !== 'function') fail('REVIEWED_TEST_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) fail('REVIEWED_TEST_RESPONSE_INVALID');
      bytes += value.byteLength;
      if (bytes > MAX_RESEND_RESPONSE_BYTES) { void reader.cancel().catch(() => {}); fail('REVIEWED_TEST_RESPONSE_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('REVIEWED_TEST_RESPONSE_INVALID'); }
  if (!parsed || typeof parsed.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/u.test(parsed.id)) fail('REVIEWED_TEST_RESPONSE_INVALID');
  return parsed.id;
}

/** Sends an exact already-reviewed compact message. No automatic retries; an
 * uncertain result consumes this process's authorization too. This in-memory
 * guard is NOT a durable request lock: another manual dispatch may make another
 * HTTP request. The guarded caller pins the same body, recipient and test key.
 * The six-hour authorization window is shorter than Resend's documented
 * 24-hour deduplication period, preventing a second email for that fixed request.
 * https://resend.com/docs/dashboard/emails/idempotency-keys */
export async function sendAuthorizedReviewedPreviewEmail(preparedInput, {
  authorization: authorizationInput, apiKey, recipient, fetchImpl = globalThis.fetch,
  now = new Date(), clock = () => new Date(), timeoutMs = DEFAULT_RESEND_TIMEOUT_MS,
} = {}) {
  const prepared = snapshot(preparedInput), authorization = snapshot(authorizationInput);
  const idempotencyKey = assertReviewedTestAuthorization(prepared, authorization, now);
  if (typeof apiKey !== 'string' || !/^re_[A-Za-z0-9_-]{8,508}$/u.test(apiKey)) fail('REVIEWED_TEST_KEY_INVALID');
  if (!text(recipient, 254) || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u.test(recipient)) fail('REVIEWED_TEST_RECIPIENT_INVALID');
  if (typeof fetchImpl !== 'function' || typeof clock !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_RESEND_TIMEOUT_MS) fail('REVIEWED_TEST_OPTIONS_INVALID');
  const body = JSON.stringify({ from: PERSONAL_EMAIL_FROM, to: [recipient], ...prepared.message });
  if (Buffer.byteLength(body) > MAX_RESEND_REQUEST_BYTES) fail('REVIEWED_TEST_MESSAGE_TOO_LARGE');
  assertReviewedTestAuthorization(prepared, authorization, clock());
  if (consumedTests.has(idempotencyKey)) fail('REVIEWED_TEST_AUTHORIZATION_CONSUMED');
  consumedTests.add(idempotencyKey);
  const controller = new AbortController(); let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
    reject(new Error('REVIEWED_TEST_DELIVERY_UNCERTAIN')); controller.abort();
  }, timeoutMs); });
  try {
    const request = (async () => {
      const response = await fetchImpl(RESEND_EMAIL_ENDPOINT, { method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, 'User-Agent': 'First-Fold-Reviewed-Email-Test/1.0' }, body });
      return responseId(response);
    })();
    const providerMessageId = await Promise.race([request, timeout]);
    return { status: 'accepted', providerMessageId, idempotencyKey, contentSha256: prepared.contentSha256, emailRequests: 1 };
  } catch (error) {
    if (['REVIEWED_TEST_RESPONSE_INVALID', 'REVIEWED_TEST_REDIRECT_REJECTED', 'REVIEWED_TEST_PROVIDER_REJECTED',
      'REVIEWED_TEST_RESPONSE_TOO_LARGE', 'REVIEWED_TEST_DELIVERY_UNCERTAIN'].includes(error?.message)) throw new Error(error.message);
    throw new Error('REVIEWED_TEST_DELIVERY_UNCERTAIN');
  } finally { clearTimeout(timer); controller.abort(); }
}

export async function sendReviewedPreviewTestEmail(input, options) {
  return sendAuthorizedReviewedPreviewEmail(prepareReviewedPreviewEmail(input), options);
}
