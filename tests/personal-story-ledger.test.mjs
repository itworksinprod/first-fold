import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PERSONAL_STORY_LEDGER_MAX_BYTES,
  PERSONAL_STORY_LEDGER_RETENTION_DAYS,
  buildPersonalRepeatHistory as buildPersonalRepeatHistoryImpl,
  createEmptyPersonalStoryLedger as createEmptyPersonalStoryLedgerImpl,
  fingerprintFeedCandidate as fingerprintFeedCandidateImpl,
  fingerprintPersonalStory as fingerprintPersonalStoryImpl,
  fingerprintRepeatIdentity as fingerprintRepeatIdentityImpl,
  parsePersonalStoryLedger as parsePersonalStoryLedgerImpl,
  runPersonalStoryLedgerCli as runPersonalStoryLedgerCliImpl,
  serializePersonalStoryLedger as serializePersonalStoryLedgerImpl,
  updatePersonalStoryLedger as updatePersonalStoryLedgerImpl,
  validatePersonalStoryLedger as validatePersonalStoryLedgerImpl,
} from "../scripts/automation/personal-story-ledger.mjs";

const DESKS = ["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"];
const FINGERPRINT_KEY = "cloudflare-workers-ai-test-token-that-is-long-enough";

const keyedOptions = (options = {}) => ({ ...options, fingerprintKey: FINGERPRINT_KEY });
const createEmptyPersonalStoryLedger = (options = {}) =>
  createEmptyPersonalStoryLedgerImpl({ ...options, fingerprintKey: FINGERPRINT_KEY });
const fingerprintRepeatIdentity = (identity, options = {}) =>
  fingerprintRepeatIdentityImpl(identity, keyedOptions(options));
const fingerprintFeedCandidate = (candidate, options = {}) =>
  fingerprintFeedCandidateImpl(candidate, keyedOptions(options));
const fingerprintPersonalStory = (story, options = {}) =>
  fingerprintPersonalStoryImpl(story, keyedOptions(options));
const validatePersonalStoryLedger = (ledger, options = {}) =>
  validatePersonalStoryLedgerImpl(ledger, keyedOptions(options));
const parsePersonalStoryLedger = (text, options = {}) =>
  parsePersonalStoryLedgerImpl(text, keyedOptions(options));
const serializePersonalStoryLedger = (ledger, options = {}) =>
  serializePersonalStoryLedgerImpl(ledger, keyedOptions(options));
const buildPersonalRepeatHistory = (ledger, options = {}) =>
  buildPersonalRepeatHistoryImpl(ledger, keyedOptions(options));
const updatePersonalStoryLedger = (ledger, edition, options = {}) =>
  updatePersonalStoryLedgerImpl(ledger, edition, keyedOptions(options));
const runPersonalStoryLedgerCli = (args, options = {}) =>
  runPersonalStoryLedgerCliImpl(args, {
    ...options,
    env: { ...options.env, CLOUDFLARE_AI_API_TOKEN: FINGERPRINT_KEY },
  });

function storyFor({
  desk = "ai",
  date = "2026-08-24",
  index = 0,
  score = 82,
  authoritative = false,
} = {}) {
  const slug = `${desk}-${date}-${index}`;
  const sources = [{
    id: `${slug}-origin`,
    title: "Primary report",
    publisher: "Example Publisher Secret",
    url: `https://reports.example/${slug}?utm_source=private&b=2&a=1`,
    relationship: "originating",
  }];
  if (!authoritative) {
    sources.push({
      id: `${slug}-independent`,
      title: "Independent confirmation",
      publisher: "Second Publisher Secret",
      url: `https://independent.example/${slug}`,
      relationship: "independent",
    });
  }
  sources.push({
    id: `${slug}-context`,
    title: "Feed endpoint",
    publisher: "Example Publisher Secret",
    url: "https://reports.example/feed.xml",
    relationship: "context",
  });
  return {
    id: `story-${slug}`,
    canonicalEventKey: `private-event-${slug}`,
    desk,
    headline: `Example Corp patches CVE-2026-${String(4000 + index).padStart(4, "0")} in a critical product`,
    deck: "Private reader-facing deck copy must never enter the ledger.",
    whatHappened: "Private article text must never enter the ledger.",
    whyItMatters: "Private analysis text must never enter the ledger.",
    whatToDoOrWatch: "Private action text must never enter the ledger.",
    editorial: { primaryEntity: "Example Corp" },
    selection: { score },
    sources,
    evidence: [{ statement: "CVE evidence must be hashed, not persisted." }],
  };
}

function editionFor(date, { storyCount = 3, sourceOrderReversed = false } = {}) {
  const stories = DESKS.slice(0, storyCount).map((desk, index) => {
    const story = storyFor({ desk, date, index, score: 80 + index });
    if (sourceOrderReversed) story.sources.reverse();
    return story;
  });
  return {
    editionDate: date,
    desks: Object.fromEntries(DESKS.map((desk) => {
      const story = stories.find((item) => item.desk === desk) ?? null;
      return [desk, { desk, story, emptyReason: story === null ? "Quiet desk." : null }];
    })),
  };
}

function utcDate(offset) {
  return new Date(Date.parse("2026-08-01T00:00:00.000Z") + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

test("repeat identities are deterministic, domain-separated HMAC-SHA-256 fingerprints", () => {
  const first = fingerprintRepeatIdentity({
    canonicalEventKey: "  Event-Key  ".trim(),
    sourceUrls: [
      "https://EXAMPLE.com/report?b=2&utm_source=secret&a=1#fragment",
      "https://other.example/report",
    ],
    strongIdentifier: "CVE-2026-4000",
    primaryEntity: "AWS",
    title: "AWS launches safer tools for children in 2026",
  });
  const second = fingerprintRepeatIdentity({
    canonicalEventKey: "event-key",
    sourceUrls: [
      "https://other.example/report",
      "https://example.com/report?a=1&b=2",
    ],
    strongIdentifier: "cve-2026-4000",
    primaryEntity: "Amazon",
    title: "AWS launches safer tools for children in 2026",
  });
  assert.deepEqual(first, second);
  for (const value of [
    first.eventKeySha256,
    ...first.sourceUrlSha256,
    first.strongIdentifierSha256,
    first.entitySha256,
    ...first.titleTokenSha256,
  ]) {
    assert.match(value, /^[a-f0-9]{64}$/);
  }
  assert.notEqual(first.eventKeySha256, first.entitySha256);
  assert.equal(JSON.stringify(first).includes("event-key"), false);
  assert.equal(JSON.stringify(first).includes("example.com"), false);
  const otherKeyIdentity = fingerprintRepeatIdentityImpl({
    canonicalEventKey: "event-key",
    sourceUrls: [
      "https://other.example/report",
      "https://example.com/report?a=1&b=2",
    ],
    strongIdentifier: "cve-2026-4000",
    primaryEntity: "Amazon",
    title: "AWS launches safer tools for children in 2026",
  }, { fingerprintKey: "a-different-cloudflare-token-with-enough-entropy" });
  assert.notDeepEqual(first, otherKeyIdentity);
});

test("feed candidates and canonical stories produce compatible private identities", () => {
  const story = storyFor();
  const storyIdentity = fingerprintPersonalStory(story);
  const candidateIdentity = fingerprintFeedCandidate({
    canonicalEventKey: story.canonicalEventKey,
    title: story.headline,
    primaryEntity: story.editorial.primaryEntity,
    verifiedFacts: story.evidence.map((claim) => claim.statement),
    sources: story.sources,
  });
  for (const key of [
    "eventKeySha256",
    "sourceUrlSha256",
    "strongIdentifierSha256",
    "entitySha256",
    "titleTokenSha256",
  ]) {
    assert.deepEqual(storyIdentity[key], candidateIdentity[key]);
  }
  assert.equal(storyIdentity.evidenceTier, "corroborated");
  assert.equal(fingerprintPersonalStory(storyFor({ authoritative: true })).evidenceTier, "authoritative-single");
});

test("the ledger persists no headlines, URLs, publishers, identifiers, or article text", () => {
  const edition = editionFor("2026-08-24");
  const updated = updatePersonalStoryLedger(createEmptyPersonalStoryLedger(), edition);
  const serialized = serializePersonalStoryLedger(updated, { asOfDate: "2026-08-24" });
  for (const secret of [
    "Example Corp",
    "Example Publisher Secret",
    "reports.example",
    "independent.example",
    "CVE-2026-4000",
    "Private reader-facing deck copy",
    "Private article text",
    "private-event",
  ]) {
    assert.equal(serialized.includes(secret), false, `serialized ledger leaked ${secret}`);
  }
  assert.match(serialized, /"schemaVersion": 2/);
  assert.match(serialized, /"fingerprintAlgorithm": "hmac-sha256-v1"/);
  assert.match(serialized, /"retentionDays": 30/);
  assert.equal(updated.recordedEditionCount, 1);
  assert.equal(updated.editions[0].stories.length, 3);
});

test("keyed ledgers and story recording fail closed without the exact high-entropy key", () => {
  assert.throws(
    () => createEmptyPersonalStoryLedgerImpl(),
    /fingerprint key is required/,
  );
  assert.throws(
    () => fingerprintPersonalStoryImpl(storyFor()),
    /fingerprint key is required/,
  );
  const ledger = createEmptyPersonalStoryLedger();
  assert.throws(
    () => updatePersonalStoryLedgerImpl(ledger, editionFor("2026-08-24")),
    /fingerprint key is required/,
  );
  assert.throws(
    () => validatePersonalStoryLedgerImpl(ledger, {
      asOfDate: "2026-08-24",
      fingerprintKey: "a-different-cloudflare-token-with-enough-entropy",
    }),
    /does not match this ledger/,
  );
});

test("repeat history exposes bounded fingerprints, counts, pilot ordinal, and state digest", () => {
  let ledger = createEmptyPersonalStoryLedger();
  ledger = updatePersonalStoryLedger(ledger, editionFor("2026-08-24"));
  const history = buildPersonalRepeatHistory(ledger, { asOfDate: "2026-08-24" });
  assert.equal(history.entries.length, 3);
  assert.equal(history.priorEditionCount, 1);
  assert.equal(history.priorStoryCount, 3);
  assert.equal(history.nextPilotOrdinal, 2);
  assert.match(history.stateSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(history.entries[0]), [
    "editionDate",
    "desk",
    "eventKeySha256",
    "sourceUrlSha256",
    "strongIdentifierSha256",
    "entitySha256",
    "titleTokenSha256",
    "score",
    "evidenceTier",
    "factualSourceCount",
  ]);
});

test("a delivered zero-story quiet edition advances ledger state and is idempotent", () => {
  const editionDate = "2026-08-24";
  const quietEdition = editionFor(editionDate, { storyCount: 0 });
  const empty = createEmptyPersonalStoryLedger();
  const before = buildPersonalRepeatHistory(empty, { asOfDate: editionDate });
  assert.equal(before.priorEditionCount, 0);
  assert.equal(before.priorStoryCount, 0);
  assert.equal(before.nextPilotOrdinal, 1);

  const recorded = updatePersonalStoryLedger(empty, quietEdition);
  assert.equal(recorded.recordedEditionCount, 1);
  assert.equal(recorded.updatedThrough, editionDate);
  assert.deepEqual(recorded.editions, [{ editionDate, stories: [] }]);

  const serialized = serializePersonalStoryLedger(recorded, { asOfDate: editionDate });
  const parsed = parsePersonalStoryLedger(serialized, { asOfDate: editionDate });
  assert.deepEqual(parsed, recorded);
  assert.equal(serializePersonalStoryLedger(parsed, { asOfDate: editionDate }), serialized);

  const after = buildPersonalRepeatHistory(parsed, { asOfDate: editionDate });
  assert.equal(after.priorEditionCount, 1);
  assert.equal(after.priorStoryCount, 0);
  assert.equal(after.nextPilotOrdinal, 2);
  assert.deepEqual(after.entries, []);

  const retried = updatePersonalStoryLedger(parsed, quietEdition);
  assert.deepEqual(retried, recorded);
  assert.equal(
    serializePersonalStoryLedger(retried, { asOfDate: editionDate }),
    serialized,
  );
});

test("pruning keeps the current date plus exactly 30 prior calendar dates", () => {
  let ledger = createEmptyPersonalStoryLedger();
  for (let offset = 0; offset <= 30; offset += 1) {
    const date = utcDate(offset);
    ledger = updatePersonalStoryLedger(ledger, editionFor(date, { storyCount: 1 }), { asOfDate: date });
  }
  assert.equal(PERSONAL_STORY_LEDGER_RETENTION_DAYS, 30);
  assert.equal(ledger.recordedEditionCount, 31);
  assert.equal(ledger.editions.length, 31);
  assert.equal(ledger.editions[0].editionDate, "2026-08-01");
  assert.equal(ledger.editions.at(-1).editionDate, "2026-08-31");
  const nextDay = validatePersonalStoryLedger(ledger, { asOfDate: "2026-09-01" });
  assert.equal(nextDay.editions.length, 30);
  assert.equal(nextDay.editions[0].editionDate, "2026-08-02");
  assert.equal(buildPersonalRepeatHistory(ledger, { asOfDate: "2026-08-31" }).nextPilotOrdinal, null);
});

test("validation fails closed on unknown fields, malformed fingerprints, ordering, and inconsistent counts", () => {
  const valid = updatePersonalStoryLedger(createEmptyPersonalStoryLedger(), editionFor("2026-08-24"));
  const unknown = structuredClone(valid);
  unknown.editions[0].stories[0].headline = "cleartext must be rejected";
  assert.throws(
    () => validatePersonalStoryLedger(unknown, { asOfDate: "2026-08-24" }),
    /missing or unsupported fields/,
  );

  const uppercase = structuredClone(valid);
  uppercase.editions[0].stories[0].eventKeySha256 = "A".repeat(64);
  assert.throws(
    () => validatePersonalStoryLedger(uppercase, { asOfDate: "2026-08-24" }),
    /lowercase SHA-256/,
  );

  const unsorted = structuredClone(valid);
  unsorted.editions[0].stories.reverse();
  assert.throws(
    () => validatePersonalStoryLedger(unsorted, { asOfDate: "2026-08-24" }),
    /canonical order/,
  );

  const inconsistent = structuredClone(valid);
  inconsistent.recordedEditionCount = 0;
  assert.throws(
    () => validatePersonalStoryLedger(inconsistent, { asOfDate: "2026-08-24" }),
    /inconsistent/,
  );

  const future = structuredClone(valid);
  assert.throws(
    () => validatePersonalStoryLedger(future, { asOfDate: "2026-08-23" }),
    /future/,
  );
});

test("parsing enforces the ledger byte limit before JSON processing", () => {
  const oversized = `{"padding":"${"x".repeat(PERSONAL_STORY_LEDGER_MAX_BYTES)}"}`;
  assert.throws(() => parsePersonalStoryLedger(oversized, { asOfDate: "2026-08-24" }), /byte limit/);
});

test("validation enforces tight edition, source, and title-token count bounds", () => {
  const one = updatePersonalStoryLedger(
    createEmptyPersonalStoryLedger(),
    editionFor("2026-08-01", { storyCount: 1 }),
  );
  const template = one.editions[0];
  const tooManyEditions = {
    ...one,
    recordedEditionCount: 32,
    updatedThrough: "2026-09-01",
    editions: Array.from({ length: 32 }, (_, index) => ({
      editionDate: utcDate(index),
      stories: structuredClone(template.stories),
    })),
  };
  assert.throws(
    () => validatePersonalStoryLedger(tooManyEditions, { asOfDate: "2026-09-01" }),
    /too many editions/,
  );

  const tooManySources = structuredClone(one);
  tooManySources.editions[0].stories[0].sourceUrlSha256 = Array.from(
    { length: 9 },
    (_, index) => index.toString(16).padStart(64, "0"),
  );
  tooManySources.editions[0].stories[0].factualSourceCount = 9;
  assert.throws(
    () => validatePersonalStoryLedger(tooManySources, { asOfDate: "2026-08-01" }),
    /invalid fingerprint count/,
  );

  const tooManyTokens = structuredClone(one);
  tooManyTokens.editions[0].stories[0].titleTokenSha256 = Array.from(
    { length: 13 },
    (_, index) => index.toString(16).padStart(64, "0"),
  );
  assert.throws(
    () => validatePersonalStoryLedger(tooManyTokens, { asOfDate: "2026-08-01" }),
    /invalid fingerprint count/,
  );
});

test("serialization is deterministic across source order and update retries", () => {
  const first = updatePersonalStoryLedger(
    createEmptyPersonalStoryLedger(),
    editionFor("2026-08-24"),
  );
  const second = updatePersonalStoryLedger(
    createEmptyPersonalStoryLedger(),
    editionFor("2026-08-24", { sourceOrderReversed: true }),
  );
  const firstText = serializePersonalStoryLedger(first, { asOfDate: "2026-08-24" });
  const secondText = serializePersonalStoryLedger(second, { asOfDate: "2026-08-24" });
  assert.equal(firstText, secondText);
  assert.equal(
    serializePersonalStoryLedger(
      updatePersonalStoryLedger(first, editionFor("2026-08-24")),
      { asOfDate: "2026-08-24" },
    ),
    firstText,
  );
  const changed = editionFor("2026-08-24");
  changed.desks.ai.story.selection.score = 99;
  assert.throws(() => updatePersonalStoryLedger(first, changed), /different edition/);
});

test("prepare bootstraps only on rollout day and record atomically stores a valid candidate", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "first-fold-ledger-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ledgerPath = path.join(root, "repeat-ledger.json");
  const candidatePath = path.join(root, "candidate.json");
  const output = [];
  const stdout = { write(value) { output.push(value); } };

  await assert.rejects(
    runPersonalStoryLedgerCliImpl([
      "prepare",
      path.join(root, "missing-key.json"),
      "--edition-date",
      "2026-08-24",
      "--rollout-date",
      "2026-08-24",
    ], { stdout, env: {} }),
    /fingerprint key is required/,
  );

  await assert.rejects(
    runPersonalStoryLedgerCli([
      "prepare",
      path.join(root, "missing-after-rollout.json"),
      "--edition-date",
      "2026-08-25",
      "--rollout-date",
      "2026-08-24",
    ], { stdout }),
    /missing after the rollout date/,
  );

  await runPersonalStoryLedgerCli([
    "prepare",
    path.join(root, "trusted-late-bootstrap.json"),
    "--edition-date",
    "2026-08-25",
    "--rollout-date",
    "2026-08-24",
    "--allow-bootstrap",
    "--recorded-edition-count",
    "4",
  ], { stdout });
  const recovered = JSON.parse(await readFile(path.join(root, "trusted-late-bootstrap.json"), "utf8"));
  assert.equal(recovered.recordedEditionCount, 4);

  await assert.rejects(
    runPersonalStoryLedgerCli([
      "prepare",
      path.join(root, "unguarded-count.json"),
      "--edition-date",
      "2026-08-25",
      "--rollout-date",
      "2026-08-24",
      "--recorded-edition-count",
      "4",
    ], { stdout }),
    /requires a valid guarded bootstrap/,
  );

  await runPersonalStoryLedgerCli([
    "prepare",
    ledgerPath,
    "--edition-date",
    "2026-08-19",
    "--rollout-date",
    "2026-08-19",
  ], { stdout });
  const candidate = await readFile(new URL("../content/editions/2026-08-19.json", import.meta.url), "utf8");
  await writeFile(candidatePath, candidate);
  await assert.rejects(
    runPersonalStoryLedgerCliImpl([
      "record",
      ledgerPath,
      candidatePath,
      "--edition-date",
      "2026-08-19",
    ], { stdout, env: {} }),
    /fingerprint key is required/,
  );
  await runPersonalStoryLedgerCli([
    "record",
    ledgerPath,
    candidatePath,
    "--edition-date",
    "2026-08-19",
  ], { stdout });

  const storedText = await readFile(ledgerPath, "utf8");
  const stored = parsePersonalStoryLedger(storedText, { asOfDate: "2026-08-19" });
  assert.equal(stored.recordedEditionCount, 1);
  assert.equal(stored.editions[0].stories.length, 3);
  assert.equal(output.join("").includes("Prepared personal repeat ledger through 2026-08-19: 0 editions, 0 stories."), true);
  assert.equal(output.join("").includes("Recorded personal repeat ledger for 2026-08-19: 1 editions, 3 stories."), true);
  for (const desk of Object.values(JSON.parse(candidate).desks)) {
    if (desk.story) assert.equal(output.join("").includes(desk.story.headline), false);
  }

  const legacyPath = path.join(root, "legacy-repeat-ledger.json");
  const legacy = structuredClone(stored);
  legacy.schemaVersion = 1;
  delete legacy.fingerprintAlgorithm;
  delete legacy.keyCheckHmacSha256;
  await writeFile(legacyPath, `${JSON.stringify(legacy, null, 2)}\n`);
  await runPersonalStoryLedgerCli([
    "prepare",
    legacyPath,
    "--edition-date",
    "2026-08-19",
    "--rollout-date",
    "2026-08-19",
  ], { stdout });
  const migrated = parsePersonalStoryLedger(await readFile(legacyPath, "utf8"), {
    asOfDate: "2026-08-19",
  });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.recordedEditionCount, 1);
  assert.deepEqual(migrated.editions, []);
  assert.match(output.join(""), /legacy unkeyed repeat ledger to keyed HMAC fingerprints/);
});
