import test from 'node:test';
import assert from 'node:assert/strict';
import {buildUnitMeaningPlan,validateUnitMeaningResponses} from '../scripts/automation/experiments/unit-meaning-review.mjs';
import {loadDefinitionGlossary,SYNTHETIC_DEFINITION_SOURCE} from '../scripts/automation/experiments/definition-glossaries.mjs';
const glossary=loadDefinitionGlossary('synthetic-generation-definitions-v1',SYNTHETIC_DEFINITION_SOURCE);
const input={previousClaims:['The output follows binding rules.','The experiment used two routes.','Its draft candidates remain provisional.'],
  claims:['The output follows nonoptional requirements.','The experiment used two routes.','Its partial answers made before a final answer remain provisional.']};
const responses=plan=>plan.map(e=>e.identity?{unitIndex:e.unitIndex,local:true}:{unitIndex:e.unitIndex,
  response:{reviewSha256:e.view.data.reviewSha256,judgments:[{claimId:'C1',comparison:'Synthetic equivalent terminology.',meaningPreserved:true}]}});
test('every changed unit has one aligned unchanged-prompt review; identical unit needs no model',()=>{
  const plan=buildUnitMeaningPlan(input,glossary);
  assert.equal(plan.length,3);assert.ok(Object.isFrozen(plan));
  assert.deepEqual(plan.map(p=>Boolean(p.identity)),[false,true,false]);
  assert.ok(Object.isFrozen(plan[1].identity.claims[0]));
  for(const [i,e]of plan.entries()){
    assert.equal(e.view.data.claims.length,1);assert.equal(e.view.data.claims[0].text,input.claims[i]);
    assert.equal(e.view.data.previousClaims[0].text,input.previousClaims[i]);
    assert.equal(Object.hasOwn(e.view.data,'passages'),false);
  }
  assert.deepEqual(validateUnitMeaningResponses(plan,responses(plan)),{valid:true,supported:true,
    claims:[1,2,3].map(i=>({claimId:`C${i}`,meaningPreserved:true}))});
});
test('reused C1 IDs cannot substitute another unit response or omit coverage',()=>{
  const plan=buildUnitMeaningPlan(input,glossary);
  assert.notEqual(plan[0].view.data.reviewSha256,plan[2].view.data.reviewSha256);
  for(const mutate of [r=>{r[2].response=structuredClone(r[0].response);},r=>r.pop(),r=>r.reverse(),
    r=>{r[0].unitIndex=2;},r=>{r[0].response.judgments[0].claimId='C2';},r=>{r[0].response={};}]){
    const r=responses(plan);mutate(r);assert.deepEqual(validateUnitMeaningResponses(plan,r),{valid:false,supported:false});
  }
  assert.deepEqual(validateUnitMeaningResponses(structuredClone(plan),responses(plan)),{valid:false,supported:false});
});
test('a negative response is never waived by other positive or identity results',()=>{
  const plan=buildUnitMeaningPlan(input,glossary),r=responses(plan);r[2].response.judgments[0].meaningPreserved=false;
  assert.equal(validateUnitMeaningResponses(plan,r).supported,false);
  assert.equal(validateUnitMeaningResponses(plan,r).claims[2].meaningPreserved,false);
});
test('changed length or incomplete input cannot create a smaller review inventory',()=>{
  assert.throws(()=>buildUnitMeaningPlan({...input,claims:input.claims.slice(1)},glossary));
  assert.throws(()=>buildUnitMeaningPlan({claims:[],previousClaims:[]},glossary));
});
