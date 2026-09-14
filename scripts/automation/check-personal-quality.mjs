// Owner-only live smoke test. Uses existing free credentials, never imports
// delivery functions, never sends email, never archives raw evidence or copy.
import assert from "node:assert/strict";
import { generatePersonalFreeEdition, PERSONAL_FREE_MAX_MODEL_REQUESTS } from "./personal-free-edition.mjs";
import { createEmptyPersonalStoryLedger } from "./personal-story-ledger.mjs";
import { collectFreeResearchSnapshot } from "./free/feed-engine.mjs";
import { assertPersonalEmailCandidate, renderPersonalEditionEmail } from "./personal-email.mjs";
import { isValidWebSearchReceipt } from "./free/search-receipt.mjs";
import { draftFreeEditionWithHealth } from "./draft-free-edition.mjs";
import { EXPERIMENTAL_FREE_WRITER_MODEL } from "./free/workers-ai.mjs";
import { qualityCheckWindow } from "./quality-check-window.mjs";
import { EXPLICIT_CLAIM_REVIEW_PROFILE, LEGACY_CLAIM_REVIEW_PROFILE } from "./free/explicit-claim-review.mjs";

const now = new Date();
let snapshot;
try {
  const args = process.argv.slice(2);
  assert.ok(args.length <= 2 && new Set(args).size === args.length &&
    args.every(arg => ["--require-web-search", "--explicit-claim-review"].includes(arg)));
  const requireWebSearch = args.includes("--require-web-search");
  const explicitReview = args.includes("--explicit-claim-review");
  const alternateWriter = process.env.FREE_WRITER_MODEL;
  assert.ok(!alternateWriter || alternateWriter === EXPERIMENTAL_FREE_WRITER_MODEL);
  assert.ok(!explicitReview || !alternateWriter);
  if (requireWebSearch && !process.env.TAVILY_API_KEY?.trim()) {
    throw Object.assign(new Error("Search credentials are not configured."), { code: "SEARCH_KEY_REQUIRED" });
  }
  const { editionDate, runMode } = qualityCheckWindow(now);
  const candidate = await generatePersonalFreeEdition({ editionDate, runMode,
    ...(alternateWriter || explicitReview ? { draftFreeEditionWithHealthImpl: options =>
      draftFreeEditionWithHealth({ ...options,
        ...(alternateWriter ? { model: EXPERIMENTAL_FREE_WRITER_MODEL } : {}),
        ...(explicitReview ? { groundedReviewProfile: EXPLICIT_CLAIM_REVIEW_PROFILE } : {}) }) } : {}),
    personalStoryLedger: createEmptyPersonalStoryLedger({ fingerprintKey: process.env.CLOUDFLARE_AI_API_TOKEN }),
    researchImpl: async (options) => {
      snapshot ??= await collectFreeResearchSnapshot(options);
      if (requireWebSearch && (!isValidWebSearchReceipt(snapshot.diagnostics?.webSearch) ||
          snapshot.diagnostics.webSearch.admittedArticles < 1)) {
        throw Object.assign(new Error("No search-discovered publisher articles were verified."), { code: "SEARCH_ADMISSION_REQUIRED" });
      }
      return snapshot;
    },
  });
  assertPersonalEmailCandidate(candidate);
  const rendered = renderPersonalEditionEmail(candidate);
  assert.ok(rendered.html && rendered.text);
  const stories = Object.values(candidate.desks).filter((desk) => desk.story).length;
  const checkedStories = Object.values(candidate.desks).filter(({ story }) => story &&
    story.evidence.length > 0 && story.evidence.every((claim) => claim.id.startsWith(`${story.id}-grounded-`))).length;
  const mode = candidate.provenance.personalFreeResearch.draftingMode;
  const webSearch = candidate.provenance.personalFreeResearch.webSearch;
  if (!(stories > 0 && checkedStories === stories && mode === "source-grounded-summary")) {
    throw Object.assign(new Error("Not every live story received a model-checked summary."), {
      code: "QUALITY_GROUNDED_SUMMARIES_INCOMPLETE",
    });
  }
  console.info(`::notice title=Quality result::${JSON.stringify({ status: "validated-and-rendered", stories, checkedStories, mode,
    writerModel: candidate.provenance.personalFreeResearch.model,
    reviewProfile: explicitReview ? EXPLICIT_CLAIM_REVIEW_PROFILE : LEGACY_CLAIM_REVIEW_PROFILE,
    ...(isValidWebSearchReceipt(webSearch) ? { webSearch } : {}),
    renderedCopyChecked: true,
    emailSent: false, repeatHistory: "isolated-test-empty-ledger", maxModelRequests: PERSONAL_FREE_MAX_MODEL_REQUESTS })}`);
} catch (error) {
  // Only stable codes/counts enter public workflow logs, never copy, URLs or tokens.
  const code = error?.diagnosticCode ?? error?.code;
  console.error(`::error title=Quality failure::${/^[A-Z_]+$/.test(code ?? "") ? code : "QUALITY_CHECK_FAILED"}`);
  process.exitCode = 1;
}
