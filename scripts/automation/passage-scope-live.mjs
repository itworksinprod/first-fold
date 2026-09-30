// Isolated passage review on frozen fictional controls. No article writing or approval.
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {preparePassageScopeCalibration,scorePassageScopeCalibration} from './experiments/passage-scope-calibration.mjs';
import {assertSpanReviewJson} from './experiments/span-source-review.mjs';
import {diagnosticPublicKey,sealDiagnostic} from './private-writer-diagnostic.mjs';
import {buildWorkersAiRequest,requestWorkersAiEditorial,workersAiRunUrl,workersAiFailureDiagnostic,FREE_REASONING_WRITER_MODEL} from './free/workers-ai.mjs';

export const PASSAGE_SCOPE_LIVE_CONTROLSET_SHA256='22ba98ba1abbc942aff656912fefb3f2c35aae2ba9bb56b736b8f7ccff2b6341';
export const PASSAGE_SCOPE_LIVE_LIMITS=Object.freeze({requests:16,tokensPerRequest:4800,outputTokens:76800,timeoutMs:90000});
const sha=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>Object.assign(new Error(code),{code});

export function assertPassageScopeLivePlan(plan){
  // The offline scorer checks identity without executing untrusted plan accessors.
  scorePassageScopeCalibration([],plan);
  if(plan.controlsetSha256!==PASSAGE_SCOPE_LIVE_CONTROLSET_SHA256||plan.cases.length!==16||
    plan.reviewContract!=='contextual-passage-scope-v1')throw fail('PASSAGE_SCOPE_LIVE_TARGET');
}
export function assertPassageScopeLiveAuthority(env){
  if(env.GITHUB_REPOSITORY!=='itworksinprod/first-fold'||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_WORKFLOW_REF!=='itworksinprod/first-fold/.github/workflows/passage-scope-live.yml@refs/heads/main'||
    env.GITHUB_ACTOR!=='itworksinprod'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_RUN_ATTEMPT!=='1')throw fail('PASSAGE_SCOPE_LIVE_AUTHORITY');
}
export async function runPassageScopeLive({plan,publicKey,accountId,apiToken,now=new Date(),
  aiRequestImpl=requestWorkersAiEditorial,fetchImpl=fetch,sealImpl=sealDiagnostic}){
  assertPassageScopeLivePlan(plan);diagnosticPublicKey(publicKey);
  const capture={purpose:'frozen-passage-scope-calibration-awaiting-independent-review',capturedAt:now.toISOString(),
    controlsetSha256:plan.controlsetSha256,reviewContract:plan.reviewContract,limits:PASSAGE_SCOPE_LIVE_LIMITS,calls:[],
    independentReview:'required-not-performed-by-this-workflow',emailSent:false};
  const records=[];
  let networkRequests=0,outputBudget=0,code=null;
  try{
    for(const item of plan.cases){
      const view=item.view,model=FREE_REASONING_WRITER_MODEL,prompt=`${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
      const options={model,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(view.data)}],
        schema:view.schema,responseFormat:'json_object',maxTokens:4800,maxAttempts:1,temperature:0.1,timeoutMs:90000,
        maxRequestBytes:70000,maxResponseBytes:100000};
      if(capture.calls.length>=16||outputBudget+4800>76800)throw fail('PASSAGE_SCOPE_LIVE_BUDGET');
      const {body}=buildWorkersAiRequest(options),bodyText=JSON.stringify(body),endpoint=workersAiRunUrl(accountId,model);
      const requestSha256=sha(JSON.stringify({provider:'cloudflare-workers-ai',model,body}));
      const call={caseId:item.caseId,request:view.data,promptSha256:sha(prompt),requestSha256};
      capture.calls.push(call);outputBudget+=4800;
      let attempts=0,active=true,violation=false,result;
      try{result=await aiRequestImpl({...options,accountId,apiToken,
        validatePayload:x=>Boolean(x&&typeof x==='object'&&!Array.isArray(x)),fetchImpl:async(url,init)=>{
          if(!active||violation||url!==endpoint||init?.method!=='POST'||init.redirect!=='error'||init.body!==bodyText||attempts>=1||networkRequests>=16){
            violation=true;throw fail('PASSAGE_SCOPE_LIVE_NETWORK');}
          attempts++;networkRequests++;return fetchImpl(url,init);
        }});
      }finally{active=false;}
      if(violation||attempts!==1)throw fail('PASSAGE_SCOPE_LIVE_NETWORK');
      assertSpanReviewJson(result);
      if(result.provider!=='cloudflare-workers-ai'||result.model!==model||result.requestSha256!==requestSha256||
        !/^[a-f0-9]{64}$/.test(result.responseSha256??'')||result.attemptCount!==1)throw fail('PASSAGE_SCOPE_LIVE_PROVENANCE');
      Object.assign(call,{provider:result.provider,model,responseSha256:result.responseSha256,attemptCount:1,response:structuredClone(result.editorialPayload)});
      records.push({caseId:item.caseId,response:call.response});
      const partial=scorePassageScopeCalibration(records,plan);
      call.verdict=partial.results.at(-1).verdict;
      if(!call.verdict.valid)throw fail('PASSAGE_SCOPE_LIVE_RESPONSE_INVALID');
      // Valid disagreements are measurements, not reasons to retry or modify a case.
    }
  }catch(error){code=/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'PASSAGE_SCOPE_LIVE_FAILED';capture.failure=workersAiFailureDiagnostic(error);}
  const scoring=scorePassageScopeCalibration(records,plan);
  const complete=!code&&scoring.report.structuralComplete;
  const report={status:complete?'review-complete-awaiting-independent-review':'failed',code,modelRequests:capture.calls.length,
    networkRequests,outputBudget,...scoring.report,writerRequests:0,searchQueries:0,emailSent:false};
  return {report,sealed:sealImpl({...capture,scoring,report},publicKey)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const [command,...args]=process.argv.slice(2);
    if(!((command==='validate'&&args.length===0)||(command==='run'&&args.length===1&&process.env.RUNNER_TEMP&&
      resolve(args[0])===resolve(process.env.RUNNER_TEMP,'passage-scope-live.encrypted.json'))))throw fail('PASSAGE_SCOPE_LIVE_ARGUMENTS');
    assertPassageScopeLiveAuthority(process.env);diagnosticPublicKey(process.env.DIAGNOSTIC_PUBLIC_KEY);
    const plan=preparePassageScopeCalibration();assertPassageScopeLivePlan(plan);
    if(command==='run'){
      const {report,sealed}=await runPassageScopeLive({plan,publicKey:process.env.DIAGNOSTIC_PUBLIC_KEY,
        accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_AI_API_TOKEN});
      await writeFile(args[0],JSON.stringify(sealed),{mode:0o600,flag:'wx'});
      console.info(`::notice title=Passage scope calibration::${JSON.stringify(report)}`);if(report.status==='failed')process.exitCode=1;
    }
  }catch(error){console.error(`::error title=Passage scope calibration::${/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'PASSAGE_SCOPE_LIVE_FAILED'}`);process.exitCode=1;}
}
