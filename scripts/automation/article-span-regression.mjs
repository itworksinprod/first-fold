// One pinned historical false-positive review. No writer, research, repair or delivery.
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSpanSourceReview,validateSpanSourceReview,assertSpanReviewJson} from './experiments/span-source-review.mjs';
import {diagnosticPublicKey,sealDiagnostic} from './private-writer-diagnostic.mjs';
import {buildWorkersAiRequest,requestWorkersAiEditorial,workersAiRunUrl,workersAiFailureDiagnostic,FREE_REASONING_WRITER_MODEL} from './free/workers-ai.mjs';

export const ARTICLE_SPAN_PACKET_SHA256='c9c9b54fbe1513d117d672a3611e367e5eed6fc47951d136e6cd6d0ef5d4fbd8';
export const ARTICLE_SPAN_REVIEW_SHA256='59bb3bd2db1a406c808a0d244f3f80858926698968ade1ad089f1afce2d50d2e';
export const ARTICLE_SPAN_EXPECTED=Object.freeze(['supported','unsupported','unsupported']);
export const ARTICLE_SPAN_LIMITS=Object.freeze({requests:1,tokensPerRequest:4800,outputTokens:4800,timeoutMs:90000});
const issued=new WeakSet(),sha=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>Object.assign(new Error(code),{code});
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};

// Codec accepts a caller's expected hash for offline fixture tests. The only CLI
// path below always uses the immutable production packet pin, never a user input.
export function prepareArticleSpanRegression(encoded,expectedSha256){
  if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256)||typeof encoded!=='string'||
    !encoded||encoded.length>24000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw fail('ARTICLE_SPAN_PACKET');
  let raw;
  try{const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)throw fail('ARTICLE_SPAN_PACKET');
    raw=gunzipSync(bytes,{maxOutputLength:20000}).toString('utf8');}catch{throw fail('ARTICLE_SPAN_PACKET');}
  if(sha(raw)!==expectedSha256)throw fail('ARTICLE_SPAN_HASH');
  let packet;try{packet=JSON.parse(raw);}catch{throw fail('ARTICLE_SPAN_PACKET');}
  assertSpanReviewJson(packet);
  if(!packet||Array.isArray(packet)||Object.keys(packet).length!==3||packet.version!==1||
    !/^[a-f0-9]{64}$/.test(packet.originalCaptureSha256??'')||!Object.hasOwn(packet,'input'))throw fail('ARTICLE_SPAN_PACKET');
  const view=buildSpanSourceReview(packet.input);
  if(view.data.spans.length!==ARTICLE_SPAN_EXPECTED.length)throw fail('ARTICLE_SPAN_COUNT');
  const plan=freeze({packetSha256:expectedSha256,packet,view});issued.add(plan);return plan;
}
export function assertArticleSpanTarget(plan){
  if(!issued.has(plan)||plan.packetSha256!==ARTICLE_SPAN_PACKET_SHA256||
    plan.view.data.reviewSha256!==ARTICLE_SPAN_REVIEW_SHA256||
    plan.packet.originalCaptureSha256!=='af3b7a78d3b8d28a8964425c335ca0c1b2d6626bc30f5490a55e1795a8132397')throw fail('ARTICLE_SPAN_TARGET');
}
export function assertArticleSpanAuthority(env){
  if(env.GITHUB_REPOSITORY!=='itworksinprod/first-fold'||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_WORKFLOW_REF!=='itworksinprod/first-fold/.github/workflows/article-span-regression.yml@refs/heads/main'||
    env.GITHUB_ACTOR!=='itworksinprod'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_RUN_ATTEMPT!=='1')throw fail('ARTICLE_SPAN_AUTHORITY');
}
export async function runArticleSpanRegression({plan,publicKey,accountId,apiToken,now=new Date(),
  aiRequestImpl=requestWorkersAiEditorial,fetchImpl=fetch,sealImpl=sealDiagnostic}){
  if(!issued.has(plan))throw fail('ARTICLE_SPAN_PLAN');diagnosticPublicKey(publicKey);
  const view=plan.view,model=FREE_REASONING_WRITER_MODEL,prompt=`${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
  const options={model,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(view.data)}],
    schema:view.schema,responseFormat:'json_object',maxTokens:4800,maxAttempts:1,temperature:0.1,timeoutMs:90000,
    maxRequestBytes:70000,maxResponseBytes:100000};
  const capture={purpose:'held-article-sentence-regression-awaiting-independent-review',capturedAt:now.toISOString(),
    packetSha256:plan.packetSha256,originalCaptureSha256:plan.packet.originalCaptureSha256,input:plan.packet.input,
    expectedVerdicts:ARTICLE_SPAN_EXPECTED,limits:ARTICLE_SPAN_LIMITS,calls:[],emailSent:false,
    independentReview:'required-not-performed-by-this-workflow'};
  let networkRequests=0,code=null,verdict=null;
  try{
    const {body}=buildWorkersAiRequest(options),bodyText=JSON.stringify(body),endpoint=workersAiRunUrl(accountId,model);
    const requestSha256=sha(JSON.stringify({provider:'cloudflare-workers-ai',model,body}));
    const call={request:view.data,promptSha256:sha(prompt),requestSha256};capture.calls.push(call);
    let active=true,violation=false,result;
    try{result=await aiRequestImpl({...options,accountId,apiToken,
      validatePayload:x=>Boolean(x&&typeof x==='object'&&!Array.isArray(x)),fetchImpl:async(url,init)=>{
        if(!active||violation||url!==endpoint||init?.method!=='POST'||init.redirect!=='error'||init.body!==bodyText||networkRequests>=1){
          violation=true;throw fail('ARTICLE_SPAN_NETWORK');}
        networkRequests++;return fetchImpl(url,init);
      }});
    }finally{active=false;}
    if(violation||networkRequests!==1)throw fail('ARTICLE_SPAN_NETWORK');
    assertSpanReviewJson(result);
    if(result.provider!=='cloudflare-workers-ai'||result.model!==model||result.requestSha256!==requestSha256||
      !/^[a-f0-9]{64}$/.test(result.responseSha256??'')||result.attemptCount!==1)throw fail('ARTICLE_SPAN_PROVENANCE');
    Object.assign(call,{provider:result.provider,model,responseSha256:result.responseSha256,attemptCount:1,response:structuredClone(result.editorialPayload)});
    verdict=validateSpanSourceReview(call.response,view);call.verdict=verdict;
    if(!verdict.valid)throw fail('ARTICLE_SPAN_RESPONSE_INVALID');
    if(verdict.supported||JSON.stringify(verdict.spans.map(s=>s.verdict))!==JSON.stringify(ARTICLE_SPAN_EXPECTED))throw fail('ARTICLE_SPAN_MISMATCH');
  }catch(error){code=/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'ARTICLE_SPAN_FAILED';capture.failure=workersAiFailureDiagnostic(error);}
  const report={status:code?'failed':'regression-passed-awaiting-independent-review',code,
    modelRequests:capture.calls.length,networkRequests,outputBudget:capture.calls.length*4800,
    sentenceHeld:verdict?.valid===true&&verdict.supported===false,
    writerRequests:0,searchQueries:0,emailSent:false};
  return {report,sealed:sealImpl({...capture,report},publicKey)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const [command,...args]=process.argv.slice(2);
    if(!((command==='validate'&&args.length===0)||(command==='run'&&args.length===1&&process.env.RUNNER_TEMP&&
      resolve(args[0])===resolve(process.env.RUNNER_TEMP,'article-span-regression.encrypted.json'))))throw fail('ARTICLE_SPAN_ARGUMENTS');
    assertArticleSpanAuthority(process.env);diagnosticPublicKey(process.env.DIAGNOSTIC_PUBLIC_KEY);
    const plan=prepareArticleSpanRegression(process.env.FIRST_FOLD_ARTICLE_SPAN_B64,ARTICLE_SPAN_PACKET_SHA256);
    assertArticleSpanTarget(plan);
    if(command==='run'){
      const {report,sealed}=await runArticleSpanRegression({plan,publicKey:process.env.DIAGNOSTIC_PUBLIC_KEY,
        accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_AI_API_TOKEN});
      await writeFile(args[0],JSON.stringify(sealed),{mode:0o600,flag:'wx'});
      console.info(`::notice title=Article span regression::${JSON.stringify(report)}`);if(report.status==='failed')process.exitCode=1;
    }
  }catch(error){console.error(`::error title=Article span regression::${/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'ARTICLE_SPAN_FAILED'}`);process.exitCode=1;}
}
