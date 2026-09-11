import assert from "node:assert/strict";
import test from "node:test";
import { createNewsworthinessReview } from "../scripts/automation/free/newsworthiness.mjs";
const quote = "Developers can use the newly released model through the public API.";
function entry(reasons = []) {
  return { decision: "rejected", rejectionReasons: reasons,
    candidate: { candidateId: "candidate", suggestedDesk: "ai", feedEvidence: [{
      sourceId: "official", publisher: "Vendor", title: "New model availability", summary: quote,
    }], ranking: { score: 65, evidenceTier: "authoritative-single",
      components: { materialityNewsworthiness: 16, deskRelevance: 16, sourceStrength: 16,
        readerUsefulnessActionability: 4, freshness: 13 },
      editorialValidation: { decision: "rejected", requiredScore: 70, rejectionReasons: reasons } } } };
}
const verdict = { candidateId: "candidate", importance: 22, usefulness: 10,
  rationale: "The launch changes which model developers can deploy through the API.", sourceId: "official", quote };
test("one bounded editorial pass evaluates significance without changing source, freshness or threshold", async () => {
  let calls = 0;
  const review = createNewsworthinessReview({ aiRequestImpl: async (options) => {
    calls++; assert.equal(options.maxAttempts, 1); assert.equal(options.maxTokens, 2_000);
    return { editorialPayload: { assessments: [verdict] } };
  } });
  const original = entry([{ code: "BELOW_EDITORIAL_THRESHOLD" }]);
  const [result] = await review([original]);
  assert.equal(result.decision, "accepted");
  assert.equal(result.candidate.ranking.score, 77);
  assert.equal(result.candidate.ranking.components.sourceStrength, 16);
  assert.equal(result.candidate.ranking.components.freshness, 13);
  assert.equal(result.candidate.ranking.editorialValidation.requiredScore, 70);
  assert.equal(original.candidate.ranking.score, 65);
  assert.deepEqual(await review([original]), [result]);
  assert.equal(calls, 1);
  const changed = structuredClone(original); changed.candidate.feedEvidence[0].summary += " New details.";
  assert.deepEqual(await review([changed]), [changed]);
  assert.equal(calls, 1);
});
test("editorial AI cannot admit rumor, promotion, repeat, weak evidence or insufficient topicality", async () => {
  for (const code of ["PROMOTIONAL_OR_DEAL_CONTENT", "RECENT_DUPLICATE", "SPECULATIVE_OR_RUMOR",
    "INSUFFICIENT_SOURCE_EVIDENCE", "INSUFFICIENT_TOPICALITY", "ROUTINE_OR_MINOR_ANNOUNCEMENT"]) {
    let calls = 0;
    const review = createNewsworthinessReview({ aiRequestImpl: async () => { calls++; return {}; } });
    const original = entry([{ code }]);
    assert.deepEqual(await review([original]), [original]);
    assert.equal(calls, 0);
  }
});
test("scores and exact evidence are checked; invalid and unavailable model output cannot promote a story", async () => {
  for (const bad of [{ ...verdict, importance: 31 }, { ...verdict, usefulness: -1 },
    { ...verdict, sourceId: "unreviewed" }, { ...verdict, quote: "An invented claim about availability." }]) {
    const review = createNewsworthinessReview({ aiRequestImpl: async () => ({ editorialPayload: { assessments: [bad] } }) });
    const original = entry([{ code: "BELOW_EDITORIAL_THRESHOLD" }]);
    assert.deepEqual(await review([original]), [original]);
  }
  let calls = 0;
  const review = createNewsworthinessReview({ aiRequestImpl: async () => { calls++; throw new Error("quota"); } });
  const original = entry([{ code: "BELOW_EDITORIAL_THRESHOLD" }]);
  assert.deepEqual(await review([original]), [original]);
  assert.deepEqual(await review([original]), [original]);
  assert.equal(calls, 1);
});
