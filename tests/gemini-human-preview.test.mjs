import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { previewGeminiLite, renderHumanReview } from "../scripts/automation/preview-gemini-lite.mjs";
import { reviewerResearchScopeCases } from "./fixtures/reviewer-research-scope.mjs";
import { GEMINI_LITE_MODEL } from "../scripts/automation/free/gemini-ai.mjs";
const settings = { apiKey: "synthetic-preview-key-not-real", freeProjectConfirmation: "FREE PROJECT BILLING DISABLED" };
const response = draft => new Response(JSON.stringify({ modelVersion: GEMINI_LITE_MODEL,
  candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify({ stories: [draft] }) }] } }] }),
  { headers: { "content-type": "application/json" } });
test("one call creates only an unapproved evidence-paired sample, never a sendable edition", async () => {
  let calls = 0;
  const { draft } = reviewerResearchScopeCases()[0];
  const result = await previewGeminiLite({ ...settings, fetchImpl: async (url, options) => {
    calls++; assert.match(url, /gemini-3\.5-flash-lite:generateContent$/);
    const data = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    assert.deepEqual(Object.keys(data), ["dossiers"]);
    assert.doesNotMatch(JSON.stringify(data), /"expected"|"headline"|"caseId"/);
    return response(draft);
  } });
  assert.equal(calls, 1);
  assert.equal(result.report.status, "human-review-required");
  assert.equal(result.report.approved, false);
  assert.equal(result.report.qualified, false);
  assert.equal(result.report.emailRequests, 0);
  assert.match(result.html, /UNAPPROVED — HUMAN REVIEW REQUIRED/);
  assert.match(result.html, /S1P32/);
  assert.doesNotMatch(JSON.stringify(result.report), /headline|synthetic-preview/);
});
test("invalid writing and quota failures do not create a preview or retry", async () => {
  for (const quota of [false, true]) {
    let calls = 0;
    const draft = structuredClone(reviewerResearchScopeCases()[0].draft);
    draft.claims[0].supports[0].evidenceId = "S9P999";
    const result = await previewGeminiLite({ ...settings, fetchImpl: async () => {
      calls++; return quota ? new Response("private diagnostic", { status: 429 }) : response(draft);
    } });
    assert.equal(calls, 1); assert.equal(result.html, null); assert.equal(result.report.status, "failed");
    assert.doesNotMatch(JSON.stringify(result.report), /private diagnostic/);
  }
});
test("unconfirmed billing never calls a model", async () => {
  const result = await previewGeminiLite({ ...settings, freeProjectConfirmation: "no",
    fetchImpl: async () => { assert.fail("must not fetch"); } });
  assert.equal(result.report.code, "GEMINI_FREE_TIER_NOT_CONFIRMED");
});
test("all draft and evidence content is escaped in the self-contained review page", () => {
  const { draft, dossier } = structuredClone(reviewerResearchScopeCases()[0]);
  draft.headline = '<script>alert("x")</script>';
  dossier.sources[0].passages[0].text = '<img src=x onerror=alert(1)>';
  const html = renderHumanReview(draft, dossier);
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /default-src 'none'/);
});
test("preview workflow cannot send mail or publish an edition", async () => {
  const workflow = await readFile(new URL("../.github/workflows/gemini-lite-human-preview.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /RESEND|OPENAI|schedule:|contents: write/);
  assert.equal((workflow.match(/secrets\./g) ?? []).length, 1);
});
