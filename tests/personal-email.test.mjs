import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateCanonicalEdition } from "../scripts/edition-content.mjs";
import {
  MAX_RESEND_REQUEST_BYTES,
  MAX_RESEND_RESPONSE_BYTES,
  PERSONAL_EMAIL_FROM,
  RESEND_EMAIL_ENDPOINT,
  personalEditionIdempotencyKey,
  renderPersonalEditionEmail,
  sendPersonalEditionEmail,
} from "../scripts/automation/personal-email.mjs";
import { FREE_FEED_SOURCES } from "../scripts/automation/free/feed-sources.mjs";

const baseEdition = JSON.parse(
  await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url), "utf8"),
);
const API_KEY = "re_personal_email_test_key_123456789";
const RECIPIENT = "owner@example.com";

function freeCandidate() {
  const candidate = structuredClone(baseEdition);
  candidate.status = "validated";
  candidate.publication.publishedAt = null;
  candidate.provenance.freePilot = {
    workflow: "free-morning-press",
    provider: "cloudflare-workers-ai",
    model: "@cf/openai/gpt-oss-120b",
    runId: "123456789",
    runUrl: "https://github.com/itworksinprod/first-fold/actions/runs/123456789",
    repository: "itworksinprod/first-fold",
    runMode: "on_time",
    generatedAt: candidate.publication.generatedAt,
    feedSnapshotSha256: "a".repeat(64),
    requestSha256: "b".repeat(64),
    responseSha256: "c".repeat(64),
    responseId: "workers-ai-test-response",
    inference: "workers-ai",
    feedSourceCount: FREE_FEED_SOURCES.length,
    successfulFeedSourceCount: FREE_FEED_SOURCES.length,
    candidateCount: 3,
  };
  candidate.provenance.sourceCheck = {
    status: "passed",
    checkedAt: candidate.publication.generatedAt,
    checkedSourceCount: 7,
    issues: [],
  };
  assert.equal(validateCanonicalEdition(candidate).valid, true);
  return candidate;
}

function successResponse(id = "email_test_123") {
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function capturedRejection(options) {
  try {
    await sendPersonalEditionEmail(freeCandidate(), {
      apiKey: API_KEY,
      recipient: RECIPIENT,
      timeoutMs: 100,
      ...options,
    });
  } catch (error) {
    return error;
  }
  assert.fail("Expected personal email delivery to reject.");
}

test("the renderer produces a static newspaper with stories, quiet desks, sources, and text fallback", () => {
  const candidate = freeCandidate();
  const rendered = renderPersonalEditionEmail(candidate);

  assert.equal(rendered.subject, "First Fold — Wednesday, August 19, 2026");
  assert.match(rendered.html, /^<!doctype html>/);
  assert.match(rendered.html, /Washington, D\.C\./);
  assert.match(rendered.html, /style="[^"]+"/);
  assert.doesNotMatch(rendered.html, /<link|<iframe|<form|javascript:/i);
  for (const page of Object.values(candidate.desks)) {
    if (page.story) {
      assert.match(rendered.text, new RegExp(page.story.headline.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      for (const source of page.story.sources) {
        assert.match(rendered.html, new RegExp(source.publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.match(rendered.text, new RegExp(source.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    } else {
      assert.match(rendered.html, /Quiet desk/);
      assert.match(rendered.text, /QUIET DESK/);
      assert.match(rendered.text, new RegExp(page.emptyReason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
  assert.match(rendered.text, /WHAT HAPPENED/);
  assert.match(rendered.text, /WHY IT MATTERS/);
  assert.match(rendered.text, /WHAT TO DO OR WATCH/);
  assert.match(rendered.text, /SOURCES/);
});

test("every rendered editorial and source field is HTML escaped", () => {
  const candidate = freeCandidate();
  const story = candidate.desks.ai.story;
  candidate.masthead.name = "First <script>alert(\"masthead\")</script>";
  candidate.masthead.tagline = "A & B's <b>paper</b>";
  candidate.frontPage.note = "Brief <img src=x onerror=\"alert(1)\"> & more";
  candidate.desks["platforms-and-power"].emptyReason = "Quiet <svg/onload=alert(1)>";
  story.headline = "Headline <script>alert(1)</script> & \"quoted\"";
  story.deck = "Deck <b onclick=\"alert(1)\">copy</b>";
  story.whatHappened = `<script>alert(1)</script> ${story.whatHappened}`;
  story.sources[0].publisher = "Publisher <img src=x onerror=alert(1)>";
  story.sources[0].title = "Source & <script>alert(1)</script>";
  story.sources[0].url = "https://example.com/report?first=1&next=%22%3E%3Cscript%3E";

  assert.equal(validateCanonicalEdition(candidate).valid, true);
  const { html } = renderPersonalEditionEmail(candidate);
  assert.doesNotMatch(html, /<script|<img|<svg|<b onclick/i);
  assert.doesNotMatch(html, /onerror="|onclick="/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /First &lt;script&gt;alert\(&quot;masthead&quot;\)&lt;\/script&gt;/);
  assert.match(html, /A &amp; B&#39;s &lt;b&gt;paper&lt;\/b&gt;/);
  assert.match(html, /report\?first=1&amp;next=/);
});

test("rendering fails closed for malformed, paid, unverified, or untrusted-lane candidates", () => {
  assert.throws(() => renderPersonalEditionEmail(null), /canonical, source-checked free candidate/);

  const mutations = [
    (candidate) => { candidate.status = "published"; candidate.publication.publishedAt = candidate.publication.publishAt; },
    (candidate) => { candidate.provenance.automation = { workflow: "morning-press" }; },
    (candidate) => { candidate.provenance.sourceCheck.status = "failed"; },
    (candidate) => { candidate.provenance.sourceCheck.issues = [{ code: "BAD" }]; },
    (candidate) => { candidate.provenance.freePilot.repository = "attacker/fork"; },
    (candidate) => { candidate.provenance.freePilot.model = "@cf/other/model"; },
    (candidate) => { candidate.provenance.freePilot.feedSourceCount += 1; },
    (candidate) => { candidate.frontPage.estimatedMinutes = "<img src=x onerror=alert(1)>"; },
    (candidate) => { candidate.desks.ai.story.whatHappened = "too short"; },
  ];
  for (const mutate of mutations) {
    const candidate = freeCandidate();
    mutate(candidate);
    assert.throws(
      () => renderPersonalEditionEmail(candidate),
      /canonical, source-checked free candidate/,
    );
  }
});

test("the sender posts one bounded Resend request with fixed identity and date idempotency", async () => {
  const calls = [];
  const candidate = freeCandidate();
  const result = await sendPersonalEditionEmail(candidate, {
    apiKey: API_KEY,
    recipient: RECIPIENT,
    fetchImpl: async (...args) => {
      calls.push(args);
      return successResponse();
    },
  });

  assert.deepEqual(result, {
    id: "email_test_123",
    editionDate: "2026-08-19",
    idempotencyKey: "first-fold-personal-2026-08-19",
  });
  assert.equal(personalEditionIdempotencyKey(candidate.editionDate), result.idempotencyKey);
  assert.equal(calls.length, 1);
  const [url, request] = calls[0];
  assert.equal(url, RESEND_EMAIL_ENDPOINT);
  assert.equal(request.method, "POST");
  assert.equal(request.redirect, "error");
  assert.equal(request.headers.Authorization, `Bearer ${API_KEY}`);
  assert.equal(request.headers["Idempotency-Key"], result.idempotencyKey);
  assert.equal(request.headers["User-Agent"], "First-Fold-Personal-Email/1.0");
  assert.ok(request.signal instanceof AbortSignal);
  assert.ok(Buffer.byteLength(request.body) < MAX_RESEND_REQUEST_BYTES);
  const body = JSON.parse(request.body);
  assert.equal(body.from, PERSONAL_EMAIL_FROM);
  assert.deepEqual(body.to, [RECIPIENT]);
  assert.match(body.subject, /August 19, 2026/);
  assert.match(body.html, /Washington, D\.C\./);
  assert.match(body.text, /QUIET DESK/);

  const observedKeys = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await sendPersonalEditionEmail(candidate, {
      apiKey: API_KEY,
      recipient: RECIPIENT,
      fetchImpl: async (_url, options) => {
        observedKeys.push(options.headers["Idempotency-Key"]);
        return successResponse(`email_retry_${attempt}`);
      },
    });
  }
  assert.deepEqual(observedKeys, [result.idempotencyKey, result.idempotencyKey]);
});

test("invalid secrets and recipients fail before fetch without exposing their values", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return successResponse();
  };
  const badKey = "not-a-resend-key-private-value";
  const badRecipient = "owner@example.com,attacker@example.com";
  const keyError = await capturedRejection({ apiKey: badKey, fetchImpl });
  const recipientError = await capturedRejection({ recipient: badRecipient, fetchImpl });
  assert.match(keyError.message, /RESEND_API_KEY/);
  assert.doesNotMatch(keyError.message, new RegExp(badKey));
  assert.match(recipientError.message, /PERSONAL_PAPER_EMAIL/);
  assert.doesNotMatch(recipientError.message, /owner@example|attacker@example/);
  assert.equal(fetchCalls, 0);
});

test("redirects, provider errors, oversized responses, malformed success, and timeouts fail safely", async (t) => {
  const privateFragments = [API_KEY, RECIPIENT, "PRIVATE_BODY_MARKER"];
  const cases = [
    ["redirect", async (_url, options) => {
      assert.equal(options.redirect, "error");
      return new Response("", { status: 302, headers: { location: "https://attacker.example" } });
    }, /unexpected redirect/],
    ["provider error", async () => new Response(
      JSON.stringify({ error: `${API_KEY} ${RECIPIENT} PRIVATE_BODY_MARKER` }),
      { status: 422 },
    ), /status 422/],
    ["network error", async () => {
      throw new Error(`${API_KEY} ${RECIPIENT} PRIVATE_BODY_MARKER`);
    }, /could not reach Resend/],
    ["declared oversize", async () => new Response("{}", {
      status: 200,
      headers: { "content-length": String(MAX_RESEND_RESPONSE_BYTES + 1) },
    }), /oversized response/],
    ["streamed oversize", async () => new Response("x".repeat(MAX_RESEND_RESPONSE_BYTES + 1), {
      status: 200,
    }), /oversized response/],
    ["malformed success", async () => new Response("PRIVATE_BODY_MARKER", { status: 200 }), /invalid success response/],
    ["missing id", async () => new Response("{}", { status: 200 }), /invalid success response/],
  ];

  for (const [name, fetchImpl, expected] of cases) {
    await t.test(name, async () => {
      const error = await capturedRejection({ fetchImpl });
      assert.match(error.message, expected);
      for (const fragment of privateFragments) assert.doesNotMatch(error.message, new RegExp(fragment));
    });
  }

  await t.test("timeout", async () => {
    const error = await capturedRejection({
      timeoutMs: 10,
      fetchImpl: async () => new Promise(() => {}),
    });
    assert.match(error.message, /timed out/);
    for (const fragment of privateFragments) assert.doesNotMatch(error.message, new RegExp(fragment));
  });
});

test("oversized request bodies are rejected before fetch", async () => {
  const candidate = freeCandidate();
  for (const page of Object.values(candidate.desks)) {
    if (!page.story) continue;
    page.story.whatHappened = `${page.story.whatHappened} ${"x".repeat(9_000)}`;
    page.story.whyItMatters = `${page.story.whyItMatters} ${"y".repeat(9_000)}`;
    page.story.whatToDoOrWatch = `${page.story.whatToDoOrWatch} ${"z".repeat(9_000)}`;
    const source = page.story.sources[0];
    page.story.sources = Array.from({ length: 20 }, (_, index) => ({
      ...source,
      id: `large-source-${page.desk}-${index}`,
      title: `${index}-${"s".repeat(970)}`,
      url: `https://example.com/${page.desk}/${index}`,
      relationship: index === 0 ? "originating" : index === 1 ? "independent" : "context",
    }));
    page.story.evidence = [{
      id: `large-evidence-${page.desk}`,
      statement: "Large rendering fixture.",
      sourceIds: [page.story.sources[0].id],
      verification: "confirmed",
    }];
  }
  // Long unbroken strings remain one reader-facing word, so the canonical
  // word-count gate still passes while the mail request crosses its byte cap.
  assert.equal(validateCanonicalEdition(candidate).valid, true);
  let fetchCalls = 0;
  await assert.rejects(
    sendPersonalEditionEmail(candidate, {
      apiKey: API_KEY,
      recipient: RECIPIENT,
      fetchImpl: async () => {
        fetchCalls += 1;
        return successResponse();
      },
    }),
    /safe delivery size limit/,
  );
  assert.equal(fetchCalls, 0);
});
