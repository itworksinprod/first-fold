import assert from "node:assert/strict";
import test from "node:test";
import { HISTORICAL_PREVIEW, authorizeHistoricalPreview, assertHistoricalPreviewAuthorization,
  isHistoricalPreviewRecord, isHistoricalPreviewTiming } from "../scripts/automation/historical-preview-policy.mjs";

const env = { PREVIEW_CONFIRMATION: HISTORICAL_PREVIEW.confirmation, GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main", GITHUB_ACTOR: "itworksinprod",
  GITHUB_TRIGGERING_ACTOR: "itworksinprod", GITHUB_RUN_ATTEMPT: "1", GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/personal-preview.yml@refs/heads/main",
  GITHUB_RUN_ID: "1234", GITHUB_SHA: "a".repeat(40) };
const now = new Date("2026-09-12T05:00:00.000Z");

test("historical preview authority is date-bound, owner-only and cannot be serialized or forged", () => {
  const token = authorizeHistoricalPreview(env, now);
  assert.ok(Object.isFrozen(token));
  assert.equal(assertHistoricalPreviewAuthorization(token, now, "2026-09-11"), true);
  for (const fake of [undefined, {}, structuredClone(token), JSON.parse(JSON.stringify(token))]) {
    assert.throws(() => assertHistoricalPreviewAuthorization(fake, now, "2026-09-11"), { code: "HISTORICAL_PREVIEW_CLOSED" });
  }
  for (const field of Object.keys(env)) {
    assert.throws(() => authorizeHistoricalPreview({ ...env, [field]: "invalid" }, now), { code: "HISTORICAL_PREVIEW_CLOSED" });
  }
  for (const date of ["2026-09-12T03:59:59Z", "2026-09-13T04:00:00Z", "invalid"]) {
    assert.throws(() => authorizeHistoricalPreview(env, date), { code: "HISTORICAL_PREVIEW_CLOSED" });
    assert.throws(() => assertHistoricalPreviewAuthorization(token, date, "2026-09-11"), { code: "HISTORICAL_PREVIEW_CLOSED" });
  }
  assert.throws(() => assertHistoricalPreviewAuthorization(token, now, "2026-09-12"), { code: "HISTORICAL_PREVIEW_CLOSED" });
});

test("historical metadata cannot imply an archived research clock or allow later-day reuse", () => {
  const record = { editionDate: "2026-09-11", requestedOn: "2026-09-12", revision: HISTORICAL_PREVIEW.revision };
  assert.equal(isHistoricalPreviewRecord(record), true);
  for (const invalid of [null, [], {}, { ...record, authorized: true }, { ...record, editionDate: "2026-09-12" }]) {
    assert.equal(isHistoricalPreviewRecord(invalid), false);
  }
  const timing = { editionDate: "2026-09-11", generatedAt: now.toISOString(), checkedAt: "2026-09-12T05:10:00.000Z" };
  assert.equal(isHistoricalPreviewTiming(timing), true);
  for (const patch of [{ editionDate: "2026-09-10" }, { generatedAt: "2026-09-11T20:00:00Z" },
    { checkedAt: "2026-09-13T04:00:00Z" }, { checkedAt: "2026-09-12T04:30:00Z" }, { generatedAt: "invalid" }]) {
    assert.equal(isHistoricalPreviewTiming({ ...timing, ...patch }), false);
  }
});
