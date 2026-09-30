import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {preparePassageScopeCalibration as prepare,scorePassageScopeCalibration as score} from '../scripts/automation/experiments/passage-scope-calibration.mjs';
import {buildPassageScopeReview} from '../scripts/automation/experiments/passage-scope-review.mjs';
import {CONDITIONAL_SCOPE_CONTROLS as controls} from '../scripts/automation/experiments/conditional-scope-controls.mjs';
import {prepareConditionalScopeCalibration as prepareLegacy} from '../scripts/automation/experiments/conditional-scope-calibration.mjs';
const clone=x=>structuredClone(x),sha=x=>createHash('sha256').update(x).digest('hex');
// Fully injected assessments exercise structural checks and score bookkeeping.
// These are NOT model replies, an independent label review or qualification.
const shapes=[
  [['support','preserved'],['context','preserved']],
  [['support','missing'],['contradiction','missing']],
  [['support','none']],
  [['context','none']],
  [['support','none'],['context','preserved']],
  [['support','none'],['contradiction','missing']],
  [['support','preserved'],['context','preserved']],
  [['context','missing'],['contradiction','missing']],
  [['support','preserved'],['context','preserved']],
  [['support','missing'],['contradiction','missing']],
  [['context','none'],['support','preserved'],['context','preserved']],
  [['context','none'],['support','missing'],['contradiction','missing']],
  [['support','preserved'],['context','preserved']],
  [['context','none'],['context','missing']],
  [['support','preserved'],['context','preserved'],['context','preserved']],
  [['context','missing'],['contradiction','missing'],['contradiction','missing']],
];
function records(plan){return plan.cases.map((c,i)=>({caseId:c.caseId,response:{reviewSha256:c.view.data.reviewSha256,judgments:c.view.data.spans.map((s,n)=>{
  const passageChecks=shapes[i].map(([contribution,qualification],p)=>({evidenceId:c.view.data.passages[p].evidenceId,contribution,qualification,
    explanation:'Injected coverage assessment for offline mechanics only.',evidence:[{sentenceId:c.view.data.catalog.find(e=>e.evidenceId===c.view.data.passages[p].evidenceId).sentenceId}]}));
  const verdict=controls[i].expectedVerdicts[n];const contradiction=passageChecks.find(p=>p.contribution==='contradiction');
  const missing=passageChecks.find(p=>p.qualification==='missing'),support=passageChecks.find(p=>p.contribution==='support');
  const decisive=contradiction??missing??support;
  return {spanId:s.spanId,passageChecks,verdict,basis:verdict==='supported'?'supported':contradiction?'contradiction':'insufficient_evidence',
    explanation:'Injected outcome for bookkeeping, not evidence of model quality.',evidence:clone(decisive?.evidence??[])};
})}}));}

test('sixteen existing controls retain exact sources and labels; only the offline review view changes',()=>{
  const plan=prepare(),legacy=prepareLegacy();assert.equal(plan.controlsetSha256,legacy.controlsetSha256);
  assert.equal(plan.controlsetSha256,'22ba98ba1abbc942aff656912fefb3f2c35aae2ba9bb56b736b8f7ccff2b6341');
  for(const [i,c]of plan.cases.entries()){
    assert.equal(c.caseId,controls[i].id);assert.deepEqual(c.view,buildPassageScopeReview(controls[i].input));
    for(const k of ['sentence','spans','passages','catalog','excluded'])assert.deepEqual(c.view.data[k],legacy.cases[i].view.data[k]);
    assert.doesNotMatch(JSON.stringify(c.view),/expectedVerdicts|rationale|caseId|CS\d\d/);assert.ok(Object.isFrozen(c.view));
  }
});
test('a perfect injected response set tests bookkeeping, never model competence or article approval',()=>{
  const plan=prepare(),r=records(plan),out=score(r,plan);assert.equal(out.report.casesValid,16);assert.equal(out.report.casesMatching,16);
  assert.equal(out.report.complete,true);assert.equal(out.report.structuralComplete,true);assert.equal(out.report.labelAgreementComplete,true);
  for(const k of ['provenanceVerified','modelQualified','articleApproved','publicationReady'])assert.equal(out.report[k],false);
  assert.equal(out.report.independentReview,'required-not-performed-by-this-offline-scorer');assert.deepEqual(out.report.invalidCases,[]);
  assert.deepEqual(out.report.falsePositives,[]);assert.deepEqual(out.report.falseNegatives,[]);assert.deepEqual(out.report.uncertain,[]);
  assert.ok(Object.isFrozen(out.results[5].rawResponse));assert.deepEqual(out.results[5].rawResponse,r[5].response);
});
test('the old exact-copy shortcut without complete passage checks remains invalid, not silently repaired',()=>{
  const plan=prepare(),r=records(plan);delete r[5].response.judgments[0].passageChecks;
  const snapshot=clone(r[5].response),out=score(r,plan);assert.equal(out.report.structuralComplete,false);
  assert.deepEqual(out.report.invalidCases,[{caseId:'CS06',code:'PASSAGE_SCOPE_COVERAGE'}]);assert.deepEqual(out.results[5].rawResponse,snapshot);
});
test('recorded missing scope cannot be paired with support and treated as a label match',()=>{
  const plan=prepare(),r=records(plan);r[5].response.judgments[0].verdict='supported';r[5].response.judgments[0].basis='supported';
  const out=score(r,plan);assert.equal(out.results[5].verdict.code,'PASSAGE_SCOPE_CONSISTENCY');assert.equal(out.results[5].labelMatch,false);
});
test('a model can still hide an exception by misclassifying a row; it must remain a false positive',()=>{
  const plan=prepare(),r=records(plan),j=r[5].response.judgments[0];j.passageChecks[1]={...j.passageChecks[1],contribution:'unrelated',qualification:'none',evidence:[]};
  j.verdict='supported';j.basis='supported';j.evidence=clone(j.passageChecks[0].evidence);
  const out=score(r,plan);assert.equal(out.results[5].verdict.valid,true);assert.equal(out.results[5].verdict.supported,true);
  assert.deepEqual(out.report.falsePositives,[{caseId:'CS06',spanId:'T1',expected:'unsupported',observed:'supported'}]);
  assert.equal(out.report.labelAgreementComplete,false);assert.equal(out.report.modelQualified,false);
});
test('all-accept and all-reject classifications still fail balanced label calibration',()=>{
  for(const verdict of ['supported','unsupported']){
    const plan=prepare(),r=records(plan);
    for(const record of r)for(const j of record.response.judgments){
      j.passageChecks.forEach(p=>{p.contribution=verdict==='supported'?'support':'context';p.qualification='none';});
      j.verdict=verdict;j.basis=verdict==='supported'?'supported':'insufficient_evidence';j.evidence=clone(j.passageChecks[0].evidence);
    }
    const out=score(r,plan);assert.equal(out.report.casesValid,16);assert.equal(out.report.casesMatching,8);assert.equal(out.report.labelAgreementComplete,false);
    assert.equal(out.report.falsePositives.length,verdict==='supported'?8:0);assert.equal(out.report.falseNegatives.length,verdict==='unsupported'?8:0);
  }
});
test('uncertain rows with uncertain verdict stay recorded holds rather than correct expected labels',()=>{
  const plan=prepare(),r=records(plan),j=r[0].response.judgments[0];j.passageChecks[0].qualification='uncertain';j.basis='uncertain';j.verdict='uncertain';
  const out=score(r,plan);assert.equal(out.report.casesValid,16);assert.equal(out.report.casesMatching,15);assert.equal(out.report.uncertain.length,1);
});
test('empty or partial ordered prefixes stay incomplete',()=>{
  const plan=prepare();for(const n of [0,1,8,15]){const out=score(records(plan).slice(0,n),plan);
    assert.equal(out.report.casesRecorded,n);assert.equal(out.report.complete,false);assert.equal(out.report.structuralComplete,false);assert.equal(out.report.casesMissing.length,16-n);
  }
});
test('missing unknown reordered duplicate cases extra fields and unissued plans cannot score the experiment',()=>{
  const plan=prepare(),r=records(plan);assert.throws(()=>score(r,clone(plan)),/PASSAGE_SCOPE_PLAN/);
  for(const change of [x=>{x[0].caseId='CS99';},x=>{x.reverse();},x=>{x[1]=clone(x[0]);},x=>{x.push(clone(x[0]));},x=>{x[0].extra=1;}]){
    const bad=clone(r);change(bad);assert.throws(()=>score(bad,plan));
  }
});
test('invalid parsed replies are separately retained and hostile values never execute',()=>{
  const plan=prepare();for(const value of [null,42,'invalid',[],{},true]){
    const out=score([{caseId:'CS01',response:value}],plan);assert.equal(out.report.casesValid,0);assert.deepEqual(out.results[0].rawResponse,value);
  }
  let calls=0;const hostile=records(plan);Object.defineProperty(hostile[0],'response',{get(){calls++;},enumerable:true});assert.throws(()=>score(hostile,plan));assert.equal(calls,0);
});
test('offline scorer preserves live baseline code and has no credentials provider or write path',async()=>{
  const src=await readFile(new URL('../scripts/automation/experiments/passage-scope-calibration.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/fetch\(|process\.env|node:fs|workers-ai|resend|writeFile/);
  const legacy=await readFile(new URL('../scripts/automation/experiments/conditional-scope-controls.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(legacy,/passage-scope-review/);
  assert.equal(sha(await readFile(new URL('../scripts/automation/experiments/source-sentence-review.mjs',import.meta.url))),'906fcf509072e3a92f9dd1f4de4a435bbc9d3a48b3678a886d910fa22c0d4653');
});
