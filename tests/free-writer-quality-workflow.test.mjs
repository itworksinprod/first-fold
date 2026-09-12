import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertFreeWriterSmokeAuthority, checkFreeWriter } from "../scripts/automation/check-free-writer.mjs";
import { buildFreeEditorialBaselines } from "./fixtures/free-editorial-evals.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, workersAiRunUrl } from "../scripts/automation/free/workers-ai.mjs";

const workflow = await readFile(new URL("../.github/workflows/free-writer-quality-check.yml", import.meta.url), "utf8");
const scriptUrl = new URL("../scripts/automation/check-free-writer.mjs", import.meta.url);
const script = await readFile(scriptUrl, "utf8");
const accountId = "0".repeat(32);
const apiToken = "synthetic-test-token-not-a-credential";
const authority = { GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main",
  GITHUB_ACTOR: "itworksinprod", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1" };
const response = editorialPayload => ({ editorialPayload, provider: "cloudflare-workers-ai",
  model: DEFAULT_CLOUDFLARE_AI_MODEL, responseId: "synthetic-test-response",
  requestSha256: "a".repeat(64), responseSha256: "b".repeat(64) });
const reviews = options => JSON.parse(options.messages[1].content).drafts.map(({ draft, draftSha256 }) => ({
  candidateId: draft.candidateId, draftSha256,
  claimSupport: draft.claims.map(claim => claim.supports.map(({ evidenceId }) => evidenceId)),
  factsSupported: true, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true,
}));

test("writer smoke is manual trusted-owner main-only, serialized with delivery, and read-only", () => {
  const trigger = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
  assert.match(trigger, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(trigger, /schedule:|cron:|push:|pull_request|workflow_run|inputs:/);
  for (const expression of ["github.repository == 'itworksinprod/first-fold'", "github.ref == 'refs/heads/main'",
    "github.actor == 'itworksinprod'", "github.run_attempt == 1"]) assert.ok(workflow.includes(expression));
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /^      contents: read$/m);
  assert.match(workflow, /^  group: personal-morning-paper$/m);
  assert.match(workflow, /^  cancel-in-progress: false$/m);
  assert.match(workflow, /^    timeout-minutes: 15$/m);
  assert.match(workflow, /persist-credentials: false/);
  const actions = [...workflow.matchAll(/uses:\s*(\S+)/gu)].map(match => match[1]);
  assert.equal(actions.length, 2);
  assert.ok(actions.every(action => /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/u.test(action)));
  assert.doesNotMatch(workflow, /\bwrite\b|RESEND|OPENAI|TAVILY|PERSONAL_PAPER_EMAIL|upload-artifact|download-artifact|git push|git commit|deploy/);
  assert.match(workflow, /run: node scripts\/automation\/check-free-writer\.mjs/);
  assert.ok(workflow.indexOf("run: npm test") < workflow.indexOf("CLOUDFLARE_AI_API_TOKEN:"));
  assert.equal([...workflow.matchAll(/secrets\./gu)].length, 1);
});

test("writer smoke rejects unauthorized contexts and malformed credentials before provider use", async () => {
  assert.doesNotThrow(() => assertFreeWriterSmokeAuthority(authority));
  for (const override of [
    { GITHUB_REPOSITORY: "fork/first-fold" }, { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_ACTOR: "someone-else" }, { GITHUB_EVENT_NAME: "push" }, { GITHUB_RUN_ATTEMPT: "2" },
  ]) assert.throws(() => assertFreeWriterSmokeAuthority({ ...authority, ...override }), /SMOKE_AUTHORITY_REJECTED/);
  let calls = 0;
  for (const override of [{ accountId: "bad" }, { apiToken: "" }, { apiToken: " leading-space" }, { apiToken: "line\nbreak" }]) {
    await assert.rejects(checkFreeWriter({ accountId, apiToken, ...override,
      aiRequestImpl: async () => { calls++; throw new Error("Must not call"); } }), /SMOKE_CONFIGURATION_INVALID/);
  }
  assert.equal(calls, 0);
});

test("all four synthetic stories need real synthesis-path local and semantic acceptance for green", async () => {
  const calls = [];
  const report = await checkFreeWriter({ accountId, apiToken, aiRequestImpl: async options => {
    calls.push(options);
    return options.schema.properties.reviews
      ? response({ reviews: reviews(options) })
      : response({ stories: buildFreeEditorialBaselines().map(({ draft }) => draft) });
  } });
  assert.equal(report.status, "passed");
  assert.deepEqual([report.stories, report.acceptedStories, report.checkedStories, report.modelRequests], [4, 4, 4, 2]);
  assert.deepEqual([report.networkRequests, report.researchQueries, report.emailRequests], [0, 0, 0]);
  assert.equal(report.maxModelRequests, 3);
  assert.ok(report.mode.includes("synthetic"));
  for (const options of calls) {
    assert.equal(options.model, DEFAULT_CLOUDFLARE_AI_MODEL);
    assert.equal(options.maxAttempts, 1);
    assert.ok(options.maxTokens <= 4_000);
    assert.ok(options.timeoutMs <= 90_000);
  }
  assert.doesNotMatch(JSON.stringify(report), /Synthetic Meridian|vaultdrv|synthetic-test-token|claimSupport|whatHappened|api\.cloudflare/);
});

test("one bounded repair is allowed but never a green result from partial semantic approval", async () => {
  for (const rejectOne of [false, true]) {
    let calls = 0;
    const report = await checkFreeWriter({ accountId, apiToken, aiRequestImpl: async options => {
      calls++;
      const drafts = buildFreeEditorialBaselines().map(({ draft }) => draft);
      if (options.schema.properties.reviews) {
        const verdicts = reviews(options);
        if (rejectOne) verdicts[0].factsSupported = false;
        return response({ reviews: verdicts });
      }
      if (calls === 1) {
        drafts[0].headline = 'Model output”, “stories”: [{';
        return response({ stories: drafts });
      }
      return response({ stories: [drafts[0]] });
    } });
    assert.equal(calls, 3);
    assert.equal(report.modelRequests, 3);
    assert.equal(report.status, rejectOne ? "failed" : "passed");
    assert.equal(report.acceptedStories, rejectOne ? 3 : 4);
    assert.ok(report.diagnostics.some(event => event.stage === "draft-repair" && event.accepted === 1));
    if (rejectOne) assert.ok(report.codes.includes("SMOKE_GROUNDED_SUMMARIES_INCOMPLETE"));
  }
});

test("quota/provider failures stop without fallback and arbitrary exception data is not logged", async () => {
  const secretMarker = "UNTRUSTED_EXCEPTION_SHOULD_NOT_APPEAR";
  let calls = 0;
  const report = await checkFreeWriter({ accountId, apiToken, aiRequestImpl: async () => {
    calls++;
    throw Object.assign(new Error(`provider failure ${apiToken}`), { code: secretMarker });
  } });
  assert.equal(calls, 1);
  assert.equal(report.status, "failed");
  assert.equal(report.acceptedStories, 0);
  assert.ok(report.codes.includes("SMOKE_UNCLASSIFIED_FAILURE"));
  assert.ok(!JSON.stringify(report).includes(secretMarker));
  assert.ok(!JSON.stringify(report).includes(apiToken));
});

test("transport is restricted to the fixed Cloudflare endpoint and at most three requests", async () => {
  let externalCalls = 0;
  const badEndpoint = await checkFreeWriter({ accountId, apiToken,
    fetchImpl: async () => { externalCalls++; return new Response("{}"); },
    aiRequestImpl: async options => options.fetchImpl("https://example.com/forbidden", { method: "POST", redirect: "error" }),
  });
  assert.equal(externalCalls, 0);
  assert.ok(badEndpoint.codes.includes("SMOKE_ENDPOINT_REJECTED"));
  const exhausted = await checkFreeWriter({ accountId, apiToken,
    fetchImpl: async () => { externalCalls++; return new Response("{}"); },
    aiRequestImpl: async options => {
      for (let i = 0; i < 4; i++) await options.fetchImpl(workersAiRunUrl(accountId), { method: "POST", redirect: "error" });
      return response({ stories: [] });
    },
  });
  assert.equal(externalCalls, 3);
  assert.equal(exhausted.networkRequests, 3);
  assert.ok(exhausted.codes.includes("SMOKE_REQUEST_BUDGET"));
});

test("CLI exposes no mock hook, research, delivery, artifact, or schedule bypass", () => {
  assert.doesNotMatch(script, /generatePersonalFreeEdition|collectFreeResearch|TAVILY|RESEND|OPENAI|sendPersonalEdition|writeFile|same_day_backfill/);
  assert.match(script, /aiRequestImpl = requestWorkersAiEditorial/);
  assert.match(script, /process\.argv\.length !== 2/);
  const child = spawnSync(process.execPath, [fileURLToPath(scriptUrl)], {
    env: { ...authority, CLOUDFLARE_ACCOUNT_ID: "", CLOUDFLARE_AI_API_TOKEN: "" },
    encoding: "utf8", timeout: 5_000, maxBuffer: 4_096,
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /SMOKE_CONFIGURATION_INVALID/);
  assert.equal(child.stdout, "");
});
