// Isolated two-response development subset. Never article or delivery approval.
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {types} from 'node:util';
import {prepareSplitPassageCalibration,prepareSplitObligationCalibration,prepareSplitScopeWitnessCalibration,scoreSplitPassageCalibration} from './experiments/split-passage-calibration.mjs';
import {validateSplitPassageStage} from './experiments/split-passage-review.mjs';
import {prepareSplitIncompatibilityWitnessCalibration,scoreSplitIncompatibilityWitnessCalibration} from './experiments/split-incompatibility-witness-calibration.mjs';
import {validateSplitIncompatibilityWitnessStage} from './experiments/split-incompatibility-witness-review.mjs';
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
export const SPLIT_SCOPE_WITNESS_LIVE_BINDINGS=Object.freeze({
  reviewContract:'blinded-claim-passage-scope-witness-v3',
  claimPromptSha256:'a1e4a0f75204b19fcba45ebe17911f8b772aa1020ef08ee6db7c752d0f3068f2',
  checksPromptSha256:'2cf1af8897105d444f1a63a0dfe8f7cdb4ed0c29d7fcec7962d9e41b59b597fa',
  casesSha256:'eadcc2e157d0ba029e35219e7b364f0114b02acd97ac0054604580a70ada3535',
  requestsSha256:'6d28bf8fd99b6269f6dc6713b41fa592864fdc3d42618e8c3ebc1535e15ef83d',
});
export const SPLIT_INCOMPATIBILITY_WITNESS_LIVE_BINDINGS=Object.freeze({
  reviewContract:'blinded-claim-passage-incompatibility-witness-v4',
  claimPromptSha256:'b53c32622bee2051ff0a76ac982e141a02791d8de2082ce6a0f9cb905a14acc5',
  checksPromptSha256:'a3afae86cf66785aa83ecc28171c39c48132d38552c457fb041507dec2005568',
  casesSha256:'83df4289d88e0faecd370255e32915829845adb6b18ba0ba044ba1224d296a35',
  requestsSha256:'b03c06674bb1651608bbeb3508aba10c44a4972c1a1411847ac1c84633845fd2',
});
const sha=x=>createHash('sha256').update(x).digest('hex'),fail=code=>Object.assign(new Error(code),{code});
// Preserve actual replies separately; this bounded metadata avoids duplicating
// every witness and core projection inside each call's encrypted status record.
export function splitIncompatibilityWitnessStageReport(validation){
  assertSpanReviewJson(validation);
  if(!validation||typeof validation!=='object'||Array.isArray(validation)||typeof validation.valid!=='boolean'||validation.valid&&
    (!['claim','checks'].includes(validation.stage)||validation.projection!=='explicit-witness-removal-for-unchanged-core-validation'))
    throw fail('SPLIT_PASSAGE_LIVE_STAGE_REPORT');
  const codes=new Set(['SPLIT_WITNESS_VIEW','SPLIT_WITNESS_DATA','SPLIT_WITNESS_BINDING','SPLIT_WITNESS_COVERAGE','SPLIT_WITNESS_PREMISE',
    'SPLIT_PASSAGE_VIEW','SPLIT_PASSAGE_DATA','SPLIT_PASSAGE_BINDING','SPLIT_PASSAGE_COVERAGE','SPLIT_PASSAGE_BASIS','SPLIT_PASSAGE_CHECK','SPLIT_PASSAGE_EVIDENCE','SPLIT_PASSAGE_CITATION']);
  return {valid:validation.valid,stage:validation.valid?validation.stage:null,
    code:validation.valid?null:codes.has(validation.code)?validation.code:'SPLIT_PASSAGE_LIVE_STAGE_INVALID',
    projection:validation.valid?'explicit-witness-removal-for-unchanged-core-validation':null,
    witnessSemanticsChecked:false,independentReview:'required',modelQualified:false,articleApproved:false,publicationReady:false};
}
// This guard accepts the scorer's optional undefined host fields (which ordinary
// JSON sealing omits), not provider data. Its larger bounds cover repeated,
// already-validated host projections; no input/response contract is relaxed.
function assertSplitWitnessHostScoring(root){
  let nodes=0,characters=0;const parents=new WeakSet();
  const visit=(x,depth)=>{
    if(++nodes>20000||depth>30)throw fail('SPLIT_PASSAGE_LIVE_SCORING_REPORT');
    if(x===undefined||x===null||typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x))return;
    if(typeof x==='string'){if((characters+=x.length)>500000)throw fail('SPLIT_PASSAGE_LIVE_SCORING_REPORT');return;}
    if(typeof x!=='object'||types.isProxy(x)||parents.has(x))throw fail('SPLIT_PASSAGE_LIVE_SCORING_REPORT');
    const array=Array.isArray(x),prototype=Object.getPrototypeOf(x);
    if(array?prototype!==Array.prototype:prototype!==Object.prototype)throw fail('SPLIT_PASSAGE_LIVE_SCORING_REPORT');
    const descriptors=Object.getOwnPropertyDescriptors(x),keys=Reflect.ownKeys(descriptors);
    if(keys.length>501||keys.some(k=>typeof k!=='string')||array&&(descriptors.length.value>500||keys.length!==descriptors.length.value+1||
      Array.from({length:descriptors.length.value},(_,i)=>String(i)).some(k=>!Object.hasOwn(descriptors,k))))throw fail('SPLIT_PASSAGE_LIVE_SCORING_REPORT');
    parents.add(x);
    for(const key of keys){if(array&&key==='length')continue;const descriptor=descriptors[key];
      if(!Object.hasOwn(descriptor,'value')||!descriptor.enumerable||array&&!/^(?:0|[1-9]\d*)$/.test(key))throw fail('SPLIT_PASSAGE_LIVE_SCORING_REPORT');
      if((characters+=key.length)>500000)throw fail('SPLIT_PASSAGE_LIVE_SCORING_REPORT');visit(descriptor.value,depth+1);
    }
    parents.delete(x);
  };visit(root,0);
}
export function splitIncompatibilityWitnessScoringReport(scoring){
  assertSplitWitnessHostScoring(scoring);
  if(scoring?.reviewContract!==SPLIT_INCOMPATIBILITY_WITNESS_LIVE_BINDINGS.reviewContract||!Array.isArray(scoring.results)||scoring.results.length>8)
    throw fail('SPLIT_PASSAGE_LIVE_SCORING_REPORT');
  const out={projection:'host-scoring-metadata-with-core-projection-raw-responses-in-calls-v1',fullScoringSha256:sha(JSON.stringify(scoring)),
    reviewContract:scoring.reviewContract,controlsetSha256:scoring.controlsetSha256,subsetSha256:scoring.subsetSha256,
    expectationsSha256:scoring.expectationsSha256,report:{...structuredClone(scoring.report),
      witnessSemanticsChecked:false,independentReview:'required',modelQualified:false,articleApproved:false,publicationReady:false},
    results:scoring.results.map(({caseId,labelMatch,reasoning,composite})=>({caseId,labelMatch,reasoning:structuredClone(reasoning),
      composite:{valid:composite.valid,supported:composite.supported,code:composite.code,
        ...(composite.composition?{composition:composite.composition}:{}),
        ...(composite.coreProjection?{coreProjection:structuredClone(composite.coreProjection)}:{}),
        ...(composite.assembledSelection?{assembledSelection:structuredClone(composite.assembledSelection)}:{}),
        witnessSemanticsChecked:false,independentReview:'required',modelQualified:false,articleApproved:false,publicationReady:false},
    }))};
  assertSpanReviewJson(out);return out;
}
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
    targetedDevelopmentSubset:true,fullControlsetPassed:false,...(Object.hasOwn(report,'witnessSemanticsChecked')?{witnessSemanticsChecked:false}:{}),
    independentReview:'required',modelQualified:false,articleApproved:false,publicationReady:false,emailSent:false};
}
export function assertSplitPassageLivePlan(plan){
  assertSplitLivePlan(plan,'blinded-claim-passage-review-v1');
}
export function assertSplitObligationLivePlan(plan){
  assertSplitBoundLivePlan(plan,SPLIT_OBLIGATION_LIVE_BINDINGS);
}
export function assertSplitScopeWitnessLivePlan(plan){
  assertSplitBoundLivePlan(plan,SPLIT_SCOPE_WITNESS_LIVE_BINDINGS);
}
export function assertSplitIncompatibilityWitnessLivePlan(plan){
  assertSplitBoundLivePlan(plan,SPLIT_INCOMPATIBILITY_WITNESS_LIVE_BINDINGS,scoreSplitIncompatibilityWitnessCalibration);
}
function assertSplitBoundLivePlan(plan,bindings,score=scoreSplitPassageCalibration){
  assertSplitLivePlan(plan,bindings.reviewContract,score);
  for(const {pair}of plan.cases)for(const stage of ['claim','checks']){
    const view=pair[stage],expected=bindings[`${stage}PromptSha256`];
    if(view.data.policy!==bindings.reviewContract||view.data.stage!==stage||
      view.data.promptSha256!==expected||sha(view.prompt)!==expected)throw fail('SPLIT_PASSAGE_LIVE_TARGET');
  }
  // Pin the complete ordered data, schemas and instructions, not just their labels.
  if(sha(JSON.stringify(plan.cases))!==bindings.casesSha256)throw fail('SPLIT_PASSAGE_LIVE_TARGET');
}
function assertSplitLivePlan(plan,reviewContract,score=scoreSplitPassageCalibration){
  score([],plan);
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
export async function runSplitScopeWitnessLive(options){
  return runSplitLive(options,assertSplitScopeWitnessLivePlan,SPLIT_SCOPE_WITNESS_LIVE_BINDINGS.requestsSha256);
}
export async function runSplitIncompatibilityWitnessLive(options){
  return runSplitLive(options,assertSplitIncompatibilityWitnessLivePlan,SPLIT_INCOMPATIBILITY_WITNESS_LIVE_BINDINGS.requestsSha256,
    {validateStage:validateSplitIncompatibilityWitnessStage,score:scoreSplitIncompatibilityWitnessCalibration,witnesses:true});
}
async function runSplitLive({plan,publicKey,accountId,apiToken,now=new Date(),
  aiRequestImpl=requestWorkersAiEditorial,fetchImpl=fetch,sealImpl=sealDiagnostic},assertPlan,requestsSha256,
  {validateStage=validateSplitPassageStage,score=scoreSplitPassageCalibration,witnesses=false}={}){
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
    limits:SPLIT_PASSAGE_LIVE_LIMITS,reasoningEffort:'medium',calls:[],independentReview:'required-not-performed-by-this-workflow',emailSent:false,
    ...(witnesses?{witnessSemanticsChecked:false,modelQualified:false,articleApproved:false,publicationReady:false}:{})};
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
      const validation=validateStage(call.response,view);
      call.validation=witnesses?splitIncompatibilityWitnessStageReport(validation):validation;
      if(!validation.valid)throw fail('SPLIT_PASSAGE_LIVE_STAGE_INVALID');
      if(stage==='claim')pending={caseId,claim:call.response};
      else{
        if(!pending||pending.caseId!==caseId)throw fail('SPLIT_PASSAGE_LIVE_TARGET');
        records.push({...pending,checks:call.response});pending=undefined;
        const partial=score(records,plan);
        if(!partial.results.at(-1).composite.valid)throw fail('SPLIT_PASSAGE_LIVE_COMPOSITE_INVALID');
      }
      // Valid disagreements with frozen gold remain measurements, never retries.
    }
  }catch(error){code=/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'SPLIT_PASSAGE_LIVE_FAILED';capture.failure=workersAiFailureDiagnostic(error);}
  const scoring=score(records,plan),complete=!code&&scoring.report.structuralComplete;
  const report={status:complete?'review-complete-awaiting-independent-review':'failed',code,modelRequests:capture.calls.length,networkRequests,outputBudget,
    ...scoring.report,writerRequests:0,searchQueries:0,emailSent:false};
  return {report,sealed:sealImpl({...capture,scoring:witnesses?splitIncompatibilityWitnessScoringReport(scoring):scoring,report},publicKey)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const [command,...args]=process.argv.slice(2);
    const obligations=command==='validate-obligations'||command==='run-obligations';
    const witnesses=command==='validate-scope-witnesses'||command==='run-scope-witnesses';
    const incompatibility=command==='validate-incompatibility-witnesses'||command==='run-incompatibility-witnesses';
    const running=command==='run'||command==='run-obligations'||command==='run-scope-witnesses'||command==='run-incompatibility-witnesses';
    if(!(((command==='validate'||command==='validate-obligations'||command==='validate-scope-witnesses'||command==='validate-incompatibility-witnesses')&&args.length===0)||(running&&args.length===1&&process.env.RUNNER_TEMP&&
      resolve(args[0])===resolve(process.env.RUNNER_TEMP,'split-passage-live.encrypted.json'))))throw fail('SPLIT_PASSAGE_LIVE_ARGUMENTS');
    assertSplitPassageLiveAuthority(process.env);diagnosticPublicKey(process.env.DIAGNOSTIC_PUBLIC_KEY);
    const prepare=incompatibility?prepareSplitIncompatibilityWitnessCalibration:witnesses?prepareSplitScopeWitnessCalibration:obligations?prepareSplitObligationCalibration:prepareSplitPassageCalibration;
    const assertPlan=incompatibility?assertSplitIncompatibilityWitnessLivePlan:witnesses?assertSplitScopeWitnessLivePlan:obligations?assertSplitObligationLivePlan:assertSplitPassageLivePlan;
    const run=incompatibility?runSplitIncompatibilityWitnessLive:witnesses?runSplitScopeWitnessLive:obligations?runSplitObligationLive:runSplitPassageLive;
    const plan=prepare();assertPlan(plan);
    if(running){
      const {report,sealed}=await run({plan,publicKey:process.env.DIAGNOSTIC_PUBLIC_KEY,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_AI_API_TOKEN});
      await writeFile(args[0],JSON.stringify(sealed),{mode:0o600,flag:'wx'});
      console.info(`::notice title=Split passage calibration::${JSON.stringify(splitPassagePublicReport(report))}`);if(report.status==='failed')process.exitCode=1;
    }
  }catch(error){console.error(`::error title=Split passage calibration::${/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'SPLIT_PASSAGE_LIVE_FAILED'}`);process.exitCode=1;}
}
