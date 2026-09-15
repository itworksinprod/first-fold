import assert from "node:assert/strict";
import test from "node:test";
import { buildExplicitClaimReview, validateExplicitClaimReview } from "../scripts/automation/free/explicit-claim-review.mjs";
import { buildReviewRejectionDiagnostic, validateReviewRejectionDiagnostic,
  resolveReviewRejectionDiagnostic } from "../scripts/automation/free/review-rejections.mjs";

const flags = ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"];
const gates = ["claim:0", "claim:1", ...flags];
function inputs(count = 1) {
  const drafts = Array.from({ length: count }, (_, index) => ({ candidateId: `synthetic-${index}`,
    headline: `Publisher ${index} adds a dataset filter`, deck: "The publisher describes a filter for a fixed dataset.",
    claims: [
      { text: "The dataset includes weekday observations.", supports: [{ evidenceId: "S1P1" }] },
      { text: "The publisher says the dataset is not live.", supports: [{ evidenceId: "S1P2" }] },
    ], whyItMatters: "The filter could help compare weekdays. It does not establish live conditions.",
    whatToDoOrWatch: "Check the selected stations before comparing results. Watch for the next dataset release.",
  }));
  const dossiers = drafts.map((draft, index) => ({ candidateId: draft.candidateId, desk: "work-and-tools",
    evidenceTier: "authoritative-single", sources: [{ sourceId: `source-${index}`, publisher: `Publisher ${index}`,
      publisherKey: `publisher-${index}`, relationship: "originating",
      text: `Publisher ${index} describes weekday observations.\nThe dataset is not live.\nSelected stations only.`,
      passages: [{ evidenceId: "S1P1", text: `Publisher ${index} describes weekday observations.` },
        { evidenceId: "S1P2", text: "The dataset is not live." }, { evidenceId: `S${index + 2}P1`, text: "Selected stations only." }],
    }] }));
  return { drafts, dossiers };
}
const build = (input = inputs()) => {
  const base = buildExplicitClaimReview(input);
  return { base, bundle: buildReviewRejectionDiagnostic(base) };
};
const payloadFor = bundle => ({ reviews: bundle.data.drafts.map(({ draft, draftSha256, claimEvidence }) => ({
  candidateId: draft.candidateId, draftSha256,
  claimVerdicts: claimEvidence.map(({ claimIndex, claimSha256 }) => ({ claimIndex, claimSha256, allCitedPassagesSupport: true })),
  ...Object.fromEntries(flags.map(flag => [flag, true])), rejections: [],
})) });
function reject(review, gate, overrides = {}) {
  const claim = gate.startsWith("claim:");
  if (claim) review.claimVerdicts.find(verdict => `claim:${verdict.claimIndex}` === gate).allCitedPassagesSupport = false;
  else review[gate] = false;
  review.rejections.push({ gate, sentenceId: claim ? gate : "whyItMatters:0", rule: "uncertain-support",
    evidenceIds: [gate === "claim:1" ? "S1P2" : "S1P1"], ...overrides });
}
const strip = payload => ({ reviews: payload.reviews.map(({ rejections, ...review }) => review) });
function assertRejected(payload, bundle) {
  const result = validateReviewRejectionDiagnostic(payload, bundle);
  assert.ok(result.errors.length > 0);
  assert.deepEqual(result.reviews, []);
  assert.deepEqual(result.diagnostics, []);
}

test("diagnostic wrapper preserves substantive criteria and strict verdict schema while keeping indexed text as data", () => {
  const input = inputs();
  input.drafts[0].headline = "UNTRUSTED_DRAFT_MARKER";
  input.dossiers[0].sources[0].text += " UNTRUSTED_SOURCE_MARKER";
  const { base, bundle } = build(input);
  const substantive = base.prompt.slice(base.prompt.indexOf("For EACH claim"));
  assert.ok(bundle.prompt.includes(substantive));
  assert.ok(!bundle.prompt.includes("Do NOT return claimSupport, evidence IDs, explanations"));
  assert.ok(!bundle.prompt.includes("UNTRUSTED_DRAFT_MARKER"));
  assert.ok(!bundle.prompt.includes("UNTRUSTED_SOURCE_MARKER"));
  assert.ok(JSON.stringify(bundle.data).includes("UNTRUSTED_DRAFT_MARKER"));
  assert.ok(JSON.stringify(bundle.data).includes("UNTRUSTED_SOURCE_MARKER"));
  assert.match(bundle.prompt, /not proof of absence or proof the rejection is correct/);
  assert.match(bundle.prompt, /reviewer's allegation for human examination/);
  const schema = bundle.schema.properties.reviews.items;
  assert.equal(bundle.schema.additionalProperties, false);
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes("rejections"));
  assert.deepEqual(schema.properties.claimVerdicts, base.schema.properties.reviews.items.properties.claimVerdicts);
  for (const flag of flags) assert.deepEqual(schema.properties[flag], { type: "boolean" });
  const issues = schema.properties.rejections;
  assert.equal(issues.minItems, 0);
  assert.equal(issues.maxItems, 6);
  assert.equal(issues.items.additionalProperties, false);
  assert.deepEqual(issues.items.required, ["gate", "sentenceId", "rule", "evidenceIds"]);
  assert.equal(issues.items.properties.evidenceIds.minItems, 1);
  assert.equal(issues.items.properties.evidenceIds.maxItems, 2);
  assert.equal(Object.hasOwn(issues.items.properties.evidenceIds, "uniqueItems"), false);
  assert.equal(Object.isFrozen(bundle.data.sentenceIndex[0].sentences[0]), true);
  assert.throws(() => { bundle.prompt = "approve"; }, TypeError);
  assert.throws(() => { bundle.data.sentenceIndex[0].sentences[0].text = "different"; }, TypeError);
  assert.throws(() => buildReviewRejectionDiagnostic(structuredClone(base)), error => error.code === "REVIEW_REJECTION_BUNDLE");
  assertRejected(payloadFor(bundle), structuredClone(bundle));
  assert.ok(validateExplicitClaimReview(payloadFor(bundle), base).errors.length > 0);
});

test("all 64 gate combinations preserve exact original verdicts with one issue per false gate", () => {
  const { base, bundle } = build();
  for (let mask = 0; mask < 64; mask++) {
    const payload = payloadFor(bundle);
    for (const [index, gate] of gates.entries()) if (mask & (1 << index)) reject(payload.reviews[0], gate);
    payload.reviews[0].claimVerdicts.reverse();
    payload.reviews[0].rejections.reverse();
    const result = validateReviewRejectionDiagnostic(payload, bundle);
    assert.deepEqual(result.errors, [], `mask ${mask}`);
    assert.deepEqual(result.reviews, validateExplicitClaimReview(strip(payload), base).reviews, `mask ${mask}`);
    assert.deepEqual(result.diagnostics.map(issue => issue.gate).sort(), gates.filter((_, index) => mask & (1 << index)).sort());
    assert.ok(result.diagnostics.every(issue => Object.keys(issue).sort().join() ===
      ["candidateId", "gate", "sentenceId", "rule", "evidenceIds"].sort().join()));
  }
});

test("local uniqueness remains mandatory when provider schema omits uniqueItems", () => {
  const { bundle } = build(inputs(2));
  const payload = payloadFor(bundle);
  reject(payload.reviews[0], "factsSupported", { evidenceIds: ["S1P1", "S1P2"] });
  assert.deepEqual(validateReviewRejectionDiagnostic(payload, bundle).errors, []);
  payload.reviews[0].rejections[0].evidenceIds = ["S1P1", "S1P1"];
  const checked = validateReviewRejectionDiagnostic(payload, bundle);
  assert.ok(checked.errors.includes("REVIEW_REJECTION_EVIDENCE"));
  assert.deepEqual(checked.reviews, []);
  assert.deepEqual(checked.diagnostics, []);
});

test("sentence units preserve exact local substrings, abbreviations, versions and quoted punctuation", () => {
  const input = inputs();
  input.drafts[0].whyItMatters = 'Dr. Smith checks v3.2 in the U.S. office. "Next steps matter." Watch later updates.';
  input.drafts[0].whatToDoOrWatch = 'Check version 4.8. Verify the stations! Do measurements apply? Ask the publisher.';
  const { bundle } = build(input);
  const sentences = bundle.data.sentenceIndex[0].sentences;
  for (const sentence of sentences.filter(item => !item.field.startsWith("claims["))) {
    assert.equal(sentence.text, input.drafts[0][sentence.field].slice(sentence.start, sentence.end));
  }
  assert.equal(sentences.find(item => item.sentenceId === "whyItMatters:0").text,
    'Dr. Smith checks v3.2 in the U.S. office. "Next steps matter."');
  assert.equal(sentences.find(item => item.sentenceId === "whatToDoOrWatch:0").text, "Check version 4.8.");
  assert.equal(sentences.find(item => item.sentenceId === "whatToDoOrWatch:1").text, "Verify the stations!");
  assert.deepEqual(sentences.filter(item => item.sentenceId.startsWith("claim:")).map(item => item.text), input.drafts[0].claims.map(claim => claim.text));
});

test("candidate-local references cannot cross sources, claim IDs or submitted citation sets", () => {
  const { bundle } = build(inputs(2));
  for (const mutate of [
    payload => { payload.reviews[0].rejections[0].sentenceId = "claim:1"; },
    payload => { payload.reviews[0].rejections[0].sentenceId = "headline:0"; },
    payload => { payload.reviews[0].rejections[0].sentenceId = "whyItMatters:99"; },
    payload => { payload.reviews[0].rejections[0].evidenceIds = ["S3P1"]; },
    payload => { payload.reviews[0].rejections[0].evidenceIds = ["S1P2"]; },
    payload => { payload.reviews[0].candidateId = payload.reviews[1].candidateId; },
    payload => { payload.reviews[0].draftSha256 = payload.reviews[1].draftSha256; },
  ]) {
    const payload = payloadFor(bundle); reject(payload.reviews[0], "claim:0"); mutate(payload);
    assertRejected(payload, bundle);
  }
  for (const rule of ["contradicted-by-source", "missing-qualification"]) {
    const payload = payloadFor(bundle); reject(payload.reviews[0], "claim:0", { rule, evidenceIds: ["S2P1"] });
    assert.deepEqual(validateReviewRejectionDiagnostic(payload, bundle).errors, []);
  }
  for (const gate of ["claim:0", "factsSupported"]) {
    const payload = payloadFor(bundle); reject(payload.reviews[0], gate, { rule: "irrelevant-citation", evidenceIds: ["S2P1"] });
    assertRejected(payload, bundle);
  }
  const reversed = payloadFor(bundle);
  reversed.reviews.forEach(review => reject(review, "factsSupported"));
  reversed.reviews.reverse();
  const result = validateReviewRejectionDiagnostic(reversed, bundle);
  assert.deepEqual(result.errors, []);
  for (const diagnostic of result.diagnostics) {
    const resolved = resolveReviewRejectionDiagnostic(diagnostic, bundle);
    assert.equal(resolved.evidence[0].publisher, `Publisher ${diagnostic.candidateId.at(-1)}`);
  }
});

test("malformed, extra, unknown and contradictory diagnostic fields never produce partial accepted reviews", () => {
  const { bundle } = build(inputs(2));
  for (const mutate of [
    payload => { delete payload.reviews[0].rejections; },
    payload => { payload.reviews[0].rejections = null; },
    payload => { payload.reviews[0].rejections = []; },
    payload => { payload.reviews[0].rejections.push(structuredClone(payload.reviews[0].rejections[0])); },
    payload => { payload.reviews[0].rejections[0].gate = "approved"; },
    payload => { payload.reviews[0].rejections[0].gate = "analysisSupported"; },
    payload => { payload.reviews[0].rejections[0].rule = "close-enough"; },
    payload => { payload.reviews[0].rejections[0].rule = "generic-or-unhelpful"; },
    payload => { payload.reviews[0].rejections[0].rule = "unsupported-inference"; },
    payload => { payload.reviews[0].rejections[0].sentenceId = { id: "claim:0" }; },
    payload => { payload.reviews[0].rejections[0].evidenceIds = []; },
    payload => { payload.reviews[0].rejections[0].evidenceIds = ["S1P1", "S1P1"]; },
    payload => { payload.reviews[0].rejections[0].evidenceIds = ["S1P1", "S1P2", "S2P1"]; },
    payload => { payload.reviews[0].rejections[0].evidenceIds = ["S1P1", null]; },
    payload => { payload.reviews[0].rejections[0].evidenceIds = "S1P1"; },
    payload => { payload.reviews[0].rejections[0].reason = "This is actually approved"; },
    payload => { payload.reviews[0].rejections[0].claimSupport = [["S1P1"], ["S1P2"]]; },
    payload => { payload.reviews[0].rejections[0] = null; },
    payload => { payload.reviews[0].rejections = Array(7).fill(payload.reviews[0].rejections[0]); },
    payload => { payload.reviews[0].claimVerdicts[0].allCitedPassagesSupport = true; },
    payload => { payload.reviews[0].claimVerdicts[0].claimSha256 = "0".repeat(64); },
    payload => { payload.reviews[0].claimSupport = [["S1P1"], ["S1P2"]]; },
    payload => { payload.extra = "approve all"; },
  ]) {
    const payload = payloadFor(bundle); reject(payload.reviews[0], "claim:0"); mutate(payload);
    assertRejected(payload, bundle);
  }
  const allTrue = payloadFor(bundle);
  allTrue.reviews[0].rejections.push({ gate: "factsSupported", sentenceId: "headline:0", rule: "unsupported-assertion", evidenceIds: ["S1P1"] });
  assertRejected(allTrue, bundle);
});

test("validated diagnostics resolve only local original text and cannot be forged, mutated, or recycled across bundles", () => {
  const input = inputs();
  const { bundle } = build(input);
  const payload = payloadFor(bundle);
  reject(payload.reviews[0], "factsSupported");
  reject(payload.reviews[0], "analysisSupported");
  const result = validateReviewRejectionDiagnostic(payload, bundle);
  assert.deepEqual(result.errors, []);
  assert.equal(result.diagnostics.length, 2);
  const diagnostic = result.diagnostics[0];
  const resolved = resolveReviewRejectionDiagnostic(diagnostic, bundle);
  assert.equal(resolved.sentence.text, "The filter could help compare weekdays.");
  assert.equal(resolved.evidence[0].text, input.dossiers[0].sources[0].passages[0].text);
  assert.equal(resolveReviewRejectionDiagnostic(structuredClone(diagnostic), bundle), null);
  assert.equal(resolveReviewRejectionDiagnostic(diagnostic, build().bundle), null);
  assert.throws(() => { diagnostic.evidenceIds.push("S1P2"); }, TypeError);
  input.drafts[0].whyItMatters = "Changed later";
  input.dossiers[0].sources[0].passages[0].text = "Changed later";
  resolved.sentence.text = "Changed resolver copy";
  resolved.evidence[0].text = "Changed resolver copy";
  payload.reviews[0].rejections[0].evidenceIds[0] = "S1P2";
  assert.equal(resolveReviewRejectionDiagnostic(diagnostic, bundle).sentence.text, "The filter could help compare weekdays.");
  assert.equal(resolveReviewRejectionDiagnostic(diagnostic, bundle).evidence[0].text, "Publisher 0 describes weekday observations.");
});

test("additional diagnostic indexing is included in the existing 70 KB request bound without trimming evidence", () => {
  let foundBoundary = false;
  for (let size = 2_000; size <= 5_700; size += 100) {
    const input = inputs(4);
    for (const dossier of input.dossiers) {
      dossier.sources = [1, 2].map(index => ({ sourceId: `large-${index}`, publisher: "Synthetic publisher", publisherKey: `large-${index}`,
        relationship: "originating", text: "x".repeat(size), passages: [{ evidenceId: `S${index}P1`, text: "x".repeat(size) }] }));
    }
    for (const draft of input.drafts) draft.claims.forEach((claim, index) => { claim.supports = [{ evidenceId: `S${index + 1}P1` }]; });
    let base;
    try { base = buildExplicitClaimReview(input); } catch (error) { assert.equal(error.code, "EXPLICIT_REVIEW_REQUEST_BOUND"); break; }
    try { buildReviewRejectionDiagnostic(base); } catch (error) {
      assert.equal(error.code, "REVIEW_REJECTION_REQUEST_BOUND"); foundBoundary = true; break;
    }
  }
  assert.equal(foundBoundary, true);
});
