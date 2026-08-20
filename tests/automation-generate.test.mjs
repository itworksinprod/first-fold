import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildEditionDraft } from "../scripts/new-edition.mjs";
import { generateEditionFile } from "../scripts/automation/generate-edition.mjs";

const publishedIssueOne = JSON.parse(
  await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url), "utf8"),
);
const generatedAt = "2026-08-20T09:10:00.000Z";
const automationEnv = {
  OPENAI_API_KEY: "sk-generator-test",
  OPENAI_MODEL: "test-newsroom-model",
  GITHUB_RUN_ID: "987654321",
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_REPOSITORY: "example/first-fold",
};

function quietEditorialPayload(editionDate = "2026-08-20") {
  const reason = (desk) =>
    `No source-verified ${desk} development cleared the editorial threshold for ${editionDate}.`;
  return {
    frontPage: {
      note: "No source-verified development cleared the editorial threshold today.",
      estimatedMinutes: 1,
      leadStoryId: null,
      storyOrder: [],
      stopThePressesStoryId: null,
      diversityException: null,
    },
    desks: {
      ai: { desk: "ai", story: null, emptyReason: reason("AI & Models") },
      "work-and-tools": {
        desk: "work-and-tools",
        story: null,
        emptyReason: reason("Work & Tools"),
      },
      "security-and-privacy": {
        desk: "security-and-privacy",
        story: null,
        emptyReason: reason("Security & Privacy"),
      },
      "platforms-and-power": {
        desk: "platforms-and-power",
        story: null,
        emptyReason: reason("Platforms & Power"),
      },
    },
    backPage: { tryThisTomorrow: null },
  };
}

function sourcedEditorialPayload() {
  const payload = quietEditorialPayload();
  const story = structuredClone(publishedIssueOne.desks["work-and-tools"].story);
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
  payload.desks["work-and-tools"] = {
    desk: "work-and-tools",
    story,
    emptyReason: null,
  };
  payload.frontPage = {
    note: "One source-verified development cleared the editorial threshold.",
    estimatedMinutes: 3,
    leadStoryId: story.id,
    storyOrder: [story.id],
    stopThePressesStoryId: null,
    diversityException: null,
  };
  return payload;
}

function apiPayload(editorialPayload = quietEditorialPayload(), sources = []) {
  return {
    id: "resp_generator_test",
    status: "completed",
    output: [
      {
        type: "web_search_call",
        status: "completed",
        action: {
          type: "search",
          query: "test query",
          sources: sources.map((url) => ({ type: "url", url })),
        },
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: JSON.stringify(editorialPayload) }],
      },
    ],
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

async function createProject(t, editions = [publishedIssueOne]) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "first-fold-generator-"));
  t.after(async () => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, "content", "editions"), { recursive: true });
  await mkdir(path.join(projectRoot, "lib", "editorial", "prompts"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "lib", "editorial", "prompts", "policy.ts"),
    "export const POLICY = `test policy`;\n",
  );
  await writeFile(
    path.join(projectRoot, "lib", "editorial", "prompts", "daily-run.ts"),
    "export const PROMPT = `test prompt`;\n",
  );
  for (const edition of editions) {
    await writeFile(
      path.join(projectRoot, "content", "editions", `${edition.editionDate}.json`),
      `${JSON.stringify(edition, null, 2)}\n`,
    );
  }
  return projectRoot;
}

async function assertMissing(filename) {
  await assert.rejects(access(filename), (error) => error?.code === "ENOENT");
}

function makePublishedNext(latestEdition, editionDate, issueNumber, pilotSequence = null) {
  const edition = buildEditionDraft({ latestEdition, editionDate, issueNumber });
  edition.status = "published";
  edition.publication.publishedAt = edition.publication.publishAt;
  if (pilotSequence !== null) {
    const runId = String(4000 + pilotSequence);
    edition.provenance.automation = {
      workflow: "morning-press",
      runId,
      runUrl: `https://github.com/example/first-fold/actions/runs/${runId}`,
      candidate: true,
      generatedAt: edition.publication.generatedAt,
      pilotSequence,
    };
    edition.provenance.sourceCheck = {
      status: "passed",
      checkedAt: edition.publication.generatedAt,
      checkedSourceCount: 0,
      issues: [],
    };
  }
  return edition;
}

test("generateEditionFile creates one publication-ready candidate with exclusive-write semantics", async (t) => {
  const projectRoot = await createProject(t);
  let fetchCalls = 0;
  const options = {
    editionDate: "2026-08-20",
    projectRoot,
    env: automationEnv,
    now: generatedAt,
    fetchImpl: async () => {
      fetchCalls += 1;
      return jsonResponse(apiPayload());
    },
    sleepImpl: async () => {},
  };

  const result = await generateEditionFile(options);
  assert.equal(result.relativePath, path.join("content", "editions", "2026-08-20.json"));
  assert.equal(result.pilotSequence, 1);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  const written = JSON.parse(await readFile(result.destination, "utf8"));
  assert.equal(written.status, "published");
  assert.equal(written.provenance.automation.candidate, true);
  assert.equal(written.provenance.sourceCheck.status, "passed");
  assert.equal(fetchCalls, 1);

  await assert.rejects(generateEditionFile(options), /already exists; nothing was overwritten/);
  assert.equal(fetchCalls, 1);
  assert.deepEqual(JSON.parse(await readFile(result.destination, "utf8")), written);
});

test("existing destination, out-of-window time, wrong local date, and completed pilot all avoid fetch and writes", async (t) => {
  await t.test("existing destination", async (t) => {
    const projectRoot = await createProject(t);
    const destination = path.join(projectRoot, "content", "editions", "2026-08-20.json");
    await writeFile(destination, "human work\n");
    let fetchCalls = 0;
    await assert.rejects(generateEditionFile({
      editionDate: "2026-08-20",
      projectRoot,
      env: automationEnv,
      now: generatedAt,
      fetchImpl: async () => {
        fetchCalls += 1;
        return jsonResponse(apiPayload());
      },
    }), /nothing was overwritten/);
    assert.equal(fetchCalls, 0);
    assert.equal(await readFile(destination, "utf8"), "human work\n");
  });

  for (const [name, now, message] of [
    ["pre-cutoff", "2026-08-20T08:59:59.999Z", /cannot begin before/],
    ["at publication", "2026-08-20T10:00:00.000Z", /must begin before/],
    ["after publication", "2026-08-20T10:00:00.001Z", /must begin before/],
    ["wrong local date", "2026-08-21T09:10:00.000Z", /must equal the current/],
  ]) {
    await t.test(name, async (t) => {
      const projectRoot = await createProject(t);
      const destination = path.join(projectRoot, "content", "editions", "2026-08-20.json");
      let fetchCalls = 0;
      await assert.rejects(generateEditionFile({
        editionDate: "2026-08-20",
        projectRoot,
        env: automationEnv,
        now,
        fetchImpl: async () => {
          fetchCalls += 1;
          return jsonResponse(apiPayload());
        },
      }), message);
      assert.equal(fetchCalls, 0);
      await assertMissing(destination);
    });
  }

  await t.test("fifth merged sequence", async (t) => {
    const editions = [structuredClone(publishedIssueOne)];
    let latest = makePublishedNext(editions[0], "2026-08-20", 2);
    editions.push(latest); // Existing manual Issue 2 does not count toward the pilot.
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      const editionDate = `2026-08-${String(20 + sequence).padStart(2, "0")}`;
      latest = makePublishedNext(latest, editionDate, latest.issueNumber + 1, sequence);
      editions.push(latest);
    }
    const projectRoot = await createProject(t, editions);
    const destination = path.join(projectRoot, "content", "editions", "2026-08-26.json");
    let fetchCalls = 0;
    await assert.rejects(generateEditionFile({
      editionDate: "2026-08-26",
      projectRoot,
      env: automationEnv,
      now: "2026-08-26T09:10:00.000Z",
      fetchImpl: async () => {
        fetchCalls += 1;
        return jsonResponse(apiPayload(quietEditorialPayload("2026-08-26")));
      },
    }), /pilot is complete/);
    assert.equal(fetchCalls, 0);
    await assertMissing(destination);
  });
});

test("refusal, ungrounded source, and QA link warning leave no candidate file", async (t) => {
  const sourced = sourcedEditorialPayload();
  const sourceUrls = sourced.desks["work-and-tools"].story.sources.map((source) => source.url);
  const scenarios = [
    {
      name: "refusal",
      response: {
        id: "resp_refusal",
        status: "completed",
        output: [
          apiPayload().output[0],
          { type: "message", role: "assistant", content: [{ type: "refusal", refusal: "no" }] },
        ],
      },
      expected: /refused/,
      requestImpl: async () => ({ status: 200, headers: {} }),
    },
    {
      name: "ungrounded source",
      response: apiPayload(sourced, sourceUrls.slice(1)),
      expected: /mandatory newsroom source QA/,
      requestImpl: async () => ({ status: 200, headers: {} }),
    },
    {
      name: "link warning",
      response: apiPayload(sourced, sourceUrls),
      expected: /mandatory newsroom source QA/,
      requestImpl: async () => ({ status: 403, headers: {} }),
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async (t) => {
      const projectRoot = await createProject(t);
      const destination = path.join(projectRoot, "content", "editions", "2026-08-20.json");
      await assert.rejects(generateEditionFile({
        editionDate: "2026-08-20",
        projectRoot,
        env: automationEnv,
        now: generatedAt,
        fetchImpl: async () => jsonResponse(scenario.response),
        sourceLookupImpl: async () => [{ address: "93.184.216.34" }],
        sourceRequestImpl: scenario.requestImpl,
        sleepImpl: async () => {},
      }), scenario.expected);
      await assertMissing(destination);
    });
  }
});
