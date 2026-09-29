import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {prepareSpanCalibration,runSpanCalibration,assertSpanCalibrationAuthority,SPAN_CALIBRATION_PIN} from '../scripts/automation/span-source-calibration.mjs';
import {SPAN_SOURCE_CONTROLS as controls} from '../scripts/automation/experiments/span-source-controls.mjs';
import {requestWorkersAiEditorial,buildWorkersAiRequest,workersAiRunUrl,DEFAULT_CLOUDFLARE_AI_MODEL} from '../scripts/automation/free/workers-ai.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
const pair=generateKeyPairSync('rsa',{modulusLength:3072});
const publicKey=pair.publicKey.export({type:'spki',format:'der'}).toString('base64');
const reply=(view,index)=>({reviewSha256:view.data.reviewSha256,judgments:view.data.spans.map((s,i)=>({spanId:s.spanId,
  verdict:controls[index].expectedVerdicts[i],explanation:'Synthetic label injection tests scoring mechanics only.',
  evidence:[{evidenceId:'S1P1',quote:view.data.passages[0].text.split('. ')[0]}]}))});
async function run(failure,at=0,encrypt=false){
  const plan=prepareSpanCalibration(),calls=[],network=[],late=[],accountId='0'.repeat(32);
  const result=await runSpanCalibration({plan,publicKey,accountId,apiToken:'PRIVATE_FIXTURE_TOKEN',...(encrypt?{}:{sealImpl:x=>x}),
    aiRequestImpl:async request=>{
      const index=calls.length;calls.push(request);late.push(request.fetchImpl);
      assert.equal(request.maxTokens,600);assert.equal(request.maxAttempts,1);assert.equal(request.model,DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.doesNotMatch(request.messages[1].content,/expectedVerdicts|expectedSupported|rationale|SC0[1-8]/);
      const {body}=buildWorkersAiRequest(request),url=workersAiRunUrl(accountId,request.model),init={method:'POST',redirect:'error',body:JSON.stringify(body)};
      if(index===at&&failure==='no-network')return {};
      if(index===at&&['url','method','body','redirect'].includes(failure)){
        const bad={...init};if(failure==='method')bad.method='GET';if(failure==='body')bad.body='{}';if(failure==='redirect')bad.redirect='follow';
        try{await request.fetchImpl(failure==='url'?'https://unapproved.invalid/':url,bad);}catch{/* sticky */}
      }
      const answer=await requestWorkersAiEditorial(request);
      if(index===at&&failure==='retry')try{await request.fetchImpl(url,init);}catch{/* sticky */}
      if(index===at&&failure==='hash')answer.requestSha256='0'.repeat(64);
      if(index===at&&failure==='provider')answer.provider='wrong';
      if(index===at&&failure==='model')answer.model='wrong';
      if(index===at&&failure==='attempt')answer.attemptCount=2;
      if(index===at&&failure==='response-hash')answer.responseSha256='bad';
      if(index===at&&failure==='accessor')Object.defineProperty(answer,'editorialPayload',{get(){assert.fail('getter executed');},enumerable:true});
      return answer;
    },fetchImpl:async()=>{
      const index=network.length;network.push(index);
      if(index===at&&failure==='quota')return new Response(JSON.stringify({success:false,errors:[{code:3036,message:'PRIVATE_QUOTA_DETAIL'}]}),{status:429});
      if(index===at&&failure==='transport')throw new Error('PRIVATE_TRANSPORT_DETAIL');
      const payload=reply(plan.views[index],index);
      if(index===at&&failure==='wrong-label')payload.judgments.at(-1).verdict='supported';
      if(index===at&&failure==='uncertain')payload.judgments.at(-1).verdict='uncertain';
      if(index===at&&failure==='skip')payload.judgments.pop();
      if(index===at&&failure==='quote')payload.judgments[0].evidence[0].quote='Fabricated quote';
      const response=index===at&&failure==='truncation'?{choices:[{index:0,message:{role:'assistant',content:JSON.stringify(payload)},finish_reason:'length'}]}:{response:JSON.stringify(payload)};
      return new Response(JSON.stringify({success:true,result:response}),{headers:{'content-type':'application/json'}});
    }});
  for(const fn of late)await assert.rejects(fn('https://unapproved.invalid/',{}),/SPAN_CALIBRATION_NETWORK/);
  assert.ok(network.length<=8);assert.ok(result.report.outputBudget<=4800);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_FIXTURE_TOKEN/);assert.doesNotMatch(JSON.stringify(result.report),/PRIVATE_/);
  return {result,calls,network};
}
test('fixed balanced controls use eight single calls and remain awaiting independent explanation review',async()=>{
  const {result,calls,network}=await run();assert.equal(calls.length,8);assert.equal(network.length,8);
  assert.equal(result.report.outputBudget,4800);assert.equal(result.report.casesPassed,8);
  assert.equal(result.report.status,'controls-passed-awaiting-independent-review');assert.equal(result.report.emailSent,false);
  assert.equal(result.sealed.corpusSha256,SPAN_CALIBRATION_PIN);
});
for(const failure of ['quota','transport','no-network','url','method','body','redirect','retry','hash','provider','model','attempt','response-hash','accessor','skip','quote','truncation']){
  test(`${failure} stops without a retry or semantic success`,async()=>{
    const {result,calls}=await run(failure,1);assert.equal(calls.length,2);assert.equal(result.report.status,'failed');
    assert.equal(result.report.casesCompleted,1);assert.equal(result.report.casesPassed,1);
  });
}
test('valid wrong labels and uncertainty retain all planned cases but cannot qualify a negative control',async()=>{
  for(const failure of ['wrong-label','uncertain']){
    const {result,calls}=await run(failure,1);assert.equal(calls.length,8);assert.equal(result.report.casesPassed,7);
    assert.equal(result.report.code,'SPAN_CALIBRATION_MISMATCH');assert.equal(result.sealed.calls.length,8);
  }
});
test('encrypted capture binds complete source, exact requests, raw parsed replies and host labels',async()=>{
  const {result}=await run(undefined,0,true);assert.doesNotMatch(JSON.stringify(result.sealed),/Bellweather|Fictional/);
  const c=openDiagnostic(result.sealed,pair.privateKey);assert.deepEqual(c.controls,controls);assert.equal(c.calls.length,8);
  assert.equal(c.independentReview,'required-not-performed-by-this-workflow');
});
test('unissued plan or invalid key stops before inference',async()=>{
  let calls=0;for(const args of [{plan:structuredClone(prepareSpanCalibration()),publicKey},{plan:prepareSpanCalibration(),publicKey:'bad'}]){
    await assert.rejects(runSpanCalibration({...args,aiRequestImpl:async()=>{calls++;}}));}assert.equal(calls,0);
});
test('authority is owner-dispatched main on first attempt only; no caller-selected source or profile',()=>{
  const env={GITHUB_REPOSITORY:'itworksinprod/first-fold',GITHUB_REF:'refs/heads/main',
    GITHUB_WORKFLOW_REF:'itworksinprod/first-fold/.github/workflows/span-source-calibration.yml@refs/heads/main',
    GITHUB_ACTOR:'itworksinprod',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1'};
  assert.doesNotThrow(()=>assertSpanCalibrationAuthority(env));
  for(const key of Object.keys(env))assert.throws(()=>assertSpanCalibrationAuthority({...env,[key]:'other'}));
});
test('manual workflow carries no delivery or article secrets and retains only encrypted one-day output',async()=>{
  const y=await readFile(new URL('../.github/workflows/span-source-calibration.yml',import.meta.url),'utf8');
  assert.doesNotMatch(y,/schedule:|pull_request:|RESEND|OPENAI|FIRST_FOLD_ARTICLE|contents: write/);
  assert.match(y,/cancel-in-progress: false/);assert.match(y,/persist-credentials: false/);
  assert.match(y,/retention-days: 1/);assert.match(y,/span-source-calibration\.encrypted\.json/);
  assert.deepEqual([...y.matchAll(/secrets\.(\w+)/g)].map(m=>m[1]),['CLOUDFLARE_AI_API_TOKEN']);
});
