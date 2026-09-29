import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {prepareSpanCalibration,runSpanCalibration,assertSpanCalibrationAuthority,SPAN_CALIBRATION_PIN,SPAN_CALIBRATION_PROFILES} from '../scripts/automation/span-source-calibration.mjs';
import {SPAN_SOURCE_CONTROLS as controls} from '../scripts/automation/experiments/span-source-controls.mjs';
import {requestWorkersAiEditorial,buildWorkersAiRequest,workersAiRunUrl,DEFAULT_CLOUDFLARE_AI_MODEL,FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
const pair=generateKeyPairSync('rsa',{modulusLength:3072});
const publicKey=pair.publicKey.export({type:'spki',format:'der'}).toString('base64');
const reply=(view,control)=>({reviewSha256:view.data.reviewSha256,judgments:view.data.spans.map((s,i)=>({spanId:s.spanId,
  verdict:control.expectedVerdicts[i],explanation:'Synthetic label injection tests scoring mechanics only.',
  evidence:[{evidenceId:'S1P1',quote:view.data.passages[0].text.split('. ')[0]}]}))});
async function run(failure,at=0,encrypt=false,profile='baseline'){
  const plan=prepareSpanCalibration(profile),calls=[],network=[],late=[],accountId='0'.repeat(32),limits=SPAN_CALIBRATION_PROFILES[profile];
  const result=await runSpanCalibration({plan,publicKey,accountId,apiToken:'PRIVATE_FIXTURE_TOKEN',...(encrypt?{}:{sealImpl:x=>x}),
    aiRequestImpl:async request=>{
      const index=calls.length;calls.push(request);late.push(request.fetchImpl);
      assert.equal(request.maxTokens,limits.tokensPerRequest);assert.equal(request.maxAttempts,1);assert.equal(request.model,limits.model);
      assert.equal(request.timeoutMs,limits.timeoutMs);
      assert.doesNotMatch(request.messages[1].content,/expectedVerdicts|expectedSupported|rationale|SC0[1-8]/);
      const {body}=buildWorkersAiRequest(request),url=workersAiRunUrl(accountId,request.model),init={method:'POST',redirect:'error',body:JSON.stringify(body)};
      if(index===at&&failure==='no-network')return {};
      if(index===at&&['url','method','body','redirect'].includes(failure)){
        const bad={...init};if(failure==='method')bad.method='GET';if(failure==='body')bad.body='{}';if(failure==='redirect')bad.redirect='follow';
        try{await request.fetchImpl(failure==='url'?'https://unapproved.invalid/':url,bad);}catch{/* sticky */}
      }
      if(index===at&&failure==='profile-downgrade'){
        const alternate=buildWorkersAiRequest({...request,model:DEFAULT_CLOUDFLARE_AI_MODEL,maxTokens:600});
        try{await request.fetchImpl(workersAiRunUrl(accountId,alternate.model),{...init,body:JSON.stringify(alternate.body)});}catch{/* sticky */}
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
      const payload=reply(plan.views[index],plan.controls[index]);
      if(index===at&&failure==='wrong-label')payload.judgments.at(-1).verdict=payload.judgments.at(-1).verdict==='supported'?'unsupported':'supported';
      if(index===at&&failure==='uncertain')payload.judgments.at(-1).verdict='uncertain';
      if(index===at&&failure==='skip')payload.judgments.pop();
      if(index===at&&failure==='quote')payload.judgments[0].evidence[0].quote='Fabricated quote';
      const response=index===at&&failure==='truncation'?{choices:[{index:0,message:{role:'assistant',content:JSON.stringify(payload)},finish_reason:'length'}]}:{response:JSON.stringify(payload)};
      return new Response(JSON.stringify({success:true,result:response}),{headers:{'content-type':'application/json'}});
    }});
  for(const fn of late)await assert.rejects(fn('https://unapproved.invalid/',{}),/SPAN_CALIBRATION_NETWORK/);
  assert.ok(network.length<=limits.requests);assert.ok(result.report.outputBudget<=limits.outputTokens);
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
test('authority is owner-dispatched main on first attempt only; no caller-selected source',()=>{
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
  assert.ok(y.includes("timeout-minutes: ${{ (inputs.profile == 'reasoning' || inputs.profile == 'reasoning-uniform') && 15 || 8 }}"));
  assert.match(y,/SPAN_CALIBRATION_PROFILE: \$\{\{ inputs.profile \}\}/);
  assert.match(y,/default: baseline\s+options:\s+- baseline\s+- reasoning\s+- reasoning-sc05\s+- reasoning-uniform/);
  assert.deepEqual([...y.matchAll(/secrets\.(\w+)/g)].map(m=>m[1]),['CLOUDFLARE_AI_API_TOKEN']);
});
test('SC05 feasibility is one frozen case with only its output allowance changed',async()=>{
  const full=prepareSpanCalibration('reasoning'),one=prepareSpanCalibration('reasoning-sc05');
  assert.equal(one.controls.length,1);assert.equal(one.controls[0].id,'SC05');
  assert.deepEqual(one.controls[0],controls[4]);assert.deepEqual(one.views,[full.views[4]]);
  assert.equal(one.corpusSha256,full.corpusSha256);assert.ok(Object.isFrozen(one.controls));
  assert.deepEqual(one.limits,{...full.limits,requests:1,tokensPerRequest:4800,outputTokens:4800});
  const before=await run(undefined,0,false,'reasoning'),after=await run(undefined,0,true,'reasoning-sc05');
  assert.equal(after.calls.length,1);assert.equal(after.network.length,1);
  const a=buildWorkersAiRequest(after.calls[0]),b=buildWorkersAiRequest(before.calls[4]);
  assert.deepEqual({...a.body,max_tokens:2400},b.body);assert.equal(a.model,b.model);
  const c=openDiagnostic(after.result.sealed,pair.privateKey);
  assert.deepEqual(c.controls,[controls[4]]);assert.equal(c.calls[0].caseId,'SC05');
  assert.equal(c.calls[0].promptSha256,before.result.sealed.calls[4].promptSha256);
  assert.equal(c.purpose,'synthetic-sc05-resource-feasibility-awaiting-independent-review');
  assert.deepEqual(c.comparisonProfile,{name:'reasoning-sc05',...one.limits});
  assert.equal(after.result.report.status,'resource-probe-passed-awaiting-independent-review');
  assert.equal(after.result.report.casesPassed,1);assert.equal(after.result.report.outputBudget,4800);
});
for(const failure of ['quota','transport','truncation','skip','quote','hash','provider','model','attempt','response-hash','accessor','url','method','body','redirect','retry','no-network','profile-downgrade','wrong-label','uncertain']){
  test(`SC05 ${failure} stops after one attempt without full-calibration success`,async()=>{
    const {result,calls}=await run(failure,0,false,'reasoning-sc05');
    assert.equal(calls.length,1);assert.equal(result.report.status,'failed');
    assert.equal(result.report.casesPassed,0);assert.equal(result.report.outputBudget,4800);
  });
}
test('comparison profiles are closed, deeply frozen and do not alter baseline requests',()=>{
  const a=prepareSpanCalibration(),b=prepareSpanCalibration('reasoning');
  assert.deepEqual(a.views,b.views);assert.equal(a.corpusSha256,b.corpusSha256);
  assert.equal(a.limits.model,DEFAULT_CLOUDFLARE_AI_MODEL);assert.equal(b.limits.model,FREE_REASONING_WRITER_MODEL);
  assert.equal(b.limits.tokensPerRequest,2400);assert.equal(b.limits.outputTokens,19200);assert.equal(b.limits.timeoutMs,90000);
  assert.ok(Object.isFrozen(SPAN_CALIBRATION_PROFILES));assert.ok(Object.isFrozen(b.limits));
  assert.throws(()=>{b.profile='baseline';});assert.throws(()=>{b.limits.requests=9;});
  for(const value of ['',null,{},'toString','__proto__','paid','@cf/openai/gpt-oss-120b'])assert.throws(()=>prepareSpanCalibration(value),/SPAN_CALIBRATION_PROFILE/);
});
test('reasoning comparison changes only declared model and resources, retains all evidence gates',async()=>{
  const baseline=await run(),reasoning=await run(undefined,0,true,'reasoning');
  const c=openDiagnostic(reasoning.result.sealed,pair.privateKey);
  assert.equal(reasoning.calls.length,8);assert.equal(reasoning.result.report.outputBudget,19200);
  assert.equal(reasoning.result.report.casesPassed,8);assert.equal(reasoning.result.report.emailSent,false);
  assert.deepEqual(c.comparisonProfile,{name:'reasoning',...SPAN_CALIBRATION_PROFILES.reasoning});
  assert.equal(baseline.result.sealed.comparisonProfile,undefined);
  for(const [i,call]of reasoning.calls.entries()){
    const {body}=buildWorkersAiRequest(call),before=buildWorkersAiRequest(baseline.calls[i]);
    assert.deepEqual({...body,max_tokens:600},before.body);
    assert.deepEqual(c.calls[i].request,baseline.result.sealed.calls[i].request);
    assert.equal(c.calls[i].promptSha256,baseline.result.sealed.calls[i].promptSha256);
    assert.notEqual(c.calls[i].requestSha256,baseline.result.sealed.calls[i].requestSha256);
  }
});
for(const profile of ['reasoning','reasoning-uniform'])for(const failure of ['quota','transport','truncation','skip','quote','hash','provider','model','attempt','response-hash','accessor','url','method','body','redirect','retry','no-network','profile-downgrade']){
  test(`${profile} ${failure} stops without a retry, fallback or budget growth`,async()=>{
    const {result,calls}=await run(failure,1,false,profile);
    assert.equal(calls.length,2);assert.equal(result.report.status,'failed');assert.equal(result.report.casesCompleted,1);
    assert.equal(result.report.outputBudget,2*SPAN_CALIBRATION_PROFILES[profile].tokensPerRequest);
  });
}
for(const profile of ['reasoning','reasoning-uniform'])test(`${profile} mismatches and uncertainty cannot weaken scoring`,async()=>{
  for(const failure of ['wrong-label','uncertain']){
    const {result,calls}=await run(failure,1,false,profile);
    assert.equal(calls.length,8);assert.equal(result.report.casesPassed,7);assert.equal(result.report.code,'SPAN_CALIBRATION_MISMATCH');
  }
});
test('uniform reasoning uses all eight frozen cases, changing only the per-call output cap',async()=>{
  const plan=prepareSpanCalibration('reasoning-uniform'),previous=prepareSpanCalibration('reasoning');
  assert.deepEqual(plan.views,previous.views);assert.deepEqual(plan.controls,controls);
  assert.equal(plan.corpusSha256,previous.corpusSha256);assert.ok(Object.isFrozen(plan.limits));
  assert.deepEqual(plan.limits,{...previous.limits,tokensPerRequest:4800,outputTokens:38400});
  const before=await run(undefined,0,false,'reasoning'),after=await run(undefined,0,true,'reasoning-uniform');
  const c=openDiagnostic(after.result.sealed,pair.privateKey);
  assert.equal(after.calls.length,8);assert.equal(after.network.length,8);assert.equal(after.result.report.outputBudget,38400);
  assert.equal(after.result.report.casesPassed,8);assert.equal(after.result.report.status,'controls-passed-awaiting-independent-review');
  assert.deepEqual(c.controls,controls);assert.deepEqual(c.comparisonProfile,{name:'reasoning-uniform',...plan.limits});
  for(const [i,request]of after.calls.entries()){
    const a=buildWorkersAiRequest(request),b=buildWorkersAiRequest(before.calls[i]);
    assert.deepEqual({...a.body,max_tokens:2400},b.body);assert.equal(a.model,b.model);
    assert.equal(c.calls[i].promptSha256,before.result.sealed.calls[i].promptSha256);
  }
});
