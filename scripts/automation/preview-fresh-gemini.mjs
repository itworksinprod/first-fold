#!/usr/bin/env node
// Manual, encrypted, human-review-only. No delivery or automatic approval path.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectFreeResearchSnapshot, selectFreeDeskCandidates } from "./free/feed-engine.mjs";
import { FREE_FEED_SOURCES } from "./free/feed-sources.mjs";
import { assertFreeResearchCoverage } from "./draft-free-edition.mjs";
import { groundedDossiers, GROUNDED_DRAFT_SCHEMA, validateGroundedStory } from "./free/grounded-draft.mjs";
import { createTavilyDiscovery } from "./free/web-search.mjs";
import { previewEvidenceHolds } from "./free/preview-evidence-gate.mjs";
import { previewGeminiLite, validPreviewEvidenceMap, renderHumanReview } from "./preview-gemini-lite.mjs";
import { buildPreviewReviewPacket } from './free/preview-editorial-review.mjs';
import { previewCitationCorrectionAllowed, proposePreviewCitationCorrection, applyPreviewCitationAdditions } from './free/preview-citation-correction.mjs';
import { GEMINI_LITE_MODEL, geminiFailureDiagnostic } from './free/gemini-ai.mjs';
import { FRESH_PREVIEW_WRITER_PROFILE } from './free/fresh-preview-writer-prompt.mjs';
import { previewReaderAlarms, previewReaderObligations } from './free/preview-reader-alarms.mjs';
import { advisoryDraftAlarms } from './free/preview-advisory-contract.mjs';
import { FREE_PROJECT_CONFIRMATION } from "./check-gemini-writer.mjs";
import { diagnosticPublicKey, sealDiagnostic } from "./private-writer-diagnostic.mjs";
import { createPreviewNewsworthiness } from './free/preview-newsworthiness.mjs';

const diagnosticTargets=Object.freeze({'gitlab-rate-limits-2026':Object.freeze({
  candidateId:'candidate-cb9de104648a6a26',url:'https://about.gitlab.com/blog/rate-limit-change-2026/',publisher:'GitLab',
})});
export function validatePreviewDiagnosticTarget(value='standard') {
  if(value!=='standard'&&!Object.hasOwn(diagnosticTargets,value))throw Error('PREVIEW_DIAGNOSTIC_TARGET_INVALID');
  return value;
}
export function validatePreviewCitationCorrectionMode(value='off') {
  if(!['off','additions-only'].includes(value))throw Error('PREVIEW_CITATION_CORRECTION_MODE_INVALID');
  return value;
}
const citationFailureCodes=new Set(['CITATION_CORRECTION_NOT_ELIGIBLE','CITATION_CORRECTION_INPUT_TOO_LARGE',
  'CITATION_ADDITIONS_INVALID','CITATION_CORRECTION_FAILED','CITATION_CORRECTION_DECLINED','GEMINI_CONFIGURATION_INVALID',
  'GEMINI_FREE_TIER_NOT_CONFIRMED','GEMINI_HTTP_ERROR','GEMINI_FREE_QUOTA_EXHAUSTED','GEMINI_TIMEOUT',
  'GEMINI_TRANSPORT_FAILED','GEMINI_RESPONSE_INVALID','GEMINI_INCOMPLETE_OR_BLOCKED','GEMINI_EDITORIAL_FORMAT_INVALID',
  'GEMINI_EDITORIAL_VALIDATION_FAILED']);
function citationProposalReport(report) {
  const success=report?.status==='human-review-required';
  return {status:success?'human-review-required':'failed',approved:false,qualified:false,productionEnabled:false,
    emailRequests:0,modelRequests:1,model:GEMINI_LITE_MODEL,
    ...(!success?{code:citationFailureCodes.has(report?.code)?report.code:'CITATION_CORRECTION_FAILED',
      ...geminiFailureDiagnostic(report)}:{}),
    ...Object.fromEntries(['requestSha256','responseSha256'].filter(k=>typeof report?.[k]==='string'&&/^[a-f0-9]{64}$/u.test(report[k])).map(k=>[k,report[k]]))};
}
function citationAdditionsReceipt(additions) {
  if(!Array.isArray(additions)||additions.length>4||additions.some(a=>!a||typeof a!=='object'||
    Object.keys(a).sort().join()!=='evidenceIds,field'||!['headline','deck','whyItMatters','whatToDoOrWatch'].includes(a.field)||
    !Array.isArray(a.evidenceIds)||a.evidenceIds.length>3||a.evidenceIds.some(id=>typeof id!=='string'||!/^S[1-9]\d?P[1-9]\d{0,2}$/u.test(id))))return undefined;
  return additions.map(a=>({field:a.field,evidenceIds:[...a.evidenceIds]}));
}
export function citationCorrectedPreview(original,dossier,proposal) {
  const report=citationProposalReport(proposal?.report);
  if(report.status!=='human-review-required')return {report,html:null};
  // Reconstruct from the original and strict additions, not from a provider's
  // proposed replacement story. Even an injected caller cannot rewrite prose.
  const payload=applyPreviewCitationAdditions(original,dossier,proposal.additions);
  if(JSON.stringify(payload)!==JSON.stringify(proposal.correctedPayload))throw Error('PREVIEW_CITATION_PROPOSAL_CHANGED');
  const packet=buildPreviewReviewPacket(payload.stories[0],dossier,payload.evidenceForFields);
  if(packet.holds.length)throw Error('PREVIEW_CITATION_CORRECTION_HELD');
  return {report,
    draft:payload.stories[0],evidenceForFields:payload.evidenceForFields,reviewBinding:packet.binding,reviewHolds:packet.holds,
    html:renderHumanReview(payload.stories[0],dossier,{fresh:true,evidenceForFields:payload.evidenceForFields})};
}
export function selectDiagnosticTarget(eligible,value) {
  validatePreviewDiagnosticTarget(value);
  if(value==='standard')return eligible;
  const target=diagnosticTargets[value];
  const matches=eligible.filter(c=>{
    // The collector adds a context-only feed index alongside an originating
    // article. It is not an additional factual source or corroboration.
    const factual=(c.sources??[]).filter(s=>s.relationship!=='context');
    return c.candidateId===target.candidateId&&factual.length===1&&
      factual[0].url===target.url&&factual[0].publisher===target.publisher&&factual[0].relationship==='originating';
  });
  if(matches.length!==1)throw Error('PREVIEW_DIAGNOSTIC_TARGET_NOT_ELIGIBLE');
  return matches;
}

export function previewMechanicalRepairAllowed(result) {
  if(result?.report?.code!=='GEMINI_EDITORIAL_VALIDATION_FAILED')return false;
  const details=result.rejectedDiagnostic?.rejectionDetails;
  if(!Array.isArray(details)||!details.length||details.length>8||details.some(d=>!d||typeof d!=='object'))return false;
  if(result.report.structuralErrors!==undefined&&(!Array.isArray(result.report.structuralErrors)||
    result.report.structuralErrors.some(code=>!['SHAPE','ORIGINALITY'].includes(code))))return false;
  const fields=GROUNDED_DRAFT_SCHEMA.properties.stories.items.properties;
  return details.every(({reason,feedback})=>{
    if(reason==='ORIGINALITY')return ['headline','deck','whyItMatters','whatToDoOrWatch','claims[0].text','claims[1].text','readerCopy'].includes(feedback?.field);
    if(reason!=='SHAPE'||!['headline','deck','whyItMatters','whatToDoOrWatch'].includes(feedback?.field))return false;
    const schema=fields[feedback.field],text=result.rejectedDiagnostic.payload?.stories?.[0]?.[feedback.field];
    return typeof text==='string'&&text.length<=24000&&feedback.actualCharacters===text.length&&
      feedback.minCharacters===schema.minLength&&feedback.maxCharacters===schema.maxLength&&
      (text.length<schema.minLength||text.length>schema.maxLength||/\b(?:access token|api key)\b/iu.test(text));
  });
}

export function previewSourceQualificationRepairAllowed(result,dossier) {
  // This is a source-qualification correction, NOT a mechanical or factual
  // approval. Only one named, reproducible omission can use the shared spare.
  if(result?.report?.code!=='GEMINI_EDITORIAL_VALIDATION_FAILED')return false;
  const raw=result.rejectedDiagnostic,payload=raw?.payload,details=raw?.rejectionDetails;
  const allowed=['PREVIEW_AUDIENCE_SCOPE_REQUIRED','SHAPE','ORIGINALITY'];
  if(!Array.isArray(dossier?.sources)||raw?.unapproved!==true||payload?.stories?.length!==1||payload.stories[0]?.candidateId!==dossier?.candidateId||
    !validPreviewEvidenceMap(payload.evidenceForFields,dossier)||!Array.isArray(details)||!details.length||details.length>8||
    details.some(d=>!allowed.includes(d?.reason))||!Array.isArray(result.report.structuralErrors)||
    !result.report.structuralErrors.includes('PREVIEW_AUDIENCE_SCOPE_REQUIRED')||result.report.structuralErrors.some(c=>!allowed.includes(c)))return false;
  const qualifiers=details.filter(d=>d.reason==='PREVIEW_AUDIENCE_SCOPE_REQUIRED');
  if(!qualifiers.length||qualifiers.some(d=>!['headline','deck','whyItMatters','whatToDoOrWatch'].includes(d.feedback?.field)))return false;
  try{
    const draft=payload.stories[0],map=payload.evidenceForFields,obligations=previewReaderObligations(dossier);
    const detected=[];
    validateGroundedStory(draft,dossier,code=>detected.push(code),{previewFieldEvidence:map});
    if(detected.some(c=>!['SHAPE','ORIGINALITY'].includes(c)))return false;
    const alarms=previewReaderAlarms(draft,dossier,map);
    if(alarms.some(a=>a.code!=='PREVIEW_AUDIENCE_SCOPE_REQUIRED')||advisoryDraftAlarms(draft,dossier,map).length||
      qualifiers.some(d=>!alarms.some(a=>a.field===d.feedback.field&&a.code===d.reason)||
        !obligations.some(o=>map[d.feedback.field].includes(o.evidenceId))))return false;
  }catch{return false;}
  const mechanical=details.filter(d=>d.reason!=='PREVIEW_AUDIENCE_SCOPE_REQUIRED');
  return mechanical.length===0||previewMechanicalRepairAllowed({...result,report:{...result.report,
    structuralErrors:result.report.structuralErrors.filter(c=>c!=='PREVIEW_AUDIENCE_SCOPE_REQUIRED')},
    rejectedDiagnostic:{...raw,rejectionDetails:mechanical}});
}

export function selectPreviewReadyCandidates(snapshot, reportingWindow, { requireStructured = false } = {}) {
  const pool = snapshot.candidates ?? snapshot.selectedCandidates;
  if (!Array.isArray(pool) || pool.length > 40) throw Error("PREVIEW_SHORTLIST_INVALID");
  const held = [], ready = [];
  for (const candidate of pool) {
    const dossier = groundedDossiers([candidate])[0];
    const reasons = previewEvidenceHolds(candidate, dossier, reportingWindow, { requireStructured });
    if (reasons.length) held.push({ candidateId: candidate.candidateId, desk: candidate.suggestedDesk, reasons,
      title: candidate.title, sources: candidate.sources.map(s => ({ publisher: s.publisher, url: s.url })),
      extraction: (candidate.feedEvidence ?? []).map(r => ({ sourceId: r.sourceId, ...r.articleExtraction })) });
    else ready.push(candidate);
  }
  // Reuse the existing desk/entity-diversity assignment, not a weaker ranker.
  // This pool contains only candidates already accepted by the scorecard.
  return { ...selectFreeDeskCandidates(ready, { evidencePolicy: "authoritative-or-corroborated" }), held };
}

export async function previewFreshGemini({ publicKey, apiKey, freeProjectConfirmation,
  tavilyApiKey, tavilyPaygoDisabledVerified = false, now = new Date(),
  diagnosticTarget='standard',citationCorrection='off',
  researchImpl = collectFreeResearchSnapshot, draftImpl = previewGeminiLite,
  coverageImpl = assertFreeResearchCoverage, editorialRequestImpl, citationCorrectionImpl=proposePreviewCitationCorrection } = {}) {
  diagnosticPublicKey(publicKey);
  validatePreviewDiagnosticTarget(diagnosticTarget);
  validatePreviewCitationCorrectionMode(citationCorrection);
  const maxModelRequests=diagnosticTarget==='standard'?4:3;
  let diagnosticSampling={mode:diagnosticTarget,baselineRanking:[]};
  if (freeProjectConfirmation !== FREE_PROJECT_CONFIRMATION || !/^[A-Za-z0-9_.-]{20,256}$/u.test(apiKey ?? "")) {
    throw Error("PREVIEW_CONFIGURATION_INVALID");
  }
  const retrievedAt = now.toISOString();
  const reportingWindow = { startInclusive: new Date(now.getTime() - 72 * 3600000).toISOString(),
    endExclusive: retrievedAt, displayLabel: "Manual rolling 72-hour research preview" };
  let editorial = {status:'not-requested',modelRequests:0,stopModels:false,audit:[]};
  const reviewNewsworthiness=createPreviewNewsworthiness({apiKey,freeTierConfirmed:freeProjectConfirmation===FREE_PROJECT_CONFIRMATION,
    reportingWindow,requestImpl:editorialRequestImpl,onResult:result=>{editorial=result;}});
  const heldResult=code=>{
    const report={status:'no-reviewable-drafts',code,approved:false,qualified:false,productionEnabled:false,emailRequests:0,
      retrievedAt,modelRequests:editorial.modelRequests,maxModelRequests,diagnosticTarget,citationCorrection,draftCount:0,selectedCount:0,
      editorialStatus:editorial.status,editorialModelRequests:editorial.modelRequests,budgetOmissions:[]};
    return {report,sealed:sealDiagnostic({purpose:'fresh-news-unapproved-human-review-not-an-edition',report,reportingWindow,
      editorial,diagnosticSampling,preDraftHolds:[{reasons:[code]}],records:[]},publicKey)};
  };
  let snapshot;
  try { snapshot = await researchImpl({ reportingWindow, retrievedAt, enrichArticles: true, articleEvidenceMode: "structured-preview",
    reviewNewsworthiness,
    evidencePolicy: "authoritative-or-corroborated", minimumScore: 70, minimumAuthoritativeScore: 70,
    ...(tavilyApiKey ? { discoverWebArticles: createTavilyDiscovery({ apiKey: tavilyApiKey,
      paygoDisabledVerified: tavilyPaygoDisabledVerified }) } : {}) }); }
  catch {return heldResult('PREVIEW_RESEARCH_FAILED');}
  // An upstream editor failure is not evidence that the diagnostic target is
  // ineligible. Preserve its sealed receipt and stop before downstream selection.
  if(editorial.stopModels)return heldResult('PREVIEW_EDITORIAL_FAILED');
  try {coverageImpl(snapshot, { feedSources: FREE_FEED_SOURCES, reportingWindow, retrievedAt });}
  catch {return heldResult('PREVIEW_COVERAGE_HELD');}
  let selection;
  try {selection = selectPreviewReadyCandidates(snapshot, reportingWindow, { requireStructured: true });}
  catch {return heldResult('PREVIEW_SELECTION_HELD');}
  const availableCandidates = selection.selectedCandidates;
  diagnosticSampling={mode:diagnosticTarget,baselineRanking:availableCandidates.map(c=>({candidateId:c.candidateId,desk:c.suggestedDesk,ranking:c.ranking}))};
  let diagnosticCandidates;
  try{diagnosticCandidates=selectDiagnosticTarget(availableCandidates,diagnosticTarget);}
  catch{return heldResult('PREVIEW_DIAGNOSTIC_TARGET_NOT_ELIGIBLE');}
  // Reserve ONE correction call rather than spending every slot on first drafts.
  // This trades diagnostic breadth for correction capacity, not lower standards.
  const candidates = [...diagnosticCandidates].sort((a,b)=>b.ranking.score-a.ranking.score||a.candidateId.localeCompare(b.candidateId)).slice(0,diagnosticTarget==='standard'?3-editorial.modelRequests:1);
  const budgetOmissions=availableCandidates.filter(c=>!candidates.includes(c)).map(c=>({candidateId:c.candidateId,desk:c.suggestedDesk,
    reason:diagnosticTarget==='standard'?'PREVIEW_MODEL_BUDGET_RESERVED_FOR_CORRECTION':'TARGETED_DIAGNOSTIC_NOT_EDITION_SELECTION'}));
  if (!Array.isArray(candidates) || candidates.length > 4 || new Set(candidates.map(c => c.suggestedDesk)).size !== candidates.length) {
    throw Error("PREVIEW_SELECTION_INVALID");
  }
  const records = [], dossiers = groundedDossiers(candidates);
  let requests = editorial.modelRequests, repairRequests=0, stopped = editorial.stopModels;
  // Reserve bounded raw results before spending writer requests. The encrypted
  // diagnostic envelope permits 350KB; duplicate rendered HTML is regenerated
  // from the retained draft/map/dossier offline, never stored three times.
  const diagnosticReservation=Buffer.byteLength(JSON.stringify({editorial,dossiers,diagnosticSampling,preDraftHolds:selection.held}))+148_000;
  const diagnosticBudgetHeld=diagnosticReservation>340_000;
  if(diagnosticBudgetHeld) stopped=true;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i], dossier = dossiers[i];
    const holds = previewEvidenceHolds(candidate, dossier, reportingWindow, { requireStructured: true });
    if (stopped) holds.push(diagnosticBudgetHeld?'PREVIEW_DIAGNOSTIC_BUDGET_HELD':"MODEL_REQUESTS_STOPPED");
    const record = { candidateId: candidate.candidateId, title: candidate.title, desk: candidate.suggestedDesk,
      score: candidate.ranking.score, sources: candidate.sources.map(s => ({ publisher: s.publisher, url: s.url })), dossier, holds };
    records.push(record);
    if (holds.length) continue;
    requests++;
    let result = await draftImpl({ apiKey, freeProjectConfirmation, dossier, fresh: true, writerProfile: FRESH_PREVIEW_WRITER_PROFILE });
    // One correction across the ENTIRE experiment. Missing preview-audience
    // qualification is the sole allowed source-scope correction; every other
    // semantic/advisory and all provider/quota failures remain nonretryable.
    const repairKind=previewMechanicalRepairAllowed(result)?'mechanical':previewSourceQualificationRepairAllowed(result,dossier)?'source-qualification':
      citationCorrection==='additions-only'&&previewCitationCorrectionAllowed(result,dossier)?'citation-additions-only':null;
    if (repairRequests===0 && repairKind && requests + (candidates.length - i - 1) < maxModelRequests) {
      record.initialRejection = structuredClone(result);
      record.repairKind=repairKind;
      requests++;repairRequests++;
      if(repairKind==='citation-additions-only'){
        const original=structuredClone(result),originalDossier=structuredClone(dossier);
        const baseline=buildPreviewReviewPacket(original.rejectedDiagnostic.payload.stories[0],originalDossier,
          original.rejectedDiagnostic.payload.evidenceForFields);
        try{
          const proposal=await citationCorrectionImpl({apiKey,freeProjectConfirmation,
            dossier:structuredClone(originalDossier),result:structuredClone(original)});
          const additions=citationAdditionsReceipt(proposal?.additions);
          const rejected=citationAdditionsReceipt(proposal?.rejectedProposal?.additions);
          record.citationCorrection={report:citationProposalReport(proposal?.report),
            ...(additions?{additions}:{}),originalBinding:baseline.binding,
            ...(proposal?.rejectedProposal!==undefined?{rejectedProposal:rejected?
              {additions:rejected}:{code:'UNSAFE_PROPOSAL_OMITTED'}}:{})};
          result=citationCorrectedPreview(original,originalDossier,proposal);
          if(result.draft)record.citationCorrection.correctedBinding=buildPreviewReviewPacket(result.draft,originalDossier,result.evidenceForFields).binding;
        }catch{
          result={report:{status:'failed',code:'PREVIEW_CITATION_CORRECTION_HELD',approved:false,qualified:false,
            productionEnabled:false,emailRequests:0,modelRequests:1},html:null};
        }
      }else result = await draftImpl({ apiKey, freeProjectConfirmation, dossier, fresh: true, writerProfile: FRESH_PREVIEW_WRITER_PROFILE, repair: result.rejectedDiagnostic });
    }
    record.result = result;
    if (result.report?.status === "failed" && result.report.code !== "GEMINI_EDITORIAL_VALIDATION_FAILED") stopped = true;
  }
  const draftCount = records.filter(r => r.result?.html).length;
  const report = { status: draftCount ? "human-review-required" : "no-reviewable-drafts",
    approved: false, qualified: false, productionEnabled: false, emailRequests: 0,
    retrievedAt, modelRequests: requests, maxModelRequests, diagnosticTarget, citationCorrection, repairRequests, draftCount,
    editorialStatus:editorial.status,editorialModelRequests:editorial.modelRequests,budgetOmissions,
    evidenceMode: "structured-preview-v1", manualProseEdits: 0,
    selectedCount: candidates.length, heldCount: selection.held.length + records.filter(r => r.holds.length).length,
    successfulFeeds: snapshot.diagnostics.sourceResults.filter(s => s.status === "ok").length,
    totalFeeds: snapshot.diagnostics.sourceResults.length,
    webSearch: snapshot.diagnostics.webSearch ?? null,
    webSearchOutcome: snapshot.diagnostics.webSearchOutcome ?? {status:'not-recorded'},
    articleAllocation: snapshot.diagnostics.articleAllocation ?? null,
    failures: records.filter(r => r.result?.report.status === "failed").map(r => ({ code: r.result.report.code,
      structuralErrors: r.result.report.structuralErrors ?? [] })) };
  const packet = { purpose: "fresh-news-unapproved-human-review-not-an-edition", report, reportingWindow,
    editorial, diagnosticSampling, preDraftHolds: selection.held, records:records.map(record=>{
      const compact=result=>{if(!result)return result;const{html,...rest}=result;return {...rest,hasDraftPreview:Boolean(html)};};
      return {...record,result:compact(record.result),...(record.initialRejection?{initialRejection:compact(record.initialRejection)}:{})};
    }) };
  if (Buffer.byteLength(JSON.stringify(packet)) > 340000) throw Error("PREVIEW_PACKET_TOO_LARGE");
  return { report, sealed: sealDiagnostic(packet, publicKey) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== "--human-review-only") throw Error("PREVIEW_ARGUMENTS_INVALID");
    const result = await previewFreshGemini({ publicKey: process.env.DIAGNOSTIC_PUBLIC_KEY,
      apiKey: process.env.GEMINI_API_KEY, freeProjectConfirmation: process.env.GEMINI_FREE_PROJECT_CONFIRMATION,
      diagnosticTarget:process.env.PREVIEW_DIAGNOSTIC_TARGET||'standard',
      citationCorrection:process.env.PREVIEW_CITATION_CORRECTION||'off',
      tavilyApiKey: process.env.TAVILY_API_KEY, tavilyPaygoDisabledVerified: process.env.TAVILY_PAYGO_DISABLED_VERIFIED === "true" });
    await writeFile(process.argv[3], JSON.stringify(result.sealed), { flag: "wx", mode: 0o600 });
    console.info(JSON.stringify(result.report));
    if (!result.report.draftCount) process.exitCode = 1;
  } catch { console.error("FRESH_PREVIEW_FAILED"); process.exitCode = 1; }
}
