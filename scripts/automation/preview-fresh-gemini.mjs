#!/usr/bin/env node
// Manual, encrypted, human-review-only. No delivery or automatic approval path.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectFreeResearchSnapshot, selectFreeDeskCandidates } from "./free/feed-engine.mjs";
import { FREE_FEED_SOURCES } from "./free/feed-sources.mjs";
import { assertFreeResearchCoverage } from "./draft-free-edition.mjs";
import { groundedDossiers } from "./free/grounded-draft.mjs";
import { createTavilyDiscovery } from "./free/web-search.mjs";
import { previewEvidenceHolds } from "./free/preview-evidence-gate.mjs";
import { previewGeminiLite } from "./preview-gemini-lite.mjs";
import { FREE_PROJECT_CONFIRMATION } from "./check-gemini-writer.mjs";
import { diagnosticPublicKey, sealDiagnostic } from "./private-writer-diagnostic.mjs";
import { createPreviewNewsworthiness } from './free/preview-newsworthiness.mjs';

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
  researchImpl = collectFreeResearchSnapshot, draftImpl = previewGeminiLite,
  coverageImpl = assertFreeResearchCoverage, editorialRequestImpl } = {}) {
  diagnosticPublicKey(publicKey);
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
      retrievedAt,modelRequests:editorial.modelRequests,maxModelRequests:4,draftCount:0,selectedCount:0,
      editorialStatus:editorial.status,editorialModelRequests:editorial.modelRequests,budgetOmissions:[]};
    return {report,sealed:sealDiagnostic({purpose:'fresh-news-unapproved-human-review-not-an-edition',report,reportingWindow,
      editorial,preDraftHolds:[{reasons:[code]}],records:[]},publicKey)};
  };
  let snapshot;
  try { snapshot = await researchImpl({ reportingWindow, retrievedAt, enrichArticles: true, articleEvidenceMode: "structured-preview",
    reviewNewsworthiness,
    evidencePolicy: "authoritative-or-corroborated", minimumScore: 70, minimumAuthoritativeScore: 70,
    ...(tavilyApiKey ? { discoverWebArticles: createTavilyDiscovery({ apiKey: tavilyApiKey,
      paygoDisabledVerified: tavilyPaygoDisabledVerified }) } : {}) }); }
  catch {return heldResult('PREVIEW_RESEARCH_FAILED');}
  try {coverageImpl(snapshot, { feedSources: FREE_FEED_SOURCES, reportingWindow, retrievedAt });}
  catch {return heldResult('PREVIEW_COVERAGE_HELD');}
  let selection;
  try {selection = selectPreviewReadyCandidates(snapshot, reportingWindow, { requireStructured: true });}
  catch {return heldResult('PREVIEW_SELECTION_HELD');}
  const availableCandidates = selection.selectedCandidates;
  const candidates = [...availableCandidates].sort((a,b)=>b.ranking.score-a.ranking.score||a.candidateId.localeCompare(b.candidateId)).slice(0,4-editorial.modelRequests);
  const budgetOmissions=availableCandidates.filter(c=>!candidates.includes(c)).map(c=>({candidateId:c.candidateId,desk:c.suggestedDesk,reason:'PREVIEW_MODEL_BUDGET_RESERVED_FOR_EDITOR'}));
  if (!Array.isArray(candidates) || candidates.length > 4 || new Set(candidates.map(c => c.suggestedDesk)).size !== candidates.length) {
    throw Error("PREVIEW_SELECTION_INVALID");
  }
  const records = [], dossiers = groundedDossiers(candidates);
  let requests = editorial.modelRequests, stopped = editorial.stopModels;
  // Reserve bounded raw results before spending writer requests. The encrypted
  // diagnostic envelope permits 350KB; duplicate rendered HTML is regenerated
  // from the retained draft/map/dossier offline, never stored three times.
  const diagnosticReservation=Buffer.byteLength(JSON.stringify({editorial,dossiers,preDraftHolds:selection.held}))+148_000;
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
    let result = await draftImpl({ apiKey, freeProjectConfirmation, dossier, fresh: true });
    // One targeted correction only, within the SAME four-request ceiling. Keep
    // one initial call reserved for each remaining candidate; never retry quota,
    // provider or semantic-review failures, or repeatedly sample a verdict.
    if (result.report?.code === "GEMINI_EDITORIAL_VALIDATION_FAILED" &&
        !result.report.structuralErrors?.some(code => code.startsWith('ADVISORY_')) &&
        result.rejectedDiagnostic?.rejectionDetails?.length && requests + (candidates.length - i - 1) < 4) {
      record.initialRejection = result;
      requests++;
      result = await draftImpl({ apiKey, freeProjectConfirmation, dossier, fresh: true, repair: result.rejectedDiagnostic });
    }
    record.result = result;
    if (result.report?.status === "failed" && result.report.code !== "GEMINI_EDITORIAL_VALIDATION_FAILED") stopped = true;
  }
  const draftCount = records.filter(r => r.result?.html).length;
  const report = { status: draftCount ? "human-review-required" : "no-reviewable-drafts",
    approved: false, qualified: false, productionEnabled: false, emailRequests: 0,
    retrievedAt, modelRequests: requests, maxModelRequests: 4, draftCount,
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
    editorial, preDraftHolds: selection.held, records:records.map(record=>{
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
      tavilyApiKey: process.env.TAVILY_API_KEY, tavilyPaygoDisabledVerified: process.env.TAVILY_PAYGO_DISABLED_VERIFIED === "true" });
    await writeFile(process.argv[3], JSON.stringify(result.sealed), { flag: "wx", mode: 0o600 });
    console.info(JSON.stringify(result.report));
    if (!result.report.draftCount) process.exitCode = 1;
  } catch { console.error("FRESH_PREVIEW_FAILED"); process.exitCode = 1; }
}
