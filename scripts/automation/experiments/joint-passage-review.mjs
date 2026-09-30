// Isolated prompt revision. All structural/citation gates delegate to v1 unchanged.
import {createHash} from 'node:crypto';
import {assertSpanReviewJson} from './span-source-review.mjs';
import {buildPassageScopeReview,validatePassageScopeReview,PASSAGE_SCOPE_PROMPT} from './passage-scope-review.mjs';

export const JOINT_PASSAGE_CONTRACT='joint-passage-inference-v2';
export const JOINT_PASSAGE_PROMPT=PASSAGE_SCOPE_PROMPT+`
Joint-source reasoning clarification:
Read the supplied passages as one evidence set before assigning the passage fields. A general rule plus an explicit exception can support a conclusion limited to the remainder of that same population. The conclusion need not be stated verbatim in one sentence. This is source-grounded inference, not permission to add facts or assume a population exists.
Keep the direction of inference: a requirement need not be sufficient, and a conditional rule need not describe an observed event. An expressly exempt group does not inherit the general obligation; the remaining group does not lose it merely because the source states the exception separately. Policy exclusions delimit the rule even without an observed instance.
For each relevant qualification, compare the candidate's actual scope with the qualified source rule. Use preserved when the candidate retains the restriction, including through an equivalent complementary scope; use missing only when the candidate actually drops, expands or changes it. A restriction is not none merely because it is correctly retained. Do not invent an omitted restriction when the candidate never asserts the stronger claim that would need it.
Separate absent support from incompatible evidence. A universal rule alone does not establish that an exclusive subgroup is the only eligible group, nor that any other subgroup exists. If exclusivity is not established and no incompatible fact or policy is supplied, the basis is insufficient_evidence, not contradiction. Never add an unmentioned population to manufacture a contradiction.
The final evidence must reflect your recorded decisive basis. For joint support, select the rule and qualification units needed to establish the claim together, within the unchanged two-unit limit. If the needed evidence cannot fit that limit, do not shorten evidence or silently omit a necessary premise; retain the uncertainty or hold. For a missing qualification, cite its recorded passage as already required.
Keep the candidate, source text, IDs and response schema unchanged. These generic instructions do not supply an expected verdict for any case. Do not repair a prior response or replace its explanation with a reference answer.`;

const issued=new WeakMap(),sha=x=>createHash('sha256').update(x).digest('hex');
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const invalid=code=>freeze({valid:false,supported:false,coverageComplete:false,consistent:false,code});

export function buildJointPassageReview(input){
  const base=buildPassageScopeReview(input);
  const {reviewSha256:unused,...original}=base.data;
  const data={...original,policy:JOINT_PASSAGE_CONTRACT,passagePolicy:base.data.policy,promptSha256:sha(JOINT_PASSAGE_PROMPT)};
  data.reviewSha256=sha(JSON.stringify(data));assertSpanReviewJson(data);
  if(Buffer.byteLength(JSON.stringify(data),'utf8')>50000)throw Object.assign(new Error('JOINT_PASSAGE_SIZE'),{code:'JOINT_PASSAGE_SIZE'});
  const schema=structuredClone(base.schema);schema.properties.reviewSha256.enum=[data.reviewSha256];
  const view=freeze({data,schema,prompt:JOINT_PASSAGE_PROMPT});issued.set(view,base);return view;
}

export function validateJointPassageReview(value,view){
  const base=issued.get(view);if(!base)return invalid('JOINT_PASSAGE_VIEW');
  try{assertSpanReviewJson(value);}catch{return invalid('JOINT_PASSAGE_DATA');}
  if(!value||typeof value!=='object'||Array.isArray(value)||value.reviewSha256!==view.data.reviewSha256)return invalid('JOINT_PASSAGE_BINDING');
  // Only the host binding hash is projected. Never change a model verdict or citation.
  const passageSelection={...structuredClone(value),reviewSha256:base.data.reviewSha256};
  const result=validatePassageScopeReview(passageSelection,base);
  if(!result.valid)return result;
  return freeze({...result,rawSelection:structuredClone(value),passageSelection});
}
