import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { buildFieldFactReview, validateFieldFactReview } from "../scripts/automation/free/field-fact-review.mjs";
import { fieldReviewControls } from "./fixtures/field-review-controls.mjs";
import { diagnoseOneWriter, openDiagnostic } from "../scripts/automation/private-writer-diagnostic.mjs";
import { requestWorkersAiEditorial } from "../scripts/automation/free/workers-ai.mjs";
import { bindSourceFieldAudit } from "../scripts/automation/source-field-audit.mjs";
import { buildExplicitClaimReview } from "../scripts/automation/free/explicit-claim-review.mjs";
import { reviewerClauseControls } from "./fixtures/reviewer-clause-controls.mjs";

const cases = fieldReviewControls();
const response = (view, supported) => ({ reviewSha256: view.data.reviewSha256,
  comparison: "Synthetic mock comparison, not a semantic assessment.", evidenceIds: [view.data.passages[0].evidenceId], supported });

test("field review binds exact statement and full evidence without fixture labels", () => {
  for (const control of cases) {
    const input = structuredClone(control.input);
    const view = buildFieldFactReview(input);
    assert.doesNotMatch(JSON.stringify(view.data), /"expected"|"caseId"/);
    assert.equal(view.data.statement, input.text);
    assert.equal(view.data.passages.length, input.sources.flatMap(s => s.passages).length);
    input.text = "changed";
    input.sources[0].passages[0].text = "changed";
    assert.notEqual(view.data.statement, "changed");
    assert.notEqual(view.data.passages[0].text, "changed");
    assert.throws(() => { view.data.statement = "changed"; }, TypeError);
    assert.deepEqual(validateFieldFactReview(response(view, control.expected), view), { valid: true, supported: control.expected });
  }
});

test("real-draft binding retains extra source caveats and cannot audit a changed draft", () => {
  const control = reviewerClauseControls()[0];
  control.dossier.sources[0].text += "\nThe rollout excludes personal accounts.";
  const bundle = buildExplicitClaimReview({ drafts: [control.draft], dossiers: [control.dossier] });
  const checks = bindSourceFieldAudit(bundle.data);
  assert.equal(checks.length, 6);
  assert.deepEqual(checks.map(c => c.field), ["headline", "deck", "claim0", "claim1", "whyItMatters", "whatToDoOrWatch"]);
  for (const check of checks) {
    assert.equal(check.draftSha256, bundle.data.drafts[0].draftSha256);
    assert.match(check.view.data.contexts[0].text, /excludes personal accounts/);
    assert.equal(check.view.data.passages.length, 4);
  }
  const changed = structuredClone(bundle.data);
  changed.drafts[0].draft.headline += " changed";
  assert.throws(() => bindSourceFieldAudit(changed));
  assert.throws(() => bindSourceFieldAudit({ drafts: [] }));
  const input = structuredClone(cases[0].input);
  input.sources[0].text = "An additional limitation outside numbered passages.";
  assert.equal(buildFieldFactReview(input).data.contexts[0].text, input.sources[0].text);
});

test("malformed or mismatched field verdicts fail closed, including copied review objects", () => {
  const view = buildFieldFactReview(cases[0].input);
  for (const mutate of [
    r => { r.reviewSha256 = "0".repeat(64); }, r => { r.supported = "true"; },
    r => { r.evidenceIds = ["S99P1"]; }, r => { r.evidenceIds = []; },
    r => { r.evidenceIds = ["S1P1", "S1P1"]; }, r => { r.comparison = " "; },
    r => { r.comparison = "x".repeat(241); }, r => { r.extra = true; },
  ]) {
    const value = response(view, true); mutate(value);
    assert.deepEqual(validateFieldFactReview(value, view), { valid: false, supported: false });
  }
  assert.equal(validateFieldFactReview(response(view, true), structuredClone(view)).valid, false);
  const changed = structuredClone(cases[0].input);
  changed.sources[0].passages[0].text += " Additional caveat.";
  assert.equal(validateFieldFactReview(response(view, true), buildFieldFactReview(changed)).valid, false);
  for (const mutate of [
    v => { v.text = ""; }, v => { v.sources = []; },
    v => { v.sources[0].passages.push(v.sources[0].passages[0]); },
    v => { v.sources[0].passages[0].text = ""; },
  ]) { const value = structuredClone(cases[0].input); mutate(value); assert.throws(() => buildFieldFactReview(value)); }
});

test("field controls require positive and negative verdicts with bounded encrypted no-email transport", async () => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
  for (const mode of ["correct", "all-true", "all-false", "quota", "wrong-hash"]) {
    let count = 0;
    const { report, sealed } = await diagnoseOneWriter({
      publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
      accountId: "0".repeat(32), apiToken: "synthetic-test-only", mode: "field-review-controls",
      now: new Date("2026-09-21T12:00:00Z"), researchImpl: () => assert.fail("No live research"),
      aiRequestImpl: requestWorkersAiEditorial,
      fetchImpl: async (url, init) => {
        const control = cases[count++];
        const view = buildFieldFactReview(control.input);
        const body = JSON.parse(init.body);
        assert.equal(init.redirect, "error");
        assert.equal(body.max_tokens, 400);
        assert.deepEqual(JSON.parse(body.messages[1].content), view.data);
        assert.doesNotMatch(body.messages[1].content, /"expected"|"caseId"/);
        if (mode === "quota") return new Response(JSON.stringify({ errors: [{ message: "quota" }] }), { status: 429 });
        const value = response(view, mode === "all-true" ? true : mode === "all-false" ? false : control.expected);
        if (mode === "wrong-hash") value.reviewSha256 = "0".repeat(64);
        return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(value) }, errors: [] }),
          { headers: { "content-type": "application/json" } });
      },
    });
    assert.equal(report.status, mode === "correct" ? "reviewer-controls-passed" : "failed");
    assert.equal(count, ["quota", "wrong-hash"].includes(mode) ? 1 : 8);
    assert.equal(report.modelRequests, count);
    assert.equal(report.networkRequests, count);
    assert.equal(report.outputBudget, count * 400);
    assert.equal(report.emailSent, false);
    assert.equal(report.searchQueries, 0);
    assert.equal(openDiagnostic(sealed, pair.privateKey).calls.length, count);
    assert.ok(!JSON.stringify(sealed).includes("Meadow"));
  }
});
