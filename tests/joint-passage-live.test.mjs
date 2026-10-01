import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {jointPassagePublicReport,runJointPassageLive,assertJointPassageLivePlan,assertJointPassageLiveAuthority,JOINT_PASSAGE_LIVE_LIMITS} from '../scripts/automation/joint-passage-live.mjs';
import {prepareJointPassageCalibration as prepare} from '../scripts/automation/experiments/joint-passage-calibration.mjs';
import {CONDITIONAL_SCOPE_CONTROLS as controls} from '../scripts/automation/experiments/conditional-scope-controls.mjs';
import {buildWorkersAiRequest,requestWorkersAiEditorial,workersAiRunUrl,FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
const keys=generateKeyPairSync('rsa',{modulusLength:3072}),publicKey=keys.publicKey.export({type:'spki',format:'der'}).toString('base64');
// Deliberately overaccepting injected replies test transport and bookkeeping, not semantics.
const reply=(view)=>({reviewSha256:view.data.reviewSha256,judgments:view.data.spans.map(s=>{
  const passageChecks=view.data.passages.map(p=>({evidenceId:p.evidenceId,contribution:'support',qualification:'none',
    explanation:'Injected coverage only, not model evidence.',evidence:[{sentenceId:view.data.catalog.find(e=>e.evidenceId===p.evidenceId).sentenceId}]}));
  return {spanId:s.spanId,passageChecks,verdict:'supported',basis:'supported',explanation:'Injected label only.',evidence:structuredClone(passageChecks[0].evidence)};
})});
async function run(failure,at=2,encrypted=false){
  const plan=prepare(),accountId='0'.repeat(32),requests=[],network=[],late=[];
  const result=await runJointPassageLive({plan,publicKey,accountId,apiToken:'PRIVATE_TEST_TOKEN',...(encrypted?{}:{sealImpl:x=>x}),
    aiRequestImpl:async options=>{
      const i=requests.length;requests.push(options);late.push(options.fetchImpl);
      assert.equal(options.model,FREE_REASONING_WRITER_MODEL);assert.equal(options.maxTokens,4800);assert.equal(options.timeoutMs,90000);assert.equal(options.maxAttempts,1);
      assert.doesNotMatch(options.messages[1].content,/expectedVerdicts|rationale|category|CS\d\d|labelMatch/);
      assert.deepEqual(JSON.parse(options.messages[1].content),plan.cases[i].view.data);
      assert.equal(options.messages[0].content,`${plan.cases[i].view.prompt}\nJSON schema: ${JSON.stringify(plan.cases[i].view.schema)}`);
      const {body}=buildWorkersAiRequest(options),url=workersAiRunUrl(accountId,options.model),init={method:'POST',redirect:'error',body:JSON.stringify(body)};
      if(i===at&&failure==='no-network')return {};
      if(i===at&&['url','method','body','redirect'].includes(failure)){
        const bad={...init};if(failure==='method')bad.method='GET';if(failure==='body')bad.body='{}';if(failure==='redirect')bad.redirect='follow';
        try{await options.fetchImpl(failure==='url'?'https://unapproved.invalid/':url,bad);}catch{/* sticky violation */}
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
      const payload=reply(plan.cases[i].view,i);
      if(i===at&&failure==='uncertain'){payload.judgments[0].verdict='uncertain';payload.judgments[0].basis='uncertain';payload.judgments[0].passageChecks[0].qualification='uncertain';}
      if(failure==='all-accepted')payload.judgments.forEach(j=>{j.verdict='supported';});
      if(failure==='all-rejected')payload.judgments.forEach(j=>{j.verdict='unsupported';j.basis='insufficient_evidence';j.passageChecks.forEach(p=>{p.contribution='context';});});
      if(i===at){
        if(failure==='missing')payload.judgments.pop();
        if(failure==='malformed-observed')payload.judgments[0].basis={nested:'PRIVATE_MALFORMED_OBSERVED'};
        if(failure==='passage-missing')payload.judgments[0].passageChecks.pop();
        if(failure==='passage-order')payload.judgments[0].passageChecks[0].evidenceId='S1P99';
        if(failure==='contradiction')payload.judgments[0].passageChecks[0].contribution='contradiction';if(failure==='quote')payload.judgments[0].evidence[0].quote='Fabricated quotation';
        if(failure==='sentence-id')payload.judgments[0].evidence[0].sentenceId='S1P1S999';
        if(failure==='review-hash')payload.reviewSha256='0'.repeat(64);if(failure==='extra')payload.extra='PRIVATE_REJECTED_PROSE';
      }
      const response=i===at&&failure==='truncation'?{choices:[{index:0,message:{role:'assistant',content:JSON.stringify(payload)},finish_reason:'length'}]}:{response:JSON.stringify(payload)};
      return new Response(JSON.stringify({success:true,result:response}),{headers:{'content-type':'application/json'}});
    }});
  assert.ok(requests.length<=16);assert.ok(network.length<=16);assert.equal(result.report.outputBudget,requests.length*4800);
  for(const k of ['articleApproved','publicationReady','modelQualified','provenanceVerified','emailSent'])assert.equal(result.report[k],false);
  for(const fn of late)await assert.rejects(fn('https://unapproved.invalid/',{}),/JOINT_PASSAGE_LIVE_NETWORK/);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_TEST_TOKEN/);assert.doesNotMatch(JSON.stringify(jointPassagePublicReport(result.report)),/PRIVATE_/);
  return {result,requests,plan};
}
test('sixteen frozen ordered cases use the unchanged prompt and complete evidence without labels',async()=>{
  const {result,plan}=await run();assert.equal(result.report.status,'review-complete-awaiting-independent-review');
  assert.equal(result.report.casesValid,16);assert.equal(result.report.casesMatching,8);assert.equal(result.report.labelAgreementComplete,false);
  assert.deepEqual(JOINT_PASSAGE_LIVE_LIMITS,{requests:16,tokensPerRequest:4800,outputTokens:76800,timeoutMs:90000});
  assert.equal(result.report.outputBudget,76800);assert.equal(result.report.writerRequests,0);assert.equal(result.report.searchQueries,0);
  assert.equal(result.sealed.controlsetSha256,plan.controlsetSha256);
  for(const [i,c]of result.sealed.calls.entries()){
    assert.equal(c.caseId,controls[i].id);assert.deepEqual(c.response,c.verdict.rawSelection);
    assert.deepEqual(c.response,result.sealed.scoring.results[i].rawResponse);
    assert.equal(c.verdict.quotedPayload.judgments[0].evidence[0].quote,plan.cases[i].view.data.catalog[0].text);
  }
});
for(const failure of ['uncertain','all-accepted','all-rejected'])test(`${failure} is measured through all cases without retry or qualification`,async()=>{
  const {result}=await run(failure);assert.equal(result.report.casesValid,16);assert.equal(result.report.labelAgreementComplete,false);
  assert.equal(result.report.status,'review-complete-awaiting-independent-review');
  if(failure==='all-accepted')assert.equal(result.report.falsePositives.length,8);
  if(failure==='all-rejected')assert.equal(result.report.falseNegatives.length,8);
  if(failure==='uncertain')assert.equal(result.report.uncertain.length,1);
});
for(const failure of ['quota','transport','no-network','url','method','body','redirect','retry','hash','provider','model','attempt','response-hash','accessor','truncation','passage-missing','passage-order','contradiction','missing','quote','sentence-id','review-hash','extra','malformed-observed']){
  test(`${failure} stops on first failure without retry or false completion`,async()=>{const {result,requests}=await run(failure);
    assert.equal(result.report.status,'failed');assert.equal(result.report.structuralComplete,false);assert.equal(result.report.casesValid,2);assert.equal(requests.length,3);
    assert.equal(result.report.casesMissing.at(-1),'CS16');
  });
}
test('encrypted capture preserves rejected parsed output for independent review',async()=>{
  const {result}=await run('extra',1,true);assert.doesNotMatch(JSON.stringify(result.sealed),/PRIVATE_REJECTED_PROSE|Fictional/);
  const c=openDiagnostic(result.sealed,keys.privateKey);assert.equal(c.calls[1].response.extra,'PRIVATE_REJECTED_PROSE');
  assert.equal(c.scoring.results[1].rawResponse.extra,'PRIVATE_REJECTED_PROSE');assert.deepEqual(c.report.invalidCases,[{caseId:'CS02',code:'PASSAGE_SCOPE_BINDING'}]);
  assert.equal(c.independentReview,'required-not-performed-by-this-workflow');
});
test('unissued plans or invalid keys fail before any provider request',async()=>{
  const plan=prepare();assert.doesNotThrow(()=>assertJointPassageLivePlan(plan));assert.throws(()=>assertJointPassageLivePlan(structuredClone(plan)),/JOINT_PASSAGE_PLAN/);
  let n=0;await assert.rejects(runJointPassageLive({plan:structuredClone(plan),publicKey,aiRequestImpl:()=>{n++;}}),/JOINT_PASSAGE_PLAN/);
  await assert.rejects(runJointPassageLive({plan,publicKey:'bad',aiRequestImpl:()=>{n++;}}));assert.equal(n,0);
});
test('manual first-attempt main-owner workflow uses only the AI secret and never delivery credentials',async()=>{
  const env={GITHUB_REPOSITORY:'itworksinprod/first-fold',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'itworksinprod/first-fold/.github/workflows/joint-passage-live.yml@refs/heads/main',GITHUB_ACTOR:'itworksinprod',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1'};
  assert.doesNotThrow(()=>assertJointPassageLiveAuthority(env));for(const k of Object.keys(env))assert.throws(()=>assertJointPassageLiveAuthority({...env,[k]:'wrong'}));
  const y=await readFile(new URL('../.github/workflows/joint-passage-live.yml',import.meta.url),'utf8');
  assert.doesNotMatch(y,/schedule:|pull_request:|RESEND|OPENAI|contents: write|FIRST_FOLD_FULL_ARTICLE/);
  assert.match(y,/timeout-minutes: 30/);assert.match(y,/cancel-in-progress: false/);assert.match(y,/persist-credentials: false/);assert.match(y,/retention-days: 1/);
  assert.deepEqual([...new Set([...y.matchAll(/secrets\.(\w+)/g)].map(m=>m[1]))],['CLOUDFLARE_AI_API_TOKEN']);
  assert.equal([...y.matchAll(/uses: \S+@[a-f0-9]{40}/g)].length,3);
});

test('private malformed diagnostics never appear in the public projection',async()=>{
  const {result}=await run('malformed-observed',1,true),c=openDiagnostic(result.sealed,keys.privateKey);
  assert.match(JSON.stringify(c.scoring.report.reasoningFieldMismatches),/PRIVATE_MALFORMED_OBSERVED/);
  assert.doesNotMatch(JSON.stringify(jointPassagePublicReport(c.report)),/PRIVATE_|observed|basis|qualification/);
  const unknown={...c.report,code:'PRIVATE_MODEL_CONTENT'};assert.equal(jointPassagePublicReport(unknown).code,'PROVIDER_OR_TRANSPORT_FAILURE');
});
test('public projection has only allowed scalar fields and rejects unsafe nonnumeric counters',async()=>{
  const {result}=await run(),out=jointPassagePublicReport(result.report);assert.ok(Object.values(out).every(x=>x===null||['string','number','boolean'].includes(typeof x)));
  for(const bad of ['PRIVATE_COUNTER',{},-1,17])assert.throws(()=>jointPassagePublicReport({...result.report,modelRequests:bad}));
  let calls=0;const hostile={...result.report};Object.defineProperty(hostile,'casesValid',{get(){calls++;},enumerable:true});
  assert.throws(()=>jointPassagePublicReport(hostile));assert.equal(calls,0);
});
