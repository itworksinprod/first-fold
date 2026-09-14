import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { groundedDraft, groundedEvidence } from "./fixtures/grounded-summary.mjs";
import { malformedEmailStories } from "./fixtures/malformed-email-2026-09-11.mjs";
import { GROUNDED_DRAFT_SCHEMA, groundedDossiers, validateGroundedStory, synthesizeGroundedEditorial } from
  "../scripts/automation/free/grounded-draft.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL, EXPERIMENTAL_FREE_WRITER_MODEL, FREE_REASONING_WRITER_MODEL } from "../scripts/automation/free/workers-ai.mjs";

const candidate = { candidateId: groundedDraft.candidateId, suggestedDesk: "security-and-privacy",
  ranking: { evidenceTier: "authoritative-single" }, feedEvidence: [groundedEvidence],
  sources: [{ id: "cert-advisory", title: groundedEvidence.title, publisher: "CERT/CC",
    relationship: "originating", publishedAt: groundedEvidence.publishedAt }] };
const dossier = groundedDossiers([candidate])[0];
const baseline = { frontPage: { note: "old", estimatedMinutes: 1 }, desks: {
  "security-and-privacy": { story: { id: "s1", headline: "old", sources: candidate.sources,
    selection: { score: 77 }, timing: { eventAt: null }, confidence: { level: "developing" } } },
} };
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function response(editorialPayload) {
  return { editorialPayload, provider: "cloudflare-workers-ai", model: DEFAULT_CLOUDFLARE_AI_MODEL,
    responseId: "test", requestSha256: "a".repeat(64), responseSha256: "b".repeat(64) };
}
const review = { candidateId: groundedDraft.candidateId, draftSha256: hash(groundedDraft),
  claimSupport: groundedDraft.claims.map((claim) => claim.supports.map((support) => support.evidenceId)),
  factsSupported: true, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true };
const copiedClaim = `CERT/CC says: ${groundedEvidence.summary.split(". ").slice(0, 2).join(". ")}.`;

test("grounded writer accepts concrete supported news including a driver filename", () => {
  assert.equal(validateGroundedStory(groundedDraft, dossier), true);
});
test("natural paragraph balance accepts a concise sourced fact without losing whole-story completeness", () => {
  const draft = structuredClone(groundedDraft);
  draft.claims[0].text = "CERT/CC reports that AOMEI Backupper’s amwrtdrv.sys driver exposes disk writes to a local user because its access checks are inadequate.";
  draft.whyItMatters += " This is therefore a concern about recovery software becoming a route to data damage, not proof that a particular system has been attacked.";
  assert.ok(draft.claims[0].text.length < 150);
  assert.ok(draft.whyItMatters.length > 400);
  assert.equal(validateGroundedStory(draft, dossier), true);
  draft.claims[0].text = "CERT/CC describes a local disk-write flaw in the backup software's driver.";
  draft.claims[1].text = "The advisory names neither a corrected release nor observed attacks against users.";
  draft.whyItMatters = "If the affected driver is installed, unauthorized disk access could undermine the stored information that backups are meant to protect.";
  draft.whatToDoOrWatch = "Check the advisory for remediation and the vendor's affected-release guidance before choosing a response for your machines.";
  const codes = [];
  assert.equal(validateGroundedStory(draft, dossier, code => codes.push(code)), false);
  assert.deepEqual(codes, ["WORD_COUNT"]);
});
test("grounded writer rejects invented numbers, evidence, citations, generic prose and instructions", () => {
  const mutations = [
    (draft) => { draft.whatToDoOrWatch += " Install version 9.9 immediately."; },
    (draft) => { draft.claims[0].supports[0].quote = "The vendor fixed this defect yesterday."; },
    (draft) => { draft.claims[0].supports[0].evidenceId = "unknown"; },
    (draft) => { draft.headline = "CERT/CC reports a new development"; },
    (draft) => { draft.whatToDoOrWatch += " Disable your antivirus."; },
    (draft) => { draft.whatToDoOrWatch += " Disable Secure Boot."; },
    (draft) => { draft.whatToDoOrWatch += " Turn off Secure Boot."; },
    (draft) => { draft.whatToDoOrWatch += " Visit https://evil.example"; },
    (draft) => { draft.claims[0].text = groundedEvidence.summary; },
    (draft) => { draft.claims[0].text = draft.claims[0].text.replace("CERT/CC", "Another source"); },
  ];
  for (const mutate of mutations) {
    const draft = structuredClone(groundedDraft); mutate(draft);
    assert.equal(validateGroundedStory(draft, dossier), false);
  }
});
test("writing and review are budgeted independently; only checked prose replaces the baseline", async () => {
  const calls = [];
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    accountId: "0".repeat(32), apiToken: "fixture", aiRequestImpl: async (options) => {
      calls.push(options);
      return response(calls.length === 1 ? { stories: [groundedDraft] } : { reviews: [review] });
    } });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.maxAttempts, 1);
    assert.equal(call.model, DEFAULT_CLOUDFLARE_AI_MODEL);
    assert.equal(call.maxRequestBytes, 70_000);
    assert.ok(!JSON.stringify(call.messages).includes("fixture"));
  }
  assert.equal(result.editorial.desks["security-and-privacy"].story.headline, groundedDraft.headline);
  assert.deepEqual(result.editorial.desks["security-and-privacy"].story.selection, { score: 77 });
  assert.deepEqual(result.editorial.desks["security-and-privacy"].story.sources, candidate.sources);
  assert.equal(baseline.desks["security-and-privacy"].story.headline, "old");
});
test("quota errors stop immediately with no provider fallback or retries", async () => {
  let calls = 0;
  assert.equal(await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    aiRequestImpl: async () => { calls++; throw new Error("quota"); } }), null);
  assert.equal(calls, 1);
});

test("the Cloudflare open-weight reasoning writer retains the existing total budget and factual veto", async () => {
  for (const accepted of [true, false]) {
    const calls = [];
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      model: FREE_REASONING_WRITER_MODEL, aiRequestImpl: async options => {
        calls.push(options);
        assert.equal(options.model, "@cf/openai/gpt-oss-120b");
        assert.equal(options.responseFormat, "json_schema");
        assert.match(options.messages[0].content, /^Reasoning: low\n/);
        assert.equal(options.maxAttempts, 1);
        return { ...response(calls.length === 1 ? { stories: [groundedDraft] }
          : { reviews: [{ ...review, factsSupported: accepted }] }), model: FREE_REASONING_WRITER_MODEL };
      } });
    assert.equal(Boolean(result), accepted);
    assert.deepEqual(calls.map(call => call.maxTokens), [3_800, 2_400]);
    assert.equal(calls.reduce((total, call) => total + call.maxTokens, 0) + 1_600, 7_800);
    if (result) assert.equal(result.inference.model, FREE_REASONING_WRITER_MODEL);
  }
});
test("semantic reviewer veto, wrong draft hash and unavailable checker all keep the safe baseline", async () => {
  for (const badReview of [{ ...review, factsSupported: false }, { ...review, draftSha256: "wrong" },
    { ...review, attributionAccurate: false }, { ...review, analysisSupported: false },
    { ...review, usefulAndSpecific: false }, null]) {
    let calls = 0;
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      aiRequestImpl: async () => {
        if (++calls === 1) return response({ stories: [groundedDraft] });
        if (badReview === null) throw new Error("checker timeout");
        return response({ reviews: [badReview] });
      } });
    assert.equal(result, null);
    assert.equal(calls, 2);
  }
});
test("ambiguous drafts cannot replace stories", async () => {
  for (const stories of [[groundedDraft, groundedDraft], [{ ...groundedDraft, candidateId: "injected" }]]) {
    let calls = 0;
    assert.equal(await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      aiRequestImpl: async () => { calls++; return response({ stories }); } }), null);
    assert.equal(calls, 1);
  }
});

test("Qwen originality repair edits only the rejected field and still requires full validation and review", async () => {
  for (const scenario of ["valid", "wrong-field", "damaged-copy", "review-veto"]) {
    let calls = 0;
    const copied = structuredClone(groundedDraft);
    copied.claims[0].text = copiedClaim;
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      model: EXPERIMENTAL_FREE_WRITER_MODEL, aiRequestImpl: async options => {
        calls++;
        const wrap = payload => ({ ...response(payload), model: EXPERIMENTAL_FREE_WRITER_MODEL });
        if (calls === 1) return wrap({ stories: [copied] });
        if (calls === 2) {
          assert.ok(options.schema.properties.repairs);
          assert.equal(options.maxTokens, 2_000);
          const data = JSON.parse(options.messages[1].content);
          assert.equal(data.rejected[0].feedback.field, "claims[0].text");
          assert.deepEqual(data.rejected[0].originalField.supports, groundedDraft.claims[0].supports);
          return wrap({ repairs: [{ candidateId: candidate.candidateId,
            field: scenario === "wrong-field" ? "whyItMatters" : "claims[0].text",
            text: scenario === "damaged-copy" ? 'Broken JSON", "stories": [{' : groundedDraft.claims[0].text }] });
        }
        assert.equal(JSON.parse(options.messages[1].content).drafts[0].draftSha256, hash(groundedDraft));
        return wrap({ reviews: [{ ...review, factsSupported: scenario !== "review-veto" }] });
      } });
    assert.equal(Boolean(result), scenario === "valid");
    assert.ok(calls <= 3);
    if (result) assert.equal(result.editorial.desks["security-and-privacy"].story.whyItMatters, groundedDraft.whyItMatters);
  }
});

test("one originality revision is revalidated, hash-bound and separately checked", async () => {
  const copied = structuredClone(groundedDraft);
  copied.claims[0].text = copiedClaim;
  const codes = [];
  assert.equal(validateGroundedStory(copied, dossier, (code) => codes.push(code)), false);
  assert.deepEqual(codes, ["ORIGINALITY"]);
  const calls = [];
  const diagnostics = [];
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    onDiagnostic: (event) => diagnostics.push(event), aiRequestImpl: async (options) => {
      calls.push(options);
      if (calls.length === 1) return response({ stories: [copied] });
      if (calls.length === 2) {
        const data = JSON.parse(options.messages[1].content);
        assert.equal(data.rejected[0].rejectionCode, "ORIGINALITY");
        assert.equal(data.rejected[0].feedback.field, "claims[0].text");
        assert.deepEqual(data.rejected[0].draft, { candidateId: candidate.candidateId });
        assert.equal(Object.hasOwn(data.rejected[0].draft, "claims"), false);
        assert.equal(options.maxTokens, 3_000);
        assert.equal(options.maxAttempts, 1);
        return response({ stories: [groundedDraft] });
      }
      assert.equal(JSON.parse(options.messages[1].content).drafts[0].draftSha256, hash(groundedDraft));
      return response({ reviews: [review] });
    } });
  assert.equal(calls.length, 3);
  assert.equal(result.editorial.desks["security-and-privacy"].story.headline, groundedDraft.headline);
  assert.equal(result.inference.requestSha256, hash(Array(3).fill("a".repeat(64))));
  assert.ok(diagnostics.some((event) => event.stage === "draft-repair" && event.accepted === 1));
});

test("Qwen repairs all measured field defects without regenerating clean story fields", async () => {
  for (const scenario of ["valid", "extra-edit", "duplicate-edit", "unknown-citation", "review-veto"]) {
    const defective = structuredClone(groundedDraft);
    defective.whyItMatters += ` ${"An additional sentence adds needless padding. ".repeat(10).trim()}`;
    defective.whatToDoOrWatch = "Check the advisory.";
    defective.claims[0].text = defective.claims[0].text.replace("AOMEI Backupper", "AOMEI Backupper 9.9.9");
    const calls = [];
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      model: EXPERIMENTAL_FREE_WRITER_MODEL, aiRequestImpl: async options => {
        calls.push(options);
        const wrap = payload => ({ ...response(payload), model: EXPERIMENTAL_FREE_WRITER_MODEL });
        if (calls.length === 1) return wrap({ stories: [defective] });
        if (calls.length === 2) {
          const data = JSON.parse(options.messages[1].content);
          assert.deepEqual(data.requestedEdits[0].fields.map(item => item.field).sort(),
            ["claims[0].text", "whatToDoOrWatch", "whyItMatters"]);
          assert.equal(options.maxTokens, 2_000);
          assert.ok(data.dossiers[0].sources[0].passages.every(passage => Array.isArray(passage.supportedNumericTokens)));
          const edits = data.requestedEdits[0].fields.map(({ field }) => ({ candidateId: candidate.candidateId,
            field, text: field === "claims[0].text" ? groundedDraft.claims[0].text : groundedDraft[field],
            supports: field === "claims[0].text" ? structuredClone(groundedDraft.claims[0].supports) : [] }));
          if (scenario === "extra-edit") edits.push({ candidateId: candidate.candidateId, field: "headline", text: "Injected", supports: [] });
          if (scenario === "duplicate-edit") edits[1] = edits[0];
          if (scenario === "unknown-citation") edits.find(item => item.field === "claims[0].text").supports = [{ evidenceId: "unknown" }];
          return wrap({ edits });
        }
        assert.equal(JSON.parse(options.messages[1].content).drafts[0].draftSha256, hash(groundedDraft));
        return wrap({ reviews: [{ ...review, factsSupported: scenario !== "review-veto" }] });
      } });
    assert.equal(Boolean(result), scenario === "valid");
    assert.ok(calls.length <= 3);
    assert.ok(calls.reduce((sum, call) => sum + call.maxTokens, 0) <= 7_800);
    if (result) assert.equal(result.editorial.desks["security-and-privacy"].story.headline, groundedDraft.headline);
  }
});

test("bad or unrequested revisions cannot bypass checks or trigger another revision", async () => {
  const copied = structuredClone(groundedDraft);
  copied.claims[0].text = copiedClaim;
  for (const revisions of [[copied], [{ ...groundedDraft, candidateId: "injected" }],
    [groundedDraft, groundedDraft], []]) {
    let calls = 0;
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      aiRequestImpl: async () => response({ stories: ++calls === 1 ? [copied] : revisions }) });
    assert.equal(result, null);
    assert.equal(calls, 2);
  }
});

test("a missing Qwen story does not force complete regeneration of another story's clean fields", async () => {
  const secondCandidate = { ...structuredClone(candidate), candidateId: "candidate-second", suggestedDesk: "ai" };
  const secondDraft = { ...structuredClone(groundedDraft), candidateId: secondCandidate.candidateId };
  const twoDesks = structuredClone(baseline);
  twoDesks.desks.ai = structuredClone(twoDesks.desks["security-and-privacy"]);
  twoDesks.desks.ai.story.id = "s2";
  const calls = [];
  const result = await synthesizeGroundedEditorial({ editorial: twoDesks, candidates: [candidate, secondCandidate],
    model: EXPERIMENTAL_FREE_WRITER_MODEL, aiRequestImpl: async options => {
      calls.push(options);
      const wrap = payload => ({ ...response(payload), model: EXPERIMENTAL_FREE_WRITER_MODEL });
      if (calls.length === 1) return wrap({ stories: [{ ...groundedDraft, whyItMatters: "Too short." }] });
      if (calls.length === 2) return wrap({ stories: [] });
      if (calls.length === 3) {
        const data = JSON.parse(options.messages[1].content);
        assert.deepEqual(data.rewriteCandidateIds, [secondCandidate.candidateId]);
        assert.deepEqual(data.requestedEdits.map(item => item.candidateId), [candidate.candidateId]);
        assert.deepEqual(data.requestedEdits[0].fields.map(item => item.field), ["whyItMatters"]);
        return wrap({ edits: [{ candidateId: candidate.candidateId, field: "whyItMatters", text: groundedDraft.whyItMatters, supports: [] }],
          stories: [secondDraft] });
      }
      return wrap({ reviews: [review, { ...review, candidateId: secondCandidate.candidateId, draftSha256: hash(secondDraft) }] });
    } });
  assert.ok(result);
  assert.equal(calls.length, 4);
  assert.ok(calls.reduce((total, call) => total + call.maxTokens, 0) <= 7_800);
});

test("a repaired draft still needs semantic approval; repair quota errors stop immediately", async () => {
  const copied = structuredClone(groundedDraft);
  copied.claims[0].text = copiedClaim;
  for (const quota of [false, true]) {
    let calls = 0;
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      aiRequestImpl: async () => {
        if (++calls === 1) return response({ stories: [copied] });
        if (calls === 2) {
          if (quota) throw new Error("quota");
          return response({ stories: [groundedDraft] });
        }
        return response({ reviews: [{ ...review, factsSupported: false }] });
      } });
    assert.equal(result, null);
    assert.equal(calls, quota ? 2 : 3);
  }
});

test("revision only replaces a rejected draft and preserves an already valid draft", async () => {
  const secondCandidate = { ...structuredClone(candidate), candidateId: "candidate-second", suggestedDesk: "ai-and-models" };
  const secondDraft = { ...structuredClone(groundedDraft), candidateId: secondCandidate.candidateId };
  const copied = structuredClone(secondDraft);
  copied.claims[0].text = copiedClaim;
  const twoDesks = structuredClone(baseline);
  twoDesks.desks["ai-and-models"] = structuredClone(twoDesks.desks["security-and-privacy"]);
  twoDesks.desks["ai-and-models"].story.id = "s2";
  let calls = 0;
  const result = await synthesizeGroundedEditorial({ editorial: twoDesks, candidates: [candidate, secondCandidate],
    aiRequestImpl: async (options) => {
      if (++calls === 1) return response({ stories: [groundedDraft, copied] });
      if (calls === 2) {
        assert.deepEqual(JSON.parse(options.messages[1].content).dossiers.map((value) => value.candidateId), [secondCandidate.candidateId]);
        return response({ stories: [secondDraft] });
      }
      assert.deepEqual(JSON.parse(options.messages[1].content).drafts.map((value) => value.draft), [groundedDraft, secondDraft]);
      return response({ reviews: [review, { ...review, candidateId: secondCandidate.candidateId, draftSha256: hash(secondDraft) }] });
    } });
  assert.equal(calls, 3);
  assert.equal(result.editorial.desks["security-and-privacy"].story.headline, groundedDraft.headline);
  assert.equal(result.editorial.desks["ai-and-models"].story.headline, secondDraft.headline);
});

test("harmless JSON paragraph breaks normalize before validation and the final review hash", async () => {
  const lineBreaks = structuredClone(groundedDraft);
  lineBreaks.claims[0].text = ` \n${lineBreaks.claims[0].text.replace("The issue", "\nThe issue")}\t `;
  let calls = 0;
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    aiRequestImpl: async (options) => {
      if (++calls === 1) {
        assert.ok(Array.isArray(JSON.parse(options.messages[1].content).dossiers[0].supportedNumericTokens));
        return response({ stories: [lineBreaks] });
      }
      assert.equal(JSON.parse(options.messages[1].content).drafts[0].draftSha256, hash(groundedDraft));
      return response({ reviews: [review] });
    } });
  assert.equal(calls, 2);
  assert.equal(result.editorial.desks["security-and-privacy"].story.whatHappened, groundedDraft.claims.map((claim) => claim.text).join(" "));
});

test("September 11 email spillover is rejected before any approving AI review", async () => {
  for (const emailStory of malformedEmailStories) {
    for (const field of ["whyItMatters", "whatToDoOrWatch"]) {
      const draft = { ...structuredClone(groundedDraft), [field]: emailStory[field] };
      assert.equal(validateGroundedStory(draft, dossier), false);
      const calls = [];
      const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
        aiRequestImpl: async (options) => {
          calls.push(options);
          if (options.schema.properties.reviews) {
            return response({ reviews: [{ ...review, draftSha256: hash(draft) }] });
          }
          return response({ stories: [draft] });
        } });
      assert.equal(result, null);
      assert.equal(calls.length, 2, "only original draft plus existing bounded repair");
      assert.ok(calls.every((call) => !call.schema.properties.reviews), "AI cannot override copy veto");
    }
  }
});

test("nested leakage and truncation fail even within provider character bounds", () => {
  for (const ending of ['”, “stories”: [{', " and", " at alower"]) {
    const draft = structuredClone(groundedDraft);
    draft.whyItMatters = `${draft.whyItMatters.slice(0, -1)}${ending}`;
    const reasons = [];
    assert.equal(validateGroundedStory(draft, dossier, (code) => reasons.push(code)), false);
    assert.deepEqual(reasons, ["READER_COPY"]);
  }
});

test("local shape checks enforce the same field bounds and claim count as the sent schema", () => {
  const fields = GROUNDED_DRAFT_SCHEMA.properties.stories.items.properties;
  for (const field of ["whyItMatters", "whatToDoOrWatch"]) {
    for (const size of [fields[field].minLength - 1, fields[field].maxLength + 1]) {
      const draft = { ...structuredClone(groundedDraft), [field]: `${"a".repeat(size - 1)}.` };
      const reasons = [];
      assert.equal(validateGroundedStory(draft, dossier, (code) => reasons.push(code)), false);
      assert.deepEqual(reasons, ["SHAPE"]);
    }
  }
  for (const size of [fields.claims.items.properties.text.minLength - 1, fields.claims.items.properties.text.maxLength + 1]) {
    const draft = structuredClone(groundedDraft);
    draft.claims[0].text = `${"a".repeat(size - 1)}.`;
    const reasons = [];
    assert.equal(validateGroundedStory(draft, dossier, (code) => reasons.push(code)), false);
    assert.deepEqual(reasons, ["CLAIM_SHAPE"]);
  }
  const draft = structuredClone(groundedDraft);
  draft.claims.push(structuredClone(draft.claims[0]));
  assert.equal(validateGroundedStory(draft, dossier), false);
});

test("a known Secure Boot prerequisite cannot be dropped from a claim or headline", () => {
  const conditional = structuredClone(candidate);
  conditional.feedEvidence[0].articleExcerpt = "When Secure Boot is disabled, disk modification can permit UEFI code execution before the operating system starts.";
  const conditionalDossier = groundedDossiers([conditional])[0];
  for (const field of ["claim", "headline", "whyItMatters", "whatToDoOrWatch"]) {
    const draft = structuredClone(groundedDraft);
    if (field === "claim") {
      draft.claims[0].text = "CERT/CC reports that the AOMEI driver allows disk modification by a local user, and the resulting access can permit UEFI code execution before the operating system starts.";
    } else if (field === "headline") {
      draft.headline = "AOMEI driver flaw permits UEFI code execution";
    } else {
      draft[field] = `${draft[field]} This can permit UEFI code execution.`;
    }
    const reasons = [];
    assert.equal(validateGroundedStory(draft, conditionalDossier, (code) => reasons.push(code)), false);
    assert.deepEqual(reasons, ["SOURCE_CAVEAT"], field);
  }
});

function formatFailure() {
  return Object.assign(new Error("Provider editorial format invalid."), {
    code: "WORKERS_AI_EDITORIAL_FORMAT_INVALID", attemptCount: 1,
    inference: { ...response(null), editorialPayload: undefined },
  });
}

test("invalid outer JSON uses the existing single repair slot and still requires checked prose", async () => {
  const calls = [];
  const diagnostics = [];
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    onDiagnostic: (event) => diagnostics.push(event), aiRequestImpl: async (options) => {
      calls.push(options);
      if (calls.length === 1) throw formatFailure();
      if (calls.length === 2) {
        assert.equal(options.maxTokens, 3_000);
        assert.deepEqual(JSON.parse(options.messages[1].content).dossiers.length, 1);
        return response({ stories: [groundedDraft] });
      }
      return response({ reviews: [review] });
    } });
  assert.equal(calls.length, 3);
  assert.equal(result.editorial.desks["security-and-privacy"].story.headline, groundedDraft.headline);
  assert.equal(result.inference.requestSha256, hash(Array(3).fill("a".repeat(64))));
  assert.ok(diagnostics.some((event) => event.stage === "draft-format-repair" && event.repairBudgetRemaining === 0));
});

test("format repair cannot create another repair, accept damaged prose, or bypass semantic review", async () => {
  const damaged = { ...structuredClone(groundedDraft), whyItMatters: malformedEmailStories[0].whyItMatters };
  for (const repair of [null, damaged, groundedDraft]) {
    let calls = 0;
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      aiRequestImpl: async () => {
        if (++calls === 1 || repair === null) throw formatFailure();
        if (calls === 2) return response({ stories: [repair] });
        return response({ reviews: [{ ...review, factsSupported: false }] });
      } });
    assert.equal(result, null);
    assert.equal(calls, repair === groundedDraft ? 3 : 2);
  }
});

test("unknown format provenance and quota/auth failures never authorize a repair request", async () => {
  for (const error of [
    Object.assign(formatFailure(), { attemptCount: 2 }),
    Object.assign(formatFailure(), { inference: { provider: "other" } }),
    Object.assign(formatFailure(), { code: "WORKERS_AI_EDITORIAL_UNAVAILABLE" }),
    new Error("Cloudflare Workers AI request failed with HTTP 429."),
    new Error("Cloudflare Workers AI request failed with HTTP 401."),
  ]) {
    let calls = 0;
    assert.equal(await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      aiRequestImpl: async () => { calls++; throw error; } }), null);
    assert.equal(calls, 1);
  }
});

test("the real Workers AI adapter carries safe format provenance into bounded recovery", async () => {
  const requests = [];
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    accountId: "0".repeat(32), apiToken: "synthetic-token", fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      const payload = requests.length === 1 ? '{"stories":broken' : requests.length === 2
        ? { stories: [groundedDraft] } : { reviews: [review] };
      return new Response(JSON.stringify({ success: true, result: { response: payload }, errors: [] }),
        { status: 200, headers: { "content-type": "application/json", "cf-ray": "synthetic-ray" } });
    } });
  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map((request) => request.max_tokens), [4_000, 3_000, 800]);
  assert.equal(result.editorial.desks["security-and-privacy"].story.headline, groundedDraft.headline);
  assert.ok(!JSON.stringify(result).includes("synthetic-token"));
});

test("each numeric claim is anchored to its cited passages, not an unrelated dossier figure", () => {
  const numbered = structuredClone(dossier);
  const latePassage = { evidenceId: "S1P6", text: "The report covers AOMEI Backupper 8.4.0, whose driver has insufficient disk-access checks." };
  numbered.sources[0].text += ` ${latePassage.text}`;
  numbered.sources[0].passages.push(latePassage);
  const draft = structuredClone(groundedDraft);
  draft.claims[0].text = draft.claims[0].text.replace("AOMEI Backupper", "AOMEI Backupper 8.4.0");
  const failures = [];
  assert.equal(validateGroundedStory(draft, numbered, (code, feedback) => failures.push({ code, feedback })), false);
  assert.equal(failures[0].code, "NUMERIC_CITATION");
  assert.equal(failures[0].feedback.field, "claims[0].text");
  assert.deepEqual(failures[0].feedback.unsupportedNumericTokens, ["8.4.0"]);
  draft.claims[0].supports[1].evidenceId = latePassage.evidenceId;
  assert.equal(validateGroundedStory(draft, numbered), true);
});

test("analysis and headline cannot borrow a figure from an uncited passage", () => {
  const numbered = structuredClone(dossier);
  numbered.sources[0].text += " An unrelated measurement reached 9.9%.";
  numbered.sources[0].passages.push({ evidenceId: "S1P6", text: "An unrelated measurement reached 9.9%." });
  const draft = { ...structuredClone(groundedDraft), headline: "AOMEI driver exposure reaches 9.9%" };
  const reasons = [];
  assert.equal(validateGroundedStory(draft, numbered, (code) => reasons.push(code)), false);
  assert.deepEqual(reasons, ["NUMERIC_ANCHOR"]);
});

test("single-publisher copy cannot claim independent confirmation", () => {
  const draft = { ...structuredClone(groundedDraft), deck: "Independent reporting confirms the backup driver's disk-writing exposure." };
  const reasons = [];
  assert.equal(validateGroundedStory(draft, dossier, (code) => reasons.push(code)), false);
  assert.deepEqual(reasons, ["ATTRIBUTION"]);
  draft.deck = "The backup driver's exposure has not been independently confirmed.";
  assert.equal(validateGroundedStory(draft, dossier), true);
});

test("future or conditional independent review is a useful signal, not an assertion of confirmation", () => {
  const draft = structuredClone(groundedDraft);
  draft.whatToDoOrWatch = "Watch for independently verified results before choosing this model for an existing workflow. Compare its behavior on representative documents and check the license and device requirements, keeping the decision tied to the actual task rather than an aggregate claim.";
  assert.equal(validateGroundedStory(draft, dossier), true);
  for (const deck of [
    "If the claim is independently confirmed, its scope will be clearer.",
    "Wait for independently corroborated results before relying on the claim.",
    "The report lacks independent testing; no independent reporting confirms the finding.",
  ]) assert.equal(validateGroundedStory({ ...draft, deck }, dossier), true, deck);
  for (const deck of [
    "The results were independently verified.",
    "Watch for updates. The results were independently verified.",
    "Watch for updates, but independent reporting confirms the finding.",
    "If the vendor responds, independent reporting confirms the finding.",
  ]) {
    const reasons = [];
    assert.equal(validateGroundedStory({ ...draft, deck }, dossier, (code) => reasons.push(code)), false, deck);
    assert.deepEqual(reasons, ["ATTRIBUTION"]);
  }
});

test("a reviewer must explicitly cover each claim with its actual supporting passages", async () => {
  for (const claimSupport of [undefined, [], [[], []], [["S1P2"], ["S1P4", "S1P5"]],
    [["S1P4", "S1P5"], ["S1P2", "S1P3"]], [["S1P2", "S1P2"], ["S1P4", "S1P5"]],
    [["unknown", "S1P3"], ["S1P4", "S1P5"]]]) {
    let calls = 0;
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      aiRequestImpl: async () => response(++calls === 1 ? { stories: [groundedDraft] }
        : { reviews: [{ ...review, claimSupport }] }) });
    assert.equal(result, null);
    assert.equal(calls, 2);
  }
  let calls = 0;
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    aiRequestImpl: async (options) => {
      if (++calls === 1) return response({ stories: [groundedDraft] });
      assert.equal(options.maxTokens, 800);
      assert.equal(options.schema.properties.reviews.minItems, 1);
      assert.equal(options.schema.properties.reviews.maxItems, 1);
      assert.equal(Object.hasOwn(options.schema.properties.reviews.items.properties.claimSupport.items, "uniqueItems"), false);
      return response({ reviews: [{ ...review, claimSupport: [["S1P3", "S1P2"], ["S1P5", "S1P4"]] }] });
    } });
  assert.ok(result);
});

test("repair receives the exact failing field and measured bounds without extra inference calls", async () => {
  const short = { ...structuredClone(groundedDraft), whyItMatters: "Backup software should protect recovery rather than create a new path to disk damage." };
  const calls = [];
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    aiRequestImpl: async (options) => {
      calls.push(options);
      if (calls.length === 1) {
        assert.match(options.messages[0].content, /there is no separate per-field word quota/);
        assert.doesNotMatch(options.messages[0].content, /25–35 words|115–165/);
        return response({ stories: [short] });
      }
      if (calls.length === 2) {
        const rejected = JSON.parse(options.messages[1].content).rejected[0];
        assert.equal(rejected.rejectionCode, "SHAPE");
        assert.equal(rejected.feedback.field, "whyItMatters");
        assert.equal(rejected.feedback.minCharacters, 120);
        assert.equal(rejected.feedback.maxCharacters, 650);
        assert.equal(rejected.feedback.actualCharacters, short.whyItMatters.length);
        return response({ stories: [groundedDraft] });
      }
      return response({ reviews: [review] });
    } });
  assert.ok(result);
  assert.deepEqual(calls.map((call) => call.maxTokens), [4_000, 3_000, 800]);
  assert.ok(calls.every((call) => call.maxAttempts === 1 && call.maxRequestBytes === 70_000 && call.maxResponseBytes === 100_000));
});

test("provider grammar and local bounds remain aligned while review binding cannot force approval", async () => {
  const events = [];
  const calls = [];
  const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
    onDiagnostic: event => events.push(event), aiRequestImpl: async options => {
      calls.push(options);
      if (calls.length === 1) {
        const fields = options.schema.properties.stories.items.properties;
        assert.equal(fields.whyItMatters.minLength, 120);
        assert.equal(fields.whyItMatters.maxLength, 650);
        assert.equal(fields.claims.items.properties.text.minLength, 60);
        assert.equal(fields.claims.items.properties.text.pattern, undefined);
        assert.equal(fields.whyItMatters.pattern, undefined);
        assert.deepEqual(fields.candidateId.enum, [candidate.candidateId]);
        assert.equal(GROUNDED_DRAFT_SCHEMA.properties.stories.items.properties.whyItMatters.minLength, 120);
        return response({ stories: [groundedDraft] });
      }
      const properties = options.schema.properties.reviews.items.properties;
      assert.deepEqual(properties.candidateId.enum, [candidate.candidateId]);
      assert.deepEqual(properties.draftSha256.enum, [hash(groundedDraft)]);
      assert.equal(properties.factsSupported.type, "boolean");
      assert.equal(properties.factsSupported.enum, undefined, "Never force approval");
      assert.equal(properties.claimSupport.items.minItems, 0, "Unsupported claims can still receive an empty list");
      assert.deepEqual(properties.claimSupport.items.items.enum,
        [...new Set(groundedDraft.claims.flatMap(claim => claim.supports.map(support => support.evidenceId)))]);
      return response({ reviews: [{ ...review, draftSha256: "wrong", analysisSupported: false }] });
    } });
  assert.equal(result, null);
  assert.equal(calls.length, 2);
  const diagnostic = events.find(event => event.stage === "semantic-evidence-check");
  assert.equal(diagnostic.accepted, 0);
  assert.deepEqual(diagnostic.rejectionCodes, ["REVIEW_BINDING", "REVIEW_ANALYSIS"]);
  assert.doesNotMatch(JSON.stringify(diagnostic), /draftSha256|wrong|headline|S1P/);
});

test("a missing draft can consume only the existing repair slot and still requires factual review", async () => {
  for (const approved of [false, true]) {
    let calls = 0;
    const result = await synthesizeGroundedEditorial({ editorial: baseline, candidates: [candidate],
      aiRequestImpl: async (options) => {
        if (++calls === 1) return response({ stories: [] });
        if (calls === 2) {
          const data = JSON.parse(options.messages[1].content);
          assert.equal(data.rejected[0].draft.candidateId, candidate.candidateId);
          assert.equal(data.rejected[0].feedback.field, "story");
          return response({ stories: [groundedDraft] });
        }
        return response({ reviews: [{ ...review, factsSupported: approved }] });
      } });
    assert.equal(Boolean(result), approved);
    assert.equal(calls, 3);
  }
});
