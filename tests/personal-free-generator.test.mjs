import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateCanonicalEdition } from "../scripts/edition-content.mjs";
import { buildEditionDraft } from "../scripts/new-edition.mjs";
import { assertPersonalEmailCandidate } from "../scripts/automation/personal-email.mjs";
import { createEmptyPersonalStoryLedger } from "../scripts/automation/personal-story-ledger.mjs";
import {
  InsufficientFreeCandidatesError,
  buildFreeReportingWindow,
} from "../scripts/automation/draft-free-edition.mjs";
import {
  PERSONAL_FREE_EVIDENCE_POLICY,
  PERSONAL_FREE_LOOKBACK_HOURS,
  PERSONAL_FREE_MAX_MODEL_REQUESTS,
  PERSONAL_FREE_MAX_RESEARCH_ATTEMPTS,
  PERSONAL_FREE_MAX_REQUEST_BYTES,
  PERSONAL_FREE_MAX_TOKENS,
  PERSONAL_FREE_MINIMUM_STORY_COUNT,
  PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE,
  PERSONAL_FREE_MINIMUM_SCORE,
  PERSONAL_FREE_MODEL,
  PERSONAL_FREE_RETRY_BELOW_STORY_COUNT,
  generatePersonalFreeEdition,
  generatePersonalFreeEditionFile,
  generatePersonalFreeEditionOutcome,
  runPersonalFreeEditionCli,
  validatePersonalFreeCandidate,
} from "../scripts/automation/personal-free-edition.mjs";

const priorEdition = JSON.parse(
  await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url), "utf8"),
);
const GENERATED_AT = "2026-08-20T09:10:00.000Z";
const ACCOUNT_ID = "6fd0b70bbeb0769801ddb19c8f1b4b10";
const automationEnv = {
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  CLOUDFLARE_AI_API_TOKEN: "cloudflare-workers-ai-test-token",
  CLOUDFLARE_AI_MODEL: "@cf/another/model-must-be-ignored",
  GITHUB_RUN_ID: "876543210",
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_REPOSITORY: "itworksinprod/first-fold",
};
const automation = {
  runId: automationEnv.GITHUB_RUN_ID,
  repository: automationEnv.GITHUB_REPOSITORY,
  runUrl: "https://github.com/itworksinprod/first-fold/actions/runs/876543210",
};
const feedSources = [
  { id: "ai-one" },
  { id: "ai-two" },
  { id: "work-one" },
  { id: "work-two" },
  { id: "security-one" },
  { id: "security-two" },
  { id: "platform-one" },
  { id: "platform-two" },
];

async function createProject(t) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "first-fold-personal-free-"));
  t.after(async () => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, "content", "editions"), { recursive: true });
  await mkdir(path.join(projectRoot, "lib", "editorial", "prompts"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "content", "editions", "2026-08-19.json"),
    `${JSON.stringify(priorEdition, null, 2)}\n`,
  );
  await writeFile(
    path.join(projectRoot, "lib", "editorial", "prompts", "policy.ts"),
    "export const POLICY = `private free policy`;\n",
  );
  await writeFile(
    path.join(projectRoot, "lib", "editorial", "prompts", "daily-run.ts"),
    "export const PROMPT = `private free prompt`;\n",
  );
  return projectRoot;
}

function storyForDesk(desk, index) {
  const sourceStory = desk === "ai"
    ? priorEdition.desks.ai.story
    : desk === "security-and-privacy"
      ? priorEdition.desks["security-and-privacy"].story
      : priorEdition.desks["work-and-tools"].story;
  const story = structuredClone(sourceStory);
  const slug = desk.replaceAll("-", "_");
  story.id = `2026-08-20-${desk}-personal-free`;
  story.canonicalEventKey = `${desk}-personal-free-2026-08-20`;
  story.desk = desk;
  story.headline = `Verified private free ${desk} development`;
  story.deck = `Live feed evidence supports the selected ${desk} development.`;
  story.status = "new-development";
  story.priority = "notable";
  story.timing = {
    eventAt: "2026-08-20T08:00:00.000Z",
    firstPublishedAt: "2026-08-20T08:00:00.000Z",
    materiallyUpdatedAt: null,
  };
  story.editorial.primaryEntity = `Private Free Entity ${index + 1}`;
  story.editorial.aiAdjacent = desk === "ai";
  story.editorial.deskFit = `The verified development belongs on the ${desk} desk.`;
  story.selection.score = 80 + index;
  story.selection.selectedBecause =
    "It is current, useful, and grounded in the originating live feed evidence.";
  story.selection.materialDelta = null;
  story.selection.validationReceipt = {
    version: "editorial-v1",
    score: story.selection.score,
    requiredScore: 70,
    components: {
      materialityNewsworthiness: 24,
      deskRelevance: 18,
      sourceStrength: 16,
      readerUsefulnessActionability: 12,
      freshness: story.selection.score - 70,
    },
    componentMaximums: {
      materialityNewsworthiness: 30,
      deskRelevance: 20,
      sourceStrength: 20,
      readerUsefulnessActionability: 15,
      freshness: 15,
    },
    evidenceTier: "authoritative-single",
    factualSourceCount: 1,
    publisherCount: 1,
  };
  story.confidence = {
    level: "medium",
    rationale: "The originating item and its publisher feed were checked before delivery.",
  };
  story.sources = [
    {
      id: `${slug}-originating`,
      title: `Originating ${desk} article`,
      publisher: `Originating Publisher ${index + 1}`,
      url: `https://example.com/${desk}/originating`,
      relationship: "originating",
      publishedAt: "2026-08-20T08:00:00.000Z",
      retrievedAt: GENERATED_AT,
    },
    {
      id: `${slug}-feed-context`,
      title: `Publisher ${desk} feed`,
      publisher: `Originating Publisher ${index + 1}`,
      url: `https://example.org/${desk}/feed.xml`,
      relationship: "context",
      publishedAt: "2026-08-20T08:00:00.000Z",
      retrievedAt: GENERATED_AT,
    },
  ];
  story.evidence = [{
    id: `${slug}-verified-claim`,
    statement: `The selected ${desk} development appeared in the publisher's live feed.`,
    sourceIds: [`${slug}-originating`],
    verification: "company-claimed",
  }];
  if (desk !== "security-and-privacy") delete story.securityAction;
  return story;
}

function freeCandidate({
  quietDesks = [],
  inference,
  researchAttemptCount,
  researchRetryOutcome,
} = {}) {
  const candidate = buildEditionDraft({
    latestEdition: structuredClone(priorEdition),
    editionDate: "2026-08-20",
    issueNumber: 2,
  });
  candidate.status = "validated";
  candidate.reportingWindow = buildFreeReportingWindow("2026-08-20", {
    lookbackHours: PERSONAL_FREE_LOOKBACK_HOURS,
  });
  candidate.publication.generatedAt = GENERATED_AT;
  candidate.publication.publishedAt = null;
  const stories = Object.fromEntries([
    "ai",
    "work-and-tools",
    "security-and-privacy",
    "platforms-and-power",
  ].map((desk, index) => [desk, storyForDesk(desk, index)]));
  for (const quietDesk of quietDesks) stories[quietDesk] = null;
  candidate.desks = Object.fromEntries(Object.entries(stories).map(([desk, story]) => [
    desk,
    {
      desk,
      story,
      emptyReason: story ? null : `No ${desk} story was selected.`,
    },
  ]));
  const selected = Object.values(stories).filter(Boolean);
  const effectiveInference = inference ?? (
    selected.length === 0 ? "skipped-no-eligible-candidates" : "workers-ai"
  );
  const effectiveAttemptCount = researchAttemptCount ?? (
    selected.length < PERSONAL_FREE_RETRY_BELOW_STORY_COUNT ? 2 : 1
  );
  const effectiveRetryOutcome = researchRetryOutcome ?? (
    effectiveAttemptCount === 1 ? "not-needed" : "no-improvement"
  );
  candidate.frontPage = {
    note: `${selected.length} source-checked developments cleared the private free research contract.`,
    estimatedMinutes: 8,
    leadStoryId: selected[0]?.id ?? null,
    storyOrder: selected.map((story) => story.id),
    stopThePressesStoryId: null,
    diversityException: null,
  };
  candidate.backPage = { tryThisTomorrow: null, watchNext: [] };
  candidate.provenance.freePilot = {
    workflow: "free-morning-press",
    provider: "cloudflare-workers-ai",
    model: PERSONAL_FREE_MODEL,
    runId: automation.runId,
    runUrl: automation.runUrl,
    repository: automation.repository,
    runMode: "on_time",
    generatedAt: GENERATED_AT,
    feedSnapshotSha256: "a".repeat(64),
    requestSha256: "b".repeat(64),
    responseSha256: "c".repeat(64),
    responseId: effectiveInference === "workers-ai" ? "workers_ai_private_test" : "not-invoked",
    inference: effectiveInference,
    feedSourceCount: feedSources.length,
    successfulFeedSourceCount: feedSources.length,
    coveredDeskCount: 4,
    candidateCount: selected.length,
    draftSelectedSlate: true,
    maxResearchAttempts: PERSONAL_FREE_MAX_RESEARCH_ATTEMPTS,
    researchRetryBelowStoryCount: PERSONAL_FREE_RETRY_BELOW_STORY_COUNT,
    researchAttemptCount: effectiveAttemptCount,
    researchRetryOutcome: effectiveRetryOutcome,
    evidencePolicy: PERSONAL_FREE_EVIDENCE_POLICY,
    requiredStoryCount: selected.length,
    selectedStoryCount: selected.length,
    lookbackHours: PERSONAL_FREE_LOOKBACK_HOURS,
    minimumScore: PERSONAL_FREE_MINIMUM_SCORE,
    minimumAuthoritativeScore: PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE,
  };
  candidate.provenance.sourceCheck = {
    status: "passed",
    checkedAt: GENERATED_AT,
    checkedSourceCount: selected.length * 2,
    issues: [],
  };
  assert.equal(validateCanonicalEdition(candidate).valid, true);
  return candidate;
}

test("private free generation fixes the model, evidence lane, lookback, and request budget", async (t) => {
  const projectRoot = await createProject(t);
  let draftOptions;
  const candidate = await generatePersonalFreeEdition({
    editionDate: "2026-08-20",
    projectRoot,
    env: automationEnv,
    now: GENERATED_AT,
    feedSources,
    personalStoryLedger: createEmptyPersonalStoryLedger({
      fingerprintKey: automationEnv.CLOUDFLARE_AI_API_TOKEN,
    }),
    draftFreeEditionImpl: async (options) => {
      draftOptions = options;
      return freeCandidate();
    },
  });

  assert.equal(validatePersonalFreeCandidate(candidate, {
    runMode: "on_time",
    automation,
    expectedFeedSourceCount: feedSources.length,
  }), true);
  assert.equal(assertPersonalEmailCandidate(candidate).valid, true);
  assert.equal(Object.hasOwn(candidate.provenance, "freePilot"), false);
  assert.equal(Object.hasOwn(candidate.provenance, "personalResearch"), false);
  assert.equal(candidate.provenance.personalFreeResearch.provider, "cloudflare-workers-ai");
  assert.equal(candidate.provenance.personalFreeResearch.researchMethod, "curated-live-feeds");
  assert.equal(candidate.provenance.personalFreeResearch.inference, "workers-ai");
  assert.equal(candidate.provenance.personalFreeResearch.selectedStoryCount, 4);
  assert.equal(candidate.provenance.personalFreeResearch.requiredStoryCount, 4);
  assert.equal(candidate.provenance.personalFreeResearch.candidateCount, 4);
  assert.equal(
    candidate.provenance.personalFreeResearch.candidateSelection,
    "deterministic-selected-slate",
  );
  assert.equal(
    candidate.provenance.personalFreeResearch.maxResearchAttempts,
    PERSONAL_FREE_MAX_RESEARCH_ATTEMPTS,
  );
  assert.equal(
    candidate.provenance.personalFreeResearch.researchRetryBelowStoryCount,
    PERSONAL_FREE_RETRY_BELOW_STORY_COUNT,
  );
  assert.equal(candidate.provenance.personalFreeResearch.researchAttemptCount, 1);
  assert.equal(candidate.provenance.personalFreeResearch.researchRetryOutcome, "not-needed");
  assert.equal(candidate.provenance.personalFreeResearch.maxModelRequests, 2);
  assert.equal(candidate.provenance.personalFreeResearch.ephemeral, true);
  assert.equal(candidate.provenance.personalFreeResearch.repeatLedgerSchemaVersion, 2);
  assert.equal(candidate.provenance.personalFreeResearch.repeatLookbackDays, 30);
  assert.equal(candidate.provenance.personalFreeResearch.priorLedgerEditionCount, 0);
  assert.equal(candidate.provenance.personalFreeResearch.priorLedgerStoryCount, 0);
  assert.equal(candidate.provenance.personalFreeResearch.qualityPilotOrdinal, 1);
  assert.match(candidate.provenance.personalFreeResearch.repeatStateSha256, /^[a-f0-9]{64}$/);
  assert.equal(draftOptions.accountId, ACCOUNT_ID);
  assert.equal(draftOptions.apiToken, automationEnv.CLOUDFLARE_AI_API_TOKEN);
  assert.equal(draftOptions.model, PERSONAL_FREE_MODEL);
  assert.equal(draftOptions.evidencePolicy, PERSONAL_FREE_EVIDENCE_POLICY);
  assert.equal(draftOptions.requireComplete, false);
  assert.equal(draftOptions.minimumStoryCount, PERSONAL_FREE_MINIMUM_STORY_COUNT);
  assert.equal(draftOptions.draftSelectedSlate, true);
  assert.equal(draftOptions.maxResearchAttempts, PERSONAL_FREE_MAX_RESEARCH_ATTEMPTS);
  assert.equal(
    draftOptions.researchRetryBelowStoryCount,
    PERSONAL_FREE_RETRY_BELOW_STORY_COUNT,
  );
  assert.equal(draftOptions.lookbackHours, PERSONAL_FREE_LOOKBACK_HOURS);
  assert.equal(draftOptions.minimumScore, PERSONAL_FREE_MINIMUM_SCORE);
  assert.equal(
    draftOptions.minimumAuthoritativeScore,
    PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE,
  );
  assert.equal(draftOptions.maxTokens, PERSONAL_FREE_MAX_TOKENS);
  assert.equal(draftOptions.maxRequestBytes, PERSONAL_FREE_MAX_REQUEST_BYTES);
  assert.deepEqual(draftOptions.recentRepeatHistory, []);
  assert.equal(
    draftOptions.repeatFingerprintKey,
    automationEnv.CLOUDFLARE_AI_API_TOKEN,
  );
});

test("adaptive personal generation creates validated 4, 3, 2, 1, and 0 story editions", async (t) => {
  const desks = ["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"];
  for (const storyCount of [4, 3, 2, 1, 0]) {
    await t.test(`${storyCount} selected stories`, async (t) => {
      const projectRoot = await createProject(t);
      const quietDesks = desks.slice(storyCount);
      const outcome = await generatePersonalFreeEditionOutcome({
        editionDate: "2026-08-20",
        projectRoot,
        env: automationEnv,
        now: GENERATED_AT,
        feedSources,
        personalStoryLedger: createEmptyPersonalStoryLedger({
          fingerprintKey: automationEnv.CLOUDFLARE_AI_API_TOKEN,
        }),
        draftFreeEditionImpl: async () => freeCandidate({ quietDesks }),
      });

      assert.equal(outcome.status, "created");
      assert.equal(outcome.result.selectedStoryCount, storyCount);
      assert.equal(outcome.result.candidate.provenance.personalFreeResearch.candidateCount, storyCount);
      assert.equal(outcome.result.candidate.provenance.personalFreeResearch.requiredStoryCount, storyCount);
      assert.equal(outcome.result.candidate.provenance.personalFreeResearch.selectedStoryCount, storyCount);
      assert.equal(
        outcome.result.candidate.provenance.personalFreeResearch.inference,
        storyCount === 0 ? "skipped-no-eligible-candidates" : "workers-ai",
      );
      assert.equal(
        outcome.result.candidate.provenance.personalFreeResearch.researchAttemptCount,
        storyCount < PERSONAL_FREE_RETRY_BELOW_STORY_COUNT ? 2 : 1,
      );
      assert.equal(validatePersonalFreeCandidate(outcome.result.candidate), true);
      assert.equal(assertPersonalEmailCandidate(outcome.result.candidate).valid, true);
      for (const desk of quietDesks) {
        assert.equal(outcome.result.candidate.desks[desk].story, null);
        assert.match(outcome.result.candidate.desks[desk].emptyReason, /No .* story was selected/);
      }
    });
  }
});

test("adaptive generation still fails closed for inconsistent inference or research failures", async (t) => {
  const projectRoot = await createProject(t);
  const invalidDrafts = [
    freeCandidate({ inference: "skipped-no-eligible-candidates" }),
    freeCandidate({
      quietDesks: ["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"],
      inference: "workers-ai",
    }),
  ];
  for (const draft of invalidDrafts) {
    await assert.rejects(
      generatePersonalFreeEdition({
        editionDate: "2026-08-20",
        projectRoot,
        env: automationEnv,
        now: GENERATED_AT,
        feedSources,
        personalStoryLedger: createEmptyPersonalStoryLedger({
          fingerprintKey: automationEnv.CLOUDFLARE_AI_API_TOKEN,
        }),
        draftFreeEditionImpl: async () => draft,
      }),
      /adaptive|candidate|provenance/i,
    );
  }

  for (const error of [
    new InsufficientFreeCandidatesError({ availableCount: 1, requiredCount: 3 }),
    new Error("Workers AI request failed safely."),
  ]) {
    await assert.rejects(
      generatePersonalFreeEditionOutcome({
        editionDate: "2026-08-20",
        projectRoot,
        env: automationEnv,
        now: GENERATED_AT,
        feedSources,
        personalStoryLedger: createEmptyPersonalStoryLedger({
          fingerprintKey: automationEnv.CLOUDFLARE_AI_API_TOKEN,
        }),
        draftFreeEditionImpl: async () => { throw error; },
      }),
      (received) => received === error,
    );
  }
  await assert.rejects(
    access(path.join(projectRoot, "content", "personal-candidates", "2026-08-20.json")),
    (error) => error?.code === "ENOENT",
  );
});

test("the GitHub CLI preserves hard failures", async (t) => {
  const projectRoot = await createProject(t);
  const outputPath = path.join(projectRoot, "github-output.txt");
  const summaryPath = path.join(projectRoot, "github-summary.md");
  await writeFile(outputPath, "");
  await writeFile(summaryPath, "");
  await assert.rejects(
    runPersonalFreeEditionCli({
      argv: ["2026-08-20", "--github-actions-outcome"],
      env: {
        ...automationEnv,
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
      },
      generateOutcomeImpl: async () => {
        throw new Error("Workers AI request failed safely.");
      },
      logImpl: () => {},
    }),
    /Workers AI request failed safely/,
  );
});

test("the GitHub CLI reports selected story count and adaptive edition format", async (t) => {
  const projectRoot = await createProject(t);
  const outputPath = path.join(projectRoot, "github-output.txt");
  const summaryPath = path.join(projectRoot, "github-summary.md");
  await writeFile(outputPath, "");
  await writeFile(summaryPath, "");
  for (const [selectedStoryCount, editionFormat] of [
    [4, "regular"],
    [3, "regular"],
    [2, "regular"],
    [1, "slim"],
    [0, "quiet"],
  ]) {
    await writeFile(outputPath, "");
    await writeFile(summaryPath, "");
    const outcome = await runPersonalFreeEditionCli({
      argv: ["2026-08-20", "--github-actions-outcome"],
      env: {
        ...automationEnv,
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
      },
      generateOutcomeImpl: async () => ({
        status: "created",
        result: {
          relativePath: "content/personal-candidates/2026-08-20.json",
          sha256: "a".repeat(64),
          selectedStoryCount,
        },
      }),
      logImpl: () => {},
    });
    assert.equal(outcome.status, "created");
    assert.equal(
      await readFile(outputPath, "utf8"),
      `candidate_created=true\nselected_story_count=${selectedStoryCount}\n` +
        `edition_format=${editionFormat}\n`,
    );
    assert.equal(
      await readFile(summaryPath, "utf8"),
      `### Personal paper ready\n\nPrepared a ${editionFormat} edition with ` +
        `${selectedStoryCount} source-checked ${selectedStoryCount === 1 ? "story" : "stories"}. ` +
        "The editorial thresholds were unchanged.\n",
    );
  }
});

test("the private writer is exclusive and never writes a public or comparison artifact", async (t) => {
  const projectRoot = await createProject(t);
  const options = {
    editionDate: "2026-08-20",
    projectRoot,
    env: automationEnv,
    now: GENERATED_AT,
    feedSources,
    personalStoryLedger: createEmptyPersonalStoryLedger({
      fingerprintKey: automationEnv.CLOUDFLARE_AI_API_TOKEN,
    }),
    draftFreeEditionImpl: async () => freeCandidate(),
  };
  const result = await generatePersonalFreeEditionFile(options);
  assert.equal(result.relativePath, "content/personal-candidates/2026-08-20.json");
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    validatePersonalFreeCandidate(JSON.parse(await readFile(result.destination, "utf8"))),
    true,
  );
  await assert.rejects(
    generatePersonalFreeEditionFile(options),
    /already exists; nothing was overwritten/,
  );
  for (const relativePath of [
    "content/editions/2026-08-20.json",
    "content/free-candidates/2026-08-20.json",
  ]) {
    await assert.rejects(
      access(path.join(projectRoot, relativePath)),
      (error) => error?.code === "ENOENT",
    );
  }
});

test("credentials and trusted GitHub identity are required before research", async (t) => {
  const projectRoot = await createProject(t);
  const invalidEnvironments = [
    { ...automationEnv, CLOUDFLARE_ACCOUNT_ID: "" },
    { ...automationEnv, CLOUDFLARE_AI_API_TOKEN: "" },
    { ...automationEnv, GITHUB_REPOSITORY: "attacker/fork" },
    { ...automationEnv, GITHUB_SERVER_URL: "https://example.com" },
  ];
  let draftCalls = 0;
  for (const env of invalidEnvironments) {
    await assert.rejects(
      generatePersonalFreeEdition({
        editionDate: "2026-08-20",
        projectRoot,
        env,
        now: GENERATED_AT,
        feedSources,
        draftFreeEditionImpl: async () => {
          draftCalls += 1;
          return freeCandidate();
        },
      }),
      /CLOUDFLARE|trusted First Fold|GITHUB_SERVER_URL/,
    );
  }
  assert.equal(draftCalls, 0);
});
