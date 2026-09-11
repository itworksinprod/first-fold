import { pathToFileURL } from "node:url";
import { generatePersonalFreeEdition } from "./personal-free-edition.mjs";
import { createEmptyPersonalStoryLedger } from "./personal-story-ledger.mjs";
import { collectFreeResearchSnapshot } from "./free/feed-engine.mjs";
import { assertPersonalEmailCandidate, sendPersonalEditionPreview } from "./personal-email.mjs";

export const REQUESTED_PREVIEW_DATE = "2026-09-11";
export function assertRequestedPreview(env, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map(({ type, value }) => [type, value]));
  if (`${parts.year}-${parts.month}-${parts.day}` !== REQUESTED_PREVIEW_DATE || Number(parts.hour) < 6 ||
      env.PREVIEW_CONFIRMATION !== `SEND PREVIEW ${REQUESTED_PREVIEW_DATE}` ||
      env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "itworksinprod/first-fold" ||
      env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_ACTOR !== "itworksinprod" ||
      env.GITHUB_TRIGGERING_ACTOR !== "itworksinprod" || env.GITHUB_RUN_ATTEMPT !== "1" ||
      !["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME) ||
      env.GITHUB_WORKFLOW_REF !== "itworksinprod/first-fold/.github/workflows/personal-preview.yml@refs/heads/main" ||
      !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? "") || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "")) {
    throw new Error("The one-time requested preview gate is closed.");
  }
}

export async function runRequestedPreview({ env = process.env, now = new Date(),
  generate = generatePersonalFreeEdition, send = sendPersonalEditionPreview } = {}) {
  assertRequestedPreview(env, now);
  if (!env.RESEND_API_KEY || !env.PERSONAL_PAPER_EMAIL) throw new Error("Preview email configuration is missing.");
  let snapshot;
  const candidate = await generate({ editionDate: REQUESTED_PREVIEW_DATE,
    runMode: "same_day_backfill", env, now,
    personalStoryLedger: createEmptyPersonalStoryLedger({ fingerprintKey: env.CLOUDFLARE_AI_API_TOKEN }),
    researchImpl: async (options) => snapshot ??= await collectFreeResearchSnapshot(options),
  });
  assertPersonalEmailCandidate(candidate);
  const stories = Object.values(candidate.desks).flatMap(({ story }) => story ? [story] : []);
  const checked = stories.filter((story) => story.evidence.length > 0 &&
    story.evidence.every((claim) => claim.id.startsWith(`${story.id}-grounded-`))).length;
  console.info(`::notice title=Preview quality::${JSON.stringify({ stories: stories.length, checked,
    mode: candidate.provenance.personalFreeResearch.draftingMode, repeatHistory: "isolated-preview" })}`);
  if (!stories.length || checked !== stories.length ||
      candidate.provenance.personalFreeResearch.draftingMode !== "source-grounded-summary") {
    throw new Error("Preview did not meet the checked-summary quality requirement.");
  }
  // Recheck expiry immediately before sending, without changing any daily state.
  assertRequestedPreview(env, new Date());
  await send(candidate, { apiKey: env.RESEND_API_KEY, recipient: env.PERSONAL_PAPER_EMAIL,
    previewConfirmation: env.PREVIEW_CONFIRMATION });
  console.info(`::notice title=Preview sent::${JSON.stringify({ resendAccepted: true,
    stories: stories.length, dailyLedgerChanged: false, publicEditionCreated: false })}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRequestedPreview().catch((error) => {
    const code = /^[A-Z_]{1,64}$/.test(error?.code ?? "") ? error.code : "PREVIEW_FAILED";
    const resendStatus = /^Resend rejected personal email delivery with status (\d{3})\.$/.exec(error?.message ?? "")?.[1] ?? null;
    console.error(`::error title=Preview stopped::${JSON.stringify({ code, resendStatus, automaticSendRetry: false })}`);
    process.exitCode = 1;
  });
}
