import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {GRAMMAR_PRESERVATION_CONTROLS as controls, GRAMMAR_PRESERVATION_PROBES as probes,
  GRAMMAR_CONTRAST_SHA256, buildGrammarPreservationViews} from '../scripts/automation/experiments/grammar-preservation-cases.mjs';
import {PRINTSHOP_DEFINITION_SOURCE, SYNTHETIC_DEFINITION_SOURCE, loadDefinitionGlossary} from '../scripts/automation/experiments/definition-glossaries.mjs';
import {validateDefinitionPreservationReview as validate} from '../scripts/automation/experiments/definition-preservation.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const invalid = {valid:false,supported:false};
const payload = (view, meaningPreserved) => ({reviewSha256:view.data.reviewSha256,
  judgments:[{claimId:'C1',comparison:'Mock contract verdict; not model semantic evidence.',meaningPreserved}]});
const frozen = value => {
  if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozen); }
};

test('grammar controls pin ten labels and keep the ambiguous probe explicitly unscored', () => {
  assert.equal(GRAMMAR_CONTRAST_SHA256,'481ef7c7343d959e9970f6d423b83a3888d7600172a38e83bf8c8b8186fe44a8');
  assert.equal(controls.length,10); assert.equal(probes.length,1);
  assert.deepEqual(controls.map(c=>c.expectedMeaningPreserved),[true,true,true,true,false,false,false,false,false,false]);
  assert.equal(probes[0].expectedMeaningPreserved,null);
  assert.match(probes[0].rationale,/unscored/);
  frozen(controls); frozen(probes);
  assert.equal(new Set([...controls,...probes].map(c=>c.caseId)).size,11);
  assert.throws(()=>{controls[0].expectedMeaningPreserved=false;},TypeError);
});

test('grammar and gloss contrasts share one original; purpose-to-capability control stays distinct', () => {
  const [identity,grammar,gloss,both]=controls;
  for(const c of [grammar,gloss,both]) assert.deepEqual(c.input.previousClaims,identity.input.previousClaims);
  const original=identity.input.previousClaims[0];
  assert.equal(identity.input.claims[0],original);
  assert.match(original,/the shop uses it for that alignment task/);
  assert.match(original,/the tool aligns them only while its latch is closed/);
  assert.equal(grammar.input.claims[0],original.replace('a tool to align','a tool that aligns'));
  const withGloss=text=>text.replace('counted batches','counted batches (groups of exactly twelve sheets each)');
  assert.equal(gloss.input.claims[0],withGloss(original));
  assert.equal(both.input.claims[0],withGloss(grammar.input.claims[0]));
  assert.match(controls[7].input.claims[0],/exactly thirteen sheets/);
  assert.equal(controls[9].input.claims[0],controls[9].input.previousClaims[0].replace('a tool designed to align','a tool that aligns'));
  assert.match(controls[9].input.previousClaims[0],/has not tested whether/);
});

test('printshop glossary is exact-source-bound and does not alter existing glossary identities', () => {
  const g=loadDefinitionGlossary('synthetic-printshop-definitions-v1',PRINTSHOP_DEFINITION_SOURCE);
  frozen(g);
  assert.equal(g.sourceSha256,'917d832ab691840f0cc07de3c48b58cef69697762ca8e04e5529697e40705a49');
  assert.equal(g.manifestSha256,'caee6e7494fa292d08ea32a53b9c11527fb567e15c2f6217f92ec493ff2310b2');
  assert.deepEqual(g.definitions.map(d=>[d.term,d.definition]),[
    ['counted batch','a group of exactly twelve sheets'],['counted batches','groups of exactly twelve sheets each']]);
  assert.throws(()=>loadDefinitionGlossary(g.id,PRINTSHOP_DEFINITION_SOURCE.replace('exactly','at least')),/DEFINITION_GLOSSARY_BINDING/);
  assert.throws(()=>loadDefinitionGlossary(g.id,SYNTHETIC_DEFINITION_SOURCE),/DEFINITION_GLOSSARY_BINDING/);
  assert.equal(loadDefinitionGlossary('synthetic-generation-definitions-v1',SYNTHETIC_DEFINITION_SOURCE).manifestSha256,
    '0cf61d8cd2c159df5444d79ea6975b681d7120d922d258a166f2a3035015fec9');
});

test('views keep the exact existing meaning prompt and exclude labels, rationales and article sources', () => {
  const views=buildGrammarPreservationViews(); frozen(views);
  assert.equal(views.length,11);
  for(const [i,{caseId,view}] of views.entries()) {
    const c=[...controls,...probes][i]; assert.equal(caseId,c.caseId);
    assert.equal(sha(view.prompt),'b0711232aac6664bf9ff040aa4edb61a8e2c3bac199949adea8132db299c9785');
    assert.deepEqual(Object.keys(view),['data','schema','prompt']);
    assert.deepEqual(Object.keys(view.data),['policy','claims','previousClaims','glossaryBinding','definitions','reviewSha256']);
    assert.deepEqual(view.data.claims.map(c=>c.text),c.input.claims);
    assert.deepEqual(view.data.previousClaims.map(c=>c.text),c.input.previousClaims);
    const serialized=JSON.stringify(view);
    assert.doesNotMatch(serialized,/expectedMeaningPreserved|rationale|caseId|"passages"|"sources"|MIT|HardFlow/);
    assert.ok(!serialized.includes(c.rationale)); assert.ok(!serialized.includes(PRINTSHOP_DEFINITION_SOURCE));
    const {reviewSha256,...bound}=view.data; assert.equal(reviewSha256,sha(JSON.stringify(bound)));
    assert.equal(view.data.definitions.length,caseId==='R07'?2:1);
  }
  assert.equal(new Set(views.map(({view})=>view.data.reviewSha256)).size,11);
});

test('mock labels test plumbing only and cannot turn an identity, a definition or the probe into an automatic pass', () => {
  const views=buildGrammarPreservationViews();
  for(const [i,c] of controls.entries()) {
    const {view}=views[i];
    assert.equal(validate(payload(view,c.expectedMeaningPreserved),view).supported,c.expectedMeaningPreserved);
    assert.equal(validate(payload(view,!c.expectedMeaningPreserved),view).supported,!c.expectedMeaningPreserved,
      'The validator validates the verdict, not whether a model reasoned correctly');
  }
  assert.equal(validate(payload(views[0].view,false),views[0].view).supported,false);
  const probe=views.at(-1).view;
  for(const value of [true,false]) assert.equal(validate(payload(probe,value),probe).supported,value);
  assert.equal(probes[0].expectedMeaningPreserved,null,'Do not score either probe answer as a gold-label success');
});

test('cross-case hashes, malformed verdicts and extra approval fields cannot bypass strict review validation', () => {
  const [{view:first},{view:second}]=buildGrammarPreservationViews();
  assert.deepEqual(validate(payload(first,true),second),invalid);
  assert.deepEqual(validate(payload(first,true),structuredClone(first)),invalid);
  for(const mutate of [p=>{p.approved=true;},p=>{p.judgments=[];},p=>{p.judgments[0].meaningPreserved='true';},
    p=>{p.judgments[0].sourceSupported=true;},p=>{p.judgments[0].comparison=' ';}]) {
    const p=payload(first,true);mutate(p);assert.deepEqual(validate(p,first),invalid);
  }
});

test('fixed fixture itself has no inference, network, delivery or approval implementation', async () => {
  const fixture=await readFile(new URL('../scripts/automation/experiments/grammar-preservation-cases.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(fixture,/fetch\(|requestWorkersAiEditorial|process\.env|sendEmail|approved:\s*true/);
});
