import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/private-paper-quality-check.yml", import.meta.url), "utf8");
const script = new URL("../scripts/automation/check-personal-quality.mjs", import.meta.url);
const scriptText = await readFile(script, "utf8");

test("private editorial observation is owner/main/attempt-one manual only with ciphertext-only retention", () => {
  const trigger = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
  assert.match(trigger, /workflow_dispatch:/);
  assert.doesNotMatch(trigger, /push:|schedule:|pull_request|workflow_run/);
  assert.match(trigger, /public_key:[\s\S]*required: true/);
  for (const guard of ["github.repository == 'itworksinprod/first-fold'", "github.ref == 'refs/heads/main'",
    "github.actor == 'itworksinprod'", "github.run_attempt == 1"]) assert.ok(workflow.includes(guard));
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /(?:contents|actions|id-token|pages): write/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /group: personal-morning-paper/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.equal(workflow.match(/run: node scripts\/automation\/check-personal-quality\.mjs/g)?.length, 1);
  assert.match(workflow, /--require-web-search --reasoning-pipeline --private-diagnostic/);
  assert.ok(workflow.indexOf("validatePrivateEditorialDiagnosticKey(process.env.DIAGNOSTIC_PUBLIC_KEY)") <
    workflow.indexOf("CLOUDFLARE_AI_API_TOKEN:"));
  assert.equal(workflow.match(/secrets\./g)?.length, 2);
  assert.doesNotMatch(workflow, /RESEND|OPENAI_API_KEY|PERSONAL_PAPER_EMAIL|git push|gh pr|deploy-pages/);
  assert.equal(workflow.match(/uses:/g)?.length, 3);
  for (const [, action] of workflow.matchAll(/uses:\s*(\S+)/g)) assert.match(action,
    /^actions\/(?:checkout|setup-node|upload-artifact)@[a-f0-9]{40}$/);
  assert.match(workflow, /path: \$\{\{ runner.temp \}\}\/private-editorial-checkpoints\.encrypted\.json/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /path:.*\*|path:.*\.pem|path:.*\.html/);
  // Untrusted inputs are environment values, never interpolation in a command.
  assert.doesNotMatch(workflow, /run:.*\$\{\{ inputs\./);
});

test("quality runner persists only collector ciphertext, never draft/source checkpoints", () => {
  assert.match(scriptText, /const sealed = await privateDiagnostic.finalize\(\)/);
  assert.match(scriptText, /writeFile\(privateDiagnosticPath, JSON.stringify\(sealed\), \{ mode: 0o600, flag: "wx" \}\)/);
  assert.equal(scriptText.match(/await writeFile\(/g)?.length, 1);
  assert.doesNotMatch(scriptText, /console\.(?:info|log|error|warn)\([^\n]*(?:sealed|publicKey|drafts|dossiers)/);
});

test("private diagnostic rejects incompatible authority/options/key before network and creates no plaintext", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "first-fold-private-workflow-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicKey = generateKeyPairSync("rsa", { modulusLength: 3072 }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const env = { GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main",
    GITHUB_ACTOR: "itworksinprod", GITHUB_RUN_ATTEMPT: "1", GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/private-paper-quality-check.yml@refs/heads/main",
    RUNNER_TEMP: directory, DIAGNOSTIC_PUBLIC_KEY: publicKey };
  const args = ["--require-web-search", "--reasoning-pipeline", "--private-diagnostic"];
  const networkBlocker = `globalThis.fetch=()=>{throw new Error('UNEXPECTED_NETWORK')};`;
  const run = (overrides = {}, input = args) => spawnSync(process.execPath, ["--import",
    `data:text/javascript,${encodeURIComponent(networkBlocker)}`, fileURLToPath(script), ...input],
  { encoding: "utf8", env: { ...env, ...overrides }, timeout: 5000 });
  for (const overrides of [{ GITHUB_EVENT_NAME: "push" }, { GITHUB_ACTOR: "someone" },
    { GITHUB_RUN_ATTEMPT: "2" }, { GITHUB_REF: "refs/heads/other" },
    { GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/personal-quality-check.yml@refs/heads/main" },
    { DIAGNOSTIC_PUBLIC_KEY: "" }, { DIAGNOSTIC_PUBLIC_KEY: "not-a-key" }, { RUNNER_TEMP: "relative" }]) {
    const result = run(overrides);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Quality failure/);
    assert.doesNotMatch(result.stderr + result.stdout, /UNEXPECTED_NETWORK|not-a-key|MIIB|api\.cloudflare|source text/);
    assert.deepEqual(await readdir(directory), []);
  }
  for (const input of [["--private-diagnostic"], ["--require-web-search", "--mixed-claim-review", "--private-diagnostic"],
    [...args, "--private-diagnostic"]]) {
    assert.equal(run({}, input).status, 1);
  }
  const result = run();
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), "::error title=Quality failure::SEARCH_KEY_REQUIRED");
  assert.deepEqual(await readdir(directory), []);
});
