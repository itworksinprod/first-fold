import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewGeminiLite} from '../scripts/automation/preview-gemini-lite.mjs';
import {FRESH_PREVIEW_WRITER_PROFILE,FRESH_PREVIEW_WRITER_PROMPT} from '../scripts/automation/free/fresh-preview-writer-prompt.mjs';
import {WRITER_PROMPT,GROUNDED_DRAFT_SCHEMA} from '../scripts/automation/free/grounded-draft.mjs';
import {GEMINI_LITE_MODEL} from '../scripts/automation/free/gemini-ai.mjs';
import {buildPreviewReviewPacket} from '../scripts/automation/free/preview-editorial-review.mjs';
import {previewMechanicalRepairAllowed,previewSourceQualificationRepairAllowed} from '../scripts/automation/preview-fresh-gemini.mjs';
const raw=JSON.parse(readFileSync(new URL('./fixtures/rejected-preview-run20.json',import.meta.url))).records[0];
const settings={apiKey:'synthetic-profile-key-not-real',freeProjectConfirmation:'FREE PROJECT BILLING DISABLED',dossier:raw.dossier};
test('new coherent profile is explicit; default fresh/stored and offline request prompts remain legacy',async()=>{
  for(const mode of ['offline','legacy-fresh','new-fresh']){
    let calls=0;
    const result=await previewGeminiLite({...settings,fresh:mode!=='offline',
      ...(mode==='new-fresh'?{writerProfile:FRESH_PREVIEW_WRITER_PROFILE}:{}),fetchImpl:async(url,options)=>{
        calls++;const b=JSON.parse(options.body),prompt=b.systemInstruction.parts[0].text;
        if(mode==='new-fresh'){
          assert.equal(prompt,FRESH_PREVIEW_WRITER_PROMPT);assert.ok(!prompt.startsWith(WRITER_PROMPT));
          assert.doesNotMatch(prompt,/explain the mechanism|connect THIS change to a concrete consequence/);
          assert.match(prompt,/A plausible explanation is not evidence/);assert.match(prompt,/exact supplied publisher name/);
          for(const field of ['headline','deck','whyItMatters','whatToDoOrWatch'])assert.deepEqual(b.generationConfig.responseJsonSchema.properties.stories.items.properties[field],GROUNDED_DRAFT_SCHEMA.properties.stories.items.properties[field]);
        }else assert.ok(prompt.startsWith(WRITER_PROMPT));
        return new Response('quota',{status:429});
      }});
    assert.equal(calls,1);assert.equal(result.html,null);assert.equal(result.report.emailRequests,0);
  }
  const stored=readFileSync(new URL('../scripts/automation/preview-stored-correction.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(stored,/writerProfile|FRESH_PREVIEW_WRITER/);
});
test('unknown profiles and offline use of the new profile stop before a request',async()=>{
  for(const options of [{fresh:true,writerProfile:'arbitrary'},{fresh:false,writerProfile:FRESH_PREVIEW_WRITER_PROFILE}]){
    const r=await previewGeminiLite({...settings,...options,fetchImpl:()=>assert.fail('not authorized')});
    assert.equal(r.html,null);assert.equal(r.report.emailRequests,0);
  }
});
test('untouched live run20 cannot pass the new validator, either repair gate, or final review reconstruction',async()=>{
  let calls=0;
  const result=await previewGeminiLite({...settings,fresh:true,writerProfile:FRESH_PREVIEW_WRITER_PROFILE,fetchImpl:async()=>{
    calls++;return new Response(JSON.stringify({modelVersion:GEMINI_LITE_MODEL,candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify({stories:[raw.draft],evidenceForFields:raw.evidenceForFields})}]}}]}),{headers:{'content-type':'application/json'}});
  }});
  assert.equal(calls,1);assert.equal(result.html,null);assert.equal(result.report.status,'failed');
  assert.deepEqual(result.rejectedDiagnostic.payload.stories[0],raw.draft);
  assert.equal(previewMechanicalRepairAllowed(result),false);assert.equal(previewSourceQualificationRepairAllowed(result,raw.dossier),false);
  const packet=buildPreviewReviewPacket(raw.draft,raw.dossier,raw.evidenceForFields);
  assert.deepEqual(packet.binding,raw.binding);
  for(const code of ['CERTAINTY_REVIEW_REQUIRED','MAPPED_AUDIENCE_SUPPORT_REQUIRED','PHASED_ROLLOUT_SCOPE_REQUIRED','ABSENT_CREDENTIALS_SCOPE_REQUIRED']){
    assert.ok(result.report.structuralErrors.includes(code));assert.ok(packet.holds.includes(code));
  }
});
