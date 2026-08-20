import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { toReaderEdition, validateCanonicalEdition } from "../scripts/edition-content.mjs";
import { buildEditionDraft } from "../scripts/new-edition.mjs";
import {
  DEFAULT_OPENAI_MODEL,
  deriveNextPilotSequence,
  draftEdition,
  resolveOpenAIModel,
} from "../scripts/automation/draft-edition.mjs";

const priorEdition = JSON.parse(
  await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url), "utf8"),
);
const generatedAt = "2026-08-20T09:10:00.000Z";
const automation = {
  runId: "123456789",
  runUrl: "https://github.com/example/first-fold/actions/runs/123456789",
  repository: "example/first-fold",
};

function buildEditorialPayload() {
  const scaffold = buildEditionDraft({
    latestEdition: priorEdition,
    editionDate: "2026-08-20",
    issueNumber: 2,
  });
  const story = structuredClone(priorEdition.desks["work-and-tools"].story);
  story.id = "2026-08-20-test-work-development";
  story.canonicalEventKey = "test-work-development-2026-08-20";
  story.status = "new-development";
  story.timing = {
    eventAt: "2026-08-20T08:00:00.000Z",
    firstPublishedAt: "2026-08-20T08:00:00.000Z",
    materiallyUpdatedAt: null,
  };
  story.selection.materialDelta = null;
  story.securityAction = null;
  for (const source of story.sources) {
    source.publishedAt = "2026-08-20T08:00:00.000Z";
    source.retrievedAt = generatedAt;
  }

  const quietReason = (label) =>
    `No source-verified ${label} development cleared the editorial threshold.`;
  return {
    frontPage: {
      note: "One source-verified development cleared the editorial threshold.",
      estimatedMinutes: 3,
      leadStoryId: story.id,
      storyOrder: [story.id],
      stopThePressesStoryId: null,
      diversityException: null,
    },
    desks: {
      ai: { desk: "ai", story: null, emptyReason: quietReason("AI & Models") },
      "work-and-tools": {
        desk: "work-and-tools",
        story,
        emptyReason: null,
      },
      "security-and-privacy": {
        desk: "security-and-privacy",
        story: null,
        emptyReason: quietReason("Security & Privacy"),
      },
      "platforms-and-power": {
        desk: "platforms-and-power",
        story: null,
        emptyReason: quietReason("Platforms & Power"),
      },
    },
    backPage: { tryThisTomorrow: null },
  };
}

function storySourceUrls(payload = buildEditorialPayload()) {
  return payload.desks["work-and-tools"].story.sources.map((source) => source.url);
}

function completedApiPayload(editorialPayload = buildEditorialPayload(), sources = storySourceUrls(editorialPayload)) {
  return {
    id: "resp_newsroom_test",
    status: "completed",
    output: [
      {
        type: "web_search_call",
        status: "completed",
        action: {
          type: "search",
          query: "First Fold reporting window",
          sources: sources.map((url) => ({ type: "url", url })),
        },
      },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(editorialPayload) }],
      },
    ],
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function draftOptions(overrides = {}) {
  return {
    editionDate: "2026-08-20",
    priorEditions: [structuredClone(priorEdition)],
    policyText: "POLICY_MARKER source-verified editorial policy",
    promptText: "PROMPT_MARKER daily newsroom sequence",
    automation,
    apiKey: "sk-test-secret-do-not-log",
    model: "test-newsroom-model",
    now: generatedAt,
    fetchImpl: async () => jsonResponse(completedApiPayload()),
    sourceLookupImpl: async () => [{ address: "93.184.216.34" }],
    sourceRequestImpl: async () => ({ status: 200, headers: {} }),
    sleepImpl: async () => {},
    ...overrides,
  };
}

test("draftEdition sends the fail-closed Responses contract and returns a QA-passed canonical candidate", async () => {
  let apiRequest;
  let sourceRequests = 0;
  const candidate = await draftEdition(draftOptions({
    fetchImpl: async (url, init) => {
      apiRequest = { url, init };
      return jsonResponse(completedApiPayload());
    },
    sourceRequestImpl: async () => {
      sourceRequests += 1;
      return { status: 200, headers: {} };
    },
  }));

  assert.equal(candidate.status, "published");
  assert.equal(candidate.publication.publishedAt, candidate.publication.publishAt);
  assert.equal(candidate.publication.generatedAt, generatedAt);
  assert.deepEqual(candidate.backPage.watchNext, []);
  assert.equal(candidate.provenance.automation.workflow, "morning-press");
  assert.equal(candidate.provenance.automation.candidate, true);
  assert.equal(candidate.provenance.automation.pilotSequence, 1);
  assert.equal(candidate.provenance.automation.model, "test-newsroom-model");
  assert.equal(candidate.provenance.automation.responseId, "resp_newsroom_test");
  assert.match(candidate.provenance.automation.promptSha256, /^[a-f0-9]{64}$/);
  assert.match(candidate.provenance.automation.schemaSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(candidate.provenance.sourceCheck, {
    status: "passed",
    checkedAt: generatedAt,
    checkedSourceCount: 2,
    issues: [],
  });
  assert.equal(validateCanonicalEdition(candidate).valid, true);
  const reader = toReaderEdition(candidate, validateCanonicalEdition(candidate));
  assert.deepEqual(reader.review.generation, {
    workflow: "morning-press",
    runId: "123456789",
    runUrl: "https://github.com/example/first-fold/actions/runs/123456789",
    candidate: true,
    generatedAt,
    pilotSequence: 1,
  });
  assert.deepEqual(reader.review.sourceCheck, candidate.provenance.sourceCheck);
  assert.equal(reader.review.generation.model, undefined);
  assert.equal(reader.review.generation.responseId, undefined);
  assert.equal(reader.review.generation.promptSha256, undefined);
  const unsafeReviewCandidate = structuredClone(candidate);
  unsafeReviewCandidate.provenance.sourceCheck.issues = [{
    code: "not safe",
    severity: "warning",
    path: "desks.ai\u0000.story",
    message: "Review this issue.\u0007",
    url: "https://untrusted.example/private",
  }];
  const safeReview = toReaderEdition(
    unsafeReviewCandidate,
    validateCanonicalEdition(unsafeReviewCandidate),
  ).review;
  assert.equal(safeReview.sourceCheck.status, "failed");
  assert.deepEqual(safeReview.sourceCheck.issues, [{
    code: "SOURCE_CHECK_ISSUE",
    severity: "warning",
    path: "desks.ai .story",
    message: "Review this issue.",
  }]);
  assert.equal(sourceRequests, 2);

  assert.equal(apiRequest.url, "https://api.openai.com/v1/responses");
  assert.equal(apiRequest.init.method, "POST");
  assert.equal(apiRequest.init.headers.authorization, "Bearer sk-test-secret-do-not-log");
  const body = JSON.parse(apiRequest.init.body);
  assert.equal(body.model, "test-newsroom-model");
  assert.equal(body.store, false);
  assert.deepEqual(body.tools, [{ type: "web_search", search_context_size: "medium" }]);
  assert.equal(body.tool_choice, "required");
  assert.deepEqual(body.include, ["web_search_call.action.sources"]);
  assert.equal(body.reasoning.effort, "low");
  assert.equal(body.max_output_tokens, 16_000);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.equal(body.text.format.schema.properties.backPage.properties.watchNext, undefined);
  assert.doesNotMatch(JSON.stringify(body.text.format.schema), /"(?:minLength|uniqueItems)"/);
  assert.match(JSON.stringify(body.input), /POLICY_MARKER/);
  assert.match(JSON.stringify(body.input), /PROMPT_MARKER/);
  const runText = body.input.find((item) => item.role === "user").content[0].text;
  assert.match(runText, /"editionDate":"2026-08-20"/);
  assert.doesNotMatch(apiRequest.init.body, /sk-test-secret-do-not-log/);
});

test("canonical validation rejects forged automatic approval metadata", async () => {
  const candidate = await draftEdition(draftOptions());

  const warned = structuredClone(candidate);
  warned.provenance.sourceCheck.status = "warnings";
  assert.equal(validateCanonicalEdition(warned).valid, false);

  const mismatchedRun = structuredClone(candidate);
  mismatchedRun.provenance.automation.runUrl =
    "https://github.com/example/first-fold/actions/runs/999999999";
  assert.equal(validateCanonicalEdition(mismatchedRun).valid, false);

  const premature = structuredClone(candidate);
  premature.publication.publishedAt = null;
  assert.equal(validateCanonicalEdition(premature).valid, false);
});

test("OPENAI_MODEL defaults to the current cost-sensitive web-search model", () => {
  assert.equal(DEFAULT_OPENAI_MODEL, "gpt-5.6-luna");
  assert.equal(resolveOpenAIModel(undefined), DEFAULT_OPENAI_MODEL);
  assert.equal(resolveOpenAIModel("custom-model"), "custom-model");
});

test("generation time gates reject runs outside the 05:00-06:00 local window before fetch", async (t) => {
  for (const [name, now, message] of [
    ["pre-cutoff", "2026-08-20T08:59:59.999Z", /cannot begin before/],
    ["at publication", "2026-08-20T10:00:00.000Z", /must begin before/],
    ["after publication", "2026-08-20T10:00:00.001Z", /must begin before/],
    ["wrong local date", "2026-08-21T09:10:00.000Z", /must equal the current/],
  ]) {
    await t.test(name, async () => {
      let fetchCalls = 0;
      await assert.rejects(
        draftEdition(draftOptions({
          now,
          fetchImpl: async () => {
            fetchCalls += 1;
            return jsonResponse(completedApiPayload());
          },
        })),
        message,
      );
      assert.equal(fetchCalls, 0);
    });
  }
});

test("pilot sequence derives only from contiguous merged automatic canonical editions and stops at five", () => {
  const history = [structuredClone(priorEdition)];
  let latest = history[0];
  const dates = ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24"];

  for (const [index, editionDate] of dates.entries()) {
    const next = buildEditionDraft({
      latestEdition: latest,
      editionDate,
      issueNumber: latest.issueNumber + 1,
    });
    next.status = "published";
    next.publication.publishedAt = next.publication.publishAt;
    const runId = String(2000 + index);
    next.provenance.automation = {
      workflow: "morning-press",
      runId,
      runUrl: `https://github.com/example/first-fold/actions/runs/${runId}`,
      candidate: true,
      generatedAt: next.publication.generatedAt,
      pilotSequence: index + 1,
    };
    next.provenance.sourceCheck = {
      status: "passed",
      checkedAt: next.publication.generatedAt,
      checkedSourceCount: 0,
      issues: [],
    };
    history.push(next);
    latest = next;
    if (index < 4) assert.equal(deriveNextPilotSequence(history), index + 2);
  }

  assert.throws(() => deriveNextPilotSequence(history), /pilot is complete/);
  const gap = structuredClone(history.slice(0, 2));
  gap[1].provenance.automation.pilotSequence = 2;
  assert.throws(() => deriveNextPilotSequence(gap), /contiguous approved sequences/);
});

test("a completed fifth pilot sequence blocks the API request", async () => {
  const history = [structuredClone(priorEdition)];
  let latest = history[0];
  for (let index = 1; index <= 5; index += 1) {
    const editionDate = `2026-08-${String(19 + index).padStart(2, "0")}`;
    const next = buildEditionDraft({ latestEdition: latest, editionDate, issueNumber: index + 1 });
    next.status = "published";
    next.publication.publishedAt = next.publication.publishAt;
    next.provenance.automation = {
      workflow: "morning-press",
      runId: String(3000 + index),
      runUrl: `https://github.com/example/first-fold/actions/runs/${3000 + index}`,
      candidate: true,
      generatedAt: next.publication.generatedAt,
      pilotSequence: index,
    };
    next.provenance.sourceCheck = {
      status: "passed",
      checkedAt: next.publication.generatedAt,
      checkedSourceCount: 0,
      issues: [],
    };
    history.push(next);
    latest = next;
  }

  let fetchCalls = 0;
  await assert.rejects(
    draftEdition(draftOptions({
      editionDate: "2026-08-25",
      priorEditions: history,
      now: "2026-08-25T09:10:00.000Z",
      fetchImpl: async () => {
        fetchCalls += 1;
        return jsonResponse(completedApiPayload());
      },
    })),
    /pilot is complete/,
  );
  assert.equal(fetchCalls, 0);
});

test("Responses refusals, incomplete responses, ungrounded URLs, QA warnings, and blank copy fail closed", async (t) => {
  const basePayload = buildEditorialPayload();
  const urls = storySourceUrls(basePayload);
  const cases = [
    {
      name: "refusal",
      response: {
        id: "resp_refusal",
        status: "completed",
        output: [
          completedApiPayload().output[0],
          { type: "message", role: "assistant", content: [{ type: "refusal", refusal: "no" }] },
        ],
      },
      expected: /refused/,
    },
    {
      name: "incomplete response",
      response: { id: "resp_incomplete", status: "incomplete", output: [] },
      expected: /completed response/,
    },
    {
      name: "ungrounded source URL",
      response: completedApiPayload(basePayload, urls.slice(1)),
      expected: /mandatory newsroom source QA/,
    },
    {
      name: "blank model-authored headline",
      response: (() => {
        const payload = structuredClone(basePayload);
        payload.desks["work-and-tools"].story.headline = "";
        return completedApiPayload(payload, urls);
      })(),
      expected: /mandatory newsroom source QA/,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      await assert.rejects(
        draftEdition(draftOptions({ fetchImpl: async () => jsonResponse(scenario.response) })),
        scenario.expected,
      );
    });
  }

  await t.test("link warning", async () => {
    await assert.rejects(
      draftEdition(draftOptions({
        sourceRequestImpl: async () => ({ status: 403, headers: {} }),
      })),
      /mandatory newsroom source QA/,
    );
  });
});

test("only transient HTTP failures are retried and retries stay bounded", async (t) => {
  await t.test("429 retries once", async () => {
    let calls = 0;
    const delays = [];
    const candidate = await draftEdition(draftOptions({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return new Response("", { status: 429 });
        return jsonResponse(completedApiPayload());
      },
      sleepImpl: async (delay) => delays.push(delay),
    }));
    assert.equal(candidate.provenance.sourceCheck.status, "passed");
    assert.equal(calls, 2);
    assert.deepEqual(delays, [250]);
  });

  await t.test("400 does not retry", async () => {
    let calls = 0;
    await assert.rejects(
      draftEdition(draftOptions({
        fetchImpl: async () => {
          calls += 1;
          return new Response("", { status: 400 });
        },
      })),
      /HTTP 400/,
    );
    assert.equal(calls, 1);
  });
});
