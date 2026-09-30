import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {prepareFullArticleSentenceReview,runFullArticleSentenceReview,assertFullArticleSentenceAuthority,assertFullArticleSentenceTarget,FULL_ARTICLE_SENTENCE_LIMITS,FULL_ARTICLE_SENTENCE_PACKET_SHA256} from '../scripts/automation/full-article-sentence-review.mjs';
import {buildSourceSentenceReview} from '../scripts/automation/experiments/source-sentence-review.mjs';
import {prepareFullArticleReview as prepareLegacy} from '../scripts/automation/full-article-span-review.mjs';
import {buildWorkersAiRequest,requestWorkersAiEditorial,workersAiRunUrl,FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const keys=generateKeyPairSync('rsa',{modulusLength:3072}),publicKey=keys.publicKey.export({type:'spki',format:'der'}).toString('base64');
function fixture(){
  const excerpt='This invented fixture describes a service policy change with constraints and exceptions. It does not represent a real report or qualification.\nOperators must check the documented service scope before acting on any account notice.';
  const units={headline:['A fictional platform changes its operating policy'],
    whatHappened:['GitHub describes a fictional policy change affecting teams that operate this example service, with the documented scope remaining essential to interpreting the notice.',
      'This separate synthetic sentence exists solely for testing complete coverage across every retained unit without qualifying actual news for readers or a delivery pipeline.'],
    whyItMatters:['The example describes constraints on a made up workflow that are included here only to exercise the inherited lower body word limit faithfully.',
      'Additional fixture language remains synthetic throughout this review so successful injected labels never constitute evidence of model quality or real world factual accuracy.'],
    whatToWatch:['The publisher directs readers toward its written instructions before taking any practical action based on the hypothetical service change described in this fixture.',
      'Check the original account for the relevant scope before relying on an experimental summary whose generated review is still awaiting separate independent human judgment.']};
  const draft=Object.fromEntries(Object.entries(units).map(([k,v])=>[k,v.join(' ')]));
  return {version:1,originalCaptureSha256:'a'.repeat(64),source:{version:1,url:'https://github.blog/changelog/synthetic-fixture/',publisherKey:'microsoft',excerpt,excerptSha256:sha(excerpt)},draft,units,draftSha256:sha(JSON.stringify(draft))};
}
const encode=p=>{const raw=JSON.stringify(p);return [gzipSync(raw).toString('base64'),sha(raw)];};
const prepare=(p=fixture())=>prepareFullArticleSentenceReview(...encode(p));
const reply=view=>({reviewSha256:view.data.reviewSha256,judgments:view.data.spans.map(s=>({spanId:s.spanId,verdict:'supported',
  explanation:'Injected fixture label tests mechanics only.',evidence:[{sentenceId:view.data.catalog[0].sentenceId}]}))});
async function run(failure,at=0,encrypted=false){
  const plan=prepare(),accountId='0'.repeat(32),requests=[],network=[],late=[];
  const result=await runFullArticleSentenceReview({plan,publicKey,accountId,apiToken:'PRIVATE_TEST_TOKEN',...(encrypted?{}:{sealImpl:x=>x}),
    aiRequestImpl:async options=>{
      const i=requests.length;requests.push(options);late.push(options.fetchImpl);
      assert.equal(options.model,FREE_REASONING_WRITER_MODEL);assert.equal(options.maxTokens,4800);assert.equal(options.timeoutMs,90000);assert.equal(options.maxAttempts,1);
      assert.doesNotMatch(options.messages[1].content,/expectedVerdicts|draftSha256|originalCaptureSha256|FULL_ARTICLE/);
      const {body}=buildWorkersAiRequest(options),url=workersAiRunUrl(accountId,options.model),init={method:'POST',redirect:'error',body:JSON.stringify(body)};
      if(i===at&&failure==='no-network')return {};
      if(i===at&&['url','method','body','redirect'].includes(failure)){
        const bad={...init};if(failure==='method')bad.method='GET';if(failure==='body')bad.body='{}';if(failure==='redirect')bad.redirect='follow';
        try{await options.fetchImpl(failure==='url'?'https://unapproved.invalid/':url,bad);}catch{/* sticky */}
      }
      const answer=await requestWorkersAiEditorial(options);
      if(i===at){
        if(failure==='retry')try{await options.fetchImpl(url,init);}catch{/* sticky */}
        if(failure==='hash')answer.requestSha256='0'.repeat(64);if(failure==='provider')answer.provider='wrong';
        if(failure==='model')answer.model='wrong';if(failure==='attempt')answer.attemptCount=2;if(failure==='response-hash')answer.responseSha256='bad';
        if(failure==='accessor')Object.defineProperty(answer,'editorialPayload',{get(){assert.fail('Getter executed');},enumerable:true});
      }
      return answer;
    },fetchImpl:async()=>{
      const i=network.length;network.push(1);
      if(i===at&&failure==='quota')return new Response(JSON.stringify({success:false,errors:[{code:3036,message:'PRIVATE_DETAIL'}]}),{status:429});
      if(i===at&&failure==='transport')throw new Error('PRIVATE_TRANSPORT_DETAIL');
      const payload=reply(plan.items[i].view);
      if(i===at&&['unsupported','uncertain'].includes(failure))payload.judgments[0].verdict=failure;
      if(failure==='all-rejected')payload.judgments.forEach(j=>j.verdict='unsupported');
      if(i===at){
        if(failure==='missing')payload.judgments.pop();if(failure==='quote')payload.judgments[0].evidence[0].quote='Fabricated quotation';
        if(failure==='sentence-id')payload.judgments[0].evidence[0].sentenceId='S1P1S999';
        if(failure==='review-hash')payload.reviewSha256='0'.repeat(64);if(failure==='extra')payload.extra='PRIVATE_REJECTED_PROSE';
      }
      const response=i===at&&failure==='truncation'?{choices:[{index:0,message:{role:'assistant',content:JSON.stringify(payload)},finish_reason:'length'}]}:{response:JSON.stringify(payload)};
      return new Response(JSON.stringify({success:true,result:response}),{headers:{'content-type':'application/json'}});
    }});
  assert.ok(requests.length<=7);assert.ok(network.length<=7);assert.equal(result.report.outputBudget,requests.length*4800);
  assert.equal(result.report.articleApproved,false);assert.equal(result.report.publicationReady,false);assert.equal(result.report.emailSent,false);
  for(const fn of late)await assert.rejects(fn('https://unapproved.invalid/',{}),/FULL_ARTICLE_SENTENCE_NETWORK/);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_TEST_TOKEN/);assert.doesNotMatch(JSON.stringify(result.report),/PRIVATE_/);
  return {result,requests,plan};
}
test('all seven units including headline use the versioned sentence contract and complete evidence',async()=>{
  const {result,plan,requests}=await run();assert.equal(result.report.status,'review-complete-awaiting-independent-review');
  assert.equal(result.report.unitsCompleted,7);assert.equal(result.report.sourceGatePassed,true);assert.equal(result.report.articleApproved,false);
  assert.deepEqual(FULL_ARTICLE_SENTENCE_LIMITS,{requests:7,tokensPerRequest:4800,outputTokens:33600,timeoutMs:90000});
  assert.equal(result.report.writerRequests,0);assert.equal(result.report.searchQueries,0);
  assert.deepEqual(result.sealed.packet,fixture());
  const legacy=prepareLegacy(...encode(fixture()));
  assert.deepEqual(plan.summary,legacy.summary);
  assert.deepEqual(plan.packet,legacy.packet);
  assert.equal(result.sealed.evidenceContract,'exact-source-sentence-catalog-v1');
  for(const [i,item]of plan.items.entries()){
    assert.deepEqual(item.view.data.spans,legacy.items[i].view.data.spans);
    assert.deepEqual(item.view.data.passages,legacy.items[i].view.data.passages);
    const view=buildSourceSentenceReview({text:plan.summary.units[item.field][item.index],sources:[{publisher:'GitHub',passages:fixture().source.excerpt.split('\n').map((text,n)=>({evidenceId:`S1P${n+1}`,text}))}]});
    assert.deepEqual(view,item.view);assert.equal(requests[i].messages[0].content,`${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`);
    assert.deepEqual(JSON.parse(requests[i].messages[1].content),view.data);
    assert.equal(result.sealed.calls[i].unitId,`U${i+1}`);
    assert.deepEqual(result.sealed.calls[i].response,result.sealed.calls[i].verdict.rawSelection);
    assert.ok(!Object.hasOwn(result.sealed.calls[i].response.judgments[0].evidence[0],'quote'));
    assert.equal(result.sealed.calls[i].verdict.quotedPayload.judgments[0].evidence[0].quote,item.view.data.catalog[0].text);
  }
});
for(const failure of ['unsupported','uncertain','all-rejected'])test(`${failure} is retained without rewrite; coverage continues but article is not approved`,async()=>{
  const {result}=await run(failure);assert.equal(result.report.unitsCompleted,7);assert.equal(result.report.sourceGatePassed,false);
  assert.equal(result.report.status,'review-complete-awaiting-independent-review');
});
for(const failure of ['quota','transport','no-network','url','method','body','redirect','retry','hash','provider','model','attempt','response-hash','accessor','truncation','missing','quote','sentence-id','review-hash','extra']){
  test(`${failure} stops without a retry or false completion`,async()=>{const {result,requests}=await run(failure,2);
    assert.equal(result.report.status,'failed');assert.equal(result.report.sourceGatePassed,false);assert.equal(result.report.unitsCompleted,2);assert.equal(requests.length,3);
  });
}
test('an encrypted capture preserves all exact text and rejected parsed output without public disclosure',async()=>{
  const {result}=await run('extra',1,true);assert.doesNotMatch(JSON.stringify(result.sealed),/fictional|PRIVATE_REJECTED/);
  const c=openDiagnostic(result.sealed,keys.privateKey);assert.deepEqual(c.packet,fixture());assert.equal(c.calls[1].response.extra,'PRIVATE_REJECTED_PROSE');
  assert.equal(c.independentReview,'required-not-performed-by-this-workflow');
});
test('codec rejects unbound text, missing units, reordered fields, extra prose and changed evidence',()=>{
  const [encoded,hash]=encode(fixture());assert.throws(()=>prepareFullArticleSentenceReview(encoded,'0'.repeat(64)),/FULL_ARTICLE_SENTENCE_HASH/);
  for(const v of ['',null,{},encoded+'\n','x'.repeat(24001),'AAAA'])assert.throws(()=>prepareFullArticleSentenceReview(v,hash));
  assert.throws(()=>prepareFullArticleSentenceReview(gzipSync('x'.repeat(20001)).toString('base64'),hash),/FULL_ARTICLE_SENTENCE_PACKET/);
  for(const change of [p=>{p.extra=1;},p=>{p.originalCaptureSha256=[];},p=>{p.draft.headline='Changed';},p=>{p.draftSha256='0'.repeat(64);},
    p=>{p.units.whyItMatters.pop();},p=>{p.units.headline.push('Hidden title');},p=>{p.units.extra=['Hidden prose'];},p=>{p.units.whatHappened[0]='Fragment';},
    p=>{p.source.excerpt+='Changed';},p=>{p.source.publisherKey='mit';},p=>{p.draft={whatHappened:p.draft.whatHappened,...p.draft};}
  ]){const p=fixture();change(p);assert.throws(()=>prepare(p));}
  const p=fixture();p.units.whatToWatch.pop();p.draft.whatToWatch=p.units.whatToWatch.join(' ');p.draftSha256=sha(JSON.stringify(p.draft));assert.throws(()=>prepare(p),/FULL_ARTICLE_SENTENCE_COUNT/);
});
test('fixed target and issued frozen plans block fixture substitution or mutation before network',async()=>{
  const plan=prepare();assert.throws(()=>assertFullArticleSentenceTarget(plan),/FULL_ARTICLE_SENTENCE_TARGET/);
  assert.throws(()=>assertFullArticleSentenceTarget({...plan,packetSha256:FULL_ARTICLE_SENTENCE_PACKET_SHA256}),/FULL_ARTICLE_SENTENCE_TARGET/);
  assert.throws(()=>{plan.packet.draft.headline='Changed';});let calls=0;
  await assert.rejects(runFullArticleSentenceReview({plan:structuredClone(plan),publicKey,aiRequestImpl:()=>{calls++;}}),/FULL_ARTICLE_SENTENCE_PLAN/);
  await assert.rejects(runFullArticleSentenceReview({plan,publicKey:'bad',aiRequestImpl:()=>{calls++;}}));assert.equal(calls,0);
});
test('manual owner/main/first-attempt restriction and isolated workflow never expose delivery secrets',async()=>{
  const env={GITHUB_REPOSITORY:'itworksinprod/first-fold',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'itworksinprod/first-fold/.github/workflows/full-article-sentence-review.yml@refs/heads/main',GITHUB_ACTOR:'itworksinprod',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1'};
  assert.doesNotThrow(()=>assertFullArticleSentenceAuthority(env));for(const k of Object.keys(env))assert.throws(()=>assertFullArticleSentenceAuthority({...env,[k]:'wrong'}));
  const y=await readFile(new URL('../.github/workflows/full-article-sentence-review.yml',import.meta.url),'utf8');
  assert.doesNotMatch(y,/schedule:|pull_request:|RESEND|OPENAI|contents: write|packet_sha256:/);
  assert.match(y,/timeout-minutes: 15/);assert.match(y,/cancel-in-progress: false/);assert.match(y,/persist-credentials: false/);assert.match(y,/retention-days: 1/);
  assert.deepEqual([...new Set([...y.matchAll(/secrets\.(\w+)/g)].map(m=>m[1]))],['FIRST_FOLD_FULL_ARTICLE_SPAN_B64','CLOUDFLARE_AI_API_TOKEN']);
  const src=await readFile(new URL('../scripts/automation/full-article-sentence-review.mjs',import.meta.url),'utf8');
  assert.match(src,/prepareFullArticleSentenceReview\(process.env.FIRST_FOLD_FULL_ARTICLE_SPAN_B64,FULL_ARTICLE_SENTENCE_PACKET_SHA256\);assertFullArticleSentenceTarget\(plan\);/);
});
