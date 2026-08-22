import { createHash } from "node:crypto";

export const DEFAULT_CLOUDFLARE_AI_MODEL = "@cf/openai/gpt-oss-120b";
export const WORKERS_AI_PROVIDER = "cloudflare-workers-ai";
export const FREE_CLOUDFLARE_AI_MODELS = Object.freeze([DEFAULT_CLOUDFLARE_AI_MODEL]);
export const DEFAULT_WORKERS_AI_MAX_TOKENS = 16_000;
export const DEFAULT_WORKERS_AI_TEMPERATURE = 0.2;
export const DEFAULT_WORKERS_AI_TIMEOUT_MS = 120_000;
export const DEFAULT_WORKERS_AI_MAX_ATTEMPTS = 2;
export const DEFAULT_WORKERS_AI_MAX_REQUEST_BYTES = 500_000;
export const DEFAULT_WORKERS_AI_MAX_RESPONSE_BYTES = 1_000_000;

const CLOUDFLARE_API_ORIGIN = "https://api.cloudflare.com";
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const CLOUDFLARE_MODEL_PATTERN = /^@cf\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i;
const MAX_WORKERS_AI_MESSAGES = 8;
const MAX_WORKERS_AI_MESSAGE_BYTES = 250_000;
const utf8Encoder = new TextEncoder();

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireNonBlank(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function requireIntegerInRange(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function requireFiniteInRange(value, label, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a number from ${minimum} through ${maximum}.`);
  }
  return value;
}

function cloneJson(value, label) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`${label} must be JSON-serializable.`);
  }
  if (serialized === undefined) {
    throw new Error(`${label} must be JSON-serializable.`);
  }
  return JSON.parse(serialized);
}

export function resolveCloudflareAiModel(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_CLOUDFLARE_AI_MODEL;
  }
  const model = requireNonBlank(value, "CLOUDFLARE_AI_MODEL");
  if (!CLOUDFLARE_MODEL_PATTERN.test(model)) {
    throw new Error("CLOUDFLARE_AI_MODEL must be a Cloudflare-hosted @cf model id.");
  }
  if (!FREE_CLOUDFLARE_AI_MODELS.includes(model)) {
    throw new Error("CLOUDFLARE_AI_MODEL is not approved for the hard-$0 pilot.");
  }
  return model;
}

export function workersAiRunUrl(accountId, model = DEFAULT_CLOUDFLARE_AI_MODEL) {
  const normalizedAccountId = requireNonBlank(accountId, "CLOUDFLARE_ACCOUNT_ID");
  if (!ACCOUNT_ID_PATTERN.test(normalizedAccountId)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal account id.");
  }
  const normalizedModel = resolveCloudflareAiModel(model);
  return `${CLOUDFLARE_API_ORIGIN}/client/v4/accounts/${normalizedAccountId}/ai/run/${normalizedModel}`;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Workers AI messages must be a non-empty array.");
  }
  if (messages.length > MAX_WORKERS_AI_MESSAGES) {
    throw new Error(`Workers AI messages cannot exceed ${MAX_WORKERS_AI_MESSAGES} entries.`);
  }

  const normalized = cloneJson(messages, "Workers AI messages");
  for (const [index, message] of normalized.entries()) {
    if (!isObject(message) || !["system", "user", "assistant"].includes(message.role)) {
      throw new Error(`Workers AI message ${index} has an invalid role.`);
    }
    if (typeof message.content !== "string" || !message.content.trim()) {
      throw new Error(`Workers AI message ${index} must have non-blank string content.`);
    }
    if (utf8Encoder.encode(message.content).byteLength > MAX_WORKERS_AI_MESSAGE_BYTES) {
      throw new Error(`Workers AI message ${index} exceeds the configured byte limit.`);
    }
  }
  return normalized;
}

function normalizeSchema(schema) {
  if (!isObject(schema)) {
    throw new Error("Workers AI response schema must be an object.");
  }
  const normalized = cloneJson(schema, "Workers AI response schema");
  if (normalized.type !== "object" || !isObject(normalized.properties)) {
    throw new Error("Workers AI response schema must describe a JSON object.");
  }
  return normalized;
}

/**
 * Build the model-specific request accepted by Cloudflare's Workers AI
 * Execute Model endpoint. The caller supplies bounded, normalized evidence;
 * this adapter never performs discovery or forwards raw feed documents.
 */
export function buildWorkersAiRequest({
  model,
  messages,
  schema,
  maxTokens = DEFAULT_WORKERS_AI_MAX_TOKENS,
  temperature = DEFAULT_WORKERS_AI_TEMPERATURE,
} = {}) {
  return {
    model: resolveCloudflareAiModel(model),
    body: {
      messages: normalizeMessages(messages),
      response_format: {
        type: "json_schema",
        json_schema: normalizeSchema(schema),
      },
      max_tokens: requireIntegerInRange(maxTokens, "Workers AI maxTokens", 1, 16_000),
      temperature: requireFiniteInRange(temperature, "Workers AI temperature", 0, 5),
      stream: false,
    },
  };
}

function shouldRetryStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class AttemptTimeoutError extends Error {}

async function cancelResponseBody(response) {
  try {
    await response?.body?.cancel();
  } catch {
    // The response is being discarded. Cancellation failure is non-actionable.
  }
}

async function readBoundedResponseText(response, maxResponseBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    await cancelResponseBody(response);
    throw new Error("Cloudflare Workers AI response exceeded the configured size limit.");
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    throw new Error("Cloudflare Workers AI returned an unreadable response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteCount = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new Error("Cloudflare Workers AI returned an unreadable response body.");
      }
      byteCount += value.byteLength;
      if (byteCount > maxResponseBytes) {
        await reader.cancel();
        throw new Error("Cloudflare Workers AI response exceeded the configured size limit.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Preserve the original bounded-read error.
    }
    if (error instanceof Error && error.message.startsWith("Cloudflare Workers AI")) {
      throw error;
    }
    throw new Error("Cloudflare Workers AI returned an unreadable response body.");
  }
  return text;
}

async function performAttempt({ url, apiToken, requestText, fetchImpl, timeoutMs, maxResponseBytes }) {
  const controller = new AbortController();
  let timeoutHandle;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new AttemptTimeoutError("Workers AI attempt timed out."));
    }, timeoutMs);
  });

  const request = (async () => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiToken}`,
        "content-type": "application/json",
      },
      body: requestText,
      redirect: "error",
      signal: controller.signal,
    });

    if (!response || typeof response.ok !== "boolean" || !Number.isInteger(response.status)) {
      throw new Error("Cloudflare Workers AI returned an invalid HTTP response.");
    }
    if (!response.ok) {
      await cancelResponseBody(response);
      return { response, status: response.status, text: null };
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      await cancelResponseBody(response);
      throw new Error("Cloudflare Workers AI returned a non-JSON response.");
    }
    const text = await readBoundedResponseText(response, maxResponseBytes);
    return { response, status: response.status, text };
  })();

  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function requestEnvelope({
  url,
  apiToken,
  requestText,
  fetchImpl,
  timeoutMs,
  maxAttempts,
  maxResponseBytes,
  sleepImpl,
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let result;
    try {
      result = await performAttempt({
        url,
        apiToken,
        requestText,
        fetchImpl,
        timeoutMs,
        maxResponseBytes,
      });
    } catch (error) {
      if (
        !(error instanceof AttemptTimeoutError) &&
        error instanceof Error &&
        error.message.startsWith("Cloudflare Workers AI returned")
      ) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.message.includes("size limit") || error.message.includes("non-JSON"))
      ) {
        throw error;
      }
      if (attempt < maxAttempts) {
        await sleepImpl(250 * (2 ** (attempt - 1)));
        continue;
      }
      if (error instanceof AttemptTimeoutError) {
        throw new Error(`Cloudflare Workers AI request timed out after ${attempt} attempt(s).`);
      }
      throw new Error(`Cloudflare Workers AI request failed after ${attempt} attempt(s).`);
    }

    if (result.text === null) {
      if (attempt < maxAttempts && shouldRetryStatus(result.status)) {
        await sleepImpl(250 * (2 ** (attempt - 1)));
        continue;
      }
      throw new Error(`Cloudflare Workers AI request failed with HTTP ${result.status}.`);
    }

    let envelope;
    try {
      envelope = JSON.parse(result.text);
    } catch {
      throw new Error("Cloudflare Workers AI returned unreadable JSON.");
    }
    return { envelope, response: result.response, responseText: result.text };
  }

  throw new Error("Cloudflare Workers AI request failed without a response.");
}

function extractChatCompletionContent(result) {
  if (!Array.isArray(result.choices) || result.choices.length !== 1) return undefined;

  const [choice] = result.choices;
  const message = isObject(choice) ? choice.message : null;
  if (
    !isObject(choice) ||
    choice.index !== 0 ||
    choice.finish_reason !== "stop" ||
    !isObject(message) ||
    message.role !== "assistant" ||
    typeof message.content !== "string" ||
    (Object.hasOwn(message, "tool_calls") &&
      (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0)) ||
    (Object.hasOwn(message, "refusal") && message.refusal !== null)
  ) {
    return undefined;
  }

  return message.content;
}

function extractEditorialPayload(envelope) {
  if (!isObject(envelope) || envelope.success !== true || !isObject(envelope.result)) {
    throw new Error("Cloudflare Workers AI did not return a successful result envelope.");
  }
  if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
    throw new Error("Cloudflare Workers AI returned errors in a successful result envelope.");
  }

  const response = Object.hasOwn(envelope.result, "response")
    ? envelope.result.response
    : extractChatCompletionContent(envelope.result);
  if (isObject(response)) return cloneJson(response, "Workers AI editorial payload");
  if (typeof response !== "string" || !response.trim()) {
    throw new Error("Cloudflare Workers AI result did not contain an editorial payload.");
  }
  try {
    const parsed = JSON.parse(response);
    if (!isObject(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new Error("Cloudflare Workers AI editorial payload was not valid JSON.");
  }
}

function validationPassed(result) {
  return result === true || (isObject(result) && result.valid === true);
}

/**
 * Call Cloudflare Workers AI and return a locally validated editorial object.
 * The API token is sent only in the Authorization header and is never returned,
 * hashed, logged, or interpolated into an error.
 */
export async function requestWorkersAiEditorial({
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken = process.env.CLOUDFLARE_AI_API_TOKEN,
  model = process.env.CLOUDFLARE_AI_MODEL,
  messages,
  schema,
  validatePayload,
  maxTokens = DEFAULT_WORKERS_AI_MAX_TOKENS,
  temperature = DEFAULT_WORKERS_AI_TEMPERATURE,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_WORKERS_AI_TIMEOUT_MS,
  maxAttempts = DEFAULT_WORKERS_AI_MAX_ATTEMPTS,
  maxRequestBytes = DEFAULT_WORKERS_AI_MAX_REQUEST_BYTES,
  maxResponseBytes = DEFAULT_WORKERS_AI_MAX_RESPONSE_BYTES,
  sleepImpl = defaultSleep,
} = {}) {
  const token = requireNonBlank(apiToken, "CLOUDFLARE_AI_API_TOKEN");
  if (typeof fetchImpl !== "function") throw new Error("fetchImpl must be a function.");
  if (typeof sleepImpl !== "function") throw new Error("sleepImpl must be a function.");
  if (typeof validatePayload !== "function") {
    throw new Error("validatePayload must be a local schema-validation function.");
  }
  requireIntegerInRange(timeoutMs, "Workers AI timeoutMs", 10, 300_000);
  requireIntegerInRange(maxAttempts, "Workers AI maxAttempts", 1, 3);
  requireIntegerInRange(maxRequestBytes, "Workers AI maxRequestBytes", 64, 2_000_000);
  requireIntegerInRange(maxResponseBytes, "Workers AI maxResponseBytes", 64, 5_000_000);

  const request = buildWorkersAiRequest({ model, messages, schema, maxTokens, temperature });
  const url = workersAiRunUrl(accountId, request.model);
  const requestText = JSON.stringify(request.body);
  if (utf8Encoder.encode(requestText).byteLength > maxRequestBytes) {
    throw new Error("Cloudflare Workers AI request exceeded the configured size limit.");
  }
  const { envelope, response, responseText } = await requestEnvelope({
    url,
    apiToken: token,
    requestText,
    fetchImpl,
    timeoutMs,
    maxAttempts,
    maxResponseBytes,
    sleepImpl,
  });
  const editorialPayload = extractEditorialPayload(envelope);

  let validation;
  try {
    validation = await validatePayload(cloneJson(editorialPayload, "Workers AI editorial payload"));
  } catch {
    throw new Error("Cloudflare Workers AI editorial payload failed local schema validation.");
  }
  if (!validationPassed(validation)) {
    throw new Error("Cloudflare Workers AI editorial payload failed local schema validation.");
  }

  const result = envelope.result;
  const headerRequestId = response.headers.get("cf-ray")?.trim();
  const resultRequestId = typeof result.id === "string" ? result.id.trim() : "";
  return {
    editorialPayload,
    responseId: resultRequestId || headerRequestId || null,
    provider: WORKERS_AI_PROVIDER,
    model: request.model,
    usage: isObject(result.usage) ? cloneJson(result.usage, "Workers AI usage") : null,
    requestSha256: createHash("sha256").update(JSON.stringify({
      provider: WORKERS_AI_PROVIDER,
      model: request.model,
      body: request.body,
    })).digest("hex"),
    responseSha256: createHash("sha256").update(responseText).digest("hex"),
  };
}
