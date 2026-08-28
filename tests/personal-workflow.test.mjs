import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/personal-morning-paper.yml", import.meta.url),
  "utf8",
);

const triggerBlock = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
const job = workflow.slice(workflow.indexOf("  send:"));
const dedupe = job.slice(
  job.indexOf("Suppress an already successful delivery"),
  job.indexOf("Require all private-delivery configuration"),
);
const preflight = job.slice(
  job.indexOf("Require all private-delivery configuration"),
  job.indexOf("Locate the latest trusted repeat ledger"),
);
const ledgerLookup = job.slice(
  job.indexOf("Locate the latest trusted repeat ledger"),
  job.indexOf("Restore only the trusted hash-only repeat ledger"),
);
const generation = job.slice(
  job.indexOf("Generate the private source-checked candidate"),
  job.indexOf("Probe the advisory source-health report"),
);
const sourceHealthProbe = job.slice(
  job.indexOf("Probe the advisory source-health report"),
  job.indexOf("Upload only the public-safe source-health report"),
);
const sourceHealthUpload = job.slice(
  job.indexOf("Upload only the public-safe source-health report"),
  job.indexOf("Test the exact private candidate"),
);
const candidateTest = job.slice(
  job.indexOf("Test the exact private candidate"),
  job.indexOf("Record the delivered edition and validated story fingerprints"),
);
const ledgerPrepare = job.slice(
  job.indexOf("Prepare the private 30-day repeat ledger"),
  job.indexOf("Generate the private source-checked candidate"),
);
const ledgerRecord = job.slice(
  job.indexOf("Record the delivered edition and validated story fingerprints"),
  job.indexOf("Stage the immutable hash-only repeat ledger before delivery"),
);
const emailStepName = "Send only the validated paper to its private recipient";
const emailStepIndex = job.lastIndexOf(emailStepName);
const ledgerUploadIndex = job.indexOf("Stage the immutable hash-only repeat ledger before delivery");
const ledgerUpload = job.slice(ledgerUploadIndex, emailStepIndex);
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
  assert.doesNotMatch(workflow, /deploy-pages|configure-pages|gh pr|git push|git commit|pulls\/|\/statuses\//);
  assert.equal(workflow.match(/actions\/download-artifact@/g)?.length, 1);
  assert.equal(workflow.match(/actions\/upload-artifact@/g)?.length, 2);
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
  assert.match(dedupe, /\/actions\/runs\/\$\{process\.env\.GITHUB_RUN_ID\}/);
  assert.match(dedupe, /actions\/workflows\/personal-morning-paper\.yml\/runs/);
  assert.match(dedupe, /current\.display_title !== process\.env\.EXPECTED_RUN_TITLE/);
  assert.match(
    dedupe,
    /const workflowPath = "\.github\/workflows\/personal-morning-paper\.yml";/,
  );
  assert.match(dedupe, /new Set\(\[workflowPath, `\$\{workflowPath\}@main`\]\)/);
  assert.equal(dedupe.match(/workflowPaths\.has\((?:current|run)\.path\)/g)?.length, 2);
  assert.match(dedupe, /current\.head_sha !== process\.env\.GITHUB_SHA/);
  assert.match(dedupe, /current\.repository\?\.full_name !== process\.env\.GITHUB_REPOSITORY/);
  assert.match(dedupe, /runId < currentRunId/);
  assert.doesNotMatch(dedupe, /run\.conclusion === "success"/);
  assert.doesNotMatch(dedupe, /deliveryJobs\[0\]\.conclusion === "success"/);
  assert.match(dedupe, /const sameDispatchTitles = new Set/);
  assert.match(dedupe, /`Personal Morning Paper · \$\{process\.env\.DISPATCH_KEY\}`/);
  assert.match(dedupe, /sameDispatchTitles\.has\(run\.display_title\)/);
  assert.match(dedupe, /newYorkDate\(run\.created_at\) === process\.env\.EDITION_DATE/);
  assert.match(dedupe, /newYorkDate\(run\.created_at\) < process\.env\.EDITION_DATE/);
  assert.match(dedupe, /actions\/runs\/\$\{run\.id\}\/jobs/);
  assert.match(dedupe, /step\.name === "Send only the validated paper to its private recipient"/);
  assert.match(dedupe, /sendSteps\[0\]\.conclusion === "success"/);
  assert.match(dedupe, /const shouldSend = !priorSuccess/);
  assert.match(dedupe, /should_send=\$\{String\(shouldSend\)\}/);
  assert.doesNotMatch(dedupe, /run\.conclusion === "failure"/);
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
    14,
  );
  assert.equal(
    job.match(/steps\.preflight\.outputs\.delivery_enabled == 'true'/g)?.length,
    13,
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
  assert.match(generation, /CLOUDFLARE_AI_MODEL: '@cf\/meta\/llama-3\.3-70b-instruct-fp8-fast'/);
  assert.match(generation, /^        id: candidate$/m);
  assert.match(generation, /--github-actions-outcome/);
  assert.doesNotMatch(generation, />\/dev\/null/);
  assert.doesNotMatch(generation, /RESEND_API_KEY|PERSONAL_PAPER_EMAIL|github\.token|GH_TOKEN/);
  assert.match(email, /RESEND_API_KEY: \$\{\{ secrets\.RESEND_API_KEY \}\}/);
  assert.match(email, /PERSONAL_PAPER_EMAIL: \$\{\{ secrets\.PERSONAL_PAPER_EMAIL \}\}/);
  assert.match(
    email,
    /PERSONAL_FEEDBACK_SIGNING_KEY: \$\{\{ secrets\.PERSONAL_FEEDBACK_SIGNING_KEY \}\}/,
  );
  assert.match(
    email,
    /PERSONAL_FEEDBACK_BASE_URL: https:\/\/first-fold-personal-feedback\.h-josue122\.workers\.dev\//,
  );
  assert.doesNotMatch(email, /CLOUDFLARE_AI_API_TOKEN|github\.token|GH_TOKEN/);
  assert.match(ledgerPrepare, /CLOUDFLARE_AI_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_AI_API_TOKEN \}\}/);
  assert.match(ledgerRecord, /CLOUDFLARE_AI_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_AI_API_TOKEN \}\}/);
  assert.doesNotMatch(ledgerLookup, /secrets\.CLOUDFLARE_AI_API_TOKEN/);
  assert.equal(workflow.match(/secrets\.CLOUDFLARE_AI_API_TOKEN/g)?.length, 4);
  assert.equal(workflow.match(/vars\.CLOUDFLARE_ACCOUNT_ID/g)?.length, 2);
  assert.equal(workflow.match(/secrets\.RESEND_API_KEY/g)?.length, 2);
  assert.equal(workflow.match(/secrets\.PERSONAL_PAPER_EMAIL/g)?.length, 2);
  assert.equal(workflow.match(/secrets\.PERSONAL_FEEDBACK_SIGNING_KEY/g)?.length, 1);
  assert.doesNotMatch(workflow, /vars\.PERSONAL_FEEDBACK_BASE_URL/);
  assert.equal(workflow.match(/\$\{\{ github\.token \}\}/g)?.length, 3);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|OPENAI_MODEL|personal-paid-edition|personalResearch|freePilot/);
});

test("trusted pinned code tests, records, and emails every adaptive daily candidate", () => {
  const usesLines = workflow
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("uses:"));
  assert.deepEqual(usesLines, [
    "uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1",
    "uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0",
    "uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6.5.0",
    "uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
    "uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
  ]);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /PERSONAL_OUTPUT_ROOT: content\/personal-candidates/);
  assert.match(
    generation,
    /PERSONAL_STORY_LEDGER_PATH: \$\{\{ runner\.temp \}\}\/first-fold-ledger\/repeat-ledger\.json/,
  );
  assert.match(
    generation,
    /PERSONAL_SOURCE_HEALTH_ROOT: \$\{\{ runner\.temp \}\}\/first-fold-source-health/,
  );
  assert.equal(workflow.match(/PERSONAL_SOURCE_HEALTH_ROOT:/g)?.length, 1);
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
      job.indexOf("Record the delivered edition and validated story fingerprints"),
  );
  assert.ok(
    job.indexOf("Record the delivered edition and validated story fingerprints") <
      ledgerUploadIndex,
  );
  assert.ok(
    ledgerUploadIndex < emailStepIndex,
  );
  for (const candidateDependentStep of [candidateTest, ledgerRecord, ledgerUpload, email]) {
    assert.match(
      candidateDependentStep,
      /steps\.candidate\.outputs\.candidate_created == 'true'/,
    );
    assert.doesNotMatch(
      candidateDependentStep,
      /selected_story_count|edition_format|qualified_story_count|required_story_count/,
    );
  }
  assert.equal(
    job.match(/steps\.candidate\.outputs\.candidate_created == 'true'/g)?.length,
    4,
  );
  assert.doesNotMatch(ledgerPrepare, /steps\.candidate\.outputs\.candidate_created/);
  assert.doesNotMatch(
    generation,
    /candidate_created == 'false'|qualified_story_count|required_story_count|no[- ]edition|at least three|three stor(?:y|ies)/i,
  );
  assert.doesNotMatch(workflow, /content\/editions\/|console\.log\(|cat\s+.*candidate|tee\s+/);
});

test("source health is exact, public-safe, short-lived, and never an email gate", () => {
  assert.ok(
    job.indexOf("Generate the private source-checked candidate") <
      job.indexOf("Probe the advisory source-health report"),
  );
  assert.ok(
    job.indexOf("Probe the advisory source-health report") <
      job.indexOf("Upload only the public-safe source-health report"),
  );
  assert.match(sourceHealthProbe, /always\(\)/);
  assert.match(sourceHealthProbe, /steps\.candidate\.outcome != 'skipped'/);
  assert.match(sourceHealthProbe, /continue-on-error: true/);
  assert.match(
    sourceHealthProbe,
    /SOURCE_HEALTH_DIRECTORY: \$\{\{ runner\.temp \}\}\/first-fold-source-health\/\$\{\{ steps\.gate\.outputs\.edition_date \}\}/,
  );
  assert.match(sourceHealthProbe, /path\.join\(directory, "source-health\.json"\)/);
  assert.match(sourceHealthProbe, /path\.join\(directory, "source-health\.html"\)/);
  assert.doesNotMatch(sourceHealthProbe, /source-health\.md/);
  assert.match(sourceHealthProbe, /lstat\(jsonPath\)/);
  assert.match(sourceHealthProbe, /jsonMetadata\.isSymbolicLink\(\)/);
  assert.match(sourceHealthProbe, /SOURCE_HEALTH_MAX_JSON_BYTES/);
  assert.match(sourceHealthProbe, /SOURCE_HEALTH_MAX_HTML_BYTES/);
  assert.match(sourceHealthProbe, /validateSourceHealthSnapshot\(snapshot\)/);
  assert.match(sourceHealthProbe, /snapshot\.editionDate !== process\.env\.EDITION_DATE/);
  assert.match(sourceHealthProbe, /htmlText !== renderSourceHealthHtml\(snapshot\)/);
  assert.match(sourceHealthProbe, /available = false/);
  assert.match(sourceHealthProbe, /available = true/);
  assert.match(
    sourceHealthProbe,
    /source-health report was unavailable; this does not change the candidate step result/,
  );
  assert.doesNotMatch(
    sourceHealthProbe,
    /candidate_path|PERSONAL_OUTPUT_ROOT|PERSONAL_PAPER_EMAIL|RESEND_API_KEY|PERSONAL_FEEDBACK_SIGNING_KEY/,
  );

  assert.match(sourceHealthUpload, /always\(\)/);
  assert.match(sourceHealthUpload, /steps\.source_health\.outputs\.available == 'true'/);
  assert.match(sourceHealthUpload, /continue-on-error: true/);
  assert.match(
    sourceHealthUpload,
    /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1/,
  );
  assert.match(
    sourceHealthUpload,
    /name: personal-source-health-\$\{\{ github\.run_id \}\}-\$\{\{ steps\.gate\.outputs\.edition_date \}\}/,
  );
  assert.equal(sourceHealthUpload.match(/source-health\.json/g)?.length, 1);
  assert.equal(sourceHealthUpload.match(/source-health\.html/g)?.length, 1);
  assert.doesNotMatch(sourceHealthUpload, /source-health\.md/);
  assert.match(sourceHealthUpload, /if-no-files-found: error/);
  assert.match(sourceHealthUpload, /retention-days: 14/);
  assert.match(sourceHealthUpload, /compression-level: 9/);
  assert.match(sourceHealthUpload, /overwrite: false/);
  assert.match(sourceHealthUpload, /include-hidden-files: false/);
  assert.doesNotMatch(
    sourceHealthUpload,
    /candidate_path|PERSONAL_OUTPUT_ROOT|personal-candidates|PERSONAL_PAPER_EMAIL|RESEND_API_KEY|PERSONAL_FEEDBACK_SIGNING_KEY|repeat-ledger/,
  );
  assert.doesNotMatch(email, /source_health|SOURCE_HEALTH/);
});

test("private feedback is optional, step-scoped, advisory, and accurately summarized", () => {
  assert.doesNotMatch(preflight, /PERSONAL_FEEDBACK/);
  assert.doesNotMatch(generation, /PERSONAL_FEEDBACK/);
  assert.doesNotMatch(sourceHealthProbe, /PERSONAL_FEEDBACK/);
  assert.doesNotMatch(sourceHealthUpload, /PERSONAL_FEEDBACK/);
  assert.match(
    email,
    /PERSONAL_FEEDBACK_BASE_URL: https:\/\/first-fold-personal-feedback\.h-josue122\.workers\.dev\//,
  );
  assert.match(
    email,
    /PERSONAL_FEEDBACK_SIGNING_KEY: \$\{\{ secrets\.PERSONAL_FEEDBACK_SIGNING_KEY \}\}/,
  );
  assert.match(email, /delivery_result="\$\(node scripts\/automation\/personal-email\.mjs/);
  assert.match(email, /feedback links enabled\./);
  assert.match(email, /feedback_status="enabled"/);
  assert.match(email, /feedback_status="disabled"/);
  assert.match(email, /Feedback is advisory and cannot tune the paper automatically/);
  assert.doesNotMatch(email, /echo.*PERSONAL_FEEDBACK_SIGNING_KEY|echo.*PERSONAL_FEEDBACK_BASE_URL/);
});

test("the 30-day ledger restores and uploads one bounded hash-only artifact", () => {
  assert.match(ledgerLookup, /LEDGER_ARTIFACT_NAME: personal-repeat-ledger-v1/);
  assert.match(ledgerLookup, /LEDGER_ROLLOUT_DATE: '2026-08-24'/);
  assert.match(ledgerLookup, /const repeatCutoffDate =/);
  assert.match(ledgerLookup, /page <= 10/);
  assert.match(ledgerLookup, /runId < currentRunId/);
  assert.doesNotMatch(ledgerLookup, /run\.conclusion !== "success"/);
  assert.match(ledgerLookup, /run\.event === "workflow_dispatch"/);
  assert.match(ledgerLookup, /run\.head_branch === "main"/);
  assert.match(ledgerLookup, /run\.actor\?\.login === process\.env\.GITHUB_REPOSITORY_OWNER/);
  assert.match(ledgerLookup, /run\.triggering_actor\?\.login === process\.env\.GITHUB_REPOSITORY_OWNER/);
  assert.match(ledgerLookup, /workflowPaths\.has\(run\.path\)/);
  assert.match(ledgerLookup, /newYorkDate\(run\.created_at\) >= process\.env\.LEDGER_ROLLOUT_DATE/);
  assert.match(ledgerLookup, /exact\.length > 1/);
  assert.match(ledgerLookup, /hasSuccessfulPrivateSend\(run\)/);
  assert.match(ledgerLookup, /successful private send inside the 30-day repeat window has no usable ledger/i);
  assert.match(ledgerLookup, /Math\.min\(5, staleSuccessfulSendCount \+ 1\)/);
  assert.match(ledgerLookup, /staleSuccessfulSendCount === 5/);
  assert.match(ledgerLookup, /bootstrap_count=\$\{staleSuccessfulSendCount\}/);
  assert.match(ledgerLookup, /allow_bootstrap=true/);
  assert.match(ledgerLookup, /allow_bootstrap=false/);
  assert.match(ledgerLookup, /exact\[0\]\.expired === false/);
  assert.match(ledgerLookup, /!Number\.isSafeInteger\(artifact\.id\)/);
  assert.match(ledgerLookup, /artifact\.workflow_run\?\.id !== previous\.id/);
  assert.match(ledgerLookup, /artifact\.workflow_run\?\.head_sha !== previous\.head_sha/);
  assert.match(ledgerLookup, /artifact\.size_in_bytes > 1_000_000/);
  assert.match(ledgerLookup, /found=false/);
  assert.match(ledgerLookup, /found=true/);

  assert.match(workflow, /artifact-ids: \$\{\{ steps\.ledger\.outputs\.artifact_id \}\}/);
  assert.match(workflow, /run-id: \$\{\{ steps\.ledger\.outputs\.run_id \}\}/);
  assert.match(workflow, /node scripts\/automation\/personal-story-ledger\.mjs prepare/);
  assert.match(ledgerPrepare, /node scripts\/automation\/personal-story-ledger\.mjs prepare/);
  assert.match(workflow, /--rollout-date 2026-08-24/);
  assert.equal(workflow.match(/--allow-bootstrap/g)?.length, 1);
  assert.match(workflow, /--recorded-edition-count "\$\{LEDGER_BOOTSTRAP_COUNT\}"/);
  assert.match(workflow, /node scripts\/automation\/personal-story-ledger\.mjs record/);
  assert.match(ledgerRecord, /node scripts\/automation\/personal-story-ledger\.mjs record/);
  assert.match(ledgerUpload, /name: personal-repeat-ledger-v1/);
  assert.match(ledgerUpload, /path: \$\{\{ runner\.temp \}\}\/first-fold-ledger\/repeat-ledger\.json/);
  assert.match(ledgerUpload, /if-no-files-found: error/);
  assert.match(ledgerUpload, /retention-days: 35/);
  assert.match(ledgerUpload, /compression-level: 9/);
  assert.match(ledgerUpload, /overwrite: false/);
  assert.match(ledgerUpload, /include-hidden-files: false/);
  assert.ok(ledgerUploadIndex < emailStepIndex);
  assert.doesNotMatch(
    ledgerUpload,
    /candidate_path|PERSONAL_OUTPUT_ROOT|content\/personal-candidates|PERSONAL_PAPER_EMAIL|RESEND_API_KEY/,
  );
});
