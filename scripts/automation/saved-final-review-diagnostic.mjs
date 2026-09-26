// Opt-in saved-candidate review, never a writer, fresh edition or delivery path.
// Only the independently inspected packet's exact bytes may enter the CLI.
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
import {buildIsolatedPreservationReview,validateIsolatedPreservationReview} from './free/isolated-preservation-review.mjs';
import {buildTextPreservationReview,validateTextPreservationReview,exactTextPreservation} from './free/text-preservation-review.mjs';
import {DEFAULT_CLOUDFLARE_AI_MODEL,buildWorkersAiRequest,workersAiFailureDiagnostic} from './free/workers-ai.mjs';

export const SAVED_FINAL_REVIEW_PACKET_SHA256='3226ceb1b1b10c3f0dcb0363193756df167d5cbdb174d35034afc38d5f84caff';
const SOURCE_PROMPT='153fe4f6767cae01903dd734dbb12245ba914ada5bd97d4506a1fb2a8006b4a7';
const MEANING_PROMPT='b0711232aac6664bf9ff040aa4edb61a8e2c3bac199949adea8132db299c9785';
const ids=['source:headline','source:whatHappened','meaning:whatHappened','source:whyItMatters','source:whatToWatch','meaning:whatToWatch'];
const sha=text=>createHash('sha256').update(text).digest('hex');
const fail=code=>Object.assign(new Error(code),{code});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const plans=new WeakMap();
const same=(a,b)=>{if(!isDeepStrictEqual(a,b))throw fail('SAVED_REVIEW_PACKET_INVALID');};

export function decodeSavedFinalReviewPacket(encoded){
  if(typeof encoded!=='string'||!encoded.length||encoded.length>48_000||!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded))throw fail('SAVED_REVIEW_SECRET_INVALID');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.toString('base64')!==encoded)throw fail('SAVED_REVIEW_SECRET_INVALID');
  let text;
  try{text=gunzipSync(bytes,{maxOutputLength:75_000}).toString('utf8');}catch{throw fail('SAVED_REVIEW_SECRET_INVALID');}
  if(sha(text)!==SAVED_FINAL_REVIEW_PACKET_SHA256)throw fail('SAVED_REVIEW_PACKET_CHANGED');
  return text;
}

// Pure view reconstruction also supports credential-free synthetic tests. The
// real diagnostic below ALWAYS decodes the fixed packet first, with no override.
export function buildSavedFinalReviewPlan(packetText){
  if(typeof packetText!=='string'||Buffer.byteLength(packetText)>75_000)throw fail('SAVED_REVIEW_PACKET_INVALID');
  let packet;try{packet=JSON.parse(packetText);}catch{throw fail('SAVED_REVIEW_PACKET_INVALID');}
  if(packet?.purpose!=='private-final-check-preparation-no-network'||packet.articleApproved!==false||
    packet.publicationReady!==false||packet.modelRequests!==0||packet.cloudRequests!==0||packet.emailSent!==false||
    packet.reviewStatus!=='not-run'||!Array.isArray(packet.requests)||packet.requests.length!==6||
    !Array.isArray(packet.identities)||packet.identities.length!==2||packet.bodyWords<110||packet.bodyWords>225)throw fail('SAVED_REVIEW_PACKET_INVALID');
  same(packet.requests.map(r=>r.id),ids);
  const validators=[],views=[];
  for(const entry of packet.requests){
    const [dimension,field]=entry.id.split(':');same(entry.dimension,dimension);same(entry.field,field);
    const view=entry.view;if(!view?.data||!view.schema||typeof view.prompt!=='string')throw fail('SAVED_REVIEW_PACKET_INVALID');
    same(entry.viewSha256,sha(JSON.stringify(view)));same(entry.promptSha256,sha(view.prompt));
    const {reviewSha256,...unsigned}=view.data;same(reviewSha256,sha(JSON.stringify(unsigned)));
    const claims=view.data.claims?.map(c=>c.text);
    let validate;
    if(dimension==='source'){
      const sources=[];
      for(const p of view.data.passages??[]){
        let source=sources.find(s=>s.publisher===p.publisher);
        if(!source){source={publisher:p.publisher,passages:[]};sources.push(source);}
        source.passages.push({evidenceId:p.evidenceId,text:p.text});
      }
      const issued=buildIsolatedPreservationReview({text:view.data.statement,claims,sources},'source');
      same(view,issued);same(sha(view.prompt),SOURCE_PROMPT);
      validate=value=>validateIsolatedPreservationReview(value,issued);
    }else{
      same(sha(view.prompt),MEANING_PROMPT);
      same(Object.keys(view.data),['policy','claims','previousClaims','glossaryBinding','definitions','reviewSha256']);
      same(view.data.policy,'supplementary-definition-preservation-private-v1');
      const base=buildTextPreservationReview({claims,previousClaims:view.data.previousClaims?.map(c=>c.text)});
      same(view.data.claims,base.data.claims);same(view.data.previousClaims,base.data.previousClaims);
      const schema=structuredClone(base.schema);schema.properties.reviewSha256.enum=[reviewSha256];same(view.schema,schema);
      // Delegate the established strict verdict contract without hiding extra
      // properties or executing response accessors while translating its hash.
      validate=value=>{
        const invalid={valid:false,supported:false};
        if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return invalid;
        const d=Object.getOwnPropertyDescriptors(value),h=d.reviewSha256;
        if(!h||!Object.hasOwn(h,'value')||!h.enumerable||h.value!==reviewSha256)return invalid;
        d.reviewSha256={...h,value:base.data.reviewSha256};
        return validateTextPreservationReview(Object.create(Object.getPrototypeOf(value),d),base);
      };
    }
    validators.push(validate);views.push(entry);
  }
  for(const [index,field] of ['headline','whyItMatters'].entries()){
    const source=views.find(v=>v.id===`source:${field}`),claims=source.view.data.claims.map(c=>c.text);
    const identity=exactTextPreservation(buildTextPreservationReview({claims,previousClaims:claims}));
    same(packet.identities[index],{field,verdict:identity,sourceCheckStillRequired:true});
  }
  for(const entry of views.filter(v=>v.dimension==='meaning')){
    same(entry.view.data.claims,views.find(v=>v.id===`source:${entry.field}`).view.data.claims);
  }
  const plan=freeze({packetSha256:sha(packetText),views,identities:packet.identities,bodyWords:packet.bodyWords,
    maximumRequests:6,maximumOutputTokens:3600,articleApproved:false});
  plans.set(plan,{validators,packet});return plan;
}

export function validateSavedFinalReviewResponse(value,plan,index){
  const b=plans.get(plan);
  if(!b||!Number.isInteger(index)||!b.validators[index])return {valid:false,supported:false};
  return b.validators[index](value);
}

export async function runSavedFinalReviews({plan,publicKey,accountId,apiToken,now,aiRequestImpl,fetchImpl,endpoint,sealDiagnostic}){
  const bound=plans.get(plan);if(!bound)throw fail('SAVED_REVIEW_PLAN_INVALID');
  const calls=[];let modelRequests=0,networkRequests=0,code=null;
  for(const [index,entry] of plan.views.entries()){
    const prompt=`${entry.view.prompt}\nJSON schema: ${JSON.stringify(entry.view.schema)}`;
    const options={model:DEFAULT_CLOUDFLARE_AI_MODEL,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(entry.view.data)}],
      schema:entry.view.schema,responseFormat:'json_object',maxTokens:600,maxAttempts:1,temperature:0.1,timeoutMs:30_000,maxRequestBytes:70_000,maxResponseBytes:100_000};
    const {body}=buildWorkersAiRequest(options),bodyText=JSON.stringify(body);
    const requestSha256=sha(JSON.stringify({provider:'cloudflare-workers-ai',model:DEFAULT_CLOUDFLARE_AI_MODEL,body}));
    const call={id:entry.id,dimension:entry.dimension,field:entry.field,request:entry.view.data,prompt,schema:entry.view.schema,
      viewSha256:entry.viewSha256,requestSha256};calls.push(call);
    let active=true,violation=false,requests=0;
    try{
      modelRequests++;
      const result=await aiRequestImpl({...options,accountId,apiToken,
        validatePayload:v=>Boolean(v&&typeof v==='object'&&!Array.isArray(v)),
        fetchImpl:async(url,init)=>{
          if(!active||violation||url!==endpoint||init?.method!=='POST'||init.redirect!=='error'||init.body!==bodyText||requests>=1||networkRequests>=6){
            violation=true;throw fail('SAVED_REVIEW_NETWORK');
          }
          requests++;networkRequests++;return fetchImpl(url,init);
        }});
      active=false;
      if(violation||requests!==1)throw fail('SAVED_REVIEW_NETWORK');
      if(result.provider!=='cloudflare-workers-ai'||result.model!==DEFAULT_CLOUDFLARE_AI_MODEL||result.requestSha256!==requestSha256||
        !/^[a-f0-9]{64}$/u.test(result.responseSha256??'')||result.attemptCount!==1)throw fail('SAVED_REVIEW_PROVENANCE');
      const verdict=validateSavedFinalReviewResponse(result.editorialPayload,plan,index);
      if(!verdict.valid)throw fail('SAVED_REVIEW_MALFORMED');
      Object.assign(call,{response:structuredClone(result.editorialPayload),responseSha256:result.responseSha256,
        model:result.model,provider:result.provider,attemptCount:result.attemptCount,verdict});
      if(!verdict.supported)throw fail('SAVED_REVIEW_REJECTED');
    }catch(error){
      code=violation?'SAVED_REVIEW_NETWORK':['SAVED_REVIEW_NETWORK','SAVED_REVIEW_PROVENANCE','SAVED_REVIEW_MALFORMED','SAVED_REVIEW_REJECTED'].includes(error?.code)
        ?error.code:'SAVED_REVIEW_PROVIDER_FAILED';
      call.failure={code,...workersAiFailureDiagnostic(error)};break;
    }finally{active=false;}
  }
  const report={mode:'saved-final-review-no-email',status:code?'failed':'checks-completed-awaiting-independent-review',code,
    modelRequests,networkRequests,outputBudget:modelRequests*600,maximumModelRequests:6,maximumOutputBudget:3600,
    completedChecks:calls.filter(c=>c.verdict?.supported).length,packetSha256:plan.packetSha256,
    bodyWords:plan.bodyWords,searchQueries:0,articleApproved:false,publicationReady:false,emailSent:false,
    failures:calls.flatMap(c=>c.failure?[c.failure]:[])};
  return {report,sealed:sealDiagnostic({purpose:report.mode,capturedAt:now.toISOString(),packetSha256:plan.packetSha256,
    calls,identities:plan.identities,report,qualification:'new-context-not-qualified-by-old-controls'},publicKey)};
}

export async function diagnoseSavedFinalReview(options){
  const text=decodeSavedFinalReviewPacket(options.encodedPacket);
  return runSavedFinalReviews({...options,plan:buildSavedFinalReviewPlan(text)});
}
