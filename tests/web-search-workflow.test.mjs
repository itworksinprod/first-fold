import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const qualityWorkflow = await readFile(
  new URL("../.github/workflows/web-search-quality-check.yml", import.meta.url), "utf8",
);
const personalWorkflow = await readFile(
  new URL("../.github/workflows/personal-morning-paper.yml", import.meta.url), "utf8",
);
const qualityScriptUrl = new URL("../scripts/automation/check-personal-quality.mjs", import.meta.url);
const qualityScript = await readFile(qualityScriptUrl, "utf8");

function section(text, start, end) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `Missing bounded section: ${start}`);
  return text.slice(startIndex, endIndex);
}

test("web discovery quality runs are manual, owner-only trusted main, and first-attempt-only", () => {
  const trigger = section(qualityWorkflow, "on:", "permissions:");
  assert.match(trigger, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(trigger, /schedule:|cron:|push:|pull_request|workflow_run|inputs:/);
  assert.match(qualityWorkflow, /^name: Check free web discovery \(no email\)$/m);
  assert.match(qualityWorkflow, /github\.repository == 'itworksinprod\/first-fold'/);
  assert.match(qualityWorkflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(qualityWorkflow, /github\.actor == 'itworksinprod'/);
  assert.match(qualityWorkflow, /github\.run_attempt == 1/);
  assert.match(qualityWorkflow, /^  group: personal-morning-paper$/m);
  assert.match(qualityWorkflow, /^  cancel-in-progress: false$/m);
  assert.match(qualityWorkflow, /^    timeout-minutes: 20$/m);
});

test("web discovery quality checks have read-only permissions and no delivery or artifact capability", () => {
  assert.match(qualityWorkflow, /^permissions: \{\}$/m);
  const permissions = section(qualityWorkflow, "    permissions:", "    steps:");
  assert.match(permissions, /^      contents: read$/m);
  assert.doesNotMatch(permissions, /write|actions:|pages:|id-token:|issues:|pull-requests:/);
  assert.match(qualityWorkflow, /persist-credentials: false/);
  const actions = [...qualityWorkflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
  assert.equal(actions.length, 2);
  assert.ok(actions.every((action) => /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/.test(action)));
  assert.doesNotMatch(qualityWorkflow,
    /RESEND|OPENAI|PERSONAL_PAPER_EMAIL|sendPersonalEdition|personal-email\.mjs|upload-artifact|download-artifact|git push|git commit|gh pr|deploy-pages/);
  assert.equal(qualityWorkflow.match(/secrets\.TAVILY_API_KEY/g)?.length, 1);
  const credentialStep = qualityWorkflow.slice(
    qualityWorkflow.indexOf("      - name: Search, verify publishers and check summaries without sending"),
  );
  assert.match(credentialStep, /TAVILY_API_KEY: \$\{\{ secrets\.TAVILY_API_KEY \}\}/);
  assert.match(credentialStep, /TAVILY_PAYGO_DISABLED_VERIFIED: \$\{\{ vars\.TAVILY_PAYGO_DISABLED_VERIFIED \}\}/);
  assert.match(credentialStep, /run: node scripts\/automation\/check-personal-quality\.mjs --require-web-search/);
  assert.ok(qualityWorkflow.indexOf("run: npm test") < qualityWorkflow.indexOf("TAVILY_API_KEY:"));
  assert.doesNotMatch(qualityWorkflow.slice(0, qualityWorkflow.indexOf(credentialStep)),
    /CLOUDFLARE_AI_API_TOKEN|TAVILY_API_KEY/);
});

test("the daily paper exposes the optional search secret only to its generation step", () => {
  const generation = section(personalWorkflow,
    "      - name: Generate the private source-checked candidate",
    "      - name: Probe the advisory source-health report");
  assert.match(generation, /^          TAVILY_API_KEY: \$\{\{ secrets\.TAVILY_API_KEY \}\}$/m);
  assert.match(generation, /^          TAVILY_PAYGO_DISABLED_VERIFIED: \$\{\{ vars\.TAVILY_PAYGO_DISABLED_VERIFIED \}\}$/m);
  assert.match(generation, /steps\.dedupe\.outputs\.should_send == 'true'/);
  assert.match(generation, /steps\.preflight\.outputs\.delivery_enabled == 'true'/);
  assert.equal(personalWorkflow.match(/secrets\.TAVILY_API_KEY/g)?.length, 1);
  assert.doesNotMatch(personalWorkflow.replace(generation, ""), /TAVILY/);
  assert.doesNotMatch(generation, /RESEND_API_KEY|PERSONAL_PAPER_EMAIL|OPENAI_API_KEY/);
  // Search is optional in the daily paper, unlike the explicit integration test.
  assert.doesNotMatch(generation, /require-web-search|SEARCH_KEY_REQUIRED|\[\[.*TAVILY/);
});

test("search integration preserves daily dispatch timing and the configured private recipient", () => {
  const trigger = section(personalWorkflow, "on:", "permissions:");
  assert.match(trigger, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(trigger, /schedule:|cron:|push:|pull_request/);
  assert.match(personalWorkflow, /const timeZone = "America\/New_York"/);
  assert.match(personalWorkflow, /scheduledParts\.hour !== "05"/);
  assert.match(personalWorkflow, /scheduledParts\.minute !== "05"/);
  assert.doesNotMatch(personalWorkflow, /isWeekday|\["Mon", "Tue", "Wed", "Thu", "Fri"\]/);
  const delivery = section(personalWorkflow,
    "      - name: Send only the validated paper to its private recipient",
    "      - name: Confirm private delivery before shadow observation");
  assert.match(delivery, /^          PERSONAL_PAPER_EMAIL: \$\{\{ secrets\.PERSONAL_PAPER_EMAIL \}\}$/m);
  assert.match(delivery, /^          RESEND_API_KEY: \$\{\{ secrets\.RESEND_API_KEY \}\}$/m);
  assert.match(delivery, /steps\.candidate\.outputs\.candidate_created == 'true'/);
  assert.doesNotMatch(delivery, /TAVILY|--preview|--recipient|--to\b|@gmail\.com/);
});

test("the quality script imports only candidate validation and rendering from the email module", () => {
  assert.match(qualityScript,
    /import \{ assertPersonalEmailCandidate, renderPersonalEditionEmail \} from "\.\/personal-email\.mjs";/);
  assert.doesNotMatch(qualityScript,
    /sendPersonalEditionEmail|sendPersonalEditionPreview|RESEND_API_KEY|PERSONAL_PAPER_EMAIL|api\.resend\.com/);
  assert.match(qualityScript, /emailSent: false/);
  assert.match(qualityScript, /repeatHistory: "isolated-test-empty-ledger"/);
  assert.ok(qualityScript.indexOf('code: "SEARCH_KEY_REQUIRED"') <
    qualityScript.indexOf("await generatePersonalFreeEdition("));
});

test("requiring web search without a key fails before research, with cleared credentials and network blocked", () => {
  // This preloader makes an accidental early network call fail visibly; the
  // subprocess receives none of the developer's real credentials or NODE_OPTIONS.
  const networkBlocker = `
    import http from 'node:http';
    import https from 'node:https';
    import net from 'node:net';
    import { syncBuiltinESMExports } from 'node:module';
    const block = () => { throw new Error('UNEXPECTED_NETWORK'); };
    globalThis.fetch = block;
    http.request = http.get = https.request = https.get = block;
    net.connect = net.createConnection = block;
    syncBuiltinESMExports();
  `;
  for (const env of [{}, { TAVILY_API_KEY: " \t " }]) {
    const result = spawnSync(process.execPath, [
      "--import", `data:text/javascript,${encodeURIComponent(networkBlocker)}`,
      fileURLToPath(qualityScriptUrl), "--require-web-search",
    ], { env, encoding: "utf8", timeout: 5000, maxBuffer: 16 * 1024 });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.trim(), "::error title=Quality failure::SEARCH_KEY_REQUIRED");
  }
});
