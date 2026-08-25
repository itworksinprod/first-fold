import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  PERSONAL_FEEDBACK_AUDIENCE,
  PERSONAL_FEEDBACK_TOKEN_LIFETIME_MS,
  PERSONAL_FEEDBACK_TOKEN_VERSION,
  assertPersonalFeedbackSigningKey,
  buildPersonalFeedbackLinkMap,
  buildPersonalFeedbackToken,
  buildPersonalFeedbackUrl,
  verifyPersonalFeedbackToken,
} from "../scripts/automation/personal-feedback.mjs";

const SIGNING_KEY = "first-fold-feedback-test-key-with-at-least-32-bytes";
const OTHER_SIGNING_KEY = "different-feedback-test-key-with-at-least-32-bytes";
const NOW = new Date("2026-08-25T09:05:00.000Z");
const BASE_URL = "https://itworksinprod.github.io/first-fold/feedback/";
const TOKEN_FIELDS = Object.freeze({
  editionDate: "2026-08-25",
  issueNumber: 4,
  scope: "story",
  storyId: "2026-08-25-security-passkey",
  desk: "security-and-privacy",
});
const HMAC_CONTEXT = "first-fold:personal-feedback:v1\u0000";

function decodePayload(token) {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
}

function signPayload(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8");
  const signature = createHmac("sha256", SIGNING_KEY)
    .update(HMAC_CONTEXT, "utf8")
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload.toString("base64url")}.${signature}`;
}

test("feedback tokens are deterministic, versioned, and valid for exactly fourteen days", () => {
  const first = buildPersonalFeedbackToken(TOKEN_FIELDS, {
    signingKey: SIGNING_KEY,
    now: NOW,
  });
  const second = buildPersonalFeedbackToken(TOKEN_FIELDS, {
    signingKey: SIGNING_KEY,
    now: new Date(NOW),
  });
  assert.equal(first, second);
  assert.match(first, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

  const payload = verifyPersonalFeedbackToken(first, {
    signingKey: SIGNING_KEY,
    now: NOW,
  });
  assert.equal(payload.version, PERSONAL_FEEDBACK_TOKEN_VERSION);
  assert.equal(payload.audience, PERSONAL_FEEDBACK_AUDIENCE);
  assert.equal(
    Date.parse(payload.expiresAt) - NOW.getTime(),
    PERSONAL_FEEDBACK_TOKEN_LIFETIME_MS,
  );
  assert.deepEqual(payload, decodePayload(first));
});

test("feedback links are HTTPS and keep the token exclusively in one URL fragment field", () => {
  const token = buildPersonalFeedbackToken(TOKEN_FIELDS, {
    signingKey: SIGNING_KEY,
    now: NOW,
  });
  const link = buildPersonalFeedbackUrl(BASE_URL, token);
  const parsed = new URL(link);
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.search, "");
  assert.equal(parsed.hash, `#token=${token}`);
  assert.equal(parsed.hash.includes("?"), false);
  assert.equal(new URLSearchParams(parsed.hash.slice(1)).get("token"), token);
  assert.deepEqual([...new URLSearchParams(parsed.hash.slice(1)).keys()], ["token"]);
});

test("verification rejects tampering, the wrong key, the wrong audience, and expiry", () => {
  const token = buildPersonalFeedbackToken(TOKEN_FIELDS, {
    signingKey: SIGNING_KEY,
    now: NOW,
  });
  const [payloadSegment, signatureSegment] = token.split(".");
  const replacement = signatureSegment.at(-1) === "A" ? "B" : "A";
  const tampered = `${payloadSegment}.${signatureSegment.slice(0, -1)}${replacement}`;
  assert.throws(
    () => verifyPersonalFeedbackToken(tampered, { signingKey: SIGNING_KEY, now: NOW }),
    /signature is invalid/,
  );
  assert.throws(
    () => verifyPersonalFeedbackToken(token, { signingKey: OTHER_SIGNING_KEY, now: NOW }),
    /signature is invalid/,
  );

  const wrongAudience = {
    ...decodePayload(token),
    audience: "some-other-service",
  };
  assert.throws(
    () => verifyPersonalFeedbackToken(signPayload(wrongAudience), {
      signingKey: SIGNING_KEY,
      now: NOW,
    }),
    /audience is invalid/,
  );

  const expiresAt = new Date(NOW.getTime() + PERSONAL_FEEDBACK_TOKEN_LIFETIME_MS);
  assert.doesNotThrow(() => verifyPersonalFeedbackToken(token, {
    signingKey: SIGNING_KEY,
    now: new Date(expiresAt.getTime() - 1),
  }));
  assert.throws(
    () => verifyPersonalFeedbackToken(token, { signingKey: SIGNING_KEY, now: expiresAt }),
    /has expired/,
  );
});

test("verification rejects correctly signed non-canonical payload encodings", () => {
  const token = buildPersonalFeedbackToken(TOKEN_FIELDS, {
    signingKey: SIGNING_KEY,
    now: NOW,
  });
  const payload = decodePayload(token);
  const reordered = {
    audience: payload.audience,
    version: payload.version,
    editionDate: payload.editionDate,
    issueNumber: payload.issueNumber,
    scope: payload.scope,
    storyId: payload.storyId,
    desk: payload.desk,
    expiresAt: payload.expiresAt,
  };
  assert.throws(
    () => verifyPersonalFeedbackToken(signPayload(reordered), {
      signingKey: SIGNING_KEY,
      now: NOW,
    }),
    /not canonical/,
  );
});

test("token construction validates keys, dates, issue numbers, scopes, and story identity", () => {
  assert.equal(assertPersonalFeedbackSigningKey(SIGNING_KEY), true);
  for (const signingKey of [undefined, "short", ` ${SIGNING_KEY}`, `${SIGNING_KEY}\n`]) {
    assert.throws(
      () => buildPersonalFeedbackToken(TOKEN_FIELDS, { signingKey, now: NOW }),
      /signing key is required/,
    );
  }
  for (const fields of [
    { ...TOKEN_FIELDS, editionDate: "2026-02-30" },
    { ...TOKEN_FIELDS, issueNumber: 0 },
    { ...TOKEN_FIELDS, scope: "article" },
    { ...TOKEN_FIELDS, storyId: "" },
    { ...TOKEN_FIELDS, storyId: "A private headline must not become an identifier" },
    { ...TOKEN_FIELDS, storyId: "owner@example.com" },
    { ...TOKEN_FIELDS, storyId: "https://source.example/article" },
    { ...TOKEN_FIELDS, desk: "business" },
    { ...TOKEN_FIELDS, recipient: "owner@example.com" },
    {
      editionDate: "2026-08-25",
      issueNumber: 4,
      scope: "edition",
      storyId: "story-must-not-be-present",
      desk: null,
    },
  ]) {
    assert.throws(
      () => buildPersonalFeedbackToken(fields, { signingKey: SIGNING_KEY, now: NOW }),
    );
  }
});

test("feedback base URLs reject transport, credential, query, and fragment hazards", () => {
  const token = buildPersonalFeedbackToken(TOKEN_FIELDS, {
    signingKey: SIGNING_KEY,
    now: NOW,
  });
  for (const baseUrl of [
    "http://example.com/feedback/",
    "https://user:secret@example.com/feedback/",
    "https://example.com/feedback/?token=old",
    "https://example.com/feedback/#old",
    "not a URL",
  ]) {
    assert.throws(() => buildPersonalFeedbackUrl(baseUrl, token));
  }
});

test("link-map construction supports zero through four unique stories", () => {
  for (let storyCount = 0; storyCount <= 4; storyCount += 1) {
    const stories = [
      { id: "story-ai", desk: "ai" },
      { id: "story-work", desk: "work-and-tools" },
      { id: "story-security", desk: "security-and-privacy" },
      { id: "story-platforms", desk: "platforms-and-power" },
    ].slice(0, storyCount);
    const links = buildPersonalFeedbackLinkMap({
      editionDate: "2026-08-25",
      issueNumber: 4,
      stories,
    }, {
      baseUrl: BASE_URL,
      signingKey: SIGNING_KEY,
      now: NOW,
    });
    assert.equal(Object.keys(links.stories).length, storyCount);
    const editionPayload = verifyPersonalFeedbackToken(
      new URL(links.edition).hash.slice("#token=".length),
      { signingKey: SIGNING_KEY, now: NOW },
    );
    assert.deepEqual(
      { scope: editionPayload.scope, storyId: editionPayload.storyId, desk: editionPayload.desk },
      { scope: "edition", storyId: null, desk: null },
    );
    for (const story of stories) {
      const storyPayload = verifyPersonalFeedbackToken(
        new URL(links.stories[story.id]).hash.slice("#token=".length),
        { signingKey: SIGNING_KEY, now: NOW },
      );
      assert.deepEqual(
        { scope: storyPayload.scope, storyId: storyPayload.storyId, desk: storyPayload.desk },
        { scope: "story", storyId: story.id, desk: story.desk },
      );
      assert.equal(storyPayload.expiresAt, editionPayload.expiresAt);
    }
  }
});

test("link-map construction rejects more than four, duplicate, or over-specified stories", () => {
  const options = { baseUrl: BASE_URL, signingKey: SIGNING_KEY, now: NOW };
  const edition = { editionDate: "2026-08-25", issueNumber: 4 };
  assert.throws(
    () => buildPersonalFeedbackLinkMap({
      ...edition,
      stories: Array.from({ length: 5 }, (_, index) => ({ id: `story-${index}`, desk: "ai" })),
    }, options),
    /zero and four/,
  );
  assert.throws(
    () => buildPersonalFeedbackLinkMap({
      ...edition,
      stories: [{ id: "same-story", desk: "ai" }, { id: "same-story", desk: "ai" }],
    }, options),
    /must be unique/,
  );
  assert.throws(
    () => buildPersonalFeedbackLinkMap({
      ...edition,
      stories: [{ id: "story-ai", desk: "ai", headline: "Must not enter token builder" }],
    }, options),
    /unsupported fields/,
  );
});

test("decoded token payload contains only opaque editorial coordinates and no private content", () => {
  const token = buildPersonalFeedbackToken(TOKEN_FIELDS, {
    signingKey: SIGNING_KEY,
    now: NOW,
  });
  const payload = decodePayload(token);
  assert.deepEqual(Object.keys(payload), [
    "version",
    "audience",
    "editionDate",
    "issueNumber",
    "scope",
    "storyId",
    "desk",
    "expiresAt",
  ]);
  const serialized = JSON.stringify(payload);
  for (const privateValue of [
    "owner@example.com",
    "A private headline",
    "https://source.example/article",
    "cloudflare-workers-ai",
    "@cf/openai/gpt-oss-120b",
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});
