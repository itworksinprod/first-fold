// Eligibility for ONE explicit, isolated evidence-led writing revision. This
// module never calls a provider, edits evidence, renders text or grants approval.
// The caller must preserve its shared correction budget and revalidate the full
// returned draft before a separate independent review.
import { GEMINI_LITE_MODEL } from './gemini-ai.mjs';
import { validateGroundedStory } from './grounded-draft.mjs';
import { validPreviewEvidenceMap } from '../preview-gemini-lite.mjs';
import { previewSourceIntegrityHolds } from './preview-evidence-gate.mjs';
import { advisoryDraftAlarms } from './preview-advisory-contract.mjs';
import { previewReaderAlarms } from './preview-reader-alarms.mjs';

const FIELDS = ['headline', 'deck', 'whyItMatters', 'whatToDoOrWatch'];
const SOURCE_CODES = new Set(['SOURCE_CAVEAT', 'NUMERIC_CITATION', 'NUMERIC_ANCHOR', 'ATTRIBUTION', 'CORROBORATION']);
const COMPANION_CODES = new Set(['ORIGINALITY', 'WORD_COUNT']);
const ALARM_CODES = new Set([
  'CERTAINTY_REVIEW_REQUIRED', 'MAPPED_AUDIENCE_SUPPORT_REQUIRED', 'PHASED_ROLLOUT_SCOPE_REQUIRED',
  'ABSENT_CREDENTIALS_SCOPE_REQUIRED', 'PUBLISHER_PERFORMANCE_ATTRIBUTION_REQUIRED',
  'PERFORMANCE_UPPER_BOUND_REQUIRED', 'PREVIEW_AUDIENCE_SCOPE_REQUIRED',
  'ADVISORY_HEADLINE_TECHNICAL_EVIDENCE_REQUIRED', 'ADVISORY_ORIGIN_EVIDENCE_REQUIRED',
  'ADVISORY_SUBSET_SCOPE_REQUIRED', 'ADVISORY_TECHNICAL_CLAIM_EVIDENCE_REQUIRED',
  'ADVISORY_ATTACK_CONDITION_REQUIRED', 'ADVISORY_SCOPE_EVIDENCE_REQUIRED',
  'ADVISORY_SCORE_CAUSALITY_REVIEW', 'ADVISORY_OPERATOR_FAULT_REVIEW',
  'ADVISORY_FIX_COMPATIBILITY_REVIEW', 'ADVISORY_ORIGIN_CHRONOLOGY_REQUIRED',
  'ADVISORY_UNPAIRED_FIX_VERSION_REVIEW',
]);
const fail = () => { throw Object.assign(new Error('PREVIEW_EVIDENCE_REVISION_NOT_ELIGIBLE'),
  { code: 'PREVIEW_EVIDENCE_REVISION_NOT_ELIGIBLE' }); };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join();

// Imported diagnostics are data, not executable object graphs. Test property
// descriptors before JSON serialization so getters/toJSON cannot run here.
function plainData(value, active = new Set(), depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 20000 || depth > 20) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 70000;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || active.has(value)) return false;
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
  if (names.some(name => typeof name !== 'string') || array && (value.length > 2000 || names.length !== value.length + 1 ||
      names.some(name => name !== 'length' && !/^(?:0|[1-9]\d*)$/u.test(name)))) return false;
  active.add(value);
  const valid = names.every(name => Object.hasOwn(descriptors[name], 'value') &&
    (array && name === 'length' || descriptors[name].enumerable && plainData(descriptors[name].value, active, depth + 1, budget)));
  active.delete(value);
  return valid;
}
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

function reconstructedRevision(result, dossier) {
  if (!plainData(result) || !plainData(dossier)) fail();
  const report = result?.report, saved = result?.rejectedDiagnostic, payload = saved?.payload;
  if (report?.status !== 'failed' || report.code !== 'GEMINI_EDITORIAL_VALIDATION_FAILED' ||
      report.model !== GEMINI_LITE_MODEL || report.approved !== false || report.qualified !== false ||
      report.productionEnabled !== false || report.emailRequests !== 0 || result.html !== null ||
      !exactKeys(saved, ['unapproved', 'payload', 'rejectionDetails']) || saved.unapproved !== true ||
      !exactKeys(payload, ['evidenceForFields', 'stories']) || !Array.isArray(payload.stories) || payload.stories.length !== 1 ||
      !Array.isArray(report.structuralErrors) || !report.structuralErrors.length || report.structuralErrors.length > 8 ||
      new Set(report.structuralErrors).size !== report.structuralErrors.length ||
      !Array.isArray(saved.rejectionDetails) || !saved.rejectionDetails.length || saved.rejectionDetails.length > 8 ||
      Buffer.byteLength(JSON.stringify(payload)) > 24000 ||
      typeof dossier?.candidateId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/u.test(dossier.candidateId) ||
      !['authoritative-single', 'corroborated'].includes(dossier.evidenceTier) ||
      !Array.isArray(dossier.sources) || !dossier.sources.length || dossier.sources.length > 8 ||
      !dossier.sources.every(source => typeof source?.text === 'string' && source.text.length > 0 &&
        typeof source.publisher === 'string' && source.publisher.length > 0 &&
        Array.isArray(source.passages) && source.passages.length >= 2 && source.passages.length <= 200 &&
        source.passages.every(p => typeof p?.evidenceId === 'string' && /^S[1-9]\d?P[1-9]\d{0,2}$/u.test(p.evidenceId) &&
          typeof p.text === 'string' && p.text.length > 0))) fail();
  // A broken or incomplete source capture needs research repair, not a writer
  // being asked to invent the missing source condition.
  if (previewSourceIntegrityHolds(dossier).length) fail();
  const evidenceIds = dossier.sources.flatMap(source => source.passages.map(p => p.evidenceId));
  if (new Set(evidenceIds).size !== evidenceIds.length || !validPreviewEvidenceMap(payload.evidenceForFields, dossier)) fail();
  const draft = payload.stories[0];
  if (!exactKeys(draft, ['candidateId', ...FIELDS, 'claims']) || draft.candidateId !== dossier.candidateId ||
      !FIELDS.every(field => typeof draft[field] === 'string' && draft[field].length > 0 && draft[field].length <= 24000) ||
      !Array.isArray(draft.claims) || draft.claims.length !== 2 || draft.claims.some(claim =>
        !exactKeys(claim, ['text', 'supports']) || typeof claim.text !== 'string' || !claim.text.length || claim.text.length > 24000 ||
        !Array.isArray(claim.supports) || !claim.supports.length || claim.supports.length > 3 ||
        new Set(claim.supports.map(s => s?.evidenceId)).size !== claim.supports.length || claim.supports.some(s =>
          !exactKeys(s, ['evidenceId']) || !evidenceIds.includes(s.evidenceId)))) fail();
  const reconstructed = [];
  validateGroundedStory(draft, dossier, (reason, feedback) => reconstructed.push({ reason, feedback }),
    { previewFieldEvidence: payload.evidenceForFields });
  const structuralCodes = reconstructed.map(detail => detail.reason);
  if (structuralCodes.some(code => !SOURCE_CODES.has(code) && !COMPANION_CODES.has(code))) fail();
  const alarms = [...advisoryDraftAlarms(draft, dossier, payload.evidenceForFields),
    ...previewReaderAlarms(draft, dossier, payload.evidenceForFields)];
  // In particular, ADVISORY_CHRONOLOGY_CONTEXT_REQUIRED is NOT revisable: its
  // source chronology is unavailable. Unknown future alarms also fail closed.
  if (alarms.some(alarm => !ALARM_CODES.has(alarm.code))) fail();
  reconstructed.push(...alarms.map(alarm => ({ reason: alarm.code, feedback: { field: alarm.field } })));
  if (!structuralCodes.some(code => SOURCE_CODES.has(code)) && !alarms.length) fail();
  if (!reconstructed.length || reconstructed.length > 8 ||
      !equal(saved.rejectionDetails, reconstructed) ||
      !equal([...report.structuralErrors].sort(), [...new Set(reconstructed.map(detail => detail.reason))].sort())) fail();
  const revision = { unapproved: true, payload: structuredClone(payload), rejectionDetails: structuredClone(reconstructed) };
  if (Buffer.byteLength(JSON.stringify(revision)) > 28000) fail();
  return revision;
}

export function previewEvidenceRevisionAllowed(result, dossier) {
  try { reconstructedRevision(result, dossier); return true; } catch { return false; }
}

export function buildPreviewEvidenceRevision(result, dossier) {
  return reconstructedRevision(result, dossier);
}
