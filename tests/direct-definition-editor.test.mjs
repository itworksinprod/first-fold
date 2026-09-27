import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {DIRECT_DEFINITION_PROMPT, COMPACT_DIRECT_DEFINITION_PROMPT, NAMED_COMPOSITION_PROMPT, buildDirectDefinitionPlan, validateDirectDefinitionEdits} from '../scripts/automation/experiments/direct-definition-editor.mjs';
import {CONTEXT_EDITOR_PROMPT} from '../scripts/automation/experiments/context-editor-profile.mjs';
import {loadDefinitionGlossary, SYNTHETIC_DEFINITION_SOURCE} from '../scripts/automation/experiments/definition-glossaries.mjs';
import {buildSentenceRewriteView, applySentenceRewrite} from '../scripts/automation/free/sentence-rewrite.mjs';

function fixture() {
  const glossary=loadDefinitionGlossary('synthetic-generation-definitions-v1',SYNTHETIC_DEFINITION_SOURCE);
  const units={headline:['A synthetic research report'],
    whatHappened:['The controller follows binding rules while generating an answer.', 'The experiment covered two routes.'],
    whyItMatters:['The completed answer must meet the requirements.'],
    whatToWatch:['Its draft candidates do not establish a completed answer.']};
  const catalog=buildSentenceRewriteView(units), plan=buildDirectDefinitionPlan(catalog,glossary);
  const proposal={baselineSha256:catalog.data.baselineSha256,decision:'rewrite',sentences:catalog.data.units.map(u=>({unitId:u.unitId,text:u.text}))};
  proposal.sentences[0].text='The controller follows nonoptional requirements while generating an answer.';
  proposal.sentences[3].text='Its partial answers made before a final answer do not establish a completed answer.';
  return {units,catalog,glossary,plan,proposal};
}
test('profile, editor and CLI preparation cold imports have no initialization cycle',()=>{
  for(const relative of ['../scripts/automation/experiments/context-editor-profile.mjs',
    '../scripts/automation/experiments/direct-definition-editor.mjs','../scripts/automation/private-writer-diagnostic.mjs']){
    const url=new URL(relative,import.meta.url).href;
    execFileSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(url)}); if(m.prepareContextDiagnostic){try{await m.prepareContextDiagnostic('context-direct-language','');throw Error('accepted');}catch(e){if(e.message!=='CONTEXT_EDITOR_PACKET_INVALID')throw e;}}`],{stdio:'pipe'});
  }
});
test('plan locks non-glossary units, selecting only whole terms from the original',()=>{
  const f=fixture();
  assert.deepEqual(f.plan.editableUnits,[{unitId:'U1',terms:['binding rules']},{unitId:'U4',terms:['draft candidates']}]);
  assert.deepEqual(f.plan.lockedUnitIds,['U2','U3']);
  assert.ok(Object.isFrozen(f.plan)&&Object.isFrozen(f.plan.editableUnits[0].terms));
  assert.equal(f.plan.baselineSha256,f.catalog.data.baselineSha256);
  applySentenceRewrite(f.units,f.proposal,f.catalog);
  assert.equal(validateDirectDefinitionEdits(f.proposal,f.catalog,f.plan),true);
});
test('cosmetic changes or added jargon in locked units are held, not silently undone',()=>{
  for(const text of ['The experiment included two routes.','The experiment covered two routes with binding rules.']){
    const f=fixture();f.proposal.sentences[1].text=text;
    assert.throws(()=>validateDirectDefinitionEdits(f.proposal,f.catalog,f.plan),/DIRECT_DEFINITION_LOCKED_UNIT/);
  }
});
test('label plus gloss in either direction, bracketed glosses and unmatched delimiters are held',()=>{
  for(const text of [
    'The controller follows binding rules (nonoptional requirements) while generating an answer.',
    'The controller follows nonoptional requirements (binding rules) while generating an answer.',
    'The controller follows nonoptional requirements [mandatory] while generating an answer.',
    'The controller follows nonoptional requirements (mandatory while generating an answer.',
    'The controller follows binding rules—nonoptional requirements—while generating an answer.',
    'The controller follows BINDING RULES while generating an answer.',
    'The controller follows a binding rule while generating an answer.',
    'The controller follows nonoptional requirements for draft candidates while generating an answer.',
  ]){
    const f=fixture();f.proposal.sentences[0].text=text;
    assert.throws(()=>validateDirectDefinitionEdits(f.proposal,f.catalog,f.plan),/DIRECT_DEFINITION_(ADDED_ASIDE|RETAINED_LABEL)/);
  }
});
test('unchanged technical units are permitted but cannot bypass abstention in the existing gate',()=>{
  const f=fixture();f.proposal.sentences=f.catalog.data.units.map(u=>({unitId:u.unitId,text:u.text}));
  assert.equal(validateDirectDefinitionEdits(f.proposal,f.catalog,f.plan),true);
  assert.throws(()=>applySentenceRewrite(f.units,f.proposal,f.catalog),/DECISION/);
  f.proposal.decision='abstain';assert.deepEqual(applySentenceRewrite(f.units,f.proposal,f.catalog),{decision:'abstain'});
});
test('forged plan, mismatched catalog, truncated or reordered proposal cannot pass',()=>{
  const f=fixture();
  assert.throws(()=>validateDirectDefinitionEdits(f.proposal,f.catalog,structuredClone(f.plan)),/BINDING/);
  const changed=structuredClone(f.catalog);changed.data.units[0].text+=' changed';
  assert.throws(()=>validateDirectDefinitionEdits(f.proposal,changed,f.plan),/BINDING/);
  for(const mutate of [p=>p.sentences.pop(),p=>p.sentences.reverse(),p=>{p.sentences[0].text=3;}]){
    const p=structuredClone(f.proposal);mutate(p);assert.throws(()=>validateDirectDefinitionEdits(p,f.catalog,f.plan),/SHAPE/);
  }
  assert.throws(()=>buildDirectDefinitionPlan({},f.glossary),/INPUT/);
});
test('style pass is expressly not factual or semantic approval',()=>{
  const f=fixture();f.proposal.sentences[0].text='The controller always prevents every possible accident.';
  assert.equal(validateDirectDefinitionEdits(f.proposal,f.catalog,f.plan),true,'Source and meaning must independently veto plausible clear misinformation');
  assert.ok(DIRECT_DEFINITION_PROMPT.startsWith(CONTEXT_EDITOR_PROMPT));
  assert.match(DIRECT_DEFINITION_PROMPT,/all source and meaning checks and independent readability review/);
  assert.doesNotMatch(DIRECT_DEFINITION_PROMPT.slice(CONTEXT_EDITOR_PROMPT.length),/HardFlow|MIT|deployment|optimization/u);
});
test('compact prompt retains scope, alignment, length, abstention and role separation',()=>{
  for(const text of ['byte-for-byte unchanged','110 and 225','one complete sentence per unit','grammatical role',
    'actor, attribution','original order','timing','uncertainty','negation','only JSON','Source support, meaning and readability are checked separately'])assert.ok(COMPACT_DIRECT_DEFINITION_PROMPT.includes(text));
  assert.ok(COMPACT_DIRECT_DEFINITION_PROMPT.length<DIRECT_DEFINITION_PROMPT.length);
  assert.doesNotMatch(COMPACT_DIRECT_DEFINITION_PROMPT,/MIT|HardFlow|robot|physics|safety-critical/u);
});
test('opt-in name anchors are derived from original units, frozen, and keep legacy plans unchanged',()=>{
  const f=fixture();
  const units=structuredClone(f.units);units.whatHappened[0]='ABC says BioFlow follows binding rules while generating an answer.';
  const catalog=buildSentenceRewriteView(units);
  const plan=buildDirectDefinitionPlan(catalog,f.glossary,{protectNames:true});
  assert.deepEqual(plan.nameAnchors[0],{unitId:'U1',names:['ABC','BioFlow']});
  assert.ok(Object.isFrozen(plan.nameAnchors[0].names));
  assert.equal(plan.policy,'direct-definitions-names-v1');
  assert.equal(Object.hasOwn(f.plan,'nameAnchors'),false);
  assert.throws(()=>buildDirectDefinitionPlan(catalog,f.glossary,{protectNames:'true'}),/INPUT/);
  const proposal={baselineSha256:catalog.data.baselineSha256,decision:'rewrite',sentences:catalog.data.units.map(u=>({unitId:u.unitId,text:u.text}))};
  proposal.sentences[0].text='ABC says BioFlow follows nonoptional requirements while generating an answer.';
  assert.equal(validateDirectDefinitionEdits(proposal,catalog,plan),true);
  for(const replacement of ['the method','BioFlows','bioFlow','NewBioFlow','BioFlow2','BioFlow_2','BioFlowé']){
    const changed=structuredClone(proposal);changed.sentences[0].text=changed.sentences[0].text.replace('BioFlow',replacement);
    assert.throws(()=>validateDirectDefinitionEdits(changed,catalog,plan),/NAME_LOST/);
  }
  const moved=structuredClone(proposal);moved.sentences[0].text=moved.sentences[0].text.replace('BioFlow','the method');
  moved.sentences[3].text='BioFlow has partial answers before a final answer.';
  assert.throws(()=>validateDirectDefinitionEdits(moved,catalog,plan),/NAME_LOST/);
  proposal.sentences[0].text="BioFlow says ABC follows nonoptional requirements while generating an answer.";
  assert.equal(validateDirectDefinitionEdits(proposal,catalog,plan),true,'Name presence alone cannot certify actor/ownership relationships; meaning review remains mandatory');
});
test('named composition prompt adds generic reference-preservation and composition guidance, not article answers',()=>{
  assert.ok(NAMED_COMPOSITION_PROMPT.startsWith(COMPACT_DIRECT_DEFINITION_PROMPT));
  assert.match(NAMED_COMPOSITION_PROMPT,/not replacement strings/);
  assert.match(NAMED_COMPOSITION_PROMPT,/original role and ownership/);
  assert.doesNotMatch(NAMED_COMPOSITION_PROMPT,/MIT|HardFlow|BioFlow|robot|physics/u);
});
