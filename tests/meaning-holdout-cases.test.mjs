import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {MEANING_HOLDOUT_CONTROLS as controls, MEANING_HOLDOUT_PROBES as probes,
  MEANING_HOLDOUT_SHA256, buildMeaningHoldoutViews} from '../scripts/automation/experiments/meaning-holdout-cases.mjs';
import {GRAMMAR_PRESERVATION_CONTROLS, GRAMMAR_PRESERVATION_PROBES,
  buildGrammarPreservationViews} from '../scripts/automation/experiments/grammar-preservation-cases.mjs';
import {validateDefinitionPreservationReview as validate} from '../scripts/automation/experiments/definition-preservation.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const frozen = value => {
  if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozen); }
};
const reply = (view, meaningPreserved) => ({reviewSha256:view.data.reviewSha256,
  judgments:[{claimId:'C1', comparison:'Mock plumbing verdict, not semantic evidence.', meaningPreserved}]});

test('fresh holdout labels, revised before inference, are immutable with an unscored probe', () => {
  assert.equal(MEANING_HOLDOUT_SHA256,'cc41aad87789d98c8d54cb74992da1065610fbc3bf9332238be41acdad2f56c3');
  assert.equal(controls.length,10); assert.equal(probes.length,1);
  assert.deepEqual(controls.map(c=>c.expectedMeaningPreserved),[true,false,true,false,true,false,true,false,true,false]);
  assert.equal(probes[0].caseId,'P02'); assert.equal(probes[0].expectedMeaningPreserved,null);
  assert.match(probes[0].rationale,/Unscored/); frozen(controls); frozen(probes);
  assert.throws(()=>{controls[0].expectedMeaningPreserved=false;},TypeError);
  // Guard the pre-inference actor/causality adjudication, not a response-based relabel.
  assert.equal(controls[2].input.claims[0],"The library's tablets may be borrowed by adult residents, and by no one else.");
  assert.match(controls[7].rationale,/does not establish causation/);
});

test('holdouts do not reuse the known printshop cases or duplicate one another', () => {
  const old=[...GRAMMAR_PRESERVATION_CONTROLS,...GRAMMAR_PRESERVATION_PROBES];
  const all=[...controls,...probes];
  assert.equal(new Set(all.map(c=>c.caseId)).size,11);
  const oldText=new Set(old.flatMap(c=>[...c.input.previousClaims,...c.input.claims]));
  const newText=all.flatMap(c=>[...c.input.previousClaims,...c.input.claims]);
  assert.equal(new Set(newText).size,22);
  for(const text of newText) assert.equal(oldText.has(text),false);
});

test('holdout requests preserve the prior prompt and glossary contract but send no labels or irrelevant definitions', () => {
  const views=buildMeaningHoldoutViews(), prior=buildGrammarPreservationViews()[0].view;
  frozen(views); assert.equal(views.length,11);
  for(const [i,{caseId,view}] of views.entries()) {
    const c=[...controls,...probes][i]; assert.equal(caseId,c.caseId);
    assert.equal(view.prompt,prior.prompt);
    assert.equal(sha(view.prompt),'b0711232aac6664bf9ff040aa4edb61a8e2c3bac199949adea8132db299c9785');
    assert.deepEqual(view.data.glossaryBinding,prior.data.glossaryBinding);
    assert.deepEqual(view.data.definitions,[]);
    assert.deepEqual(view.data.claims.map(c=>c.text),c.input.claims);
    assert.deepEqual(view.data.previousClaims.map(c=>c.text),c.input.previousClaims);
    const schema=structuredClone(view.schema);
    schema.properties.reviewSha256.enum=prior.schema.properties.reviewSha256.enum;
    assert.deepEqual(schema,prior.schema);
    const serialized=JSON.stringify(view);
    assert.doesNotMatch(serialized,/expectedMeaningPreserved|rationale|caseId|"passages"|"sources"|MIT|HardFlow/);
    for(const other of [...controls,...probes]) assert.ok(!serialized.includes(other.rationale));
    const {reviewSha256,...data}=view.data; assert.equal(reviewSha256,sha(JSON.stringify(data)));
  }
  assert.equal(new Set(views.map(({view})=>view.data.reviewSha256)).size,11);
});

test('strict verdict binding remains separate from gold-label scoring', () => {
  const views=buildMeaningHoldoutViews();
  for(const {view} of views) for(const meaning of [true,false]) {
    assert.equal(validate(reply(view,meaning),view).supported,meaning);
  }
  const first=views[0].view;
  assert.deepEqual(validate(reply(first,true),views[1].view),{valid:false,supported:false});
  assert.deepEqual(validate({...reply(first,true),approved:true},first),{valid:false,supported:false});
  assert.equal(probes[0].expectedMeaningPreserved,null);
});

test('holdout fixture cannot infer, deliver, fetch or change approval policy', async () => {
  const code=await readFile(new URL('../scripts/automation/experiments/meaning-holdout-cases.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(code,/fetch\(|requestWorkersAiEditorial|process\.env|sendEmail|approved:\s*true/);
});
