// Offline integrity checkpoint only. Pins record an independent source review;
// a matching checksum does not itself establish truth or authorize publication.
// Accept JSON text, not executable objects/accessors. No network or model calls.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { normalizeClaimwiseSummary } from '../fact-summary-diagnostic.mjs';
import { assertPhraseCopyeditUnits, phraseCopyeditUnitsHash } from './phrase-copyedit.mjs';

const fields = ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch'];
const sha = text => createHash('sha256').update(text).digest('hex');
const hash = value => sha(JSON.stringify(value));
const fail = reason => Object.assign(new Error(`FROZEN_BASELINE_${reason}`), { code: `FROZEN_BASELINE_${reason}` });
const scope = Object.freeze({ offlineOnly: true, capturedSourceOnly: true,
  freshnessVerified: false, readabilityApproved: false, emailAuthorized: false });
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join();
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

// The fixed production loader has no caller-supplied qualification override.
export const readFrozenQualification = () => readFile(new URL('../../../docs/checkpoints/mit-frozen-baseline.json', import.meta.url), 'utf8');
export async function loadPinnedFrozenFactBaseline(text) {
  return loadFrozenFactBaseline(text, await readFrozenQualification());
}
export function encodeFrozenBaselineSecret(text, qualificationText) {
  loadFrozenFactBaseline(text, qualificationText);
  const encoded = Buffer.from(text, 'utf8').toString('base64');
  if (encoded.length > 48_000) throw fail('SECRET_SIZE');
  return encoded;
}
export function decodeFrozenBaselineSecret(value) {
  if (typeof value !== 'string' || value.length > 48_002) throw fail('SECRET');
  const encoded = value.trim();
  if (!encoded || encoded.length > 48_000 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) throw fail('SECRET');
  const bytes = Buffer.from(encoded, 'base64'), text = bytes.toString('utf8');
  if (bytes.toString('base64') !== encoded || !Buffer.from(text, 'utf8').equals(bytes)) throw fail('SECRET');
  return text; // Every consumer must still validate the fixed qualification pins.
}
function parse(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 2_000_000) throw fail('INPUT');
  try { return JSON.parse(text); } catch { throw fail('JSON'); }
}
function evidenceCoverage(units, excerpt, qualification) {
  const passages = excerpt.split('\n');
  const expected = fields.flatMap(field => units[field].map((_, unitIndex) => `${field}:${unitIndex}`));
  const map = qualification.review?.evidenceMap;
  if (qualification.status !== 'source-qualified-for-private-editing-only' ||
      qualification.review?.verdict !== 'supported-by-captured-source' ||
      !Array.isArray(map) || map.length !== expected.length) throw fail('QUALIFICATION');
  for (const [index, entry] of map.entries()) {
    if (!exact(entry, ['field', 'unitIndex', 'passageIds']) || !Number.isInteger(entry.unitIndex) ||
        `${entry.field}:${entry.unitIndex}` !== expected[index] ||
        !Array.isArray(entry.passageIds) || !entry.passageIds.length ||
        new Set(entry.passageIds).size !== entry.passageIds.length ||
        entry.passageIds.some(id => typeof id !== 'string' || !/^P[1-9]\d*$/u.test(id) ||
          !passages[Number(id.slice(1)) - 1]?.trim())) throw fail('EVIDENCE_MAP');
  }
}

// qualificationText must come from the trusted, reviewed checkpoint in the repo,
// never from the candidate artifact or model. The local CLI has no pins override.
export function loadFrozenFactBaseline(artifactText, qualificationText) {
  const artifact = parse(artifactText), qualification = parse(qualificationText);
  if (!exact(artifact, ['format', 'qualificationSha256', 'source', 'factContext', 'draft', 'units', 'scope']) ||
      artifact.format !== 'private-frozen-fact-baseline-v1' || artifact.qualificationSha256 !== hash(qualification) ||
      !exact(artifact.scope, Object.keys(scope)) || Object.entries(scope).some(([k, v]) => artifact.scope[k] !== v) ||
      !exact(artifact.source, ['url', 'excerpt', 'excerptSha256']) ||
      typeof artifact.source.excerpt !== 'string' || !artifact.source.excerpt.trim() ||
      artifact.source.excerpt.length > 100_000 || artifact.source.url !== qualification.sourceUrl ||
      artifact.source.excerptSha256 !== qualification.excerptSha256 ||
      sha(artifact.source.excerpt) !== qualification.excerptSha256 ||
      !exact(artifact.factContext, ['attribution', 'facts']) ||
      hash(artifact.factContext) !== qualification.factContextSha256) throw fail('BINDING');
  assertPhraseCopyeditUnits(artifact.units);
  const normalized = normalizeClaimwiseSummary({ headline: artifact.units.headline[0],
    ...Object.fromEntries(fields.slice(1).map(field => [field, artifact.units[field]])) },
  artifact.source.excerpt, qualification.publisher);
  if (!exact(artifact.draft, fields) || fields.some(field => artifact.draft[field] !== normalized.draft[field]) ||
      hash(normalized.draft) !== qualification.draftSha256 ||
      phraseCopyeditUnitsHash(normalized.units) !== qualification.unitsSha256) throw fail('DRAFT');
  const bodyWords = fields.slice(1).map(field => normalized.draft[field]).join(' ').split(/\s+/u).length;
  if (bodyWords !== qualification.bodyWords) throw fail('WORD_COUNT');
  evidenceCoverage(normalized.units, artifact.source.excerpt, qualification);
  return freeze({ ...artifact, draft: normalized.draft, units: normalized.units });
}

export function freezeFactBaseline(diagnosticText, sheetText, qualificationText) {
  const diagnostic = parse(diagnosticText), sheet = parse(sheetText), qualification = parse(qualificationText);
  // Only the explicitly reviewed BEFORE snapshot qualifies; never the held final
  // output, a fresh writer response, or an artifact's self-reported approval.
  if (qualification.originSelection !== 'beforeCopyedit' || !diagnostic?.beforeCopyedit ||
      hash(sheet) !== qualification.factSheetSha256 || sheet.sourceUrl !== qualification.sourceUrl ||
      sheet.excerptSha256 !== qualification.excerptSha256 ||
      diagnostic.beforeCopyedit.draftSha256 !== qualification.draftSha256 ||
      diagnostic.beforeCopyedit.unitsSha256 !== qualification.unitsSha256) throw fail('ORIGIN');
  const artifact = { format: 'private-frozen-fact-baseline-v1', qualificationSha256: hash(qualification),
    source: diagnostic.source, factContext: { attribution: sheet.attribution, facts: sheet.facts },
    draft: diagnostic.beforeCopyedit.draft, units: diagnostic.beforeCopyedit.units, scope };
  const verified = loadFrozenFactBaseline(JSON.stringify(artifact), qualificationText);
  return `${JSON.stringify(verified, null, 2)}\n`;
}

export function frozenBaselineReceipt(artifactText, qualificationText) {
  const artifact = loadFrozenFactBaseline(artifactText, qualificationText);
  const qualification = parse(qualificationText);
  return { status: 'integrity-verified-not-publication-approval', checkpoint: qualification.id,
    draftSha256: hash(artifact.draft), unitsSha256: phraseCopyeditUnitsHash(artifact.units),
    sourceSha256: sha(artifact.source.excerpt), qualificationSha256: artifact.qualificationSha256,
    bodyWords: qualification.bodyWords, reviewedUnits: qualification.review.evidenceMap.length,
    modelCalls: 0, emailSent: false };
}
