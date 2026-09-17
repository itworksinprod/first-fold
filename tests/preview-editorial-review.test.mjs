import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPreviewReviewPacket, checkPreviewReview, renderReviewedPreview } from "../scripts/automation/free/preview-editorial-review.mjs";
import { previewSourceIntegrityHolds } from "../scripts/automation/free/preview-evidence-gate.mjs";
import { correctedGooglePreview } from "./fixtures/corrected-google-preview.mjs";
const run6 = JSON.parse(readFileSync(new URL("./fixtures/rejected-preview-run6.json", import.meta.url), "utf8"));
const packetFor = x => buildPreviewReviewPacket(x.draft, x.dossier, x.evidenceForFields);
// Synthetic positive records exercise the contract only, NOT editorial approval.
const testRecord = p => ({ version: p.version, binding: p.binding,
  reviewer: { kind: "independent-ai", name: "SYNTHETIC TEST ONLY", reference: "test-fixture" },
  reviewedAt: "2026-09-17T03:00:00Z", fullContextChecked: true, renderedContentChecked: true,
  limitations: ["Synthetic contract test, not a factual verdict."],
  fields: p.units.map(u => ({ field: u.field, supportedByMappedPassages: true, conditionsPreserved: true, noUnsupportedInference: true, rationale: "Synthetic contract control." })) });

test("exact run6 overstatement is preserved and cannot become a reviewed preview", () => {
  const p = packetFor(run6.records[0]);
  assert.match(p.draft.whyItMatters, /ensures participants.*prevents connection hurdles/s);
  assert.ok(p.holds.includes("CERTAINTY_REVIEW_REQUIRED"));
  assert.equal(checkPreviewReview(p, testRecord(p)).readyForPrivatePreview, false);
  assert.throws(() => renderReviewedPreview(p, testRecord(p)), /HELD/);
});
test("full damaged CISA packet is held; exact mapping and scope failures stay visible", () => {
  const p = packetFor(run6.records[1]);
  assert.ok(p.holds.includes("EVIDENCE_EXTRACTION_INCOMPLETE"));
  assert.ok(p.holds.includes("ADVISORY_STRUCTURE_REVIEW"));
  assert.match(p.dossier.sources[0].text, /To obtain and install the latest$/);
  assert.match(p.draft.whyItMatters, /proper configurations or patches are missing/);
  assert.match(JSON.stringify(p.draft), /worldwide|global/i);
  assert.deepEqual(p.evidenceForFields.headline, ["S1P1", "S1P3"]);
  assert.doesNotMatch(p.units.find(u => u.field === "headline").passages.map(p => p.text).join(" "), /has developed a patch/);
  assert.equal(checkPreviewReview(p, testRecord(p)).readyForPrivatePreview, false);
});
test("neighboring extraction damage is held, complete source controls remain usable", () => {
  for (const tail of ["To obtain and install the latest", "Download the latest", "Please update to version", "Update to V3"]) {
    assert.ok(previewSourceIntegrityHolds({ sources: [{ text: `Earlier text. ${tail}` }] }).includes("EVIDENCE_EXTRACTION_INCOMPLETE"));
  }
  assert.deepEqual(previewSourceIntegrityHolds({ sources: [{ text: "Download the latest release from the vendor's portal." }] }), []);
  assert.deepEqual(previewSourceIntegrityHolds(correctedGooglePreview().dossier), []);
});
test("every field has mapped passages, full context and immutable render bindings", () => {
  const p = packetFor(correctedGooglePreview());
  assert.deepEqual(p.holds, [], JSON.stringify(p));
  assert.equal(p.units.length, 6);
  assert.ok(p.units.every(u => u.passages.length && u.passages.every(p => p.text)));
  assert.equal(p.fullContext[0].passages.length, 13);
  const r = testRecord(p), status = checkPreviewReview(p, r);
  assert.equal(status.readyForPrivatePreview, true);
  assert.equal(status.humanApproved, false);
  assert.equal(status.deliveryAuthorized, false);
  assert.match(renderReviewedPreview(p, r), /independently AI-reviewed/);
  for (const mutate of [x => x.draft.headline += " changed", x => x.dossier.sources[0].text += " changed", x => x.evidenceForFields.deck = ["S1P1"], x => x.units[0].text += " changed", x => x.binding.renderedStorySha256 = "changed", x => x.holds.push("new")]) {
    const changed = structuredClone(p); mutate(changed);
    assert.equal(checkPreviewReview(changed, r).readyForPrivatePreview, false);
    assert.throws(() => renderReviewedPreview(changed, r));
  }
});
test("missing, partial, duplicate, malformed or negative review fails closed", () => {
  const p = packetFor(correctedGooglePreview());
  assert.equal(checkPreviewReview(p, null).readyForPrivatePreview, false);
  for (const mutate of [r => r.fields.pop(), r => r.fields[0] = r.fields[1], r => r.fields[0] = null,
    r => r.fields[0].supportedByMappedPassages = false, r => r.fields[1].conditionsPreserved = false,
    r => r.fields[2].noUnsupportedInference = false, r => r.fields[0].rationale = "",
    r => r.fullContextChecked = false, r => r.renderedContentChecked = false, r => r.limitations = [],
    r => r.reviewer.kind = "human", r => r.binding = null]) {
    const r = testRecord(p); mutate(r); assert.equal(checkPreviewReview(p, r).readyForPrivatePreview, false);
  }
});
test("a valid ID map cannot override a negative semantic reviewer decision", () => {
  const x = correctedGooglePreview(); x.evidenceForFields.deck = ["S1P2"];
  const p = packetFor(x), r = testRecord(p);
  assert.deepEqual(p.holds, []); // IDs/numeric checks are NOT entailment.
  r.fields.find(f => f.field === "deck").supportedByMappedPassages = false;
  r.fields.find(f => f.field === "deck").rationale = "S1P2 does not state the ultrasound limitation; S1P3 does.";
  assert.equal(checkPreviewReview(p, r).readyForPrivatePreview, false);
});
test("render retains full captured source context even outside mapped passages", () => {
  const x = correctedGooglePreview();
  x.dossier.sources[0].text += "\nExtra test prerequisite: administrator authorization remains required.";
  const p = packetFor(x), r = testRecord(p);
  const html = renderReviewedPreview(p, r);
  assert.match(html, /including context outside mapped passages/);
  assert.match(html, /Extra test prerequisite: administrator authorization remains required/);
  assert.match(html, /Source publication: 2026-09-15/);
});
