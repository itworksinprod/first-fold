// Pure offline scoring of the original frozen controls through the new contract.
import {assertSpanReviewJson} from './span-source-review.mjs';
import {buildPassageScopeReview,validatePassageScopeReview,PASSAGE_SCOPE_CONTRACT} from './passage-scope-review.mjs';
import {CONDITIONAL_SCOPE_CONTROLS,CONDITIONAL_SCOPE_CONTROLSET_SHA256} from './conditional-scope-controls.mjs';
const issued=new WeakMap();
const fail=code=>Object.assign(new Error(code),{code});
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));

export function preparePassageScopeCalibration(){
  const cases=CONDITIONAL_SCOPE_CONTROLS.map(c=>{
    const view=buildPassageScopeReview(c.input);
    if(view.data.spans.length!==c.expectedVerdicts.length)throw fail('PASSAGE_SCOPE_CONTROL_COVERAGE');
    return {caseId:c.id,view};
  });
  const plan=freeze({controlsetSha256:CONDITIONAL_SCOPE_CONTROLSET_SHA256,reviewContract:PASSAGE_SCOPE_CONTRACT,cases});
  issued.set(plan,CONDITIONAL_SCOPE_CONTROLS);return plan;
}
export function scorePassageScopeCalibration(records,plan){
  const controls=issued.get(plan);if(!controls)throw fail('PASSAGE_SCOPE_PLAN');
  assertSpanReviewJson(records);
  if(!Array.isArray(records)||records.length>controls.length)throw fail('PASSAGE_SCOPE_RECORDS');
  const results=records.map((record,i)=>{
    const c=controls[i];
    if(!exact(record,['caseId','response'])||record.caseId!==c.id)throw fail('PASSAGE_SCOPE_RECORD_ORDER');
    const verdict=validatePassageScopeReview(record.response,plan.cases[i].view);
    const mismatches=verdict.valid?verdict.spans.flatMap((s,n)=>s.verdict===c.expectedVerdicts[n]?[]:
      [{spanId:s.spanId,expected:c.expectedVerdicts[n],observed:s.verdict}]):[];
    return {caseId:c.id,rawResponse:structuredClone(record.response),verdict,expectedVerdicts:[...c.expectedVerdicts],
      labelMatch:verdict.valid&&!mismatches.length,mismatches};
  });
  const valid=results.filter(r=>r.verdict.valid),complete=records.length===controls.length;
  const mismatches=valid.flatMap(r=>r.mismatches.map(m=>({caseId:r.caseId,...m})));
  return freeze({controlsetSha256:plan.controlsetSha256,reviewContract:plan.reviewContract,report:{
    casesExpected:controls.length,casesRecorded:records.length,casesValid:valid.length,casesMatching:results.filter(r=>r.labelMatch).length,
    casesMissing:controls.slice(records.length).map(c=>c.id),invalidCases:results.filter(r=>!r.verdict.valid).map(r=>({caseId:r.caseId,code:r.verdict.code})),
    falsePositives:mismatches.filter(m=>m.expected!=='supported'&&m.observed==='supported'),
    falseNegatives:mismatches.filter(m=>m.expected==='supported'&&m.observed==='unsupported'),uncertain:mismatches.filter(m=>m.observed==='uncertain'),
    complete,structuralComplete:complete&&valid.length===controls.length,labelAgreementComplete:complete&&results.every(r=>r.labelMatch),
    provenanceVerified:false,modelQualified:false,articleApproved:false,publicationReady:false,
    independentReview:'required-not-performed-by-this-offline-scorer',
  },results});
}
