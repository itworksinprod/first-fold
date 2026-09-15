import assert from "node:assert/strict";
import test from "node:test";
import { checkLocalReviewer } from "../scripts/automation/check-local-reviewer.mjs";
import { reviewerHoldoutCases } from "./fixtures/reviewer-holdouts.mjs";
import { LOCAL_AI_MODEL, LOCAL_AI_PROVIDER, LOCAL_AI_URL } from "../scripts/automation/free/local-ai.mjs";

const expected = data => ({ reviews: data.drafts.map(({ draft, draftSha256, claimEvidence }) => {
  const item = reviewerHoldoutCases().find(item => item.draft.candidateId === draft.candidateId);
  return { candidateId: draft.candidateId, draftSha256,
    claimVerdicts: claimEvidence.map(({ claimIndex, claimSha256 }) => ({
      claimIndex, claimSha256, allCitedPassagesSupport: item.expected.claims[claimIndex] })),
    ...Object.fromEntries(["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"]
      .map(field => [field, item.expected[field] ?? true])) };
}) });
const response = editorialPayload => ({ editorialPayload, model: LOCAL_AI_MODEL, provider: LOCAL_AI_PROVIDER,
  requestSha256: "a".repeat(64), responseSha256: "b".repeat(64) });

test("local reviewer uses fresh holdouts without expected answers, one fixed call and no credentials", async () => {
  let calls = 0;
  const report = await checkLocalReviewer({ aiRequestImpl: async options => {
    calls++;
    assert.equal(options.model, LOCAL_AI_MODEL);
    assert.equal(options.maxTokens, 8_000);
    assert.equal(options.timeoutMs, 300_000);
    assert.equal(options.maxAttempts, 1);
    assert.equal(options.temperature, 0.6);
    assert.equal(options.maxRequestBytes, 70_000);
    assert.equal(options.maxResponseBytes, 100_000);
    assert.equal(options.responseFormat, "json_schema");
    assert.equal(options.apiToken, undefined);
    assert.equal(options.accountId, undefined);
    const data = JSON.parse(options.messages[1].content);
    assert.equal(data.drafts.length, 2);
    assert.doesNotMatch(JSON.stringify(options.messages), /"expected"|"caseId"/);
    const payload = expected(data);
    assert.equal(options.validatePayload(payload), true);
    return response(payload);
  } });
  assert.equal(calls, 1);
  assert.equal(report.status, "passed");
  assert.equal(report.requestedOutputTokens, 8_000);
  assert.equal(report.timeoutMs, 300_000);
  assert.ok(report.cases.every(item => item.passed));
  assert.deepEqual([report.cloudRequests, report.emailRequests], [0, 0]);
});

test("local review rejects blanket approvals, false rejections, hash mismatches and wrong provider identity", async () => {
  const mutations = [
    result => result.editorialPayload.reviews.forEach(review => {
      review.claimVerdicts.forEach(verdict => { verdict.allCitedPassagesSupport = true; });
      review.factsSupported = true;
    }),
    result => { result.editorialPayload.reviews[0].analysisSupported = false; },
    result => { result.editorialPayload.reviews[0].draftSha256 = "f".repeat(64); },
    result => { result.provider = "cloudflare-workers-ai"; },
    result => { result.model = "remote-model"; },
  ];
  for (const mutate of mutations) {
    let calls = 0;
    const report = await checkLocalReviewer({ aiRequestImpl: async options => {
      calls++;
      const result = response(expected(JSON.parse(options.messages[1].content)));
      mutate(result);
      return result;
    } });
    assert.equal(calls, 1);
    assert.equal(report.status, "failed");
  }
});

test("real local adapter is loopback-only and excludes reasoning from diagnostic output", async () => {
  let calls = 0;
  const report = await checkLocalReviewer({ fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, LOCAL_AI_URL);
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.authorization, undefined);
    const request = JSON.parse(options.body);
    assert.equal(request.think, true);
    assert.equal(request.options.num_predict, 8_000);
    return new Response(JSON.stringify({ model: LOCAL_AI_MODEL, done: true, done_reason: "stop",
      prompt_eval_count: 500, eval_count: 1200,
      message: { role: "assistant", content: JSON.stringify(expected(JSON.parse(request.messages[1].content))),
        thinking: "PRIVATE_REASONING_NOT_OUTPUT" } }), { headers: { "content-type": "application/json" } });
  } });
  assert.equal(calls, 1);
  assert.equal(report.status, "passed");
  assert.deepEqual(report.usage, { prompt_tokens: 500, completion_tokens: 1200, total_tokens: 1700 });
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_REASONING|claimSha256|sourceContext|evidenceId/);
});

test("caller options cannot change the fixed diagnostic budget, model or transport safeguards", async () => {
  let calls = 0;
  const report = await checkLocalReviewer({ maxTokens: 16_000, timeoutMs: 600_000,
    maxAttempts: 2, model: "unrequested-cloud-model", apiToken: "PRIVATE_UNUSED_TOKEN",
    aiRequestImpl: async options => {
      calls++;
      assert.equal(options.maxTokens, 8_000);
      assert.equal(options.timeoutMs, 300_000);
      assert.equal(options.maxAttempts, 1);
      assert.equal(options.model, LOCAL_AI_MODEL);
      assert.equal(options.maxRequestBytes, 70_000);
      assert.equal(options.maxResponseBytes, 100_000);
      assert.equal(options.apiToken, undefined);
      return response(expected(JSON.parse(options.messages[1].content)));
    },
  });
  assert.equal(calls, 1);
  assert.equal(report.status, "passed");
  assert.equal(report.requestedOutputTokens, 8_000);
  assert.equal(report.timeoutMs, 300_000);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_UNUSED_TOKEN|unrequested-cloud-model/);
});

test("native output exceeding the fixed diagnostic cap stays red with no completed verdict", async () => {
  let calls = 0;
  const report = await checkLocalReviewer({ fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, LOCAL_AI_URL);
    const request = JSON.parse(options.body);
    assert.equal(request.options.num_predict, 8_000);
    return new Response(JSON.stringify({ model: LOCAL_AI_MODEL, done: true, done_reason: "stop",
      prompt_eval_count: 500, eval_count: 8_001,
      message: { role: "assistant", content: JSON.stringify(expected(JSON.parse(request.messages[1].content))) } }),
    { headers: { "content-type": "application/json" } });
  } });
  assert.equal(calls, 1);
  assert.equal(report.status, "failed");
  assert.equal(report.code, "LOCAL_AI_EDITORIAL_FORMAT_INVALID");
  assert.equal(report.formatReason, "OUTPUT_TOKEN_LIMIT");
  assert.equal(report.requestedOutputTokens, 8_000);
  assert.ok(report.cases.every(item => item.actual === null && item.passed === false));
});

test("local timeouts and errors stay red, bounded and sanitized without retries", async () => {
  for (const code of ["LOCAL_AI_CLIENT_TIMEOUT", "UNTRUSTED_PRIVATE_CODE"]) {
    let calls = 0;
    const report = await checkLocalReviewer({ aiRequestImpl: async () => {
      calls++;
      throw Object.assign(new Error("PRIVATE_RESPONSE_NEVER_LOG"), { code });
    } });
    assert.equal(calls, 1);
    assert.equal(report.status, "failed");
    assert.equal(report.code, code === "LOCAL_AI_CLIENT_TIMEOUT" ? code : "LOCAL_REVIEW_FAILED");
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_RESPONSE|UNTRUSTED_PRIVATE_CODE/);
  }
});

test("local diagnostic reports only allowlisted format reasons, never provider text", async () => {
  for (const formatReason of ["OUTPUT_TOKEN_LIMIT", "SCHEMA_VALIDATION_FAILED", "PRIVATE_PROVIDER_TEXT"]) {
    let calls = 0;
    const report = await checkLocalReviewer({ aiRequestImpl: async () => {
      calls++;
      throw Object.assign(new Error("PRIVATE_RESPONSE"), {
        code: "LOCAL_AI_EDITORIAL_FORMAT_INVALID", formatReason });
    } });
    assert.equal(calls, 1);
    assert.equal(report.status, "failed");
    assert.equal(report.formatReason, formatReason === "PRIVATE_PROVIDER_TEXT" ? undefined : formatReason);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_/);
  }
});
