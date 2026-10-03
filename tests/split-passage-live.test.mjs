import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {runSplitPassageLive,runSplitObligationLive,runSplitScopeWitnessLive,runSplitIncompatibilityWitnessLive,assertSplitPassageLivePlan,assertSplitObligationLivePlan,assertSplitScopeWitnessLivePlan,assertSplitIncompatibilityWitnessLivePlan,assertSplitPassageLiveAuthority,splitPassagePublicReport,splitIncompatibilityWitnessStageReport,splitIncompatibilityWitnessScoringReport,SPLIT_PASSAGE_LIVE_LIMITS,SPLIT_OBLIGATION_LIVE_BINDINGS,SPLIT_SCOPE_WITNESS_LIVE_BINDINGS,SPLIT_INCOMPATIBILITY_WITNESS_LIVE_BINDINGS} from '../scripts/automation/split-passage-live.mjs';
import {prepareSplitPassageCalibration as prepare,prepareSplitObligationCalibration as prepareObligations,prepareSplitScopeWitnessCalibration as prepareWitnesses,scoreSplitPassageCalibration as score} from '../scripts/automation/experiments/split-passage-calibration.mjs';
import {prepareSplitIncompatibilityWitnessCalibration as prepareIncompatibility,scoreSplitIncompatibilityWitnessCalibration as scoreIncompatibility} from '../scripts/automation/experiments/split-incompatibility-witness-calibration.mjs';
import {validateSplitIncompatibilityWitnessStage} from '../scripts/automation/experiments/split-incompatibility-witness-review.mjs';
import {buildWorkersAiRequest,requestWorkersAiEditorial,workersAiRunUrl,FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
import {SCOPE_REASONING_EXPECTATIONS as expectations} from '../scripts/automation/experiments/scope-reasoning-expectations.mjs';
const clone=x=>structuredClone(x),sha=x=>createHash('sha256').update(x).digest('hex'),keys=generateKeyPairSync('rsa',{modulusLength:3072});
const publicKey=keys.publicKey.export({type:'spki',format:'der'}).toString('base64');
// Deliberately overaccepting injected data; no model competence evidence.
function reply(view,mode){
  const verdict=mode==='reject'?'unsupported':mode==='uncertain'?'uncertain':'supported';
  const witness=()=>view.data.policy===SPLIT_INCOMPATIBILITY_WITNESS_LIVE_BINDINGS.reviewContract?
    {incompatibilityWitness:{kind:'none',sourceSentenceIds:[],assertedSourcePremise:'',incompatibility:''}}:{};
  return {reviewSha256:view.data.reviewSha256,judgments:view.data.spans.map(s=>view.data.stage==='claim'?{
    spanId:s.spanId,verdict,basis:verdict==='unsupported'?'insufficient_evidence':verdict,
    explanation:'PRIVATE_CLAIM_SENTINEL synthetic test.',evidence:[{sentenceId:view.data.catalog[0].sentenceId}],...witness(),
  }:{spanId:s.spanId,passageChecks:view.data.passages.map((p,i)=>({evidenceId:p.evidenceId,
    contribution:mode==='reject'?'context':mode==='uncertain'?(i?'context':'uncertain'):'support',qualification:'none',
    explanation:'Synthetic role check, not qualification.',evidence:[{sentenceId:view.data.catalog.find(e=>e.evidenceId===p.evidenceId).sentenceId}],...witness()}))})};
}
async function run(failure,at=3,encrypted=false,obligations=false){
  const witnesses=obligations==='witnesses',incompatibility=obligations==='incompatibility';
  const plan=(incompatibility?prepareIncompatibility:witnesses?prepareWitnesses:obligations?prepareObligations:prepare)(),views=plan.cases.flatMap(c=>[c.pair.claim,c.pair.checks]),network=[],requests=[],late=[];
  const otherViews=failure==='cross-revision'?(obligations?prepare:prepareObligations)().cases.flatMap(c=>[c.pair.claim,c.pair.checks]):null;
  const frozenRequests=views.map(v=>[`${v.prompt}\nJSON schema: ${JSON.stringify(v.schema)}`,JSON.stringify(v.data)]);
  const result=await (incompatibility?runSplitIncompatibilityWitnessLive:witnesses?runSplitScopeWitnessLive:obligations?runSplitObligationLive:runSplitPassageLive)({plan,publicKey,accountId:'0'.repeat(32),apiToken:'PRIVATE_TOKEN',...(encrypted?{}:{sealImpl:x=>x}),
    aiRequestImpl:async options=>{
      const i=requests.length;requests.push(options);late.push(options.fetchImpl);
      assert.equal(options.model,FREE_REASONING_WRITER_MODEL);assert.equal(options.reasoningEffort,'medium');
      assert.equal(options.maxTokens,4800);assert.equal(options.maxAttempts,1);assert.equal(options.timeoutMs,90000);
      assert.equal(options.temperature,0.1);assert.equal(options.maxRequestBytes,70000);assert.equal(options.maxResponseBytes,100000);
      assert.equal(options.responseFormat,'json_object');
      assert.deepEqual(options.messages.map(x=>x.content),frozenRequests[i]);
      assert.doesNotMatch(options.messages[1].content,/PRIVATE_CLAIM_SENTINEL|expectedVerdicts|qualificationAnchors|CS\d\d/);
      const url=workersAiRunUrl('0'.repeat(32),options.model),init={method:'POST',redirect:'error',body:JSON.stringify(buildWorkersAiRequest(options).body)};
      if(i===at&&failure==='no-network')return {};
      if(i===at&&['url','method','body','redirect'].includes(failure)){
        const bad={...init};if(failure==='method')bad.method='GET';if(failure==='body')bad.body='{}';if(failure==='redirect')bad.redirect='follow';
        try{await options.fetchImpl(failure==='url'?'https://unapproved.invalid/':url,bad);}catch{/* sticky */}
      }
      const answer=await requestWorkersAiEditorial(options);
      if(i===at){
        if(failure==='retry')try{await options.fetchImpl(url,init);}catch{/* sticky */}
        if(failure==='hash')answer.requestSha256='0'.repeat(64);if(failure==='provider')answer.provider='wrong';
        if(failure==='model')answer.model='wrong';if(failure==='attempt')answer.attemptCount=2;
        if(failure==='response-hash')answer.responseSha256='bad';
        if(failure==='accessor')Object.defineProperty(answer,'editorialPayload',{get(){assert.fail('getter executed');},enumerable:true});
      }
      return answer;
    },fetchImpl:async(url,init)=>{
      const i=network.length;network.push(1);
      assert.equal(url,`https://api.cloudflare.com/client/v4/accounts/${'0'.repeat(32)}/ai/run/@cf/openai/gpt-oss-120b`);
      assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
      if(i===at&&failure==='quota')return new Response(JSON.stringify({success:false,errors:[{code:3036,message:'PRIVATE_QUOTA'}]}),{status:429});
      if(i===at&&failure==='transport')throw new Error('PRIVATE_TRANSPORT');
      const p=reply(i===at&&otherViews?otherViews[i]:views[i],failure);
      if(i===at){
        if(failure==='binding')p.reviewSha256='0'.repeat(64);if(failure==='missing')p.judgments.pop();
        if(failure==='extra')p.approved='PRIVATE_EXTRA';
        if(failure==='malformed')p.judgments[0].passageChecks[0].qualification={text:'PRIVATE_MALFORMED'};
        if(failure==='conflict'){
          const row=p.judgments[0].passageChecks[0];Object.assign(row,{contribution:'contradiction',qualification:'missing'});
          if(incompatibility)row.incompatibilityWitness={kind:'contrary_instance',sourceSentenceIds:row.evidence.map(e=>e.sentenceId),
            assertedSourcePremise:'Fabricated anchored premise for a synthetic structural test.',incompatibility:'Synthetic contradictory premise.'};
        }
        if(failure==='uncited-final')p.judgments[0].passageChecks[0].evidence=[{sentenceId:views[i].data.catalog[1].sentenceId}];
        const witnessRow=views[i].data.stage==='claim'?p.judgments[0]:p.judgments[0].passageChecks[0];
        if(failure==='missing-witness')delete witnessRow.incompatibilityWitness;
        if(failure==='extra-witness')witnessRow.incompatibilityWitness.extra='PRIVATE_MALFORMED_WITNESS';
        if(failure==='nonempty-none')witnessRow.incompatibilityWitness.assertedSourcePremise='PRIVATE_MALFORMED_WITNESS';
        if(failure==='uncited-witness')Object.assign(witnessRow,{contribution:'contradiction',
          incompatibilityWitness:{kind:'contrary_instance',sourceSentenceIds:['S999P999S999'],assertedSourcePremise:'Synthetic premise.',incompatibility:'Synthetic incompatibility.'}});
      }
      const response=i===at&&failure==='truncation'?{choices:[{index:0,message:{role:'assistant',content:JSON.stringify(p)},finish_reason:'length'}],usage:{completion_tokens:4800}}:{response:JSON.stringify(p)};
      return new Response(JSON.stringify({success:true,result:response}),{headers:{'content-type':'application/json'}});
    }});
  assert.ok(requests.length<=16);assert.equal(result.report.outputBudget,requests.length*4800);
  assert.equal(network.length,result.report.networkRequests);assert.equal(result.report.fullControlsetPassed,false);
  for(const flag of ['modelQualified','articleApproved','publicationReady','emailSent','provenanceVerified'])assert.equal(result.report[flag],false);
  if(incompatibility)assert.equal(result.report.witnessSemanticsChecked,false);
  for(const fn of late)await assert.rejects(fn('https://unapproved.invalid/',{}),/SPLIT_PASSAGE_LIVE_NETWORK/);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_TOKEN/);assert.doesNotMatch(JSON.stringify(splitPassagePublicReport(result.report)),/PRIVATE_/);
  return {result,requests,plan};
}
test('eight predeclared balanced development cases prepare two blinded requests each',async()=>{
  const {result,requests,plan}=await run();assert.deepEqual(plan.cases.map(c=>c.caseId),['CS03','CS04','CS05','CS06','CS07','CS08','CS09','CS10']);
  assert.equal(plan.subsetSha256,'67cc8dccf3f58ba1c00b88245234eacce06f6ebc99e760bda03e2495e413feee');
  assert.equal(requests.length,16);assert.equal(result.report.casesValid,8);assert.equal(result.report.casesMatching,4);
  assert.equal(result.report.labelAgreementComplete,false);assert.equal(result.report.reasoningAgreementComplete,false);
  assert.equal(result.report.status,'review-complete-awaiting-independent-review');assert.equal(result.sealed.reasoningEffort,'medium');
  assert.deepEqual(SPLIT_PASSAGE_LIVE_LIMITS,{requests:16,tokensPerRequest:4800,outputTokens:76800,timeoutMs:90000});
  for(const [i,c]of result.sealed.calls.entries()){assert.equal(c.stage,i%2?'checks':'claim');assert.deepEqual(c.request,plan.cases[Math.floor(i/2)].pair[c.stage].data);}
  for(const r of result.sealed.scoring.results)assert.equal(r.composite.composition,'lossless-two-response-host-assembly');
  assert.equal(plan.reviewContract,'blinded-claim-passage-review-v1');
  assert.equal(sha(JSON.stringify(plan)),'464a5eec00c3d3b8267d0baefa61a1b1f98c944d9b3000b651dbd1896e868e77');
  assert.equal(sha(JSON.stringify(result.sealed.calls.map(c=>c.requestSha256))),'de5e85bcba57187cc97c0c5b7e2d2478d9d276fbdd1e390e3491a314e25c5c04');
});
test('explicit obligations live entry binds the reviewed prompts, full data, schemas and all sixteen requests',async()=>{
  const {result,requests,plan}=await run(undefined,3,false,true),old=prepare();
  assert.doesNotThrow(()=>assertSplitObligationLivePlan(plan));
  assert.equal(plan.reviewContract,'blinded-claim-passage-obligations-v2');
  assert.equal(plan.controlsetSha256,old.controlsetSha256);assert.equal(plan.subsetSha256,old.subsetSha256);
  assert.equal(plan.expectationsSha256,old.expectationsSha256);assert.deepEqual(plan.cases.map(c=>c.caseId),old.cases.map(c=>c.caseId));
  assert.equal(requests.length,16);assert.equal(result.report.outputBudget,76800);
  assert.equal(result.report.status,'review-complete-awaiting-independent-review');
  assert.equal(result.sealed.reviewContract,plan.reviewContract);assert.deepEqual(result.sealed.limits,SPLIT_PASSAGE_LIVE_LIMITS);
  assert.equal(result.sealed.scoring.reviewContract,plan.reviewContract);
  assert.equal(sha(JSON.stringify(plan.cases)),SPLIT_OBLIGATION_LIVE_BINDINGS.casesSha256);
  assert.equal(sha(JSON.stringify(result.sealed.calls.map(c=>c.requestSha256))),SPLIT_OBLIGATION_LIVE_BINDINGS.requestsSha256);
  for(const [i,c]of plan.cases.entries())for(const stage of ['claim','checks']){
    const view=c.pair[stage],previous=old.cases[i].pair[stage];
    assert.equal(sha(view.prompt),SPLIT_OBLIGATION_LIVE_BINDINGS[`${stage}PromptSha256`]);
    assert.equal(view.data.promptSha256,sha(view.prompt));assert.equal(view.data.policy,plan.reviewContract);
    const {reviewSha256,policy,promptSha256,...data}=view.data;
    const {reviewSha256:oldHash,policy:oldPolicy,promptSha256:oldPrompt,...oldData}=previous.data;
    assert.deepEqual(data,oldData);assert.notEqual(reviewSha256,oldHash);
    const schema=clone(view.schema);schema.properties.reviewSha256.enum=[oldHash];assert.deepEqual(schema,previous.schema);
    assert.ok(Object.isFrozen(view.data));assert.ok(Object.isFrozen(view.schema));
  }
});
test('explicit scope-witness live entry pins all sixteen requests and remains experimental with injected answers',async()=>{
  const {result,requests,plan}=await run(undefined,3,true,'witnesses');
  assert.doesNotThrow(()=>assertSplitScopeWitnessLivePlan(plan));
  assert.throws(()=>assertSplitScopeWitnessLivePlan(prepare()),/SPLIT_PASSAGE_LIVE_TARGET/);
  assert.throws(()=>assertSplitScopeWitnessLivePlan(prepareObligations()),/SPLIT_PASSAGE_LIVE_TARGET/);
  assert.throws(()=>assertSplitScopeWitnessLivePlan(clone(plan)));
  assert.equal(requests.length,16);assert.equal(result.report.outputBudget,76800);
  assert.equal(result.report.reasoningAgreementComplete,false);
  const capture=openDiagnostic(result.sealed,keys.privateKey.export({type:'pkcs8',format:'pem'}));
  assert.equal(capture.reviewContract,SPLIT_SCOPE_WITNESS_LIVE_BINDINGS.reviewContract);
  assert.equal(sha(JSON.stringify(plan.cases)),SPLIT_SCOPE_WITNESS_LIVE_BINDINGS.casesSha256);
  assert.equal(sha(JSON.stringify(capture.calls.map(c=>c.requestSha256))),SPLIT_SCOPE_WITNESS_LIVE_BINDINGS.requestsSha256);
  for(const {pair}of plan.cases)for(const stage of ['claim','checks'])
    assert.equal(sha(pair[stage].prompt),SPLIT_SCOPE_WITNESS_LIVE_BINDINGS[`${stage}PromptSha256`]);
  for(const flag of ['fullControlsetPassed','modelQualified','articleApproved','publicationReady','emailSent'])assert.equal(capture.report[flag],false);
});
test('explicit incompatibility-witness entry pins sixteen requests and preserves raw witnesses without semantic approval',async()=>{
  const {result,requests,plan}=await run(undefined,3,true,'incompatibility');
  assert.doesNotThrow(()=>assertSplitIncompatibilityWitnessLivePlan(plan));
  assert.deepEqual(SPLIT_INCOMPATIBILITY_WITNESS_LIVE_BINDINGS,{
    reviewContract:'blinded-claim-passage-incompatibility-witness-v4',
    claimPromptSha256:'b53c32622bee2051ff0a76ac982e141a02791d8de2082ce6a0f9cb905a14acc5',
    checksPromptSha256:'a3afae86cf66785aa83ecc28171c39c48132d38552c457fb041507dec2005568',
    casesSha256:'83df4289d88e0faecd370255e32915829845adb6b18ba0ba044ba1224d296a35',
    requestsSha256:'b03c06674bb1651608bbeb3508aba10c44a4972c1a1411847ac1c84633845fd2',
  });
  assert.equal(requests.length,16);assert.equal(result.report.outputBudget,76800);
  assert.equal(result.report.status,'review-complete-awaiting-independent-review');
  assert.equal(result.report.casesValid,8);assert.equal(result.report.casesMatching,4);
  assert.equal(result.report.reasoningAgreementComplete,false);
  assert.doesNotMatch(JSON.stringify(result.sealed),/PRIVATE_CLAIM_SENTINEL|incompatibilityWitness/);
  const capture=openDiagnostic(result.sealed,keys.privateKey.export({type:'pkcs8',format:'pem'}));
  assert.equal(capture.reviewContract,SPLIT_INCOMPATIBILITY_WITNESS_LIVE_BINDINGS.reviewContract);
  assert.equal(sha(JSON.stringify(plan.cases)),SPLIT_INCOMPATIBILITY_WITNESS_LIVE_BINDINGS.casesSha256);
  assert.equal(sha(JSON.stringify(capture.calls.map(c=>c.requestSha256))),SPLIT_INCOMPATIBILITY_WITNESS_LIVE_BINDINGS.requestsSha256);
  for(const [i,call]of capture.calls.entries()){
    const view=plan.cases[Math.floor(i/2)].pair[call.stage];
    assert.equal(sha(view.prompt),SPLIT_INCOMPATIBILITY_WITNESS_LIVE_BINDINGS[`${call.stage}PromptSha256`]);
    assert.deepEqual(call.response,reply(view));
    const fullValidation=validateSplitIncompatibilityWitnessStage(call.response,view);
    assert.deepEqual(fullValidation.rawSelection,call.response);
    assert.deepEqual(call.validation,splitIncompatibilityWitnessStageReport(fullValidation));
    assert.equal(call.validation.projection,'explicit-witness-removal-for-unchanged-core-validation');
    assert.notEqual(fullValidation.coreProjection.reviewSha256,call.response.reviewSha256);
    for(const key of ['rawSelection','coreProjection','coreValidation'])assert.equal(Object.hasOwn(call.validation,key),false);
    assert.equal(call.validation.witnessSemanticsChecked,false);
  }
  for(const row of capture.scoring.results){
    assert.equal(row.composite.composition,'raw-witness-responses-with-explicit-core-projection');
    for(const key of ['rawClaim','rawChecks','coreComposite'])assert.equal(Object.hasOwn(row.composite,key),false);
    for(const key of ['rawClaim','rawChecks'])assert.equal(Object.hasOwn(row,key),false);
    assert.equal(row.composite.witnessSemanticsChecked,false);
  }
  const records=plan.cases.map(({caseId},i)=>({caseId,claim:capture.calls[i*2].response,checks:capture.calls[i*2+1].response})),
    fullScoring=scoreIncompatibility(records,plan);
  assert.equal(capture.scoring.projection,'host-scoring-metadata-with-core-projection-raw-responses-in-calls-v1');
  assert.equal(capture.scoring.fullScoringSha256,sha(JSON.stringify(fullScoring)));
  assert.deepEqual(capture.scoring,splitIncompatibilityWitnessScoringReport(fullScoring));
  for(const out of [capture,capture.report,capture.scoring.report,splitPassagePublicReport(result.report)]){
    assert.equal(out.witnessSemanticsChecked,false);
    for(const flag of ['modelQualified','articleApproved','publicationReady'])assert.equal(out[flag],false);
    assert.match(out.independentReview,/required/);
  }
});
test('v4 entry rejects historical, copied and hostile plans before provider or network callbacks',async()=>{
  let reads=0,calls=0,network=0;const plan=prepareIncompatibility();
  const getter={get reviewContract(){reads++;return plan.reviewContract;}},
    proxy=new Proxy(plan,{get(){reads++;},ownKeys(){reads++;return[];}});
  for(const p of [prepare(),prepareObligations(),prepareWitnesses(),clone(plan),getter,proxy,null,[],{}]){
    assert.throws(()=>assertSplitIncompatibilityWitnessLivePlan(p));
    await assert.rejects(runSplitIncompatibilityWitnessLive({plan:p,publicKey,accountId:'0'.repeat(32),apiToken:'test',
      aiRequestImpl:async()=>{calls++;},fetchImpl:async()=>{network++;}}));
  }
  assert.equal(reads,0);assert.equal(calls,0);assert.equal(network,0);
});
for(const failure of ['quota','transport','no-network','url','method','body','redirect','retry','hash','provider','model','attempt','response-hash','accessor','truncation','binding','missing','extra','malformed','conflict','cross-revision','missing-witness','extra-witness','nonempty-none','uncited-witness'])
  test(`incompatibility witnesses ${failure} stops once and retains the independent-review hold`,async()=>{
    const {result,requests}=await run(failure,3,false,'incompatibility');
    assert.equal(requests.length,4);assert.equal(result.report.status,'failed');
    assert.equal(result.report.reasoningAgreementComplete,false);assert.equal(result.report.witnessSemanticsChecked,false);
    assert.equal(splitPassagePublicReport(result.report).witnessSemanticsChecked,false);
    if(failure==='conflict')assert.equal(result.sealed.scoring.results.at(-1).composite.code,'PASSAGE_SCOPE_CONSISTENCY');
    if(['missing-witness','extra-witness','nonempty-none','uncited-witness'].includes(failure))
      assert.equal(result.sealed.calls.at(-1).validation.valid,false);
  });
test('malformed first v4 witness is retained exactly inside encrypted evidence and makes no second call',async()=>{
  const {result,requests,plan}=await run('extra-witness',0,true,'incompatibility');
  assert.equal(requests.length,1);assert.equal(result.report.casesRecorded,0);
  assert.doesNotMatch(JSON.stringify(result.sealed),/PRIVATE_|incompatibilityWitness/);
  const capture=openDiagnostic(result.sealed,keys.privateKey.export({type:'pkcs8',format:'pem'})),expected=reply(plan.cases[0].pair.claim);
  expected.judgments[0].incompatibilityWitness.extra='PRIVATE_MALFORMED_WITNESS';
  assert.deepEqual(capture.calls[0].response,expected);assert.equal(capture.calls[0].validation.valid,false);
  assert.equal(capture.report.witnessSemanticsChecked,false);assert.equal(capture.emailSent,false);
});
for(const failure of ['quota','url','retry','hash','conflict','cross-revision','truncation'])
  test(`scope witnesses ${failure} stops without a retry or revised answer`,async()=>{
    const {result}=await run(failure,3,false,'witnesses');
    assert.equal(result.report.status,'failed');assert.equal(result.report.modelRequests,4);
    assert.equal(result.report.reasoningAgreementComplete,false);
  });
test('live entry points reject the other revision and hostile or unissued plans before inference',async()=>{
  let reads=0,calls=0;
  const getter={get reviewContract(){reads++;return SPLIT_OBLIGATION_LIVE_BINDINGS.reviewContract;}},
    proxy=new Proxy(prepareObligations(),{get(){reads++;},ownKeys(){reads++;return[];}});
  for(const [runner,check,wrong]of [[runSplitPassageLive,assertSplitPassageLivePlan,prepareObligations()],
    [runSplitObligationLive,assertSplitObligationLivePlan,prepare()]]){
    for(const plan of [wrong,getter,proxy,clone(wrong),null,[],{}]){
      assert.throws(()=>check(plan));
      await assert.rejects(runner({plan,publicKey,accountId:'0'.repeat(32),apiToken:'test',aiRequestImpl:async()=>{calls++;}}));
    }
  }
  assert.equal(reads,0);assert.equal(calls,0);
});
for(const obligations of [false,true])test(`cross-revision stage response stops ${obligations?'v2':'v1'} without repair or retry`,async()=>{
  const {result,requests}=await run('cross-revision',0,false,obligations);
  assert.equal(requests.length,1);assert.equal(result.report.casesRecorded,0);assert.equal(result.report.code,'SPLIT_PASSAGE_LIVE_STAGE_INVALID');
  assert.equal(result.sealed.calls[0].validation.code,'SPLIT_PASSAGE_BINDING');
  assert.notEqual(result.sealed.calls[0].response.reviewSha256,result.sealed.calls[0].request.reviewSha256);
});
for(const failure of ['quota','url','retry','hash','conflict'])test(`obligations ${failure} preserves the existing stop and no-retry rules`,async()=>{
  const {result,requests}=await run(failure,3,false,true);assert.equal(requests.length,4);
  assert.equal(result.report.status,'failed');assert.equal(result.report.structuralComplete,false);
  assert.equal(result.report.casesRecorded,failure==='conflict'?2:1);assert.equal(result.report.casesValid,1);
});
for(const mode of ['reject','uncertain'])test(`${mode} measures all eight cases without weakening acceptance`,async()=>{
  const {result,requests}=await run(mode);assert.equal(requests.length,16);assert.equal(result.report.casesValid,8);
  assert.equal(result.report.casesMatching,mode==='reject'?4:0);assert.equal(result.report.reasoningAgreementComplete,false);
});
for(const failure of ['quota','transport','no-network','url','method','body','redirect','retry','hash','provider','model','attempt','response-hash','accessor','truncation','binding','missing','extra','malformed','conflict','uncited-final']){
  test(`${failure} stops the sequence and never retries or completes the partial pair`,async()=>{
    const {result,requests}=await run(failure);assert.equal(requests.length,4);assert.equal(result.report.status,'failed');
    assert.equal(result.report.structuralComplete,false);assert.equal(result.report.casesValid,1);
    assert.equal(result.report.casesRecorded,['conflict','uncited-final'].includes(failure)?2:1);
    if(failure==='conflict')assert.equal(result.sealed.scoring.results.at(-1).composite.code,'PASSAGE_SCOPE_CONSISTENCY');
    if(failure==='truncation')assert.equal(result.sealed.failure.formatReason,'OUTPUT_TOKEN_LIMIT');
  });
}
test('malformed first claim makes no second model call and retains its unmodified raw output encrypted',async()=>{
  const {result,requests}=await run('extra',0,true);assert.equal(requests.length,1);assert.equal(result.report.casesRecorded,0);
  assert.doesNotMatch(JSON.stringify(result.sealed),/PRIVATE_EXTRA|PRIVATE_CLAIM_SENTINEL/);
  const c=openDiagnostic(result.sealed,keys.privateKey.export({type:'pkcs8',format:'pem'}));
  assert.equal(c.calls[0].response.approved,'PRIVATE_EXTRA');assert.equal(c.emailSent,false);
});
test('unissued plans and keys cannot start model inference',async()=>{
  const p=prepare();assert.throws(()=>assertSplitPassageLivePlan(clone(p)));
  for(const options of [{plan:clone(p),publicKey},{plan:p,publicKey:'bad'}]){
    let calls=0;await assert.rejects(runSplitPassageLive({...options,accountId:'0'.repeat(32),apiToken:'test',aiRequestImpl:async()=>{calls++;}}));assert.equal(calls,0);
  }
});
test('offline subset scoring rejects order substitutions and cannot declare full-corpus success',()=>{
  const p=prepare(),r=p.cases.map(c=>({caseId:c.caseId,claim:reply(c.pair.claim),checks:reply(c.pair.checks)}));
  const out=score(r,p);assert.equal(out.report.casesExpected,8);assert.equal(out.report.fullControlsetPassed,false);
  assert.equal(out.report.explanationsChecked,false);assert.throws(()=>score(r,clone(p)));assert.throws(()=>score([...r].reverse(),p));
  for(const change of [x=>{x[0].extra=true;},x=>{x[1]=clone(x[0]);}]){const bad=clone(r);change(bad);assert.throws(()=>score(bad,p));}
});
test('first live split trial preserves the exact disagreement and distinguishes anchor checks from composite validity',async()=>{
  const f=JSON.parse(await readFile(new URL('./fixtures/split-passage-live-36801262924.json',import.meta.url),'utf8'));
  const before=clone(f.records),out=score(f.records,prepare());
  assert.equal(out.report.casesRecorded,5);assert.equal(out.report.casesValid,4);
  assert.equal(out.report.casesMatching,4);assert.equal(out.report.reasoningFieldsMatching,4);
  assert.deepEqual(out.results.filter(x=>!x.reasoning.fieldsMatch).map(x=>x.caseId),['CS04']);
  assert.equal(out.results[1].reasoning.issues[0].expected,'insufficient_evidence');
  assert.equal(out.results[1].reasoning.issues[0].observed,'contradiction');
  const last=out.results.at(-1);assert.equal(last.caseId,'CS07');
  assert.equal(last.composite.code,'PASSAGE_SCOPE_CONSISTENCY');
  assert.equal(last.rawClaim.judgments[0].verdict,'supported');
  assert.equal(last.rawChecks.judgments[0].passageChecks[1].qualification,'missing');
  // The anchored qualification matches, but an unscored second row still fails.
  assert.equal(last.reasoning.fieldsMatch,true);assert.equal(last.composite.valid,false);
  assert.equal(out.report.reasoningAgreementComplete,false);assert.equal(out.report.modelQualified,false);
  assert.deepEqual(f.records,before);
});
test('unchanged v1 live entry replays all historical parsed replies and reproduces its exact report',async()=>{
  const f=JSON.parse(await readFile(new URL('./fixtures/split-passage-live-36801262924.json',import.meta.url),'utf8'));
  const responses=f.records.flatMap(r=>[r.claim,r.checks]),before=clone(responses);let calls=0;
  const result=await runSplitPassageLive({plan:prepare(),publicKey,accountId:'0'.repeat(32),apiToken:'fixture-only',sealImpl:x=>x,
    fetchImpl:async()=>new Response(JSON.stringify({success:true,result:{response:JSON.stringify(responses[calls++])}}),{headers:{'content-type':'application/json'}})});
  assert.equal(calls,10);assert.deepEqual(result.report,f.report);
  assert.deepEqual(result.sealed.calls.map(c=>c.response),responses);assert.deepEqual(responses,before);
  assert.equal(result.sealed.reviewContract,'blinded-claim-passage-review-v1');
});
test('injected perfect subset labels and anchors still cannot qualify the model or full corpus',()=>{
  const p=prepare(),records=p.cases.map(c=>{
    const gold=expectations.find(e=>e.caseId===c.caseId),claim=reply(c.pair.claim),checks=reply(c.pair.checks),a=claim.judgments[0],b=checks.judgments[0];
    Object.assign(a,{verdict:gold.verdict,basis:gold.basis,evidence:[]});
    b.passageChecks.forEach(x=>{x.contribution='context';x.qualification='none';});
    for(const anchor of gold.qualificationAnchors)b.passageChecks.find(x=>x.evidenceId===anchor.evidenceId).qualification=anchor.qualification;
    if(gold.basis==='supported'){
      b.passageChecks[0].contribution='support';a.evidence=clone(b.passageChecks[0].evidence);
      const extra=b.passageChecks.slice(1).find(x=>x.qualification==='preserved');if(extra)a.evidence.push(...clone(extra.evidence));
    }else if(gold.basis==='contradiction'){
      b.passageChecks[1].contribution='contradiction';a.evidence=clone(b.passageChecks[1].evidence);
    }
    return {caseId:c.caseId,claim,checks};
  });
  const out=score(records,p);assert.equal(out.report.casesValid,8);assert.equal(out.report.casesMatching,8);
  assert.equal(out.report.reasoningFieldsMatching,8);assert.equal(out.report.reasoningAgreementComplete,true);
  for(const flag of ['fullControlsetPassed','modelQualified','articleApproved','publicationReady','explanationsChecked','provenanceVerified'])assert.equal(out.report[flag],false);
});
test('public report cannot leak nested diagnostics, and malformed counts fail closed',async()=>{
  const {result}=await run('malformed');const report={...result.report,details:'PRIVATE_DETAIL'};
  assert.doesNotMatch(JSON.stringify(splitPassagePublicReport(report)),/PRIVATE_|reasoningFieldMismatches/);
  for(const k of ['modelRequests','casesValid','outputBudget'])for(const value of ['PRIVATE_SECRET',NaN,-1,1000000])assert.throws(()=>splitPassagePublicReport({...report,[k]:value}));
});
test('manual first-attempt owner/main workflow is read-only and excludes delivery and paid credentials',async()=>{
  const env={GITHUB_REPOSITORY:'itworksinprod/first-fold',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'itworksinprod/first-fold/.github/workflows/split-passage-live.yml@refs/heads/main',GITHUB_ACTOR:'itworksinprod',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1'};
  assert.doesNotThrow(()=>assertSplitPassageLiveAuthority(env));for(const k of Object.keys(env))assert.throws(()=>assertSplitPassageLiveAuthority({...env,[k]:'wrong'}));
  const s=await readFile(new URL('../.github/workflows/split-passage-live.yml',import.meta.url),'utf8');
  assert.match(s,/workflow_dispatch:/);assert.match(s,/contents: read/);assert.match(s,/persist-credentials: false/);assert.match(s,/retention-days: 1/);
  assert.match(s,/permissions: \{\}/);assert.match(s,/timeout-minutes: 30/);assert.match(s,/group: personal-morning-paper/);
  assert.match(s,/cancel-in-progress: false/);assert.match(s,/github\.run_attempt == 1/);
  assert.match(s,/split-passage-live\.mjs validate-obligations\s/);
  assert.match(s,/split-passage-live\.mjs run-obligations "\$RUNNER_TEMP\/split-passage-live\.encrypted\.json"/);
  assert.match(s,/scope_witnesses:[\s\S]*default: false[\s\S]*type: boolean/);
  assert.match(s,/incompatibility_witnesses:[\s\S]*default: false[\s\S]*type: boolean/);
  assert.match(s,/split-passage-live\.mjs validate-scope-witnesses\s/);
  assert.match(s,/split-passage-live\.mjs run-scope-witnesses "\$RUNNER_TEMP\/split-passage-live\.encrypted\.json"/);
  assert.match(s,/split-passage-live\.mjs validate-incompatibility-witnesses\s/);
  assert.match(s,/split-passage-live\.mjs run-incompatibility-witnesses "\$RUNNER_TEMP\/split-passage-live\.encrypted\.json"/);
  assert.match(s,/tests\/split-scope-witness\*\.test\.mjs/);
  assert.match(s,/tests\/split-incompatibility-witness\*\.test\.mjs/);
  assert.doesNotMatch(s,/split-passage-live\.mjs (?:validate|run)(?:\s|$)|\brevision:/);
  assert.doesNotMatch(s,/schedule:|pull_request|RESEND|GEMINI|OPENAI_API|PERSONAL_PAPER|contents: write/);
  assert.deepEqual([...s.matchAll(/secrets\.([A-Z_]+)/g)].map(x=>x[1]),['CLOUDFLARE_AI_API_TOKEN']);
  assert.equal([...s.matchAll(/uses: [^\s]+@[a-f0-9]{40}/g)].length,3);
});
test('explicit obligations CLI validates without provider credentials and retains strict command/path authority',()=>{
  const cli=new URL('../scripts/automation/split-passage-live.mjs',import.meta.url);
  const env={GITHUB_REPOSITORY:'itworksinprod/first-fold',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'itworksinprod/first-fold/.github/workflows/split-passage-live.yml@refs/heads/main',GITHUB_ACTOR:'itworksinprod',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',DIAGNOSTIC_PUBLIC_KEY:publicKey,RUNNER_TEMP:'/tmp'};
  const invoke=(args,changes={})=>spawnSync(process.execPath,[fileURLToPath(cli),...args],{env:{...env,...changes},encoding:'utf8'});
  for(const command of ['validate','validate-obligations','validate-scope-witnesses','validate-incompatibility-witnesses']){
    const result=invoke([command]);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');
    const untrusted=invoke([command],{GITHUB_RUN_ATTEMPT:'2'});assert.equal(untrusted.status,1);
    assert.match(untrusted.stderr,/SPLIT_PASSAGE_LIVE_AUTHORITY/);
  }
  for(const args of [['validate-obligations','extra'],['validate-obligations-extra'],['run-obligations'],
    ['run-obligations','/tmp/wrong.json'],['run-obligations','/tmp/split-passage-live.encrypted.json','extra'],
    ['validate-scope-witnesses','extra'],['validate-scope-witnesses-extra'],['run-scope-witnesses'],
    ['run-scope-witnesses','/tmp/wrong.json'],['run-scope-witnesses','/tmp/split-passage-live.encrypted.json','extra'],
    ['validate-incompatibility-witnesses','extra'],['validate-incompatibility-witnesses-extra'],['run-incompatibility-witnesses'],
    ['run-incompatibility-witnesses','/tmp/wrong.json'],['run-incompatibility-witnesses','/tmp/split-passage-live.encrypted.json','extra'],
    ['validate','--incompatibility-witnesses=true'],['validate-scope-witnesses','--incompatibility-witnesses=true']]){
    const result=invoke(args);assert.equal(result.status,1);assert.match(result.stderr,/SPLIT_PASSAGE_LIVE_ARGUMENTS/);
  }
});
test('both workflow routing blocks require exactly one explicit witness opt-in or the unchanged v2 default',async()=>{
  const s=await readFile(new URL('../.github/workflows/split-passage-live.yml',import.meta.url),'utf8');
  const blocks=[...s.matchAll(/^        run: \|\n((?:          [^\n]*\n)+)/gm)].map(m=>m[1].replace(/^          /gm,''));
  assert.equal(blocks.length,2);
  for(const [index,block]of blocks.entries()){
    const command=index?'run':'validate';
    for(const [scope,incompatibility,route]of [
      ['false','false','obligations'],['true','false','scope-witnesses'],['false','true','incompatibility-witnesses'],
      ['true','true',null],['','false',null],['false','',null],['TRUE','false',null],['false','$(exit 7)',null],
    ]){
      const out=spawnSync('/bin/bash',['--noprofile','--norc','-e','-o','pipefail','-c',
        `node(){ printf '%s\\n' "$*"; }\n${block}`],
        {env:{SCOPE_WITNESSES:scope,INCOMPATIBILITY_WITNESSES:incompatibility,RUNNER_TEMP:'/tmp'},encoding:'utf8'});
      assert.equal(out.status,route?0:1,`${index}:${scope}:${incompatibility}:${out.stderr}`);
      assert.equal(out.stdout,route?`scripts/automation/split-passage-live.mjs ${command}-${route}${index?' /tmp/split-passage-live.encrypted.json':''}\n`:'');
      assert.equal(out.stderr,'');
    }
  }
});
test('v4 public report cannot turn structural witness validation into semantic or release approval',async()=>{
  const {result}=await run(undefined,3,false,'incompatibility'),out=splitPassagePublicReport({...result.report,
    witnessSemanticsChecked:true,independentReview:'approved',modelQualified:true,articleApproved:true,publicationReady:true,emailSent:true,
    extra:{incompatibilityWitness:'PRIVATE_WITNESS'}});
  assert.equal(out.witnessSemanticsChecked,false);assert.equal(out.independentReview,'required');
  for(const flag of ['modelQualified','articleApproved','publicationReady','emailSent'])assert.equal(out[flag],false);
  assert.doesNotMatch(JSON.stringify(out),/PRIVATE_|incompatibilityWitness/);
  const old=await run();assert.equal(Object.hasOwn(old.result.report,'witnessSemanticsChecked'),false);
  assert.equal(Object.hasOwn(splitPassagePublicReport(old.result.report),'witnessSemanticsChecked'),false);
});
test('v4 compact stage metadata has fixed typed fields, no raw text and no semantic upgrades',()=>{
  const view=prepareIncompatibility().cases[0].pair.claim,validation=validateSplitIncompatibilityWitnessStage(reply(view),view),
    summary=splitIncompatibilityWitnessStageReport({...validation,modelQualified:true,witnessSemanticsChecked:true,details:'PRIVATE_DETAIL'});
  assert.deepEqual(summary,{valid:true,stage:'claim',code:null,projection:'explicit-witness-removal-for-unchanged-core-validation',
    witnessSemanticsChecked:false,independentReview:'required',modelQualified:false,articleApproved:false,publicationReady:false});
  assert.doesNotMatch(JSON.stringify(summary),/PRIVATE_|rawSelection|coreProjection|coreValidation/);
  const rejected=splitIncompatibilityWitnessStageReport({valid:false,code:'PRIVATE_SECRET',details:{rawSelection:'PRIVATE_DETAIL'}});
  assert.equal(rejected.code,'SPLIT_PASSAGE_LIVE_STAGE_INVALID');assert.equal(rejected.stage,null);assert.equal(rejected.projection,null);
  for(const value of [null,[],{}, {...validation,valid:1},{...validation,stage:'writer'},{...validation,projection:'PRIVATE_DETAIL'}])
    assert.throws(()=>splitIncompatibilityWitnessStageReport(value));
  let reads=0;const getter={get valid(){reads++;return true;}},proxy=new Proxy(validation,{get(){reads++;},ownKeys(){reads++;return[];}});
  for(const value of [getter,proxy])assert.throws(()=>splitIncompatibilityWitnessStageReport(value));
  assert.equal(reads,0);
});
function maximumWitnessReply(view,fill){
  const select=rows=>rows.map((r,i)=>({...r,index:i})).sort((a,b)=>b.sentenceId.length-a.sentenceId.length||a.index-b.index)
    .slice(0,2).sort((a,b)=>a.index-b.index).map(({sentenceId})=>({sentenceId}));
  const row=evidence=>({explanation:fill,evidence,incompatibilityWitness:{kind:'contrary_instance',
    sourceSentenceIds:evidence.map(e=>e.sentenceId),assertedSourcePremise:fill,incompatibility:fill}});
  return {reviewSha256:view.data.reviewSha256,judgments:view.data.spans.map(({spanId})=>view.data.stage==='claim'?
    {spanId,verdict:'unsupported',basis:'contradiction',...row(select(view.data.catalog))}:
    {spanId,passageChecks:view.data.passages.map(({evidenceId})=>({evidenceId,contribution:'contradiction',qualification:'uncertain',
      ...row(select(view.data.catalog.filter(s=>s.evidenceId===evidenceId)))}))})};
}
for(const [character,label]of [['漢','three-byte Unicode'],[String.fromCharCode(0xd800),'six-byte serialized surrogate']])
  for(const malformed of [false,true])test(`v4 bounded evidence seals all ${label} fields${malformed?' and the final near-100KB malformed answer':''}`,async()=>{
    // Worst serialization units in every allowed240-character field; these
    // injected answers test storage bounds, not semantic quality or live success.
    const plan=prepareIncompatibility(),views=plan.cases.flatMap(c=>[c.pair.claim,c.pair.checks]),answers=[];let calls=0,maximumEnvelope=0;
    const result=await runSplitIncompatibilityWitnessLive({plan,publicKey,accountId:'0'.repeat(32),apiToken:'boundary-only',
      now:new Date('2026-10-03T00:00:00.000Z'),fetchImpl:async()=>{
        const i=calls++,answer=malformed&&i===15?{privateMalformed:'漢'.repeat(33280)}:maximumWitnessReply(views[i],character.repeat(240));
        answers.push(clone(answer));const envelope=JSON.stringify({success:true,result:{response:JSON.stringify(answer)}});
        maximumEnvelope=Math.max(maximumEnvelope,Buffer.byteLength(envelope));assert.ok(Buffer.byteLength(envelope)<=100000);
        return new Response(envelope,{headers:{'content-type':'application/json'}});
      }});
    assert.equal(calls,16);assert.equal(result.report.modelRequests,16);assert.equal(result.report.outputBudget,76800);
    assert.equal(result.report.casesValid,malformed?7:8);assert.equal(result.report.status,malformed?'failed':'review-complete-awaiting-independent-review');
    const capture=openDiagnostic(result.sealed,keys.privateKey.export({type:'pkcs8',format:'pem'}));
    assert.deepEqual(capture.calls.map(c=>c.response),answers);assert.ok(Buffer.byteLength(JSON.stringify(capture))<=350000);
    assert.ok(Buffer.byteLength(JSON.stringify(capture))<310000);
    if(malformed){assert.equal(maximumEnvelope,99908);assert.equal(capture.calls[15].validation.valid,false);}
    const records=plan.cases.slice(0,malformed?7:8).map(({caseId},i)=>({caseId,claim:answers[i*2],checks:answers[i*2+1]})),
      full=scoreIncompatibility(records,plan);
    assert.equal(capture.scoring.fullScoringSha256,sha(JSON.stringify(full)));
    assert.deepEqual(capture.scoring,splitIncompatibilityWitnessScoringReport(full));
    for(const flag of ['modelQualified','articleApproved','publicationReady','emailSent','witnessSemanticsChecked'])assert.equal(capture.report[flag],false);
  });
test('v4 full-score hash and compact projection preserve decisions while refusing hostile host metadata',()=>{
  const plan=prepareIncompatibility(),records=plan.cases.map(({caseId,pair})=>({caseId,claim:reply(pair.claim),checks:reply(pair.checks)})),
    scoring=scoreIncompatibility(records,plan),before=JSON.stringify(scoring),out=splitIncompatibilityWitnessScoringReport(scoring);
  assert.equal(out.fullScoringSha256,sha(before));assert.equal(JSON.stringify(scoring),before);
  assert.deepEqual(out.report,scoring.report);
  for(const [i,row]of out.results.entries()){
    assert.deepEqual(row.reasoning,scoring.results[i].reasoning);assert.equal(row.labelMatch,scoring.results[i].labelMatch);
    assert.deepEqual(row.composite.coreProjection,scoring.results[i].composite.coreProjection);
    assert.deepEqual(row.composite.assembledSelection,scoring.results[i].composite.assembledSelection);
  }
  let reads=0;const getter=clone(scoring);Object.defineProperty(getter.results[0].composite,'code',{enumerable:true,get(){reads++;return 'PRIVATE_DETAIL';}});
  const proxy=clone(scoring);proxy.results[0].composite=new Proxy({}, {get(){reads++;},ownKeys(){reads++;return[];}});
  const cycle=clone(scoring);cycle.results[0].composite.self=cycle;
  for(const value of [getter,proxy,cycle,score([],prepare()),{},null])assert.throws(()=>splitIncompatibilityWitnessScoringReport(value));
  assert.equal(reads,0);
});
