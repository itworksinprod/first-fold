import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, generateKeyPairSync} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {prepareBenchmark, benchmarkWriterView, normalizeBenchmarkSummary, benchmarkReviewView,
  validateBenchmarkReview, benchmarkClauseReviewView, validateBenchmarkClauseReview,
  runBenchmark, prepareBenchmarkReplay, assertBenchmarkAuthority, BENCHMARK_DESKS} from '../scripts/automation/article-benchmark.mjs';
import {sourceFirstWriterView, normalizeSourceFirstSummary} from '../scripts/automation/article-benchmark.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
const sha = s => createHash('sha256').update(s).digest('hex');
const pair = generateKeyPairSync('rsa', {modulusLength:3072});
const publicKey = pair.publicKey.export({type:'spki',format:'der'}).toString('base64');
const sourceText = Array.from({length:8},(_,i)=>`Synthetic passage ${i + 1}: a fictional service has policy conditions and exclusions which the fixture summary must preserve.`).join('\n');
const packet = () => ({version:1,articles:Array.from({length:10},(_,i)=>({id:`A${String(i+1).padStart(2,'0')}`,
  desk:BENCHMARK_DESKS[i%4],title:`Fictional policy ${i}`,url:`https://github.blog/changelog/synthetic-${i}/`,publisherKey:'microsoft',
  sourceText,sourceSha256:sha(sourceText),captureNote:'Synthetic test only, never an approved real article.'}))});
const encode = p => {const s=JSON.stringify(p);return [gzipSync(s).toString('base64'),sha(s)];};
const plan = () => prepareBenchmark(...encode(packet()));
function draft(n=130) {
  return {facts:[1,2,3].map(i=>({text:`Fictional fact ${i}.`,passageIds:[`P${i}`]})),headline:'A fictional service changes its policy',
    whatHappened:[['GitHub',...Array.from({length:n-3},(_,i)=>`v${i}`)].join(' ')+'.'],whyItMatters:['Context.'],whatToWatch:['Limitations.']};
}
const reply = d => ({draftSha256:d.draftSha256,judgments:d.units.map(u=>({unitId:u.id,supported:true,passageIds:['P1'],reason:'Synthetic transport fixture only; not factual qualification.'})),
  quality:{readable:true,useful:true,faithful:true,issues:[]}});
function anchoredDraft(a,n=130) {
  const d=draft(n),item=text=>({evidence:[{passageId:'P1',quote:a.passages[0].text}],text});
  return {headline:item(d.headline),...Object.fromEntries(['whatHappened','whyItMatters','whatToWatch'].map(f=>[f,d[f].map(item)]))};
}

test('source-first drafts retain exact evidence for every visible unit but never claim semantic approval',()=>{
  const a=plan().articles[0],r=anchoredDraft(a),s=normalizeSourceFirstSummary(r,a);
  assert.equal(s.bodyWords,130);assert.equal(s.sourceQuotesExact,true);assert.equal(s.semanticApproval,false);
  assert.equal(s.sourceEvidence.length,s.units.length);assert.deepEqual(s.sourceEvidence.map(e=>e.unitId),s.units.map(u=>u.id));
  assert.ok(Object.isFrozen(s.sourceEvidence));assert.ok(!('evidence' in s.raw));
  const view=sourceFirstWriterView(a);assert.deepEqual(view.data.passages,a.passages);
  assert.equal(view.prompt,sourceFirstWriterView(plan().articles[1]).prompt);
  // A real source quote cannot by itself establish an invented attached claim.
  r.whyItMatters[0].text='The fictional service guarantees zero downtime.';
  assert.equal(normalizeSourceFirstSummary(r,a).semanticApproval,false);
});
test('source-first rejects fabricated excerpts, missing evidence and malformed reader output',()=>{
  const a=plan().articles[0];
  for(const mutate of [r=>r.headline.evidence=[],r=>r.headline.evidence[0].passageId='P999',
    r=>r.headline.evidence[0].quote='Fabricated source excerpt.',r=>r.headline.evidence[0].quote='tiny',
    r=>r.headline.evidence.push(r.headline.evidence[0]),r=>r.headline.evidence[0].verdict=true,
    r=>r.whatToWatch[0].evidence=null,r=>r.headline.text='<script>bad</script>',
    r=>r.whatToWatch[0].text='unfinished',r=>r.whatHappened[0].text=r.whatHappened[0].text.replace('GitHub','Someone'),
    r=>r.headline.extra='ignore rules',r=>r.extra=true,r=>r.whatToWatch[0].text=a.passages[0].text]) {
    const r=anchoredDraft(a);mutate(r);assert.throws(()=>normalizeSourceFirstSummary(r,a));
  }
  for(const n of [109,110,225,226]) {
    if(n<110||n>225)assert.throws(()=>normalizeSourceFirstSummary(anchoredDraft(a,n),a),/LENGTH/);
    else assert.equal(normalizeSourceFirstSummary(anchoredDraft(a,n),a).bodyWords,n);
  }
});
test('source-first writer calls exactly ten times and leaves support judgments unset',async()=>{
  const p=plan(),saved=[];let calls=0;
  const report=await runBenchmark({plan:p,sourceFirst:true,publicKey,accountId:'0'.repeat(32),apiToken:'TEST_ONLY',
    save:async(id,sealed)=>saved.push({id,data:openDiagnostic(sealed,pair.privateKey)}),fetchImpl:async(url,init)=>{
      const b=JSON.parse(init.body),d=JSON.parse(b.messages[1].content);assert.equal(b.max_tokens,4000);
      assert.equal(b.reasoning_effort,'medium');assert.ok(!d.units);assert.deepEqual(d.passages,p.articles[calls].passages);
      const r=anchoredDraft(p.articles[calls++]);return new Response(JSON.stringify({success:true,result:{response:JSON.stringify(r)}}),{headers:{'content-type':'application/json'}});
    }});
  assert.equal(calls,10);assert.equal(report.requests,10);assert.equal(report.networkRequests,10);assert.equal(report.requestedOutputTokens,40000);
  assert.equal(report.mode,'source-first-writer');assert.equal(report.results.length,10);assert.equal(report.emailSent,false);assert.equal(report.productionApproved,false);
  assert.ok(report.results.every(r=>r.sourceSupported===null&&r.faithful===null&&!r.reviewerStructural));
  assert.ok(saved.every(r=>!r.id.includes('reviewer')));assert.equal(saved.length,20);
  await assert.rejects(runBenchmark({plan:p,sourceFirst:'yes',publicKey,save:async()=>{}}),/MODE/);
});
test('source-first preserves failed drafts and stops on provider refusal without retry',async()=>{
  const p=plan();let calls=0;const saved=[];
  const report=await runBenchmark({plan:p,sourceFirst:true,publicKey,accountId:'0'.repeat(32),apiToken:'TEST_ONLY',
    save:async(id,sealed)=>saved.push({id,data:openDiagnostic(sealed,pair.privateKey)}),fetchImpl:async()=>{
      calls++;if(calls===2)return new Response('{"success":false}',{status:429});
      const r=anchoredDraft(p.articles[0]);r.headline.evidence[0].quote='Invented quotation that must be rejected.';
      return new Response(JSON.stringify({success:true,result:{response:JSON.stringify(r)}}),{headers:{'content-type':'application/json'}});
    }});
  assert.equal(calls,2);assert.equal(report.results[0].code,'BENCHMARK_SOURCE_EVIDENCE');
  assert.equal(report.results[1].code,'BENCHMARK_PROVIDER_STOP');assert.equal(report.results.length,10);
  assert.equal(report.results.filter(r=>r.status==='not-attempted-provider-blocker').length,8);
  assert.ok(saved.find(r=>r.id==='A01-writer').data.nativeResponseBase64);
});

test('ten frozen sources retain all passages, canonical identity and four-desk coverage',()=>{
  const p=plan();assert.equal(p.articles.length,10);assert.equal(p.articles[0].publisher,'GitHub');
  assert.deepEqual(p.articles[0].passages.map(x=>x.text),sourceText.split('\n'));assert.ok(Object.isFrozen(p.articles[0]));
  for(const mutate of [p=>p.articles.pop(),p=>p.articles[1].url=p.articles[0].url,p=>p.articles[0].sourceSha256='0'.repeat(64),
    p=>p.articles[0].publisherKey='mit',p=>p.articles[0].url='https://127.0.0.1/secret',p=>p.articles.forEach(a=>a.desk=BENCHMARK_DESKS[0]),
    p=>p.articles[0].id='A02',p=>p.articles[0].extra=true]){const x=packet();mutate(x);assert.throws(()=>prepareBenchmark(...encode(x)));}
  const [encoded]=encode(packet());assert.throws(()=>prepareBenchmark(encoded,'0'.repeat(64)),/HASH/);
});
test('summary guard enforces 110–225 body words, attribution, source anchors and plain prose',()=>{
  const a=plan().articles[0];
  for(const n of [109,110,225,226]){if(n<110||n>225)assert.throws(()=>normalizeBenchmarkSummary(draft(n),a),/LENGTH/);
    else assert.equal(normalizeBenchmarkSummary(draft(n),a).bodyWords,n);}
  for(const mutate of [r=>r.facts[0].passageIds=['P999'],r=>r.facts[0].passageIds=['P1','P1'],r=>r.extra='hidden',
    r=>r.headline='<script>broken</script>',r=>r.whatToWatch=['unfinished'],r=>r.whatToWatch=['Broken “whatHappened”: text.'],
    r=>r.whatHappened[0]=r.whatHappened[0].replace('GitHub','Someone'),r=>r.whatToWatch=[sourceText.split('\n')[0]]]){
    const r=draft();mutate(r);assert.throws(()=>normalizeBenchmarkSummary(r,a));}
});
test('one whole-article review includes every exact unit and full unchanged source; no writer ledger',()=>{
  const a=plan().articles[0],s=normalizeBenchmarkSummary(draft(),a),view=benchmarkReviewView(s,a);
  assert.deepEqual(view.data.units,s.units);assert.deepEqual(view.data.passages,a.passages);assert.ok(!('facts' in view.data));
  assert.equal(s.units[0].section,'headline');assert.equal(validateBenchmarkReview(reply(view.data),s,a).eligibleForIndependentReview,true);
  for(const mutate of [r=>r.judgments.shift(),r=>r.judgments.reverse(),r=>r.judgments[1].unitId='U0',r=>r.draftSha256='0'.repeat(64),
    r=>r.judgments[0].passageIds=['P999'],r=>r.judgments[0].passageIds=[],r=>r.quality.useful='true']){
    const r=reply(view.data);mutate(r);assert.throws(()=>validateBenchmarkReview(r,s,a));}
  for(const mutate of [r=>r.judgments[0].supported=false,r=>r.quality.useful=false,r=>r.quality.faithful=false,
    r=>r.quality.readable=false,r=>r.quality.issues=['The second clause adds unsupported advice.']]){
    const r=reply(view.data);mutate(r);assert.equal(validateBenchmarkReview(r,s,a).eligibleForIndependentReview,false);}
  assert.equal(benchmarkWriterView(a).prompt,benchmarkWriterView(plan().articles[1]).prompt);
});
test('publisher attribution accepts the reviewed news name, not an arbitrary identity or substring',()=>{
  const p=packet();p.articles[0].url='https://news.mit.edu/2026/synthetic';p.articles[0].publisherKey='mit';
  const a=prepareBenchmark(...encode(p)).articles[0];
  assert.equal(a.publisher,'MIT News — Artificial Intelligence');
  for(const name of ['MIT News','MIT News — Artificial Intelligence']) {
    const r=draft();r.whatHappened[0]=r.whatHappened[0].replace('GitHub',name);
    assert.doesNotThrow(()=>normalizeBenchmarkSummary(r,a));
  }
  for(const name of ['MIT','MIT Newsletter','Someone','GitHub']) {
    const r=draft();r.whatHappened[0]=r.whatHappened[0].replace('GitHub',name);
    assert.throws(()=>normalizeBenchmarkSummary(r,a),/ATTRIBUTION/);
  }
  const r=draft();r.whatHappened[0]=r.whatHappened[0].replace('GitHub','MIT News');
  assert.throws(()=>normalizeBenchmarkSummary(r,plan().articles[0]),/ATTRIBUTION/);
});
test('private facts preserve numeric version comparisons without admitting markup or invalid anchors',()=>{
  const a=plan().articles[0];
  for(const op of ['<','<=','>','>=']) {
    const r=draft();r.facts[0].text=`Affected versions ${op}4.2.3.`;
    const normalized=normalizeBenchmarkSummary(r,a);
    assert.equal(normalized.raw.facts[0].text,r.facts[0].text);
  }
  for(const value of ['<script>alert(1)</script>','<img src=x>','Version <unknown.', 'Bad “whatHappened”: text.']) {
    const r=draft();r.facts[0].text=value;assert.throws(()=>normalizeBenchmarkSummary(r,a),/FACT_ANCHOR/);
  }
  const r=draft();r.facts[0].text='Versions <4.2.3.';r.facts[0].passageIds=['P999'];
  assert.throws(()=>normalizeBenchmarkSummary(r,a),/FACT_ANCHOR/);
  const visible=draft();visible.whatToWatch=['Versions <4.2.3.'];
  assert.throws(()=>normalizeBenchmarkSummary(visible,a),/DRAFT_PROSE/);
});
test('candidate clause reviewer preserves all text and cannot hide an unsupported later claim',()=>{
  const a=plan().articles[0], d=draft();
  d.whyItMatters=['The fictional service has conditions, and an added benefit is claimed.'];
  const s=normalizeBenchmarkSummary(d,a), view=benchmarkClauseReviewView(s,a);
  assert.deepEqual(view.data.passages,a.passages);assert.deepEqual(view.data.units,s.units);
  assert.ok(!('facts' in view.data));assert.equal(view.data.draftSha256,s.draftSha256);
  const answer=()=>({draftSha256:s.draftSha256,judgments:s.units.map(u=>({unitId:u.id,
    claims:[{text:u.text,supported:true,passageIds:['P1'],reason:'Synthetic coverage fixture, not factual approval.'}]})),
    quality:{readable:true,useful:true,faithful:true,issues:[]}});
  const good=validateBenchmarkClauseReview(answer(),s,a);
  assert.equal(good.eligibleForIndependentReview,true);assert.equal(good.semanticApproval,false);
  const r=answer();r.judgments[2].claims=[
    {text:'The fictional service has conditions, ',supported:true,passageIds:['P1'],reason:'Supported part of synthetic fixture.'},
    {text:'and an added benefit is claimed.',supported:false,passageIds:[],reason:'No source establishes the asserted benefit.'}];
  assert.equal(validateBenchmarkClauseReview(r,s,a).eligibleForIndependentReview,false);
  for(const mutate of [x=>x.judgments[2].claims.pop(),x=>x.judgments[2].claims.reverse(),
    x=>x.judgments[2].claims[1].text='and a different benefit is claimed.',
    x=>x.judgments[2].claims[0].text=x.judgments[2].claims[0].text.trim(),
    x=>x.judgments[2].claims[0].passageIds=['P999'],x=>x.judgments[2].claims[0].passageIds=[],
    x=>x.judgments[2].claims[1].text=' ',x=>x.judgments[2].supported=true,
    x=>x.judgments[1].unitId='U0',x=>x.draftSha256='0'.repeat(64),x=>x.quality.faithful='true']) {
    const bad=structuredClone(r);mutate(bad);assert.throws(()=>validateBenchmarkClauseReview(bad,s,a));
  }
  for(const mutate of [x=>x.quality.faithful=false,x=>x.quality.useful=false,x=>x.quality.readable=false,
    x=>x.quality.issues=['An issue remains.']]) {
    const bad=answer();mutate(bad);assert.equal(validateBenchmarkClauseReview(bad,s,a).eligibleForIndependentReview,false);
  }
  // The v1 answer cannot qualify as v2 merely because the overall labels pass.
  assert.throws(()=>validateBenchmarkClauseReview(reply(s),s,a));
});
test('saved-review mode binds six exact drafts to the corpus and never requests a writer',async()=>{
  const p=plan(), packet={version:1,packetSha256:p.packetSha256,originalRunId:'123456',drafts:p.articles.slice(0,6).map(a=>{
    const s=normalizeBenchmarkSummary(draft(),a);return {id:a.id,raw:s.raw,draftSha256:s.draftSha256};})};
  const replay=prepareBenchmarkReplay(...encode(packet),p);
  for(const mutate of [x=>x.drafts.pop(),x=>x.drafts[1].id=x.drafts[0].id,x=>x.drafts[0].id='A99',
    x=>x.packetSha256='0'.repeat(64),x=>x.drafts[0].draftSha256='0'.repeat(64),x=>x.originalRunId='wrong',
    x=>x.drafts[0].expectedAnswer=true]) {
    const bad=structuredClone(packet);mutate(bad);assert.throws(()=>prepareBenchmarkReplay(...encode(bad),p));
  }
  const saved=[];let calls=0;
  const report=await runBenchmark({plan:p,replay,publicKey,accountId:'0'.repeat(32),apiToken:'TEST_ONLY',
    save:async(id,sealed)=>saved.push({id,data:openDiagnostic(sealed,pair.privateKey)}),fetchImpl:async(url,init)=>{
      calls++;const b=JSON.parse(init.body),d=JSON.parse(b.messages[1].content);assert.ok(d.units);assert.ok(!d.facts);
      assert.equal(b.max_tokens,4800);
      const answer={draftSha256:d.draftSha256,judgments:d.units.map(u=>({unitId:u.id,
        claims:[{text:u.text,supported:true,passageIds:['P1'],reason:'Synthetic control only.'}]})),
        quality:{readable:true,useful:true,faithful:true,issues:[]}};
      return new Response(JSON.stringify({success:true,result:{response:JSON.stringify(answer)}}),{headers:{'content-type':'application/json'}});
    }});
  assert.equal(calls,6);assert.equal(report.requests,6);assert.equal(report.networkRequests,6);
  assert.equal(report.requestedOutputTokens,28800);assert.equal(report.results.length,6);assert.equal(report.mode,'saved-claim-review');
  assert.equal(report.productionApproved,false);assert.equal(report.emailSent,false);
  assert.ok(saved.every(x=>!x.id.includes('writer')));assert.equal(saved.length,12);
  for(const row of saved.filter(x=>/^A\d+$/.test(x.id))) {
    assert.equal(row.data.replay.sha256,replay.sha256);assert.equal(row.data.replay.originalRunId,'123456');
    assert.deepEqual(row.data.summary.raw,packet.drafts.find(d=>d.id===row.id).raw);
  }
  await assert.rejects(runBenchmark({plan:p,replay:{...replay},publicKey,save:async()=>{}}),/REPLAY_PACKET/);
  let refused=0;
  const stopped=await runBenchmark({plan:p,replay,publicKey,accountId:'0'.repeat(32),apiToken:'TEST_ONLY',save:async()=>{},
    fetchImpl:async()=>{refused++;return new Response('{"success":false}',{status:429});}});
  assert.equal(refused,1);assert.equal(stopped.results.length,6);
  assert.equal(stopped.results.filter(r=>r.status==='not-attempted-provider-blocker').length,5);
});
async function execute(mode){const p=plan(),saved=[],requests=[];
  const report=await runBenchmark({plan:p,publicKey,accountId:'0'.repeat(32),apiToken:'TEST_TOKEN_NEVER_LOG',
    save:async(id,sealed)=>saved.push({id,capture:openDiagnostic(sealed,pair.privateKey)}),
    fetchImpl:async(url,init)=>{
      requests.push({url,init});const i=requests.length-1,body=JSON.parse(init.body),d=JSON.parse(body.messages[1].content);
      assert.equal(init.redirect,'error');assert.equal(body.reasoning_effort,'medium');
      if(mode==='quota'&&i===1)return new Response(JSON.stringify({success:false,errors:[{code:3036,message:'PRIVATE QUOTA DETAILS'}]}),{status:429});
      let payload=d.units?reply(d):draft();
      if(mode==='bad-draft'&&i===0)payload=draft(109);
      if(mode==='hold'&&i===1)payload.judgments[0].supported=false;
      if(mode==='oversized'&&i===0)payload={unexpected:'x'.repeat(55000)};
      if(mode==='compact-number'&&i===0)return new Response('{"success":true,"result":{"response":"'+
        '{\\"unexpected\\":['+Array(12000).fill('1e20').join(',')+']}"}}',{headers:{'content-type':'application/json'}});
      if(mode==='usage-expansion'&&i===0)return new Response('{"success":true,"result":{"response":'+JSON.stringify(JSON.stringify(payload))+
        ',"usage":{"large":['+Array(12000).fill('1e20').join(',')+']}}}',{headers:{'content-type':'application/json'}});
      if(mode==='truncated'&&i===0)return new Response(JSON.stringify({success:true,result:{choices:[{message:{content:'unfinished'},finish_reason:'length'}]}}),
        {headers:{'content-type':'application/json'}});
      return new Response(JSON.stringify({success:true,result:{response:JSON.stringify(payload)}}),{status:200,headers:{'content-type':'application/json'}});
    }});
  return {report,saved,requests};
}
test('ten encrypted independent records, exactly twenty requests, no retries or email',async()=>{
  const {report,saved,requests}=await execute();assert.equal(report.requests,20);assert.equal(report.networkRequests,20);
  assert.equal(report.requestedOutputTokens,80000);assert.equal(saved.length,30);assert.equal(requests.length,20);
  assert.equal(report.productionApproved,false);assert.equal(report.emailSent,false);
  for(const {capture}of saved.filter(x=>/^A\d+$/.test(x.id))){assert.equal(capture.calls.length,2);assert.equal(capture.independentReview,'required');
    assert.equal(capture.calls[0].requestSha256.length,64);assert.equal(capture.calls[1].responseSha256.length,64);
    assert.equal(capture.article.sourceText,sourceText);}
  assert.doesNotMatch(JSON.stringify(report),/TEST_TOKEN|word100|Synthetic passage/);
});
test('provider refusal stops the entire batch without consuming later article allowance',async()=>{
  const {report,saved,requests}=await execute('quota');assert.equal(requests.length,2);assert.equal(saved.length,3);
  assert.equal(report.stoppedOnProviderBlocker,true);assert.equal(report.results.length,10);
  assert.equal(report.results.filter(r=>r.status==='not-attempted-provider-blocker').length,9);
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE QUOTA/);
});
test('bad articles stay in the denominator and review holds cannot become automatic passes',async()=>{
  const bad=await execute('bad-draft');assert.equal(bad.report.results[0].code,'BENCHMARK_DRAFT_LENGTH');assert.equal(bad.requests.length,19);
  const held=await execute('hold');assert.equal(held.report.results[0].status,'held-by-review');assert.equal(held.report.results.length,10);
});
test('a rejected 55 KB answer is encrypted before the validation size cap',async()=>{
  const result=await execute('oversized');
  assert.equal(result.report.results[0].code,'BENCHMARK_RESPONSE_SIZE');
  const native=JSON.parse(Buffer.from(result.saved.find(x=>x.id==='A01-writer').capture.nativeResponseBase64,'base64').toString());
  assert.equal(JSON.parse(native.result.response).unexpected.length,55000);
  assert.equal(result.report.results.length,10);
});
test('compact numbers retain exact native bytes without oversized reserialization',async()=>{
  const result=await execute('compact-number'),call=result.saved.find(x=>x.id==='A01-writer').capture;
  const bytes=Buffer.from(call.nativeResponseBase64,'base64');assert.ok(bytes.length<70000);
  assert.equal(sha(bytes),call.nativeResponseSha256);assert.equal(result.report.results[0].code,'BENCHMARK_RESPONSE_SIZE');
});
test('native usage is retained once and storage failure stops later paid-resource access',async()=>{
  const r=await execute('usage-expansion');assert.equal(r.report.requests,20);
  const call=r.saved.find(x=>x.id==='A01-writer').capture;assert.equal(Object.hasOwn(call,'usage'),false);
  let requests=0;const progress=[];
  const failure=await runBenchmark({plan:plan(),publicKey,accountId:'0'.repeat(32),apiToken:'TEST_TOKEN',
    save:async()=>{throw Error('disk failure');},onProgress:r=>progress.push(r),
    fetchImpl:async()=>{requests++;return new Response(JSON.stringify({success:true,result:{response:JSON.stringify(draft())}}),{headers:{'content-type':'application/json'}});}});
  assert.equal(requests,1);assert.equal(failure.stoppedOnEvidenceBlocker,true);assert.equal(progress.length,1);
  assert.equal(progress[0].code,'BENCHMARK_EVIDENCE_STORAGE');assert.equal(failure.results.length,10);
});
test('truncated model output holds that article but does not mislabel it a quota blocker',async()=>{
  const result=await execute('truncated');assert.equal(result.report.results[0].code,'BENCHMARK_PROVIDER_FORMAT');
  assert.equal(result.report.stoppedOnProviderBlocker,false);assert.equal(result.report.requests,19);
  const call=result.saved.find(x=>x.id==='A01-writer').capture;
  assert.equal(call.inference.responseSha256,call.nativeResponseSha256);assert.equal(call.failure.formatReason,'OUTPUT_TOKEN_LIMIT');
});
test('maximum Unicode source and bounded call evidence fit individual encryption envelopes',async()=>{
  const p=packet();p.articles[0].sourceText=Array(30).fill('界'.repeat(590)).join('\n');p.articles[0].sourceSha256=sha(p.articles[0].sourceText);
  const big=prepareBenchmark(...encode(p));let bytes=0;
  // Deliberately invalid large JSON still must be preserved, never approved.
  const report=await runBenchmark({plan:big,publicKey,accountId:'0'.repeat(32),apiToken:'TEST_TOKEN',
    save:async(id,sealed)=>{const opened=openDiagnostic(sealed,pair.privateKey);bytes=Math.max(bytes,Buffer.byteLength(JSON.stringify(opened)));},
    fetchImpl:async()=>new Response(JSON.stringify({success:true,result:{response:JSON.stringify({unexpected:'界'.repeat(18000)})}}),
      {headers:{'content-type':'application/json'}})});
  assert.ok(bytes<350000);assert.equal(report.results.length,10);assert.equal(report.requests,10);
  assert.ok(report.results.every(r=>r.code==='BENCHMARK_RESPONSE_SIZE'));
});
test('authority is owner initiated main first attempt and exact revision; workflow has no send capability',async()=>{
  const env={GITHUB_REPOSITORY:'itworksinprod/first-fold',GITHUB_ACTOR:'itworksinprod',GITHUB_REF:'refs/heads/main',
    GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_WORKFLOW_REF:'itworksinprod/first-fold/.github/workflows/article-benchmark.yml@refs/heads/main',
    GITHUB_SHA:'1'.repeat(40),BENCHMARK_REVISION:'1'.repeat(40)};
  assert.doesNotThrow(()=>assertBenchmarkAuthority(env));for(const k of Object.keys(env))assert.throws(()=>assertBenchmarkAuthority({...env,[k]:'wrong'}));
  const yml=await readFile(new URL('../.github/workflows/article-benchmark.yml',import.meta.url),'utf8');
  assert.doesNotMatch(yml,/RESEND|OPENAI_API_KEY|schedule:|pull_request_target|contents: write/);
  assert.match(yml,/persist-credentials: false/);assert.match(yml,/retention-days: 1/);
});
