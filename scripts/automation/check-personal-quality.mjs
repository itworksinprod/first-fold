// Owner-only live smoke test. Uses existing free credentials, never imports
// delivery functions, never sends email, never archives raw evidence or copy.
import assert from "node:assert/strict";
import { generatePersonalFreeEdition, PERSONAL_FREE_MAX_MODEL_REQUESTS } from "./personal-free-edition.mjs";
import { createEmptyPersonalStoryLedger } from "./personal-story-ledger.mjs";
import { collectFreeResearchSnapshot } from "./free/feed-engine.mjs";
import { assertPersonalEmailCandidate, renderPersonalEditionEmail } from "./personal-email.mjs";
import { isValidWebSearchReceipt } from "./free/search-receipt.mjs";

const now = new Date();
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
  .formatToParts(now).map(({ type, value }) => [type, value]));
const editionDate = `${parts.year}-${parts.month}-${parts.day}`;
const runMode = Number(parts.hour) >= 5 ? "same_day_backfill" : "on_time";
let snapshot;
try {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || args.length === 1 && args[0] === "--require-web-search");
  const requireWebSearch = args.includes("--require-web-search");
  if (requireWebSearch && !process.env.TAVILY_API_KEY?.trim()) {
    throw Object.assign(new Error("Search credentials are not configured."), { code: "SEARCH_KEY_REQUIRED" });
  }
  const candidate = await generatePersonalFreeEdition({ editionDate, runMode,
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
    ...(isValidWebSearchReceipt(webSearch) ? { webSearch } : {}),
    renderedCopyChecked: true,
    emailSent: false, repeatHistory: "isolated-test-empty-ledger", maxModelRequests: PERSONAL_FREE_MAX_MODEL_REQUESTS })}`);
} catch (error) {
  // Only stable codes/counts enter public workflow logs, never copy, URLs or tokens.
  console.error(`::error title=Quality failure::${/^[A-Z_]+$/.test(error?.code ?? "") ? error.code : "QUALITY_CHECK_FAILED"}`);
  process.exitCode = 1;
}
