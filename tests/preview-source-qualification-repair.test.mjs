import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewMechanicalRepairAllowed,previewSourceQualificationRepairAllowed as allowed} from '../scripts/automation/preview-fresh-gemini.mjs';
import {previewReaderObligations} from '../scripts/automation/free/preview-reader-alarms.mjs';
import {buildPreviewReviewPacket} from '../scripts/automation/free/preview-editorial-review.mjs';
import {previewGeminiLite} from '../scripts/automation/preview-gemini-lite.mjs';
const raw=JSON.parse(readFileSync(new URL('./fixtures/rejected-preview-run16.json',import.meta.url))).records;
test('exact untouched GitLab draft qualifies for one source correction, never acceptance or a mechanical label',()=>{
  const {result,dossier}=raw[0],copy=structuredClone(raw[0]);
  assert.equal(previewMechanicalRepairAllowed(result),false);assert.equal(allowed(result,dossier),true);
  const payload=result.rejectedDiagnostic.payload;
  assert.ok(buildPreviewReviewPacket(payload.stories[0],dossier,payload.evidenceForFields).holds.includes('PREVIEW_AUDIENCE_SCOPE_REQUIRED'));
  assert.deepEqual(raw[0],copy);
  assert.equal(allowed(raw[1].result,raw[1].dossier),false,'broader advisory defects stay held');
});
test('reader obligations are verbatim complete bound passages, not editor summaries',()=>{
  const obligations=previewReaderObligations(raw[0].dossier);assert.equal(obligations.length,1);
  const source=raw[0].dossier.sources[0],passage=source.passages.find(p=>p.evidenceId==='S1P10');
  assert.equal(obligations[0].text,passage.text);assert.equal(obligations[0].sourceId,source.sourceId);
  assert.match(obligations[0].text,/Free and unauthenticated traffic/);assert.match(obligations[0].text,/Signed-in Premium and Ultimate requests are not affected/);
  assert.deepEqual(previewReaderObligations(raw[1].dossier),[]);
});
test('obligations never invent a paid-account exemption when missing or contradicted',()=>{
  for(const ending of ['', ' Signed-in Premium and Ultimate requests are also affected.']){
    const text='There will be preview windows for Free and unauthenticated traffic.'+ending;
    const [obligation]=previewReaderObligations({sources:[{sourceId:'source-test',passages:[{evidenceId:'S1P1',text}]}]});
    assert.equal(obligation.text,text);assert.match(obligation.instruction,/Never infer an exemption/);
    assert.doesNotMatch(obligation.instruction,/Premium|Ultimate|signed-in|paid.account/i);
    assert.match(obligation.instruction,/explicitly stated exemptions/);
  }
});
test('correction refuses unknown or mixed semantic failures, wrong field, provider failure and missing source binding',()=>{
  for(const mutate of [
    r=>r.result.report.code='GEMINI_FREE_QUOTA_EXHAUSTED',
    r=>r.result.report.structuralErrors.push('CERTAINTY_REVIEW_REQUIRED'),
    r=>r.result.report.structuralErrors.push('ADVISORY_SUBSET_SCOPE_REQUIRED'),
    r=>r.result.rejectedDiagnostic.rejectionDetails.push({reason:'NUMERIC_ANCHOR',feedback:{field:'deck'}}),
    r=>r.result.rejectedDiagnostic.rejectionDetails[0].feedback.field='claims.0',
    r=>r.result.rejectedDiagnostic.rejectionDetails[0].feedback.field='deck',
    r=>r.result.rejectedDiagnostic.payload.evidenceForFields.whatToDoOrWatch=['S1P14'],
    r=>r.result.rejectedDiagnostic.payload.stories[0].whyItMatters+=' It guarantees reliability.',
    r=>r.result.rejectedDiagnostic.payload.stories[0].candidateId='wrong',
    r=>r.result.rejectedDiagnostic.unapproved=false,
    r=>r.dossier.sources[0].passages.find(p=>p.evidenceId==='S1P10').text='No source support for a preview audience.',
  ]){const value=structuredClone(raw[0]);mutate(value);assert.equal(allowed(value.result,value.dossier),false);}
  assert.equal(allowed(raw[0].result,null),false);
});
test('first drafts and corrections receive intact obligations, remain single-attempt and do not leak private prose',async()=>{
  const {result:rejected,dossier}=raw[0];
  for(const repairing of [false,true]){
    let calls=0;
    const result=await previewGeminiLite({apiKey:'synthetic-test-key-not-real',freeProjectConfirmation:'FREE PROJECT BILLING DISABLED',
      fresh:true,dossier,...(repairing?{repair:rejected.rejectedDiagnostic}:{}),
      fetchImpl:async(url,options)=>{
        calls++;const body=JSON.parse(options.body),data=JSON.parse(body.contents[0].parts[0].text);
        assert.deepEqual(data.readerWritingObligations,previewReaderObligations(dossier));
        if(repairing){assert.deepEqual(data.rejectedDraft,rejected.rejectedDiagnostic.payload);assert.match(data.sourceQualificationCorrection,/ALL own-field citations/);}
        else assert.equal(data.sourceQualificationCorrection,undefined);
        return new Response('private provider failure',{status:429});
      }});
    assert.equal(calls,1);assert.equal(result.html,null);assert.equal(result.report.emailRequests,0);
    assert.doesNotMatch(JSON.stringify(result.report),/GitLab|private provider failure|synthetic-test-key/);
  }
});
