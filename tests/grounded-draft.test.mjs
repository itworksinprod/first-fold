import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { groundedDraft, groundedEvidence } from "./fixtures/grounded-summary.mjs";
import { groundedDossiers, validateGroundedStory, synthesizeGroundedEditorial } from
  "../scripts/automation/free/grounded-draft.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL } from "../scripts/automation/free/workers-ai.mjs";

const candidate = { candidateId: groundedDraft.candidateId, suggestedDesk: "security-and-privacy",
  ranking: { evidenceTier: "authoritative-single" }, feedEvidence: [groundedEvidence],
  sources: [{ id: "cert-advisory", title: groundedEvidence.title, publisher: "CERT/CC",
    relationship: "originating", publishedAt: groundedEvidence.publishedAt }] };
const dossier = groundedDossiers([candidate])[0];
const baseline = { frontPage: { note: "old", estimatedMinutes: 1 }, desks: {
  "security-and-privacy": { story: { id: "s1", headline: "old", sources: candidate.sources,
    selection: { score: 77 }, timing: { eventAt: null }, confidence: { level: "developing" } } },
} };
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function response(editorialPayload) {
  return { editorialPayload, provider: "cloudflare-workers-ai", model: DEFAULT_CLOUDFLARE_AI_MODEL,
    responseId: "test", requestSha256: "a".repeat(64), responseSha256: "b".repeat(64) };
}
const review = { candidateId: groundedDraft.candidateId, draftSha256: hash(groundedDraft),
  factsSupported: true, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true };

test("grounded writer accepts concrete supported news including a driver filename", () => {
  assert.equal(validateGroundedStory(groundedDraft, dossier), true);
});
test("grounded writer rejects invented numbers, evidence, citations, generic prose and instructions", () => {
  const mutations = [
    (draft) => { draft.whatToDoOrWatch += " Install version 9.9 immediately."; },
    (draft) => { draft.claims[0].supports[0].quote = "The vendor fixed this defect yesterday."; },
    (draft) => { draft.claims[0].supports[0].evidenceId = "unknown"; },
    (draft) => { draft.headline = "CERT/CC reports a new development"; },
    (draft) => { draft.whatToDoOrWatch += " Disable your antivirus."; },
    (draft) => { draft.whatToDoOrWatch += " Visit https://evil.example"; },
    (draft) => { draft.claims[0].text = groundedEvidence.summary; },
    (draft) => { draft.claims[0].text = draft.claims[0].text.replace("CERT/CC", "Another source"); },
  ];
  for (const mutate of mutations) {
    const draft = structuredClone(groundedDraft); mutate(draft);
    assert.equal(validateGroundedStory(draft, dossier), false);
  }
});
test("writing and review are budgeted independently; only checked prose replaces the baseline", async () => {
  const calls = [];
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    accountId: "0".repeat(32), apiToken: "fixture", aiRequestImpl: async (options) => {
      calls.push(options);
      return response(calls.length === 1 ? { stories: [groundedDraft] } : { reviews: [review] });
    } });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.maxAttempts, 1);
    assert.equal(call.model, DEFAULT_CLOUDFLARE_AI_MODEL);
    assert.equal(call.maxRequestBytes, 70_000);
    assert.ok(!JSON.stringify(call.messages).includes("fixture"));
  }
  assert.equal(result.editorial.desks["security-and-privacy"].story.headline, groundedDraft.headline);
  assert.deepEqual(result.editorial.desks["security-and-privacy"].story.selection, { score: 77 });
  assert.deepEqual(result.editorial.desks["security-and-privacy"].story.sources, candidate.sources);
  assert.equal(baseline.desks["security-and-privacy"].story.headline, "old");
});
test("quota errors stop immediately with no provider fallback or retries", async () => {
  let calls = 0;
  assert.equal(await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    aiRequestImpl: async () => { calls++; throw new Error("quota"); } }), null);
  assert.equal(calls, 1);
});
test("semantic reviewer veto, wrong draft hash and unavailable checker all keep the safe baseline", async () => {
  for (const badReview of [{ ...review, factsSupported: false }, { ...review, draftSha256: "wrong" },
    { ...review, attributionAccurate: false }, { ...review, analysisSupported: false },
    { ...review, usefulAndSpecific: false }, null]) {
    let calls = 0;
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      aiRequestImpl: async () => {
        if (++calls === 1) return response({ stories: [groundedDraft] });
        if (badReview === null) throw new Error("checker timeout");
        return response({ reviews: [badReview] });
      } });
    assert.equal(result, null);
    assert.equal(calls, 2);
  }
});
test("ambiguous drafts cannot replace stories", async () => {
  for (const stories of [[groundedDraft, groundedDraft], [{ ...groundedDraft, candidateId: "injected" }]]) {
    let calls = 0;
    assert.equal(await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      aiRequestImpl: async () => { calls++; return response({ stories }); } }), null);
    assert.equal(calls, 1);
  }
});
