import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { diagnoseOneWriter, sealDiagnostic, openDiagnostic, assertDiagnosticAuthority } from
  "../scripts/automation/private-writer-diagnostic.mjs";
import { groundedDraft, groundedEvidence } from "./fixtures/grounded-summary.mjs";
import { FREE_REASONING_WRITER_MODEL } from "../scripts/automation/free/models.mjs";

const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
const publicKey = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const candidate = { candidateId: groundedDraft.candidateId, suggestedDesk: "security-and-privacy",
  ranking: { score: 77, evidenceTier: "authoritative-single" }, feedEvidence: [groundedEvidence],
  sources: [{ id: "cert-advisory", title: groundedEvidence.title, publisher: "CERT/CC",
    relationship: "originating", publishedAt: groundedEvidence.publishedAt }] };
const authority = { GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main",
  GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/private-writer-diagnostic.yml@refs/heads/main",
  GITHUB_ACTOR: "itworksinprod", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1" };
const base = { publicKey, accountId: "0".repeat(32), apiToken: "private-test-token",
  now: new Date("2026-09-14T01:30:00.000Z"), researchImpl: async () => ({ candidates: [candidate] }) };
const response = editorialPayload => ({ editorialPayload, provider: "cloudflare-workers-ai",
  model: FREE_REASONING_WRITER_MODEL, requestSha256: "a".repeat(64), responseSha256: "b".repeat(64),
  reasoning: "NEVER CAPTURE REASONING", headers: { authorization: "NEVER CAPTURE HEADERS" } });

test("encrypted diagnostic round-trips but rejects tampering, wrong keys and oversized plaintext", () => {
  const value = { exactDraft: groundedDraft };
  const sealed = sealDiagnostic(value, publicKey);
  assert.deepEqual(openDiagnostic(sealed, pair.privateKey), value);
  assert.ok(!JSON.stringify(sealed).includes(groundedDraft.headline));
  const ciphertext = Buffer.from(sealed.ciphertext, "base64");
  ciphertext[0] ^= 1;
  assert.throws(() => openDiagnostic({ ...sealed, ciphertext: ciphertext.toString("base64") }, pair.privateKey));
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  assert.throws(() => openDiagnostic(sealed, other.privateKey));
  assert.throws(() => sealDiagnostic(value, other.publicKey.export({ type: "spki", format: "der" }).toString("base64")));
  assert.throws(() => sealDiagnostic({ text: "x".repeat(350_001) }, publicKey));
});

test("manual diagnostic authority rejects other actors, repos, refs, events, attempts and workflow paths", () => {
  assert.doesNotThrow(() => assertDiagnosticAuthority(authority));
  for (const field of Object.keys(authority)) {
    assert.throws(() => assertDiagnosticAuthority({ ...authority, [field]: "untrusted" }));
  }
});

test("one real-source diagnostic uses unchanged writer and reviewer, with no secrets in the capture", async () => {
  let count = 0;
  const { report, sealed } = await diagnoseOneWriter({ ...base,
    researchImpl: async options => {
      assert.equal(options.minimumScore, 70);
      assert.equal(options.enrichArticles, true);
      assert.equal(options.reviewNewsworthiness, undefined);
      assert.equal(options.discoverWebArticles, undefined);
      return { candidates: [candidate, { ...candidate, candidateId: "must-not-be-drafted" }] };
    }, aiRequestImpl: async options => {
      assert.equal(options.model, FREE_REASONING_WRITER_MODEL);
      assert.equal(options.maxAttempts, 1);
      if (++count === 1) {
        assert.equal(JSON.parse(options.messages[1].content).dossiers.length, 1);
        return response({ stories: [groundedDraft] });
      }
      const draft = JSON.parse(options.messages[1].content).drafts[0];
      return response({ reviews: [{ candidateId: candidate.candidateId,
        draftSha256: createHash("sha256").update(JSON.stringify(groundedDraft)).digest("hex"),
        claimSupport: groundedDraft.claims.map(claim => claim.supports.map(support => support.evidenceId)),
        factsSupported: true, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true }] });
    } });
  assert.equal(report.status, "writer-and-review-passed");
  assert.equal(report.modelRequests, 2);
  assert.equal(report.outputBudget, 5_400);
  assert.equal(report.emailSent, false);
  const opened = openDiagnostic(sealed, pair.privateKey);
  assert.deepEqual(opened.calls[0].editorialPayload.stories[0], groundedDraft);
  const serialized = JSON.stringify(opened);
  for (const forbidden of [base.apiToken, "NEVER CAPTURE", "must-not-be-drafted"]) {
    assert.ok(!serialized.includes(forbidden));
  }
  assert.ok(!JSON.stringify(report).includes(groundedDraft.headline));
});

test("rejected drafts remain inspectable, never become accepted copy, and use at most three calls", async () => {
  const invalid = { ...groundedDraft, headline: "Source reports a new development" };
  const { report, sealed } = await diagnoseOneWriter({ ...base,
    aiRequestImpl: async () => response({ stories: [invalid] }) });
  assert.equal(report.status, "failed");
  assert.ok(report.modelRequests <= 3);
  const opened = openDiagnostic(sealed, pair.privateKey);
  assert.equal(opened.result, null);
  assert.equal(opened.calls[0].editorialPayload.stories[0].headline, invalid.headline);
});

test("429 stops immediately, saves safe failure data and never captures a transport error body", async () => {
  let count = 0;
  const { report, sealed } = await diagnoseOneWriter({ ...base, aiRequestImpl: async () => {
    count++;
    throw Object.assign(new Error("sensitive provider response"), {
      code: "WORKERS_AI_EDITORIAL_UNAVAILABLE", httpStatus: 429, providerCode: 3040,
    });
  } });
  assert.equal(count, 1);
  assert.equal(report.failures[0].providerCode, 3040);
  assert.equal(report.failures[0].httpStatus, "429");
  assert.ok(!JSON.stringify(openDiagnostic(sealed, pair.privateKey)).includes("sensitive provider response"));
});

test("invalid encryption configuration is rejected before any research or inference", async () => {
  let count = 0;
  await assert.rejects(diagnoseOneWriter({ ...base, publicKey: "bad", researchImpl: async () => { count++; } }));
  assert.equal(count, 0);
});

test("diagnostic workflow is manual/read-only and cannot send, bill, publish or expose plaintext artifacts", async () => {
  const workflow = await readFile(new URL("../.github/workflows/private-writer-diagnostic.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\b(?:schedule|push|pull_request):|contents: write|RESEND|TAVILY|OPENAI_API|PERSONAL_PAPER_EMAIL/);
  assert.match(workflow, /retention-days: 1/);
  assert.match(workflow, /path: \$\{\{ runner.temp \}\}\/writer-diagnostic.encrypted.json/);
  assert.match(workflow, /persist-credentials: false/);
  assert.ok(workflow.indexOf("Test diagnostic boundaries") < workflow.indexOf("secrets.CLOUDFLARE_AI_API_TOKEN"));
});
