// Isolated passage review on frozen fictional controls. No article writing or approval.
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareJointPassageCalibration,scoreJointPassageCalibration} from './experiments/joint-passage-calibration.mjs';
import {assertSpanReviewJson} from './experiments/span-source-review.mjs';
import {diagnosticPublicKey,sealDiagnostic} from './private-writer-diagnostic.mjs';
import {buildWorkersAiRequest,requestWorkersAiEditorial,workersAiRunUrl,workersAiFailureDiagnostic,FREE_REASONING_WRITER_MODEL} from './free/workers-ai.mjs';

export const JOINT_PASSAGE_LIVE_CONTROLSET_SHA256='22ba98ba1abbc942aff656912fefb3f2c35aae2ba9bb56b736b8f7ccff2b6341';
export const JOINT_PASSAGE_LIVE_LIMITS=Object.freeze({requests:16,tokensPerRequest:4800,outputTokens:76800,timeoutMs:90000});
const sha=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>Object.assign(new Error(code),{code});

// Public notices are explicitly projected; malformed observed prose stays encrypted.
export function jointPassagePublicReport(report){
  assertSpanReviewJson(report);
  const knownCodes=new Set(['JOINT_PASSAGE_LIVE_TARGET','JOINT_PASSAGE_LIVE_AUTHORITY','JOINT_PASSAGE_LIVE_BUDGET',
    'JOINT_PASSAGE_LIVE_NETWORK','JOINT_PASSAGE_LIVE_PROVENANCE','JOINT_PASSAGE_LIVE_RESPONSE_INVALID','JOINT_PASSAGE_LIVE_FAILED']);
  const number=(x,max)=>{if(!Number.isInteger(x)||x<0||x>max)throw fail('JOINT_PASSAGE_LIVE_PUBLIC_REPORT');return x;};
  return {status:report.status==='review-complete-awaiting-independent-review'?report.status:'failed',
    code:report.code===null?null:knownCodes.has(report.code)?report.code:'PROVIDER_OR_TRANSPORT_FAILURE',
    modelRequests:number(report.modelRequests,16),networkRequests:number(report.networkRequests,16),
    requestedOutputCeiling:number(report.outputBudget,76800),casesRecorded:number(report.casesRecorded,16),
    casesValid:number(report.casesValid,16),casesMatching:number(report.casesMatching,16),
    reasoningFieldsMatching:number(report.reasoningFieldsMatching,16),
    structuralComplete:report.structuralComplete===true,labelAgreementComplete:report.labelAgreementComplete===true,
    reasoningAgreementComplete:report.reasoningAgreementComplete===true,
    independentReview:'required',modelQualified:false,articleApproved:false,publicationReady:false,emailSent:false};
}
export function assertJointPassageLivePlan(plan){
  // The offline scorer checks identity without executing untrusted plan accessors.
  scoreJointPassageCalibration([],plan);
  if(plan.controlsetSha256!==JOINT_PASSAGE_LIVE_CONTROLSET_SHA256||plan.cases.length!==16||
    plan.reviewContract!=='joint-passage-inference-v4'||
    plan.expectationsSha256!=='174aca301c001c89e9279177ee2529aeb010e288630ec8e432066821d5fde9d0')throw fail('JOINT_PASSAGE_LIVE_TARGET');
}
export function assertJointPassageLiveAuthority(env){
  if(env.GITHUB_REPOSITORY!=='itworksinprod/first-fold'||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_WORKFLOW_REF!=='itworksinprod/first-fold/.github/workflows/joint-passage-live.yml@refs/heads/main'||
    env.GITHUB_ACTOR!=='itworksinprod'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_RUN_ATTEMPT!=='1')throw fail('JOINT_PASSAGE_LIVE_AUTHORITY');
}
export async function runJointPassageLive({plan,publicKey,accountId,apiToken,now=new Date(),
  aiRequestImpl=requestWorkersAiEditorial,fetchImpl=fetch,sealImpl=sealDiagnostic}){
  assertJointPassageLivePlan(plan);diagnosticPublicKey(publicKey);
  const capture={purpose:'frozen-joint-passage-calibration-awaiting-independent-review',capturedAt:now.toISOString(),
    controlsetSha256:plan.controlsetSha256,reviewContract:plan.reviewContract,expectationsSha256:plan.expectationsSha256,limits:JOINT_PASSAGE_LIVE_LIMITS,reasoningEffort:'medium',calls:[],
    independentReview:'required-not-performed-by-this-workflow',emailSent:false};
  const records=[];
  let networkRequests=0,outputBudget=0,code=null;
  try{
    for(const item of plan.cases){
      const view=item.view,model=FREE_REASONING_WRITER_MODEL,prompt=`${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
      const options={model,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(view.data)}],
        schema:view.schema,responseFormat:'json_object',maxTokens:4800,maxAttempts:1,temperature:0.1,reasoningEffort:'medium',timeoutMs:90000,
        maxRequestBytes:70000,maxResponseBytes:100000};
      if(capture.calls.length>=16||outputBudget+4800>76800)throw fail('JOINT_PASSAGE_LIVE_BUDGET');
      const {body}=buildWorkersAiRequest(options),bodyText=JSON.stringify(body),endpoint=workersAiRunUrl(accountId,model);
      const requestSha256=sha(JSON.stringify({provider:'cloudflare-workers-ai',model,body}));
      const call={caseId:item.caseId,request:view.data,promptSha256:sha(prompt),requestSha256};
      capture.calls.push(call);outputBudget+=4800;
      let attempts=0,active=true,violation=false,result;
      try{result=await aiRequestImpl({...options,accountId,apiToken,
        validatePayload:x=>Boolean(x&&typeof x==='object'&&!Array.isArray(x)),fetchImpl:async(url,init)=>{
          if(!active||violation||url!==endpoint||init?.method!=='POST'||init.redirect!=='error'||init.body!==bodyText||attempts>=1||networkRequests>=16){
            violation=true;throw fail('JOINT_PASSAGE_LIVE_NETWORK');}
          attempts++;networkRequests++;return fetchImpl(url,init);
        }});
      }finally{active=false;}
      if(violation||attempts!==1)throw fail('JOINT_PASSAGE_LIVE_NETWORK');
      assertSpanReviewJson(result);
      if(result.provider!=='cloudflare-workers-ai'||result.model!==model||result.requestSha256!==requestSha256||
        !/^[a-f0-9]{64}$/.test(result.responseSha256??'')||result.attemptCount!==1)throw fail('JOINT_PASSAGE_LIVE_PROVENANCE');
      Object.assign(call,{provider:result.provider,model,responseSha256:result.responseSha256,attemptCount:1,response:structuredClone(result.editorialPayload)});
      records.push({caseId:item.caseId,response:call.response});
      const partial=scoreJointPassageCalibration(records,plan);
      call.verdict=partial.results.at(-1).verdict;
      if(!call.verdict.valid)throw fail('JOINT_PASSAGE_LIVE_RESPONSE_INVALID');
      // Valid disagreements are measurements, not reasons to retry or modify a case.
    }
  }catch(error){code=/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'JOINT_PASSAGE_LIVE_FAILED';capture.failure=workersAiFailureDiagnostic(error);}
  const scoring=scoreJointPassageCalibration(records,plan);
  const complete=!code&&scoring.report.structuralComplete;
  const report={status:complete?'review-complete-awaiting-independent-review':'failed',code,modelRequests:capture.calls.length,
    networkRequests,outputBudget,...scoring.report,writerRequests:0,searchQueries:0,emailSent:false};
  return {report,sealed:sealImpl({...capture,scoring,report},publicKey)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const [command,...args]=process.argv.slice(2);
    if(!((command==='validate'&&args.length===0)||(command==='run'&&args.length===1&&process.env.RUNNER_TEMP&&
      resolve(args[0])===resolve(process.env.RUNNER_TEMP,'joint-passage-live.encrypted.json'))))throw fail('JOINT_PASSAGE_LIVE_ARGUMENTS');
    assertJointPassageLiveAuthority(process.env);diagnosticPublicKey(process.env.DIAGNOSTIC_PUBLIC_KEY);
    const plan=prepareJointPassageCalibration();assertJointPassageLivePlan(plan);
    if(command==='run'){
      const {report,sealed}=await runJointPassageLive({plan,publicKey:process.env.DIAGNOSTIC_PUBLIC_KEY,
        accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_AI_API_TOKEN});
      await writeFile(args[0],JSON.stringify(sealed),{mode:0o600,flag:'wx'});
      console.info(`::notice title=Joint passage calibration::${JSON.stringify(jointPassagePublicReport(report))}`);if(report.status==='failed')process.exitCode=1;
    }
  }catch(error){console.error(`::error title=Joint passage calibration::${/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'JOINT_PASSAGE_LIVE_FAILED'}`);process.exitCode=1;}
}
