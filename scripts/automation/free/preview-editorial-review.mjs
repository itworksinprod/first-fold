// Explicit reviewer evidence trail for a PRIVATE PREVIEW, never a delivery
// authorization. Hashes detect stale records; they do not authenticate reviewers
// or establish entailment. Review records remain trusted manual inputs.
import { createHash } from "node:crypto";
import { validateGroundedStory } from "./grounded-draft.mjs";
import { previewSourceIntegrityHolds } from "./preview-evidence-gate.mjs";

const FIELDS = ["headline", "deck", "whyItMatters", "whatToDoOrWatch"];
const hash = value => createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex");
const nonempty = x => typeof x === "string" && x.trim().length > 0;
const escape = x => String(x).replace(/[&<>"']/gu, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
export function renderPreviewStory(d) {
  return `<h1>${escape(d.headline)}</h1><p><em>${escape(d.deck)}</em></p><h2>What happened</h2>${d.claims.map(c => `<p>${escape(c.text)}</p>`).join("")}
<h2>Why it matters</h2><p>${escape(d.whyItMatters)}</p><h2>What to watch</h2><p>${escape(d.whatToDoOrWatch)}</p>`;
}

export function buildPreviewReviewPacket(draft, dossier, evidenceForFields) {
  const errors = [];
  const structural = validateGroundedStory(draft, dossier, reason => errors.push(reason), { previewFieldEvidence: evidenceForFields });
  const holds = [...previewSourceIntegrityHolds(dossier)];
  if (!structural) holds.push("STRUCTURAL_VALIDATION_FAILED");
  const units = [
    ...FIELDS.map(field => ({ field, text: draft?.[field], evidenceIds: evidenceForFields?.[field] })),
    ...(draft?.claims ?? []).map((claim, i) => ({ field: `claims.${i}`, text: claim.text, evidenceIds: claim.supports?.map(s => s.evidenceId) })),
  ].map(unit => ({ ...unit, passages: (unit.evidenceIds ?? []).map(id => {
    for (const source of dossier.sources) {
      const passage = source.passages.find(p => p.evidenceId === id);
      if (passage) return { evidenceId: id, publisher: source.publisher, text: passage.text };
    }
    return { evidenceId: id, missing: true };
  }) }));
  // Known overstatement alarm only. Absence does not imply semantic support.
  if (units.some(u => /\bensures\b|\bprevents connection hurdles\b/iu.test(u.text ?? ""))) holds.push("CERTAINTY_REVIEW_REQUIRED");
  return {
    version: "preview-field-review-v1", purpose: "private-preview-not-delivery",
    binding: { draftSha256: hash(draft), dossierSha256: hash(dossier), evidenceMapSha256: hash(evidenceForFields), renderedStorySha256: hash(renderPreviewStory(draft)) },
    holds: [...new Set(holds)], structuralErrors: errors,
    draft: structuredClone(draft), dossier: structuredClone(dossier), evidenceForFields: structuredClone(evidenceForFields),
    units, fullContext: structuredClone(dossier.sources),
  };
}

export function checkPreviewReview(packet, review) {
  const reasons = [];
  // Rebuild from bound inputs; do not trust supplied units, holds or context.
  let rebuilt;
  try { rebuilt = buildPreviewReviewPacket(packet.draft, packet.dossier, packet.evidenceForFields); }
  catch { return { readyForPrivatePreview: false, humanApproved: false, deliveryAuthorized: false, reasons: ["INVALID_PACKET"] }; }
  if (hash(rebuilt) !== hash(packet)) reasons.push("PACKET_CHANGED");
  reasons.push(...rebuilt.holds);
  if (review?.version !== rebuilt.version || hash(review?.binding) !== hash(rebuilt.binding)) reasons.push("STALE_OR_MISSING_REVIEW");
  if (review?.reviewer?.kind !== "independent-ai" || !nonempty(review?.reviewer?.name) || !nonempty(review?.reviewer?.reference)) reasons.push("REVIEWER_NOT_IDENTIFIED");
  if (!nonempty(review?.reviewedAt) || !Number.isFinite(Date.parse(review.reviewedAt))) reasons.push("REVIEW_TIME_MISSING");
  if (!Array.isArray(review?.limitations) || !review.limitations.length || !review.limitations.every(nonempty)) reasons.push("LIMITATIONS_MISSING");
  if (review?.fullContextChecked !== true || review?.renderedContentChecked !== true) reasons.push("CONTEXT_OR_RENDER_NOT_REVIEWED");
  const decisions = Array.isArray(review?.fields) ? review.fields.filter(d => d && typeof d === "object") : [];
  if (decisions.length !== rebuilt.units.length || new Set(decisions.map(d => d.field)).size !== rebuilt.units.length) reasons.push("INCOMPLETE_FIELD_REVIEW");
  for (const unit of rebuilt.units) {
    const decision = decisions?.find(d => d.field === unit.field);
    if (!decision || decision.supportedByMappedPassages !== true || decision.conditionsPreserved !== true ||
        decision.noUnsupportedInference !== true || !nonempty(decision.rationale)) reasons.push(`FIELD_NOT_APPROVED:${unit.field}`);
  }
  return { readyForPrivatePreview: reasons.length === 0, humanApproved: false, deliveryAuthorized: false, reasons: [...new Set(reasons)] };
}

// The sole reviewed renderer checks the exact review record again; no model or
// rewrite occurs after review. Raw preview rendering stays explicitly unapproved.
export function renderReviewedPreview(packet, review) {
  const status = checkPreviewReview(packet, review);
  if (!status.readyForPrivatePreview) throw Error(`PREVIEW_REVIEW_HELD:${status.reasons.join(",")}`);
  const d = packet.draft;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>First Fold — independently reviewed private preview</title><style>body{max-width:780px;margin:40px auto;padding:0 24px;background:#f5f0e6;color:#171512;font:18px/1.6 Georgia,serif}header,aside{border:1px solid #712b27;padding:16px}h1{line-height:1.2}small{font:14px sans-serif}</style>
<header>Private preview · independently AI-reviewed · not human-approved<br>No email sent. Not qualified for unattended delivery. One story; other desks are not covered.</header>
${renderPreviewStory(d)}
<aside><strong>Review limitations</strong><ul>${review.limitations.map(l => `<li>${escape(l)}</li>`).join("")}</ul></aside>
<h2>Field-by-field evidence trail</h2>${packet.units.map(u => `<h3>${escape(u.field)}</h3><p>${escape(u.text)}</p><ul>${u.passages.map(p => `<li>${escape(p.evidenceId)} · ${escape(p.publisher)}: ${escape(p.text)}</li>`).join("")}</ul>`).join("")}
<h2>Complete captured context</h2>${packet.fullContext.map(s => `<h3>${escape(s.publisher)}</h3><p>Source publication: ${escape(s.publishedAt ?? "not recorded")}</p>${s.passages.map(p => `<p>${escape(p.evidenceId)}: ${escape(p.text)}</p>`).join("")}${s.text !== s.passages.map(p => p.text).join("\n") ? `<h4>Full captured source text (including context outside mapped passages)</h4><p>${escape(s.text)}</p>` : ""}`).join("")}</html>`;
}
