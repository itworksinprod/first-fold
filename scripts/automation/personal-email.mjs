#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateCanonicalEdition } from "../edition-content.mjs";
import { buildPersonalFeedbackLinkMap } from "./personal-feedback.mjs";
import { PERSONAL_STORY_LEDGER_SCHEMA_VERSION } from "./personal-story-ledger.mjs";

export const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
export const PERSONAL_EMAIL_FROM = "First Fold <onboarding@resend.dev>";
export const DEFAULT_RESEND_TIMEOUT_MS = 10_000;
export const MAX_RESEND_TIMEOUT_MS = 15_000;
export const MAX_RESEND_REQUEST_BYTES = 256 * 1024;
export const MAX_RESEND_RESPONSE_BYTES = 64 * 1024;

const MAX_CANDIDATE_FILE_BYTES = 1024 * 1024;
const EXPECTED_PERSONAL_REPOSITORY = "itworksinprod/first-fold";
const PERSONAL_RESEARCH_WORKFLOW = "personal-morning-paper";
const PERSONAL_RESEARCH_PROVIDER = "cloudflare-workers-ai";
const PERSONAL_RESEARCH_METHOD = "curated-live-feeds";
const PERSONAL_RESEARCH_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const PERSONAL_RESEARCH_EVIDENCE_POLICY = "authoritative-or-corroborated";
const PERSONAL_RESEARCH_MAX_MODEL_REQUESTS = 2;
const PERSONAL_RESEARCH_LOOKBACK_HOURS = 72;
const PERSONAL_RESEARCH_MINIMUM_SCORE = 70;
const PERSONAL_RESEARCH_MINIMUM_AUTHORITATIVE_SCORE = 70;
const PERSONAL_RESEARCH_MAX_RESEARCH_ATTEMPTS = 2;
const PERSONAL_RESEARCH_RETRY_BELOW_STORY_COUNT = 3;
const PERSONAL_RESEARCH_DRAFTING_MODES = Object.freeze([
  "model",
  "trusted-authoritative-source-alert",
  "quiet",
]);
const PERSONAL_REPEAT_LOOKBACK_DAYS = 30;
const RECEIPT_COMPONENT_MAXIMUMS = Object.freeze({
  materialityNewsworthiness: 30,
  deskRelevance: 20,
  sourceStrength: 20,
  readerUsefulnessActionability: 15,
  freshness: 15,
});
const RECEIPT_COMPONENT_LABELS = Object.freeze({
  materialityNewsworthiness: "Importance",
  deskRelevance: "Relevance",
  sourceStrength: "Source quality",
  readerUsefulnessActionability: "Reader usefulness",
  freshness: "Freshness",
});
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RESEND_KEY_PATTERN = /^re_[A-Za-z0-9_-]{8,508}$/;
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const RESPONSE_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const FEEDBACK_TOKEN_FRAGMENT_PATTERN = /^#token=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_FEEDBACK_URL_LENGTH = 4_096;
const FEEDBACK_CATEGORIES = Object.freeze([
  "Useful",
  "Not relevant",
  "Repeated",
  "Wrong desk",
  "Missed story",
  "Correction",
]);
const DESKS = Object.freeze([
  ["ai", "AI & Models"],
  ["work-and-tools", "Work & Tools"],
  ["security-and-privacy", "Security & Privacy"],
  ["platforms-and-power", "Platforms & Power"],
]);

class SafeDeliveryError extends Error {}
class DeliveryTimeoutError extends SafeDeliveryError {}

function compactText(value) {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return compactText(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function requireSourceUrl(value) {
  if (typeof value !== "string" || value.length > 4_096 || value !== value.trim()) {
    throw new Error("Personal email candidate contains an invalid source URL.");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Personal email candidate contains an invalid source URL.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.href.length > 4_096
  ) {
    throw new Error("Personal email candidate contains an invalid source URL.");
  }
  return parsed.href;
}

function requireFeedbackUrl(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_FEEDBACK_URL_LENGTH ||
    value !== value.trim() ||
    CONTROL_CHARACTER.test(value)
  ) {
    throw new Error("Personal email feedback links are invalid.");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Personal email feedback links are invalid.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    !FEEDBACK_TOKEN_FRAGMENT_PATTERN.test(parsed.hash) ||
    parsed.href.length > MAX_FEEDBACK_URL_LENGTH
  ) {
    throw new Error("Personal email feedback links are invalid.");
  }
  return parsed;
}

function selectedFeedbackStories(candidate) {
  return DESKS.flatMap(([desk]) => {
    const story = candidate.desks[desk].story;
    return story === null ? [] : [{ id: story.id, desk }];
  });
}

function normalizeFeedbackLinks(candidate, feedbackLinks) {
  if (feedbackLinks === undefined || feedbackLinks === null) return null;
  if (
    typeof feedbackLinks !== "object" ||
    Array.isArray(feedbackLinks) ||
    Object.keys(feedbackLinks).length !== 2 ||
    !Object.hasOwn(feedbackLinks, "edition") ||
    !Object.hasOwn(feedbackLinks, "stories") ||
    typeof feedbackLinks.stories !== "object" ||
    feedbackLinks.stories === null ||
    Array.isArray(feedbackLinks.stories)
  ) {
    throw new Error("Personal email feedback links are invalid.");
  }

  const expectedStories = selectedFeedbackStories(candidate);
  const expectedStoryIds = new Set(expectedStories.map(({ id }) => id));
  const suppliedStoryIds = Object.keys(feedbackLinks.stories);
  if (
    suppliedStoryIds.length !== expectedStoryIds.size ||
    suppliedStoryIds.some((storyId) => !expectedStoryIds.has(storyId))
  ) {
    throw new Error("Personal email feedback links are invalid.");
  }

  const editionUrl = requireFeedbackUrl(feedbackLinks.edition);
  const feedbackTarget = `${editionUrl.origin}${editionUrl.pathname}`;
  const seenLinks = new Set([editionUrl.href]);
  const stories = Object.fromEntries(expectedStories.map(({ id }) => {
    const storyUrl = requireFeedbackUrl(feedbackLinks.stories[id]);
    if (
      `${storyUrl.origin}${storyUrl.pathname}` !== feedbackTarget ||
      seenLinks.has(storyUrl.href)
    ) {
      throw new Error("Personal email feedback links are invalid.");
    }
    seenLinks.add(storyUrl.href);
    return [id, storyUrl.href];
  }));

  return { edition: editionUrl.href, stories };
}

function optionalFeedbackLinks(candidate, {
  feedbackLinks,
  feedbackBaseUrl,
  feedbackSigningKey,
  feedbackNow,
}) {
  if (feedbackLinks !== undefined && feedbackLinks !== null) {
    return normalizeFeedbackLinks(candidate, feedbackLinks);
  }
  const hasBaseUrl = typeof feedbackBaseUrl === "string" && feedbackBaseUrl.trim().length > 0;
  const hasSigningKey =
    typeof feedbackSigningKey === "string" && feedbackSigningKey.trim().length > 0;
  if (!hasBaseUrl || !hasSigningKey) return null;

  try {
    return normalizeFeedbackLinks(candidate, buildPersonalFeedbackLinkMap({
      editionDate: candidate.editionDate,
      issueNumber: candidate.issueNumber,
      stories: selectedFeedbackStories(candidate),
    }, {
      baseUrl: feedbackBaseUrl,
      signingKey: feedbackSigningKey,
      ...(feedbackNow === undefined ? {} : { now: feedbackNow }),
    }));
  } catch {
    return null;
  }
}

function formatEditionDate(editionDate) {
  if (!DATE_PATTERN.test(editionDate ?? "")) {
    throw new Error("Personal email candidate has an invalid edition date.");
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${editionDate}T12:00:00.000Z`));
}

function sourceRelationshipLabel(relationship) {
  if (relationship === "originating") return "Primary source";
  if (relationship === "independent") return "Independent reporting";
  return "Context";
}

function readerFacingSources(story) {
  const sources = story.sources.filter((source) => source.relationship !== "context");
  if (sources.length < 1) throw validationFailure();
  return sources;
}

function formatSourceDate(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function validationFailure() {
  return new Error("Personal email requires a validated adaptive source-checked candidate.");
}

function isDisplayString(value, maximumLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength;
}

function hasSafeDisplayFields(candidate) {
  if (
    !isDisplayString(candidate.masthead?.name, 100) ||
    !isDisplayString(candidate.masthead?.tagline, 300) ||
    !isDisplayString(candidate.frontPage?.note, 2_000) ||
    !Number.isInteger(candidate.frontPage?.estimatedMinutes) ||
    candidate.frontPage.estimatedMinutes < 1 ||
    candidate.frontPage.estimatedMinutes > 60
  ) {
    return false;
  }
  for (const [deskKey] of DESKS) {
    const page = candidate.desks?.[deskKey];
    if (page?.story === null) {
      if (!isDisplayString(page.emptyReason, 2_000)) return false;
      continue;
    }
    const story = page?.story;
    if (
      !story ||
      !isDisplayString(story.headline, 500) ||
      !isDisplayString(story.deck, 1_000) ||
      !isDisplayString(story.whatHappened, 10_000) ||
      !isDisplayString(story.whyItMatters, 10_000) ||
      !isDisplayString(story.whatToDoOrWatch, 10_000) ||
      !Array.isArray(story.sources) ||
      story.sources.length < 1 ||
      story.sources.length > 20
    ) {
      return false;
    }
    for (const source of story.sources) {
      if (
        !isDisplayString(source?.publisher, 300) ||
        !isDisplayString(source?.title, 1_000) ||
        !["originating", "independent", "context"].includes(source?.relationship)
      ) {
        return false;
      }
      try {
        requireSourceUrl(source.url);
      } catch {
        return false;
      }
    }
  }
  return true;
}

function citedFactualSources(story) {
  const sourceById = new Map();
  for (const source of story?.sources ?? []) {
    if (typeof source?.id !== "string" || sourceById.has(source.id)) {
      throw validationFailure();
    }
    sourceById.set(source.id, source);
  }
  const citedSourceIds = new Set(
    (story?.evidence ?? []).flatMap((claim) =>
      Array.isArray(claim?.sourceIds) ? claim.sourceIds : []),
  );
  const factualSources = [];
  const seenUrls = new Set();
  for (const sourceId of citedSourceIds) {
    const source = sourceById.get(sourceId);
    if (!source || source.relationship === "context") continue;
    const url = requireSourceUrl(source.url);
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    factualSources.push(source);
  }
  return factualSources;
}

function buildStoryValidationReceipt(story) {
  const score = story?.selection?.score;
  const trustedReceipt = story?.selection?.validationReceipt;
  if (
    !Number.isFinite(score) ||
    score < PERSONAL_RESEARCH_MINIMUM_SCORE ||
    score > 100 ||
    !trustedReceipt ||
    typeof trustedReceipt !== "object" ||
    Array.isArray(trustedReceipt) ||
    trustedReceipt.version !== "editorial-v1" ||
    trustedReceipt.score !== score ||
    !Number.isFinite(trustedReceipt.requiredScore) ||
    trustedReceipt.requiredScore < PERSONAL_RESEARCH_MINIMUM_SCORE ||
    trustedReceipt.requiredScore > score ||
    !trustedReceipt.components ||
    typeof trustedReceipt.components !== "object" ||
    Array.isArray(trustedReceipt.components) ||
    !trustedReceipt.componentMaximums ||
    typeof trustedReceipt.componentMaximums !== "object" ||
    Array.isArray(trustedReceipt.componentMaximums)
  ) {
    throw validationFailure();
  }
  let componentTotal = 0;
  for (const [component, maximum] of Object.entries(RECEIPT_COMPONENT_MAXIMUMS)) {
    const componentScore = trustedReceipt.components[component];
    if (
      !Number.isInteger(componentScore) ||
      componentScore < 0 ||
      componentScore > maximum ||
      trustedReceipt.componentMaximums[component] !== maximum
    ) {
      throw validationFailure();
    }
    componentTotal += componentScore;
  }
  if (
    componentTotal !== score ||
    Object.keys(trustedReceipt.components).length !== Object.keys(RECEIPT_COMPONENT_MAXIMUMS).length ||
    Object.keys(trustedReceipt.componentMaximums).length !== Object.keys(RECEIPT_COMPONENT_MAXIMUMS).length
  ) {
    throw validationFailure();
  }
  const factualSources = citedFactualSources(story);
  if (
    trustedReceipt.factualSourceCount !== factualSources.length ||
    !Number.isInteger(trustedReceipt.publisherCount) ||
    trustedReceipt.publisherCount < 1 ||
    trustedReceipt.publisherCount > factualSources.length
  ) {
    throw validationFailure();
  }
  let evidenceTier;
  if (
    trustedReceipt.evidenceTier === "corroborated" &&
    factualSources.length >= 2 &&
    trustedReceipt.publisherCount >= 2
  ) {
    evidenceTier = "Independently corroborated";
  } else if (
    trustedReceipt.evidenceTier === "authoritative-single" &&
    factualSources.length === 1 &&
    trustedReceipt.publisherCount === 1 &&
    factualSources[0].relationship === "originating" &&
    story.priority !== "critical" &&
    story.confidence?.level !== "high" &&
    (story.evidence ?? []).every((claim) =>
      ["company-claimed", "preliminary"].includes(claim?.verification))
  ) {
    evidenceTier = "Reviewed originating source";
  } else {
    throw validationFailure();
  }
  return {
    score: String(score),
    evidenceTier,
    factualSourceCount: factualSources.length,
    componentSummary: Object.entries(trustedReceipt.components)
      .map(([component, value]) =>
        `${RECEIPT_COMPONENT_LABELS[component]}: ${value}/${RECEIPT_COMPONENT_MAXIMUMS[component]}`)
      .join(" · "),
  };
}

function hasCompleteStorySources(candidate) {
  return DESKS.every(([desk]) => {
    const story = candidate.desks?.[desk]?.story;
    if (story === null) return true;
    const sources = story?.sources;
    if (!Array.isArray(sources) || sources.length < 2) return false;
    const urls = new Set();
    let hasDirectSource = false;
    for (const source of sources) {
      try {
        urls.add(requireSourceUrl(source?.url));
      } catch {
        return false;
      }
      if (["originating", "independent"].includes(source?.relationship)) {
        hasDirectSource = true;
      }
    }
    if (urls.size < 2 || !hasDirectSource) return false;
    try {
      buildStoryValidationReceipt(story);
    } catch {
      return false;
    }
    return true;
  });
}

export function assertPersonalEmailCandidate(candidate) {
  let validation;
  try {
    validation = validateCanonicalEdition(candidate);
  } catch {
    throw validationFailure();
  }
  if (
    !validation.valid ||
    candidate.status !== "validated" ||
    candidate.publication?.publishedAt !== null ||
    Object.hasOwn(candidate.provenance ?? {}, "automation") ||
    Object.hasOwn(candidate.provenance ?? {}, "freePilot") ||
    Object.hasOwn(candidate.provenance ?? {}, "personalResearch") ||
    !hasSafeDisplayFields(candidate)
  ) {
    throw validationFailure();
  }

  const research = candidate.provenance?.personalFreeResearch;
  const sourceCheck = candidate.provenance?.sourceCheck;
  const selectedStoryCount = DESKS.filter(([desk]) =>
    candidate.desks?.[desk]?.story !== null).length;
  const authoritativeStoryCount = DESKS.filter(([desk]) =>
    candidate.desks?.[desk]?.story?.selection?.validationReceipt?.evidenceTier ===
      "authoritative-single").length;
  const inferenceIsValid = selectedStoryCount === 0
    ? research?.inference === "skipped-no-eligible-candidates" &&
      research?.responseId === "not-invoked"
    : research?.inference === "workers-ai" && research?.responseId !== "not-invoked";
  const runId = typeof research?.runId === "string" ? research.runId : "";
  const expectedRunUrl =
    `https://github.com/${EXPECTED_PERSONAL_REPOSITORY}/actions/runs/${runId}`;
  if (
    !research ||
    typeof research !== "object" ||
    research.workflow !== PERSONAL_RESEARCH_WORKFLOW ||
    research.provider !== PERSONAL_RESEARCH_PROVIDER ||
    research.researchMethod !== PERSONAL_RESEARCH_METHOD ||
    research.model !== PERSONAL_RESEARCH_MODEL ||
    research.repository !== EXPECTED_PERSONAL_REPOSITORY ||
    research.runUrl !== expectedRunUrl ||
    !/^[1-9]\d*$/.test(runId) ||
    !["on_time", "same_day_backfill"].includes(research.runMode) ||
    research.generatedAt !== candidate.publication.generatedAt ||
    !inferenceIsValid ||
    !PERSONAL_RESEARCH_DRAFTING_MODES.includes(research.draftingMode) ||
    (selectedStoryCount === 0 && research.draftingMode !== "quiet") ||
    (selectedStoryCount > 0 && !["model", "trusted-authoritative-source-alert"].includes(
      research.draftingMode,
    )) ||
    (research.draftingMode === "trusted-authoritative-source-alert" &&
      authoritativeStoryCount < 1) ||
    typeof research.responseId !== "string" ||
    !RESPONSE_ID_PATTERN.test(research.responseId) ||
    !/^[a-f0-9]{64}$/.test(research.feedSnapshotSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(research.requestSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(research.responseSha256 ?? "") ||
    !Number.isInteger(research.feedSourceCount) ||
    research.feedSourceCount < 1 ||
    !Number.isInteger(research.successfulFeedSourceCount) ||
    research.successfulFeedSourceCount < 1 ||
    research.successfulFeedSourceCount > research.feedSourceCount ||
    research.coveredDeskCount !== DESKS.length ||
    !Number.isInteger(research.candidateCount) ||
    research.candidateCount !== selectedStoryCount ||
    research.candidateSelection !== "deterministic-selected-slate" ||
    research.evidencePolicy !== PERSONAL_RESEARCH_EVIDENCE_POLICY ||
    research.lookbackHours !== PERSONAL_RESEARCH_LOOKBACK_HOURS ||
    research.minimumScore !== PERSONAL_RESEARCH_MINIMUM_SCORE ||
    research.minimumAuthoritativeScore !== PERSONAL_RESEARCH_MINIMUM_AUTHORITATIVE_SCORE ||
    research.ephemeral !== true ||
    research.requiredStoryCount !== selectedStoryCount ||
    research.selectedStoryCount !== selectedStoryCount ||
    research.maxResearchAttempts !== PERSONAL_RESEARCH_MAX_RESEARCH_ATTEMPTS ||
    research.researchRetryBelowStoryCount !== PERSONAL_RESEARCH_RETRY_BELOW_STORY_COUNT ||
    ![1, 2].includes(research.researchAttemptCount) ||
    !["not-needed", "improved", "no-improvement", "coverage-fallback"].includes(
      research.researchRetryOutcome,
    ) ||
    (research.researchAttemptCount === 1 && research.researchRetryOutcome !== "not-needed") ||
    (research.researchAttemptCount === 2 && research.researchRetryOutcome === "not-needed") ||
    research.repeatLedgerSchemaVersion !== PERSONAL_STORY_LEDGER_SCHEMA_VERSION ||
    research.repeatLookbackDays !== PERSONAL_REPEAT_LOOKBACK_DAYS ||
    !/^[a-f0-9]{64}$/.test(research.repeatStateSha256 ?? "") ||
    !Number.isInteger(research.priorLedgerEditionCount) ||
    research.priorLedgerEditionCount < 0 ||
    !Number.isInteger(research.priorLedgerStoryCount) ||
    research.priorLedgerStoryCount < 0 ||
    !(
      research.qualityPilotOrdinal === null ||
      (Number.isInteger(research.qualityPilotOrdinal) &&
        research.qualityPilotOrdinal >= 1 &&
        research.qualityPilotOrdinal <= 5)
    ) ||
    research.qualityPilotOrdinal !== (
      research.priorLedgerEditionCount < 5
        ? research.priorLedgerEditionCount + 1
        : null
    ) ||
    selectedStoryCount > DESKS.length ||
    research.maxModelRequests !== PERSONAL_RESEARCH_MAX_MODEL_REQUESTS ||
    !sourceCheck ||
    typeof sourceCheck !== "object" ||
    sourceCheck.status !== "passed" ||
    !Number.isInteger(sourceCheck.checkedSourceCount) ||
    sourceCheck.checkedSourceCount < selectedStoryCount * 2 ||
    (selectedStoryCount === 0 && sourceCheck.checkedSourceCount !== 0) ||
    !Array.isArray(sourceCheck.issues) ||
    sourceCheck.issues.length !== 0 ||
    DESKS.some(([desk]) => {
      const story = candidate.desks?.[desk]?.story;
      return story !== null &&
        story?.selection?.validationReceipt?.evidenceTier === "authoritative-single" &&
        candidate.frontPage?.stopThePressesStoryId === story.id;
    }) ||
    !hasCompleteStorySources(candidate)
  ) {
    throw validationFailure();
  }
  return validation;
}

function renderStoryHtml(story, feedbackUrl) {
  const receipt = buildStoryValidationReceipt(story);
  const sources = readerFacingSources(story).map((source) => {
    const href = escapeHtml(requireSourceUrl(source.url));
    return `
      <li style="margin:0 0 8px 18px;padding:0;color:#37332d;font:14px/1.45 Georgia,Times New Roman,serif;">
        <a href="${href}" style="color:#712b27;text-decoration:underline;">${escapeHtml(source.publisher)} — ${escapeHtml(source.title)}</a>
        <span style="color:#70685d;"> · ${sourceRelationshipLabel(source.relationship)}</span>
      </li>`;
  }).join("");

  return `
    <h2 style="margin:10px 0 8px;color:#171512;font:700 30px/1.04 Georgia,Times New Roman,serif;letter-spacing:-0.5px;">${escapeHtml(story.headline)}</h2>
    <p style="margin:0 0 22px;color:#504a41;font:italic 17px/1.45 Georgia,Times New Roman,serif;">${escapeHtml(story.deck)}</p>
    <h3 style="margin:0 0 6px;color:#712b27;font:700 12px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.1px;text-transform:uppercase;">What happened</h3>
    <p style="margin:0 0 18px;color:#24211d;font:16px/1.62 Georgia,Times New Roman,serif;">${escapeHtml(story.whatHappened)}</p>
    <h3 style="margin:0 0 6px;color:#712b27;font:700 12px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.1px;text-transform:uppercase;">Why it matters</h3>
    <p style="margin:0 0 18px;color:#24211d;font:16px/1.62 Georgia,Times New Roman,serif;">${escapeHtml(story.whyItMatters)}</p>
    <h3 style="margin:0 0 6px;color:#712b27;font:700 12px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.1px;text-transform:uppercase;">What to do or watch</h3>
    <p style="margin:0 0 22px;color:#24211d;font:16px/1.62 Georgia,Times New Roman,serif;">${escapeHtml(story.whatToDoOrWatch)}</p>
    <div style="margin:0 0 22px;padding:12px 14px;background:#e9e2d5;border-left:3px solid #712b27;">
      <p style="margin:0 0 5px;color:#712b27;font:700 11px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.1px;text-transform:uppercase;">Validation receipt</p>
      <p style="margin:0;color:#4f493f;font:13px/1.45 Arial,Helvetica,sans-serif;">Editorial score: ${escapeHtml(receipt.score)}/100 · Evidence: ${escapeHtml(receipt.evidenceTier)} · ${receipt.factualSourceCount} factual ${receipt.factualSourceCount === 1 ? "source" : "sources"}</p>
      <p style="margin:5px 0 0;color:#6b6358;font:11px/1.45 Arial,Helvetica,sans-serif;">${escapeHtml(receipt.componentSummary)}</p>
    </div>
    <p style="margin:0 0 8px;color:#171512;font:700 12px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.1px;text-transform:uppercase;">Sources</p>
    <ul style="margin:0;padding:0;">${sources}
    </ul>${feedbackUrl === undefined ? "" : `
    <p style="margin:22px 0 0;"><a href="${escapeHtml(feedbackUrl)}" style="display:inline-block;padding:9px 13px;border:1px solid #712b27;color:#712b27;font:700 12px/1.2 Arial,Helvetica,sans-serif;text-decoration:none;">Review this story</a></p>`}`;
}

function renderStoryText(story, feedbackUrl) {
  const receipt = buildStoryValidationReceipt(story);
  const sources = readerFacingSources(story).map((source) => {
    const url = requireSourceUrl(source.url);
    return `- ${compactText(source.publisher)} — ${compactText(source.title)} [${sourceRelationshipLabel(source.relationship)}]\n  ${url}`;
  }).join("\n");
  return [
    compactText(story.headline),
    compactText(story.deck),
    "",
    "WHAT HAPPENED",
    compactText(story.whatHappened),
    "",
    "WHY IT MATTERS",
    compactText(story.whyItMatters),
    "",
    "WHAT TO DO OR WATCH",
    compactText(story.whatToDoOrWatch),
    "",
    "VALIDATION RECEIPT",
    `Editorial score: ${receipt.score}/100 · Evidence: ${receipt.evidenceTier} · Factual sources: ${receipt.factualSourceCount}`,
    receipt.componentSummary,
    "",
    "SOURCES",
    sources,
    ...(feedbackUrl === undefined ? [] : ["", "REVIEW THIS STORY", feedbackUrl]),
  ].join("\n");
}

function authoritativeSourceBrief(story) {
  const receipt = buildStoryValidationReceipt(story);
  const sources = citedFactualSources(story);
  if (
    receipt.evidenceTier !== "Reviewed originating source" ||
    sources.length !== 1 ||
    sources[0].relationship !== "originating"
  ) {
    throw validationFailure();
  }
  const source = sources[0];
  return {
    receipt,
    source,
    publishedLabel: formatSourceDate(source.publishedAt),
  };
}

function renderSourceBriefHtml(story, deskLabel, feedbackUrl) {
  const { receipt, source, publishedLabel } = authoritativeSourceBrief(story);
  const href = escapeHtml(requireSourceUrl(source.url));
  const dateSuffix = publishedLabel === null ? "" : ` · ${escapeHtml(publishedLabel)}`;
  return `
    <p style="margin:10px 0 8px;color:#712b27;font:700 11px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.1px;text-transform:uppercase;">Primary-source brief</p>
    <h2 style="margin:0 0 8px;color:#171512;font:700 30px/1.04 Georgia,Times New Roman,serif;letter-spacing:-0.5px;">${escapeHtml(source.title)}</h2>
    <p style="margin:0 0 20px;color:#504a41;font:italic 16px/1.45 Georgia,Times New Roman,serif;">${escapeHtml(source.publisher)}${dateSuffix}</p>
    <p style="margin:0 0 16px;color:#24211d;font:16px/1.62 Georgia,Times New Roman,serif;">This official update from ${escapeHtml(source.publisher)} was timely and relevant to ${escapeHtml(deskLabel)}, so it made today’s paper. No independent report was available in the reviewed sources before press time, so First Fold is showing the publisher’s own headline and linking directly to the original.</p>
    <p style="margin:0 0 20px;color:#24211d;font:16px/1.62 Georgia,Times New Roman,serif;">Read the original report for its exact claims, scope, dates, affected products, and caveats. Treat those details as the publisher’s account unless independent reporting confirms them.</p>
    <p style="margin:0 0 22px;"><a href="${href}" style="display:inline-block;padding:10px 14px;background:#712b27;color:#ffffff;font:700 13px/1.2 Arial,Helvetica,sans-serif;text-decoration:none;">Read the original report</a></p>
    <div style="margin:0 0 6px;padding:12px 14px;background:#e9e2d5;border-left:3px solid #712b27;">
      <p style="margin:0 0 5px;color:#712b27;font:700 11px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.1px;text-transform:uppercase;">Why it made the paper</p>
      <p style="margin:0;color:#4f493f;font:13px/1.45 Arial,Helvetica,sans-serif;">Editorial score: ${escapeHtml(receipt.score)}/100 · ${escapeHtml(receipt.componentSummary)}</p>
    </div>${feedbackUrl === undefined ? "" : `
    <p style="margin:22px 0 0;"><a href="${escapeHtml(feedbackUrl)}" style="display:inline-block;padding:9px 13px;border:1px solid #712b27;color:#712b27;font:700 12px/1.2 Arial,Helvetica,sans-serif;text-decoration:none;">Review this story</a></p>`}`;
}

function renderSourceBriefText(story, deskLabel, feedbackUrl) {
  const { receipt, source, publishedLabel } = authoritativeSourceBrief(story);
  const sourceUrl = requireSourceUrl(source.url);
  return [
    "PRIMARY-SOURCE BRIEF",
    compactText(source.title),
    `${compactText(source.publisher)}${publishedLabel === null ? "" : ` · ${publishedLabel}`}`,
    "",
    `This official update from ${compactText(source.publisher)} was timely and relevant to ${deskLabel}, so it made today’s paper. No independent report was available in the reviewed sources before press time, so First Fold is showing the publisher’s own headline and linking directly to the original.`,
    "",
    "Read the original report for its exact claims, scope, dates, affected products, and caveats. Treat those details as the publisher’s account unless independent reporting confirms them.",
    "",
    `READ THE ORIGINAL REPORT\n${sourceUrl}`,
    "",
    `WHY IT MADE THE PAPER\nEditorial score: ${receipt.score}/100 · ${receipt.componentSummary}`,
    ...(feedbackUrl === undefined ? [] : ["", "REVIEW THIS STORY", feedbackUrl]),
  ].join("\n");
}

function shouldRenderSourceBrief(story, sourceBriefMode) {
  return sourceBriefMode &&
    story?.selection?.validationReceipt?.evidenceTier === "authoritative-single";
}

function renderDeskHtml(candidate, deskKey, deskLabel, feedbackLinks, sourceBriefMode) {
  const page = candidate.desks[deskKey];
  const isSourceBriefStory = shouldRenderSourceBrief(page.story, sourceBriefMode);
  const content = page.story === null
    ? `
      <p style="margin:10px 0 7px;color:#171512;font:700 24px/1.1 Georgia,Times New Roman,serif;">Nothing cleared the bar today.</p>
      <p style="margin:0;color:#5b554c;font:15px/1.55 Georgia,Times New Roman,serif;">${escapeHtml(page.emptyReason)}</p>`
    : isSourceBriefStory
      ? renderSourceBriefHtml(page.story, deskLabel, feedbackLinks?.stories[page.story.id])
      : renderStoryHtml(page.story, feedbackLinks?.stories[page.story.id]);
  return `
  <tr>
    <td style="padding:30px 34px;border-top:2px solid #24211d;">
      <p style="margin:0;color:#712b27;font:700 12px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.6px;text-transform:uppercase;">${deskLabel}${page.story === null ? " · Quiet desk" : ""}</p>${content}
    </td>
  </tr>`;
}

function renderDeskText(candidate, deskKey, deskLabel, feedbackLinks, sourceBriefMode) {
  const page = candidate.desks[deskKey];
  const isSourceBriefStory = shouldRenderSourceBrief(page.story, sourceBriefMode);
  return page.story === null
    ? `${deskLabel.toUpperCase()} — QUIET DESK\nNothing cleared the bar today.\n${compactText(page.emptyReason)}`
    : `${deskLabel.toUpperCase()}\n${isSourceBriefStory
      ? renderSourceBriefText(page.story, deskLabel, feedbackLinks?.stories[page.story.id])
      : renderStoryText(page.story, feedbackLinks?.stories[page.story.id])}`;
}

/**
 * Convert one validated free candidate into a static, email-client-safe paper.
 * Dynamic editorial and source strings are escaped before entering the HTML.
 */
export function renderPersonalEditionEmail(candidate, { feedbackLinks } = {}) {
  assertPersonalEmailCandidate(candidate);
  const normalizedFeedbackLinks = normalizeFeedbackLinks(candidate, feedbackLinks);
  const displayDate = formatEditionDate(candidate.editionDate);
  const subject = `First Fold — ${displayDate}`;
  const research = candidate.provenance.personalFreeResearch;
  const selectedStoryCount = research.selectedStoryCount;
  const sourceBriefMode = research.draftingMode === "trusted-authoritative-source-alert";
  const selectedStories = DESKS
    .map(([deskKey]) => candidate.desks[deskKey].story)
    .filter((story) => story !== null);
  const sourceBriefStoryCount = selectedStories
    .filter((story) => shouldRenderSourceBrief(story, sourceBriefMode)).length;
  const corroboratedStoryCount = selectedStoryCount - sourceBriefStoryCount;
  const allSourceBriefs = selectedStoryCount > 0 && sourceBriefStoryCount === selectedStoryCount;
  const mixedSourceEdition = sourceBriefStoryCount > 0 && corroboratedStoryCount > 0;
  const editionLabel = allSourceBriefs
    ? "Source brief edition"
    : mixedSourceEdition
      ? "Mixed-source edition"
      : selectedStoryCount >= 2
        ? "Regular edition"
        : selectedStoryCount === 1
          ? "Slim edition"
          : "Quiet edition";
  const storyCountLabel = `${selectedStoryCount} ${selectedStoryCount === 1 ? "story" : "stories"}`;
  const readerFrontPageNote = allSourceBriefs
    ? `${selectedStoryCount} ${selectedStoryCount === 1 ? "official update made" : "official updates made"} today’s paper. ` +
      "Each primary-source brief links to the publisher and is clearly marked when independent reporting was not available before press time."
    : mixedSourceEdition
      ? `${corroboratedStoryCount} independently corroborated ${corroboratedStoryCount === 1 ? "article" : "articles"} and ` +
        `${sourceBriefStoryCount} clearly labeled primary-source ${sourceBriefStoryCount === 1 ? "brief" : "briefs"} made today’s paper. ` +
        "Each primary-source brief links to the publisher and is clearly marked when independent reporting was not available before press time."
    : candidate.frontPage.note;
  const newsroomCheckLabel =
    `Newsroom check: ${research.successfulFeedSourceCount} of ${research.feedSourceCount} reviewed sources available`;
  const deliveryCheckLabel = selectedStoryCount === 0
    ? "Curated-feed research completed · Quality threshold unchanged"
    : allSourceBriefs
      ? "Primary links checked before delivery"
      : mixedSourceEdition
        ? "Sources and primary links checked before delivery"
        : "Source checked before delivery";
  const pilotOrdinal = research.qualityPilotOrdinal;
  const pilotHtml = pilotOrdinal === null
    ? ""
    : `
        <tr>
          <td style="padding:14px 34px;background:#e9e2d5;border-top:1px solid #b9b09f;border-bottom:1px solid #b9b09f;">
            <p style="margin:0;color:#712b27;font:700 11px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.2px;text-transform:uppercase;">Quality pilot · Edition ${pilotOrdinal} of 5</p>
            <p style="margin:6px 0 0;color:#4f493f;font:13px/1.45 Arial,Helvetica,sans-serif;">Please review relevance, importance, source quality, freshness, and usefulness.</p>
          </td>
        </tr>`;
  const pilotText = pilotOrdinal === null
    ? []
    : [
      `QUALITY PILOT · EDITION ${pilotOrdinal} OF 5`,
      "Please review relevance, importance, source quality, freshness, and usefulness.",
      "",
    ];
  const deskHtml = DESKS.map(([key, label]) =>
    renderDeskHtml(candidate, key, label, normalizedFeedbackLinks, sourceBriefMode)).join("");
  const deskText = DESKS.map(([key, label]) =>
    renderDeskText(candidate, key, label, normalizedFeedbackLinks, sourceBriefMode))
    .join("\n\n----------------------------------------\n\n");
  const feedbackCategories = FEEDBACK_CATEGORIES.join(" · ");
  const feedbackHtml = normalizedFeedbackLinks === null
    ? ""
    : `
        <tr>
          <td style="padding:24px 34px;border-top:2px solid #24211d;background:#e9e2d5;">
            <p style="margin:0;color:#712b27;font:700 12px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.4px;text-transform:uppercase;">Help shape tomorrow’s paper</p>
            <p style="margin:8px 0 15px;color:#4f493f;font:13px/1.5 Arial,Helvetica,sans-serif;">${escapeHtml(feedbackCategories)}. Feedback is reviewed by a person and never changes editorial policy automatically.</p>
            <p style="margin:0;"><a href="${escapeHtml(normalizedFeedbackLinks.edition)}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 13px;background:#712b27;color:#ffffff;font:700 12px/1.2 Arial,Helvetica,sans-serif;text-decoration:none;">Review this edition</a><a href="${escapeHtml(normalizedFeedbackLinks.edition)}" style="display:inline-block;margin:0 0 8px;padding:9px 13px;border:1px solid #712b27;color:#712b27;font:700 12px/1.2 Arial,Helvetica,sans-serif;text-decoration:none;">Report a missed story</a></p>
          </td>
        </tr>`;
  const feedbackText = normalizedFeedbackLinks === null
    ? []
    : [
      "HELP SHAPE TOMORROW’S PAPER",
      feedbackCategories,
      "Feedback is reviewed by a person and never changes editorial policy automatically.",
      `Review this edition: ${normalizedFeedbackLinks.edition}`,
      `Report a missed story: ${normalizedFeedbackLinks.edition}`,
      "",
    ];

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#ded8cc;color:#171512;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(readerFrontPageNote)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background:#ded8cc;">
    <tr><td align="center" style="padding:24px 10px;">
      <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;border-collapse:collapse;background:#f5f0e6;border:1px solid #b9b09f;box-shadow:0 4px 18px rgba(39,32,23,.12);">
        <tr>
          <td style="padding:24px 34px 28px;border-top:7px solid #712b27;">
            <p style="margin:0 0 13px;color:#5d574e;font:700 11px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.4px;text-transform:uppercase;">Washington, D.C. · ${escapeHtml(displayDate)} · Issue No. ${escapeHtml(String(candidate.issueNumber))}</p>
            <h1 style="margin:0;color:#171512;font:700 52px/.95 Georgia,Times New Roman,serif;letter-spacing:-2px;">${escapeHtml(candidate.masthead?.name)}</h1>
            <p style="margin:10px 0 0;color:#712b27;font:italic 16px/1.4 Georgia,Times New Roman,serif;">${escapeHtml(candidate.masthead?.tagline)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 34px 28px;border-top:1px solid #8f8779;">
            <p style="margin:0 0 8px;color:#712b27;font:700 12px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.5px;text-transform:uppercase;">The morning brief · ${escapeHtml(editionLabel)}</p>
            <p style="margin:0;color:#24211d;font:22px/1.35 Georgia,Times New Roman,serif;">${escapeHtml(readerFrontPageNote)}</p>
            <p style="margin:14px 0 0;color:#6d665c;font:13px/1.4 Arial,Helvetica,sans-serif;">${escapeHtml(String(candidate.frontPage.estimatedMinutes))} minute read · ${escapeHtml(storyCountLabel)} · ${escapeHtml(deliveryCheckLabel)}</p>
            <p style="margin:8px 0 0;color:#6d665c;font:12px/1.4 Arial,Helvetica,sans-serif;">${escapeHtml(newsroomCheckLabel)}</p>
          </td>
        </tr>${pilotHtml}${deskHtml}${feedbackHtml}
        <tr>
          <td style="padding:24px 34px;border-top:3px double #24211d;text-align:center;">
            <p style="margin:0;color:#171512;font:700 18px/1.2 Georgia,Times New Roman,serif;">You’re caught up.</p>
            <p style="margin:8px 0 0;color:#6d665c;font:12px/1.5 Arial,Helvetica,sans-serif;">Your private, quality-gated First Fold. No public edition was created.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    compactText(candidate.masthead?.name).toUpperCase(),
    compactText(candidate.masthead?.tagline),
    `WASHINGTON, D.C. · ${displayDate.toUpperCase()} · ISSUE NO. ${candidate.issueNumber}`,
    "",
    `THE MORNING BRIEF · ${editionLabel.toUpperCase()}`,
    compactText(readerFrontPageNote),
    `${candidate.frontPage.estimatedMinutes} minute read · ${storyCountLabel} · ${deliveryCheckLabel}`,
    newsroomCheckLabel,
    "",
    ...pilotText,
    "========================================",
    "",
    deskText,
    "",
    "========================================",
    "",
    ...feedbackText,
    "YOU’RE CAUGHT UP.",
    "Your private, quality-gated First Fold. No public edition was created.",
  ].join("\n");

  return { subject, html, text };
}

export function personalEditionIdempotencyKey(editionDate) {
  if (!DATE_PATTERN.test(editionDate ?? "")) {
    throw new Error("Cannot create a personal email idempotency key without an edition date.");
  }
  return `first-fold-personal-${editionDate}`;
}

function requireApiKey(value) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length > 511 ||
    !RESEND_KEY_PATTERN.test(value)
  ) {
    throw new Error("RESEND_API_KEY is missing or invalid.");
  }
  return value;
}

function requireRecipient(value) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length > 254 ||
    !EMAIL_PATTERN.test(value)
  ) {
    throw new Error("PERSONAL_PAPER_EMAIL must be one valid email address.");
  }
  return value;
}

function requireTimeout(value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_RESEND_TIMEOUT_MS) {
    throw new Error(`Email timeout must be an integer from 1 to ${MAX_RESEND_TIMEOUT_MS} milliseconds.`);
  }
  return value;
}

async function readBoundedResponse(response) {
  const declaredLength = response.headers?.get?.("content-length");
  if (/^\d+$/.test(declaredLength ?? "") && Number(declaredLength) > MAX_RESEND_RESPONSE_BYTES) {
    throw new SafeDeliveryError("Resend returned an oversized response.");
  }
  if (!response.body) return "";
  if (typeof response.body.getReader !== "function") {
    throw new SafeDeliveryError("Resend returned an unreadable response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESEND_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new SafeDeliveryError("Resend returned an oversized response.");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

async function performResendRequest({ fetchImpl, apiKey, requestBody, idempotencyKey, signal }) {
  let response;
  try {
    response = await fetchImpl(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "User-Agent": "First-Fold-Personal-Email/1.0",
      },
      body: requestBody,
    });
  } catch {
    throw new SafeDeliveryError("Personal email delivery could not reach Resend.");
  }

  if (!response || !Number.isInteger(response.status)) {
    throw new SafeDeliveryError("Resend returned an invalid response.");
  }
  const responseBody = await readBoundedResponse(response);
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    throw new SafeDeliveryError("Resend attempted an unexpected redirect.");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new SafeDeliveryError(`Resend rejected personal email delivery with status ${response.status}.`);
  }

  let payload;
  try {
    payload = JSON.parse(responseBody);
  } catch {
    throw new SafeDeliveryError("Resend returned an invalid success response.");
  }
  if (!payload || typeof payload !== "object" || !RESPONSE_ID_PATTERN.test(payload.id ?? "")) {
    throw new SafeDeliveryError("Resend returned an invalid success response.");
  }
  return payload.id;
}

/**
 * Send exactly one request. Workflow-level reruns are made safe by the
 * deterministic per-edition Resend idempotency key; this function never retries.
 */
export async function sendPersonalEditionEmail(candidate, {
  apiKey = process.env.RESEND_API_KEY,
  recipient = process.env.PERSONAL_PAPER_EMAIL,
  feedbackLinks,
  feedbackBaseUrl = process.env.PERSONAL_FEEDBACK_BASE_URL,
  feedbackSigningKey = process.env.PERSONAL_FEEDBACK_SIGNING_KEY,
  feedbackNow,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_RESEND_TIMEOUT_MS,
} = {}) {
  assertPersonalEmailCandidate(candidate);
  const resolvedFeedbackLinks = optionalFeedbackLinks(candidate, {
    feedbackLinks,
    feedbackBaseUrl,
    feedbackSigningKey,
    feedbackNow,
  });
  const rendered = renderPersonalEditionEmail(candidate, {
    feedbackLinks: resolvedFeedbackLinks,
  });
  const normalizedKey = requireApiKey(apiKey);
  const normalizedRecipient = requireRecipient(recipient);
  const normalizedTimeout = requireTimeout(timeoutMs);
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for personal email delivery.");
  }

  const idempotencyKey = personalEditionIdempotencyKey(candidate.editionDate);
  const requestBody = JSON.stringify({
    from: PERSONAL_EMAIL_FROM,
    to: [normalizedRecipient],
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (Buffer.byteLength(requestBody, "utf8") > MAX_RESEND_REQUEST_BYTES) {
    throw new Error("Personal email request exceeds the safe delivery size limit.");
  }

  const controller = new AbortController();
  let timeoutHandle;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new DeliveryTimeoutError("Personal email delivery timed out."));
      controller.abort();
    }, normalizedTimeout);
  });

  try {
    const id = await Promise.race([
      performResendRequest({
        fetchImpl,
        apiKey: normalizedKey,
        requestBody,
        idempotencyKey,
        signal: controller.signal,
      }),
      timeout,
    ]);
    return {
      id,
      editionDate: candidate.editionDate,
      idempotencyKey,
      feedbackEnabled: resolvedFeedbackLinks !== null,
    };
  } catch (error) {
    if (error instanceof SafeDeliveryError) throw error;
    throw new Error("Personal email delivery failed safely.");
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function main() {
  const [candidatePath, ...extraArguments] = process.argv.slice(2);
  if (
    !candidatePath ||
    candidatePath === "--help" ||
    candidatePath === "-h" ||
    extraArguments.length > 0
  ) {
    throw new Error("Usage: node scripts/automation/personal-email.mjs CANDIDATE_FILE.json");
  }

  let candidate;
  try {
    const fileInfo = await stat(candidatePath);
    if (!fileInfo.isFile() || fileInfo.size > MAX_CANDIDATE_FILE_BYTES) {
      throw new Error("invalid candidate file");
    }
    candidate = JSON.parse(await readFile(candidatePath, "utf8"));
  } catch {
    throw new Error("Personal email candidate file is missing, invalid, or too large.");
  }

  const result = await sendPersonalEditionEmail(candidate);
  console.log(
    `Sent private First Fold edition ${result.editionDate}; feedback links ${result.feedbackEnabled ? "enabled" : "disabled"}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Personal email failed: ${error.message}`);
    process.exitCode = 1;
  });
}
