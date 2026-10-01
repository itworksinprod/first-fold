// Isolated two-response development subset. Never article or delivery approval.
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareSplitPassageCalibration,prepareSplitObligationCalibration,scoreSplitPassageCalibration} from './experiments/split-passage-calibration.mjs';
import {validateSplitPassageStage} from './experiments/split-passage-review.mjs';
import {assertSpanReviewJson} from './experiments/span-source-review.mjs';
import {diagnosticPublicKey,sealDiagnostic} from './private-writer-diagnostic.mjs';
import {buildWorkersAiRequest,requestWorkersAiEditorial,workersAiRunUrl,workersAiFailureDiagnostic,FREE_REASONING_WRITER_MODEL} from './free/workers-ai.mjs';

export const SPLIT_PASSAGE_LIVE_LIMITS=Object.freeze({requests:16,tokensPerRequest:4800,outputTokens:76800,timeoutMs:90000});
export const SPLIT_OBLIGATION_LIVE_BINDINGS=Object.freeze({
  reviewContract:'blinded-claim-passage-obligations-v2',
  claimPromptSha256:'2bf5d26d435a61fe402f43390c8479ff760437aedde031ee69234bde558e8c85',
  checksPromptSha256:'3720d5f7e2b7b26263271ad3e6d48ac57ea66f9bd169b961a9edfdb7f3614732',
  casesSha256:'dadec747c86a14ea3e5db4878f556d0917b40f69f0b1ff6465f905caa3bc05f7',
  requestsSha256:'f5e0003fcb0a6d7a41ae6ea4aa527682c66080e0435af63279b4600c75a56cd1',
});
const sha=x=>createHash('sha256').update(x).digest('hex'),fail=code=>Object.assign(new Error(code),{code});
export function splitPassagePublicReport(report){
  assertSpanReviewJson(report);
  const codes=new Set(['SPLIT_PASSAGE_LIVE_TARGET','SPLIT_PASSAGE_LIVE_AUTHORITY','SPLIT_PASSAGE_LIVE_NETWORK',
    'SPLIT_PASSAGE_LIVE_PROVENANCE','SPLIT_PASSAGE_LIVE_STAGE_INVALID','SPLIT_PASSAGE_LIVE_COMPOSITE_INVALID','SPLIT_PASSAGE_LIVE_FAILED']);
  const number=(x,max)=>{if(!Number.isInteger(x)||x<0||x>max)throw fail('SPLIT_PASSAGE_LIVE_PUBLIC');return x;};
  return {status:report.status==='review-complete-awaiting-independent-review'?report.status:'failed',
    code:report.code===null?null:codes.has(report.code)?report.code:'PROVIDER_OR_TRANSPORT_FAILURE',
    modelRequests:number(report.modelRequests,16),networkRequests:number(report.networkRequests,16),requestedOutputCeiling:number(report.outputBudget,76800),
    casesExpected:8,casesRecorded:number(report.casesRecorded,8),casesValid:number(report.casesValid,8),casesMatching:number(report.casesMatching,8),
    reasoningFieldsMatching:number(report.reasoningFieldsMatching,8),structuralComplete:report.structuralComplete===true,
    labelAgreementComplete:report.labelAgreementComplete===true,reasoningAgreementComplete:report.reasoningAgreementComplete===true,
    targetedDevelopmentSubset:true,fullControlsetPassed:false,independentReview:'required',modelQualified:false,articleApproved:false,publicationReady:false,emailSent:false};
}
export function assertSplitPassageLivePlan(plan){
  assertSplitLivePlan(plan,'blinded-claim-passage-review-v1');
}
export function assertSplitObligationLivePlan(plan){
  assertSplitLivePlan(plan,SPLIT_OBLIGATION_LIVE_BINDINGS.reviewContract);
  for(const {pair}of plan.cases)for(const stage of ['claim','checks']){
    const view=pair[stage],expected=SPLIT_OBLIGATION_LIVE_BINDINGS[`${stage}PromptSha256`];
    if(view.data.policy!==SPLIT_OBLIGATION_LIVE_BINDINGS.reviewContract||view.data.stage!==stage||
      view.data.promptSha256!==expected||sha(view.prompt)!==expected)throw fail('SPLIT_PASSAGE_LIVE_TARGET');
  }
  // Pin the complete ordered data, schemas and instructions, not just their labels.
  if(sha(JSON.stringify(plan.cases))!==SPLIT_OBLIGATION_LIVE_BINDINGS.casesSha256)throw fail('SPLIT_PASSAGE_LIVE_TARGET');
}
function assertSplitLivePlan(plan,reviewContract){
  scoreSplitPassageCalibration([],plan);
  if(plan.reviewContract!==reviewContract||plan.cases.length!==8||
    plan.cases.map(c=>c.caseId).join(',')!=='CS03,CS04,CS05,CS06,CS07,CS08,CS09,CS10'||
    plan.controlsetSha256!=='22ba98ba1abbc942aff656912fefb3f2c35aae2ba9bb56b736b8f7ccff2b6341'||
    plan.subsetSha256!=='67cc8dccf3f58ba1c00b88245234eacce06f6ebc99e760bda03e2495e413feee'||
    plan.expectationsSha256!=='174aca301c001c89e9279177ee2529aeb010e288630ec8e432066821d5fde9d0')throw fail('SPLIT_PASSAGE_LIVE_TARGET');
}
export function assertSplitPassageLiveAuthority(env){
  if(env.GITHUB_REPOSITORY!=='itworksinprod/first-fold'||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_WORKFLOW_REF!=='itworksinprod/first-fold/.github/workflows/split-passage-live.yml@refs/heads/main'||
    env.GITHUB_ACTOR!=='itworksinprod'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_RUN_ATTEMPT!=='1')throw fail('SPLIT_PASSAGE_LIVE_AUTHORITY');
}
export async function runSplitPassageLive(options){
  return runSplitLive(options,assertSplitPassageLivePlan);
}
export async function runSplitObligationLive(options){
  return runSplitLive(options,assertSplitObligationLivePlan,SPLIT_OBLIGATION_LIVE_BINDINGS.requestsSha256);
}
async function runSplitLive({plan,publicKey,accountId,apiToken,now=new Date(),
  aiRequestImpl=requestWorkersAiEditorial,fetchImpl=fetch,sealImpl=sealDiagnostic},assertPlan,requestsSha256){
  assertPlan(plan);diagnosticPublicKey(publicKey);
  // Both blinded requests for every case exist before any model output exists.
  const requests=plan.cases.flatMap(item=>['claim','checks'].map(stage=>{
    const view=item.pair[stage],prompt=`${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
    const options={model:FREE_REASONING_WRITER_MODEL,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(view.data)}],
      schema:view.schema,responseFormat:'json_object',maxTokens:4800,maxAttempts:1,temperature:0.1,reasoningEffort:'medium',timeoutMs:90000,
      maxRequestBytes:70000,maxResponseBytes:100000};
    const bodyText=JSON.stringify(buildWorkersAiRequest(options).body),endpoint=workersAiRunUrl(accountId,options.model);
    return {caseId:item.caseId,stage,view,options,bodyText,endpoint,promptSha256:sha(prompt),
      requestSha256:sha(JSON.stringify({provider:'cloudflare-workers-ai',model:options.model,body:JSON.parse(bodyText)}))};
  }));
  if(requestsSha256&&sha(JSON.stringify(requests.map(r=>r.requestSha256)))!==requestsSha256)throw fail('SPLIT_PASSAGE_LIVE_TARGET');
  const capture={purpose:'frozen-split-passage-subset-awaiting-independent-review',capturedAt:now.toISOString(),
    controlsetSha256:plan.controlsetSha256,subsetSha256:plan.subsetSha256,reviewContract:plan.reviewContract,expectationsSha256:plan.expectationsSha256,
    limits:SPLIT_PASSAGE_LIVE_LIMITS,reasoningEffort:'medium',calls:[],independentReview:'required-not-performed-by-this-workflow',emailSent:false};
  const records=[];let pending,networkRequests=0,outputBudget=0,code=null;
  try{
    for(const request of requests){
      const {caseId,stage,view,options,bodyText,endpoint,promptSha256,requestSha256}=request;
      if(capture.calls.length>=16||outputBudget+4800>76800)throw fail('SPLIT_PASSAGE_LIVE_TARGET');
      const call={caseId,stage,request:view.data,promptSha256,requestSha256};capture.calls.push(call);outputBudget+=4800;
      let attempts=0,active=true,violation=false,result;
      try{result=await aiRequestImpl({...options,accountId,apiToken,validatePayload:x=>Boolean(x&&typeof x==='object'&&!Array.isArray(x)),
        fetchImpl:async(url,init)=>{
          if(!active||violation||url!==endpoint||init?.method!=='POST'||init.redirect!=='error'||init.body!==bodyText||attempts>=1||networkRequests>=16){
            violation=true;throw fail('SPLIT_PASSAGE_LIVE_NETWORK');}
          attempts++;networkRequests++;return fetchImpl(url,init);
        }});
      }finally{active=false;}
      if(violation||attempts!==1)throw fail('SPLIT_PASSAGE_LIVE_NETWORK');assertSpanReviewJson(result);
      if(result.provider!=='cloudflare-workers-ai'||result.model!==options.model||result.requestSha256!==requestSha256||
        !/^[a-f0-9]{64}$/.test(result.responseSha256??'')||result.attemptCount!==1)throw fail('SPLIT_PASSAGE_LIVE_PROVENANCE');
      Object.assign(call,{provider:result.provider,model:result.model,responseSha256:result.responseSha256,attemptCount:1,response:structuredClone(result.editorialPayload)});
      call.validation=validateSplitPassageStage(call.response,view);
      if(!call.validation.valid)throw fail('SPLIT_PASSAGE_LIVE_STAGE_INVALID');
      if(stage==='claim')pending={caseId,claim:call.response};
      else{
        if(!pending||pending.caseId!==caseId)throw fail('SPLIT_PASSAGE_LIVE_TARGET');
        records.push({...pending,checks:call.response});pending=undefined;
        const partial=scoreSplitPassageCalibration(records,plan);
        if(!partial.results.at(-1).composite.valid)throw fail('SPLIT_PASSAGE_LIVE_COMPOSITE_INVALID');
      }
      // Valid disagreements with frozen gold remain measurements, never retries.
    }
  }catch(error){code=/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'SPLIT_PASSAGE_LIVE_FAILED';capture.failure=workersAiFailureDiagnostic(error);}
  const scoring=scoreSplitPassageCalibration(records,plan),complete=!code&&scoring.report.structuralComplete;
  const report={status:complete?'review-complete-awaiting-independent-review':'failed',code,modelRequests:capture.calls.length,networkRequests,outputBudget,
    ...scoring.report,writerRequests:0,searchQueries:0,emailSent:false};
  return {report,sealed:sealImpl({...capture,scoring,report},publicKey)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const [command,...args]=process.argv.slice(2);
    const obligations=command==='validate-obligations'||command==='run-obligations',running=command==='run'||command==='run-obligations';
    if(!(((command==='validate'||command==='validate-obligations')&&args.length===0)||(running&&args.length===1&&process.env.RUNNER_TEMP&&
      resolve(args[0])===resolve(process.env.RUNNER_TEMP,'split-passage-live.encrypted.json'))))throw fail('SPLIT_PASSAGE_LIVE_ARGUMENTS');
    assertSplitPassageLiveAuthority(process.env);diagnosticPublicKey(process.env.DIAGNOSTIC_PUBLIC_KEY);
    const plan=obligations?prepareSplitObligationCalibration():prepareSplitPassageCalibration();
    (obligations?assertSplitObligationLivePlan:assertSplitPassageLivePlan)(plan);
    if(running){
      const {report,sealed}=await (obligations?runSplitObligationLive:runSplitPassageLive)({plan,publicKey:process.env.DIAGNOSTIC_PUBLIC_KEY,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_AI_API_TOKEN});
      await writeFile(args[0],JSON.stringify(sealed),{mode:0o600,flag:'wx'});
      console.info(`::notice title=Split passage calibration::${JSON.stringify(splitPassagePublicReport(report))}`);if(report.status==='failed')process.exitCode=1;
    }
  }catch(error){console.error(`::error title=Split passage calibration::${/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'SPLIT_PASSAGE_LIVE_FAILED'}`);process.exitCode=1;}
}
