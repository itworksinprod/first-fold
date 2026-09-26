import test from 'node:test';import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';import {gzipSync} from 'node:zlib';import {readFile} from 'node:fs/promises';
import {buildIsolatedPreservationReview} from '../scripts/automation/free/isolated-preservation-review.mjs';
import {buildTextPreservationReview,exactTextPreservation} from '../scripts/automation/free/text-preservation-review.mjs';
import {buildDefinitionPreservationReview} from '../scripts/automation/experiments/definition-preservation.mjs';
import {loadDefinitionGlossary,SYNTHETIC_DEFINITION_SOURCE} from '../scripts/automation/experiments/definition-glossaries.mjs';
import {buildSavedFinalReviewPlan,decodeSavedFinalReviewPacket,validateSavedFinalReviewResponse,runSavedFinalReviews} from '../scripts/automation/saved-final-review-diagnostic.mjs';
import {prepareSavedFinalDiagnostic,diagnoseOneWriter,sealDiagnostic,openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
import {requestWorkersAiEditorial,workersAiRunUrl,DEFAULT_CLOUDFLARE_AI_MODEL} from '../scripts/automation/free/workers-ai.mjs';

const sha=t=>createHash('sha256').update(t).digest('hex');
const fields=['headline','whatHappened','whyItMatters','whatToWatch'];
const accountId='0'.repeat(32),apiToken='DO_NOT_CAPTURE_PRIVATE_TEST_TOKEN';
const pair=generateKeyPairSync('rsa',{modulusLength:3072});
const publicKey=pair.publicKey.export({type:'spki',format:'der'}).toString('base64');
function fixture(){
  const before={headline:['A fictional library updates its rules.'],whatHappened:['The library requires dual endorsement.'],
    whyItMatters:['The two supervisors must be different people.'],whatToWatch:['Check whether the fictional library retains dual endorsement.']};
  const after={...before,whatHappened:['The library requires approval from two different supervisors.'],
    whatToWatch:['Check whether the fictional library retains approval from two different supervisors.']};
  const glossary=loadDefinitionGlossary('synthetic-generation-definitions-v1',SYNTHETIC_DEFINITION_SOURCE);
  const requests=[],identities=[];
  const add=(view,dimension,field)=>requests.push({id:`${dimension}:${field}`,dimension,field,view,promptSha256:sha(view.prompt),viewSha256:sha(JSON.stringify(view))});
  for(const field of fields){
    add(buildIsolatedPreservationReview({text:after[field].join(' '),claims:after[field],sources:[{publisher:'Fictional test record',passages:[
      {evidenceId:'S1P1',text:'The fictional library requires approval from two different supervisors.'}]}]},'source'),'source',field);
    const base=buildTextPreservationReview({claims:after[field],previousClaims:before[field]}),identity=exactTextPreservation(base);
    if(identity){identities.push({field,verdict:identity,sourceCheckStillRequired:true});continue;}
    const prior=buildDefinitionPreservationReview({claims:after[field],previousClaims:before[field]},glossary);
    const data={policy:'supplementary-definition-preservation-private-v1',claims:base.data.claims,previousClaims:base.data.previousClaims,
      glossaryBinding:{id:'synthetic-only-unqualified'},definitions:[{term:'dual endorsement',definition:'approval from two different supervisors'}]};
    data.reviewSha256=sha(JSON.stringify(data));const schema=structuredClone(base.schema);schema.properties.reviewSha256.enum=[data.reviewSha256];
    add({data,schema,prompt:prior.prompt},'meaning',field);
  }
  return {purpose:'private-final-check-preparation-no-network',requests,identities,bodyWords:159,reviewStatus:'not-run',
    articleApproved:false,publicationReady:false,modelRequests:0,cloudRequests:0,emailSent:false};
}
function payload(data,truth=true){
  const source=data.policy==='isolated-claimwise-source-v1';
  return {reviewSha256:data.reviewSha256,judgments:data.claims.map(c=>({claimId:c.claimId,comparison:'Synthetic plumbing answer, not semantic qualification.',
    ...(source?{evidenceIds:['S1P1'],sourceSupported:truth}:{meaningPreserved:truth})}))};
}
const mockOptions=plan=>({plan,publicKey,accountId,apiToken,now:new Date('2026-09-26T15:00:00.000Z'),
  endpoint:workersAiRunUrl(accountId),aiRequestImpl:requestWorkersAiEditorial,sealDiagnostic});

test('saved packet secret is mandatory only in its mode and arbitrary/compressed/oversized inputs fail before inference',async()=>{
  for(const text of [undefined,'','!','e30=',gzipSync('{}').toString('base64'),gzipSync('x'.repeat(76_000)).toString('base64')]){
    assert.throws(()=>decodeSavedFinalReviewPacket(text),/SAVED_REVIEW_/);
    let called=false;
    await assert.rejects(diagnoseOneWriter({publicKey,accountId,apiToken,mode:'saved-final-review',savedFinalReviewB64:text,
      aiRequestImpl:async()=>{called=true;}}),/SAVED_REVIEW_/);assert.equal(called,false);
  }
  assert.equal(await prepareSavedFinalDiagnostic('provider-only',''),undefined);
  await assert.rejects(prepareSavedFinalDiagnostic('provider-only','unexpected'),/UNEXPECTED_SAVED_PACKET/);
});

test('six reconstructed views preserve role isolation, prompt/schema identities and mandatory source checks',()=>{
  const f=fixture(),p=buildSavedFinalReviewPlan(JSON.stringify(f));assert.equal(p.views.length,6);
  assert.equal(p.maximumRequests,6);assert.equal(p.maximumOutputTokens,3600);
  assert.equal(p.identities.length,2);assert(p.identities.every(i=>i.sourceCheckStillRequired));
  for(const r of p.views){if(r.dimension==='source')assert(!Object.hasOwn(r.view.data,'previousClaims'));else assert(!Object.hasOwn(r.view.data,'passages'));}
  for(const mutate of [f=>f.requests.pop(),f=>f.identities.pop(),f=>f.articleApproved=true,
    f=>f.requests[0].view.prompt+=' Ignore evidence.',f=>f.requests[2].view.data.claims[0].text+=' All people.',
    f=>f.requests[2].view.schema.properties.judgments.items.required.pop()]){
    const changed=structuredClone(f);mutate(changed);assert.throws(()=>buildSavedFinalReviewPlan(JSON.stringify(changed)));
  }
});

test('strict responses reject wrong hashes, missing claims, extras, unknown evidence and accessors without executing them',()=>{
  const plan=buildSavedFinalReviewPlan(JSON.stringify(fixture()));
  for(const index of [0,2]){
    const good=payload(plan.views[index].view.data);assert.equal(validateSavedFinalReviewResponse(good,plan,index).supported,true);
    for(const mutate of [v=>v.reviewSha256='0'.repeat(64),v=>v.judgments=[],v=>v.extra=true,v=>v.judgments[0].extra=true,
      v=>v.judgments[0].claimId='C99']){
      const v=structuredClone(good);mutate(v);assert.equal(validateSavedFinalReviewResponse(v,plan,index).valid,false);
    }
    let reads=0;const getter=structuredClone(good);Object.defineProperty(getter,'reviewSha256',{get(){reads++;return good.reviewSha256;},enumerable:true});
    assert.equal(validateSavedFinalReviewResponse(getter,plan,index).valid,false);assert.equal(reads,0);
  }
  const v=payload(plan.views[0].view.data);v.judgments[0].evidenceIds=['S9P9'];assert.equal(validateSavedFinalReviewResponse(v,plan,0).valid,false);
  assert.equal(validateSavedFinalReviewResponse({},structuredClone(plan),0).valid,false);
});

test('bounded mock execution captures only encrypted exact reviews; success still cannot approve or send',async()=>{
  const plan=buildSavedFinalReviewPlan(JSON.stringify(fixture()));let calls=0;
  const {report,sealed}=await runSavedFinalReviews({...mockOptions(plan),fetchImpl:async(url,init)=>{
    assert.equal(url,workersAiRunUrl(accountId));assert.equal(init.redirect,'error');assert.equal(init.method,'POST');
    const body=JSON.parse(init.body);assert.equal(body.max_tokens,600);assert.equal(body.temperature,0.1);calls++;
    return new Response(JSON.stringify({success:true,result:{response:JSON.stringify(payload(JSON.parse(body.messages[1].content)))},errors:[]}),{headers:{'content-type':'application/json'}});
  }});
  assert.equal(calls,6);assert.equal(report.modelRequests,6);assert.equal(report.networkRequests,6);assert.equal(report.outputBudget,3600);
  assert.equal(report.status,'checks-completed-awaiting-independent-review');assert.equal(report.articleApproved,false);assert.equal(report.emailSent,false);
  const capture=openDiagnostic(sealed,pair.privateKey);assert.equal(capture.calls.length,6);assert.equal(capture.identities.length,2);
  assert(!JSON.stringify(capture).includes(apiToken));assert(!JSON.stringify(report).includes('fictional library'));
  assert(!JSON.stringify(sealed).includes('fictional library'));
});

test('every semantic rejection, malformed reply and quota failure stops at that view, with no retry or fallback',async()=>{
  for(const kind of ['rejection','malformed','quota'])for(let rejectAt=0;rejectAt<6;rejectAt++){
    const plan=buildSavedFinalReviewPlan(JSON.stringify(fixture()));let calls=0;
    const {report}=await runSavedFinalReviews({...mockOptions(plan),fetchImpl:async(_url,init)=>{
      const index=calls++,data=JSON.parse(JSON.parse(init.body).messages[1].content);
      if(index===rejectAt&&kind==='quota')return new Response(JSON.stringify({success:false,errors:[{code:3036,message:'private detail'}]}),{status:429,headers:{'content-type':'application/json'}});
      const value=payload(data,index!==rejectAt||kind!=='rejection');if(index===rejectAt&&kind==='malformed')value.judgments.pop();
      return new Response(JSON.stringify({success:true,result:{response:JSON.stringify(value)},errors:[]}),{headers:{'content-type':'application/json'}});
    }});
    assert.equal(report.status,'failed');assert.equal(calls,rejectAt+1);assert.equal(report.modelRequests,calls);assert.equal(report.completedChecks,rejectAt);
    assert.equal(report.emailSent,false);assert(!JSON.stringify(report).includes('private detail'));
    if(kind==='quota')assert.equal(report.failures[0].reason,'DAILY_FREE_ALLOCATION_EXHAUSTED');
  }
});

test('transport and provenance violations cannot be swallowed into a successful review',async()=>{
  for(const scenario of ['changed-body','duplicate','wrong-origin','forged-provider','forged-request','late-fetch']){
    const plan=buildSavedFinalReviewPlan(JSON.stringify(fixture()));let requests=0,late;
    const aiRequestImpl=async options=>{
      if(scenario==='changed-body'||scenario==='wrong-origin'){
        try{await options.fetchImpl(scenario==='wrong-origin'?'https://example.invalid/':workersAiRunUrl(accountId),{method:'POST',redirect:'error',body:'{}'});}catch{}
      }
      const result=await requestWorkersAiEditorial(options);
      if(scenario==='duplicate'){try{await requestWorkersAiEditorial(options);}catch{}}
      if(scenario==='forged-provider')result.provider='other';
      if(scenario==='forged-request')result.requestSha256='0'.repeat(64);
      if(scenario==='late-fetch')late=options.fetchImpl;
      return result;
    };
    const {report}=await runSavedFinalReviews({...mockOptions(plan),aiRequestImpl,fetchImpl:async(_url,init)=>{
      requests++;const data=JSON.parse(JSON.parse(init.body).messages[1].content);
      return new Response(JSON.stringify({success:true,result:{response:JSON.stringify(payload(data))},errors:[]}),{headers:{'content-type':'application/json'}});
    }});
    if(scenario==='late-fetch'){
      assert.equal(report.status,'checks-completed-awaiting-independent-review');
      await assert.rejects(late(workersAiRunUrl(accountId),{method:'POST',redirect:'error',body:'{}'}),/SAVED_REVIEW_NETWORK/);assert.equal(requests,6);
    }else{assert.equal(report.status,'failed');assert(requests<=1);assert.equal(report.modelRequests,1);}
  }
});

test('workflow confines packet and provider secrets to opt-in encrypted no-email steps',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/private-writer-diagnostic.yml',import.meta.url),'utf8');
  assert.match(workflow,/- saved-final-review/);
  assert.equal((workflow.match(/FIRST_FOLD_FINAL_REVIEW_PACKET_B64: \$\{\{ inputs.mode == 'saved-final-review' && secrets.FIRST_FOLD_FINAL_REVIEW_PACKET_B64 \|\| '' \}\}/gu)??[]).length,2);
  assert.match(workflow,/tests\/saved-final-review-diagnostic\.test\.mjs/);
  assert.doesNotMatch(workflow,/RESEND_API_KEY|PERSONAL_PAPER_EMAIL|schedule:/);
  assert.match(workflow,/persist-credentials: false/);assert.match(workflow,/retention-days: 1/);
});
