import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertFreeReviewerAuthority, checkFreeReviewer } from "../scripts/automation/check-free-reviewer.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL, workersAiRunUrl } from "../scripts/automation/free/workers-ai.mjs";

const workflow = await readFile(new URL("../.github/workflows/free-reviewer-quality-check.yml", import.meta.url), "utf8");
const scriptUrl = new URL("../scripts/automation/check-free-reviewer.mjs", import.meta.url);
const script = await readFile(scriptUrl, "utf8");
const authority = { GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main",
  GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/free-reviewer-quality-check.yml@refs/heads/main",
  GITHUB_ACTOR: "itworksinprod", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1" };
const base = { env: authority, accountId: "0".repeat(32), apiToken: "synthetic-reviewer-test-token" };
const response = editorialPayload => ({ editorialPayload, provider: "cloudflare-workers-ai",
  model: DEFAULT_CLOUDFLARE_AI_MODEL, requestSha256: "a".repeat(64), responseSha256: "b".repeat(64),
  reasoning: "NEVER_OUTPUT_REASONING", headers: { authorization: "NEVER_OUTPUT_HEADERS" } });
function expectedPayload(data) {
  return { reviews: data.drafts.map(({ draft, draftSha256, claimEvidence }) => {
    const id = draft.candidateId;
    const claims = id === "review-fixture-b" ? [false, false] : id === "review-fixture-d" ? [false, true] : [true, true];
    return { candidateId: id, draftSha256, claimVerdicts: claimEvidence.map(({ claimIndex, claimSha256 }) => ({
      claimIndex, claimSha256, allCitedPassagesSupport: claims[claimIndex],
    })), factsSupported: !["review-fixture-b", "review-fixture-c"].includes(id),
    attributionAccurate: true, analysisSupported: id !== "review-fixture-c", usefulAndSpecific: true };
  }) };
}
const modelData = options => JSON.parse(options.messages[1].content);

test("reviewer evaluation rejects unauthorized contexts before credential checks or provider use", async () => {
  assert.doesNotThrow(() => assertFreeReviewerAuthority(authority));
  let calls = 0;
  for (const field of Object.keys(authority)) {
    await assert.rejects(checkFreeReviewer({ ...base, accountId: "invalid", apiToken: "",
      env: { ...authority, [field]: "untrusted" }, aiRequestImpl: async () => { calls++; } }), /REVIEW_EVAL_AUTHORITY_REJECTED/);
  }
  for (const override of [{ accountId: "invalid" }, { apiToken: "" }, { apiToken: " leading" },
    { apiToken: "line\nbreak" }, { apiToken: "x".repeat(4_097) }, { model: "@cf/qwen/qwen3-30b-a3b-fp8" },
    { model: "gpt-5" }, { model: "qwen3:30b-a3b" }, { model: "@cf/unapproved/model" }]) {
    await assert.rejects(checkFreeReviewer({ ...base, ...override, aiRequestImpl: async () => { calls++; } }), /REVIEW_EVAL_CONFIGURATION_INVALID/);
  }
  assert.equal(calls, 0);
});

test("one bounded default-Llama request evaluates four opaque synthetic cases without answer labels or extra capabilities", async () => {
  let calls = 0;
  const report = await checkFreeReviewer({ ...base, aiRequestImpl: async options => {
    calls++;
    assert.equal(options.model, DEFAULT_CLOUDFLARE_AI_MODEL);
    assert.equal(options.maxTokens, 1_800);
    assert.equal(options.temperature, 0.1);
    assert.equal(options.maxAttempts, 1);
    assert.equal(options.maxRequestBytes, 70_000);
    assert.equal(options.maxResponseBytes, 100_000);
    assert.equal(options.timeoutMs, 90_000);
    assert.equal(options.responseFormat, "json_schema");
    assert.equal(options.onPrivateFailure, undefined);
    const data = modelData(options);
    assert.deepEqual(data.drafts.map(item => item.draft.candidateId),
      ["review-fixture-a", "review-fixture-b", "review-fixture-c", "review-fixture-d"]);
    assert.equal(data.dossiers.length, 4);
    assert.doesNotMatch(JSON.stringify(options.messages), /supported-control|wrong-facts-and-prerequisite|unsupported-benefit|irrelevant-extra-citation|"expected"/);
    const payload = expectedPayload(data);
    assert.equal(options.validatePayload(payload), true);
    return response(payload);
  } });
  assert.equal(calls, 1);
  assert.equal(report.status, "passed");
  assert.equal(report.model, DEFAULT_CLOUDFLARE_AI_MODEL);
  assert.equal(report.code, null);
  assert.ok(report.cases.every(item => item.passed));
  assert.deepEqual([report.modelRequests, report.maxModelRequests, report.requestedOutputTokens], [1, 1, 1_800]);
  assert.deepEqual([report.networkRequests, report.researchQueries, report.emailRequests], [0, 0, 0]);
  assert.doesNotMatch(JSON.stringify(report), /Harbor Agent|Beacon Console|maintenance endpoint|NEVER_OUTPUT|synthetic-reviewer-test-token|claimSha256|draftSha256|api\.cloudflare/);
});

test("blanket approval, false rejection, missed prerequisite, invented promotion and irrelevant citation all make the check red", async () => {
  const mutateCases = [
    payload => payload.reviews.forEach(review => {
      review.claimVerdicts.forEach(claim => { claim.allCitedPassagesSupport = true; });
      for (const field of ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"]) review[field] = true;
    }),
    payload => { payload.reviews[0].claimVerdicts[0].allCitedPassagesSupport = false; },
    payload => { payload.reviews[0].analysisSupported = false; },
    payload => { payload.reviews[1].claimVerdicts[1].allCitedPassagesSupport = true; },
    payload => { payload.reviews[2].analysisSupported = true; },
    payload => { payload.reviews[2].factsSupported = true; },
    payload => { payload.reviews[3].claimVerdicts[0].allCitedPassagesSupport = true; },
  ];
  for (const mutate of mutateCases) {
    let calls = 0;
    const report = await checkFreeReviewer({ ...base, aiRequestImpl: async options => {
      calls++;
      const payload = expectedPayload(modelData(options)); mutate(payload); return response(payload);
    } });
    assert.equal(calls, 1);
    assert.equal(report.status, "failed");
    assert.equal(report.code, "REVIEW_EVAL_VERDICT_MISMATCH");
    assert.ok(report.cases.some(item => !item.passed));
  }
});

test("malformed verdicts, wrong bindings and provider provenance cannot turn an evaluation green", async () => {
  for (const mutate of [
    payload => { payload.reviews[0].draftSha256 = "f".repeat(64); },
    payload => { payload.reviews[0].claimVerdicts[0].claimSha256 = "f".repeat(64); },
    payload => { payload.reviews[0].claimVerdicts[1].claimIndex = 0; },
    payload => { payload.reviews[0].claimVerdicts[0].allCitedPassagesSupport = "true"; },
    payload => { payload.reviews.push(payload.reviews[0]); },
    payload => { payload.reviews.pop(); },
    payload => { payload.extra = "UNTRUSTED_RAW_PAYLOAD"; },
  ]) {
    const report = await checkFreeReviewer({ ...base, aiRequestImpl: async options => {
      const payload = expectedPayload(modelData(options)); mutate(payload); return response(payload);
    } });
    assert.equal(report.status, "failed");
    assert.equal(report.code, "REVIEW_EVAL_CONTRACT_INVALID");
    assert.ok(report.cases.every(item => item.actual === null));
    assert.ok(!JSON.stringify(report).includes("UNTRUSTED_RAW_PAYLOAD"));
  }
  const report = await checkFreeReviewer({ ...base, aiRequestImpl: async options => ({
    ...response(expectedPayload(modelData(options))), model: "different-model",
  }) });
  assert.equal(report.code, "REVIEW_EVAL_PROVENANCE_INVALID");
  for (const model of [DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL]) {
    const mixed = await checkFreeReviewer({ ...base, model, aiRequestImpl: async options => ({
      ...response(expectedPayload(modelData(options))),
      model: model === DEFAULT_CLOUDFLARE_AI_MODEL ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL,
    }) });
    assert.equal(mixed.model, model);
    assert.equal(mixed.code, "REVIEW_EVAL_PROVENANCE_INVALID");
    assert.equal(mixed.modelRequests, 1);
  }
});

test("the diagnostic reasoning model preserves evidence and verdict rules with a fixed larger output cap and one call", async t => {
  const requests = [];
  const reports = [];
  for (const model of [DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL]) {
    const maxTokens = model === FREE_REASONING_WRITER_MODEL ? 4_000 : 1_800;
    let calls = 0;
    reports.push(await checkFreeReviewer({ ...base, model, fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, workersAiRunUrl(base.accountId, model));
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "error");
      const request = JSON.parse(options.body);
      assert.equal(request.max_tokens, maxTokens);
      assert.equal(request.temperature, 0.1);
      assert.equal(request.stream, false);
      assert.equal(request.response_format.type, "json_schema");
      const bytes = Buffer.byteLength(options.body);
      assert.ok(bytes <= 70_000);
      t.diagnostic(`${model}: ${bytes} UTF-8 request bytes; ${maxTokens} requested output tokens.`);
      requests.push(request);
      return new Response(JSON.stringify({ success: true, result: {
        response: JSON.stringify(expectedPayload(JSON.parse(request.messages[1].content))),
      } }), { headers: { "content-type": "application/json" } });
    } }));
    assert.equal(calls, 1);
    const report = reports.at(-1);
    assert.equal(report.model, model);
    assert.equal(report.status, "passed");
    assert.equal(report.modelRequests, 1);
    assert.equal(report.networkRequests, 1);
    assert.equal(report.requestedOutputTokens, maxTokens);
  }
  assert.deepEqual({ ...requests[0], max_tokens: 4_000 }, requests[1]);
  assert.deepEqual(reports[0].cases, reports[1].cases);
  let calls = 0;
  const wrongEndpoint = await checkFreeReviewer({ ...base, model: FREE_REASONING_WRITER_MODEL,
    fetchImpl: async () => { calls++; },
    aiRequestImpl: async options => options.fetchImpl(workersAiRunUrl(base.accountId, DEFAULT_CLOUDFLARE_AI_MODEL), {
      method: "POST", redirect: "error",
    }) });
  assert.equal(calls, 0);
  assert.equal(wrongEndpoint.code, "REVIEW_EVAL_ENDPOINT_REJECTED");
});

test("quota and malformed-output failures expose only whitelisted provider diagnostics and never retry", async () => {
  const scenarios = [
    { status: 429, envelope: { success: false, errors: [{ code: 3036, message: `Private quota detail ${base.apiToken}` }] },
      expected: { httpStatus: "429", providerCode: 3036, reason: "DAILY_FREE_ALLOCATION_EXHAUSTED" } },
    { status: 400, envelope: { success: false, errors: [{ code: 5000, message: "JSON Mode couldn't be met." }] },
      expected: { httpStatus: null, providerCode: null, formatReason: "PROVIDER_SCHEMA_UNSATISFIED" } },
    { status: 200, envelope: { success: true, result: { response: `MALFORMED_PRIVATE_TEXT ${base.apiToken}`,
      usage: { completion_tokens: 712 } } }, expected: { httpStatus: null, providerCode: null,
      formatReason: "PAYLOAD_JSON_INVALID", completionTokens: 712, requestedMaxTokens: 4_000 } },
  ];
  for (const scenario of scenarios) {
    let calls = 0;
    const report = await checkFreeReviewer({ ...base, model: FREE_REASONING_WRITER_MODEL, fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify(scenario.envelope), {
        status: scenario.status, headers: { "content-type": "application/json" },
      });
    } });
    assert.equal(calls, 1);
    assert.equal(report.modelRequests, 1);
    assert.equal(report.status, "failed");
    assert.equal(report.code, "REVIEW_EVAL_PROVIDER_FAILURE");
    assert.deepEqual(report.providerFailure, scenario.expected);
    assert.doesNotMatch(JSON.stringify(report), /Private quota detail|MALFORMED_PRIVATE_TEXT|synthetic-reviewer-test-token|JSON Mode couldn't/);
  }
});

test("the real adapter makes one fixed-endpoint request and never publishes its envelope or reasoning", async () => {
  let calls = 0;
  const report = await checkFreeReviewer({ ...base, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, workersAiRunUrl(base.accountId, DEFAULT_CLOUDFLARE_AI_MODEL));
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(new Headers(options.headers).get("authorization"), `Bearer ${base.apiToken}`);
    assert.ok(Buffer.byteLength(options.body) <= 70_000);
    const request = JSON.parse(options.body);
    assert.equal(request.max_tokens, 1_800);
    const payload = expectedPayload(JSON.parse(request.messages[1].content));
    return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload),
      reasoning: "NEVER_OUTPUT_NATIVE_REASONING" } }), { headers: { "content-type": "application/json" } });
  } });
  assert.equal(report.status, "passed");
  assert.equal(calls, 1);
  assert.equal(report.networkRequests, 1);
  assert.doesNotMatch(JSON.stringify(report), /NEVER_OUTPUT|synthetic-reviewer-test-token|sourceContextSha256/);
});

test("quota failures never retry, and endpoint or network-budget violations stop before another request", async () => {
  let calls = 0;
  const unavailable = await checkFreeReviewer({ ...base, aiRequestImpl: async () => {
    calls++;
    throw Object.assign(new Error(`429 quota error ${base.apiToken}`), { code: "UNTRUSTED_PROVIDER_TEXT" });
  } });
  assert.equal(calls, 1);
  assert.equal(unavailable.code, "REVIEW_EVAL_PROVIDER_FAILURE");
  assert.doesNotMatch(JSON.stringify(unavailable), /quota error|UNTRUSTED|synthetic-reviewer-test-token/);
  let network = 0;
  const external = await checkFreeReviewer({ ...base, fetchImpl: async () => { network++; },
    aiRequestImpl: async options => options.fetchImpl("https://example.com/forbidden", { method: "POST", redirect: "error" }) });
  assert.equal(network, 0);
  assert.equal(external.code, "REVIEW_EVAL_ENDPOINT_REJECTED");
  const exhausted = await checkFreeReviewer({ ...base,
    fetchImpl: async () => { network++; return new Response("{}"); },
    aiRequestImpl: async options => {
      await options.fetchImpl(workersAiRunUrl(base.accountId), { method: "POST", redirect: "error" });
      await options.fetchImpl(workersAiRunUrl(base.accountId), { method: "POST", redirect: "error" });
    } });
  assert.equal(network, 1);
  assert.equal(exhausted.networkRequests, 1);
  assert.equal(exhausted.code, "REVIEW_EVAL_REQUEST_BUDGET");
});

test("reviewer workflow is manual owner/main read-only, uses existing credentials, and cannot deliver or change production", () => {
  const trigger = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
  assert.match(trigger, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(trigger, /push:|schedule:|cron:|pull_request|workflow_run|inputs:/);
  for (const expression of ["github.repository == 'itworksinprod/first-fold'", "github.ref == 'refs/heads/main'",
    "github.actor == 'itworksinprod'", "github.run_attempt == 1"]) assert.ok(workflow.includes(expression));
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /^      contents: read$/m);
  assert.match(workflow, /^  group: personal-morning-paper$/m);
  assert.match(workflow, /^  cancel-in-progress: false$/m);
  assert.match(workflow, /persist-credentials: false/);
  const actions = [...workflow.matchAll(/uses:\s*(\S+)/gu)].map(match => match[1]);
  assert.equal(actions.length, 2);
  assert.ok(actions.every(action => /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/u.test(action)));
  assert.equal([...workflow.matchAll(/secrets\./gu)].length, 1);
  assert.match(workflow, /FREE_REVIEWER_MODEL: '@cf\/openai\/gpt-oss-120b'/);
  assert.ok(workflow.indexOf("Test synthetic reviewer boundaries") < workflow.indexOf("secrets.CLOUDFLARE_AI_API_TOKEN"));
  assert.doesNotMatch(workflow, /\bwrite\b|RESEND|OPENAI|TAVILY|PERSONAL_PAPER_EMAIL|upload-artifact|git push|git commit|deploy/);
  assert.doesNotMatch(script, /collectFreeResearch|synthesizeGroundedEditorial|sendPersonal|writeFile|readFile|TAVILY|RESEND|OPENAI_API/);
  const child = spawnSync(process.execPath, [fileURLToPath(scriptUrl), "extra-argument"], {
    env: authority, encoding: "utf8", timeout: 5_000, maxBuffer: 4_096,
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /REVIEW_EVAL_CONFIGURATION_INVALID/);
  assert.equal(child.stdout, "");
});
