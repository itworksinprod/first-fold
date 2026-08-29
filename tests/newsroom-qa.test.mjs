import assert from "node:assert/strict";
import test from "node:test";
import {
  NEWSROOM_QA_USER_AGENT,
  buildSourceUrlAllowlist,
  isPublicNetworkAddress,
  normalizeSourceUrl,
  runNewsroomQa,
  sourceUrlMatchesAllowlist,
  validateNewsroomDraft,
} from "../scripts/automation/newsroom-qa.mjs";

const WINDOW_START = "2026-08-19T09:00:00.000Z";
const WINDOW_END = "2026-08-20T09:00:00.000Z";
const GENERATED_AT = "2026-08-20T09:30:00.000Z";
const CHECKED_AT = "2026-08-20T09:40:00.000Z";

function source({
  id,
  url,
  relationship,
  publishedAt = "2026-08-19T12:00:00.000Z",
  retrievedAt = "2026-08-20T08:50:00.000Z",
}) {
  return {
    id,
    title: `${id} title`,
    publisher: `${id} publisher`,
    url,
    relationship,
    publishedAt,
    retrievedAt,
  };
}

function selectedStory() {
  return {
    id: "2026-08-20-grounded-development",
    canonicalEventKey: "grounded-development",
    desk: "ai",
    headline: "Grounded development",
    deck: "A source-grounded test story.",
    status: "new-development",
    priority: "high",
    timing: {
      eventAt: null,
      firstPublishedAt: "2026-08-19T12:00:00.000Z",
      materiallyUpdatedAt: null,
    },
    editorial: {
      primaryEntity: "Example Vendor",
      aiAdjacent: true,
      maturity: "verified-development",
      deskFit: "The model behavior is the primary consequence.",
    },
    selection: {
      score: 80,
      selectedBecause: "It clears the source and consequence bars.",
      materialDelta: null,
    },
    confidence: {
      level: "high",
      rationale: "Primary material and independent reporting agree.",
    },
    whatHappened: "Placeholder copy.",
    whyItMatters: "Placeholder consequence.",
    whatToDoOrWatch: "Placeholder action.",
    sources: [
      source({
        id: "vendor-release",
        url: "https://openai.com/news/grounded-development",
        relationship: "originating",
      }),
      source({
        id: "independent-report",
        url: "https://www.reuters.com/technology/grounded-development/",
        relationship: "independent",
        publishedAt: "2026-08-19T12:05:00.000Z",
      }),
    ],
    evidence: [
      {
        id: "development-occurred",
        statement: "The development occurred within the reporting window.",
        sourceIds: ["vendor-release", "independent-report"],
        verification: "confirmed",
      },
    ],
  };
}

function editionFixture() {
  return {
    schemaVersion: 2,
    id: "first-fold-2026-08-20",
    issueNumber: 2,
    editionDate: "2026-08-20",
    status: "draft",
    reportingWindow: {
      startInclusive: WINDOW_START,
      endExclusive: WINDOW_END,
    },
    publication: {
      targetLocalTime: "06:00",
      publishAt: "2026-08-20T10:00:00.000Z",
      generatedAt: GENERATED_AT,
      publishedAt: null,
    },
    frontPage: {
      note: "One development cleared the bar.",
      estimatedMinutes: 3,
      leadStoryId: "2026-08-20-grounded-development",
      storyOrder: ["2026-08-20-grounded-development"],
      stopThePressesStoryId: null,
      diversityException: null,
    },
    desks: {
      ai: { desk: "ai", story: selectedStory() },
      "work-and-tools": {
        desk: "work-and-tools",
        story: null,
        emptyReason: "Quiet.",
      },
      "security-and-privacy": {
        desk: "security-and-privacy",
        story: null,
        emptyReason: "Quiet.",
      },
      "platforms-and-power": {
        desk: "platforms-and-power",
        story: null,
        emptyReason: "Quiet.",
      },
    },
    backPage: { tryThisTomorrow: null, watchNext: [] },
  };
}

function issueCodes(result) {
  return result.issues.map((issue) => issue.code);
}

test("deterministic newsroom QA returns a machine-readable pass", () => {
  const result = validateNewsroomDraft(editionFixture(), {
    checkedAt: CHECKED_AT,
  });

  assert.deepEqual(result, {
    status: "passed",
    checkedAt: CHECKED_AT,
    checkedSourceCount: 2,
    issues: [],
  });
  assert.deepEqual(JSON.parse(JSON.stringify({ sourceCheck: result })), {
    sourceCheck: result,
  });
});

test("late timestamps are exempt only for an explicitly marked same-day backfill lane", () => {
  const edition = editionFixture();
  const lateInstant = "2026-08-20T18:15:00.000Z";
  edition.publication.generatedAt = lateInstant;
  for (const source of edition.desks.ai.story.sources) source.retrievedAt = lateInstant;

  const strict = validateNewsroomDraft(edition, { checkedAt: lateInstant });
  assert.ok(issueCodes(strict).includes("GENERATED_AFTER_PUBLICATION"));
  assert.equal(
    issueCodes(strict).filter((code) => code === "SOURCE_RETRIEVED_AFTER_PUBLICATION").length,
    2,
  );

  const unmarked = validateNewsroomDraft(edition, {
    checkedAt: lateInstant,
    temporalMode: "free-same-day-backfill",
  });
  assert.ok(issueCodes(unmarked).includes("GENERATED_AFTER_PUBLICATION"));
  assert.ok(issueCodes(unmarked).includes("SOURCE_RETRIEVED_AFTER_PUBLICATION"));

  edition.provenance = {
    freePilot: {
      workflow: "free-morning-press",
      runMode: "same_day_backfill",
    },
  };
  const backfill = validateNewsroomDraft(edition, {
    checkedAt: lateInstant,
    temporalMode: "free-same-day-backfill",
  });
  assert.equal(issueCodes(backfill).includes("GENERATED_AFTER_PUBLICATION"), false);
  assert.equal(issueCodes(backfill).includes("SOURCE_RETRIEVED_AFTER_PUBLICATION"), false);
  assert.equal(backfill.status, "passed");

  edition.provenance = {
    personalResearch: {
      workflow: "personal-morning-paper",
      runMode: "same_day_backfill",
    },
  };
  const personalBackfill = validateNewsroomDraft(edition, {
    checkedAt: lateInstant,
    temporalMode: "personal-same-day-backfill",
  });
  assert.equal(issueCodes(personalBackfill).includes("GENERATED_AFTER_PUBLICATION"), false);
  assert.equal(issueCodes(personalBackfill).includes("SOURCE_RETRIEVED_AFTER_PUBLICATION"), false);
  assert.equal(personalBackfill.status, "passed");

  edition.provenance = {
    personalFreeResearch: {
      workflow: "personal-morning-paper",
      runMode: "same_day_backfill",
    },
  };
  const personalFreeBackfill = validateNewsroomDraft(edition, {
    checkedAt: lateInstant,
    temporalMode: "personal-free-same-day-backfill",
  });
  assert.equal(issueCodes(personalFreeBackfill).includes("GENERATED_AFTER_PUBLICATION"), false);
  assert.equal(
    issueCodes(personalFreeBackfill).includes("SOURCE_RETRIEVED_AFTER_PUBLICATION"),
    false,
  );
  assert.equal(personalFreeBackfill.status, "passed");

  const wrongLane = validateNewsroomDraft(edition, {
    checkedAt: lateInstant,
    temporalMode: "free-same-day-backfill",
  });
  assert.ok(issueCodes(wrongLane).includes("GENERATED_AFTER_PUBLICATION"));
});

test("source normalization supports exact Responses-search allowlists", () => {
  assert.equal(
    normalizeSourceUrl(
      "https://OPENAI.com/news/grounded-development?utm_source=feed&b=2&a=1#details",
    ),
    "https://openai.com/news/grounded-development?a=1&b=2",
  );
  assert.equal(normalizeSourceUrl("http://openai.com/news/item"), null);

  const allowlist = buildSourceUrlAllowlist([
    {
      url: "https://openai.com/news/grounded-development?b=2&a=1&utm_medium=web",
    },
  ]);
  assert.deepEqual([...allowlist], [
    "https://openai.com/news/grounded-development?a=1&b=2",
  ]);
  assert.equal(
    sourceUrlMatchesAllowlist(
      "https://openai.com/news/grounded-development?a=1&b=2#section",
      allowlist,
    ),
    true,
  );
  assert.equal(
    sourceUrlMatchesAllowlist(
      "https://openai.com/news/a-different-page?a=1&b=2",
      allowlist,
    ),
    false,
  );
});

test("model-emitted URLs absent from the web-search allowlist fail closed", () => {
  const edition = editionFixture();
  const result = validateNewsroomDraft(edition, {
    allowedSourceUrls: [edition.desks.ai.story.sources[0]],
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(
    result.issues.filter((issue) => issue.code === "SOURCE_URL_NOT_GROUNDED").map((issue) => issue.path),
    ["desks.ai.story.sources[1].url"],
  );
});

test("unsafe source URL forms are rejected before network use", async (context) => {
  const cases = [
    ["plain HTTP", "http://openai.com/news/item", "SOURCE_URL_NOT_HTTPS"],
    ["credentials", "https://user:secret@openai.com/news/item", "SOURCE_URL_CREDENTIALS"],
    ["localhost", "https://localhost/item", "SOURCE_URL_PRIVATE_HOST"],
    ["bare private-use name", "https://internal/item", "SOURCE_URL_PRIVATE_HOST"],
    ["short loopback", "https://127.1/item", "SOURCE_URL_PRIVATE_HOST"],
    ["hex loopback", "https://0x7f000001/item", "SOURCE_URL_PRIVATE_HOST"],
    ["integer loopback", "https://2130706433/item", "SOURCE_URL_PRIVATE_HOST"],
    ["private IPv4", "https://10.20.30.40/item", "SOURCE_URL_PRIVATE_HOST"],
    ["IPv6 loopback", "https://[::1]/item", "SOURCE_URL_PRIVATE_HOST"],
    ["IPv6 ULA", "https://[fc00::1]/item", "SOURCE_URL_PRIVATE_HOST"],
    ["IPv6 6to4 transition", "https://[2002:7f00:1::]/item", "SOURCE_URL_PRIVATE_HOST"],
    ["search results", "https://www.google.com/search?q=item", "SOURCE_URL_SEARCH_PAGE"],
  ];

  for (const [name, url, expectedCode] of cases) {
    await context.test(name, async () => {
      const edition = editionFixture();
      edition.desks.ai.story.sources[0].url = url;
      let fetchCalls = 0;
      const result = await runNewsroomQa(edition, {
        checkLinks: true,
        requestImpl: async () => {
          fetchCalls += 1;
          return new Response(null, { status: 200 });
        },
        lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
      });

      assert.ok(issueCodes(result.sourceCheck).includes(expectedCode));
      assert.equal(
        fetchCalls,
        1,
        "only the second, structurally safe source should be requested",
      );
    });
  }
});

test("address classification rejects private, loopback, link-local, and reserved ranges", () => {
  for (const address of [
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.31.255.255",
    "192.168.1.1",
    "192.31.196.1",
    "192.52.193.1",
    "192.175.48.1",
    "198.51.100.10",
    "203.0.113.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "2001:2::1",
    "2001:20::1",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "2002:7f00:1::",
    "64:ff9b::7f00:1",
    "64:ff9b:1::7f00:1",
    "2620:4f:8000::1",
    "3ffe::1",
    "3fff:0fff::1",
  ]) {
    assert.equal(isPublicNetworkAddress(address), false, address);
  }
  assert.equal(isPublicNetworkAddress(null), false);
  assert.equal(isPublicNetworkAddress("8.8.8.8"), true);
  assert.equal(isPublicNetworkAddress("2001:4860:4860::8888"), true);
  assert.equal(isPublicNetworkAddress("2606:4700:4700::1111"), true);
});

test("model-authored factual copy and security actions must be non-blank", () => {
  const edition = editionFixture();
  const story = edition.desks.ai.story;
  edition.frontPage.note = "";
  story.headline = "   ";
  story.whatHappened = "";
  story.editorial.deskFit = "\n";
  story.selection.selectedBecause = null;
  story.confidence.rationale = "";
  story.securityAction = {
    severity: "high",
    affected: " ",
    exploitation: "not-observed",
    action: "",
    deadline: " ",
  };
  edition.backPage.tryThisTomorrow = {
    title: "",
    goal: "Try a small workflow.",
    steps: ["Choose a task.", "  "],
    successMeasure: "Save five minutes.",
    riskCheck: "Do not paste private data.",
  };

  const result = validateNewsroomDraft(edition);
  const missingPaths = result.issues
    .filter((issue) => issue.code === "EDITORIAL_TEXT_MISSING")
    .map((issue) => issue.path);
  assert.deepEqual(missingPaths, [
    "frontPage.note",
    "desks.ai.story.headline",
    "desks.ai.story.whatHappened",
    "desks.ai.story.editorial.deskFit",
    "desks.ai.story.selection.selectedBecause",
    "desks.ai.story.confidence.rationale",
    "desks.ai.story.securityAction.affected",
    "desks.ai.story.securityAction.action",
    "desks.ai.story.securityAction.deadline",
    "backPage.tryThisTomorrow.title",
    "backPage.tryThisTomorrow.steps[1]",
  ]);
  assert.equal(result.status, "failed");
});

test("source and evidence referential integrity is enforced", async (context) => {
  await context.test("duplicate source ids and URLs", () => {
    const edition = editionFixture();
    edition.desks.ai.story.sources[1].id = "vendor-release";
    edition.desks.ai.story.sources[1].url = edition.desks.ai.story.sources[0].url;
    assert.deepEqual(
      issueCodes(validateNewsroomDraft(edition)).filter((code) =>
        ["SOURCE_ID_DUPLICATE", "INSUFFICIENT_DISTINCT_SOURCES"].includes(code)),
      ["SOURCE_ID_DUPLICATE", "INSUFFICIENT_DISTINCT_SOURCES"],
    );
  });

  await context.test("unknown evidence source", () => {
    const edition = editionFixture();
    edition.desks.ai.story.evidence[0].sourceIds = ["not-a-source"];
    const codes = issueCodes(validateNewsroomDraft(edition));
    assert.ok(codes.includes("EVIDENCE_SOURCE_UNKNOWN"));
    assert.ok(codes.includes("EVIDENCE_LACKS_AUTHORITATIVE_SOURCE"));
  });

  await context.test("confirmed claim supported only by context", () => {
    const edition = editionFixture();
    edition.desks.ai.story.sources[1].relationship = "context";
    edition.desks.ai.story.evidence[0].sourceIds = ["independent-report"];
    const codes = issueCodes(validateNewsroomDraft(edition));
    assert.ok(codes.includes("CONFIRMED_CLAIM_CONTEXT_ONLY"));
    assert.ok(codes.includes("EVIDENCE_LACKS_AUTHORITATIVE_SOURCE"));
  });
});

test("critical stories require originating and independent evidence", () => {
  const edition = editionFixture();
  const story = edition.desks.ai.story;
  story.priority = "critical";
  story.sources[1].relationship = "context";
  story.evidence[0].sourceIds = ["vendor-release"];

  const codes = issueCodes(validateNewsroomDraft(edition));
  assert.ok(codes.includes("CRITICAL_STORY_SOURCE_MIX"));
  assert.ok(codes.includes("CRITICAL_STORY_EVIDENCE_MIX"));
});

test("new and material-update timestamp rules are deterministic", async (context) => {
  await context.test("new development outside the half-open window", () => {
    const edition = editionFixture();
    edition.desks.ai.story.timing.firstPublishedAt = WINDOW_END;
    assert.ok(
      issueCodes(validateNewsroomDraft(edition)).includes(
        "NEW_DEVELOPMENT_OUTSIDE_WINDOW",
      ),
    );
  });

  await context.test("material update needs an in-window timestamp and named delta", () => {
    const edition = editionFixture();
    const story = edition.desks.ai.story;
    story.status = "material-update";
    story.timing.firstPublishedAt = "2026-08-01T12:00:00.000Z";
    story.timing.materiallyUpdatedAt = null;
    story.selection.materialDelta = "";
    const codes = issueCodes(validateNewsroomDraft(edition));
    assert.ok(codes.includes("MATERIAL_UPDATE_TIMESTAMP_MISSING"));
    assert.ok(codes.includes("MATERIAL_DELTA_MISSING"));
  });

  await context.test("source chronology cannot run backward", () => {
    const edition = editionFixture();
    edition.desks.ai.story.sources[0].retrievedAt = "2026-08-19T11:00:00.000Z";
    edition.desks.ai.story.sources[1].retrievedAt = "2026-08-20T09:31:00.000Z";
    const codes = issueCodes(validateNewsroomDraft(edition));
    assert.ok(codes.includes("SOURCE_RETRIEVED_BEFORE_PUBLICATION"));
    assert.ok(codes.includes("SOURCE_RETRIEVED_AFTER_GENERATION"));
  });
});

test("previously covered event keys require a real material update", () => {
  const priorEdition = editionFixture();
  priorEdition.editionDate = "2026-08-19";
  const current = editionFixture();

  let result = validateNewsroomDraft(current, { priorEditions: [priorEdition] });
  assert.ok(issueCodes(result).includes("REPEATED_EVENT_NOT_MATERIAL_UPDATE"));

  const story = current.desks.ai.story;
  story.status = "material-update";
  story.timing.firstPublishedAt = "2026-08-18T12:00:00.000Z";
  story.timing.materiallyUpdatedAt = "2026-08-19T13:00:00.000Z";
  story.selection.materialDelta = "The vendor published a consequential new remediation.";
  result = validateNewsroomDraft(current, { priorEditions: [priorEdition] });
  assert.equal(
    issueCodes(result).includes("REPEATED_EVENT_NOT_MATERIAL_UPDATE"),
    false,
  );
  assert.equal(result.status, "passed");
});

test("automated Watch Next remains empty until the schema can map evidence", () => {
  const edition = editionFixture();
  edition.backPage.watchNext.push({
    topic: "Unsupported signal",
    unresolved: "No source mapping exists.",
    meaningfulSignal: "A future event.",
    whyItMatters: "It might matter.",
  });
  const result = validateNewsroomDraft(edition);
  assert.ok(issueCodes(result).includes("WATCH_NEXT_UNSOURCED"));
  assert.equal(result.status, "failed");
});

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("link reachability falls back from HEAD to GET", async () => {
  const calls = [];
  const result = await runNewsroomQa(editionFixture(), {
    checkLinks: true,
    lookupImpl: publicLookup,
    requestImpl: async (url, init) => {
      calls.push([url, init]);
      return new Response(null, { status: init.method === "HEAD" ? 405 : 200 });
    },
  });

  assert.equal(result.sourceCheck.status, "passed");
  assert.deepEqual(calls.map(([, init]) => init.method), ["HEAD", "GET", "HEAD", "GET"]);
  assert.deepEqual(calls[0][1].addresses, ["93.184.216.34"]);
  assert.equal(calls[0][1].hostname, "openai.com");
});

test("link reachability sends a stable identity and prefers vetted IPv4 addresses", async () => {
  const calls = [];
  const result = await runNewsroomQa(editionFixture(), {
    checkLinks: true,
    lookupImpl: async () => [
      { address: "2606:4700:4700::1111", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ],
    requestImpl: async (url, options) => {
      calls.push([url, options]);
      return new Response(null, { status: 200 });
    },
  });

  assert.equal(result.sourceCheck.status, "passed");
  assert.ok(calls.length > 0);
  assert.deepEqual(calls[0][1].addresses, [
    "93.184.216.34",
    "2606:4700:4700::1111",
  ]);
  assert.equal(calls[0][1].headers["user-agent"], NEWSROOM_QA_USER_AGENT);
  assert.equal(calls[0][1].headers["accept-encoding"], "identity");
});

test("reachability rejects an unpinned fetch implementation", async () => {
  let fetchCalls = 0;
  let lookupCalls = 0;
  const result = await runNewsroomQa(editionFixture(), {
    checkLinks: true,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    },
    lookupImpl: async () => {
      lookupCalls += 1;
      return [{ address: "93.184.216.34", family: 4 }];
    },
  });

  assert.equal(result.sourceCheck.status, "failed");
  assert.ok(issueCodes(result.sourceCheck).includes("LINK_FETCH_UNSAFE"));
  assert.equal(fetchCalls, 0);
  assert.equal(lookupCalls, 0);
});

test("reachability timeouts fail closed", async () => {
  const requestSignals = [];
  const result = await runNewsroomQa(editionFixture(), {
    checkLinks: true,
    timeoutMs: 5,
    lookupImpl: publicLookup,
    requestImpl: async (_url, options) => new Promise((_resolve, reject) => {
      requestSignals.push(options.signal);
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  });

  assert.equal(result.sourceCheck.status, "failed");
  assert.ok(issueCodes(result.sourceCheck).includes("LINK_TIMEOUT"));
  assert.ok(requestSignals.length > 0);
  assert.ok(requestSignals.every((signal) => signal.aborted));
});

test("bot-protection statuses are warnings, while missing pages fail", async (context) => {
  await context.test("403 stays a warning after GET fallback", async () => {
    const result = await runNewsroomQa(editionFixture(), {
      checkLinks: true,
      lookupImpl: publicLookup,
      requestImpl: async () => new Response(null, { status: 403 }),
    });
    assert.equal(result.sourceCheck.status, "warnings");
    assert.ok(
      result.sourceCheck.issues.every(
        (issue) => issue.code === "LINK_ACCESS_RESTRICTED" && issue.severity === "warning",
      ),
    );
  });

  await context.test("404 fails closed", async () => {
    const result = await runNewsroomQa(editionFixture(), {
      checkLinks: true,
      lookupImpl: publicLookup,
      requestImpl: async () => new Response(null, { status: 404 }),
    });
    assert.equal(result.sourceCheck.status, "failed");
    assert.ok(issueCodes(result.sourceCheck).includes("LINK_NOT_FOUND"));
  });
});

test("DNS and every redirect are checked before a request", async (context) => {
  await context.test("public redirect succeeds", async () => {
    const requested = [];
    const result = await runNewsroomQa(editionFixture(), {
      checkLinks: true,
      lookupImpl: publicLookup,
      requestImpl: async (url) => {
        requested.push(url);
        if (url.includes("openai.com")) {
          return new Response(null, {
            status: 302,
            headers: { location: "https://www.reuters.com/technology/final/" },
          });
        }
        return new Response(null, { status: 200 });
      },
    });

    assert.equal(result.sourceCheck.status, "passed");
    assert.ok(requested.some((url) => url.endsWith("/technology/final/")));
  });

  await context.test("private redirect is never requested", async () => {
    const requested = [];
    const result = await runNewsroomQa(editionFixture(), {
      checkLinks: true,
      lookupImpl: publicLookup,
      requestImpl: async (url) => {
        requested.push(url);
        if (url.includes("openai.com")) {
          return new Response(null, {
            status: 302,
            headers: { location: "https://127.0.0.1/admin" },
          });
        }
        return new Response(null, { status: 200 });
      },
    });

    assert.equal(result.sourceCheck.status, "failed");
    assert.ok(issueCodes(result.sourceCheck).includes("LINK_UNSAFE_RESOLUTION"));
    assert.equal(requested.some((url) => url.includes("127.0.0.1")), false);
  });

  await context.test("hostname resolving private is never fetched", async () => {
    const requested = [];
    const result = await runNewsroomQa(editionFixture(), {
      checkLinks: true,
      lookupImpl: async (hostname) => [{
        address: hostname === "openai.com" ? "127.0.0.1" : "93.184.216.34",
        family: 4,
      }],
      requestImpl: async (url) => {
        requested.push(url);
        return new Response(null, { status: 200 });
      },
    });

    assert.equal(result.sourceCheck.status, "failed");
    assert.ok(issueCodes(result.sourceCheck).includes("LINK_UNSAFE_RESOLUTION"));
    assert.equal(requested.some((url) => url.includes("openai.com")), false);
  });

  await context.test("one private answer poisons the complete DNS answer set", async () => {
    const requested = [];
    const result = await runNewsroomQa(editionFixture(), {
      checkLinks: true,
      lookupImpl: async (hostname) => hostname === "openai.com"
        ? [
            { address: "93.184.216.34", family: 4 },
            { address: "169.254.169.254", family: 4 },
          ]
        : [{ address: "93.184.216.34", family: 4 }],
      requestImpl: async (url) => {
        requested.push(url);
        return new Response(null, { status: 200 });
      },
    });

    assert.equal(result.sourceCheck.status, "failed");
    assert.ok(issueCodes(result.sourceCheck).includes("LINK_UNSAFE_RESOLUTION"));
    assert.equal(requested.some((url) => url.includes("openai.com")), false);
  });
});
