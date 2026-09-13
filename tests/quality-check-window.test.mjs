import assert from "node:assert/strict";
import test from "node:test";
import { qualityCheckWindow } from "../scripts/automation/quality-check-window.mjs";

test("no-email checks reserve twenty minutes and use the correct real-date generation mode", () => {
  for (const [iso, runMode] of [
    ["2026-09-13T09:05:00Z", "on_time"],
    ["2026-09-13T10:00:00Z", "same_day_backfill"],
    ["2026-09-14T03:39:59Z", "same_day_backfill"],
    ["2026-12-13T10:05:00Z", "on_time"],
  ]) {
    assert.equal(qualityCheckWindow(new Date(iso)).runMode, runMode);
  }
  assert.equal(qualityCheckWindow(new Date("2026-09-14T03:39:59Z")).editionDate, "2026-09-13");
  for (const iso of ["2026-09-13T08:59:59Z", "2026-09-13T09:40:00Z",
    "2026-09-13T09:59:59Z", "2026-09-14T03:40:00Z", "2026-09-14T04:02:00Z"]) {
    assert.throws(() => qualityCheckWindow(new Date(iso)), { code: "QUALITY_START_WINDOW_CLOSED" });
  }
});
