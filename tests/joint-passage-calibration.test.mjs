import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareJointPassageCalibration as prepare,scoreJointPassageCalibration as score} from '../scripts/automation/experiments/joint-passage-calibration.mjs';
import {preparePassageScopeCalibration,scorePassageScopeCalibration} from '../scripts/automation/experiments/passage-scope-calibration.mjs';
import {SCOPE_REASONING_EXPECTATIONS as gold,SCOPE_REASONING_EXPECTATIONS_SHA256,assessScopeReasoning as assess} from '../scripts/automation/experiments/scope-reasoning-expectations.mjs';
import {CONDITIONAL_SCOPE_CONTROLS as controls,CONDITIONAL_SCOPE_CONTROLSET_SHA256} from '../scripts/automation/experiments/conditional-scope-controls.mjs';
import {JOINT_PASSAGE_V2_PROMPT} from '../scripts/automation/experiments/joint-passage-review.mjs';
import {buildPassageScopeReview,validatePassageScopeReview} from '../scripts/automation/experiments/passage-scope-review.mjs';
const clone=x=>structuredClone(x),sha=x=>createHash('sha256').update(x).digest('hex');
const raw=await readFile(new URL('./fixtures/passage-scope-live-36791068732.json',import.meta.url),'utf8'),fixture=JSON.parse(raw);
const v2raw=await readFile(new URL('./fixtures/joint-passage-live-36795623890.json',import.meta.url),'utf8'),v2fixture=JSON.parse(v2raw);
// Deliberately injected shape/label fixtures, never live model competence evidence.
function records(plan){return plan.cases.map((c,i)=>{const expected=gold[i],v=c.view;
  const passageChecks=v.data.passages.map(p=>({evidenceId:p.evidenceId,contribution:'context',qualification:'none',
    explanation:'Injected bookkeeping assessment only.',evidence:[{sentenceId:v.data.catalog.find(e=>e.evidenceId===p.evidenceId).sentenceId}]}));
  for(const anchor of expected.qualificationAnchors)passageChecks.find(p=>p.evidenceId===anchor.evidenceId).qualification=anchor.qualification;
  let evidence=[];
  if(expected.basis==='supported'){
    const n=i===10?1:0;passageChecks[n].contribution='support';evidence=clone(passageChecks[n].evidence);
    const other=passageChecks.find((p,k)=>k!==n&&p.qualification==='preserved');if(other)evidence.push(...other.evidence);
  }else if(expected.basis==='contradiction'){
    const n=i===11?2:1;passageChecks[n].contribution='contradiction';evidence=clone(passageChecks[n].evidence);
  }
  return {caseId:c.caseId,response:{reviewSha256:v.data.reviewSha256,judgments:[{spanId:'T1',passageChecks,verdict:expected.verdict,basis:expected.basis,
    explanation:'Injected outcome for calibration bookkeeping.',evidence}]}};
});}

test('independently declared basis expectations and fourteen decisive qualification anchors are frozen host-only data',()=>{
  assert.equal(CONDITIONAL_SCOPE_CONTROLSET_SHA256,'22ba98ba1abbc942aff656912fefb3f2c35aae2ba9bb56b736b8f7ccff2b6341');
  assert.equal(SCOPE_REASONING_EXPECTATIONS_SHA256,'174aca301c001c89e9279177ee2529aeb010e288630ec8e432066821d5fde9d0');
  assert.equal(gold.length,16);assert.equal(gold.flatMap(e=>e.qualificationAnchors).length,14);
  assert.deepEqual(gold.map(e=>e.verdict),controls.map(c=>c.expectedVerdicts[0]));
  assert.deepEqual(gold.filter(e=>!e.qualificationAnchors.length).map(e=>e.caseId),['CS04','CS14']);
  for(const e of gold){assert.ok(Object.isFrozen(e));assert.ok(Object.isFrozen(e.qualificationAnchors));}
  const p=prepare();assert.equal(p.expectationsSha256,SCOPE_REASONING_EXPECTATIONS_SHA256);
  for(const c of p.cases)assert.doesNotMatch(JSON.stringify(c.view),/qualificationAnchors|expectationsSha256|expectedVerdicts|CS\d\d|174aca301/);
});
test('all injected basis/role matches remain unqualified and do not certify explanations',()=>{
  const p=prepare(),r=records(p),out=score(r,p);assert.equal(out.report.casesValid,16);assert.equal(out.report.casesMatching,16);
  assert.equal(out.report.reasoningFieldsMatching,16);assert.equal(out.report.reasoningAgreementComplete,true);
  for(const k of ['modelQualified','articleApproved','publicationReady','provenanceVerified','explanationsChecked'])assert.equal(out.report[k],false);
  assert.ok(Object.isFrozen(out));assert.ok(Object.isFrozen(out.results[0].rawResponse));
  assert.equal(out.results[3].reasoning.qualificationAnchorsChecked,0);assert.equal(out.results[3].reasoning.unscoredRowFieldsRequireReview,true);
  assert.equal(out.results[13].reasoning.qualificationAnchorsChecked,0);
});
test('exact unchanged five live replies reproduce the old stop and expose wrong reasons despite matching labels',()=>{
  assert.equal(sha(raw),'8fe919c023e28e5f6992d129ca9c87a0850f7d1fbc2aca732634caf734d957f8');
  assert.equal(fixture.captureSha256,'d4631178588e6815ebe8fa1ac7a86b6fc904cf9e09ecffa4be280dcee1f08282');
  const old=scorePassageScopeCalibration(fixture.records,preparePassageScopeCalibration());
  assert.equal(old.report.casesValid,4);assert.equal(old.report.casesMatching,4);
  assert.deepEqual(old.report.invalidCases,[{caseId:'CS05',code:'PASSAGE_SCOPE_FINAL_EVIDENCE'}]);
  const findings=fixture.records.map(r=>assess(r.caseId,r.response));
  assert.deepEqual(findings.filter(f=>!f.fieldsMatch).map(f=>f.caseId),['CS01','CS04','CS05']);
  assert.deepEqual(findings[3].issues,[{field:'basis',expected:'insufficient_evidence',observed:'contradiction'}]);
  assert.deepEqual(findings[4].issues.map(i=>i.field),['verdict','basis','qualification']);
  assert.equal(findings[4].issues.at(-1).expected,'preserved');assert.equal(findings[4].issues.at(-1).observed,'missing');
});
test('historical replies are not rebound into fresh v2 responses; their diagnostic fields cannot pass calibration',()=>{
  const out=score(fixture.records,prepare());assert.equal(out.report.casesValid,0);assert.equal(out.report.reasoningFieldsMatching,2);
  assert.equal(out.report.reasoningAgreementComplete,false);assert.equal(out.report.complete,false);
  assert.deepEqual(out.results.map(r=>r.rawResponse),fixture.records.map(r=>r.response));
});
test('a citation-only change to a cloned failure leaves its wrong inference and basis diagnosed',()=>{
  const altered=clone(fixture.records[4].response);altered.judgments[0].evidence=[{sentenceId:'S1P2S1'}];
  const diagnostic=assess('CS05',altered);assert.equal(diagnostic.fieldsMatch,false);
  assert.deepEqual(diagnostic.issues.map(i=>i.field),['verdict','basis','qualification']);
  assert.equal(fixture.records[4].response.judgments[0].evidence[0].sentenceId,'S1P1S1');
});
test('wrong-but-consistent contradiction basis is held even with sixteen matching verdicts',()=>{
  const p=prepare(),r=records(p),j=r[3].response.judgments[0];j.basis='contradiction';j.passageChecks[0].contribution='contradiction';
  j.evidence=clone(j.passageChecks[0].evidence);const out=score(r,p);
  assert.equal(out.report.casesValid,16);assert.equal(out.report.casesMatching,16);assert.equal(out.report.labelAgreementComplete,true);
  assert.equal(out.report.reasoningAgreementComplete,false);assert.equal(out.report.reasoningFieldsMatching,15);
  assert.equal(out.report.reasoningFieldMismatches[0].caseId,'CS04');
});
test('retained restriction marked none is diagnosed independently of the final supported label',()=>{
  const p=prepare(),r=records(p);r[0].response.judgments[0].passageChecks[0].qualification='none';const out=score(r,p);
  assert.equal(out.report.casesMatching,16);assert.equal(out.report.reasoningFieldsMatching,15);assert.equal(out.report.reasoningAgreementComplete,false);
});
test('ambiguous unscored roles are not arbitrarily counted wrong or claimed independently reviewed',()=>{
  const p=prepare(),r=records(p);for(const i of [3,13]){
    const j=r[i].response.judgments[0];j.passageChecks[0].qualification='missing';j.evidence=clone(j.passageChecks[0].evidence);
    assert.equal(assess(r[i].caseId,r[i].response).fieldsMatch,true);
  }
  const out=score(r,p);assert.equal(out.report.reasoningAgreementComplete,true);assert.equal(out.report.explanationsChecked,false);
});
test('matching semantic fields cannot hide malformed citations or supply validity to an incomplete set',()=>{
  const p=prepare(),r=records(p);r[4].response.judgments[0].evidence=[{sentenceId:'S1P99S1'}];const out=score(r,p);
  assert.equal(out.report.reasoningFieldsMatching,16);assert.equal(out.report.casesValid,15);assert.equal(out.report.reasoningAgreementComplete,false);
  for(const n of [0,1,4,15]){const partial=score(records(p).slice(0,n),p);assert.equal(partial.report.reasoningAgreementComplete,false);assert.equal(partial.report.casesMissing.length,16-n);}
});
test('all-accept and all-reject fixtures still fail the original balanced labels and new reasoning fields',()=>{
  for(const verdict of ['supported','unsupported']){const p=prepare(),r=records(p);
    for(const record of r){const j=record.response.judgments[0];j.verdict=verdict;j.basis=verdict==='supported'?'supported':'insufficient_evidence';
      j.passageChecks.forEach(c=>{c.contribution=verdict==='supported'?'support':'context';c.qualification='none';});j.evidence=clone(j.passageChecks[0].evidence);}
    const out=score(r,p);assert.equal(out.report.casesValid,16);assert.equal(out.report.casesMatching,8);assert.equal(out.report.reasoningAgreementComplete,false);
  }
});
test('hostile diagnostics and ambiguous coverage fail without executing getters or silently deduplicating anchors',()=>{
  const p=prepare(),r=records(p)[0].response;let reads=0;const getter=clone(r);Object.defineProperty(getter,'judgments',{get(){reads++;},enumerable:true});
  const proxy=new Proxy(r,{ownKeys(){reads++;return[];}}),cyclic=clone(r);cyclic.self=cyclic;
  for(const value of [getter,proxy,cyclic,null,{},[],42])assert.equal(assess('CS01',value).fieldsMatch,false);assert.equal(reads,0);
  const duplicate=clone(r);duplicate.judgments[0].passageChecks.push(clone(duplicate.judgments[0].passageChecks[0]));
  assert.equal(assess('CS01',duplicate).issues[0].code,'MISSING_OR_DUPLICATE_ANCHOR');
  assert.throws(()=>assess('CS99',r),/SCOPE_REASONING_CASE/);
});
test('ordered issued-plan scoring rejects reordering duplicates extra fields or substituted plans',()=>{
  const p=prepare(),r=records(p);assert.throws(()=>score(r,clone(p)),/JOINT_PASSAGE_PLAN/);
  for(const change of [a=>a.reverse(),a=>{a[1]=clone(a[0]);},a=>{a[0].extra=true;},a=>{a[0].caseId='CS99';}]){
    const bad=clone(r);change(bad);assert.throws(()=>score(bad,p));
  }
});
test('object and array diagnostic values are copied before freezing and never freeze the caller response',()=>{
  const p=prepare();for(const field of ['verdict','basis','qualification'])for(const value of [{nested:{text:'bad'}},[{text:'bad'}]]){
    const response=records(p)[0].response,j=response.judgments[0];
    const target=field==='qualification'?j.passageChecks[0]:j;target[field]=value;
    const before=clone(response),out=assess('CS01',response),observed=out.issues.find(i=>i.field===field).observed;
    assert.equal(out.fieldsMatch,false);assert.deepEqual(response,before);assert.notEqual(observed,value);assert.deepEqual(observed,value);
    assert.ok(Object.isFrozen(observed));assert.equal(Object.isFrozen(value),false);
    const nested=Array.isArray(value)?value[0]:value.nested;assert.equal(Object.isFrozen(nested),false);nested.text='still mutable';
    assert.notDeepEqual(observed,value);
    const scored=score([{caseId:'CS01',response}],p);assert.equal(scored.report.casesValid,0);assert.equal(scored.report.reasoningAgreementComplete,false);
    assert.equal(Object.isFrozen(value),false);assert.equal(Object.isFrozen(nested),false);
  }
});
test('new scorer and expectations have no provider or production path',async()=>{
  for(const path of ['joint-passage-calibration.mjs','scope-reasoning-expectations.mjs']){
    const s=await readFile(new URL(`../scripts/automation/experiments/${path}`,import.meta.url),'utf8');
    assert.doesNotMatch(s,/fetch\(|process\.env|node:fs|workers-ai|resend|writeFile/);
  }
});

test('unchanged v2 live replies bind to the historical prompt, not the new v3 view',()=>{
  assert.equal(sha(v2raw),'839200786410138754a5c6467e195edaadb661fcbf8a86b1131cc1c2d08775e2');
  assert.equal(v2fixture.captureSha256,'97aac14be9c096e0b978995909dc126b4a0edd001d3673a099cd6c05ebff006f');
  const plan=prepare();
  for(const [i,r] of v2fixture.records.entries()){
    const old=buildPassageScopeReview(controls[i].input),{reviewSha256:unused,...original}=old.data;
    const data={...original,policy:'joint-passage-inference-v2',passagePolicy:old.data.policy,promptSha256:sha(JOINT_PASSAGE_V2_PROMPT)};
    assert.equal(r.response.reviewSha256,sha(JSON.stringify(data)));
  }
  const out=score(v2fixture.records,plan);assert.equal(out.report.casesValid,0);assert.equal(out.report.reasoningFieldsMatching,3);
  assert.equal(out.report.reasoningAgreementComplete,false);assert.deepEqual(out.results.map(r=>r.rawResponse),v2fixture.records.map(r=>r.response));
});
test('v2 raw outcomes reproduce four valid cases then reversed qualification consistency hold',()=>{
  const snapshot=clone(v2fixture);
  const verdicts=v2fixture.records.map((r,i)=>{const old=buildPassageScopeReview(controls[i].input);
    // Explicit offline host projection only; not a fresh response or model success.
    return validatePassageScopeReview({...clone(r.response),reviewSha256:old.data.reviewSha256},old);});
  assert.equal(verdicts.filter(v=>v.valid).length,4);assert.equal(verdicts[4].code,'PASSAGE_SCOPE_CONSISTENCY');
  assert.equal(v2fixture.records[4].response.judgments[0].verdict,'supported');
  assert.equal(v2fixture.records[4].response.judgments[0].passageChecks[0].qualification,'missing');
  assert.deepEqual(v2fixture,snapshot);
});
test('correct final inference cannot conceal the reversed per-passage restriction label',()=>{
  const plan=prepare(),r=records(plan),j=r[4].response.judgments[0];j.passageChecks[0].qualification='missing';
  const out=score(r,plan);assert.equal(out.report.reasoningFieldsMatching,16);assert.equal(out.report.casesValid,15);
  assert.equal(out.report.reasoningAgreementComplete,false);assert.equal(out.results[4].verdict.code,'PASSAGE_SCOPE_CONSISTENCY');
});
