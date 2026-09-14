import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { draftFreeEdition } from "../scripts/automation/draft-free-edition.mjs";
import { EXPLICIT_CLAIM_REVIEW_PROFILE } from "../scripts/automation/free/explicit-claim-review.mjs";

test("explicit review is rejected before research for unknown, non-grounded or other-model profiles", async () => {
  let calls = 0;
  for (const override of [
    { groundedReviewProfile: "unknown-profile" },
    { groundedSummaries: false },
    { model: "@cf/qwen/qwen3-30b-a3b-fp8" },
  ]) {
    await assert.rejects(draftFreeEdition({
      draftSelectedSlate: true, trustedEvidenceDigestOnly: true,
      groundedSummaries: true, maxModelRequests: 7,
      groundedReviewProfile: EXPLICIT_CLAIM_REVIEW_PROFILE,
      researchImpl: async () => { calls++; throw new Error("Must not research"); },
      aiRequestImpl: async () => { calls++; throw new Error("Must not infer"); },
      ...override,
    }), /Explicit claim review requires/);
  }
  assert.equal(calls, 0);
});

test("no-email reviewer opt-in rejects duplicate or unknown arguments before using credentials", () => {
  const script = new URL("../scripts/automation/check-personal-quality.mjs", import.meta.url);
  for (const args of [["--explicit-claim-review", "--explicit-claim-review"], ["--unknown-review"]]) {
    const result = spawnSync(process.execPath, [fileURLToPath(script), ...args], { encoding: "utf8", env: {} });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Quality failure/);
    assert.doesNotMatch(result.stdout + result.stderr, /api\.cloudflare|resend|Authorization/i);
  }
});

test("production delivery does not silently opt into the experimental review contract", async () => {
  const workflow = await readFile(new URL("../.github/workflows/personal-morning-paper.yml", import.meta.url), "utf8");
  const script = await readFile(new URL("../scripts/automation/personal-free-edition.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(workflow + script, /explicit-claim-review|explicit-claim-verdicts-v1|groundedReviewProfile/);
});
