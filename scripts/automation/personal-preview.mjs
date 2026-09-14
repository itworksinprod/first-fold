import { pathToFileURL } from "node:url";
import { generatePersonalFreeEdition } from "./personal-free-edition.mjs";
import { createEmptyPersonalStoryLedger } from "./personal-story-ledger.mjs";
import { collectFreeResearchSnapshot } from "./free/feed-engine.mjs";
import { assertPersonalEmailCandidate, sendPersonalEditionPreview } from "./personal-email.mjs";
import { isValidWebSearchReceipt } from "./free/search-receipt.mjs";
import { HISTORICAL_PREVIEW, authorizeHistoricalPreview } from "./historical-preview-policy.mjs";
import { draftFreeEditionWithHealth } from "./draft-free-edition.mjs";
import { FREE_REASONING_WRITER_MODEL } from "./free/models.mjs";
import { REQUESTED_PREVIEW_DATE, REQUESTED_PREVIEW_REVISION, REQUESTED_PREVIEW_CONFIRMATION } from "./requested-preview-policy.mjs";

export { REQUESTED_PREVIEW_DATE, REQUESTED_PREVIEW_REVISION };
export function assertRequestedPreview(env, now = new Date()) {
  if (env.PREVIEW_CONFIRMATION === HISTORICAL_PREVIEW.confirmation) {
    return authorizeHistoricalPreview(env, now);
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map(({ type, value }) => [type, value]));
  if (`${parts.year}-${parts.month}-${parts.day}` !== REQUESTED_PREVIEW_DATE || Number(parts.hour) < 6 ||
      env.PREVIEW_CONFIRMATION !== REQUESTED_PREVIEW_CONFIRMATION ||
      env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "itworksinprod/first-fold" ||
      env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_ACTOR !== "itworksinprod" ||
      env.GITHUB_TRIGGERING_ACTOR !== "itworksinprod" || env.GITHUB_RUN_ATTEMPT !== "1" ||
      env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GITHUB_WORKFLOW_REF !== "itworksinprod/first-fold/.github/workflows/personal-preview.yml@refs/heads/main" ||
      !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? "") || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "")) {
    throw new Error("The one-time requested preview gate is closed.");
  }
}

export function assertRequestedSearchReceipt(receipt) {
  if (!isValidWebSearchReceipt(receipt) || receipt.admittedArticles < 1) {
    throw Object.assign(new Error("The requested preview requires verified search-discovered articles."),
      { code: "SEARCH_ADMISSION_REQUIRED" });
  }
}

export function assertRequestedPreviewQuality(candidate) {
  const research = candidate.provenance?.personalFreeResearch;
  assertRequestedSearchReceipt(research?.webSearch);
  const stories = Object.values(candidate.desks ?? {}).flatMap(({ story }) => story ? [story] : []);
  const checked = stories.filter((story) => Array.isArray(story.evidence) && story.evidence.length > 0 &&
    story.evidence.every((claim) => typeof claim?.id === "string" &&
      claim.id.startsWith(`${story.id}-grounded-`))).length;
  if (!stories.length || checked !== stories.length || research.draftingMode !== "source-grounded-summary") {
    throw Object.assign(new Error("Preview did not meet the checked-summary quality requirement."),
      { code: "CHECKED_SUMMARY_REQUIRED" });
  }
  return { stories: stories.length, checked, mode: research.draftingMode,
    webSearch: structuredClone(research.webSearch), repeatHistory: "isolated-preview" };
}

export async function runRequestedPreview({ env = process.env, now = new Date(),
  clock = () => new Date(), research = collectFreeResearchSnapshot,
  generate = generatePersonalFreeEdition, send = sendPersonalEditionPreview } = {}) {
  const historicalPreviewAuthorization = assertRequestedPreview(env, now);
  const historical = Boolean(historicalPreviewAuthorization);
  if (!env.RESEND_API_KEY || !env.PERSONAL_PAPER_EMAIL) throw new Error("Preview email configuration is missing.");
  if (!env.TAVILY_API_KEY?.trim()) {
    throw Object.assign(new Error("Search credentials are not configured."), { code: "SEARCH_KEY_REQUIRED" });
  }
  let snapshot;
  const candidate = await generate({ editionDate: historical ? HISTORICAL_PREVIEW.editionDate : REQUESTED_PREVIEW_DATE,
    runMode: historical ? HISTORICAL_PREVIEW.runMode : "same_day_backfill", env,
    now: () => clock(),
    ...(!historical ? { draftFreeEditionWithHealthImpl: options =>
      draftFreeEditionWithHealth({ ...options, model: FREE_REASONING_WRITER_MODEL }) } : {}),
    ...(historical ? { historicalPreviewAuthorization } : {}),
    personalStoryLedger: createEmptyPersonalStoryLedger({ fingerprintKey: env.CLOUDFLARE_AI_API_TOKEN }),
    researchImpl: async (options) => {
      snapshot ??= await research(options);
      // Stop before drafting if discovery did not produce verified publisher evidence.
      assertRequestedSearchReceipt(snapshot.diagnostics?.webSearch);
      return snapshot;
    },
  });
  assertPersonalEmailCandidate(candidate);
  const quality = assertRequestedPreviewQuality(candidate);
  console.info(`::notice title=Preview quality::${JSON.stringify({ ...quality,
    ...(historical ? { editionDate: HISTORICAL_PREVIEW.editionDate,
      researchedOn: HISTORICAL_PREVIEW.requestedOn, archivedSnapshot: false } : {}) })}`);
  // Recheck expiry immediately before sending, without changing any daily state.
  const sendNow = clock();
  assertRequestedPreview(env, sendNow);
  await send(candidate, { apiKey: env.RESEND_API_KEY, recipient: env.PERSONAL_PAPER_EMAIL,
    previewConfirmation: env.PREVIEW_CONFIRMATION,
    previewRevision: historical ? HISTORICAL_PREVIEW.revision : REQUESTED_PREVIEW_REVISION,
    ...(historical ? { historicalPreviewAuthorization } : {}),
    previewNow: sendNow });
  console.info(`::notice title=Preview sent::${JSON.stringify({ resendAccepted: true,
    stories: quality.stories, dailyLedgerChanged: false, publicEditionCreated: false })}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRequestedPreview().catch((error) => {
    const diagnostic = error?.diagnosticCode ?? error?.code;
    const code = /^[A-Z_]{1,64}$/.test(diagnostic ?? "") ? diagnostic : "PREVIEW_FAILED";
    const resendStatus = /^Resend rejected personal email delivery with status (\d{3})\.$/.exec(error?.message ?? "")?.[1] ?? null;
    console.error(`::error title=Preview stopped::${JSON.stringify({ code, resendStatus, automaticSendRetry: false })}`);
    process.exitCode = 1;
  });
}
