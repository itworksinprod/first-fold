// Synthetic copy for offline delivery-gate tests. Never a researched live paper.
import { readFile } from "node:fs/promises";
import { buildFreeEditorialBaselines } from "./free-editorial-evals.mjs";
import { LOCAL_PREVIEW, localPreviewCandidateSha256 } from "../../scripts/automation/local-preview-policy.mjs";

const base = JSON.parse(await readFile(new URL("../../content/editions/2026-08-19.json", import.meta.url), "utf8"));
export const localPreviewTestNow = new Date("2026-09-14T02:30:00.000Z");
export function localPreviewTestCandidate() {
  const candidate = structuredClone(base);
  const { draft, id: candidateId } = buildFreeEditorialBaselines()[0];
  const id = `trusted-evidence-digest-${candidateId}`;
  const story = candidate.desks.ai.story;
  Object.assign(story, { id, canonicalEventKey: "synthetic-local-meridian", status: "new-development", priority: "notable",
    headline: draft.headline, deck: draft.deck, whatHappened: draft.claims.map(claim => claim.text).join(" "),
    whyItMatters: draft.whyItMatters, whatToDoOrWatch: draft.whatToDoOrWatch,
    timing: { eventAt: "2026-09-12T12:00:00.000Z", firstPublishedAt: "2026-09-12T12:00:00.000Z", materiallyUpdatedAt: null },
    editorial: { primaryEntity: "Synthetic Meridian Lab", aiAdjacent: true, maturity: "verified-development",
      deskFit: "Synthetic offline device-model fixture." },
    confidence: { level: "medium", rationale: "Synthetic vendor-only evidence for offline tests." },
    sources: [
      { id: "synthetic-source", publisher: "Synthetic Meridian Lab", title: "Synthetic local device model announcement",
        url: "https://openai.com/index/synthetic-local-preview/", relationship: "originating",
        publishedAt: "2026-09-12T12:00:00.000Z", retrievedAt: "2026-09-14T02:00:00.000Z" },
      { id: "synthetic-context", publisher: "Synthetic Meridian Lab", title: "Synthetic context index",
        url: "https://openai.com/news/rss.xml", relationship: "context",
        publishedAt: "2026-09-12T12:00:00.000Z", retrievedAt: "2026-09-14T02:00:00.000Z" },
    ],
    evidence: draft.claims.map((claim, index) => ({ id: `${id}-grounded-${index + 1}`,
      statement: claim.text, sourceIds: ["synthetic-source"], verification: "company-claimed" })),
    selection: { score: 80, selectedBecause: "Synthetic deployment change.", materialDelta: null,
      validationReceipt: { version: "editorial-v1", score: 80, requiredScore: 70,
        components: { materialityNewsworthiness: 25, deskRelevance: 17, sourceStrength: 16, readerUsefulnessActionability: 12, freshness: 10 },
        componentMaximums: { materialityNewsworthiness: 30, deskRelevance: 20, sourceStrength: 20, readerUsefulnessActionability: 15, freshness: 15 },
        evidenceTier: "authoritative-single", factualSourceCount: 1, publisherCount: 1 } },
  });
  candidate.status = "validated";
  candidate.editionDate = LOCAL_PREVIEW.editionDate;
  candidate.id = `first-fold-${LOCAL_PREVIEW.editionDate}`;
  candidate.reportingWindow = { ...candidate.reportingWindow,
    startInclusive: "2026-09-10T09:00:00.000Z", endExclusive: "2026-09-13T09:00:00.000Z" };
  Object.assign(candidate.publication, { generatedAt: "2026-09-14T02:00:00.000Z",
    publishAt: "2026-09-13T10:00:00.000Z", publishedAt: null });
  for (const [desk, page] of Object.entries(candidate.desks)) {
    if (desk !== "ai") Object.assign(page, { story: null, emptyReason: "No synthetic item was selected for this offline test." });
  }
  Object.assign(candidate.frontPage, { storyOrder: [id], leadStoryId: id, stopThePressesStoryId: null,
    estimatedMinutes: 2, note: "A synthetic local model story exercises the private preview gates." });
  candidate.backPage.watchNext = [];
  candidate.provenance.personalFreeResearch = {
    workflow: LOCAL_PREVIEW.workflow, runMode: LOCAL_PREVIEW.runMode, provider: LOCAL_PREVIEW.provider,
    model: LOCAL_PREVIEW.model, inference: "local-ai", draftingMode: "source-grounded-summary",
    researchMethod: "curated-live-feeds", generatedAt: candidate.publication.generatedAt,
    feedSnapshotSha256: "a".repeat(64), requestSha256: "b".repeat(64), responseSha256: "c".repeat(64),
    responseId: `local-${"d".repeat(64)}`, feedSourceCount: 48, successfulFeedSourceCount: 47,
    coveredDeskCount: 4, candidateCount: 1, selectedStoryCount: 1, evidencePolicy: "authoritative-or-corroborated",
    lookbackHours: 72, minimumScore: 70, minimumAuthoritativeScore: 70, maxModelRequests: 12,
    ephemeral: true, qualityPilotOrdinal: null,
    localPreview: { editionDate: LOCAL_PREVIEW.editionDate, requestedOn: LOCAL_PREVIEW.requestedOn, revision: LOCAL_PREVIEW.revision },
    semanticReview: { provider: LOCAL_PREVIEW.provider, model: LOCAL_PREVIEW.model,
      requestSha256: "e".repeat(64), responseSha256: "f".repeat(64), requestCount: 1,
      approvedCandidateIds: [candidateId], approvedStoryIds: [id] },
  };
  candidate.provenance.sourceCheck = { status: "passed", checkedAt: "2026-09-14T02:20:00.000Z", checkedSourceCount: 2, issues: [] };
  return candidate;
}
export function localPreviewTestEnv(candidate) {
  return { LOCAL_PREVIEW_CONFIRMATION: LOCAL_PREVIEW.confirmation,
    CANDIDATE_SHA256: localPreviewCandidateSha256(candidate), GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main", GITHUB_ACTOR: "itworksinprod",
    GITHUB_TRIGGERING_ACTOR: "itworksinprod", GITHUB_RUN_ATTEMPT: "1", GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/local-paper-preview.yml@refs/heads/main",
    GITHUB_RUN_ID: "123456789", GITHUB_SHA: "1".repeat(40) };
}
