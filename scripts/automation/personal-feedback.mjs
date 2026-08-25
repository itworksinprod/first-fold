#!/usr/bin/env node

import { createHmac, timingSafeEqual } from "node:crypto";

export const PERSONAL_FEEDBACK_TOKEN_VERSION = 1;
export const PERSONAL_FEEDBACK_AUDIENCE = "first-fold-feedback";
export const PERSONAL_FEEDBACK_TOKEN_LIFETIME_DAYS = 14;
export const PERSONAL_FEEDBACK_TOKEN_LIFETIME_MS =
  PERSONAL_FEEDBACK_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1_000;

const MINIMUM_SIGNING_KEY_BYTES = 32;
const MAXIMUM_SIGNING_KEY_BYTES = 4_096;
const MAXIMUM_TOKEN_LENGTH = 4_096;
const MAXIMUM_BASE_URL_LENGTH = 2_048;
const MAXIMUM_STORY_ID_LENGTH = 200;
const MAXIMUM_ISSUE_NUMBER = 1_000_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const STORY_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,199}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const TOKEN_HMAC_CONTEXT = "first-fold:personal-feedback:v1\u0000";
const TOKEN_KEYS = Object.freeze([
  "version",
  "audience",
  "editionDate",
  "issueNumber",
  "scope",
  "storyId",
  "desk",
  "expiresAt",
]);
const STORY_INPUT_KEYS = Object.freeze(["id", "desk"]);
const DESKS = new Set([
  "ai",
  "work-and-tools",
  "security-and-privacy",
  "platforms-and-power",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new Error(`${label} contains missing or unsupported fields.`);
  }
}

function requireSigningKey(value) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    CONTROL_CHARACTERS.test(value)
  ) {
    throw new Error("A valid personal feedback signing key is required.");
  }
  const byteLength = Buffer.byteLength(value, "utf8");
  if (byteLength < MINIMUM_SIGNING_KEY_BYTES || byteLength > MAXIMUM_SIGNING_KEY_BYTES) {
    throw new Error("A valid personal feedback signing key is required.");
  }
  return value;
}

export function assertPersonalFeedbackSigningKey(value) {
  requireSigningKey(value);
  return true;
}

function requireDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new Error("Feedback editionDate must use YYYY-MM-DD.");
  }
  const epoch = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== value) {
    throw new Error("Feedback editionDate must be a real calendar date.");
  }
  return value;
}

function requireIssueNumber(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAXIMUM_ISSUE_NUMBER) {
    throw new Error("Feedback issueNumber must be a positive bounded integer.");
  }
  return value;
}

function requireStoryId(value) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length > MAXIMUM_STORY_ID_LENGTH ||
    CONTROL_CHARACTERS.test(value) ||
    !STORY_ID_PATTERN.test(value)
  ) {
    throw new Error("Feedback storyId is invalid.");
  }
  return value;
}

function requireDesk(value) {
  if (!DESKS.has(value)) throw new Error("Feedback desk is invalid.");
  return value;
}

function requireInstant(value, label) {
  const instant = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error(`${label} must be a valid instant.`);
  return instant;
}

function requireCanonicalExpiry(value) {
  if (typeof value !== "string" || value.length !== 24) {
    throw new Error("Feedback expiresAt must be a canonical UTC instant.");
  }
  const instant = requireInstant(value, "Feedback expiresAt");
  if (instant.toISOString() !== value) {
    throw new Error("Feedback expiresAt must be a canonical UTC instant.");
  }
  return value;
}

function canonicalPayload(fields, expiresAt) {
  if (!isObject(fields)) throw new Error("Feedback token fields must be an object.");
  const allowedInputKeys = ["editionDate", "issueNumber", "scope", "storyId", "desk"];
  const actualKeys = Object.keys(fields);
  if (actualKeys.some((key) => !allowedInputKeys.includes(key))) {
    throw new Error("Feedback token fields contain unsupported data.");
  }
  const editionDate = requireDate(fields.editionDate);
  const issueNumber = requireIssueNumber(fields.issueNumber);
  if (fields.scope !== "edition" && fields.scope !== "story") {
    throw new Error("Feedback scope must be edition or story.");
  }
  let storyId = null;
  let desk = null;
  if (fields.scope === "edition") {
    if ((fields.storyId ?? null) !== null || (fields.desk ?? null) !== null) {
      throw new Error("Edition feedback cannot identify a story or desk.");
    }
  } else {
    storyId = requireStoryId(fields.storyId);
    desk = requireDesk(fields.desk);
  }
  return {
    version: PERSONAL_FEEDBACK_TOKEN_VERSION,
    audience: PERSONAL_FEEDBACK_AUDIENCE,
    editionDate,
    issueNumber,
    scope: fields.scope,
    storyId,
    desk,
    expiresAt: requireCanonicalExpiry(expiresAt),
  };
}

function validatedPayload(value) {
  requireExactKeys(value, TOKEN_KEYS, "Feedback token payload");
  if (value.version !== PERSONAL_FEEDBACK_TOKEN_VERSION) {
    throw new Error("Feedback token version is unsupported.");
  }
  if (value.audience !== PERSONAL_FEEDBACK_AUDIENCE) {
    throw new Error("Feedback token audience is invalid.");
  }
  return canonicalPayload({
    editionDate: value.editionDate,
    issueNumber: value.issueNumber,
    scope: value.scope,
    storyId: value.storyId,
    desk: value.desk,
  }, value.expiresAt);
}

function signatureFor(payloadBytes, signingKey) {
  return createHmac("sha256", requireSigningKey(signingKey))
    .update(TOKEN_HMAC_CONTEXT, "utf8")
    .update(payloadBytes)
    .digest();
}

function decodeCanonicalBase64Url(value, label) {
  if (typeof value !== "string" || !BASE64URL_PATTERN.test(value)) {
    throw new Error(`${label} is not canonical base64url data.`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (!decoded.length || decoded.toString("base64url") !== value) {
    throw new Error(`${label} is not canonical base64url data.`);
  }
  return decoded;
}

export function buildPersonalFeedbackToken(fields, { signingKey, now = new Date() } = {}) {
  const issuedAt = requireInstant(now, "Feedback token creation time");
  const expiresAt = new Date(
    issuedAt.getTime() + PERSONAL_FEEDBACK_TOKEN_LIFETIME_MS,
  ).toISOString();
  const payload = canonicalPayload(fields, expiresAt);
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  const signature = signatureFor(payloadBytes, signingKey);
  return `${payloadBytes.toString("base64url")}.${signature.toString("base64url")}`;
}

export function verifyPersonalFeedbackToken(token, { signingKey, now = new Date() } = {}) {
  requireSigningKey(signingKey);
  if (
    typeof token !== "string" ||
    !token ||
    token.length > MAXIMUM_TOKEN_LENGTH ||
    token !== token.trim()
  ) {
    throw new Error("Personal feedback token is invalid.");
  }
  const segments = token.split(".");
  if (segments.length !== 2) throw new Error("Personal feedback token is invalid.");
  const payloadBytes = decodeCanonicalBase64Url(segments[0], "Feedback token payload");
  const suppliedSignature = decodeCanonicalBase64Url(segments[1], "Feedback token signature");
  const expectedSignature = signatureFor(payloadBytes, signingKey);
  const comparableSignature = Buffer.alloc(expectedSignature.length);
  suppliedSignature.copy(comparableSignature, 0, 0, expectedSignature.length);
  const signatureMatches = timingSafeEqual(comparableSignature, expectedSignature);
  if (suppliedSignature.length !== expectedSignature.length || !signatureMatches) {
    throw new Error("Personal feedback token signature is invalid.");
  }

  let payloadText;
  let parsed;
  try {
    payloadText = new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes);
    parsed = JSON.parse(payloadText);
  } catch {
    throw new Error("Personal feedback token payload is invalid.");
  }
  const payload = validatedPayload(parsed);
  if (JSON.stringify(payload) !== payloadText) {
    throw new Error("Personal feedback token payload is not canonical.");
  }
  const checkedAt = requireInstant(now, "Feedback token verification time");
  if (Date.parse(payload.expiresAt) <= checkedAt.getTime()) {
    throw new Error("Personal feedback token has expired.");
  }
  return payload;
}

function requireBaseUrl(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    value.length > MAXIMUM_BASE_URL_LENGTH ||
    CONTROL_CHARACTERS.test(value)
  ) {
    throw new Error("Personal feedback base URL is invalid.");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Personal feedback base URL is invalid.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.href.length > MAXIMUM_BASE_URL_LENGTH
  ) {
    throw new Error("Personal feedback base URL must be an HTTPS URL without credentials, query, or fragment.");
  }
  return parsed;
}

export function buildPersonalFeedbackUrl(baseUrl, token) {
  const parsed = requireBaseUrl(baseUrl);
  if (
    typeof token !== "string" ||
    !token ||
    token.length > MAXIMUM_TOKEN_LENGTH ||
    token !== token.trim() ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  ) {
    throw new Error("Personal feedback token is invalid.");
  }
  parsed.hash = `token=${token}`;
  return parsed.href;
}

export function buildPersonalFeedbackLinkMap(
  { editionDate, issueNumber, stories } = {},
  { baseUrl, signingKey, now = new Date() } = {},
) {
  requireDate(editionDate);
  requireIssueNumber(issueNumber);
  if (!Array.isArray(stories) || stories.length > 4) {
    throw new Error("Personal feedback links require between zero and four stories.");
  }
  const createdAt = requireInstant(now, "Feedback token creation time");
  const edition = buildPersonalFeedbackUrl(baseUrl, buildPersonalFeedbackToken({
    editionDate,
    issueNumber,
    scope: "edition",
    storyId: null,
    desk: null,
  }, { signingKey, now: createdAt }));
  const storyLinks = Object.create(null);
  for (const [index, story] of stories.entries()) {
    requireExactKeys(story, STORY_INPUT_KEYS, `Feedback story ${index + 1}`);
    const storyId = requireStoryId(story.id);
    const desk = requireDesk(story.desk);
    if (Object.hasOwn(storyLinks, storyId)) {
      throw new Error("Personal feedback story IDs must be unique.");
    }
    storyLinks[storyId] = buildPersonalFeedbackUrl(baseUrl, buildPersonalFeedbackToken({
      editionDate,
      issueNumber,
      scope: "story",
      storyId,
      desk,
    }, { signingKey, now: createdAt }));
  }
  return Object.freeze({ edition, stories: Object.freeze(storyLinks) });
}
