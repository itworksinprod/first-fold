// Offline experimental contract only. Explicit coverage is not semantic proof.
import {createHash} from 'node:crypto';
import {assertSpanReviewJson} from './span-source-review.mjs';
import {buildSourceSentenceReview,validateSourceSentenceReview,SOURCE_SENTENCE_PROMPT} from './source-sentence-review.mjs';

export const PASSAGE_SCOPE_CONTRACT='contextual-passage-scope-v1';
export const PASSAGE_SCOPE_LIMITS=Object.freeze({passages:8,spans:8,checks:64,dataBytes:50000});
export const PASSAGE_SCOPE_PROMPT=SOURCE_SENTENCE_PROMPT+`
Before the verdict for EACH contextual span, record one passageCheck for EVERY original passage in the supplied order, including passages with no selectable catalog unit. Read the entire passage, not just the sentence selected for the final verdict. Exact copying of a rule does not settle whether another passage qualifies it.
Assess contribution and qualification separately: the SAME passage may support a base assertion AND supply a qualification that the candidate drops. Support is a contribution toward the contextual claim, not proof of the whole claim by that passage alone; evidence from multiple passages may be needed.
contribution: support = affirmative evidence for part or all of the actual contextual assertion; contradiction = affirmative evidence against an assertion it makes; context = relevant background or limits without affirmative support or contradiction; unrelated = no bearing on this span in its full sentence context; uncertain = the passage's bearing cannot be determined.
qualification: none = no relevant limit on this contextual assertion; preserved = relevant scope, condition, exception, relationship or certainty is retained; missing = the candidate drops or expands a relevant limit; uncertain = preservation of a relevant limit cannot be determined. A preserved limit need not be repeated verbatim, and an unrelated detail need not be restated. Do not invent a stronger assertion from a necessary condition, conditional rule or mere time order.
For each passageCheck, explain its contribution and any relevant qualification in at most 240 characters. Cite zero to two catalog sentenceIds FROM THAT PASSAGE. Support, contradiction, preserved and missing require evidence. If the needed evidence is not selectable, keep its full text in context and use uncertain rather than inventing a citation or claiming it was verified. Unrelated is exclusive: qualification must be none and evidence empty.
After all passageChecks, give the span's verdict, basis, explanation and final evidence. basis supported maps to verdict supported; contradiction and insufficient_evidence map to unsupported; uncertain maps to uncertain. Missing evidence is not proof of a contradiction. Missing observations are not proof of zero events. A universal rule does not establish the existence of an unmentioned subgroup. Use only the supplied sources, not an assertion about all possible reports.
Any acknowledged contradiction or missing qualification blocks supported. An uncertain contribution or qualification also blocks supported; with no decisive evidenced negative, use uncertain. An evidenced contradiction requires basis contradiction and a final citation from that contradictory passageCheck. Otherwise a missing qualification requires basis insufficient_evidence and a final citation from a check documenting the missing qualification. An evidenced negative can remain unsupported despite separate uncertainty.
Supported requires at least one support-contributing check and a final citation from one; context or unrelated checks alone cannot prove support. Every final evidence ID must also occur in a related passageCheck for this same span. Keep the existing one-or-two final citations for supported; do not supply typed quotes. Insufficient evidence with no cited missing qualification may have no final evidence.
Return the new specified JSON schema with complete ordered passageChecks and a basis for every span. Never rewrite the candidate, skip a passage, copy a prior verdict, or output a model/article approval. These fields expose your assessments for review; they do not prove factual accuracy.`;

const issued=new WeakMap(),sha=x=>createHash('sha256').update(x).digest('hex');
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const fail=code=>Object.assign(new Error(code),{code});
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const text=x=>typeof x==='string'&&x===x.trim()&&x.length>0&&x.length<=240&&!/[\p{Cc}\p{Cf}]/u.test(x);
const contributions=['support','contradiction','context','unrelated','uncertain'];
const qualifications=['none','preserved','missing','uncertain'];
const bases=['supported','contradiction','insufficient_evidence','uncertain'];
const invalid=code=>freeze({valid:false,supported:false,coverageComplete:false,consistent:false,code});

export function buildPassageScopeReview(input){
  const base=buildSourceSentenceReview(input);
  if(base.data.passages.length>PASSAGE_SCOPE_LIMITS.passages||base.data.spans.length>PASSAGE_SCOPE_LIMITS.spans||
    base.data.passages.length*base.data.spans.length>PASSAGE_SCOPE_LIMITS.checks)throw fail('PASSAGE_SCOPE_SIZE');
  const {reviewSha256:unused,...original}=base.data;
  const data={...original,policy:PASSAGE_SCOPE_CONTRACT,evidencePolicy:base.data.policy};
  data.reviewSha256=sha(JSON.stringify(data));
  if(Buffer.byteLength(JSON.stringify(data),'utf8')>PASSAGE_SCOPE_LIMITS.dataBytes)throw fail('PASSAGE_SCOPE_SIZE');
  assertSpanReviewJson(data);
  const schema=structuredClone(base.schema),judgment=schema.properties.judgments.items;
  schema.properties.reviewSha256.enum=[data.reviewSha256];
  // Ordering is also enforced by the host; IDs in JSON schema alone do not do so.
  judgment.required=['spanId','passageChecks','verdict','basis','explanation','evidence'];
  judgment.properties.basis={type:'string',enum:bases};
  judgment.properties.passageChecks={type:'array',minItems:data.passages.length,maxItems:data.passages.length,
    items:{type:'object',additionalProperties:false,required:['evidenceId','contribution','qualification','explanation','evidence'],properties:{
      evidenceId:{type:'string',enum:data.passages.map(p=>p.evidenceId)},
      contribution:{type:'string',enum:contributions},qualification:{type:'string',enum:qualifications},
      explanation:{type:'string',minLength:1,maxLength:240},evidence:structuredClone(judgment.properties.evidence)}}};
  const view=freeze({data,schema,prompt:PASSAGE_SCOPE_PROMPT});issued.set(view,base);return view;
}

// Preserve rawSelection separately from the host projection used by the legacy
// citation validator. Reject inconsistent records; never rewrite their verdicts.
export function validatePassageScopeReview(value,view){
  const base=issued.get(view);if(!base)return invalid('PASSAGE_SCOPE_VIEW');
  try{assertSpanReviewJson(value);}catch{return invalid('PASSAGE_SCOPE_DATA');}
  if(!exact(value,['reviewSha256','judgments'])||value.reviewSha256!==view.data.reviewSha256||
    !Array.isArray(value.judgments)||value.judgments.length!==base.data.spans.length)return invalid('PASSAGE_SCOPE_BINDING');
  const catalog=new Map(base.data.catalog.map(e=>[e.sentenceId,e])),projected=[];
  for(const [i,j]of value.judgments.entries()){
    if(!exact(j,['spanId','passageChecks','verdict','basis','explanation','evidence'])||j.spanId!==base.data.spans[i].spanId||
      !bases.includes(j.basis)||!Array.isArray(j.passageChecks)||j.passageChecks.length!==base.data.passages.length)return invalid('PASSAGE_SCOPE_COVERAGE');
    for(const [n,p]of j.passageChecks.entries()){
      if(!exact(p,['evidenceId','contribution','qualification','explanation','evidence'])||p.evidenceId!==base.data.passages[n].evidenceId||
        !contributions.includes(p.contribution)||!qualifications.includes(p.qualification)||!text(p.explanation)||
        !Array.isArray(p.evidence)||p.evidence.length>2)return invalid('PASSAGE_SCOPE_CHECK');
      const seen=new Set();
      for(const e of p.evidence){
        if(!exact(e,['sentenceId'])||typeof e.sentenceId!=='string'||catalog.get(e.sentenceId)?.evidenceId!==p.evidenceId||seen.has(e.sentenceId))return invalid('PASSAGE_SCOPE_EVIDENCE');
        seen.add(e.sentenceId);
      }
      if(((p.contribution==='support'||p.contribution==='contradiction'||p.qualification==='preserved'||p.qualification==='missing')&&!p.evidence.length)||
        (p.contribution==='unrelated'&&(p.qualification!=='none'||p.evidence.length)))return invalid('PASSAGE_SCOPE_EVIDENCE');
    }
    const contradictions=j.passageChecks.filter(p=>p.contribution==='contradiction');
    const missing=j.passageChecks.filter(p=>p.qualification==='missing');
    const uncertain=j.passageChecks.some(p=>p.contribution==='uncertain'||p.qualification==='uncertain');
    const supporters=j.passageChecks.filter(p=>p.contribution==='support');
    const expectedVerdict=j.basis==='supported'?'supported':j.basis==='uncertain'?'uncertain':'unsupported';
    if(j.verdict!==expectedVerdict||
      (contradictions.length&&j.basis!=='contradiction')||(!contradictions.length&&j.basis==='contradiction')||
      (!contradictions.length&&missing.length&&j.basis!=='insufficient_evidence')||
      (!contradictions.length&&!missing.length&&uncertain&&j.basis!=='uncertain')||
      (j.basis==='uncertain'&&!uncertain)||
      (j.basis==='supported'&&(contradictions.length||missing.length||uncertain||!supporters.length)))return invalid('PASSAGE_SCOPE_CONSISTENCY');
    if(!Array.isArray(j.evidence)||j.evidence.length>2)return invalid('PASSAGE_SCOPE_FINAL_EVIDENCE');
    const citedBy=rows=>new Set(rows.flatMap(p=>p.evidence.map(e=>e.sentenceId)));
    const all=citedBy(j.passageChecks.filter(p=>p.contribution!=='unrelated'));
    if(j.evidence.some(e=>!exact(e,['sentenceId'])||!all.has(e.sentenceId)))return invalid('PASSAGE_SCOPE_FINAL_EVIDENCE');
    const decisive=contradictions.length?contradictions:missing.length?missing:j.basis==='supported'?supporters:[];
    if(decisive.length&&!j.evidence.some(e=>citedBy(decisive).has(e.sentenceId)))return invalid('PASSAGE_SCOPE_FINAL_EVIDENCE');
    projected.push({spanId:j.spanId,verdict:j.verdict,explanation:j.explanation,evidence:structuredClone(j.evidence)});
  }
  const citationSelection={reviewSha256:base.data.reviewSha256,judgments:projected};
  const verdict=validateSourceSentenceReview(citationSelection,base);
  if(!verdict.valid)return invalid('PASSAGE_SCOPE_CITATION');
  return freeze({valid:true,supported:verdict.supported,spans:verdict.spans,coverageComplete:true,consistent:true,
    rawSelection:structuredClone(value),citationSelection,quotedPayload:verdict.quotedPayload,
    modelQualified:false,articleApproved:false,publicationReady:false});
}
