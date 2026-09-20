// Owner-only live smoke test. Uses existing free credentials, never imports
// delivery functions or sends email. The separate private diagnostic may retain
// encrypted checkpoints only; it never archives plaintext evidence or copy.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { generatePersonalFreeEdition, PERSONAL_FREE_MAX_MODEL_REQUESTS } from "./personal-free-edition.mjs";
import { createEmptyPersonalStoryLedger } from "./personal-story-ledger.mjs";
import { collectFreeResearchSnapshot } from "./free/feed-engine.mjs";
import { assertPersonalEmailCandidate, renderPersonalEditionEmail } from "./personal-email.mjs";
import { isValidWebSearchReceipt } from "./free/search-receipt.mjs";
import { draftFreeEditionWithHealth } from "./draft-free-edition.mjs";
import { EXPERIMENTAL_FREE_WRITER_MODEL } from "./free/workers-ai.mjs";
import { qualityCheckWindow } from "./quality-check-window.mjs";
import { EXPLICIT_CLAIM_REVIEW_PROFILE, LEGACY_CLAIM_REVIEW_PROFILE } from "./free/explicit-claim-review.mjs";
import { EXPERIMENTAL_MIXED_REVIEW_PROFILE, EXPERIMENTAL_REASONING_PIPELINE_PROFILE } from "./free/grounded-draft.mjs";
import { createPrivateEditorialDiagnosticCollector } from "./private-editorial-diagnostic.mjs";
import { assertDailyProductionCheckAuthority, assertDailySummaryCoverage } from "./daily-production-check.mjs";

const now = new Date();
let snapshot;
let privateDiagnostic;
let privateDiagnosticPath;
try {
  const args = process.argv.slice(2);
  assert.ok(args.length <= 3 && new Set(args).size === args.length &&
    args.every(arg => ["--require-web-search", "--explicit-claim-review", "--mixed-claim-review", "--reasoning-pipeline", "--private-diagnostic", "--daily-production"].includes(arg)));
  const dailyProduction = args.includes("--daily-production");
  if (dailyProduction) {
    assert.equal(args.length, 1, "Daily qualification cannot select an experimental writer or require unavailable search credits.");
    assertDailyProductionCheckAuthority(process.env);
  }
  const requireWebSearch = args.includes("--require-web-search");
  const explicitReview = args.includes("--explicit-claim-review");
  const mixedReview = args.includes("--mixed-claim-review");
  const reasoningPipeline = args.includes("--reasoning-pipeline");
  const privateCapture = args.includes("--private-diagnostic");
  const experimentalReview = mixedReview || reasoningPipeline;
  assert.ok(Number(explicitReview) + Number(mixedReview) + Number(reasoningPipeline) <= 1);
  assert.ok(!privateCapture || (requireWebSearch && reasoningPipeline));
  // This experiment is not qualified for production: a known supported
  // regression control is still falsely rejected. Permit observation only in
  // this no-email, owner-run trusted workflow, never through daily configuration.
  if (experimentalReview) {
    assert.ok(requireWebSearch && process.env.GITHUB_REPOSITORY === "itworksinprod/first-fold" &&
      process.env.GITHUB_REF === "refs/heads/main" && process.env.GITHUB_ACTOR === "itworksinprod" &&
      process.env.GITHUB_RUN_ATTEMPT === "1" &&
      (privateCapture ? process.env.GITHUB_EVENT_NAME === "workflow_dispatch"
        : ["workflow_dispatch", "push"].includes(process.env.GITHUB_EVENT_NAME)) &&
      process.env.GITHUB_WORKFLOW_REF === `itworksinprod/first-fold/.github/workflows/${privateCapture
        ? "private-paper-quality-check.yml" : "personal-quality-check.yml"}@refs/heads/main`);
  }
  if (privateCapture) {
    assert.ok(process.env.DIAGNOSTIC_PUBLIC_KEY?.trim() && isAbsolute(process.env.RUNNER_TEMP ?? ""));
    privateDiagnostic = createPrivateEditorialDiagnosticCollector({ publicKey: process.env.DIAGNOSTIC_PUBLIC_KEY });
    privateDiagnosticPath = join(process.env.RUNNER_TEMP, "private-editorial-checkpoints.encrypted.json");
  }
  const alternateWriter = process.env.FREE_WRITER_MODEL;
  assert.ok(!alternateWriter || alternateWriter === EXPERIMENTAL_FREE_WRITER_MODEL);
  assert.ok(!(explicitReview || experimentalReview) || !alternateWriter);
  const reviewProfile = reasoningPipeline ? EXPERIMENTAL_REASONING_PIPELINE_PROFILE
    : mixedReview ? EXPERIMENTAL_MIXED_REVIEW_PROFILE
    : explicitReview ? EXPLICIT_CLAIM_REVIEW_PROFILE : LEGACY_CLAIM_REVIEW_PROFILE;
  if (requireWebSearch && !process.env.TAVILY_API_KEY?.trim()) {
    throw Object.assign(new Error("Search credentials are not configured."), { code: "SEARCH_KEY_REQUIRED" });
  }
  const { editionDate, runMode } = qualityCheckWindow(now);
  const candidate = await generatePersonalFreeEdition({ editionDate, runMode,
    ...(alternateWriter || explicitReview || experimentalReview ? { draftFreeEditionWithHealthImpl: options =>
      draftFreeEditionWithHealth({ ...options,
        ...(alternateWriter ? { model: EXPERIMENTAL_FREE_WRITER_MODEL } : {}),
        ...(privateDiagnostic ? { onPrivateEditorialDiagnostic: privateDiagnostic.onPrivateEditorialDiagnostic } : {}),
        ...(explicitReview || experimentalReview ? { groundedReviewProfile: reviewProfile } : {}) }) } : {}),
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
  if (dailyProduction) assertDailySummaryCoverage(stories, checkedStories);
  const semanticReview = candidate.provenance.personalFreeResearch.semanticReview;
  if (experimentalReview && semanticReview?.profile !== reviewProfile) {
    throw Object.assign(new Error("The experimental reviewer receipt is absent."), { code: "QUALITY_REVIEW_RECEIPT_REQUIRED" });
  }
  console.info(`::notice title=Quality result::${JSON.stringify({ status: "validated-and-rendered", stories, checkedStories, mode,
    writerModel: candidate.provenance.personalFreeResearch.model,
    reviewProfile,
    ...(dailyProduction ? { dailyProductionProfile: true, minimumCheckedSummaries: 3 } : {}),
    ...(experimentalReview ? { reviewerModel: semanticReview.model, experimental: true,
      productionQualified: false, knownReviewerRegression: "supported-control-false-rejection" } : {}),
    ...(isValidWebSearchReceipt(webSearch) ? { webSearch } : {}),
    renderedCopyChecked: true,
    emailSent: false, repeatHistory: "isolated-test-empty-ledger", maxModelRequests: PERSONAL_FREE_MAX_MODEL_REQUESTS })}`);
} catch (error) {
  // Only stable codes/counts enter public workflow logs, never copy, URLs or tokens.
  const code = error?.diagnosticCode ?? error?.code;
  console.error(`::error title=Quality failure::${/^[A-Z_]+$/.test(code ?? "") ? code : "QUALITY_CHECK_FAILED"}`);
  process.exitCode = 1;
} finally {
  // Only public-key ciphertext may leave the in-memory diagnostic collector.
  // Capture failure cannot turn a failed story into approval or retry inference.
  if (privateDiagnostic) {
    try {
      const sealed = await privateDiagnostic.finalize();
      if (sealed) await writeFile(privateDiagnosticPath, JSON.stringify(sealed), { mode: 0o600, flag: "wx" });
    } catch {
      console.warn("::warning title=Private diagnostic::ENCRYPTED_CAPTURE_UNAVAILABLE");
    }
  }
}
