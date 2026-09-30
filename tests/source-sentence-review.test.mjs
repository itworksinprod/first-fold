import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildSourceSentenceReview as build,validateSourceSentenceReview as validate,SOURCE_SENTENCE_CONTRACT,SOURCE_SENTENCE_PROMPT,SOURCE_SENTENCE_LIMITS} from '../scripts/automation/experiments/source-sentence-review.mjs';
import {buildSpanSourceReview,validateSpanSourceReview,SPAN_SOURCE_PROMPT} from '../scripts/automation/experiments/span-source-review.mjs';
import {buildSourceRangeReview,validateSourceRangeReview} from '../scripts/automation/experiments/source-range-review.mjs';
import {SPAN_SOURCE_CONTROLS as controls,SPAN_SOURCE_CONTROLSET_SHA256} from '../scripts/automation/experiments/span-source-controls.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),invalid={valid:false,supported:false};
const input=text=>({text:'The station records the observation.',sources:[{publisher:'Synthetic publisher',passages:[{evidenceId:'S1P1',text}]}]});
const mock=v=>({reviewSha256:v.data.reviewSha256,judgments:v.data.spans.map(s=>({spanId:s.spanId,verdict:'supported',
  explanation:'Injected fixture label tests mechanics, not factual support.',evidence:[{sentenceId:v.data.catalog[0].sentenceId}]}))});
const deepFrozen=x=>{if(x&&typeof x==='object'){assert.ok(Object.isFrozen(x));Object.values(x).forEach(deepFrozen);}};
const texts=v=>v.data.catalog.map(s=>s.text);

test('separate sentence contract preserves v2 entailment policy and frozen control labels',()=>{
  assert.equal(SOURCE_SENTENCE_CONTRACT,'exact-source-sentence-catalog-v1');
  assert.equal(sha(SPAN_SOURCE_PROMPT),'ef268f860df247fb96d97dc21f2372d623e40e210ca8023af3044b5c0ef1af61');
  assert.equal(SPAN_SOURCE_CONTROLSET_SHA256,'c7a74593f9b8e5d4714f6122029a4f5a15f93f9c7d4647a6aac287ddb7a7b94d');
  for(const line of SPAN_SOURCE_PROMPT.split('\n').filter(s=>!s.startsWith('Exact copying')&&!s.startsWith('Supported requires')))
    assert.ok(SOURCE_SENTENCE_PROMPT.includes(line),`Changed semantic instruction: ${line}`);
  assert.match(SOURCE_SENTENCE_PROMPT,/Only supported passes/);
  assert.match(SOURCE_SENTENCE_PROMPT,/keyword matches alone are insufficient/);
  assert.doesNotMatch(SOURCE_SENTENCE_PROMPT,/GitHub|runner|September|SC0/);
});
test('all controls retain exact text, spans, publisher and complete source without model-facing expected labels',()=>{
  for(const c of controls){const v=build(c.input),base=buildSpanSourceReview(c.input);deepFrozen(v);
    assert.equal(v.data.sentence,base.data.sentence);assert.deepEqual(v.data.spans,base.data.spans);assert.deepEqual(v.data.passages,base.data.passages);
    assert.notEqual(v.data.reviewSha256,base.data.reviewSha256);
    const {reviewSha256,...data}=v.data;assert.equal(reviewSha256,sha(JSON.stringify(data)));
    assert.doesNotMatch(JSON.stringify(v),/expectedVerdicts|expectedSupported|rationale|SC0[1-8]/);
    for(const s of v.data.catalog){const p=v.data.passages.find(p=>p.evidenceId===s.evidenceId);
      assert.equal(s.text,p.text.slice(s.start,s.end));assert.ok(s.text.length>=8&&s.text.length<=400);
    }
  }
});

for(const [name,text,expected] of [
  ['versions','The sensor uses version 2.329.0. New devices require version 3.1.2.', ['The sensor uses version 2.329.0.','New devices require version 3.1.2.']],
  ['decimals','The measured value was 2.75 percent. Calibration is unchanged.', ['The measured value was 2.75 percent.','Calibration is unchanged.']],
  ['titles and initials','Dr. A. Smith checked the sensor. The result is provisional.', ['Dr. A. Smith checked the sensor.','The result is provisional.']],
  ['accented initial','Dr. É. Martin checked the sensor. The result is provisional.', ['Dr. É. Martin checked the sensor.','The result is provisional.']],
  ['combining-mark initial','Dr. E\u0301. Martin checked the sensor. The result is provisional.', ['Dr. E\u0301. Martin checked the sensor.','The result is provisional.']],
  ['non-Latin initial','Dr. Α. Martin checked the sensor. The result is provisional.', ['Dr. Α. Martin checked the sensor.','The result is provisional.']],
  ['lowercase initial','Dr. e. Martin checked the sensor. The result is provisional.', ['Dr. e. Martin checked the sensor.','The result is provisional.']],
  ['rank title','Lt. Rivera checked the sensor. The result is provisional.', ['Lt. Rivera checked the sensor.','The result is provisional.']],
  ['initialisms','The U.S. team ran the test. The U.K. team did not.', ['The U.S. team ran the test.','The U.K. team did not.']],
  ['generic abbreviations','The team tested alternatives, e.g. Birch and Cedar. The scope is narrow.', ['The team tested alternatives, e.g. Birch and Cedar.','The scope is narrow.']],
  ['ambiguous trailing initial','The team inspected Lab C. The scope is narrow.', ['The team inspected Lab C. The scope is narrow.']],
  ['month abbreviations','The trial ends on Nov. 29, 2027. Renewal is optional.', ['The trial ends on Nov. 29, 2027.','Renewal is optional.']],
  ['time abbreviations','The trial begins at 9 a.m. on Tuesday. Staff will observe it.', ['The trial begins at 9 a.m. on Tuesday.','Staff will observe it.']],
  ['qualification','Only pilot rooms are covered; all other rooms are excluded. No wider rollout was announced.', ['Only pilot rooms are covered; all other rooms are excluded.','No wider rollout was announced.']],
  ['parentheses','The pilot (including rooms A and B) remains limited. Other rooms are excluded.', ['The pilot (including rooms A and B) remains limited.','Other rooms are excluded.']],
  ['quoted punctuation','The notice says “Pause now.” The timing remains tentative.', ['The notice says “Pause now.”','The timing remains tentative.']],
  ['nested quoted punctuation','The notice says “The label reads \'Pause now.\'” The timing is tentative.', ['The notice says “The label reads \'Pause now.\'”','The timing is tentative.']],
  ['apostrophes','It\'s the users\' equipment. The operator’s scope is unchanged.', ["It's the users' equipment.",'The operator’s scope is unchanged.']],
  ['combining-mark possessive','The cafe\u0301’s sensor works. The scope is unchanged.', ['The cafe\u0301’s sensor works.','The scope is unchanged.']],
  ['ellipsis','The report says results are pending... The final review remains incomplete.', ['The report says results are pending... The final review remains incomplete.']],
  ['lowercase continuation','The note says “Wait.” before describing the schedule. The plan is unchanged.', ['The note says “Wait.” before describing the schedule.','The plan is unchanged.']],
  ['ambiguous abbreviation grouping','The supplier is Example Inc. The pilot remains limited.', ['The supplier is Example Inc. The pilot remains limited.']],
  ['URL and email','The docs are at https://example.invalid/v2.3. Email ops@example.invalid for details.', ['The docs are at https://example.invalid/v2.3.','Email ops@example.invalid for details.']],
])test(`${name} preserve whole source units and exact boundaries`,()=>assert.deepEqual(texts(build(input(text))),expected));

test('exact Unicode, punctuation, whitespace and bound offsets survive host reconstruction',()=>{
  for(const text of ['A 🛰️ sensor records café data.', 'Cafe\u0301  observations\u00a0remain\u202funchanged.',
    '測定値 観測結果 は変わりません。','The operator’s non‑breaking plan—version 2.329.0—remains intact.']){
    const v=build(input(text)),r=mock(v),out=validate(r,v);assert.equal(out.valid,true);deepFrozen(out);
    assert.equal(out.quotedPayload.judgments[0].evidence[0].quote,text);assert.deepEqual(out.rawSelection,r);
  }
  const v=build(input('First complete sentence.\u00a0  Second complete sentence.'));
  assert.equal(v.data.catalog[1].start,27);assert.equal(v.data.catalog[1].text,'Second complete sentence.');
  assert.throws(()=>build(input('This malformed \ud800 code unit is rejected.')),/SOURCE_SENTENCE_UNICODE/);
});
test('year-only old ranges cannot be emitted as new evidence or silently expanded',()=>{
  const v=build(input('The first trial begins Monday, November 28, 2027, and enforcement begins Tuesday, November 29, 2027.'));
  assert.equal(v.data.catalog.length,1);assert.ok(v.data.catalog[0].text.includes('first trial'));
  for(const e of [{evidenceId:'S1P1',startWord:8,endWord:8},{sentenceId:'2027.'},{sentenceId:'S1P1S1',quote:'2027.'},
    {sentenceId:'S1P1S1',start:0,end:5}]){const r=mock(v);r.judgments[0].evidence=[e];assert.deepEqual(validate(r,v),invalid);}
});
test('quote length limits apply to whole units; unsuitable text remains visible but unselectable',()=>{
  for(const n of [7,8,400,401]){
    const text='x'.repeat(n-1)+'.';
    if(n===7||n===401)assert.throws(()=>build(input(text)),/SOURCE_SENTENCE_EMPTY/);
    else{const v=build(input(text));assert.equal(validate(mock(v),v).quotedPayload.judgments[0].evidence[0].quote.length,n);}
  }
  const text='2027. A complete source statement remains available. '+ 'L'.repeat(400)+'. Unfinished heading:';
  const v=build(input(text));assert.equal(v.data.passages[0].text,text);
  assert.deepEqual(texts(v),['A complete source statement remains available.']);
  assert.deepEqual(v.data.excluded.map(s=>s.reason),['too-short','too-long','unterminated']);
  assert.equal(v.data.catalog[0].sentenceId,'S1P1S2');
  for(const s of v.data.excluded){const r=mock(v);r.judgments[0].evidence=[{sentenceId:s.sentenceId}];assert.deepEqual(validate(r,v),invalid);}
});
test('unbalanced punctuation is not silently closed or partially offered',()=>{
  for(const text of ['The notice says “The plan works. More text follows.', 'This statement has an unmatched ) mark. Next text follows.',
    'The claim (with a caveat. More text follows.'])assert.throws(()=>build(input(text)),/SOURCE_SENTENCE_EMPTY/);
  const v=build(input('A complete opening statement exists. An unfinished “quote follows.'));
  assert.deepEqual(texts(v),['A complete opening statement exists.']);assert.equal(v.data.excluded[0].reason,'unbalanced');
});
test('separate sentences remain separate evidence and complete source exceptions stay visible',()=>{
  const text='The museum installed a filter. The reported change may be unrelated. Exposure was lower later.';
  const v=build(input(text)),r=mock(v);r.judgments[0].evidence=[{sentenceId:'S1P1S1'},{sentenceId:'S1P1S3'}];
  const out=validate(r,v);assert.equal(out.valid,true);
  assert.deepEqual(out.quotedPayload.judgments[0].evidence.map(e=>e.quote),['The museum installed a filter.','Exposure was lower later.']);
  assert.equal(v.data.passages[0].text,text);assert.equal(out.supported,true,'Injected labels can still be semantically wrong; membership is not entailment.');
});
test('stable catalog IDs do not permit changed-source, changed-claim or cross-contract replay',()=>{
  const i=input('A full source sentence is retained.'),v=build(i),r=mock(v),again=build(i),old=buildSpanSourceReview(i),range=buildSourceRangeReview(i);
  assert.deepEqual(v,again);assert.equal(validate(r,again).valid,true);
  assert.deepEqual(validate(r,structuredClone(v)),invalid);
  assert.deepEqual(validate(r,build(input('A changed source sentence is retained.'))),invalid);
  assert.deepEqual(validate(r,build({...i,text:'The sensor does not record observations.'})),invalid);
  const out=validate(r,v);assert.equal(validateSpanSourceReview(out.quotedPayload,old).valid,true);
  assert.notEqual(out.rawSelection.reviewSha256,out.quotedPayload.reviewSha256);
  assert.deepEqual(validate(out.quotedPayload,v),invalid);assert.deepEqual(validateSourceRangeReview(r,range),invalid);
  assert.deepEqual(validateSpanSourceReview(r,old),invalid);r.judgments[0].evidence[0].sentenceId='wrong';
  assert.equal(out.rawSelection.judgments[0].evidence[0].sentenceId,'S1P1S1');
});
test('duplicate, third, malformed and hidden evidence entries reject',()=>{
  const v=build(input('One source sentence is here. Another source sentence is here.'));
  for(const change of [r=>{r.judgments[0].evidence.push({...r.judgments[0].evidence[0]});},
    r=>{r.judgments[0].evidence=Array(3).fill(r.judgments[0].evidence[0]);},r=>{r.judgments[0].evidence[0].evidenceId='S2P1';},
    r=>{r.judgments[0].evidence[0].sentenceId=1;},r=>{r.judgments[0].evidence[0].sentenceId='S1P1S99';},
    r=>{r.judgments[0].evidence=[];}]){const r=mock(v);change(r);assert.deepEqual(validate(r,v),invalid);}
  const same=build(input('Repeated complete source sentence. Repeated complete source sentence.')),r=mock(same);
  r.judgments[0].evidence=[{sentenceId:'S1P1S1'},{sentenceId:'S1P1S2'}];assert.deepEqual(validate(r,same),invalid);
});
test('complete ordered span coverage, verdict and explanation gates remain unchanged',()=>{
  const v=build(controls[0].input);
  for(const change of [r=>{r.judgments.pop();},r=>{r.judgments.reverse();},r=>{r.judgments[1].spanId='T1';},
    r=>{r.reviewSha256='0'.repeat(64);},r=>{r.articleApproved=true;},r=>{r.judgments[0].verdict='approved';},
    r=>{r.judgments[0].explanation='x'.repeat(241);},r=>{r.judgments[0].extra='hidden';}]){
    const r=mock(v);change(r);assert.deepEqual(validate(r,v),invalid);
  }
});
test('unsupported and uncertain remain held even when real sentence IDs are selected',()=>{
  const v=build(controls[1].input);
  for(const verdict of ['unsupported','uncertain'])for(const useEvidence of [true,false]){
    const r=mock(v);r.judgments[0].verdict=verdict;if(!useEvidence)r.judgments[0].evidence=[];
    const out=validate(r,v);assert.equal(out.valid,true);assert.equal(out.supported,false);
    assert.equal(out.quotedPayload.judgments[0].verdict,verdict);
  }
  const out=validate(mock(v),v);assert.equal(out.supported,true);assert.equal(controls[1].expectedSupported,false);
  assert.equal('articleApproved' in out,false);
});
test('untrusted accessors, proxies, cycles and sparse arrays are rejected without execution',()=>{
  const v=build(input('A complete source sentence is retained.'));let touched=0;
  for(const change of [r=>Object.defineProperty(r,'judgments',{enumerable:true,get(){touched++;}}),
    r=>new Proxy(r,{ownKeys(){touched++;return [];}}),r=>({...r,toJSON(){touched++;}}),
    r=>{r.judgments=Array(1);return r;},r=>{r.extra=r;return r;},r=>({...r,extra:'x'.repeat(60001)}),
    r=>{Object.defineProperty(r.judgments[0].evidence[0],'sentenceId',{enumerable:true,get(){touched++;}});return r;}
  ])assert.deepEqual(validate(change(mock(v)),v),invalid);
  assert.equal(touched,0);
});
test('bounded indexing never truncates original input or a long sentence',()=>{
  assert.deepEqual(SOURCE_SENTENCE_LIMITS,{segments:160,dataBytes:50000});
  assert.throws(()=>build(input(Array(161).fill('A complete sentence exists.').join(' '))),/SOURCE_SENTENCE_SIZE/);
  const i=input(Array(300).fill('a').join(' ')+'.');
  i.sources[0].passages=Array.from({length:40},(_,n)=>({evidenceId:`S1P${n+1}`,text:i.sources[0].passages[0].text}));
  assert.throws(()=>build(i),/SOURCE_SENTENCE_EMPTY/);
  const many=input(Array(5).fill('Complete sentence '+ 'x'.repeat(360)+'.').join(' '));
  many.sources[0].passages=Array.from({length:12},(_,n)=>({evidenceId:`S1P${n+1}`,text:many.sources[0].passages[0].text}));
  assert.throws(()=>build(many),/SOURCE_SENTENCE_SIZE/);
});
test('new catalog is offline and leaves both legacy live workflows untouched',async()=>{
  for(const p of ['../scripts/automation/full-article-span-review.mjs','../scripts/automation/full-article-range-review.mjs',
    '../.github/workflows/full-article-span-review.yml','../.github/workflows/full-article-range-review.yml'])
    assert.doesNotMatch(await readFile(new URL(p,import.meta.url),'utf8'),/source-sentence-review/);
  const code=await readFile(new URL('../scripts/automation/experiments/source-sentence-review.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(code,/\bfetch\s*\(|requestWorkersAi|process\.env|writeFile|RESEND|CLOUDFLARE/);
});
