import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
  buildSplitPassageReview as buildOld,buildSplitScopeWitnessReview as build,
  validateSplitPassageStage as validate,combineSplitPassageReviews as combine,
  SPLIT_SCOPE_WITNESS_CONTRACT,SPLIT_SCOPE_WITNESS_CLAIM_PROMPT,SPLIT_SCOPE_WITNESS_CHECKS_PROMPT,
} from '../scripts/automation/experiments/split-passage-review.mjs';
import {
  prepareSplitPassageCalibration,prepareSplitObligationCalibration,prepareSplitScopeWitnessCalibration,
  scoreSplitPassageCalibration,
} from '../scripts/automation/experiments/split-passage-calibration.mjs';
import {assertSplitPassageLivePlan,assertSplitObligationLivePlan} from '../scripts/automation/split-passage-live.mjs';
import {CONDITIONAL_SCOPE_CONTROLS as controls} from '../scripts/automation/experiments/conditional-scope-controls.mjs';
import {assessScopeReasoning,SCOPE_REASONING_EXPECTATIONS_SHA256} from '../scripts/automation/experiments/scope-reasoning-expectations.mjs';
const clone=x=>structuredClone(x),sha=x=>createHash('sha256').update(x).digest('hex');
const fixture=JSON.parse(await readFile(new URL('./fixtures/split-obligation-smoke-36804291981.json',import.meta.url),'utf8'));
const project=(record,pair)=>({
  // Synthetic hash-only rebinding for regression; not newly generated model text.
  a:{...clone(record.claim),reviewSha256:pair.claim.data.reviewSha256},
  b:{...clone(record.checks),reviewSha256:pair.checks.data.reviewSha256},
});

test('scope witnesses are explicitly selected, with every original source and unchanged schemas in both stages',()=>{
  assert.equal(sha(SPLIT_SCOPE_WITNESS_CLAIM_PROMPT),'a1e4a0f75204b19fcba45ebe17911f8b772aa1020ef08ee6db7c752d0f3068f2');
  assert.equal(sha(SPLIT_SCOPE_WITNESS_CHECKS_PROMPT),'2cf1af8897105d444f1a63a0dfe8f7cdb4ed0c29d7fcec7962d9e41b59b597fa');
  for(const c of controls){
    const old=buildOld(c.input),v2=buildOld(c.input,{obligations:true}),next=build(c.input);
    assert.deepEqual(buildOld(c.input,{obligations:false}),old);
    for(const stage of ['claim','checks']){
      const {reviewSha256,policy,promptSha256,...data}=next[stage].data;
      const {reviewSha256:priorHash,policy:priorPolicy,promptSha256:priorPrompt,...prior}=v2[stage].data;
      assert.deepEqual(data,prior);assert.equal(policy,SPLIT_SCOPE_WITNESS_CONTRACT);
      assert.notEqual(reviewSha256,priorHash);assert.notEqual(promptSha256,priorPrompt);
      assert.equal(promptSha256,sha(next[stage].prompt));
      const {reviewSha256:boundHash,...boundData}=next[stage].data;
      assert.equal(boundHash,sha(JSON.stringify(boundData)));
      const schema=clone(next[stage].schema);schema.properties.reviewSha256.enum=[priorHash];
      assert.deepEqual(schema,v2[stage].schema);
      assert.ok(Object.isFrozen(next[stage].data));assert.ok(Object.isFrozen(next[stage].schema));
      assert.doesNotMatch(JSON.stringify(next[stage]),/expectedVerdicts|qualificationAnchors|CS\d\d|rawClaim|rawChecks/);
      assert.doesNotMatch(next[stage].prompt,/Cedar|Lumen|Archive|Harbor|Willow|Meridian|visitor badges|CS\d\d/);
    }
  }
});

test('new calibration preserves the frozen controls and gold, and cannot use either existing live entry',()=>{
  const old=prepareSplitPassageCalibration(),v2=prepareSplitObligationCalibration(),next=prepareSplitScopeWitnessCalibration();
  assert.equal(next.reviewContract,SPLIT_SCOPE_WITNESS_CONTRACT);
  assert.equal(sha(JSON.stringify(next.cases)),'eadcc2e157d0ba029e35219e7b364f0114b02acd97ac0054604580a70ada3535');
  for(const previous of [old,v2]){
    for(const k of ['controlsetSha256','subsetSha256','expectationsSha256'])assert.equal(next[k],previous[k]);
    assert.deepEqual(next.cases.map(c=>c.caseId),previous.cases.map(c=>c.caseId));
  }
  assert.equal(next.expectationsSha256,SCOPE_REASONING_EXPECTATIONS_SHA256);
  assert.doesNotThrow(()=>assertSplitPassageLivePlan(old));
  assert.doesNotThrow(()=>assertSplitObligationLivePlan(v2));
  assert.throws(()=>assertSplitPassageLivePlan(next),/SPLIT_PASSAGE_LIVE_TARGET/);
  assert.throws(()=>assertSplitObligationLivePlan(next),/SPLIT_PASSAGE_LIVE_TARGET/);
  const score=scoreSplitPassageCalibration([],next);
  assert.equal(score.report.casesRecorded,0);assert.equal(score.report.reasoningAgreementComplete,false);
  for(const k of ['fullControlsetPassed','explanationsChecked','modelQualified','articleApproved','publicationReady'])
    assert.equal(score.report[k],false);
});

test('actual v2 smoke responses replay exactly, and synthetic rebinding cannot repair their wrong reasoning',()=>{
  assert.equal(fixture.provenance.captureSha256,'59ad32c96c27f0cbcfbfac572a1f7fc72bdb3b9e717f00c63241e44347722c16');
  for(const record of fixture.records){
    const c=controls.find(x=>x.id===record.caseId),old=buildOld(c.input,{obligations:true}),next=build(c.input);
    assert.equal(validate(record.claim,old.claim).valid,true);assert.equal(validate(record.checks,old.checks).valid,true);
    assert.equal(validate(record.claim,next.claim).valid,false);assert.equal(validate(record.checks,next.checks).valid,false);
    const prior=combine(record.claim,record.checks,old),{a,b}=project(record,next),before=clone({a,b}),out=combine(a,b,next);
    assert.equal(out.valid,prior.valid);assert.deepEqual(out.originalValidation,prior.originalValidation);
    assert.deepEqual(out.assembledSelection,prior.assembledSelection);
    assert.deepEqual(out.rawClaim.judgments,record.claim.judgments);assert.deepEqual(out.rawChecks.judgments,record.checks.judgments);
    assert.deepEqual({a,b},before);
    const reasoning=assessScopeReasoning(record.caseId,out.assembledSelection);
    assert.equal(reasoning.fieldsMatch,record.caseId==='CS07');
    for(const k of ['modelQualified','articleApproved','publicationReady'])assert.equal(out[k],false);
    if(record.caseId==='CS04'){
      assert.equal(out.assembledSelection.judgments[0].basis,'contradiction');
      assert.deepEqual(reasoning.issues,[{field:'basis',expected:'insufficient_evidence',observed:'contradiction'}]);
    }else{
      assert.equal(out.assembledSelection.judgments[0].verdict,'supported');
      assert.equal(out.assembledSelection.judgments[0].passageChecks[1].contribution,'context');
      assert.equal(out.assembledSelection.judgments[0].passageChecks[1].qualification,'none');
    }
  }
});

test('cross-stage and cross-revision substitutions do not bind to issued scope-witness views',()=>{
  const record=fixture.records[1],input=controls.find(c=>c.id===record.caseId).input,next=build(input),old=buildOld(input,{obligations:true});
  const {a,b}=project(record,next);
  assert.equal(validate(a,next.claim).valid,true);assert.equal(validate(b,next.checks).valid,true);
  for(const view of [next.checks,old.claim,clone(next.claim)])assert.equal(validate(a,view).valid,false);
  for(const view of [next.claim,old.checks,clone(next.checks)])assert.equal(validate(b,view).valid,false);
  assert.equal(combine(a,b,clone(next)).valid,false);assert.equal(combine(a,b,old).valid,false);
});

test('scope-witness instructions do not relax the existing disagreement and citation gates',()=>{
  const record=fixture.records[1],input=controls.find(c=>c.id===record.caseId).input;
  for(const edit of [
    b=>Object.assign(b.judgments[0].passageChecks[1],{contribution:'contradiction',qualification:'missing'}),
    b=>Object.assign(b.judgments[0].passageChecks[1],{qualification:'missing'}),
    b=>Object.assign(b.judgments[0].passageChecks[1],{qualification:'uncertain'}),
    b=>{b.judgments[0].passageChecks[0].evidence=[];},
  ]){
    const old=buildOld(input,{obligations:true}),next=build(input),previous=project(record,old),fresh=project(record,next);
    edit(previous.b);edit(fresh.b);
    const before=clone(fresh),expected=combine(previous.a,previous.b,old),actual=combine(fresh.a,fresh.b,next);
    assert.equal(expected.valid,false);assert.equal(actual.valid,false);assert.equal(actual.code,expected.code);
    assert.deepEqual(fresh,before);
  }
});

test('new offline constructor rejects getters and proxies without executing their traps',()=>{
  let reads=0;const input=clone(controls[0].input);
  const getter=clone(input);Object.defineProperty(getter,'text',{enumerable:true,get(){reads++;return input.text;}});
  const nested=clone(input);Object.defineProperty(nested.sources[0].passages[0],'text',{enumerable:true,get(){reads++;return 'changed';}});
  const proxy=new Proxy(input,{get(){reads++;},ownKeys(){reads++;return[];},getOwnPropertyDescriptor(){reads++;}});
  for(const hostile of [getter,nested,proxy])assert.throws(()=>build(hostile));
  assert.equal(reads,0);
});

test('a universal outcome leaves exclusive subgroup membership unresolved, while an observed outside member refutes exclusivity',()=>{
  // Finite logical examples verify this test's premise, not model inference.
  // All domain members satisfy the universal outcome; membership is unspecified.
  const compatibleMemberships=[[],[true],[false],[true,true],[true,false],[false,false]];
  const exclusive=membership=>membership.every(inSubgroup=>inSubgroup);
  assert.equal(compatibleMemberships.some(exclusive),true);
  assert.equal(compatibleMemberships.some(x=>!exclusive(x)),true);
  // Adding a source-established outside member removes the true alternatives.
  const withEstablishedOutsideMember=compatibleMemberships.filter(x=>x.includes(false));
  assert.equal(withEstablishedOutsideMember.length>0,true);
  assert.equal(withEstablishedOutsideMember.some(exclusive),false);
  // A sole prerequisite is neither inferred nor required by a necessary claim.
  const operatingStates=[{on:false,latch:true,power:false},{on:true,latch:true,power:true}];
  assert.ok(operatingStates.every(s=>!s.on||s.latch));
  assert.ok(operatingStates.some(s=>s.latch&&!s.on));
});
