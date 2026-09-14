import test from "node:test";
import assert from "node:assert/strict";
import { researchLocalPaper, draftLocalPaper, localInferenceTask } from "../scripts/automation/local-paper.mjs";

test("local inference diagnostics name the actual native-schema stage", () => {
  const request = properties => ({ schema: { properties } });
  assert.equal(localInferenceTask(request({ stories: {} })), "draft");
  assert.equal(localInferenceTask(request({ candidateId: {}, claims: {} })), "claims-only-repair");
  assert.equal(localInferenceTask(request({ headline: {}, deck: {}, whyItMatters: {}, whatToDoOrWatch: {} })), "copy-refinement");
  assert.equal(localInferenceTask(request({ reviews: {} })), "review");
  assert.equal(localInferenceTask(request({}), { rejected: [{}] }), "repair");
});

test("local paper preview cannot research or infer outside the requested day", async () => {
  let calls = 0;
  const now = new Date("2026-09-14T04:00:00.000Z");
  await assert.rejects(researchLocalPaper({ now, researchImpl: async () => { calls++; } }),
    { code: "LOCAL_PREVIEW_CLOSED" });
  await assert.rejects(draftLocalPaper({}, { now: () => now, synthesizeImpl: async () => { calls++; } }),
    { code: "LOCAL_PREVIEW_CLOSED" });
  assert.equal(calls, 0);
});

test("local paper keeps reviewed-feed and coverage boundaries before inference", async () => {
  let inference = 0;
  const now = new Date("2026-09-14T02:15:00.000Z");
  await assert.rejects(researchLocalPaper({ now, researchImpl: async options => {
    assert.equal(options.minimumScore, 70);
    assert.equal(options.minimumAuthoritativeScore, 70);
    assert.equal(options.enrichArticles, true);
    assert.equal(options.evidencePolicy, "authoritative-or-corroborated");
    assert.equal(options.apiToken, undefined);
    assert.equal(options.reportingWindow.endExclusive, "2026-09-13T09:00:00.000Z");
    return { reportingWindow: options.reportingWindow, retrievedAt: options.retrievedAt,
      diagnostics: { sourceResults: [] } };
  } }));
  await assert.rejects(draftLocalPaper({}, { now: () => now,
    synthesizeImpl: async () => { inference++; } }));
  assert.equal(inference, 0);
});
