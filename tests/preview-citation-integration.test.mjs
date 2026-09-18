import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {citationCorrectionFixture} from './fixtures/citation-correction.mjs';
import {previewFreshGemini, citationCorrectedPreview, validatePreviewCitationCorrectionMode,
  previewMechanicalRepairAllowed, previewSourceQualificationRepairAllowed} from '../scripts/automation/preview-fresh-gemini.mjs';
import {applyPreviewCitationAdditions,proposePreviewCitationCorrection} from '../scripts/automation/free/preview-citation-correction.mjs';
import {buildPreviewReviewPacket} from '../scripts/automation/free/preview-editorial-review.mjs';
import {GEMINI_LITE_MODEL} from '../scripts/automation/free/gemini-ai.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072});
const key=publicKey.export({type:'spki',format:'der'}).toString('base64');
const fixtureCandidate=()=>{
  const {dossier}=citationCorrectionFixture(),source=dossier.sources[0];
  const url='https://example.com/synthetic-workspace',title='Acme changes workspace request limits';
  return {candidateId:dossier.candidateId,suggestedDesk:'work-and-tools',primaryEntity:'Acme',canonicalEventKey:'acme-workspace',
    title,firstPublishedAt:source.publishedAt,ranking:{score:76,evidenceTier:'authoritative-single'},
    sources:[{id:source.sourceId,publisher:source.publisher,title,relationship:'originating',publishedAt:source.publishedAt,url}],
    feedEvidence:[{sourceId:source.sourceId,publisher:source.publisher,title,publishedAt:source.publishedAt,
      articleExcerpt:source.text,articleBlocks:source.passages.map(p=>p.text),articleExtraction:{version:'structured-complete-preview-v1',status:'usable',holds:[],
        identity:{requestedUrl:url,finalUrl:url,title,redirects:[],bodySha256:'a'.repeat(64),retrievedAt:'2028-10-02T09:00:00.000Z'}}}]};
};
const provider=async options=>{
  const payload={additions:citationCorrectionFixture().additions};
  assert.equal(options.validatePayload(payload),true);
  return {editorialPayload:payload,model:GEMINI_LITE_MODEL,requestSha256:'a'.repeat(64),responseSha256:'b'.repeat(64)};
};

test('citation mode is explicit, off by default, and never enables the prose repair gates',()=>{
  assert.equal(validatePreviewCitationCorrectionMode(),'off');
  for(const v of [true,'on','rewrite',null])assert.throws(()=>validatePreviewCitationCorrectionMode(v));
  const {result,dossier}=citationCorrectionFixture();
  assert.equal(previewMechanicalRepairAllowed(result),false);assert.equal(previewSourceQualificationRepairAllowed(result,dossier),false);
  const workflow=readFileSync(new URL('../.github/workflows/gemini-fresh-human-preview.yml',import.meta.url),'utf8');
  assert.match(workflow,/citation_correction:[\s\S]*?default: 'off'/);
  assert.doesNotMatch(workflow,/RESEND|OPENAI|schedule:|contents: write/);
});

test('the renderer rebuilds from original additions and refuses replacement prose',async()=>{
  const fixture=citationCorrectionFixture();
  const proposal=await proposePreviewCitationCorrection({...fixture,apiKey:'synthetic-test-key-not-real',
    freeProjectConfirmation:'FREE PROJECT BILLING DISABLED',requestImpl:provider});
  const rendered=citationCorrectedPreview(fixture.result,fixture.dossier,proposal);
  assert.equal(rendered.report.approved,false);assert.deepEqual(rendered.draft,fixture.result.rejectedDiagnostic.payload.stories[0]);
  const bad=structuredClone(proposal);bad.correctedPayload.stories[0].headline='An altered headline';
  assert.throws(()=>citationCorrectedPreview(fixture.result,fixture.dossier,bad),/PROPOSAL_CHANGED/);
  const failed=citationCorrectedPreview(fixture.result,fixture.dossier,{report:{status:'failed',approved:true,qualified:true,
    productionEnabled:true,emailRequests:9,modelRequests:99,code:'private-provider-text',private:'private-provider-text',
    requestSha256:'private-provider-text'}});
  assert.equal(failed.report.approved,false);assert.equal(failed.report.qualified,false);assert.equal(failed.report.productionEnabled,false);
  assert.equal(failed.report.emailRequests,0);assert.equal(failed.html,null);assert.doesNotMatch(JSON.stringify(failed),/private-provider-text/);
});

test('one opt-in citation correction shares the spare slot and preserves immutable raw rejection and bindings',async()=>{
  for(const mode of ['off','additions-only','mutating-callback','unsafe-report']){
    let writers=0,corrections=0;
    const candidates=['work-and-tools','ai','platforms-and-power'].map((desk,i)=>({...fixtureCandidate(),
      candidateId:`candidate-synthetic-${i}`,suggestedDesk:desk,primaryEntity:`Acme${i}`,canonicalEventKey:`acme-${i}`}));
    const originals=[];
    const result=await previewFreshGemini({publicKey:key,apiKey:'synthetic-test-key-not-real',
      freeProjectConfirmation:'FREE PROJECT BILLING DISABLED',now:new Date('2028-10-02T10:00:00.000Z'),
      ...(mode==='off'?{}:{citationCorrection:'additions-only'}),coverageImpl:()=>{},
      researchImpl:async()=>({candidates,diagnostics:{sourceResults:[]}}),
      draftImpl:async({dossier,repair})=>{assert.equal(repair,undefined);writers++;
        const raw=citationCorrectionFixture().result;raw.rejectedDiagnostic.payload.stories[0].candidateId=dossier.candidateId;
        originals.push(structuredClone(raw));return raw;},
      citationCorrectionImpl:async options=>{corrections++;
        if(mode==='unsafe-report')return {report:{status:'failed',approved:true,qualified:true,productionEnabled:true,emailRequests:99,
          code:'private-provider-text',arbitrary:'x'.repeat(500000)},additions:[{field:'private-provider-text',evidenceIds:['private-provider-text']}],
          rejectedProposal:{additions:[{field:'deck',evidenceIds:['private-provider-text']}]}};
        if(mode==='mutating-callback'){
          options.result.rejectedDiagnostic.payload.stories[0].headline='Changed baseline headline';
          options.dossier.sources[0].publisher='Changed publisher';
          return {report:{status:'human-review-required'},additions:citationCorrectionFixture().additions,
            correctedPayload:options.result.rejectedDiagnostic.payload,originalBinding:{forged:true}};
        }
        return proposePreviewCitationCorrection({...options,requestImpl:provider});
      }});
    assert.equal(corrections,mode==='off'?0:1);
    assert.equal(result.report.modelRequests,writers+corrections);assert.ok(result.report.modelRequests<=4);
    assert.equal(result.report.emailRequests,0);assert.equal(result.report.repairRequests,corrections);
    assert.equal(result.report.draftCount,mode==='additions-only'?1:0);
    const packet=openDiagnostic(result.sealed,privateKey);
    assert.doesNotMatch(JSON.stringify(packet),/private-provider-text|x{5000}/);
    if(mode!=='off'){
      const record=packet.records.find(r=>r.initialRejection);
      assert.equal(record.repairKind,'citation-additions-only');
      const {html,...expected}=originals[0];
      assert.deepEqual(record.initialRejection,{...expected,hasDraftPreview:false});
      const old=record.initialRejection.rejectedDiagnostic.payload;
      const oldPacket=buildPreviewReviewPacket(old.stories[0],record.dossier,old.evidenceForFields);
      assert.deepEqual(record.citationCorrection.originalBinding,oldPacket.binding);
      assert.notEqual(record.dossier.sources[0].publisher,'Changed publisher');
      if(mode==='additions-only'){
        const fixed=applyPreviewCitationAdditions({...record.initialRejection,html:null},record.dossier,citationCorrectionFixture().additions);
        const newPacket=buildPreviewReviewPacket(fixed.stories[0],record.dossier,fixed.evidenceForFields);
        assert.deepEqual(record.citationCorrection.correctedBinding,newPacket.binding);
        assert.equal(newPacket.binding.draftSha256,oldPacket.binding.draftSha256);
        assert.equal(newPacket.binding.renderedStorySha256,oldPacket.binding.renderedStorySha256);
        assert.notEqual(newPacket.binding.evidenceMapSha256,oldPacket.binding.evidenceMapSha256);
      }else assert.equal(record.result.report.code,mode==='unsafe-report'?'CITATION_CORRECTION_FAILED':'PREVIEW_CITATION_CORRECTION_HELD');
    }
  }
});
