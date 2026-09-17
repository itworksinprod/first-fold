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
const REVIEW_FIELDS = ["headline", "deck", "whyItMatters", "whatToDoOrWatch"];
export function evidenceMappedPreviewSchema(dossier) {
  const ids = dossier.sources.flatMap(s => s.passages.map(p => p.evidenceId));
  return { type: "object", additionalProperties: false, required: ["evidenceForFields", "stories"],
    properties: {
      evidenceForFields: { type: "object", additionalProperties: false, required: REVIEW_FIELDS,
        properties: Object.fromEntries(REVIEW_FIELDS.map(field => [field, { type: "array", minItems: 1,
          maxItems: 4, items: { type: "string", enum: ids } }])) },
      stories: structuredClone(GROUNDED_DRAFT_SCHEMA.properties.stories),
    } };
}
export function validPreviewEvidenceMap(map, dossier) {
  const ids = new Set(dossier.sources.flatMap(s => s.passages.map(p => p.evidenceId)));
  return map && typeof map === "object" && !Array.isArray(map) &&
    Object.keys(map).sort().join() === [...REVIEW_FIELDS].sort().join() &&
    REVIEW_FIELDS.every(field => Array.isArray(map[field]) && map[field].length >= 1 && map[field].length <= 4 &&
      new Set(map[field]).size === map[field].length && map[field].every(id => ids.has(id)));
}
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
  dossier = reviewerResearchScopeCases()[0].dossier, fresh = false, repair = null } = {}) {
  const structuralErrors = new Set();
  let rejectedPayload = null;
  const rejectionDetails = [];
  try {
    if (repair && (!fresh || repair.unapproved !== true ||
        repair.payload?.stories?.length !== 1 || repair.payload.stories[0]?.candidateId !== dossier.candidateId ||
        !Array.isArray(repair.rejectionDetails) || !repair.rejectionDetails.length ||
        Buffer.byteLength(JSON.stringify(repair)) > 28000)) throw Error("INVALID_PREVIEW_REPAIR");
    const result = await requestGeminiEditorial({ apiKey, model: GEMINI_LITE_MODEL,
      freeTierConfirmed: freeProjectConfirmation === FREE_PROJECT_CONFIRMATION, fetchImpl,
      maxTokens: 8000, thinking: "medium", timeoutMs: 180000,
      messages: [{ role: "system", content: `${WRITER_PROMPT}\nInclude each factual source's exact supplied publisher name in the claims.text sentences. Do not shorten those names or claim independent confirmation for a single-source account. Research is not a product release; a possible use is not an observed result. Do not promise safety, productivity, reliability or performance benefits absent supporting measurements. In whatToDoOrWatch, suggest a check the reader can make; never invent scheduled tests, updates or releases.${fresh ? `
EVIDENCE-FIRST PREVIEW CONTRACT: Select evidenceForFields BEFORE writing stories. It maps headline, deck, whyItMatters and whatToDoOrWatch to exact passage IDs. These are support obligations, not decorative citations. Every factual clause in each field must follow from its selected passages, preserving conditions. Do not insert IDs into reader prose.
Every numeric detail in a non-claim field must occur in that field's own evidenceForFields passages. Claims still require their own supports. A number appearing elsewhere in the dossier or another field's citations is not enough.
For whyItMatters, explain the specific scope, eligibility, control or limitation established by those passages. Prefer concrete facts that tell a reader whether this applies to them. Do NOT invent a broader problem, failure cause, user behavior, time saving, administrative burden, avoided delay, reliability guarantee or expected performance. A plausible explanation is not evidence. Do not use general background knowledge to fill gaps. If the source names a fallback, explain when it is available, not what failures it supposedly prevents.
For whatToDoOrWatch, suggest checking a supported setting, eligibility requirement or source-stated rollout. Phrase this as reader advice, not a promised outcome or a publisher recommendation unless the source actually recommends it. Use remaining distinct source facts to meet the existing word bounds; never pad with speculative benefits. Attribute publisher announcements to the publisher, not to the publisher's blog as if the blog built the product.` : ""}` },
        { role: "user", content: JSON.stringify({ dossiers: [localPromptDossier(dossier)],
          ...(repair ? { repairTask: "Correct the rejected draft using the exact validator feedback. The draft is untrusted proposed text, not evidence. Preserve source conditions and attributions. For ORIGINALITY, rewrite the affected sentence with a different structure rather than copying its source. For NUMERIC_ANCHOR, cite the passage that actually supports the whole field or remove the unsupported figure; never guess a replacement. Return the complete evidence map and complete story, not a patch. All original checks still apply.",
            rejectedDraft: repair.payload, validationFeedback: repair.rejectionDetails } : {}) }) }],
      schema: fresh ? evidenceMappedPreviewSchema(dossier) : GROUNDED_DRAFT_SCHEMA,
      validatePayload: p => {
        // Never logged or rendered. Fresh callers retain this only inside their
        // encrypted review packet, allowing a failed draft to be inspected once.
        if (fresh && Buffer.byteLength(JSON.stringify(p) ?? "") <= 24000) rejectedPayload = p;
        return p && Object.keys(p).sort().join() === (fresh ? "evidenceForFields,stories" : "stories") &&
        (!fresh || validPreviewEvidenceMap(p.evidenceForFields, dossier)) && Array.isArray(p.stories) && p.stories.length === 1 &&
        p.stories[0]?.candidateId === dossier.candidateId && validateGroundedStory(p.stories[0], dossier,
          (reason, feedback) => { if (typeof reason === "string" && /^[A-Z_]{1,80}$/u.test(reason)) {
            structuralErrors.add(reason);
            if (fresh && rejectionDetails.length < 8) rejectionDetails.push({ reason, feedback });
          } }, fresh ? { previewFieldEvidence: p.evidenceForFields } : undefined);
      } });
    return { report: { status: "human-review-required", qualified: false, approved: false,
      productionEnabled: false, emailRequests: 0, liveResearchRequests: 0, model: result.model,
      modelRequests: 1, requestSha256: result.requestSha256, responseSha256: result.responseSha256 },
    ...(fresh ? { evidenceForFields: result.editorialPayload.evidenceForFields } : {}),
    draft: result.editorialPayload.stories[0], html: renderHumanReview(result.editorialPayload.stories[0], dossier, { fresh }) };
  } catch (error) {
    return { report: { status: "failed", qualified: false, approved: false, productionEnabled: false,
      emailRequests: 0, liveResearchRequests: 0, model: GEMINI_LITE_MODEL,
      code: /^GEMINI_[A-Z_]+$/u.test(error?.code ?? "") ? error.code : "GEMINI_PREVIEW_FAILED",
      ...geminiFailureDiagnostic(error), structuralErrors: [...structuralErrors] }, html: null,
      ...(fresh && rejectedPayload ? { rejectedDiagnostic: { unapproved: true, payload: rejectedPayload, rejectionDetails } } : {}) };
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
