#!/usr/bin/env node
// Offline-evidence draft for HUMAN review only. Never creates a delivery receipt.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { reviewerResearchScopeCases } from "../../tests/fixtures/reviewer-research-scope.mjs";
import { FREE_PROJECT_CONFIRMATION } from "./check-gemini-writer.mjs";
import { requestGeminiEditorial, geminiFailureDiagnostic, GEMINI_LITE_MODEL } from "./free/gemini-ai.mjs";
import { WRITER_PROMPT, GROUNDED_DRAFT_SCHEMA, localPromptDossier, validateGroundedStory } from "./free/grounded-draft.mjs";

const escape = value => String(value).replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function renderHumanReview(draft, dossier, { fresh = false } = {}) {
  const section = (title, text) => `<h2>${escape(title)}</h2><p>${escape(text)}</p>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>First Fold — unapproved writing sample</title>
<style>body{max-width:850px;margin:40px auto;padding:0 24px;background:#f5f0e6;color:#171512;font:18px/1.6 Georgia,serif}header,aside{border:2px solid #712b27;padding:18px}h1{line-height:1.2}h2{font-size:21px}small{font:14px/1.5 sans-serif}article{margin:30px 0}li{margin:15px 0}</style>
<header><strong>UNAPPROVED — HUMAN REVIEW REQUIRED</strong><br>${fresh ? "Fresh-source diagnostic draft, not an approved edition." : "Offline writing sample from stored September 14, 2026 MIT evidence. Not today's paper or fresh research."} Flash-Lite failed automatic reviewer qualification; no email has been sent.</header>
<article><h1>${escape(draft.headline)}</h1><p><em>${escape(draft.deck)}</em></p>
<h2>What happened</h2>${draft.claims.map(c => `<p>${escape(c.text)} <small>[${escape(c.supports.map(s => s.evidenceId).join(", "))}]</small></p>`).join("")}
${section("Why it matters", draft.whyItMatters)}${section("What to watch", draft.whatToDoOrWatch)}</article>
<aside><strong>Review checklist</strong><ul><li>Does every assertion, including the headline, follow from the evidence?</li><li>Does the text distinguish research from a product release, and possibilities from measured results?</li><li>Is the analysis specific and useful without inventing safety, performance or deployment benefits?</li></ul>Passing structural checks is not factual approval.</aside>
<h2>Evidence provided to the writer</h2><p>${fresh ? "Evidence captured by the research collector for this run. Source links and retrieval time are in the accompanying review packet." : 'These are stored excerpts, not a new check of the full article. <a href="https://news.mit.edu/2026/new-method-enables-ai-safety-critical-situations-0914" rel="noreferrer">Original MIT News article</a>'}</p>
${dossier.sources.map(s => `<h3>${escape(s.publisher)}</h3><ul>${s.passages.map(p => `<li><strong>${escape(p.evidenceId)}</strong> ${escape(p.text)}</li>`).join("")}</ul>`).join("")}</html>`;
}

export async function previewGeminiLite({ apiKey, freeProjectConfirmation, fetchImpl = globalThis.fetch,
  dossier = reviewerResearchScopeCases()[0].dossier, fresh = false } = {}) {
  const structuralErrors = new Set();
  try {
    const result = await requestGeminiEditorial({ apiKey, model: GEMINI_LITE_MODEL,
      freeTierConfirmed: freeProjectConfirmation === FREE_PROJECT_CONFIRMATION, fetchImpl,
      maxTokens: 8000, thinking: "medium", timeoutMs: 180000,
      messages: [{ role: "system", content: `${WRITER_PROMPT}\nInclude each factual source's exact supplied publisher name in the claims.text sentences. Do not shorten those names or claim independent confirmation for a single-source account. Research is not a product release; a possible use is not an observed result. Do not promise safety, productivity, reliability or performance benefits absent supporting measurements. In whatToDoOrWatch, suggest a check the reader can make; never invent scheduled tests, updates or releases.` },
        { role: "user", content: JSON.stringify({ dossiers: [localPromptDossier(dossier)] }) }],
      schema: GROUNDED_DRAFT_SCHEMA,
      validatePayload: p => p && Object.keys(p).join() === "stories" && Array.isArray(p.stories) && p.stories.length === 1 &&
        p.stories[0]?.candidateId === dossier.candidateId && validateGroundedStory(p.stories[0], dossier,
          reason => { if (typeof reason === "string" && /^[A-Z_]{1,80}$/u.test(reason)) structuralErrors.add(reason); }) });
    return { report: { status: "human-review-required", qualified: false, approved: false,
      productionEnabled: false, emailRequests: 0, liveResearchRequests: 0, model: result.model,
      modelRequests: 1, requestSha256: result.requestSha256, responseSha256: result.responseSha256 },
    draft: result.editorialPayload.stories[0], html: renderHumanReview(result.editorialPayload.stories[0], dossier, { fresh }) };
  } catch (error) {
    return { report: { status: "failed", qualified: false, approved: false, productionEnabled: false,
      emailRequests: 0, liveResearchRequests: 0, model: GEMINI_LITE_MODEL,
      code: /^GEMINI_[A-Z_]+$/u.test(error?.code ?? "") ? error.code : "GEMINI_PREVIEW_FAILED",
      ...geminiFailureDiagnostic(error), structuralErrors: [...structuralErrors] }, html: null };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4 || process.argv[2] !== "--human-review-only") {
    console.error("Use --human-review-only OUTPUT_HTML."); process.exitCode = 1;
  } else {
    const result = await previewGeminiLite({ apiKey: process.env.GEMINI_API_KEY,
      freeProjectConfirmation: process.env.GEMINI_FREE_PROJECT_CONFIRMATION });
    if (result.html) await writeFile(process.argv[3], result.html, { flag: "wx", mode: 0o600 });
    console.info(JSON.stringify(result.report));
    if (!result.html) process.exitCode = 1;
  }
}
