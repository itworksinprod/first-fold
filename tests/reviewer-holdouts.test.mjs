import assert from "node:assert/strict";
import test from "node:test";
import { reviewerHoldoutCases } from "./fixtures/reviewer-holdouts.mjs";
import { buildExplicitClaimReview, validateExplicitClaimReview } from "../scripts/automation/free/explicit-claim-review.mjs";
import { buildWorkersAiRequest, DEFAULT_CLOUDFLARE_AI_MODEL } from "../scripts/automation/free/workers-ai.mjs";

const fields = ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"];
const bundleFor = cases => buildExplicitClaimReview({ drafts: cases.map(item => item.draft), dossiers: cases.map(item => item.dossier) });
const verdictsFor = (bundle, cases) => ({ reviews: bundle.data.drafts.map(({ draft, draftSha256, claimEvidence }) => {
  const expected = cases.find(item => item.draft.candidateId === draft.candidateId).expected;
  return { candidateId: draft.candidateId, draftSha256,
    claimVerdicts: claimEvidence.map(({ claimIndex, claimSha256 }) => ({ claimIndex, claimSha256,
      allCitedPassagesSupport: expected.claims[claimIndex] })),
    ...Object.fromEntries(fields.map(field => [field, expected[field] ?? true])),
  };
}) });
const matches = (review, expected) => {
  if (!review) return false;
  const actual = { claims: review.claimSupport.map(ids => ids.length > 0),
    ...Object.fromEntries(fields.map(field => [field, review[field]])) };
  actual.accepted = actual.claims.every(Boolean) && fields.every(field => actual[field] === true);
  return Object.entries(expected).every(([key, value]) => key === "claims"
    ? actual.claims.length === value.length && value.every((flag, index) => actual.claims[index] === flag)
    : actual[key] === value);
};

test("holdouts are fresh pure synthetic data with opaque candidate IDs and separate expected labels", () => {
  const cases = reviewerHoldoutCases();
  assert.equal(cases.length, 2);
  assert.deepEqual(cases.map(item => item.draft.candidateId), ["review-holdout-17", "review-holdout-42"]);
  const original = reviewerHoldoutCases();
  cases[0].draft.claims[0].text = "Mutated test instance";
  cases[0].dossier.sources[0].passages[0].text = "Mutated source";
  cases[0].expected.claims[0] = false;
  assert.deepEqual(reviewerHoldoutCases(), original);
  const bundle = bundleFor(original);
  const modelData = JSON.stringify(bundle.data);
  assert.ok(!modelData.includes('"expected"'));
  assert.ok(!modelData.includes('"accepted"'));
  assert.ok(!modelData.includes('"caseId"'));
  for (const item of original) {
    assert.ok(!modelData.includes(item.caseId));
    assert.equal(item.draft.candidateId, item.dossier.candidateId);
    for (const source of item.dossier.sources) {
      assert.match(source.publisher, /^Synthetic /);
      assert.equal(source.text, source.passages.map(passage => passage.text).join("\n"));
      assert.ok(!bundle.prompt.includes(source.publisher));
    }
    const body = [...item.draft.claims.map(claim => claim.text), item.draft.whyItMatters, item.draft.whatToDoOrWatch].join(" ");
    const words = body.match(/\S+/gu).length;
    assert.ok(words >= 100 && words <= 225, `holdout reader body has ${words} words`);
  }
  const request = buildWorkersAiRequest({ model: DEFAULT_CLOUDFLARE_AI_MODEL,
    messages: [{ role: "system", content: bundle.prompt }, { role: "user", content: modelData }],
    schema: bundle.schema, responseFormat: "json_schema", maxTokens: 1_800, temperature: 0.1 });
  assert.ok(Buffer.byteLength(JSON.stringify(request.body), "utf8") < 70_000);
});

test("holdout expectations preserve selected-station snapshot caveats and distinguish the swapped branch prerequisite", () => {
  const [transit, gateway] = reviewerHoldoutCases();
  assert.match(transit.dossier.sources[0].passages[0].text, /40 selected stations.*does not cover.*entire network/);
  assert.match(transit.dossier.sources[0].passages[1].text, /each weekday at 06:00.*not a live lift-status service/);
  assert.match(transit.draft.claims[0].text, /40 selected stations, rather than its entire network/);
  assert.match(transit.draft.claims[1].text, /06:00 on weekdays.*does not report live lift status/);
  assert.deepEqual(transit.expected, { claims: [true, true], factsSupported: true, attributionAccurate: true,
    analysisSupported: true, usefulAndSpecific: true, accepted: true });
  const source = gateway.dossier.sources[0];
  assert.match(source.passages[1].text, /4\.8 branch.*authenticated support-role account.*diagnostics feature enabled/);
  assert.match(source.passages[2].text, /4\.7 branch.*authenticated support-role account.*enabled or disabled/);
  assert.match(gateway.draft.claims[1].text, /only the 4\.7.*enabled; 4\.8.*disabled/);
  assert.deepEqual(gateway.draft.claims[1].supports, [{ evidenceId: "S1P2" }, { evidenceId: "S1P3" }]);
  assert.deepEqual(gateway.expected, { claims: [true, false], factsSupported: false, accepted: false });
});

test("offline holdout verdicts retain exact bindings and detect false approvals or false control rejections", () => {
  const cases = reviewerHoldoutCases();
  const bundle = bundleFor(cases);
  const payload = verdictsFor(bundle, cases);
  const validation = validateExplicitClaimReview(payload, bundle);
  assert.deepEqual(validation.errors, []);
  assert.ok(validation.reviews.every((review, index) => matches(review, cases[index].expected)));
  assert.deepEqual(validation.reviews[1].claimSupport, [["S1P1"], []]);
  for (const mutate of [
    copy => { copy.reviews[0].analysisSupported = false; },
    copy => { copy.reviews[1].claimVerdicts[1].allCitedPassagesSupport = true; },
    copy => { copy.reviews[1].factsSupported = true; },
    copy => { copy.reviews.forEach(review => {
      review.claimVerdicts.forEach(claim => { claim.allCitedPassagesSupport = true; });
      fields.forEach(field => { review[field] = true; });
    }); },
  ]) {
    const copy = structuredClone(payload); mutate(copy);
    const result = validateExplicitClaimReview(copy, bundle);
    assert.deepEqual(result.errors, []);
    assert.ok(!result.reviews.every((review, index) => matches(review, cases[index].expected)));
  }
  const stale = structuredClone(payload);
  stale.reviews[1].claimVerdicts[1].claimSha256 = "0".repeat(64);
  const invalid = validateExplicitClaimReview(stale, bundle);
  assert.ok(invalid.errors.length > 0);
  assert.ok(!invalid.reviews.some(review => review.candidateId === cases[1].draft.candidateId));
  // These mocked verdicts verify test plumbing and contract rejection only.
  // They are not evidence that a live reviewer passes the unseen cases.
});
