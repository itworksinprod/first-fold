// An unchanged reviewer applied to one aligned unit at a time. No inference here.
import {buildTextPreservationReview,exactTextPreservation} from '../free/text-preservation-review.mjs';
import {buildDefinitionPreservationReview,validateDefinitionPreservationReview} from './definition-preservation.mjs';
const issued = new WeakSet();
const freeze = value => {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function buildUnitMeaningPlan(input,glossary) {
  buildTextPreservationReview(input); // Validate full cardinality/order inventory first.
  const plan=input.claims.map((text,unitIndex)=>{
    const pair={claims:[text],previousClaims:[input.previousClaims[unitIndex]]};
    const textView=buildTextPreservationReview(pair),identity=exactTextPreservation(textView);
    return freeze({unitIndex,view:identity?textView:buildDefinitionPreservationReview(pair,glossary),identity});
  });
  Object.freeze(plan);issued.add(plan);return plan;
}
export function validateUnitMeaningResponses(plan,reviews) {
  const invalid={valid:false,supported:false};
  if(!issued.has(plan)||!Array.isArray(reviews)||reviews.length!==plan.length)return invalid;
  const claims=[];
  for(const [i,entry] of plan.entries()){
    if(reviews[i]?.unitIndex!==entry.unitIndex)return invalid;
    const verdict=entry.identity??validateDefinitionPreservationReview(reviews[i].response,entry.view);
    if(!verdict.valid)return invalid;
    claims.push({claimId:`C${i+1}`,meaningPreserved:verdict.supported});
  }
  return {valid:true,supported:claims.every(c=>c.meaningPreserved),claims};
}
