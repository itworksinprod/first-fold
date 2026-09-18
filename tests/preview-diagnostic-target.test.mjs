import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync} from 'node:crypto';
import {previewFreshGemini,selectDiagnosticTarget,validatePreviewDiagnosticTarget} from '../scripts/automation/preview-fresh-gemini.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
const raw=JSON.parse(readFileSync(new URL('./fixtures/rejected-preview-run16.json',import.meta.url))).records[0];
const url='https://about.gitlab.com/blog/rate-limit-change-2026/';
const s=raw.dossier.sources[0];
const candidate=()=>({candidateId:raw.dossier.candidateId,primaryEntity:'GitLab',canonicalEventKey:'gitlab-limits-2026',suggestedDesk:'work-and-tools',
  title:s.articleIdentity.title,firstPublishedAt:s.publishedAt,
  ranking:{score:79,evidenceTier:'authoritative-single',components:{materialityNewsworthiness:21,deskRelevance:19,sourceStrength:16,readerUsefulnessActionability:10,freshness:13},editorialValidation:{requiredScore:70,decision:'accepted',rejectionReasons:[]}},
  sources:[{id:s.sourceId,publisher:s.publisher,title:s.articleIdentity.title,url,relationship:'originating',publishedAt:s.publishedAt},
    {id:s.sourceId+'-feed',publisher:s.publisher,title:'GitLab feed index',url:'https://about.gitlab.com/atom.xml',relationship:'context',publishedAt:null}],
  feedEvidence:[{sourceId:s.sourceId,publisher:s.publisher,title:s.articleIdentity.title,publishedAt:s.publishedAt,
    articleExcerpt:s.passages.map(p=>p.text).join('\n'),articleBlocks:s.passages.map(p=>p.text),
    articleExtraction:{version:'structured-complete-preview-v1',status:'usable',holds:[],identity:s.articleIdentity}}]});
test('diagnostic target requires exact known identity; absent, arbitrary, redirected or ambiguous selection is held',()=>{
  const c=candidate();assert.strictEqual(selectDiagnosticTarget([c],'gitlab-rate-limits-2026')[0],c);
  assert.throws(()=>validatePreviewDiagnosticTarget('https://untrusted.example'));
  for(const values of [[],[c,c],[{...c,candidateId:'other'}],[{...c,sources:[{...c.sources[0],url:url+'?changed'}]}],
    [{...c,sources:[{...c.sources[0],publisher:'Other'}]}],[{...c,sources:[{...c.sources[0],relationship:'independent'}]}],
    [{...c,sources:[...c.sources,{...c.sources[0],url:'https://example.com/second',relationship:'independent'}]}]]){
    assert.throws(()=>selectDiagnosticTarget(values,'gitlab-rate-limits-2026'));
  }
  assert.equal(selectDiagnosticTarget([{...c,sources:[...c.sources].reverse()}],'gitlab-rate-limits-2026').length,1);
  assert.equal(selectDiagnosticTarget([{...c,sources:[c.sources[0]]}],'gitlab-rate-limits-2026').length,1);
});
test('targeted fresh trial retains normal editor and source gates; one writer and shared correction stay under three calls',async()=>{
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072});
  const key=publicKey.export({type:'spki',format:'der'}).toString('base64');
  for(const reject of [false,true]){
    let editors=0,writers=0,repairs=0;
    const result=await previewFreshGemini({publicKey:key,apiKey:'synthetic-test-key-not-real',freeProjectConfirmation:'FREE PROJECT BILLING DISABLED',
      diagnosticTarget:'gitlab-rate-limits-2026',now:new Date('2026-09-18T00:00:00Z'),coverageImpl:()=>{},
      researchImpl:async options=>{const c=candidate(),assessed=await options.reviewNewsworthiness([{candidate:c,decision:'accepted',rejectionReasons:[]}]);
        return{candidates:assessed.filter(e=>e.decision==='accepted').map(e=>e.candidate),diagnostics:{sourceResults:[]}};},
      editorialRequestImpl:async()=>{editors++;return{editorialPayload:{assessments:[{candidateId:raw.dossier.candidateId,importance:reject?0:21,usefulness:10,
        rationale:'The source announces changes to subscription-tier rate limits.',sourceId:s.sourceId,evidenceId:'S1P4',quote:s.passages[3].text.slice(-220)}]}};},
      draftImpl:async({repair})=>{writers++;if(repair)repairs++;return{report:{status:'failed',code:'GEMINI_EDITORIAL_VALIDATION_FAILED'},html:null,
        rejectedDiagnostic:{unapproved:true,rejectionDetails:[{reason:'ORIGINALITY',feedback:{field:'claims[0].text'}}]}};}});
    assert.equal(editors,1);assert.equal(writers,reject?0:2);assert.equal(repairs,reject?0:1);
    assert.equal(result.report.maxModelRequests,3);assert.equal(result.report.modelRequests,editors+writers);assert.equal(result.report.emailRequests,0);
    const packet=openDiagnostic(result.sealed,privateKey);assert.equal(packet.diagnosticSampling.mode,'gitlab-rate-limits-2026');
    if(reject)assert.equal(result.report.code,'PREVIEW_DIAGNOSTIC_TARGET_NOT_ELIGIBLE');
    else{assert.equal(packet.diagnosticSampling.baselineRanking.length,1);assert.ok(packet.records[0].initialRejection);}
  }
});
