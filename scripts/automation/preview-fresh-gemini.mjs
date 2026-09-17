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

export function selectPreviewReadyCandidates(snapshot, reportingWindow) {
  const pool = snapshot.candidates ?? snapshot.selectedCandidates;
  if (!Array.isArray(pool) || pool.length > 40) throw Error("PREVIEW_SHORTLIST_INVALID");
  const held = [], ready = [];
  for (const candidate of pool) {
    const dossier = groundedDossiers([candidate])[0];
    const reasons = previewEvidenceHolds(candidate, dossier, reportingWindow);
    if (reasons.length) held.push({ candidateId: candidate.candidateId, desk: candidate.suggestedDesk, reasons });
    else ready.push(candidate);
  }
  // Reuse the existing desk/entity-diversity assignment, not a weaker ranker.
  // This pool contains only candidates already accepted by the scorecard.
  return { ...selectFreeDeskCandidates(ready, { evidencePolicy: "authoritative-or-corroborated" }), held };
}

export async function previewFreshGemini({ publicKey, apiKey, freeProjectConfirmation,
  tavilyApiKey, tavilyPaygoDisabledVerified = false, now = new Date(),
  researchImpl = collectFreeResearchSnapshot, draftImpl = previewGeminiLite,
  coverageImpl = assertFreeResearchCoverage } = {}) {
  diagnosticPublicKey(publicKey);
  if (freeProjectConfirmation !== FREE_PROJECT_CONFIRMATION || !/^[A-Za-z0-9_.-]{20,256}$/u.test(apiKey ?? "")) {
    throw Error("PREVIEW_CONFIGURATION_INVALID");
  }
  const retrievedAt = now.toISOString();
  const reportingWindow = { startInclusive: new Date(now.getTime() - 72 * 3600000).toISOString(),
    endExclusive: retrievedAt, displayLabel: "Manual rolling 72-hour research preview" };
  const snapshot = await researchImpl({ reportingWindow, retrievedAt, enrichArticles: true,
    evidencePolicy: "authoritative-or-corroborated", minimumScore: 70, minimumAuthoritativeScore: 70,
    ...(tavilyApiKey ? { discoverWebArticles: createTavilyDiscovery({ apiKey: tavilyApiKey,
      paygoDisabledVerified: tavilyPaygoDisabledVerified }) } : {}) });
  coverageImpl(snapshot, { feedSources: FREE_FEED_SOURCES, reportingWindow, retrievedAt });
  const selection = selectPreviewReadyCandidates(snapshot, reportingWindow);
  const candidates = selection.selectedCandidates;
  if (!Array.isArray(candidates) || candidates.length > 4 || new Set(candidates.map(c => c.suggestedDesk)).size !== candidates.length) {
    throw Error("PREVIEW_SELECTION_INVALID");
  }
  const records = [], dossiers = groundedDossiers(candidates);
  let requests = 0, stopped = false;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i], dossier = dossiers[i];
    const holds = previewEvidenceHolds(candidate, dossier, reportingWindow);
    if (stopped) holds.push("MODEL_REQUESTS_STOPPED");
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
    selectedCount: candidates.length, heldCount: selection.held.length + records.filter(r => r.holds.length).length,
    successfulFeeds: snapshot.diagnostics.sourceResults.filter(s => s.status === "ok").length,
    totalFeeds: snapshot.diagnostics.sourceResults.length,
    webSearch: snapshot.diagnostics.webSearch ?? null,
    failures: records.filter(r => r.result?.report.status === "failed").map(r => ({ code: r.result.report.code,
      structuralErrors: r.result.report.structuralErrors ?? [] })) };
  const packet = { purpose: "fresh-news-unapproved-human-review-not-an-edition", report, reportingWindow,
    preDraftHolds: selection.held, records };
  if (Buffer.byteLength(JSON.stringify(packet)) > 160000) throw Error("PREVIEW_PACKET_TOO_LARGE");
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
