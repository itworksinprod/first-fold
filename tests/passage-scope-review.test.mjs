import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildPassageScopeReview as build,validatePassageScopeReview as validate,PASSAGE_SCOPE_CONTRACT,PASSAGE_SCOPE_LIMITS,PASSAGE_SCOPE_PROMPT} from '../scripts/automation/experiments/passage-scope-review.mjs';
import {buildSourceSentenceReview,validateSourceSentenceReview} from '../scripts/automation/experiments/source-sentence-review.mjs';
import {CONDITIONAL_SCOPE_CONTROLS as controls,CONDITIONAL_SCOPE_CONTROLSET_SHA256} from '../scripts/automation/experiments/conditional-scope-controls.mjs';
const clone=x=>structuredClone(x),sha=x=>createHash('sha256').update(x).digest('hex');
const frozen=x=>{if(x&&typeof x==='object'){assert.ok(Object.isFrozen(x));Object.values(x).forEach(frozen);}};
const input=()=>clone(controls[4].input); // faithful rule with separately stated exemption
const row=(view,n,contribution='support',qualification='none')=>({evidenceId:view.data.passages[n].evidenceId,contribution,qualification,
  explanation:'Injected structural test assessment, not a model result.',
  evidence:contribution==='unrelated'?[]:[{sentenceId:view.data.catalog.find(c=>c.evidenceId===view.data.passages[n].evidenceId).sentenceId}]});
const reply=view=>({reviewSha256:view.data.reviewSha256,judgments:view.data.spans.map(s=>({spanId:s.spanId,
  passageChecks:view.data.passages.map((_,n)=>row(view,n)),verdict:'supported',basis:'supported',
  explanation:'Injected test conclusion, not semantic proof.',evidence:[{sentenceId:view.data.catalog[0].sentenceId}]}))});
const j=x=>x.judgments[0];
const invalid=(v,view,code)=>{const out=validate(v,view);assert.equal(out.valid,false);assert.equal(out.supported,false);if(code)assert.equal(out.code,code);return out;};

test('new contract keeps every original byte, publisher, span and catalog without labels or case fixes',()=>{
  assert.equal(CONDITIONAL_SCOPE_CONTROLSET_SHA256,'22ba98ba1abbc942aff656912fefb3f2c35aae2ba9bb56b736b8f7ccff2b6341');
  for(const c of controls){
    const v=build(c.input),old=buildSourceSentenceReview(c.input);frozen(v);
    for(const k of ['sentence','spans','passages','catalog','excluded'])assert.deepEqual(v.data[k],old.data[k]);
    assert.equal(v.data.policy,PASSAGE_SCOPE_CONTRACT);assert.equal(v.data.evidencePolicy,old.data.policy);assert.notEqual(v.data.reviewSha256,old.data.reviewSha256);
    const {reviewSha256,...unhashed}=v.data;assert.equal(reviewSha256,sha(JSON.stringify(unhashed)));
    assert.doesNotMatch(JSON.stringify(v),/expectedVerdicts|rationale|CS\d\d|Cedar.*Archive/s);
    assert.equal(v.schema.properties.judgments.items.properties.passageChecks.minItems,old.data.passages.length);
  }
  assert.doesNotMatch(PASSAGE_SCOPE_PROMPT,/Cedar|Lumen|Archive|Meridian|Harbor|Willow|under sixteen/);
  assert.match(PASSAGE_SCOPE_PROMPT,/SAME passage/);assert.match(PASSAGE_SCOPE_PROMPT,/Missing observations are not proof of zero events/);
});
test('valid full coverage is immutable, reuses exact citation transport and cannot approve a model or article',()=>{
  const view=build(input()),r=reply(view),out=validate(r,view);frozen(out);
  assert.equal(out.valid,true);assert.equal(out.coverageComplete,true);assert.equal(out.consistent,true);assert.equal(out.supported,true);
  for(const k of ['modelQualified','articleApproved','publicationReady'])assert.equal(out[k],false);
  assert.deepEqual(out.rawSelection,r);assert.notEqual(out.rawSelection,r);assert.equal(out.quotedPayload.judgments[0].evidence[0].quote,view.data.catalog[0].text);
  const old=buildSourceSentenceReview(input());assert.equal(validateSourceSentenceReview(out.citationSelection,old).valid,true);
  j(r).passageChecks[0].explanation='Changed';assert.notEqual(out.rawSelection.judgments[0].passageChecks[0].explanation,'Changed');
});
test('same passage may contribute support and a missing qualification; supported cannot hide it',()=>{
  const view=build({text:'Owners must replace every seal.',sources:[{publisher:'Test',passages:[{evidenceId:'S1P1',text:'Owners must replace cracked seals before winter. Seals without cracks do not need replacement.'}]}]});
  const r=reply(view);j(r).passageChecks[0].qualification='missing';invalid(r,view,'PASSAGE_SCOPE_CONSISTENCY');
  j(r).basis='insufficient_evidence';j(r).verdict='unsupported';assert.equal(validate(r,view).valid,true);assert.equal(validate(r,view).supported,false);
  j(r).basis='contradiction';invalid(r,view,'PASSAGE_SCOPE_CONSISTENCY'); // no claimed contradiction row
  j(r).passageChecks[0].contribution='contradiction';assert.equal(validate(r,view).valid,true);
});
test('a copied opening rule cannot override an acknowledged later exemption',()=>{
  const view=build(controls[5].input),r=reply(view);j(r).passageChecks[1]=row(view,1,'context','missing');
  invalid(r,view,'PASSAGE_SCOPE_CONSISTENCY');j(r).verdict='unsupported';j(r).basis='insufficient_evidence';
  invalid(r,view,'PASSAGE_SCOPE_FINAL_EVIDENCE'); // must cite the recorded decisive exception
  j(r).evidence=clone(j(r).passageChecks[1].evidence);assert.equal(validate(r,view).valid,true);
  j(r).passageChecks[1].contribution='contradiction';invalid(r,view,'PASSAGE_SCOPE_CONSISTENCY');
  j(r).basis='contradiction';assert.equal(validate(r,view).valid,true);
});
test('multi-passage support and preserved qualifications may jointly support a faithful statement',()=>{
  const view=build(input()),r=reply(view);j(r).passageChecks[1]=row(view,1,'context','preserved');
  j(r).evidence.push(...j(r).passageChecks[1].evidence);assert.equal(validate(r,view).supported,true);
});
test('no-bearing and relevant context do not become affirmative evidence by default',()=>{
  const view=build(input());
  for(const contribution of ['context','unrelated']){
    const r=reply(view);j(r).passageChecks=view.data.passages.map((_,n)=>row(view,n,contribution));
    invalid(r,view,'PASSAGE_SCOPE_CONSISTENCY');
    j(r).verdict='unsupported';j(r).basis='insufficient_evidence';j(r).evidence=[];assert.equal(validate(r,view).valid,true);
  }
});
test('insufficient evidence is distinct from contradiction and never invents a negative premise',()=>{
  const view=build(controls[3].input),r=reply(view);j(r).passageChecks[0].contribution='context';j(r).basis='insufficient_evidence';j(r).verdict='unsupported';
  assert.equal(validate(r,view).valid,true);j(r).basis='contradiction';invalid(r,view,'PASSAGE_SCOPE_CONSISTENCY');
});
test('uncertainty cannot yield supported but does not erase a separately evidenced negative',()=>{
  const view=build(input());
  for(const change of [p=>{p.contribution='uncertain';},p=>{p.qualification='uncertain';}]){
    const r=reply(view);change(j(r).passageChecks[1]);invalid(r,view,'PASSAGE_SCOPE_CONSISTENCY');
    j(r).basis='uncertain';j(r).verdict='uncertain';assert.equal(validate(r,view).valid,true);
    for(const [contribution,qualification,basis]of [['contradiction','none','contradiction'],['support','missing','insufficient_evidence']]){
      const negative=clone(r);Object.assign(j(negative).passageChecks[0],{contribution,qualification});j(negative).basis=basis;j(negative).verdict='unsupported';
      assert.equal(validate(negative,view).valid,true);assert.equal(validate(negative,view).supported,false);
    }
  }
  const r=reply(view);j(r).basis='uncertain';j(r).verdict='uncertain';invalid(r,view,'PASSAGE_SCOPE_CONSISTENCY');
});
test('unselectable text remains required context; no fabricated or truncated quote can support it',()=>{
  const source=input();source.sources[0].passages.push({evidenceId:'S1P3',text:'An ambiguous unfinished qualification without terminal punctuation'});
  const view=build(source),r=reply(build(input()));r.reviewSha256=view.data.reviewSha256;
  invalid(r,view,'PASSAGE_SCOPE_COVERAGE');
  j(r).passageChecks.push({evidenceId:'S1P3',contribution:'uncertain',qualification:'uncertain',explanation:'Relevant unit cannot be selected safely.',evidence:[]});
  j(r).basis='uncertain';j(r).verdict='uncertain';assert.equal(validate(r,view).valid,true);
  j(r).passageChecks[2].contribution='support';invalid(r,view,'PASSAGE_SCOPE_EVIDENCE');
  j(r).passageChecks[2].evidence=[{sentenceId:'S1P3S1'}];invalid(r,view,'PASSAGE_SCOPE_EVIDENCE');
  assert.equal(view.data.passages[2].text,source.sources[0].passages[2].text);
});

for(const [name,change]of Object.entries({
  missing:r=>{j(r).passageChecks.pop();},duplicate:r=>{j(r).passageChecks[1]=clone(j(r).passageChecks[0]);},
  reordered:r=>{j(r).passageChecks.reverse();},foreign:r=>{j(r).passageChecks[1].evidenceId='S9P1';},extra:r=>{j(r).passageChecks.push(clone(j(r).passageChecks[0]));},
  hidden:r=>{j(r).passageChecks[0].approved=true;},unknownContribution:r=>{j(r).passageChecks[0].contribution='ignored';},
  unknownQualification:r=>{j(r).passageChecks[0].qualification='retained';},blank:r=>{j(r).passageChecks[0].explanation=' ';},
  long:r=>{j(r).passageChecks[0].explanation='x'.repeat(241);},control:r=>{j(r).passageChecks[0].explanation='A\u200bB';},
  foreignCitation:r=>{j(r).passageChecks[0].evidence=clone(j(r).passageChecks[1].evidence);},unknownCitation:r=>{j(r).passageChecks[0].evidence[0].sentenceId='S1P1S999';},
  duplicateCitation:r=>{j(r).passageChecks[0].evidence.push(clone(j(r).passageChecks[0].evidence[0]));},
  typedQuote:r=>{j(r).passageChecks[0].evidence[0].quote='Do not rewrite evidence';},missingCitation:r=>{j(r).passageChecks[0].evidence=[];},
  unrelatedQualifier:r=>{j(r).passageChecks[0].contribution='unrelated';j(r).passageChecks[0].qualification='preserved';},
  unrelatedCitation:r=>{j(r).passageChecks[0].contribution='unrelated';},basisMismatch:r=>{j(r).verdict='unsupported';},
  unknownBasis:r=>{j(r).basis='approved';},changedHash:r=>{r.reviewSha256='0'.repeat(64);},extraRoot:r=>{r.overall='supported';},
  missingJudgment:r=>{r.judgments=[];},changedSpan:r=>{j(r).spanId='T9';},finalTypedQuote:r=>{j(r).evidence[0].quote='Fabricated';},
  finalDuplicate:r=>{j(r).evidence.push(clone(j(r).evidence[0]));},blankFinal:r=>{j(r).explanation='';},missingFinalEvidence:r=>{j(r).evidence=[];},
}))test(`${name} cannot bypass the passage or inherited citation contract`,()=>{const view=build(input()),r=reply(view);change(r);invalid(r,view);});

test('final evidence is tied to the same span checks and includes decisive support',()=>{
  const v=build({text:'The report describes a policy.',sources:[{publisher:'Test',passages:[{evidenceId:'S1P1',text:'The report describes a policy. A separate context sentence remains here.'}]}]});
  const r=reply(v);j(r).evidence=[{sentenceId:v.data.catalog[1].sentenceId}];invalid(r,v,'PASSAGE_SCOPE_FINAL_EVIDENCE');
  const view=build(input()),s=reply(view);j(s).passageChecks[1].contribution='context';j(s).evidence=clone(j(s).passageChecks[1].evidence);
  invalid(s,view,'PASSAGE_SCOPE_FINAL_EVIDENCE');
});
test('multiple spans each require their own ordered full passage coverage',()=>{
  const source=input();source.text='Archive members must reserve a desk, but members under sixteen are exempt.';const view=build(source),r=reply(view);
  assert.ok(view.data.spans.length>1);assert.equal(validate(r,view).valid,true);r.judgments.reverse();invalid(r,view);
  const partial=reply(view);partial.judgments[1].passageChecks.pop();invalid(partial,view);
});
test('plain-data guards reject accessors proxies cycles sparse data and oversized values without invoking them',()=>{
  const view=build(input()),r=reply(view);let reads=0;
  const accessor=clone(r);Object.defineProperty(j(accessor).passageChecks[0],'contribution',{get(){reads++;return 'support';},enumerable:true});
  const proxy=new Proxy(r,{ownKeys(){reads++;return [];}}),cycle=clone(r);cycle.self=cycle;
  const sparse=clone(r);delete j(sparse).passageChecks[0];
  for(const bad of [accessor,proxy,cycle,sparse,{x:'x'.repeat(60001)},Object.create(null),undefined,()=>{}])invalid(bad,view);
  assert.equal(reads,0);invalid(r,clone(view),'PASSAGE_SCOPE_VIEW');invalid(r,new Proxy(view,{}),'PASSAGE_SCOPE_VIEW');
});
test('source candidate contract and issued-view bindings reject stale or legacy results',()=>{
  const view=build(input()),r=reply(view),changed=input();changed.sources[0].passages[1].text='Members under twelve are exempt from this rule.';
  invalid(r,build(changed));changed.text='Visitors must reserve a desk before each visit.';invalid(r,build(changed));
  const old=buildSourceSentenceReview(input());const legacy={reviewSha256:old.data.reviewSha256,judgments:r.judgments.map(({passageChecks,basis,...rest})=>rest)};
  invalid(legacy,view);legacy.reviewSha256=view.data.reviewSha256;invalid(legacy,view); // new hash alone cannot fill coverage
  assert.equal(validateSourceSentenceReview(r,old).valid,false);
});
test('short-source resource boundary is explicit and never silently drops a passage',()=>{
  assert.deepEqual(PASSAGE_SCOPE_LIMITS,{passages:8,spans:8,checks:64,dataBytes:50000});
  const source=input();source.sources[0].passages=Array.from({length:8},(_,i)=>({evidenceId:`S1P${i+1}`,text:`Passage ${i+1} records a complete source statement.`}));
  source.text='A, B, C, D, E, F, G, H.';const v=build(source);assert.equal(v.data.spans.length,8);assert.equal(v.data.passages.length,8);
  source.sources[0].passages.push({evidenceId:'S1P9',text:'Ninth passage must not be truncated.'});assert.throws(()=>build(source),/PASSAGE_SCOPE_SIZE/);
});
test('offline adapter has no provider path and preserves the old catalog implementation',async()=>{
  const dir=new URL('../scripts/automation/experiments/',import.meta.url);
  assert.equal(sha(await readFile(new URL('source-sentence-review.mjs',dir))),'906fcf509072e3a92f9dd1f4de4a435bbc9d3a48b3678a886d910fa22c0d4653');
  const src=await readFile(new URL('passage-scope-review.mjs',dir),'utf8');assert.doesNotMatch(src,/fetch\(|process\.env|node:fs|workers-ai|resend|writeFile/);
});
