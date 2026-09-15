import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { checkLocalReviewer } from "../scripts/automation/check-local-reviewer.mjs";
import { reviewerHoldoutCases } from "./fixtures/reviewer-holdouts.mjs";
import { buildLocalAiRequest, LOCAL_AI_MODEL, LOCAL_AI_PROVIDER, LOCAL_AI_URL } from "../scripts/automation/free/local-ai.mjs";

const expected = data => ({ reviews: data.drafts.map(({ draft, draftSha256, claimEvidence }) => {
  const item = reviewerHoldoutCases().find(item => item.draft.candidateId === draft.candidateId);
  return { candidateId: draft.candidateId, draftSha256,
    claimVerdicts: claimEvidence.map(({ claimIndex, claimSha256 }) => ({
      claimIndex, claimSha256, allCitedPassagesSupport: item.expected.claims[claimIndex] })),
    ...Object.fromEntries(["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"]
      .map(field => [field, item.expected[field] ?? true])) };
}) });
const fingerprint = body => createHash("sha256").update(JSON.stringify({ provider: LOCAL_AI_PROVIDER,
  model: LOCAL_AI_MODEL, body })).digest("hex");
const response = (editorialPayload, options) => ({ editorialPayload, model: LOCAL_AI_MODEL, provider: LOCAL_AI_PROVIDER,
  requestSha256: fingerprint(buildLocalAiRequest(options).body), responseSha256: "b".repeat(64) });

test("local reviewer uses fresh holdouts without expected answers, one fixed call and no credentials", async () => {
  let calls = 0;
  const report = await checkLocalReviewer({ aiRequestImpl: async options => {
    calls++;
    assert.equal(options.model, LOCAL_AI_MODEL);
    assert.equal(options.maxTokens, 8_000);
    assert.equal(options.timeoutMs, 300_000);
    assert.equal(options.maxAttempts, 1);
    assert.equal(options.temperature, 0.6);
    assert.equal(options.think, true);
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
    return response(payload, options);
  } });
  assert.equal(calls, 1);
  assert.equal(report.status, "passed");
  assert.equal(report.requestedOutputTokens, 8_000);
  assert.equal(report.timeoutMs, 300_000);
  assert.equal(report.requestedThinking, true);
  assert.match(report.requestSha256, /^[a-f0-9]{64}$/u);
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
    result => { result.requestSha256 = "f".repeat(64); },
  ];
  for (const mutate of mutations) {
    let calls = 0;
    const report = await checkLocalReviewer({ aiRequestImpl: async options => {
      calls++;
      const result = response(expected(JSON.parse(options.messages[1].content)), options);
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
      return response(expected(JSON.parse(options.messages[1].content)), options);
    },
  });
  assert.equal(calls, 1);
  assert.equal(report.status, "passed");
  assert.equal(report.requestedOutputTokens, 8_000);
  assert.equal(report.timeoutMs, 300_000);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_UNUSED_TOKEN|unrequested-cloud-model/);
});

test("direct synthetic mode is explicit, hash-bound and otherwise identical to the thinking request", async () => {
  const requests = [];
  const reports = [];
  for (const think of [true, false]) {
    let calls = 0;
    const report = await checkLocalReviewer({ think, fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, LOCAL_AI_URL);
      const request = JSON.parse(options.body);
      requests.push(request);
      assert.equal(request.think, think);
      assert.equal(request.options.num_predict, 8_000);
      assert.equal(request.options.num_ctx, 32_768);
      assert.equal(request.stream, false);
      return new Response(JSON.stringify({ model: LOCAL_AI_MODEL, done: true, done_reason: "stop",
        prompt_eval_count: 500, eval_count: 1200,
        message: { role: "assistant", content: JSON.stringify(expected(JSON.parse(request.messages[1].content))) } }),
      { headers: { "content-type": "application/json" } });
    } });
    reports.push(report);
    assert.equal(calls, 1);
    assert.equal(report.status, "passed");
    assert.equal(report.requestedThinking, think);
    assert.equal(report.requestSha256, fingerprint(requests.at(-1)));
    assert.equal(report.timeoutMs, 300_000);
    assert.deepEqual([report.cloudRequests, report.emailRequests], [0, 0]);
  }
  assert.deepEqual(requests[1], { ...requests[0], think: false });
  assert.notEqual(reports[0].requestSha256, reports[1].requestSha256);
});

test("reasoning-json diagnostic only removes native format and appends the exact schema to the trusted system prompt", async () => {
  const requests = [], reports = [];
  for (const formatMode of ["native", "prompt-json"]) {
    let calls = 0;
    const report = await checkLocalReviewer({ formatMode, fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, LOCAL_AI_URL);
      assert.equal(options.headers.authorization, undefined);
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      const request = JSON.parse(options.body);
      requests.push(request);
      assert.equal(request.think, true);
      assert.equal(request.options.num_predict, 8_000);
      assert.equal(request.options.num_ctx, 32_768);
      return new Response(JSON.stringify({ model: LOCAL_AI_MODEL, done: true, done_reason: "stop",
        prompt_eval_count: 500, eval_count: 1200,
        message: { role: "assistant", content: JSON.stringify(expected(JSON.parse(request.messages[1].content))) } }),
      { headers: { "content-type": "application/json" } });
    } });
    reports.push(report);
    assert.equal(calls, 1);
    assert.equal(report.status, "passed");
    assert.equal(report.requestedThinking, true);
    assert.equal(report.requestedFormatMode, formatMode);
    assert.equal(report.requestSha256, fingerprint(requests.at(-1)));
    assert.equal(report.timeoutMs, 300_000);
    assert.deepEqual([report.cloudRequests, report.emailRequests], [0, 0]);
  }
  const { format: exactSchema, ...nativeBody } = requests[0];
  assert.deepEqual(requests[1], { ...nativeBody, messages: [
    { ...nativeBody.messages[0], content: `${nativeBody.messages[0].content}\n\nReturn only one JSON object matching this exact JSON schema:\n${JSON.stringify(exactSchema)}` },
    ...nativeBody.messages.slice(1),
  ] });
  assert.notEqual(reports[0].requestSha256, reports[1].requestSha256);
});

test("reasoning-json transport retains strict final JSON, exact schema and every quality veto with no retry", async () => {
  for (const kind of ["thinking-only", "fenced", "extra-field", "wrong-hash", "blanket-approval", "false-control", "over-cap"]) {
    let calls = 0;
    const report = await checkLocalReviewer({ formatMode: "prompt-json", fetchImpl: async (_url, options) => {
      calls++;
      const request = JSON.parse(options.body);
      assert.equal(Object.hasOwn(request, "format"), false);
      const payload = expected(JSON.parse(request.messages[1].content));
      if (kind === "extra-field") payload.extra = true;
      if (kind === "wrong-hash") payload.reviews[0].draftSha256 = "f".repeat(64);
      if (kind === "blanket-approval") payload.reviews.forEach(review => {
        review.claimVerdicts.forEach(verdict => { verdict.allCitedPassagesSupport = true; });
        review.factsSupported = true;
      });
      if (kind === "false-control") payload.reviews[0].analysisSupported = false;
      let content = JSON.stringify(payload);
      if (kind === "thinking-only") content = "";
      if (kind === "fenced") content = `\`\`\`json\n${content}\n\`\`\``;
      return new Response(JSON.stringify({ model: LOCAL_AI_MODEL, done: true, done_reason: "stop",
        prompt_eval_count: 500, eval_count: kind === "over-cap" ? 8_001 : 1200,
        message: { role: "assistant", content, thinking: "PRIVATE_REASONING" } }),
      { headers: { "content-type": "application/json" } });
    } });
    assert.equal(calls, 1, kind);
    assert.equal(report.status, "failed", kind);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_REASONING/);
  }
});

test("invalid format modes or nonthinking reasoning-json fail before inference without echoing input", async () => {
  for (const options of [{ formatMode: "prompt-json", think: false },
    ...[null, false, {}, "PRIVATE_UNTRUSTED_MODE"].map(formatMode => ({ formatMode }))]) {
    let calls = 0;
    const report = await checkLocalReviewer({ ...options, aiRequestImpl: async () => { calls++; } });
    assert.equal(calls, 0);
    assert.equal(report.modelRequests, 0);
    assert.equal(report.code, "LOCAL_AI_CONFIGURATION_INVALID");
    assert.equal(report.requestSha256, undefined);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_UNTRUSTED_MODE/);
  }
});

test("non-boolean thinking switches fail before any local request and are not echoed", async () => {
  for (const think of [null, 0, 1, "false", "PRIVATE_UNTRUSTED_MODE", {}]) {
    let calls = 0;
    const report = await checkLocalReviewer({ think, aiRequestImpl: async () => { calls++; } });
    assert.equal(calls, 0);
    assert.equal(report.modelRequests, 0);
    assert.equal(report.code, "LOCAL_AI_CONFIGURATION_INVALID");
    assert.equal(report.status, "failed");
    assert.equal(report.requestedThinking, undefined);
    assert.equal(report.requestSha256, undefined);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_UNTRUSTED_MODE/);
  }
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
  assert.deepEqual(report.outputDiagnostic, { doneReason: "stop", promptTokens: 500, completionTokens: 8_001,
    finalContentPresent: true, tokenLimitCause: "COMPLETION_COUNT_OVER_CAP" });
  assert.ok(report.cases.every(item => item.actual === null && item.passed === false));
});

test("native diagnostic distinguishes length stops without exposing response content or reasoning", async () => {
  for (const completionTokens of [8_000, 8_001]) {
    let calls = 0;
    const report = await checkLocalReviewer({ fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ model: LOCAL_AI_MODEL, done: true, done_reason: "length",
        prompt_eval_count: 500, eval_count: completionTokens,
        message: { role: "assistant", content: "PRIVATE_FINAL_CONTENT", thinking: "PRIVATE_REASONING" } }),
      { headers: { "content-type": "application/json" } });
    } });
    assert.equal(calls, 1);
    assert.equal(report.status, "failed");
    assert.equal(report.formatReason, "OUTPUT_TOKEN_LIMIT");
    assert.deepEqual(report.outputDiagnostic, { doneReason: "length", promptTokens: 500,
      completionTokens, finalContentPresent: true,
      tokenLimitCause: completionTokens > 8_000 ? "NATIVE_LENGTH_AND_COUNT_OVER_CAP" : "NATIVE_LENGTH" });
    assert.ok(report.cases.every(item => item.actual === null));
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|claimSha256|sourceContext|evidenceId/);
  }
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
        code: "LOCAL_AI_EDITORIAL_FORMAT_INVALID", formatReason,
        outputDiagnostic: { doneReason: "PRIVATE_REASON", promptTokens: 1e100,
          finalContentPresent: "PRIVATE_CONTENT", unexpected: "PRIVATE_FIELD" } });
    } });
    assert.equal(calls, 1);
    assert.equal(report.status, "failed");
    assert.equal(report.formatReason, formatReason === "PRIVATE_PROVIDER_TEXT" ? undefined : formatReason);
    assert.equal(report.outputDiagnostic, undefined);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_/);
  }
});
