// Eight fixed synthetic checks only. No article, writer, repair, retry or email.
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSpanSourceReview,validateSpanSourceReview,assertSpanReviewJson,SPAN_SOURCE_CONTRACT} from './experiments/span-source-review.mjs';
import {SPAN_SOURCE_CONTROLS,SPAN_SOURCE_CONTROLSET_SHA256} from './experiments/span-source-controls.mjs';
import {diagnosticPublicKey,sealDiagnostic} from './private-writer-diagnostic.mjs';
import {buildWorkersAiRequest,requestWorkersAiEditorial,workersAiRunUrl,workersAiFailureDiagnostic,
  DEFAULT_CLOUDFLARE_AI_MODEL,FREE_REASONING_WRITER_MODEL} from './free/workers-ai.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),fail=code=>Object.assign(new Error(code),{code});
const issued=new WeakSet();
export const SPAN_CALIBRATION_LIMITS=Object.freeze({requests:8,tokensPerRequest:600,outputTokens:4800});
export const SPAN_CALIBRATION_PROFILES=Object.freeze({
  baseline:Object.freeze({model:DEFAULT_CLOUDFLARE_AI_MODEL,...SPAN_CALIBRATION_LIMITS,timeoutMs:30000}),
  reasoning:Object.freeze({model:FREE_REASONING_WRITER_MODEL,requests:8,tokensPerRequest:2400,outputTokens:19200,timeoutMs:90000}),
});
export const SPAN_CALIBRATION_PIN='c7a74593f9b8e5d4714f6122029a4f5a15f93f9c7d4647a6aac287ddb7a7b94d';
export function prepareSpanCalibration(profile='baseline'){
  if(typeof profile!=='string'||!Object.hasOwn(SPAN_CALIBRATION_PROFILES,profile))throw fail('SPAN_CALIBRATION_PROFILE');
  if(SPAN_SOURCE_CONTROLS.length!==8||SPAN_SOURCE_CONTROLSET_SHA256!==SPAN_CALIBRATION_PIN)throw fail('SPAN_CALIBRATION_CASES');
  const views=Object.freeze(SPAN_SOURCE_CONTROLS.map(c=>buildSpanSourceReview(c.input)));
  for(const [i,v]of views.entries())if(v.data.spans.length!==SPAN_SOURCE_CONTROLS[i].expectedVerdicts.length)throw fail('SPAN_CALIBRATION_LABELS');
  const plan=Object.freeze({corpusSha256:SPAN_SOURCE_CONTROLSET_SHA256,views,profile,limits:SPAN_CALIBRATION_PROFILES[profile]});issued.add(plan);return plan;
}
export function assertSpanCalibrationAuthority(env){
  if(env.GITHUB_REPOSITORY!=='itworksinprod/first-fold'||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_WORKFLOW_REF!=='itworksinprod/first-fold/.github/workflows/span-source-calibration.yml@refs/heads/main'||
    env.GITHUB_ACTOR!=='itworksinprod'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_RUN_ATTEMPT!=='1')throw fail('SPAN_CALIBRATION_AUTHORITY');
}
export async function runSpanCalibration({plan,publicKey,accountId,apiToken,now=new Date(),
  aiRequestImpl=requestWorkersAiEditorial,fetchImpl=fetch,sealImpl=sealDiagnostic}){
  if(!issued.has(plan))throw fail('SPAN_CALIBRATION_PLAN');diagnosticPublicKey(publicKey);
  const limits=plan.limits;
  const capture={purpose:'synthetic-span-source-calibration-awaiting-independent-review',capturedAt:now.toISOString(),
    corpusSha256:plan.corpusSha256,contract:SPAN_SOURCE_CONTRACT,calls:[],cases:[],emailSent:false,
    independentReview:'required-not-performed-by-this-workflow',controls:SPAN_SOURCE_CONTROLS};
  // Preserve the baseline capture/report shape. This metadata is not model input.
  if(plan.profile!=='baseline')capture.comparisonProfile={name:plan.profile,...limits};
  let networkRequests=0,outputBudget=0,code=null;
  try{
    for(const [i,view]of plan.views.entries()){
      const model=limits.model,prompt=`${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
      const options={model,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(view.data)}],
        schema:view.schema,responseFormat:'json_object',maxTokens:limits.tokensPerRequest,maxAttempts:1,temperature:0.1,
        timeoutMs:limits.timeoutMs,maxRequestBytes:70000,maxResponseBytes:100000};
      if(capture.calls.length>=limits.requests||outputBudget+limits.tokensPerRequest>limits.outputTokens)throw fail('SPAN_CALIBRATION_BUDGET');
      const {body}=buildWorkersAiRequest(options),bodyText=JSON.stringify(body),endpoint=workersAiRunUrl(accountId,model);
      const requestSha256=sha(JSON.stringify({provider:'cloudflare-workers-ai',model,body}));
      const call={caseId:SPAN_SOURCE_CONTROLS[i].id,request:view.data,promptSha256:sha(prompt),requestSha256};
      capture.calls.push(call);outputBudget+=limits.tokensPerRequest;
      let attempts=0,active=true,violation=false,result;
      try{
        result=await aiRequestImpl({...options,accountId,apiToken,
          validatePayload:x=>Boolean(x&&typeof x==='object'&&!Array.isArray(x)),
          fetchImpl:async(url,init)=>{
            if(!active||violation||url!==endpoint||init?.method!=='POST'||init.redirect!=='error'||init.body!==bodyText||attempts>=1||networkRequests>=limits.requests){
              violation=true;throw fail('SPAN_CALIBRATION_NETWORK');}
            attempts++;networkRequests++;return fetchImpl(url,init);
          }});
      }finally{active=false;}
      if(violation||attempts!==1)throw fail('SPAN_CALIBRATION_NETWORK');
      assertSpanReviewJson(result);
      if(result.provider!=='cloudflare-workers-ai'||result.model!==model||result.requestSha256!==requestSha256||
        !/^[a-f0-9]{64}$/.test(result.responseSha256??'')||result.attemptCount!==1)throw fail('SPAN_CALIBRATION_PROVENANCE');
      Object.assign(call,{provider:result.provider,model,responseSha256:result.responseSha256,attemptCount:1,response:structuredClone(result.editorialPayload)});
      const verdict=validateSpanSourceReview(call.response,view);call.verdict=verdict;
      if(!verdict.valid)throw fail('SPAN_CALIBRATION_RESPONSE_INVALID');
      const control=SPAN_SOURCE_CONTROLS[i];
      capture.cases.push({caseId:control.id,expectedSupported:control.expectedSupported,expectedVerdicts:control.expectedVerdicts,verdict,
        matched:verdict.supported===control.expectedSupported&&JSON.stringify(verdict.spans.map(s=>s.verdict))===JSON.stringify(control.expectedVerdicts)});
    }
    if(capture.cases.length!==8||capture.cases.some(c=>!c.matched))throw fail('SPAN_CALIBRATION_MISMATCH');
  }catch(error){code=/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'SPAN_CALIBRATION_FAILED';capture.failure=workersAiFailureDiagnostic(error);}
  const report={status:code?'failed':'controls-passed-awaiting-independent-review',code,modelRequests:capture.calls.length,
    networkRequests,outputBudget,casesCompleted:capture.cases.length,casesPassed:capture.cases.filter(c=>c.matched).length,
    writerRequests:0,searchQueries:0,emailSent:false};
  return {report,sealed:sealImpl({...capture,report},publicKey)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const [command,...args]=process.argv.slice(2);
    if(!((command==='validate'&&args.length===0)||(command==='run'&&args.length===1&&process.env.RUNNER_TEMP&&
      resolve(args[0])===resolve(process.env.RUNNER_TEMP,'span-source-calibration.encrypted.json'))))throw fail('SPAN_CALIBRATION_ARGUMENTS');
    assertSpanCalibrationAuthority(process.env);diagnosticPublicKey(process.env.DIAGNOSTIC_PUBLIC_KEY);
    const plan=prepareSpanCalibration(process.env.SPAN_CALIBRATION_PROFILE??'baseline');
    if(command==='run'){
      const {report,sealed}=await runSpanCalibration({plan,publicKey:process.env.DIAGNOSTIC_PUBLIC_KEY,
        accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_AI_API_TOKEN});
      await writeFile(args[0],JSON.stringify(sealed),{mode:0o600,flag:'wx'});
      console.info(`::notice title=Span source calibration::${JSON.stringify(report)}`);if(report.status==='failed')process.exitCode=1;
    }
  }catch(error){console.error(`::error title=Span source calibration::${/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'SPAN_CALIBRATION_FAILED'}`);process.exitCode=1;}
}
