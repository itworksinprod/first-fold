// Owner-only live smoke test. Uses existing free credentials, never imports
// delivery functions, never sends email, never archives raw evidence or copy.
import assert from "node:assert/strict";
import { generatePersonalFreeEdition, PERSONAL_FREE_MAX_MODEL_REQUESTS } from "./personal-free-edition.mjs";
import { createEmptyPersonalStoryLedger } from "./personal-story-ledger.mjs";
import { collectFreeResearchSnapshot } from "./free/feed-engine.mjs";
import { assertPersonalEmailCandidate, renderPersonalEditionEmail } from "./personal-email.mjs";

const now = new Date();
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
  .formatToParts(now).map(({ type, value }) => [type, value]));
const editionDate = `${parts.year}-${parts.month}-${parts.day}`;
const runMode = Number(parts.hour) >= 5 ? "same_day_backfill" : "on_time";
let snapshot;
try {
  const candidate = await generatePersonalFreeEdition({ editionDate, runMode,
    personalStoryLedger: createEmptyPersonalStoryLedger({ fingerprintKey: process.env.CLOUDFLARE_AI_API_TOKEN }),
    researchImpl: async (options) => snapshot ??= await collectFreeResearchSnapshot(options),
  });
  assertPersonalEmailCandidate(candidate);
  const rendered = renderPersonalEditionEmail(candidate);
  assert.ok(rendered.html && rendered.text);
  const stories = Object.values(candidate.desks).filter((desk) => desk.story).length;
  const checkedStories = Object.values(candidate.desks).filter(({ story }) => story &&
    story.evidence.length > 0 && story.evidence.every((claim) => claim.id.startsWith(`${story.id}-grounded-`))).length;
  const mode = candidate.provenance.personalFreeResearch.draftingMode;
  console.info(`::notice title=Quality result::${JSON.stringify({ status: "validated-and-rendered", stories, checkedStories, mode,
    emailSent: false, repeatHistory: "isolated-test-empty-ledger", maxModelRequests: PERSONAL_FREE_MAX_MODEL_REQUESTS })}`);
  assert.ok(stories > 0 && checkedStories === stories && mode === "source-grounded-summary",
    "Not every live story received a model-checked summary.");
} catch (error) {
  // Only stable codes/counts enter public workflow logs, never copy, URLs or tokens.
  console.error(`::error title=Quality failure::${/^[A-Z_]+$/.test(error?.code ?? "") ? error.code : "QUALITY_CHECK_FAILED"}`);
  process.exitCode = 1;
}
