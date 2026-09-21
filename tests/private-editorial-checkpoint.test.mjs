import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { EXPERIMENTAL_MIXED_REVIEW_PROFILE, EXPERIMENTAL_REASONING_PIPELINE_PROFILE,
  MAX_PRIVATE_EDITORIAL_PACKET_BYTES, groundedDossiers, synthesizeGroundedEditorial,
  validatePrivateEditorialDiagnostic } from "../scripts/automation/free/grounded-draft.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, WORKERS_AI_PROVIDER, buildWorkersAiRequest } from
  "../scripts/automation/free/workers-ai.mjs";
import { groundedDraft, groundedEvidence, dailyCopyParts } from "./fixtures/grounded-summary.mjs";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const accountId = "0".repeat(32);
const apiToken = "synthetic-private-checkpoint-token";
const candidate = { candidateId: groundedDraft.candidateId, suggestedDesk: "security-and-privacy",
  ranking: { evidenceTier: "authoritative-single" }, feedEvidence: [groundedEvidence],
  sources: [{ id: "cert-advisory", title: groundedEvidence.title, publisher: "CERT/CC",
    relationship: "originating", publishedAt: groundedEvidence.publishedAt }] };
const flags = ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"];

function payloadFor(options, index) {
  if (index === 0) return { foundations: [{ candidateId: groundedDraft.candidateId, claims: structuredClone(groundedDraft.claims) }] };
  if (index === 1) return { copies: [{ candidateId: groundedDraft.candidateId,
    headline: groundedDraft.headline, deck: groundedDraft.deck,
    whyItMatters: dailyCopyParts(groundedDraft.whyItMatters), whatToDoOrWatch: dailyCopyParts(groundedDraft.whatToDoOrWatch) }] };
  return { reviews: JSON.parse(options.messages[1].content).drafts.map(({ draft, draftSha256, claimEvidence }) => ({
    candidateId: draft.candidateId, draftSha256,
    claimVerdicts: claimEvidence.map(({ claimIndex, claimSha256 }) => ({ claimIndex, claimSha256, allCitedPassagesSupport: true })),
    ...Object.fromEntries(flags.map(field => [field, true])), rejections: [],
  })) };
}

async function run({ profile = EXPERIMENTAL_REASONING_PIPELINE_PROFILE, sink, mutate = () => {},
  retainedCandidate = candidate } = {}) {
  const calls = [];
  const events = [];
  const editorial = { frontPage: { note: "Unaccepted synthetic baseline", estimatedMinutes: 1 }, desks: {
    "security-and-privacy": { story: { id: "story-fixture", headline: "Unaccepted baseline",
      sources: candidate.sources, selection: { score: 77 } } },
  } };
  const result = await synthesizeGroundedEditorial({ editorial, candidates: [retainedCandidate], accountId, apiToken,
    model: DEFAULT_CLOUDFLARE_AI_MODEL, reviewProfile: profile,
    onPrivateEditorialDiagnostic: sink, onDiagnostic: event => events.push(event),
    aiRequestImpl: async options => {
      const index = calls.length;
      const request = buildWorkersAiRequest(options);
      calls.push({ model: options.model, body: request.body, maxTokens: options.maxTokens, timeoutMs: options.timeoutMs });
      const payload = mutate(payloadFor(options, index), index, options) ?? payloadFor(options, index);
      return { provider: WORKERS_AI_PROVIDER, model: options.model, responseId: `synthetic-stage-${index}`,
        requestSha256: hash({ provider: WORKERS_AI_PROVIDER, model: options.model, body: request.body }),
        responseSha256: hash({ payload, index }), editorialPayload: payload };
    } });
  return { result, calls, events, editorial };
}

function rejectFactsAndAnalysis(payload, index) {
  if (index === 2) {
    const review = payload.reviews[0];
    review.factsSupported = false;
    review.analysisSupported = false;
    review.rejections = [
      { gate: "factsSupported", sentenceId: "whyItMatters:0", rule: "unsupported-assertion", evidenceIds: ["S1P2"] },
      { gate: "analysisSupported", sentenceId: "whyItMatters:0", rule: "unsupported-inference", evidenceIds: ["S1P2"] },
    ];
  }
  return payload;
}

test("private checkpoints are detached frozen exact copy/evidence records, not published metadata or extra inference", async () => {
  for (const profile of [EXPERIMENTAL_MIXED_REVIEW_PROFILE, EXPERIMENTAL_REASONING_PIPELINE_PROFILE]) {
    const packets = [];
    const baseline = await run({ profile });
    const observed = await run({ profile, sink: packet => {
      assert.ok(Object.isFrozen(packet));
      assert.ok(Object.isFrozen(packet.entries[0].draft.claims[0].supports));
      assert.throws(() => { packet.entries[0].draft.headline = "SINK_MUTATION"; }, TypeError);
      packets.push(structuredClone(packet));
    } });
    assert.deepEqual(observed, baseline);
    assert.ok(observed.result);
    assert.equal(observed.calls.length, 3);
    assert.deepEqual(packets.map(packet => packet.stage), ["assembled-drafts", "review-verdicts"]);
    assert.ok(packets.every(validatePrivateEditorialDiagnostic));
    assert.deepEqual(packets[0].entries[0].draft, groundedDraft);
    assert.deepEqual(packets[0].entries[0].dossier, groundedDossiers([candidate])[0]);
    assert.equal(packets[0].entries[0].localCheck.accepted, true);
    assert.deepEqual(packets[1].entries[0].review.rejections, []);
    assert.ok(!JSON.stringify(packets).includes(apiToken));
    assert.ok(!JSON.stringify(packets).includes(accountId));
    assert.ok(!JSON.stringify(observed.result.inference).includes("assembled-drafts"));
    assert.ok(!JSON.stringify(observed.events).includes(groundedDraft.whyItMatters));
  }
});

test("rejected review flags remain rejected while sentence and evidence references resolve to retained text", async () => {
  const packets = [];
  const observed = await run({ mutate: rejectFactsAndAnalysis, sink: packet => packets.push(structuredClone(packet)) });
  assert.deepEqual(observed, await run({ mutate: rejectFactsAndAnalysis }));
  assert.equal(observed.result, null);
  assert.equal(observed.calls.length, 3);
  assert.ok(packets.every(validatePrivateEditorialDiagnostic));
  const entry = packets[1].entries[0];
  assert.equal(entry.review.canonical.factsSupported, false);
  assert.equal(entry.review.canonical.analysisSupported, false);
  assert.equal(entry.review.canonical.attributionAccurate, true);
  assert.deepEqual(entry.review.canonical.claimSupport, groundedDraft.claims.map(claim => claim.supports.map(support => support.evidenceId)));
  for (const rejection of entry.review.rejections) {
    assert.equal(rejection.sentence.text, "Backup software is meant to protect recoverability.");
    assert.equal(groundedDraft.whyItMatters.slice(rejection.sentence.start, rejection.sentence.end), rejection.sentence.text);
    assert.equal(rejection.evidence[0].text, entry.dossier.sources[0].passages.find(passage => passage.evidenceId === "S1P2").text);
    assert.equal(rejection.evidence[0].publisher, "CERT/CC");
  }
});

test("valid outer copy rejected for an unsupported number is privately retained without a review request", async () => {
  const packets = [];
  const mutate = (payload, index) => {
    if (index === 0) return { foundations: [] };
    if (index === 1) {
      const draft = structuredClone(groundedDraft);
      draft.claims[0].text += " Version 900 is affected.";
      return { stories: [draft] };
    }
    assert.fail("Locally rejected draft must not reach a reviewer");
  };
  const observed = await run({ mutate, sink: packet => packets.push(structuredClone(packet)) });
  assert.deepEqual(observed, await run({ mutate }));
  assert.equal(observed.result, null);
  assert.equal(observed.calls.length, 2);
  assert.equal(packets.length, 1);
  assert.ok(validatePrivateEditorialDiagnostic(packets[0]));
  assert.equal(packets[0].entries[0].localCheck.accepted, false);
  assert.deepEqual(packets[0].entries[0].localCheck.failures, [{ code: "NUMERIC_CITATION", field: "claims[0].text",
    unsupportedNumericTokens: ["900"], evidenceIds: ["S1P2", "S1P3"] }]);
});

test("malformed composition and unbound review envelopes are never captured as private reader copy", async () => {
  for (const target of [1, 2]) {
    const packets = [];
    const mutate = (payload, index) => index === target ? { ...payload, reasoning: "PRIVATE_RAW_PROVIDER_REASONING" } : payload;
    const observed = await run({ mutate, sink: packet => packets.push(structuredClone(packet)) });
    assert.equal(observed.result, null);
    assert.equal(packets.length, target === 1 ? 0 : 1);
    assert.equal(observed.calls.length, target + 1);
    assert.ok(!JSON.stringify(packets).includes("PRIVATE_RAW_PROVIDER_REASONING"));
    assert.ok(!JSON.stringify(observed.events).includes("PRIVATE_RAW_PROVIDER_REASONING"));
  }
});

test("throwing, rejected and stalled private sinks cannot change the result or the three-call budget", async () => {
  const baseline = await run();
  for (const sink of [
    () => { throw new Error("PRIVATE_SINK_FAILURE"); },
    () => Promise.reject(new Error("PRIVATE_SINK_REJECTION")),
    () => new Promise(() => {}),
  ]) {
    const started = Date.now();
    assert.deepEqual(await run({ sink }), baseline);
    assert.ok(Date.now() - started < 2_000, "Private sink waiting must remain bounded");
  }
});

test("packet validator refuses extra fields, getters, cycles, prototypes, oversize copy and forged resolved references", async () => {
  const packets = [];
  await run({ mutate: rejectFactsAndAnalysis, sink: packet => packets.push(structuredClone(packet)) });
  assert.equal(MAX_PRIVATE_EDITORIAL_PACKET_BYTES, 80_000);
  for (const mutate of [
    packet => { packet.rawResponse = "NOT_A_RECORD"; },
    packet => { packet.profile = "production"; },
    packet => { packet.submittedCount = 5; },
    packet => { packet.skippedCount = 1; },
    packet => { packet.entries.push(structuredClone(packet.entries[0])); packet.submittedCount++; },
    packet => { packet.entries[0].dossier.sources[0].url = "https://example.com/unselected"; },
    packet => { packet.entries[0].localCheck.wordCount++; },
    packet => { packet.entries[0].localCheck.accepted = false; },
    packet => { packet.entries[0].draft.rawReasoning = "NOT_READER_COPY"; },
    packet => { packet.entries[0].dossier.sources[0].text = "界".repeat(MAX_PRIVATE_EDITORIAL_PACKET_BYTES); },
    packet => { packet.entries[0].draft = Object.assign(Object.create({ inherited: true }), packet.entries[0].draft); },
    packet => { packet.entries[0].draft.claims.push(packet); },
    packet => { packet[Symbol("extra")] = "value"; },
  ]) {
    const packet = structuredClone(packets[0]); mutate(packet);
    assert.equal(validatePrivateEditorialDiagnostic(packet), false);
  }
  for (const mutate of [
    entry => { entry.review.canonical.factsSupported = true; },
    entry => { entry.review.canonical.claimSupport[0] = ["S1P2"]; },
    entry => { entry.review.canonical.draftSha256 = "f".repeat(64); },
    entry => { entry.review.rejections[0].sentence.text = "MODEL_GENERATED_EXPLANATION"; },
    entry => { entry.review.rejections[0].sentence.start++; },
    entry => { entry.review.rejections[0].evidence[0].publisher = "Wrong publisher"; },
    entry => { entry.review.rejections[0].evidence[0].text = "Unselected evidence"; },
    entry => { entry.review.rejections[0].reasoning = "MODEL_REASONING"; },
  ]) {
    const packet = structuredClone(packets[1]); mutate(packet.entries[0]);
    assert.equal(validatePrivateEditorialDiagnostic(packet), false);
  }
  let read = false;
  const accessor = structuredClone(packets[0]);
  Object.defineProperty(accessor, "version", { enumerable: true, get() { read = true; throw new Error("GETTER"); } });
  assert.equal(validatePrivateEditorialDiagnostic(accessor), false);
  assert.equal(read, false);
});

test("private hook suppresses any packet containing an exact configured credential instead of redacting evidence", async () => {
  let captured = 0;
  const retainedCandidate = structuredClone(candidate);
  retainedCandidate.feedEvidence[0].summary += ` ${apiToken} is an untrusted synthetic marker.`;
  const baseline = await run({ retainedCandidate });
  const observed = await run({ retainedCandidate, sink: () => { captured++; } });
  assert.deepEqual(observed, baseline);
  assert.equal(observed.calls.length, 3);
  assert.equal(captured, 0);
});
