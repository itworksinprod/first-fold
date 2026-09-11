// Owner-only live smoke test. Uses existing free credentials, never imports
// delivery functions, never sends email, never archives raw evidence or copy.
import assert from "node:assert/strict";
import { generatePersonalFreeEdition } from "./personal-free-edition.mjs";
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
  const mode = candidate.provenance.personalFreeResearch.draftingMode;
  console.info(JSON.stringify({ status: "validated-and-rendered", stories, mode,
    emailSent: false, repeatHistory: "isolated-test-empty-ledger", maxModelRequests: 3 }));
  assert.ok(stories > 0 && mode === "source-grounded-summary", "No model-checked live summary survived.");
} catch (error) {
  // Only stable codes/counts enter public workflow logs, never copy, URLs or tokens.
  console.error(`Quality smoke test failed: ${/^[A-Z_]+$/.test(error?.code ?? "") ? error.code : "QUALITY_CHECK_FAILED"}`);
  process.exitCode = 1;
}
