import { createHash } from "node:crypto";

// Opt-in only. Account billing status must be checked in AI Studio: an API key
// and a caller confirmation cannot prove that billing remains disabled.
export const GEMINI_PROVIDER = "google-gemini";
export const GEMINI_FREE_MODEL = "gemini-3.8-flash";
export const GEMINI_LITE_MODEL = "gemini-3.5-flash-lite";
const allowedModels = [GEMINI_FREE_MODEL, GEMINI_LITE_MODEL];
export const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FREE_MODEL}:generateContent`;
const hash = value => createHash("sha256").update(value).digest("hex");
const object = value => value && typeof value === "object" && !Array.isArray(value);
class GeminiError extends Error {}
const error = (code, status) => Object.assign(new GeminiError(code), { code,
  ...(Number.isInteger(status) ? { httpStatus: status } : {}) });
const invalid = () => error("GEMINI_CONFIGURATION_INVALID");
const clone = value => JSON.parse(JSON.stringify(value));
const cancel = target => {
  try { Promise.resolve(target?.cancel()).catch(() => {}); } catch { /* best effort, never block completion */ }
};
const safeStatuses = new Set(["INVALID_ARGUMENT", "UNAUTHENTICATED", "PERMISSION_DENIED", "NOT_FOUND",
  "RESOURCE_EXHAUSTED", "FAILED_PRECONDITION", "INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED"]);
const safeReasons = new Set(["API_KEY_INVALID", "API_KEY_SERVICE_BLOCKED", "API_KEY_IP_ADDRESS_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED", "SERVICE_DISABLED", "CONSUMER_INVALID", "BILLING_DISABLED"]);
// Provider enums only: never retain finishMessage, source text or thought parts.
const safeFinishReasons = new Set(["FINISH_REASON_UNSPECIFIED", "STOP", "MAX_TOKENS", "SAFETY", "RECITATION",
  "LANGUAGE", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "MALFORMED_FUNCTION_CALL", "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT", "IMAGE_OTHER", "NO_IMAGE", "IMAGE_RECITATION", "UNEXPECTED_TOOL_CALL",
  "TOO_MANY_TOOL_CALLS", "MISSING_THOUGHT_SIGNATURE", "MALFORMED_RESPONSE", "ESCALATION"]);
const rejectionFlags = ["FINISH_NOT_STOP", "ROLE_NOT_MODEL", "SAFETY_BLOCKED", "GROUNDING_PRESENT", "PARTS_MISSING_OR_EMPTY"];
const safeUsage = value => Object.fromEntries(["promptTokenCount", "candidatesTokenCount", "thoughtsTokenCount", "totalTokenCount"]
  .filter(key => Number.isInteger(value?.[key]) && value[key] >= 0 && value[key] <= 100000).map(key => [key, value[key]]));
function incompleteDiagnostic(candidate, usage) {
  return { finishReason: candidate.finishReason === undefined ? "MISSING" :
    safeFinishReasons.has(candidate.finishReason) ? candidate.finishReason : "UNKNOWN",
  rejectionFlags: rejectionFlags.filter((_, i) => [candidate.finishReason !== "STOP", candidate.content?.role !== "model",
    Array.isArray(candidate.safetyRatings) && candidate.safetyRatings.some(rating => rating?.blocked === true),
    Boolean(candidate.groundingMetadata), !Array.isArray(candidate.content?.parts) || !candidate.content.parts.length][i]),
  usage: safeUsage(usage) };
}
// Error prose may echo credentials or source input. Retain only known enums and
// exact request-field names, never messages, metadata or arbitrary field paths.
function safeFailureDetails(envelope) {
  const value = envelope?.error;
  const result = {};
  if (safeStatuses.has(value?.status)) result.providerStatus = value.status;
  const reasons = [], fields = [];
  for (const item of Array.isArray(value?.details) ? value.details.slice(0, 10) : []) {
    if (safeReasons.has(item?.reason)) reasons.push(item.reason);
    for (const violation of Array.isArray(item?.fieldViolations) ? item.fieldViolations.slice(0, 10) : []) {
      if (["generation_config.response_json_schema", "generationConfig.responseJsonSchema",
        "generation_config.thinking_config", "generationConfig.thinkingConfig", "model", "contents",
        "generation_config.max_output_tokens", "generationConfig.maxOutputTokens"].includes(violation?.field)) fields.push(violation.field);
    }
  }
  if (reasons.length) result.providerReasons = [...new Set(reasons)];
  if (fields.length) result.invalidFields = [...new Set(fields)];
  return result;
}
export function geminiFailureDiagnostic(failure) {
  if (failure?.code === "GEMINI_INCOMPLETE_OR_BLOCKED") return {
    finishReason: safeFinishReasons.has(failure.finishReason) || failure.finishReason === "MISSING"
      ? failure.finishReason : "UNKNOWN",
    rejectionFlags: rejectionFlags.filter(flag => Array.isArray(failure.rejectionFlags) && failure.rejectionFlags.includes(flag)),
    usage: safeUsage(failure.usage),
  };
  if (!["GEMINI_HTTP_ERROR", "GEMINI_FREE_QUOTA_EXHAUSTED"].includes(failure?.code)) return {};
  return {
    ...(Number.isInteger(failure.httpStatus) && failure.httpStatus >= 400 && failure.httpStatus <= 599
      ? { httpStatus: failure.httpStatus } : {}),
    ...safeFailureDetails({ error: { status: failure.providerStatus, details: [
      ...(Array.isArray(failure.providerReasons) ? failure.providerReasons.map(reason => ({ reason })) : []),
      { fieldViolations: Array.isArray(failure.invalidFields) ? failure.invalidFields.map(field => ({ field })) : [] },
    ] } }),
  };
}

export function buildGeminiRequest({ model = GEMINI_FREE_MODEL, messages, schema, maxTokens = 8000,
  thinking = "medium", tools, cachedContent, endpoint } = {}) {
  if (!allowedModels.includes(model) || tools !== undefined || cachedContent !== undefined || endpoint !== undefined ||
      !["low", "medium", "high"].includes(thinking) || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8000 ||
      !Array.isArray(messages) || messages.length !== 2 || messages[0]?.role !== "system" || messages[1]?.role !== "user" ||
      messages.some(message => Object.keys(message).sort().join() !== "content,role" ||
        typeof message.content !== "string" || !message.content.trim()) ||
      !object(schema) || schema.type !== "object" || !object(schema.properties)) throw invalid();
  const body = {
    systemInstruction: { parts: [{ text: messages[0].content }] },
    contents: [{ role: "user", parts: [{ text: messages[1].content }] }],
    generationConfig: { candidateCount: 1, maxOutputTokens: maxTokens,
      responseMimeType: "application/json", responseJsonSchema: clone(schema),
      thinkingConfig: { thinkingLevel: thinking, includeThoughts: false } },
  };
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized) > 80000) throw invalid();
  return { body, serialized, requestSha256: hash(JSON.stringify({ provider: GEMINI_PROVIDER, model, body })) };
}

export async function requestGeminiEditorial({ apiKey, freeTierConfirmed, validatePayload,
  fetchImpl = globalThis.fetch, timeoutMs = 180000, maxAttempts = 1, ...options } = {}) {
  if (freeTierConfirmed !== true) throw error("GEMINI_FREE_TIER_NOT_CONFIRMED");
  if (typeof apiKey !== "string" || !/^[A-Za-z0-9_.-]{20,256}$/u.test(apiKey) ||
      typeof fetchImpl !== "function" || typeof validatePayload !== "function" || maxAttempts !== 1 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 180000) throw invalid();
  const request = buildGeminiRequest(options);
  const model = options.model ?? GEMINI_FREE_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const versionPattern = new RegExp(`^${model.replaceAll(".", "\\.")}(?:-\\d{3}|-\\d{4}-\\d{2}-\\d{2})?$`, "u");
  const controller = new AbortController();
  let reader, timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort();
      cancel(reader);
      reject(error("GEMINI_TIMEOUT")); }, timeoutMs);
  });
  const operation = async () => {
    const response = await fetchImpl(url, { method: "POST", redirect: "error", credentials: "omit",
      cache: "no-store", signal: controller.signal, body: request.serialized,
      headers: { "content-type": "application/json", accept: "application/json", "x-goog-api-key": apiKey } });
    if (!response || !Number.isInteger(response.status) || response.redirected || (response.url && response.url !== url)) {
      throw error("GEMINI_RESPONSE_INVALID");
    }
    if (!response.ok) {
      let details = {};
      if (/^application\/json(?:\s*;|$)/iu.test(response.headers?.get("content-type") ?? "") && response.body?.getReader) {
        reader = response.body.getReader();
        let bytes = 0, encoded = "";
        const decoder = new TextDecoder("utf-8", { fatal: true });
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (controller.signal.aborted) throw error("GEMINI_TIMEOUT");
            if (done) break;
            if (!(value instanceof Uint8Array) || (bytes += value.byteLength) > 16000) break;
            encoded += decoder.decode(value, { stream: true });
          }
          if (bytes <= 16000) details = safeFailureDetails(JSON.parse(encoded + decoder.decode()));
        } catch { /* HTTP status remains useful; do not echo body or parser errors. */ }
      } else cancel(response.body);
      throw Object.assign(error(response.status === 429 ? "GEMINI_FREE_QUOTA_EXHAUSTED" : "GEMINI_HTTP_ERROR", response.status), details);
    }
    if (!/^application\/json(?:\s*;|$)/iu.test(response.headers.get("content-type") ?? "")) throw error("GEMINI_RESPONSE_INVALID");
    if (!response.body?.getReader) throw error("GEMINI_RESPONSE_INVALID");
    reader = response.body.getReader();
    let size = 0, text = "";
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (;;) {
      const { done, value } = await reader.read();
      if (controller.signal.aborted) throw error("GEMINI_TIMEOUT");
      if (done) break;
      if (!(value instanceof Uint8Array) || (size += value.byteLength) > 120000) throw error("GEMINI_RESPONSE_BOUNDS");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    let envelope;
    try { envelope = JSON.parse(text); } catch { throw error("GEMINI_RESPONSE_INVALID"); }
    if (!object(envelope) || Object.hasOwn(envelope, "error") || envelope.promptFeedback?.blockReason ||
        !Array.isArray(envelope.candidates) || envelope.candidates.length !== 1 ||
        !versionPattern.test(envelope.modelVersion ?? "")) {
      throw error("GEMINI_RESPONSE_INVALID");
    }
    const candidate = envelope.candidates[0];
    if (candidate.finishReason !== "STOP" || candidate.content?.role !== "model" ||
        candidate.safetyRatings?.some(rating => rating.blocked === true) ||
        candidate.groundingMetadata || !Array.isArray(candidate.content.parts) || !candidate.content.parts.length) {
      throw Object.assign(error("GEMINI_INCOMPLETE_OR_BLOCKED"), incompleteDiagnostic(candidate, envelope.usageMetadata));
    }
    const parts = candidate.content.parts;
    if (parts.some(part => !object(part) || Object.keys(part).some(key => !["text", "thought", "thoughtSignature"].includes(key)) ||
        typeof part.text !== "string" || (part.thought !== undefined && typeof part.thought !== "boolean"))) {
      throw error("GEMINI_RESPONSE_INVALID");
    }
    const final = parts.filter(part => part.thought !== true).map(part => part.text).join("");
    let editorialPayload;
    try { editorialPayload = JSON.parse(final); } catch { throw error("GEMINI_EDITORIAL_FORMAT_INVALID"); }
    if (!object(editorialPayload)) throw error("GEMINI_EDITORIAL_FORMAT_INVALID");
    let valid;
    try { valid = await validatePayload(clone(editorialPayload)); } catch { /* do not expose callback text */ }
    if (valid !== true) throw error("GEMINI_EDITORIAL_VALIDATION_FAILED");
    const responseSha256 = hash(text);
    return { provider: GEMINI_PROVIDER, model, modelVersion: envelope.modelVersion,
      editorialPayload, requestSha256: request.requestSha256, responseSha256,
      responseId: `gemini-${responseSha256}`, usage: safeUsage(envelope.usageMetadata), attemptCount: 1 };
  };
  try { return await Promise.race([operation(), timeout]); }
  catch (failure) {
    if (controller.signal.aborted) throw error("GEMINI_TIMEOUT");
    if (failure instanceof GeminiError) throw failure;
    throw error("GEMINI_TRANSPORT_FAILED");
  } finally {
    clearTimeout(timer); controller.abort();
    cancel(reader);
  }
}
