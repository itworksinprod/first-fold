import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assertRequestedPreview, assertRequestedPreviewQuality, assertRequestedSearchReceipt,
  REQUESTED_PREVIEW_REVISION, runRequestedPreview } from "../scripts/automation/personal-preview.mjs";
import { HISTORICAL_PREVIEW, assertHistoricalPreviewAuthorization } from "../scripts/automation/historical-preview-policy.mjs";

const env = {
  GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main",
  GITHUB_ACTOR: "itworksinprod", GITHUB_TRIGGERING_ACTOR: "itworksinprod", GITHUB_RUN_ATTEMPT: "1",
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ID: "1234", GITHUB_SHA: "a".repeat(40),
  GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/personal-preview.yml@refs/heads/main",
  PREVIEW_CONFIRMATION: "SEND WEB SEARCH PREVIEW 2026-09-11",
};
const now = new Date("2026-09-11T22:00:00Z");
const receipt = { provider: "tavily", queriesUsed: 12, creditsReserved: 24, admittedArticles: 2 };
const configuredEnv = { ...env, RESEND_API_KEY: "test-resend-key", PERSONAL_PAPER_EMAIL: "owner@example.com",
  TAVILY_API_KEY: "test-search-key", CLOUDFLARE_AI_API_TOKEN: "test-cloudflare-key-with-sufficient-length" };
function qualityCandidate() {
  return { provenance: { personalFreeResearch: { draftingMode: "source-grounded-summary", webSearch: { ...receipt } } },
    desks: { ai: { story: { id: "story-one", evidence: [{ id: "story-one-grounded-1" }] } },
      work: { story: null } } };
}
test("the preview gate is owner-only, same-day, trusted-main and first-attempt only", () => {
  assert.doesNotThrow(() => assertRequestedPreview(env, now));
  assert.doesNotThrow(() => assertRequestedPreview(env, new Date("2026-09-12T01:56:00Z")));
  for (const key of Object.keys(env)) {
    assert.throws(() => assertRequestedPreview({ ...env, [key]: "invalid" }, now), /gate is closed/);
  }
  for (const date of ["2026-09-11T09:59:59Z", "2026-09-12T04:00:00Z", "2026-09-10T22:00:00Z"]) {
    assert.throws(() => assertRequestedPreview(env, new Date(date)), /gate is closed/);
  }
  for (const patch of [{ GITHUB_EVENT_NAME: "push" }, { PREVIEW_CONFIRMATION: "SEND PREVIEW 2026-09-11" }]) {
    assert.throws(() => assertRequestedPreview({ ...env, ...patch }, now), /gate is closed/);
  }
  assert.equal(REQUESTED_PREVIEW_REVISION, "web-search-upgrade-2026-09-11");
});
test("a closed preview gate prevents both model use and sending", async () => {
  let calls = 0;
  await assert.rejects(runRequestedPreview({ env: { ...env, GITHUB_RUN_ATTEMPT: "2" }, now,
    generate: async () => { calls++; }, send: async () => { calls++; } }), /gate is closed/);
  assert.equal(calls, 0);
});
test("the explicitly requested historical preview preserves yesterday and uses a real research clock", async () => {
  const current = new Date("2026-09-12T05:15:00.000Z");
  const historicalEnv = { ...configuredEnv, PREVIEW_CONFIRMATION: HISTORICAL_PREVIEW.confirmation };
  const token = assertRequestedPreview(historicalEnv, current);
  assert.equal(assertHistoricalPreviewAuthorization(token, current, "2026-09-11"), true);
  let calls = 0;
  await assert.rejects(runRequestedPreview({ env: historicalEnv, now: current, clock: () => current,
    generate: async (options) => {
      calls++;
      assert.equal(options.editionDate, "2026-09-11");
      assert.equal(options.runMode, HISTORICAL_PREVIEW.runMode);
      assert.equal(options.now().toISOString(), current.toISOString());
      assert.equal(assertHistoricalPreviewAuthorization(options.historicalPreviewAuthorization, current, "2026-09-11"), true);
      assert.ok(options.personalStoryLedger);
      throw new Error("stop-before-inference");
    }, send: async () => { throw new Error("must-not-send"); } }), /stop-before-inference/);
  assert.equal(calls, 1);
});
test("missing search credentials stop before research, model use or email", async () => {
  for (const value of [undefined, "", "   "]) {
    let calls = 0;
    await assert.rejects(runRequestedPreview({ env: { ...configuredEnv, TAVILY_API_KEY: value }, now,
      research: async () => { calls++; }, generate: async () => { calls++; }, send: async () => { calls++; } }),
    { code: "SEARCH_KEY_REQUIRED" });
    assert.equal(calls, 0);
  }
});
test("unverified search discovery stops in the research callback before drafting", async () => {
  for (const value of [undefined, { ...receipt, admittedArticles: 0 }, { ...receipt, queriesUsed: 13 },
    { ...receipt, privateQuery: "must-not-leak" }]) {
    let drafted = false;
    let sent = false;
    await assert.rejects(runRequestedPreview({ env: configuredEnv, now,
      research: async () => ({ diagnostics: { webSearch: value } }),
      generate: async ({ researchImpl }) => { await researchImpl({}); drafted = true; },
      send: async () => { sent = true; } }), { code: "SEARCH_ADMISSION_REQUIRED" });
    assert.equal(drafted, false);
    assert.equal(sent, false);
  }
});
test("the preview quality gate requires every story to be grounded and preserves only safe search counts", () => {
  const candidate = qualityCandidate();
  assert.doesNotThrow(() => assertRequestedSearchReceipt(receipt));
  const quality = assertRequestedPreviewQuality(candidate);
  assert.deepEqual(quality, { stories: 1, checked: 1, mode: "source-grounded-summary", webSearch: receipt,
    repeatHistory: "isolated-preview" });
  assert.notEqual(quality.webSearch, candidate.provenance.personalFreeResearch.webSearch);
  for (const mutate of [
    (item) => { item.provenance.personalFreeResearch.draftingMode = "trusted-evidence-digest"; },
    (item) => { item.desks.ai.story.evidence = []; },
    (item) => { item.desks.ai.story.evidence[0].id = "unreviewed-claim"; },
    (item) => { item.desks.ai.story = null; },
    (item) => { item.provenance.personalFreeResearch.webSearch.admittedArticles = 0; },
  ]) {
    const invalid = qualityCandidate();
    mutate(invalid);
    assert.throws(() => assertRequestedPreviewQuality(invalid));
  }
});
test("the preview workflow is not scheduled and has no public or ledger artifact writes", async () => {
  const workflow = await readFile(new URL("../.github/workflows/personal-preview.yml", import.meta.url), "utf8");
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /github\.run_attempt == 1/);
  assert.match(workflow, /PERSONAL_PAPER_EMAIL: \$\{\{ secrets\.PERSONAL_PAPER_EMAIL \}\}/);
  assert.match(workflow, /TAVILY_API_KEY: \$\{\{ secrets\.TAVILY_API_KEY \}\}/);
  assert.match(workflow, /TAVILY_PAYGO_DISABLED_VERIFIED: \$\{\{ vars\.TAVILY_PAYGO_DISABLED_VERIFIED \}\}/);
  assert.match(workflow, /PREVIEW_CONFIRMATION: SEND SEPTEMBER 11 PREVIEW 2026-09-12/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:|schedule:|upload-artifact|actions: write|contents: write|OPENAI_API_KEY/);
});
