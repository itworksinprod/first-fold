import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { previewGeminiLite, renderHumanReview, evidenceMappedPreviewSchema, validPreviewEvidenceMap } from "../scripts/automation/preview-gemini-lite.mjs";
import { reviewerResearchScopeCases } from "./fixtures/reviewer-research-scope.mjs";
import { GEMINI_LITE_MODEL } from "../scripts/automation/free/gemini-ai.mjs";
import { validateGroundedStory, GROUNDED_DRAFT_SCHEMA } from "../scripts/automation/free/grounded-draft.mjs";
import {previewMechanicalRepairAllowed} from '../scripts/automation/preview-fresh-gemini.mjs';
const settings = { apiKey: "synthetic-preview-key-not-real", freeProjectConfirmation: "FREE PROJECT BILLING DISABLED" };
const response = draft => new Response(JSON.stringify({ modelVersion: GEMINI_LITE_MODEL,
  candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify({ stories: [draft] }) }] } }] }),
  { headers: { "content-type": "application/json" } });
test('early SHAPE cannot mask a known certainty alarm and authorize mechanical repair',async()=>{
  const {draft,dossier}=structuredClone(reviewerResearchScopeCases()[0]);
  draft.whatToDoOrWatch='Check the personal access token configuration against the documented source limits before deciding whether any change applies to this installation.';
  draft.whyItMatters='These controls ensure performance for everyone. The proposed approach applies to the systems described in the source account.';
  const map=Object.fromEntries(['headline','deck','whyItMatters','whatToDoOrWatch'].map(f=>[f,[dossier.sources[0].passages[0].evidenceId]]));
  let calls=0;
  const result=await previewGeminiLite({...settings,dossier,fresh:true,fetchImpl:async()=>{
    calls++;return new Response(JSON.stringify({modelVersion:GEMINI_LITE_MODEL,candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify({stories:[draft],evidenceForFields:map})}]}}]}),{headers:{'content-type':'application/json'}});
  }});
  assert.equal(calls,1);
  assert.ok(result.report.structuralErrors.includes('SHAPE'));
  assert.ok(result.report.structuralErrors.includes('CERTAINTY_REVIEW_REQUIRED'));
  assert.equal(previewMechanicalRepairAllowed(result),false);
});
test('unassessable claims cannot make a recognized SHAPE look mechanically repairable',async()=>{
  const {draft,dossier}=structuredClone(reviewerResearchScopeCases()[0]);
  draft.whatToDoOrWatch='Check the personal access token configuration against the documented source limits before deciding whether any change applies to this installation.';
  draft.whyItMatters='These controls ensure performance for everyone. The proposed approach applies to the systems described in the source account.';
  draft.claims[0].text=null;
  const map=Object.fromEntries(['headline','deck','whyItMatters','whatToDoOrWatch'].map(f=>[f,[dossier.sources[0].passages[0].evidenceId]]));
  const result=await previewGeminiLite({...settings,dossier,fresh:true,fetchImpl:async()=>new Response(JSON.stringify({modelVersion:GEMINI_LITE_MODEL,candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify({stories:[draft],evidenceForFields:map})}]}}]}),{headers:{'content-type':'application/json'}})});
  assert.ok(result.report.structuralErrors.includes('SHAPE'));
  assert.ok(result.report.structuralErrors.includes('PREVIEW_ALARM_INPUT_UNASSESSABLE'));
  assert.equal(previewMechanicalRepairAllowed(result),false);
});
test("one call creates only an unapproved evidence-paired sample, never a sendable edition", async () => {
  let calls = 0;
  const { draft } = reviewerResearchScopeCases()[0];
  const result = await previewGeminiLite({ ...settings, fetchImpl: async (url, options) => {
    calls++; assert.match(url, /gemini-3\.5-flash-lite:generateContent$/);
    const body = JSON.parse(options.body);
    assert.match(body.systemInstruction.parts[0].text, /exact supplied publisher name/);
    const data = JSON.parse(body.contents[0].parts[0].text);
    assert.deepEqual(Object.keys(data), ["dossiers"]);
    assert.doesNotMatch(JSON.stringify(data), /"expected"|"headline"|"caseId"/);
    return response(draft);
  } });
  assert.equal(calls, 1);
  assert.equal(result.report.status, "human-review-required");
  assert.equal(result.report.approved, false);
  assert.equal(result.report.qualified, false);
  assert.equal(result.report.emailRequests, 0);
  assert.match(result.html, /UNAPPROVED — HUMAN REVIEW REQUIRED/);
  assert.match(result.html, /S1P32/);
  assert.doesNotMatch(JSON.stringify(result.report), /headline|synthetic-preview/);
});
test("preview numbers must match the same field's cited passages; production behavior is unchanged", () => {
  const { draft, dossier } = structuredClone(reviewerResearchScopeCases()[0]);
  dossier.sources[0].passages.push({ evidenceId: "S1P99", text: "The next documentation update is planned for October 29, 2031." });
  dossier.sources[0].text += "\nThe next documentation update is planned for October 29, 2031.";
  draft.whatToDoOrWatch = "Check the documentation update planned for October 29, 2031, and compare the stated research limitations with the requirements of your intended use before making a deployment decision.";
  const map = Object.fromEntries(["headline", "deck", "whyItMatters", "whatToDoOrWatch"].map(field =>
    [field, [...new Set(draft.claims.flatMap(c => c.supports.map(s => s.evidenceId)))].slice(0, 4)]));
  map.whatToDoOrWatch = ["S1P99"];
  const reasons = [];
  assert.equal(validateGroundedStory(draft, dossier, reason => reasons.push(reason)), false);
  assert.ok(reasons.includes("NUMERIC_ANCHOR"));
  assert.equal(validateGroundedStory(draft, dossier, () => {}, { previewFieldEvidence: map }), true);
  for (const invalid of [{ ...map, whatToDoOrWatch: map.headline }, { ...map, whatToDoOrWatch: ["S9P999"] },
    { ...map, whatToDoOrWatch: [] }, { ...map, whatToDoOrWatch: ["S1P99", "S1P99"] }]) {
    assert.equal(validateGroundedStory(draft, dossier, () => {}, { previewFieldEvidence: invalid }), false);
  }
  draft.whatToDoOrWatch = draft.whatToDoOrWatch.replace("2031", "2032");
  assert.equal(validateGroundedStory(draft, dossier, () => {}, { previewFieldEvidence: map }), false);
});
test("invalid writing and quota failures do not create a preview or retry", async () => {
  for (const quota of [false, true]) {
    let calls = 0;
    const draft = structuredClone(reviewerResearchScopeCases()[0].draft);
    draft.claims[0].supports[0].evidenceId = "S9P999";
    const result = await previewGeminiLite({ ...settings, fetchImpl: async () => {
      calls++; return quota ? new Response("private diagnostic", { status: 429 }) : response(draft);
    } });
    assert.equal(calls, 1); assert.equal(result.html, null); assert.equal(result.report.status, "failed");
    assert.doesNotMatch(JSON.stringify(result.report), /private diagnostic/);
  }
});
test("unconfirmed billing never calls a model", async () => {
  const result = await previewGeminiLite({ ...settings, freeProjectConfirmation: "no",
    fetchImpl: async () => { assert.fail("must not fetch"); } });
  assert.equal(result.report.code, "GEMINI_FREE_TIER_NOT_CONFIRMED");
});
test("all draft and evidence content is escaped in the self-contained review page", () => {
  const { draft, dossier } = structuredClone(reviewerResearchScopeCases()[0]);
  draft.headline = '<script>alert("x")</script>';
  dossier.sources[0].passages[0].text = '<img src=x onerror=alert(1)>';
  const html = renderHumanReview(draft, dossier);
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /default-src 'none'/);
});
test("preview workflow cannot send mail or publish an edition", async () => {
  const workflow = await readFile(new URL("../.github/workflows/gemini-lite-human-preview.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /RESEND|OPENAI|schedule:|contents: write/);
  assert.equal((workflow.match(/secrets\./g) ?? []).length, 1);
});
test("fresh preview selects valid evidence for every non-claim field without granting semantic approval", async () => {
  const { draft, dossier } = reviewerResearchScopeCases()[0];
  const fields = ["headline", "deck", "whyItMatters", "whatToDoOrWatch"];
  const map = Object.fromEntries(fields.map(field => [field, [dossier.sources[0].passages[0].evidenceId]]));
  assert.deepEqual(Object.keys(evidenceMappedPreviewSchema(dossier).properties), ["evidenceForFields", "stories"]);
  assert.equal(validPreviewEvidenceMap(map, dossier), true);
  for (const invalid of [null, {}, { ...map, whyItMatters: [] }, { ...map, deck: ["S9P999"] },
    { ...map, headline: [...map.headline, ...map.headline] }, { ...map, extra: [] }]) {
    assert.ok(!validPreviewEvidenceMap(invalid, dossier));
  }
  for (const includeMap of [false, true]) {
    let calls = 0;
    const result = await previewGeminiLite({ ...settings, dossier, fresh: true, fetchImpl: async (url, options) => {
      calls++;
      assert.match(JSON.parse(options.body).systemInstruction.parts[0].text, /A plausible explanation is not evidence/);
      return new Response(JSON.stringify({ modelVersion: GEMINI_LITE_MODEL,
        candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify({
          ...(includeMap ? { evidenceForFields: map } : {}), stories: [draft] }) }] } }] }),
        { headers: { "content-type": "application/json" } });
    } });
    assert.equal(calls, 1);
    assert.equal(result.report.approved, false);
    assert.equal(result.report.status, includeMap ? "human-review-required" : "failed");
    if (includeMap) {
      assert.deepEqual(result.evidenceForFields, map);
      assert.match(result.reviewBinding.renderedStorySha256, /^[a-f0-9]{64}$/);
      assert.ok(Array.isArray(result.reviewHolds));
      assert.equal(result.reviewPacket, undefined); // no duplicated private context
    }
    else {
      assert.equal(result.rejectedDiagnostic.unapproved, true);
      assert.deepEqual(result.rejectedDiagnostic.payload.stories, [draft]);
      assert.equal(result.html, null);
      assert.ok(!JSON.stringify(result.report).includes(draft.headline));
    }
  }
});
test("damaged fresh advisory is held before any model request", async () => {
  const { dossier } = structuredClone(reviewerResearchScopeCases()[0]);
  dossier.sources[0].passages.push({ evidenceId: "S1P99", text: "To obtain and install the latest" });
  const result = await previewGeminiLite({ ...settings, fresh: true, dossier,
    fetchImpl: () => assert.fail("damaged evidence must not be drafted") });
  assert.equal(result.report.status, "evidence-held");
  assert.equal(result.report.modelRequests, 0);
  assert.equal(result.html, null);
});
test("targeted repair is fresh-only, candidate-bound and keeps rejected prose out of logs", async () => {
  const { draft, dossier } = reviewerResearchScopeCases()[0];
  const repair = { unapproved: true, payload: { stories: [draft] },
    rejectionDetails: [{ reason: "ORIGINALITY", feedback: { field: "claims[0].text" } }] };
  for (const options of [{ fresh: false, repair }, { fresh: true, repair: { ...repair, unapproved: false } },
    { fresh: true, repair: { ...repair, payload: { stories: [{ ...draft, candidateId: "wrong" }] } } }]) {
    await previewGeminiLite({ ...settings, dossier, ...options, fetchImpl: () => assert.fail("must not request") });
  }
  let calls = 0;
  const result = await previewGeminiLite({ ...settings, dossier, fresh: true, repair, fetchImpl: async (url, options) => {
    calls++;
    const data = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    assert.deepEqual(data.validationFeedback, repair.rejectionDetails);
    assert.deepEqual(data.rejectedDraft, repair.payload);
    assert.match(data.repairTask, /untrusted proposed text, not evidence/);
    return new Response("private error", { status: 429 });
  } });
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(result.report).includes(draft.headline));
  assert.equal(result.html, null);
});
test('preview can cite origin plus both dates without expanding production citation or word limits',()=>{
  const {draft,dossier}=structuredClone(reviewerResearchScopeCases()[0]);
  draft.claims[0].supports.push({evidenceId:'S1P11'});
  const map=Object.fromEntries(['headline','deck','whyItMatters','whatToDoOrWatch'].map(f=>[f,['S1P4','S1P5','S1P11']]));
  assert.equal(evidenceMappedPreviewSchema(dossier).properties.stories.items.properties.claims.items.properties.supports.maxItems,3);
  assert.equal(GROUNDED_DRAFT_SCHEMA.properties.stories.items.properties.claims.items.properties.supports.maxItems,2);
  const errors=[];
  assert.equal(validateGroundedStory(draft,dossier,(r)=>errors.push(r),{previewFieldEvidence:map}),true,JSON.stringify(errors));
  assert.equal(validateGroundedStory(draft,dossier),false);
  for(const supports of [[],[...draft.claims[0].supports,{evidenceId:'S1P8'}],[...draft.claims[0].supports.slice(0,2),{evidenceId:'S9P99'}],[...draft.claims[0].supports.slice(0,2),{evidenceId:'S1P4'}]]){
    const d=structuredClone(draft);d.claims[0].supports=supports;
    assert.equal(validateGroundedStory(d,dossier,()=>{},{previewFieldEvidence:map}),false);
  }
});
