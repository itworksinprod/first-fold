import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { EXPERIMENTAL_MIXED_REVIEW_PROFILE, EXPERIMENTAL_REASONING_PIPELINE_PROFILE,
  groundedDossiers, synthesizeGroundedEditorial } from
  "../scripts/automation/free/grounded-draft.mjs";
import { buildExplicitClaimReview, EXPLICIT_CLAIM_REVIEW_PROFILE } from
  "../scripts/automation/free/explicit-claim-review.mjs";
import { buildReviewRejectionDiagnostic, REVIEW_REJECTION_MAX_TOKENS, REVIEW_REJECTION_TIMEOUT_MS } from
  "../scripts/automation/free/review-rejections.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL, EXPERIMENTAL_FREE_WRITER_MODEL,
  WORKERS_AI_PROVIDER, WORKERS_AI_EDITORIAL_FORMAT_INVALID, buildWorkersAiRequest, workersAiRunUrl } from
  "../scripts/automation/free/workers-ai.mjs";
import { LOCAL_AI_MODEL } from "../scripts/automation/free/local-ai.mjs";
import { groundedDraft, groundedEvidence } from "./fixtures/grounded-summary.mjs";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const accountId = "0".repeat(32);
const candidate = { candidateId: groundedDraft.candidateId, suggestedDesk: "security-and-privacy",
  ranking: { evidenceTier: "authoritative-single" }, feedEvidence: [groundedEvidence],
  sources: [{ id: "cert-advisory", title: groundedEvidence.title, publisher: "CERT/CC",
    relationship: "originating", publishedAt: groundedEvidence.publishedAt }] };
const baseline = () => ({ frontPage: { note: "Unaccepted synthetic baseline", estimatedMinutes: 1 }, desks: {
  "security-and-privacy": { story: { id: "story-fixture", headline: "Unaccepted baseline",
    sources: candidate.sources, selection: { score: 77 } } },
} });
const flags = ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"];

function payloadFor(options, index, mutateVerdict = () => {}) {
  if (index === 0) return { foundations: [{ candidateId: groundedDraft.candidateId, claims: groundedDraft.claims }] };
  if (index === 1) return { copies: [{ candidateId: groundedDraft.candidateId,
    headline: groundedDraft.headline, deck: groundedDraft.deck,
    whyItMatters: groundedDraft.whyItMatters, whatToDoOrWatch: groundedDraft.whatToDoOrWatch }] };
  const data = JSON.parse(options.messages[1].content);
  return { reviews: data.drafts.map(({ draft, draftSha256, claimEvidence }) => {
    if (!options.schema.properties.reviews.items.properties.claimVerdicts) return { candidateId: draft.candidateId, draftSha256,
      claimSupport: draft.claims.map(claim => claim.supports.map(support => support.evidenceId)),
      ...Object.fromEntries(flags.map(field => [field, true])) };
    const review = { candidateId: draft.candidateId, draftSha256,
      claimVerdicts: claimEvidence.map(({ claimIndex, claimSha256 }) => ({ claimIndex, claimSha256, allCitedPassagesSupport: true })),
      ...Object.fromEntries(flags.map(field => [field, true])) };
    mutateVerdict(review);
    if (options.schema.properties.reviews.items.properties.rejections) {
      review.rejections = [
        ...review.claimVerdicts.filter(claim => !claim.allCitedPassagesSupport).map(claim => ({
          gate: `claim:${claim.claimIndex}`, sentenceId: `claim:${claim.claimIndex}`, rule: "uncertain-support",
          evidenceIds: [draft.claims[claim.claimIndex].supports[0].evidenceId],
        })),
        ...flags.filter(field => !review[field]).map(field => ({ gate: field,
          sentenceId: field === "analysisSupported" || field === "usefulAndSpecific" ? "whyItMatters:0" : "headline:0",
          rule: field === "usefulAndSpecific" ? "generic-or-unhelpful" : field === "analysisSupported" ? "unsupported-inference" : "uncertain-support",
          evidenceIds: [draft.claims[0].supports[0].evidenceId],
        })),
      ];
    }
    return review;
  }) };
}

function nativeResponse(options, payload, index) {
  const request = buildWorkersAiRequest(options);
  return { provider: WORKERS_AI_PROVIDER, model: options.model, responseId: `synthetic-stage-${index}`,
    requestSha256: hash({ provider: WORKERS_AI_PROVIDER, model: options.model, body: request.body }),
    responseSha256: hash({ syntheticResponse: payload, index }), editorialPayload: payload };
}

async function run({ profile = EXPERIMENTAL_MIXED_REVIEW_PROFILE, mutateVerdict,
  mutateResponse = () => {}, intercept, model = DEFAULT_CLOUDFLARE_AI_MODEL, fetchImpl } = {}) {
  const calls = [];
  const responses = [];
  const events = [];
  const editorial = baseline();
  const result = await synthesizeGroundedEditorial({ editorial, candidates: [candidate], accountId,
    apiToken: "synthetic-mixed-review-token", model,
    ...(profile === null ? {} : { reviewProfile: profile }),
    onDiagnostic: event => events.push(event), ...(fetchImpl ? { fetchImpl } : {}),
    aiRequestImpl: async options => {
      const index = calls.length;
      calls.push(options);
      const payload = payloadFor(options, index, mutateVerdict);
      const response = nativeResponse(options, payload, index);
      mutateResponse(response, index, options);
      if (intercept) await intercept(options, response, index);
      responses.push(response);
      return response;
    } });
  return { result, calls, responses, events, editorial };
}

test("mixed reviewer is an explicit three-stage no-email experiment with exact tested reviewer prompt and truthful provenance", async () => {
  const attempt = await run();
  assert.ok(attempt.result);
  assert.deepEqual(attempt.calls.map(call => call.model), [DEFAULT_CLOUDFLARE_AI_MODEL, DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL]);
  assert.deepEqual(attempt.calls.map(call => call.maxTokens), [2_000, 4_000, 8_000]);
  assert.equal(attempt.calls.reduce((sum, call) => sum + call.maxTokens, 0), 14_000);
  assert.equal(REVIEW_REJECTION_MAX_TOKENS, 8_000);
  assert.equal(REVIEW_REJECTION_TIMEOUT_MS, 180_000);
  assert.deepEqual(attempt.calls.map(call => call.timeoutMs), [90_000, 90_000, 180_000]);
  assert.ok(attempt.calls.every(call => call.maxAttempts === 1 && call.maxRequestBytes === 70_000 && call.maxResponseBytes === 100_000));
  const expected = buildReviewRejectionDiagnostic(buildExplicitClaimReview({ drafts: [groundedDraft], dossiers: groundedDossiers([candidate]) }));
  assert.equal(attempt.calls[2].messages[0].content, expected.prompt);
  assert.deepEqual(JSON.parse(attempt.calls[2].messages[1].content), expected.data);
  assert.deepEqual(attempt.calls[2].schema, expected.schema);
  assert.equal(attempt.calls[2].temperature, 0.1);
  assert.equal(attempt.calls[2].responseFormat, "json_schema");
  const inference = attempt.result.inference;
  assert.equal(inference.model, DEFAULT_CLOUDFLARE_AI_MODEL);
  assert.equal(inference.responseId, attempt.responses[1].responseId);
  assert.equal(inference.semanticReview.model, FREE_REASONING_WRITER_MODEL);
  assert.equal(inference.semanticReview.profile, EXPERIMENTAL_MIXED_REVIEW_PROFILE);
  assert.equal(inference.semanticReview.requestCount, 1);
  assert.equal(inference.semanticReview.requestSha256, attempt.responses[2].requestSha256);
  assert.equal(inference.semanticReview.responseSha256, attempt.responses[2].responseSha256);
  assert.deepEqual(inference.stages.map(stage => stage.stage), ["foundation", "composition", "review"]);
  assert.equal(inference.requestSha256, hash(inference.stages.map(({ stage, provider, model, requestSha256 }) => ({ stage, provider, model, requestSha256 }))));
  assert.equal(inference.responseSha256, hash(inference.stages.map(({ stage, provider, model, responseSha256 }) => ({ stage, provider, model, responseSha256 }))));
  assert.equal(attempt.editorial.desks["security-and-privacy"].story.headline, "Unaccepted baseline");
});

test("every negative claim or whole-story verdict still vetoes adoption and cannot obtain a fourth model request", async () => {
  for (const mutateVerdict of [
    review => { review.claimVerdicts[0].allCitedPassagesSupport = false; },
    review => { review.claimVerdicts[1].allCitedPassagesSupport = false; },
    ...flags.map(field => review => { review[field] = false; }),
    review => { review.claimVerdicts.forEach(claim => { claim.allCitedPassagesSupport = false; }); flags.forEach(field => { review[field] = false; }); },
  ]) {
    const attempt = await run({ mutateVerdict });
    assert.equal(attempt.result, null);
    assert.equal(attempt.calls.length, 3);
    assert.ok(attempt.events.some(event => event.stage === "semantic-evidence-check" && event.accepted === 0));
  }
});

test("malformed or absent diagnostic fields and forged verdict bindings cannot approve a mixed-model story", async () => {
  for (const mutate of [
    review => { delete review.rejections; },
    review => { review.rejections.push({ gate: "factsSupported", sentenceId: "headline:0", rule: "uncertain-support", evidenceIds: ["S1P1"] }); },
    review => { review.draftSha256 = "f".repeat(64); },
    review => { review.claimVerdicts[0].claimSha256 = "f".repeat(64); },
    review => { review.claimVerdicts[0].allCitedPassagesSupport = "true"; },
    review => { review.claimSupport = [["S1P2"], ["S1P4"]]; },
  ]) {
    const attempt = await run({ mutateResponse: (response, index) => { if (index === 2) mutate(response.editorialPayload.reviews[0]); } });
    assert.equal(attempt.result, null);
    assert.equal(attempt.calls.length, 3);
  }
});

test("mixed stage provenance refuses wrong providers, models, request hashes and malformed response hashes", async () => {
  for (let target = 0; target < 3; target++) for (const mutate of [
    response => { response.provider = "paid-openai"; },
    response => { response.model = target === 2 ? DEFAULT_CLOUDFLARE_AI_MODEL : FREE_REASONING_WRITER_MODEL; },
    response => { response.requestSha256 = "f".repeat(64); },
    response => { response.responseSha256 = "not-a-response-hash"; },
  ]) {
    const attempt = await run({ mutateResponse: (response, index) => { if (index === target) mutate(response); } });
    assert.equal(attempt.result, null);
    assert.equal(attempt.calls.length, target + 1);
    assert.ok(attempt.events.some(event => event.code === "MIXED_REVIEW_PROVENANCE_INVALID"));
  }
});

test("a malformed foundation cannot smuggle unbound provenance through the allocated composition recovery", async () => {
  const attempt = await run({ intercept: async (_options, response, index) => {
    if (index === 0) throw Object.assign(new Error("Synthetic invalid foundation"), {
      code: WORKERS_AI_EDITORIAL_FORMAT_INVALID, inference: { ...response, requestSha256: "f".repeat(64) },
    });
  } });
  assert.equal(attempt.result, null);
  assert.equal(attempt.calls.length, 1);
  assert.ok(attempt.events.some(event => event.code === "MIXED_REVIEW_PROVENANCE_INVALID"));
});

test("mixed network wrapper permits only the stage's exact endpoint and request, and blocks a fourth network attempt", async () => {
  for (const alter of [
    (url, options) => [url.replace("api.cloudflare.com", "example.com"), options],
    (_url, options) => [workersAiRunUrl(accountId, FREE_REASONING_WRITER_MODEL), options],
    (url, options) => [url, { ...options, method: "GET" }],
    (url, options) => [url, { ...options, redirect: "follow" }],
    (url, options) => [url, { ...options, body: "{}" }],
  ]) {
    let network = 0;
    const attempt = await run({ fetchImpl: async () => { network++; return {}; }, intercept: async (options, _response, index) => {
      if (index !== 0) return;
      await options.fetchImpl(...alter(workersAiRunUrl(accountId, options.model), {
        method: "POST", redirect: "error", body: JSON.stringify(buildWorkersAiRequest(options).body),
      }));
    } });
    assert.equal(attempt.result, null);
    assert.equal(network, 0);
    assert.equal(attempt.calls.length, 1);
  }
  let network = 0;
  const fourth = await run({ fetchImpl: async () => { network++; return {}; }, intercept: async (options, _response, index) => {
    const url = workersAiRunUrl(accountId, options.model);
    const request = { method: "POST", redirect: "error", body: JSON.stringify(buildWorkersAiRequest(options).body) };
    await options.fetchImpl(url, request);
    if (index === 2) await options.fetchImpl(url, request);
  } });
  assert.equal(fourth.result, null);
  assert.equal(fourth.calls.length, 3);
  assert.equal(network, 3);
  assert.ok(fourth.events.some(event => event.code === "MIXED_REVIEW_REQUEST_BUDGET"));
});

test("the native adapter preserves exact stage fingerprints through successful review and one bounded foundation recovery", async () => {
  for (const malformedFoundation of [false, true]) {
    const requests = [];
    const responseHashes = [];
    const result = await synthesizeGroundedEditorial({ editorial: baseline(), candidates: [candidate],
      accountId, apiToken: "synthetic-mixed-review-token", reviewProfile: EXPERIMENTAL_MIXED_REVIEW_PROFILE,
      fetchImpl: async (url, options) => {
        const index = requests.length;
        const body = JSON.parse(options.body);
        requests.push({ url, body });
        assert.equal(url, workersAiRunUrl(accountId, index === 2 ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL));
        assert.equal(options.redirect, "error");
        assert.equal(options.method, "POST");
        const payload = malformedFoundation && index === 1 ? { stories: [groundedDraft] }
          : payloadFor({ messages: body.messages, schema: body.response_format.json_schema }, index);
        const text = JSON.stringify({ success: true, result: {
          response: malformedFoundation && index === 0 ? "not JSON" : JSON.stringify(payload),
        } });
        responseHashes.push(createHash("sha256").update(text).digest("hex"));
        return new Response(text, { status: 200, headers: { "content-type": "application/json" } });
      } });
    assert.ok(result);
    assert.equal(requests.length, 3);
    assert.deepEqual(requests.map(request => request.body.max_tokens), [2_000, 4_000, 8_000]);
    assert.deepEqual(result.inference.stages.map(stage => stage.responseSha256), responseHashes);
    assert.equal(result.inference.semanticReview.responseSha256, responseHashes[2]);
  }
});

test("ordinary daily and explicit-Llama paths retain their original 7800-token and three-request profiles", async () => {
  for (const profile of [null, EXPLICIT_CLAIM_REVIEW_PROFILE]) {
    const attempt = await run({ profile });
    assert.ok(attempt.result);
    assert.deepEqual(attempt.calls.map(call => call.maxTokens), [2_000, 4_000, 1_800]);
    assert.ok(attempt.calls.every(call => call.model === DEFAULT_CLOUDFLARE_AI_MODEL && call.timeoutMs === 90_000));
    assert.equal(attempt.result.inference.stages, undefined);
    assert.equal(attempt.result.inference.semanticReview, undefined);
    assert.equal(attempt.result.inference.responseSha256, hash(attempt.responses.map(response => response.responseSha256)));
  }
  for (const model of [EXPERIMENTAL_FREE_WRITER_MODEL, FREE_REASONING_WRITER_MODEL, LOCAL_AI_MODEL]) {
    const attempt = await run({ model });
    assert.equal(attempt.result, null);
    assert.equal(attempt.calls.length, 0);
    assert.ok(attempt.events.some(event => event.code === "REVIEW_PROFILE_INVALID"));
  }
});

test("the separately selected reasoning pipeline keeps the exact daily prompts and gates but dispatches three truthful GPT-OSS stages", async () => {
  const mixed = await run();
  const attempt = await run({ profile: EXPERIMENTAL_REASONING_PIPELINE_PROFILE });
  assert.ok(attempt.result);
  assert.equal(attempt.calls.length, 3);
  assert.ok(attempt.calls.every(call => call.model === FREE_REASONING_WRITER_MODEL && call.maxTokens === 8_000 &&
    call.timeoutMs === 180_000 && call.maxAttempts === 1 && call.temperature === 0.1 &&
    call.maxRequestBytes === 70_000 && call.maxResponseBytes === 100_000));
  assert.equal(attempt.calls.reduce((sum, call) => sum + call.maxTokens, 0), 24_000);
  for (const [index, call] of attempt.calls.entries()) {
    assert.deepEqual(call.messages, mixed.calls[index].messages);
    assert.deepEqual(call.schema, mixed.calls[index].schema);
    assert.equal(call.responseFormat, mixed.calls[index].responseFormat);
    assert.doesNotMatch(call.messages[0].content, /Reasoning: low|\/no_think/);
  }
  const inference = attempt.result.inference;
  assert.equal(inference.model, FREE_REASONING_WRITER_MODEL);
  assert.equal(inference.responseId, attempt.responses[1].responseId);
  assert.ok(inference.stages.every(stage => stage.model === FREE_REASONING_WRITER_MODEL));
  assert.equal(inference.semanticReview.profile, EXPERIMENTAL_REASONING_PIPELINE_PROFILE);
  assert.equal(inference.semanticReview.model, FREE_REASONING_WRITER_MODEL);
  assert.equal(inference.semanticReview.requestedOutputTokens, 8_000);
  assert.equal(inference.requestSha256, hash(inference.stages.map(({ stage, provider, model, requestSha256 }) => ({ stage, provider, model, requestSha256 }))));
  assert.equal(inference.responseSha256, hash(inference.stages.map(({ stage, provider, model, responseSha256 }) => ({ stage, provider, model, responseSha256 }))));
});

test("the all-reasoning profile still rejects every claim and whole-story veto without another approval attempt", async () => {
  for (const mutateVerdict of [
    review => { review.claimVerdicts[0].allCitedPassagesSupport = false; },
    review => { review.claimVerdicts[1].allCitedPassagesSupport = false; },
    ...flags.map(field => review => { review[field] = false; }),
    review => { review.claimVerdicts.forEach(claim => { claim.allCitedPassagesSupport = false; }); flags.forEach(field => { review[field] = false; }); },
  ]) {
    const attempt = await run({ profile: EXPERIMENTAL_REASONING_PIPELINE_PROFILE, mutateVerdict });
    assert.equal(attempt.result, null);
    assert.equal(attempt.calls.length, 3);
    assert.ok(attempt.events.some(event => event.stage === "semantic-evidence-check" && event.accepted === 0));
  }
  for (const mutate of [
    review => { delete review.rejections; },
    review => { review.draftSha256 = "f".repeat(64); },
    review => { review.claimVerdicts[0].claimSha256 = "f".repeat(64); },
    review => { review.claimSupport = [["S1P2"], ["S1P4"]]; },
  ]) {
    const attempt = await run({ profile: EXPERIMENTAL_REASONING_PIPELINE_PROFILE,
      mutateResponse: (response, index) => { if (index === 2) mutate(response.editorialPayload.reviews[0]); } });
    assert.equal(attempt.result, null);
    assert.equal(attempt.calls.length, 3);
  }
});

test("all-reasoning drafts still fail originality and reader word-count checks before reaching review", async () => {
  const copied = await run({ profile: EXPERIMENTAL_REASONING_PIPELINE_PROFILE, mutateResponse: (response, index) => {
    if (index === 1) response.editorialPayload.copies[0].whyItMatters = groundedEvidence.summary;
  } });
  assert.equal(copied.result, null);
  assert.equal(copied.calls.length, 2);
  assert.ok(copied.events.some(event => event.rejectionCodes?.includes("ORIGINALITY")));
  const short = await run({ profile: EXPERIMENTAL_REASONING_PIPELINE_PROFILE, mutateResponse: (response, index) => {
    if (index === 0) response.editorialPayload.foundations[0].claims = [
      { text: "According to CERT/CC, AOMEI Backupper's amwrtdrv.sys driver grants local users disk-write access.",
        supports: groundedDraft.claims[0].supports },
      { text: "CERT/CC describes a potential loss of stored information but provides no fixed version or confirmed attacks.",
        supports: groundedDraft.claims[1].supports },
    ];
    if (index === 1) Object.assign(response.editorialPayload.copies[0], {
      whyItMatters: "An unauthorized disk change could damage the information an affected machine stores. This possibility matters to administrators responsible for keeping backup data recoverable.",
      whatToDoOrWatch: "Check the installed driver against the advisory, and watch the vendor for a documented correction before assuming that an ordinary backup test proves protection.",
    });
  } });
  assert.equal(short.result, null);
  assert.equal(short.calls.length, 2);
  assert.ok(short.events.some(event => event.rejectionCodes?.includes("WORD_COUNT")));
});

test("all-reasoning request provenance cannot claim a Llama stage or accept a mismatched provider or fingerprint", async () => {
  for (let target = 0; target < 3; target++) for (const mutate of [
    response => { response.model = DEFAULT_CLOUDFLARE_AI_MODEL; },
    response => { response.provider = "paid-openai"; },
    response => { response.requestSha256 = "f".repeat(64); },
    response => { response.responseSha256 = "not-a-response-hash"; },
  ]) {
    const attempt = await run({ profile: EXPERIMENTAL_REASONING_PIPELINE_PROFILE,
      mutateResponse: (response, index) => { if (index === target) mutate(response); } });
    assert.equal(attempt.result, null);
    assert.equal(attempt.calls.length, target + 1);
    assert.ok(attempt.events.some(event => event.code === "MIXED_REVIEW_PROVENANCE_INVALID"));
  }
  for (const model of [EXPERIMENTAL_FREE_WRITER_MODEL, FREE_REASONING_WRITER_MODEL, LOCAL_AI_MODEL]) {
    const attempt = await run({ profile: EXPERIMENTAL_REASONING_PIPELINE_PROFILE, model });
    assert.equal(attempt.result, null);
    assert.equal(attempt.calls.length, 0);
  }
});

test("the all-reasoning transport refuses changed endpoints and blocks a fourth request", async () => {
  let network = 0;
  const wrongEndpoint = await run({ profile: EXPERIMENTAL_REASONING_PIPELINE_PROFILE,
    fetchImpl: async () => { network++; return {}; }, intercept: async options => {
      await options.fetchImpl(workersAiRunUrl(accountId, DEFAULT_CLOUDFLARE_AI_MODEL), {
        method: "POST", redirect: "error", body: JSON.stringify(buildWorkersAiRequest(options).body),
      });
    } });
  assert.equal(wrongEndpoint.result, null);
  assert.equal(network, 0);
  const fourth = await run({ profile: EXPERIMENTAL_REASONING_PIPELINE_PROFILE,
    fetchImpl: async () => { network++; return {}; }, intercept: async (options, _response, index) => {
      const url = workersAiRunUrl(accountId, FREE_REASONING_WRITER_MODEL);
      const request = { method: "POST", redirect: "error", body: JSON.stringify(buildWorkersAiRequest(options).body) };
      await options.fetchImpl(url, request);
      if (index === 2) await options.fetchImpl(url, request);
    } });
  assert.equal(fourth.result, null);
  assert.equal(fourth.calls.length, 3);
  assert.equal(network, 3);
  assert.ok(fourth.events.some(event => event.code === "MIXED_REVIEW_REQUEST_BUDGET"));
});

test("the native all-GPT-OSS adapter retains truthful stage hashes during success and one malformed-foundation recovery", async () => {
  for (const malformedFoundation of [false, true]) {
    const requests = [];
    const responseHashes = [];
    const result = await synthesizeGroundedEditorial({ editorial: baseline(), candidates: [candidate],
      accountId, apiToken: "synthetic-mixed-review-token", reviewProfile: EXPERIMENTAL_REASONING_PIPELINE_PROFILE,
      fetchImpl: async (url, options) => {
        const index = requests.length;
        const body = JSON.parse(options.body);
        requests.push({ url, body });
        assert.equal(url, workersAiRunUrl(accountId, FREE_REASONING_WRITER_MODEL));
        const payload = malformedFoundation && index === 1 ? { stories: [groundedDraft] }
          : payloadFor({ messages: body.messages, schema: body.response_format.json_schema }, index);
        const text = JSON.stringify({ success: true, result: {
          response: malformedFoundation && index === 0 ? "not JSON" : JSON.stringify(payload),
        } });
        responseHashes.push(createHash("sha256").update(text).digest("hex"));
        return new Response(text, { status: 200, headers: { "content-type": "application/json" } });
      } });
    assert.ok(result);
    assert.equal(requests.length, 3);
    assert.deepEqual(requests.map(request => request.body.max_tokens), [8_000, 8_000, 8_000]);
    assert.equal(result.inference.model, FREE_REASONING_WRITER_MODEL);
    assert.deepEqual(result.inference.stages.map(stage => stage.responseSha256), responseHashes);
    assert.ok(result.inference.stages.every(stage => stage.model === FREE_REASONING_WRITER_MODEL));
  }
});
