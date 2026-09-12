import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { groundedDraft, groundedEvidence } from "./fixtures/grounded-summary.mjs";
import { malformedEmailStories } from "./fixtures/malformed-email-2026-09-11.mjs";
import { GROUNDED_DRAFT_SCHEMA, groundedDossiers, validateGroundedStory, synthesizeGroundedEditorial } from
  "../scripts/automation/free/grounded-draft.mjs";
import { DEFAULT_CLOUDFLARE_AI_MODEL } from "../scripts/automation/free/workers-ai.mjs";

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
  factsSupported: true, attributionAccurate: true, analysisSupported: true, usefulAndSpecific: true };
const copiedClaim = `CERT/CC says: ${groundedEvidence.summary.split(". ").slice(0, 2).join(". ")}.`;

test("grounded writer accepts concrete supported news including a driver filename", () => {
  assert.equal(validateGroundedStory(groundedDraft, dossier), true);
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
  for (const size of [149, 271]) {
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
