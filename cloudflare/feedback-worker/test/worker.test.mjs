import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import worker, {
  FEEDBACK_AUDIENCE,
  handleRequest,
} from "../src/worker.mjs";
import { buildPersonalFeedbackToken } from "../../../scripts/automation/personal-feedback.mjs";

const ORIGIN = "https://first-fold-personal-feedback.example.workers.dev";
const SIGNING_KEY = "first-fold-feedback-test-key-with-at-least-32-bytes";
const HMAC_CONTEXT = "first-fold:personal-feedback:v1\u0000";
const NOW_MS = Date.parse("2026-08-25T09:05:00.000Z");

class FakeD1 {
  constructor() {
    this.prepared = [];
    this.rows = new Map();
  }

  prepare(sql) {
    const record = { sql, values: null };
    this.prepared.push(record);
    return {
      bind: (...values) => {
        record.values = values;
        return {
          run: async () => {
            const tokenHash = values[0];
            const inserted = !this.rows.has(tokenHash);
            if (inserted) this.rows.set(tokenHash, values);
            return { success: true, meta: { changes: inserted ? 1 : 0 } };
          },
        };
      },
    };
  }
}

function env(database = new FakeD1()) {
  return {
    DB: database,
    PERSONAL_FEEDBACK_SIGNING_KEY: SIGNING_KEY,
  };
}

function payload(overrides = {}) {
  return {
    version: 1,
    audience: FEEDBACK_AUDIENCE,
    editionDate: "2026-08-25",
    issueNumber: 4,
    scope: "story",
    storyId: "2026-08-25-ai-personal-free",
    desk: "ai",
    expiresAt: new Date(NOW_MS + 14 * 24 * 60 * 60 * 1_000).toISOString(),
    ...overrides,
  };
}

function signToken(fields = payload()) {
  const payloadBytes = Buffer.from(JSON.stringify(fields), "utf8");
  const signature = createHmac("sha256", SIGNING_KEY)
    .update(HMAC_CONTEXT, "utf8")
    .update(payloadBytes)
    .digest("base64url");
  return `${payloadBytes.toString("base64url")}.${signature}`;
}

function postRequest(body, headers = {}) {
  return new Request(`${ORIGIN}/v1/feedback`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      origin: ORIGIN,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function post(body, database = new FakeD1(), headers = {}) {
  const response = await handleRequest(
    postRequest(body, headers),
    env(database),
    { nowMs: NOW_MS },
  );
  return { response, database };
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'/u);
  assert.match(response.headers.get("strict-transport-security"), /max-age=63072000/u);
}

test("GET serves a no-store form, strips fragment state client-side, and never writes", async () => {
  const database = new FakeD1();
  const secretFragment = "not-sent-to-the-server";
  const response = await worker.fetch(
    new Request(`${ORIGIN}/#token=${secretFragment}`),
    env(database),
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(database.prepared.length, 0);
  assert.equal(html.includes(secretFragment), false);
  assert.match(html, /window\.location\.hash/u);
  assert.match(html, /window\.history\.replaceState\(null, "", window\.location\.pathname\)/u);
  assert.match(html, /feedback is reviewed by a person; it never changes the editorial rules automatically/iu);
  assert.match(html, /Do not include email addresses, links, or sensitive information/u);
  assert.match(html, /fetch\("\/v1\/feedback"/u);
  assert.doesNotMatch(html, /<script(?![^>]*nonce=)/u);
  assertSecurityHeaders(response);
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/u);
});

test("a valid signed story submission writes only the minimal bound fields", async () => {
  const database = new FakeD1();
  const token = signToken();
  const { response } = await post(
    { token, category: "useful", note: "Clear and worth reading." },
    database,
  );

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(database.prepared.length, 1);
  assert.equal(database.rows.size, 1);
  const expectedHash = createHash("sha256").update(token, "utf8").digest("hex");
  const values = database.rows.get(expectedHash);
  assert.deepEqual(values, [
    expectedHash,
    "2026-08-25",
    4,
    "story",
    "2026-08-25-ai-personal-free",
    "ai",
    "useful",
    "Clear and worth reading.",
    Math.floor(NOW_MS / 1_000),
  ]);
  assert.equal(database.prepared[0].sql.includes(token), false);
  assert.equal(values.includes(token), false);
  assertSecurityHeaders(response);
});

test("the Worker accepts the canonical token emitted by the email automation", async () => {
  const database = new FakeD1();
  const token = buildPersonalFeedbackToken({
    editionDate: "2026-08-25",
    issueNumber: 4,
    scope: "story",
    storyId: "2026-08-25-ai-personal-free",
    desk: "ai",
  }, {
    signingKey: SIGNING_KEY,
    now: new Date(NOW_MS),
  });
  const { response } = await post(
    { token, category: "useful", note: "Canonical producer contract accepted." },
    database,
  );

  assert.equal(response.status, 202);
  assert.equal(database.rows.size, 1);
});

test("edition tokens use the canonical null story and desk contract", async () => {
  const database = new FakeD1();
  const token = signToken(payload({ scope: "edition", storyId: null, desk: null }));
  const { response } = await post(
    { token, category: "missed_story", note: "A major policy announcement was missing." },
    database,
  );

  assert.equal(response.status, 202);
  assert.equal(database.rows.size, 1);
  assert.deepEqual([...database.rows.values()][0].slice(2, 6), [4, "edition", null, null]);
});

test("tampered, expired, overlong-lifetime, and noncanonical tokens fail closed", async () => {
  const valid = signToken();
  const [payloadSegment, signatureSegment] = valid.split(".");
  const tamperedSignature = `${signatureSegment[0] === "A" ? "B" : "A"}${signatureSegment.slice(1)}`;
  const cases = [
    `${payloadSegment}.${tamperedSignature}`,
    signToken(payload({ expiresAt: new Date(NOW_MS - 1).toISOString() })),
    signToken(payload({ expiresAt: new Date(NOW_MS + 15 * 24 * 60 * 60 * 1_000).toISOString() })),
    signToken({ ...payload(), unexpected: true }),
  ];

  for (const token of cases) {
    const database = new FakeD1();
    const { response } = await post({ token, category: "useful", note: "" }, database);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "invalid_or_expired_token",
    });
    assert.equal(database.prepared.length, 0);
  }
});

test("replaying an accepted token is an indistinguishable no-op", async () => {
  const database = new FakeD1();
  const token = signToken();
  const first = await post({ token, category: "useful", note: "" }, database);
  const replay = await post(
    { token, category: "correction", note: "This later answer must not replace the first." },
    database,
  );

  assert.equal(first.response.status, 202);
  assert.equal(replay.response.status, 202);
  assert.deepEqual(await first.response.json(), await replay.response.json());
  assert.equal(database.rows.size, 1);
  assert.equal([...database.rows.values()][0][6], "useful");
});

test("invalid media types, origins, JSON shapes, notes, and large bodies are rejected", async () => {
  const token = signToken();
  const cases = [
    {
      request: new Request(`${ORIGIN}/v1/feedback`, {
        method: "POST",
        headers: { "content-type": "text/plain", origin: ORIGIN },
        body: "not json",
      }),
      status: 415,
    },
    { request: postRequest({ token, category: "useful", note: "" }, { origin: "https://evil.example" }), status: 403 },
    { request: postRequest([]), status: 400 },
    { request: postRequest({ token, category: "unknown", note: "" }), status: 400 },
    { request: postRequest({ token, category: "useful", note: "line one\nline two" }), status: 400 },
    { request: postRequest({ token, category: "useful", note: "Contact person@example.com" }), status: 400 },
    { request: postRequest({ token, category: "useful", note: "See https://example.com/story" }), status: 400 },
    { request: postRequest({ token, category: "correction", note: "short" }), status: 400 },
    { request: postRequest("x".repeat(16 * 1024 + 1)), status: 413 },
  ];

  for (const { request, status } of cases) {
    const database = new FakeD1();
    const response = await handleRequest(request, env(database), { nowMs: NOW_MS });
    assert.equal(response.status, status);
    assert.equal(database.prepared.length, 0);
    assertSecurityHeaders(response);
  }
});

test("the API exposes no read or export route", async () => {
  const database = new FakeD1();
  const read = await handleRequest(
    new Request(`${ORIGIN}/v1/feedback`),
    env(database),
    { nowMs: NOW_MS },
  );
  const exported = await handleRequest(
    new Request(`${ORIGIN}/v1/export`),
    env(database),
    { nowMs: NOW_MS },
  );

  assert.equal(read.status, 405);
  assert.equal(read.headers.get("allow"), "POST");
  assert.equal(exported.status, 404);
  assert.equal(database.prepared.length, 0);
});

test("the Worker makes no outbound fetch while serving or accepting feedback", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("Outbound fetch is forbidden in the feedback Worker.");
  };

  try {
    const database = new FakeD1();
    const page = await handleRequest(new Request(`${ORIGIN}/`), env(database), {
      nowMs: NOW_MS,
    });
    const accepted = await handleRequest(
      postRequest({ token: signToken(), category: "useful", note: "" }),
      env(database),
      { nowMs: NOW_MS },
    );
    assert.equal(page.status, 200);
    assert.equal(accepted.status, 202);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing or weak runtime bindings fail without exposing configuration details", async () => {
  for (const bindings of [
    {},
    { DB: new FakeD1() },
    { DB: new FakeD1(), PERSONAL_FEEDBACK_SIGNING_KEY: "too-short" },
  ]) {
    const response = await handleRequest(
      postRequest({ token: signToken(), category: "useful", note: "" }),
      bindings,
      { nowMs: NOW_MS },
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "temporarily_unavailable",
    });
  }
});
