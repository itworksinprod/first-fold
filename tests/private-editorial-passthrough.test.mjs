import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildFreeReportingWindow, draftFreeEdition } from "../scripts/automation/draft-free-edition.mjs";
import { EXPLICIT_CLAIM_REVIEW_PROFILE } from "../scripts/automation/free/explicit-claim-review.mjs";
import { EXPERIMENTAL_MIXED_REVIEW_PROFILE, EXPERIMENTAL_REASONING_PIPELINE_PROFILE } from
  "../scripts/automation/free/grounded-draft.mjs";
import { FREE_FEED_SOURCES } from "../scripts/automation/free/feed-sources.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, requestWorkersAiEditorial } from "../scripts/automation/free/workers-ai.mjs";
import { groundedDraft, groundedEvidence, dailyCopyParts } from "./fixtures/grounded-summary.mjs";

const now = "2026-08-20T09:10:00.000Z";
const priorEdition = JSON.parse(await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url), "utf8"));
const profiles = [EXPERIMENTAL_MIXED_REVIEW_PROFILE, EXPERIMENTAL_REASONING_PIPELINE_PROFILE];
const desk = "security-and-privacy";
const desks = ["ai", "work-and-tools", desk, "platforms-and-power"];

function researchFixture() {
  const publisherKey = "synthetic-cert-advisory";
  const dossier = { candidateId: groundedDraft.candidateId, canonicalEventKey: "synthetic-private-diagnostic-event",
    suggestedDesk: desk, primaryEntity: "AOMEI Backupper", aiAdjacent: false, maturity: "verified-development",
    title: groundedEvidence.title, eventAt: groundedEvidence.publishedAt, firstPublishedAt: groundedEvidence.publishedAt,
    materiallyUpdatedAt: null, verifiedFacts: [groundedEvidence.summary], feedEvidence: [groundedEvidence], unresolvedQuestions: [],
    sources: [
      { id: groundedEvidence.sourceId, title: groundedEvidence.title, url: "https://example.com/security/advisory", relationship: "originating" },
      { id: "cert-feed-context", title: "CERT/CC feed index", url: "https://example.com/security/feed.xml", relationship: "context" },
    ].map(source => ({ ...source, publisher: groundedEvidence.publisher, publisherKey,
      publishedAt: groundedEvidence.publishedAt, retrievedAt: now })),
    ranking: { score: 80, version: "editorial-v1", components: { materialityNewsworthiness: 24,
      deskRelevance: 18, sourceStrength: 16, readerUsefulnessActionability: 12, freshness: 10 },
      componentMaximums: { materialityNewsworthiness: 30, deskRelevance: 20, sourceStrength: 20,
        readerUsefulnessActionability: 15, freshness: 15 },
      editorialValidation: { decision: "accepted", requiredScore: 70, rejectionReasons: [] },
      eligibility: "new-development", corroborated: false, evidenceTier: "authoritative-single",
      itemSourceCount: 1, publisherCount: 1, publisherKeys: [publisherKey] },
  };
  return { reportingWindow: buildFreeReportingWindow("2026-08-20"), retrievedAt: now,
    candidates: [dossier], selectedCandidates: [dossier],
    desks: Object.fromEntries(desks.map(key => [key, { desk: key, candidates: key === desk ? [dossier] : [],
      selectedCandidate: key === desk ? dossier : null, emptyReason: key === desk ? null : `No qualifying ${key} development was selected.` }])),
    diagnostics: { sourceResults: FREE_FEED_SOURCES.map(source => ({ sourceId: source.id, publisherKey: source.publisherKey,
      status: "ok", code: null, message: null, itemCount: 1, parsedItemCount: 1, eligibleItemCount: 0 })),
      eligibleItemCount: 1, candidateCount: 1, selectedCount: 1 },
    sourceTextTrust: "untrusted", citationUrlAllowlist: dossier.sources.map(source => source.url).sort(),
  };
}

async function run(profile, hook) {
  const requests = [];
  const stages = [];
  const publicEvents = [];
  let researchCalls = 0;
  const candidate = await draftFreeEdition({ editionDate: "2026-08-20", priorEditions: [priorEdition],
    policyText: "Synthetic policy", promptText: "Synthetic prompt", now,
    automation: { runId: "24681012", repository: "itworksinprod/first-fold",
      runUrl: "https://github.com/itworksinprod/first-fold/actions/runs/24681012" },
    accountId: "a".repeat(32), apiToken: "synthetic-private-hook-token", model: DEFAULT_CLOUDFLARE_AI_MODEL,
    draftSelectedSlate: true, trustedEvidenceDigestOnly: true, groundedSummaries: true, maxModelRequests: 7,
    evidencePolicy: "authoritative-or-corroborated", groundedReviewProfile: profile,
    onPrivateEditorialDiagnostic: hook, onFreeDiagnostic: event => publicEvents.push(event),
    researchImpl: async options => {
      researchCalls++;
      assert.equal(Object.hasOwn(options, "onPrivateEditorialDiagnostic"), false);
      return researchFixture();
    },
    aiRequestImpl: async options => { stages.push(options); return requestWorkersAiEditorial(options); },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      const index = requests.length;
      requests.push({ url, body });
      let payload;
      if (index === 0) payload = { foundations: [{ candidateId: groundedDraft.candidateId, claims: groundedDraft.claims }] };
      else if (index === 1) payload = { copies: [{ candidateId: groundedDraft.candidateId,
        headline: groundedDraft.headline, deck: groundedDraft.deck, whyItMatters: dailyCopyParts(groundedDraft.whyItMatters),
        whatToDoOrWatch: dailyCopyParts(groundedDraft.whatToDoOrWatch) }] };
      else {
        assert.equal(index, 2);
        payload = { reviews: JSON.parse(body.messages[1].content).drafts.map(({ draft, draftSha256, claimEvidence }) => ({
          candidateId: draft.candidateId, draftSha256,
          ...(claimEvidence ? { claimVerdicts: claimEvidence.map(({ claimIndex, claimSha256 }) => ({
            claimIndex, claimSha256, allCitedPassagesSupport: true })) }
            : { claimSupport: draft.claims.map(claim => claim.supports.map(support => support.evidenceId)) }),
          factsSupported: true, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true,
          ...(profiles.includes(profile) ? { rejections: [] } : {}),
        })) };
      }
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload) } }),
        { headers: { "content-type": "application/json", "cf-ray": `synthetic-stage-${index}` } });
    },
    sourceLookupImpl: async () => [{ address: "93.184.216.34" }],
    sourceRequestImpl: async options => {
      assert.equal(Object.hasOwn(options, "onPrivateEditorialDiagnostic"), false);
      return { status: 200, headers: {} };
    },
    sleepImpl: async () => {},
  });
  return { candidate, requests, stages: stages.map(({ model, maxTokens, timeoutMs, maxAttempts }) =>
    ({ model, maxTokens, timeoutMs, maxAttempts })), publicEvents, researchCalls };
}

test("draft forwards private editorial diagnostics only for exact opt-in experimental profiles without changing outcomes", async () => {
  for (const profile of profiles) {
    const baseline = await run(profile);
    const packets = [];
    const captured = await run(profile, packet => packets.push(structuredClone(packet)));
    assert.deepEqual(packets.map(packet => packet.stage), ["assembled-drafts", "review-verdicts"]);
    assert.ok(packets.every(packet => packet.profile === profile));
    assert.deepEqual(captured, baseline);
    assert.equal(captured.researchCalls, 1);
    assert.equal(captured.requests.length, 3);
    assert.deepEqual(captured.stages.map(stage => stage.maxTokens), profile === EXPERIMENTAL_REASONING_PIPELINE_PROFILE
      ? [8_000, 8_000, 8_000] : [2_000, 4_000, 8_000]);
    assert.ok(!JSON.stringify(captured.publicEvents).includes(groundedDraft.claims[0].text));
    assert.ok(!JSON.stringify(captured.candidate.provenance).includes("assembled-drafts"));
    assert.deepEqual(await run(profile, () => { throw new Error("SYNTHETIC_PRIVATE_SINK_FAILURE"); }), baseline);
    assert.deepEqual(await run(profile, "not-a-function"), baseline);
  }
});

test("ordinary daily and explicit-Llama draft paths never invoke the private editorial hook", async () => {
  for (const profile of [undefined, EXPLICIT_CLAIM_REVIEW_PROFILE]) {
    let captures = 0;
    const baseline = await run(profile);
    const observed = await run(profile, () => { captures++; });
    assert.equal(captures, 0);
    assert.deepEqual(observed, baseline);
    assert.deepEqual(observed.stages.map(stage => stage.maxTokens), [2_000, 4_000, 1_800]);
  }
});
