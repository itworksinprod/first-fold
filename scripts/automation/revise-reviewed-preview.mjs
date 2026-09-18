#!/usr/bin/env node
// One private, bounded revision of already-captured evidence. Never research,
// delivery, qualification or reviewer approval. The pinned input is ciphertext.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDecoder } from 'node:util';
import { REVIEWED_REVISION_MANIFEST } from './reviewed-revision-manifest.mjs';
import { previewGeminiLite, validPreviewEvidenceMap, renderHumanReview } from './preview-gemini-lite.mjs';
import { FREE_PROJECT_CONFIRMATION } from './check-gemini-writer.mjs';
import { GEMINI_LITE_MODEL, geminiFailureDiagnostic } from './free/gemini-ai.mjs';
import { FRESH_PREVIEW_WRITER_PROFILE } from './free/fresh-preview-writer-prompt.mjs';
import { buildPreviewReviewPacket } from './free/preview-editorial-review.mjs';
import { previewSourceIntegrityHolds } from './free/preview-evidence-gate.mjs';
import { diagnosticPublicKey, sealDiagnostic } from './private-writer-diagnostic.mjs';

export const REVIEWED_REVISION_PURPOSE = 'private-reviewed-prose-revision-not-delivery';
const MANIFEST_VERSION = 'reviewed-prose-revision-manifest-v1';
const INPUT_VERSION = 'reviewed-prose-revision-input-v1';
const MAX_INPUT_BYTES = 200_000;
const MAX_ENVELOPE_BYTES = 270_000;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const INPUT_FILE = new URL('./reviewed-revision-input.encrypted.json', import.meta.url);
const safeFailureCodes = new Set([
  'REVIEWED_REVISION_CIPHER_INVALID', 'REVIEWED_REVISION_INPUT_INVALID',
  'REVIEWED_REVISION_AUTHORITY_REJECTED', 'REVIEWED_REVISION_MANIFEST_CLOSED',
  'REVIEWED_REVISION_EXPIRED', 'REVIEWED_REVISION_CIPHER_BINDING',
  'REVIEWED_REVISION_INPUT_BINDING', 'REVIEWED_REVISION_DECRYPTION_FAILED',
  'REVIEWED_REVISION_ORIGINAL_INVALID', 'REVIEWED_REVISION_FEEDBACK_INVALID',
  'REVIEWED_REVISION_SOURCE_INVALID', 'REVIEWED_REVISION_CONFIGURATION_INVALID',
  'REVIEWED_REVISION_NETWORK_REJECTED', 'REVIEWED_REVISION_REVALIDATION_HELD',
  'REVIEWED_REVISION_HELD', 'REVIEWED_REVISION_ARGUMENTS_INVALID',
]);
export function safeReviewedRevisionFailure(error) {
  // Never print messages, stacks, provider bodies, crypto details or keys.
  // Read only a data property: an untrusted accessor is not a diagnostic.
  try {
    const code = error && (typeof error === 'object' || typeof error === 'function')
      ? Object.getOwnPropertyDescriptor(error, 'code')?.value : undefined;
    return typeof code === 'string' && safeFailureCodes.has(code) ? code : 'REVIEWED_REVISION_FAILED';
  } catch { return 'REVIEWED_REVISION_FAILED'; }
}
const fields = ['headline', 'deck', 'claims.0', 'claims.1', 'whyItMatters', 'whatToDoOrWatch', 'story'];
const hash = value => createHash('sha256').update(value).digest('hex');
const hashJson = value => hash(JSON.stringify(value));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).sort().join() === [...keys].sort().join();
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const https = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.hash; }
  catch { return false; }
};
const base64 = (value, length) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) fail('REVIEWED_REVISION_CIPHER_INVALID');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || (length !== undefined && bytes.length !== length)) fail('REVIEWED_REVISION_CIPHER_INVALID');
  return bytes;
};
function transportKey(value) {
  // Two exact representations of the same 32 bytes, not two credentials.
  // This accepts existing lowercase-hex secrets without weakening envelope
  // encodings, permitting whitespace, or relying on Node's permissive decode.
  if (typeof value !== 'string') fail('REVIEWED_REVISION_CIPHER_INVALID');
  if (value.length === 64 && /^[a-f0-9]{64}$/u.test(value)) return Buffer.from(value, 'hex');
  if (value.length === 44) return base64(value, 32);
  fail('REVIEWED_REVISION_CIPHER_INVALID');
}
const aad = (testId, inputSha256) => Buffer.from(JSON.stringify({ purpose: REVIEWED_REVISION_PURPOSE, testId, inputSha256 }));
const snapshot = value => {
  // No user-provided getter, custom serializer or prototype can run while
  // taking an immutable baseline. The CLI additionally receives parsed JSON.
  let nodes = 0;
  const copy = (v, depth) => {
    if (++nodes > 25_000 || depth > 20) fail('REVIEWED_REVISION_INPUT_INVALID');
    if (v === null || typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) return v;
    if (!v || typeof v !== 'object' || (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype)) fail('REVIEWED_REVISION_INPUT_INVALID');
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (Reflect.ownKeys(v).some(k => typeof k !== 'string' || ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(k)) ||
        Object.values(descriptors).some(d => d.get || d.set)) fail('REVIEWED_REVISION_INPUT_INVALID');
    return Array.isArray(v) ? v.map(item => copy(item, depth + 1)) :
      Object.fromEntries(Object.entries(v).map(([k, item]) => [k, copy(item, depth + 1)]));
  };
  const result = copy(value, 0);
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_INPUT_BYTES) fail('REVIEWED_REVISION_INPUT_INVALID');
  return result;
};

export function assertReviewedRevisionAuthority(env) {
  if (env.GITHUB_REPOSITORY !== 'itworksinprod/first-fold' || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_WORKFLOW_REF !== 'itworksinprod/first-fold/.github/workflows/gemini-reviewed-revision.yml@refs/heads/main' ||
      env.GITHUB_ACTOR !== 'itworksinprod' || env.GITHUB_TRIGGERING_ACTOR !== 'itworksinprod' ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1') fail('REVIEWED_REVISION_AUTHORITY_REJECTED');
}

export function validateReviewedRevisionManifest(manifest, { now = new Date(), testId = manifest?.testId } = {}) {
  if (!exact(manifest, ['version', 'purpose', 'testId', 'sourceRunId', 'sourceGitSha', 'retrievedAt', 'expiresAt',
    'recordCount', 'inputSha256', 'cipherSha256']) || manifest.version !== MANIFEST_VERSION ||
    manifest.purpose !== REVIEWED_REVISION_PURPOSE || !/^[a-z0-9][a-z0-9-]{7,79}$/u.test(manifest.testId) ||
    testId !== manifest.testId || !/^[1-9][0-9]{5,19}$/u.test(manifest.sourceRunId) ||
    !/^[a-f0-9]{40}$/u.test(manifest.sourceGitSha) || !iso(manifest.retrievedAt) || !iso(manifest.expiresAt) ||
    ![1, 2].includes(manifest.recordCount) || !digest(manifest.inputSha256) || !digest(manifest.cipherSha256)) fail('REVIEWED_REVISION_MANIFEST_CLOSED');
  const clock = now instanceof Date ? now.getTime() : NaN;
  const captured = Date.parse(manifest.retrievedAt), expires = Date.parse(manifest.expiresAt);
  if (!Number.isFinite(clock) || clock < captured || clock >= expires || expires <= captured ||
      expires - captured > MAX_AGE_MS || clock - captured > MAX_AGE_MS) fail('REVIEWED_REVISION_EXPIRED');
  return manifest;
}

export function validateReviewedRevisionCipher(bytes, manifest, options) {
  validateReviewedRevisionManifest(manifest, options);
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_ENVELOPE_BYTES || hash(bytes) !== manifest.cipherSha256) fail('REVIEWED_REVISION_CIPHER_BINDING');
  let envelope;
  try { envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('REVIEWED_REVISION_CIPHER_INVALID'); }
  if (!exact(envelope, ['version', 'purpose', 'testId', 'inputSha256', 'iv', 'tag', 'ciphertext']) || envelope.version !== 1 ||
      envelope.purpose !== REVIEWED_REVISION_PURPOSE || envelope.testId !== manifest.testId ||
      envelope.inputSha256 !== manifest.inputSha256) fail('REVIEWED_REVISION_CIPHER_BINDING');
  base64(envelope.iv, 12); base64(envelope.tag, 16);
  if (base64(envelope.ciphertext).length > MAX_INPUT_BYTES) fail('REVIEWED_REVISION_CIPHER_INVALID');
  return envelope;
}

export function sealReviewedRevisionPackage(input, keyBase64) {
  const plain = snapshot(input), bytes = Buffer.from(JSON.stringify(plain));
  if (plain.version !== INPUT_VERSION || plain.purpose !== REVIEWED_REVISION_PURPOSE ||
      !/^[a-z0-9][a-z0-9-]{7,79}$/u.test(plain.testId)) fail('REVIEWED_REVISION_INPUT_INVALID');
  const inputSha256 = hash(bytes), key = transportKey(keyBase64), iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(plain.testId, inputSha256));
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const output = Buffer.from(JSON.stringify({ version: 1, purpose: REVIEWED_REVISION_PURPOSE,
      testId: plain.testId, inputSha256, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64') }));
    return { bytes: output, inputSha256, cipherSha256: hash(output) };
  } finally { key.fill(0); }
}

export function openReviewedRevisionPackage(bytes, keyBase64, manifest, options) {
  const envelope = validateReviewedRevisionCipher(bytes, manifest, options), key = transportKey(keyBase64);
  let plain;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, base64(envelope.iv, 12));
    decipher.setAAD(aad(manifest.testId, manifest.inputSha256)); decipher.setAuthTag(base64(envelope.tag, 16));
    const decoded = Buffer.concat([decipher.update(base64(envelope.ciphertext)), decipher.final()]);
    if (decoded.length > MAX_INPUT_BYTES || hash(decoded) !== manifest.inputSha256) fail('REVIEWED_REVISION_INPUT_BINDING');
    plain = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
  } catch { fail('REVIEWED_REVISION_DECRYPTION_FAILED'); } finally { key.fill(0); }
  return validateReviewedRevisionInput(plain, manifest, options);
}

function originalPayload(result) {
  if (!result || result.report?.approved !== false || result.report?.qualified !== false ||
      result.report?.productionEnabled !== false || result.report?.emailRequests !== 0 ||
      !['failed', 'human-review-required'].includes(result.report?.status)) fail('REVIEWED_REVISION_ORIGINAL_INVALID');
  const payload = result.report.status === 'failed' ? result.rejectedDiagnostic?.payload :
    { stories: [result.draft], evidenceForFields: result.evidenceForFields };
  if (result.report.status === 'failed' && result.rejectedDiagnostic?.unapproved !== true) fail('REVIEWED_REVISION_ORIGINAL_INVALID');
  if (!exact(payload, ['stories', 'evidenceForFields']) || !Array.isArray(payload.stories) || payload.stories.length !== 1 ||
      Buffer.byteLength(JSON.stringify(payload)) > 24_000) fail('REVIEWED_REVISION_ORIGINAL_INVALID');
  return payload;
}

export function validateReviewedRevisionInput(value, manifest, options = {}) {
  validateReviewedRevisionManifest(manifest, options);
  const input = snapshot(value);
  if (!exact(input, ['version', 'purpose', 'testId', 'sourceRunId', 'sourceGitSha', 'retrievedAt', 'expiresAt', 'publicKey', 'records']) ||
      input.version !== INPUT_VERSION || input.purpose !== REVIEWED_REVISION_PURPOSE ||
      ['purpose', 'testId', 'sourceRunId', 'sourceGitSha', 'retrievedAt', 'expiresAt'].some(k => input[k] !== manifest[k]) ||
      hashJson(input) !== manifest.inputSha256 || !Array.isArray(input.records) || input.records.length !== manifest.recordCount) fail('REVIEWED_REVISION_INPUT_BINDING');
  diagnosticPublicKey(input.publicKey);
  const now = (options.now ?? new Date()).getTime(), candidates = new Set();
  for (const record of input.records) {
    if (!exact(record, ['dossier', 'result', 'feedback']) || !Array.isArray(record.feedback) || record.feedback.length < 1 || record.feedback.length > 8 ||
        record.feedback.some(f => !exact(f, ['field', 'issue']) || !fields.includes(f.field) || !text(f.issue, 1600)) ||
        new Set(record.feedback.map(f => f.field)).size !== record.feedback.length) fail('REVIEWED_REVISION_FEEDBACK_INVALID');
    const d = record.dossier, payload = originalPayload(record.result);
    if (!text(d?.candidateId, 160) || candidates.has(d.candidateId) || payload.stories[0]?.candidateId !== d.candidateId ||
        !['authoritative-single', 'corroborated'].includes(d.evidenceTier) || !Array.isArray(d.sources) || !d.sources.length || d.sources.length > 3 ||
        !validPreviewEvidenceMap(payload.evidenceForFields, d) || previewSourceIntegrityHolds(d).length) fail('REVIEWED_REVISION_SOURCE_INVALID');
    candidates.add(d.candidateId);
    const allIds = new Set();
    for (const source of d.sources) {
      const identity = source.articleIdentity;
      if (!text(source.publisher, 200) || !text(source.text, 90_000) || !iso(source.publishedAt) ||
          !Array.isArray(source.passages) || source.passages.length < 2 || source.passages.length > 100 ||
          !identity || !https(identity.requestedUrl) || identity.requestedUrl !== identity.finalUrl ||
          !text(identity.title, 1000) || !digest(identity.bodySha256) || !iso(identity.retrievedAt) ||
          Date.parse(identity.retrievedAt) > now || now - Date.parse(identity.retrievedAt) > MAX_AGE_MS ||
          Date.parse(identity.retrievedAt) < Date.parse(input.retrievedAt) || Date.parse(source.publishedAt) > Date.parse(identity.retrievedAt)) fail('REVIEWED_REVISION_SOURCE_INVALID');
      for (const p of source.passages) {
        if (!/^S[1-9]\d{0,2}P[1-9]\d{0,3}$/u.test(p.evidenceId) || allIds.has(p.evidenceId) || !text(p.text, 18_000) ||
            !source.text.includes(p.text)) fail('REVIEWED_REVISION_SOURCE_INVALID');
        allIds.add(p.evidenceId);
      }
    }
    // Rebuild original field bindings now, before an external request. Holds
    // are expected on a rejected draft; malformed or unmappable data is not.
    buildPreviewReviewPacket(payload.stories[0], d, payload.evidenceForFields);
  }
  return input;
}

export async function reviseReviewedPreview({ bytes, keyBase64, manifest = REVIEWED_REVISION_MANIFEST,
  apiKey, freeProjectConfirmation, testId = manifest?.testId, clockImpl = () => new Date(),
  now = clockImpl(), fetchImpl = globalThis.fetch } = {}) {
  const unexpired = () => {
    try { validateReviewedRevisionManifest(manifest, { testId, now: clockImpl() }); return true; }
    catch { return false; }
  };
  const input = openReviewedRevisionPackage(bytes, keyBase64, manifest, { now, testId });
  if (freeProjectConfirmation !== FREE_PROJECT_CONFIRMATION || !/^[A-Za-z0-9_.-]{20,256}$/u.test(apiKey ?? '')) fail('REVIEWED_REVISION_CONFIGURATION_INVALID');
  const records = [];
  let requests = 0, stoppedCode = null;
  // Manually selected availability trial. No runtime model input or automatic
  // fallback: a failed request ends this bounded experiment unchanged.
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LITE_MODEL}:generateContent`;
  for (const record of input.records) {
    if (!unexpired()) { stoppedCode = 'REVIEWED_REVISION_EXPIRED'; break; }
    const dossier = structuredClone(record.dossier), payload = originalPayload(record.result);
    const original = buildPreviewReviewPacket(payload.stories[0], dossier, payload.evidenceForFields);
    let perStory = 0, expiredAtNetwork = false;
    const result = await previewGeminiLite({ apiKey, freeProjectConfirmation, model: GEMINI_LITE_MODEL,
      dossier: structuredClone(dossier), fresh: true, writerProfile: FRESH_PREVIEW_WRITER_PROFILE,
      repair: { unapproved: true, payload: structuredClone(payload), rejectionDetails: record.feedback.map(f => ({
        reason: 'INDEPENDENT_EDITORIAL_REJECTION', feedback: { field: f.field, issue: f.issue },
      })) },
      fetchImpl: async (url, options) => {
        if (!unexpired()) { expiredAtNetwork = true; fail('REVIEWED_REVISION_EXPIRED'); }
        if (perStory >= 1 || requests >= input.records.length || url !== endpoint || options?.method !== 'POST' || options.redirect !== 'error') fail('REVIEWED_REVISION_NETWORK_REJECTED');
        perStory++; requests++;
        return fetchImpl(url, options);
      } });
    if (expiredAtNetwork || !unexpired()) {
      result.report.status = 'failed'; result.report.code = 'REVIEWED_REVISION_EXPIRED'; result.html = null;
    }
    let revisedBinding = null;
    if (result.report.status === 'human-review-required') {
      const rebuilt = buildPreviewReviewPacket(result.draft, dossier, result.evidenceForFields);
      if (rebuilt.holds.length || rebuilt.binding.dossierSha256 !== original.binding.dossierSha256) {
        result.report.status = 'failed'; result.report.code = 'REVIEWED_REVISION_REVALIDATION_HELD';
        result.html = null;
      } else {
        revisedBinding = rebuilt.binding;
        result.html = renderHumanReview(result.draft, dossier, { fresh: true, storedEvidence: true, evidenceForFields: result.evidenceForFields });
      }
    }
    // No raw rendered HTML or provider envelope in the audit; reconstruct the
    // unapproved view locally from the exact revision and its immutable sources.
    const { html, ...compact } = result;
    records.push({ dossier, originalPayload: payload, feedback: record.feedback,
      originalBinding: original.binding, revisedBinding, result: { ...compact, hasDraftPreview: Boolean(html) } });
    if (!html) break; // no provider fallback and no automatic second attempt
  }
  const complete = records.length === input.records.length && records.every(r => r.result.hasDraftPreview);
  const report = { purpose: REVIEWED_REVISION_PURPOSE, testId: input.testId,
    status: complete ? 'human-review-required' : 'failed', freshResearch: false, sourceRunId: input.sourceRunId,
    sourceGitSha: input.sourceGitSha, evidenceRetrievedAt: input.retrievedAt, expiresAt: input.expiresAt,
    model: GEMINI_LITE_MODEL, modelRequests: requests, maxModelRequests: input.records.length,
    draftCount: records.filter(r => r.result.hasDraftPreview).length, searchRequests: 0, articleRequests: 0,
    emailRequests: 0, approved: false, qualified: false, productionEnabled: false, manualProseEdits: 0,
    ...(complete ? {} : { code: stoppedCode ?? records.at(-1)?.result.report.code ?? 'REVIEWED_REVISION_HELD',
      ...geminiFailureDiagnostic(records.at(-1)?.result.report) }) };
  return { report, sealed: sealDiagnostic({ report, inputBinding: { inputSha256: manifest.inputSha256,
    cipherSha256: manifest.cipherSha256 }, records }, input.publicKey) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assertReviewedRevisionAuthority(process.env);
    const manifest = REVIEWED_REVISION_MANIFEST, bytes = await readFile(INPUT_FILE);
    const options = { testId: process.env.REVIEWED_REVISION_TEST_ID, now: new Date() };
    if (process.argv.length === 3 && process.argv[2] === '--validate-only') {
      validateReviewedRevisionCipher(bytes, manifest, options);
      console.info('Pinned encrypted revision input verified; no credentials used.');
    } else if (process.argv.length === 4 && process.argv[2] === '--human-review-only') {
      const result = await reviseReviewedPreview({ bytes, manifest, ...options,
        keyBase64: process.env.FIRST_FOLD_REVIEWED_TEST_KEY, apiKey: process.env.GEMINI_API_KEY,
        freeProjectConfirmation: process.env.GEMINI_FREE_PROJECT_CONFIRMATION });
      await writeFile(process.argv[3], JSON.stringify(result.sealed), { flag: 'wx', mode: 0o600 });
      console.info(JSON.stringify(result.report));
      if (result.report.status !== 'human-review-required') process.exitCode = 1;
    } else fail('REVIEWED_REVISION_ARGUMENTS_INVALID');
  } catch (error) {
    console.error(`${safeReviewedRevisionFailure(error)}: Reviewed revision held; no email was sent.`);
    process.exitCode = 1;
  }
}
