import assert from "node:assert/strict";
import test from "node:test";
import { buildGeminiRequest, requestGeminiEditorial, GEMINI_FREE_MODEL, GEMINI_PROVIDER, GEMINI_URL } from "../scripts/automation/free/gemini-ai.mjs";

const secret = "test-key-never-log-this-value";
const options = () => ({ apiKey: secret, freeTierConfirmed: true,
  messages: [{ role: "system", content: "Test instructions" }, { role: "user", content: "Untrusted fixture" }],
  schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
  validatePayload: value => Object.keys(value).join() === "ok" && value.ok === true });
const envelope = () => ({ modelVersion: GEMINI_FREE_MODEL, usageMetadata: { promptTokenCount: 100,
  candidatesTokenCount: 50, totalTokenCount: 150, secret }, candidates: [{ finishReason: "STOP",
  content: { role: "model", parts: [{ text: "HIDDEN_REASONING", thought: true }, { text: '{"ok":true}' }] } }] });
const response = body => new Response(JSON.stringify(body), { headers: { "content-type": "application/json; charset=utf-8" } });

test("Gemini uses one fixed endpoint, structured JSON and truthful bounded receipts", async () => {
  let calls = 0;
  const input = options();
  const result = await requestGeminiEditorial({ ...input, fetchImpl: async (url, request) => {
    calls++;
    assert.equal(url, GEMINI_URL);
    assert.equal(request.redirect, "error");
    assert.equal(request.credentials, "omit");
    assert.equal(request.headers["x-goog-api-key"], secret);
    assert.doesNotMatch(request.body, /test-key|googleSearch|cachedContent/);
    const body = JSON.parse(request.body);
    assert.deepEqual(body.generationConfig.responseJsonSchema, input.schema);
    assert.equal(body.generationConfig.maxOutputTokens, 8000);
    assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: "medium", includeThoughts: false });
    return response(envelope());
  } });
  assert.equal(calls, 1);
  assert.equal(result.provider, GEMINI_PROVIDER);
  assert.equal(result.model, GEMINI_FREE_MODEL);
  assert.equal(result.requestSha256, buildGeminiRequest(input).requestSha256);
  assert.match(result.responseSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.attemptCount, 1);
  assert.deepEqual(result.editorialPayload, { ok: true });
  assert.deepEqual(result.usage, { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 });
  assert.doesNotMatch(JSON.stringify(result), /HIDDEN_REASONING|never-log/);
});

test("Gemini refuses unconfirmed billing, other models/tools, retries and excess bounds before a request", async () => {
  for (const change of [{ freeTierConfirmed: false }, { apiKey: "bad" }, { model: "other" }, { tools: [] },
    { cachedContent: "cache" }, { endpoint: "https://example.com" }, { maxAttempts: 2 }, { maxTokens: 8001 },
    { thinking: "minimal" }, { timeoutMs: 180001 }, { messages: [] }, { schema: {} },
    { messages: [{ role: "system", content: "s" }, { role: "user", content: "x".repeat(80000) }] }]) {
    let calls = 0;
    await assert.rejects(requestGeminiEditorial({ ...options(), ...change, fetchImpl: async () => { calls++; } }),
      error => ["GEMINI_CONFIGURATION_INVALID", "GEMINI_FREE_TIER_NOT_CONFIRMED"].includes(error.code));
    assert.equal(calls, 0);
  }
});

test("Gemini rejects incomplete, mismatched, blocked, malformed and invalid editorial payloads", async () => {
  const mutations = [e => { e.modelVersion = "other"; }, e => { e.candidates = []; },
    e => { e.candidates.push(e.candidates[0]); }, e => { e.promptFeedback = { blockReason: "SAFETY" }; },
    e => { e.candidates[0].finishReason = "MAX_TOKENS"; }, e => { e.candidates[0].groundingMetadata = {}; },
    e => { e.candidates[0].safetyRatings = [{ blocked: true }]; },
    e => { e.candidates[0].content.parts = [{ functionCall: { name: "sendEmail" } }]; },
    e => { e.candidates[0].content.parts = [{ text: '```json\n{"ok":true}\n```' }]; },
    e => { e.candidates[0].content.parts = [{ text: '{"ok":false}' }]; },
    e => { e.candidates[0].content.parts = [{ text: '[]' }]; }];
  for (const mutate of mutations) {
    const body = envelope(); mutate(body);
    await assert.rejects(requestGeminiEditorial({ ...options(), fetchImpl: async () => response(body) }),
      error => /^GEMINI_(RESPONSE_INVALID|INCOMPLETE_OR_BLOCKED|EDITORIAL_FORMAT_INVALID|EDITORIAL_VALIDATION_FAILED)$/.test(error.code));
  }
});

test("quota and transport failures stop once and never expose provider text or credentials", async () => {
  for (const status of [429, 401, 403, 500]) {
    let calls = 0;
    await assert.rejects(requestGeminiEditorial({ ...options(), fetchImpl: async () => {
      calls++; return new Response(secret, { status });
    } }), error => {
      assert.equal(error.code, status === 429 ? "GEMINI_FREE_QUOTA_EXHAUSTED" : "GEMINI_HTTP_ERROR");
      assert.equal(error.httpStatus, status);
      assert.doesNotMatch(String(error), /never-log/);
      return true;
    });
    assert.equal(calls, 1);
  }
  await assert.rejects(requestGeminiEditorial({ ...options(), fetchImpl: async () => { throw Error(secret); } }),
    { message: "GEMINI_TRANSPORT_FAILED" });
  await assert.rejects(requestGeminiEditorial({ ...options(), validatePayload: () => { throw Error(secret); },
    fetchImpl: async () => response(envelope()) }), { message: "GEMINI_EDITORIAL_VALIDATION_FAILED" });
});

test("response limits cover content type, bytes, UTF-8 and unexpected redirects", async () => {
  const responses = [new Response("html"), response({}),
    new Response("x".repeat(120001), { headers: { "content-type": "application/json" } }),
    new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
    { status: 200, ok: true, redirected: true }, { status: 200, ok: true, url: "https://other.example" }];
  for (const item of responses) await assert.rejects(requestGeminiEditorial({ ...options(), fetchImpl: async () => item }));
});

test("deadline covers fetch, stream, validation and non-cooperative cleanup", async () => {
  const never = () => new Promise(() => {});
  for (const change of [{ fetchImpl: never },
    { fetchImpl: async () => ({ status: 200, ok: true, headers: new Headers({ "content-type": "application/json" }),
      body: { getReader: () => ({ read: never, cancel: never }) } }) },
    { validatePayload: never, fetchImpl: async () => response(envelope()) }]) {
    const start = Date.now();
    await assert.rejects(requestGeminiEditorial({ ...options(), ...change, timeoutMs: 20 }), { code: "GEMINI_TIMEOUT" });
    assert.ok(Date.now() - start < 1000);
  }
  await assert.rejects(requestGeminiEditorial({ ...options(), timeoutMs: 20,
    fetchImpl: async () => ({ status: 429, ok: false, body: { cancel: never } }) }), { code: "GEMINI_FREE_QUOTA_EXHAUSTED" });
});
