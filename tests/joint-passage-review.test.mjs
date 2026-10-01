import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildJointPassageReview as build,validateJointPassageReview as validate,JOINT_PASSAGE_CONTRACT,JOINT_PASSAGE_PROMPT,JOINT_PASSAGE_V2_PROMPT,JOINT_PASSAGE_V3_PROMPT,JOINT_PASSAGE_V4_PROMPT} from '../scripts/automation/experiments/joint-passage-review.mjs';
import {buildPassageScopeReview as prior,validatePassageScopeReview as priorValidate} from '../scripts/automation/experiments/passage-scope-review.mjs';
import {CONDITIONAL_SCOPE_CONTROLS as controls} from '../scripts/automation/experiments/conditional-scope-controls.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),clone=x=>structuredClone(x);
const input=()=>clone(controls[4].input);
const freezeCheck=x=>{if(x&&typeof x==='object'){assert.ok(Object.isFrozen(x));Object.values(x).forEach(freezeCheck);}};
const reply=view=>({reviewSha256:view.data.reviewSha256,judgments:view.data.spans.map(s=>({spanId:s.spanId,
  passageChecks:view.data.passages.map((p,i)=>({evidenceId:p.evidenceId,contribution:i?'context':'support',qualification:i?'preserved':'none',
    explanation:'Injected joint-source test assessment, not a live model response.',evidence:[{sentenceId:view.data.catalog.find(c=>c.evidenceId===p.evidenceId).sentenceId}]})),
  verdict:'supported',basis:'supported',explanation:'Injected mechanics fixture, not qualification.',evidence:view.data.catalog.slice(0,2).map(c=>({sentenceId:c.sentenceId}))}))});

test('v5 binds its compact entailment prompt without modifying source bytes catalog schema or historical prompts',()=>{
  for(const c of controls){const v=build(c.input),p=prior(c.input);freezeCheck(v);
    for(const k of ['sentence','spans','passages','catalog','excluded','evidencePolicy'])assert.deepEqual(v.data[k],p.data[k]);
    assert.equal(v.data.policy,JOINT_PASSAGE_CONTRACT);assert.equal(v.data.passagePolicy,p.data.policy);
    assert.equal(v.data.promptSha256,sha(v.prompt));const {reviewSha256,...data}=v.data;assert.equal(reviewSha256,sha(JSON.stringify(data)));
    const schema=clone(p.schema);schema.properties.reviewSha256.enum=[reviewSha256];assert.deepEqual(v.schema,schema);
    assert.notEqual(reviewSha256,p.data.reviewSha256);assert.doesNotMatch(JSON.stringify(v),/expectedVerdicts|qualificationAnchors|expectationsSha256|CS\d\d/);
  }
  assert.doesNotMatch(JOINT_PASSAGE_PROMPT,/Cedar|Lumen|Archive|Meridian|Harbor|Willow|sixteen|visitor badge|CS\d\d/);
  assert.match(JOINT_PASSAGE_PROMPT,/ALL supplied passages/);assert.match(JOINT_PASSAGE_PROMPT,/combine a rule with its exceptions/);
  assert.match(JOINT_PASSAGE_PROMPT,/Correctly retaining a restriction is preserved, not none/);
  assert.equal(JOINT_PASSAGE_CONTRACT,'joint-passage-inference-v5');
  assert.equal(sha(JOINT_PASSAGE_PROMPT),'3fc107f1a571f8948a499f5b9ecda079285a9d35d70df4608153d0bbc7687acf');
  assert.equal(sha(JOINT_PASSAGE_V4_PROMPT),'d389e13cf229f4147420e1a20e96fb46bb605d11a76a7411602f988fdb839362');
  assert.equal(sha(JOINT_PASSAGE_V3_PROMPT),'2c1c16a1b51469007716e67893f9fef329d84df48d85f053767c14c441e20924');
  assert.match(JOINT_PASSAGE_PROMPT,/Stating one necessary condition neither claims sufficiency nor requires listing other prerequisites/);
  assert.match(JOINT_PASSAGE_PROMPT,/Mere compatibility is not support/);
  assert.match(JOINT_PASSAGE_PROMPT,/unrelated requires qualification none and empty evidence/);
  assert.match(JOINT_PASSAGE_PROMPT,/Applying a rule to an explicitly exempt group conflicts with policy; retaining the exemption does not/);
  assert.equal(sha(JOINT_PASSAGE_V2_PROMPT),'4c4060eee85da2e35691aa90e021b444093dc2a5f28a750104d2fc568c0d7ed0');
  assert.ok(JOINT_PASSAGE_PROMPT.length<JOINT_PASSAGE_V4_PROMPT.length*0.52);
  assert.match(JOINT_PASSAGE_PROMPT,/absent wording in one passage is not a missing restriction/);
  assert.match(JOINT_PASSAGE_PROMPT,/any contradiction => unsupported\/contradiction; else any missing => unsupported\/insufficient_evidence; else any uncertain => uncertain\/uncertain/);
  assert.match(JOINT_PASSAGE_PROMPT,/Necessity itself is a source restriction to preserve/);
  assert.match(JOINT_PASSAGE_PROMPT,/Support requires 1–2 jointly sufficient IDs/);
  assert.match(JOINT_PASSAGE_PROMPT,/A decisive evidenced negative retains the above precedence/);
});
test('a composed support fixture passes unchanged citation guards and preserves raw versus hash projection',()=>{
  const v=build(input()),r=reply(v),out=validate(r,v),p=prior(input());freezeCheck(out);
  assert.equal(out.valid,true);assert.equal(out.supported,true);assert.deepEqual(out.rawSelection,r);
  assert.deepEqual(out.passageSelection,{...r,reviewSha256:p.data.reviewSha256});assert.equal(priorValidate(out.passageSelection,p).valid,true);
  for(const k of ['modelQualified','articleApproved','publicationReady'])assert.equal(out[k],false);
  r.judgments[0].explanation='Changed';assert.notEqual(out.rawSelection.judgments[0].explanation,'Changed');
});
for(const [name,change]of Object.entries({
  missingPassage:r=>r.judgments[0].passageChecks.pop(),
  reordered:r=>r.judgments[0].passageChecks.reverse(),
  copiedRule:r=>{r.judgments[0].passageChecks[1].qualification='missing';},
  contradictory:r=>{r.judgments[0].passageChecks[1].contribution='contradiction';},
  uncertain:r=>{r.judgments[0].passageChecks[1].qualification='uncertain';},
  unknownCitation:r=>{r.judgments[0].evidence[0].sentenceId='S1P1S99';},
  typedQuote:r=>{r.judgments[0].evidence[0].quote='Fabricated';},
  duplicateFinal:r=>{r.judgments[0].evidence=[r.judgments[0].evidence[0],r.judgments[0].evidence[0]];},
  tooManyFinal:r=>{r.judgments[0].evidence.push(r.judgments[0].evidence[0]);},
  tooLongExplanation:r=>{r.judgments[0].explanation='x'.repeat(241);},
  extraRoot:r=>{r.approved=true;},
  extraCheck:r=>{r.judgments[0].passageChecks[0].approved=true;},
  alteredVerdict:r=>{r.judgments[0].verdict='unsupported';},
}))test(`${name} delegates to the same rejecting gate without repairing raw text`,()=>{
  const v=build(input()),r=reply(v);change(r);const snapshot=clone(r),out=validate(r,v);
  assert.equal(out.valid,false);const old=prior(input());assert.deepEqual(out,priorValidate({...snapshot,reviewSha256:old.data.reviewSha256},old));
  assert.deepEqual(r,snapshot);
});
test('missing-limit verdict still needs evidence from its recorded limiting passage',()=>{
  const v=build(input()),r=reply(v),j=r.judgments[0];j.passageChecks[1].qualification='missing';j.verdict='unsupported';j.basis='insufficient_evidence';
  j.evidence=[{sentenceId:'S1P1S1'}];assert.equal(validate(r,v).code,'PASSAGE_SCOPE_FINAL_EVIDENCE');
  j.evidence=[{sentenceId:'S1P2S1'}];assert.equal(validate(r,v).valid,true); // semantic truth remains separate
});
test('historical bindings and reconstituted views cannot masquerade as fresh v5 reviews',()=>{
  const v=build(input()),old=prior(input());assert.equal(validate(reply(old),v).valid,false);assert.equal(priorValidate(reply(v),old).valid,false);
  assert.equal(validate(reply(v),clone(v)).code,'JOINT_PASSAGE_VIEW');
  const changed=input();changed.sources[0].passages[1].text='Members under twelve are exempt from this rule.';
  assert.equal(validate(reply(v),build(changed)).valid,false);
});
test('hostile getters proxies cycles and malformed responses do not run or pass',()=>{
  const v=build(input()),r=reply(v);let calls=0;const getter=clone(r);Object.defineProperty(getter,'reviewSha256',{get(){calls++;},enumerable:true});
  const proxy=new Proxy(r,{ownKeys(){calls++;return[];}}),cyclic=clone(r);cyclic.self=cyclic;
  for(const bad of [getter,proxy,cyclic,null,[],{},'x',undefined])assert.equal(validate(bad,v).valid,false);
  assert.equal(calls,0);
});
test('new contract keeps the existing bounded-input admission policy without truncation',()=>{
  const x=input();x.sources[0].passages=Array.from({length:9},(_,i)=>({evidenceId:`S1P${i+1}`,text:'Complete source sentence.'}));
  assert.throws(()=>build(x),/PASSAGE_SCOPE_SIZE/);
});
test('v5 stays offline and historical gate and live workflow bytes stay frozen',async()=>{
  const dir=new URL('../',import.meta.url);
  for(const [path,hash]of [
    ['scripts/automation/experiments/passage-scope-review.mjs','26db65ee3984b74feaf4a71aa09363d11ba0421be2d9a6e78ad83cd10699168c'],
    ['scripts/automation/experiments/passage-scope-calibration.mjs','4e87be0b8a30cb9200cb412061f2d31f6bc6ecf33810e62435cdb6b17d63d9ae'],
    ['scripts/automation/passage-scope-live.mjs','b1e2d17fc67cdcabaebd21eb27afe95cf5ebf6d3fbac7ba0d2f01c5bf7fd63f9'],
    ['.github/workflows/passage-scope-live.yml','5c15bbd756c96d9d15d3f4f1b4cbcbe501e90e35172877804e13f70f2f21dd9f'],
  ])assert.equal(sha(await readFile(new URL(path,dir))),hash);
  assert.doesNotMatch(await readFile(new URL('scripts/automation/experiments/joint-passage-review.mjs',dir),'utf8'),/fetch\(|process\.env|node:fs|workers-ai|resend|writeFile/);
});
