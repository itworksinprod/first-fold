import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { diagnoseOneWriter, sealDiagnostic, openDiagnostic, assertDiagnosticAuthority,
  resolvePrivateWriterDiagnosticMode, validatePrivateWriterDiagnosticOptions } from
  "../scripts/automation/private-writer-diagnostic.mjs";
import { groundedDraft, groundedEvidence } from "./fixtures/grounded-summary.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL } from "../scripts/automation/free/models.mjs";
import { requestWorkersAiEditorial } from "../scripts/automation/free/workers-ai.mjs";

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
  model: DEFAULT_CLOUDFLARE_AI_MODEL, requestSha256: "a".repeat(64), responseSha256: "b".repeat(64),
  reasoning: "NEVER CAPTURE REASONING", headers: { authorization: "NEVER CAPTURE HEADERS" } });
const foundations = draft => ({ foundations: [{ candidateId: draft.candidateId, claims: draft.claims }] });
const parts = text => { const words = text.split(" "); const middle = Math.ceil(words.length / 2);
  return [words.slice(0, middle).join(" "), words.slice(middle).join(" ")]; };
const copies = (draft, claimRepairs = []) => ({ copies: [{ candidateId: draft.candidateId,
  headline: draft.headline, deck: draft.deck, whyItMatters: parts(draft.whyItMatters),
  whatToDoOrWatch: parts(draft.whatToDoOrWatch) }], ...(claimRepairs.length ? { claimRepairs } : {}) });
const reviewPayload = (request, overrides = {}) => ({ reviews: request.drafts.map(({ draft, draftSha256 }) => {
  assert.equal(draftSha256, createHash("sha256").update(JSON.stringify(draft)).digest("hex"));
  return { candidateId: draft.candidateId, draftSha256,
    claimSupport: draft.claims.map(claim => claim.supports.map(support => support.evidenceId)),
    factsSupported: true, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true, ...overrides };
}) });

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

test("explicit source-recheck diagnostic remains one story, three calls, unchanged review and encrypted-only", async () => {
  let count = 0;
  const { report, sealed } = await diagnoseOneWriter({ ...base, mode: "source-recheck", aiRequestImpl: async options => {
    const data = JSON.parse(options.messages[1].content);
    assert.equal(options.model, DEFAULT_CLOUDFLARE_AI_MODEL);
    assert.equal(options.maxAttempts, 1);
    if (++count === 1) return response(foundations(groundedDraft));
    if (count === 2) {
      assert.deepEqual(data.dossiers[0].fixedClaims, []);
      assert.equal(data.dossiers[0].proposedClaims.length, 2);
      return response(copies(groundedDraft, groundedDraft.claims.map((claim, claimIndex) => ({
        candidateId: groundedDraft.candidateId, claimIndex, ...claim,
      }))));
    }
    assert.equal(count, 3);
    return response(reviewPayload(data, { usefulAndSpecific: false }));
  } });
  assert.equal(report.status, "failed", "The experiment cannot override reviewer rejection");
  assert.equal(report.mode, "one-source-foundation-recheck-not-an-edition");
  assert.equal(report.outputBudget, 7800);
  assert.equal(report.emailSent, false);
  assert.equal(report.searchQueries, 0);
  const capture = openDiagnostic(sealed, pair.privateKey);
  assert.equal(capture.calls.length, 3);
  assert.equal(capture.result, null);
  assert.ok(!JSON.stringify(sealed).includes(groundedDraft.headline));
});

test("explicit real-source experiment uses bound claim verdicts in plain JSON without enabling email or retries", async () => {
  for (const outcome of ["pass", "unsupported", "stale"]) {
    const formats = [];
    const { report, sealed } = await diagnoseOneWriter({ ...base, mode: "source-recheck-explicit", aiRequestImpl: async options => {
      formats.push(options.responseFormat);
      const data = JSON.parse(options.messages[1].content);
      if (formats.length === 1) return response(foundations(groundedDraft));
      if (formats.length === 2) return response(copies(groundedDraft, groundedDraft.claims.map((claim, claimIndex) => ({
        candidateId: groundedDraft.candidateId, claimIndex, ...claim,
      }))));
      assert.equal(formats.length, 3);
      return response({ reviews: data.drafts.map(entry => ({ candidateId: entry.draft.candidateId,
        draftSha256: entry.draftSha256, factsSupported: true, attributionAccurate: true,
        analysisSupported: true, usefulAndSpecific: true,
        claimVerdicts: entry.claimEvidence.map(claim => ({ claimIndex: claim.claimIndex,
          claimSha256: outcome === "stale" ? "0".repeat(64) : claim.claimSha256,
          allCitedPassagesSupport: outcome !== "unsupported",
        })),
      })) });
    } });
    assert.deepEqual(formats, ["json_schema", "json_object", "json_object"]);
    assert.equal(report.status, outcome === "pass" ? "writer-and-review-passed" : "failed");
    assert.equal(report.outputBudget, 7800);
    assert.equal(report.emailSent, false);
    assert.equal(report.mode, "one-source-explicit-recheck-not-an-edition");
    assert.equal(openDiagnostic(sealed, pair.privateKey).calls.length, 3);
  }
});

test("one real-source diagnostic pins the daily Llama writer and reviewer, with requests and payloads encrypted only", async () => {
  let count = 0;
  const requests = [];
  const payloads = [];
  const { report, sealed } = await diagnoseOneWriter({ ...base,
    researchImpl: async options => {
      assert.equal(options.minimumScore, 70);
      assert.equal(options.enrichArticles, true);
      assert.equal(options.reviewNewsworthiness, undefined);
      assert.equal(options.discoverWebArticles, undefined);
      return { candidates: [candidate, { ...candidate, candidateId: "must-not-be-drafted" }] };
    }, aiRequestImpl: async options => {
      assert.equal(options.model, DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(options.maxAttempts, 1);
      requests.push(JSON.parse(options.messages[1].content));
      if (++count === 1) {
        assert.equal(options.maxTokens, 2_000);
        assert.equal(options.responseFormat, "json_schema");
        assert.equal(requests[0].dossiers.length, 1);
        assert.deepEqual(Object.keys(options.schema.properties), ["foundations"]);
        payloads.push(foundations(groundedDraft));
        return response(payloads.at(-1));
      }
      if (count === 2) {
        assert.equal(options.maxTokens, 4_000);
        assert.equal(options.responseFormat, "json_schema");
        assert.deepEqual(Object.keys(options.schema.properties), ["copies"]);
        assert.equal(requests[1].dossiers.length, 1);
        assert.deepEqual(requests[1].dossiers[0].fixedClaims.map(({ claimIndex, ...claim }) => claim), groundedDraft.claims);
        assert.deepEqual(requests[1].dossiers[0].requestedClaimRepairs, []);
        assert.deepEqual(requests[1].dossiers[0].sources.flatMap(source => source.passages.map(passage => passage.evidenceId)).sort(),
          [...new Set(groundedDraft.claims.flatMap(claim => claim.supports.map(support => support.evidenceId)))].sort());
        payloads.push(copies(groundedDraft));
        return response(payloads.at(-1));
      }
      assert.equal(options.maxTokens, 1_800);
      assert.equal(options.responseFormat, "json_schema");
      assert.equal(requests[2].dossiers.length, 1);
      assert.equal(requests[2].drafts.length, 1);
      assert.deepEqual(requests[2].drafts[0].draft, groundedDraft);
      assert.deepEqual(requests[2].dossiers[0].sources.map(source => Object.fromEntries(
        ["sourceId", "publisher", "publisherKey", "relationship", "passages"].map(key => [key, source[key]]))), requests[0].dossiers[0].sources,
        "Final review retains full source context, not only the narrower copy packet");
      assert.ok(requests[2].dossiers[0].sources.every(source => Object.hasOwn(source, "publishedAt")));
      assert.deepEqual(requests[2].drafts[0].claimEvidence.map(({ claimIndex, claimText, citations }) => ({
        claimIndex, claimText, ids: citations.map(citation => citation.evidenceId),
      })), groundedDraft.claims.map((claim, claimIndex) => ({
        claimIndex, claimText: claim.text, ids: claim.supports.map(support => support.evidenceId),
      })));
      payloads.push(reviewPayload(requests[2]));
      return response(payloads.at(-1));
    } });
  assert.equal(report.status, "writer-and-review-passed");
  assert.equal(report.modelRequests, 3);
  assert.equal(report.outputBudget, 7_800);
  assert.equal(report.searchQueries, 0);
  assert.equal(report.emailSent, false);
  const opened = openDiagnostic(sealed, pair.privateKey);
  assert.deepEqual(opened.calls.map(call => call.request), requests);
  assert.deepEqual(opened.calls.map(call => call.editorialPayload), payloads);
  for (const call of opened.calls) assert.deepEqual(Object.keys(call), ["request", "editorialPayload"]);
  const serialized = JSON.stringify(opened);
  for (const forbidden of [base.apiToken, "NEVER CAPTURE", "must-not-be-drafted"]) {
    assert.ok(!serialized.includes(forbidden));
  }
  const visible = JSON.stringify({ report, sealed });
  for (const privateText of [groundedDraft.headline, groundedDraft.claims[0].text,
    requests[0].dossiers[0].sources[0].passages[0].text, "claimSupport", "claimEvidence", "dossiers", base.apiToken]) {
    assert.ok(!visible.includes(privateText));
  }
});

test("daily Llama claim repair and failed semantic review remain inspectable only after decryption within three calls and 7800 tokens", async () => {
  const invalid = structuredClone(groundedDraft);
  invalid.claims[0].text = "Too short.";
  const requests = [];
  const payloads = [];
  const budgets = [];
  const { report, sealed } = await diagnoseOneWriter({ ...base,
    aiRequestImpl: async options => {
      assert.equal(options.model, DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(options.maxAttempts, 1);
      const request = JSON.parse(options.messages[1].content);
      requests.push(request);
      budgets.push(options.maxTokens);
      if (requests.length === 1) payloads.push(foundations(invalid));
      else if (requests.length === 2) {
        assert.equal(request.dossiers.length, 1);
        assert.deepEqual(request.dossiers[0].fixedClaims, [{ claimIndex: 1, ...groundedDraft.claims[1] }]);
        assert.deepEqual(request.dossiers[0].requestedClaimRepairs.map(task => task.claimIndex), [0]);
        assert.deepEqual(Object.keys(options.schema.properties), ["claimRepairs", "copies"]);
        payloads.push(copies(groundedDraft, [{ candidateId: candidate.candidateId, claimIndex: 0,
          ...groundedDraft.claims[0] }]));
      } else {
        assert.equal(request.drafts.length, 1);
        payloads.push(reviewPayload(request, { claimSupport: [[], []], factsSupported: false }));
      }
      return response(payloads.at(-1));
    } });
  assert.deepEqual(budgets, [2_000, 4_000, 1_800]);
  assert.equal(report.modelRequests, 3);
  assert.equal(report.outputBudget, 7_800);
  assert.equal(report.searchQueries, 0);
  assert.equal(report.emailSent, false);
  assert.equal(report.status, "failed");
  const opened = openDiagnostic(sealed, pair.privateKey);
  assert.equal(opened.result, null);
  assert.deepEqual(opened.calls.map(call => call.request), requests);
  assert.deepEqual(opened.calls.map(call => call.editorialPayload), payloads);
  assert.deepEqual(opened.calls[2].editorialPayload.reviews[0].claimSupport, [[], []]);
  for (const privateText of ["Too short.", groundedDraft.whyItMatters, "requestedClaimRepairs", "claimSupport", "dossiers"]) {
    assert.ok(!JSON.stringify({ report, sealed }).includes(privateText));
  }
});

test("rejected drafts remain inspectable, never become accepted copy, and use at most three calls", async () => {
  const invalid = { ...groundedDraft, headline: "Source reports a new development" };
  let calls = 0;
  const { report, sealed } = await diagnoseOneWriter({ ...base,
    aiRequestImpl: async () => response(++calls === 1 ? foundations(groundedDraft) : copies(invalid)) });
  assert.equal(report.status, "failed");
  assert.ok(report.modelRequests <= 3);
  const opened = openDiagnostic(sealed, pair.privateKey);
  assert.equal(opened.result, null);
  assert.equal(opened.calls[1].editorialPayload.copies[0].headline, invalid.headline);
});

test("429 stops immediately and retains only explicitly supplied private diagnostics in ciphertext", async () => {
  let count = 0;
  const { report, sealed } = await diagnoseOneWriter({ ...base, aiRequestImpl: async options => {
    count++;
    await options.onPrivateFailure({ status: 429, bodyText: "private bounded provider detail" });
    throw Object.assign(new Error("sensitive provider response"), {
      code: "WORKERS_AI_EDITORIAL_UNAVAILABLE", httpStatus: 429, providerCode: 3040,
    });
  } });
  assert.equal(count, 1);
  assert.equal(report.failures[0].providerCode, 3040);
  assert.equal(report.failures[0].httpStatus, "429");
  const opened = openDiagnostic(sealed, pair.privateKey);
  assert.equal(opened.calls[0].privateFailure.bodyText, "private bounded provider detail");
  assert.ok(!JSON.stringify(opened).includes("sensitive provider response"));
  assert.ok(!JSON.stringify(report).includes("private bounded provider detail"));
  assert.ok(!JSON.stringify(sealed).includes("private bounded provider detail"));
});

test("invalid encryption configuration is rejected before any research or inference", async () => {
  let count = 0;
  await assert.rejects(diagnoseOneWriter({ ...base, publicKey: "bad", researchImpl: async () => { count++; } }));
  assert.equal(count, 0);
});

test("provider-only mode makes one fixed tiny native Llama request without research or successful capture", async () => {
  let modelCalls = 0, networkCalls = 0;
  const { report, sealed } = await diagnoseOneWriter({ ...base, mode: "provider-only",
    model: "unapproved-model", messages: [{ role: "user", content: "ARBITRARY_PROMPT" }], maxTokens: 16_000,
    researchImpl: async () => { assert.fail("Provider-only mode must not fetch feeds or articles"); },
    aiRequestImpl: async options => {
      modelCalls++;
      assert.equal(options.model, DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(options.maxTokens, 128);
      assert.equal(options.maxAttempts, 1);
      assert.equal(options.timeoutMs, 30_000);
      assert.equal(options.maxRequestBytes, 2_048);
      assert.equal(options.maxResponseBytes, 16_384);
      assert.equal(options.temperature, 0.1);
      assert.equal(options.responseFormat, "json_schema");
      assert.equal(options.validatePayload({ ok: true }), true);
      assert.equal(options.validatePayload({ ok: false }), false);
      assert.equal(options.validatePayload({ ok: true, extra: true }), false);
      return requestWorkersAiEditorial(options);
    }, fetchImpl: async (url, options) => {
      networkCalls++;
      assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${base.accountId}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`);
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "error");
      const body = JSON.parse(options.body);
      assert.ok(Buffer.byteLength(options.body) < 1_024);
      assert.equal(body.max_tokens, 128);
      assert.equal(body.stream, false);
      assert.deepEqual(body.response_format.json_schema.properties, { ok: { type: "boolean", enum: [true] } });
      assert.doesNotMatch(options.body, /ARBITRARY_PROMPT|unapproved-model|dossiers|claims/);
      return new Response(JSON.stringify({ success: true, result: { response: { ok: true },
        reasoning_content: "NEVER_CAPTURE_PROVIDER_REASONING", usage: { completion_tokens: 8 } } }),
      { headers: { "content-type": "application/json" } });
    } });
  assert.equal(modelCalls, 1);
  assert.equal(networkCalls, 1);
  assert.deepEqual(report, { mode: "one-provider-probe-not-news-or-delivery", status: "provider-responded", code: null,
    modelRequests: 1, networkRequests: 1, outputBudget: 128, searchQueries: 0, emailSent: false, failures: [] });
  const opened = openDiagnostic(sealed, pair.privateKey);
  assert.deepEqual(opened.calls, [{}]);
  assert.doesNotMatch(JSON.stringify(opened), /NEVER_CAPTURE|private-test-token|authorization|editorialPayload|dossiers/);
});

test("provider-only native 429 captures precise redacted errors only encrypted and never retries or infers quota", async () => {
  let calls = 0;
  const privateBody = `Temporary provider refusal: ${base.apiToken}`;
  const { report, sealed } = await diagnoseOneWriter({ ...base, mode: "provider-only",
    researchImpl: async () => assert.fail("No research"),
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ success: false, errors: [{ code: 9999, message: privateBody }] }),
        { status: 429, headers: { "content-type": "application/json", "cf-ray": "synthetic-ray", "retry-after": "60" } });
    } });
  assert.equal(calls, 1);
  assert.equal(report.modelRequests, 1);
  assert.equal(report.networkRequests, 1);
  assert.equal(report.outputBudget, 128);
  assert.equal(report.status, "failed");
  assert.equal(report.failures[0].httpStatus, "429");
  assert.equal(report.failures[0].providerCode, null);
  assert.equal(report.failures[0].reason, undefined);
  const opened = openDiagnostic(sealed, pair.privateKey);
  assert.equal(opened.calls[0].privateFailure.status, 429);
  assert.match(opened.calls[0].privateFailure.bodyText, /Temporary provider refusal/);
  assert.equal(opened.calls[0].privateFailure.cfRay, "synthetic-ray");
  assert.equal(opened.calls[0].privateFailure.retryAfter, "60");
  assert.ok(Buffer.byteLength(opened.calls[0].privateFailure.bodyText) <= 8_192);
  assert.ok(!JSON.stringify(opened).includes(base.apiToken));
  assert.doesNotMatch(JSON.stringify({ report, sealed }), /Temporary provider refusal|synthetic-ray|private-test-token/);
});

test("provider-only checks the exact endpoint, single network request and successful provenance", async () => {
  for (const variant of ["endpoint", "body", "second-call", "provenance", "payload"]) {
    let networkCalls = 0;
    const { report } = await diagnoseOneWriter({ ...base, mode: "provider-only",
      researchImpl: async () => assert.fail("No research"),
      fetchImpl: async () => {
        networkCalls++;
        return new Response(JSON.stringify({ success: true, result: { response: { ok: true } } }),
          { headers: { "content-type": "application/json" } });
      }, aiRequestImpl: async options => {
        if (variant === "endpoint" || variant === "body") {
          await options.fetchImpl(variant === "endpoint" ? "https://example.test" :
            `https://api.cloudflare.com/client/v4/accounts/${base.accountId}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`,
          { method: "POST", redirect: "error", body: "untrusted" });
        }
        const result = await requestWorkersAiEditorial(options);
        if (variant === "second-call") await requestWorkersAiEditorial(options);
        if (variant === "provenance") result.requestSha256 = "f".repeat(64);
        if (variant === "payload") result.editorialPayload = { ok: false };
        return result;
      } });
    assert.equal(report.status, "failed", variant);
    assert.ok(networkCalls <= 1, variant);
    assert.equal(report.modelRequests, 1);
    assert.equal(report.networkRequests, networkCalls);
  }
});

test("mode and key preflight reject before credentials while the omitted mode stays real-source", async () => {
  assert.equal(resolvePrivateWriterDiagnosticMode(), "source");
  assert.equal(resolvePrivateWriterDiagnosticMode("source"), "source");
  assert.equal(resolvePrivateWriterDiagnosticMode("provider-only"), "provider-only");
  const env = { ...authority, DIAGNOSTIC_PUBLIC_KEY: publicKey, PRIVATE_WRITER_DIAGNOSTIC_MODE: "provider-only" };
  for (const field of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_API_TOKEN"]) {
    Object.defineProperty(env, field, { enumerable: true, get() { assert.fail("Preflight must not read credentials"); } });
  }
  assert.equal(validatePrivateWriterDiagnosticOptions(env), "provider-only");
  for (const patch of [{ GITHUB_ACTOR: "other" }, { DIAGNOSTIC_PUBLIC_KEY: "bad" },
    { PRIVATE_WRITER_DIAGNOSTIC_MODE: "arbitrary" }]) {
    const rejected = Object.create(null, Object.getOwnPropertyDescriptors(env));
    Object.assign(rejected, patch);
    assert.throws(() => validatePrivateWriterDiagnosticOptions(rejected));
  }
  let calls = 0;
  for (const mode of [null, "", "arbitrary", {}, true]) {
    assert.throws(() => resolvePrivateWriterDiagnosticMode(mode));
    await assert.rejects(diagnoseOneWriter({ ...base, mode,
      researchImpl: async () => { calls++; }, aiRequestImpl: async () => { calls++; } }),
    error => error.code === "DIAGNOSTIC_MODE_INVALID");
  }
  await assert.rejects(diagnoseOneWriter({ ...base, mode: "provider-only", publicKey: "bad",
    researchImpl: async () => { calls++; }, aiRequestImpl: async () => { calls++; } }));
  assert.equal(calls, 0);
});

test("diagnostic workflow is manual/read-only and cannot send, bill, publish or expose plaintext artifacts", async () => {
  const workflow = await readFile(new URL("../.github/workflows/private-writer-diagnostic.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\b(?:schedule|push|pull_request):|contents: write|RESEND|TAVILY|OPENAI_API|PERSONAL_PAPER_EMAIL/);
  assert.match(workflow, /retention-days: 1/);
  assert.match(workflow, /path: \$\{\{ runner.temp \}\}\/writer-diagnostic.encrypted.json/);
  assert.match(workflow, /persist-credentials: false/);
  assert.ok(workflow.indexOf("Test diagnostic boundaries") < workflow.indexOf("secrets.CLOUDFLARE_AI_API_TOKEN"));
  assert.match(workflow, /default: source[\s\S]*- source\n\s+- source-recheck\n\s+- source-recheck-explicit\n\s+- review-controls\n\s+- explicit-review-controls\n\s+- provider-only/);
  assert.ok(workflow.indexOf("Validate diagnostic mode and encryption") < workflow.indexOf("secrets.CLOUDFLARE_AI_API_TOKEN"));
  assert.match(workflow, /private-writer-diagnostic\.mjs validate/);
  assert.match(workflow, /PRIVATE_WRITER_DIAGNOSTIC_MODE: \$\{\{ inputs\.mode \|\| 'source' \}\}/);
});
