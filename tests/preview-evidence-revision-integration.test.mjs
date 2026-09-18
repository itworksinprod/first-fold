import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {citationCorrectionFixture} from './fixtures/citation-correction.mjs';
import {previewFreshGemini,validatePreviewEvidenceRevisionMode} from '../scripts/automation/preview-fresh-gemini.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072});
const key=publicKey.export({type:'spki',format:'der'}).toString('base64');
function candidates(){
  const source=citationCorrectionFixture().dossier.sources[0];
  return ['work-and-tools','ai','platforms-and-power'].map((desk,i)=>{
    const url=`https://example.com/synthetic-${i}`,title=`Acme${i} changes workspace request limits`;
    return {candidateId:`candidate-synthetic-${i}`,suggestedDesk:desk,primaryEntity:`Acme${i}`,canonicalEventKey:`acme-${i}`,
      title,firstPublishedAt:source.publishedAt,ranking:{score:76,evidenceTier:'authoritative-single'},
      sources:[{id:source.sourceId,publisher:source.publisher,title,relationship:'originating',publishedAt:source.publishedAt,url}],
      feedEvidence:[{sourceId:source.sourceId,publisher:source.publisher,title,publishedAt:source.publishedAt,articleExcerpt:source.text,
        articleBlocks:source.passages.map(p=>p.text),articleExtraction:{version:'structured-complete-preview-v1',status:'usable',holds:[],
          identity:{requestedUrl:url,finalUrl:url,title,redirects:[],bodySha256:'a'.repeat(64),retrievedAt:'2028-10-02T09:00:00.000Z'}}}]};
  });
}
test('evidence revision is an explicit no-email choice, off by default',()=>{
  assert.equal(validatePreviewEvidenceRevisionMode(),'off');
  assert.equal(validatePreviewEvidenceRevisionMode('once'),'once');
  for(const value of ['on','unlimited',true,null])assert.throws(()=>validatePreviewEvidenceRevisionMode(value));
  const workflow=readFileSync(new URL('../.github/workflows/gemini-fresh-human-preview.yml',import.meta.url),'utf8');
  assert.match(workflow,/evidence_revision:[\s\S]*?default: 'off'/);
  assert.doesNotMatch(workflow,/RESEND|OPENAI|schedule:|contents: write/);
});
test('one evidence-led revision shares the existing cap and never approves its result',async()=>{
  for(const mode of ['off','once','quota']){
    let calls=0,repairs=0;
    const result=await previewFreshGemini({publicKey:key,apiKey:'synthetic-test-key-not-real',
      freeProjectConfirmation:'FREE PROJECT BILLING DISABLED',now:new Date('2028-10-02T10:00:00Z'),
      evidenceRevision:mode==='off'?'off':'once',coverageImpl:()=>{},
      researchImpl:async()=>({candidates:candidates(),diagnostics:{sourceResults:[]}}),
      draftImpl:async({dossier,repair})=>{
        calls++;
        const raw=citationCorrectionFixture().result;
        raw.rejectedDiagnostic.payload.stories[0].candidateId=dossier.candidateId;
        if(repair){repairs++;assert.deepEqual(repair,raw.rejectedDiagnostic);}
        if(mode==='quota')raw.report.code='GEMINI_FREE_QUOTA_EXHAUSTED';
        return raw;
      }});
    assert.equal(repairs,mode==='once'?1:0);
    assert.equal(result.report.modelRequests,calls);assert.ok(calls<=4);
    assert.equal(result.report.emailRequests,0);assert.equal(result.report.approved,false);
    assert.equal(result.report.draftCount,0);assert.equal(result.report.productionEnabled,false);
    const packet=openDiagnostic(result.sealed,privateKey);
    assert.equal(packet.records.filter(r=>r.repairKind==='evidence-led').length,repairs);
    if(repairs){const r=packet.records.find(r=>r.initialRejection);assert.deepEqual(r.initialRejection.rejectedDiagnostic,r.result.rejectedDiagnostic);}
  }
});
