import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { validateCanonicalEdition } from "../scripts/edition-content.mjs";
import { LOCAL_PREVIEW, authorizeLocalPreview, assertLocalPreviewAuthorization,
  isLocalPreviewRecord, isLocalPreviewTiming } from "../scripts/automation/local-preview-policy.mjs";
import { encodeLocalPreviewPayload, decodeLocalPreviewPayload } from "../scripts/automation/local-preview-payload.mjs";
import { assertPersonalEmailCandidate, renderPersonalEditionEmail, sendPersonalEditionEmail,
  sendPersonalEditionPreview } from "../scripts/automation/personal-email.mjs";
import { localPreviewTestCandidate, localPreviewTestEnv, localPreviewTestNow as now } from "./fixtures/local-preview.mjs";
import { malformedEmailStories } from "./fixtures/malformed-email-2026-09-11.mjs";
import { buildSourceUrlAllowlist, validateNewsroomDraft } from "../scripts/automation/newsroom-qa.mjs";
import { runLocalPaperPreview } from "../scripts/automation/local-paper-preview.mjs";
import { buildFreeEditorialBaselines } from "./fixtures/free-editorial-evals.mjs";
import { buildTrustedEvidenceDigestPayload } from "../scripts/automation/free/evidence-digest.mjs";
import { normalizeFreeEditorialAgainstCandidates } from "../scripts/automation/draft-free-edition.mjs";
import { synthesizeGroundedEditorial } from "../scripts/automation/free/grounded-draft.mjs";

const authorized = candidate => authorizeLocalPreview(localPreviewTestEnv(candidate), candidate, now);
const options = candidate => ({ localPreviewAuthorization: authorized(candidate), now });
test("local preview transport is bounded, canonical, digest-bound and excludes private fields", () => {
  const candidate = localPreviewTestCandidate();
  const payload = encodeLocalPreviewPayload(candidate);
  assert.deepEqual(decodeLocalPreviewPayload(payload.candidateGzipBase64, payload.candidateSha256), candidate);
  assert.throws(() => decodeLocalPreviewPayload(payload.candidateGzipBase64, "0".repeat(64)), { code: "LOCAL_PREVIEW_PAYLOAD_HASH" });
  assert.throws(() => decodeLocalPreviewPayload(`${payload.candidateGzipBase64}\n`, payload.candidateSha256));
  assert.throws(() => decodeLocalPreviewPayload("a".repeat(60_004), payload.candidateSha256));
  const oversized = Buffer.from(JSON.stringify({ copy: "x".repeat(300_000) }));
  assert.throws(() => decodeLocalPreviewPayload(gzipSync(oversized).toString("base64"), createHash("sha256").update(oversized).digest("hex")),
    { code: "LOCAL_PREVIEW_PAYLOAD_GZIP" });
  for (const value of [{ secret: "bad" }, { reasoning: "bad" }, { path: "/Users/test/private.json" }, { token: `re_${"x".repeat(30)}` }]) {
    assert.throws(() => encodeLocalPreviewPayload(value), { code: "LOCAL_PREVIEW_PAYLOAD_PRIVATE_FIELD" });
  }
  const poisoned = Buffer.from('{"__proto__":{"polluted":true}}');
  assert.throws(() => decodeLocalPreviewPayload(gzipSync(poisoned).toString("base64"), createHash("sha256").update(poisoned).digest("hex")),
    { code: "LOCAL_PREVIEW_PAYLOAD_PRIVATE_FIELD" });
  assert.equal({}.polluted, undefined);
});

test("local authorization is issued only to the exact manual owner run and byte-bound candidate", () => {
  const candidate = localPreviewTestCandidate();
  const env = localPreviewTestEnv(candidate);
  assert.equal(assertLocalPreviewAuthorization(authorizeLocalPreview(env, candidate, now), candidate, now), true);
  for (const [key, value] of Object.entries({ LOCAL_PREVIEW_CONFIRMATION: "SEND", CANDIDATE_SHA256: "0".repeat(64),
    GITHUB_ACTIONS: "false", GITHUB_REPOSITORY: "other/repo", GITHUB_REF: "refs/heads/feature", GITHUB_ACTOR: "other",
    GITHUB_TRIGGERING_ACTOR: "other", GITHUB_RUN_ATTEMPT: "2", GITHUB_EVENT_NAME: "push", GITHUB_RUN_ID: "", GITHUB_SHA: "", GITHUB_WORKFLOW_REF: "wrong" })) {
    assert.throws(() => authorizeLocalPreview({ ...env, [key]: value }, candidate, now), { code: "LOCAL_PREVIEW_CLOSED" }, key);
  }
  assert.throws(() => assertLocalPreviewAuthorization({}, candidate, now), { code: "LOCAL_PREVIEW_CLOSED" });
  const token = authorized(candidate);
  candidate.frontPage.note += " Changed.";
  assert.throws(() => assertLocalPreviewAuthorization(token, candidate, now), { code: "LOCAL_PREVIEW_CLOSED" });
  for (const instant of ["2026-09-13T03:59:59.000Z", "2026-09-14T04:00:00.000Z"]) {
    assert.throws(() => authorizeLocalPreview(localPreviewTestEnv(candidate), candidate, new Date(instant)), { code: "LOCAL_PREVIEW_CLOSED" });
  }
  assert.equal(isLocalPreviewRecord({ ...candidate.provenance.personalFreeResearch.localPreview, extra: true }), false);
  assert.equal(isLocalPreviewTiming({ editionDate: LOCAL_PREVIEW.editionDate, generatedAt: "2026-09-14T02:00:00.000Z",
    checkedAt: "2026-09-14T01:59:59.000Z" }), false);
});

test("the local renderer accepts truthful checked summaries only with private delivery authority", () => {
  const candidate = localPreviewTestCandidate();
  assert.deepEqual(validateCanonicalEdition(candidate), { valid: true, issues: [] });
  assert.throws(() => assertPersonalEmailCandidate(candidate), { code: "LOCAL_PREVIEW_CLOSED" });
  assert.throws(() => renderPersonalEditionEmail(candidate), { code: "LOCAL_PREVIEW_CLOSED" });
  const context = options(candidate);
  assert.equal(assertPersonalEmailCandidate(candidate, context).valid, true);
  const rendered = renderPersonalEditionEmail(candidate, context);
  assert.match(rendered.html, /Washington, D.C./u);
  assert.ok(rendered.text.includes(candidate.desks.ai.story.whatHappened));
  assert.ok(!rendered.text.includes("Quality pilot"));
});

test("a complete synthetic handoff passes the real metadata, canonical, prose and source-time gates offline", async () => {
  const candidate = localPreviewTestCandidate();
  const payload = encodeLocalPreviewPayload(candidate);
  const env = { ...localPreviewTestEnv(candidate), CANDIDATE_GZIP_BASE64: payload.candidateGzipBase64 };
  const report = await runLocalPaperPreview({ mode: "validate", env, now, clock: () => now,
    qa: async (edition, context) => {
      assert.equal(context.checkLinks, true);
      assert.deepEqual(context.allowedSourceUrls, buildSourceUrlAllowlist(candidate.desks.ai.story.sources));
      // Network is intentionally not exercised by this offline fixture. The
      // production CLI still calls pinned live HTTPS checks, with no override.
      return { sourceCheck: validateNewsroomDraft(edition, context) };
    },
    send: async () => assert.fail("An offline validation must never send."),
  });
  assert.equal(report.status, "validated");
  assert.equal(report.stories, 1);
  assert.equal(report.resendAccepted, false);
});

test("local preview keeps semantic approval, source checks, original quality score and prose gates", () => {
  const mutations = [
    c => { c.provenance.personalFreeResearch.semanticReview.approvedCandidateIds = []; },
    c => { delete c.provenance.personalFreeResearch.semanticReview.approvedStoryIds; },
    c => { c.provenance.personalFreeResearch.semanticReview.approvedStoryIds = ["different-story"]; },
    c => { c.provenance.personalFreeResearch.semanticReview.approvedCandidateIds = [c.desks.ai.story.id]; },
    c => { c.provenance.personalFreeResearch.semanticReview.responseSha256 = "bad"; },
    c => { c.provenance.personalFreeResearch.provider = "cloudflare-workers-ai"; },
    c => { c.provenance.personalFreeResearch.maxModelRequests = 13; },
    c => { c.provenance.personalFreeResearch.webSearch = {}; },
    c => { c.provenance.sourceCheck.status = "failed"; },
    c => { delete c.provenance.sourceCheck.checkedAt; },
    c => { c.provenance.sourceCheck.checkedAt = "2026-09-14T03:30:00.000Z"; },
    c => { c.desks.ai.story.selection.score = 69; },
    c => { c.desks.ai.story.evidence[0].id = "unchecked-claim"; },
    c => { c.desks.ai.story.whatHappened = "An incomplete paragraph"; },
    c => { c.desks.ai.story.whyItMatters = malformedEmailStories[0].whyItMatters; },
  ];
  for (const mutate of mutations) {
    const candidate = localPreviewTestCandidate(); mutate(candidate);
    assert.throws(() => assertPersonalEmailCandidate(candidate, options(candidate)));
  }
});

test("real trusted baseline IDs stay bound to raw local semantic approvals through final rendering", async () => {
  const candidate = localPreviewTestCandidate();
  const fixture = buildFreeEditorialBaselines()[0];
  const { validationReceipt: receipt } = candidate.desks.ai.story.selection;
  const sources = candidate.desks.ai.story.sources.map(source => ({ ...source, publisherKey: "synthetic-meridian" }));
  sources[0].title = fixture.candidate.feedEvidence[0].title;
  const selected = { ...fixture.candidate, canonicalEventKey: "synthetic-local-baseline", title: fixture.candidate.feedEvidence[0].title,
    primaryEntity: "Synthetic Meridian Lab", aiAdjacent: true, maturity: "verified-development",
    eventAt: "2026-09-12T12:00:00.000Z", firstPublishedAt: "2026-09-12T12:00:00.000Z", materiallyUpdatedAt: null,
    sources, feedEvidence: [{ ...fixture.candidate.feedEvidence[0], sourceId: sources[0].id,
      publishedAt: sources[0].publishedAt }],
    ranking: { version: "editorial-v1", score: receipt.score, components: receipt.components,
      componentMaximums: receipt.componentMaximums, eligibility: "new-development", corroborated: false,
      evidenceTier: "authoritative-single", itemSourceCount: 1, publisherCount: 1, publisherKeys: ["synthetic-meridian"],
      editorialValidation: { decision: "accepted", requiredScore: 70, rejectionReasons: [] } },
  };
  const baseline = normalizeFreeEditorialAgainstCandidates(buildTrustedEvidenceDigestPayload({ candidates: [selected] }),
    [selected], candidate.publication.generatedAt, { evidencePolicy: "authoritative-or-corroborated" });
  assert.equal(baseline.desks.ai.story.id, `trusted-evidence-digest-${selected.candidateId}`);
  let requests = 0;
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [selected], model: LOCAL_PREVIEW.model,
    aiRequestImpl: async request => {
      requests++;
      const payload = requests === 1 ? { stories: [fixture.draft] } : { reviews: [{ candidateId: selected.candidateId,
        draftSha256: createHash("sha256").update(JSON.stringify(fixture.draft)).digest("hex"),
        claimSupport: fixture.draft.claims.map(claim => claim.supports.map(support => support.evidenceId)),
        factsSupported: true, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true }] };
      return { provider: LOCAL_PREVIEW.provider, model: request.model, responseId: `local-${"d".repeat(64)}`,
        requestSha256: "a".repeat(64), responseSha256: "b".repeat(64), editorialPayload: payload };
    },
  });
  assert.ok(result);
  assert.equal(requests, 2);
  Object.assign(candidate, result.editorial);
  candidate.provenance.personalFreeResearch.semanticReview = { ...result.inference.semanticReview,
    approvedStoryIds: [candidate.desks.ai.story.id] };
  assert.deepEqual(result.inference.semanticReview.approvedCandidateIds, [selected.candidateId]);
  assert.notEqual(selected.candidateId, candidate.desks.ai.story.id);
  assert.equal(assertPersonalEmailCandidate(candidate, options(candidate)).valid, true);
  assert.ok(renderPersonalEditionEmail(candidate, options(candidate)).text.includes(fixture.draft.whyItMatters));
});

test("authorized local preview sends one labeled email with its fixed key and unchanged recipient", async () => {
  const candidate = localPreviewTestCandidate();
  const original = JSON.stringify(candidate);
  let calls = 0;
  const result = await sendPersonalEditionPreview(candidate, {
    localPreviewAuthorization: authorized(candidate), previewNow: now, previewClock: () => now,
    previewRevision: LOCAL_PREVIEW.revision, previewConfirmation: LOCAL_PREVIEW.confirmation,
    apiKey: "re_local_preview_test_only", recipient: "owner@example.com",
    fetchImpl: async (url, request) => {
      calls++;
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(request.headers["Idempotency-Key"], LOCAL_PREVIEW.idempotencyKey);
      const body = JSON.parse(request.body);
      assert.deepEqual(body.to, ["owner@example.com"]);
      assert.match(body.subject, /^\[Local model preview\]/u);
      assert.match(body.text, /Ollama and Qwen/u);
      assert.match(body.html, /not a full-web-search report/u);
      return new Response(JSON.stringify({ id: "mock-local-delivery" }), { status: 200 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.idempotencyKey, LOCAL_PREVIEW.idempotencyKey);
  assert.equal(JSON.stringify(candidate), original);
});

test("local candidate cannot use daily or generic preview paths or send after midnight", async () => {
  const candidate = localPreviewTestCandidate();
  let calls = 0;
  const opts = { apiKey: "re_local_preview_test_only", recipient: "owner@example.com",
    localPreviewAuthorization: authorized(candidate), previewNow: now, previewClock: () => now,
    previewRevision: LOCAL_PREVIEW.revision, previewConfirmation: LOCAL_PREVIEW.confirmation,
    fetchImpl: async () => { calls++; } };
  await assert.rejects(sendPersonalEditionEmail(candidate, opts), /cannot use daily/u);
  await assert.rejects(sendPersonalEditionPreview(candidate, { ...opts, localPreviewAuthorization: {} }));
  await assert.rejects(sendPersonalEditionPreview(candidate, { ...opts, previewRevision: undefined, previewConfirmation: `SEND PREVIEW ${LOCAL_PREVIEW.editionDate}` }));
  await assert.rejects(sendPersonalEditionPreview(candidate, { ...opts, previewConfirmation: "SEND" }));
  await assert.rejects(sendPersonalEditionPreview(candidate, { ...opts, previewClock: () => new Date(LOCAL_PREVIEW.expiresAt) }));
  assert.equal(calls, 0);
});
