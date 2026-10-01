import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildSplitPassageReview as build,validateSplitPassageStage as validate,combineSplitPassageReviews as combine,SPLIT_PASSAGE_CONTRACT,SPLIT_CLAIM_PROMPT,SPLIT_CHECKS_PROMPT,SPLIT_OBLIGATION_CONTRACT,SPLIT_OBLIGATION_CLAIM_PROMPT,SPLIT_OBLIGATION_CHECKS_PROMPT} from '../scripts/automation/experiments/split-passage-review.mjs';
import {buildJointPassageReview,validateJointPassageReview} from '../scripts/automation/experiments/joint-passage-review.mjs';
import {CONDITIONAL_SCOPE_CONTROLS as controls} from '../scripts/automation/experiments/conditional-scope-controls.mjs';
import {assessScopeReasoning} from '../scripts/automation/experiments/scope-reasoning-expectations.mjs';
const clone=x=>structuredClone(x),sha=x=>createHash('sha256').update(x).digest('hex');
const fixture=JSON.parse(await readFile(new URL('./fixtures/joint-passage-live-36799248427.json',import.meta.url),'utf8'));
// Explicit synthetic projection of historical replies, never separate live calls.
function split(response,pair){return {
  a:{reviewSha256:pair.claim.data.reviewSha256,judgments:response.judgments.map(({passageChecks,...j})=>clone(j))},
  b:{reviewSha256:pair.checks.data.reviewSha256,judgments:response.judgments.map(j=>({spanId:j.spanId,passageChecks:clone(j.passageChecks)}))},
};}
const setup=()=>{const p=build(controls[0].input);return {p,...split(fixture.records[0].response,p)};};
test('both blinded stage views contain the full identical evidence with no sibling answer or gold',()=>{
  for(const c of controls){const pair=build(c.input),old=buildJointPassageReview(c.input);
    assert.ok(Object.isFrozen(pair));
    for(const stage of ['claim','checks']){const view=pair[stage],j=view.schema.properties.judgments.items;
      for(const k of ['sentence','spans','passages','catalog','excluded','evidencePolicy','passagePolicy'])assert.deepEqual(view.data[k],old.data[k]);
      assert.equal(view.data.policy,SPLIT_PASSAGE_CONTRACT);assert.equal(view.data.stage,stage);
      assert.equal(view.data.parentReviewSha256,old.data.reviewSha256);assert.equal(view.data.promptSha256,sha(view.prompt));
      const {reviewSha256,...data}=view.data;assert.equal(sha(JSON.stringify(data)),reviewSha256);
      assert.deepEqual(view.schema.properties.reviewSha256.enum,[reviewSha256]);
      assert.deepEqual(Object.keys(j.properties),j.required);
      assert.equal(Object.hasOwn(j.properties,'passageChecks'),stage==='checks');
      assert.equal(Object.hasOwn(j.properties,'verdict'),stage==='claim');
      assert.doesNotMatch(JSON.stringify(view),/expectedVerdicts|qualificationAnchors|CS\d\d|rawClaim|rawChecks/);
    }
    assert.notEqual(pair.claim.data.reviewSha256,pair.checks.data.reviewSha256);
  }
  for(const p of [SPLIT_CLAIM_PROMPT,SPLIT_CHECKS_PROMPT]){
    assert.match(p,/complete candidate sentence and ALL supplied passages/);assert.match(p,/untrusted data/);
    assert.doesNotMatch(p,/Cedar|Lumen|Archive|Harbor|Willow|Meridian|visitor badges|CS\d\d/);
  }
  assert.equal(sha(SPLIT_CLAIM_PROMPT),'23b71cb5448218906b42b6461e7689e0cad35dff8c3cf7e1bb35ea85dc77137d');
  assert.equal(sha(SPLIT_CHECKS_PROMPT),'1c40343da654c883bb8146b33dc835569e6c480d00cd85d43f396e4a9cee6469');
});
test('lossless offline splits retain exact original validator outcomes and raw historical failures',()=>{
  for(const [i,r]of fixture.records.entries()){
    const pair=build(controls[i].input),{a,b}=split(r.response,pair),snap={a:clone(a),b:clone(b)};
    assert.equal(validate(a,pair.claim).valid,true);assert.equal(validate(b,pair.checks).valid,true);
    const out=combine(a,b,pair),old=buildJointPassageReview(controls[i].input);
    assert.equal(out.valid,true);assert.equal(out.composition,'lossless-two-response-host-assembly');
    assert.deepEqual(out.assembledSelection,r.response);
    assert.deepEqual(out.originalValidation,validateJointPassageReview(r.response,old));
    assert.deepEqual(out.rawClaim,a);assert.deepEqual(out.rawChecks,b);assert.notEqual(out.rawClaim,a);
    assert.deepEqual(assessScopeReasoning(r.caseId,out.assembledSelection),assessScopeReasoning(r.caseId,r.response));
    for(const k of ['modelQualified','articleApproved','publicationReady'])assert.equal(out[k],false);
    assert.deepEqual({a,b},snap);assert.ok(Object.isFrozen(out.rawClaim));
    assert.equal(Object.isFrozen(a),false);a.judgments[0].explanation='caller still mutable';
    assert.notEqual(a.judgments[0].explanation,out.rawClaim.judgments[0].explanation);
  }
});
test('individually valid stage decisions that conflict remain held, never reconciled',()=>{
  for(const [contribution,qualification]of [['contradiction','missing'],['context','missing'],['context','uncertain']]){
    const {p,a,b}=setup();Object.assign(b.judgments[0].passageChecks[0],{contribution,qualification});
    assert.equal(validate(a,p.claim).valid,true);assert.equal(validate(b,p.checks).valid,true);
    const before=clone({a,b}),out=combine(a,b,p);assert.equal(out.valid,false);assert.equal(out.code,'PASSAGE_SCOPE_CONSISTENCY');
    assert.deepEqual({a,b},before);assert.deepEqual(out.rawClaim,a);assert.deepEqual(out.rawChecks,b);
    assert.equal(out.assembledSelection.judgments[0].verdict,'supported');
  }
});
test('valid separate citations still fail if final IDs were not selected by the relevant passage stage',()=>{
  const {p,a,b}=setup();b.judgments[0].passageChecks[1].evidence=[{sentenceId:'S1P2S2'}];
  assert.equal(validate(a,p.claim).valid,true);assert.equal(validate(b,p.checks).valid,true);
  assert.equal(combine(a,b,p).code,'PASSAGE_SCOPE_FINAL_EVIDENCE');
});
test('uncertain passage requires uncertain claim unless a separate decisive evidenced negative wins',()=>{
  assert.match(SPLIT_CLAIM_PROMPT,/any passage's contribution or qualification is undecidable/);
  const {p,a,b}=setup();Object.assign(b.judgments[0].passageChecks[1],{contribution:'uncertain',qualification:'uncertain'});
  assert.equal(combine(a,b,p).code,'PASSAGE_SCOPE_CONSISTENCY');
  Object.assign(a.judgments[0],{verdict:'uncertain',basis:'uncertain'});assert.equal(combine(a,b,p).valid,true);
  Object.assign(b.judgments[0].passageChecks[0],{contribution:'contradiction',qualification:'missing'});
  assert.equal(combine(a,b,p).code,'PASSAGE_SCOPE_CONSISTENCY');
  Object.assign(a.judgments[0],{verdict:'unsupported',basis:'contradiction'});assert.equal(combine(a,b,p).valid,true);
});
test('decisive unselectable text remains uncertainty instead of an empty-citation unsupported judgment',()=>{
  assert.match(SPLIT_CLAIM_PROMPT,/Decisive text present but unselectable is uncertainty, not absent evidence/);
  const input=clone(controls[0].input);input.sources[0].passages[1].text='x'.repeat(401)+'.';const p=build(input);
  const {a,b}=split(fixture.records[0].response,p),j=a.judgments[0];
  Object.assign(b.judgments[0].passageChecks[1],{contribution:'uncertain',qualification:'uncertain',evidence:[]});
  Object.assign(j,{verdict:'unsupported',basis:'insufficient_evidence',evidence:[]});
  assert.equal(validate(a,p.claim).valid,true);assert.equal(validate(b,p.checks).valid,true);
  assert.equal(combine(a,b,p).code,'PASSAGE_SCOPE_CONSISTENCY');
  Object.assign(j,{verdict:'uncertain',basis:'uncertain'});assert.equal(combine(a,b,p).valid,true);
  j.evidence=[{sentenceId:'S1P2S1'}];assert.equal(validate(a,p.claim).valid,false);
});
test('claim shape, evidence, basis mapping and binding are fail closed before composition',()=>{
  for(const change of [x=>{x.approved=true;},x=>{x.reviewSha256='0'.repeat(64);},x=>x.judgments.pop(),
    x=>{x.judgments[0].spanId='T99';},x=>{x.judgments[0].basis='contradiction';},x=>{x.judgments[0].verdict='maybe';},
    x=>{x.judgments[0].explanation='x'.repeat(241);},x=>{x.judgments[0].explanation='bad\ntext';},
    x=>{x.judgments[0].evidence=[];},x=>{x.judgments[0].evidence=[{sentenceId:'S1P99S1'}];},
    x=>{x.judgments[0].evidence[0].quote='invented';},x=>{x.judgments[0].evidence.push(x.judgments[0].evidence[0]);},
    x=>{x.judgments[0].passageChecks=[];}]){
    const {p,a,b}=setup();change(a);const before=clone(a);assert.equal(validate(a,p.claim).valid,false);
    assert.equal(combine(a,b,p).valid,false);assert.deepEqual(a,before);
  }
});
test('passage-only stage preserves strict ordered coverage, exact per-passage evidence and unrelated rule',()=>{
  for(const change of [x=>{x.approved=true;},x=>{x.judgments[0].verdict='supported';},x=>x.judgments.pop(),
    x=>{x.judgments[0].spanId='T99';},x=>x.judgments[0].passageChecks.reverse(),x=>x.judgments[0].passageChecks.pop(),
    x=>{x.judgments[0].passageChecks[0].contribution='maybe';},x=>{x.judgments[0].passageChecks[0].qualification='unchanged';},
    x=>{x.judgments[0].passageChecks[0].explanation='';},x=>{x.judgments[0].passageChecks[0].evidence=[];},
    x=>{x.judgments[0].passageChecks[0].evidence=[{sentenceId:'S1P2S1'}];},
    x=>{x.judgments[0].passageChecks[0].evidence[0].quote='invented';},
    x=>{x.judgments[0].passageChecks[0].contribution='unrelated';},
    x=>{const p=x.judgments[0].passageChecks[0];p.contribution='unrelated';p.evidence=[];},
    x=>{const p=x.judgments[0].passageChecks[0];p.evidence.push(clone(p.evidence[0]));}]){
    const {p,a,b}=setup();change(b);const before=clone(b);assert.equal(validate(b,p.checks).valid,false);
    assert.equal(combine(a,b,p).valid,false);assert.deepEqual(b,before);
  }
});
test('cross-stage, cross-input and unissued view/pair substitution cannot bind',()=>{
  const {p,a,b}=setup(),other=build(controls[1].input);
  assert.equal(validate(a,p.checks).valid,false);assert.equal(validate(b,p.claim).valid,false);
  assert.equal(validate(a,clone(p.claim)).valid,false);assert.equal(combine(a,b,clone(p)).valid,false);
  assert.equal(combine(a,b,other).valid,false);
});
test('hostile JSON never runs getters or proxy traps and cannot enter host assembly',()=>{
  const {p,a,b}=setup();let reads=0;
  const getter=clone(a);Object.defineProperty(getter,'judgments',{get(){reads++;},enumerable:true});
  const proxy=new Proxy(a,{ownKeys(){reads++;return[];}}),cycle=clone(a);cycle.self=cycle;
  for(const x of [getter,proxy,cycle,null,[],{},42]){
    assert.equal(validate(x,p.claim).valid,false);assert.equal(validate(x,p.checks).valid,false);
    assert.equal(combine(x,b,p).valid,false);assert.equal(combine(a,x,p).valid,false);
  }
  assert.equal(reads,0);
});
test('source admission, catalog exclusions and multi-span coverage are not reduced by the split',()=>{
  const input={text:'The release adds logging, and the launch has ended.',sources:[{publisher:'Fictional source',passages:[
    {evidenceId:'S1P1',text:'The release adds logging.'},{evidenceId:'S1P2',text:'x'.repeat(401)+'.'},
  ]}]},p=build(input);
  assert.ok(p.claim.data.spans.length>1);assert.equal(p.claim.data.excluded.length,1);
  assert.deepEqual(p.claim.data.passages,p.checks.data.passages);assert.equal(p.claim.data.passages[1].text,input.sources[0].passages[1].text);
  const large=clone(controls[0].input);large.sources[0].passages=Array.from({length:9},(_,i)=>({evidenceId:`S1P${i+1}`,text:'A complete sentence.'}));
  assert.throws(()=>build(large));
});
test('split contract is offline and cannot call providers, write files or deliver an article',async()=>{
  const source=await readFile(new URL('../scripts/automation/experiments/split-passage-review.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/fetch\(|process\.env|node:fs|workers-ai|resend|writeFile/);
});
test('offline obligation revision changes only instructions and their bindings, never source context or schema',()=>{
  assert.equal(sha(SPLIT_OBLIGATION_CLAIM_PROMPT),'2bf5d26d435a61fe402f43390c8479ff760437aedde031ee69234bde558e8c85');
  assert.equal(sha(SPLIT_OBLIGATION_CHECKS_PROMPT),'3720d5f7e2b7b26263271ad3e6d48ac57ea66f9bd169b961a9edfdb7f3614732');
  assert.match(SPLIT_OBLIGATION_CLAIM_PROMPT,/If both truth and falsity remain possible/);
  assert.match(SPLIT_OBLIGATION_CLAIM_PROMPT,/Compatibility alone is not support/);
  assert.match(SPLIT_OBLIGATION_CLAIM_PROMPT,/Hypothetical situations may vary facts the sources leave unspecified/);
  assert.match(SPLIT_OBLIGATION_CLAIM_PROMPT,/possibilities, not new source facts/);
  assert.match(SPLIT_OBLIGATION_CHECKS_PROMPT,/another prerequisite can fail while the stated condition remains necessary/);
  assert.match(SPLIT_OBLIGATION_CHECKS_PROMPT,/identify the assertion that becomes overbroad or false/);
  for(const c of controls){const old=build(c.input),next=build(c.input,{obligations:true});
    for(const stage of ['claim','checks']){
      const {reviewSha256:oldHash,policy:oldPolicy,promptSha256:oldPrompt,...oldData}=old[stage].data;
      const {reviewSha256:newHash,policy:newPolicy,promptSha256:newPrompt,...newData}=next[stage].data;
      assert.deepEqual(newData,oldData);assert.equal(newPolicy,SPLIT_OBLIGATION_CONTRACT);
      assert.equal(oldPolicy,SPLIT_PASSAGE_CONTRACT);assert.notEqual(oldHash,newHash);assert.notEqual(oldPrompt,newPrompt);
      const schema=clone(next[stage].schema);schema.properties.reviewSha256.enum=[oldHash];
      assert.deepEqual(schema,old[stage].schema);
      assert.doesNotMatch(next[stage].prompt,/Cedar|Lumen|Archive|Harbor|Willow|Meridian|visitor badges|CS\d\d/);
    }
  }
  assert.throws(()=>build(controls[0].input,{obligations:'true'}),/SPLIT_PASSAGE_REVISION/);
});
test('revision options reject hostile data before reading any value',()=>{
  let reads=0;const getter={get obligations(){reads++;return true;}},proxy=new Proxy({},{ownKeys(){reads++;return[];}});
  for(const options of [getter,proxy,null,[],42,{obligations:null},{extra:true}])
    assert.throws(()=>build(controls[0].input,options),/SPLIT_PASSAGE_REVISION/);
  assert.equal(reads,0);
});
test('new instructions never repair historical wrong reasoning or disagreement',async()=>{
  const f=JSON.parse(await readFile(new URL('./fixtures/split-passage-live-36801262924.json',import.meta.url),'utf8'));
  for(const record of f.records){
    const c=controls.find(c=>c.id===record.caseId),old=build(c.input),next=build(c.input,{obligations:true});
    assert.equal(validate(record.claim,next.claim).valid,false);
    assert.equal(validate(record.checks,next.checks).valid,false);
    // Explicit hash-only synthetic projection; not newly generated model output.
    const a={...clone(record.claim),reviewSha256:next.claim.data.reviewSha256};
    const b={...clone(record.checks),reviewSha256:next.checks.data.reviewSha256};
    const before=clone({a,b}),out=combine(a,b,next),original=combine(record.claim,record.checks,old);
    assert.equal(out.valid,original.valid);assert.equal(out.code,original.code);
    assert.deepEqual(out.assembledSelection,original.assembledSelection);
    assert.deepEqual(assessScopeReasoning(c.id,out.assembledSelection),assessScopeReasoning(c.id,original.assembledSelection));
    assert.deepEqual({a,b},before);assert.equal(out.modelQualified,false);
  }
});
