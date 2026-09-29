import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildSpanSourceReview as build,validateSpanSourceReview as validate,splitReviewSpans,
  SPAN_SOURCE_PROMPT,SPAN_SOURCE_CONTRACT} from '../scripts/automation/experiments/span-source-review.mjs';
import {SPAN_SOURCE_CONTROLS as controls,SPAN_SOURCE_CONTROLSET_SHA256} from '../scripts/automation/experiments/span-source-controls.mjs';
const invalid={valid:false,supported:false},sha=x=>createHash('sha256').update(x).digest('hex');
const mock=(v)=>({reviewSha256:v.data.reviewSha256,judgments:v.data.spans.map(s=>({spanId:s.spanId,
  verdict:'supported',explanation:'Synthetic shape check only; this is not semantic qualification.',
  evidence:[{evidenceId:'S1P1',quote:v.data.passages[0].text.split('. ')[0]}]}))});
const freezeCheck=x=>{if(x&&typeof x==='object'){assert.ok(Object.isFrozen(x));Object.values(x).forEach(freezeCheck);}};

test('all eight controls are balanced, frozen and stripped of expected labels before review',()=>{
  assert.equal(controls.length,8);assert.equal(controls.filter(c=>c.expectedSupported).length,4);
  assert.equal(SPAN_SOURCE_CONTROLSET_SHA256,sha(JSON.stringify(controls)));
  assert.equal(SPAN_SOURCE_CONTROLSET_SHA256,'c7a74593f9b8e5d4714f6122029a4f5a15f93f9c7d4647a6aac287ddb7a7b94d');
  assert.equal(sha(SPAN_SOURCE_PROMPT),'ef268f860df247fb96d97dc21f2372d623e40e210ca8023af3044b5c0ef1af61');
  freezeCheck(controls);
  for(const c of controls){const v=build(c.input);freezeCheck(v);
    assert.equal(v.prompt,SPAN_SOURCE_PROMPT);assert.equal(v.data.policy,SPAN_SOURCE_CONTRACT);
    assert.equal(v.schema.properties.judgments.items.properties.evidence.items.properties.quote.minLength,8);
    assert.equal(v.data.sentence,c.input.text);assert.equal(v.data.passages[0].text,c.input.sources[0].passages[0].text);
    assert.doesNotMatch(JSON.stringify(v),/expectedSupported|expectedVerdicts|rationale|SC0[1-8]/);
    assert.ok(!JSON.stringify(v).includes(c.rationale));
    const {reviewSha256,...data}=v.data;assert.equal(reviewSha256,sha(JSON.stringify(data)));
  }
  assert.equal(splitReviewSpans(controls[1].input.text).length,1,'unpunctuated counterexample cannot rely on splitting');
  assert.doesNotMatch(SPAN_SOURCE_PROMPT,/GitHub|runner|Bellweather|museum|Oak Hall/);
});
test('v2 clarifies entailment without changing controls or accepting a v1 verdict hash',()=>{
  assert.equal(SPAN_SOURCE_CONTRACT,'lossless-contextual-span-source-v2');
  assert.match(SPAN_SOURCE_PROMPT,/Exact copying is required for evidence quotes, not for the candidate wording/);
  assert.match(SPAN_SOURCE_PROMPT,/does not by itself assert that one caused the other/);
  assert.match(SPAN_SOURCE_PROMPT,/does not automatically contradict a separately supported contribution/);
  assert.match(SPAN_SOURCE_PROMPT,/Only supported passes/);
  const v=build(controls[0].input),r=mock(v),{reviewSha256,...data}=v.data;
  r.reviewSha256=sha(JSON.stringify({...data,policy:'lossless-contextual-span-source-v1'}));
  assert.notEqual(r.reviewSha256,reviewSha256);assert.deepEqual(validate(r,v),invalid);
});
test('host spans preserve every byte, connective, date, negation and Unicode character',()=>{
  for(const sentence of [controls[0].input.text,...controls.map(c=>c.input.text),
    'The test ran September 29, 2026, but did not change the result.',
    'Version 2.329.0 is required; this does not establish protection.',
    'A 🛰️ sensor records a range, ensuring the example contains a non-BMP symbol.',
    'Research and development use a shared name.',
  ]){const spans=splitReviewSpans(sentence);assert.equal(spans.map(s=>s.text).join(''),sentence);
    let offset=0;for(const s of spans){assert.equal(s.start,offset);assert.equal(sentence.slice(s.start,s.end),s.text);offset=s.end;}
    assert.equal(offset,sentence.length);freezeCheck(spans);
  }
});
test('known supported-prefix failure receives separate mandatory tail judgments',()=>{
  const sentence='The version check blocks outdated runners, ensuring workflow jobs run on software with recent security patches and features (GitHub).';
  const v=build({text:sentence,sources:[{publisher:'Synthetic source',passages:[{evidenceId:'S1P1',text:'Older versions cannot register. Registered devices below the execution minimum stop working.'}]}]});
  assert.equal(v.data.spans.length,3);
  assert.match(v.data.spans[1].text,/ensuring/);assert.match(v.data.spans[2].text,/^and features/);
  const r=mock(v);r.judgments=r.judgments.slice(0,1);assert.deepEqual(validate(r,v),invalid);
  const complete=mock(v);complete.judgments[1].verdict='unsupported';complete.judgments[1].evidence=[];
  const verdict=validate(complete,v);assert.equal(verdict.valid,true);assert.equal(verdict.supported,false);
});
test('unsupported and uncertain are valid holds; no ignore or overall-pass class exists',()=>{
  const v=build(controls[0].input);
  for(const verdict of ['unsupported','uncertain']){const r=mock(v);r.judgments.at(-1).verdict=verdict;r.judgments.at(-1).evidence=[];
    const out=validate(r,v);assert.equal(out.valid,true);assert.equal(out.supported,false);assert.equal(out.spans.at(-1).verdict,verdict);}
  for(const mutate of [r=>{r.supported=true;},r=>{r.judgments[0].verdict='ignore';},r=>{r.judgments[0].verdict=true;},r=>{r.judgments[0].evidence=[];}]){
    const r=mock(v);mutate(r);assert.deepEqual(validate(r,v),invalid);
  }
});
test('missing, duplicate, reordered, stale, altered and extra judgments reject',()=>{
  const v=build(controls[0].input);
  for(const mutate of [r=>{r.judgments.pop();},r=>{r.judgments.push(r.judgments[0]);},r=>{r.judgments.reverse();},
    r=>{r.judgments[1].spanId=r.judgments[0].spanId;},r=>{r.reviewSha256='0'.repeat(64);},r=>{r.judgments[0].extra='hidden';},
    r=>{r.judgments[0].explanation=' ';},r=>{r.judgments[0].explanation='x'.repeat(241);},r=>{r.judgments=Array(2);},
  ]){const r=mock(v);mutate(r);assert.deepEqual(validate(r,v),invalid);}
  assert.deepEqual(validate(mock(v),structuredClone(v)),invalid);
  assert.deepEqual(validate(mock(v),build(controls[2].input)),invalid);
});
test('quotes must occur exactly in the named passage, without empty, fabricated or duplicate evidence',()=>{
  const v=build(controls[0].input);
  for(const mutate of [r=>{r.judgments[0].evidence[0].quote='invented detail';},r=>{r.judgments[0].evidence[0].evidenceId='S1P2';},
    r=>{r.judgments[0].evidence[0].quote='The';},r=>{r.judgments[0].evidence[0].quote='x'.repeat(401);},
    r=>{r.judgments[0].evidence.push(r.judgments[0].evidence[0]);},r=>{r.judgments[0].evidence[0].quote+=' '},
  ]){const r=mock(v);mutate(r);assert.deepEqual(validate(r,v),invalid);}
});
test('quote membership and structural coverage deliberately do not pretend to prove truth',()=>{
  const v=build(controls[1].input),r=mock(v); // This is a known false claim with a real but insufficient quote.
  assert.equal(controls[1].expectedSupported,false);
  assert.equal(validate(r,v).supported,true,'A model false positive remains possible and must be caught by semantic calibration.');
});
test('input rejects truncation, hidden fields, duplicate IDs, unavailable evidence and oversized coverage',()=>{
  for(const mutate of [x=>{x.text+=' ';},x=>{x.text='x'.repeat(1001);},x=>{x.text=Array(10).fill('Claim').join(' and ');},
    x=>{x.sources=[];},x=>{x.sources[0].extra='hidden context';},x=>{x.previousClaims=['not allowed'];},
    x=>{x.sources[0].passages.push({...x.sources[0].passages[0]});},x=>{x.sources[0].passages[0].text='';},
    x=>{x.sources[0].passages[0].text='x'.repeat(5001);},x=>{x.sources[0].passages[0].evidenceId='wrong';},
  ]){const x=structuredClone(controls[0].input);mutate(x);assert.throws(()=>build(x));}
});
test('behavior-bearing, sparse, cyclic and resource-heavy objects reject without execution',()=>{
  let touched=0;const v=build(controls[0].input);
  const variants=[
    r=>Object.defineProperty(r,'judgments',{enumerable:true,get(){touched++;return [];}}),
    r=>new Proxy(r,{ownKeys(){touched++;return [];}}),
    r=>({...r,toJSON(){touched++;return r;}}),
    r=>{r.extra=r;return r;},r=>({...r,extra:NaN}),r=>({...r,extra:new Date()}),r=>({...r,extra:undefined}),
    r=>({...r,extra:Array(501).fill(null)}),r=>({...r,extra:'x'.repeat(60001)}),
  ];for(const change of variants)assert.deepEqual(validate(change(mock(v)),v),invalid);
  assert.equal(touched,0);
  const input=new Proxy(controls[0].input,{ownKeys(){touched++;return [];}});assert.throws(()=>build(input));assert.equal(touched,0);
});
test('numeric-looking non-index properties cannot substitute for array elements',()=>{
  const x=structuredClone(controls[0].input),bad=new Array(1);bad['4294967295']=x.sources[0];x.sources=bad;
  assert.throws(()=>build(x),/SPAN_REVIEW_DATA/);
  for(const key of ['4294967295','9007199254740992','-1','01']){
    const v=build(controls[0].input),r=mock(v),sparse=new Array(r.judgments.length);
    sparse[0]=r.judgments[0];sparse[key]=r.judgments[1];r.judgments=sparse;
    assert.deepEqual(validate(r,v),invalid);
  }
});
test('isolated article writer and existing review profile remain unchanged',async()=>{
  const module=await readFile(new URL('../scripts/automation/article-summary-trial.mjs',import.meta.url),'utf8');
  assert.equal(sha(module),'51f49ff634d77e88137ee3ff34f88c4217f73bfd6c07d3f6593598a883e1a07f');
  assert.doesNotMatch(module,/span-source/);
});
