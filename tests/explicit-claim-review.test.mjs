import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildExplicitClaimReview, validateExplicitClaimReview, EXPLICIT_CLAIM_REVIEW_PROFILE,
  LEGACY_CLAIM_REVIEW_PROFILE } from "../scripts/automation/free/explicit-claim-review.mjs";
import { groundedDossiers, synthesizeGroundedEditorial } from "../scripts/automation/free/grounded-draft.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, EXPERIMENTAL_FREE_WRITER_MODEL } from "../scripts/automation/free/workers-ai.mjs";
import { groundedDraft, groundedEvidence } from "./fixtures/grounded-summary.mjs";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const candidate = { candidateId: groundedDraft.candidateId, suggestedDesk: "security-and-privacy",
  ranking: { evidenceTier: "authoritative-single" }, feedEvidence: [groundedEvidence],
  sources: [{ id: "cert-advisory", title: groundedEvidence.title, publisher: "CERT/CC",
    relationship: "originating", publishedAt: groundedEvidence.publishedAt }] };
const inputs = () => ({ drafts: [structuredClone(groundedDraft)], dossiers: groundedDossiers([candidate]) });
const flags = { factsSupported: true, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true };
const explicitPayload = data => ({ reviews: data.drafts.map(({ draft, draftSha256, claimEvidence }) => ({
  candidateId: draft.candidateId, draftSha256,
  claimVerdicts: claimEvidence.map(({ claimIndex, claimSha256 }) => ({ claimIndex, claimSha256, allCitedPassagesSupport: true })),
  ...flags,
})) });
const legacyPayload = data => ({ reviews: data.drafts.map(({ draft, draftSha256 }) => ({
  candidateId: draft.candidateId, draftSha256,
  claimSupport: draft.claims.map(claim => claim.supports.map(support => support.evidenceId)), ...flags,
})) });

test("explicit review binds exact drafts, paired citations and complete untrusted source context without putting evidence in instructions", () => {
  const input = inputs();
  input.dossiers[0].sources[0].text += " UNTRUSTED_SOURCE_CONTEXT_MARKER";
  const bundle = buildExplicitClaimReview(input);
  assert.equal(Object.isFrozen(bundle), true);
  assert.equal(Object.isFrozen(bundle.bindings[0].claims[0]), true);
  assert.ok(!bundle.prompt.includes("UNTRUSTED_SOURCE_CONTEXT_MARKER"));
  assert.ok(JSON.stringify(bundle.data).includes("UNTRUSTED_SOURCE_CONTEXT_MARKER"));
  assert.equal(bundle.data.drafts[0].draftSha256, hash(groundedDraft));
  for (const [index, paired] of bundle.data.drafts[0].claimEvidence.entries()) {
    assert.equal(paired.claimIndex, index);
    assert.equal(paired.claimText, groundedDraft.claims[index].text);
    assert.deepEqual(paired.citations.map(citation => citation.evidenceId),
      groundedDraft.claims[index].supports.map(support => support.evidenceId));
    for (const citation of paired.citations) {
      const source = input.dossiers[0].sources.find(item => item.sourceId === citation.sourceId);
      assert.equal(citation.text, source.passages.find(passage => passage.evidenceId === citation.evidenceId).text);
      assert.equal(citation.sourceContextSha256, hash(source.text));
    }
  }
  assert.throws(() => { bundle.bindings[0].claims[0].supportIds.push("S9P9"); }, TypeError);
  const verdict = validateExplicitClaimReview(explicitPayload(bundle.data), bundle);
  assert.deepEqual(verdict.errors, []);
  assert.deepEqual(verdict.reviews[0].claimSupport, groundedDraft.claims.map(claim => claim.supports.map(support => support.evidenceId)));
  assert.deepEqual(validateExplicitClaimReview(explicitPayload(bundle.data), structuredClone(bundle)).errors, ["EXPLICIT_REVIEW_BUNDLE"]);
});

test("candidate, claim, support, source context and publication-date changes invalidate old explicit bindings", () => {
  const original = buildExplicitClaimReview(inputs());
  const oldPayload = explicitPayload(original.data);
  const mutations = [
    input => { input.drafts[0].candidateId = "changed-candidate"; input.dossiers[0].candidateId = "changed-candidate"; },
    input => { input.drafts[0].claims[0].text += " Another condition applies."; },
    input => { input.drafts[0].claims.reverse(); },
    input => { input.drafts[0].claims[0].supports.reverse(); },
    input => { input.drafts[0].claims[0].supports[0].evidenceId = "S1P1"; },
    input => { input.dossiers[0].sources[0].text += " Additional prerequisite in full context."; },
    input => { input.dossiers[0].sources[0].passages[0].text += " Changed context."; },
    input => { input.dossiers[0].sources[0].publishedAt = "2026-08-21T08:00:00.000Z"; },
    input => { input.dossiers[0].sources[0].publisher = "Different publisher"; },
    input => { input.dossiers[0].evidenceTier = "corroborated"; },
  ];
  for (const mutate of mutations) {
    const input = inputs(); mutate(input);
    const changed = buildExplicitClaimReview(input);
    assert.notEqual(changed.bindings[0].claims[0].claimSha256, original.bindings[0].claims[0].claimSha256);
    const validation = validateExplicitClaimReview(oldPayload, changed);
    assert.ok(validation.errors.length > 0);
    assert.equal(validation.reviews.length, 0);
  }
});

test("false claim verdicts become empty support sets and whole-story false flags remain independent vetoes", () => {
  const bundle = buildExplicitClaimReview(inputs());
  const rejected = explicitPayload(bundle.data);
  rejected.reviews[0].claimVerdicts[0].allCitedPassagesSupport = false;
  const result = validateExplicitClaimReview(rejected, bundle);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.reviews[0].claimSupport[0], []);
  assert.deepEqual(result.reviews[0].claimSupport[1], ["S1P4", "S1P5"]);
  for (const field of Object.keys(flags)) {
    const payload = explicitPayload(bundle.data);
    payload.reviews[0][field] = false;
    const checked = validateExplicitClaimReview(payload, bundle);
    assert.deepEqual(checked.errors, []);
    assert.equal(checked.reviews[0][field], false);
    assert.deepEqual(checked.reviews[0].claimSupport, [["S1P2", "S1P3"], ["S1P4", "S1P5"]]);
  }
});

test("legacy payloads, malformed verdicts, duplicates and wrong hashes cannot use explicit canonicalization", () => {
  const bundle = buildExplicitClaimReview(inputs());
  assert.ok(validateExplicitClaimReview(legacyPayload(bundle.data), bundle).errors.length > 0);
  for (const mutate of [
    payload => { payload.reviews[0].candidateId = "unrequested"; },
    payload => { payload.reviews[0].draftSha256 = "0".repeat(64); },
    payload => { payload.reviews[0].claimVerdicts[0].claimSha256 = "0".repeat(64); },
    payload => { payload.reviews[0].claimVerdicts[0].allCitedPassagesSupport = "true"; },
    payload => { payload.reviews[0].claimVerdicts[0].claimIndex = 1; },
    payload => { payload.reviews[0].claimVerdicts[0].claimIndex = "0"; },
    payload => { payload.reviews[0].claimVerdicts[0].supportIds = ["S1P2"]; },
    payload => { payload.reviews[0].claimVerdicts.pop(); },
    payload => { payload.reviews[0].factsSupported = 1; },
    payload => { payload.reviews.push(payload.reviews[0]); },
    payload => { payload.reviews = []; },
    payload => { payload.extra = true; },
  ]) {
    const payload = explicitPayload(bundle.data); mutate(payload);
    const validation = validateExplicitClaimReview(payload, bundle);
    assert.ok(validation.errors.length > 0);
    assert.equal(validation.reviews.length, 0);
  }
  const reversed = explicitPayload(bundle.data);
  reversed.reviews[0].claimVerdicts.reverse();
  assert.deepEqual(validateExplicitClaimReview(reversed, bundle).reviews[0].claimSupport, [["S1P2", "S1P3"], ["S1P4", "S1P5"]]);
});

test("review construction fails closed for missing or oversized evidence rather than trimming source caveats", () => {
  for (const mutate of [
    input => { input.drafts = []; },
    input => { input.drafts[0].claims[0].supports = [{ evidenceId: "S99P99" }]; },
    input => { input.dossiers[0].sources[0].passages[0].evidenceId = "S1P2"; },
    input => { input.dossiers[0].sources[0].text = "x".repeat(5_801); },
    input => { input.drafts[0].claims[0].text = "x".repeat(481); },
    input => { input.drafts.push(structuredClone(input.drafts[0])); },
  ]) {
    const input = inputs(); mutate(input);
    assert.throws(() => buildExplicitClaimReview(input), error => error.code === "EXPLICIT_REVIEW_INPUT");
  }
  const input = inputs();
  const largeSource = sourceIndex => ({ sourceId: `synthetic-source-${sourceIndex}`, publisher: "Synthetic Publisher",
    publisherKey: `synthetic-${sourceIndex}`, relationship: "originating", text: "x".repeat(5_790),
    passages: [{ evidenceId: `S${sourceIndex}P1`, text: "x".repeat(5_790) }] });
  input.dossiers[0].sources = [largeSource(1), largeSource(2)];
  input.drafts[0].claims.forEach(claim => { claim.supports = [{ evidenceId: "S1P1" }, { evidenceId: "S2P1" }]; });
  input.drafts = Array.from({ length: 4 }, (_, index) => ({ ...structuredClone(input.drafts[0]), candidateId: `large-${index}` }));
  input.dossiers = input.drafts.map(draft => ({ ...structuredClone(input.dossiers[0]), candidateId: draft.candidateId }));
  assert.throws(() => buildExplicitClaimReview(input), error => error.code === "EXPLICIT_REVIEW_REQUEST_BOUND");
});

async function synthesisRun({ profile, reviewMode = "explicit", mutateReview = () => {} } = {}) {
  const editorial = { frontPage: { note: "Unaccepted synthetic baseline", estimatedMinutes: 1 }, desks: {
    "security-and-privacy": { story: { id: "story-fixture", headline: "Unaccepted baseline",
      sources: candidate.sources, selection: { score: 77 } } },
  } };
  const calls = [];
  const rawHashes = [];
  const result = await synthesizeGroundedEditorial({ editorial, candidates: [candidate],
    ...(profile === undefined ? {} : { reviewProfile: profile }), onDiagnostic: () => {},
    aiRequestImpl: async options => {
      calls.push(options);
      const data = JSON.parse(options.messages[1].content);
      let payload;
      if (calls.length === 1) payload = { foundations: [{ candidateId: groundedDraft.candidateId, claims: groundedDraft.claims }] };
      else if (calls.length === 2) payload = { copies: [{ candidateId: groundedDraft.candidateId,
        headline: groundedDraft.headline, deck: groundedDraft.deck,
        whyItMatters: groundedDraft.whyItMatters, whatToDoOrWatch: groundedDraft.whatToDoOrWatch }] };
      else {
        payload = reviewMode === "explicit" ? explicitPayload(data) : legacyPayload(data);
        mutateReview(payload);
      }
      const rawHash = hash({ nativeResponse: payload });
      rawHashes.push(rawHash);
      return { provider: "cloudflare-workers-ai", model: DEFAULT_CLOUDFLARE_AI_MODEL, responseId: "synthetic-response",
        editorialPayload: payload, requestSha256: "a".repeat(64), responseSha256: rawHash };
    } });
  return { result, calls, rawHashes };
}

test("the daily default remains legacy while explicit opt-in uses three bounded stages and preserves raw provider provenance", async () => {
  for (const profile of [undefined, LEGACY_CLAIM_REVIEW_PROFILE]) {
    const legacy = await synthesisRun({ profile, reviewMode: "legacy" });
    assert.ok(legacy.result);
    assert.ok(legacy.calls[2].schema.properties.reviews.items.properties.claimSupport);
    assert.equal(legacy.calls[2].schema.properties.reviews.items.properties.claimVerdicts, undefined);
  }
  const explicit = await synthesisRun({ profile: EXPLICIT_CLAIM_REVIEW_PROFILE });
  assert.ok(explicit.result);
  assert.deepEqual(explicit.calls.map(call => call.maxTokens), [2_000, 4_000, 1_800]);
  assert.ok(explicit.calls.every(call => call.model === DEFAULT_CLOUDFLARE_AI_MODEL && call.maxAttempts === 1));
  assert.ok(explicit.calls[2].schema.properties.reviews.items.properties.claimVerdicts);
  assert.equal(explicit.calls[2].schema.properties.reviews.items.properties.claimSupport, undefined);
  assert.equal(explicit.result.inference.responseSha256, hash(explicit.rawHashes));
  assert.equal(explicit.result.editorial.desks["security-and-privacy"].story.headline, groundedDraft.headline);
});

test("explicit opt-in still rejects claim/whole-story vetoes, malformed bindings and legacy replies without a fourth request", async () => {
  for (const mutateReview of [
    payload => { payload.reviews[0].claimVerdicts[0].allCitedPassagesSupport = false; },
    payload => { payload.reviews[0].analysisSupported = false; },
    payload => { payload.reviews[0].factsSupported = false; },
    payload => { payload.reviews[0].attributionAccurate = false; },
    payload => { payload.reviews[0].usefulAndSpecific = false; },
    payload => { payload.reviews[0].claimVerdicts[0].claimSha256 = "f".repeat(64); },
  ]) {
    const attempt = await synthesisRun({ profile: EXPLICIT_CLAIM_REVIEW_PROFILE, mutateReview });
    assert.equal(attempt.result, null);
    assert.equal(attempt.calls.length, 3);
  }
  const oldReply = await synthesisRun({ profile: EXPLICIT_CLAIM_REVIEW_PROFILE, reviewMode: "legacy" });
  assert.equal(oldReply.result, null);
  assert.equal(oldReply.calls.length, 3);
  let calls = 0;
  for (const settings of [{ reviewProfile: "unrecognized" },
    { reviewProfile: EXPLICIT_CLAIM_REVIEW_PROFILE, model: EXPERIMENTAL_FREE_WRITER_MODEL }]) {
    const result = await synthesizeGroundedEditorial({ editorial: {}, candidates: [candidate], ...settings,
      aiRequestImpl: async () => { calls++; } });
    assert.equal(result, null);
  }
  assert.equal(calls, 0);
});
