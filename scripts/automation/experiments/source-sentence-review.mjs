// Offline evidence transport only. No provider, article rewriting or delivery.
import {createHash} from 'node:crypto';
import {buildSpanSourceReview,validateSpanSourceReview,assertSpanReviewJson,SPAN_SOURCE_PROMPT} from './span-source-review.mjs';

export const SOURCE_SENTENCE_CONTRACT='exact-source-sentence-catalog-v1';
export const SOURCE_SENTENCE_LIMITS=Object.freeze({segments:160,dataBytes:50000});
export const SOURCE_SENTENCE_PROMPT=SPAN_SOURCE_PROMPT
  .replace('Exact copying is required for evidence quotes, not for the candidate wording.',
    'The host copies evidence quotes exactly from your selected source sentence IDs; do not type quotations. This does not require exact copying of the candidate wording.')
  .replace('Supported requires one or two exact contiguous quotes of 8–400 characters each, from their named evidenceId.',
    'Supported requires one or two sentenceIds from the supplied evidence catalog. Each ID maps to a complete, contiguous source sentence unit of 8–400 UTF-16 code units and its named evidenceId.')
  + '\nSelect only the supplied sentenceIds. Do not supply quote text, offsets, word ranges or an approval field. The host copies the whole selected unit, never a fragment or a splice. Units use conservative punctuation boundaries and may keep adjacent sentences together when a boundary is ambiguous; they are not a guarantee of independent meaning. All original passages, including exceptions and unselectable text, remain the source of context. Omitted catalog units are not selectable; never truncate, enlarge or invent evidence to bypass the limits. Selecting a real ID proves source membership only, not support for the contextual claim.';

const issued=new WeakMap(),sha=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>Object.assign(new Error(code),{code});
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const invalid=()=>({valid:false,supported:false});
const letter=x=>x!==undefined&&/[\p{L}\p{M}]/u.test(x);
// Generic, conservative English punctuation handling, not a grammatical parser.
// Ambiguity joins context rather than cutting a potentially incomplete sentence.
const abbreviations=new Set(['mr','mrs','ms','dr','prof','sr','jr','st','lt','gen','col','sgt','capt','cmdr','adm',
  'gov','sen','rep','fr','hon','pres','supt','esq','vs','etc','eg','ie',
  'approx','dept','fig','no','vol','rev','inc','ltd','co','corp','phd','am','pm',
  'jan','feb','mar','apr','jun','jul','aug','sep','sept','oct','nov','dec']);
const pairs=new Map([['(',')'],['[',']'],['{','}'],['“','”'],['‘','’'],['«','»'],['「','」'],['『','』'],['（','）']]);
const closers=new Set(pairs.values());
const terminals=new Set(['.','!','?','。','！','？']);

function track(text,i,stack){
  const ch=text[i],prev=text[i-1],next=text[i+1];
  if((ch==='\''||ch==='’')&&letter(prev)&&letter(next))return true; // contraction
  if(ch==='"'||ch==='\''){
    if(stack.at(-1)===ch){stack.pop();return true;}
    if(ch==='\''&&letter(prev))return true; // possessive apostrophe
    stack.push(ch);return true;
  }
  if(pairs.has(ch)){stack.push(pairs.get(ch));return true;}
  if(closers.has(ch)){
    if(ch==='’'&&letter(prev)&&stack.at(-1)!=='’')return true; // possessive
    if(stack.at(-1)!==ch)return false;
    stack.pop();
  }
  return true;
}

function ambiguousPeriod(text,i){
  if(text[i]!=='.')return false;
  if(text[i-1]==='.'||text[i+1]==='.')return true; // ellipsis
  const word=text.slice(0,i).match(/([\p{L}\p{M}\d.]+)$/u)?.[1]??'';
  return /^\p{L}\p{M}*$/u.test(word)||/^(?:\p{L}\p{M}*\.)+\p{L}\p{M}*$/u.test(word)||
    abbreviations.has(word.toLowerCase().replaceAll('.',''));
}

function segments(text){
  const cuts=[],stack=[];let start=0,balanced=true;
  for(let i=0;i<text.length;i++){
    balanced=track(text,i,stack)&&balanced;
    if(!terminals.has(text[i])||ambiguousPeriod(text,i))continue;
    let end=i+1;
    while(terminals.has(text[end]))end++;
    const look=[...stack];let closed=balanced;
    while(closers.has(text[end])||text[end]==='"'||text[end]==='\''){
      closed=track(text,end,look)&&closed;end++;
    }
    if(!closed||look.length||end<text.length&&!/\s/u.test(text[end]))continue;
    const next=text.slice(end).trimStart();
    // A lower-case/numeric continuation can belong to an abbreviation or quote.
    if(next&&/^[\p{Ll}\d]/u.test(next))continue;
    cuts.push({start,end,reason:null});start=end;i=end-1;stack.length=0;
  }
  if(start<text.length)cuts.push({start,end:text.length,reason:balanced&&!stack.length?'unterminated':'unbalanced'});
  return cuts.map(s=>{
    while(s.start<s.end&&/\s/u.test(text[s.start]))s.start++;
    while(s.end>s.start&&/\s/u.test(text[s.end-1]))s.end--;
    const length=s.end-s.start;
    return {...s,reason:s.reason??(length<8?'too-short':length>400?'too-long':null)};
  }).filter(s=>s.end>s.start);
}

export function buildSourceSentenceReview(input){
  const base=buildSpanSourceReview(input),catalog=[],excluded=[];let count=0;
  for(const passage of base.data.passages){
    if(/[\uD800-\uDFFF]/u.test(passage.text))throw fail('SOURCE_SENTENCE_UNICODE');
    for(const [i,s]of segments(passage.text).entries()){
      if(++count>SOURCE_SENTENCE_LIMITS.segments)throw fail('SOURCE_SENTENCE_SIZE');
      const entry={sentenceId:`${passage.evidenceId}S${i+1}`,evidenceId:passage.evidenceId,start:s.start,end:s.end};
      if(s.reason)excluded.push({...entry,reason:s.reason});
      else catalog.push({...entry,text:passage.text.slice(s.start,s.end)});
    }
  }
  if(!catalog.length)throw fail('SOURCE_SENTENCE_EMPTY');
  const data={policy:SOURCE_SENTENCE_CONTRACT,sentence:base.data.sentence,spans:base.data.spans,
    passages:base.data.passages,catalog,excluded};
  data.reviewSha256=sha(JSON.stringify(data));
  if(Buffer.byteLength(JSON.stringify(data),'utf8')>SOURCE_SENTENCE_LIMITS.dataBytes)throw fail('SOURCE_SENTENCE_SIZE');
  assertSpanReviewJson(data);
  const schema=structuredClone(base.schema);
  schema.properties.reviewSha256.enum=[data.reviewSha256];
  schema.properties.judgments.items.properties.evidence.items={type:'object',additionalProperties:false,
    required:['sentenceId'],properties:{sentenceId:{type:'string',enum:catalog.map(s=>s.sentenceId)}}};
  const view=freeze({data,schema,prompt:SOURCE_SENTENCE_PROMPT});issued.set(view,{base,catalog});return view;
}

// Raw model replies must also be retained by callers, even when invalid.
// Never replace a raw response with these separately labeled host-built quotes.
export function validateSourceSentenceReview(value,view){
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
      if(!exact(e,['sentenceId'])||typeof e.sentenceId!=='string')return invalid();
      const entry=bound.catalog.find(s=>s.sentenceId===e.sentenceId);if(!entry)return invalid();
      const passage=bound.base.data.passages.find(p=>p.evidenceId===entry.evidenceId);
      evidence.push({evidenceId:entry.evidenceId,quote:passage.text.slice(entry.start,entry.end)});
    }
    judgments.push({spanId:j.spanId,verdict:j.verdict,explanation:j.explanation,evidence});
  }
  const quotedPayload={reviewSha256:bound.base.data.reviewSha256,judgments};
  const verdict=validateSpanSourceReview(quotedPayload,bound.base);if(!verdict.valid)return invalid();
  return freeze({...verdict,rawSelection:structuredClone(value),quotedPayload});
}
