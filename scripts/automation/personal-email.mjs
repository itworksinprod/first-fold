#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateCanonicalEdition } from "../edition-content.mjs";

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
const PERSONAL_RESEARCH_MODEL = "@cf/openai/gpt-oss-120b";
const PERSONAL_RESEARCH_EVIDENCE_POLICY = "authoritative-or-corroborated";
const PERSONAL_RESEARCH_MAX_MODEL_REQUESTS = 2;
const PERSONAL_RESEARCH_LOOKBACK_HOURS = 72;
const PERSONAL_RESEARCH_MINIMUM_SCORE = 70;
const PERSONAL_RESEARCH_MINIMUM_AUTHORITATIVE_SCORE = 58;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RESEND_KEY_PATTERN = /^re_[A-Za-z0-9_-]{8,508}$/;
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const RESPONSE_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
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

function validationFailure() {
  return new Error("Personal email requires a complete, source-checked free-research candidate.");
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

function hasCompleteStorySources(candidate) {
  return DESKS.every(([desk]) => {
    const sources = candidate.desks?.[desk]?.story?.sources;
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
    return urls.size >= 2 && hasDirectSource;
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
    research.inference !== "workers-ai" ||
    typeof research.responseId !== "string" ||
    !RESPONSE_ID_PATTERN.test(research.responseId) ||
    research.responseId === "not-invoked" ||
    !/^[a-f0-9]{64}$/.test(research.feedSnapshotSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(research.requestSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(research.responseSha256 ?? "") ||
    !Number.isInteger(research.feedSourceCount) ||
    research.feedSourceCount < 1 ||
    !Number.isInteger(research.successfulFeedSourceCount) ||
    research.successfulFeedSourceCount < 1 ||
    research.successfulFeedSourceCount > research.feedSourceCount ||
    !Number.isInteger(research.candidateCount) ||
    research.candidateCount < DESKS.length ||
    research.evidencePolicy !== PERSONAL_RESEARCH_EVIDENCE_POLICY ||
    research.lookbackHours !== PERSONAL_RESEARCH_LOOKBACK_HOURS ||
    research.minimumScore !== PERSONAL_RESEARCH_MINIMUM_SCORE ||
    research.minimumAuthoritativeScore !== PERSONAL_RESEARCH_MINIMUM_AUTHORITATIVE_SCORE ||
    research.ephemeral !== true ||
    research.selectedStoryCount !== DESKS.length ||
    research.maxModelRequests !== PERSONAL_RESEARCH_MAX_MODEL_REQUESTS ||
    !sourceCheck ||
    typeof sourceCheck !== "object" ||
    sourceCheck.status !== "passed" ||
    !Number.isInteger(sourceCheck.checkedSourceCount) ||
    sourceCheck.checkedSourceCount < DESKS.length * 2 ||
    !Array.isArray(sourceCheck.issues) ||
    sourceCheck.issues.length !== 0 ||
    DESKS.some(([desk]) => candidate.desks?.[desk]?.story === null) ||
    !hasCompleteStorySources(candidate)
  ) {
    throw validationFailure();
  }
  return validation;
}

function renderStoryHtml(story) {
  const sources = story.sources.map((source) => {
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
    <p style="margin:0 0 8px;color:#171512;font:700 12px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.1px;text-transform:uppercase;">Sources</p>
    <ul style="margin:0;padding:0;">${sources}
    </ul>`;
}

function renderStoryText(story) {
  const sources = story.sources.map((source) => {
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
    "SOURCES",
    sources,
  ].join("\n");
}

function renderDeskHtml(candidate, deskKey, deskLabel) {
  const page = candidate.desks[deskKey];
  const content = page.story === null
    ? `
      <p style="margin:10px 0 7px;color:#171512;font:700 24px/1.1 Georgia,Times New Roman,serif;">Nothing cleared the bar today.</p>
      <p style="margin:0;color:#5b554c;font:15px/1.55 Georgia,Times New Roman,serif;">${escapeHtml(page.emptyReason)}</p>`
    : renderStoryHtml(page.story);
  return `
  <tr>
    <td style="padding:30px 34px;border-top:2px solid #24211d;">
      <p style="margin:0;color:#712b27;font:700 12px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.6px;text-transform:uppercase;">${deskLabel}${page.story === null ? " · Quiet desk" : ""}</p>${content}
    </td>
  </tr>`;
}

function renderDeskText(candidate, deskKey, deskLabel) {
  const page = candidate.desks[deskKey];
  return page.story === null
    ? `${deskLabel.toUpperCase()} — QUIET DESK\nNothing cleared the bar today.\n${compactText(page.emptyReason)}`
    : `${deskLabel.toUpperCase()}\n${renderStoryText(page.story)}`;
}

/**
 * Convert one validated free candidate into a static, email-client-safe paper.
 * Dynamic editorial and source strings are escaped before entering the HTML.
 */
export function renderPersonalEditionEmail(candidate) {
  assertPersonalEmailCandidate(candidate);
  const displayDate = formatEditionDate(candidate.editionDate);
  const subject = `First Fold — ${displayDate}`;
  const deskHtml = DESKS.map(([key, label]) => renderDeskHtml(candidate, key, label)).join("");
  const deskText = DESKS.map(([key, label]) => renderDeskText(candidate, key, label)).join("\n\n----------------------------------------\n\n");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#ded8cc;color:#171512;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(candidate.frontPage.note)}</div>
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
            <p style="margin:0 0 8px;color:#712b27;font:700 12px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.5px;text-transform:uppercase;">The morning brief</p>
            <p style="margin:0;color:#24211d;font:22px/1.35 Georgia,Times New Roman,serif;">${escapeHtml(candidate.frontPage.note)}</p>
            <p style="margin:14px 0 0;color:#6d665c;font:13px/1.4 Arial,Helvetica,sans-serif;">${escapeHtml(String(candidate.frontPage.estimatedMinutes))} minute read · Source checked before delivery</p>
          </td>
        </tr>${deskHtml}
        <tr>
          <td style="padding:24px 34px;border-top:3px double #24211d;text-align:center;">
            <p style="margin:0;color:#171512;font:700 18px/1.2 Georgia,Times New Roman,serif;">You’re caught up.</p>
            <p style="margin:8px 0 0;color:#6d665c;font:12px/1.5 Arial,Helvetica,sans-serif;">Your private, source-checked First Fold. No public edition was created.</p>
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
    "THE MORNING BRIEF",
    compactText(candidate.frontPage.note),
    `${candidate.frontPage.estimatedMinutes} minute read · Source checked before delivery`,
    "",
    "========================================",
    "",
    deskText,
    "",
    "========================================",
    "",
    "YOU’RE CAUGHT UP.",
    "Your private, source-checked First Fold. No public edition was created.",
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
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_RESEND_TIMEOUT_MS,
} = {}) {
  const rendered = renderPersonalEditionEmail(candidate);
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
    return { id, editionDate: candidate.editionDate, idempotencyKey };
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
  console.log(`Sent private First Fold edition ${result.editionDate}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Personal email failed: ${error.message}`);
    process.exitCode = 1;
  });
}
