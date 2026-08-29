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
  draftFreeEdition,
} from "../scripts/automation/draft-free-edition.mjs";
import { FREE_FEED_SOURCES } from "../scripts/automation/free/feed-sources.mjs";
import {
  buildSourceHealthSnapshot,
  validateSourceHealthSnapshot,
} from "../scripts/automation/source-health.mjs";
import { TRUSTED_EVIDENCE_DIGEST_MODE } from
  "../scripts/automation/free/evidence-digest.mjs";
import { MODEL_ASSISTED_DIGEST_MODE } from
  "../scripts/automation/free/summary-draft.mjs";
import {
  PERSONAL_FREE_EVIDENCE_POLICY,
  PERSONAL_FREE_AI_TIMEOUT_MS,
  PERSONAL_FREE_DESKS,
  PERSONAL_FREE_LOOKBACK_HOURS,
  PERSONAL_FREE_MAX_MODEL_REQUESTS,
  PERSONAL_FREE_MAX_RESEARCH_ATTEMPTS,
  PERSONAL_FREE_MAX_REQUEST_BYTES,
  PERSONAL_FREE_MAX_TOKENS,
  PERSONAL_FREE_MINIMUM_STORY_COUNT,
  PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE,
  PERSONAL_FREE_MINIMUM_SCORE,
  PERSONAL_FREE_FALLBACK_MODEL,
  PERSONAL_FREE_FALLBACK_PROVIDER,
  PERSONAL_FREE_MODEL,
  PERSONAL_FREE_PROVIDER,
  PERSONAL_FREE_RETRY_BELOW_STORY_COUNT,
  generatePersonalFreeEdition,
  generatePersonalFreeEditionFile,
  generatePersonalFreeEditionOutcome,
  personalFreeFailureCode,
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
  draftingMode = MODEL_ASSISTED_DIGEST_MODE,
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
  const quietEdition = selected.length === 0;
  const modelAssisted = !quietEdition && draftingMode === MODEL_ASSISTED_DIGEST_MODE;
  const provider = quietEdition || !modelAssisted
    ? PERSONAL_FREE_FALLBACK_PROVIDER
    : PERSONAL_FREE_PROVIDER;
  const model = quietEdition || !modelAssisted
    ? PERSONAL_FREE_FALLBACK_MODEL
    : PERSONAL_FREE_MODEL;
  const effectiveInference = inference ?? (
    quietEdition
      ? "skipped-no-eligible-candidates"
      : modelAssisted
        ? "workers-ai"
        : TRUSTED_EVIDENCE_DIGEST_MODE
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
    provider,
    model,
    runId: automation.runId,
    runUrl: automation.runUrl,
    repository: automation.repository,
    runMode: "on_time",
    generatedAt: GENERATED_AT,
    feedSnapshotSha256: "a".repeat(64),
    requestSha256: "b".repeat(64),
    responseSha256: "c".repeat(64),
    responseId: quietEdition
      ? "not-invoked"
      : modelAssisted
        ? "workers-ai-personal-summary"
        : "local-digest",
    inference: effectiveInference,
    draftingMode: quietEdition ? "quiet" : draftingMode,
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

function healthySourceHealth({ selectedDesks = PERSONAL_FREE_DESKS } = {}) {
  const selected = new Set(selectedDesks);
  const sourceResults = FREE_FEED_SOURCES.map((source) => ({
    sourceId: source.id,
    publisherKey: source.publisherKey,
    status: "ok",
    code: null,
    parsedItemCount: 1,
    eligibleItemCount: 1,
  }));
  const selectedCount = selected.size;
  const research = {
    candidates: Array.from({ length: selectedCount }, (_, index) => ({ id: `opaque-${index}` })),
    desks: Object.fromEntries(PERSONAL_FREE_DESKS.map((desk) => [desk, {
      candidates: selected.has(desk) ? [{ id: `opaque-${desk}` }] : [],
      selectedCandidate: selected.has(desk) ? { id: `opaque-${desk}` } : null,
    }])),
    diagnostics: {
      sourceResults,
      parsedItemCount: sourceResults.length,
      eligibleItemCount: sourceResults.length,
      candidateCount: selectedCount,
      rankedCandidateCount: selectedCount,
      rejectedCandidateCount: 0,
      rejectionCounts: {},
      selectedCount,
    },
  };
  return buildSourceHealthSnapshot({
    editionDate: "2026-08-20",
    automation,
    runMode: "on_time",
    settings: {
      evidencePolicy: PERSONAL_FREE_EVIDENCE_POLICY,
      lookbackHours: PERSONAL_FREE_LOOKBACK_HOURS,
      minimumScore: PERSONAL_FREE_MINIMUM_SCORE,
      minimumAuthoritativeScore: PERSONAL_FREE_MINIMUM_AUTHORITATIVE_SCORE,
      draftSelectedSlate: true,
      maxResearchAttempts: PERSONAL_FREE_MAX_RESEARCH_ATTEMPTS,
      researchRetryBelowStoryCount: PERSONAL_FREE_RETRY_BELOW_STORY_COUNT,
    },
    attempts: [{ research }],
    selectedAttempt: 1,
    outcome: "not-needed",
  });
}

function localDigestResearchFixture() {
  const desk = "security-and-privacy";
  const story = storyForDesk(desk, 2);
  const originating = story.sources.find((source) => source.relationship === "originating");
  const publisherKey = "local-digest-test-publisher";
  const candidate = {
    candidateId: "candidate-personal-local-digest",
    canonicalEventKey: story.canonicalEventKey,
    suggestedDesk: desk,
    primaryEntity: story.editorial.primaryEntity,
    aiAdjacent: false,
    maturity: "verified-development",
    title: originating.title,
    eventAt: story.timing.eventAt,
    firstPublishedAt: story.timing.firstPublishedAt,
    materiallyUpdatedAt: null,
    verifiedFacts: [
      "The originating publisher posted a reviewed security development during the reporting window.",
    ],
    feedEvidence: [{
      sourceId: originating.id,
      publisher: originating.publisher,
      title: originating.title,
      summary:
        "The reviewed notice describes a security development for an affected workflow and directs readers " +
        "to the publisher documentation for scope, timing, product details, mitigations, and next steps.",
      categories: ["security", "product update"],
      publishedAt: originating.publishedAt,
    }],
    unresolvedQuestions: [],
    sources: story.sources.map((source) => ({ ...source, publisherKey })),
    ranking: {
      score: 80,
      version: "editorial-v1",
      components: {
        materialityNewsworthiness: 24,
        deskRelevance: 18,
        sourceStrength: 16,
        readerUsefulnessActionability: 12,
        freshness: 10,
      },
      componentMaximums: {
        materialityNewsworthiness: 30,
        deskRelevance: 20,
        sourceStrength: 20,
        readerUsefulnessActionability: 15,
        freshness: 15,
      },
      editorialValidation: {
        decision: "accepted",
        requiredScore: 70,
        rejectionReasons: [],
      },
      eligibility: "new-development",
      corroborated: false,
      evidenceTier: "authoritative-single",
      itemSourceCount: 1,
      publisherCount: 1,
      publisherKeys: [publisherKey],
    },
  };
  const quietReason = (label) =>
    `No authoritative or independently corroborated ${label} development cleared the editorial threshold.`;
  const desks = Object.fromEntries(PERSONAL_FREE_DESKS.map((candidateDesk) => [
    candidateDesk,
    candidateDesk === desk
      ? {
          desk: candidateDesk,
          candidates: [candidate],
          selectedCandidate: candidate,
          emptyReason: null,
        }
      : {
          desk: candidateDesk,
          candidates: [],
          selectedCandidate: null,
          emptyReason: quietReason(candidateDesk),
        },
  ]));
  return {
    reportingWindow: buildFreeReportingWindow("2026-08-20", {
      lookbackHours: PERSONAL_FREE_LOOKBACK_HOURS,
    }),
    retrievedAt: GENERATED_AT,
    candidates: [candidate],
    selectedCandidates: [candidate],
    desks,
    diagnostics: {
      sourceResults: FREE_FEED_SOURCES.map((source) => ({
        sourceId: source.id,
        publisherKey: source.publisherKey,
        status: "ok",
        code: null,
        message: null,
        itemCount: 1,
        parsedItemCount: 1,
        eligibleItemCount: 0,
      })),
      eligibleItemCount: 1,
      candidateCount: 1,
      selectedCount: 1,
    },
    sourceTextTrust: "untrusted",
    citationUrlAllowlist: candidate.sources.map((source) => source.url).sort(),
  };
}

function quietResearchFixture() {
  const research = localDigestResearchFixture();
  research.candidates = [];
  research.selectedCandidates = [];
  research.citationUrlAllowlist = [];
  for (const desk of PERSONAL_FREE_DESKS) {
    research.desks[desk] = {
      desk,
      candidates: [],
      selectedCandidate: null,
      emptyReason:
        `No authoritative or independently corroborated ${desk} development cleared the editorial threshold.`,
    };
  }
  research.diagnostics.eligibleItemCount = 0;
  research.diagnostics.candidateCount = 0;
  research.diagnostics.selectedCount = 0;
  return research;
}

function boundedSummaryWords(prefix = "", count = 55) {
  const prefixWords = prefix ? prefix.split(/\s+/u) : [];
  const safeWords = [
    "the", "selected", "development", "gives", "readers", "a", "bounded", "view",
    "of", "available", "details", "while", "open", "questions", "remain", "for",
    "careful", "comparison", "before", "any", "consequential", "decision", "teams",
    "can", "verify", "scope", "preserve", "options", "and", "keep", "next", "steps",
    "reversible",
  ];
  return [
    ...prefixWords,
    ...Array.from(
      { length: Math.max(0, count - prefixWords.length) },
      (_, index) => safeWords[index % safeWords.length],
    ),
  ].join(" ");
}

test("private free generation fixes the zero-model deterministic evidence contract", async (t) => {
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
      return freeCandidate({ draftingMode: TRUSTED_EVIDENCE_DIGEST_MODE });
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
  assert.equal(candidate.provenance.personalFreeResearch.provider, PERSONAL_FREE_FALLBACK_PROVIDER);
  assert.equal(candidate.provenance.personalFreeResearch.researchMethod, "curated-live-feeds");
  assert.equal(candidate.provenance.personalFreeResearch.model, PERSONAL_FREE_FALLBACK_MODEL);
  assert.equal(
    candidate.provenance.personalFreeResearch.inference,
    TRUSTED_EVIDENCE_DIGEST_MODE,
  );
  assert.equal(
    candidate.provenance.personalFreeResearch.draftingMode,
    TRUSTED_EVIDENCE_DIGEST_MODE,
  );
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
  assert.equal(
    candidate.provenance.personalFreeResearch.maxModelRequests,
    PERSONAL_FREE_MAX_MODEL_REQUESTS,
  );
  assert.equal(candidate.provenance.personalFreeResearch.ephemeral, true);
  assert.equal(candidate.provenance.personalFreeResearch.repeatLedgerSchemaVersion, 2);
  assert.equal(candidate.provenance.personalFreeResearch.repeatLookbackDays, 30);
  assert.equal(candidate.provenance.personalFreeResearch.priorLedgerEditionCount, 0);
  assert.equal(candidate.provenance.personalFreeResearch.priorLedgerStoryCount, 0);
  assert.equal(candidate.provenance.personalFreeResearch.qualityPilotOrdinal, 1);
  assert.match(candidate.provenance.personalFreeResearch.repeatStateSha256, /^[a-f0-9]{64}$/);
  assert.equal(draftOptions.accountId, ACCOUNT_ID);
  assert.equal(draftOptions.apiToken, automationEnv.CLOUDFLARE_AI_API_TOKEN);
  assert.equal(draftOptions.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  assert.equal(draftOptions.evidencePolicy, PERSONAL_FREE_EVIDENCE_POLICY);
  assert.equal(draftOptions.requireComplete, false);
  assert.equal(draftOptions.minimumStoryCount, PERSONAL_FREE_MINIMUM_STORY_COUNT);
  assert.equal(draftOptions.draftSelectedSlate, true);
  assert.equal(draftOptions.summarizeSelectedSlate, false);
  assert.equal(draftOptions.trustedEvidenceDigestOnly, true);
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
  assert.equal(draftOptions.maxModelRequests, PERSONAL_FREE_MAX_MODEL_REQUESTS);
  assert.equal(draftOptions.maxRequestBytes, PERSONAL_FREE_MAX_REQUEST_BYTES);
  assert.equal(draftOptions.timeoutMs, PERSONAL_FREE_AI_TIMEOUT_MS);
  assert.deepEqual(draftOptions.recentRepeatHistory, []);
  assert.equal(
    draftOptions.repeatFingerprintKey,
    automationEnv.CLOUDFLARE_AI_API_TOKEN,
  );
});

test("personal production creates a complete trusted digest without invoking AI", async (t) => {
  const projectRoot = await createProject(t);
  const research = localDigestResearchFixture();
  let aiCalls = 0;
  const candidate = await generatePersonalFreeEdition({
    editionDate: "2026-08-20",
    projectRoot,
    env: automationEnv,
    now: GENERATED_AT,
    feedSources: FREE_FEED_SOURCES,
    personalStoryLedger: createEmptyPersonalStoryLedger({
      fingerprintKey: automationEnv.CLOUDFLARE_AI_API_TOKEN,
    }),
    researchImpl: async () => research,
    aiRequestImpl: async () => {
      aiCalls += 1;
      throw new Error("Deterministic personal production must not invoke Workers AI.");
    },
    sourceLookupImpl: async () => [{ address: "93.184.216.34" }],
    sourceRequestImpl: async () => ({ status: 200, headers: {} }),
    draftFreeEditionImpl: async (options) => draftFreeEdition(options),
  });

  assert.equal(aiCalls, 0);
  assert.equal(candidate.provenance.personalFreeResearch.provider, PERSONAL_FREE_FALLBACK_PROVIDER);
  assert.equal(candidate.provenance.personalFreeResearch.model, PERSONAL_FREE_FALLBACK_MODEL);
  assert.equal(
    candidate.provenance.personalFreeResearch.inference,
    TRUSTED_EVIDENCE_DIGEST_MODE,
  );
  assert.equal(
    candidate.provenance.personalFreeResearch.draftingMode,
    TRUSTED_EVIDENCE_DIGEST_MODE,
  );
  assert.equal(
    candidate.provenance.personalFreeResearch.responseId,
    "local-digest",
  );
  assert.equal(candidate.provenance.personalFreeResearch.maxModelRequests, 0);
  assert.match(candidate.provenance.personalFreeResearch.requestSha256, /^[a-f0-9]{64}$/);
  assert.match(candidate.provenance.personalFreeResearch.responseSha256, /^[a-f0-9]{64}$/);
  assert.equal(validatePersonalFreeCandidate(candidate, {
    runMode: "on_time",
    automation,
    expectedFeedSourceCount: FREE_FEED_SOURCES.length,
  }), true);
  assert.equal(assertPersonalEmailCandidate(candidate).valid, true);
});

test("a quiet personal production run makes no AI request", async (t) => {
  const projectRoot = await createProject(t);
  let aiCalls = 0;
  const candidate = await generatePersonalFreeEdition({
    editionDate: "2026-08-20",
    projectRoot,
    env: automationEnv,
    now: GENERATED_AT,
    feedSources: FREE_FEED_SOURCES,
    personalStoryLedger: createEmptyPersonalStoryLedger({
      fingerprintKey: automationEnv.CLOUDFLARE_AI_API_TOKEN,
    }),
    researchImpl: async () => quietResearchFixture(),
    aiRequestImpl: async () => {
      aiCalls += 1;
      throw new Error("A quiet edition must not invoke Workers AI.");
    },
    draftFreeEditionImpl: async (options) => draftFreeEdition(options),
  });

  assert.equal(aiCalls, 0);
  assert.equal(candidate.provenance.personalFreeResearch.selectedStoryCount, 0);
  assert.equal(
    candidate.provenance.personalFreeResearch.provider,
    PERSONAL_FREE_FALLBACK_PROVIDER,
  );
  assert.equal(candidate.provenance.personalFreeResearch.model, PERSONAL_FREE_FALLBACK_MODEL);
  assert.equal(candidate.provenance.personalFreeResearch.draftingMode, "quiet");
  assert.equal(
    candidate.provenance.personalFreeResearch.inference,
    "skipped-no-eligible-candidates",
  );
  assert.equal(candidate.provenance.personalFreeResearch.responseId, "not-invoked");
  assert.equal(assertPersonalEmailCandidate(candidate).valid, true);
});

test("trusted evidence digest provenance survives private candidate conversion", async (t) => {
  const projectRoot = await createProject(t);
  const digestDraft = freeCandidate({ draftingMode: TRUSTED_EVIDENCE_DIGEST_MODE });

  const candidate = await generatePersonalFreeEdition({
    editionDate: "2026-08-20",
    projectRoot,
    env: automationEnv,
    now: GENERATED_AT,
    feedSources,
    personalStoryLedger: createEmptyPersonalStoryLedger({
      fingerprintKey: automationEnv.CLOUDFLARE_AI_API_TOKEN,
    }),
    draftFreeEditionImpl: async () => digestDraft,
  });

  assert.equal(validatePersonalFreeCandidate(candidate, {
    runMode: "on_time",
    automation,
    expectedFeedSourceCount: feedSources.length,
  }), true);
  assert.equal(assertPersonalEmailCandidate(candidate).valid, true);
  assert.equal(
    candidate.provenance.personalFreeResearch.draftingMode,
    TRUSTED_EVIDENCE_DIGEST_MODE,
  );
  assert.equal(
    candidate.provenance.personalFreeResearch.inference,
    TRUSTED_EVIDENCE_DIGEST_MODE,
  );
  assert.equal(candidate.provenance.personalFreeResearch.responseId, "local-digest");
  assert.equal(candidate.provenance.personalFreeResearch.selectedStoryCount, 4);
});

test("trusted evidence digest provenance rejects mismatched inference and response markers", async (t) => {
  const projectRoot = await createProject(t);
  const mismatchedDrafts = [
    (() => {
      const draft = freeCandidate({ draftingMode: TRUSTED_EVIDENCE_DIGEST_MODE });
      draft.provenance.freePilot.inference = "workers-ai";
      return draft;
    })(),
    (() => {
      const draft = freeCandidate({ draftingMode: TRUSTED_EVIDENCE_DIGEST_MODE });
      draft.provenance.freePilot.draftingMode = "model";
      return draft;
    })(),
    (() => {
      const draft = freeCandidate({ draftingMode: TRUSTED_EVIDENCE_DIGEST_MODE });
      draft.provenance.freePilot.responseId = "not-invoked";
      return draft;
    })(),
  ];

  for (const draft of mismatchedDrafts) {
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
});

test("model-assisted provenance rejects mixed tuples and legacy full-model drafting", async (t) => {
  const projectRoot = await createProject(t);
  const mutations = [
    (draft) => { draft.provenance.freePilot.provider = PERSONAL_FREE_FALLBACK_PROVIDER; },
    (draft) => { draft.provenance.freePilot.model = PERSONAL_FREE_FALLBACK_MODEL; },
    (draft) => { draft.provenance.freePilot.inference = TRUSTED_EVIDENCE_DIGEST_MODE; },
    (draft) => { draft.provenance.freePilot.responseId = "local-digest"; },
    (draft) => { draft.provenance.freePilot.responseId = "not-invoked"; },
    (draft) => { draft.provenance.freePilot.draftingMode = "model"; },
  ];

  for (const mutate of mutations) {
    const draft = freeCandidate();
    mutate(draft);
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
      /adaptive|candidate|provenance|CLOUDFLARE_AI_MODEL/i,
    );
  }
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
        draftFreeEditionImpl: async () => freeCandidate({
          quietDesks,
          draftingMode: TRUSTED_EVIDENCE_DIGEST_MODE,
        }),
      });

      assert.equal(outcome.status, "created");
      assert.equal(outcome.result.selectedStoryCount, storyCount);
      assert.equal(outcome.result.candidate.provenance.personalFreeResearch.candidateCount, storyCount);
      assert.equal(outcome.result.candidate.provenance.personalFreeResearch.requiredStoryCount, storyCount);
      assert.equal(outcome.result.candidate.provenance.personalFreeResearch.selectedStoryCount, storyCount);
      assert.equal(
        outcome.result.candidate.provenance.personalFreeResearch.inference,
        storyCount === 0
          ? "skipped-no-eligible-candidates"
          : TRUSTED_EVIDENCE_DIGEST_MODE,
      );
      assert.equal(
        outcome.result.candidate.provenance.personalFreeResearch.draftingMode,
        storyCount === 0 ? "quiet" : TRUSTED_EVIDENCE_DIGEST_MODE,
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
  const annotations = [];
  const failure = new Error("sensitive provider detail must not be reported");
  Object.defineProperty(failure, "code", {
    value: "WORKERS_AI_CLIENT_TIMEOUT",
    enumerable: false,
  });
  await assert.rejects(
    runPersonalFreeEditionCli({
      argv: ["2026-08-20", "--github-actions-outcome"],
      env: {
        ...automationEnv,
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
      },
      generateOutcomeImpl: async () => {
        throw failure;
      },
      logImpl: () => {},
      errorImpl: (message) => annotations.push(message),
    }),
    (error) => error === failure,
  );
  assert.equal(await readFile(outputPath, "utf8"), "");
  const summary = await readFile(summaryPath, "utf8");
  assert.match(summary, /Personal paper not sent/);
  assert.match(summary, /WORKERS_AI_CLIENT_TIMEOUT/);
  assert.doesNotMatch(summary, /sensitive provider detail/);
  assert.deepEqual(annotations, [
    "::error title=Personal Morning Paper not sent::WORKERS_AI_CLIENT_TIMEOUT — " +
      "candidate generation failed; no email was sent.",
  ]);
});

test("the GitHub CLI exposes only allowlisted editorial diagnostics", async (t) => {
  const projectRoot = await createProject(t);
  const codes = [
    "EDITORIAL_AUTHORITATIVE_STRUCTURE_RETRY_EXHAUSTED",
    "EDITORIAL_CORRECTION_BUDGET_EXHAUSTED",
    "EDITORIAL_FORMAT_RETRY_EXHAUSTED",
    "EDITORIAL_LENGTH_RETRY_EXHAUSTED",
    "EDITORIAL_ORIGINALITY_RETRY_EXHAUSTED",
  ];

  for (const code of codes) {
    const outputPath = path.join(projectRoot, `${code}-output.txt`);
    const summaryPath = path.join(projectRoot, `${code}-summary.md`);
    await writeFile(outputPath, "");
    await writeFile(summaryPath, "");
    const annotations = [];
    const failure = new Error(
      "secret-token-canary\n::warning title=Injected::untrusted feed headline",
    );
    Object.defineProperty(failure, "diagnosticCode", {
      value: code,
      enumerable: false,
    });

    await assert.rejects(
      runPersonalFreeEditionCli({
        argv: ["2026-08-20", "--github-actions-outcome"],
        env: {
          ...automationEnv,
          GITHUB_OUTPUT: outputPath,
          GITHUB_STEP_SUMMARY: summaryPath,
        },
        generateOutcomeImpl: async () => { throw failure; },
        logImpl: () => {},
        errorImpl: (message) => annotations.push(message),
      }),
      (error) => error === failure,
    );

    const summary = await readFile(summaryPath, "utf8");
    assert.match(summary, new RegExp(code));
    assert.doesNotMatch(summary, /secret-token-canary|untrusted feed headline|::warning/);
    assert.deepEqual(annotations, [
      `::error title=Personal Morning Paper not sent::${code} — ` +
        "candidate generation failed; no email was sent.",
    ]);
  }

  const unknown = new Error("unknown diagnostic must stay private");
  Object.defineProperty(unknown, "diagnosticCode", {
    value: "EDITORIAL_ARBITRARY_UNTRUSTED_VALUE",
    enumerable: false,
  });
  Object.defineProperty(unknown, "sourceHealth", {
    value: { selectedAttempt: 1 },
    enumerable: false,
  });
  assert.equal(personalFreeFailureCode(unknown), "EDITION_GENERATION_FAILED");
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
    draftFreeEditionImpl: async () => freeCandidate({
      draftingMode: TRUSTED_EVIDENCE_DIGEST_MODE,
    }),
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

test("source health is written as a safe exclusive bundle outside the private candidate", async (t) => {
  const projectRoot = await createProject(t);
  const sourceHealthRoot = await mkdtemp(path.join(tmpdir(), "first-fold-source-health-"));
  t.after(async () => rm(sourceHealthRoot, { recursive: true, force: true }));
  const summaryPath = path.join(sourceHealthRoot, "github-summary.md");
  await writeFile(summaryPath, "");
  const sourceHealth = healthySourceHealth();
  const options = {
    editionDate: "2026-08-20",
    projectRoot,
    env: {
      ...automationEnv,
      PERSONAL_SOURCE_HEALTH_ROOT: sourceHealthRoot,
      GITHUB_STEP_SUMMARY: summaryPath,
    },
    now: GENERATED_AT,
    feedSources,
    personalStoryLedger: createEmptyPersonalStoryLedger({
      fingerprintKey: automationEnv.CLOUDFLARE_AI_API_TOKEN,
    }),
    draftFreeEditionWithHealthImpl: async () => ({
      candidate: freeCandidate({ draftingMode: TRUSTED_EVIDENCE_DIGEST_MODE }),
      sourceHealth,
    }),
  };

  const result = await generatePersonalFreeEditionFile(options);
  assert.equal(result.sourceHealthBundle.status, "written");
  assert.equal(result.sourceHealthBundle.summaryAppended, true);
  const expectedBundleRoot = path.join(sourceHealthRoot, "2026-08-20");
  assert.equal(result.sourceHealthBundle.jsonPath, path.join(expectedBundleRoot, "source-health.json"));
  assert.equal(result.sourceHealthBundle.htmlPath, path.join(expectedBundleRoot, "source-health.html"));
  assert.equal(
    result.sourceHealthBundle.markdownPath,
    path.join(expectedBundleRoot, "source-health.md"),
  );

  const [candidateText, jsonText, markdownText, htmlText, summaryText] = await Promise.all([
    readFile(result.destination, "utf8"),
    readFile(result.sourceHealthBundle.jsonPath, "utf8"),
    readFile(result.sourceHealthBundle.markdownPath, "utf8"),
    readFile(result.sourceHealthBundle.htmlPath, "utf8"),
    readFile(summaryPath, "utf8"),
  ]);
  assert.equal(Object.hasOwn(JSON.parse(candidateText), "sourceHealth"), false);
  assert.equal(candidateText.includes('"sourceHealth"'), false);
  const contaminatedCandidate = JSON.parse(candidateText);
  contaminatedCandidate.provenance.sourceHealth = sourceHealth;
  assert.throws(
    () => validatePersonalFreeCandidate(contaminatedCandidate),
    /private source-checked provenance contract/,
  );
  const healthSnapshot = JSON.parse(jsonText);
  assert.equal(validateSourceHealthSnapshot(healthSnapshot), healthSnapshot);
  assert.match(markdownText, /First Fold source health/);
  assert.match(htmlText, /Operations view/);
  assert.match(summaryText, /First Fold source health/);

  for (const forbidden of [
    "Verified private free ai development",
    "2026-08-20-ai-personal-free",
    "https://example.com/ai/originating",
    "opaque-ai",
    "cloudflare-workers-ai-test-token",
    "private-recipient@example.invalid",
  ]) {
    assert.equal(jsonText.includes(forbidden), false);
    assert.equal(markdownText.includes(forbidden), false);
    assert.equal(htmlText.includes(forbidden), false);
  }

  const originalBundle = { jsonText, markdownText, htmlText };
  const secondProjectRoot = await createProject(t);
  const secondResult = await generatePersonalFreeEditionFile({
    ...options,
    projectRoot: secondProjectRoot,
  });
  assert.equal(secondResult.sourceHealthBundle.status, "unavailable");
  assert.equal(secondResult.sourceHealthBundle.reason, "write-failed");
  assert.equal(
    await readFile(result.sourceHealthBundle.jsonPath, "utf8"),
    originalBundle.jsonText,
  );
  assert.equal(
    await readFile(result.sourceHealthBundle.markdownPath, "utf8"),
    originalBundle.markdownText,
  );
  assert.equal(
    await readFile(result.sourceHealthBundle.htmlPath, "utf8"),
    originalBundle.htmlText,
  );
  assert.equal(validatePersonalFreeCandidate(secondResult.candidate), true);
});

test("a healthy zero-story run is visible as healthy quiet source health", async (t) => {
  const projectRoot = await createProject(t);
  const sourceHealthRoot = await mkdtemp(path.join(tmpdir(), "first-fold-quiet-health-"));
  t.after(async () => rm(sourceHealthRoot, { recursive: true, force: true }));
  const quietDesks = [...PERSONAL_FREE_DESKS];
  const result = await generatePersonalFreeEditionFile({
    editionDate: "2026-08-20",
    projectRoot,
    env: {
      ...automationEnv,
      PERSONAL_SOURCE_HEALTH_ROOT: sourceHealthRoot,
    },
    now: GENERATED_AT,
    feedSources,
    personalStoryLedger: createEmptyPersonalStoryLedger({
      fingerprintKey: automationEnv.CLOUDFLARE_AI_API_TOKEN,
    }),
    draftFreeEditionWithHealthImpl: async () => ({
      candidate: freeCandidate({ quietDesks }),
      sourceHealth: healthySourceHealth({ selectedDesks: [] }),
    }),
  });

  assert.equal(result.selectedStoryCount, 0);
  assert.equal(result.sourceHealthBundle.status, "written");
  const health = JSON.parse(await readFile(result.sourceHealthBundle.jsonPath, "utf8"));
  assert.equal(health.attempts[0].status, "healthy-quiet");
  assert.equal(health.attempts[0].aggregate.selectedCount, 0);
  assert.equal(health.attempts[0].aggregate.failedSourceCount, 0);
  assert.equal(health.attempts[0].desks.every((desk) => desk.coverageStatus === "covered"), true);
  assert.match(await readFile(result.sourceHealthBundle.htmlPath, "utf8"), /Healthy Quiet/);
});

test("validated source health survives a generation failure without replacing that failure", async (t) => {
  const projectRoot = await createProject(t);
  const sourceHealthRoot = await mkdtemp(path.join(tmpdir(), "first-fold-failed-health-"));
  t.after(async () => rm(sourceHealthRoot, { recursive: true, force: true }));
  const summaryPath = path.join(sourceHealthRoot, "github-summary.md");
  await writeFile(summaryPath, "");
  const generationError = new Error("Workers AI request failed safely.");
  Object.defineProperty(generationError, "sourceHealth", {
    value: healthySourceHealth({ selectedDesks: [] }),
    enumerable: false,
  });

  await assert.rejects(
    generatePersonalFreeEditionFile({
      editionDate: "2026-08-20",
      projectRoot,
      env: {
        ...automationEnv,
        PERSONAL_SOURCE_HEALTH_ROOT: sourceHealthRoot,
        GITHUB_STEP_SUMMARY: summaryPath,
      },
      now: GENERATED_AT,
      feedSources,
      personalStoryLedger: createEmptyPersonalStoryLedger({
        fingerprintKey: automationEnv.CLOUDFLARE_AI_API_TOKEN,
      }),
      draftFreeEditionWithHealthImpl: async () => {
        throw generationError;
      },
    }),
    (error) => {
      assert.equal(error, generationError);
      assert.equal(error.sourceHealthBundle.status, "written");
      assert.equal(error.sourceHealthBundle.summaryAppended, true);
      return true;
    },
  );
  await assert.rejects(
    access(path.join(projectRoot, "content", "personal-candidates", "2026-08-20.json")),
    (error) => error?.code === "ENOENT",
  );
  assert.equal(
    validateSourceHealthSnapshot(JSON.parse(await readFile(
      path.join(sourceHealthRoot, "2026-08-20", "source-health.json"),
      "utf8",
    ))).attempts[0].status,
    "healthy-quiet",
  );
  assert.match(await readFile(summaryPath, "utf8"), /Healthy Quiet/);
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
