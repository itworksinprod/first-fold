import { createHash } from "node:crypto";

// Explicit local-only lane. Never use a Cloudflare model/provider alias, an
// environment-selected host, Ollama Cloud, a proxy/tunnel, or a credential.
export const LOCAL_AI_PROVIDER = "ollama-local";
export const LOCAL_AI_MODEL = "qwen3:30b-a3b";
export const LOCAL_AI_URL = "http://127.0.0.1:11434/api/chat";
// Fixed local-compute allowance for the approved 48 GiB Mac. Keep the full
// conservative byte bound below; never truncate evidence to make it fit.
export const LOCAL_AI_CONTEXT_TOKENS = 32_768;
export const LOCAL_AI_EDITORIAL_FORMAT_INVALID = "LOCAL_AI_EDITORIAL_FORMAT_INVALID";
export const LOCAL_AI_EDITORIAL_UNAVAILABLE = "LOCAL_AI_EDITORIAL_UNAVAILABLE";
const MAX_REQUEST_BYTES = 70_000;
const MAX_RESPONSE_BYTES = 100_000;
const TEMPLATE_TOKEN_RESERVE = 1_024;
const encoder = new TextEncoder();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const object = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
class LocalAiError extends Error {}

function failure(code, message, { inference, formatReason, httpStatus, outputDiagnostic, attemptCount = 1 } = {}) {
  const error = new LocalAiError(message);
  Object.defineProperties(error, {
    code: { value: code },
    attemptCount: { value: attemptCount },
    ...(inference ? { inference: { value: Object.freeze({ ...inference }) } } : {}),
    ...(formatReason ? { formatReason: { value: formatReason } } : {}),
    ...(outputDiagnostic ? { outputDiagnostic: { value: Object.freeze({ ...outputDiagnostic }) } } : {}),
    ...(Number.isInteger(httpStatus) ? { httpStatus: { value: httpStatus } } : {}),
  });
  return error;
}

// Scalars only. A native structured-output implementation may aggregate two
// generation passes; report what the envelope said without inferring a cause
// from elapsed time or exposing final content, thinking, or other raw fields.
const diagnosticCount = value => Number.isInteger(value) && value >= 0 &&
  value <= LOCAL_AI_CONTEXT_TOKENS * 2 ? value : null;
function nativeOutputDiagnostic(envelope, maxTokens) {
  const lengthStop = envelope?.done_reason === "length";
  const countOverCap = Number.isInteger(envelope?.eval_count) && envelope.eval_count > maxTokens;
  return {
    doneReason: ["stop", "length"].includes(envelope?.done_reason) ? envelope.done_reason : null,
    promptTokens: diagnosticCount(envelope?.prompt_eval_count),
    completionTokens: diagnosticCount(envelope?.eval_count),
    finalContentPresent: typeof envelope?.message?.content === "string" && envelope.message.content.trim().length > 0,
    ...(lengthStop || countOverCap ? { tokenLimitCause: lengthStop && countOverCap
      ? "NATIVE_LENGTH_AND_COUNT_OVER_CAP" : lengthStop ? "NATIVE_LENGTH" : "COMPLETION_COUNT_OVER_CAP" } : {}),
  };
}

export function localAiFailureDiagnostic(error) {
  // Do not trust a transport/callback exception that impersonates this shape.
  if (!(error instanceof LocalAiError) || !error.outputDiagnostic) return {};
  return { outputDiagnostic: { ...error.outputDiagnostic } };
}

function configurationFailure() {
  return failure("LOCAL_AI_CONFIGURATION_INVALID", "The local writer configuration is invalid or exceeds its bounded allowance.", { attemptCount: 0 });
}

function integer(value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw configurationFailure();
  return value;
}

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw configurationFailure();
  }
}

/**
 * Official Ollama local API: /api/chat, format=<JSON schema>, stream:false,
 * think:true by default (Qwen3 native reasoning), options.num_ctx/num_predict. Reasoning
 * shares the bounded output allowance and is never returned to callers/logs.
 * Explicit boolean think:false is available for isolated direct-output tests.
 * Explicit formatMode:"prompt-json" omits native format and appends the exact
 * schema to the first system message, for thinking-only transport diagnostics.
 * https://docs.ollama.com/api/chat
 * https://docs.ollama.com/capabilities/structured-outputs
 * https://docs.ollama.com/capabilities/thinking
 */
export function buildLocalAiRequest({ model = LOCAL_AI_MODEL, messages, schema,
  responseFormat = "json_schema", maxTokens = 3_000, temperature = 0.6, think = true,
  formatMode = "native" } = {}) {
  if (model !== LOCAL_AI_MODEL || !["json_schema", "json_object"].includes(responseFormat) ||
      typeof think !== "boolean" ||
      !["native", "prompt-json"].includes(formatMode) || (formatMode === "prompt-json" && think !== true) ||
      !Array.isArray(messages) || messages.length < 1 || messages.length > 8 ||
      !Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw configurationFailure();
  integer(maxTokens, 1, 12_000);
  const copiedMessages = clone(messages);
  for (const message of copiedMessages) {
    if (!object(message) || Object.keys(message).sort().join(",") !== "content,role" ||
        !["system", "user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" || !message.content.trim()) throw configurationFailure();
  }
  const copiedSchema = clone(schema);
  if (!object(copiedSchema) || copiedSchema.type !== "object" || !object(copiedSchema.properties)) {
    throw configurationFailure();
  }
  if (formatMode === "prompt-json") {
    if (copiedMessages[0].role !== "system") throw configurationFailure();
    copiedMessages[0].content += `\n\nReturn only one JSON object matching this exact JSON schema:\n${JSON.stringify(copiedSchema)}`;
  }
  // Byte-level BPE has at most one token per UTF-8 byte before template tokens.
  // Count the schema too, conservatively, rather than assume characters/4 or
  // silently truncate evidence to fit. Callers can submit smaller dossiers.
  const inputUpperBound = encoder.encode(JSON.stringify(copiedMessages)).byteLength +
    // In prompt-json mode the exact schema is already counted inside messages.
    (formatMode === "native" ? encoder.encode(JSON.stringify(copiedSchema)).byteLength : 0) + TEMPLATE_TOKEN_RESERVE;
  if (inputUpperBound + maxTokens > LOCAL_AI_CONTEXT_TOKENS) throw configurationFailure();
  return {
    model: LOCAL_AI_MODEL,
    body: {
      model: LOCAL_AI_MODEL,
      messages: copiedMessages,
      ...(formatMode === "native" ? { format: copiedSchema } : {}),
      stream: false,
      think,
      keep_alive: "5m",
      // Qwen's thinking-mode sampling guidance avoids near-greedy repetition.
      // Keep these fixed instead of inheriting mutable runtime defaults.
      options: { num_ctx: LOCAL_AI_CONTEXT_TOKENS, num_predict: maxTokens, temperature,
        top_p: 0.95, top_k: 20, min_p: 0, repeat_penalty: 1 },
    },
  };
}

function cancel(body) {
  try { Promise.resolve(body?.cancel()).catch(() => {}); } catch { /* best effort */ }
}

const timeoutFailure = () => failure("LOCAL_AI_CLIENT_TIMEOUT", "The local writer exceeded its bounded deadline.");
function assertActive(signal) {
  if (signal.aborted) throw timeoutFailure();
}

async function readResponse(response, maximum, signal) {
  assertActive(signal);
  if (Number(response.headers.get("content-length")) > maximum ||
      !response.body || typeof response.body.getReader !== "function") {
    cancel(response.body);
    throw failure(LOCAL_AI_EDITORIAL_UNAVAILABLE, "The local writer response exceeded its bounds or was unreadable.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteCount = 0;
  let text = "";
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const abortRead = () => {
    // AbortSignal alone is not enough for an already-returned custom stream.
    // Cancel its active reader without waiting for the producer's cleanup.
    cancel(reader);
    rejectAbort(timeoutFailure());
  };
  signal.addEventListener("abort", abortRead, { once: true });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      assertActive(signal);
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error();
      byteCount += value.byteLength;
      if (byteCount > maximum) throw new Error();
      text += decoder.decode(value, { stream: true });
    }
    assertActive(signal);
    return text + decoder.decode();
  } catch {
    if (signal.aborted) throw timeoutFailure();
    cancel(reader);
    throw failure(LOCAL_AI_EDITORIAL_UNAVAILABLE, "The local writer response exceeded its bounds or was unreadable.");
  } finally {
    signal.removeEventListener("abort", abortRead);
    try { reader.releaseLock(); } catch { /* cleanup must not replace a sanitized error */ }
  }
}

function extractPayload(envelope, inference, maxTokens) {
  const reject = (formatReason = "RESPONSE_SHAPE") => {
    throw failure(LOCAL_AI_EDITORIAL_FORMAT_INVALID, "The local writer did not return a complete editorial object.",
      { inference, formatReason, outputDiagnostic: nativeOutputDiagnostic(envelope, maxTokens) });
  };
  if (!object(envelope) || envelope.model !== LOCAL_AI_MODEL || envelope.done !== true ||
      Object.hasOwn(envelope, "error") || !object(envelope.message) ||
      envelope.message.role !== "assistant" ||
      (Object.hasOwn(envelope.message, "tool_calls") &&
        (!Array.isArray(envelope.message.tool_calls) || envelope.message.tool_calls.length > 0)) ||
      (Object.hasOwn(envelope.message, "refusal") && envelope.message.refusal !== null)) reject();
  if (envelope.done_reason === "length" ||
      (Number.isInteger(envelope.eval_count) && envelope.eval_count > maxTokens)) reject("OUTPUT_TOKEN_LIMIT");
  if (envelope.done_reason !== "stop" || !Number.isInteger(envelope.prompt_eval_count) ||
      envelope.prompt_eval_count < 1 || envelope.prompt_eval_count > LOCAL_AI_CONTEXT_TOKENS ||
      !Number.isInteger(envelope.eval_count) || envelope.eval_count < 1 ||
      envelope.prompt_eval_count + envelope.eval_count > LOCAL_AI_CONTEXT_TOKENS) reject();
  // Never read, return, salvage, or validate message.thinking. The final content
  // must independently be one JSON object; code fences/fragments are rejected.
  if (typeof envelope.message.content !== "string" || !envelope.message.content.trim()) reject("PAYLOAD_MISSING");
  let payload;
  try { payload = JSON.parse(envelope.message.content); } catch { reject("PAYLOAD_JSON_INVALID"); }
  if (!object(payload)) reject("PAYLOAD_JSON_INVALID");
  return payload;
}

/**
 * One bounded local inference attempt. Shared accountId/apiToken options are
 * intentionally not consumed; only explicitly constructed non-secret fields
 * reach loopback. The returned metadata truthfully identifies local inference.
 * No provider envelopes, reasoning, HTTP error bodies, or callback exceptions
 * are exposed in errors or successful metadata.
 */
export async function requestLocalAiEditorial({ model = LOCAL_AI_MODEL, messages, schema,
  responseFormat = "json_schema", validatePayload, maxTokens = 3_000, temperature = 0.6, think = true,
  formatMode = "native",
  fetchImpl = globalThis.fetch, timeoutMs = 300_000, maxAttempts = 1,
  maxRequestBytes = MAX_REQUEST_BYTES, maxResponseBytes = MAX_RESPONSE_BYTES } = {}) {
  if (typeof fetchImpl !== "function" || typeof validatePayload !== "function" || maxAttempts !== 1) throw configurationFailure();
  integer(timeoutMs, 10, 300_000);
  integer(maxRequestBytes, 64, MAX_REQUEST_BYTES);
  integer(maxResponseBytes, 64, MAX_RESPONSE_BYTES);
  const request = buildLocalAiRequest({ model, messages, schema, responseFormat, maxTokens, temperature, think, formatMode });
  const requestText = JSON.stringify(request.body);
  if (encoder.encode(requestText).byteLength > maxRequestBytes) throw configurationFailure();
  const requestSha256 = hash(JSON.stringify({ provider: LOCAL_AI_PROVIDER, model: LOCAL_AI_MODEL, body: request.body }));
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutFailure());
    }, timeoutMs);
  });
  const attempt = async () => {
    const response = await fetchImpl(LOCAL_AI_URL, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: requestText, redirect: "error", credentials: "omit", cache: "no-store",
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      cancel(response?.body);
      throw timeoutFailure();
    }
    if (!response || typeof response.ok !== "boolean" || !Number.isInteger(response.status) ||
        response.status < 100 || response.status > 599 || response.redirected === true ||
        (response.url && response.url !== LOCAL_AI_URL)) {
      cancel(response?.body);
      throw failure(LOCAL_AI_EDITORIAL_UNAVAILABLE, "The local writer returned an invalid HTTP response.");
    }
    if (!response.ok) {
      cancel(response.body);
      throw failure(LOCAL_AI_EDITORIAL_UNAVAILABLE, "The local writer request was not accepted.", { httpStatus: response.status });
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers?.get("content-type") ?? "")) {
      cancel(response.body);
      throw failure(LOCAL_AI_EDITORIAL_UNAVAILABLE, "The local writer returned a non-JSON HTTP response.");
    }
    const responseText = await readResponse(response, maxResponseBytes, controller.signal);
    assertActive(controller.signal);
    const responseSha256 = hash(responseText);
    const inference = { provider: LOCAL_AI_PROVIDER, model: LOCAL_AI_MODEL,
      responseId: `local-${responseSha256}`, requestSha256, responseSha256 };
    let envelope;
    try { envelope = JSON.parse(responseText); } catch {
      throw failure(LOCAL_AI_EDITORIAL_FORMAT_INVALID, "The local writer returned unreadable JSON.",
        { inference, formatReason: "PAYLOAD_JSON_INVALID" });
    }
    const editorialPayload = extractPayload(envelope, inference, maxTokens);
    let verdict;
    assertActive(controller.signal);
    try { verdict = await validatePayload(clone(editorialPayload)); } catch { /* sanitized below */ }
    assertActive(controller.signal);
    if (!(verdict === true || (object(verdict) && verdict.valid === true))) {
      throw failure(LOCAL_AI_EDITORIAL_FORMAT_INVALID, "The local writer editorial object failed local schema validation.",
        { inference, formatReason: "SCHEMA_VALIDATION_FAILED" });
    }
    return { editorialPayload, ...inference, attemptCount: 1,
      usage: { prompt_tokens: envelope.prompt_eval_count, completion_tokens: envelope.eval_count,
        total_tokens: envelope.prompt_eval_count + envelope.eval_count } };
  };
  try {
    return await Promise.race([attempt(), deadline]);
  } catch (error) {
    // A transport's own abort rejection can race the deadline promise. The
    // caller should still receive the truthful bounded-timeout classification.
    if (controller.signal.aborted) throw timeoutFailure();
    if (error instanceof LocalAiError && [LOCAL_AI_EDITORIAL_UNAVAILABLE, LOCAL_AI_EDITORIAL_FORMAT_INVALID,
      "LOCAL_AI_CLIENT_TIMEOUT"].includes(error.code)) throw error;
    throw failure(LOCAL_AI_EDITORIAL_UNAVAILABLE, "The local writer request failed without a usable response.");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
