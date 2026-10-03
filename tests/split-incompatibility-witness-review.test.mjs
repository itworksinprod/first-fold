import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
  buildSplitIncompatibilityWitnessReview as build,
  validateSplitIncompatibilityWitnessStage as validate,
  combineSplitIncompatibilityWitnessReviews as combine,
  SPLIT_INCOMPATIBILITY_WITNESS_CONTRACT,
  SPLIT_INCOMPATIBILITY_WITNESS_CLAIM_PROMPT,
  SPLIT_INCOMPATIBILITY_WITNESS_CHECKS_PROMPT,
} from '../scripts/automation/experiments/split-incompatibility-witness-review.mjs';
import {
  buildSplitPassageReview as buildPrior,
  buildSplitScopeWitnessReview as buildCore,
  validateSplitPassageStage as validateCore,
  combineSplitPassageReviews as combineCore,
  SPLIT_CLAIM_PROMPT,SPLIT_CHECKS_PROMPT,
  SPLIT_OBLIGATION_CLAIM_PROMPT,SPLIT_OBLIGATION_CHECKS_PROMPT,
  SPLIT_SCOPE_WITNESS_CLAIM_PROMPT,SPLIT_SCOPE_WITNESS_CHECKS_PROMPT,
} from '../scripts/automation/experiments/split-passage-review.mjs';
import {
  prepareSplitIncompatibilityWitnessCalibration,
  scoreSplitIncompatibilityWitnessCalibration,
} from '../scripts/automation/experiments/split-incompatibility-witness-calibration.mjs';
import {
  prepareSplitScopeWitnessCalibration,scoreSplitPassageCalibration,
} from '../scripts/automation/experiments/split-passage-calibration.mjs';
import {
  assertSplitPassageLivePlan,assertSplitObligationLivePlan,assertSplitScopeWitnessLivePlan,
  runSplitPassageLive,runSplitObligationLive,runSplitScopeWitnessLive,
} from '../scripts/automation/split-passage-live.mjs';
import {CONDITIONAL_SCOPE_CONTROLS as controls} from '../scripts/automation/experiments/conditional-scope-controls.mjs';
import {assessScopeReasoning} from '../scripts/automation/experiments/scope-reasoning-expectations.mjs';

const clone=x=>structuredClone(x),sha=x=>createHash('sha256').update(x).digest('hex');
const smoke=JSON.parse(await readFile(new URL('./fixtures/split-obligation-smoke-36804291981.json',import.meta.url),'utf8'));
// Actual fictional v3 replies from run 37159289696, preserved as recorded.
// Adding a witness or rebinding a hash below is explicitly synthetic, not a
// newly generated reply or evidence that the witness contract fixes reasoning.
const actualV3CS04={
  caseId:'CS04',
  claim:{reviewSha256:'ed6a2bca323cecb54649053ecdf023f87d7ababd844261bc028a82ad58248b5d',judgments:[{
    spanId:'T1',verdict:'unsupported',basis:'contradiction',
    explanation:'Source states all Lumen badges expire at midnight 30 April, so non‑visitor badges also expire, contradicting the claim that only visitor badges do.',
    evidence:[{sentenceId:'S1P1S1'},{sentenceId:'S1P1S2'}],
  }]},
  checks:{reviewSha256:'7a722c8a877d10a33e6d85abf4f04be09f96dad709d7a1fa53a01ad0ef53a3a4',judgments:[{
    spanId:'T1',passageChecks:[{
      evidenceId:'S1P1',contribution:'contradiction',qualification:'missing',
      explanation:'Source says every Lumen badge expires then, so non‑visitor badges also do, contradicting claim that only visitor badges expire at that time.',
      evidence:[{sentenceId:'S1P1S1'},{sentenceId:'S1P1S2'}],
    }],
  }]},
};
const inputFor=id=>controls.find(c=>c.id===id).input;
const none=()=>({kind:'none',sourceSentenceIds:[],assertedSourcePremise:'',incompatibility:''});
const witness=(row,kind='contrary_instance')=>({
  kind,sourceSentenceIds:row.evidence.map(e=>e.sentenceId),
  assertedSourcePremise:'A nonvisitor badge issued by Lumen expires at the stated time.',
  incompatibility:'The exclusive assertion excludes that alleged nonvisitor badge.',
});
function project(record,pair){
  return {
    a:{...clone(record.claim),reviewSha256:pair.claim.data.reviewSha256,
      judgments:record.claim.judgments.map(j=>({...clone(j),incompatibilityWitness:j.basis==='contradiction'?witness(j):none()}))},
    b:{...clone(record.checks),reviewSha256:pair.checks.data.reviewSha256,
      judgments:record.checks.judgments.map(j=>({...clone(j),passageChecks:j.passageChecks.map(p=>({
        ...clone(p),incompatibilityWitness:p.contribution==='contradiction'?witness(p):none(),
      }))}))},
  };
}
const setup=(id='CS04')=>{
  const p=build(inputFor(id)),record=id==='CS04'?actualV3CS04:smoke.records.find(r=>r.caseId===id);
  return {p,record,...project(record,p)};
};
function flags(value){
  assert.equal(value.witnessSemanticsChecked,false);
  assert.equal(value.independentReview,'required');
  for(const k of ['modelQualified','articleApproved','publicationReady'])assert.equal(value[k],false);
}

test('the new offline contract changes bindings and witness schema only, preserving complete original context',()=>{
  assert.equal(sha(SPLIT_INCOMPATIBILITY_WITNESS_CLAIM_PROMPT),'b53c32622bee2051ff0a76ac982e141a02791d8de2082ce6a0f9cb905a14acc5');
  assert.equal(sha(SPLIT_INCOMPATIBILITY_WITNESS_CHECKS_PROMPT),'a3afae86cf66785aa83ecc28171c39c48132d38552c457fb041507dec2005568');
  for(const c of controls){
    const core=buildCore(c.input),before=clone(core),pair=build(c.input);
    assert.ok(Object.isFrozen(pair));
    for(const stage of ['claim','checks']){
      const next=pair[stage],prior=core[stage];
      const {reviewSha256,policy,promptSha256,...data}=next.data;
      const {reviewSha256:priorHash,policy:priorPolicy,promptSha256:priorPrompt,...priorData}=prior.data;
      assert.deepEqual(data,priorData);assert.equal(policy,SPLIT_INCOMPATIBILITY_WITNESS_CONTRACT);
      assert.notEqual(policy,priorPolicy);assert.notEqual(reviewSha256,priorHash);assert.notEqual(promptSha256,priorPrompt);
      assert.equal(promptSha256,sha(next.prompt));
      const {reviewSha256:binding,...boundData}=next.data;assert.equal(binding,sha(JSON.stringify(boundData)));
      assert.equal(next.prompt,stage==='claim'?SPLIT_INCOMPATIBILITY_WITNESS_CLAIM_PROMPT:SPLIT_INCOMPATIBILITY_WITNESS_CHECKS_PROMPT);
      const schema=clone(next.schema),row=stage==='claim'?schema.properties.judgments.items:schema.properties.judgments.items.properties.passageChecks.items;
      assert.ok(row.required.includes('incompatibilityWitness'));assert.equal(row.additionalProperties,false);
      delete row.properties.incompatibilityWitness;row.required=row.required.filter(k=>k!=='incompatibilityWitness');
      schema.properties.reviewSha256.enum=[priorHash];assert.deepEqual(schema,prior.schema);
      assert.ok(Object.isFrozen(next.data));assert.ok(Object.isFrozen(next.schema));
      assert.doesNotMatch(JSON.stringify(next),/expectedVerdicts|qualificationAnchors|CS\d\d|rawClaim|rawChecks/);
      assert.doesNotMatch(next.prompt,/Cedar|Lumen|Archive|Harbor|Willow|Meridian|visitor badges|CS\d\d/);
    }
    assert.deepEqual(core,before);
  }
});

test('original v1, v2 and v3 prompt bindings remain exactly reproducible',()=>{
  for(const [prompt,expected]of [
    [SPLIT_CLAIM_PROMPT,'23b71cb5448218906b42b6461e7689e0cad35dff8c3cf7e1bb35ea85dc77137d'],
    [SPLIT_CHECKS_PROMPT,'1c40343da654c883bb8146b33dc835569e6c480d00cd85d43f396e4a9cee6469'],
    [SPLIT_OBLIGATION_CLAIM_PROMPT,'2bf5d26d435a61fe402f43390c8479ff760437aedde031ee69234bde558e8c85'],
    [SPLIT_OBLIGATION_CHECKS_PROMPT,'3720d5f7e2b7b26263271ad3e6d48ac57ea66f9bd169b961a9edfdb7f3614732'],
    [SPLIT_SCOPE_WITNESS_CLAIM_PROMPT,'a1e4a0f75204b19fcba45ebe17911f8b772aa1020ef08ee6db7c752d0f3068f2'],
    [SPLIT_SCOPE_WITNESS_CHECKS_PROMPT,'2cf1af8897105d444f1a63a0dfe8f7cdb4ed0c29d7fcec7962d9e41b59b597fa'],
  ])assert.equal(sha(prompt),expected);
  for(const c of controls)assert.deepEqual(buildPrior(c.input),buildPrior(c.input,{obligations:false}));
});

test('actual CS04 v3 failure is preserved; a fabricated anchored witness cannot become semantic approval',()=>{
  const {p,a,b,record}=setup(),core=buildCore(inputFor('CS04')),before=clone({a,b,record});
  assert.equal(validateCore(record.claim,core.claim).valid,true);assert.equal(validateCore(record.checks,core.checks).valid,true);
  assert.equal(validate(record.claim,p.claim).valid,false);assert.equal(validate(record.checks,p.checks).valid,false);
  const prior=combineCore(record.claim,record.checks,core),out=combine(a,b,p);
  assert.equal(out.valid,true);assert.deepEqual(out.assembledSelection,prior.assembledSelection);
  assert.deepEqual(out.coreComposite,prior);assert.deepEqual(out.rawClaim,a);assert.deepEqual(out.rawChecks,b);
  assert.deepEqual(out.coreProjection,{claim:record.claim,checks:record.checks});
  assert.deepEqual(assessScopeReasoning('CS04',out.assembledSelection).issues,[{field:'basis',expected:'insufficient_evidence',observed:'contradiction'}]);
  assert.equal(out.rawClaim.judgments[0].incompatibilityWitness.kind,'contrary_instance');
  assert.equal(out.rawClaim.judgments[0].incompatibilityWitness.assertedSourcePremise.includes('nonvisitor'),true);
  flags(out);assert.deepEqual({a,b,record},before);assert.ok(Object.isFrozen(out.rawClaim));
  a.judgments[0].incompatibilityWitness.incompatibility='caller remains mutable';
  assert.notEqual(out.rawClaim.judgments[0].incompatibilityWitness.incompatibility,a.judgments[0].incompatibilityWitness.incompatibility);
});

test('stage projection is a lossless core-field copy, with witnesses retained separately and no semantic flag',()=>{
  for(const id of ['CS04','CS07']){
    const {p,a,b}=setup(id),core=buildCore(inputFor(id));
    for(const [reply,stage]of [[a,'claim'],[b,'checks']]){
      const before=clone(reply),result=validate(reply,p[stage]);assert.equal(result.valid,true);flags(result);
      assert.deepEqual(result.rawSelection,reply);assert.equal(result.coreProjection.reviewSha256,core[stage].data.reviewSha256);
      assert.equal(validateCore(result.coreProjection,core[stage]).valid,true);
      assert.deepEqual(result.coreValidation,validateCore(result.coreProjection,core[stage]));
      assert.doesNotMatch(JSON.stringify(result.coreProjection),/incompatibilityWitness/);assert.deepEqual(reply,before);
    }
  }
});

test('each declared incompatibility kind and ordered core-evidence subsequence is structural data, not proof',()=>{
  for(const kind of ['contrary_instance','opposite_relation','policy_exclusion'])for(const length of [1,2]){
    const {p,a,b}=setup();
    a.judgments[0].incompatibilityWitness.kind=kind;
    b.judgments[0].passageChecks[0].incompatibilityWitness.kind=kind;
    a.judgments[0].incompatibilityWitness.sourceSentenceIds.splice(length);
    b.judgments[0].passageChecks[0].incompatibilityWitness.sourceSentenceIds.splice(length);
    assert.equal(validate(a,p.claim).valid,true);assert.equal(validate(b,p.checks).valid,true);flags(combine(a,b,p));
  }
});

test('contradiction requires an exact bounded witness tied to the same core evidence without normalization',()=>{
  const changes=[
    w=>{w.extra=true;},w=>{delete w.incompatibility;},w=>{w.kind='none';},w=>{w.kind='plausible';},
    w=>{w.sourceSentenceIds=[];},w=>{w.sourceSentenceIds.push(w.sourceSentenceIds[0]);},w=>{w.sourceSentenceIds.reverse();},
    w=>{w.sourceSentenceIds=['S1P99S1'];},w=>{w.sourceSentenceIds=[{sentenceId:'S1P1S1'}];},
    w=>{w.sourceSentenceIds='S1P1S1';},w=>{w.assertedSourcePremise='';},w=>{w.incompatibility='';},
    w=>{w.assertedSourcePremise=' leading space';},w=>{w.incompatibility='trailing space ';},
    w=>{w.assertedSourcePremise='x'.repeat(241);},w=>{w.incompatibility='x'.repeat(241);},
    w=>{w.assertedSourcePremise='line\nbreak';},w=>{w.incompatibility='invisible\u200bcharacter';},
    w=>{w.assertedSourcePremise=42;},w=>{w.incompatibility=null;},
  ];
  for(const change of changes)for(const stage of ['claim','checks']){
    const {p,a,b}=setup(),reply=stage==='claim'?a:b;
    const row=stage==='claim'?reply.judgments[0]:reply.judgments[0].passageChecks[0];
    change(row.incompatibilityWitness);const before=clone(reply);
    assert.equal(validate(reply,p[stage]).valid,false);assert.equal(combine(a,b,p).valid,false);assert.deepEqual(reply,before);
  }
  for(const stage of ['claim','checks']){
    const {p,a,b}=setup(),reply=stage==='claim'?a:b,row=stage==='claim'?a.judgments[0]:b.judgments[0].passageChecks[0];
    // S1P1S2 exists in the catalog, but it is absent from this row's core evidence.
    row.evidence=[{sentenceId:'S1P1S1'}];row.incompatibilityWitness.sourceSentenceIds=['S1P1S2'];
    assert.equal(validate(reply,p[stage]).valid,false);
    row.incompatibilityWitness.sourceSentenceIds=['S1P1S1'];assert.equal(validate(reply,p[stage]).valid,true);
  }
});

test('noncontradiction rows require the exact empty witness, including every passage row',()=>{
  for(const stage of ['claim','checks'])for(const change of [
    w=>{w.kind='contrary_instance';},w=>{w.sourceSentenceIds=['S1P1S1'];},
    w=>{w.assertedSourcePremise='An extra premise';},w=>{w.incompatibility='An extra relationship';},
    w=>{w.assertedSourcePremise=' ';},w=>{delete w.kind;},w=>{w.extra=false;},
  ]){
    const {p,a,b}=setup('CS07'),reply=stage==='claim'?a:b;
    change(stage==='claim'?a.judgments[0].incompatibilityWitness:b.judgments[0].passageChecks[1].incompatibilityWitness);
    const before=clone(reply);assert.equal(validate(reply,p[stage]).valid,false);assert.deepEqual(reply,before);
  }
  const {p,a,b}=setup('CS07'),out=combine(a,b,p);assert.equal(out.valid,true);flags(out);
  assert.equal(out.assembledSelection.judgments[0].passageChecks[1].contribution,'context');
  assert.equal(out.assembledSelection.judgments[0].passageChecks[1].qualification,'none');
  assert.deepEqual(out.rawChecks.judgments[0].passageChecks[1].incompatibilityWitness,none());
});

test('copied, cross-stage, cross-input and historical views cannot bind new witness responses',()=>{
  const {p,a,b}=setup(),other=build(inputFor('CS07')),old=buildCore(inputFor('CS04'));
  for(const view of [p.checks,other.claim,old.claim,clone(p.claim)])assert.equal(validate(a,view).valid,false);
  for(const view of [p.claim,other.checks,old.checks,clone(p.checks)])assert.equal(validate(b,view).valid,false);
  for(const pair of [clone(p),other,old])assert.equal(combine(a,b,pair).valid,false);
});

test('core coverage, citation and stage disagreement holds survive witness projection unchanged',()=>{
  for(const edit of [
    (a,b)=>{b.judgments[0].passageChecks[1].qualification='missing';},
    (a,b)=>{b.judgments[0].passageChecks[1].qualification='uncertain';},
    (a,b)=>{a.judgments[0].evidence=[{sentenceId:'S1P2S1'}];},
    (a,b)=>{b.judgments[0].passageChecks[0].evidence=[];},
    (a,b)=>{b.judgments[0].passageChecks.reverse();},
    (a,b)=>{a.judgments[0].spanId='T99';},
  ]){
    const {p,a,b}=setup('CS07'),beforeCore=buildCore(inputFor('CS07'));edit(a,b);const before=clone({a,b});
    const coreA=clone(a),coreB=clone(b);coreA.reviewSha256=beforeCore.claim.data.reviewSha256;coreB.reviewSha256=beforeCore.checks.data.reviewSha256;
    coreA.judgments.forEach(j=>{delete j.incompatibilityWitness;});
    coreB.judgments.forEach(j=>j.passageChecks.forEach(r=>{delete r.incompatibilityWitness;}));
    const expected=combineCore(coreA,coreB,beforeCore),out=combine(a,b,p);
    assert.equal(expected.valid,false);assert.equal(out.valid,false);
    if(out.coreComposite)assert.equal(out.coreComposite.code,expected.code);
    assert.deepEqual({a,b},before);
  }
});

test('hostile nested witness data and source inputs cannot execute accessors or proxy traps',()=>{
  let reads=0;const {p,a,b}=setup();
  const withGetter=clone(a);Object.defineProperty(withGetter.judgments[0].incompatibilityWitness,'kind',{enumerable:true,get(){reads++;return 'contrary_instance';}});
  const withNestedGetter=clone(a);Object.defineProperty(withNestedGetter.judgments[0].incompatibilityWitness.sourceSentenceIds,'0',{enumerable:true,get(){reads++;return 'S1P1S1';}});
  const withProxy=clone(a);withProxy.judgments[0].incompatibilityWitness=new Proxy({}, {get(){reads++;},ownKeys(){reads++;return[];},getOwnPropertyDescriptor(){reads++;}});
  const cycle=clone(a);cycle.judgments[0].incompatibilityWitness.self=cycle;
  for(const reply of [withGetter,withNestedGetter,withProxy,cycle]){
    assert.equal(validate(reply,p.claim).valid,false);assert.equal(combine(reply,b,p).valid,false);
  }
  const checksGetter=clone(b);Object.defineProperty(checksGetter.judgments[0].passageChecks[0].incompatibilityWitness,'assertedSourcePremise',{enumerable:true,get(){reads++;return 'made up';}});
  assert.equal(validate(checksGetter,p.checks).valid,false);assert.equal(combine(a,checksGetter,p).valid,false);
  const inputGetter=clone(inputFor('CS04'));Object.defineProperty(inputGetter.sources[0].passages[0],'text',{enumerable:true,get(){reads++;return 'made up';}});
  assert.throws(()=>build(inputGetter));assert.throws(()=>build(new Proxy(inputFor('CS04'),{get(){reads++;},ownKeys(){reads++;return[];}})));
  assert.equal(reads,0);
});

test('separate offline calibration preserves controls and gold and cannot qualify witnesses or the model',()=>{
  const prior=prepareSplitScopeWitnessCalibration(),plan=prepareSplitIncompatibilityWitnessCalibration();
  assert.equal(plan.reviewContract,SPLIT_INCOMPATIBILITY_WITNESS_CONTRACT);
  assert.equal(sha(JSON.stringify(plan.cases)),'83df4289d88e0faecd370255e32915829845adb6b18ba0ba044ba1224d296a35');
  for(const key of ['controlsetSha256','subsetSha256','expectationsSha256'])assert.equal(plan[key],prior[key]);
  assert.deepEqual(plan.cases.map(c=>c.caseId),prior.cases.map(c=>c.caseId));
  const empty=scoreSplitIncompatibilityWitnessCalibration([],plan);assert.equal(empty.report.casesRecorded,0);flags(empty.report);
  const item=plan.cases[0],first=project({
    caseId:'CS03',
    claim:{judgments:[{spanId:'T1',verdict:'supported',basis:'supported',explanation:'Synthetic universal rule selection.',evidence:[{sentenceId:'S1P1S1'},{sentenceId:'S1P1S2'}]}]},
    checks:{judgments:[{spanId:'T1',passageChecks:[{evidenceId:'S1P1',contribution:'support',qualification:'preserved',explanation:'Synthetic universal rule selection.',evidence:[{sentenceId:'S1P1S1'},{sentenceId:'S1P1S2'}]}]}]},
  },item.pair);
  const records=[{caseId:'CS03',claim:first.a,checks:first.b}],before=clone(records);
  const scored=scoreSplitIncompatibilityWitnessCalibration(records,plan);flags(scored.report);
  assert.equal(scored.report.casesRecorded,1);assert.equal(scored.report.fullControlsetPassed,false);assert.equal(scored.report.explanationsChecked,false);
  assert.deepEqual(records,before);assert.throws(()=>scoreSplitIncompatibilityWitnessCalibration(records,clone(plan)));
  assert.throws(()=>scoreSplitIncompatibilityWitnessCalibration(records,prior));assert.throws(()=>scoreSplitPassageCalibration(records,plan));
});

test('every existing live entry rejects the new offline plan before model or network activity',async()=>{
  const plan=prepareSplitIncompatibilityWitnessCalibration();let requests=0,network=0;
  for(const [check,runner]of [
    [assertSplitPassageLivePlan,runSplitPassageLive],
    [assertSplitObligationLivePlan,runSplitObligationLive],
    [assertSplitScopeWitnessLivePlan,runSplitScopeWitnessLive],
  ]){
    assert.throws(()=>check(plan));
    await assert.rejects(runner({plan,publicKey:'never read for a rejected plan',accountId:'0'.repeat(32),apiToken:'offline-placeholder',
      aiRequestImpl:async()=>{requests++;throw new Error('A provider call was forbidden.');},
      fetchImpl:async()=>{network++;throw new Error('A network call was forbidden.');},
    }));
  }
  assert.equal(requests,0);assert.equal(network,0);
});

test('new witness modules remain offline with no live workflow routing or production integration',async()=>{
  for(const name of ['split-incompatibility-witness-review.mjs','split-incompatibility-witness-calibration.mjs']){
    const source=await readFile(new URL(`../scripts/automation/experiments/${name}`,import.meta.url),'utf8');
    assert.doesNotMatch(source,/fetch\s*\(|process\.env|node:(?:fs|http|https|child_process)|workers-ai|resend|writeFile/);
  }
  for(const path of ['../scripts/automation/split-passage-live.mjs','../.github/workflows/split-passage-live.yml']){
    const source=await readFile(new URL(path,import.meta.url),'utf8');assert.doesNotMatch(source,/incompatibility-witness/);
  }
});
