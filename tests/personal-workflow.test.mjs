import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/personal-morning-paper.yml", import.meta.url),
  "utf8",
);

const triggerBlock = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
const job = workflow.slice(workflow.indexOf("  send:"));
const preflight = job.slice(
  job.indexOf("Require all private-delivery configuration"),
  job.indexOf("Check out trusted main without write credentials"),
);
const generation = job.slice(
  job.indexOf("Generate the private source-checked candidate"),
  job.indexOf("Test the exact private candidate"),
);
const emailStepName = "Send only the validated paper to its private recipient";
const emailStepIndex = job.lastIndexOf(emailStepName);
const email = job.slice(emailStepIndex);

test("the personal paper is dispatch-only, trusted-main-only, and private", () => {
  assert.match(workflow, /^name: Send personal Morning Paper$/m);
  assert.match(workflow, /^run-name: >-[\s\S]+Personal Morning Paper ·/m);
  assert.match(triggerBlock, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(triggerBlock, /schedule:|cron:|push:|pull_request/);
  for (const input of [
    "trigger_source",
    "scheduled_at",
    "dispatch_key",
    "run_mode",
    "backfill_date",
    "backfill_reason",
    "backfill_confirmation",
  ]) {
    assert.match(triggerBlock, new RegExp(`^      ${input}:$`, "m"));
  }
  assert.match(triggerBlock, /^        default: on_time$/m);
  assert.match(triggerBlock, /^          - same_day_backfill$/m);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(job, /github\.repository == 'itworksinprod\/first-fold'/);
  assert.match(job, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /github\.actor == 'itworksinprod'/);

  const permissions = job.slice(job.indexOf("    permissions:"), job.indexOf("    steps:"));
  assert.match(permissions, /^      actions: read$/m);
  assert.match(permissions, /^      contents: read$/m);
  assert.doesNotMatch(permissions, /write|pages:|id-token:|issues:|pull-requests:|statuses:/);
  assert.doesNotMatch(
    workflow,
    /upload-artifact|download-artifact|deploy-pages|configure-pages|gh pr|git push|git commit|pulls\/|\/statuses\//,
  );
});

test("scheduled delivery accepts exactly the daily 5:05 New York provenance", () => {
  assert.match(workflow, /triggerSource === "cloudflare"/);
  assert.match(workflow, /scheduledDate\.toISOString\(\) !== scheduledAt/);
  assert.match(workflow, /scheduledParts\.hour !== "05"/);
  assert.match(workflow, /scheduledParts\.minute !== "05"/);
  assert.match(workflow, /scheduledEditionDate !== currentDate/);
  assert.match(workflow, /suppliedDispatchKey !== `personal:\$\{scheduledEditionDate\}`/);
  assert.match(workflow, /Cloudflare may dispatch only an on_time run with blank backfill fields/);
  assert.match(workflow, /const dispatchKey = `personal:\$\{editionDate\}`/);
  assert.doesNotMatch(workflow, /isWeekday|\["Mon", "Tue", "Wed", "Thu", "Fri"\]/);
});

test("manual delivery has a narrow on-time gate and an explicit same-day backfill", () => {
  assert.match(workflow, /triggerSource === "" \|\| triggerSource === "manual"/);
  assert.match(workflow, /Manual personal-paper dispatches must leave scheduled_at and dispatch_key blank/);
  assert.match(workflow, /minuteOfDay < 5 \* 60 \|\| minuteOfDay >= 6 \* 60/);
  assert.match(workflow, /runMode === "on_time"/);
  assert.match(workflow, /runMode !== "on_time" && runMode !== "same_day_backfill"/);
  assert.match(workflow, /requestedDate !== currentDate/);
  assert.match(workflow, /minuteOfDay < 6 \* 60/);
  assert.match(workflow, /reason\.length < 8/);
  assert.match(workflow, /reason\.length > 200/);
  assert.match(workflow, /confirmation !== `BACKFILL \$\{requestedDate\}`/);
  assert.match(workflow, /--same-day-backfill/);
});

test("successful same-key runs are deduplicated before any credential or AI use", () => {
  assert.match(workflow, /^  group: personal-morning-paper$/m);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(job, /actions: read/);
  assert.match(job, /\/actions\/runs\/\$\{process\.env\.GITHUB_RUN_ID\}/);
  assert.match(job, /actions\/workflows\/personal-morning-paper\.yml\/runs/);
  assert.match(job, /current\.display_title !== process\.env\.EXPECTED_RUN_TITLE/);
  assert.match(
    job,
    /const workflowPath = "\.github\/workflows\/personal-morning-paper\.yml";/,
  );
  assert.match(job, /new Set\(\[workflowPath, `\$\{workflowPath\}@main`\]\)/);
  assert.equal(job.match(/workflowPaths\.has\((?:current|run)\.path\)/g)?.length, 2);
  assert.match(job, /current\.head_sha !== process\.env\.GITHUB_SHA/);
  assert.match(job, /current\.repository\?\.full_name !== process\.env\.GITHUB_REPOSITORY/);
  assert.match(job, /runId < currentRunId/);
  assert.doesNotMatch(job, /run\.conclusion === "success"/);
  assert.doesNotMatch(job, /deliveryJobs\[0\]\.conclusion === "success"/);
  assert.match(job, /const sameDispatchTitles = new Set/);
  assert.match(job, /`Personal Morning Paper · \$\{process\.env\.DISPATCH_KEY\}`/);
  assert.match(job, /sameDispatchTitles\.has\(run\.display_title\)/);
  assert.match(job, /newYorkDate\(run\.created_at\) === process\.env\.EDITION_DATE/);
  assert.match(job, /newYorkDate\(run\.created_at\) < process\.env\.EDITION_DATE/);
  assert.match(job, /actions\/runs\/\$\{run\.id\}\/jobs/);
  assert.match(job, /step\.name === "Send only the validated paper to its private recipient"/);
  assert.match(job, /sendSteps\[0\]\.conclusion === "success"/);
  assert.match(job, /const shouldSend = !priorSuccess/);
  assert.match(job, /should_send=\$\{String\(shouldSend\)\}/);
  assert.doesNotMatch(job, /run\.conclusion === "failure"/);
  assert.ok(
    job.indexOf("Suppress an already successful delivery") <
      job.indexOf("Require all private-delivery configuration"),
  );
  assert.ok(
    job.indexOf("Suppress an already successful delivery") <
      job.indexOf("Generate the private source-checked candidate"),
  );
  assert.equal(
    job.match(/steps\.dedupe\.outputs\.should_send == 'true'/g)?.length,
    7,
  );
  assert.equal(
    job.match(/steps\.preflight\.outputs\.delivery_enabled == 'true'/g)?.length,
    6,
  );
});

test("email setup no-ops only when wholly absent and secrets stay step-scoped", () => {
  for (const setting of [
    "HAS_CLOUDFLARE_AI_API_TOKEN",
    "HAS_RESEND_API_KEY",
    "HAS_PERSONAL_PAPER_EMAIL",
  ]) {
    assert.match(preflight, new RegExp(`${setting}:`));
  }
  assert.match(preflight, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(preflight, /secrets\.CLOUDFLARE_AI_API_TOKEN != ''/);
  assert.match(preflight, /secrets\.RESEND_API_KEY != ''/);
  assert.match(preflight, /secrets\.PERSONAL_PAPER_EMAIL != ''/);
  assert.doesNotMatch(preflight, /CLOUDFLARE_AI_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_AI_API_TOKEN \}\}/);
  assert.doesNotMatch(preflight, /RESEND_API_KEY: \$\{\{ secrets\.RESEND_API_KEY \}\}/);
  assert.doesNotMatch(preflight, /PERSONAL_PAPER_EMAIL: \$\{\{ secrets\.PERSONAL_PAPER_EMAIL \}\}/);
  assert.match(preflight, /"\$\{HAS_RESEND_API_KEY\}" == "false" && "\$\{HAS_PERSONAL_PAPER_EMAIL\}" == "false"/);
  assert.match(preflight, /delivery_enabled=false/);
  assert.match(preflight, /Nothing was generated or sent, and no AI credential was used/);
  assert.match(preflight, /"\$\{HAS_RESEND_API_KEY\}" != "true" \|\| "\$\{HAS_PERSONAL_PAPER_EMAIL\}" != "true"/);
  assert.match(preflight, /must either both be configured or both be absent/);
  assert.match(preflight, /CLOUDFLARE_ACCOUNT_ID.*32/);
  assert.match(preflight, /CLOUDFLARE_AI_API_TOKEN must be configured.*free research/);
  assert.match(preflight, /delivery_enabled=true/);
  assert.ok(
    job.indexOf("Require all private-delivery configuration") <
      job.indexOf("Check out trusted main without write credentials"),
  );
  assert.ok(
    job.indexOf("Require all private-delivery configuration") <
      job.indexOf("Generate the private source-checked candidate"),
  );

  assert.match(generation, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(generation, /CLOUDFLARE_AI_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_AI_API_TOKEN \}\}/);
  assert.match(generation, /CLOUDFLARE_AI_MODEL: '@cf\/openai\/gpt-oss-120b'/);
  assert.doesNotMatch(generation, /RESEND_API_KEY|PERSONAL_PAPER_EMAIL|github\.token|GH_TOKEN/);
  assert.match(email, /RESEND_API_KEY: \$\{\{ secrets\.RESEND_API_KEY \}\}/);
  assert.match(email, /PERSONAL_PAPER_EMAIL: \$\{\{ secrets\.PERSONAL_PAPER_EMAIL \}\}/);
  assert.doesNotMatch(email, /CLOUDFLARE_AI_API_TOKEN|github\.token|GH_TOKEN/);
  assert.equal(workflow.match(/secrets\.CLOUDFLARE_AI_API_TOKEN/g)?.length, 2);
  assert.equal(workflow.match(/vars\.CLOUDFLARE_ACCOUNT_ID/g)?.length, 2);
  assert.equal(workflow.match(/secrets\.RESEND_API_KEY/g)?.length, 2);
  assert.equal(workflow.match(/secrets\.PERSONAL_PAPER_EMAIL/g)?.length, 2);
  assert.equal(workflow.match(/\$\{\{ github\.token \}\}/g)?.length, 1);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|OPENAI_MODEL|personal-paid-edition|personalResearch|freePilot/);
});

test("trusted pinned code generates, tests, and emails without persisting content", () => {
  const usesLines = workflow
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("uses:"));
  assert.deepEqual(usesLines, [
    "uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0",
    "uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6.5.0",
  ]);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /PERSONAL_OUTPUT_ROOT: content\/personal-candidates/);
  assert.match(
    workflow,
    /node scripts\/automation\/personal-free-edition\.mjs "\$\{EDITION_DATE\}"/,
  );
  assert.match(
    workflow,
    /node scripts\/automation\/personal-email\.mjs "\$\{\{ steps\.gate\.outputs\.candidate_path \}\}"/,
  );
  assert.ok(
    job.indexOf("Generate the private source-checked candidate") <
      job.indexOf("Test the exact private candidate"),
  );
  assert.ok(
    job.indexOf("Test the exact private candidate") <
      emailStepIndex,
  );
  assert.doesNotMatch(workflow, /content\/editions\/|console\.log\(|cat\s+.*candidate|tee\s+/);
});
