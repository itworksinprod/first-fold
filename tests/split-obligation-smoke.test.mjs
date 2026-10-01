import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {prepareSplitObligationSmoke as prepare,assertSplitObligationSmokePlan,assertSplitObligationSmokeAuthority,
  runSplitObligationSmoke,splitObligationSmokePublicReport,SPLIT_OBLIGATION_SMOKE_LIMITS,SPLIT_OBLIGATION_SMOKE_BINDINGS} from '../scripts/automation/split-obligation-smoke.mjs';
import {prepareSplitPassageCalibration} from '../scripts/automation/experiments/split-passage-calibration.mjs';
import {runSplitObligationLive} from '../scripts/automation/split-passage-live.mjs';
import {buildWorkersAiRequest,requestWorkersAiEditorial,workersAiRunUrl,FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
const clone=x=>structuredClone(x),sha=x=>createHash('sha256').update(x).digest('hex'),keys=generateKeyPairSync('rsa',{modulusLength:3072});
const publicKey=keys.publicKey.export({type:'spki',format:'der'}).toString('base64'),accountId='0'.repeat(32);
const authority={GITHUB_REPOSITORY:'itworksinprod/first-fold',GITHUB_REF:'refs/heads/codex/remaining-allowance-smoke',
  GITHUB_WORKFLOW_REF:'itworksinprod/first-fold/.github/workflows/split-passage-live.yml@refs/heads/codex/remaining-allowance-smoke',
  GITHUB_ACTOR:'itworksinprod',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1'};
// Injected expected fields verify mechanics, never model competence.
function reply(view,caseId,overaccept=false){
  const supported=overaccept||caseId==='CS07';
  return {reviewSha256:view.data.reviewSha256,judgments:view.data.spans.map(s=>view.data.stage==='claim'?{
    spanId:s.spanId,verdict:supported?'supported':'unsupported',basis:supported?'supported':'insufficient_evidence',
    explanation:'PRIVATE_SMOKE synthetic explanation.',evidence:supported?[{sentenceId:view.data.catalog[0].sentenceId}]:[],
  }:{spanId:s.spanId,passageChecks:view.data.passages.map((p,i)=>({evidenceId:p.evidenceId,
    contribution:overaccept||supported&&i===0?'support':'context',qualification:!overaccept&&supported&&i===0?'preserved':'none',
    explanation:'Synthetic role, no inference was performed.',evidence:[{sentenceId:view.data.catalog.find(e=>e.evidenceId===p.evidenceId).sentenceId}]}))})};
}
const envelope=p=>new Response(JSON.stringify({success:true,result:{response:JSON.stringify(p)}}),{headers:{'content-type':'application/json'}});
async function run(failure,at=1,encrypted=false,records){
  const plan=prepare(),selected=['CS04','CS07'].map(id=>plan.cases.find(c=>c.caseId===id)),views=selected.flatMap(c=>[c.pair.claim,c.pair.checks]);
  const requests=[],network=[],late=[];
  const result=await runSplitObligationSmoke({plan,publicKey,accountId,apiToken:'PRIVATE_TOKEN',...(encrypted?{}:{sealImpl:x=>x}),
    aiRequestImpl:async options=>{
      const i=requests.length;requests.push(options);late.push(options.fetchImpl);
      assert.equal(options.model,'@cf/openai/gpt-oss-120b');assert.equal(options.maxAttempts,1);
      assert.equal(options.maxTokens,4800);assert.equal(options.reasoningEffort,'medium');assert.equal(options.temperature,0.1);
      assert.equal(options.timeoutMs,90000);assert.equal(options.maxRequestBytes,7000);assert.equal(options.maxResponseBytes,100000);
      assert.deepEqual(options.messages,[{role:'system',content:`${views[i].prompt}\nJSON schema: ${JSON.stringify(views[i].schema)}`},{role:'user',content:JSON.stringify(views[i].data)}]);
      assert.doesNotMatch(options.messages[1].content,/PRIVATE_SMOKE|CS\d\d|expectedVerdicts|qualificationAnchors/);
      const url=workersAiRunUrl(accountId,options.model),init={method:'POST',redirect:'error',body:JSON.stringify(buildWorkersAiRequest(options).body)};
      if(i===at&&failure==='no-network')return {};
      if(i===at&&['url','method','body','redirect'].includes(failure)){
        const bad={...init};if(failure==='method')bad.method='GET';if(failure==='body')bad.body='{}';if(failure==='redirect')bad.redirect='follow';
        try{await options.fetchImpl(failure==='url'?'https://unapproved.invalid/':url,bad);}catch{/* Sticky failure. */}
      }
      if(i===at&&failure==='oversized-request')options.messages[1].content='X'.repeat(7001);
      const answer=await requestWorkersAiEditorial(options);
      if(i===at){
        if(failure==='retry')try{await options.fetchImpl(url,init);}catch{/* Sticky failure. */}
        if(failure==='provider')answer.provider='wrong';if(failure==='model')answer.model='wrong';
        if(failure==='hash')answer.requestSha256='0'.repeat(64);if(failure==='attempt')answer.attemptCount=2;
        if(failure==='response-hash')answer.responseSha256='invalid';
        if(failure==='accessor')Object.defineProperty(answer,'editorialPayload',{get(){assert.fail('getter executed');},enumerable:true});
      }
      return answer;
    },fetchImpl:async(url,init)=>{
      const i=network.length;network.push({url,body:init.body});
      assert.equal(url,`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/openai/gpt-oss-120b`);
      assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert.ok(Buffer.byteLength(init.body)<=7000);
      if(i===at&&failure==='quota')return new Response(JSON.stringify({success:false,errors:[{code:3036,message:'PRIVATE_QUOTA'}]}),{status:429});
      if(i===at&&failure==='transport')throw new Error('PRIVATE_TRANSPORT');
      const caseId=selected[Math.floor(i/2)].caseId,p=records?clone(records[Math.floor(i/2)][i%2?'checks':'claim']):reply(views[i],caseId,failure==='overaccept');
      if(records)p.reviewSha256=views[i].data.reviewSha256; // Explicit offline historical projection only.
      if(i===at){
        if(failure==='binding')p.reviewSha256='0'.repeat(64);if(failure==='extra')p.extra='PRIVATE_RAW';
        if(failure==='conflict')p.judgments[0].passageChecks[1].qualification='missing';
      }
      if(i===at&&failure==='truncation')return new Response(JSON.stringify({success:true,result:{choices:[{index:0,message:{role:'assistant',content:JSON.stringify(p)},finish_reason:'length'}]}}));
      return envelope(p);
    }});
  assert.ok(requests.length<=4);assert.equal(result.report.outputBudget,requests.length*4800);assert.equal(network.length,result.report.networkRequests);
  for(const flag of ['fullSubsetPassed','fullControlsetPassed','modelQualified','articleApproved','publicationReady','emailSent','explanationsChecked','provenanceVerified'])assert.equal(result.report[flag],false);
  for(const fn of late)await assert.rejects(fn('https://unapproved.invalid/',{}),/SPLIT_SMOKE_NETWORK/);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_TOKEN/);
  assert.doesNotMatch(JSON.stringify(splitObligationSmokePublicReport(result.report)),/PRIVATE_|rawClaim|rawChecks|reasoningFieldMismatches/);
  return {result,requests,network,plan};
}
test('fixed CS04 then CS07 prepare exactly four bound requests below the byte and output ceilings',async()=>{
  const {result,network,plan}=await run();assert.doesNotThrow(()=>assertSplitObligationSmokePlan(plan));
  assert.equal(plan.cases.length,8);assert.equal(plan.reviewContract,'blinded-claim-passage-obligations-v2');
  assert.deepEqual(result.sealed.calls.map(c=>[c.caseId,c.stage]),[['CS04','claim'],['CS04','checks'],['CS07','claim'],['CS07','checks']]);
  assert.deepEqual(result.sealed.calls.map(c=>c.requestSha256),SPLIT_OBLIGATION_SMOKE_BINDINGS.requestSha256);
  assert.equal(sha(JSON.stringify(result.sealed.calls.map(c=>c.requestSha256))),'9f310e51e975550510d5a40916e0ae13412c267ed75a14973a51ca73a726999c');
  assert.deepEqual(network.map(x=>Buffer.byteLength(x.body)),[6252,6130,6437,6324]);
  assert.deepEqual(SPLIT_OBLIGATION_SMOKE_LIMITS,{requests:4,tokensPerRequest:4800,outputTokens:19200,timeoutMs:90000,maxRequestBytes:7000});
  assert.equal(result.report.status,'review-complete-awaiting-independent-review');assert.equal(result.report.casesExpected,2);
  assert.equal(result.report.casesValid,2);assert.equal(result.report.casesMatching,2);assert.equal(result.report.reasoningFieldsMatching,2);
  assert.equal(result.report.reasoningAgreementComplete,true);assert.equal(result.report.knownFailureDevelopmentTest,true);
  assert.equal(result.report.scope,'two-known-failure-development-cases');assert.equal(result.sealed.emailSent,false);
  for(const r of result.sealed.scoring.results)assert.equal(r.composite.composition,'lossless-two-response-host-assembly');
});
test('the four body and request hashes are identical to their full-run counterparts',async()=>{
  const {network:smoke,result:small}=await run(),plan=prepare(),views=plan.cases.flatMap(c=>[c.pair.claim,c.pair.checks]),fullBodies=[];
  const full=await runSplitObligationLive({plan,publicKey,accountId,apiToken:'offline-only',sealImpl:x=>x,
    fetchImpl:async(url,init)=>{const i=fullBodies.length;fullBodies.push(init.body);return envelope(reply(views[i],plan.cases[Math.floor(i/2)].caseId,true));}});
  assert.equal(full.report.networkRequests,16);
  for(const [i,n]of [2,3,8,9].entries()){
    assert.equal(smoke[i].body,fullBodies[n]);assert.equal(small.sealed.calls[i].requestSha256,full.sealed.calls[n].requestSha256);
    assert.equal(small.sealed.calls[i].promptSha256,full.sealed.calls[n].promptSha256);
  }
});
test('valid disagreements remain measurements and cannot approve the smoke or full study',async()=>{
  const {result}=await run('overaccept');assert.equal(result.report.networkRequests,4);assert.equal(result.report.casesValid,2);
  assert.equal(result.report.casesMatching,1);assert.equal(result.report.reasoningAgreementComplete,false);
});
for(const failure of ['quota','transport','no-network','url','method','body','redirect','retry','provider','model','hash','attempt','response-hash','accessor','oversized-request','binding','extra','truncation']){
  test(`${failure} stops after the failed request without retry or completing its pair`,async()=>{
    const {result,requests}=await run(failure);assert.equal(requests.length,2);assert.equal(result.report.status,'failed');
    assert.equal(result.report.casesRecorded,0);assert.equal(result.report.structuralComplete,false);
    if(failure==='oversized-request')assert.equal(result.report.networkRequests,1);
  });
}
test('a CS07 disagreement holds the unchanged composite and retains both exact raw responses',async()=>{
  const {result}=await run('conflict',3);assert.equal(result.report.code,'SPLIT_SMOKE_COMPOSITE_INVALID');
  assert.equal(result.report.casesRecorded,2);assert.equal(result.report.casesValid,1);
  const last=result.sealed.scoring.results.at(-1);assert.equal(last.caseId,'CS07');assert.equal(last.composite.code,'PASSAGE_SCOPE_CONSISTENCY');
  assert.equal(last.rawClaim.judgments[0].verdict,'supported');assert.equal(last.rawChecks.judgments[0].passageChecks[1].qualification,'missing');
  assert.equal(last.reasoning.fieldsMatch,true);assert.equal(last.composite.valid,false);
});
test('explicit offline historical projection preserves CS04 reasoning failure and CS07 hold',async()=>{
  const f=JSON.parse(await readFile(new URL('./fixtures/split-passage-live-36801262924.json',import.meta.url),'utf8'));
  const records=['CS04','CS07'].map(id=>f.records.find(r=>r.caseId===id)),before=clone(records),{result}=await run(undefined,1,false,records);
  assert.equal(result.report.casesMatching,1);assert.equal(result.report.reasoningFieldsMatching,1);
  assert.equal(result.report.code,'SPLIT_SMOKE_COMPOSITE_INVALID');assert.deepEqual(records,before);
  assert.equal(result.sealed.scoring.results[0].reasoning.issues[0].observed,'contradiction');
});
test('invalid raw output stays encrypted and first-stage failure makes no second request',async()=>{
  const {result}=await run('extra',0,true);assert.equal(result.report.networkRequests,1);assert.equal(result.report.casesRecorded,0);
  assert.doesNotMatch(JSON.stringify(result.sealed),/PRIVATE_SMOKE|PRIVATE_RAW/);
  const opened=openDiagnostic(result.sealed,keys.privateKey.export({type:'pkcs8',format:'pem'}));assert.equal(opened.calls[0].response.extra,'PRIVATE_RAW');
});
test('v1, cloned and hostile plans and invalid keys never reach inference',async()=>{
  let reads=0,calls=0;const issued=prepare(),getter={get cases(){reads++;}},proxy=new Proxy(issued,{get(){reads++;},ownKeys(){reads++;return[];}});
  for(const plan of [prepareSplitPassageCalibration(),clone(issued),getter,proxy,null,{},[]]){
    assert.throws(()=>assertSplitObligationSmokePlan(plan));
    await assert.rejects(runSplitObligationSmoke({plan,publicKey,accountId,apiToken:'test',aiRequestImpl:async()=>{calls++;}}));
  }
  await assert.rejects(runSplitObligationSmoke({plan:issued,publicKey:'bad',accountId,apiToken:'test',aiRequestImpl:async()=>{calls++;}}));
  assert.equal(reads,0);assert.equal(calls,0);
});
test('smoke authority accepts only the exact branch workflow, owner, manual dispatch and first attempt',()=>{
  assert.doesNotThrow(()=>assertSplitObligationSmokeAuthority(authority));
  for(const k of Object.keys(authority))assert.throws(()=>assertSplitObligationSmokeAuthority({...authority,[k]:'wrong'}),/SPLIT_SMOKE_AUTHORITY/);
  assert.throws(()=>assertSplitObligationSmokeAuthority({...authority,GITHUB_REF:'refs/heads/main'}),/SPLIT_SMOKE_AUTHORITY/);
});
test('public report has fixed smoke scope and rejects counts beyond the four-request boundary',async()=>{
  const {result}=await run();const report={...result.report,details:'PRIVATE_DETAIL'};
  const publicReport=splitObligationSmokePublicReport(report);assert.equal(publicReport.casesExpected,2);
  assert.doesNotMatch(JSON.stringify(publicReport),/PRIVATE_|details|reasoningFieldMismatches/);
  for(const [key,value]of [['modelRequests',5],['networkRequests',5],['outputBudget',19201],['casesRecorded',3],['casesValid',-1],['casesMatching',NaN]])
    assert.throws(()=>splitObligationSmokePublicReport({...report,[key]:value}),/SPLIT_SMOKE_PUBLIC|SPAN_REVIEW_DATA/);
});
test('isolated workflow routes only smoke commands with read-only permissions and encrypted one-day retention',async()=>{
  const s=await readFile(new URL('../.github/workflows/split-passage-live.yml',import.meta.url),'utf8');
  assert.match(s,/workflow_dispatch:/);assert.match(s,/github\.ref == 'refs\/heads\/codex\/remaining-allowance-smoke'/);
  assert.match(s,/github\.workflow_ref == 'itworksinprod\/first-fold\/\.github\/workflows\/split-passage-live.yml@refs\/heads\/codex\/remaining-allowance-smoke'/);
  assert.match(s,/github\.actor == 'itworksinprod'/);assert.match(s,/github\.run_attempt == 1/);
  assert.match(s,/split-obligation-smoke\.mjs validate/);assert.match(s,/split-obligation-smoke\.mjs run "\$RUNNER_TEMP\/split-obligation-smoke\.encrypted\.json"/);
  assert.match(s,/name: split-obligation-smoke/);assert.match(s,/retention-days: 1/);assert.match(s,/permissions: \{\}/);
  assert.match(s,/contents: read/);assert.match(s,/persist-credentials: false/);assert.match(s,/group: personal-morning-paper/);
  assert.match(s,/timeout-minutes: 10/);
  assert.doesNotMatch(s,/schedule:|pull_request|RESEND|GEMINI|OPENAI_API|PERSONAL_PAPER|contents: write|split-passage-live\.mjs/);
  assert.deepEqual([...s.matchAll(/secrets\.([A-Z_]+)/g)].map(x=>x[1]),['CLOUDFLARE_AI_API_TOKEN']);
  assert.equal([...s.matchAll(/uses: [^\s]+@[a-f0-9]{40}/g)].length,3);
});
test('CLI preflight is offline and wrong branch or output path cannot dispatch',()=>{
  const cli=fileURLToPath(new URL('../scripts/automation/split-obligation-smoke.mjs',import.meta.url));
  const invoke=(args,changes={})=>spawnSync(process.execPath,[cli,...args],{env:{...authority,DIAGNOSTIC_PUBLIC_KEY:publicKey,RUNNER_TEMP:'/tmp',...changes},encoding:'utf8'});
  const valid=invoke(['validate']);assert.equal(valid.status,0,valid.stderr);assert.equal(valid.stdout,'');
  const wrong=invoke(['validate'],{GITHUB_REF:'refs/heads/main'});assert.equal(wrong.status,1);assert.match(wrong.stderr,/SPLIT_SMOKE_AUTHORITY/);
  for(const args of [['validate','extra'],['run'],['run','/tmp/split-passage-live.encrypted.json'],['run','/tmp/wrong.json'],['run','/tmp/split-obligation-smoke.encrypted.json','extra']]){
    const result=invoke(args);assert.equal(result.status,1);assert.match(result.stderr,/SPLIT_SMOKE_ARGUMENTS/);
  }
});
