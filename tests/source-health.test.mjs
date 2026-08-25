import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FREE_DESKS } from "../scripts/automation/free/feed-engine.mjs";
import { FREE_FEED_SOURCES } from "../scripts/automation/free/feed-sources.mjs";
import {
  SOURCE_HEALTH_MAX_HTML_BYTES,
  SOURCE_HEALTH_MAX_JSON_BYTES,
  SOURCE_HEALTH_SCHEMA_VERSION,
  buildSourceHealthSnapshot,
  renderSourceHealthHtml,
  renderSourceHealthMarkdown,
  sourceHealthFailureCode,
  validateSourceHealthSnapshot,
  writeSourceHealthBundle,
} from "../scripts/automation/source-health.mjs";

const automation = Object.freeze({
  repository: "itworksinprod/first-fold",
  runId: "32597530508",
  runUrl: "https://github.com/itworksinprod/first-fold/actions/runs/32597530508",
});
const settings = Object.freeze({
  evidencePolicy: "authoritative-or-corroborated",
  lookbackHours: 72,
  minimumScore: 70.5,
  minimumAuthoritativeScore: 70,
  draftSelectedSlate: true,
  maxResearchAttempts: 2,
  researchRetryBelowStoryCount: 2,
});

function researchFixture({ failedSourceIds = [], selectedDesk = null, quiet = selectedDesk === null } = {}) {
  const failed = new Set(failedSourceIds);
  const sourceResults = FREE_FEED_SOURCES.map((source) => ({
    sourceId: source.id,
    publisherKey: source.publisherKey,
    publisher: "ATTACKER-CONTROLLED LABEL",
    status: failed.has(source.id) ? "failed" : "ok",
    code: failed.has(source.id) ? "TIMEOUT" : null,
    parsedItemCount: failed.has(source.id) ? 0 : 2,
    eligibleItemCount: failed.has(source.id) ? 0 : 1,
    itemCount: failed.has(source.id) ? 0 : 1,
    message: "API key re_secret_should_never_escape",
    finalUrl: `https://private.invalid/${source.id}`,
    redirects: [{ url: "https://private.invalid/redirect" }],
    providerResponse: { story: "untrusted headline" },
  }));
  const eligibleItemCount = sourceResults.reduce((sum, source) => sum + source.eligibleItemCount, 0);
  const selected = quiet ? 0 : 1;
  const desks = Object.fromEntries(FREE_DESKS.map((desk) => {
    const isSelected = desk === selectedDesk;
    return [desk, {
      desk,
      candidates: isSelected ? [{ candidateId: "secret-story-id", title: "untrusted headline" }] : [],
      selectedCandidate: isSelected ? { candidateId: "secret-story-id" } : null,
      emptyReason: isSelected ? null : "untrusted editorial copy",
    }];
  }));
  return {
    candidates: quiet ? [] : [{ candidateId: "secret-story-id" }],
    selectedCandidates: quiet ? [] : [{ candidateId: "secret-story-id" }],
    desks,
    diagnostics: {
      sourceResults,
      parsedItemCount: sourceResults.reduce((sum, source) => sum + source.parsedItemCount, 0),
      eligibleItemCount,
      candidateCount: selected,
      rankedCandidateCount: selected,
      rejectedCandidateCount: quiet ? 2 : 1,
      rejectionCounts: quiet
        ? { BELOW_EDITORIAL_THRESHOLD: 1, INSUFFICIENT_SOURCE_EVIDENCE: 1 }
        : { RECENT_DUPLICATE: 1 },
      selectedCount: selected,
      consumedBytes: 999_999,
      coverageByDesk: { ai: { successfulSourceIds: ["attacker-label"] } },
    },
    citationUrlAllowlist: ["https://private.invalid/article"],
    sourceTextTrust: "untrusted",
    providerResponse: "secret provider response",
  };
}

function buildSnapshot(overrides = {}) {
  return buildSourceHealthSnapshot({
    editionDate: "2026-08-25",
    automation,
    runMode: "on_time",
    settings,
    attempts: [{ research: researchFixture() }],
    selectedAttempt: 1,
    outcome: "not-needed",
    ...overrides,
  });
}

test("builds a strict source-health snapshot using only checked-in source metadata", () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.schemaVersion, SOURCE_HEALTH_SCHEMA_VERSION);
  assert.equal(snapshot.attempts[0].status, "healthy-quiet");
  assert.equal(snapshot.attempts[0].aggregate.selectedCount, 0);
  assert.equal(snapshot.attempts[0].aggregate.eligibleItemCount, FREE_FEED_SOURCES.length);
  assert.equal(snapshot.attempts[0].sources[0].publisher, FREE_FEED_SOURCES[0].publisher);
  assert.deepEqual(snapshot.attempts[0].sources[0].desks, FREE_FEED_SOURCES[0].coverageDesks);

  const serialized = JSON.stringify(snapshot);
  for (const forbidden of [
    "ATTACKER-CONTROLLED",
    "private.invalid",
    "redirect",
    "re_secret_should_never_escape",
    "untrusted headline",
    "secret-story-id",
    "provider response",
    "consumedBytes",
    "coverageByDesk",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `snapshot leaked ${forbidden}`);
  }
  assert.ok(Buffer.byteLength(serialized) < SOURCE_HEALTH_MAX_JSON_BYTES);
  assert.equal(validateSourceHealthSnapshot(snapshot), snapshot);
});

test("distinguishes healthy quiet, degraded quiet, and ingestion failure", () => {
  const healthyQuiet = buildSnapshot();
  assert.equal(healthyQuiet.attempts[0].status, "healthy-quiet");

  const degradedQuiet = buildSnapshot({
    attempts: [{ research: researchFixture({ failedSourceIds: ["openai-news"] }) }],
  });
  assert.equal(degradedQuiet.attempts[0].status, "degraded-quiet");
  assert.equal(degradedQuiet.attempts[0].sources[0].status, "failed");
  assert.equal(degradedQuiet.attempts[0].sources[0].code, "TIMEOUT");

  const first = researchFixture({ selectedDesk: "work-and-tools" });
  const failed = researchFixture({ failedSourceIds: FREE_FEED_SOURCES.map((source) => source.id) });
  const fallback = buildSnapshot({
    attempts: [{ research: first }, { research: failed }],
    selectedAttempt: 1,
    outcome: "coverage-fallback",
  });
  assert.equal(fallback.attempts[1].status, "ingestion-failure");
  assert.equal(fallback.attempts[1].code, "DESK_COVERAGE_FAILED");
  assert.ok(fallback.attempts[1].desks.every((desk) =>
    desk.coverageStatus === "insufficient-corroboration"));
});

test("retains both sanitized attempts and validates improved selection", () => {
  const snapshot = buildSnapshot({
    attempts: [
      { research: researchFixture() },
      { research: researchFixture({ selectedDesk: "ai" }) },
    ],
    selectedAttempt: 2,
    outcome: "improved",
  });
  assert.equal(snapshot.attempts.length, 2);
  assert.equal(snapshot.attempts[0].aggregate.selectedCount, 0);
  assert.equal(snapshot.attempts[1].aggregate.selectedCount, 1);
  assert.equal(snapshot.attempts[1].status, "healthy");
});

test("reduces unobserved research failures to a fixed public representation", () => {
  const snapshot = buildSnapshot({
    attempts: [{ error: { code: "API_TOKEN_RE_SECRET_VALUE", message: "secret" } }],
    selectedAttempt: null,
    outcome: "failed",
  });
  assert.equal(snapshot.attempts[0].status, "research-failure");
  assert.equal(snapshot.attempts[0].code, "RESEARCH_FAILED");
  assert.ok(snapshot.attempts[0].sources.every((source) =>
    source.status === "not-observed" && source.code === null));
  assert.equal(JSON.stringify(snapshot).includes("SECRET"), false);
  assert.equal(sourceHealthFailureCode({ code: "TIMEOUT" }), "TIMEOUT");
  assert.equal(sourceHealthFailureCode({ code: "API_TOKEN_RE_SECRET_VALUE" }), "RESEARCH_FAILED");
});

test("strict validation rejects extra fields, metadata drift, duplicates, and cross-total drift", () => {
  const extra = structuredClone(buildSnapshot());
  extra.attempts[0].sources[0].message = "not allowed";
  assert.throws(() => validateSourceHealthSnapshot(extra), /unexpected or missing fields/);

  const label = structuredClone(buildSnapshot());
  label.attempts[0].sources[0].publisher = "Injected publisher";
  assert.throws(() => validateSourceHealthSnapshot(label), /checked-in metadata/);

  const duplicate = structuredClone(buildSnapshot());
  duplicate.attempts[0].sources[1] = structuredClone(duplicate.attempts[0].sources[0]);
  assert.throws(() => validateSourceHealthSnapshot(duplicate), /checked-in metadata/);

  const total = structuredClone(buildSnapshot());
  total.attempts[0].aggregate.parsedItemCount += 1;
  assert.throws(() => validateSourceHealthSnapshot(total), /aggregate totals/);

  const run = structuredClone(buildSnapshot());
  run.run.runUrl = "https://example.com/actions/runs/32597530508";
  assert.throws(() => validateSourceHealthSnapshot(run), /trusted First Fold GitHub run identity/);
});

test("renders bounded, escaped, self-contained Markdown and HTML", () => {
  const snapshot = buildSnapshot();
  const markdown = renderSourceHealthMarkdown(snapshot);
  const html = renderSourceHealthHtml(snapshot);
  assert.match(markdown, /Healthy Quiet/);
  assert.match(markdown, /observational only/i);
  assert.match(html, /AI &amp; Models/);
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /private\.invalid|secret-story-id|secret provider response/i);
  assert.ok(Buffer.byteLength(html) < SOURCE_HEALTH_MAX_HTML_BYTES);
});

test("writes an exclusive three-file source-health bundle without overwriting", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "first-fold-source-health-"));
  try {
    const bundle = await writeSourceHealthBundle(buildSnapshot(), temporary);
    assert.deepEqual(
      [path.basename(bundle.jsonPath), path.basename(bundle.markdownPath), path.basename(bundle.htmlPath)],
      ["source-health.json", "source-health.md", "source-health.html"],
    );
    assert.equal((await stat(bundle.jsonPath)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(bundle.jsonPath, "utf8")).schemaVersion,
      SOURCE_HEALTH_SCHEMA_VERSION);
    assert.equal(await readFile(bundle.markdownPath, "utf8"), bundle.markdown);
    assert.equal(await readFile(bundle.htmlPath, "utf8"), bundle.html);
    await assert.rejects(
      writeSourceHealthBundle(buildSnapshot(), temporary),
      (error) => error?.code === "EEXIST",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
