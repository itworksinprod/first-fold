import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildFreeReportingWindow, draftFreeEdition, hasMixedReviewMetadata,
  validateMixedReviewMetadata, validateFreePilotProvenance } from "../scripts/automation/draft-free-edition.mjs";
import { EXPERIMENTAL_MIXED_REVIEW_PROFILE, GROUNDED_DIGEST_MODE } from "../scripts/automation/free/grounded-draft.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL,
  WORKERS_AI_PROVIDER, workersAiRunUrl } from "../scripts/automation/free/workers-ai.mjs";
import { FREE_FEED_SOURCES } from "../scripts/automation/free/feed-sources.mjs";
import { generatePersonalFreeEdition } from "../scripts/automation/personal-free-edition.mjs";
import { createEmptyPersonalStoryLedger } from "../scripts/automation/personal-story-ledger.mjs";
import { assertPersonalEmailCandidate, renderPersonalEditionEmail } from "../scripts/automation/personal-email.mjs";
import { validateCanonicalEdition } from "../scripts/edition-content.mjs";
import { groundedDraft, groundedEvidence } from "./fixtures/grounded-summary.mjs";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const automation = { runId: "24681012", repository: "itworksinprod/first-fold",
  runUrl: "https://github.com/itworksinprod/first-fold/actions/runs/24681012" };
const generatedAt = "2026-08-20T09:10:00.000Z";
const desks = ["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"];
const ids = ["candidate-synthetic-one", "candidate-synthetic-two"];
const storyIds = ids.map(id => `trusted-evidence-digest-${id}`);

// Synthetic receipt consistency fixtures only. Passing this validator does not
// establish that inference ran or that any provider approved a real news item.
function receipt() {
  const stages = ["foundation", "composition", "review"].map((stage, index) => ({ stage,
    provider: WORKERS_AI_PROVIDER, model: index === 2 ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL,
    requestSha256: hash({ syntheticRequest: stage }), responseSha256: hash({ syntheticResponse: stage }) }));
  return { provider: WORKERS_AI_PROVIDER, model: DEFAULT_CLOUDFLARE_AI_MODEL,
    inference: "workers-ai", draftingMode: GROUNDED_DIGEST_MODE, privateSourceBriefs: true,
    candidateCount: 2, selectedStoryCount: 2, stages,
    requestSha256: hash(stages.map(({ stage, provider, model, requestSha256 }) => ({ stage, provider, model, requestSha256 }))),
    responseSha256: hash(stages.map(({ stage, provider, model, responseSha256 }) => ({ stage, provider, model, responseSha256 }))),
    semanticReview: { provider: WORKERS_AI_PROVIDER, model: FREE_REASONING_WRITER_MODEL,
      profile: EXPERIMENTAL_MIXED_REVIEW_PROFILE, requestCount: 1, requestedOutputTokens: 8_000,
      requestSha256: stages[2].requestSha256, responseSha256: stages[2].responseSha256,
      approvedCandidateIds: [...ids] } };
}

function candidate() {
  return { status: "validated", editionDate: "2026-08-20",
    publication: { generatedAt, publishAt: "2026-08-20T10:00:00.000Z", publishedAt: null },
    reportingWindow: buildFreeReportingWindow("2026-08-20", { lookbackHours: 24 }),
    desks: Object.fromEntries(desks.map((desk, index) => [desk, { desk,
      story: index < 2 ? { id: storyIds[index] } : null }])),
    provenance: { freePilot: { ...receipt(), workflow: "free-morning-press", ...automation,
      runMode: "on_time", generatedAt, feedSourceCount: 8, successfulFeedSourceCount: 8, coveredDeskCount: 4,
      draftSelectedSlate: true, maxResearchAttempts: 1, researchRetryBelowStoryCount: 0,
      researchAttemptCount: 1, researchRetryOutcome: "not-needed", evidencePolicy: "authoritative-or-corroborated",
      requiredStoryCount: 2, lookbackHours: 24, minimumScore: 70, minimumAuthoritativeScore: 70,
      responseId: "synthetic-composition-response", feedSnapshotSha256: hash({ synthetic: "feed-snapshot" }) },
    sourceCheck: { status: "passed", checkedAt: generatedAt, checkedSourceCount: 4, issues: [] } } };
}

test("mixed receipt preserves distinct Llama writer and GPT-OSS review bindings without comparing candidate IDs to story IDs", () => {
  const value = receipt();
  const original = structuredClone(value);
  assert.equal(hasMixedReviewMetadata(value), true);
  assert.equal(validateMixedReviewMetadata(value, storyIds), true);
  assert.equal(validateMixedReviewMetadata(value, [...storyIds].reverse()), true);
  assert.equal(validateMixedReviewMetadata(value, ids), false);
  assert.deepEqual(value, original);
  assert.equal(value.model, DEFAULT_CLOUDFLARE_AI_MODEL);
  assert.equal(value.semanticReview.model, FREE_REASONING_WRITER_MODEL);
  assert.deepEqual(value.stages.map(stage => stage.stage), ["foundation", "composition", "review"]);
  assert.equal(validateFreePilotProvenance(candidate(), automation), true);
});

test("mixed story bindings accept only known baseline prefixes and cover each approved candidate exactly once", () => {
  const briefIds = ids.map(id => `trusted-evidence-brief-${id}`);
  assert.equal(validateMixedReviewMetadata(receipt(), briefIds), true);
  assert.equal(validateMixedReviewMetadata(receipt(), [briefIds[0], storyIds[1]]), true);
  for (const invalidIds of [[storyIds[0], briefIds[0]], [briefIds[1], storyIds[1]],
    [storyIds[0], `unreviewed-brief-${ids[1]}`],
    [storyIds[0], `trusted-evidence-brief-trusted-evidence-digest-${ids[1]}`]]) {
    assert.equal(validateMixedReviewMetadata(receipt(), invalidIds), false);
  }
});

test("mixed provenance rejects forged models, stages, hashes, profile, count, budget and approval IDs", () => {
  for (const mutate of [
    value => { value.provider = "different-provider"; },
    value => { value.model = FREE_REASONING_WRITER_MODEL; },
    value => { value.inference = "local-ai"; },
    value => { value.draftingMode = "trusted-evidence-digest"; },
    value => { delete value.privateSourceBriefs; },
    value => { value.candidateCount = 3; },
    value => { value.selectedStoryCount = 1; },
    value => { value.stages = undefined; },
    value => { value.stages = null; },
    value => { value.stages.pop(); },
    value => { value.stages.push(structuredClone(value.stages[2])); },
    value => { value.stages.reverse(); },
    value => { value.stages[1].stage = "foundation"; },
    value => { value.stages[0].model = FREE_REASONING_WRITER_MODEL; },
    value => { value.stages[2].model = DEFAULT_CLOUDFLARE_AI_MODEL; },
    value => { value.stages[2].provider = "paid-openai"; },
    value => { value.stages[0].requestSha256 = "uppercase-invalid"; },
    value => { value.stages[0].responseSha256 = "f".repeat(64); },
    value => { value.stages[0].extra = true; },
    value => { value.requestSha256 = "f".repeat(64); },
    value => { value.responseSha256 = "f".repeat(64); },
    value => { value.semanticReview = null; },
    value => { value.semanticReview = undefined; },
    value => { delete value.semanticReview; },
    value => { value.semanticReview.provider = "different-provider"; },
    value => { value.semanticReview.model = DEFAULT_CLOUDFLARE_AI_MODEL; },
    value => { value.semanticReview.profile = "explicit-claim-verdicts-v1"; },
    value => { value.semanticReview.requestCount = 2; },
    value => { value.semanticReview.requestCount = "1"; },
    value => { value.semanticReview.requestedOutputTokens = 4_000; },
    value => { value.semanticReview.requestedOutputTokens = 8_001; },
    value => { value.semanticReview.requestSha256 = value.stages[0].requestSha256; },
    value => { value.semanticReview.responseSha256 = value.stages[0].responseSha256; },
    value => { value.semanticReview.approvedCandidateIds = [ids[0]]; },
    value => { value.semanticReview.approvedCandidateIds = [ids[0], ids[0]]; },
    value => { value.semanticReview.approvedCandidateIds = [ids[0], "candidate-not-selected"]; },
    value => { value.semanticReview.approvedCandidateIds = [...storyIds]; },
    value => { value.semanticReview.approvedCandidateIds = [ids[0], " "]; },
    value => { value.semanticReview.approvedCandidateIds = [ids[0], null]; },
    value => { value.semanticReview.approved = true; },
  ]) {
    const value = receipt(); mutate(value);
    assert.equal(hasMixedReviewMetadata(value), true);
    assert.equal(validateMixedReviewMetadata(value, storyIds), false);
    const stored = candidate(); mutate(stored.provenance.freePilot);
    assert.throws(() => validateFreePilotProvenance(stored, automation));
  }
  for (const invalidIds of [[], [storyIds[0], storyIds[0]], [storyIds[0], "invented-story"], ids, null]) {
    assert.equal(validateMixedReviewMetadata(receipt(), invalidIds), false);
  }
});

test("partial Cloudflare markers fail closed while ordinary default and local-only receipts retain their existing paths", () => {
  for (const extra of [{ stages: null }, { stages: undefined }, { semanticReview: null }, { semanticReview: undefined },
    { semanticReview: { profile: EXPERIMENTAL_MIXED_REVIEW_PROFILE } }]) {
    const value = { provider: WORKERS_AI_PROVIDER, ...extra };
    assert.equal(hasMixedReviewMetadata(value), true);
    assert.equal(validateMixedReviewMetadata(value, storyIds), false);
  }
  const local = { provider: "local-ollama", model: "qwen3:30b-a3b",
    semanticReview: { provider: "local-ollama", model: "qwen3:30b-a3b", requestCount: 1 } };
  assert.equal(hasMixedReviewMetadata(local), false);
  assert.equal(hasMixedReviewMetadata({ ...local, stages: [] }), true);
  assert.equal(validateMixedReviewMetadata({ ...local, stages: [] }, storyIds), false);
  for (const model of [DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL]) {
    const ordinary = candidate();
    delete ordinary.provenance.freePilot.stages;
    delete ordinary.provenance.freePilot.semanticReview;
    ordinary.provenance.freePilot.model = model;
    assert.equal(hasMixedReviewMetadata(ordinary.provenance.freePilot), false);
    assert.equal(validateFreePilotProvenance(ordinary, automation), true);
  }
});

test("mixed profile remains an explicit grounded/default-Llama opt-in checked before any research or inference", async () => {
  let calls = 0;
  for (const override of [{ groundedReviewProfile: "unknown-profile" }, { groundedSummaries: false },
    { model: FREE_REASONING_WRITER_MODEL }]) {
    await assert.rejects(draftFreeEdition({ draftSelectedSlate: true, trustedEvidenceDigestOnly: true,
      groundedSummaries: true, maxModelRequests: 7, model: DEFAULT_CLOUDFLARE_AI_MODEL,
      groundedReviewProfile: EXPERIMENTAL_MIXED_REVIEW_PROFILE,
      researchImpl: async () => { calls++; }, aiRequestImpl: async () => { calls++; }, ...override,
    }), /Explicit claim review requires/);
  }
  assert.equal(calls, 0);
  const priorEdition = JSON.parse(await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url), "utf8"));
  await assert.rejects(draftFreeEdition({ editionDate: "2026-08-20", priorEditions: [priorEdition],
    policyText: "Synthetic policy", promptText: "Synthetic prompt", automation,
    now: generatedAt, draftSelectedSlate: true, trustedEvidenceDigestOnly: true,
    groundedSummaries: true, maxModelRequests: 7, model: DEFAULT_CLOUDFLARE_AI_MODEL,
    groundedReviewProfile: EXPERIMENTAL_MIXED_REVIEW_PROFILE,
    researchImpl: async () => { calls++; throw new Error("SYNTHETIC_RESEARCH_BOUNDARY"); },
    aiRequestImpl: async () => { throw new Error("MUST_NOT_INFER"); },
  }), /SYNTHETIC_RESEARCH_BOUNDARY/);
  assert.equal(calls, 1);
});

test("real personal selected-slate concise generation retains mixed provenance through all three native calls and final rendering", async (t) => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "first-fold-mixed-integration-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, "content", "editions"), { recursive: true });
  await mkdir(path.join(projectRoot, "lib", "editorial", "prompts"), { recursive: true });
  await writeFile(path.join(projectRoot, "content", "editions", "2026-08-19.json"),
    await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url)));
  for (const file of ["policy", "daily-run"]) await writeFile(
    path.join(projectRoot, "lib", "editorial", "prompts", `${file}.ts`), "Synthetic test policy.\n");
  const desk = "security-and-privacy";
  const publisherKey = "synthetic-cert-advisory";
  const dossier = {
    candidateId: groundedDraft.candidateId, canonicalEventKey: "synthetic-aomei-driver-2026-08-20",
    suggestedDesk: desk, primaryEntity: "AOMEI Backupper", aiAdjacent: false,
    maturity: "verified-development", title: groundedEvidence.title,
    eventAt: groundedEvidence.publishedAt, firstPublishedAt: groundedEvidence.publishedAt,
    materiallyUpdatedAt: null, verifiedFacts: [groundedEvidence.summary],
    feedEvidence: [groundedEvidence], unresolvedQuestions: [],
    sources: [
      { id: groundedEvidence.sourceId, title: groundedEvidence.title, publisher: groundedEvidence.publisher,
        publisherKey, url: "https://example.com/security/advisory", relationship: "originating",
        publishedAt: groundedEvidence.publishedAt, retrievedAt: generatedAt },
      { id: "cert-feed-context", title: "CERT/CC feed index", publisher: groundedEvidence.publisher,
        publisherKey, url: "https://example.com/security/feed.xml", relationship: "context",
        publishedAt: groundedEvidence.publishedAt, retrievedAt: generatedAt },
    ],
    ranking: { score: 80, version: "editorial-v1",
      components: { materialityNewsworthiness: 24, deskRelevance: 18, sourceStrength: 16,
        readerUsefulnessActionability: 12, freshness: 10 },
      componentMaximums: { materialityNewsworthiness: 30, deskRelevance: 20, sourceStrength: 20,
        readerUsefulnessActionability: 15, freshness: 15 },
      editorialValidation: { decision: "accepted", requiredScore: 70, rejectionReasons: [] },
      eligibility: "new-development", corroborated: false, evidenceTier: "authoritative-single",
      itemSourceCount: 1, publisherCount: 1, publisherKeys: [publisherKey] },
  };
  const research = {
    reportingWindow: buildFreeReportingWindow("2026-08-20", { lookbackHours: 72 }),
    retrievedAt: generatedAt, candidates: [dossier], selectedCandidates: [dossier],
    desks: Object.fromEntries(desks.map(key => [key, { desk: key,
      candidates: key === desk ? [dossier] : [], selectedCandidate: key === desk ? dossier : null,
      emptyReason: key === desk ? null : `No qualifying ${key} development was selected.` }])),
    diagnostics: { sourceResults: FREE_FEED_SOURCES.map(source => ({ sourceId: source.id,
      publisherKey: source.publisherKey, status: "ok", code: null, message: null,
      itemCount: 1, parsedItemCount: 1, eligibleItemCount: 0 })),
    eligibleItemCount: 1, candidateCount: 1, selectedCount: 1 },
    sourceTextTrust: "untrusted", citationUrlAllowlist: dossier.sources.map(source => source.url).sort(),
  };
  const accountId = "a".repeat(32);
  const apiToken = "synthetic-mixed-personal-test-token";
  const requests = [];
  let researchCalls = 0;
  let freeCandidate;
  const result = await generatePersonalFreeEdition({ editionDate: "2026-08-20", projectRoot,
    env: { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_AI_API_TOKEN: apiToken,
      GITHUB_RUN_ID: automation.runId, GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: automation.repository }, now: generatedAt, feedSources: FREE_FEED_SOURCES,
    personalStoryLedger: createEmptyPersonalStoryLedger({ fingerprintKey: apiToken }),
    researchImpl: async options => { researchCalls++; assert.equal(options.enrichArticles, true); return research; },
    // Use the ordinary personal options, opt into only the experimental profile,
    // and retain the real native adapter, actual generator and adaptation gates.
    draftFreeEditionImpl: async options => {
      assert.equal(options.draftSelectedSlate, true);
      assert.equal(options.trustedEvidenceDigestOnly, true);
      assert.equal(options.groundedSummaries, true);
      freeCandidate = await draftFreeEdition({ ...options,
        groundedReviewProfile: EXPERIMENTAL_MIXED_REVIEW_PROFILE });
      return freeCandidate;
    },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      const index = requests.length;
      requests.push({ url, body });
      assert.ok(index < 3, "No fourth model request is allowed");
      assert.equal(url, workersAiRunUrl(accountId,
        index === 2 ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL));
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "error");
      let payload;
      if (index === 0) payload = { foundations: [{ candidateId: groundedDraft.candidateId,
        claims: groundedDraft.claims }] };
      else if (index === 1) payload = { copies: [{ candidateId: groundedDraft.candidateId,
        headline: groundedDraft.headline, deck: groundedDraft.deck,
        whyItMatters: groundedDraft.whyItMatters, whatToDoOrWatch: groundedDraft.whatToDoOrWatch }] };
      else payload = { reviews: JSON.parse(body.messages[1].content).drafts.map(({ draft, draftSha256, claimEvidence }) => ({
        candidateId: draft.candidateId, draftSha256,
        claimVerdicts: claimEvidence.map(({ claimIndex, claimSha256 }) => ({ claimIndex, claimSha256,
          allCitedPassagesSupport: true })),
        factsSupported: true, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true,
        rejections: [],
      })) };
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload) } }),
        { status: 200, headers: { "content-type": "application/json", "cf-ray": `synthetic-stage-${index}` } });
    },
    sourceLookupImpl: async () => [{ address: "93.184.216.34" }],
    sourceRequestImpl: async () => ({ status: 200, headers: {} }), sleepImpl: async () => {},
  });
  assert.equal(researchCalls, 2);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map(request => request.body.max_tokens), [2_000, 4_000, 8_000]);
  const story = result.desks[desk].story;
  assert.equal(story.id, `trusted-evidence-brief-${groundedDraft.candidateId}`);
  assert.equal(story.headline, groundedDraft.headline);
  assert.deepEqual(story.evidence.map(item => item.id), [0, 1].map(index => `${story.id}-grounded-${index}`));
  assert.deepEqual(story.evidence.map(item => item.statement), groundedDraft.claims.map(claim => claim.text));
  assert.equal(validateFreePilotProvenance(freeCandidate, automation), true);
  const meta = result.provenance.personalFreeResearch;
  assert.equal(validateMixedReviewMetadata(meta, [story.id]), true);
  assert.equal(meta.model, DEFAULT_CLOUDFLARE_AI_MODEL);
  assert.equal(meta.semanticReview.model, FREE_REASONING_WRITER_MODEL);
  assert.deepEqual(meta.stages, freeCandidate.provenance.freePilot.stages);
  assert.deepEqual(meta.semanticReview, freeCandidate.provenance.freePilot.semanticReview);
  assert.equal(validateCanonicalEdition(result).valid, true);
  assert.doesNotThrow(() => assertPersonalEmailCandidate(result));
  const rendered = renderPersonalEditionEmail(result);
  assert.ok(rendered.html.includes(groundedDraft.headline));
  assert.ok(rendered.text.includes(groundedDraft.whyItMatters));
});
