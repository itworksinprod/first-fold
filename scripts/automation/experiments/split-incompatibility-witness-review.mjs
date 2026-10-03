// Offline diagnostic only. A cited premise is a model assertion, not host-proved meaning.
import {createHash} from 'node:crypto';
import {assertSpanReviewJson} from './span-source-review.mjs';
import {
  buildSplitScopeWitnessReview,validateSplitPassageStage,combineSplitPassageReviews,
  SPLIT_SCOPE_WITNESS_CLAIM_PROMPT,SPLIT_SCOPE_WITNESS_CHECKS_PROMPT,
} from './split-passage-review.mjs';

export const SPLIT_INCOMPATIBILITY_WITNESS_CONTRACT='blinded-claim-passage-incompatibility-witness-v4';
const witnessInstructions=`
Use the additional incompatibilityWitness object to separate a SOURCE-ESTABLISHED premise from your inference about the candidate. Each object has exactly kind, sourceSentenceIds, assertedSourcePremise and incompatibility. Do not use the object to repair another response or anticipate another stage's decision.
For contradiction ONLY, choose one of these kinds:
- contrary_instance: identify a particular subject that the sources establish exists, and its incompatible property or membership. assertedSourcePremise must state both that established instance and the relevant property. A universal rule alone, a hypothetical member, or an unspecified subgroup cannot establish such an instance.
- opposite_relation: state the source's explicit relation that is incompatible with the ACTUAL candidate relation. Reversing an implication, converting necessity into sufficiency, or changing the subject does not supply an opposite relation.
- policy_exclusion: state an express exemption or excluded policy scope that the actual candidate overrides. An observed member is unnecessary for an explicit policy exclusion; an unmentioned subgroup is not an exemption.
sourceSentenceIds must contain one or two exact IDs already selected in this SAME judgment's evidence, in that selection's order. For a passage row they must belong to THAT passage. assertedSourcePremise states only what those source units establish; incompatibility separately explains why that premise and the actual contextual assertion cannot both hold. Each text field is nonempty, trimmed, and at most 240 characters. Do not cite an ID merely because its wording is related.
For all other bases or contributions use exactly {"kind":"none","sourceSentenceIds":[],"assertedSourcePremise":"","incompatibility":""}. If you cannot establish an incompatible premise, do not invent one to fill this object: use insufficient evidence, context or uncertainty as the original decision rules require. Decisive unselectable text remains uncertainty. Genuine IDs do not prove the premise you assert or your inference; the complete answer remains subject to independent exact-text review.
`;
export const SPLIT_INCOMPATIBILITY_WITNESS_CLAIM_PROMPT=SPLIT_SCOPE_WITNESS_CLAIM_PROMPT+witnessInstructions+
  '\nInclude incompatibilityWitness in every claim judgment. Its trigger is basis contradiction. Do not return passage checks.';
export const SPLIT_INCOMPATIBILITY_WITNESS_CHECKS_PROMPT=SPLIT_SCOPE_WITNESS_CHECKS_PROMPT+witnessInstructions+
  '\nInclude incompatibilityWitness in EVERY passage check, not at the span level. Its trigger is contribution contradiction. A support contribution supplies a premise, not necessarily support for the entire claim after all exceptions are applied.';

const pairs=new WeakMap(),stages=new WeakMap(),sha=x=>createHash('sha256').update(x).digest('hex');
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const boundedText=x=>typeof x==='string'&&x===x.trim()&&x.length>0&&x.length<=240&&!/[\p{Cc}\p{Cf}]/u.test(x);
const status={witnessSemanticsChecked:false,independentReview:'required',modelQualified:false,articleApproved:false,publicationReady:false};
const invalid=code=>freeze({valid:false,supported:false,code,...status});
const witnessKeys=['kind','sourceSentenceIds','assertedSourcePremise','incompatibility'];
const witnessSchema={type:'object',additionalProperties:false,required:witnessKeys,properties:{
  kind:{type:'string',enum:['none','contrary_instance','opposite_relation','policy_exclusion']},
  sourceSentenceIds:{type:'array',minItems:0,maxItems:2,items:{type:'string',minLength:1}},
  assertedSourcePremise:{type:'string',maxLength:240},incompatibility:{type:'string',maxLength:240},
}};

export function buildSplitIncompatibilityWitnessReview(input){
  // The existing builder admits safe JSON, preserves full sources, and issues core views.
  const core=buildSplitScopeWitnessReview(input),result={};
  for(const [stage,prompt]of [
    ['claim',SPLIT_INCOMPATIBILITY_WITNESS_CLAIM_PROMPT],['checks',SPLIT_INCOMPATIBILITY_WITNESS_CHECKS_PROMPT],
  ]){
    const {reviewSha256:previousHash,policy:previousPolicy,promptSha256:previousPrompt,...original}=core[stage].data;
    const data={...original,policy:SPLIT_INCOMPATIBILITY_WITNESS_CONTRACT,promptSha256:sha(prompt)};
    data.reviewSha256=sha(JSON.stringify(data));assertSpanReviewJson(data);
    if(Buffer.byteLength(JSON.stringify(data),'utf8')>50000)throw Object.assign(new Error('SPLIT_WITNESS_SIZE'),{code:'SPLIT_WITNESS_SIZE'});
    const schema=structuredClone(core[stage].schema),judgment=schema.properties.judgments.items;
    const row=stage==='claim'?judgment:judgment.properties.passageChecks.items;
    row.required.push('incompatibilityWitness');row.properties.incompatibilityWitness=structuredClone(witnessSchema);
    row.properties.incompatibilityWitness.properties.sourceSentenceIds.items.enum=data.catalog.map(e=>e.sentenceId);
    schema.properties.reviewSha256.enum=[data.reviewSha256];
    const view=freeze({data,schema,prompt});stages.set(view,{stage,core:core[stage]});result[stage]=view;
  }
  const pair=freeze(result);pairs.set(pair,core);return pair;
}

function validateWitness(witness,row,contradiction){
  if(!exact(witness,witnessKeys)||!Array.isArray(witness.sourceSentenceIds))return false;
  if(!contradiction)return witness.kind==='none'&&witness.sourceSentenceIds.length===0&&
    witness.assertedSourcePremise===''&&witness.incompatibility==='';
  if(!['contrary_instance','opposite_relation','policy_exclusion'].includes(witness.kind)||
    witness.sourceSentenceIds.length<1||witness.sourceSentenceIds.length>2||
    !boundedText(witness.assertedSourcePremise)||!boundedText(witness.incompatibility))return false;
  const ids=row.evidence.map(e=>e.sentenceId),selected=witness.sourceSentenceIds;
  if(new Set(selected).size!==selected.length||selected.some(id=>typeof id!=='string'||!ids.includes(id)))return false;
  // Ordered subsequence, not a union with another row or passage's citations.
  return ids.filter(id=>selected.includes(id)).every((id,i)=>id===selected[i]);
}

export function validateSplitIncompatibilityWitnessStage(value,view){
  const bound=stages.get(view);if(!bound)return invalid('SPLIT_WITNESS_VIEW');
  try{assertSpanReviewJson(value);}catch{return invalid('SPLIT_WITNESS_DATA');}
  if(!exact(value,['reviewSha256','judgments'])||value.reviewSha256!==view.data.reviewSha256||
    !Array.isArray(value.judgments)||value.judgments.length!==view.data.spans.length)return invalid('SPLIT_WITNESS_BINDING');
  for(const [i,j]of value.judgments.entries()){
    const keys=bound.stage==='claim'?['spanId','verdict','basis','explanation','evidence','incompatibilityWitness']:['spanId','passageChecks'];
    if(!exact(j,keys)||j.spanId!==view.data.spans[i].spanId)return invalid('SPLIT_WITNESS_COVERAGE');
    if(bound.stage==='checks'&&(!Array.isArray(j.passageChecks)||j.passageChecks.length!==view.data.passages.length||
      j.passageChecks.some(p=>!exact(p,['evidenceId','contribution','qualification','explanation','evidence','incompatibilityWitness']))))
      return invalid('SPLIT_WITNESS_COVERAGE');
  }
  // Explicit synthetic core projection for UNCHANGED validation, never a provider reply.
  // Remove only the new object; no core label, explanation, citation, order or qualification changes.
  const coreProjection={reviewSha256:bound.core.data.reviewSha256,judgments:value.judgments.map(j=>
    bound.stage==='claim'?Object.fromEntries(Object.entries(structuredClone(j)).filter(([key])=>key!=='incompatibilityWitness')):
      {...structuredClone(j),passageChecks:j.passageChecks.map(p=>Object.fromEntries(Object.entries(structuredClone(p)).filter(([key])=>key!=='incompatibilityWitness')))},
  )};
  const coreValidation=validateSplitPassageStage(coreProjection,bound.core);
  if(!coreValidation.valid)return invalid(coreValidation.code);
  for(const j of value.judgments){
    const rows=bound.stage==='claim'?[j]:j.passageChecks;
    if(rows.some(row=>!validateWitness(row.incompatibilityWitness,row,
      bound.stage==='claim'?row.basis==='contradiction':row.contribution==='contradiction')))return invalid('SPLIT_WITNESS_PREMISE');
  }
  return freeze({valid:true,stage:bound.stage,rawSelection:structuredClone(value),
    projection:'explicit-witness-removal-for-unchanged-core-validation',coreProjection,coreValidation,...status});
}

export function combineSplitIncompatibilityWitnessReviews(claim,checks,pair){
  const core=pairs.get(pair);if(!core)return invalid('SPLIT_WITNESS_PAIR');
  const a=validateSplitIncompatibilityWitnessStage(claim,pair.claim);if(!a.valid)return a;
  const b=validateSplitIncompatibilityWitnessStage(checks,pair.checks);if(!b.valid)return b;
  const coreComposite=combineSplitPassageReviews(a.coreProjection,b.coreProjection,core);
  return freeze({valid:coreComposite.valid,supported:coreComposite.supported,code:coreComposite.code??null,
    composition:'raw-witness-responses-with-explicit-core-projection',rawClaim:structuredClone(claim),rawChecks:structuredClone(checks),
    coreProjection:{claim:a.coreProjection,checks:b.coreProjection},coreComposite,
    assembledSelection:coreComposite.assembledSelection,...status});
}
