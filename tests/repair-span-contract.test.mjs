import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildSentenceRewriteView,applySentenceRewrite} from '../scripts/automation/free/sentence-rewrite.mjs';
import {buildRepairSpanContract,validateRepairSpanEdits,SPAN_REPAIR_PROMPT} from '../scripts/automation/experiments/repair-span-contract.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex');
function fixture(){
  const units={headline:['Synthetic headline'],whatHappened:['Mira satisfies requirements that must be met while Niko may wait.'],
    whyItMatters:['The result stays preliminary.'],whatToWatch:['A broad description can include two goals, but is not evidence of deployment.']};
  const view=buildSentenceRewriteView(units);
  const spec=[['U1','satisfies requirements that must be met'],['U3','broad description']].map(([unitId,text])=>{
    const start=view.data.units.find(u=>u.unitId===unitId).text.indexOf(text);
    return {unitId,start,end:start+text.length,spanSha256:sha(text)};
  });
  const contract=buildRepairSpanContract(view,spec,view.data.baselineSha256);
  const proposal={baselineSha256:view.data.baselineSha256,decision:'rewrite',sentences:view.data.units.map(u=>({unitId:u.unitId,
    text:u.text.replace('satisfies requirements that must be met','meets mandatory requirements').replace('broad description','mathematical description with rules and quality objectives')}))};
  return {units,view,spec,contract,proposal};
}
test('reviewed spans change only defective text and retain exact surrounding clauses',()=>{
  const f=fixture();applySentenceRewrite(f.units,f.proposal,f.view);
  validateRepairSpanEdits(f.proposal,f.view,f.contract);
  assert.ok(Object.isFrozen(f.contract)&&Object.isFrozen(f.contract.spans[0]));
});
test('unchanged defect and unrelated clause edits cannot masquerade as completed repair',()=>{
  for(const mutate of [
    p=>{p.sentences[0].text='Mira satisfies requirements that must be met while Niko may wait.';},
    p=>{p.sentences[0].text=p.sentences[0].text.replace('Niko may','Niko must');},
    p=>{p.sentences[2].text=p.sentences[2].text.replace('deployment','implementation');},
    p=>{p.sentences[0].text=p.sentences[0].text.replace('Mira','Niko');},
  ]){
    const f=fixture();mutate(f.proposal);applySentenceRewrite(f.units,f.proposal,f.view);
    assert.throws(()=>validateRepairSpanEdits(f.proposal,f.view,f.contract),/REPAIR_SPAN_(UNCHANGED_DEFECT|SURROUNDING_TEXT)/);
  }
});
test('span binding rejects wrong seed, range, digest, duplicate targets and cloned contract',()=>{
  const f=fixture();
  assert.throws(()=>buildRepairSpanContract(f.view,f.spec),/BINDING/);
  for(const spec of [[],[f.spec[0],f.spec[0]],f.spec.map(s=>({...s,spanSha256:'0'.repeat(64)})),
    f.spec.map(s=>({...s,start:-1})),f.spec.map(s=>({...s,end:10000}))]){
    assert.throws(()=>buildRepairSpanContract(f.view,spec,f.view.data.baselineSha256),/REPAIR_SPAN_/);
  }
  assert.throws(()=>validateRepairSpanEdits(f.proposal,f.view,structuredClone(f.contract)),/BINDING/);
  const forged={data:{...f.view.data,units:[]}};
  assert.throws(()=>validateRepairSpanEdits(f.proposal,forged,f.contract),/BINDING/);
});
test('single compacted phrase has a hard word cap without unlocking the remainder',()=>{
  const f=fixture();
  const contract=buildRepairSpanContract(f.view,[{...f.spec[1],maxReplacementWords:5}],f.view.data.baselineSha256);
  assert.throws(()=>validateRepairSpanEdits(f.proposal,f.view,contract),/WORD_LIMIT/);
  for(const maxReplacementWords of [0,21,1.5,'5'])assert.throws(()=>buildRepairSpanContract(f.view,[{...f.spec[1],maxReplacementWords}],f.view.data.baselineSha256),/SPEC/);
});
test('opening-clause repair locks the example and evidence-status caveat',()=>{
  const units={headline:['Synthetic headline'],whatHappened:['Mira completed the trial.'],
    whyItMatters:['The measured result remains limited.'],
    whatToWatch:['Mira has a design that may permit extra objectives, such as saving energy, but this is not evidence of deployment.']};
  const view=buildSentenceRewriteView(units),text=units.whatToWatch[0],end=text.indexOf(', such as');
  const contract=buildRepairSpanContract(view,[{unitId:'U3',start:0,end,spanSha256:sha(text.slice(0,end)),maxReplacementWords:20}],view.data.baselineSha256);
  const proposal={baselineSha256:view.data.baselineSha256,decision:'rewrite',sentences:view.data.units.map(u=>({unitId:u.unitId,
    text:u.unitId==='U3'?'Mira can allow further objectives through its design'+text.slice(end):u.text}))};
  applySentenceRewrite(units,proposal,view);validateRepairSpanEdits(proposal,view,contract);
  for(const [before,after]of [['saving energy','saving money'],['deployment','implementation']]){
    const changed=structuredClone(proposal);changed.sentences[2].text=changed.sentences[2].text.replace(before,after);
    assert.throws(()=>validateRepairSpanEdits(changed,view,contract),/SURROUNDING_TEXT/);
  }
  // A boundary pass does not decide equivalence: original-to-final review is still required.
});
test('abstention is permitted only through existing decision validation, not approval',()=>{
  const f=fixture(),proposal={baselineSha256:f.view.data.baselineSha256,decision:'abstain',sentences:f.view.data.units.map(u=>({unitId:u.unitId,text:u.text}))};
  assert.equal(applySentenceRewrite(f.units,proposal,f.view).decision,'abstain');
  validateRepairSpanEdits(proposal,f.view,f.contract);
  assert.match(SPAN_REPAIR_PROMPT,/independent full-text review remain mandatory/);
  assert.doesNotMatch(SPAN_REPAIR_PROMPT,/HardFlow|MIT|optimization formulation|mathematical statement/);
});
