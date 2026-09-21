import assert from "node:assert/strict";
import test from "node:test";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freeReviewerSyntheticCases } from "../scripts/automation/check-free-reviewer.mjs";
import { scoreReviewerControls } from "../scripts/automation/reviewer-transport-diagnostic.mjs";
import { diagnoseOneWriter, openDiagnostic } from "../scripts/automation/private-writer-diagnostic.mjs";
import { requestWorkersAiEditorial, DEFAULT_CLOUDFLARE_AI_MODEL } from "../scripts/automation/free/workers-ai.mjs";

const cases = freeReviewerSyntheticCases();
const flags = ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"];
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const expected = () => ({ reviews: cases.map(item => ({ candidateId: item.draft.candidateId,
  draftSha256: hash(item.draft), claimSupport: item.expected.claims.map((supported, index) =>
    supported ? item.draft.claims[index].supports.map(value => value.evidenceId) : []),
  ...Object.fromEntries(flags.map(field => [field, item.expected[field] ?? true])),
})) });
const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
const base = { publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  accountId: "0".repeat(32), apiToken: "private-fixture-token", mode: "review-controls",
  now: new Date("2026-09-21T03:00:00Z"), researchImpl: () => assert.fail("Synthetic controls must not research") };

test("control scoring fails closed for stale hashes, partial support, duplicate candidates and non-boolean flags", () => {
  assert.equal(scoreReviewerControls(expected(), cases).passed, true);
  for (const mutate of [
    p => { p.reviews[0].draftSha256 = "0".repeat(64); },
    p => { p.reviews[0].claimSupport[0] = ["S1P3"]; },
    p => { p.reviews[0].claimSupport[0] = ["S1P1", "S1P1"]; },
    p => { p.reviews[0].factsSupported = "true"; },
    p => { p.reviews[1] = structuredClone(p.reviews[0]); },
    p => { p.reviews[0].extra = true; },
  ]) {
    const payload = expected(); mutate(payload);
    assert.equal(scoreReviewerControls(payload, cases).protocolValid, false);
    assert.equal(scoreReviewerControls(payload, cases).passed, false);
  }
});

test("an always-empty citation reviewer and an always-approving reviewer both fail the controls", () => {
  const empty = expected();
  for (const review of empty.reviews) review.claimSupport = [[], []];
  assert.equal(scoreReviewerControls(empty, cases).protocolValid, true);
  assert.equal(scoreReviewerControls(empty, cases).passed, false);
  const approving = expected();
  for (const [index, review] of approving.reviews.entries()) {
    review.claimSupport = cases[index].draft.claims.map(claim => claim.supports.map(value => value.evidenceId));
    for (const field of flags) review[field] = true;
  }
  assert.equal(scoreReviewerControls(approving, cases).passed, false);
});

test("live-shaped comparison uses identical synthetic evidence and criteria, two calls, no research and no expected labels", async () => {
  const bodies = [];
  const { report, sealed } = await diagnoseOneWriter({ ...base, aiRequestImpl: requestWorkersAiEditorial,
    fetchImpl: async (url, init) => {
      assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${base.accountId}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`);
      assert.equal(init.redirect, "error");
      const body = JSON.parse(init.body); bodies.push(body);
      assert.equal(body.max_tokens, 1800);
      assert.ok(!body.messages.some(message => /"expected"|"caseId"/.test(message.content)));
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(expected()) }, errors: [] }),
        { headers: { "content-type": "application/json" } });
    } });
  assert.equal(report.status, "reviewer-controls-passed", JSON.stringify(report));
  assert.equal(report.modelRequests, 2);
  assert.equal(report.networkRequests, 2);
  assert.equal(report.outputBudget, 3600);
  assert.equal(report.emailSent, false);
  assert.equal(report.searchQueries, 0);
  assert.deepEqual(bodies.map(body => body.response_format.type), ["json_schema", "json_object"]);
  assert.deepEqual(bodies[0].messages, bodies[1].messages);
  assert.ok(!JSON.stringify(sealed).includes("Synthetic Meridian"));
  assert.equal(openDiagnostic(sealed, pair.privateKey).calls.length, 2);
});

test("provider quota or missing credentials stops controls without a second-format retry", async () => {
  let calls = 0;
  const { report } = await diagnoseOneWriter({ ...base, aiRequestImpl: requestWorkersAiEditorial,
    fetchImpl: async () => { calls++; return new Response(JSON.stringify({ errors: [{ code: 123, message: "limited" }] }), { status: 429 }); } });
  assert.equal(report.status, "failed");
  assert.equal(calls, 1);
  assert.equal(report.modelRequests, 1);
  assert.equal(report.outputBudget, 1800);
  await assert.rejects(diagnoseOneWriter({ ...base, apiToken: "", aiRequestImpl: () => assert.fail("No inference") }));
});

test("real CLI entry point completes dynamic control import and encrypts a mocked quota failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "first-fold-control-startup-"));
  try {
    const artifact = join(directory, "result.json");
    const preload = `globalThis.fetch = async () => new Response(JSON.stringify({errors:[{code:123,message:"fixture quota"}]}), {status:429,headers:{"content-type":"application/json"}});`;
    const child = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`,
      "scripts/automation/private-writer-diagnostic.mjs", "run", artifact], { encoding: "utf8", timeout: 5000,
      env: { GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main",
        GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/private-writer-diagnostic.yml@refs/heads/main",
        GITHUB_ACTOR: "itworksinprod", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1",
        PRIVATE_WRITER_DIAGNOSTIC_MODE: "review-controls", DIAGNOSTIC_PUBLIC_KEY: base.publicKey,
        CLOUDFLARE_ACCOUNT_ID: base.accountId, CLOUDFLARE_AI_API_TOKEN: base.apiToken } });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1, child.stderr);
    assert.doesNotMatch(child.stderr, /unsettled top-level await/);
    assert.match(child.stdout, /One-story diagnostic/);
    const capture = openDiagnostic(JSON.parse(await readFile(artifact, "utf8")), pair.privateKey);
    assert.equal(capture.report.modelRequests, 1);
    assert.equal(capture.report.networkRequests, 1);
    assert.equal(capture.report.emailSent, false);
    assert.equal(capture.calls[0].failure.httpStatus, "429");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
