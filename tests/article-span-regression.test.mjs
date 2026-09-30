import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {prepareArticleSpanRegression,runArticleSpanRegression,assertArticleSpanAuthority,assertArticleSpanTarget,
  ARTICLE_SPAN_EXPECTED,ARTICLE_SPAN_LIMITS,ARTICLE_SPAN_PACKET_SHA256} from '../scripts/automation/article-span-regression.mjs';
import {buildSpanSourceReview} from '../scripts/automation/experiments/span-source-review.mjs';
import {buildWorkersAiRequest,requestWorkersAiEditorial,workersAiRunUrl,FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const keys=generateKeyPairSync('rsa',{modulusLength:3072}),publicKey=keys.publicKey.export({type:'spki',format:'der'}).toString('base64');
const fixture={version:1,originalCaptureSha256:'a'.repeat(64),input:{
  text:'The station rejects readings, ensuring every stored measurement is accurate and always safe.',
  sources:[{publisher:'Fictional source',passages:[{evidenceId:'S1P1',text:'The station rejects readings outside its configured range.'}]}]}};
const encode=p=>{const raw=JSON.stringify(p);return {encoded:gzipSync(raw).toString('base64'),hash:sha(raw)};};
const prepare=(p=fixture)=>{const {encoded,hash}=encode(p);return prepareArticleSpanRegression(encoded,hash);};
const reply=view=>({reviewSha256:view.data.reviewSha256,judgments:view.data.spans.map((s,i)=>({spanId:s.spanId,verdict:ARTICLE_SPAN_EXPECTED[i],
  explanation:'Synthetic injected labels test mechanics, not model quality.',evidence:i?[]:[{evidenceId:'S1P1',quote:view.data.passages[0].text}]}))});
async function run(failure,encrypted=false){
  const plan=prepare(),accountId='0'.repeat(32),requests=[],network=[],late=[];
  const result=await runArticleSpanRegression({plan,publicKey,accountId,apiToken:'PRIVATE_TEST_TOKEN',...(encrypted?{}:{sealImpl:x=>x}),
    aiRequestImpl:async options=>{
      requests.push(options);late.push(options.fetchImpl);
      assert.equal(options.model,FREE_REASONING_WRITER_MODEL);assert.equal(options.maxTokens,4800);assert.equal(options.timeoutMs,90000);assert.equal(options.maxAttempts,1);
      assert.doesNotMatch(options.messages[1].content,/expectedVerdicts|originalCaptureSha256|ARTICLE_SPAN|rationale/);
      const {body}=buildWorkersAiRequest(options),url=workersAiRunUrl(accountId,options.model),init={method:'POST',redirect:'error',body:JSON.stringify(body)};
      if(failure==='no-network')return {};
      if(['url','method','body','redirect'].includes(failure)){
        const bad={...init};if(failure==='method')bad.method='GET';if(failure==='body')bad.body='{}';if(failure==='redirect')bad.redirect='follow';
        try{await options.fetchImpl(failure==='url'?'https://unapproved.invalid/':url,bad);}catch{/* sticky */}
      }
      const answer=await requestWorkersAiEditorial(options);
      if(failure==='retry')try{await options.fetchImpl(url,init);}catch{/* sticky */}
      if(failure==='hash')answer.requestSha256='0'.repeat(64);
      if(failure==='provider')answer.provider='wrong';if(failure==='model')answer.model='wrong';
      if(failure==='attempt')answer.attemptCount=2;if(failure==='response-hash')answer.responseSha256='bad';
      if(failure==='accessor')Object.defineProperty(answer,'editorialPayload',{get(){assert.fail('Getter executed');},enumerable:true});
      return answer;
    },fetchImpl:async()=>{
      network.push(1);
      if(failure==='quota')return new Response(JSON.stringify({success:false,errors:[{code:3036,message:'PRIVATE_PROVIDER_DETAIL'}]}),{status:429});
      if(failure==='transport')throw new Error('PRIVATE_TRANSPORT_DETAIL');
      const payload=reply(plan.view);
      if(failure==='all-supported')payload.judgments.forEach(j=>{j.verdict='supported';j.evidence=[{evidenceId:'S1P1',quote:plan.view.data.passages[0].text}];});
      if(failure==='all-rejected')payload.judgments.forEach(j=>j.verdict='unsupported');
      if(failure==='uncertain')payload.judgments[1].verdict='uncertain';
      if(failure==='skip')payload.judgments.pop();if(failure==='quote')payload.judgments[0].evidence[0].quote='Fabricated quotation';
      const response=failure==='truncation'?{choices:[{index:0,message:{role:'assistant',content:JSON.stringify(payload)},finish_reason:'length'}]}:{response:JSON.stringify(payload)};
      return new Response(JSON.stringify({success:true,result:response}),{headers:{'content-type':'application/json'}});
    }});
  assert.equal(requests.length,1);assert.ok(network.length<=1);assert.equal(result.report.outputBudget,4800);
  for(const fn of late)await assert.rejects(fn('https://unapproved.invalid/',{}),/ARTICLE_SPAN_NETWORK/);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_TEST_TOKEN/);assert.doesNotMatch(JSON.stringify(result.report),/PRIVATE_/);
  return {result,requests,plan};
}
test('one review requires the exact supported/unsupported/unsupported vector and awaits independent review',async()=>{
  const {result,requests,plan}=await run();
  assert.equal(result.report.status,'regression-passed-awaiting-independent-review');assert.equal(result.report.sentenceHeld,true);
  assert.equal(result.report.writerRequests,0);assert.equal(result.report.searchQueries,0);assert.equal(result.report.emailSent,false);
  const frozen=buildSpanSourceReview(fixture.input);
  assert.deepEqual(plan.view,frozen);assert.deepEqual(JSON.parse(requests[0].messages[1].content),frozen.data);
  assert.equal(requests[0].messages[0].content,`${frozen.prompt}\nJSON schema: ${JSON.stringify(frozen.schema)}`);
  assert.deepEqual(ARTICLE_SPAN_LIMITS,{requests:1,tokensPerRequest:4800,outputTokens:4800,timeoutMs:90000});
});
for(const failure of ['quota','transport','no-network','url','method','body','redirect','retry','hash','provider','model','attempt','response-hash','accessor','truncation','skip','quote','all-supported','all-rejected','uncertain']){
  test(`${failure} cannot pass or trigger another attempt`,async()=>{
    const {result}=await run(failure);assert.equal(result.report.status,'failed');
  });
}
test('encrypted-only capture retains exact input and parsed verdict for local audit',async()=>{
  const {result,plan}=await run(undefined,true);assert.doesNotMatch(JSON.stringify(result.sealed),/Fictional|ensuring/);
  const c=openDiagnostic(result.sealed,keys.privateKey);assert.deepEqual(c.input,fixture.input);assert.deepEqual(c.calls[0].response,reply(plan.view));
  assert.deepEqual(c.expectedVerdicts,['supported','unsupported','unsupported']);assert.equal(c.independentReview,'required-not-performed-by-this-workflow');
});
test('input codec rejects changed hashes, malformed encodings, bombs and extra fields',()=>{
  const {encoded,hash}=encode(fixture);
  assert.throws(()=>prepareArticleSpanRegression(encoded,'0'.repeat(64)),/ARTICLE_SPAN_HASH/);
  for(const value of ['',null,{},encoded+'\n','x'.repeat(24001),'AAAA'])assert.throws(()=>prepareArticleSpanRegression(value,hash));
  assert.throws(()=>prepare({...fixture,extra:1}),/ARTICLE_SPAN_PACKET/);
  assert.throws(()=>prepare({...fixture,originalCaptureSha256:'wrong'}),/ARTICLE_SPAN_PACKET/);
  assert.throws(()=>prepare({...fixture,input:{...fixture.input,text:'One unsegmented sentence.'}}),/ARTICLE_SPAN_COUNT/);
  const bomb=gzipSync('x'.repeat(20001)).toString('base64');assert.throws(()=>prepareArticleSpanRegression(bomb,hash),/ARTICLE_SPAN_PACKET/);
});
test('CLI target pin rejects even structurally valid arbitrary inputs, spoofed plans and mutations',async()=>{
  const plan=prepare();assert.throws(()=>assertArticleSpanTarget(plan),/ARTICLE_SPAN_TARGET/);
  assert.throws(()=>assertArticleSpanTarget({...plan,packetSha256:ARTICLE_SPAN_PACKET_SHA256}),/ARTICLE_SPAN_TARGET/);
  assert.throws(()=>{plan.packet.input.text='changed';});assert.ok(Object.isFrozen(ARTICLE_SPAN_EXPECTED));
  let requests=0;
  await assert.rejects(runArticleSpanRegression({plan:structuredClone(plan),publicKey,aiRequestImpl:()=>{requests++;}}),/ARTICLE_SPAN_PLAN/);
  await assert.rejects(runArticleSpanRegression({plan,publicKey:'bad',aiRequestImpl:()=>{requests++;}}));assert.equal(requests,0);
});
test('only owner main manual first-attempt authority is admitted',()=>{
  const env={GITHUB_REPOSITORY:'itworksinprod/first-fold',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'itworksinprod/first-fold/.github/workflows/article-span-regression.yml@refs/heads/main',GITHUB_ACTOR:'itworksinprod',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1'};
  assert.doesNotThrow(()=>assertArticleSpanAuthority(env));for(const k of Object.keys(env))assert.throws(()=>assertArticleSpanAuthority({...env,[k]:'wrong'}));
});
test('manual workflow has only pinned-input and AI secrets, no writer or delivery access',async()=>{
  const y=await readFile(new URL('../.github/workflows/article-span-regression.yml',import.meta.url),'utf8');
  assert.doesNotMatch(y,/schedule:|pull_request:|RESEND|OPENAI|contents: write|packet_sha256:/);
  assert.match(y,/cancel-in-progress: false/);assert.match(y,/persist-credentials: false/);assert.match(y,/retention-days: 1/);
  assert.deepEqual([...new Set([...y.matchAll(/secrets\.(\w+)/g)].map(m=>m[1]))],['FIRST_FOLD_ARTICLE_SPAN_B64','CLOUDFLARE_AI_API_TOKEN']);
  const src=await readFile(new URL('../scripts/automation/article-span-regression.mjs',import.meta.url),'utf8');
  assert.match(src,/prepareArticleSpanRegression\(process.env.FIRST_FOLD_ARTICLE_SPAN_B64,ARTICLE_SPAN_PACKET_SHA256\)/);
  assert.match(src,/assertArticleSpanTarget\(plan\);\s+if\(command==='run'\)/);
});
