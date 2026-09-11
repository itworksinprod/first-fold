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

test("one originality revision is revalidated, hash-bound and separately checked", async () => {
  const copied = structuredClone(groundedDraft);
  copied.claims[0].text = `CERT/CC says: ${groundedEvidence.summary}`;
  const codes = [];
  assert.equal(validateGroundedStory(copied, dossier, (code) => codes.push(code)), false);
  assert.deepEqual(codes, ["ORIGINALITY"]);
  const calls = [];
  const diagnostics = [];
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    onDiagnostic: (event) => diagnostics.push(event), aiRequestImpl: async (options) => {
      calls.push(options);
      if (calls.length === 1) return response({ stories: [copied] });
      if (calls.length === 2) {
        const data = JSON.parse(options.messages[1].content);
        assert.equal(data.rejected[0].rejectionCode, "ORIGINALITY");
        assert.equal(options.maxTokens, 3_000);
        assert.equal(options.maxAttempts, 1);
        return response({ stories: [groundedDraft] });
      }
      assert.equal(JSON.parse(options.messages[1].content).drafts[0].draftSha256, hash(groundedDraft));
      return response({ reviews: [review] });
    } });
  assert.equal(calls.length, 3);
  assert.equal(result.editorial.desks["security-and-privacy"].story.headline, groundedDraft.headline);
  assert.equal(result.inference.requestSha256, hash(Array(3).fill("a".repeat(64))));
  assert.ok(diagnostics.some((event) => event.stage === "draft-repair" && event.accepted === 1));
});

test("bad or unrequested revisions cannot bypass checks or trigger another revision", async () => {
  const copied = structuredClone(groundedDraft);
  copied.claims[0].text = `CERT/CC says: ${groundedEvidence.summary}`;
  for (const revisions of [[copied], [{ ...groundedDraft, candidateId: "injected" }],
    [groundedDraft, groundedDraft], []]) {
    let calls = 0;
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      aiRequestImpl: async () => response({ stories: ++calls === 1 ? [copied] : revisions }) });
    assert.equal(result, null);
    assert.equal(calls, 2);
  }
});

test("a repaired draft still needs semantic approval; repair quota errors stop immediately", async () => {
  const copied = structuredClone(groundedDraft);
  copied.claims[0].text = `CERT/CC says: ${groundedEvidence.summary}`;
  for (const quota of [false, true]) {
    let calls = 0;
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      aiRequestImpl: async () => {
        if (++calls === 1) return response({ stories: [copied] });
        if (calls === 2) {
          if (quota) throw new Error("quota");
          return response({ stories: [groundedDraft] });
        }
        return response({ reviews: [{ ...review, factsSupported: false }] });
      } });
    assert.equal(result, null);
    assert.equal(calls, quota ? 2 : 3);
  }
});

test("revision only replaces a rejected draft and preserves an already valid draft", async () => {
  const secondCandidate = { ...structuredClone(candidate), candidateId: "candidate-second", suggestedDesk: "ai-and-models" };
  const secondDraft = { ...structuredClone(groundedDraft), candidateId: secondCandidate.candidateId };
  const copied = structuredClone(secondDraft);
  copied.claims[0].text = `CERT/CC says: ${groundedEvidence.summary}`;
  const twoDesks = structuredClone(baseline);
  twoDesks.desks["ai-and-models"] = structuredClone(twoDesks.desks["security-and-privacy"]);
  twoDesks.desks["ai-and-models"].story.id = "s2";
  let calls = 0;
  const result = await synthesizeGroundedEditorial({ editorial: twoDesks, candidates: [candidate, secondCandidate],
    aiRequestImpl: async (options) => {
      if (++calls === 1) return response({ stories: [groundedDraft, copied] });
      if (calls === 2) {
        assert.deepEqual(JSON.parse(options.messages[1].content).dossiers.map((value) => value.candidateId), [secondCandidate.candidateId]);
        return response({ stories: [secondDraft] });
      }
      assert.deepEqual(JSON.parse(options.messages[1].content).drafts.map((value) => value.draft), [groundedDraft, secondDraft]);
      return response({ reviews: [review, { ...review, candidateId: secondCandidate.candidateId, draftSha256: hash(secondDraft) }] });
    } });
  assert.equal(calls, 3);
  assert.equal(result.editorial.desks["security-and-privacy"].story.headline, groundedDraft.headline);
  assert.equal(result.editorial.desks["ai-and-models"].story.headline, secondDraft.headline);
});

test("harmless JSON paragraph breaks normalize before validation and the final review hash", async () => {
  const lineBreaks = structuredClone(groundedDraft);
  lineBreaks.claims[0].text = ` \n${lineBreaks.claims[0].text.replace("The issue", "\nThe issue")}\t `;
  let calls = 0;
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    aiRequestImpl: async (options) => {
      if (++calls === 1) {
        assert.ok(Array.isArray(JSON.parse(options.messages[1].content).dossiers[0].supportedNumericTokens));
        return response({ stories: [lineBreaks] });
      }
      assert.equal(JSON.parse(options.messages[1].content).drafts[0].draftSha256, hash(groundedDraft));
      return response({ reviews: [review] });
    } });
  assert.equal(calls, 2);
  assert.equal(result.editorial.desks["security-and-privacy"].story.whatHappened, groundedDraft.claims.map((claim) => claim.text).join(" "));
});
