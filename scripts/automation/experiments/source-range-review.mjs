// Offline, versioned evidence transport. Not wired into any provider or delivery.
import {createHash} from 'node:crypto';
import {buildSpanSourceReview,validateSpanSourceReview,assertSpanReviewJson,SPAN_SOURCE_PROMPT} from './span-source-review.mjs';

export const SOURCE_RANGE_CONTRACT='lossless-source-word-range-v1';
export const SOURCE_RANGE_LIMITS=Object.freeze({wordsPerPassage:400,totalWords:800,dataBytes:50000});
// Keep v2 entailment instructions intact; change only how evidence is supplied.
export const SOURCE_RANGE_PROMPT=SPAN_SOURCE_PROMPT
  .replace('Exact copying is required for evidence quotes, not for the candidate wording.',
    'The host copies evidence quotes exactly from your selected source ranges; do not type quotations. This does not require exact copying of the candidate wording.')
  .replace('Supported requires one or two exact contiguous quotes of 8–400 characters each, from their named evidenceId.',
    'Supported requires one or two contiguous word ranges from their named evidenceId. The resulting exact source quote must contain 8–400 UTF-16 code units.')
  + '\nSelect startWord and endWord as positive, 1-based, INCLUSIVE word numbers from the named passage. Words are whitespace-delimited tokens; punctuation stays attached. Select a single uninterrupted range per evidence entry; never splice separated ranges into one quote. The host preserves all original spaces, punctuation and Unicode between those boundaries. Do not supply quote text, offsets, rewritten evidence or an approval field. Each passage retains its full original text; the numbered words are navigation aids, not replacements for context. Invalid ranges are rejected, never guessed or repaired.';

const issued=new WeakMap(),sha=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>Object.assign(new Error(code),{code});
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const invalid=()=>({valid:false,supported:false});

export function buildSourceRangeReview(input){
  const base=buildSpanSourceReview(input);
  let totalWords=0;
  const passages=base.data.passages.map(p=>{
    if(/[\uD800-\uDFFF]/u.test(p.text))throw fail('SOURCE_RANGE_UNICODE');
    const words=Array.from(p.text.matchAll(/\S+/gu),(m,i)=>({word:i+1,start:m.index,end:m.index+m[0].length,text:m[0]}));
    totalWords+=words.length;
    if(!words.length||words.length>SOURCE_RANGE_LIMITS.wordsPerPassage||totalWords>SOURCE_RANGE_LIMITS.totalWords)throw fail('SOURCE_RANGE_SIZE');
    return {...p,words};
  });
  const data={policy:SOURCE_RANGE_CONTRACT,sentence:base.data.sentence,spans:base.data.spans,passages};
  data.reviewSha256=sha(JSON.stringify(data));
  if(Buffer.byteLength(JSON.stringify(data),'utf8')>SOURCE_RANGE_LIMITS.dataBytes)throw fail('SOURCE_RANGE_SIZE');
  assertSpanReviewJson(data);
  const schema=structuredClone(base.schema);
  schema.properties.reviewSha256.enum=[data.reviewSha256];
  schema.properties.judgments.items.properties.evidence.items={type:'object',additionalProperties:false,
    required:['evidenceId','startWord','endWord'],properties:{
      evidenceId:{type:'string',enum:passages.map(p=>p.evidenceId)},
      startWord:{type:'integer',minimum:1,maximum:Math.max(...passages.map(p=>p.words.length))},
      endWord:{type:'integer',minimum:1,maximum:Math.max(...passages.map(p=>p.words.length))}}};
  const view=freeze({data,schema,prompt:SOURCE_RANGE_PROMPT});issued.set(view,{base,passages});return view;
}

// Callers must separately retain the original parsed response in private captures,
// including invalid replies. Never replace that raw response with this materialization.
export function validateSourceRangeReview(value,view){
  const bound=issued.get(view);if(!bound)return invalid();
  try{assertSpanReviewJson(value);}catch{return invalid();}
  if(!exact(value,['reviewSha256','judgments'])||value.reviewSha256!==view.data.reviewSha256||
    !Array.isArray(value.judgments)||value.judgments.length!==bound.base.data.spans.length)return invalid();
  const judgments=[];
  for(const [i,j]of value.judgments.entries()){
    if(!exact(j,['spanId','verdict','explanation','evidence'])||j.spanId!==bound.base.data.spans[i].spanId||
      !Array.isArray(j.evidence)||j.evidence.length>2)return invalid();
    const evidence=[];
    for(const e of j.evidence){
      if(!exact(e,['evidenceId','startWord','endWord'])||!Number.isSafeInteger(e.startWord)||!Number.isSafeInteger(e.endWord)||
        e.startWord<1||e.endWord<e.startWord)return invalid();
      const p=bound.passages.find(p=>p.evidenceId===e.evidenceId);
      if(!p||e.endWord>p.words.length)return invalid();
      const quote=p.text.slice(p.words[e.startWord-1].start,p.words[e.endWord-1].end);
      evidence.push({evidenceId:e.evidenceId,quote});
    }
    judgments.push({spanId:j.spanId,verdict:j.verdict,explanation:j.explanation,evidence});
  }
  // Translate to the existing, issued v2 view and reuse ALL count, length,
  // membership, duplicate, verdict and explanation checks. No verdict is inferred
  // from a range, and quotes remain separate rather than being stitched together.
  const quotedPayload={reviewSha256:bound.base.data.reviewSha256,judgments};
  const verdict=validateSpanSourceReview(quotedPayload,bound.base);
  if(!verdict.valid)return invalid();
  return freeze({...verdict,rawSelection:structuredClone(value),quotedPayload});
}
