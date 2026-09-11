import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assertRequestedPreview, runRequestedPreview } from "../scripts/automation/personal-preview.mjs";

const env = {
  GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main",
  GITHUB_ACTOR: "itworksinprod", GITHUB_TRIGGERING_ACTOR: "itworksinprod", GITHUB_RUN_ATTEMPT: "1",
  GITHUB_EVENT_NAME: "push", GITHUB_RUN_ID: "1234", GITHUB_SHA: "a".repeat(40),
  GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/personal-preview.yml@refs/heads/main",
  PREVIEW_CONFIRMATION: "SEND PREVIEW 2026-09-11",
};
const now = new Date("2026-09-11T22:00:00Z");
test("the preview gate is owner-only, same-day, trusted-main and first-attempt only", () => {
  assert.doesNotThrow(() => assertRequestedPreview(env, now));
  for (const key of Object.keys(env)) {
    assert.throws(() => assertRequestedPreview({ ...env, [key]: "invalid" }, now), /gate is closed/);
  }
  for (const date of ["2026-09-11T09:59:59Z", "2026-09-12T04:00:00Z", "2026-09-10T22:00:00Z"]) {
    assert.throws(() => assertRequestedPreview(env, new Date(date)), /gate is closed/);
  }
});
test("a closed preview gate prevents both model use and sending", async () => {
  let calls = 0;
  await assert.rejects(runRequestedPreview({ env: { ...env, GITHUB_RUN_ATTEMPT: "2" }, now,
    generate: async () => { calls++; }, send: async () => { calls++; } }), /gate is closed/);
  assert.equal(calls, 0);
});
test("the preview workflow is not scheduled and has no public or ledger artifact writes", async () => {
  const workflow = await readFile(new URL("../.github/workflows/personal-preview.yml", import.meta.url), "utf8");
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /github\.run_attempt == 1/);
  assert.match(workflow, /PERSONAL_PAPER_EMAIL: \$\{\{ secrets\.PERSONAL_PAPER_EMAIL \}\}/);
  assert.doesNotMatch(workflow, /schedule:|upload-artifact|actions: write|contents: write|OPENAI_API_KEY/);
});
