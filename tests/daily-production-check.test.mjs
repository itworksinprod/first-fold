import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertDailyProductionCheckAuthority, assertDailySummaryCoverage } from "../scripts/automation/daily-production-check.mjs";

const authority = { GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main",
  GITHUB_ACTOR: "itworksinprod", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1",
  GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/daily-production-quality-check.yml@refs/heads/main" };

test("daily no-email qualification accepts only its exact owner/manual/main context", () => {
  assert.doesNotThrow(() => assertDailyProductionCheckAuthority(authority));
  for (const field of Object.keys(authority)) {
    assert.throws(() => assertDailyProductionCheckAuthority({ ...authority, [field]: "other" }), /trusted manual/);
  }
  assert.throws(() => assertDailyProductionCheckAuthority({ ...authority, FREE_WRITER_MODEL: "experimental" }), /unchanged writer/);
});

test("daily qualification never counts one/two stories or unreviewed fallbacks as three summaries", () => {
  for (const [stories, checked] of [[0, 0], [1, 1], [2, 2], [3, 2], [4, 3], [5, 5], [3, "3"], [NaN, NaN]]) {
    assert.throws(() => assertDailySummaryCoverage(stories, checked), /three checked summaries/);
  }
  assert.doesNotThrow(() => assertDailySummaryCoverage(3, 3));
  assert.doesNotThrow(() => assertDailySummaryCoverage(4, 4));
});

test("daily qualification has no delivery credentials, paid provider, schedule, artifacts or experimental profile", async () => {
  const workflow = await readFile(new URL("../.github/workflows/daily-production-quality-check.yml", import.meta.url), "utf8");
  const script = await readFile(new URL("../scripts/automation/check-personal-quality.mjs", import.meta.url), "utf8");
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(workflow, /schedule:|push:|pull_request|RESEND|OPENAI|GEMINI|PERSONAL_PAPER_EMAIL|upload-artifact|contents: write|FREE_WRITER_MODEL/);
  assert.match(workflow, /group: personal-morning-paper/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /persist-credentials: false/);
  assert.ok(workflow.indexOf("run: npm test") < workflow.indexOf("CLOUDFLARE_AI_API_TOKEN:"));
  for (const expression of ["github.repository == 'itworksinprod/first-fold'", "github.ref == 'refs/heads/main'",
    "github.actor == 'itworksinprod'", "github.run_attempt == 1"]) assert.ok(workflow.includes(expression));
  assert.match(workflow, /check-personal-quality\.mjs --daily-production\s*$/);
  assert.match(script, /if \(dailyProduction\) assertDailySummaryCoverage\(stories, checkedStories\)/);
  assert.ok(script.indexOf("assertDailyProductionCheckAuthority(process.env)") < script.indexOf("await generatePersonalFreeEdition"));
});
