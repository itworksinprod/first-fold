import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { previewEvidenceHolds } from "../scripts/automation/free/preview-evidence-gate.mjs";
import { previewFreshGemini, selectPreviewReadyCandidates } from "../scripts/automation/preview-fresh-gemini.mjs";
import { openDiagnostic } from "../scripts/automation/private-writer-diagnostic.mjs";
import { groundedEvidence } from "./fixtures/grounded-summary.mjs";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
const key = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const window = { startInclusive: "2026-09-14T00:00:00Z", endExclusive: "2026-09-17T00:00:00Z" };
const strictEvidence = () => ({ ...groundedEvidence, publishedAt: "2026-09-15T12:00:00Z",
  articleExcerpt: groundedEvidence.summary.split(/(?<=[.]) /u).join("\n"),
  articleBlocks: groundedEvidence.summary.split(/(?<=[.]) /u),
  articleExtraction: { version: "structured-preview-v1", status: "usable", holds: [], identity: {
    requestedUrl: "https://example.com/2026/09/advisory", finalUrl: "https://example.com/2026/09/advisory",
    title: groundedEvidence.title, bodySha256: "a".repeat(64), retrievedAt: "2026-09-16T12:00:00Z" } } });
const candidate = () => ({ candidateId: "test", primaryEntity: "Example", canonicalEventKey: "example-event",
  firstPublishedAt: "2026-09-15T12:00:00Z", suggestedDesk: "work-and-tools", ranking: { score: 77, evidenceTier: "authoritative-single" },
  sources: [{ url: "https://example.com/2026/09/article", publisher: "Example" }] });
const dossier = () => ({ candidateId: "test", sources: [{ publishedAt: "2026-09-15T12:00:00Z",
  text: "First complete fact. Second complete fact.", passages: [{ text: "First complete fact." }, { text: "Second complete fact." }] }] });
test("preview gate holds damaged extraction and unresolved URL dates, not just low scores", () => {
  assert.deepEqual(previewEvidenceHolds(candidate(), dossier(), window), []);
  const damaged = dossier(); damaged.sources[0].text = "vers:intdot/ Update to V3";
  assert.ok(previewEvidenceHolds(candidate(), damaged, window).includes("EVIDENCE_EXTRACTION_INCOMPLETE"));
  const dated = candidate(); dated.sources[0].url = "https://example.com/2026/06/article";
  assert.ok(previewEvidenceHolds(dated, dossier(), window).includes("URL_DATE_NEEDS_VERIFICATION"));
  const invalid = candidate(); invalid.sources[0].url = "javascript:alert(1)";
  assert.ok(previewEvidenceHolds(invalid, dossier(), window).includes("SOURCE_URL_INVALID"));
  const stale = dossier(); stale.sources[0].publishedAt = "2020-01-01";
  assert.ok(previewEvidenceHolds(candidate(), stale, window).includes("SOURCE_DATE_REVIEW"));
});
test("invalid encryption key and absent billing confirmation prevent research", async () => {
  const researchImpl = () => assert.fail("must not research");
  await assert.rejects(previewFreshGemini({ publicKey: "invalid", researchImpl }));
  await assert.rejects(previewFreshGemini({ publicKey: key, researchImpl }));
});
test("empty selection is encrypted and never claimed as a successful paper", async () => {
  const result = await previewFreshGemini({ publicKey: key, apiKey: "synthetic-test-key-not-real",
    freeProjectConfirmation: "FREE PROJECT BILLING DISABLED", now: new Date(window.endExclusive),
    researchImpl: async () => ({ selectedCandidates: [], diagnostics: { sourceResults: [] } }),
    coverageImpl: () => {}, draftImpl: () => assert.fail("must not draft") });
  assert.equal(result.report.status, "no-reviewable-drafts");
  assert.equal(result.report.approved, false);
  assert.equal(result.report.emailRequests, 0);
  assert.equal(openDiagnostic(result.sealed, privateKey).purpose, "fresh-news-unapproved-human-review-not-an-edition");
  assert.doesNotMatch(JSON.stringify(result.sealed), /synthetic-test|records/);
});
test("legacy article excerpts cannot enter a strict preview or reach the writer", async () => {
  const evidence = { ...groundedEvidence, publishedAt: "2026-09-15T12:00:00Z", articleExcerpt: groundedEvidence.summary };
  const legacy = { ...candidate(), feedEvidence: [evidence], sources: [{ id: evidence.sourceId,
    publisher: evidence.publisher, title: evidence.title, relationship: "originating", publishedAt: evidence.publishedAt, url: "https://example.com/advisory" }] };
  const result = await previewFreshGemini({ publicKey: key, apiKey: "synthetic-test-key-not-real",
    freeProjectConfirmation: "FREE PROJECT BILLING DISABLED", now: new Date(window.endExclusive),
    researchImpl: async options => {
      assert.equal(options.articleEvidenceMode, "structured-preview");
      return { selectedCandidates: [legacy], diagnostics: { sourceResults: [{ status: "ok" }] } };
    }, coverageImpl: () => {}, draftImpl: () => assert.fail("legacy evidence must not reach a writer") });
  assert.equal(result.report.modelRequests, 0); assert.equal(result.report.draftCount, 0);
  const packet = openDiagnostic(result.sealed, privateKey);
  assert.ok(packet.preDraftHolds[0].reasons.includes("USABLE_STRUCTURED_ARTICLE_REQUIRED"));
});
test("fresh workflow has no email credentials or plaintext artifact upload", async () => {
  const workflow = await readFile(new URL("../.github/workflows/gemini-fresh-human-preview.yml", import.meta.url), "utf8");
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /fresh-preview\.encrypted\.json/);
  assert.doesNotMatch(workflow, /RESEND|OPENAI|CLOUDFLARE|schedule:|contents: write/);
});
test("eligible draft is retained only in ciphertext and quota failure stops remaining models", async () => {
  const evidence = strictEvidence();
  const first = { ...candidate(), feedEvidence: [evidence],
    sources: [{ id: "cert-advisory", title: evidence.title, publisher: "CERT/CC", relationship: "originating",
      publishedAt: evidence.publishedAt, url: "https://example.com/2026/09/advisory" }] };
  const second = { ...first, candidateId: "second", primaryEntity: "Second", canonicalEventKey: "second-event", suggestedDesk: "security-and-privacy" };
  for (const quota of [false, true]) {
    let calls = 0;
    const result = await previewFreshGemini({ publicKey: key, apiKey: "synthetic-test-key-not-real",
      freeProjectConfirmation: "FREE PROJECT BILLING DISABLED", now: new Date(window.endExclusive),
      researchImpl: async () => ({ selectedCandidates: [first, second], diagnostics: { sourceResults: [{ status: "ok" }] } }),
      coverageImpl: () => {}, draftImpl: async () => { calls++; return quota
        ? { report: { status: "failed", code: "GEMINI_FREE_QUOTA_EXHAUSTED" }, html: null }
        : { report: { status: "human-review-required", approved: false }, html: "UNAPPROVED TEST COPY" }; } });
    assert.equal(calls, quota ? 1 : 2);
    assert.equal(result.report.draftCount, quota ? 0 : 2);
    const packet = openDiagnostic(result.sealed, privateKey);
    if (quota) assert.ok(packet.records[1].holds.includes("MODEL_REQUESTS_STOPPED"));
    else assert.equal(packet.records[0].result.html, "UNAPPROVED TEST COPY");
    assert.doesNotMatch(JSON.stringify(result), /UNAPPROVED TEST COPY|synthetic-test-key/);
  }
});
test("held top choice yields to an already-qualified reserve without duplicating desks or entities", () => {
  const evidence = { ...groundedEvidence, publishedAt: "2026-09-15T12:00:00Z" };
  const reserve = { ...candidate(), candidateId: "reserve", feedEvidence: [evidence],
    sources: [{ id: "cert-advisory", title: evidence.title, publisher: "CERT/CC", relationship: "originating",
      publishedAt: evidence.publishedAt, url: "https://example.com/2026/09/advisory" }] };
  const broken = structuredClone(reserve);
  broken.candidateId = "broken"; broken.ranking.score = 90;
  broken.feedEvidence[0].articleExcerpt = "Incomplete version details: vers:intdot/ Update to V3";
  const duplicate = { ...reserve, candidateId: "same-entity", suggestedDesk: "security-and-privacy" };
  const low = { ...reserve, candidateId: "low", primaryEntity: "Other", suggestedDesk: "ai",
    ranking: { ...reserve.ranking, score: 69 } };
  assert.equal(selectPreviewReadyCandidates({ candidates: [broken, reserve] }, window).selectedCandidates[0].candidateId, "reserve");
  const result = selectPreviewReadyCandidates({ selectedCandidates: [broken], candidates: [broken, reserve, duplicate, low] }, window);
  assert.equal(result.selectedCandidates.length, 1);
  assert.ok(["reserve", "same-entity"].includes(result.selectedCandidates[0].candidateId));
  assert.deepEqual(result.held.map(h => h.candidateId), ["broken", "low"]);
});
test("one targeted repair per story shares the four-call ceiling and cannot loop", async () => {
  const evidence = strictEvidence();
  const first = { ...candidate(), feedEvidence: [evidence],
    sources: [{ id: "cert-advisory", title: evidence.title, publisher: "CERT/CC", relationship: "originating",
      publishedAt: evidence.publishedAt, url: "https://example.com/2026/09/advisory" }] };
  const desks = ["work-and-tools", "security-and-privacy", "ai", "platforms-and-power"];
  for (const count of [2, 4]) {
    let calls = 0, repairs = 0;
    const candidates = desks.slice(0, count).map((desk, i) => ({ ...first, candidateId: `c${i}`,
      canonicalEventKey: `event-${i}`, primaryEntity: `entity-${i}`, suggestedDesk: desk }));
    const result = await previewFreshGemini({ publicKey: key, apiKey: "synthetic-test-key-not-real",
      freeProjectConfirmation: "FREE PROJECT BILLING DISABLED", now: new Date(window.endExclusive),
      researchImpl: async () => ({ candidates, diagnostics: { sourceResults: [] } }), coverageImpl: () => {},
      draftImpl: async ({ repair }) => { calls++; if (repair) repairs++;
        return { report: { status: "failed", code: "GEMINI_EDITORIAL_VALIDATION_FAILED" }, html: null,
          rejectedDiagnostic: { unapproved: true, rejectionDetails: [{ reason: "ORIGINALITY" }] } }; } });
    assert.equal(calls, 4);
    assert.equal(repairs, count === 2 ? 2 : 0);
    assert.equal(result.report.modelRequests, 4);
    assert.equal(result.report.draftCount, 0);
  }
});
