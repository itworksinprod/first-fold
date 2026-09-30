// Host-only development-set diagnostics. Never include these expectations in model views.
import {createHash} from 'node:crypto';
import {assertSpanReviewJson} from './span-source-review.mjs';
import {CONDITIONAL_SCOPE_CONTROLS,CONDITIONAL_SCOPE_CONTROLSET_SHA256} from './conditional-scope-controls.mjs';
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const rows=[
  ['supported','S1P1','preserved'],
  ['contradiction','S1P1','missing'],
  ['supported','S1P1','preserved'],
  ['insufficient_evidence',null,null],
  ['supported','S1P2','preserved'],
  ['contradiction','S1P2','missing'],
  ['supported','S1P1','preserved'],
  ['contradiction','S1P2','missing'],
  ['supported','S1P1','preserved'],
  ['contradiction','S1P2','missing'],
  ['supported','S1P2','preserved'],
  ['contradiction','S1P2','missing'],
  ['supported','S1P1','preserved'],
  ['insufficient_evidence',null,null],
  ['supported','S1P1','preserved'],
  ['contradiction','S1P2','missing'],
];
export const SCOPE_REASONING_EXPECTATIONS=freeze(rows.map(([basis,evidenceId,qualification],i)=>({
  caseId:CONDITIONAL_SCOPE_CONTROLS[i].id,spanId:'T1',verdict:CONDITIONAL_SCOPE_CONTROLS[i].expectedVerdicts[0],basis,
  qualificationAnchors:evidenceId?[{evidenceId,qualification}]:[],
})));
export const SCOPE_REASONING_EXPECTATIONS_SHA256=createHash('sha256').update(JSON.stringify({
  controlsetSha256:CONDITIONAL_SCOPE_CONTROLSET_SHA256,expectations:SCOPE_REASONING_EXPECTATIONS,
})).digest('hex');

// Structural validity is separate. Inspect recognizable rejected replies too, without repairing them.
export function assessScopeReasoning(caseId,response){
  const expected=SCOPE_REASONING_EXPECTATIONS.find(e=>e.caseId===caseId);
  if(!expected)throw Object.assign(new Error('SCOPE_REASONING_CASE'),{code:'SCOPE_REASONING_CASE'});
  const flags={explanationsChecked:false,unscoredRowFieldsRequireReview:true,modelQualified:false,articleApproved:false,publicationReady:false};
  try{assertSpanReviewJson(response);}catch{
    return freeze({caseId,fieldsMatch:false,issues:[{field:'response',code:'UNSAFE_DATA'}],...flags});
  }
  if(!response||!Array.isArray(response.judgments)||response.judgments.length!==1||response.judgments[0]?.spanId!==expected.spanId){
    return freeze({caseId,fieldsMatch:false,issues:[{field:'judgments',code:'UNRECOGNIZED_COVERAGE'}],...flags});
  }
  const j=response.judgments[0],issues=[];
  for(const field of ['verdict','basis'])if(j[field]!==expected[field])issues.push({field,expected:expected[field],observed:structuredClone(j[field]??null)});
  for(const anchor of expected.qualificationAnchors){
    const found=Array.isArray(j.passageChecks)?j.passageChecks.filter(p=>p?.evidenceId===anchor.evidenceId):[];
    if(found.length!==1)issues.push({field:'qualification',evidenceId:anchor.evidenceId,expected:anchor.qualification,observed:null,code:'MISSING_OR_DUPLICATE_ANCHOR'});
    else if(found[0].qualification!==anchor.qualification)issues.push({field:'qualification',evidenceId:anchor.evidenceId,expected:anchor.qualification,observed:structuredClone(found[0].qualification??null)});
  }
  return freeze({caseId,fieldsMatch:issues.length===0,issues,qualificationAnchorsChecked:expected.qualificationAnchors.length,...flags});
}
