// Two known failures only: development evidence, never eight-case qualification.
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareSplitObligationCalibration} from './experiments/split-passage-calibration.mjs';
import {assertSplitObligationLivePlan} from './split-passage-live.mjs';
import {validateSplitPassageStage,combineSplitPassageReviews} from './experiments/split-passage-review.mjs';
import {assertSpanReviewJson} from './experiments/span-source-review.mjs';
import {CONDITIONAL_SCOPE_CONTROLS} from './experiments/conditional-scope-controls.mjs';
import {assessScopeReasoning} from './experiments/scope-reasoning-expectations.mjs';
import {diagnosticPublicKey,sealDiagnostic} from './private-writer-diagnostic.mjs';
import {buildWorkersAiRequest,requestWorkersAiEditorial,workersAiRunUrl,workersAiFailureDiagnostic,FREE_REASONING_WRITER_MODEL} from './free/workers-ai.mjs';

export const SPLIT_OBLIGATION_SMOKE_LIMITS=Object.freeze({requests:4,tokensPerRequest:4800,outputTokens:19200,timeoutMs:90000,maxRequestBytes:7000});
export const SPLIT_OBLIGATION_SMOKE_BINDINGS=Object.freeze({
  reviewContract:'blinded-claim-passage-obligations-v2',
  caseIds:Object.freeze(['CS04','CS07']),
  requestSha256:Object.freeze([
    '115cb224bfc0270eee49f750884cb10dbfdca52f14b0422e8402084844f3e42d',
    '6750287dc53136de354368cc2e0cf00a2ce24e74d8b42dd55d64de5ff0880ec2',
    '2ca5e7945daa2bdf8fbe76512354ad8da5ce9ba2fcda1d05b69fd98b0ecd4f6c',
    '48b5d4a7b959d91c9546d7fa71768b1c76bdd696a35a604b3bed07432f2ba325',
  ]),
});
const sha=x=>createHash('sha256').update(x).digest('hex'),fail=code=>Object.assign(new Error(code),{code});
const flags={knownFailureDevelopmentTest:true,fullSubsetPassed:false,fullControlsetPassed:false,
  explanationsChecked:false,provenanceVerified:false,modelQualified:false,articleApproved:false,publicationReady:false,independentReview:'required',emailSent:false};

// Preserve the full issued plan and its pins; selection is internal and fixed.
export function prepareSplitObligationSmoke(){return prepareSplitObligationCalibration();}
export function assertSplitObligationSmokePlan(plan){prepareRequests(plan);}
function prepareRequests(plan){
  assertSplitObligationLivePlan(plan);
  const requests=SPLIT_OBLIGATION_SMOKE_BINDINGS.caseIds.flatMap(caseId=>{
    const item=plan.cases.find(c=>c.caseId===caseId);
    return ['claim','checks'].map(stage=>{
      const view=item.pair[stage],prompt=`${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
      const options={model:FREE_REASONING_WRITER_MODEL,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(view.data)}],
        schema:view.schema,responseFormat:'json_object',maxTokens:4800,maxAttempts:1,temperature:0.1,reasoningEffort:'medium',timeoutMs:90000,
        maxRequestBytes:7000,maxResponseBytes:100000};
      const body=buildWorkersAiRequest(options).body,bodyText=JSON.stringify(body);
      if(Buffer.byteLength(bodyText,'utf8')>7000)throw fail('SPLIT_SMOKE_BUDGET');
      return {caseId,stage,view,options,bodyText,promptSha256:sha(prompt),
        requestSha256:sha(JSON.stringify({provider:'cloudflare-workers-ai',model:options.model,body}))};
    });
  });
  if(requests.length!==4||requests.some((r,i)=>r.requestSha256!==SPLIT_OBLIGATION_SMOKE_BINDINGS.requestSha256[i]))throw fail('SPLIT_SMOKE_TARGET');
  return requests;
}
export function assertSplitObligationSmokeAuthority(env){
  if(env.GITHUB_REPOSITORY!=='itworksinprod/first-fold'||env.GITHUB_REF!=='refs/heads/codex/remaining-allowance-smoke'||
    env.GITHUB_WORKFLOW_REF!=='itworksinprod/first-fold/.github/workflows/split-passage-live.yml@refs/heads/codex/remaining-allowance-smoke'||
    env.GITHUB_ACTOR!=='itworksinprod'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_RUN_ATTEMPT!=='1')throw fail('SPLIT_SMOKE_AUTHORITY');
}
export function splitObligationSmokePublicReport(report){
  assertSpanReviewJson(report);
  const codes=new Set(['SPLIT_SMOKE_TARGET','SPLIT_SMOKE_BUDGET','SPLIT_SMOKE_AUTHORITY','SPLIT_SMOKE_NETWORK',
    'SPLIT_SMOKE_PROVENANCE','SPLIT_SMOKE_STAGE_INVALID','SPLIT_SMOKE_COMPOSITE_INVALID','SPLIT_SMOKE_FAILED']);
  const number=(x,max)=>{if(!Number.isInteger(x)||x<0||x>max)throw fail('SPLIT_SMOKE_PUBLIC');return x;};
  return {status:report.status==='review-complete-awaiting-independent-review'?report.status:'failed',
    code:report.code===null?null:codes.has(report.code)?report.code:'PROVIDER_OR_TRANSPORT_FAILURE',
    scope:'two-known-failure-development-cases',modelRequests:number(report.modelRequests,4),networkRequests:number(report.networkRequests,4),
    requestedOutputCeiling:number(report.outputBudget,19200),casesExpected:2,casesRecorded:number(report.casesRecorded,2),
    casesValid:number(report.casesValid,2),casesMatching:number(report.casesMatching,2),reasoningFieldsMatching:number(report.reasoningFieldsMatching,2),
    structuralComplete:report.structuralComplete===true,labelAgreementComplete:report.labelAgreementComplete===true,
    reasoningAgreementComplete:report.reasoningAgreementComplete===true,...flags};
}
export async function runSplitObligationSmoke({plan,publicKey,accountId,apiToken,now=new Date(),
  aiRequestImpl=requestWorkersAiEditorial,fetchImpl=fetch,sealImpl=sealDiagnostic}){
  const requests=prepareRequests(plan);diagnosticPublicKey(publicKey);
  const endpoint=workersAiRunUrl(accountId,FREE_REASONING_WRITER_MODEL);
  const capture={purpose:'two-known-failure-development-cases-awaiting-independent-review',capturedAt:now.toISOString(),
    controlsetSha256:plan.controlsetSha256,subsetSha256:plan.subsetSha256,reviewContract:plan.reviewContract,expectationsSha256:plan.expectationsSha256,
    caseIds:SPLIT_OBLIGATION_SMOKE_BINDINGS.caseIds,limits:SPLIT_OBLIGATION_SMOKE_LIMITS,reasoningEffort:'medium',calls:[],
    independentReview:'required-not-performed-by-this-workflow',emailSent:false};
  const results=[];let pending,networkRequests=0,outputBudget=0,code=null;
  try{
    for(const request of requests){
      const {caseId,stage,view,options,bodyText,promptSha256,requestSha256}=request;
      if(capture.calls.length>=4||outputBudget+4800>19200)throw fail('SPLIT_SMOKE_BUDGET');
      const call={caseId,stage,request:view.data,promptSha256,requestSha256};capture.calls.push(call);outputBudget+=4800;
      let attempts=0,active=true,violation=false,result;
      try{result=await aiRequestImpl({...options,accountId,apiToken,validatePayload:x=>Boolean(x&&typeof x==='object'&&!Array.isArray(x)),
        fetchImpl:async(url,init)=>{
          if(!active||violation||url!==endpoint||init?.method!=='POST'||init.redirect!=='error'||init.body!==bodyText||attempts>=1||networkRequests>=4){
            violation=true;throw fail('SPLIT_SMOKE_NETWORK');}
          attempts++;networkRequests++;return fetchImpl(url,init);
        }});
      }finally{active=false;}
      if(violation||attempts!==1)throw fail('SPLIT_SMOKE_NETWORK');assertSpanReviewJson(result);
      if(result.provider!=='cloudflare-workers-ai'||result.model!==options.model||result.requestSha256!==requestSha256||
        !/^[a-f0-9]{64}$/.test(result.responseSha256??'')||result.attemptCount!==1)throw fail('SPLIT_SMOKE_PROVENANCE');
      Object.assign(call,{provider:result.provider,model:result.model,responseSha256:result.responseSha256,attemptCount:1,response:structuredClone(result.editorialPayload)});
      call.validation=validateSplitPassageStage(call.response,view);
      if(!call.validation.valid)throw fail('SPLIT_SMOKE_STAGE_INVALID');
      if(stage==='claim')pending={caseId,claim:call.response};
      else{
        if(!pending||pending.caseId!==caseId)throw fail('SPLIT_SMOKE_TARGET');
        const pair=plan.cases.find(c=>c.caseId===caseId).pair,control=CONDITIONAL_SCOPE_CONTROLS.find(c=>c.id===caseId);
        const composite=combineSplitPassageReviews(pending.claim,call.response,pair);
        const labelMatch=composite.valid&&composite.originalValidation.spans.every((s,n)=>s.verdict===control.expectedVerdicts[n]);
        results.push({caseId,rawClaim:structuredClone(pending.claim),rawChecks:structuredClone(call.response),composite,labelMatch,
          reasoning:assessScopeReasoning(caseId,composite.assembledSelection??null)});pending=undefined;
        if(!composite.valid)throw fail('SPLIT_SMOKE_COMPOSITE_INVALID');
      }
    }
  }catch(error){code=/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'SPLIT_SMOKE_FAILED';capture.failure=workersAiFailureDiagnostic(error);}
  const complete=results.length===2;
  const report={status:!code&&complete?'review-complete-awaiting-independent-review':'failed',code,scope:'two-known-failure-development-cases',
    modelRequests:capture.calls.length,networkRequests,outputBudget,casesExpected:2,casesRecorded:results.length,
    casesValid:results.filter(r=>r.composite.valid).length,casesMatching:results.filter(r=>r.labelMatch).length,
    reasoningFieldsMatching:results.filter(r=>r.reasoning.fieldsMatch).length,
    casesMissing:SPLIT_OBLIGATION_SMOKE_BINDINGS.caseIds.slice(results.length),
    invalidCases:results.filter(r=>!r.composite.valid).map(r=>({caseId:r.caseId,code:r.composite.code})),
    reasoningFieldMismatches:results.filter(r=>!r.reasoning.fieldsMatch).map(r=>({caseId:r.caseId,issues:r.reasoning.issues})),
    structuralComplete:complete&&results.every(r=>r.composite.valid),labelAgreementComplete:complete&&results.every(r=>r.labelMatch),
    reasoningAgreementComplete:complete&&results.every(r=>r.labelMatch&&r.reasoning.fieldsMatch),writerRequests:0,searchQueries:0,...flags};
  const scoring={reviewContract:plan.reviewContract,controlsetSha256:plan.controlsetSha256,subsetSha256:plan.subsetSha256,
    expectationsSha256:plan.expectationsSha256,report,results};
  return {report,sealed:sealImpl({...capture,scoring,report},publicKey)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const [command,...args]=process.argv.slice(2);
    if(!((command==='validate'&&args.length===0)||(command==='run'&&args.length===1&&process.env.RUNNER_TEMP&&
      resolve(args[0])===resolve(process.env.RUNNER_TEMP,'split-obligation-smoke.encrypted.json'))))throw fail('SPLIT_SMOKE_ARGUMENTS');
    assertSplitObligationSmokeAuthority(process.env);diagnosticPublicKey(process.env.DIAGNOSTIC_PUBLIC_KEY);
    const plan=prepareSplitObligationSmoke();assertSplitObligationSmokePlan(plan);
    if(command==='run'){
      const {report,sealed}=await runSplitObligationSmoke({plan,publicKey:process.env.DIAGNOSTIC_PUBLIC_KEY,
        accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_AI_API_TOKEN});
      await writeFile(args[0],JSON.stringify(sealed),{mode:0o600,flag:'wx'});
      console.info(`::notice title=Split obligation smoke::${JSON.stringify(splitObligationSmokePublicReport(report))}`);if(report.status==='failed')process.exitCode=1;
    }
  }catch(error){console.error(`::error title=Split obligation smoke::${/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'SPLIT_SMOKE_FAILED'}`);process.exitCode=1;}
}
