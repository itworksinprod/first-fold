import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { LOCAL_AI_PROVIDER, LOCAL_AI_MODEL, LOCAL_AI_URL, LOCAL_AI_CONTEXT_TOKENS,
  LOCAL_AI_EDITORIAL_FORMAT_INVALID, LOCAL_AI_EDITORIAL_UNAVAILABLE,
  buildLocalAiRequest, requestLocalAiEditorial } from "../scripts/automation/free/local-ai.mjs";

const messages = [{ role: "system", content: "Use only supplied evidence." }, { role: "user", content: "An evidence bundle." }];
const schema = { type: "object", additionalProperties: false, properties: { headline: { type: "string" } }, required: ["headline"] };
const payload = { headline: "A specific source-backed development" };
const sha = (text) => createHash("sha256").update(text).digest("hex");
const envelope = (overrides = {}) => ({ model: LOCAL_AI_MODEL, done: true, done_reason: "stop",
  prompt_eval_count: 84, eval_count: 21, message: { role: "assistant", content: JSON.stringify(payload) }, ...overrides });
const response = (value = envelope(), options = {}) => new Response(JSON.stringify(value), {
  status: 200, headers: { "content-type": "application/json" }, ...options });
const options = (overrides = {}) => ({ messages, schema, validatePayload: (value) => value.headline === payload.headline,
  fetchImpl: async () => response(), ...overrides });

test("local request is fixed-model schema-constrained with bounded native reasoning", () => {
  const request = buildLocalAiRequest({ messages, schema, maxTokens: 700, temperature: 0.2 });
  assert.equal(request.model, LOCAL_AI_MODEL);
  assert.deepEqual(request.body, { model: LOCAL_AI_MODEL, messages, format: schema, stream: false,
    think: true, keep_alive: "5m", options: { num_ctx: LOCAL_AI_CONTEXT_TOKENS, num_predict: 700, temperature: 0.2,
      top_p: 0.95, top_k: 20, min_p: 0, repeat_penalty: 1 } });
  request.body.messages[0].content = "changed";
  request.body.format.properties.headline.type = "number";
  assert.equal(messages[0].content, "Use only supplied evidence.");
  assert.equal(schema.properties.headline.type, "string");
  assert.deepEqual(buildLocalAiRequest({ messages, schema, responseFormat: "json_object" }).body.format, schema);
  assert.deepEqual(buildLocalAiRequest({ messages, schema, top_p: 0, options: { top_k: 1 } }).body.options,
    { num_ctx: LOCAL_AI_CONTEXT_TOKENS, num_predict: 3_000, temperature: 0.6,
      top_p: 0.95, top_k: 20, min_p: 0, repeat_penalty: 1 });
});

test("local adapter reaches only literal loopback and never sends credentials or arbitrary options", async () => {
  let called = 0;
  const secret = "never-forward-a-secret";
  const request = buildLocalAiRequest({ messages, schema });
  const raw = JSON.stringify(envelope());
  const result = await requestLocalAiEditorial(options({ accountId: secret, apiToken: secret,
    url: "https://example.com/collect", host: "https://example.com", headers: { authorization: secret },
    fetchImpl: async (url, init) => {
      called++;
      assert.equal(url, "http://127.0.0.1:11434/api/chat");
      assert.equal(init.redirect, "error");
      assert.equal(init.credentials, "omit");
      assert.equal(init.method, "POST");
      assert.deepEqual(init.headers, { accept: "application/json", "content-type": "application/json" });
      assert.doesNotMatch(JSON.stringify(init), /never-forward|example\.com|authorization/);
      return new Response(raw, { headers: { "content-type": "application/json" } });
    } }));
  assert.equal(called, 1);
  assert.deepEqual(result, { editorialPayload: payload, provider: LOCAL_AI_PROVIDER, model: LOCAL_AI_MODEL,
    responseId: `local-${sha(raw)}`, requestSha256: sha(JSON.stringify({ provider: LOCAL_AI_PROVIDER, model: LOCAL_AI_MODEL, body: request.body })),
    responseSha256: sha(raw), attemptCount: 1, usage: { prompt_tokens: 84, completion_tokens: 21, total_tokens: 105 } });
});

test("local thinking is enabled by default and only an explicit boolean can change it", async () => {
  const baseline = buildLocalAiRequest({ messages, schema });
  const direct = buildLocalAiRequest({ messages, schema, think: false });
  assert.equal(baseline.body.think, true);
  assert.deepEqual(direct, { ...baseline, body: { ...baseline.body, think: false } });
  let calls = 0;
  const result = await requestLocalAiEditorial(options({ think: false, fetchImpl: async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(init.body).think, false);
    return response();
  } }));
  assert.equal(calls, 1);
  assert.equal(result.requestSha256, sha(JSON.stringify({ provider: LOCAL_AI_PROVIDER,
    model: LOCAL_AI_MODEL, body: direct.body })));
  for (const think of [null, 0, 1, "false", "true", {}, []]) {
    assert.throws(() => buildLocalAiRequest({ messages, schema, think }),
      error => error.code === "LOCAL_AI_CONFIGURATION_INVALID");
    await assert.rejects(requestLocalAiEditorial(options({ think, fetchImpl: async () => { calls++; } })),
      error => error.code === "LOCAL_AI_CONFIGURATION_INVALID" && error.attemptCount === 0);
  }
  assert.equal(calls, 1);
});

test("local input checks reject models, messages, schema and capacity before any network call", async () => {
  let calls = 0;
  const cyclic = {}; cyclic.self = cyclic;
  const invalid = [
    { model: "@cf/qwen/qwen3-30b-a3b-fp8" }, { model: "qwen3:30b-a3b-cloud" }, { model: "https://example.com" },
    { messages: [] }, { messages: Array.from({ length: 9 }, () => messages[0]) },
    { messages: [{ role: "tool", content: "bad" }] }, { messages: [{ role: "user", content: " " }] },
    { messages: [{ role: "user", content: "ok", images: ["unrequested"] }] }, { schema: cyclic },
    { schema: { type: "array", properties: {} } }, { schema: { type: "object" } },
    { maxTokens: 0 }, { maxTokens: 12_001 }, { maxTokens: 2.5 }, { temperature: Infinity }, { temperature: -1 },
    { maxAttempts: 2 }, { maxAttempts: 0 }, { maxRequestBytes: 70_001 }, { maxResponseBytes: 100_001 },
    { maxRequestBytes: 64 }, { maxResponseBytes: 63 }, { timeoutMs: 300_001 }, { timeoutMs: 9 },
    { responseFormat: "text" }, { validatePayload: null },
    { messages: [{ role: "user", content: "x".repeat(LOCAL_AI_CONTEXT_TOKENS) }] },
    { messages: [{ role: "user", content: "🙂".repeat(LOCAL_AI_CONTEXT_TOKENS / 4) }] },
  ];
  for (const invalidOptions of invalid) {
    await assert.rejects(requestLocalAiEditorial(options({ ...invalidOptions,
      fetchImpl: async () => { calls++; return response(); } })), (error) => error.code === "LOCAL_AI_CONFIGURATION_INVALID");
  }
  assert.equal(calls, 0);
});

test("local adapter has one attempt for every HTTP or transport failure and never leaks error text", async () => {
  const secret = "private-provider-error";
  for (const status of [301, 401, 403, 429, 500, 503]) {
    let calls = 0;
    await assert.rejects(requestLocalAiEditorial(options({ fetchImpl: async () => {
      calls++;
      return response({ error: secret }, { status });
    } })), (error) => {
      assert.equal(error.code, LOCAL_AI_EDITORIAL_UNAVAILABLE);
      assert.equal(error.httpStatus, status);
      assert.equal(error.attemptCount, 1);
      assert.doesNotMatch(error.message + JSON.stringify(error), /private-provider/);
      return true;
    });
    assert.equal(calls, 1);
  }
  await assert.rejects(requestLocalAiEditorial(options({ fetchImpl: async () => {
    throw new Error(secret);
  } })), (error) => error.code === LOCAL_AI_EDITORIAL_UNAVAILABLE && !error.message.includes(secret));
  await assert.rejects(requestLocalAiEditorial(options({ fetchImpl: async () => {
    throw Object.assign(new Error(secret), { code: LOCAL_AI_EDITORIAL_UNAVAILABLE });
  } })), (error) => error.code === LOCAL_AI_EDITORIAL_UNAVAILABLE && !error.message.includes(secret));
});

test("redirected or foreign response URLs are rejected even if a custom transport follows one", async () => {
  for (const [key, value] of [["redirected", true], ["url", "https://example.com"], ["url", "http://localhost:11434/api/chat"]]) {
    const result = response(); Object.defineProperty(result, key, { value });
    await assert.rejects(requestLocalAiEditorial(options({ fetchImpl: async () => result })),
      (error) => error.code === LOCAL_AI_EDITORIAL_UNAVAILABLE);
  }
});

test("native Ollama shape, complete generation and truthful model identity are mandatory", async () => {
  const cases = [
    null, [], { success: true, result: { response: payload } },
    envelope({ model: "different-model" }), envelope({ done: false }), envelope({ done_reason: "load" }),
    envelope({ error: "private error" }), envelope({ prompt_eval_count: 0 }), envelope({ prompt_eval_count: LOCAL_AI_CONTEXT_TOKENS }),
    envelope({ eval_count: -1 }), envelope({ eval_count: undefined }),
    envelope({ message: { role: "user", content: JSON.stringify(payload) } }),
    envelope({ message: { role: "assistant", content: JSON.stringify(payload), tool_calls: [{ function: { name: "fetch" } }] } }),
    envelope({ message: { role: "assistant", content: JSON.stringify(payload), refusal: "not allowed" } }),
  ];
  for (const value of cases) {
    await assert.rejects(requestLocalAiEditorial(options({ fetchImpl: async () => response(value) })),
      (error) => error.code === LOCAL_AI_EDITORIAL_FORMAT_INVALID && error.formatReason === "RESPONSE_SHAPE");
  }
});

test("truncated output is rejected even if it happens to contain valid JSON", async () => {
  for (const value of [envelope({ done_reason: "length" }), envelope({ eval_count: 3_001 })]) {
    await assert.rejects(requestLocalAiEditorial(options({ fetchImpl: async () => response(value) })),
      (error) => error.code === LOCAL_AI_EDITORIAL_FORMAT_INVALID && error.formatReason === "OUTPUT_TOKEN_LIMIT");
  }
});

test("only complete final JSON objects are accepted, never reasoning or code-fence salvage", async () => {
  for (const content of [undefined, "", "```json\n{}\n```", "[]", "null", "{\"headline\":", "{}{}", "private prose"]) {
    await assert.rejects(requestLocalAiEditorial(options({ fetchImpl: async () => response(envelope({
      message: { role: "assistant", content, thinking: JSON.stringify(payload) },
    })) })), (error) => error.code === LOCAL_AI_EDITORIAL_FORMAT_INVALID && !error.message.includes("private prose"));
  }
  const result = await requestLocalAiEditorial(options({ fetchImpl: async () => response(envelope({
    message: { role: "assistant", content: JSON.stringify(payload), thinking: "private chain of thought", tool_calls: [], refusal: null },
    unknownTransportData: "do not copy this envelope",
  })) }));
  assert.deepEqual(result.editorialPayload, payload);
  assert.doesNotMatch(JSON.stringify(result), /thinking|chain of thought|unknownTransportData|copy this envelope/);
});

test("local validation is mandatory and cannot mutate the returned payload or leak exceptions", async () => {
  const result = await requestLocalAiEditorial(options({ validatePayload: (value) => {
    value.headline = "mutated"; return { valid: true };
  } }));
  assert.deepEqual(result.editorialPayload, payload);
  for (const validatePayload of [() => false, () => ({ valid: false }), () => "true", () => {
    throw new Error("private validation details");
  }]) {
    await assert.rejects(requestLocalAiEditorial(options({ validatePayload })), (error) => {
      assert.equal(error.code, LOCAL_AI_EDITORIAL_FORMAT_INVALID);
      assert.equal(error.formatReason, "SCHEMA_VALIDATION_FAILED");
      assert.equal(error.inference.provider, LOCAL_AI_PROVIDER);
      assert.match(error.inference.requestSha256, /^[a-f0-9]{64}$/);
      assert.doesNotMatch(error.message, /private validation/);
      return true;
    });
  }
});

test("response content type, declared length, streamed byte limit and UTF-8 are checked", async () => {
  const sources = [
    new Response("private html", { headers: { "content-type": "text/html" } }),
    new Response("{}", { headers: { "content-type": "application/json-not-really" } }),
    new Response("{}", { headers: { "content-type": "application/json", "content-length": "100001" } }),
    new Response("x".repeat(100_001), { headers: { "content-type": "application/json" } }),
    new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
  ];
  for (const value of sources) {
    await assert.rejects(requestLocalAiEditorial(options({ fetchImpl: async () => value })),
      (error) => error.code === LOCAL_AI_EDITORIAL_UNAVAILABLE && !error.message.includes("private html"));
  }
});

test("malformed transport JSON is sanitized and has only hashed response provenance", async () => {
  await assert.rejects(requestLocalAiEditorial(options({ fetchImpl: async () => new Response('{"private incomplete',
    { headers: { "content-type": "application/json" } }) })), (error) => {
    assert.equal(error.code, LOCAL_AI_EDITORIAL_FORMAT_INVALID);
    assert.equal(error.formatReason, "PAYLOAD_JSON_INVALID");
    assert.doesNotMatch(error.message + JSON.stringify(error.inference), /private incomplete/);
    return true;
  });
});

test("deadline aborts a stalled transport without retries", async () => {
  let calls = 0; let signal;
  await assert.rejects(requestLocalAiEditorial(options({ timeoutMs: 10, fetchImpl: async (url, init) => {
    calls++; signal = init.signal; return new Promise(() => {});
  } })), (error) => error.code === "LOCAL_AI_CLIENT_TIMEOUT");
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
});

test("deadline includes a stalled local validator", async () => {
  await assert.rejects(requestLocalAiEditorial(options({ timeoutMs: 10, validatePayload: () => new Promise(() => {}) })),
    (error) => error.code === "LOCAL_AI_CLIENT_TIMEOUT");
});

test("deadline cancels and unlocks a stalled response body without waiting for producer cleanup", async () => {
  let calls = 0; let cancellations = 0; let validations = 0; let signal;
  const body = new ReadableStream({ cancel() {
    cancellations++;
    return new Promise(() => {});
  } });
  await assert.rejects(requestLocalAiEditorial(options({ timeoutMs: 10,
    validatePayload: () => { validations++; return true; },
    fetchImpl: async (_url, init) => {
      calls++; signal = init.signal;
      return new Response(body, { headers: { "content-type": "application/json" } });
    },
  })), (error) => error.code === "LOCAL_AI_CLIENT_TIMEOUT");
  // Let reader cleanup finish without permitting another transport attempt.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(cancellations, 1);
  assert.equal(validations, 0);
  assert.equal(signal.aborted, true);
  assert.equal(body.locked, false);
});

test("a transport response arriving after timeout is cancelled before parsing or validation", async () => {
  let resolveFetch; let calls = 0; let cancellations = 0; let validations = 0;
  const body = new ReadableStream({ cancel() { cancellations++; } });
  await assert.rejects(requestLocalAiEditorial(options({ timeoutMs: 10,
    validatePayload: () => { validations++; return true; },
    fetchImpl: () => { calls++; return new Promise(resolve => { resolveFetch = resolve; }); },
  })), (error) => error.code === "LOCAL_AI_CLIENT_TIMEOUT");
  resolveFetch(new Response(body, { headers: { "content-type": "application/json" } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(cancellations, 1);
  assert.equal(validations, 0);
  assert.equal(body.locked, false);
});

test("a validator completing after timeout cannot change the failed result or cause a retry", async () => {
  let resolveValidation; let calls = 0; let validations = 0; let signal;
  const result = requestLocalAiEditorial(options({ timeoutMs: 10,
    fetchImpl: async (_url, init) => { calls++; signal = init.signal; return response(); },
    validatePayload: () => { validations++; return new Promise(resolve => { resolveValidation = resolve; }); },
  }));
  await assert.rejects(result, (error) => error.code === "LOCAL_AI_CLIENT_TIMEOUT");
  resolveValidation({ valid: true });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(result, (error) => error.code === "LOCAL_AI_CLIENT_TIMEOUT");
  assert.equal(calls, 1);
  assert.equal(validations, 1);
  assert.equal(signal.aborted, true);
});

test("fixed endpoint export cannot be overridden by supplied shared transport options", () => {
  assert.equal(LOCAL_AI_URL, "http://127.0.0.1:11434/api/chat");
  assert.equal(LOCAL_AI_MODEL, "qwen3:30b-a3b");
  assert.equal(LOCAL_AI_PROVIDER, "ollama-local");
});
