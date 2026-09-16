import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkGeminiWriter, FREE_PROJECT_CONFIRMATION } from "../scripts/automation/check-gemini-writer.mjs";
import { GEMINI_FREE_MODEL, GEMINI_URL } from "../scripts/automation/free/gemini-ai.mjs";
import { geminiQualificationCases, geminiWriterControls } from "./fixtures/gemini-qualification.mjs";

const fields = ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"];
const settings = { apiKey: "synthetic-key-qualification-test", freeProjectConfirmation: FREE_PROJECT_CONFIRMATION };
const response = payload => new Response(JSON.stringify({ modelVersion: GEMINI_FREE_MODEL,
  candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify(payload) }] } }] }),
  { headers: { "content-type": "application/json" } });
const fixtureReviews = (data, generated = false) => ({ reviews: data.drafts.map(({ draft, draftSha256, claimEvidence }) => {
  const control = geminiQualificationCases().find(item => item.draft.candidateId === draft.candidateId);
  const expected = generated ? { claims: [true, true] } : control.expected;
  return { candidateId: draft.candidateId, draftSha256, claimVerdicts: claimEvidence.map(item => ({
    claimIndex: item.claimIndex, claimSha256: item.claimSha256,
    allCitedPassagesSupport: expected.claims[item.claimIndex] })),
    ...Object.fromEntries(fields.map(field => [field, expected[field] ?? true])) };
}) });
const mockProvider = (mutate = () => {}) => {
  const requests = [];
  return { requests, fetchImpl: async (url, options) => {
    assert.equal(url, GEMINI_URL);
    const body = JSON.parse(options.body);
    requests.push(body);
    const data = JSON.parse(body.contents[0].parts[0].text);
    const payload = data.drafts ? fixtureReviews(data, requests.length === 5)
      : { stories: geminiWriterControls().map(item => item.draft) };
    mutate(payload, requests.length);
    return response(payload);
  } };
};

test("qualification runs three regression batches then a complete write/review, never sends email", async () => {
  const provider = mockProvider();
  const report = await checkGeminiWriter({ ...settings, fetchImpl: provider.fetchImpl });
  assert.equal(report.status, "passed");
  assert.equal(report.stage, "complete");
  assert.equal(report.modelRequests, 5);
  assert.equal(report.maxModelRequests, 5);
  assert.equal(report.requestedOutputTokens, 40000);
  assert.equal(report.productionEnabled, false);
  assert.deepEqual([report.draftedStories, report.reviewedStories, report.emailRequests, report.liveResearchRequests], [2, 2, 0, 0]);
  assert.equal(report.cases.length, 8);
  assert.ok(report.cases.every(item => item.passed));
  assert.equal(report.receipts.length, 5);
  assert.doesNotMatch(JSON.stringify(provider.requests), /"expected"|"caseId"|synthetic-key|GEMINI_API_KEY/);
  const writer = JSON.parse(provider.requests[3].contents[0].parts[0].text);
  assert.deepEqual(Object.keys(writer), ["dossiers"]);
  assert.doesNotMatch(JSON.stringify(writer), /"headline"|"whyItMatters"/);
  assert.doesNotMatch(JSON.stringify(report), /passages|headline|synthetic-key|claimText/);
});

test("blanket approval and false rejection fail regression without writer calls or retries", async () => {
  for (const mode of ["approve-all", "reject-all", "miss-release", "miss-filler"]) {
    const provider = mockProvider(payload => {
      for (const review of payload.reviews ?? []) {
        if (mode === "approve-all") {
          review.claimVerdicts.forEach(item => { item.allCitedPassagesSupport = true; });
          fields.forEach(field => { review[field] = true; });
        }
        if (mode === "reject-all") fields.forEach(field => { review[field] = false; });
        if (mode === "miss-release" && review.candidateId === "scope-review-23") review.factsSupported = true;
        if (mode === "miss-filler" && review.candidateId === "scope-review-51") review.usefulAndSpecific = true;
      }
    });
    const report = await checkGeminiWriter({ ...settings, fetchImpl: provider.fetchImpl });
    assert.equal(report.code, "GEMINI_QUALIFICATION_VERDICT_MISMATCH", mode);
    assert.equal(report.modelRequests, 3);
    assert.equal(report.draftedStories, 0);
    assert.ok(report.cases.some(item => !item.passed));
  }
});

test("malformed or generic writing and missing citations cannot reach final review", async () => {
  const changes = [p => { p.stories[0].whyItMatters += ' ", "stories": [{'; },
    p => { p.stories[0].claims[0].supports[0].evidenceId = "S9P999"; },
    p => { p.stories[0].whyItMatters = "Read the original report for more details."; },
    p => { p.stories.pop(); }, p => { p.stories.push(p.stories[0]); },
    p => { p.stories[0].candidateId = "unknown"; }];
  for (const change of changes) {
    const provider = mockProvider((payload, call) => { if (call === 4) change(payload); });
    const report = await checkGeminiWriter({ ...settings, fetchImpl: provider.fetchImpl });
    assert.equal(report.status, "failed");
    assert.equal(report.modelRequests, 4);
    assert.equal(report.draftedStories, 0);
    assert.equal(report.emailRequests, 0);
  }
});

test("freshly written stories still require a complete semantic review", async () => {
  const provider = mockProvider((payload, call) => { if (call === 5) payload.reviews[0].factsSupported = false; });
  const report = await checkGeminiWriter({ ...settings, fetchImpl: provider.fetchImpl });
  assert.equal(report.code, "GEMINI_QUALIFICATION_DRAFT_REJECTED");
  assert.equal(report.draftedStories, 2);
  assert.equal(report.reviewedStories, 1);
  assert.equal(report.modelRequests, 5);
});

test("absent key, billing confirmation, provider errors and quota exhaustions fail closed", async () => {
  for (const change of [{ apiKey: undefined }, { freeProjectConfirmation: undefined }, { freeProjectConfirmation: "paid" }]) {
    const provider = mockProvider();
    const report = await checkGeminiWriter({ ...settings, ...change, fetchImpl: provider.fetchImpl });
    assert.equal(report.status, "failed");
    assert.equal(provider.requests.length, 0);
    assert.equal(report.modelRequests, 0);
  }
  for (const status of [401, 429, 500]) {
    let calls = 0;
    const report = await checkGeminiWriter({ ...settings, fetchImpl: async () => {
      calls++; return new Response("PRIVATE_PROVIDER_ERROR", { status });
    } });
    assert.equal(calls, 1);
    assert.equal(report.status, "failed");
    assert.equal(report.modelRequests, 1);
    assert.equal(report.receipts.length, 0);
    assert.equal(report.httpStatus, status);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_PROVIDER_ERROR/);
  }
});

test("qualification refuses wrong provider provenance even from an injected client", async () => {
  const report = await checkGeminiWriter({ ...settings, aiRequestImpl: async () => ({
    provider: "cloudflare-workers-ai", model: GEMINI_FREE_MODEL, editorialPayload: {} }) });
  assert.equal(report.code, "GEMINI_QUALIFICATION_PROVENANCE");
  assert.equal(report.modelRequests, 1);
});

test("manual workflow is owner-only, secret-isolated and has no delivery or schedule", async () => {
  const workflow = await readFile(new URL("../.github/workflows/gemini-writer-quality-check.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.repository == 'itworksinprod\/first-fold'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.actor == 'itworksinprod'/);
  assert.match(workflow, /github\.run_attempt == 1/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /schedule:|RESEND|OPENAI_API_KEY|CLOUDFLARE_AI_API_TOKEN|contents: write|personal-email\.mjs/);
  assert.equal((workflow.match(/secrets\./g) ?? []).length, 1);
  assert.match(workflow, /secrets\.GEMINI_API_KEY/);
  assert.ok(workflow.indexOf("node --test") < workflow.indexOf("secrets.GEMINI_API_KEY"));
  assert.match(workflow, /retention-days: 1/);
});
