#!/usr/bin/env node
// Manual opt-in qualification only. No live research, email or production activation.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { geminiQualificationCases, geminiWriterControls } from "../../tests/fixtures/gemini-qualification.mjs";
import { buildExplicitClaimReview, validateExplicitClaimReview } from "./free/explicit-claim-review.mjs";
import { GROUNDED_DRAFT_SCHEMA, WRITER_PROMPT, localPromptDossier, validateGroundedStory } from "./free/grounded-draft.mjs";
import { buildGeminiRequest, requestGeminiEditorial, geminiFailureDiagnostic, GEMINI_FREE_MODEL, GEMINI_PROVIDER } from "./free/gemini-ai.mjs";

export const FREE_PROJECT_CONFIRMATION = "FREE PROJECT BILLING DISABLED";
const fields = ["factsSupported", "attributionAccurate", "analysisSupported", "usefulAndSpecific"];
const safeErrors = new Set(["GEMINI_FREE_TIER_NOT_CONFIRMED", "GEMINI_CONFIGURATION_INVALID", "GEMINI_TIMEOUT",
  "GEMINI_FREE_QUOTA_EXHAUSTED", "GEMINI_HTTP_ERROR", "GEMINI_RESPONSE_INVALID", "GEMINI_RESPONSE_BOUNDS",
  "GEMINI_INCOMPLETE_OR_BLOCKED", "GEMINI_EDITORIAL_FORMAT_INVALID", "GEMINI_EDITORIAL_VALIDATION_FAILED",
  "GEMINI_TRANSPORT_FAILED", "GEMINI_QUALIFICATION_PROVENANCE", "GEMINI_QUALIFICATION_REVIEW_SHAPE",
  "GEMINI_QUALIFICATION_VERDICT_MISMATCH", "GEMINI_QUALIFICATION_WRITER_REJECTED", "GEMINI_QUALIFICATION_DRAFT_REJECTED"]);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const actualVerdict = review => {
  if (!review) return null;
  const actual = { claims: review.claimSupport.map(ids => ids.length > 0),
    ...Object.fromEntries(fields.map(field => [field, review[field]])) };
  return { ...actual, accepted: actual.claims.every(Boolean) && fields.every(field => actual[field] === true) };
};

export async function checkGeminiWriter({ apiKey, freeProjectConfirmation,
  aiRequestImpl = requestGeminiEditorial, fetchImpl = globalThis.fetch } = {}) {
  const cases = geminiQualificationCases();
  const receipts = [], verdicts = [];
  let modelRequests = 0, stage = "configuration", code = null, draftedStories = 0, reviewedStories = 0;
  let failureDiagnostic = {};
  const request = async (prompt, data, schema, validatePayload) => {
    if (modelRequests >= 5) fail("GEMINI_CONFIGURATION_INVALID");
    const options = { apiKey, freeTierConfirmed: true, model: GEMINI_FREE_MODEL,
      messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(data) }],
      schema, maxTokens: 8000, thinking: "medium", timeoutMs: 180000, maxAttempts: 1, fetchImpl, validatePayload };
    const { requestSha256 } = buildGeminiRequest(options);
    modelRequests++;
    const result = await aiRequestImpl(options);
    if (result.provider !== GEMINI_PROVIDER || result.model !== GEMINI_FREE_MODEL || result.attemptCount !== 1 ||
        result.requestSha256 !== requestSha256 || !/^[a-f0-9]{64}$/u.test(result.responseSha256 ?? "")) {
      fail("GEMINI_QUALIFICATION_PROVENANCE");
    }
    if (validatePayload(result.editorialPayload) !== true) fail("GEMINI_EDITORIAL_VALIDATION_FAILED");
    receipts.push({ stage, requestSha256, responseSha256: result.responseSha256 });
    return result.editorialPayload;
  };
  const review = async (drafts, dossiers) => {
    const bundle = buildExplicitClaimReview({ drafts, dossiers });
    const payload = await request(bundle.prompt, bundle.data, bundle.schema,
      value => validateExplicitClaimReview(value, bundle).errors.length === 0);
    const checked = validateExplicitClaimReview(payload, bundle);
    if (checked.errors.length) fail("GEMINI_QUALIFICATION_REVIEW_SHAPE");
    return checked.reviews;
  };
  try {
    if (freeProjectConfirmation !== FREE_PROJECT_CONFIRMATION) fail("GEMINI_FREE_TIER_NOT_CONFIRMED");
    // Validate configuration before counting or permitting any model call.
    if (typeof apiKey !== "string" || !/^[A-Za-z0-9_.-]{20,256}$/u.test(apiKey)) fail("GEMINI_CONFIGURATION_INVALID");
    stage = "reviewer-regressions";
    for (let start = 0; start < cases.length; start += 3) {
      const batch = cases.slice(start, start + 3);
      verdicts.push(...await review(batch.map(item => item.draft), batch.map(item => item.dossier)));
    }
    if (!cases.every(item => matches(item, verdicts))) fail("GEMINI_QUALIFICATION_VERDICT_MISMATCH");
    stage = "writer-controls";
    const dossiers = geminiWriterControls().map(item => item.dossier);
    const validateDraft = payload => payload && Object.keys(payload).join() === "stories" &&
      Array.isArray(payload.stories) && payload.stories.length === dossiers.length &&
      new Set(payload.stories.map(item => item?.candidateId)).size === dossiers.length &&
      payload.stories.every(draft => {
        const dossier = dossiers.find(item => item.candidateId === draft?.candidateId);
        return dossier && validateGroundedStory(draft, dossier);
      });
    const payload = await request(WRITER_PROMPT, { dossiers: dossiers.map(item => localPromptDossier(item)) },
      GROUNDED_DRAFT_SCHEMA, validateDraft);
    if (!validateDraft(payload)) fail("GEMINI_QUALIFICATION_WRITER_REJECTED");
    draftedStories = payload.stories.length;
    stage = "generated-story-review";
    const generatedReviews = await review(payload.stories, dossiers);
    reviewedStories = generatedReviews.filter(item => actualVerdict(item)?.accepted).length;
    if (reviewedStories !== dossiers.length) fail("GEMINI_QUALIFICATION_DRAFT_REJECTED");
    stage = "complete";
  } catch (error) {
    code = safeErrors.has(error?.code) ? error.code : "GEMINI_QUALIFICATION_FAILED";
    failureDiagnostic = geminiFailureDiagnostic(error);
  }
  return { status: code ? "failed" : "passed", code, stage, ...failureDiagnostic,
    mode: "offline-evidence-model-qualification-not-a-paper", provider: GEMINI_PROVIDER, model: GEMINI_FREE_MODEL,
    billingCheck: "caller-confirmation-only-not-provider-verification", productionEnabled: false,
    modelRequests, maxModelRequests: 5, maxRequestedOutputTokens: 40000,
    requestedOutputTokens: modelRequests * 8000, emailRequests: 0, liveResearchRequests: 0,
    draftedStories, reviewedStories, receipts,
    cases: cases.map(item => ({ caseId: item.caseId, expected: item.expected,
      actual: actualVerdict(verdicts.find(review => review.candidateId === item.draft.candidateId)),
      passed: matches(item, verdicts) })) };
}

function matches(item, verdicts) {
  const actual = actualVerdict(verdicts.find(review => review.candidateId === item.draft.candidateId));
  return actual !== null && Object.entries(item.expected).every(([key, value]) =>
    JSON.stringify(value) === JSON.stringify(actual[key]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv[2] !== "--qualification-only") {
    console.error("Use --qualification-only for this bounded no-email test.");
    process.exitCode = 1;
  } else {
    const report = await checkGeminiWriter({ apiKey: process.env.GEMINI_API_KEY,
      freeProjectConfirmation: process.env.GEMINI_FREE_PROJECT_CONFIRMATION });
    console.info(JSON.stringify(report));
    if (report.status !== "passed") process.exitCode = 1;
  }
}
