import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { checkGeminiLite } from "../scripts/automation/check-gemini-lite.mjs";
import { FREE_PROJECT_CONFIRMATION } from "../scripts/automation/check-gemini-writer.mjs";
import { GEMINI_LITE_MODEL, GEMINI_FREE_MODEL, requestGeminiEditorial } from "../scripts/automation/free/gemini-ai.mjs";
import { geminiQualificationCases, geminiWriterControls } from "./fixtures/gemini-qualification.mjs";
const settings = { apiKey: "synthetic-no-real-key-here", freeProjectConfirmation: FREE_PROJECT_CONFIRMATION };
const response = payload => new Response(JSON.stringify({ modelVersion: GEMINI_LITE_MODEL,
  candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify(payload) }] } }] }),
  { headers: { "content-type": "application/json" } });

test("Flash-Lite probes once then runs all unchanged regression/write/review checks", async () => {
  let calls = 0;
  const report = await checkGeminiLite({ ...settings, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LITE_MODEL}:generateContent`);
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.maxOutputTokens, calls === 1 ? 512 : 8000);
    if (calls === 1) return response({ ok: true });
    const data = JSON.parse(body.contents[0].parts[0].text);
    if (!data.drafts) return response({ stories: geminiWriterControls().map(item => item.draft) });
    return response({ reviews: data.drafts.map(({ draft, draftSha256, claimEvidence }) => {
      const expected = calls === 6 ? { claims: [true, true] }
        : geminiQualificationCases().find(item => item.draft.candidateId === draft.candidateId).expected;
      return { candidateId: draft.candidateId, draftSha256,
        claimVerdicts: claimEvidence.map(item => ({ claimIndex: item.claimIndex, claimSha256: item.claimSha256,
          allCitedPassagesSupport: expected.claims[item.claimIndex] })),
        ...Object.fromEntries(["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"]
          .map(field => [field, expected[field] ?? true])) };
    }) });
  } });
  assert.equal(calls, 6);
  assert.equal(report.status, "passed");
  assert.equal(report.qualification.model, GEMINI_LITE_MODEL);
  assert.equal(report.qualification.reviewedStories, 2);
  assert.ok(report.qualification.cases.every(item => item.passed));
  assert.equal(report.emailRequests, 0);
  assert.equal(report.productionEnabled, false);
  assert.equal(GEMINI_FREE_MODEL, "gemini-3.8-flash");
});

test("probe failures and quota errors never trigger qualification or fallback", async () => {
  for (const status of [401, 403, 429, 503]) {
    let calls = 0;
    const report = await checkGeminiLite({ ...settings, fetchImpl: async () => {
      calls++; return new Response("secret provider error", { status });
    } });
    assert.equal(calls, 1);
    assert.equal(report.httpStatus, status);
    assert.equal(report.stage, "availability-probe");
    assert.equal(report.qualification, undefined);
    assert.doesNotMatch(JSON.stringify(report), /secret provider error/);
  }
});

test("billing confirmation required before Flash-Lite probe", async () => {
  let calls = 0;
  const report = await checkGeminiLite({ ...settings, freeProjectConfirmation: undefined,
    fetchImpl: async () => { calls++; } });
  assert.equal(calls, 0);
  assert.equal(report.code, "GEMINI_FREE_TIER_NOT_CONFIRMED");
});

test("Flash-Lite cannot accept a different model's response", async () => {
  const report = await checkGeminiLite({ ...settings, fetchImpl: async () => {
    const body = await response({ ok: true }).json(); body.modelVersion = GEMINI_FREE_MODEL;
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  } });
  assert.equal(report.code, "GEMINI_RESPONSE_INVALID");
});

test("Flash-Lite workflow is manual, read-only, bounded, and has no delivery secrets", async () => {
  const workflow = await readFile(new URL("../.github/workflows/gemini-lite-quality-check.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /github.run_attempt == 1/);
  assert.match(workflow, /timeout-minutes: 19/);
  assert.doesNotMatch(workflow, /schedule:|RESEND|OPENAI|CLOUDFLARE|contents: write/);
  assert.equal((workflow.match(/secrets\./g) ?? []).length, 1);
});
