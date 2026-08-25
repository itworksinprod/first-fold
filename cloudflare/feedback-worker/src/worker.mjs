const MAX_BODY_BYTES = 16 * 1024;
const MAX_NOTE_LENGTH = 500;
const MAX_TOKEN_LENGTH = 4_096;
const TOKEN_LIFETIME_SECONDS = 14 * 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 5 * 60;
const TOKEN_HMAC_CONTEXT = "first-fold:personal-feedback:v1\u0000";

export const FEEDBACK_AUDIENCE = "first-fold-feedback";

const CATEGORIES = Object.freeze([
  "useful",
  "not_relevant",
  "repeated",
  "wrong_desk",
  "missed_story",
  "correction",
]);
const CATEGORY_SET = new Set(CATEGORIES);

const DESKS = Object.freeze([
  "ai",
  "work-and-tools",
  "security-and-privacy",
  "platforms-and-power",
]);
const DESK_SET = new Set(DESKS);

const TOKEN_KEYS = Object.freeze([
  "audience",
  "desk",
  "editionDate",
  "expiresAt",
  "issueNumber",
  "scope",
  "storyId",
  "version",
]);

const textEncoder = new TextEncoder();
const fatalTextDecoder = new TextDecoder("utf-8", { fatal: true });

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(value, requiredKeys, optionalKeys = []) {
  const actual = Object.keys(value).sort();
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (actual.some((key) => !allowed.has(key))) return false;
  return requiredKeys.every((key) => Object.hasOwn(value, key));
}

function hasControls(value) {
  return /[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function containsDisallowedPersonalReference(value) {
  return (
    /(?:https?:\/\/|www\.|mailto:)/iu.test(value) ||
    /(?:^|\s)[^\s@]+@[^\s@]+\.[^\s@]+(?:$|\s)/u.test(value)
  );
}

function isValidEditionDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTargetId(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 200 &&
    /^[a-z0-9][a-z0-9._:-]*$/u.test(value)
  );
}

function requireRuntimeBindings(env) {
  const secret = typeof env?.PERSONAL_FEEDBACK_SIGNING_KEY === "string"
    ? env.PERSONAL_FEEDBACK_SIGNING_KEY
    : "";
  if (
    textEncoder.encode(secret).byteLength < 32 ||
    textEncoder.encode(secret).byteLength > 4_096 ||
    secret !== secret.trim() ||
    hasControls(secret) ||
    typeof env?.DB?.prepare !== "function"
  ) {
    throw new HttpError(503, "temporarily_unavailable");
  }
  return secret;
}

function baseHeaders({ html = false, nonce = "" } = {}) {
  const contentSecurityPolicy = html
    ? [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        `style-src 'nonce-${nonce}'`,
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "img-src 'none'",
        "font-src 'none'",
        "object-src 'none'",
        "manifest-src 'none'",
      ].join("; ")
    : "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

  return {
    "cache-control": "no-store, max-age=0",
    "content-security-policy": contentSecurityPolicy,
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-robots-tag": "noindex, nofollow, noarchive",
  };
}

function jsonResponse(body, status, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: {
      ...baseHeaders(),
      ...extraHeaders,
    },
  });
}

function errorResponse(error) {
  if (error instanceof HttpError) {
    return jsonResponse({ ok: false, error: error.code }, error.status);
  }
  console.error(JSON.stringify({
    component: "first-fold-personal-feedback",
    event: "request_failed",
  }));
  return jsonResponse({ ok: false, error: "temporarily_unavailable" }, 503);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value, expectedLength = null) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw new HttpError(401, "invalid_or_expired_token");
  }
  const paddingLength = (4 - (value.length % 4)) % 4;
  try {
    const binary = atob(
      value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(paddingLength),
    );
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (expectedLength !== null && bytes.byteLength !== expectedLength) {
      throw new HttpError(401, "invalid_or_expired_token");
    }
    if (bytesToBase64Url(bytes) !== value) {
      throw new HttpError(401, "invalid_or_expired_token");
    }
    return bytes;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "invalid_or_expired_token");
  }
}

function parseTokenPayload(payloadBytes, nowSeconds) {
  let payload;
  try {
    payload = JSON.parse(fatalTextDecoder.decode(payloadBytes));
  } catch {
    throw new HttpError(401, "invalid_or_expired_token");
  }

  if (!isPlainObject(payload) || !hasExactKeys(payload, TOKEN_KEYS)) {
    throw new HttpError(401, "invalid_or_expired_token");
  }
  const expiryMs = typeof payload.expiresAt === "string"
    ? Date.parse(payload.expiresAt)
    : Number.NaN;
  const nowMs = nowSeconds * 1_000;
  const canonicalExpiry =
    Number.isFinite(expiryMs) &&
    payload.expiresAt.length === 24 &&
    new Date(expiryMs).toISOString() === payload.expiresAt;
  if (
    payload.version !== 1 ||
    payload.audience !== FEEDBACK_AUDIENCE ||
    !isValidEditionDate(payload.editionDate) ||
    !Number.isSafeInteger(payload.issueNumber) ||
    payload.issueNumber < 1 ||
    payload.issueNumber > 1_000_000 ||
    !["edition", "story"].includes(payload.scope) ||
    !canonicalExpiry ||
    expiryMs <= nowMs ||
    expiryMs > nowMs + (TOKEN_LIFETIME_SECONDS + CLOCK_SKEW_SECONDS) * 1_000
  ) {
    throw new HttpError(401, "invalid_or_expired_token");
  }

  if (payload.scope === "edition") {
    if (payload.storyId !== null || payload.desk !== null) {
      throw new HttpError(401, "invalid_or_expired_token");
    }
  } else if (!isValidTargetId(payload.storyId) || !DESK_SET.has(payload.desk)) {
    throw new HttpError(401, "invalid_or_expired_token");
  }

  const canonicalPayload = {
    version: 1,
    audience: FEEDBACK_AUDIENCE,
    editionDate: payload.editionDate,
    issueNumber: payload.issueNumber,
    scope: payload.scope,
    storyId: payload.storyId,
    desk: payload.desk,
    expiresAt: payload.expiresAt,
  };
  if (JSON.stringify(canonicalPayload) !== fatalTextDecoder.decode(payloadBytes)) {
    throw new HttpError(401, "invalid_or_expired_token");
  }

  return Object.freeze({
    editionDate: payload.editionDate,
    issueNumber: payload.issueNumber,
    scope: payload.scope,
    storyId: payload.storyId,
    desk: payload.desk,
  });
}

async function verifyToken(rawToken, secret, nowMs, cryptoImpl) {
  if (
    typeof rawToken !== "string" ||
    rawToken.length < 80 ||
    rawToken.length > MAX_TOKEN_LENGTH ||
    hasControls(rawToken)
  ) {
    throw new HttpError(401, "invalid_or_expired_token");
  }
  const segments = rawToken.split(".");
  if (segments.length !== 2 || segments[0].length > 1_500) {
    throw new HttpError(401, "invalid_or_expired_token");
  }

  const [payloadSegment, signatureSegment] = segments;
  const payloadBytes = base64UrlToBytes(payloadSegment);
  const signatureBytes = base64UrlToBytes(signatureSegment, 32);
  const key = await cryptoImpl.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedBytes = new Uint8Array(
    textEncoder.encode(TOKEN_HMAC_CONTEXT).byteLength + payloadBytes.byteLength,
  );
  signedBytes.set(textEncoder.encode(TOKEN_HMAC_CONTEXT), 0);
  signedBytes.set(payloadBytes, textEncoder.encode(TOKEN_HMAC_CONTEXT).byteLength);
  const valid = await cryptoImpl.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    signedBytes,
  );
  if (!valid) throw new HttpError(401, "invalid_or_expired_token");

  const nowSeconds = Math.floor(nowMs / 1_000);
  return parseTokenPayload(payloadBytes, nowSeconds);
}

async function sha256Hex(value, cryptoImpl) {
  const digest = new Uint8Array(
    await cryptoImpl.subtle.digest("SHA-256", textEncoder.encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readBoundedJson(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "content_type_must_be_json");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) throw new HttpError(400, "invalid_request");
    if (Number(contentLength) > MAX_BODY_BYTES) {
      throw new HttpError(413, "request_too_large");
    }
  }
  if (request.body === null) throw new HttpError(400, "invalid_request");

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The size rejection remains authoritative even if cancellation fails.
      }
      throw new HttpError(413, "request_too_large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let raw;
  try {
    raw = fatalTextDecoder.decode(bytes);
  } catch {
    throw new HttpError(400, "invalid_request");
  }
  if (raw.length === 0) throw new HttpError(400, "invalid_request");

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid_request");
  }
}

function requireFeedbackBody(value) {
  if (!isPlainObject(value) || !hasExactKeys(value, ["category", "token"], ["note"])) {
    throw new HttpError(400, "invalid_request");
  }
  if (!CATEGORY_SET.has(value.category)) throw new HttpError(400, "invalid_request");
  if (typeof value.token !== "string") throw new HttpError(400, "invalid_request");

  const note = Object.hasOwn(value, "note") ? value.note : "";
  if (
    typeof note !== "string" ||
    note.length > MAX_NOTE_LENGTH ||
    note !== note.trim() ||
    hasControls(note) ||
    containsDisallowedPersonalReference(note)
  ) {
    throw new HttpError(400, "invalid_request");
  }
  if (["missed_story", "correction"].includes(value.category) && note.length < 8) {
    throw new HttpError(400, "invalid_request");
  }

  return Object.freeze({
    token: value.token,
    category: value.category,
    note,
  });
}

function randomNonce(cryptoImpl) {
  const bytes = new Uint8Array(18);
  cryptoImpl.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function feedbackFormHtml(nonce) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>First Fold feedback</title>
  <style nonce="${nonce}">
    :root{color-scheme:light;--paper:#f5f0e6;--ink:#171512;--muted:#665f55;--rule:#9d9485;--accent:#712b27}
    *{box-sizing:border-box}body{margin:0;background:#ded8cc;color:var(--ink);font-family:Georgia,"Times New Roman",serif}
    main{width:min(42rem,calc(100% - 2rem));margin:2rem auto;background:var(--paper);border:1px solid var(--rule);border-top:7px solid var(--accent);padding:clamp(1.35rem,5vw,3rem);box-shadow:0 4px 18px rgba(39,32,23,.12)}
    .kicker,label,button,.fine{font-family:Arial,Helvetica,sans-serif}.kicker{margin:0;color:var(--accent);font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    h1{font-size:clamp(2.4rem,10vw,4.2rem);line-height:.95;letter-spacing:-.04em;margin:.45rem 0 1rem}.intro{color:var(--muted);font-size:1.08rem;line-height:1.55;margin:0 0 1.7rem}
    fieldset{border:0;border-top:2px solid var(--ink);padding:1.2rem 0 0;margin:0}legend{font-size:1.25rem;font-weight:700;padding:0 .5rem 0 0}
    label.option{display:flex;gap:.65rem;align-items:flex-start;padding:.62rem 0;font-weight:700}input{margin-top:.15rem;accent-color:var(--accent)}
    label[for=note]{display:block;margin:1.1rem 0 .45rem;font-size:.82rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
    textarea{width:100%;min-height:7rem;padding:.8rem;border:1px solid var(--rule);background:#fffdf7;color:var(--ink);font:1rem/1.45 Georgia,"Times New Roman",serif;resize:vertical}
    button{margin-top:1rem;border:0;background:var(--accent);color:white;padding:.8rem 1.1rem;font-weight:700;cursor:pointer}button:disabled{cursor:not-allowed;opacity:.55}
    .fine{color:var(--muted);font-size:.78rem;line-height:1.5}.status{min-height:1.5em;font-weight:700}.error{color:#8b1d18}.success{color:#24613b}
  </style>
</head>
<body>
<main>
  <p class="kicker">Private quality note</p>
  <h1>Help improve tomorrow’s fold.</h1>
  <p class="intro">Choose the clearest signal. Feedback is reviewed by a person; it never changes the editorial rules automatically.</p>
  <form id="feedback-form">
    <fieldset>
      <legend>What should the newsroom know?</legend>
      <label class="option"><input type="radio" name="category" value="useful" required> Useful</label>
      <label class="option"><input type="radio" name="category" value="not_relevant"> Not relevant</label>
      <label class="option"><input type="radio" name="category" value="repeated"> Repeated</label>
      <label class="option"><input type="radio" name="category" value="wrong_desk"> Wrong desk</label>
      <label class="option"><input type="radio" name="category" value="missed_story"> Missed story</label>
      <label class="option"><input type="radio" name="category" value="correction"> Correction</label>
    </fieldset>
    <label for="note">Optional note</label>
    <textarea id="note" maxlength="500" placeholder="A short note, without links or personal information."></textarea>
    <p class="fine">A note of at least eight characters is required for a missed story or correction. Do not include email addresses, links, or sensitive information.</p>
    <button id="submit" type="submit">Send private feedback</button>
    <p id="status" class="status" role="status" aria-live="polite"></p>
  </form>
</main>
<script nonce="${nonce}">
(() => {
  const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  window.history.replaceState(null, "", window.location.pathname);
  const fragmentValues = new URLSearchParams(fragment);
  let feedbackToken = fragmentValues.get("token") || "";
  const suggestedCategory = fragmentValues.get("category");
  const form = document.getElementById("feedback-form");
  const submit = document.getElementById("submit");
  const status = document.getElementById("status");
  const note = document.getElementById("note");
  const categories = new Set(${JSON.stringify(CATEGORIES)});

  if (categories.has(suggestedCategory)) {
    const input = form.elements.namedItem("category");
    for (const option of input) option.checked = option.value === suggestedCategory;
  }
  if (!feedbackToken) {
    submit.disabled = true;
    status.className = "status error";
    status.textContent = "This private link is missing or incomplete. Open the link from your First Fold email.";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const category = new FormData(form).get("category");
    const cleanedNote = note.value.trim().replace(/\\s+/g, " ");
    if (!feedbackToken || !categories.has(category)) return;
    if ((category === "missed_story" || category === "correction") && cleanedNote.length < 8) {
      status.className = "status error";
      status.textContent = "Add a short note for a missed story or correction.";
      return;
    }

    submit.disabled = true;
    status.className = "status";
    status.textContent = "Sending…";
    try {
      const response = await fetch("/v1/feedback", {
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: feedbackToken, category, note: cleanedNote }),
      });
      if (!response.ok) throw new Error("feedback_rejected");
      feedbackToken = "";
      form.reset();
      status.className = "status success";
      status.textContent = "Thank you. Your private quality note was recorded.";
    } catch {
      submit.disabled = false;
      status.className = "status error";
      status.textContent = "That note could not be recorded. Reopen the email link and try again.";
    }
  });
})();
</script>
</body>
</html>`;
}

async function serveFeedbackForm(cryptoImpl) {
  const nonce = randomNonce(cryptoImpl);
  return new Response(feedbackFormHtml(nonce), {
    status: 200,
    headers: {
      ...baseHeaders({ html: true, nonce }),
      "content-type": "text/html; charset=utf-8",
    },
  });
}

async function storeFeedback(env, tokenHash, tokenClaims, feedback, createdAtSeconds) {
  await env.DB.prepare(
    `INSERT INTO personal_feedback (
      token_hash,
      edition_date,
      issue_number,
      scope,
      story_id,
      desk,
      category,
      note,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT(token_hash) DO NOTHING`,
  ).bind(
    tokenHash,
    tokenClaims.editionDate,
    tokenClaims.issueNumber,
    tokenClaims.scope,
    tokenClaims.storyId,
    tokenClaims.desk,
    feedback.category,
    feedback.note,
    createdAtSeconds,
  ).run();
}

async function acceptFeedback(request, env, url, nowMs, cryptoImpl) {
  const origin = request.headers.get("origin");
  if (origin !== url.origin) throw new HttpError(403, "forbidden");

  const secret = requireRuntimeBindings(env);
  const feedback = requireFeedbackBody(await readBoundedJson(request));
  const tokenClaims = await verifyToken(feedback.token, secret, nowMs, cryptoImpl);
  const tokenHash = await sha256Hex(feedback.token, cryptoImpl);
  await storeFeedback(
    env,
    tokenHash,
    tokenClaims,
    feedback,
    Math.floor(nowMs / 1_000),
  );

  // A replay gets the same response as a first submission and cannot create a
  // second row. This avoids revealing whether a particular link was used.
  return jsonResponse({ ok: true }, 202);
}

export async function handleRequest(
  request,
  env,
  { nowMs = Date.now(), cryptoImpl = globalThis.crypto } = {},
) {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      if (request.method !== "GET") {
        return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, {
          allow: "GET",
        });
      }
      return await serveFeedbackForm(cryptoImpl);
    }

    if (url.pathname === "/v1/feedback") {
      if (request.method !== "POST") {
        return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, {
          allow: "POST",
        });
      }
      return await acceptFeedback(request, env, url, nowMs, cryptoImpl);
    }

    return jsonResponse({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}

export default {
  async fetch(request, env) {
    return await handleRequest(request, env);
  },
};
