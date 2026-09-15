import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createPrivateEditorialDiagnosticCollector, validatePrivateEditorialDiagnosticKey,
  MAX_PRIVATE_EDITORIAL_DIAGNOSTIC_BYTES, MAX_PRIVATE_EDITORIAL_DIAGNOSTIC_RECORDS } from
  "../scripts/automation/private-editorial-diagnostic.mjs";
import { openDiagnostic } from "../scripts/automation/private-writer-diagnostic.mjs";
import { groundedDossiers, validatePrivateEditorialDiagnostic, EXPERIMENTAL_MIXED_REVIEW_PROFILE,
  EXPERIMENTAL_REASONING_PIPELINE_PROFILE, MAX_PRIVATE_EDITORIAL_PACKET_BYTES } from "../scripts/automation/free/grounded-draft.mjs";
import { buildExplicitClaimReview } from "../scripts/automation/free/explicit-claim-review.mjs";
import { buildReviewRejectionDiagnostic, validateReviewRejectionDiagnostic, resolveReviewRejectionDiagnostic } from
  "../scripts/automation/free/review-rejections.mjs";
import { countReaderFacingStoryWords } from "../scripts/edition-content.mjs";
import { groundedDraft, groundedEvidence } from "./fixtures/grounded-summary.mjs";

const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
const publicKey = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const candidate = { candidateId: groundedDraft.candidateId, suggestedDesk: "security-and-privacy",
  ranking: { score: 77, evidenceTier: "authoritative-single" }, feedEvidence: [groundedEvidence],
  sources: [{ id: "cert-advisory", title: groundedEvidence.title, publisher: "CERT/CC",
    relationship: "originating", publishedAt: groundedEvidence.publishedAt }] };

function packets(profile = EXPERIMENTAL_REASONING_PIPELINE_PROFILE, rejected = false, transform = () => {}) {
  const draft = structuredClone(groundedDraft);
  const dossier = groundedDossiers([candidate])[0];
  transform(draft, dossier);
  const bundle = buildReviewRejectionDiagnostic(buildExplicitClaimReview({ drafts: [draft], dossiers: [dossier] }));
  const entry = bundle.data.drafts[0];
  const raw = { reviews: [{ candidateId: draft.candidateId, draftSha256: entry.draftSha256,
    claimVerdicts: entry.claimEvidence.map(({ claimIndex, claimSha256 }) => ({ claimIndex, claimSha256,
      allCitedPassagesSupport: !(rejected && claimIndex === 0) })),
    factsSupported: !rejected, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true,
    rejections: rejected ? [
      { gate: "claim:0", sentenceId: "claim:0", rule: "uncertain-support", evidenceIds: [draft.claims[0].supports[0].evidenceId] },
      { gate: "factsSupported", sentenceId: "claim:0", rule: "uncertain-support", evidenceIds: [draft.claims[0].supports[0].evidenceId] },
    ] : [],
  }] };
  const checked = validateReviewRejectionDiagnostic(raw, bundle);
  assert.deepEqual(checked.errors, []);
  const base = { version: 1, profile, submittedCount: 1, skippedCount: 0 };
  return [
    { ...base, stage: "assembled-drafts", entries: [{ draft, dossier, review: null,
      localCheck: { accepted: true, wordCount: countReaderFacingStoryWords({ ...draft,
        whatHappened: draft.claims.map(claim => claim.text).join(" ") }), failures: [] } }] },
    { ...base, stage: "review-verdicts", entries: [{ draft: structuredClone(draft), dossier: structuredClone(dossier), localCheck: null,
      review: { canonical: checked.reviews[0], rejections: checked.diagnostics.map(value => resolveReviewRejectionDiagnostic(value, bundle)) } }] },
  ];
}

test("collector encrypts only the two strictly assembled records and keeps rejected verdicts rejected", async () => {
  for (const profile of [EXPERIMENTAL_MIXED_REVIEW_PROFILE, EXPERIMENTAL_REASONING_PIPELINE_PROFILE]) {
    const sourcePackets = packets(profile, true);
    assert.ok(sourcePackets.every(validatePrivateEditorialDiagnostic));
    const before = structuredClone(sourcePackets);
    const collector = createPrivateEditorialDiagnosticCollector({ publicKey });
    assert.equal(collector.onPrivateEditorialDiagnostic(sourcePackets[0]), true);
    assert.equal(collector.onPrivateEditorialDiagnostic(sourcePackets[1]), true);
    sourcePackets[0].entries[0].draft.headline = "A mutation after collection";
    sourcePackets[1].entries[0].review.canonical.factsSupported = true;
    const encrypted = await collector.finalize();
    assert.deepEqual(Object.keys(encrypted).sort(), ["ciphertext", "iv", "tag", "version", "wrappedKey"]);
    assert.ok(!JSON.stringify(encrypted).includes(groundedDraft.headline));
    const decrypted = openDiagnostic(encrypted, pair.privateKey);
    assert.deepEqual(decrypted, { version: 1, purpose: "private-editorial-diagnostics-not-an-edition", records: before });
    assert.equal(decrypted.records[1].entries[0].review.canonical.factsSupported, false);
    assert.deepEqual(decrypted.records[1].entries[0].review.canonical.claimSupport[0], []);
    assert.ok(Buffer.byteLength(JSON.stringify(decrypted), "utf8") <= MAX_PRIVATE_EDITORIAL_DIAGNOSTIC_BYTES);
    assert.equal(await collector.finalize(), null);
    assert.equal(collector.onPrivateEditorialDiagnostic(before[0]), false);
  }
});

test("key preflight rejects absent, malformed or wrong-size keys before any collection and exposes only fixed errors", () => {
  assert.equal(validatePrivateEditorialDiagnosticKey(publicKey), true);
  const short = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
  for (const invalid of [undefined, null, "", "PRIVATE_INVALID_KEY", ` ${publicKey}`, short, "A".repeat(600)]) {
    assert.throws(() => validatePrivateEditorialDiagnosticKey(invalid), error =>
      error.code === "PRIVATE_EDITORIAL_DIAGNOSTIC_KEY_INVALID" && error.message === error.code);
    if (invalid !== undefined) assert.throws(() => createPrivateEditorialDiagnosticCollector({ publicKey: invalid }), error =>
      error.code === "PRIVATE_EDITORIAL_DIAGNOSTIC_KEY_INVALID" && error.message === error.code);
  }
  let credentialRead = false;
  const extras = { publicKey };
  Object.defineProperty(extras, "apiToken", { get() { credentialRead = true; throw new Error("PRIVATE_CREDENTIAL"); } });
  assert.throws(() => createPrivateEditorialDiagnosticCollector(extras), error =>
    error.code === "PRIVATE_EDITORIAL_DIAGNOSTIC_CONFIGURATION_INVALID");
  assert.equal(credentialRead, false);
});

test("without a key the collector is inert and never even inspects a supplied packet", async () => {
  let inspected = false;
  const packet = new Proxy({}, { ownKeys() { inspected = true; throw new Error("PRIVATE_PACKET"); } });
  for (const options of [undefined, {}, { publicKey: undefined }]) {
    const collector = createPrivateEditorialDiagnosticCollector(options);
    assert.equal(collector.onPrivateEditorialDiagnostic(packet), false);
    assert.equal(await collector.finalize(), null);
  }
  assert.equal(inspected, false);
});

test("malformed fields, provider envelopes, secrets, accessors, cycles and special prototypes cannot enter ciphertext", async () => {
  const mutations = [
    packet => { packet.reasoning = "PRIVATE_REASONING"; },
    packet => { packet.headers = { authorization: "PRIVATE_AUTH" }; },
    packet => { packet.environment = { API_TOKEN: "PRIVATE_TOKEN" }; },
    packet => { packet.entries[0].draft.rawResponse = "PRIVATE_PROVIDER_OUTPUT"; },
    packet => { packet.entries[0].dossier.sources[0].apiToken = "PRIVATE_TOKEN"; },
    packet => { packet.entries[0].localCheck.failure = new Error("PRIVATE_ERROR"); },
    packet => { packet.entries[0].draft.claims[0].supports[0].extra = true; },
    packet => { packet.entries[0].dossier.sources[0].text = packet; },
    packet => { packet.stage = "raw-provider"; },
    packet => { packet.entries[0].review = { response: "raw" }; },
    packet => { packet.entries[0].draft = Object.assign(Object.create({ inherited: true }), packet.entries[0].draft); },
    packet => { packet.toJSON = () => ({ apiToken: "PRIVATE_TOKEN" }); },
    packet => { packet[Symbol("untrusted")] = "PRIVATE_SYMBOL"; },
  ];
  const collector = createPrivateEditorialDiagnosticCollector({ publicKey });
  for (const mutate of mutations) {
    const packet = packets()[0]; mutate(packet);
    assert.equal(collector.onPrivateEditorialDiagnostic(packet), false);
  }
  let getterRead = false;
  const accessor = packets()[0];
  Object.defineProperty(accessor, "version", { get() { getterRead = true; throw new Error("PRIVATE_GETTER"); }, enumerable: true });
  assert.equal(collector.onPrivateEditorialDiagnostic(accessor), false);
  assert.equal(getterRead, false);
  assert.equal(collector.onPrivateEditorialDiagnostic(new Proxy({}, { ownKeys() { throw new Error("PRIVATE_SINK_FAILURE"); } })), false);
  assert.equal(await collector.finalize(), null);
});

test("collector bounds record count, stage order, profile consistency and oversized input without affecting valid records", async () => {
  assert.equal(MAX_PRIVATE_EDITORIAL_DIAGNOSTIC_RECORDS, 2);
  assert.equal(MAX_PRIVATE_EDITORIAL_DIAGNOSTIC_BYTES, 160_000);
  const [assembled, reviewed] = packets();
  const oversized = structuredClone(assembled);
  oversized.entries[0].dossier.sources[0].text = "界".repeat(80_001);
  const collector = createPrivateEditorialDiagnosticCollector({ publicKey });
  assert.equal(collector.onPrivateEditorialDiagnostic(oversized), false);
  assert.equal(collector.onPrivateEditorialDiagnostic(assembled), true);
  assert.equal(collector.onPrivateEditorialDiagnostic(assembled), false);
  assert.equal(collector.onPrivateEditorialDiagnostic(packets(EXPERIMENTAL_MIXED_REVIEW_PROFILE)[1]), false);
  assert.equal(collector.onPrivateEditorialDiagnostic(reviewed), true);
  assert.equal(collector.onPrivateEditorialDiagnostic(reviewed), false);
  const decrypted = openDiagnostic(await collector.finalize(), pair.privateKey);
  assert.equal(decrypted.records.length, 2);
  const reverse = createPrivateEditorialDiagnosticCollector({ publicKey });
  assert.equal(reverse.onPrivateEditorialDiagnostic(reviewed), true);
  assert.equal(reverse.onPrivateEditorialDiagnostic(assembled), false);
  assert.equal(openDiagnostic(await reverse.finalize(), pair.privateKey).records.length, 1);
});

test("total encrypted plaintext budget includes the envelope overhead and drops rather than truncates an otherwise valid packet", async () => {
  const sizedPacket = (stageIndex, padding, suffix = 0) => {
    const entries = [0, 1, 2].map(index => packets(EXPERIMENTAL_REASONING_PIPELINE_PROFILE, false, (draft, dossier) => {
      draft.candidateId += `-large-${index}`;
      dossier.candidateId = draft.candidateId;
      dossier.sources.push({ sourceId: "synthetic-additional-context", publisher: "Synthetic Context Publisher",
        publisherKey: "synthetic-context", relationship: "independent",
        text: "界".repeat(padding) + (index === 2 ? "x".repeat(suffix) : ""),
        passages: [{ evidenceId: "S2P1", text: "界".repeat(padding) }] });
    })[stageIndex].entries[0]);
    return { version: 1, profile: EXPERIMENTAL_REASONING_PIPELINE_PROFILE,
      stage: stageIndex === 0 ? "assembled-drafts" : "review-verdicts", submittedCount: 3, skippedCount: 0, entries };
  };
  const atPacketLimit = stageIndex => {
    let low = 1, high = 5_700;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const bytes = Buffer.byteLength(JSON.stringify(sizedPacket(stageIndex, middle)), "utf8");
      if (bytes <= MAX_PRIVATE_EDITORIAL_PACKET_BYTES) low = middle;
      else high = middle - 1;
    }
    const base = sizedPacket(stageIndex, low);
    const remainder = MAX_PRIVATE_EDITORIAL_PACKET_BYTES - Buffer.byteLength(JSON.stringify(base), "utf8");
    assert.ok(remainder >= 0 && remainder < 18);
    const result = sizedPacket(stageIndex, low, remainder);
    assert.equal(Buffer.byteLength(JSON.stringify(result), "utf8"), MAX_PRIVATE_EDITORIAL_PACKET_BYTES);
    assert.equal(validatePrivateEditorialDiagnostic(result), true);
    return result;
  };
  const first = atPacketLimit(0);
  const second = atPacketLimit(1);
  const collector = createPrivateEditorialDiagnosticCollector({ publicKey });
  assert.equal(collector.onPrivateEditorialDiagnostic(first), true);
  assert.equal(collector.onPrivateEditorialDiagnostic(second), false);
  const decrypted = openDiagnostic(await collector.finalize(), pair.privateKey);
  assert.deepEqual(decrypted.records, [first]);
  assert.ok(Buffer.byteLength(JSON.stringify(decrypted), "utf8") <= MAX_PRIVATE_EDITORIAL_DIAGNOSTIC_BYTES);
});
