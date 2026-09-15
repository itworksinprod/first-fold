import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { localPreviewTestCandidate, localPreviewTestEnv, localPreviewTestNow } from "./fixtures/local-preview.mjs";
import { authorizeLocalPreview } from "../scripts/automation/local-preview-policy.mjs";
import { generatePersonalFreeEdition, validatePersonalFreeCandidate } from "../scripts/automation/personal-free-edition.mjs";
import { assertPersonalEmailCandidate, renderPersonalEditionEmail, sendPersonalEditionEmail } from "../scripts/automation/personal-email.mjs";
import { buildFreeReportingWindow, validateMixedReviewMetadata } from "../scripts/automation/draft-free-edition.mjs";
import { createEmptyPersonalStoryLedger } from "../scripts/automation/personal-story-ledger.mjs";
import { EXPERIMENTAL_MIXED_REVIEW_PROFILE } from "../scripts/automation/free/grounded-draft.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL, WORKERS_AI_PROVIDER } from "../scripts/automation/free/workers-ai.mjs";

// All source copy and response fingerprints below are synthetic test fixtures.
// These tests establish boundary behavior, not live model quality or delivery.
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const generatedAt = "2026-08-20T09:10:00.000Z";
const env = { GITHUB_RUN_ID: "876543210", GITHUB_SERVER_URL: "https://github.com",
  GITHUB_REPOSITORY: "itworksinprod/first-fold", CLOUDFLARE_ACCOUNT_ID: "0".repeat(32),
  CLOUDFLARE_AI_API_TOKEN: "synthetic-mixed-personal-fixture-key" };
const feeds = [{ id: "synthetic-feed" }];
const storyIds = candidate => Object.values(candidate.desks).flatMap(page => page.story ? [page.story.id] : []);

function setAggregates(metadata) {
  metadata.requestSha256 = hash(metadata.stages.map(({ stage, provider, model, requestSha256 }) =>
    ({ stage, provider, model, requestSha256 })));
  metadata.responseSha256 = hash(metadata.stages.map(({ stage, provider, model, responseSha256 }) =>
    ({ stage, provider, model, responseSha256 })));
}

function freeCandidate() {
  const candidate = localPreviewTestCandidate();
  candidate.id = "first-fold-2026-08-20";
  candidate.editionDate = "2026-08-20";
  candidate.reportingWindow = buildFreeReportingWindow(candidate.editionDate, { lookbackHours: 72 });
  Object.assign(candidate.publication, { generatedAt, publishAt: "2026-08-20T10:00:00.000Z", publishedAt: null });
  for (const page of Object.values(candidate.desks)) if (page.story) {
    page.story.timing = { eventAt: "2026-08-20T08:00:00.000Z", firstPublishedAt: "2026-08-20T08:00:00.000Z", materiallyUpdatedAt: null };
    for (const source of page.story.sources) Object.assign(source, { publishedAt: "2026-08-20T08:00:00.000Z", retrievedAt: generatedAt });
  }
  const approvedCandidateIds = storyIds(candidate).map(id => id.slice("trusted-evidence-digest-".length));
  delete candidate.provenance.personalFreeResearch;
  candidate.provenance.freePilot = {
    workflow: "free-morning-press", provider: WORKERS_AI_PROVIDER, model: DEFAULT_CLOUDFLARE_AI_MODEL,
    runId: env.GITHUB_RUN_ID, runUrl: `https://github.com/itworksinprod/first-fold/actions/runs/${env.GITHUB_RUN_ID}`,
    repository: env.GITHUB_REPOSITORY, runMode: "on_time", generatedAt,
    feedSnapshotSha256: "a".repeat(64), responseId: "synthetic-composition-response",
    inference: "workers-ai", draftingMode: "source-grounded-summary", privateSourceBriefs: true,
    feedSourceCount: feeds.length, successfulFeedSourceCount: feeds.length, coveredDeskCount: 4,
    candidateCount: 1, draftSelectedSlate: true, maxResearchAttempts: 2, researchRetryBelowStoryCount: 3,
    researchAttemptCount: 2, researchRetryOutcome: "no-improvement", evidencePolicy: "authoritative-or-corroborated",
    requiredStoryCount: 1, selectedStoryCount: 1, lookbackHours: 72, minimumScore: 70, minimumAuthoritativeScore: 70,
    stages: ["foundation", "composition", "review"].map((stage, index) => ({ stage, provider: WORKERS_AI_PROVIDER,
      model: index === 2 ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL,
      requestSha256: hash({ syntheticRequest: index }), responseSha256: hash({ syntheticResponse: index }) })),
  };
  const metadata = candidate.provenance.freePilot;
  metadata.semanticReview = { provider: WORKERS_AI_PROVIDER, model: FREE_REASONING_WRITER_MODEL,
    profile: EXPERIMENTAL_MIXED_REVIEW_PROFILE, requestCount: 1, requestedOutputTokens: 8_000,
    requestSha256: metadata.stages[2].requestSha256, responseSha256: metadata.stages[2].responseSha256,
    approvedCandidateIds };
  setAggregates(metadata);
  candidate.provenance.sourceCheck = { status: "passed", checkedAt: generatedAt, checkedSourceCount: 2, issues: [] };
  return candidate;
}

async function project(t) {
  const root = await mkdtemp(path.join(tmpdir(), "first-fold-mixed-personal-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "content", "editions"), { recursive: true });
  await mkdir(path.join(root, "lib", "editorial", "prompts"), { recursive: true });
  await writeFile(path.join(root, "content", "editions", "2026-08-19.json"),
    await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url)));
  await writeFile(path.join(root, "lib", "editorial", "prompts", "policy.ts"), "// synthetic policy fixture\n");
  await writeFile(path.join(root, "lib", "editorial", "prompts", "daily-run.ts"), "// synthetic prompt fixture\n");
  return root;
}

function adapt(candidate, projectRoot) {
  return generatePersonalFreeEdition({ editionDate: candidate.editionDate, env, projectRoot, now: generatedAt,
    feedSources: feeds, personalStoryLedger: createEmptyPersonalStoryLedger({ fingerprintKey: env.CLOUDFLARE_AI_API_TOKEN }),
    draftFreeEditionImpl: async () => candidate,
    aiRequestImpl: async () => { assert.fail("Offline boundary fixture must not invoke a model"); },
    fetchImpl: async () => { assert.fail("Offline boundary fixture must not use transport"); } });
}

const mutations = [
  metadata => { delete metadata.stages; },
  metadata => { delete metadata.semanticReview; },
  metadata => { metadata.stages = null; },
  metadata => { metadata.stages = undefined; },
  metadata => { metadata.semanticReview = null; },
  metadata => { metadata.semanticReview = undefined; },
  metadata => { metadata.stages.reverse(); setAggregates(metadata); },
  metadata => { metadata.stages[0].model = FREE_REASONING_WRITER_MODEL; setAggregates(metadata); },
  metadata => { metadata.stages[2].provider = "paid-openai"; setAggregates(metadata); },
  metadata => { metadata.stages[1].extra = "unexpected"; },
  metadata => { metadata.stages[1].requestSha256 = "bad"; setAggregates(metadata); },
  metadata => { metadata.requestSha256 = "f".repeat(64); },
  metadata => { metadata.responseSha256 = "f".repeat(64); },
  metadata => { metadata.semanticReview.requestSha256 = "f".repeat(64); },
  metadata => { metadata.semanticReview.responseSha256 = "f".repeat(64); },
  metadata => { metadata.semanticReview.profile = "unknown-profile"; },
  metadata => { metadata.semanticReview.provider = "ollama-local"; },
  metadata => { metadata.semanticReview.requestedOutputTokens = 8_001; },
  metadata => { metadata.semanticReview.requestCount = 2; },
  metadata => { metadata.semanticReview.approvedCandidateIds = []; },
  metadata => { metadata.semanticReview.approvedCandidateIds = ["not-the-selected-story"]; },
  metadata => { metadata.semanticReview.approvedCandidateIds = metadata.semanticReview.approvedCandidateIds.map(id => `trusted-evidence-digest-${id}`); },
  metadata => { metadata.semanticReview.approvedCandidateIds.push(metadata.semanticReview.approvedCandidateIds[0]); },
  metadata => { metadata.semanticReview.extra = true; },
  metadata => { metadata.model = FREE_REASONING_WRITER_MODEL; },
  metadata => { metadata.privateSourceBriefs = false; },
  metadata => { metadata.inference = "trusted-evidence-digest"; },
];

test("personal transformation preserves exact mixed stages and semantic review without sharing mutable references", async t => {
  const root = await project(t);
  const free = freeCandidate();
  const before = structuredClone(free);
  assert.equal(validateMixedReviewMetadata(free.provenance.freePilot, storyIds(free)), true);
  const candidate = await adapt(free, root);
  const metadata = candidate.provenance.personalFreeResearch;
  assert.deepEqual(metadata.stages, free.provenance.freePilot.stages);
  assert.deepEqual(metadata.semanticReview, free.provenance.freePilot.semanticReview);
  assert.notEqual(metadata.stages, free.provenance.freePilot.stages);
  assert.notEqual(metadata.semanticReview.approvedCandidateIds, free.provenance.freePilot.semanticReview.approvedCandidateIds);
  assert.deepEqual(free, before);
  assert.equal(validatePersonalFreeCandidate(candidate), true);
  assert.equal(assertPersonalEmailCandidate(candidate).valid, true);
  const rendered = renderPersonalEditionEmail(candidate);
  assert.doesNotMatch(JSON.stringify(rendered), /semanticReview|requestSha256|approvedCandidateIds|synthetic-composition-response/);
});

test("mixed provenance cannot lose or corrupt stages, aggregates, reviewer identity or approval mappings during adaptation", async t => {
  const root = await project(t);
  for (const mutate of mutations) {
    const candidate = freeCandidate();
    mutate(candidate.provenance.freePilot);
    await assert.rejects(adapt(candidate, root));
  }
});

test("final personal validators reject malformed mixed records again before any email request", async t => {
  const root = await project(t);
  const valid = await adapt(freeCandidate(), root);
  for (const mutate of mutations) {
    const candidate = structuredClone(valid);
    mutate(candidate.provenance.personalFreeResearch);
    assert.throws(() => validatePersonalFreeCandidate(candidate));
    assert.throws(() => assertPersonalEmailCandidate(candidate));
    assert.throws(() => renderPersonalEditionEmail(candidate));
    let sends = 0;
    await assert.rejects(sendPersonalEditionEmail(candidate, { apiKey: "re_synthetic_unusable_key", recipient: "owner@example.com",
      feedbackBaseUrl: "", feedbackSigningKey: "", fetchImpl: async () => { sends++; assert.fail("Rejected fixture must never send"); } }));
    assert.equal(sends, 0);
  }
});

test("ordinary cloud metadata and existing explicitly authorized local preview remain separate unchanged routes", async t => {
  const root = await project(t);
  const free = freeCandidate();
  delete free.provenance.freePilot.stages;
  delete free.provenance.freePilot.semanticReview;
  const candidate = await adapt(free, root);
  assert.equal(Object.hasOwn(candidate.provenance.personalFreeResearch, "stages"), false);
  assert.equal(Object.hasOwn(candidate.provenance.personalFreeResearch, "semanticReview"), false);
  assert.equal(validatePersonalFreeCandidate(candidate), true);
  assert.equal(assertPersonalEmailCandidate(candidate).valid, true);
  const local = localPreviewTestCandidate();
  const authorization = authorizeLocalPreview(localPreviewTestEnv(local), local, localPreviewTestNow);
  assert.equal(assertPersonalEmailCandidate(local, { localPreviewAuthorization: authorization, now: localPreviewTestNow }).valid, true);
  local.provenance.personalFreeResearch.stages = [];
  assert.throws(() => assertPersonalEmailCandidate(local, { localPreviewAuthorization: authorization, now: localPreviewTestNow }));
});
