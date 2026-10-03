// Offline targeted development subset. Witness semantics require independent reading.
import {assertSpanReviewJson} from './span-source-review.mjs';
import {
  buildSplitIncompatibilityWitnessReview,combineSplitIncompatibilityWitnessReviews,SPLIT_INCOMPATIBILITY_WITNESS_CONTRACT,
} from './split-incompatibility-witness-review.mjs';
import {CONDITIONAL_SCOPE_CONTROLS,CONDITIONAL_SCOPE_CONTROLSET_SHA256} from './conditional-scope-controls.mjs';
import {SPLIT_PASSAGE_SUBSET_SHA256} from './split-passage-calibration.mjs';
import {assessScopeReasoning,SCOPE_REASONING_EXPECTATIONS_SHA256} from './scope-reasoning-expectations.mjs';
const subset=CONDITIONAL_SCOPE_CONTROLS.slice(2,10),issued=new WeakMap();
const fail=code=>Object.assign(new Error(code),{code});
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));

export function prepareSplitIncompatibilityWitnessCalibration(){
  const plan=freeze({reviewContract:SPLIT_INCOMPATIBILITY_WITNESS_CONTRACT,controlsetSha256:CONDITIONAL_SCOPE_CONTROLSET_SHA256,
    subsetSha256:SPLIT_PASSAGE_SUBSET_SHA256,expectationsSha256:SCOPE_REASONING_EXPECTATIONS_SHA256,
    cases:subset.map(c=>({caseId:c.id,pair:buildSplitIncompatibilityWitnessReview(c.input)}))});
  issued.set(plan,subset);return plan;
}

export function scoreSplitIncompatibilityWitnessCalibration(records,plan){
  const controls=issued.get(plan);if(!controls)throw fail('SPLIT_WITNESS_PLAN');assertSpanReviewJson(records);
  if(!Array.isArray(records)||records.length>controls.length)throw fail('SPLIT_WITNESS_RECORDS');
  const results=records.map((r,i)=>{
    const c=controls[i];if(!exact(r,['caseId','claim','checks'])||r.caseId!==c.id)throw fail('SPLIT_WITNESS_ORDER');
    const composite=combineSplitIncompatibilityWitnessReviews(r.claim,r.checks,plan.cases[i].pair);
    const labelMatch=composite.valid&&composite.coreComposite.originalValidation.spans.every((s,n)=>s.verdict===c.expectedVerdicts[n]);
    return {caseId:c.id,rawClaim:structuredClone(r.claim),rawChecks:structuredClone(r.checks),composite,labelMatch,
      reasoning:assessScopeReasoning(c.id,composite.assembledSelection??null)};
  });
  const complete=results.length===controls.length;
  return freeze({reviewContract:plan.reviewContract,controlsetSha256:plan.controlsetSha256,subsetSha256:plan.subsetSha256,
    expectationsSha256:plan.expectationsSha256,report:{casesExpected:8,casesRecorded:results.length,
      casesValid:results.filter(r=>r.composite.valid).length,casesMatching:results.filter(r=>r.labelMatch).length,
      reasoningFieldsMatching:results.filter(r=>r.reasoning.fieldsMatch).length,casesMissing:controls.slice(results.length).map(c=>c.id),
      invalidCases:results.filter(r=>!r.composite.valid).map(r=>({caseId:r.caseId,code:r.composite.code})),
      reasoningFieldMismatches:results.filter(r=>!r.reasoning.fieldsMatch).map(r=>({caseId:r.caseId,issues:r.reasoning.issues})),
      structuralComplete:complete&&results.every(r=>r.composite.valid),labelAgreementComplete:complete&&results.every(r=>r.labelMatch),
      reasoningAgreementComplete:complete&&results.every(r=>r.labelMatch&&r.reasoning.fieldsMatch),
      witnessSemanticsChecked:false,explanationsChecked:false,independentReview:'required',targetedDevelopmentSubset:true,
      fullControlsetPassed:false,provenanceVerified:false,modelQualified:false,articleApproved:false,publicationReady:false},results});
}
