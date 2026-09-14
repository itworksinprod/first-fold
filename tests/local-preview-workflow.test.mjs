import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { encodeLocalPreviewPayload } from "../scripts/automation/local-preview-payload.mjs";
import { LOCAL_PREVIEW, assertLocalPreviewAuthorization } from "../scripts/automation/local-preview-policy.mjs";
import { localPreviewSources, localPreviewFailureSummary, runLocalPaperPreview, localPreviewDispatchInputs,
  LOCAL_PREVIEW_MAX_EVENT_BYTES } from "../scripts/automation/local-paper-preview.mjs";

const now = new Date("2026-09-14T02:00:00.000Z");
const candidate = () => ({ editionDate: "2026-09-13", desks: { ai: { story: { id: "synthetic-public-story", sources: [
  { id: "article", url: "https://openai.com/news/synthetic-story/", relationship: "originating", publisherKey: "openai" },
  { id: "feed", url: "https://openai.com/news/rss.xml", relationship: "context", publisherKey: "openai" },
] } } } });
const authority = value => {
  const payload = encodeLocalPreviewPayload(value);
  return {
    CANDIDATE_GZIP_BASE64: payload.candidateGzipBase64, CANDIDATE_SHA256: payload.candidateSha256,
    LOCAL_PREVIEW_CONFIRMATION: LOCAL_PREVIEW.confirmation,
    GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main",
    GITHUB_ACTOR: "itworksinprod", GITHUB_TRIGGERING_ACTOR: "itworksinprod", GITHUB_RUN_ATTEMPT: "1",
    GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ID: "12345", GITHUB_SHA: "a".repeat(40),
    GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/local-paper-preview.yml@refs/heads/main",
  };
};
const pass = { sourceCheck: { status: "passed", issues: [] } };
const dependencyDefaults = {
  now, clock: () => now,
  assertCandidate: (value, options) => assertLocalPreviewAuthorization(options.localPreviewAuthorization, value, options.now),
  render: () => ({ html: "synthetic", text: "synthetic" }), qa: async () => structuredClone(pass),
};

test("local preview handoff is manual, owner-only, read-only and keeps secrets after tests and preflight", async () => {
  const workflow = await readFile(new URL("../.github/workflows/local-paper-preview.yml", import.meta.url), "utf8");
  const trigger = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
  assert.match(trigger, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(trigger, /schedule:|cron:|push:|pull_request|workflow_run/);
  for (const expression of ["github.repository == 'itworksinprod/first-fold'", "github.ref == 'refs/heads/main'",
    "github.actor == 'itworksinprod'", "github.triggering_actor == 'itworksinprod'", "github.run_attempt == 1"]) {
    assert.ok(workflow.includes(expression));
  }
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /^      contents: read$/m);
  assert.match(workflow, /^  group: personal-morning-paper$/m);
  assert.match(workflow, /^  cancel-in-progress: false$/m);
  assert.match(workflow, /persist-credentials: false/);
  const actions = [...workflow.matchAll(/uses:\s*(\S+)/gu)].map(match => match[1]);
  assert.equal(actions.length, 2);
  assert.ok(actions.every(action => /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/u.test(action)));
  const tests = workflow.indexOf("run: npm test");
  const preflight = workflow.indexOf("run: node scripts/automation/local-paper-preview.mjs --validate");
  const credentials = workflow.indexOf("RESEND_API_KEY:");
  const send = workflow.indexOf("run: node scripts/automation/local-paper-preview.mjs --send");
  assert.ok(tests < preflight && preflight < credentials && credentials < send);
  assert.equal([...workflow.matchAll(/secrets\./gu)].length, 2);
  assert.doesNotMatch(workflow, /CLOUDFLARE|TAVILY|OPENAI|upload-artifact|download-artifact|git push|git commit|contents: write/);
  assert.doesNotMatch(workflow, /run:.*\$\{\{/);
  assert.doesNotMatch(workflow, /\$\{\{\s*(?:inputs\.|github\.event\.inputs)|CANDIDATE_GZIP_BASE64:|CANDIDATE_SHA256:|LOCAL_PREVIEW_CONFIRMATION:/);
});

test("dispatch input loading is bounded, masks the reversible payload and ignores unrelated event data", () => {
  const env = authority(candidate());
  const inputs = { candidate_gzip_base64: env.CANDIDATE_GZIP_BASE64,
    candidate_sha256: env.CANDIDATE_SHA256, confirmation: LOCAL_PREVIEW.confirmation };
  const masks = [];
  const loaded = localPreviewDispatchInputs(Buffer.from(JSON.stringify({ inputs, repository: { private: "must-not-be-returned" } })),
    value => masks.push(value));
  assert.deepEqual(masks, [inputs.candidate_gzip_base64]);
  assert.deepEqual(loaded, { CANDIDATE_GZIP_BASE64: env.CANDIDATE_GZIP_BASE64,
    CANDIDATE_SHA256: env.CANDIDATE_SHA256, LOCAL_PREVIEW_CONFIRMATION: LOCAL_PREVIEW.confirmation });
  for (const value of [null, { inputs: [] }, { inputs: { ...inputs, extra: true } },
    { inputs: { ...inputs, candidate_gzip_base64: "a".repeat(60_001) } },
    { inputs: { ...inputs, candidate_sha256: "short" } }, { inputs: { ...inputs, confirmation: 123 } }]) {
    assert.throws(() => localPreviewDispatchInputs(Buffer.from(JSON.stringify(value))), { code: "LOCAL_PREVIEW_EVENT_INVALID" });
  }
  assert.throws(() => localPreviewDispatchInputs(Buffer.alloc(LOCAL_PREVIEW_MAX_EVENT_BYTES + 1)), { code: "LOCAL_PREVIEW_EVENT_INVALID" });
  assert.throws(() => localPreviewDispatchInputs(Buffer.from([0xff])), { code: "LOCAL_PREVIEW_EVENT_INVALID" });
});

test("preflight validates, renders and checks exact reviewed sources without credentials or delivery", async () => {
  const order = [];
  const input = candidate();
  const env = authority(input);
  const report = await runLocalPaperPreview({ ...dependencyDefaults, mode: "validate", env,
    assertCandidate: (value, options) => {
      order.push("canonical");
      assert.deepEqual(value, input);
      assertLocalPreviewAuthorization(options.localPreviewAuthorization, value, options.now);
    },
    render: (value, options) => { order.push("render"); assert.ok(options.localPreviewAuthorization); },
    qa: async (value, options) => {
      order.push("source-qa");
      assert.deepEqual(value, input);
      assert.deepEqual([...options.allowedSourceUrls], input.desks.ai.story.sources.map(source => source.url));
      assert.equal(options.checkedAt, now.toISOString());
      assert.equal(options.checkLinks, true);
      assert.equal(options.timeoutMs, 8_000);
      assert.equal(options.maxRedirects, 0);
      assert.equal(options.temporalMode, "local-requested-preview");
      assert.equal(options.fetchImpl, undefined);
      assert.equal(options.requestImpl, undefined);
      assert.equal(options.lookupImpl, undefined);
      return structuredClone(pass);
    },
    send: async () => assert.fail("Validation must not send"),
  });
  assert.deepEqual(order, ["canonical", "render", "source-qa"]);
  assert.deepEqual(report, { status: "validated", editionDate: "2026-09-13", stories: 1, checkedSourceUrls: 2,
    provider: "ollama-local", model: "qwen3:30b-a3b", researchMethod: "curated-live-feeds",
    resendAccepted: false, dailyLedgerChanged: false, publicEditionCreated: false });
  assert.doesNotMatch(JSON.stringify(report), /synthetic-public-story|openai\.com|CANDIDATE|RESEND/);
});

test("send revalidates and passes opaque authority, real clock and the fixed local preview revision", async () => {
  const env = { ...authority(candidate()), RESEND_API_KEY: "synthetic-email-key", PERSONAL_PAPER_EMAIL: "owner@example.com" };
  let calls = 0;
  const report = await runLocalPaperPreview({ ...dependencyDefaults, mode: "send", env,
    send: async (value, options) => {
      calls++;
      assertLocalPreviewAuthorization(options.localPreviewAuthorization, value, now);
      assert.equal(options.previewRevision, LOCAL_PREVIEW.revision);
      assert.equal(options.previewConfirmation, LOCAL_PREVIEW.confirmation);
      assert.equal(options.previewNow, now);
      assert.equal(options.previewClock(), now);
      assert.equal(options.apiKey, env.RESEND_API_KEY);
      assert.equal(options.recipient, env.PERSONAL_PAPER_EMAIL);
      return { id: "synthetic-not-real" };
    },
  });
  assert.equal(calls, 1);
  assert.equal(report.resendAccepted, true);
  assert.equal(report.status, "sent");
  assert.doesNotMatch(JSON.stringify(report), /synthetic-email-key|owner@example|synthetic-not-real/);
});

test("missing authority, candidate changes, failed QA and expiry never reach the sender", async () => {
  let sends = 0;
  const options = { ...dependencyDefaults, mode: "send", env: { ...authority(candidate()),
    RESEND_API_KEY: "synthetic-email-key", PERSONAL_PAPER_EMAIL: "owner@example.com" },
    send: async () => { sends++; } };
  for (const override of [
    { GITHUB_TRIGGERING_ACTOR: "other" }, { GITHUB_REF: "refs/heads/other" }, { GITHUB_RUN_ATTEMPT: "2" },
    { LOCAL_PREVIEW_CONFIRMATION: "SEND PREVIEW 2026-09-13" }, { CANDIDATE_SHA256: "b".repeat(64) },
  ]) await assert.rejects(runLocalPaperPreview({ ...options, env: { ...options.env, ...override } }));
  for (const receipt of [null, { sourceCheck: { status: "failed", issues: [] } },
    { sourceCheck: { status: "passed", issues: [{ code: "warning" }] } }, { sourceCheck: { status: "passed" } }]) {
    await assert.rejects(runLocalPaperPreview({ ...options, qa: async () => receipt }), /LOCAL_PREVIEW_QA_FAILED/);
  }
  await assert.rejects(runLocalPaperPreview({ ...options, qa: async value => {
    value.desks.ai.story.id = "changed"; return structuredClone(pass);
  } }), /authorization is closed/);
  await assert.rejects(runLocalPaperPreview({ ...options, clock: () => new Date(LOCAL_PREVIEW.expiresAt) }),
    /authorization is closed/);
  await assert.rejects(runLocalPaperPreview({ ...options, env: authority(candidate()) }), /LOCAL_PREVIEW_CONFIGURATION/);
  assert.equal(sends, 0);
});

test("canonical or rendered copy rejection stops before public network requests", async () => {
  let network = 0;
  for (const dependency of ["assertCandidate", "render"]) {
    await assert.rejects(runLocalPaperPreview({ ...dependencyDefaults, mode: "validate", env: authority(candidate()),
      [dependency]: () => { throw new Error("Synthetic rejected copy"); },
      qa: async () => { network++; return structuredClone(pass); },
    }), /Synthetic rejected copy/);
  }
  assert.equal(network, 0);
});

test("source handoff rejects unknown hosts, identity mismatches, credentials, fragments and arbitrary shared feed paths", () => {
  for (const url of ["https://unreviewed.example/news", "http://openai.com/news", "https://name:pass@openai.com/news",
    "https://openai.com:444/news", "https://openai.com/news#fragment", "https://127.0.0.1/news",
    "https://feeds.feedburner.com/other-not-reviewed", "https://openai.com/news\nunsafe"]) {
    const value = candidate(); value.desks.ai.story.sources[0].url = url;
    assert.throws(() => localPreviewSources(value), /LOCAL_PREVIEW_SOURCES/);
  }
  const mismatch = candidate(); mismatch.desks.ai.story.sources[0].publisherKey = "microsoft";
  assert.throws(() => localPreviewSources(mismatch), /LOCAL_PREVIEW_SOURCES/);
  const feed = candidate(); feed.desks.ai.story.sources[1] = {
    url: "https://feeds.feedburner.com/GoogleAppsUpdates", relationship: "context", publisherKey: "google",
  };
  assert.equal(localPreviewSources(feed).length, 2);
  const tooMany = candidate(); tooMany.desks.ai.story.sources = Array.from({ length: 33 }, () => tooMany.desks.ai.story.sources[0]);
  assert.throws(() => localPreviewSources(tooMany), /LOCAL_PREVIEW_SOURCES/);
});

test("failure output never includes arbitrary exceptions, payloads or credential values", () => {
  const error = Object.assign(new Error("credential-leak and body"), { code: "SECRET_VALUE_DO_NOT_LOG" });
  assert.deepEqual(localPreviewFailureSummary(error), { code: "LOCAL_PREVIEW_FAILED", resendStatus: null, automaticSendRetry: false });
  assert.equal(localPreviewFailureSummary(new Error("Resend rejected personal email delivery with status 429.")).resendStatus, 429);
  assert.equal(localPreviewFailureSummary(new Error("Resend rejected personal email delivery with status 999.")).resendStatus, null);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/automation/local-paper-preview.mjs", import.meta.url)),
    "--invalid", "sensitive-argument"], { encoding: "utf8", env: { ...process.env, RESEND_API_KEY: "sensitive-credential" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /LOCAL_PREVIEW_MODE/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /sensitive-argument|sensitive-credential|\bat file:/);
});
