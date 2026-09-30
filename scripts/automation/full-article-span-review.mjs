// Isolated review of a pinned held draft. Completion is never article approval.
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareArticleTrial,normalizeArticleTrialSummary} from './article-summary-trial.mjs';
import {buildSpanSourceReview,validateSpanSourceReview,assertSpanReviewJson} from './experiments/span-source-review.mjs';
import {diagnosticPublicKey,sealDiagnostic} from './private-writer-diagnostic.mjs';
import {buildWorkersAiRequest,requestWorkersAiEditorial,workersAiRunUrl,workersAiFailureDiagnostic,FREE_REASONING_WRITER_MODEL} from './free/workers-ai.mjs';

export const FULL_ARTICLE_PACKET_SHA256='ca573169c8a123d8bc2f6cddb9d4d24e1c948107e5320504526f17ecd5b5b52c';
export const FULL_ARTICLE_LIMITS=Object.freeze({requests:7,tokensPerRequest:4800,outputTokens:33600,timeoutMs:90000});
const issued=new WeakSet(),sha=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>Object.assign(new Error(code),{code});
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const fields=['headline','whatHappened','whyItMatters','whatToWatch'];

// Caller hash supports synthetic codec tests; the workflow CLI has only the fixed pin.
export function prepareFullArticleReview(encoded,expectedSha256){
  if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256)||typeof encoded!=='string'||
    !encoded||encoded.length>24000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw fail('FULL_ARTICLE_PACKET');
  let raw;
  try{const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)throw fail('FULL_ARTICLE_PACKET');
    raw=gunzipSync(bytes,{maxOutputLength:20000}).toString('utf8');}catch{throw fail('FULL_ARTICLE_PACKET');}
  if(sha(raw)!==expectedSha256)throw fail('FULL_ARTICLE_HASH');
  let packet;try{packet=JSON.parse(raw);}catch{throw fail('FULL_ARTICLE_PACKET');}
  assertSpanReviewJson(packet);
  const keys=['version','originalCaptureSha256','source','draft','units','draftSha256'];
  if(!packet||Array.isArray(packet)||Object.keys(packet).length!==keys.length||keys.some(k=>!Object.hasOwn(packet,k))||
    packet.version!==1||typeof packet.originalCaptureSha256!=='string'||!/^[a-f0-9]{64}$/.test(packet.originalCaptureSha256))throw fail('FULL_ARTICLE_PACKET');
  const sourceText=JSON.stringify(packet.source),source=prepareArticleTrial(gzipSync(sourceText).toString('base64'),sha(sourceText));
  if(!packet.units||Array.isArray(packet.units)||Object.keys(packet.units).length!==4||fields.some(f=>!Object.hasOwn(packet.units,f))||
    !Array.isArray(packet.units.headline)||packet.units.headline.length!==1)throw fail('FULL_ARTICLE_UNITS');
  const summary=normalizeArticleTrialSummary({...packet.units,headline:packet.units.headline[0]},source);
  if(JSON.stringify(summary.draft)!==JSON.stringify(packet.draft)||summary.draftSha256!==packet.draftSha256)throw fail('FULL_ARTICLE_BINDING');
  const items=fields.flatMap(field=>summary.units[field].map((text,index)=>({field,index,view:buildSpanSourceReview({text,sources:[source.source]})})));
  if(items.length!==FULL_ARTICLE_LIMITS.requests)throw fail('FULL_ARTICLE_COUNT');
  const plan=freeze({packetSha256:expectedSha256,packet,summary,items});issued.add(plan);return plan;
}
export function assertFullArticleTarget(plan){
  if(!issued.has(plan)||plan.packetSha256!==FULL_ARTICLE_PACKET_SHA256||
    plan.packet.originalCaptureSha256!=='af3b7a78d3b8d28a8964425c335ca0c1b2d6626bc30f5490a55e1795a8132397'||
    plan.summary.draftSha256!=='528072d9a3a0804c81a2798e384f450ea8120e2f7e59089f1e5652c02ea926f4')throw fail('FULL_ARTICLE_TARGET');
}
export function assertFullArticleAuthority(env){
  if(env.GITHUB_REPOSITORY!=='itworksinprod/first-fold'||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_WORKFLOW_REF!=='itworksinprod/first-fold/.github/workflows/full-article-span-review.yml@refs/heads/main'||
    env.GITHUB_ACTOR!=='itworksinprod'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_RUN_ATTEMPT!=='1')throw fail('FULL_ARTICLE_AUTHORITY');
}
export async function runFullArticleReview({plan,publicKey,accountId,apiToken,now=new Date(),
  aiRequestImpl=requestWorkersAiEditorial,fetchImpl=fetch,sealImpl=sealDiagnostic}){
  if(!issued.has(plan))throw fail('FULL_ARTICLE_PLAN');diagnosticPublicKey(publicKey);
  const capture={purpose:'complete-held-article-source-review-awaiting-independent-review',capturedAt:now.toISOString(),
    packetSha256:plan.packetSha256,packet:plan.packet,limits:FULL_ARTICLE_LIMITS,calls:[],units:[],
    independentReview:'required-not-performed-by-this-workflow',emailSent:false};
  let networkRequests=0,outputBudget=0,code=null;
  try{
    for(const [i,item]of plan.items.entries()){
      const view=item.view,model=FREE_REASONING_WRITER_MODEL,prompt=`${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`;
      const options={model,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(view.data)}],
        schema:view.schema,responseFormat:'json_object',maxTokens:4800,maxAttempts:1,temperature:0.1,timeoutMs:90000,
        maxRequestBytes:70000,maxResponseBytes:100000};
      if(capture.calls.length>=7||outputBudget+4800>33600)throw fail('FULL_ARTICLE_BUDGET');
      const {body}=buildWorkersAiRequest(options),bodyText=JSON.stringify(body),endpoint=workersAiRunUrl(accountId,model);
      const requestSha256=sha(JSON.stringify({provider:'cloudflare-workers-ai',model,body}));
      const call={unitId:`U${i+1}`,field:item.field,index:item.index,request:view.data,promptSha256:sha(prompt),requestSha256};
      capture.calls.push(call);outputBudget+=4800;
      let attempts=0,active=true,violation=false,result;
      try{result=await aiRequestImpl({...options,accountId,apiToken,
        validatePayload:x=>Boolean(x&&typeof x==='object'&&!Array.isArray(x)),fetchImpl:async(url,init)=>{
          if(!active||violation||url!==endpoint||init?.method!=='POST'||init.redirect!=='error'||init.body!==bodyText||attempts>=1||networkRequests>=7){
            violation=true;throw fail('FULL_ARTICLE_NETWORK');}
          attempts++;networkRequests++;return fetchImpl(url,init);
        }});
      }finally{active=false;}
      if(violation||attempts!==1)throw fail('FULL_ARTICLE_NETWORK');
      assertSpanReviewJson(result);
      if(result.provider!=='cloudflare-workers-ai'||result.model!==model||result.requestSha256!==requestSha256||
        !/^[a-f0-9]{64}$/.test(result.responseSha256??'')||result.attemptCount!==1)throw fail('FULL_ARTICLE_PROVENANCE');
      Object.assign(call,{provider:result.provider,model,responseSha256:result.responseSha256,attemptCount:1,response:structuredClone(result.editorialPayload)});
      const verdict=validateSpanSourceReview(call.response,view);call.verdict=verdict;
      if(!verdict.valid)throw fail('FULL_ARTICLE_RESPONSE_INVALID');
      // Continue through semantic holds to inspect ALL units. Transport/structure
      // failures stop immediately, and no held unit is rewritten or retried.
      capture.units.push({unitId:call.unitId,field:item.field,index:item.index,verdict});
    }
  }catch(error){code=/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'FULL_ARTICLE_FAILED';capture.failure=workersAiFailureDiagnostic(error);}
  const complete=!code&&capture.units.length===7;
  const report={status:complete?'review-complete-awaiting-independent-review':'failed',code,modelRequests:capture.calls.length,
    networkRequests,outputBudget,unitsCompleted:capture.units.length,unitsSupported:capture.units.filter(u=>u.verdict.supported).length,
    sourceGatePassed:complete&&capture.units.every(u=>u.verdict.supported),articleApproved:false,publicationReady:false,
    writerRequests:0,searchQueries:0,emailSent:false};
  return {report,sealed:sealImpl({...capture,report},publicKey)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const [command,...args]=process.argv.slice(2);
    if(!((command==='validate'&&args.length===0)||(command==='run'&&args.length===1&&process.env.RUNNER_TEMP&&
      resolve(args[0])===resolve(process.env.RUNNER_TEMP,'full-article-span-review.encrypted.json'))))throw fail('FULL_ARTICLE_ARGUMENTS');
    assertFullArticleAuthority(process.env);diagnosticPublicKey(process.env.DIAGNOSTIC_PUBLIC_KEY);
    const plan=prepareFullArticleReview(process.env.FIRST_FOLD_FULL_ARTICLE_SPAN_B64,FULL_ARTICLE_PACKET_SHA256);assertFullArticleTarget(plan);
    if(command==='run'){
      const {report,sealed}=await runFullArticleReview({plan,publicKey:process.env.DIAGNOSTIC_PUBLIC_KEY,
        accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_AI_API_TOKEN});
      await writeFile(args[0],JSON.stringify(sealed),{mode:0o600,flag:'wx'});
      console.info(`::notice title=Full article span review::${JSON.stringify(report)}`);if(report.status==='failed')process.exitCode=1;
    }
  }catch(error){console.error(`::error title=Full article span review::${/^[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'FULL_ARTICLE_FAILED'}`);process.exitCode=1;}
}
