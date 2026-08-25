import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateCanonicalEdition } from "../scripts/edition-content.mjs";
import { assertPersonalEmailCandidate } from "../scripts/automation/personal-email.mjs";
import {
  PERSONAL_PAID_DESKS,
  assertPersonalPaidGenerationTime,
  generatePersonalPaidEdition,
  generatePersonalPaidEditionFile,
  validatePersonalPaidCandidate,
} from "../scripts/automation/personal-paid-edition.mjs";

const priorEdition = JSON.parse(
  await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url), "utf8"),
);
const generatedAt = "2026-08-20T09:10:00.000Z";
const automationEnv = {
  OPENAI_API_KEY: "sk-personal-paid-test",
  OPENAI_MODEL: "test-paid-web-search-model",
  GITHUB_RUN_ID: "876543210",
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_REPOSITORY: "itworksinprod/first-fold",
};

async function createProject(t) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "first-fold-personal-paid-"));
  t.after(async () => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, "content", "editions"), { recursive: true });
  await mkdir(path.join(projectRoot, "lib", "editorial", "prompts"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "content", "editions", "2026-08-19.json"),
    `${JSON.stringify(priorEdition, null, 2)}\n`,
  );
  await writeFile(
    path.join(projectRoot, "lib", "editorial", "prompts", "policy.ts"),
    "export const POLICY = `paid personal policy`;\n",
  );
  await writeFile(
    path.join(projectRoot, "lib", "editorial", "prompts", "daily-run.ts"),
    "export const PROMPT = `paid personal prompt`;\n",
  );
  return projectRoot;
}

function makeStory(desk, index, retrievedAt = generatedAt) {
  const base = structuredClone(priorEdition.desks["work-and-tools"].story);
  const slug = desk.replaceAll("-", "_");
  const sourceIds = [`${slug}-origin`, `${slug}-independent`];
  base.id = `2026-08-20-${desk}-paid-personal`;
  base.canonicalEventKey = `${desk}-paid-personal-2026-08-20`;
  base.desk = desk;
  base.headline = `Verified ${desk} development ${index + 1}`;
  base.deck = `Two direct sources verify the selected ${desk} development.`;
  base.status = "new-development";
  base.priority = "notable";
  base.timing = {
    eventAt: "2026-08-20T08:00:00.000Z",
    firstPublishedAt: "2026-08-20T08:00:00.000Z",
    materiallyUpdatedAt: null,
  };
  base.editorial = {
    primaryEntity: `Personal Entity ${index + 1}`,
    aiAdjacent: desk === "ai",
    maturity: "verified-development",
    deskFit: `This development belongs on the ${desk} desk.`,
  };
  base.selection = {
    score: 80 + index,
    selectedBecause: "It is new, verified, useful, and inside the exact reporting window.",
    materialDelta: null,
  };
  base.confidence = {
    level: "high",
    rationale: "Two direct source URLs support the mapped evidence.",
  };
  base.sources = [
    {
      id: sourceIds[0],
      title: `Originating ${desk} report`,
      publisher: `Originating Publisher ${index + 1}`,
      url: `https://example.com/${desk}/originating`,
      relationship: "originating",
      publishedAt: "2026-08-20T08:00:00.000Z",
      retrievedAt,
    },
    {
      id: sourceIds[1],
      title: `Independent ${desk} report`,
      publisher: `Independent Publisher ${index + 1}`,
      url: `https://example.org/${desk}/independent`,
      relationship: "independent",
      publishedAt: "2026-08-20T08:05:00.000Z",
      retrievedAt,
    },
  ];
  base.evidence = [{
    id: `${slug}-claim`,
    statement: `The selected ${desk} development occurred inside the reporting window.`,
    sourceIds,
    verification: "confirmed",
  }];
  delete base.securityAction;
  return base;
}

function makeEditorial(retrievedAt = generatedAt) {
  const stories = Object.fromEntries(PERSONAL_PAID_DESKS.map((desk, index) => [
    desk,
    makeStory(desk, index, retrievedAt),
  ]));
  const storyOrder = PERSONAL_PAID_DESKS.map((desk) => stories[desk].id);
  return {
    frontPage: {
      note: "Four source-verified developments cleared the private editorial threshold.",
      estimatedMinutes: 6,
      leadStoryId: storyOrder[0],
      storyOrder,
      stopThePressesStoryId: null,
      diversityException: null,
    },
    desks: Object.fromEntries(PERSONAL_PAID_DESKS.map((desk) => [
      desk,
      { desk, story: stories[desk] },
    ])),
    backPage: { tryThisTomorrow: null, watchNext: [] },
  };
}

function researchResult(editorial = makeEditorial()) {
  const allowedSourceUrls = new Set(PERSONAL_PAID_DESKS.flatMap((desk) =>
    editorial.desks[desk].story?.sources?.map((source) => source.url) ?? []));
  return {
    editorial,
    responseId: "resp_personal_paid_test",
    requestBody: {
      model: "test-paid-web-search-model",
      input: [{ role: "user", content: [{ type: "input_text", text: "test" }] }],
      text: { format: { schema: { type: "object" } } },
    },
    webSearchCalls: [{ type: "web_search_call", status: "completed" }],
    allowedSourceUrls,
  };
}

function safeSourceOptions() {
  return {
    sourceLookupImpl: async () => [{ address: "93.184.216.34" }],
    sourceRequestImpl: async () => ({ status: 200, headers: {} }),
  };
}

test("paid personal generation uses real archive context, exact daily window, and four-story fail-closed provenance", async (t) => {
  const projectRoot = await createProject(t);
  let researchOptions;
  const candidate = await generatePersonalPaidEdition({
    editionDate: "2026-08-20",
    projectRoot,
    env: automationEnv,
    now: generatedAt,
    runWebSearchEditorialImpl: async (options) => {
      researchOptions = options;
      return researchResult();
    },
    ...safeSourceOptions(),
  });

  assert.equal(validateCanonicalEdition(candidate).valid, true);
  assert.equal(validatePersonalPaidCandidate(candidate, { runMode: "on_time" }), true);
  assert.throws(
    () => assertPersonalEmailCandidate(candidate),
    /validated adaptive source-checked candidate/,
  );
  assert.equal(candidate.status, "validated");
  assert.equal(candidate.publication.publishedAt, null);
  assert.deepEqual(candidate.reportingWindow, {
    startInclusive: "2026-08-19T09:00:00.000Z",
    endExclusive: "2026-08-20T09:00:00.000Z",
    displayLabel: "August 19, 2026 at 5:00 AM ET through August 20, 2026 at 5:00 AM ET",
  });
  assert.equal(candidate.provenance.personalResearch.workflow, "personal-morning-paper");
  assert.equal(candidate.provenance.personalResearch.provider, "openai-responses");
  assert.equal(candidate.provenance.personalResearch.runMode, "on_time");
  assert.equal(candidate.provenance.personalResearch.webSearchCompleted, true);
  assert.equal(candidate.provenance.personalResearch.selectedStoryCount, 4);
  assert.equal(candidate.provenance.sourceCheck.status, "passed");
  assert.equal(candidate.provenance.sourceCheck.checkedSourceCount, 8);
  assert.equal(Object.hasOwn(candidate.provenance, "automation"), false);
  assert.equal(Object.hasOwn(candidate.provenance, "freePilot"), false);
  assert.deepEqual(researchOptions.priorEditions.map((edition) => edition.id), [priorEdition.id]);
  assert.equal(researchOptions.selectionMode, "personal-complete");
  assert.equal(researchOptions.apiKey, "sk-personal-paid-test");
  assert.equal(researchOptions.scaffold.reportingWindow.startInclusive, "2026-08-19T09:00:00.000Z");
});

test("a quiet paid result is rejected before any email candidate can be written", async (t) => {
  const projectRoot = await createProject(t);
  const editorial = makeEditorial();
  editorial.desks.ai = {
    desk: "ai",
    story: null,
    emptyReason: "No AI story cleared the bar.",
  };
  editorial.frontPage.storyOrder = editorial.frontPage.storyOrder.slice(1);
  editorial.frontPage.leadStoryId = editorial.frontPage.storyOrder[0];

  await assert.rejects(
    generatePersonalPaidEdition({
      editionDate: "2026-08-20",
      projectRoot,
      env: automationEnv,
      now: generatedAt,
      runWebSearchEditorialImpl: async () => researchResult(editorial),
      ...safeSourceOptions(),
    }),
    /quiet desks: ai.*No email candidate was returned/,
  );
  await assert.rejects(
    access(path.join(projectRoot, "content", "personal-candidates", "2026-08-20.json")),
    (error) => error?.code === "ENOENT",
  );
});

test("the personal candidate writer is exclusive and never overwrites a same-day artifact", async (t) => {
  const projectRoot = await createProject(t);
  const options = {
    editionDate: "2026-08-20",
    projectRoot,
    env: automationEnv,
    now: generatedAt,
    runWebSearchEditorialImpl: async () => researchResult(),
    ...safeSourceOptions(),
  };
  const result = await generatePersonalPaidEditionFile(options);
  assert.equal(result.relativePath, "content/personal-candidates/2026-08-20.json");
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    validatePersonalPaidCandidate(JSON.parse(await readFile(result.destination, "utf8"))),
    true,
  );
  await assert.rejects(
    generatePersonalPaidEditionFile(options),
    /already exists; nothing was overwritten/,
  );
});

test("on-time and same-day backfill gates are disjoint", () => {
  const common = {
    editionDate: "2026-08-20",
    cutoffInstant: "2026-08-20T09:00:00.000Z",
    publishInstant: "2026-08-20T10:00:00.000Z",
  };
  assert.equal(
    assertPersonalPaidGenerationTime({ ...common, now: "2026-08-20T09:05:00.000Z" }),
    "2026-08-20T09:05:00.000Z",
  );
  assert.throws(
    () => assertPersonalPaidGenerationTime({
      ...common,
      now: "2026-08-20T10:00:00.000Z",
      runMode: "on_time",
    }),
    /must begin before 06:00/,
  );
  assert.equal(
    assertPersonalPaidGenerationTime({
      ...common,
      now: "2026-08-20T16:00:00.000Z",
      runMode: "same_day_backfill",
    }),
    "2026-08-20T16:00:00.000Z",
  );
  assert.throws(
    () => assertPersonalPaidGenerationTime({
      ...common,
      now: "2026-08-20T09:59:59.999Z",
      runMode: "same_day_backfill",
    }),
    /cannot begin before 06:00/,
  );
});

test("same-day backfill keeps real generation timestamps and passes only its explicit QA lane", async (t) => {
  const projectRoot = await createProject(t);
  const backfillAt = "2026-08-20T16:00:00.000Z";
  const candidate = await generatePersonalPaidEdition({
    editionDate: "2026-08-20",
    projectRoot,
    env: automationEnv,
    now: backfillAt,
    runMode: "same_day_backfill",
    runWebSearchEditorialImpl: async () => researchResult(makeEditorial(backfillAt)),
    ...safeSourceOptions(),
  });
  assert.equal(candidate.publication.generatedAt, backfillAt);
  assert.equal(candidate.provenance.personalResearch.runMode, "same_day_backfill");
  assert.equal(candidate.provenance.sourceCheck.status, "passed");
  assert.equal(validatePersonalPaidCandidate(candidate, { runMode: "same_day_backfill" }), true);
});

test("paid generation requires only its OpenAI secret plus trusted GitHub run metadata", async (t) => {
  const projectRoot = await createProject(t);
  let researchCalls = 0;
  await assert.rejects(
    generatePersonalPaidEdition({
      editionDate: "2026-08-20",
      projectRoot,
      env: { ...automationEnv, OPENAI_API_KEY: "" },
      now: generatedAt,
      runWebSearchEditorialImpl: async () => {
        researchCalls += 1;
        return researchResult();
      },
    }),
    /OPENAI_API_KEY is required/,
  );
  assert.equal(researchCalls, 0);
});

test("an injected research adapter cannot claim success without a completed web-search call", async (t) => {
  const projectRoot = await createProject(t);
  const result = researchResult();
  result.webSearchCalls = [];
  await assert.rejects(
    generatePersonalPaidEdition({
      editionDate: "2026-08-20",
      projectRoot,
      env: automationEnv,
      now: generatedAt,
      runWebSearchEditorialImpl: async () => result,
      ...safeSourceOptions(),
    }),
    /did not complete the required web search/,
  );
});
