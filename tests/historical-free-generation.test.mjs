import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HISTORICAL_PREVIEW, authorizeHistoricalPreview } from "../scripts/automation/historical-preview-policy.mjs";
import { assertFreeEditionGenerationTime, draftFreeEditionWithHealth, FREE_RUN_MODES } from "../scripts/automation/draft-free-edition.mjs";
import { generatePersonalFreeEdition, validatePersonalFreeCandidate,
  PERSONAL_FREE_RUN_MODES } from "../scripts/automation/personal-free-edition.mjs";
import { FREE_FEED_SOURCES } from "../scripts/automation/free/feed-sources.mjs";
import { createEmptyPersonalStoryLedger } from "../scripts/automation/personal-story-ledger.mjs";
import { runNewsroomQa, validateNewsroomDraft } from "../scripts/automation/newsroom-qa.mjs";
import { validateSourceHealthSnapshot } from "../scripts/automation/source-health.mjs";

const NOW = "2026-09-12T05:00:00.000Z";
const EXPIRED = "2026-09-13T04:00:00.000Z";
const stamp = { editionDate: HISTORICAL_PREVIEW.editionDate,
  requestedOn: HISTORICAL_PREVIEW.requestedOn, revision: HISTORICAL_PREVIEW.revision };
const env = { CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_AI_API_TOKEN: "historical-generation-fixture-token-0123456789",
  PREVIEW_CONFIRMATION: HISTORICAL_PREVIEW.confirmation, GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main",
  GITHUB_ACTOR: "itworksinprod", GITHUB_TRIGGERING_ACTOR: "itworksinprod", GITHUB_RUN_ATTEMPT: "1",
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ID: "123456789", GITHUB_SHA: "a".repeat(40),
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/personal-preview.yml@refs/heads/main" };
const clockOptions = { editionDate: HISTORICAL_PREVIEW.editionDate, now: NOW,
  cutoffInstant: "2026-09-11T09:00:00.000Z", publishInstant: "2026-09-11T10:00:00.000Z" };
const desks = ["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"];

test("ordinary modes cannot regenerate yesterday; the opaque exact-date preview permission can", () => {
  assert.deepEqual(FREE_RUN_MODES, ["on_time", "same_day_backfill"]);
  assert.deepEqual(PERSONAL_FREE_RUN_MODES, ["on_time", "same_day_backfill"]);
  for (const runMode of FREE_RUN_MODES) assert.throws(() => assertFreeEditionGenerationTime({ ...clockOptions, runMode }), /current America/);
  const token = authorizeHistoricalPreview(env, NOW);
  const options = { ...clockOptions, runMode: HISTORICAL_PREVIEW.runMode, historicalPreviewAuthorization: token };
  assert.equal(assertFreeEditionGenerationTime(options), NOW);
  for (const mutation of [{ historicalPreviewAuthorization: {} }, { historicalPreviewAuthorization: { ...token } },
    { now: EXPIRED }, { editionDate: "2026-09-10" }, { cutoffInstant: "2026-09-12T09:00:00.000Z" },
    { runMode: "same_day_backfill" }]) assert.throws(() => assertFreeEditionGenerationTime({ ...options, ...mutation }));
});

function quietResearch(options) {
  return { reportingWindow: options.reportingWindow, retrievedAt: options.retrievedAt,
    candidates: [], selectedCandidates: [], citationUrlAllowlist: [], sourceTextTrust: "untrusted",
    desks: Object.fromEntries(desks.map((desk) => [desk, { desk, candidates: [], selectedCandidate: null,
      emptyReason: `No independently corroborated ${desk} development cleared the editorial threshold.` }])),
    diagnostics: { eligibleItemCount: 0, candidateCount: 0, selectedCount: 0,
      sourceResults: FREE_FEED_SOURCES.map((source) => ({ sourceId: source.id, publisherKey: source.publisherKey,
        status: "ok", code: null, itemCount: 1, parsedItemCount: 1, eligibleItemCount: 0 })) } };
}

test("authorized personal research records the real next-day clock and keeps the original cutoff and free limits", async (t) => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "first-fold-historical-generation-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, "content/editions"), { recursive: true });
  await mkdir(path.join(projectRoot, "lib/editorial/prompts"), { recursive: true });
  await writeFile(path.join(projectRoot, "content/editions/2026-08-19.json"), await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url)));
  await writeFile(path.join(projectRoot, "lib/editorial/prompts/policy.ts"), "Private preview fixture policy.");
  await writeFile(path.join(projectRoot, "lib/editorial/prompts/daily-run.ts"), "Private preview fixture daily prompt.");
  const token = authorizeHistoricalPreview(env, NOW);
  let researchCalls = 0;
  let detailed;
  const candidate = await generatePersonalFreeEdition({ editionDate: HISTORICAL_PREVIEW.editionDate,
    projectRoot, env, now: NOW, runMode: HISTORICAL_PREVIEW.runMode, historicalPreviewAuthorization: token,
    personalStoryLedger: createEmptyPersonalStoryLedger({ fingerprintKey: env.CLOUDFLARE_AI_API_TOKEN }),
    researchImpl: async (options) => { researchCalls++; assert.equal(options.retrievedAt, NOW);
      assert.equal(options.reportingWindow.endExclusive, clockOptions.cutoffInstant); return quietResearch(options); },
    aiRequestImpl: async () => { throw new Error("Quiet fixture must not call an AI provider."); },
    draftFreeEditionWithHealthImpl: async (options) => {
      assert.equal(options.historicalPreviewAuthorization, token);
      assert.equal(options.maxModelRequests, 4);
      assert.equal(options.groundedSummaries, true);
      assert.equal(options.trustedEvidenceDigestOnly, true);
      assert.equal(options.draftSelectedSlate, true);
      assert.equal(options.minimumScore, 70);
      detailed = await draftFreeEditionWithHealth(options); return detailed;
    } });
  assert.equal(researchCalls, 2);
  assert.equal(candidate.publication.generatedAt, NOW);
  assert.equal(candidate.provenance.sourceCheck.checkedAt, NOW);
  assert.equal(candidate.reportingWindow.endExclusive, clockOptions.cutoffInstant);
  assert.equal(candidate.publication.publishedAt, null);
  assert.deepEqual(candidate.provenance.personalFreeResearch.historicalPreview, stamp);
  assert.deepEqual(detailed.candidate.provenance.freePilot.historicalPreview, stamp);
  assert.equal(validatePersonalFreeCandidate(candidate), true);
  assert.deepEqual(detailed.sourceHealth.run.historicalPreview, stamp);
  assert.equal(detailed.sourceHealth.run.generatedAt, NOW);
  assert.equal(validateSourceHealthSnapshot(detailed.sourceHealth), detailed.sourceHealth);

  const options = { checkedAt: NOW, allowedSourceUrls: [], temporalMode: "requested-historical-preview",
    historicalPreviewAuthorization: token };
  assert.equal(validateNewsroomDraft(candidate, options).status, "passed");
  for (const alteration of [{ historicalPreviewAuthorization: { ...token } }, { historicalPreviewAuthorization: undefined },
    { checkedAt: EXPIRED }, { temporalMode: undefined }]) {
    assert.ok(validateNewsroomDraft(candidate, { ...options, ...alteration }).issues.some((issue) => issue.code === "HISTORICAL_PREVIEW_UNAUTHORIZED"));
  }
  const previous = JSON.parse(await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url), "utf8"));
  const withStory = structuredClone(candidate);
  const story = structuredClone(previous.desks.ai.story);
  story.status = "new-development";
  story.selection.materialDelta = null;
  story.timing = { eventAt: null, firstPublishedAt: "2026-09-10T12:00:00.000Z", materiallyUpdatedAt: null };
  for (const source of story.sources) {
    source.retrievedAt = NOW;
    source.publishedAt = source.relationship === "context" ? null : "2026-09-10T12:00:00.000Z";
  }
  withStory.desks.ai = { desk: "ai", story, emptyReason: null };
  const sourceOptions = { ...options, allowedSourceUrls: story.sources.map((source) => source.url) };
  const withStoryQa = validateNewsroomDraft(withStory, sourceOptions);
  assert.equal(withStoryQa.status, "passed", JSON.stringify(withStoryQa.issues));
  withStory.desks.ai.story.sources[0].retrievedAt = "2026-09-12T05:00:01.000Z";
  assert.ok(validateNewsroomDraft(withStory, sourceOptions).issues.some((issue) => issue.code === "SOURCE_RETRIEVED_AFTER_GENERATION"));
  let requests = 0;
  await runNewsroomQa(withStory, { ...sourceOptions, historicalPreviewAuthorization: {}, checkLinks: true,
    requestImpl: async () => { requests++; throw new Error("Unauthorized QA must not request links"); },
    lookupImpl: async () => { requests++; throw new Error("Unauthorized QA must not resolve links"); } });
  assert.equal(requests, 0);
  for (const mutate of [
    (draft) => { draft.provenance.personalFreeResearch.historicalPreview.revision = "other"; },
    (draft) => { delete draft.provenance.personalFreeResearch.historicalPreview; },
    (draft) => { draft.provenance.personalFreeResearch.runMode = "same_day_backfill"; },
    (draft) => { draft.provenance.personalFreeResearch.runMode = "same_day_backfill"; delete draft.provenance.personalFreeResearch.historicalPreview; },
    (draft) => { draft.provenance.sourceCheck.checkedAt = "2026-09-12T04:59:59.000Z"; },
  ]) { const altered = structuredClone(candidate); mutate(altered); assert.throws(() => validatePersonalFreeCandidate(altered)); }
});

test("forged and expired permission fails personal generation before research or credentials", async () => {
  const token = authorizeHistoricalPreview(env, NOW);
  for (const options of [{ historicalPreviewAuthorization: {} }, { historicalPreviewAuthorization: { ...token } },
    { historicalPreviewAuthorization: token, now: EXPIRED }]) {
    await assert.rejects(generatePersonalFreeEdition({ editionDate: HISTORICAL_PREVIEW.editionDate,
      runMode: HISTORICAL_PREVIEW.runMode, env: {}, now: NOW, ...options }), /authorization is closed/);
  }
  await assert.rejects(draftFreeEditionWithHealth({ editionDate: HISTORICAL_PREVIEW.editionDate,
    runMode: HISTORICAL_PREVIEW.runMode, historicalPreviewAuthorization: token, now: NOW }), /private selected-slate/);
});
