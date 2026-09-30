// Pure offline scoring of the original frozen controls through the new contract.
import {assertSpanReviewJson} from './span-source-review.mjs';
import {buildJointPassageReview,validateJointPassageReview,JOINT_PASSAGE_CONTRACT} from './joint-passage-review.mjs';
import {CONDITIONAL_SCOPE_CONTROLS,CONDITIONAL_SCOPE_CONTROLSET_SHA256} from './conditional-scope-controls.mjs';
import {assessScopeReasoning,SCOPE_REASONING_EXPECTATIONS_SHA256} from './scope-reasoning-expectations.mjs';
const issued=new WeakMap();
const fail=code=>Object.assign(new Error(code),{code});
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));

export function prepareJointPassageCalibration(){
  const cases=CONDITIONAL_SCOPE_CONTROLS.map(c=>{
    const view=buildJointPassageReview(c.input);
    if(view.data.spans.length!==c.expectedVerdicts.length)throw fail('JOINT_PASSAGE_CONTROL_COVERAGE');
    return {caseId:c.id,view};
  });
  const plan=freeze({controlsetSha256:CONDITIONAL_SCOPE_CONTROLSET_SHA256,reviewContract:JOINT_PASSAGE_CONTRACT,expectationsSha256:SCOPE_REASONING_EXPECTATIONS_SHA256,cases});
  issued.set(plan,CONDITIONAL_SCOPE_CONTROLS);return plan;
}
export function scoreJointPassageCalibration(records,plan){
  const controls=issued.get(plan);if(!controls)throw fail('JOINT_PASSAGE_PLAN');
  assertSpanReviewJson(records);
  if(!Array.isArray(records)||records.length>controls.length)throw fail('JOINT_PASSAGE_RECORDS');
  const results=records.map((record,i)=>{
    const c=controls[i];
    if(!exact(record,['caseId','response'])||record.caseId!==c.id)throw fail('JOINT_PASSAGE_RECORD_ORDER');
    const verdict=validateJointPassageReview(record.response,plan.cases[i].view);
    const mismatches=verdict.valid?verdict.spans.flatMap((s,n)=>s.verdict===c.expectedVerdicts[n]?[]:
      [{spanId:s.spanId,expected:c.expectedVerdicts[n],observed:s.verdict}]):[];
    return {caseId:c.id,rawResponse:structuredClone(record.response),verdict,expectedVerdicts:[...c.expectedVerdicts],
      labelMatch:verdict.valid&&!mismatches.length,mismatches,reasoning:assessScopeReasoning(c.id,record.response)};
  });
  const valid=results.filter(r=>r.verdict.valid),complete=records.length===controls.length;
  const mismatches=valid.flatMap(r=>r.mismatches.map(m=>({caseId:r.caseId,...m})));
  return freeze({controlsetSha256:plan.controlsetSha256,reviewContract:plan.reviewContract,expectationsSha256:plan.expectationsSha256,report:{
    casesExpected:controls.length,casesRecorded:records.length,casesValid:valid.length,casesMatching:results.filter(r=>r.labelMatch).length,
    casesMissing:controls.slice(records.length).map(c=>c.id),invalidCases:results.filter(r=>!r.verdict.valid).map(r=>({caseId:r.caseId,code:r.verdict.code})),
    falsePositives:mismatches.filter(m=>m.expected!=='supported'&&m.observed==='supported'),
    falseNegatives:mismatches.filter(m=>m.expected==='supported'&&m.observed==='unsupported'),uncertain:mismatches.filter(m=>m.observed==='uncertain'),
    complete,structuralComplete:complete&&valid.length===controls.length,labelAgreementComplete:complete&&results.every(r=>r.labelMatch),
    reasoningFieldsMatching:results.filter(r=>r.reasoning.fieldsMatch).length,
    reasoningFieldMismatches:results.filter(r=>!r.reasoning.fieldsMatch).map(r=>({caseId:r.caseId,issues:r.reasoning.issues})),
    reasoningAgreementComplete:complete&&results.every(r=>r.labelMatch&&r.reasoning.fieldsMatch),explanationsChecked:false,
    provenanceVerified:false,modelQualified:false,articleApproved:false,publicationReady:false,
    independentReview:'required-not-performed-by-this-offline-scorer',
  },results});
}
