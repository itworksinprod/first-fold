// Pure offline preparation/scoring. No provider, credentials or production hook.
// Label agreement is a local comparison, not proof of model provenance or truth.
import {assertSpanReviewJson} from './span-source-review.mjs';
import {buildSourceSentenceReview, validateSourceSentenceReview, SOURCE_SENTENCE_CONTRACT} from './source-sentence-review.mjs';
import {CONDITIONAL_SCOPE_CONTROLS, CONDITIONAL_SCOPE_CONTROLSET_SHA256} from './conditional-scope-controls.mjs';

const issued = new WeakMap();
const fail = code => Object.assign(new Error(code), {code});
const freeze = x => {
  if (x && typeof x === 'object') {Object.values(x).forEach(freeze); Object.freeze(x);}
  return x;
};
const exact = (x, keys) => x && typeof x === 'object' && !Array.isArray(x) &&
  Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));

export function prepareConditionalScopeCalibration() {
  const cases = CONDITIONAL_SCOPE_CONTROLS.map(c => {
    const view = buildSourceSentenceReview(c.input);
    if (view.data.spans.length !== c.expectedVerdicts.length) throw fail('SCOPE_CONTROL_COVERAGE');
    return {caseId: c.id, view};
  });
  const plan = freeze({controlsetSha256: CONDITIONAL_SCOPE_CONTROLSET_SHA256,
    evidenceContract: SOURCE_SENTENCE_CONTRACT, cases});
  issued.set(plan, CONDITIONAL_SCOPE_CONTROLS);
  return plan;
}

// Host-assigned case IDs retain chronological order; partial prefixes stay partial.
// Invalid parsed replies are copied separately, not silently repaired into verdicts.
export function scoreConditionalScopeCalibration(records, plan) {
  const controls = issued.get(plan);
  if (!controls) throw fail('SCOPE_PLAN');
  assertSpanReviewJson(records);
  if (!Array.isArray(records) || records.length > controls.length) throw fail('SCOPE_RECORDS');
  const results = records.map((record, i) => {
    const c = controls[i], item = plan.cases[i];
    if (!exact(record, ['caseId', 'response']) || record.caseId !== c.id) throw fail('SCOPE_RECORD_ORDER');
    const verdict = validateSourceSentenceReview(record.response, item.view);
    const mismatches = verdict.valid ? verdict.spans.flatMap((s, n) => s.verdict === c.expectedVerdicts[n] ? [] :
      [{spanId: s.spanId, expected: c.expectedVerdicts[n], observed: s.verdict}]) : [];
    return {caseId: c.id, rawResponse: structuredClone(record.response), verdict,
      expectedVerdicts: [...c.expectedVerdicts], labelMatch: verdict.valid && mismatches.length === 0, mismatches};
  });
  const valid = results.filter(r => r.verdict.valid), complete = records.length === controls.length;
  const mismatches = valid.flatMap(r => r.mismatches.map(m => ({caseId: r.caseId, ...m})));
  return freeze({controlsetSha256: plan.controlsetSha256, evidenceContract: plan.evidenceContract,
    report: {
      casesExpected: controls.length, casesRecorded: records.length, casesValid: valid.length,
      casesMatching: results.filter(r => r.labelMatch).length,
      casesMissing: controls.slice(records.length).map(c => c.id),
      invalidCases: results.filter(r => !r.verdict.valid).map(r => r.caseId),
      falsePositives: mismatches.filter(m => m.expected !== 'supported' && m.observed === 'supported'),
      falseNegatives: mismatches.filter(m => m.expected === 'supported' && m.observed === 'unsupported'),
      uncertain: mismatches.filter(m => m.observed === 'uncertain'),
      complete, structuralComplete: complete && valid.length === controls.length,
      labelAgreementComplete: complete && results.every(r => r.labelMatch),
      provenanceVerified: false, modelQualified: false, articleApproved: false, publicationReady: false,
      independentReview: 'required-not-performed-by-this-offline-scorer',
    }, results});
}
