#!/usr/bin/env node
// Isolated manual test only. Full evidence and reviewer records stay encrypted
// at rest; no arbitrary dispatch input, model credentials, or daily-paper writes.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareReviewedPreviewEmail, assertReviewedTestAuthorization, sendAuthorizedReviewedPreviewEmail } from './reviewed-preview-email.mjs';
import { fetchReviewedArticlePage } from './free/feed-engine.mjs';
import { captureStructuredArticle } from './free/structured-article-evidence.mjs';
import { REVIEWED_EMAIL_TEST_MANIFEST } from './reviewed-email-test-manifest.mjs';

export const REVIEWED_TEST_ARTIFACT_PATH = 'content/private-tests/reviewed-email-test.encrypted.json';
export const REVIEWED_TEST_PACKAGE_VERSION = 'reviewed-email-test-package-v1';
export const REVIEWED_TEST_MANIFEST_VERSION = 'reviewed-email-test-manifest-v1';
const ENVELOPE_VERSION = 'reviewed-email-test-envelope-v1';
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_RESEARCH_AGE_MS = 6 * 60 * 60 * 1000;
// Stay comfortably inside the provider's 24-hour idempotency retention. A
// repeated manual dispatch can repeat an HTTP request, but the fixed test key,
// message and encrypted-pinned recipient must remain identical throughout.
const MAX_AUTH_AGE_MS = 6 * 60 * 60 * 1000;
const REPOSITORY = 'itworksinprod/first-fold';
const WORKFLOW_PATH = '.github/workflows/reviewed-email-test.yml';
const SHA = /^[a-f0-9]{64}$/u, GIT_SHA = /^[a-f0-9]{40}$/u, RUN_ID = /^[1-9]\d{0,19}$/u;
const fail = code => { throw new Error(code); };
const hash = value => createHash('sha256').update(value).digest('hex');
const exact = (object, keys) => object && !Array.isArray(object) && Object.keys(object).length === keys.length && keys.every(k => Object.hasOwn(object, k));

function snapshot(value) {
  let nodes = 0;
  const active = new Set();
  function visit(item, depth) {
    if (++nodes > 100000 || depth > 32) fail('REVIEWED_TRANSPORT_INPUT_INVALID');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail('REVIEWED_TRANSPORT_INPUT_INVALID'); return; }
    if (typeof item === 'string') { if (item.length > MAX_BYTES) fail('REVIEWED_TRANSPORT_INPUT_INVALID'); return; }
    if (typeof item !== 'object' || active.has(item) || (!Array.isArray(item) &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(item)))) fail('REVIEWED_TRANSPORT_INPUT_INVALID');
    active.add(item);
    for (const key of Reflect.ownKeys(item)) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(key)) fail('REVIEWED_TRANSPORT_INPUT_INVALID');
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('REVIEWED_TRANSPORT_INPUT_INVALID');
      visit(descriptor.value, depth + 1);
    }
    active.delete(item);
  }
  visit(value, 0);
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized) > MAX_BYTES) fail('REVIEWED_TRANSPORT_INPUT_INVALID');
  return JSON.parse(serialized);
}

function strictBase64(value, length, max = MAX_BYTES) {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(max / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) fail('REVIEWED_TRANSPORT_ENCODING_INVALID');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || bytes.length > max || (length !== undefined && bytes.length !== length)) fail('REVIEWED_TRANSPORT_ENCODING_INVALID');
  return bytes;
}
const aad = (testId, inputSha256) => Buffer.from(JSON.stringify({ purpose: 'first-fold-private-reviewed-email-test', testId, inputSha256 }));
function testIdentity(testId, inputSha256) {
  if (typeof testId !== 'string' || !/^[a-z0-9][a-z0-9-]{7,79}$/u.test(testId) ||
    typeof inputSha256 !== 'string' || !SHA.test(inputSha256)) fail('REVIEWED_TRANSPORT_MANIFEST_INVALID');
}
function requireManifest(value) {
  const manifest = snapshot(value);
  if (!exact(manifest, ['version', 'cipherSha256', 'inputSha256', 'sourceRunId', 'sourceGitSha', 'authorization']) ||
    manifest.version !== REVIEWED_TEST_MANIFEST_VERSION || typeof manifest.cipherSha256 !== 'string' || !SHA.test(manifest.cipherSha256) ||
    typeof manifest.sourceRunId !== 'string' || !RUN_ID.test(manifest.sourceRunId) ||
    typeof manifest.sourceGitSha !== 'string' || !GIT_SHA.test(manifest.sourceGitSha)) fail('REVIEWED_TRANSPORT_MANIFEST_INVALID');
  testIdentity(manifest.authorization?.testId, manifest.inputSha256);
  return manifest;
}

// Local packaging helper only. Encryption is not approval; delivery additionally
// requires a reviewed, pinned manifest, complete revalidation, and source checks.
export function sealReviewedEmailTestPackage(input, keyBase64, testId) {
  const plaintext = Buffer.from(JSON.stringify(snapshot(input)));
  const inputSha256 = hash(plaintext);
  testIdentity(testId, inputSha256);
  const key = strictBase64(keyBase64, 32, 32), iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(testId, inputSha256));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const bytes = Buffer.from(JSON.stringify({ version: ENVELOPE_VERSION, iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }));
    if (bytes.length > MAX_BYTES) fail('REVIEWED_TRANSPORT_ARTIFACT_TOO_LARGE');
    return { bytes, inputSha256, cipherSha256: hash(bytes) };
  } finally { key.fill(0); plaintext.fill(0); }
}

export function openReviewedEmailTestPackage(artifact, keyBase64, manifestInput) {
  const manifest = requireManifest(manifestInput);
  if (!(artifact instanceof Uint8Array) || !artifact.length || artifact.length > MAX_BYTES) fail('REVIEWED_TRANSPORT_ARTIFACT_INVALID');
  if (hash(artifact) !== manifest.cipherSha256) fail('REVIEWED_TRANSPORT_CIPHER_CHANGED');
  let envelope;
  try { envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(artifact)); }
  catch { fail('REVIEWED_TRANSPORT_ENVELOPE_INVALID'); }
  if (!exact(envelope, ['version', 'iv', 'tag', 'ciphertext']) || envelope.version !== ENVELOPE_VERSION) fail('REVIEWED_TRANSPORT_ENVELOPE_INVALID');
  const key = strictBase64(keyBase64, 32, 32), iv = strictBase64(envelope.iv, 12, 12), tag = strictBase64(envelope.tag, 16, 16);
  const ciphertext = strictBase64(envelope.ciphertext);
  let plaintext;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad(manifest.authorization.testId, manifest.inputSha256));
    decipher.setAuthTag(tag);
    try { plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]); }
    catch { fail('REVIEWED_TRANSPORT_DECRYPTION_FAILED'); }
    if (plaintext.length > MAX_BYTES || hash(plaintext) !== manifest.inputSha256) fail('REVIEWED_TRANSPORT_INPUT_CHANGED');
    try { return snapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))); }
    catch { fail('REVIEWED_TRANSPORT_INPUT_INVALID'); }
  } finally { key.fill(0); plaintext?.fill(0); }
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('REVIEWED_TRANSPORT_TIME_INVALID');
  return Date.parse(value);
}

export function assertReviewedEmailTestContext(manifestInput, env, headSha, now = new Date()) {
  const manifest = requireManifest(manifestInput);
  if (env?.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_ACTOR !== 'itworksinprod' || env.GITHUB_TRIGGERING_ACTOR !== 'itworksinprod' ||
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1' ||
    env.GITHUB_WORKFLOW_REF !== `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main` ||
    typeof env.GITHUB_RUN_ID !== 'string' || !RUN_ID.test(env.GITHUB_RUN_ID) ||
    typeof env.GITHUB_SHA !== 'string' || !GIT_SHA.test(env.GITHUB_SHA) ||
    env.GITHUB_WORKFLOW_SHA !== env.GITHUB_SHA || headSha !== env.GITHUB_SHA) fail('REVIEWED_TRANSPORT_CONTEXT_INVALID');
  const issued = timestamp(manifest.authorization.issuedAt), expires = timestamp(manifest.authorization.expiresAt);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || expires <= issued ||
    expires - issued > MAX_AUTH_AGE_MS || now.getTime() < issued || now.getTime() >= expires) fail('REVIEWED_TRANSPORT_AUTHORIZATION_EXPIRED');
  return manifest;
}

function validateFreshPackage(fullInput, manifest, now) {
  const data = snapshot(fullInput), current = now.getTime();
  if (!exact(data, ['version', 'input', 'metadata']) || data.version !== REVIEWED_TEST_PACKAGE_VERSION ||
    !exact(data.metadata, ['sourceRunId', 'sourceGitSha', 'retrievedAt', 'reportingWindow', 'recipientSha256', 'captures']) ||
    data.metadata.sourceRunId !== manifest.sourceRunId || data.metadata.sourceGitSha !== manifest.sourceGitSha ||
    !SHA.test(data.metadata.recipientSha256 ?? '') || data.input?.researchMode !== 'fresh-research') fail('REVIEWED_TRANSPORT_PROVENANCE_INVALID');
  const prepared = prepareReviewedPreviewEmail(data.input);
  assertReviewedTestAuthorization(prepared, manifest.authorization, now);
  const retrieved = timestamp(data.metadata.retrievedAt), window = data.metadata.reportingWindow;
  if (!exact(window, ['startInclusive', 'endExclusive', 'displayLabel']) ||
    window.displayLabel !== 'Manual rolling 72-hour research preview' || timestamp(window.endExclusive) !== retrieved ||
    retrieved - timestamp(window.startInclusive) !== 72 * 60 * 60 * 1000 || retrieved > current ||
    current - retrieved > MAX_RESEARCH_AGE_MS) fail('REVIEWED_TRANSPORT_RESEARCH_STALE');
  const edition = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(retrieved));
  if (data.input.editionDate !== edition) fail('REVIEWED_TRANSPORT_DATE_MISMATCH');
  const expected = data.input.stories.flatMap(story => story.packet.dossier.sources.filter(s => s.relationship !== 'context')
    .map(source => ({ story, source, candidateId: story.packet.draft.candidateId })));
  const captures = data.metadata.captures;
  if (!Array.isArray(captures) || captures.length !== expected.length || captures.length > 8 ||
    new Set(captures.map(c => `${c?.candidateId}:${c?.sourceId}`)).size !== captures.length) fail('REVIEWED_TRANSPORT_CAPTURES_INVALID');
  for (const { story, source, candidateId } of expected) {
    const capture = captures.find(c => c?.candidateId === candidateId && c?.sourceId === source.sourceId);
    const link = story.sources.find(s => s.sourceId === source.sourceId), identity = source.articleIdentity;
    if (!exact(capture, ['candidateId', 'sourceId', 'identity', 'sourceTextSha256']) || !identity ||
      JSON.stringify(capture.identity) !== JSON.stringify(identity) || capture.sourceTextSha256 !== hash(source.text) ||
      source.passages.map(p => p.text).join('\n') !== source.text || !SHA.test(identity.bodySha256 ?? '') ||
      identity.requestedUrl !== link?.url || identity.finalUrl !== link?.url ||
      !Array.isArray(identity.redirects) || identity.redirects.length !== 0 ||
      typeof identity.title !== 'string' || !identity.title.trim()) fail('REVIEWED_TRANSPORT_CAPTURE_CHANGED');
    const captured = timestamp(identity.retrievedAt), inspected = timestamp(identity.inspectedAt), reviewed = timestamp(story.review.reviewedAt);
    if (captured < retrieved || inspected < captured || inspected > reviewed || reviewed > current ||
      reviewed > timestamp(manifest.authorization.issuedAt) || current - captured > MAX_RESEARCH_AGE_MS ||
      timestamp(source.publishedAt) < timestamp(window.startInclusive) || timestamp(source.publishedAt) >= retrieved) fail('REVIEWED_TRANSPORT_CAPTURE_STALE');
  }
  return { data, prepared, expected };
}

async function recheckSources(expected, pageFetcher) {
  for (const { source, story } of expected) {
    const link = story.sources.find(s => s.sourceId === source.sourceId), original = source.articleIdentity;
    const current = await captureStructuredArticle({ url: link.url, publisherKey: source.publisherKey, title: original.title }, pageFetcher);
    if (current.status !== 'usable' || current.holds.length || current.identity?.requestedUrl !== original.requestedUrl ||
      current.identity.finalUrl !== original.finalUrl || current.identity.title !== original.title ||
      current.identity.advisoryCode !== original.advisoryCode || current.identity.releaseDate !== original.releaseDate ||
      current.identity.redirects.length || hash(current.excerpt) !== hash(source.text) ||
      JSON.stringify(current.blocks) !== JSON.stringify(source.passages.map(p => p.text))) fail('REVIEWED_TRANSPORT_SOURCE_RECHECK_FAILED');
  }
}

export async function runReviewedEmailTest({ mode, artifact, key, manifest: manifestInput, env,
  headSha, now = new Date(), clock = () => new Date(), pageFetcher = fetchReviewedArticlePage,
  sender = sendAuthorizedReviewedPreviewEmail } = {}) {
  if (!['--validate', '--send'].includes(mode)) fail('REVIEWED_TRANSPORT_MODE_INVALID');
  const manifest = assertReviewedEmailTestContext(manifestInput, env, headSha, now);
  const opened = openReviewedEmailTestPackage(artifact, key, manifest);
  const { data, prepared, expected } = validateFreshPackage(opened, manifest, now);
  // No Resend credentials are present in the workflow's validation step. The
  // send step repeats this source and full-review check before its only request.
  await recheckSources(expected, pageFetcher);
  const afterChecks = clock();
  assertReviewedEmailTestContext(manifest, env, headSha, afterChecks);
  validateFreshPackage(data, manifest, afterChecks);
  if (mode === '--validate') return { status: 'validated', storyCount: prepared.storyCount, emailRequests: 0 };
  if (typeof env.PERSONAL_PAPER_EMAIL !== 'string' || hash(env.PERSONAL_PAPER_EMAIL) !== data.metadata.recipientSha256) fail('REVIEWED_TRANSPORT_RECIPIENT_MISMATCH');
  return sender(prepared, { authorization: manifest.authorization, apiKey: env.RESEND_API_KEY,
    recipient: env.PERSONAL_PAPER_EMAIL, now: afterChecks, clock });
}

async function main() {
  if (process.argv.length !== 3 || !['--validate', '--send'].includes(process.argv[2])) fail('REVIEWED_TRANSPORT_MODE_INVALID');
  const path = new URL(`../../${REVIEWED_TEST_ARTIFACT_PATH}`, import.meta.url);
  // Resolve from the repository root, not arbitrary cwd or dispatch input.
  const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assertReviewedEmailTestContext(REVIEWED_EMAIL_TEST_MANIFEST, process.env, headSha);
  const info = await stat(path);
  if (!info.isFile() || info.size < 1 || info.size > MAX_BYTES) fail('REVIEWED_TRANSPORT_ARTIFACT_INVALID');
  const result = await runReviewedEmailTest({ mode: process.argv[2], artifact: await readFile(path),
    key: process.env.FIRST_FOLD_REVIEWED_TEST_KEY, manifest: REVIEWED_EMAIL_TEST_MANIFEST, env: process.env, headSha });
  // No recipient, body, source excerpts, keys, or raw provider errors in logs.
  console.log(JSON.stringify({ status: result.status, emailRequests: result.emailRequests,
    ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}) }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(error => {
  const code = /^(?:REVIEWED_TRANSPORT|REVIEWED_TEST)_[A-Z_]+$/u.test(error?.message ?? '') ? error.message : 'REVIEWED_TRANSPORT_FAILED';
  console.error(code); process.exitCode = 1;
});
