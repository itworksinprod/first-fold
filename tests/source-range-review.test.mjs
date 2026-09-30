import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildSourceRangeReview as build,validateSourceRangeReview as validate,SOURCE_RANGE_CONTRACT,SOURCE_RANGE_PROMPT,SOURCE_RANGE_LIMITS} from '../scripts/automation/experiments/source-range-review.mjs';
import {buildSpanSourceReview,validateSpanSourceReview,SPAN_SOURCE_PROMPT} from '../scripts/automation/experiments/span-source-review.mjs';
import {SPAN_SOURCE_CONTROLS as controls,SPAN_SOURCE_CONTROLSET_SHA256} from '../scripts/automation/experiments/span-source-controls.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),invalid={valid:false,supported:false};
const input=text=>({text:'The station records the observation.',sources:[{publisher:'Synthetic publisher',passages:[{evidenceId:'S1P1',text}]}]});
const mock=v=>({reviewSha256:v.data.reviewSha256,judgments:v.data.spans.map(s=>({spanId:s.spanId,verdict:'supported',
  explanation:'Synthetic injected verdict tests mechanics only.',evidence:[{evidenceId:v.data.passages[0].evidenceId,startWord:1,endWord:v.data.passages[0].words.length}]}))});
const deepFrozen=x=>{if(x&&typeof x==='object'){assert.ok(Object.isFrozen(x));Object.values(x).forEach(deepFrozen);}};
test('v1 is a separate immutable range contract; original v2 remains unchanged',()=>{
  assert.equal(SOURCE_RANGE_CONTRACT,'lossless-source-word-range-v1');
  assert.equal(sha(SPAN_SOURCE_PROMPT),'ef268f860df247fb96d97dc21f2372d623e40e210ca8023af3044b5c0ef1af61');
  assert.equal(SPAN_SOURCE_CONTROLSET_SHA256,'c7a74593f9b8e5d4714f6122029a4f5a15f93f9c7d4647a6aac287ddb7a7b94d');
  assert.doesNotMatch(SOURCE_RANGE_PROMPT,/GitHub|runner|September|SC0/);
  for(const sentence of SPAN_SOURCE_PROMPT.split('\n').filter(s=>!s.startsWith('Exact copying')&&!s.startsWith('Supported requires'))){
    assert.ok(SOURCE_RANGE_PROMPT.includes(sentence),`Semantic instruction changed: ${sentence}`);
  }
  assert.match(SOURCE_RANGE_PROMPT,/Only supported passes/);assert.match(SOURCE_RANGE_PROMPT,/keyword matches alone are insufficient/);
  assert.match(SOURCE_RANGE_PROMPT,/never guessed or repaired/);
});
test('all balanced controls retain original text, full source and lossless spans without expected labels',()=>{
  for(const c of controls){const view=build(c.input),base=buildSpanSourceReview(c.input);deepFrozen(view);
    assert.equal(view.data.sentence,base.data.sentence);assert.deepEqual(view.data.spans,base.data.spans);
    assert.deepEqual(view.data.passages.map(({words,...p})=>p),base.data.passages);
    assert.notEqual(view.data.reviewSha256,base.data.reviewSha256);
    const {reviewSha256,...data}=view.data;assert.equal(reviewSha256,sha(JSON.stringify(data)));
    assert.doesNotMatch(JSON.stringify(view),/expectedVerdicts|expectedSupported|rationale|SC0[1-8]/);
    for(const p of view.data.passages)for(const [i,w]of p.words.entries()){
      assert.equal(w.word,i+1);assert.equal(w.text,p.text.slice(w.start,w.end));
      assert.equal(w.start===0||/\s/u.test(p.text[w.start-1]),true);
    }
  }
});
test('quotes preserve internal whitespace, Unicode, punctuation and UTF-16 positions exactly',()=>{
  for(const text of ['A 🛰️ sensor records café data.', 'Cafe\u0301  observations\u00a0remain\u202funchanged.', '測定値 観測結果 は変わりません。',
    'The operator’s non‑breaking plan—version 2.329.0—remains intact.', 'Fullwidth Ａ and ordinary A are distinct.']){
    const view=build(input(text)),raw=mock(view),out=validate(raw,view);assert.equal(out.valid,true);
    assert.equal(out.quotedPayload.judgments[0].evidence[0].quote,text);assert.deepEqual(out.rawSelection,raw);deepFrozen(out);
    for(const w of view.data.passages[0].words)assert.equal(/[\uD800-\uDFFF]/u.test(w.text),false);
  }
  assert.throws(()=>build(input('This malformed \ud800 code unit is rejected.')),/SOURCE_RANGE_UNICODE/);
});
test('start and end are inclusive token numbers; untouched middle text cannot be elided',()=>{
  const text='First statement. Material exceptions stay visible. Final statement.',v=build(input(text)),r=mock(v);
  r.judgments[0].evidence[0]={evidenceId:'S1P1',startWord:2,endWord:7};
  const out=validate(r,v);assert.equal(out.valid,true);
  assert.equal(out.quotedPayload.judgments[0].evidence[0].quote,'statement. Material exceptions stay visible. Final');
  assert.equal(v.data.passages[0].text,text);
});
test('two selected ranges remain two quotes and are never concatenated or interpreted as entailment',()=>{
  const v=build(input('First observation. Important caveat. Last observation.')),r=mock(v);
  r.judgments[0].evidence=[{evidenceId:'S1P1',startWord:1,endWord:2},{evidenceId:'S1P1',startWord:5,endWord:6}];
  const out=validate(r,v);assert.equal(out.valid,true);
  assert.deepEqual(out.quotedPayload.judgments[0].evidence.map(e=>e.quote),['First observation.','Last observation.']);
  assert.ok(!out.quotedPayload.judgments[0].evidence.some(e=>e.quote.includes('...')));
  assert.equal(v.data.passages[0].text,'First observation. Important caveat. Last observation.');
});
for(const [label,startWord,endWord] of [['zero',0,2],['negative',-1,2],['fraction',1.5,2],['string','1',2],['reversed',3,2],['past-end',1,999],['unsafe',1,Number.MAX_SAFE_INTEGER+1],['null',null,2],['infinite',1,Infinity]]){
  test(`${label} range rejects without coercion or repair`,()=>{const v=build(input('First observation. Second observation.')),r=mock(v);
    Object.assign(r.judgments[0].evidence[0],{startWord,endWord});assert.deepEqual(validate(r,v),invalid);
  });
}
test('wrong passage, extra quote/offset fields, duplicate and third evidence entries reject',()=>{
  const v=build(input('A complete source observation is retained.'));
  for(const change of [r=>{r.judgments[0].evidence[0].evidenceId='S1P9';},r=>{r.judgments[0].evidence[0].quote='Invented quote';},
    r=>{r.judgments[0].evidence[0].start=0;},r=>{r.judgments[0].evidence.push({...r.judgments[0].evidence[0]});},
    r=>{r.judgments[0].evidence=Array(3).fill(r.judgments[0].evidence[0]);}]){const r=mock(v);change(r);assert.deepEqual(validate(r,v),invalid);}
});
test('old quotation limits remain 8–400 UTF-16 code units, with no padding or truncation',()=>{
  for(const n of [7,8,400,401]){const v=build(input('x'.repeat(n))),r=mock(v),out=validate(r,v);
    assert.equal(out.valid,n>=8&&n<=400);if(out.valid)assert.equal(out.quotedPayload.judgments[0].evidence[0].quote.length,n);
  }
});
test('missing, reordered, duplicate, stale and hidden judgments reject',()=>{
  const v=build(controls[0].input);
  for(const change of [r=>{r.judgments.pop();},r=>{r.judgments.reverse();},r=>{r.judgments[1].spanId=r.judgments[0].spanId;},
    r=>{r.reviewSha256='0'.repeat(64);},r=>{r.approved=true;},r=>{r.judgments[0].explanation='x'.repeat(241);},
    r=>{r.judgments[0].extra='Hidden';},r=>{r.judgments[0].verdict='ignore';},r=>{r.judgments[0].evidence=[];}]){
    const r=mock(v);change(r);assert.deepEqual(validate(r,v),invalid);
  }
  assert.deepEqual(validate(mock(v),structuredClone(v)),invalid);
  assert.deepEqual(validate(mock(v),build(controls[2].input)),invalid);
});
test('unsupported and uncertain stay held with or without real selected quotes',()=>{
  const v=build(controls[1].input);
  for(const verdict of ['unsupported','uncertain'])for(const withQuote of [true,false]){
    const r=mock(v);r.judgments[0].verdict=verdict;if(!withQuote)r.judgments[0].evidence=[];
    const out=validate(r,v);assert.equal(out.valid,true);assert.equal(out.supported,false);
    assert.equal(out.quotedPayload.judgments[0].verdict,verdict);assert.equal(out.rawSelection.judgments[0].verdict,verdict);
  }
});
test('valid quotations on a known false claim cannot establish semantic qualification',()=>{
  const c=controls.find(c=>!c.expectedSupported),v=build(c.input),r=mock(v),out=validate(r,v);
  assert.equal(out.valid,true);assert.equal(out.supported,true,'Injected model false positives remain possible, not repaired by source membership.');
  assert.equal(c.expectedSupported,false);assert.equal('articleApproved' in out,false);
});
test('model-written ellipsis quotation is rejected, not guessed into a range or repaired historically',()=>{
  const i=input('First report. Middle qualification. Last report.'),base=buildSpanSourceReview(i),v=build(i);
  const old={reviewSha256:base.data.reviewSha256,judgments:[{spanId:'T1',verdict:'supported',explanation:'Synthetic historical shape.',
    evidence:[{evidenceId:'S1P1',quote:'First report. ... Last report.'}]}]};const before=JSON.stringify(old);
  assert.deepEqual(validateSpanSourceReview(old,base),invalid);assert.deepEqual(validate(old,v),invalid);
  assert.equal(JSON.stringify(old),before);
});
test('raw selection, host reconstruction and stale v2 verdicts are distinctly bound',()=>{
  const i=input('One full source observation exists.'),v=build(i),base=buildSpanSourceReview(i),raw=mock(v),out=validate(raw,v);
  assert.notEqual(out.rawSelection.reviewSha256,out.quotedPayload.reviewSha256);
  assert.equal(out.rawSelection.reviewSha256,v.data.reviewSha256);assert.equal(out.quotedPayload.reviewSha256,base.data.reviewSha256);
  assert.equal(validateSpanSourceReview(out.quotedPayload,base).valid,true);
  assert.deepEqual(validate(out.quotedPayload,v),invalid);assert.deepEqual(validateSpanSourceReview(raw,base),invalid);
  raw.judgments[0].evidence[0].startWord=2;assert.equal(out.rawSelection.judgments[0].evidence[0].startWord,1);
});
test('untrusted accessors, proxies, sparse arrays, cycles and excessive data never execute',()=>{
  const v=build(input('A complete source observation exists.'));let touched=0;
  for(const change of [r=>Object.defineProperty(r,'judgments',{enumerable:true,get(){touched++;}}),
    r=>new Proxy(r,{ownKeys(){touched++;return [];}}),r=>({...r,toJSON(){touched++;}}),
    r=>{r.judgments=Array(1);return r;},r=>{r.extra=r;return r;},r=>({...r,extra:'x'.repeat(60001)}),
    r=>{Object.defineProperty(r.judgments[0].evidence[0],'startWord',{enumerable:true,get(){touched++;}});return r;}
  ])assert.deepEqual(validate(change(mock(v)),v),invalid);
  assert.equal(touched,0);
});
test('indexing is bounded and never silently truncates retained source',()=>{
  assert.deepEqual(SOURCE_RANGE_LIMITS,{wordsPerPassage:400,totalWords:800,dataBytes:50000});
  assert.throws(()=>build(input(Array(401).fill('a').join(' '))),/SOURCE_RANGE_SIZE/);
  const i=input(Array(300).fill('ab').join(' '));i.sources[0].passages=Array.from({length:3},(_,n)=>({evidenceId:`S1P${n+1}`,text:Array(300).fill('cd').join(' ')}));
  assert.throws(()=>build(i),/SOURCE_RANGE_SIZE/);
  const big=input('x'.repeat(4999));big.sources[0].passages=Array.from({length:6},(_,n)=>({evidenceId:`S1P${n+1}`,text:'x'.repeat(4999)}));
  assert.throws(()=>build(big),/SOURCE_RANGE_SIZE/);
});
test('existing live workflow and capture path remain untouched by the offline adapter',async()=>{
  for(const path of ['../scripts/automation/full-article-span-review.mjs','../.github/workflows/full-article-span-review.yml']){
    assert.doesNotMatch(await readFile(new URL(path,import.meta.url),'utf8'),/source-range-review/);
  }
  const code=await readFile(new URL('../scripts/automation/experiments/source-range-review.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(code,/\bfetch\s*\(|requestWorkersAi|process\.env|writeFile|RESEND|CLOUDFLARE/);
});
