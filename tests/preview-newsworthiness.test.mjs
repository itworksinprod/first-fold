import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createPreviewNewsworthiness} from '../scripts/automation/free/preview-newsworthiness.mjs';
import {previewFreshGemini} from '../scripts/automation/preview-fresh-gemini.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
const window={startInclusive:'2026-09-14T00:00:00Z',endExclusive:'2026-09-17T00:00:00Z'};
const quote='Hosted users must authenticate requests before the new limits take effect.';
const title='Example platform changes account limits';
function entry(id='a',desk='work-and-tools',codes=['BELOW_EDITORIAL_THRESHOLD','AUTHORITATIVE_SINGLE_COMPONENT_FLOOR']) {
  const url=`https://example.com/2026/09/${id}`,sourceId=`source-${id}`;
  const reasons=codes.map(code=>({code}));
  return {decision:'rejected',rejectionReasons:reasons,candidate:{candidateId:id,primaryEntity:id,canonicalEventKey:id,suggestedDesk:desk,title,
    firstPublishedAt:'2026-09-16T00:00:00Z',sources:[{id:sourceId,publisher:'Example',title,url,relationship:'originating',publishedAt:'2026-09-16T00:00:00Z'}],
    feedEvidence:[{sourceId,publisher:'Example',title,publishedAt:'2026-09-16T00:00:00Z',summary:'Clipped feed fragment',articleExcerpt:[title,quote].join('\n'),articleBlocks:[title,quote],
      articleExtraction:{version:'structured-complete-preview-v1',status:'usable',holds:[],identity:{title,requestedUrl:url,finalUrl:url,bodySha256:'a'.repeat(64),retrievedAt:'2026-09-16T12:00:00Z'}}}],
    ranking:{score:61,evidenceTier:'authoritative-single',components:{materialityNewsworthiness:10,deskRelevance:16,sourceStrength:16,readerUsefulnessActionability:6,freshness:13},editorialValidation:{requiredScore:70,decision:'rejected',rejectionReasons:reasons}}}};
}
const verdict = id => ({candidateId:id,importance:22,usefulness:10,rationale:'The access change gives hosted users a concrete integration decision.',sourceId:`source-${id}`,evidenceId:'S1P2',quote});
test('one source-bound editorial pass changes only two components with unchanged floors and no raw input mutation',async()=>{
  let calls=0,audit;
  const review=createPreviewNewsworthiness({reportingWindow:window,onResult:r=>{audit=r},requestImpl:async options=>{
    calls++;assert.equal(options.maxAttempts,1);assert.equal(options.model,'gemini-3.5-flash-lite');assert.ok(options.maxTokens<=8000);
    assert.doesNotMatch(options.messages[1].content,/Clipped feed fragment/);
    return {editorialPayload:{assessments:[verdict('a')]}};
  }});
  const original=entry(),copy=structuredClone(original);const [after]=await review([original]);
  assert.equal(after.decision,'accepted');assert.equal(after.candidate.ranking.score,77);
  assert.equal(after.candidate.ranking.components.sourceStrength,16);assert.equal(after.candidate.ranking.components.freshness,13);
  assert.equal(after.candidate.ranking.editorialValidation.requiredScore,70);assert.deepEqual(original,copy);
  assert.equal(audit.audit[0].scoreBefore,61);assert.equal(audit.audit[0].scoreAfter,77);assert.match(audit.audit[0].dossierSha256,/^[a-f0-9]{64}$/);
  assert.equal(audit.submitted[0].initialScorecard.score,61);assert.equal(audit.submitted[0].dossier.sources[0].passages[1].text,quote);
  assert.deepEqual(audit.rawParsedResponse,{assessments:[verdict('a')]});
  await review([original]);assert.equal(calls,1);
});
test('hard vetoes, wrong threshold, stale source and failed extraction never reach the editorial model',async()=>{
  for(const code of ['PROMOTIONAL_OR_DEAL_CONTENT','RECENT_DUPLICATE','SPECULATIVE_OR_RUMOR','INSUFFICIENT_SOURCE_EVIDENCE','INSUFFICIENT_TOPICALITY','ROUTINE_OR_MINOR_ANNOUNCEMENT']){
    const value=entry('a','work-and-tools',[code]);
    const review=createPreviewNewsworthiness({reportingWindow:window,requestImpl:()=>assert.fail(code)});
    assert.deepEqual(await review([value]),[value]);
  }
  for(const mutate of [e=>e.candidate.ranking.editorialValidation.requiredScore=71,
    e=>e.candidate.feedEvidence[0].articleExtraction.status='held',
    e=>{e.candidate.sources[0].publishedAt='2020-01-01';e.candidate.feedEvidence[0].publishedAt='2020-01-01'}]){
    const e=entry();mutate(e);const review=createPreviewNewsworthiness({reportingWindow:window,requestImpl:()=>assert.fail('ineligible')});
    assert.deepEqual(await review([e]),[e]);
  }
});
test('unbound or invalid scores stop model sequence; valid low scores still fail existing floors',async()=>{
  for(const bad of [{...verdict('a'),importance:31},{...verdict('a'),evidenceId:'S1P1'}, {...verdict('a'),sourceId:'invented'}, {...verdict('a'),quote:'Unsupported invented claims about affected users.'}]){
    let receipt;const e=entry();const review=createPreviewNewsworthiness({reportingWindow:window,onResult:r=>{receipt=r},requestImpl:async()=>({editorialPayload:{assessments:[bad]}})});
    const [after]=await review([e]);assert.equal(after.decision,'rejected');assert.equal(after.candidate.ranking.score,61);assert.equal(receipt.stopModels,true);
    assert.deepEqual(receipt.rawParsedResponse,{assessments:[bad]});assert.equal(receipt.submitted[0].initialScorecard.score,61);
  }
  let receipt;const review=createPreviewNewsworthiness({reportingWindow:window,onResult:r=>{receipt=r},requestImpl:async()=>({editorialPayload:{assessments:[{...verdict('a'),importance:19,usefulness:15}]}})});
  const [e,omitted]=await review([entry(),entry('b')]);assert.equal(e.decision,'rejected');assert.ok(e.rejectionReasons.some(r=>r.code==='AUTHORITATIVE_SINGLE_COMPONENT_FLOOR'));
  assert.equal(omitted.decision,'rejected');assert.ok(omitted.rejectionReasons.some(r=>r.code==='EDITORIAL_ASSESSMENT_OMITTED'));
  assert.equal(receipt.submitted.length,2);assert.deepEqual(receipt.omittedCandidateIds,['b']);assert.equal(receipt.audit[0].verdict.importance,19);
});
test('bad quote, passage or source holds only that candidate; original acceptance cannot leak through',async()=>{
  for(const [change,reason] of [
    [{quote:quote.replace('before','/before')},'EDITORIAL_QUOTE_NOT_BOUND'],
    [{evidenceId:'S1P1'},'EDITORIAL_QUOTE_NOT_BOUND'],
    [{evidenceId:'S1P99'},'EDITORIAL_PASSAGE_NOT_FOUND'],
    [{sourceId:'source-a'},'EDITORIAL_SOURCE_NOT_FOUND'],
  ]){
    let receipt,calls=0;const prior=entry('b');prior.decision='accepted';prior.rejectionReasons=[];
    prior.candidate.ranking.components.materialityNewsworthiness=26;prior.candidate.ranking.score=77;
    prior.candidate.ranking.editorialValidation.decision='accepted';prior.candidate.ranking.editorialValidation.rejectionReasons=[];
    const original=structuredClone(prior),payload={assessments:[verdict('a'),{...verdict('b'),...change}]};
    const review=createPreviewNewsworthiness({reportingWindow:window,onResult:r=>{receipt=r},requestImpl:async options=>{
      calls++;assert.equal(options.validatePayload(payload),true);return{editorialPayload:payload};
    }});
    const [good,bad]=await review([entry(),prior]);
    assert.equal(good.decision,'accepted');assert.equal(good.candidate.ranking.score,77);
    assert.equal(bad.decision,'rejected');assert.equal(bad.candidate.ranking.editorialValidation.decision,'rejected');
    assert.ok(bad.rejectionReasons.some(r=>r.code===reason));assert.equal(bad.candidate.ranking.score,77);
    assert.deepEqual(prior,original);assert.deepEqual(receipt.rawParsedResponse,payload);assert.equal(receipt.stopModels,false);assert.equal(calls,1);
    assert.equal(receipt.audit.find(a=>a.candidateId==='b').reason,reason);
    assert.equal(receipt.audit.find(a=>a.candidateId==='a').disposition,'source-bound-score-proposal');
  }
});
test('omitted submitted candidate is rejected while unsubmitted candidates remain distinguishable and unchanged',async()=>{
  let receipt;const values=['a','b','c'].map(id=>entry(id));
  values[1].decision='accepted';values[1].rejectionReasons=[];
  const review=createPreviewNewsworthiness({reportingWindow:window,onResult:r=>{receipt=r},requestImpl:async()=>({editorialPayload:{assessments:[verdict('a')]}})});
  const [good,omitted,unsubmitted]=await review(values);
  assert.equal(good.decision,'accepted');assert.equal(omitted.decision,'rejected');
  assert.equal(omitted.candidate.ranking.editorialValidation.decision,'rejected');
  assert.strictEqual(unsubmitted,values[2]);assert.deepEqual(receipt.omittedCandidateIds,['b']);
  assert.deepEqual(receipt.submitted.map(s=>s.dossier.candidateId),['a','b']);
  assert.deepEqual(receipt.audit.map(a=>a.candidateId),['a','b']);
});
test('unknown or duplicate IDs, empty response, malformed shape and extra properties still fail the whole sequence',async()=>{
  const good=verdict('a');
  for(const payload of [null,[],{assessments:[]},{assessments:[null]},
    {assessments:[good,{...verdict('b'),candidateId:'unknown'}]},
    {assessments:[good,good]}, {assessments:[good],unexpected:true},
    {assessments:[{...good,extra:'not in schema'}]},
    {assessments:[{...good,sourceId:7}]},{assessments:[{...good,evidenceId:'x'.repeat(41)}]},
    {assessments:[{...good,importance:31}]},
  ]){
    let receipt;const values=[entry(),entry('b')];
    const review=createPreviewNewsworthiness({reportingWindow:window,onResult:r=>{receipt=r},requestImpl:async()=>({editorialPayload:payload})});
    assert.deepEqual(await review(values),values);assert.equal(receipt.stopModels,true);assert.equal(receipt.status,'failed');
    assert.equal(receipt.code,'GEMINI_EDITORIAL_VALIDATION_FAILED');assert.equal(receipt.audit.length,0);
  }
});
test('editor plus drafts and repairs share four actual calls; budget omission is explicit, provider failure stops',async()=>{
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072});const key=publicKey.export({type:'spki',format:'der'}).toString('base64');
  for(const count of [2,4]) for(const failEditor of [false,true]){
    let editors=0,writers=0;const entries=['ai','work-and-tools','security-and-privacy','platforms-and-power'].slice(0,count).map((desk,i)=>entry(`a${i}`,desk));
    const result=await previewFreshGemini({publicKey:key,apiKey:'synthetic-key-never-real',freeProjectConfirmation:'FREE PROJECT BILLING DISABLED',now:new Date(window.endExclusive),
      coverageImpl:()=>{},researchImpl:async options=>({candidates:(await options.reviewNewsworthiness(entries)).filter(e=>e.decision==='accepted').map(e=>e.candidate),diagnostics:{sourceResults:[]}}),
      editorialRequestImpl:async()=>{editors++;if(failEditor)throw Error('quota');return{editorialPayload:{assessments:entries.map(e=>verdict(e.candidate.candidateId))}}},
      draftImpl:async()=>{writers++;return {report:{status:'failed',code:'GEMINI_EDITORIAL_VALIDATION_FAILED'},html:null,rejectedDiagnostic:{unapproved:true,rejectionDetails:[{reason:'ORIGINALITY',feedback:{field:'claims[0].text'}}]}};}});
    assert.equal(editors,1);assert.equal(editors+writers,failEditor?1:4);
    assert.equal(result.report.modelRequests,editors+writers);assert.equal(result.report.emailRequests,0);
    assert.equal(result.report.budgetOmissions.length,!failEditor&&count===4?2:0);
    const packet=openDiagnostic(result.sealed,privateKey);assert.equal(packet.editorial.status,failEditor?'failed':'human-review-required');
    assert.equal(packet.editorial.submitted.length,count);assert.equal(packet.editorial.submitted[0].initialScorecard.score,61);
    if(failEditor){assert.equal(packet.editorial.rawParsedResponse,null);assert.equal(packet.editorial.code,'EDITORIAL_PROVIDER_OR_FORMAT_FAILURE');}
  }
});
test('fresh orchestration writes only surviving source-bound candidates; entirely invalid slate makes zero writer calls',async()=>{
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072});const key=publicKey.export({type:'spki',format:'der'}).toString('base64');
  for(const allInvalid of [false,true]){
    const entries=[entry('a','ai'),entry('b','work-and-tools')];let writers=0;
    const payload={assessments:[{...verdict('a'),...(allInvalid?{quote:'Unsupported claims not in this named passage.'}:{})},{...verdict('b'),evidenceId:'S1P1'}]};
    const result=await previewFreshGemini({publicKey:key,apiKey:'synthetic-key-never-real',freeProjectConfirmation:'FREE PROJECT BILLING DISABLED',now:new Date(window.endExclusive),
      coverageImpl:()=>{},researchImpl:async options=>({candidates:(await options.reviewNewsworthiness(entries)).filter(e=>e.decision==='accepted').map(e=>e.candidate),diagnostics:{sourceResults:[]}}),
      editorialRequestImpl:async()=>({editorialPayload:payload}),
      draftImpl:async options=>{writers++;assert.equal(options.dossier.candidateId,'a');return{report:{status:'failed',code:'GEMINI_EDITORIAL_VALIDATION_FAILED'},html:null,rejectedDiagnostic:{unapproved:true,rejectionDetails:[]}};}});
    assert.equal(writers,allInvalid?0:1);assert.equal(result.report.modelRequests,1+writers);assert.equal(result.report.emailRequests,0);
    const packet=openDiagnostic(result.sealed,privateKey);assert.deepEqual(packet.editorial.rawParsedResponse,payload);
    assert.equal(packet.editorial.stopModels,allInvalid);assert.equal(packet.editorial.audit.find(a=>a.candidateId==='b').reason,'EDITORIAL_QUOTE_NOT_BOUND');
  }
});
test('research, coverage and selection failures after editorial preserve a sealed failure receipt',async()=>{
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072});const key=publicKey.export({type:'spki',format:'der'}).toString('base64');
  for(const stage of ['RESEARCH_FAILED','COVERAGE_HELD','SELECTION_HELD']){
    let calls=0;
    const result=await previewFreshGemini({publicKey:key,apiKey:'synthetic-key-never-real',freeProjectConfirmation:'FREE PROJECT BILLING DISABLED',now:new Date(window.endExclusive),
      editorialRequestImpl:async()=>{calls++;return{editorialPayload:{assessments:[verdict('a')]}}},draftImpl:()=>assert.fail('must not write'),
      researchImpl:async options=>{const assessed=await options.reviewNewsworthiness([entry()]);if(stage==='RESEARCH_FAILED')throw Error('sensitive provider prose');
        return {candidates:stage==='SELECTION_HELD'?null:assessed.map(a=>a.candidate),diagnostics:{sourceResults:[]}};},
      coverageImpl:()=>{if(stage==='COVERAGE_HELD')throw Error('private arbitrary explanation')},
    });
    assert.equal(calls,1);assert.equal(result.report.modelRequests,1);assert.equal(result.report.draftCount,0);assert.equal(result.report.code,`PREVIEW_${stage}`);
    const packet=openDiagnostic(result.sealed,privateKey);assert.equal(packet.editorial.submitted.length,1);assert.deepEqual(packet.editorial.rawParsedResponse,{assessments:[verdict('a')]});
    assert.doesNotMatch(JSON.stringify(result),/sensitive provider|private arbitrary/);
  }
});
