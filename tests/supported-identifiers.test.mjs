import test from "node:test";
import assert from "node:assert/strict";
import { expandSupportedCvePairs } from "../scripts/automation/free/supported-identifiers.mjs";

const evidence = "The reports identify CVE-2026-85102 and CVE-2026-85103.";
test("CVE shorthand expands only to the two complete cited identifiers", () => {
  assert.equal(expandSupportedCvePairs("Fixes cover CVE-2026-85102/85103.", evidence),
    "Fixes cover CVE-2026-85102 and CVE-2026-85103.");
  assert.equal(expandSupportedCvePairs("cve-2026-85102 / 85103", evidence),
    "CVE-2026-85102 and CVE-2026-85103");
});
test("unknown IDs, inferred years, ranges and longer lists are not repaired", () => {
  for (const copy of ["CVE-2026-85102/85104", "CVE-2025-85102/85103",
    "CVE-2026-85102/85102", "CVE-2026-85102/85103/85104",
    "CVE-2026-85102/85103-85104", "85101/CVE-2026-85102/85103",
    "R82.10/82.20", "CVE-2026-85102/CVE-2026-85103"]) {
    assert.equal(expandSupportedCvePairs(copy, evidence), copy);
  }
  assert.equal(expandSupportedCvePairs("CVE-2026-85102/85103", "CVE-2026-85102 only"),
    "CVE-2026-85102/85103");
  assert.equal(expandSupportedCvePairs("CVE-2026-85102/85103", "2026-85102 and 2026-85103"),
    "CVE-2026-85102/85103");
});
test("formatting preserves unrelated prose and is idempotent", () => {
  const copy = "Forecast, not observed attacks: CVE-2026-85102/85103. Verify scope.";
  const result = expandSupportedCvePairs(copy, evidence);
  assert.equal(result, "Forecast, not observed attacks: CVE-2026-85102 and CVE-2026-85103. Verify scope.");
  assert.equal(expandSupportedCvePairs(result, evidence), result);
  assert.equal(expandSupportedCvePairs(null, evidence), null);
  assert.equal(expandSupportedCvePairs(copy, undefined), copy);
});
