import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewerClauseControls } from "./fixtures/reviewer-clause-controls.mjs";
import { buildSplitClaimReview, validateSplitClaimReview } from "../scripts/automation/free/split-claim-review.mjs";
import { diagnoseOneWriter, openDiagnostic } from "../scripts/automation/private-writer-diagnostic.mjs";
import { requestWorkersAiEditorial } from "../scripts/automation/free/workers-ai.mjs";

const cases = reviewerClauseControls();
const flags = ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"];
const input = () => ({ drafts: cases.map(item => structuredClone(item.draft)), dossiers: cases.map(item => structuredClone(item.dossier)) });
const payloads = bundle => [
  { reviews: bundle.claims.data.claims.map(entry => ({ candidateId: entry.candidateId, draftSha256: entry.draftSha256,
    claimVerdicts: entry.claimEvidence.map(claim => ({ claimIndex: claim.claimIndex, claimSha256: claim.claimSha256,
      allCitedPassagesSupport: cases.find(item => item.draft.candidateId === entry.candidateId).expected.claims[claim.claimIndex] })) })) },
  { reviews: bundle.editorial.data.drafts.map(entry => ({ candidateId: entry.draft.candidateId, draftSha256: entry.draftSha256,
    fieldFacts: { headline: true, deck: true, claim0: true,
      claim1: entry.draft.candidateId !== "review-holdout-42", whyItMatters: true,
      whatToDoOrWatch: entry.draft.candidateId !== "clause-control-38" },
    ...Object.fromEntries(flags.slice(1).map(field => [field, cases.find(item => item.draft.candidateId === entry.draft.candidateId).expected[field] ?? true])) })) },
];

test("claim review excludes uncited source context and prose; whole-story review retains all caveats", () => {
  const original = input();
  const bundle = buildSplitClaimReview(original);
  const missing = bundle.claims.data.claims.find(entry => entry.candidateId === "clause-control-24");
  assert.equal(missing.claimEvidence[1].citations.length, 1);
  assert.deepEqual(missing.claimEvidence[1].citations.map(c => c.evidenceId), ["S1P2"]);
  assert.ok(!Object.hasOwn(bundle.claims.data, "dossiers"));
  assert.deepEqual(missing.claimEvidence.flatMap(claim => claim.citations.map(citation => citation.text)),
    original.dossiers[1].sources[0].passages.slice(0, 2).map(passage => passage.text));
  assert.ok(!Object.hasOwn(missing, "draft"));
  assert.ok(bundle.editorial.data.dossiers.find(d => d.candidateId === "clause-control-24").sources[0]
    .passages.some(p => p.evidenceId === "S1P3"));
  assert.ok(!Object.hasOwn(bundle.editorial.data.drafts[0], "claimEvidence"));
  for (const stage of ["claims", "editorial"]) assert.doesNotMatch(JSON.stringify(bundle[stage].data), /"caseId"|"expected"/);
  original.drafts[0].claims[0].text = "Changed after binding";
  assert.notEqual(bundle.editorial.data.drafts[0].draft.fields.claim0, "Changed after binding");
  for (const [index, entry] of bundle.editorial.data.drafts.entries()) {
    const originalDraft = cases[index].draft;
    assert.deepEqual(entry.draft.fields, { headline: originalDraft.headline, deck: originalDraft.deck,
      claim0: originalDraft.claims[0].text, claim1: originalDraft.claims[1].text,
      whyItMatters: originalDraft.whyItMatters, whatToDoOrWatch: originalDraft.whatToDoOrWatch });
    assert.deepEqual(Object.keys(entry.draft.fields).sort(), Object.keys(payloads(bundle)[1].reviews[index].fieldFacts).sort());
  }
  assert.throws(() => { bundle.claims.data.claims[0].draftSha256 = "changed"; }, TypeError);
});

test("split validation retains exact hashes and independent vetoes without rewriting the submitted draft", () => {
  const bundle = buildSplitClaimReview(input());
  const [claims, editorial] = payloads(bundle);
  const checked = validateSplitClaimReview(claims, editorial, bundle);
  assert.deepEqual(checked.errors, []);
  assert.deepEqual(checked.reviews[0].claimSupport, [["S1P1"], ["S1P2", "S1P3"]]);
  assert.deepEqual(checked.reviews[1].claimSupport, [["S1P1"], []]);
  assert.equal(checked.reviews[2].factsSupported, false);
  assert.equal(checked.reviews[2].analysisSupported, false);
  for (const mutate of [
    (c, e) => { e.reviews[0].draftSha256 = "0".repeat(64); },
    c => { c.reviews[0].claimVerdicts[0].claimSha256 = "0".repeat(64); },
    c => { c.reviews[0].claimVerdicts[0].allCitedPassagesSupport = "true"; },
    (c, e) => { e.reviews[0].fieldFacts.claim0 = "true"; },
    (c, e) => { delete e.reviews[0].fieldFacts.claim1; },
    (c, e) => { e.reviews[0].fieldFacts.extra = true; },
    c => { c.reviews[1] = structuredClone(c.reviews[0]); },
    (c, e) => { e.reviews[0].claimVerdicts = c.reviews[0].claimVerdicts; },
    c => { c.reviews[0].claimVerdicts[1].claimIndex = 0; },
  ]) {
    const [c, e] = payloads(bundle); mutate(c, e);
    assert.ok(validateSplitClaimReview(c, e, bundle).errors.length);
  }
  assert.ok(validateSplitClaimReview(claims, undefined, bundle).errors.length);
  assert.ok(validateSplitClaimReview(claims, editorial, structuredClone(bundle)).errors.length);
  for (const field of Object.keys(editorial.reviews[0].fieldFacts)) {
    const [c, e] = payloads(bundle);
    e.reviews[0].fieldFacts[field] = false;
    const result = validateSplitClaimReview(c, e, bundle);
    assert.deepEqual(result.errors, []);
    assert.equal(result.reviews[0].factsSupported, false, `${field} independently vetoes factual approval`);
    assert.equal(result.reviews[0].analysisSupported, true, "Other flags are not silently rewritten");
  }
});

const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
const base = { publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  accountId: "0".repeat(32), apiToken: "synthetic-only-private-test-token", mode: "split-review-controls",
  now: new Date("2026-09-21T12:00:00Z"), researchImpl: () => assert.fail("No research in synthetic controls"),
  aiRequestImpl: requestWorkersAiEditorial };

test("two bounded live-shaped calls qualify correct verdicts but not blanket approvals or rejections", async () => {
  for (const blanket of [null, true, false]) {
    let calls = 0;
    const bundle = buildSplitClaimReview(input());
    const expected = payloads(bundle);
    const { report, sealed } = await diagnoseOneWriter({ ...base, fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(init.redirect, "error");
      assert.equal(body.max_tokens, 1800);
      assert.equal(body.response_format.type, "json_object");
      assert.doesNotMatch(body.messages[1].content, /"expected"|"caseId"/);
      assert.deepEqual(JSON.parse(body.messages[1].content), bundle[calls === 0 ? "claims" : "editorial"].data);
      const value = structuredClone(expected[calls++]);
      if (blanket !== null) for (const review of value.reviews) {
        if (review.claimVerdicts) for (const claim of review.claimVerdicts) claim.allCitedPassagesSupport = blanket;
        else {
          for (const flag of flags.slice(1)) review[flag] = blanket;
          for (const field of Object.keys(review.fieldFacts)) review.fieldFacts[field] = blanket;
        }
      }
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(value) }, errors: [] }),
        { headers: { "content-type": "application/json" } });
    } });
    assert.equal(report.status, blanket === null ? "reviewer-controls-passed" : "failed");
    assert.equal(report.modelRequests, 2);
    assert.equal(report.outputBudget, 3600);
    assert.equal(report.emailSent, false);
    assert.equal(report.searchQueries, 0);
    assert.equal(openDiagnostic(sealed, pair.privateKey).calls.length, 2);
    assert.ok(!JSON.stringify(sealed).includes("Synthetic Larch"));
  }
});

test("split diagnostic stops on quota before the editorial call", async () => {
  let calls = 0;
  const { report } = await diagnoseOneWriter({ ...base, fetchImpl: async () => {
    calls++; return new Response(JSON.stringify({ errors: [{ code: 123, message: "quota" }] }), { status: 429 });
  } });
  assert.equal(calls, 1);
  assert.equal(report.status, "failed");
  assert.equal(report.outputBudget, 1800);
  assert.equal(report.failures[0].httpStatus, "429");
});

test("isolated editorial checks share the same output ceiling and cannot substitute another story", async () => {
  for (const mode of ["valid", "wrong-scope", "quota"]) {
    let calls = 0;
    const expected = payloads(buildSplitClaimReview(input()));
    const tokens = [];
    const { report } = await diagnoseOneWriter({ ...base, mode: "isolated-review-controls",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body);
        const data = JSON.parse(body.messages[1].content);
        const call = calls++;
        tokens.push(body.max_tokens);
        let response = expected[0];
        if (call > 0) {
          assert.equal(data.dossiers.length, 1);
          assert.equal(data.drafts.length, 1);
          assert.equal(data.drafts[0].draft.candidateId, data.dossiers[0].candidateId);
          assert.deepEqual(data.dossiers[0], buildSplitClaimReview(input()).editorial.data.dossiers[call - 1]);
          if (mode === "quota") return new Response(JSON.stringify({ errors: [{ message: "quota" }] }), { status: 429 });
          response = { reviews: [expected[1].reviews[mode === "wrong-scope" ? 3 : call - 1]] };
        }
        return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(response) }, errors: [] }),
          { headers: { "content-type": "application/json" } });
      } });
    assert.deepEqual(tokens, mode === "valid" ? [1800, 450, 450, 450, 450] : [1800, 450]);
    assert.equal(report.status, mode === "valid" ? "reviewer-controls-passed" : "failed");
    assert.equal(report.outputBudget, tokens.reduce((a, b) => a + b, 0));
    assert.equal(report.networkRequests, calls);
    assert.equal(report.emailSent, false);
    assert.equal(report.searchQueries, 0);
    if (mode === "wrong-scope") assert.equal(report.failures[0].code, "DIAGNOSTIC_REVIEW_SCOPE");
  }
});

test("split control real CLI reaches mocked provider and writes only encrypted failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "first-fold-split-startup-"));
  try {
    const artifact = join(directory, "result.json");
    const preload = `globalThis.fetch=async()=>new Response(JSON.stringify({errors:[{code:123,message:"fixture quota"}]}),{status:429});`;
    const child = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`,
      "scripts/automation/private-writer-diagnostic.mjs", "run", artifact], { encoding: "utf8", timeout: 5000,
      env: { GITHUB_REPOSITORY: "itworksinprod/first-fold", GITHUB_REF: "refs/heads/main",
        GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/private-writer-diagnostic.yml@refs/heads/main",
        GITHUB_ACTOR: "itworksinprod", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1",
        PRIVATE_WRITER_DIAGNOSTIC_MODE: base.mode, DIAGNOSTIC_PUBLIC_KEY: base.publicKey,
        CLOUDFLARE_ACCOUNT_ID: base.accountId, CLOUDFLARE_AI_API_TOKEN: base.apiToken } });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1, child.stderr);
    assert.doesNotMatch(child.stderr, /unsettled top-level await/);
    const result = openDiagnostic(JSON.parse(await readFile(artifact, "utf8")), pair.privateKey);
    assert.equal(result.report.modelRequests, 1);
    assert.equal(result.report.emailSent, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
