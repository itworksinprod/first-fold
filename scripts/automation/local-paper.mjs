// Explicit local preview only. No email credentials, cloud inference, scheduling,
// public edition, or daily repeat-ledger writes are available in this process.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildEditionDraft } from "../new-edition.mjs";
import { validateCanonicalEdition } from "../edition-content.mjs";
import { collectFreeResearchSnapshot, FREE_DESKS } from "./free/feed-engine.mjs";
import { FREE_FEED_SOURCES } from "./free/feed-sources.mjs";
import { buildFreeReportingWindow, assertFreeResearchCoverage,
  normalizeFreeEditorialAgainstCandidates } from "./draft-free-edition.mjs";
import { buildTrustedEvidenceDigestPayload } from "./free/evidence-digest.mjs";
import { synthesizeGroundedEditorial } from "./free/grounded-draft.mjs";
import { LOCAL_AI_MODEL, requestLocalAiEditorial } from "./free/local-ai.mjs";
import { LOCAL_PREVIEW, isLocalPreviewWindow } from "./local-preview-policy.mjs";
import { buildSourceUrlAllowlist, runNewsroomQa } from "./newsroom-qa.mjs";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = code => Object.assign(new Error(code), { code });
function assertDate(now) {
  if (!isLocalPreviewWindow(now)) throw fail("LOCAL_PREVIEW_CLOSED");
}

export function localInferenceTask(request, input = {}) {
  const properties = request?.schema?.properties ?? {};
  if (properties.reviews) return "review";
  if (properties.foundationSha256 && properties.claimSupport) return "claims-audit";
  if (properties.claims && properties.candidateId) return input.rejectionCode ? "claims-only-repair" : "claims-draft";
  if (["headline", "deck", "whyItMatters", "whatToDoOrWatch"].every(key => Object.hasOwn(properties, key))) {
    return "copy-refinement";
  }
  return input.rejected ? "repair" : "draft";
}

export async function researchLocalPaper({ now = new Date(), researchImpl = collectFreeResearchSnapshot } = {}) {
  assertDate(now);
  const reportingWindow = buildFreeReportingWindow(LOCAL_PREVIEW.editionDate, { lookbackHours: 72 });
  const snapshot = await researchImpl({ reportingWindow, retrievedAt: now.toISOString(),
    enrichArticles: true, evidencePolicy: "authoritative-or-corroborated",
    minimumScore: 70, minimumAuthoritativeScore: 70 });
  assertFreeResearchCoverage(snapshot, { feedSources: FREE_FEED_SOURCES,
    reportingWindow, retrievedAt: now.toISOString() });
  return snapshot;
}

export async function draftLocalPaper(snapshot, { now = () => new Date(),
  synthesizeImpl = synthesizeGroundedEditorial, qaImpl = runNewsroomQa,
  onDiagnostic = () => {} } = {}) {
  const started = now();
  assertDate(started);
  const reportingWindow = buildFreeReportingWindow(LOCAL_PREVIEW.editionDate, { lookbackHours: 72 });
  const coverage = assertFreeResearchCoverage(snapshot, { feedSources: FREE_FEED_SOURCES,
    reportingWindow, retrievedAt: snapshot?.retrievedAt });
  if (!Number.isFinite(Date.parse(snapshot?.retrievedAt)) ||
      Date.parse(snapshot.retrievedAt) > started.getTime() ||
      started.getTime() - Date.parse(snapshot.retrievedAt) > 3_600_000) throw fail("LOCAL_RESEARCH_EXPIRED");
  const candidates = snapshot.selectedCandidates;
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 4 ||
      new Set(candidates.map(item => item.suggestedDesk)).size !== candidates.length ||
      candidates.some(item => item.ranking?.score < 70 ||
        !["authoritative-single", "corroborated"].includes(item.ranking?.evidenceTier))) {
    throw fail("LOCAL_SELECTION_INVALID");
  }
  const generatedAt = started.toISOString();
  // Rebind source identity, desk, score and evidence metadata with the same
  // trusted normalizer before permitting any local-model prose to replace it.
  const baseline = normalizeFreeEditorialAgainstCandidates(buildTrustedEvidenceDigestPayload({ candidates,
    quietReasons: Object.fromEntries(FREE_DESKS.map(desk => [desk, snapshot.desks?.[desk]?.emptyReason])) }),
  candidates, generatedAt, { evidencePolicy: "authoritative-or-corroborated",
    requiredEventKeys: candidates.map(item => item.canonicalEventKey) });
  const grounded = await synthesizeImpl({ editorial: baseline, candidates,
    model: LOCAL_AI_MODEL, onDiagnostic });
  const stories = Object.values(grounded?.editorial?.desks ?? {}).flatMap(page => page.story ? [page.story] : []);
  const approved = grounded?.inference?.semanticReview?.approvedCandidateIds;
  if (!grounded || stories.length !== candidates.length ||
      !Array.isArray(approved) || approved.length !== candidates.length ||
      candidates.some(item => !approved.includes(item.candidateId)) ||
      candidates.some(item => grounded.editorial.desks[item.suggestedDesk]?.story?.id !==
        `trusted-evidence-digest-${item.candidateId}`) ||
      stories.some(story => !Array.isArray(story.evidence) || !story.evidence.length ||
        story.evidence.some(claim => !claim.id?.startsWith(`${story.id}-grounded-`)))) {
    throw fail("LOCAL_CHECKED_SUMMARIES_REQUIRED");
  }
  const latestEdition = JSON.parse(await readFile(new URL("../../content/editions/2026-08-19.json", import.meta.url), "utf8"));
  const scaffold = buildEditionDraft({ latestEdition, editionDate: LOCAL_PREVIEW.editionDate,
    issueNumber: latestEdition.issueNumber + 1 });
  const inference = grounded.inference;
  const candidate = { ...scaffold, status: "validated", reportingWindow,
    publication: { ...scaffold.publication, generatedAt, publishedAt: null },
    ...grounded.editorial, corrections: [],
    provenance: { ...scaffold.provenance, personalFreeResearch: {
      workflow: LOCAL_PREVIEW.workflow, runMode: LOCAL_PREVIEW.runMode,
      provider: inference.provider, model: inference.model, inference: inference.kind,
      draftingMode: "source-grounded-summary", researchMethod: "curated-live-feeds", generatedAt,
      feedSnapshotSha256: hash(snapshot), requestSha256: inference.requestSha256,
      responseSha256: inference.responseSha256, responseId: inference.responseId,
      feedSourceCount: coverage.sourceCount, successfulFeedSourceCount: coverage.successfulSourceCount,
      coveredDeskCount: FREE_DESKS.length, candidateCount: stories.length, selectedStoryCount: stories.length,
      evidencePolicy: "authoritative-or-corroborated", lookbackHours: 72,
      minimumScore: 70, minimumAuthoritativeScore: 70, maxModelRequests: 20,
      ephemeral: true, qualityPilotOrdinal: null,
      localPreview: { editionDate: LOCAL_PREVIEW.editionDate, requestedOn: LOCAL_PREVIEW.requestedOn,
        revision: LOCAL_PREVIEW.revision }, semanticReview: { ...inference.semanticReview,
        approvedStoryIds: stories.map(story => story.id) },
    }, sourceCheck: { status: "not-run", checkedAt: null, checkedSourceCount: 0, issues: [] } },
  };
  const checkedAt = now().toISOString();
  assertDate(new Date(checkedAt));
  const { sourceCheck } = await qaImpl(candidate, { checkedAt, checkLinks: true,
    allowedSourceUrls: buildSourceUrlAllowlist(candidates.flatMap(item => item.sources.map(source => source.url))),
    maxRedirects: 0, timeoutMs: 8_000, temporalMode: "local-requested-preview", priorEditions: [] });
  candidate.provenance.sourceCheck = sourceCheck;
  if (sourceCheck.status !== "passed") {
    onDiagnostic({ stage: "local-source-qa", codes: sourceCheck.issues.map(issue => issue.code) });
    throw fail("LOCAL_SOURCE_QA_FAILED");
  }
  const validation = validateCanonicalEdition(candidate);
  if (!validation.valid) {
    onDiagnostic({ stage: "local-canonical-validation", issues: validation.issues });
    throw fail("LOCAL_CANONICAL_VALIDATION_FAILED");
  }
  return candidate;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, input, output] = process.argv.slice(2);
    if (command === "research" && input && !output) {
      const snapshot = await researchLocalPaper();
      await writeFile(input, JSON.stringify(snapshot), { flag: "wx", mode: 0o600 });
      console.info(JSON.stringify({ status: "research-complete", selected: snapshot.selectedCandidates.map(item =>
        ({ desk: item.suggestedDesk, title: item.title, score: item.ranking.score })),
      sources: snapshot.diagnostics.sourceResults.filter(item => item.status === "ok").length,
      sourceCount: FREE_FEED_SOURCES.length, modelRequests: 0, emailSent: false }));
    } else if (command === "draft" && input && output) {
      const buffer = await readFile(input);
      if (buffer.length > 2_000_000) throw fail("LOCAL_RESEARCH_SIZE_LIMIT");
      const calls = [];
      let candidate;
      try {
        candidate = await draftLocalPaper(JSON.parse(buffer.toString("utf8")), {
          onDiagnostic: event => console.info(JSON.stringify(event)),
          synthesizeImpl: options => synthesizeGroundedEditorial({ ...options,
            aiRequestImpl: async request => {
              const call = { input: JSON.parse(request.messages[1].content) };
              calls.push(call);
              const callNumber = calls.length;
              const task = localInferenceTask(request, call.input);
              const startedAt = Date.now();
              console.info(JSON.stringify({ stage: "local-inference-start", call: callNumber, task }));
              try {
                const response = await requestLocalAiEditorial(request);
                call.editorialPayload = structuredClone(response.editorialPayload);
                call.usage = response.usage;
                console.info(JSON.stringify({ stage: "local-inference-complete", call: callNumber, task,
                  elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
                  completionTokens: response.usage.completion_tokens }));
                return response;
              } catch (error) {
                call.failure = { code: error.code, formatReason: error.formatReason };
                throw error;
              }
            },
          }),
        });
      } finally {
        // Public source packets and untrusted parsed drafts stay on this Mac;
        // never capture credentials, response envelopes or model thinking.
        await writeFile(`${output}.diagnostic.json`, JSON.stringify({ calls }), { flag: "wx", mode: 0o600 });
      }
      await writeFile(output, JSON.stringify(candidate), { flag: "wx", mode: 0o600 });
      console.info(JSON.stringify({ status: "local-checked-paper-ready", emailSent: false,
        stories: candidate.provenance.personalFreeResearch.selectedStoryCount }));
    } else throw fail("LOCAL_PAPER_ARGUMENTS_INVALID");
  } catch (error) {
    console.error(JSON.stringify({ code: /^[A-Z_]{1,64}$/.test(error?.code ?? "") ? error.code : "LOCAL_PAPER_FAILED" }));
    process.exitCode = 1;
  }
}
