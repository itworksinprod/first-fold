import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareSplitIncompatibilityWitnessCalibration as prepare,scoreSplitIncompatibilityWitnessCalibration as score,
} from '../scripts/automation/experiments/split-incompatibility-witness-calibration.mjs';
const clone=x=>structuredClone(x),evidence=(...ids)=>ids.map(sentenceId=>({sentenceId}));
const none=()=>({kind:'none',sourceSentenceIds:[],assertedSourcePremise:'',incompatibility:''});
const witness=(kind,id,assertedSourcePremise,incompatibility)=>({kind,sourceSentenceIds:[id],assertedSourcePremise,incompatibility});
// Entirely injected reference controls, NOT new provider responses or semantic qualification.
const rows=[
  {basis:'supported',ids:['S1P1S1'],checks:[['support','preserved',['S1P1S1']]]},
  {basis:'insufficient_evidence',ids:[],checks:[['context','none',[]]]},
  {basis:'supported',ids:['S1P1S1','S1P2S1'],checks:[['support','none',['S1P1S1']],['context','preserved',['S1P2S1']]]},
  {basis:'contradiction',ids:['S1P2S1'],checks:[['support','none',['S1P1S1']],['contradiction','missing',['S1P2S1']]],
    witness:witness('policy_exclusion','S1P2S1','Members under sixteen are expressly exempt from the reservation rule.',
      'The candidate applies that rule to all members, including the expressly exempt group.')},
  {basis:'supported',ids:['S1P1S1'],checks:[['support','preserved',['S1P1S1']],['context','none',['S1P2S1']]]},
  {basis:'contradiction',ids:['S1P2S1'],checks:[['context','none',['S1P1S1']],['contradiction','missing',['S1P2S1']]],
    witness:witness('opposite_relation','S1P2S1','An engaged latch alone is expressly insufficient because a power check must also pass.',
      'The candidate says the engaged latch guarantees operation, contrary to the explicit insufficiency.')},
  {basis:'supported',ids:['S1P1S1'],checks:[['support','preserved',['S1P1S1']],['context','preserved',['S1P2S1']]]},
  {basis:'contradiction',ids:['S1P2S1'],checks:[['context','none',['S1P1S1']],['contradiction','missing',['S1P2S1']]],
    witness:witness('policy_exclusion','S1P2S1','The West district is expressly excluded from the permit rule.',
      'The candidate applies the rule throughout Harbor, including that explicitly excluded district.')},
];
function controls(plan){
  return plan.cases.map(({caseId,pair},i)=>{
    const row=rows[i];return {caseId,
      claim:{reviewSha256:pair.claim.data.reviewSha256,judgments:[{spanId:'T1',
        verdict:row.basis==='supported'?'supported':'unsupported',basis:row.basis,
        explanation:'Injected control for structural regression, not a model decision.',evidence:evidence(...row.ids),
        incompatibilityWitness:row.witness?clone(row.witness):none(),
      }]},
      checks:{reviewSha256:pair.checks.data.reviewSha256,judgments:[{spanId:'T1',
        passageChecks:row.checks.map(([contribution,qualification,ids],n)=>({
          evidenceId:pair.checks.data.passages[n].evidenceId,contribution,qualification,
          explanation:'Injected contribution and source qualification for regression only.',evidence:evidence(...ids),
          incompatibilityWitness:contribution==='contradiction'?clone(row.witness):none(),
        })),
      }]},
    };
  });
}
function held(report){
  for(const key of ['witnessSemanticsChecked','explanationsChecked','fullControlsetPassed','provenanceVerified',
    'modelQualified','articleApproved','publicationReady'])assert.equal(report[key],false);
  assert.equal(report.independentReview,'required');
}

test('even injected perfect eight-case decisions cannot approve witness meaning, articles or the full corpus',()=>{
  const plan=prepare(),records=controls(plan),before=clone(records),out=score(records,plan);
  assert.deepEqual(records,before);assert.equal(out.report.casesValid,8);assert.equal(out.report.casesMatching,8);
  assert.equal(out.report.reasoningFieldsMatching,8);assert.equal(out.report.structuralComplete,true);
  assert.equal(out.report.labelAgreementComplete,true);assert.equal(out.report.reasoningAgreementComplete,true);held(out.report);
  for(const result of out.results){held({...result.composite,explanationsChecked:false,fullControlsetPassed:false,provenanceVerified:false});
    assert.deepEqual(result.rawClaim,records.find(r=>r.caseId===result.caseId).claim);
    assert.deepEqual(result.rawChecks,records.find(r=>r.caseId===result.caseId).checks);
  }
});

test('synthetic explicit exclusions and opposite relations preserve the legitimate contradiction paths',()=>{
  const plan=prepare(),records=controls(plan),out=score(records,plan);
  for(const [caseId,kind]of [['CS06','policy_exclusion'],['CS08','opposite_relation'],['CS10','policy_exclusion']]){
    const result=out.results.find(r=>r.caseId===caseId);assert.equal(result.composite.valid,true);
    assert.equal(result.reasoning.fieldsMatch,true);assert.equal(result.labelMatch,true);
    assert.equal(result.rawClaim.judgments[0].incompatibilityWitness.kind,kind);
    assert.equal(result.rawChecks.judgments[0].passageChecks[1].incompatibilityWitness.kind,kind);
    assert.equal(result.composite.witnessSemanticsChecked,false);
  }
  const necessary=out.results.find(r=>r.caseId==='CS07');
  assert.equal(necessary.composite.supported,true);
  assert.equal(necessary.rawChecks.judgments[0].passageChecks[1].contribution,'context');
  assert.equal(necessary.rawChecks.judgments[0].passageChecks[1].qualification,'none');
});

test('fabricated existence remains an uncorrected reasoning mismatch despite anchored witnesses and correct verdicts',()=>{
  const plan=prepare(),records=controls(plan),bad=records[1],fabricated=witness('contrary_instance','S1P1S1',
    'A nonvisitor Lumen badge exists and expires at the stated time.',
    'The candidate excludes that alleged nonvisitor badge.');
  Object.assign(bad.claim.judgments[0],{basis:'contradiction',evidence:evidence('S1P1S1'),incompatibilityWitness:clone(fabricated)});
  Object.assign(bad.checks.judgments[0].passageChecks[0],{contribution:'contradiction',qualification:'missing',
    evidence:evidence('S1P1S1'),incompatibilityWitness:clone(fabricated)});
  const before=clone(records),out=score(records,plan);assert.deepEqual(records,before);
  assert.equal(out.report.structuralComplete,true);assert.equal(out.report.labelAgreementComplete,true);
  assert.equal(out.report.reasoningAgreementComplete,false);assert.equal(out.report.reasoningFieldsMatching,7);held(out.report);
  assert.deepEqual(out.report.reasoningFieldMismatches,[{caseId:'CS04',issues:[
    {field:'basis',expected:'insufficient_evidence',observed:'contradiction'},
  ]}]);
  assert.deepEqual(out.results[1].rawClaim,bad.claim);assert.deepEqual(out.results[1].rawChecks,bad.checks);
});

test('calibration preserves missing or malformed responses and refuses order, plan and hostile substitutions',()=>{
  const plan=prepare(),records=controls(plan);records[1].claim.judgments[0].incompatibilityWitness.kind='opposite_relation';
  const before=clone(records),out=score(records,plan);assert.deepEqual(records,before);held(out.report);
  assert.equal(out.report.structuralComplete,false);assert.equal(out.report.casesValid,7);
  assert.deepEqual(out.report.invalidCases,[{caseId:'CS04',code:'SPLIT_WITNESS_PREMISE'}]);
  assert.deepEqual(out.results[1].rawClaim,records[1].claim);
  const partial=score(records.slice(0,1),plan);assert.equal(partial.report.structuralComplete,false);
  assert.deepEqual(partial.report.casesMissing,['CS04','CS05','CS06','CS07','CS08','CS09','CS10']);held(partial.report);
  for(const invalid of [records.toReversed(),[...records,records[0]],null,{}])assert.throws(()=>score(invalid,plan));
  assert.throws(()=>score(records,clone(plan)));
  let reads=0;const hostile=clone(records);Object.defineProperty(hostile[0],'claim',{enumerable:true,get(){reads++;return records[0].claim;}});
  assert.throws(()=>score(hostile,plan));assert.equal(reads,0);
});
