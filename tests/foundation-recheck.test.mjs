import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { synthesizeGroundedEditorial, EXPERIMENTAL_FOUNDATION_RECHECK } from "../scripts/automation/free/grounded-draft.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, EXPERIMENTAL_FREE_WRITER_MODEL, buildWorkersAiRequest } from "../scripts/automation/free/workers-ai.mjs";
import { EXPLICIT_CLAIM_REVIEW_PROFILE } from "../scripts/automation/free/explicit-claim-review.mjs";
import { groundedDraft, groundedEvidence, dailyCopyParts } from "./fixtures/grounded-summary.mjs";

const candidate = { candidateId: groundedDraft.candidateId, suggestedDesk: "security-and-privacy",
  ranking: { evidenceTier: "authoritative-single" }, feedEvidence: [groundedEvidence],
  sources: [{ id: "cert-advisory", title: groundedEvidence.title, publisher: "CERT/CC",
    relationship: "originating", publishedAt: groundedEvidence.publishedAt }] };
const baseline = { frontPage: { note: "fixture", estimatedMinutes: 1 }, desks: {
  "security-and-privacy": { story: { id: "s1", sources: candidate.sources, selection: { score: 77 } } },
} };
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const response = editorialPayload => ({ editorialPayload, provider: "cloudflare-workers-ai",
  model: DEFAULT_CLOUDFLARE_AI_MODEL, requestSha256: "a".repeat(64), responseSha256: "b".repeat(64) });
const finalCopy = () => ({ claimRepairs: groundedDraft.claims.map((claim, claimIndex) => ({
  candidateId: groundedDraft.candidateId, claimIndex, ...structuredClone(claim),
})), copies: [{ candidateId: groundedDraft.candidateId, headline: groundedDraft.headline, deck: groundedDraft.deck,
  whyItMatters: dailyCopyParts(groundedDraft.whyItMatters), whatToDoOrWatch: dailyCopyParts(groundedDraft.whatToDoOrWatch) }] });
const checked = data => ({ reviews: data.drafts.map(({ draft, draftSha256 }) => {
  assert.equal(draftSha256, hash(draft));
  return { candidateId: draft.candidateId, draftSha256,
    claimSupport: draft.claims.map(claim => claim.supports.map(support => support.evidenceId)),
    factsSupported: true, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true };
}) });
test("one experimental originality rewrite preserves citations and the 7800 ceiling", async () => {
  for (const outcome of ["pass", "copied", "citation-change", "review-veto", "provider-error"]) {
    const tokens = [], events = [];
    const copied = groundedEvidence.summary.split(". ")[0];
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      accountId: "0".repeat(32), apiToken: "fixture", compositionProfile: EXPERIMENTAL_FOUNDATION_RECHECK,
      reviewProfile: EXPLICIT_CLAIM_REVIEW_PROFILE, originalityRepair: true,
      onDiagnostic: event => events.push(event), aiRequestImpl: async options => {
        tokens.push(options.maxTokens);
        const data = JSON.parse(options.messages[1].content);
        if (tokens.length === 1) return response({ foundations: [{ candidateId: groundedDraft.candidateId, claims: groundedDraft.claims }] });
        if (tokens.length === 2) { const value = finalCopy(); value.copies[0].deck = copied; return response(value); }
        if (tokens.length === 3) {
          assert.equal(data.draftToRewrite.deck, copied);
          assert.ok(data.copiedSpans.some(span => span.field === "deck" && span.copiedText.split(" ").length === 12));
          assert.ok(data.dossiers[0].sources[0].passages.length);
          if (outcome === "provider-error") throw new Error("fixture provider refusal");
          const repaired = structuredClone(groundedDraft);
          if (outcome === "copied") repaired.deck = copied;
          if (outcome === "citation-change") repaired.claims[0].supports.pop();
          return response({ stories: [repaired] });
        }
        assert.equal(tokens.length, 4, "No additional rewrite/review retry");
        assert.equal(data.drafts[0].draftSha256, hash(groundedDraft));
        return response({ reviews: data.drafts.map(entry => ({ candidateId: entry.draft.candidateId,
          draftSha256: entry.draftSha256, factsSupported: true, attributionAccurate: true,
          analysisSupported: true, usefulAndSpecific: outcome !== "review-veto",
          claimVerdicts: entry.claimEvidence.map(claim => ({ claimIndex: claim.claimIndex,
            claimSha256: claim.claimSha256, allCitedPassagesSupport: true })) })) });
      } });
    assert.equal(Boolean(result), outcome === "pass");
    assert.deepEqual(tokens, ["pass", "review-veto"].includes(outcome) ? [2000, 3000, 1000, 1800] : [2000, 3000, 1000]);
    assert.ok(tokens.reduce((a, b) => a + b, 0) <= 7800);
    if (outcome !== "provider-error") assert.equal(events.filter(e => e.stage === "daily-originality-rewrite").length, 1);
  }
});

async function run({ initial = groundedDraft, mutateCopy = () => {}, mutateReview = () => {}, ...overrides } = {}) {
  const calls = [], events = [];
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    accountId: "0".repeat(32), apiToken: "fixture", compositionProfile: EXPERIMENTAL_FOUNDATION_RECHECK,
    onDiagnostic: event => events.push(event), aiRequestImpl: async options => {
      calls.push({ ...options, data: JSON.parse(options.messages[1].content) });
      if (calls.length === 1) return response({ foundations: [{ candidateId: initial.candidateId, claims: initial.claims }] });
      if (calls.length === 2) { const payload = finalCopy(); mutateCopy(payload); return response(payload); }
      assert.equal(calls.length, 3, "No extra attempt after review");
      const payload = checked(calls.at(-1).data); mutateReview(payload); return response(payload);
    }, ...overrides });
  return { result, calls, events };
}

test("isolated recheck can complete missing citation coverage before unchanged exact-text review", async () => {
  const initial = structuredClone(groundedDraft);
  initial.claims[0].supports.pop(); // Access-check clause now lacks its S1P3 citation.
  const { result, calls } = await run({ initial });
  assert.ok(result);
  assert.deepEqual(calls.map(call => call.maxTokens), [2000, 4000, 1800]);
  assert.deepEqual(calls.map(call => buildWorkersAiRequest(call).body.response_format.type),
    ["json_schema", "json_object", "json_schema"], "Only isolated composition changes its provider grammar");
  assert.match(calls[1].messages[0].content, /only top-level keys are claimRepairs, copies/);
  assert.ok(calls[1].messages[0].content.includes(JSON.stringify(calls[1].schema)));
  assert.ok(calls.every(call => call.model === DEFAULT_CLOUDFLARE_AI_MODEL && call.maxAttempts === 1));
  const packet = calls[1].data.dossiers[0];
  assert.deepEqual(packet.fixedClaims, []);
  assert.deepEqual(packet.proposedClaims, initial.claims.map((claim, claimIndex) => ({ claimIndex, supports: claim.supports })));
  assert.ok(packet.proposedClaims.every(claim => !Object.hasOwn(claim, "text")), "Unreviewed prose is not a rewrite anchor");
  assert.equal(packet.requestedClaimRepairs.length, 2);
  assert.ok(packet.requestedClaimRepairs.every(task => task.reasons.includes("SEMANTIC_RECHECK") && !task.preserveSupports));
  assert.deepEqual(packet.sources, calls[0].data.dossiers[0].sources, "Full evidence is available for missing citations");
  assert.deepEqual(calls[2].data.drafts[0].draft, groundedDraft);
  assert.deepEqual(calls[2].data.drafts[0].claimEvidence[0].citations.map(item => item.evidenceId), ["S1P2", "S1P3"]);
  assert.equal(calls[2].data.drafts[0].draftSha256, hash(groundedDraft));
});

test("recheck withholds locally invalid or copied claims instead of anchoring a rewrite to them", async () => {
  const initial = structuredClone(groundedDraft);
  initial.claims[0].text = `CERT/CC says ${groundedEvidence.summary}`;
  const { result, calls } = await run({ initial });
  assert.ok(result);
  const packet = calls[1].data.dossiers[0];
  assert.deepEqual(packet.proposedClaims.map(claim => claim.claimIndex), [1]);
  assert.ok(!JSON.stringify(packet).includes(initial.claims[0].text));
  assert.ok(packet.requestedClaimRepairs[0].reasons.includes("ORIGINALITY"));
});

test("recheck rejects missing, duplicate, unknown or unsupported final claims before review", async () => {
  const mutations = [
    p => p.claimRepairs.pop(),
    p => { p.claimRepairs[1] = structuredClone(p.claimRepairs[0]); },
    p => { p.claimRepairs[0].candidateId = "other"; },
    p => { p.claimRepairs[0].supports = [{ evidenceId: "S9P9" }]; },
    p => { p.claimRepairs[0].text += " Install version 99.9."; },
    p => { p.claimRepairs[0].text = `CERT/CC says ${groundedEvidence.summary}`; },
    p => { p.copies[0].whatToDoOrWatch[1] += '.”], “whyItMatters”: [“Developers using the tool can'; },
    p => { p.copies[0].whyItMatters = ["Short text.", "Still short."]; },
  ];
  for (const mutateCopy of mutations) {
    const { result, calls } = await run({ mutateCopy });
    assert.equal(result, null);
    assert.equal(calls.length, 2);
  }
});

test("recheck never overrides final factual, usefulness, citation or stale-hash rejection", async () => {
  for (const mutateReview of [
    p => { p.reviews[0].factsSupported = false; },
    p => { p.reviews[0].usefulAndSpecific = false; },
    p => { p.reviews[0].claimSupport[0] = []; },
    p => { p.reviews[0].draftSha256 = "0".repeat(64); },
  ]) {
    const { result, calls } = await run({ mutateReview });
    assert.equal(result, null);
    assert.equal(calls.length, 3);
  }
});

test("experimental recheck rejects unknown profiles, multiple candidates, other providers and review overrides", async () => {
  for (const overrides of [{ compositionProfile: "unknown" }, { candidates: [candidate, candidate] },
    { model: EXPERIMENTAL_FREE_WRITER_MODEL }, { reviewProfile: "no-email-sentence-bound-gptoss-review-v1" }]) {
    const { result, calls, events } = await run(overrides);
    assert.equal(result, null);
    assert.equal(calls.length, 0);
    assert.equal(events[0].code, "COMPOSITION_PROFILE_INVALID");
  }
});
