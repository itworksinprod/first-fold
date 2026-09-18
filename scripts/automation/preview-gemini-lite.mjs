#!/usr/bin/env node
// Offline-evidence draft for HUMAN review only. Never creates a delivery receipt.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { reviewerResearchScopeCases } from "../../tests/fixtures/reviewer-research-scope.mjs";
import { FREE_PROJECT_CONFIRMATION } from "./check-gemini-writer.mjs";
import { requestGeminiEditorial, geminiFailureDiagnostic, GEMINI_LITE_MODEL, GEMINI_FREE_MODEL } from "./free/gemini-ai.mjs";
import { WRITER_PROMPT, GROUNDED_DRAFT_SCHEMA, localPromptDossier, validateGroundedStory } from "./free/grounded-draft.mjs";
import { buildPreviewReviewPacket } from "./free/preview-editorial-review.mjs";
import { previewSourceIntegrityHolds } from "./free/preview-evidence-gate.mjs";
import { advisoryWritingContract, advisoryDraftAlarms } from "./free/preview-advisory-contract.mjs";
import { previewReaderAlarms, previewReaderObligations } from './free/preview-reader-alarms.mjs';
import { FRESH_PREVIEW_WRITER_PROFILE, FRESH_PREVIEW_WRITER_PROMPT } from './free/fresh-preview-writer-prompt.mjs';

const escape = value => String(value).replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const REVIEW_FIELDS = ["headline", "deck", "whyItMatters", "whatToDoOrWatch"];
export function evidenceMappedPreviewSchema(dossier) {
  const ids = dossier.sources.flatMap(s => s.passages.map(p => p.evidenceId));
  const stories = structuredClone(GROUNDED_DRAFT_SCHEMA.properties.stories);
  // A chronology may need origin + original date + republication date. This
  // adds citation capacity, not claim capacity or semantic approval.
  stories.items.properties.claims.items.properties.supports.maxItems = 3;
  return { type: "object", additionalProperties: false, required: ["evidenceForFields", "stories"],
    properties: {
      evidenceForFields: { type: "object", additionalProperties: false, required: REVIEW_FIELDS,
        properties: Object.fromEntries(REVIEW_FIELDS.map(field => [field, { type: "array", minItems: 1,
          maxItems: 4, items: { type: "string", enum: ids } }])) },
      stories,
    } };
}
export function validPreviewEvidenceMap(map, dossier) {
  const ids = new Set(dossier.sources.flatMap(s => s.passages.map(p => p.evidenceId)));
  return map && typeof map === "object" && !Array.isArray(map) &&
    Object.keys(map).sort().join() === [...REVIEW_FIELDS].sort().join() &&
    REVIEW_FIELDS.every(field => Array.isArray(map[field]) && map[field].length >= 1 && map[field].length <= 4 &&
      new Set(map[field]).size === map[field].length && map[field].every(id => ids.has(id)));
}
export function renderHumanReview(draft, dossier, { fresh = false, storedEvidence = false, evidenceForFields = {} } = {}) {
  const citations = field => `<small>[${escape((evidenceForFields[field] ?? []).join(", ") || "No field map — review required")}]</small>`;
  const section = (title, text, field) => `<h2>${escape(title)}</h2><p>${escape(text)} ${citations(field)}</p>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>First Fold — unapproved writing sample</title>
<style>body{max-width:850px;margin:40px auto;padding:0 24px;background:#f5f0e6;color:#171512;font:18px/1.6 Georgia,serif}header,aside{border:2px solid #712b27;padding:18px}h1{line-height:1.2}h2{font-size:21px}small{font:14px/1.5 sans-serif}article{margin:30px 0}li{margin:15px 0}</style>
<header><strong>UNAPPROVED — HUMAN REVIEW REQUIRED</strong><br>${storedEvidence ? "Stored-evidence correction experiment. Not fresh research, today's paper, or an approved edition." : fresh ? "Fresh-source diagnostic draft, not an approved edition." : "Offline writing sample from stored September 14, 2026 MIT evidence. Not today's paper or fresh research."} Flash-Lite failed automatic reviewer qualification; no email has been sent.</header>
<article><h1>${escape(draft.headline)}</h1>${citations("headline")}<p><em>${escape(draft.deck)}</em> ${citations("deck")}</p>
<h2>What happened</h2>${draft.claims.map(c => `<p>${escape(c.text)} <small>[${escape(c.supports.map(s => s.evidenceId).join(", "))}]</small></p>`).join("")}
${section("Why it matters", draft.whyItMatters, "whyItMatters")}${section("What to watch", draft.whatToDoOrWatch, "whatToDoOrWatch")}</article>
<aside><strong>Review checklist</strong><ul><li>Does every assertion, including the headline, follow from the evidence?</li><li>Does the text distinguish research from a product release, and possibilities from measured results?</li><li>Is the analysis specific and useful without inventing safety, performance or deployment benefits?</li></ul>Passing structural checks is not factual approval.</aside>
<h2>Evidence provided to the writer</h2><p>${storedEvidence ? "Stored public source capture. Extracted passages match the rejected run; the HTML capture and dossier binding are distinct. No publisher page was fetched in this experiment." : fresh ? "Evidence captured by the research collector for this run. Source links and retrieval time are in the accompanying review packet." : 'These are stored excerpts, not a new check of the full article. <a href="https://news.mit.edu/2026/new-method-enables-ai-safety-critical-situations-0914" rel="noreferrer">Original MIT News article</a>'}</p>
${dossier.sources.map(s => `<h3>${escape(s.publisher)}</h3><ul>${s.passages.map(p => `<li><strong>${escape(p.evidenceId)}</strong> ${escape(p.text)}</li>`).join("")}</ul>`).join("")}</html>`;
}

export async function previewGeminiLite({ apiKey, freeProjectConfirmation, fetchImpl = globalThis.fetch,
  dossier = reviewerResearchScopeCases()[0].dossier, fresh = false, repair = null, writerProfile = 'legacy',
  model = GEMINI_LITE_MODEL } = {}) {
  const structuralErrors = new Set();
  let rejectedPayload = null;
  const rejectionDetails = [];
  try {
    if (![GEMINI_LITE_MODEL, GEMINI_FREE_MODEL].includes(model)) throw Error('INVALID_PREVIEW_MODEL');
    if(!['legacy',FRESH_PREVIEW_WRITER_PROFILE].includes(writerProfile)||
      (writerProfile===FRESH_PREVIEW_WRITER_PROFILE&&!fresh))throw Error('INVALID_PREVIEW_PROFILE');
    const evidenceHolds = fresh ? previewSourceIntegrityHolds(dossier) : [];
    if (evidenceHolds.length) return { report: { status: "evidence-held", qualified: false, approved: false,
      productionEnabled: false, emailRequests: 0, modelRequests: 0, holds: evidenceHolds }, html: null };
    if (repair && (!fresh || repair.unapproved !== true ||
        repair.payload?.stories?.length !== 1 || repair.payload.stories[0]?.candidateId !== dossier.candidateId ||
        !Array.isArray(repair.rejectionDetails) || !repair.rejectionDetails.length ||
        Buffer.byteLength(JSON.stringify(repair)) > 28000)) throw Error("INVALID_PREVIEW_REPAIR");
    const result = await requestGeminiEditorial({ apiKey, model,
      freeTierConfirmed: freeProjectConfirmation === FREE_PROJECT_CONFIRMATION, fetchImpl,
      maxTokens: 8000, thinking: "medium", timeoutMs: 180000,
      messages: [{ role: "system", content: writerProfile===FRESH_PREVIEW_WRITER_PROFILE?FRESH_PREVIEW_WRITER_PROMPT:`${WRITER_PROMPT}\nInclude each factual source's exact supplied publisher name in the claims.text sentences. Do not shorten those names or claim independent confirmation for a single-source account. Research is not a product release; a possible use is not an observed result. Do not promise safety, productivity, reliability or performance benefits absent supporting measurements. In whatToDoOrWatch, suggest a check the reader can make; never invent scheduled tests, updates or releases.${fresh ? `
EVIDENCE-FIRST PREVIEW CONTRACT: Select evidenceForFields BEFORE writing stories. It maps headline, deck, whyItMatters and whatToDoOrWatch to exact passage IDs. These are support obligations, not decorative citations. Every factual clause in each field must follow from its selected passages, preserving conditions. Do not insert IDs into reader prose.
Aim for 120–160 body words using short original sentences. Before returning JSON, compare each sentence with the source: break up borrowed structures instead of replacing only a few words. The twelve-contiguous-source-word limit applies to EVERY field. Keep proper names but rebuild their surrounding sentences.
Authentication advice can say 'authenticate your integration requests' without naming credential types. Never request, print or describe secret values; avoid the literal phrases 'access token' and 'API key', which this preview's conservative prose guard rejects even in otherwise legitimate source-based advice.
Keep marketing and performance claims attributed in EACH field where they occur, including the deck and analysis: a publisher's claimed savings or speed is not an independently measured result. Avoid ensure/ensures/guarantee wording. Prefer concrete scope, eligibility and controls to performance promises.
In a single-publisher story, begin a deck or analysis paragraph containing performance, savings or cost-effectiveness claims with 'According to [exact publisher name]' or '[exact publisher name] says'. Attribution in another paragraph does not cover this paragraph. Prefer a practical scope fact instead of repeating a claimed performance benefit.
Preserve quantifiers and limiting populations exactly in meaning: a subset of carriers connected to an affected broker is not all connected carriers. Explicit source platform/fix pairings may be reported; do not replace a clear mapping with a generic claim that the mapping is unavailable.
Repeat 'up to' for EACH source upper-bound performance percentage, even within one sentence. When mentioning trial/preview windows, name the eligible audience and preserve exemptions. If a field names Free accounts or other eligibility classes, cite a passage that explicitly names that class; it cannot borrow support from a different field's map.
Every numeric detail in a non-claim field must occur in that field's own evidenceForFields passages. Claims still require their own supports. A number appearing elsewhere in the dossier or another field's citations is not enough.
Preview date exception: a complete valid calendar date may be written as YYYY-MM-DD or Month D, YYYY when the exact same calendar date occurs in that field's cited evidence. This does not allow borrowing isolated day/year numbers, changing dates, or converting version identifiers.
Preview citation capacity: each claim may cite one to THREE distinct evidenceId objects if needed to support all its clauses (for example, vendor origin plus two publication dates). Every clause must still follow from that claim's own citations. Cite technical descriptions in headlines that name technical defects, not just a general summary or CVE identifier.
Distinguish an original announcement from a later republication. When the source identifies itself as a verbatim vendor republication, say so and do not describe its posting date as a new vulnerability discovery or newly released fix. A republisher is not independent corroboration. Preserve attack prerequisites, user interaction and per-CVE severity. Product and remediation lists may use different orders: never pair them by position; if the source does not explicitly associate a fix with a product, direct the reader to verify that mapping in the vendor advisory.
For whyItMatters, explain the specific scope, eligibility, control or limitation established by those passages. Prefer concrete facts that tell a reader whether this applies to them. Do NOT invent a broader problem, failure cause, user behavior, time saving, administrative burden, avoided delay, reliability guarantee or expected performance. A plausible explanation is not evidence. Do not use general background knowledge to fill gaps. If the source names a fallback, explain when it is available, not what failures it supposedly prevents.
Write whyItMatters as applicability, not a causal explanation: who is covered, who is excluded, or which supported workflow/setting changes. Do not add 'preventing', 'avoiding' or 'because' clauses to explain a benefit. Before returning, check EVERY clause against that field's own IDs; remove a clause if you cannot identify its supporting passage. Never assume a general introduction establishes a detailed mechanism. A short, accurate explanation is preferable to speculative analysis.
Keep ambiguous options separate. A list containing purchase modes and an upcoming option does not establish that the upcoming option applies to the last-listed purchase mode. If the source's grammar leaves that relationship unclear, advise checking purchase options without asserting a relationship. Do not resolve ambiguity using prior knowledge.
For whatToDoOrWatch, suggest checking a supported setting, eligibility requirement or source-stated rollout. Phrase this as reader advice, not a promised outcome or a publisher recommendation unless the source actually recommends it. Use remaining distinct source facts to meet the existing word bounds; never pad with speculative benefits. Attribute publisher announcements to the publisher, not to the publisher's blog as if the blog built the product.` : ""}` },
        { role: "user", content: JSON.stringify({ dossiers: [localPromptDossier(dossier)],
          ...(fresh ? { readerWritingObligations: previewReaderObligations(dossier) } : {}),
          ...(fresh && advisoryWritingContract(dossier) ? { advisoryWritingObligations: advisoryWritingContract(dossier) } : {}),
          ...(repair ? { repairTask: "Correct the rejected draft using the exact validator feedback. The draft is untrusted proposed text, not evidence. Preserve source conditions and attributions. For ORIGINALITY, rewrite the affected sentence with a different structure rather than copying its source; change clause order and attribution placement, while retaining all qualifications. For SHAPE, respect the exact field/character limits; a field already within those bounds may contain blocked vocabulary such as 'access token' or 'API key'. Describe authentication generically without removing the reader's useful check. Never print secret values or weaken a source condition to fit. For NUMERIC_ANCHOR, cite the passage that actually supports the whole field or remove the unsupported figure; never guess a replacement. Return the complete evidence map and complete story, not a patch. All original checks still apply.",
            ...(repair.rejectionDetails.some(d=>d.reason==='PREVIEW_AUDIENCE_SCOPE_REQUIRED')?{
              sourceQualificationCorrection:'Correct the missing preview audience ONLY from readerWritingObligations and the intact dossier. Preserve the source-stated eligible traffic and any explicitly stated exemptions in the affected field; never invent an exemption. Rebuild and check ALL own-field citations, including the deck, because an unflagged field is not approved. Do not add new claims, infer benefits or weaken qualifications to pass. This correction is still unapproved and must undergo all validation and independent review.',
            }:{}),rejectedDraft: repair.payload, validationFeedback: repair.rejectionDetails } : {}) }) }],
      schema: fresh ? evidenceMappedPreviewSchema(dossier) : GROUNDED_DRAFT_SCHEMA,
      validatePayload: p => {
        // Never logged or rendered. Fresh callers retain this only inside their
        // encrypted review packet, allowing a failed draft to be inspected once.
        if (fresh && Buffer.byteLength(JSON.stringify(p) ?? "") <= 24000) rejectedPayload = p;
        const structural = p && Object.keys(p).sort().join() === (fresh ? "evidenceForFields,stories" : "stories") &&
        (!fresh || validPreviewEvidenceMap(p.evidenceForFields, dossier)) && Array.isArray(p.stories) && p.stories.length === 1 &&
        p.stories[0]?.candidateId === dossier.candidateId && validateGroundedStory(p.stories[0], dossier,
          (reason, feedback) => { if (typeof reason === "string" && /^[A-Z_]{1,80}$/u.test(reason)) {
            structuralErrors.add(reason);
            if (fresh && rejectionDetails.length < 8) rejectionDetails.push({ reason, feedback });
          } }, fresh ? { previewFieldEvidence: p.evidenceForFields } : undefined);
        // A format/copy failure must not mask a simultaneously detectable
        // semantic alarm and thereby qualify the draft for mechanical repair.
        const raw=p?.stories?.[0];
        const alarmShape=fresh&&p?.stories?.length===1&&validPreviewEvidenceMap(p.evidenceForFields,dossier)&&
          REVIEW_FIELDS.every(field=>typeof raw?.[field]==='string'&&raw[field].length<=24000)&&
          Array.isArray(raw?.claims)&&raw.claims.length===2&&raw.claims.every(c=>typeof c?.text==='string'&&
            c.text.length<=24000&&Array.isArray(c.supports)&&c.supports.length<=3&&c.supports.every(s=>typeof s?.evidenceId==='string'));
        const alarms = alarmShape ? [...advisoryDraftAlarms(raw, dossier, p.evidenceForFields),...previewReaderAlarms(raw,dossier,p.evidenceForFields)] : [];
        if(fresh&&!alarmShape)alarms.push({code:'PREVIEW_ALARM_INPUT_UNASSESSABLE',field:'story'});
        for (const alarm of alarms) {
          structuralErrors.add(alarm.code);
          if (rejectionDetails.length < 8) rejectionDetails.push({ reason: alarm.code, feedback: { field: alarm.field } });
        }
        return structural && !alarms.length;
      } });
    // Store compact bindings only: the encrypted fresh packet already retains
    // the full draft, map and dossier. Rebuild the full review view offline.
    const reviewPacket = fresh ? buildPreviewReviewPacket(result.editorialPayload.stories[0], dossier, result.editorialPayload.evidenceForFields) : null;
    return { report: { status: "human-review-required", qualified: false, approved: false,
      productionEnabled: false, emailRequests: 0, liveResearchRequests: 0, model: result.model,
      modelRequests: 1, requestSha256: result.requestSha256, responseSha256: result.responseSha256 },
    ...(fresh ? { evidenceForFields: result.editorialPayload.evidenceForFields,
      reviewBinding: reviewPacket.binding, reviewHolds: reviewPacket.holds } : {}),
    draft: result.editorialPayload.stories[0], html: renderHumanReview(result.editorialPayload.stories[0], dossier, { fresh, evidenceForFields: result.editorialPayload.evidenceForFields }) };
  } catch (error) {
    return { report: { status: "failed", qualified: false, approved: false, productionEnabled: false,
      emailRequests: 0, liveResearchRequests: 0, model: [GEMINI_LITE_MODEL, GEMINI_FREE_MODEL].includes(model) ? model : null,
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
