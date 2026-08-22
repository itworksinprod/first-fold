import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [freeResearch, paidResearch, paidApproval, delivery] = await Promise.all([
  readFile(new URL("../.github/workflows/free-morning-research.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/morning-research.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/approve-morning-edition.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
]);

const researchJob = freeResearch.slice(
  freeResearch.indexOf("  research:"),
  freeResearch.indexOf("\n  stage:"),
);
const stageJob = freeResearch.slice(freeResearch.indexOf("  stage:"));

function triggerBlock(workflow) {
  return workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
}

test("the free comparison is manual, trusted-main only, and time-gated every day", () => {
  const triggers = triggerBlock(freeResearch);

  assert.match(freeResearch, /^name: Prepare free Morning Press comparison$/m);
  assert.match(triggers, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(triggers, /inputs:|schedule:|cron:|pull_request|push:/);
  assert.match(freeResearch, /^permissions: \{\}$/m);
  assert.match(freeResearch, /group: free-morning-press-comparison/);
  assert.equal(freeResearch.match(/github\.repository == 'itworksinprod\/first-fold'/g)?.length, 2);
  assert.equal(freeResearch.match(/github\.ref == 'refs\/heads\/main'/g)?.length, 2);
  assert.equal(freeResearch.match(/github\.actor == 'itworksinprod'/g)?.length, 2);
  assert.match(researchJob, /timeout-minutes: 30/);
  assert.match(stageJob, /timeout-minutes: 15/);
  assert.match(freeResearch, /minuteOfDay < 5 \* 60 \|\| minuteOfDay >= 6 \* 60/);
  assert.match(freeResearch, /No model credential or AI API was used/);
  assert.doesNotMatch(freeResearch, /isWeekday|\["Mon", "Tue", "Wed", "Thu", "Fri"\]/);
  assert.ok(
    researchJob.indexOf("Open the New York free-comparison gate") <
      researchJob.indexOf("Check out trusted main without write credentials"),
  );
});

test("every official action is pinned to a reviewed release commit", () => {
  const usesLines = freeResearch
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("uses:"));
  assert.equal(usesLines.length, 6);
  for (const line of usesLines) {
    assert.match(line, /^uses: actions\/[a-z-]+@[a-f0-9]{40} # v\d+\.\d+\.\d+$/);
  }

  assert.equal(
    freeResearch.match(/actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6\.1\.0/g)?.length,
    2,
  );
  assert.equal(
    freeResearch.match(/actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6\.5\.0/g)?.length,
    2,
  );
  assert.equal(
    freeResearch.match(/actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1/g)?.length,
    1,
  );
  assert.equal(
    freeResearch.match(/actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8\.0\.1/g)?.length,
    1,
  );
  assert.doesNotMatch(freeResearch, /uses:\s+actions\/[^@\s]+@v\d/);
});

test("AI credentials stay in the read-only job and never reach the write-capable job", () => {
  assert.match(researchJob, /permissions:\n      contents: read/);
  assert.doesNotMatch(researchJob, /contents: write|issues: write|pull-requests: write|statuses: write/);
  assert.doesNotMatch(researchJob, /\$\{\{ github\.token \}\}|GH_TOKEN|PUSH_TOKEN/);
  assert.match(stageJob, /permissions:[\s\S]+contents: write/);
  assert.match(stageJob, /issues: write/);
  assert.match(stageJob, /pull-requests: write/);
  assert.match(stageJob, /statuses: write/);
  assert.doesNotMatch(stageJob, /pages:|id-token:/);

  assert.equal(
    freeResearch.match(/\$\{\{ secrets\.CLOUDFLARE_AI_API_TOKEN \}\}/g)?.length,
    1,
  );
  assert.equal(
    freeResearch.match(/\$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/g)?.length,
    1,
  );
  assert.match(researchJob, /CLOUDFLARE_AI_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_AI_API_TOKEN \}\}/);
  assert.match(researchJob, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.doesNotMatch(stageJob, /secrets\.CLOUDFLARE_AI_API_TOKEN|vars\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(freeResearch, /^  CLOUDFLARE_AI_MODEL: "@cf\/openai\/gpt-oss-120b"$/m);
  assert.doesNotMatch(freeResearch, /vars\.CLOUDFLARE_AI_MODEL/);
  assert.match(freeResearch, /\^\[A-Fa-f0-9\]\{32\}\$/);
  assert.match(freeResearch, /CLOUDFLARE_ACCOUNT_ID must be configured as a repository variable/);
  assert.match(freeResearch, /CLOUDFLARE_AI_API_TOKEN must be configured as a repository secret/);
  assert.match(
    researchJob,
    /node scripts\/automation\/generate-free-edition\.mjs "\$\{EDITION_DATE\}"/,
  );
  assert.doesNotMatch(freeResearch, /OPENAI_API_KEY|api\.openai\.com|continue-on-error:/);
  assert.equal(freeResearch.match(/persist-credentials: false/g)?.length, 2);
});

test("a digest-bound artifact crosses the privilege boundary and is revalidated", () => {
  assert.match(researchJob, /candidate_sha256: \$\{\{ steps\.verify\.outputs\.candidate_sha256 \}\}/);
  assert.match(researchJob, /artifact_name: \$\{\{ steps\.verify\.outputs\.artifact_name \}\}/);
  assert.match(researchJob, /createHash\("sha256"\)\.update\(raw\)\.digest\("hex"\)/);
  assert.match(
    researchJob,
    /`free-morning-press-\$\{process\.env\.GITHUB_RUN_ID\}-\$\{process\.env\.EDITION_DATE\}-\$\{candidateSha256\}`/,
  );
  assert.match(researchJob, /uses: actions\/upload-artifact@[a-f0-9]{40} # v7\.0\.1/);
  assert.match(stageJob, /needs: research/);
  assert.match(stageJob, /needs\.research\.result == 'success'/);
  assert.match(stageJob, /uses: actions\/download-artifact@[a-f0-9]{40} # v8\.0\.1/);
  assert.match(stageJob, /name: \$\{\{ needs\.research\.outputs\.artifact_name \}\}/);
  assert.match(stageJob, /contentSha256 !== process\.env\.CANDIDATE_SHA256/);
  assert.match(stageJob, /entries\.length !== 1 \|\| entries\[0\] !== expectedName/);
  assert.match(stageJob, /sourceStat\.isSymbolicLink\(\)/);
  assert.match(stageJob, /expectedCandidatePath = `content\/free-candidates\/\$\{process\.env\.EDITION_DATE\}\.json`/);
  assert.match(stageJob, /expectedBranch = `experiment\/free-morning-press-\$\{process\.env\.EDITION_DATE\}`/);
  assert.match(stageJob, /mkdir\(path\.dirname\(process\.env\.CANDIDATE_PATH\), \{ recursive: true \}\)/);
  assert.match(stageJob, /writeFile\(process\.env\.CANDIDATE_PATH, raw, \{ encoding: "utf8", flag: "wx" \}\)/);
  assert.ok(
    stageJob.indexOf("Revalidate and materialize the exact free candidate") <
      stageJob.indexOf("Commit only the free comparison candidate"),
  );
});

test("both jobs and the PR stay bound to the exact unchanged dispatch SHA", () => {
  assert.equal(freeResearch.match(/ref: \$\{\{ github\.sha \}\}/g)?.length, 2);
  assert.doesNotMatch(freeResearch, /^\s+ref: main$/m);
  assert.match(stageJob, /Bind staging to the unchanged dispatch revision/);
  assert.equal(
    stageJob.match(/git fetch --no-tags origin "\+refs\/heads\/main:refs\/remotes\/origin\/main"/g)?.length,
    2,
  );
  assert.equal(
    stageJob.match(/"\$\{live_main\}" != "\$\{GITHUB_SHA\}" \|\| "\$\(git rev-parse HEAD\)" != "\$\{GITHUB_SHA\}"/g)?.length,
    2,
  );
  assert.match(stageJob, /Main advanced after this free comparison started; rerun the workflow/);
  assert.match(stageJob, /Main advanced during free-candidate validation; rerun/);
  assert.match(stageJob, /"\$\(git rev-parse HEAD\^\)" != "\$\{GITHUB_SHA\}"/);
  assert.equal(stageJob.match(/BASE_SHA: \$\{\{ github\.sha \}\}/g)?.length, 2);
  assert.equal(stageJob.match(/\.base\.sha === process\.env\.BASE_SHA/g)?.length, 2);
  assert.ok(
    stageJob.indexOf("Bind staging to the unchanged dispatch revision") <
      stageJob.indexOf("Revalidate and materialize the exact free candidate"),
  );
});

test("free candidates remain outside every production identity and publication path", () => {
  assert.match(freeResearch, /FREE_OUTPUT_ROOT: content\/free-candidates/);
  assert.match(freeResearch, /FREE_BRANCH_PREFIX: experiment\/free-morning-press-/);
  assert.match(freeResearch, /FREE_LABEL: free-morning-press-pilot/);
  assert.match(freeResearch, /first-fold\/free-morning-press-candidate/);
  assert.doesNotMatch(freeResearch, /content\/editions\//);
  assert.doesNotMatch(freeResearch, /morning-press-bot|first-fold\/morning-press-candidate/);

  assert.equal(freeResearch.match(/edition\.status !== "validated"/g)?.length, 2);
  assert.equal(freeResearch.match(/edition\.publication\?\.publishedAt !== null/g)?.length, 2);
  assert.equal(freeResearch.match(/edition\.provenance\?\.automation !== undefined/g)?.length, 2);
  assert.equal(freeResearch.match(/freePilot\?\.workflow !== "free-morning-press"/g)?.length, 2);
  assert.equal(freeResearch.match(/freePilot\?\.provider !== "cloudflare-workers-ai"/g)?.length, 2);
  assert.equal(freeResearch.match(/freePilot\?\.runId !== process\.env\.GITHUB_RUN_ID/g)?.length, 2);
  assert.equal(freeResearch.match(/freePilot\?\.feedSnapshotSha256/g)?.length, 2);
  assert.equal(freeResearch.match(/freePilot\?\.responseSha256/g)?.length, 2);
  assert.equal(freeResearch.match(/sourceCheck\?\.status !== "passed"/g)?.length, 2);
  assert.equal(freeResearch.match(/sourceCheck\.issues\.length !== 0/g)?.length, 2);
  assert.equal(freeResearch.match(/import \{ FREE_FEED_SOURCES \}/g)?.length, 2);
  assert.equal(
    freeResearch.match(/expectedFeedSourceCount: FREE_FEED_SOURCES\.length/g)?.length,
    2,
  );

  assert.match(stageJob, /git add -- "\$\{CANDIDATE_PATH\}"/);
  assert.match(stageJob, /staged_paths\[0\].*CANDIDATE_PATH/);
  assert.match(stageJob, /push --force-with-lease="refs\/heads\/\$\{BRANCH\}:\$\{REMOTE_SHA\}"/);
  assert.match(stageJob, /status\.creator\?\.login !== "github-actions\[bot\]"/);
});

test("free-model review is informational and cannot enter production delivery", () => {
  assert.match(stageJob, /Create or update the separate human-review PR/);
  assert.match(stageJob, /draft: false/);
  assert.match(stageJob, /Record findings as ordinary PR comments, not as a production approval/);
  assert.match(stageJob, /Review state here is informational only; no automation will merge or publish it/);
  assert.match(stageJob, /Close the PR after recording the result/);
  assert.doesNotMatch(stageJob, /\*\*Approve\*\*|Submit GitHub’s/);
  assert.doesNotMatch(freeResearch, /deploy-pages|pages: write|id-token: write|gh pr merge|\/merge`/);

  assert.match(
    paidApproval,
    /startsWith\(github\.event\.pull_request\.head\.ref, 'automation\/morning-press-'\)/,
  );
  assert.doesNotMatch(paidApproval, /experiment\/free-morning-press-|free-morning-press-pilot/);
  assert.doesNotMatch(paidResearch, /CLOUDFLARE_AI_API_TOKEN|content\/free-candidates/);
  assert.doesNotMatch(delivery, /content\/free-candidates|free-morning-press/);
});
