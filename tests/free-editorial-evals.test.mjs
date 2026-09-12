import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFreeEditorial } from "../scripts/automation/evaluate-free-editorial.mjs";
import { buildFreeEditorialBaselines, buildFreeEditorialEvalCases } from "./fixtures/free-editorial-evals.mjs";

test("offline editorial evaluation covers every desk with unmistakably synthetic fixtures", () => {
  const baselines = buildFreeEditorialBaselines();
  assert.deepEqual(baselines.map(({ desk }) => desk), ["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"]);
  assert.ok(baselines.every(value => value.synthetic && value.id.startsWith("synthetic-") &&
    value.candidate.sources.every(source => source.url.startsWith("https://example.com/synthetic/"))));
  const cases = buildFreeEditorialEvalCases();
  assert.equal(new Set(cases.map(({ id }) => id)).size, cases.length);
  cases[0].draft.headline = "Mutated local fixture";
  assert.notEqual(buildFreeEditorialEvalCases()[0].draft.headline, cases[0].draft.headline);
});

test("offline editorial evaluation rejects adversarial mutations without contacting services", () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = () => { networkCalls++; throw new Error("Network is forbidden in offline editorial evaluation."); };
  try {
    const report = evaluateFreeEditorial();
    assert.equal(report.passed, true, JSON.stringify(report.mismatches));
    assert.equal(report.summary.acceptedDrafts, 4);
    assert.equal(report.summary.rejectedDrafts, 9);
    assert.equal(report.summary.acceptedRenderedCopies, 1);
    assert.equal(report.summary.rejectedRenderedCopies, 3);
    assert.equal(report.summary.expectationMismatches, 0);
    assert.deepEqual([report.networkRequests, report.modelInvocations, report.emailRequests, networkCalls], [0, 0, 0, 0]);
    assert.ok(report.limitations.some(value => /not live model quality/u.test(value)));
    assert.ok(report.humanReviewChecklist.length >= 5);
    for (const code of ["READER_COPY", "GENERIC_COPY", "NUMERIC_ANCHOR", "NUMERIC_CITATION", "SOURCE_CAVEAT", "ATTRIBUTION", "CORROBORATION", "CITATION_UNKNOWN"]) {
      assert.ok(report.cases.some(result => result.codes.includes(code)), code);
    }
    assert.deepEqual(evaluateFreeEditorial(), report);
  } finally { globalThis.fetch = originalFetch; }
});
