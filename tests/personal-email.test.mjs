import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateCanonicalEdition } from "../scripts/edition-content.mjs";
import { buildPersonalFeedbackLinkMap } from "../scripts/automation/personal-feedback.mjs";
import {
  MAX_RESEND_REQUEST_BYTES,
  MAX_RESEND_RESPONSE_BYTES,
  PERSONAL_EMAIL_FROM,
  RESEND_EMAIL_ENDPOINT,
  assertPersonalEmailCandidate,
  personalEditionIdempotencyKey,
  renderPersonalEditionEmail,
  sendPersonalEditionEmail,
} from "../scripts/automation/personal-email.mjs";

const baseEdition = JSON.parse(
  await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url), "utf8"),
);
const API_KEY = "re_personal_email_test_key_123456789";
const RECIPIENT = "owner@example.com";
const receiptMaximums = {
  materialityNewsworthiness: 30,
  deskRelevance: 20,
  sourceStrength: 20,
  readerUsefulnessActionability: 15,
  freshness: 15,
};

function addTrustedReceipt(story) {
  const sourceById = new Map(story.sources.map((source) => [source.id, source]));
  const factualSources = [...new Set(story.evidence.flatMap((claim) => claim.sourceIds))]
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source) => source && source.relationship !== "context");
  const evidenceTier = factualSources.length === 1 && factualSources[0].relationship === "originating"
    ? "authoritative-single"
    : "corroborated";
  if (evidenceTier === "authoritative-single") {
    story.priority = "notable";
    story.confidence.level = "medium";
    story.evidence = story.evidence.map((claim) => ({ ...claim, verification: "company-claimed" }));
  }
  const components = {
    materialityNewsworthiness: 0,
    deskRelevance: 0,
    sourceStrength: evidenceTier === "authoritative-single" ? 16 : 20,
    readerUsefulnessActionability: 0,
    freshness: 0,
  };
  let remaining = story.selection.score - components.sourceStrength;
  for (const component of [
    "materialityNewsworthiness",
    "deskRelevance",
    "readerUsefulnessActionability",
    "freshness",
  ]) {
    components[component] = Math.min(receiptMaximums[component], remaining);
    remaining -= components[component];
  }
  assert.equal(remaining, 0);
  story.selection.validationReceipt = {
    version: "editorial-v1",
    score: story.selection.score,
    requiredScore: 70,
    components,
    componentMaximums: receiptMaximums,
    evidenceTier,
    factualSourceCount: factualSources.length,
    publisherCount: evidenceTier === "corroborated" ? factualSources.length : 1,
  };
}

function personalCandidate() {
  const candidate = structuredClone(baseEdition);
  candidate.status = "validated";
  candidate.publication.publishedAt = null;
  const platformStory = structuredClone(candidate.desks["work-and-tools"].story);
  platformStory.id = "2026-08-19-test-platform-story";
  platformStory.canonicalEventKey = "test-platform-story-2026-08-19";
  platformStory.desk = "platforms-and-power";
  platformStory.headline = "A test platform story fills the private edition";
  platformStory.editorial.primaryEntity = "Test Platform Company";
  platformStory.editorial.aiAdjacent = false;
  platformStory.editorial.deskFit =
    "This fixture represents a source-verified platform policy development.";
  candidate.desks["platforms-and-power"] = {
    desk: "platforms-and-power",
    story: platformStory,
    emptyReason: null,
  };
  candidate.frontPage.storyOrder.push(platformStory.id);
  candidate.frontPage.note =
    "Four source-verified developments cleared the private research contract.";
  candidate.frontPage.estimatedMinutes = 8;
  for (const page of Object.values(candidate.desks)) addTrustedReceipt(page.story);
  if (
    Object.values(candidate.desks).some((page) =>
      page.story.selection.validationReceipt.evidenceTier === "authoritative-single" &&
      page.story.id === candidate.frontPage.stopThePressesStoryId)
  ) {
    candidate.frontPage.stopThePressesStoryId = null;
  }
  candidate.provenance.personalFreeResearch = {
    workflow: "personal-morning-paper",
    provider: "cloudflare-workers-ai",
    researchMethod: "curated-live-feeds",
    model: "@cf/openai/gpt-oss-120b",
    runId: "123456789",
    runUrl: "https://github.com/itworksinprod/first-fold/actions/runs/123456789",
    repository: "itworksinprod/first-fold",
    runMode: "on_time",
    generatedAt: candidate.publication.generatedAt,
    inference: "workers-ai",
    feedSnapshotSha256: "a".repeat(64),
    requestSha256: "b".repeat(64),
    responseSha256: "c".repeat(64),
    responseId: "workers_ai_personal_test",
    feedSourceCount: 17,
    successfulFeedSourceCount: 17,
    coveredDeskCount: 4,
    candidateCount: 4,
    candidateSelection: "deterministic-selected-slate",
    evidencePolicy: "authoritative-or-corroborated",
    lookbackHours: 72,
    minimumScore: 70,
    minimumAuthoritativeScore: 70,
    ephemeral: true,
    requiredStoryCount: 4,
    selectedStoryCount: 4,
    maxResearchAttempts: 2,
    researchRetryBelowStoryCount: 3,
    researchAttemptCount: 1,
    researchRetryOutcome: "not-needed",
    repeatLedgerSchemaVersion: 2,
    repeatLookbackDays: 30,
    repeatStateSha256: "d".repeat(64),
    priorLedgerEditionCount: 0,
    priorLedgerStoryCount: 0,
    qualityPilotOrdinal: 1,
    maxModelRequests: 2,
  };
  candidate.provenance.sourceCheck = {
    status: "passed",
    checkedAt: candidate.publication.generatedAt,
    checkedSourceCount: 8,
    issues: [],
  };
  assert.equal(validateCanonicalEdition(candidate).valid, true);
  return candidate;
}

function leaveDeskQuiet(candidate, desk) {
  const removedStory = candidate.desks[desk].story;
  candidate.desks[desk] = {
    desk,
    story: null,
    emptyReason: `No qualifying ${desk} development cleared the editorial threshold.`,
  };
  candidate.frontPage.storyOrder = candidate.frontPage.storyOrder
    .filter((storyId) => storyId !== removedStory.id);
  candidate.frontPage.leadStoryId = candidate.frontPage.storyOrder[0] ?? null;
  if (candidate.frontPage.stopThePressesStoryId === removedStory.id) {
    candidate.frontPage.stopThePressesStoryId = null;
  }
  const selectedStoryCount = Object.values(candidate.desks)
    .filter((page) => page.story !== null).length;
  candidate.frontPage.note = selectedStoryCount === 0
    ? "Research completed across 17 of 17 reviewed feeds. No source-checked development cleared the unchanged editorial threshold today."
    : `${selectedStoryCount} source-verified ${selectedStoryCount === 1 ? "development" : "developments"} cleared the private research contract.`;
  candidate.frontPage.estimatedMinutes = Math.max(1, selectedStoryCount * 2);
  const research = candidate.provenance.personalFreeResearch;
  research.candidateCount = selectedStoryCount;
  research.requiredStoryCount = selectedStoryCount;
  research.selectedStoryCount = selectedStoryCount;
  research.researchAttemptCount = selectedStoryCount < 2 ? 2 : 1;
  research.researchRetryOutcome = selectedStoryCount < 2 ? "no-improvement" : "not-needed";
  research.inference = selectedStoryCount === 0
    ? "skipped-no-eligible-candidates"
    : "workers-ai";
  research.responseId = selectedStoryCount === 0
    ? "not-invoked"
    : "workers_ai_personal_test";
  candidate.provenance.sourceCheck.checkedSourceCount = selectedStoryCount * 2;
  assert.equal(validateCanonicalEdition(candidate).valid, true);
  return candidate;
}

function candidateWithStoryCount(storyCount) {
  assert.ok(Number.isInteger(storyCount) && storyCount >= 0 && storyCount <= 4);
  const candidate = personalCandidate();
  const removalOrder = [
    "platforms-and-power",
    "security-and-privacy",
    "work-and-tools",
    "ai",
  ];
  for (const desk of removalOrder.slice(0, 4 - storyCount)) {
    leaveDeskQuiet(candidate, desk);
  }
  return candidate;
}

function feedbackLinksFor(candidate) {
  return buildPersonalFeedbackLinkMap({
    editionDate: candidate.editionDate,
    issueNumber: candidate.issueNumber,
    stories: Object.values(candidate.desks)
      .filter((page) => page.story !== null)
      .map((page) => ({ id: page.story.id, desk: page.desk })),
  }, {
    baseUrl: "https://feedback.example.test/respond",
    signingKey: "f".repeat(32),
    now: new Date("2026-08-19T10:00:00.000Z"),
  });
}

function successResponse(id = "email_test_123") {
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function capturedRejection(options) {
  try {
    await sendPersonalEditionEmail(personalCandidate(), {
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

test("the renderer produces a complete static newspaper with sources and text fallback", () => {
  const candidate = personalCandidate();
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
    }
  }
  assert.doesNotMatch(rendered.html, /Quiet desk/);
  assert.doesNotMatch(rendered.text, /QUIET DESK/);
  assert.match(rendered.text, /WHAT HAPPENED/);
  assert.match(rendered.text, /WHY IT MATTERS/);
  assert.match(rendered.text, /WHAT TO DO OR WATCH/);
  assert.match(rendered.text, /SOURCES/);
  assert.equal(rendered.text.match(/VALIDATION RECEIPT/g)?.length, 4);
  assert.equal(rendered.html.match(/Validation receipt/g)?.length, 4);
  assert.match(rendered.text, /Evidence: Independently corroborated/);
  assert.match(rendered.text, /Evidence: Reviewed originating source/);
  assert.match(rendered.text, /Factual sources: [12]/);
  assert.match(rendered.text, /Importance: \d+\/30/);
  assert.match(rendered.text, /QUALITY PILOT · EDITION 1 OF 5/);
  assert.match(rendered.html, /Quality pilot · Edition 1 of 5/);
  assert.match(rendered.text, /THE MORNING BRIEF · REGULAR EDITION/);
  assert.match(rendered.text, /4 stories · Source checked before delivery/);
  assert.match(rendered.text, /Research receipt: 17 of 17 reviewed feeds completed · 1 research pass · Story threshold 70\/100/);
});

test("optional private feedback links cover each story and the whole edition", () => {
  const candidate = personalCandidate();
  const rendered = renderPersonalEditionEmail(candidate, {
    feedbackLinks: feedbackLinksFor(candidate),
  });

  assert.equal(rendered.html.match(/>Review this story</g)?.length, 4);
  assert.equal(rendered.text.match(/REVIEW THIS STORY/g)?.length, 4);
  assert.equal(rendered.html.match(/>Review this edition</g)?.length, 1);
  assert.equal(rendered.html.match(/>Report a missed story</g)?.length, 1);
  assert.match(rendered.text, /Review this edition: https:\/\/feedback\.example\.test\//);
  assert.match(rendered.text, /Report a missed story: https:\/\/feedback\.example\.test\//);
  for (const category of [
    "Useful",
    "Not relevant",
    "Repeated",
    "Wrong desk",
    "Missed story",
    "Correction",
  ]) {
    assert.match(rendered.html, new RegExp(category));
    assert.match(rendered.text, new RegExp(category));
  }
  assert.doesNotMatch(rendered.html, /<form|<script|javascript:/i);
});

test("quiet editions retain edition feedback without story-specific links", () => {
  const candidate = candidateWithStoryCount(0);
  const rendered = renderPersonalEditionEmail(candidate, {
    feedbackLinks: feedbackLinksFor(candidate),
  });

  assert.doesNotMatch(rendered.html, />Review this story</);
  assert.doesNotMatch(rendered.text, /REVIEW THIS STORY/);
  assert.match(rendered.html, />Review this edition</);
  assert.match(rendered.html, />Report a missed story</);
});

test("feedback link maps fail closed when their shape or URLs do not match the edition", () => {
  const candidate = personalCandidate();
  const valid = feedbackLinksFor(candidate);
  const missingStory = structuredClone(valid);
  delete missingStory.stories[candidate.desks.ai.story.id];
  const extraStory = structuredClone(valid);
  extraStory.stories["not-an-edition-story"] = "https://feedback.example.test/respond#extra";
  const unsafe = structuredClone(valid);
  unsafe.edition = "javascript:alert(1)";

  for (const feedbackLinks of [missingStory, extraStory, unsafe, { edition: valid.edition }]) {
    assert.throws(
      () => renderPersonalEditionEmail(candidate, { feedbackLinks }),
      /feedback links are invalid/,
    );
  }
});

test("evidence labels come from the trusted receipt rather than display publisher aliases", () => {
  const candidate = personalCandidate();
  for (const source of candidate.desks.ai.story.sources) source.publisher = "Same display label";
  const rendered = renderPersonalEditionEmail(candidate);
  assert.match(rendered.text, /Evidence: Independently corroborated/);
});

test("every rendered editorial and source field is HTML escaped", () => {
  const candidate = personalCandidate();
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

test("rendering fails closed for malformed, public, free, incomplete, or unverified candidates", () => {
  assert.throws(
    () => renderPersonalEditionEmail(null),
    /validated adaptive source-checked candidate/,
  );

  const mutations = [
    (candidate) => { candidate.status = "published"; candidate.publication.publishedAt = candidate.publication.publishAt; },
    (candidate) => { candidate.provenance.automation = { workflow: "morning-press" }; },
    (candidate) => { candidate.provenance.freePilot = { workflow: "free-morning-press" }; },
    (candidate) => { candidate.provenance.personalResearch = { workflow: "personal-morning-paper" }; },
    (candidate) => { candidate.provenance.sourceCheck.status = "failed"; },
    (candidate) => { candidate.provenance.sourceCheck.issues = [{ code: "BAD" }]; },
    (candidate) => { candidate.provenance.sourceCheck.checkedSourceCount = 7; },
    (candidate) => { candidate.provenance.personalFreeResearch.workflow = "morning-press"; },
    (candidate) => { candidate.provenance.personalFreeResearch.provider = "other-provider"; },
    (candidate) => { candidate.provenance.personalFreeResearch.researchMethod = "none"; },
    (candidate) => { candidate.provenance.personalFreeResearch.repository = "attacker/fork"; },
    (candidate) => { candidate.provenance.personalFreeResearch.runUrl = "https://github.com/attacker/fork/actions/runs/123456789"; },
    (candidate) => { candidate.provenance.personalFreeResearch.inference = "skipped-no-eligible-candidates"; },
    (candidate) => { candidate.provenance.personalFreeResearch.selectedStoryCount = 3; },
    (candidate) => { candidate.provenance.personalFreeResearch.requestSha256 = "not-a-digest"; },
    (candidate) => { candidate.provenance.personalFreeResearch.responseId = ""; },
    (candidate) => { candidate.provenance.personalFreeResearch.lookbackHours = 24; },
    (candidate) => { candidate.provenance.personalFreeResearch.minimumAuthoritativeScore = 10; },
    (candidate) => { candidate.provenance.personalFreeResearch.repeatStateSha256 = "bad"; },
    (candidate) => { candidate.provenance.personalFreeResearch.qualityPilotOrdinal = 2; },
    (candidate) => { candidate.desks.ai.story.selection.validationReceipt.score = 70; },
    (candidate) => { candidate.desks.ai.story.selection.validationReceipt.requiredScore = 69; },
    (candidate) => { candidate.desks.ai.story.selection.validationReceipt.evidenceTier = "authoritative-single"; },
    (candidate) => { candidate.desks.ai.story.selection.validationReceipt.factualSourceCount = 1; },
    (candidate) => { candidate.desks.ai.story.selection.validationReceipt.publisherCount = 1; },
    (candidate) => {
      candidate.desks.ai.story.selection.validationReceipt.components.freshness += 1;
    },
    (candidate) => {
      const story = candidate.desks["work-and-tools"].story;
      story.evidence[0].verification = "confirmed";
    },
    (candidate) => {
      candidate.desks.ai.story.sources[1].url = candidate.desks.ai.story.sources[0].url;
    },
    (candidate) => {
      for (const source of candidate.desks.ai.story.sources) source.relationship = "context";
    },
    (candidate) => { candidate.frontPage.estimatedMinutes = "<img src=x onerror=alert(1)>"; },
    (candidate) => { candidate.desks.ai.story.whatHappened = "too short"; },
  ];
  for (const mutate of mutations) {
    const candidate = personalCandidate();
    mutate(candidate);
    assert.throws(
      () => renderPersonalEditionEmail(candidate),
      /validated adaptive source-checked candidate/,
    );
  }
});

test("adaptive editions accept zero through four stories with regular, slim, and quiet labels", async (t) => {
  const expectedLabel = new Map([
    [0, "QUIET EDITION"],
    [1, "SLIM EDITION"],
    [2, "REGULAR EDITION"],
    [3, "REGULAR EDITION"],
    [4, "REGULAR EDITION"],
  ]);

  for (let storyCount = 0; storyCount <= 4; storyCount += 1) {
    await t.test(`${storyCount}-story edition`, async () => {
      const candidate = candidateWithStoryCount(storyCount);
      assert.equal(assertPersonalEmailCandidate(candidate).valid, true);

      const rendered = renderPersonalEditionEmail(candidate);
      assert.match(rendered.text, new RegExp(`THE MORNING BRIEF · ${expectedLabel.get(storyCount)}`));
      assert.match(
        rendered.text,
        new RegExp(`${storyCount} ${storyCount === 1 ? "story" : "stories"}`),
      );
      assert.equal(rendered.text.match(/VALIDATION RECEIPT/g)?.length ?? 0, storyCount);
      assert.equal(rendered.text.match(/QUIET DESK/g)?.length ?? 0, 4 - storyCount);

      let fetchCalls = 0;
      const result = await sendPersonalEditionEmail(candidate, {
        apiKey: API_KEY,
        recipient: RECIPIENT,
        fetchImpl: async () => {
          fetchCalls += 1;
          return successResponse(`email_story_count_${storyCount}`);
        },
      });
      assert.equal(result.id, `email_story_count_${storyCount}`);
      assert.equal(fetchCalls, 1);
    });
  }
});

test("a quiet edition shows its research receipt without story source receipts", () => {
  const candidate = candidateWithStoryCount(0);
  const rendered = renderPersonalEditionEmail(candidate);

  assert.match(rendered.text, /THE MORNING BRIEF · QUIET EDITION/);
  assert.match(rendered.text, /0 stories · Curated-feed research completed · Quality threshold unchanged/);
  assert.match(rendered.text, /Research receipt: 17 of 17 reviewed feeds completed · 2 research passes · Story threshold 70\/100/);
  assert.doesNotMatch(rendered.text, /VALIDATION RECEIPT/);
  assert.doesNotMatch(rendered.text, /(?:^|\n)SOURCES(?:\n|$)/);
  assert.doesNotMatch(rendered.html, /Validation receipt/);
  assert.doesNotMatch(rendered.html, />Sources</);
});

test("inference provenance is conditional on whether the adaptive edition has stories", () => {
  const populated = personalCandidate();
  populated.provenance.personalFreeResearch.inference = "skipped-no-eligible-candidates";
  populated.provenance.personalFreeResearch.responseId = "not-invoked";
  assert.throws(
    () => assertPersonalEmailCandidate(populated),
    /validated adaptive source-checked candidate/,
  );

  const quiet = candidateWithStoryCount(0);
  quiet.provenance.personalFreeResearch.inference = "workers-ai";
  quiet.provenance.personalFreeResearch.responseId = "workers_ai_personal_test";
  assert.throws(
    () => assertPersonalEmailCandidate(quiet),
    /validated adaptive source-checked candidate/,
  );
});

test("the sender posts one bounded Resend request with fixed identity and date idempotency", async () => {
  const calls = [];
  const candidate = personalCandidate();
  const rendered = renderPersonalEditionEmail(candidate);
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
    feedbackEnabled: false,
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
  assert.equal(body.html, rendered.html);
  assert.equal(body.text, rendered.text);
  assert.match(body.html, /^<!doctype html>\n<html/);
  assert.doesNotMatch(body.html, /\\</);
  assert.doesNotMatch(body.html, /^&lt;!doctype/);
  assert.match(body.subject, /August 19, 2026/);
  assert.match(body.html, /Washington, D\.C\./);
  assert.doesNotMatch(body.text, /QUIET DESK/);

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

test("the sender enables signed feedback only for complete valid configuration", async () => {
  const candidate = personalCandidate();
  let configuredRequest;
  const configured = await sendPersonalEditionEmail(candidate, {
    apiKey: API_KEY,
    recipient: RECIPIENT,
    feedbackBaseUrl: "https://feedback.example.test/respond",
    feedbackSigningKey: "f".repeat(32),
    feedbackNow: new Date("2026-08-19T10:00:00.000Z"),
    fetchImpl: async (_url, request) => {
      configuredRequest = request;
      return successResponse("email_feedback_enabled");
    },
  });
  const configuredBody = JSON.parse(configuredRequest.body);
  assert.equal(configured.feedbackEnabled, true);
  assert.equal(configuredBody.html.includes("Review this edition"), true);
  assert.equal(configuredBody.html.match(/>Review this story</g)?.length, 4);
  assert.equal(configuredBody.text.includes("Report a missed story:"), true);

  for (const configuration of [
    { feedbackBaseUrl: "https://feedback.example.test/respond", feedbackSigningKey: "" },
    { feedbackBaseUrl: "", feedbackSigningKey: "f".repeat(32) },
    { feedbackBaseUrl: "javascript:alert(1)", feedbackSigningKey: "f".repeat(32) },
  ]) {
    let requestBody;
    const result = await sendPersonalEditionEmail(candidate, {
      apiKey: API_KEY,
      recipient: RECIPIENT,
      ...configuration,
      fetchImpl: async (_url, request) => {
        requestBody = JSON.parse(request.body);
        return successResponse("email_feedback_disabled");
      },
    });
    assert.equal(result.feedbackEnabled, false);
    assert.equal(requestBody.html.includes("Review this edition"), false);
    assert.equal(requestBody.text.includes("Report a missed story:"), false);
  }
});

test("an explicit validated link map can be used without signing configuration", async () => {
  const candidate = personalCandidate();
  let body;
  const result = await sendPersonalEditionEmail(candidate, {
    apiKey: API_KEY,
    recipient: RECIPIENT,
    feedbackLinks: feedbackLinksFor(candidate),
    feedbackBaseUrl: "",
    feedbackSigningKey: "",
    fetchImpl: async (_url, request) => {
      body = JSON.parse(request.body);
      return successResponse("email_feedback_link_map");
    },
  });

  assert.equal(result.feedbackEnabled, true);
  assert.equal(body.html.includes("Review this edition"), true);
  assert.equal(body.text.includes("REVIEW THIS STORY"), true);
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
  const candidate = personalCandidate();
  for (const page of Object.values(candidate.desks)) {
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
      verification: "company-claimed",
    }];
    page.story.selection.validationReceipt.evidenceTier = "authoritative-single";
    page.story.selection.validationReceipt.factualSourceCount = 1;
    page.story.selection.validationReceipt.publisherCount = 1;
    page.story.priority = "notable";
    page.story.confidence.level = "medium";
  }
  candidate.frontPage.stopThePressesStoryId = null;
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
