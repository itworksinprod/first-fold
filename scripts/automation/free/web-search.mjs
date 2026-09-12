import { isIP } from "node:net";

// Search results are discovery hints, never source evidence. Article ingestion
// must independently establish publisher identity, publication time and facts.
export const TAVILY_MAX_SEARCH_REQUESTS = 12;
export const TAVILY_MONTHLY_CREDIT_CAP = 900;
export const TAVILY_MAX_RESPONSE_BYTES = 96_000;
const SEARCH_URL = "https://api.tavily.com/search";
const USAGE_URL = "https://api.tavily.com/usage";
const REQUEST_TIMEOUT_MS = 10_000;
const CREDIT_COST = 2;
const DESKS = new Set(["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"]);
const DISCOVERY_QUERIES = Object.freeze([
  { desk: "ai", query: "artificial intelligence model release research capabilities benchmark announcement" },
  { desk: "ai", query: "AI model independent evaluation safety deployment major news" },
  { desk: "work-and-tools", query: "developer tools software productivity coding assistant release changes" },
  { desk: "work-and-tools", query: "workplace technology collaboration automation tools availability pricing changes" },
  { desk: "security-and-privacy", query: "cybersecurity actively exploited vulnerability security advisory patch" },
  { desk: "security-and-privacy", query: "data breach privacy investigation cybersecurity incident independent reporting" },
  { desk: "platforms-and-power", query: "technology platforms cloud infrastructure competition regulation major announcement" },
  { desk: "platforms-and-power", query: "semiconductor cloud computing technology policy antitrust independent reporting" },
].map(Object.freeze));

class SearchFailure extends Error {
  constructor(status) { super(status); this.status = status; }
}
const fail = (status) => { throw new SearchFailure(status); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonnegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;

function searchDateWindow(window) {
  if (!object(window)) fail("invalid_request");
  const start = Date.parse(window.startInclusive);
  const end = Date.parse(window.endExclusive);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 7 * 86_400_000) {
    fail("invalid_request");
  }
  // Tavily takes dates, not instants. Overfetch the last partial UTC date;
  // source-page publication times are filtered to the exact window downstream.
  return { start_date: new Date(start).toISOString().slice(0, 10),
    end_date: new Date(Math.ceil(end / 86_400_000) * 86_400_000).toISOString().slice(0, 10) };
}

function followups(value) {
  if (!Array.isArray(value)) fail("invalid_request");
  const seen = new Set();
  return value.slice(0, 4).flatMap((entry) => {
    if (!object(entry) || !DESKS.has(entry.desk) || typeof entry.query !== "string") return [];
    const query = entry.query.trim();
    if (query.length < 8 || query.length > 300 || /[\u0000-\u001f\u007f]/u.test(query)) return [];
    const key = `${entry.desk}:${query.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ desk: entry.desk, query }];
  });
}

function freeBudget(payload) {
  if (!object(payload?.key) || !object(payload?.account)) fail("usage_unverified");
  const { key, account } = payload;
  if (typeof account.current_plan !== "string" || account.current_plan.toLowerCase() !== "researcher" ||
      account.paygo_limit !== 0 || account.paygo_usage !== 0 ||
      !nonnegativeInteger(account.plan_limit) || account.plan_limit < 1 || account.plan_limit > 1_000) {
    fail("free_plan_required");
  }
  // Require a provider-enforced dedicated-key cap, not just an in-process
  // counter: concurrent jobs or manual reruns must not bypass the monthly cap.
  if (!nonnegativeInteger(key.limit) || key.limit < 1 || key.limit > TAVILY_MONTHLY_CREDIT_CAP) {
    fail("key_limit_required");
  }
  if (!nonnegativeInteger(key.usage) || !nonnegativeInteger(account.plan_usage)) fail("usage_unverified");
  return Math.max(0, Math.min(key.limit - key.usage, account.plan_limit - account.plan_usage));
}

function safeHint(result, desk) {
  if (!object(result) || typeof result.url !== "string" || result.url.length > 2_048 ||
      /[\s\\\u0000-\u001f\u007f]/u.test(result.url) || typeof result.title !== "string") return null;
  const title = result.title.trim();
  if (title.length < 5 || title.length > 350 || /[<>\u0000-\u001f\u007f]/u.test(title)) return null;
  let url;
  try { url = new URL(result.url); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(url.hostname) ||
      url.hostname.length > 253 || !url.hostname.includes(".") ||
      !url.hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/u.test(url.hostname)) return null;
  url.hash = "";
  const published = typeof result.published_date === "string" && result.published_date.length <= 90
    ? Date.parse(result.published_date) : NaN;
  return { url: url.href, title, desk,
    publishedAtHint: Number.isFinite(published) ? new Date(published).toISOString() : null };
}

async function readBoundedJson(response) {
  if (!response || response.redirected || response.status >= 300 && response.status < 400) fail("redirect_blocked");
  if (response.status === 401 || response.status === 403) fail("authentication_failed");
  if ([429, 432, 433].includes(response.status)) fail("quota_exhausted");
  if (response.status !== 200) fail("provider_unavailable");
  if (!/^application\/json\b/iu.test(response.headers?.get("content-type") || "")) fail("malformed_response");
  const length = response.headers?.get("content-length");
  if (length && (!/^\d+$/u.test(length) || Number(length) > TAVILY_MAX_RESPONSE_BYTES)) fail("response_too_large");
  if (typeof response.body?.getReader !== "function") fail("malformed_response");
  const reader = response.body.getReader();
  let total = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > TAVILY_MAX_RESPONSE_BYTES) fail("response_too_large");
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { fail("malformed_response"); }
  } finally {
    try { await reader.cancel(); } catch { /* No provider error text leaves this module. */ }
  }
}

/** One factory per edition. First invocation freezes the query/window slate;
 * retries and concurrent callers receive cached hints without spending again.
 * No key, unsafe billing state or provider trouble gracefully disables search.
 */
export function createTavilyDiscovery({ apiKey, fetchImpl = globalThis.fetch, onDiagnostic = () => {} } = {}) {
  let editionPromise;
  async function discover({ reportingWindow, followupQueries = [] } = {}) {
    const diagnostics = { status: "complete", usageChecks: 0, searchRequests: 0, creditsReserved: 0,
      results: 0, discardedResults: 0, maxSearchRequests: TAVILY_MAX_SEARCH_REQUESTS,
      monthlyCreditCap: TAVILY_MONTHLY_CREDIT_CAP };
    const results = [];
    const finish = () => {
      diagnostics.results = results.length;
      try { onDiagnostic({ stage: "web-search", ...diagnostics }); } catch { /* Diagnostics are optional. */ }
      return { results, diagnostics };
    };
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      diagnostics.status = "disabled";
      return finish();
    }
    if (!/^tvly-[A-Za-z0-9_-]{8,200}$/u.test(apiKey)) {
      diagnostics.status = "invalid_key";
      return finish();
    }
    async function request(url, body) {
      const controller = new AbortController();
      let timeout;
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new SearchFailure("provider_timeout"));
        }, REQUEST_TIMEOUT_MS);
      });
      try {
        return await Promise.race([(async () => {
          const serialized = body === undefined ? undefined : JSON.stringify(body);
          if (serialized && Buffer.byteLength(serialized) > 2_048) fail("invalid_request");
          const response = await fetchImpl(url, { method: body === undefined ? "GET" : "POST",
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json",
              ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
            body: serialized, redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal });
          try { return await readBoundedJson(response); }
          finally { try { await response?.body?.cancel(); } catch { /* Already consumed/locked. */ } }
        })(), deadline]);
      } finally { clearTimeout(timeout); }
    }
    try {
      const dates = searchDateWindow(reportingWindow);
      const queries = [...DISCOVERY_QUERIES, ...followups(followupQueries)];
      diagnostics.usageChecks++;
      let creditsAvailable = freeBudget(await request(USAGE_URL));
      const seen = new Set();
      for (const { query, desk } of queries.slice(0, TAVILY_MAX_SEARCH_REQUESTS)) {
        if (creditsAvailable < CREDIT_COST) fail("quota_exhausted");
        // Reserve before the single network attempt, including unknown outcomes.
        creditsAvailable -= CREDIT_COST;
        diagnostics.creditsReserved += CREDIT_COST;
        diagnostics.searchRequests++;
        const payload = await request(SEARCH_URL, { query, ...dates, topic: "news", search_depth: "advanced",
          auto_parameters: false, max_results: 5, chunks_per_source: 1, include_answer: false,
          include_raw_content: false, include_images: false, include_image_descriptions: false,
          include_favicon: false, include_usage: true, include_published_date: true,
          // Unknown index dates must not hide otherwise useful discovery
          // leads. Admission verifies the publisher's exact publication time;
          // neither a missing nor a present search date is factual evidence.
          filter_by_published_date: false });
        if (!object(payload) || !Array.isArray(payload.results) || payload.results.length > 5) fail("malformed_response");
        if (payload.usage?.credits !== CREDIT_COST) fail("usage_unverified");
        for (const result of payload.results) {
          const hint = safeHint(result, desk);
          if (!hint) { diagnostics.discardedResults++; continue; }
          if (seen.has(hint.url)) continue;
          seen.add(hint.url);
          results.push(hint);
        }
      }
    } catch (error) {
      diagnostics.status = error instanceof SearchFailure ? error.status : "provider_unavailable";
    }
    return finish();
  }
  return async (options) => {
    editionPromise ??= discover(options);
    // Callers may annotate/filter results; they must not mutate cached hints.
    return structuredClone(await editionPromise);
  };
}
