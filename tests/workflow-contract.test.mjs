import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [research, approval, delivery] = await Promise.all([
  readFile(new URL("../.github/workflows/morning-research.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/approve-morning-edition.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
]);

function triggerBlock(workflow) {
  return workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
}

function permissionsBlock(workflow, jobName) {
  const job = workflow.slice(workflow.indexOf(`  ${jobName}:`));
  return job.slice(job.indexOf("    permissions:"), job.indexOf("    steps:"));
}

test("weekday research creates only a capped same-repository public candidate PR", () => {
  const triggers = triggerBlock(research);
  const permissions = permissionsBlock(research, "prepare");

  assert.match(research, /^name: Prepare Morning Press candidate$/m);
  assert.match(triggers, /cron: "17 5 \* \* 1-5"[\s\S]+timezone: "America\/New_York"/);
  assert.match(triggers, /workflow_dispatch:/);
  assert.doesNotMatch(triggers, /pull_request(?:_target)?:/);
  assert.match(research, /^permissions: \{\}$/m);
  assert.match(permissions, /contents: write/);
  assert.match(permissions, /issues: write/);
  assert.match(permissions, /pull-requests: write/);
  assert.match(permissions, /statuses: write/);
  assert.doesNotMatch(permissions, /pages:|id-token:|actions:/);

  assert.match(research, /github\.repository == 'itworksinprod\/first-fold'/);
  assert.match(research, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(research, /node scripts\/automation\/generate-edition\.mjs "\$\{EDITION_DATE\}"/);
  assert.match(research, /provenance\?\.automation\?\.workflow === "morning-press"/);
  assert.match(research, /PILOT_LIMIT: "5"/);
  assert.match(research, /minuteOfDay < 5 \* 60/);
  assert.match(research, /minuteOfDay >= 6 \* 60/);
  assert.match(research, /pilotSequence !== Number\(process\.env\.PILOT_SEQUENCE\)/);
  assert.match(research, /sourceCheck\?\.status !== "passed"/);
  assert.match(research, /git push --force-with-lease="refs\/heads\/\$\{BRANCH\}:\$\{REMOTE_SHA\}"/);
  assert.match(research, /uses: actions\/upload-artifact@v7/);
  assert.match(research, /name: morning-press-\$\{\{ steps\.pilot\.outputs\.edition_date \}\}-\$\{\{ steps\.commit\.outputs\.head_sha \}\}/);
  assert.match(research, /github-actions\[bot\]/);
  assert.match(research, /BOT_LABEL: morning-press-bot/);
  assert.match(research, /This pull request and its candidate JSON are public/);
  assert.match(research, /not deployed or reader-facing/);
  assert.match(research, /Attest the exact candidate SHA/);
  assert.match(research, /\/statuses\/\$\{process\.env\.HEAD_SHA\}/);
  assert.match(research, /first-fold\/morning-press-candidate/);
  assert.match(research, /status\.creator\?\.login !== "github-actions\[bot\]"/);
  assert.ok(
    research.indexOf("Create or update the public candidate PR") <
      research.indexOf("Attest the exact candidate SHA"),
  );
});

test("one authorized exact-SHA review gates a trusted-data-only merge", () => {
  const triggers = triggerBlock(approval);
  const permissions = permissionsBlock(approval, "approve");

  assert.match(approval, /^name: Merge approved Morning Press edition$/m);
  assert.match(triggers, /pull_request_review:[\s\S]+types: \[submitted\]/);
  assert.doesNotMatch(triggers, /pull_request_target:/);
  assert.match(approval, /^permissions: \{\}$/m);
  assert.match(permissions, /actions: write/);
  assert.match(permissions, /contents: write/);
  assert.match(permissions, /pull-requests: read/);
  assert.match(permissions, /statuses: read/);
  assert.doesNotMatch(permissions, /issues: write|pages:|id-token:|pull-requests: write/);

  assert.match(approval, /github\.event\.review\.state == 'approved'/);
  assert.match(approval, /base\.repo\.full_name == github\.repository/);
  assert.match(approval, /head\.repo\.full_name == github\.repository/);
  assert.match(approval, /MORNING_PRESS_REVIEWERS/);
  assert.match(approval, /collaborators\/\$\{encodeURIComponent\(reviewer\)\}\/permission/);
  assert.match(approval, /live\.user\.login === "github-actions\[bot\]"/);
  assert.match(approval, /live\.head\.sha === approvedSha/);
  assert.match(approval, /review\.commit_id === approvedSha/);
  assert.match(approval, /live\.changed_files === 1/);
  assert.match(approval, /files\[0\]\.filename === editionPath && files\[0\]\.status === "added"/);
  assert.match(approval, /provenance\?\.automation/);
  assert.match(approval, /automation\.pilotSequence !== expectedSequence/);
  assert.match(approval, /automation\?\.runUrl !== expectedRunUrl/);
  assert.match(approval, /sourceCheck\?\.status !== "passed"/);
  assert.match(approval, /Only today's \$\{today\} candidate can be approved/);
  assert.match(approval, /automation\?\.runId !== process\.env\.ATTESTED_RUN_ID/);
  assert.match(approval, /automation\?\.runUrl !== process\.env\.ATTESTED_RUN_URL/);
  assert.equal(
    approval.match(/commits\/\$\{[^}]+\}\/statuses\?per_page=100/g)?.length,
    2,
  );
  assert.equal(
    approval.match(/first-fold\/morning-press-candidate/g)?.length,
    2,
  );
  assert.equal(
    approval.match(/actions\/runs\/\$\{process\.env\.ATTESTED_RUN_ID\}/g)?.length,
    2,
  );
  assert.match(approval, /run\.path === "\.github\/workflows\/morning-research\.yml@main"/);
  assert.match(approval, /run\.head_sha === process\.env\.BASE_SHA/);
  assert.match(approval, /run\.status === "completed"/);
  assert.match(approval, /run\.conclusion === "success"/);
  assert.match(approval, /Re-check candidate sources with trusted code/);
  assert.match(approval, /runNewsroomQa\(edition/);
  assert.match(approval, /checkLinks: true/);

  assert.match(approval, /ref: \$\{\{ steps\.gate\.outputs\.base_sha \}\}/);
  assert.match(approval, /persist-credentials: false/);
  assert.match(approval, /application\/vnd\.github\.raw\+json/);
  assert.match(approval, /Validate the exact candidate with trusted code[\s\S]+run: npm test/);
  assert.doesNotMatch(approval, /ref: \$\{\{ (?:github\.event\.)?pull_request\.head/);
  assert.match(approval, /sha: process\.env\.APPROVED_SHA/);
  assert.match(approval, /Main moved during validation; obtain a fresh exact-revision approval/);
});

test("approval dispatches the still-separate delivery gate only after 6 AM", () => {
  assert.match(delivery, /^name: Validate and deliver Morning Press$/m);
  assert.match(delivery, /cron: "0 6 \* \* 1-5"[\s\S]+timezone: "America\/New_York"/);
  assert.match(delivery, /workflow_dispatch:[\s\S]+recovery_reason:/);
  assert.doesNotMatch(triggerBlock(delivery), /paths-ignore:/);
  assert.match(delivery, /pull_request\.user\.login != 'github-actions\[bot\]'/);
  assert.match(delivery, /startsWith\(github\.head_ref, 'automation\/morning-press-'\) == false/);
  assert.match(delivery, /Require the 6 AM New York delivery gate/);
  assert.match(delivery, /minuteOfDay < 6 \* 60/);
  assert.match(delivery, /Require today's published edition/);
  assert.match(delivery, /actions\/deploy-pages@v5/);
  assert.ok(
    delivery.indexOf("Require the 6 AM New York delivery gate") <
      delivery.indexOf("Configure GitHub Pages"),
  );

  assert.match(approval, /after_gate=\$\{String\(afterGate\)\}/);
  assert.match(approval, /if: steps\.delivery_time\.outputs\.after_gate == 'true'/);
  assert.match(approval, /gh workflow run pages\.yml/);
  assert.match(approval, /recovery_reason=Exact-SHA approved PR/);
  assert.doesNotMatch(research, /deploy-pages|pages: write|id-token: write/);
});
