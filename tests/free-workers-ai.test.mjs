import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  DEFAULT_CLOUDFLARE_AI_MODEL,
  WORKERS_AI_EDITORIAL_FORMAT_INVALID,
  WORKERS_AI_EDITORIAL_UNAVAILABLE,
  WORKERS_AI_PROVIDER,
  buildWorkersAiRequest,
  requestWorkersAiEditorial,
  resolveCloudflareAiModel,
  workersAiRunUrl,
  workersAiFailureDiagnostic,
} from "../scripts/automation/free/workers-ai.mjs";

const accountId = "6fd0b70bbeb0769801ddb19c8f1b4b10";
const apiToken = "cloudflare-test-token-never-log";
const messages = [
  { role: "system", content: "Return a bounded editorial object." },
  { role: "user", content: "Use only the normalized evidence bundle." },
];
const schema = {
  type: "object",
  additionalProperties: false,
  properties: { headline: { type: "string" } },
  required: ["headline"],
};
const payload = { headline: "A verified development" };

test("native malformed JSON reports bounded observed output usage without guessing truncation", async () => {
  for (const count of [71, 4_000, undefined, -1, 16_001, "4000", apiToken]) {
    let requests = 0;
    await assert.rejects(requestWorkersAiEditorial({ accountId, apiToken, messages, schema,
      maxTokens: 4_000, maxAttempts: 1, validatePayload: () => true,
      fetchImpl: async () => {
        requests++;
        return new Response(JSON.stringify({ success: true, result: {
          response: '{"unfinished":', usage: { completion_tokens: count, privateText: apiToken },
        } }), { headers: { "content-type": "application/json" } });
      },
    }), error => {
      const diagnostic = workersAiFailureDiagnostic(error);
      assert.equal(error.code, WORKERS_AI_EDITORIAL_FORMAT_INVALID);
      assert.equal(diagnostic.formatReason, "PAYLOAD_JSON_INVALID");
      if ([71, 4_000].includes(count)) {
        assert.equal(diagnostic.completionTokens, count);
        assert.equal(diagnostic.requestedMaxTokens, 4_000);
      } else assert.equal(Object.hasOwn(diagnostic, "completionTokens"), false);
      assert.doesNotMatch(JSON.stringify(diagnostic), /unfinished|privateText|cloudflare-test-token/);
      return true;
    });
    assert.equal(requests, 1);
  }
  assert.equal(Object.hasOwn(workersAiFailureDiagnostic({ completionTokens: 4_000,
    requestedMaxTokens: 4_000 }), "completionTokens"), false);
});

test("documented schema-mode refusal has an explicit sanitized format reason", async () => {
  await assert.rejects(requestWorkersAiEditorial({ accountId, apiToken, messages, schema,
    maxAttempts: 1, validatePayload: () => true, fetchImpl: async () => new Response(JSON.stringify({
      success: false, result: null, errors: [{ code: 5000, message: "JSON Mode couldn't be met." }],
    }), { status: 400, headers: { "content-type": "application/json" } }),
  }), error => {
    assert.equal(error.code, WORKERS_AI_EDITORIAL_FORMAT_INVALID);
    assert.equal(workersAiFailureDiagnostic(error).formatReason, "PROVIDER_SCHEMA_UNSATISFIED");
    return true;
  });
});

test("unavailable responses retain only documented status/code diagnostics without provider text", async () => {
  for (const [status, code] of [[429, 3036], [429, 3040], [403, 5035], [200, 3023]]) {
    let calls = 0;
    await assert.rejects(requestWorkersAiEditorial({ accountId, apiToken, messages, schema,
      validatePayload: () => true, maxAttempts: 1, fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify({ success: false, result: null,
          errors: [{ code, message: `sensitive provider text ${apiToken}` }] }),
        { status, headers: { "content-type": "application/json" } });
      } }), error => {
        assert.deepEqual(workersAiFailureDiagnostic(error), { httpStatus: String(status), providerCode: code,
          ...(code === 3036 ? { reason: "DAILY_FREE_ALLOCATION_EXHAUSTED" } : {}) });
        assert.doesNotMatch(JSON.stringify(error), /sensitive|cloudflare-test-token/);
        assert.doesNotMatch(error.message, /sensitive|cloudflare-test-token/);
        return true;
      });
    assert.equal(calls, 1);
  }
  for (const providerCode of ["3036", 999999, apiToken, null, undefined]) {
    assert.equal(workersAiFailureDiagnostic({ providerCode }).providerCode, null);
  }
});

test("documented numeric-string error codes normalize without widening public diagnostics", async () => {
  for (const [code, expected] of [["3036", 3036], ["3040", 3040], [" 3036", null], ["3036.0", null], ["9999", null]]) {
    await assert.rejects(requestWorkersAiEditorial(requestOptions({ maxAttempts: 1,
      fetchImpl: async () => new Response(JSON.stringify({ success: false, result: null,
        errors: [{ code, message: `private ${apiToken}` }] }), { status: 429, headers: { "content-type": "application/json" } }),
    })), (error) => {
      assert.deepEqual(workersAiFailureDiagnostic(error), { httpStatus: "429", providerCode: expected,
        ...(expected === 3036 ? { reason: "DAILY_FREE_ALLOCATION_EXHAUSTED" } : {}) });
      assert.doesNotMatch(error.message, /private|cloudflare-test-token/);
      return true;
    });
  }
});

const observedQuotaMessage = "AiError: AiError: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage. (c523e410-c7e7-41e5-b675-99919881a8a1)";

test("the exact observed 4006 quota wrapper exposes only a fixed safe reason", async () => {
  for (const code of [4006, "4006", 3036, "3036"]) {
    let calls = 0;
    await assert.rejects(requestWorkersAiEditorial(requestOptions({ maxAttempts: 1,
      fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify({ success: false, result: null,
          errors: [{ code, message: observedQuotaMessage }] }), { status: 429, headers: { "content-type": "application/json" } });
      },
    })), (error) => {
      assert.equal(error.code, WORKERS_AI_EDITORIAL_UNAVAILABLE);
      assert.equal(error.attemptCount, 1);
      assert.deepEqual(workersAiFailureDiagnostic(error), { httpStatus: "429",
        providerCode: Number(code) === 3036 ? 3036 : null, reason: "DAILY_FREE_ALLOCATION_EXHAUSTED" });
      assert.deepEqual(Object.keys(error), []);
      assert.doesNotMatch(JSON.stringify(workersAiFailureDiagnostic(error)), /AiError|neurons|c523e410|upgrade|4006/);
      assert.doesNotMatch(error.message, /AiError|neurons|c523e410|upgrade|4006/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("quota diagnosis rejects ambiguous codes, message near-matches, multiple errors and successful envelopes", async () => {
  const quotaError = { code: 4006, message: observedQuotaMessage };
  const failures = [
    [429, { success: false, errors: [{ code: 4006, message: "No more data centers to forward the request to" }] }],
    [429, { success: false, errors: [{ code: 4006, message: `arbitrary ${apiToken}` }] }],
    [429, { success: false, errors: [{ code: 4006, message: observedQuotaMessage.replace("10,000", "20,000") }] }],
    [429, { success: false, errors: [{ code: 4006, message: `${observedQuotaMessage} ` }] }],
    [429, { success: false, errors: [{ code: 4006, message: observedQuotaMessage.replace("AiError: AiError: ", "") }] }],
    [429, { success: false, errors: [{ code: 4006, message: observedQuotaMessage.replace("c523e410-c7e7-41e5-b675-99919881a8a1", apiToken) }] }],
    [429, { success: false, errors: [{ code: 3040, message: observedQuotaMessage }] }],
    [429, { success: false, errors: [{ code: "04006", message: observedQuotaMessage }] }],
    [429, { success: false, errors: [quotaError, { code: 3040, message: "Out of capacity" }] }],
    [429, { success: false, errors: [{ code: 3036 }, { code: 3036 }] }],
    [429, { success: false, result: { response: payload }, errors: [quotaError] }],
    [429, { success: true, result: { response: payload }, errors: [quotaError] }],
    [429, { errors: [quotaError] }],
    [200, { success: false, errors: [quotaError] }],
    [403, { success: false, errors: [quotaError] }],
    [200, { success: false, errors: [{ code: 3036 }] }],
  ];
  for (const [status, envelope] of failures) {
    await assert.rejects(requestWorkersAiEditorial(requestOptions({ maxAttempts: 1,
      fetchImpl: async () => new Response(JSON.stringify(envelope), { status, headers: { "content-type": "application/json" } }),
    })), (error) => {
      assert.equal(Object.hasOwn(workersAiFailureDiagnostic(error), "reason"), false);
      assert.doesNotMatch(error.message, /AiError|c523e410|cloudflare-test-token/);
      return true;
    });
  }
  const success = await requestWorkersAiEditorial(requestOptions());
  assert.deepEqual(success.editorialPayload, payload);
  assert.equal(Object.hasOwn(success, "reason"), false);
  assert.equal(Object.hasOwn(workersAiFailureDiagnostic({ httpStatus: 429, failureReason: apiToken }), "reason"), false);
});

test("private failure hook captures only redacted bounded error data and safe response identifiers", async () => {
  const records = [];
  await assert.rejects(requestWorkersAiEditorial(requestOptions({ maxAttempts: 1,
    onPrivateFailure: (record) => { records.push(record); },
    fetchImpl: async () => new Response(JSON.stringify({ success: false,
      errors: [{ code: "3036", message: `Quota exceeded near ${apiToken}, again ${apiToken}.`,
        reasoning: "do not capture reasoning", request: { headers: { authorization: apiToken } } }],
      result: { response: "do not capture a completion", reasoning_content: "private model thought" },
      messages: ["do not capture messages"], request: { messages, headers: { authorization: apiToken } },
    }), { status: 429, headers: { "content-type": "application/json", "cf-ray": "a12bc-LHR",
      "x-request-id": "request-123", "retry-after": "60", "authorization": apiToken, "x-secret": apiToken } }),
  })), (error) => {
    assert.equal(error.code, WORKERS_AI_EDITORIAL_UNAVAILABLE);
    assert.equal(error.providerCode, 3036);
    assert.equal(error.attemptCount, 1);
    assert.doesNotMatch(JSON.stringify(error), /Quota exceeded|cloudflare-test-token/);
    assert.doesNotMatch(error.message, /Quota exceeded|cloudflare-test-token/);
    return true;
  });
  assert.equal(records.length, 1);
  assert.equal(Object.isFrozen(records[0]), true);
  assert.deepEqual(Object.keys(records[0]).sort(), ["status", "contentType", "cfRay", "requestId", "retryAfter", "bodyText", "bodyTruncated"].sort());
  assert.deepEqual(records[0], { status: 429, contentType: "application/json", cfRay: "a12bc-LHR",
    requestId: "request-123", retryAfter: "60", bodyTruncated: false,
    bodyText: JSON.stringify({ success: false, errors: [{ message: "Quota exceeded near [REDACTED], again [REDACTED].", code: "3036" }] }),
  });
  assert.doesNotMatch(JSON.stringify(records), /cloudflare-test-token|reasoning|do not capture|private model thought|authorization|normalized evidence/);
});

test("private error body cap is UTF-8 bounded and redacts before cutting the token boundary", async () => {
  let record;
  await assert.rejects(requestWorkersAiEditorial(requestOptions({ maxAttempts: 1,
    onPrivateFailure: (value) => { record = value; },
    fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [{ code: 3040,
      message: `${"x".repeat(8_100)}${apiToken}${"😀".repeat(5_000)}` }] }),
    { status: 429, headers: { "content-type": "application/json" } }),
  })), /usable editorial response/);
  assert.equal(record.bodyTruncated, true);
  assert.ok(Buffer.byteLength(record.bodyText, "utf8") <= 8_192);
  assert.ok(record.bodyText.includes("[REDACTED]"));
  assert.doesNotMatch(record.bodyText, /cloudflare-test-token/);
});

test("private hook reads small gateway text without changing non-JSON failure classification", async () => {
  let calls = 0;
  const records = [];
  await assert.rejects(requestWorkersAiEditorial(requestOptions({ maxAttempts: 2,
    onPrivateFailure: async (record) => { records.push(record); },
    fetchImpl: async () => {
      calls++;
      return new Response(`Upstream rate limited. Credential: ${apiToken}`, { status: 429,
        headers: { "content-type": "text/plain; charset=utf-8", "cf-ray": apiToken,
          "x-request-id": "too long ".repeat(100), "retry-after": `60; token=${apiToken}` } });
    },
  })), (error) => {
    assert.equal(error.message, "Cloudflare Workers AI request failed with HTTP 429.");
    assert.deepEqual(Object.keys(error), []);
    return true;
  });
  assert.equal(calls, 2);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], { status: 429, contentType: "text/plain; charset=utf-8",
    cfRay: null, requestId: null, retryAfter: null, bodyText: "Upstream rate limited. Credential: [REDACTED]", bodyTruncated: false });
});

test("oversized and malformed error bodies cannot expose arbitrary model output through diagnostics", async () => {
  for (const [body, contentType, expected, truncated] of [
    ["x".repeat(8_193), "text/plain", null, true],
    [JSON.stringify({ success: false, errors: [{ message: "x".repeat(500) }] }), "application/json", null, true],
    ['{"errors":[],"result":{"reasoning":"private unfinished', "application/json", "[omitted malformed JSON error body]", false],
    [JSON.stringify({ success: true, result: { response: "private successful model text" } }), "application/json", "[omitted successful result envelope]", false],
  ]) {
    let record;
    await assert.rejects(requestWorkersAiEditorial(requestOptions({ maxAttempts: 1,
      maxResponseBytes: body.length > 500 && contentType === "application/json" ? 100 : 10_000,
      onPrivateFailure: (value) => { record = value; },
      fetchImpl: async () => new Response(body, { status: 429, headers: { "content-type": contentType } }),
    })));
    assert.equal(record.bodyText, expected);
    assert.equal(record.bodyTruncated, truncated);
    assert.doesNotMatch(JSON.stringify(record), /private unfinished|private successful model text/);
  }
});

test("private callback exceptions and rejections never change provider failures or retries", async () => {
  for (const onPrivateFailure of [() => { throw new Error(apiToken); }, async () => { throw new Error(apiToken); }]) {
    let calls = 0;
    await assert.rejects(requestWorkersAiEditorial(requestOptions({ maxAttempts: 2, onPrivateFailure,
      fetchImpl: async () => { calls++; return new Response(JSON.stringify({ success: false,
        errors: [{ code: 3040, message: "No available capacity" }] }), { status: 429, headers: { "content-type": "application/json" } }); },
    })), (error) => {
      assert.equal(error.code, WORKERS_AI_EDITORIAL_UNAVAILABLE);
      assert.equal(error.providerCode, 3040);
      assert.equal(error.attemptCount, 2);
      assert.doesNotMatch(error.message, /cloudflare-test-token/);
      return true;
    });
    assert.equal(calls, 2);
  }
});

test("a hung private sink has a fixed deadline and cannot replace the provider failure", async () => {
  let calls = 0;
  await assert.rejects(requestWorkersAiEditorial(requestOptions({ maxAttempts: 1,
    onPrivateFailure: () => new Promise(() => {}),
    fetchImpl: async () => { calls++; return new Response("Limited", { status: 429, headers: { "content-type": "text/plain" } }); },
  })), /request failed with HTTP 429/);
  assert.equal(calls, 1);
});

test("a hung gateway diagnostic body cannot cause a timeout or authentication retry", async () => {
  let calls = 0;
  let cancelled = false;
  let record;
  await assert.rejects(requestWorkersAiEditorial(requestOptions({ maxAttempts: 2, timeoutMs: 10,
    onPrivateFailure: (value) => { record = value; },
    fetchImpl: async () => {
      calls++;
      return { ok: false, status: 401, headers: new Headers({ "content-type": "text/plain" }),
        body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: () => { cancelled = true; } }) } };
    },
  })), /request failed with HTTP 401/);
  assert.equal(calls, 1);
  assert.equal(cancelled, true);
  assert.equal(record.bodyText, null);
  assert.equal(record.status, 401);
});

test("private hook never receives successful inference content or local validation failures", async () => {
  let calls = 0;
  const onPrivateFailure = () => { calls++; };
  assert.deepEqual((await requestWorkersAiEditorial(requestOptions({ onPrivateFailure }))).editorialPayload, payload);
  await assert.rejects(requestWorkersAiEditorial(requestOptions({ onPrivateFailure, validatePayload: () => false })), /local schema validation/);
  await assert.rejects(requestWorkersAiEditorial(requestOptions({ onPrivateFailure,
    fetchImpl: async () => cloudflareResponse(`{"headline":"private broken model text ${apiToken}`),
  })), /not valid JSON/);
  assert.equal(calls, 0);
});

test("default failures do not read non-JSON gateway text or publicly disclose diagnostics", async () => {
  let consumed = false;
  let cancelled = false;
  await assert.rejects(requestWorkersAiEditorial(requestOptions({ maxAttempts: 1,
    fetchImpl: async () => ({ ok: false, status: 429, headers: new Headers({ "content-type": "text/plain" }),
      body: { cancel: async () => { cancelled = true; }, getReader: () => { consumed = true; throw new Error(apiToken); } } }),
  })), (error) => {
    assert.equal(error.message, "Cloudflare Workers AI request failed with HTTP 429.");
    assert.deepEqual(Object.keys(error), []);
    return true;
  });
  assert.equal(consumed, false);
  assert.equal(cancelled, true);
  await assert.rejects(requestWorkersAiEditorial(requestOptions({ onPrivateFailure: "print" })), /private diagnostic function/);
});

function cloudflareResponse(resultResponse = payload, options = {}) {
  return new Response(JSON.stringify({
    success: true,
    errors: [],
    messages: [],
    result: {
      response: resultResponse,
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      ...options.result,
    },
  }), {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cf-ray": "test-ray-id",
      ...options.headers,
    },
  });
}

function cloudflareChatCompletion(content = JSON.stringify(payload), options = {}) {
  return new Response(JSON.stringify({
    success: true,
    errors: [],
    messages: [],
    result: {
      id: "chatcmpl-workers-ai-response-id",
      object: "chat.completion",
      created: 1_787_428_800,
      model: DEFAULT_CLOUDFLARE_AI_MODEL,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content,
          refusal: null,
          ...options.message,
        },
        finish_reason: "stop",
        ...options.choice,
      }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      ...options.result,
    },
  }), {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cf-ray": "test-ray-id",
      ...options.headers,
    },
  });
}

function requestOptions(overrides = {}) {
  return {
    accountId,
    apiToken,
    messages,
    schema,
    validatePayload: (value) => ({
      valid: typeof value?.headline === "string" && value.headline.length > 0,
      issues: [],
    }),
    fetchImpl: async () => cloudflareResponse(),
    sleepImpl: async () => {},
    ...overrides,
  };
}

test("the free adapter builds Cloudflare's bounded JSON-schema Execute Model contract", () => {
  const request = buildWorkersAiRequest({ messages, schema });
  assert.equal(request.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  assert.deepEqual(request.body, {
    messages,
    response_format: { type: "json_schema", json_schema: schema },
    max_tokens: 16_000,
    temperature: 0.2,
    stream: false,
  });
  assert.equal(
    workersAiRunUrl(accountId, request.model),
    "https://api.cloudflare.com/client/v4/accounts/6fd0b70bbeb0769801ddb19c8f1b4b10/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  );
  assert.equal(resolveCloudflareAiModel(undefined), DEFAULT_CLOUDFLARE_AI_MODEL);
  assert.throws(
    () => resolveCloudflareAiModel("gpt-oss-120b"),
    /Cloudflare-hosted @cf model id/,
  );
  assert.throws(
    () => resolveCloudflareAiModel("@cf/meta/llama-3.1-8b-instruct"),
    /not approved for the hard-\$0 pilot/,
  );
});

test("the free adapter supports JSON-object correction while retaining local schema validation", async () => {
  const request = buildWorkersAiRequest({
    messages,
    schema,
    responseFormat: "json_object",
  });
  assert.deepEqual(request.body.response_format, { type: "json_object" });
  assert.equal(Object.hasOwn(request.body.response_format, "json_schema"), false);
  assert.throws(
    () => buildWorkersAiRequest({ messages, responseFormat: "json_object" }),
    /response schema must be an object/,
  );
  assert.throws(
    () => buildWorkersAiRequest({ messages, schema, responseFormat: "text" }),
    /responseFormat must be json_schema or json_object/,
  );

  let sentBody;
  let validatedPayload;
  const result = await requestWorkersAiEditorial(requestOptions({
    responseFormat: "json_object",
    validatePayload: (value) => {
      validatedPayload = value;
      return { valid: value?.headline === payload.headline, issues: [] };
    },
    fetchImpl: async (_url, init) => {
      sentBody = JSON.parse(init.body);
      return cloudflareResponse();
    },
  }));

  assert.deepEqual(sentBody.response_format, { type: "json_object" });
  assert.equal(Object.hasOwn(sentBody.response_format, "json_schema"), false);
  assert.deepEqual(validatedPayload, payload);
  assert.deepEqual(result.editorialPayload, payload);
});

test("the free adapter returns only a locally validated result with safe provenance", async () => {
  let sent;
  let validated;
  const result = await requestWorkersAiEditorial(requestOptions({
    validatePayload: (value) => {
      validated = value;
      return true;
    },
    fetchImpl: async (url, init) => {
      sent = { url, init };
      return cloudflareResponse(payload, { result: { id: "workers-ai-response-id" } });
    },
  }));

  assert.deepEqual(validated, payload);
  assert.deepEqual(result.editorialPayload, payload);
  assert.equal(result.responseId, "workers-ai-response-id");
  assert.equal(result.provider, WORKERS_AI_PROVIDER);
  assert.equal(result.model, DEFAULT_CLOUDFLARE_AI_MODEL);
  assert.deepEqual(result.usage, {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
  });
  assert.match(result.requestSha256, /^[a-f0-9]{64}$/);
  assert.match(result.responseSha256, /^[a-f0-9]{64}$/);

  assert.equal(
    sent.url,
    "https://api.cloudflare.com/client/v4/accounts/6fd0b70bbeb0769801ddb19c8f1b4b10/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  );
  assert.equal(sent.init.method, "POST");
  assert.equal(sent.init.headers.authorization, `Bearer ${apiToken}`);
  assert.equal(sent.init.headers.accept, "application/json");
  assert.equal(sent.init.headers["content-type"], "application/json");
  assert.equal(sent.init.redirect, "error");
  assert.equal(sent.init.signal instanceof AbortSignal, true);
  const sentBody = JSON.parse(sent.init.body);
  assert.deepEqual(sentBody, buildWorkersAiRequest({ messages, schema }).body);
  assert.equal(result.requestSha256, createHash("sha256").update(JSON.stringify({
    provider: WORKERS_AI_PROVIDER,
    model: DEFAULT_CLOUDFLARE_AI_MODEL,
    body: sentBody,
  })).digest("hex"));
  assert.doesNotMatch(sent.init.body, /cloudflare-test-token-never-log/);
  assert.doesNotMatch(JSON.stringify(result), /cloudflare-test-token-never-log/);
});

test("string JSON responses are parsed but markdown and non-object payloads fail closed", async (t) => {
  const parsed = await requestWorkersAiEditorial(requestOptions({
    fetchImpl: async () => cloudflareResponse(JSON.stringify(payload)),
  }));
  assert.deepEqual(parsed.editorialPayload, payload);
  assert.equal(parsed.responseId, "test-ray-id");

  for (const [name, response, expected] of [
    ["markdown fence", "```json\n{\"headline\":\"unsafe\"}\n```", /not valid JSON/],
    ["array", "[]", /not valid JSON/],
    ["blank", " ", /did not contain an editorial payload/],
  ]) {
    await t.test(name, async () => {
      await assert.rejects(
        requestWorkersAiEditorial(requestOptions({
          fetchImpl: async () => cloudflareResponse(response),
        })),
        expected,
      );
    });
  }
});

test("editorial format failures expose only fixed code and bounded attempt provenance", async () => {
  await assert.rejects(
    requestWorkersAiEditorial(requestOptions({
      fetchImpl: async () => cloudflareResponse(
        `\`\`\`json\n{\"headline\":\"${apiToken}\"}\n\`\`\``,
      ),
    })),
    (error) => {
      assert.equal(error.code, WORKERS_AI_EDITORIAL_FORMAT_INVALID);
      assert.equal(error.attemptCount, 1);
      assert.equal(error.inference.provider, WORKERS_AI_PROVIDER);
      assert.equal(error.inference.model, DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(error.inference.responseId, "test-ray-id");
      assert.match(error.inference.requestSha256, /^[a-f0-9]{64}$/);
      assert.match(error.inference.responseSha256, /^[a-f0-9]{64}$/);
      assert.deepEqual(Object.keys(error), []);
      assert.doesNotMatch(error.message, /cloudflare-test-token/);
      assert.doesNotMatch(JSON.stringify(error), /cloudflare-test-token/);
      return true;
    },
  );

  let calls = 0;
  await assert.rejects(
    requestWorkersAiEditorial(requestOptions({
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? new Response(null, { status: 429 })
          : cloudflareResponse("not-json");
      },
    })),
    (error) => {
      assert.equal(error.code, WORKERS_AI_EDITORIAL_FORMAT_INVALID);
      assert.equal(error.attemptCount, 2);
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("Cloudflare's documented JSON Mode failure uses the safe editorial fallback signal", async (t) => {
  const documentedFailure = (message = "JSON Mode couldn't be met") => new Response(JSON.stringify({
    success: false,
    result: null,
    errors: [{ code: 7000, message }],
    messages: [],
  }), {
    status: 500,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cf-ray": "json-mode-failure-ray",
    },
  });

  await t.test("HTTP error envelope is classified without a transport retry", async () => {
    let calls = 0;
    const sleeps = [];
    await assert.rejects(
      requestWorkersAiEditorial(requestOptions({
        fetchImpl: async () => {
          calls += 1;
          return documentedFailure("InferenceUpstreamError: JSON Mode couldn't be met");
        },
        sleepImpl: async (milliseconds) => sleeps.push(milliseconds),
      })),
      (error) => {
        assert.equal(error.code, WORKERS_AI_EDITORIAL_FORMAT_INVALID);
        assert.equal(error.attemptCount, 1);
        assert.equal(error.inference.responseId, "json-mode-failure-ray");
        assert.match(error.inference.responseSha256, /^[a-f0-9]{64}$/);
        assert.equal(
          error.message,
          "Cloudflare Workers AI could not satisfy the requested editorial JSON schema.",
        );
        assert.doesNotMatch(error.message, /JSON Mode couldn't be met|cloudflare-test-token/);
        return true;
      },
    );
    assert.equal(calls, 1);
    assert.deepEqual(sleeps, []);
  });

  await t.test("HTTP 200 unsuccessful envelope is classified the same way", async () => {
    const response = documentedFailure();
    const body = await response.text();
    await assert.rejects(
      requestWorkersAiEditorial(requestOptions({
        fetchImpl: async () => new Response(body, {
          status: 200,
          headers: { "content-type": "application/json", "cf-ray": "json-mode-200-ray" },
        }),
      })),
      (error) => {
        assert.equal(error.code, WORKERS_AI_EDITORIAL_FORMAT_INVALID);
        assert.equal(error.inference.responseId, "json-mode-200-ray");
        return true;
      },
    );
  });

  await t.test("authentication failures cannot masquerade as editorial format failures", async () => {
    const body = JSON.stringify({
      success: false,
      result: null,
      errors: [{ message: "JSON Mode couldn't be met" }],
    });
    await assert.rejects(
      requestWorkersAiEditorial(requestOptions({
        fetchImpl: async () => new Response(body, {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      })),
      (error) => {
        assert.equal(error.code, undefined);
        assert.equal(error.message, "Cloudflare Workers AI request failed with HTTP 401.");
        return true;
      },
    );
  });

  await t.test("near-matches and multi-error envelopes become unavailable only after HTTP retry", async () => {
    for (const errors of [
      [{ message: "JSON Mode could not be met" }],
      [
        { message: "JSON Mode couldn't be met" },
        { message: `provider detail ${apiToken}` },
      ],
    ]) {
      let calls = 0;
      const sleeps = [];
      await assert.rejects(
        requestWorkersAiEditorial(requestOptions({
          fetchImpl: async () => {
            calls += 1;
            return new Response(JSON.stringify({ success: false, result: null, errors }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          },
          sleepImpl: async (milliseconds) => sleeps.push(milliseconds),
        })),
        (error) => {
          assert.equal(error.code, WORKERS_AI_EDITORIAL_UNAVAILABLE);
          assert.equal(error.attemptCount, 2);
          assert.equal(error.message, "Cloudflare Workers AI did not provide a usable editorial response.");
          assert.doesNotMatch(error.message, /JSON Mode|cloudflare-test-token/);
          return true;
        },
      );
      assert.equal(calls, 2);
      assert.deepEqual(sleeps, [250]);
    }
  });

  await t.test("an unsuccessful non-schema envelope is a bounded unavailable result", async () => {
    await assert.rejects(
      requestWorkersAiEditorial(requestOptions({
        fetchImpl: async () => new Response(JSON.stringify({
          success: false,
          result: null,
          errors: [{ message: "provider could not complete inference" }],
        }), {
          status: 200,
          headers: { "content-type": "application/json", "cf-ray": "unavailable-ray" },
        }),
      })),
      (error) => {
        assert.equal(error.code, WORKERS_AI_EDITORIAL_UNAVAILABLE);
        assert.equal(error.attemptCount, 1);
        assert.equal(error.inference.responseId, "unavailable-ray");
        assert.doesNotMatch(error.message, /provider could not complete inference/);
        return true;
      },
    );
  });
});

test("the documented Chat Completions result is parsed and locally validated", async () => {
  let validated;
  const result = await requestWorkersAiEditorial(requestOptions({
    validatePayload: (value) => {
      validated = value;
      return true;
    },
    fetchImpl: async () => cloudflareChatCompletion(),
  }));

  assert.deepEqual(validated, payload);
  assert.deepEqual(result.editorialPayload, payload);
  assert.equal(result.responseId, "chatcmpl-workers-ai-response-id");
  assert.deepEqual(result.usage, {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
  });
});

test("Chat Completions extraction rejects ambiguous or non-final assistant output", async (t) => {
  const unsafeToolCall = {
    id: "call_1",
    type: "function",
    function: { name: "publish", arguments: JSON.stringify(payload) },
  };
  const scenarios = [
    ["no choices", { result: { choices: [] } }],
    [
      "multiple choices",
      { result: { choices: [
        { index: 0, message: { role: "assistant", content: JSON.stringify(payload) }, finish_reason: "stop" },
        { index: 1, message: { role: "assistant", content: JSON.stringify(payload) }, finish_reason: "stop" },
      ] } },
    ],
    ["wrong index", { choice: { index: 1 } }],
    ["truncated", { choice: { finish_reason: "length" } }],
    ["tool call", { message: { content: null, tool_calls: [unsafeToolCall] }, choice: { finish_reason: "tool_calls" } }],
    ["malformed tool calls", { message: { tool_calls: {} } }],
    ["refusal", { message: { content: null, refusal: "I cannot comply." } }],
    ["malformed refusal", { message: { refusal: {} } }],
    ["non-assistant", { message: { role: "user" } }],
    ["blank content", { message: { content: " " } }],
    ["legacy response takes precedence", { result: { response: null } }],
  ];

  for (const [name, options] of scenarios) {
    await t.test(name, async () => {
      await assert.rejects(
        requestWorkersAiEditorial(requestOptions({
          fetchImpl: async () => cloudflareChatCompletion(JSON.stringify(payload), options),
        })),
        error => {
          assert.match(error.message, /did not contain an editorial payload/);
          assert.equal(workersAiFailureDiagnostic(error).formatReason,
            name === "truncated" ? "OUTPUT_TOKEN_LIMIT" : "PAYLOAD_MISSING");
          return true;
        },
      );
    });
  }
});

test("Chat Completions content still rejects markdown and non-object JSON", async (t) => {
  for (const [name, content] of [
    ["markdown fence", "```json\n{\"headline\":\"unsafe\"}\n```"],
    ["array", "[]"],
    ["primitive", "true"],
  ]) {
    await t.test(name, async () => {
      await assert.rejects(
        requestWorkersAiEditorial(requestOptions({
          fetchImpl: async () => cloudflareChatCompletion(content),
        })),
        /not valid JSON/,
      );
    });
  }
});

test("transient HTTP and transport failures retry with bounded backoff", async (t) => {
  await t.test("HTTP 429", async () => {
    let calls = 0;
    const sleeps = [];
    const result = await requestWorkersAiEditorial(requestOptions({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("rate limited", { status: 429 });
        }
        return cloudflareResponse();
      },
      sleepImpl: async (milliseconds) => sleeps.push(milliseconds),
    }));
    assert.equal(result.editorialPayload.headline, payload.headline);
    assert.equal(result.attemptCount, 2);
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [250]);
  });

  await t.test("transport error", async () => {
    let calls = 0;
    await assert.rejects(
      requestWorkersAiEditorial(requestOptions({
        fetchImpl: async () => {
          calls += 1;
          throw new Error(`socket failed near ${apiToken}`);
        },
      })),
      (error) => {
        assert.match(error.message, /failed after 2 attempt/);
        assert.doesNotMatch(error.message, /cloudflare-test-token/);
        return true;
      },
    );
    assert.equal(calls, 2);
  });
});

test("authentication failures do not retry or expose Cloudflare's response body", async () => {
  let calls = 0;
  await assert.rejects(
    requestWorkersAiEditorial(requestOptions({
      fetchImpl: async () => {
        calls += 1;
        return new Response(`invalid token ${apiToken}`, { status: 401 });
      },
    })),
    (error) => {
      assert.equal(error.message, "Cloudflare Workers AI request failed with HTTP 401.");
      assert.doesNotMatch(error.message, /cloudflare-test-token/);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("auth-bearing requests refuse provider redirects", async () => {
  let calls = 0;
  let requestInit;
  await assert.rejects(
    requestWorkersAiEditorial(requestOptions({
      fetchImpl: async (_url, init) => {
        calls += 1;
        requestInit = init;
        return new Response(null, {
          status: 302,
          headers: { location: "https://redirect.example/collect" },
        });
      },
    })),
    /request failed with HTTP 302/,
  );
  assert.equal(calls, 1);
  assert.equal(requestInit.redirect, "error");
  assert.equal(requestInit.headers.authorization, `Bearer ${apiToken}`);
});

test("timeouts, oversized bodies, and non-JSON successes fail closed", async (t) => {
  await t.test("timeout", async () => {
    let calls = 0;
    let requestSignal;
    await assert.rejects(
      requestWorkersAiEditorial(requestOptions({
        timeoutMs: 10,
        maxAttempts: 1,
        fetchImpl: async (_url, init) => {
          calls += 1;
          requestSignal = init.signal;
          return new Promise(() => {});
        },
      })),
      (error) => {
        assert.match(error.message, /timed out after 1 attempt/);
        assert.equal(error.code, "WORKERS_AI_CLIENT_TIMEOUT");
        return true;
      },
    );
    assert.equal(calls, 1);
    assert.equal(requestSignal.aborted, true);
  });

  await t.test("provider HTTP 408", async () => {
    await assert.rejects(
      requestWorkersAiEditorial(requestOptions({
        maxAttempts: 1,
        fetchImpl: async () => new Response(null, { status: 408 }),
      })),
      (error) => {
        assert.equal(error.code, "WORKERS_AI_PROVIDER_TIMEOUT");
        assert.match(error.message, /HTTP 408/);
        return true;
      },
    );
  });

  await t.test("oversized response", async () => {
    const oversized = cloudflareResponse({ headline: "x".repeat(500) });
    await assert.rejects(
      requestWorkersAiEditorial(requestOptions({
        maxResponseBytes: 64,
        fetchImpl: async () => oversized,
      })),
      /exceeded the configured size limit/,
    );
  });

  await t.test("non-JSON success", async () => {
    await assert.rejects(
      requestWorkersAiEditorial(requestOptions({
        fetchImpl: async () => new Response("ok", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      })),
      /non-JSON response/,
    );
  });
});

test("bad envelopes, malformed JSON, and failed local validation never produce an editorial object", async (t) => {
  const scenarios = [
    {
      name: "malformed envelope JSON",
      fetchImpl: async () => new Response("{", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      validatePayload: () => true,
      expected: /unreadable JSON/,
    },
    {
      name: "unsuccessful envelope",
      fetchImpl: async () => new Response(JSON.stringify({ success: false, result: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      validatePayload: () => true,
      expected: /did not provide a usable editorial response/,
    },
    {
      name: "validator rejection",
      fetchImpl: async () => cloudflareResponse(),
      validatePayload: () => ({ valid: false, issues: ["headline rejected"] }),
      expected: /failed local schema validation/,
    },
    {
      name: "validator rejection preserves a bounded repair category",
      fetchImpl: async () => cloudflareResponse(),
      validatePayload: () => ({
        valid: false,
        issues: ["reader length rejected"],
        repairKind: "length",
      }),
      expected: (error) => {
        assert.equal(error.code, WORKERS_AI_EDITORIAL_FORMAT_INVALID);
        assert.equal(error.repairKind, "length");
        return true;
      },
    },
    {
      name: "validator exception",
      fetchImpl: async () => cloudflareResponse(),
      validatePayload: () => {
        throw new Error(`payload contained ${apiToken}`);
      },
      expected: /failed local schema validation/,
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      await assert.rejects(
        requestWorkersAiEditorial(requestOptions(scenario)),
        (error) => {
          if (typeof scenario.expected === "function") {
            assert.equal(scenario.expected(error), true);
          } else {
            assert.match(error.message, scenario.expected);
          }
          assert.doesNotMatch(error.message, /cloudflare-test-token/);
          return true;
        },
      );
    });
  }
});

test("credentials, account id, schema hook, and request bounds are checked before fetch", async (t) => {
  const cases = [
    ["missing token", { apiToken: "" }, /CLOUDFLARE_AI_API_TOKEN is required/],
    ["bad account", { accountId: "account" }, /32-character hexadecimal/],
    ["missing validator", { validatePayload: null }, /local schema-validation function/],
    ["bad attempts", { maxAttempts: 4 }, /integer from 1 through 3/],
    ["bad size", { maxResponseBytes: 63 }, /integer from 64 through 5000000/],
    ["oversized request", { maxRequestBytes: 64 }, /request exceeded the configured size limit/],
    ["non-CF model", { model: "openai/gpt-oss-120b" }, /Cloudflare-hosted @cf model id/],
    ["unapproved CF model", { model: "@cf/meta/llama-3.1-8b-instruct" }, /hard-\$0 pilot/],
  ];

  for (const [name, overrides, expected] of cases) {
    await t.test(name, async () => {
      let calls = 0;
      await assert.rejects(
        requestWorkersAiEditorial(requestOptions({
          ...overrides,
          fetchImpl: async () => {
            calls += 1;
            return cloudflareResponse();
          },
        })),
        expected,
      );
      assert.equal(calls, 0);
    });
  }
});

test("message count and individual content bytes are bounded before fetch", async () => {
  const tooManyMessages = Array.from({ length: 9 }, (_, index) => ({
    role: index === 0 ? "system" : "user",
    content: `message ${index}`,
  }));
  assert.throws(
    () => buildWorkersAiRequest({ messages: tooManyMessages, schema }),
    /messages cannot exceed 8 entries/,
  );
  assert.throws(
    () => buildWorkersAiRequest({
      messages: [{ role: "user", content: "x".repeat(250_001) }],
      schema,
    }),
    /message 0 exceeds the configured byte limit/,
  );
});
