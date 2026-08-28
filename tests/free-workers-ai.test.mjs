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
        /did not contain an editorial payload/,
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
