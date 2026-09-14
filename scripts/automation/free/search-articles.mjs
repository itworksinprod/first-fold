import { createHash } from "node:crypto";
import { extractArticleEvidence, articleScoringSummary } from "./article-evidence.mjs";
import { reviewedSearchPublisher } from "./publisher-registry.mjs";

export const MAX_SEARCH_ARTICLE_FETCHES = 24;
export const MAX_SEARCH_ARTICLE_CONCURRENCY = 2;
const DESKS = ["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"];
const ARTICLE_TYPES = new Set(["Article", "NewsArticle", "BlogPosting", "TechArticle", "ScholarlyArticle", "Report"]);

function fairFetchLeads(leads, reject, maxFetches) {
  const queues = new Map(DESKS.map((desk) => [desk, { pending: [], owners: new Map(), selected: 0 }]));
  for (const lead of leads) {
    // A query's desk can distribute FETCH capacity only. It is intentionally
    // never emitted into the item or copied into source classification priors.
    const desk = DESKS.includes(lead.budgetDesk) ? lead.budgetDesk : DESKS
      .filter((desk) => lead.source.coverageDesks.includes(desk))
      .sort((a, b) => (lead.source.deskPriors[b] ?? 0) - (lead.source.deskPriors[a] ?? 0))[0];
    queues.get(desk).pending.push(lead);
  }
  const selected = [];
  const fill = (maxPerDesk) => {
    let added = true;
    while (added && selected.length < maxFetches) {
      added = false;
      for (const desk of DESKS) {
        const queue = queues.get(desk);
        if (queue.selected >= maxPerDesk || selected.length >= maxFetches) continue;
        while (queue.pending.length) {
          const lead = queue.pending.shift();
          if ((queue.owners.get(lead.source.publisherKey) ?? 0) >= 2) { reject("PUBLISHER_FETCH_CAP"); continue; }
          selected.push(lead);
          queue.selected++;
          queue.owners.set(lead.source.publisherKey, (queue.owners.get(lead.source.publisherKey) ?? 0) + 1);
          added = true;
          break;
        }
      }
    }
  };
  // Reserve equal opportunities per desk before redistributing genuinely unused
  // slots. Publisher diversity stays capped during redistribution as well.
  fill(Math.max(1, Math.floor(maxFetches / DESKS.length)));
  fill(maxFetches);
  for (const queue of queues.values()) for (const ignored of queue.pending) reject("ARTICLE_BUDGET_EXHAUSTED");
  return selected;
}

function plain(value) {
  return String(value ?? "").replace(/<[^<>]*>/g, " ")
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code) => {
      const n = /^x/i.test(code) ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : " ";
    }).replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|rsquo|lsquo);/gi, (_, name) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘" })[name.toLowerCase()])
    .replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
}

// Date.parse alone accepts date-only values and silently rolls invalid dates
// into another day. Neither is adequate evidence of an article's freshness.
function instant(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , zone] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(year) < 2000 || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (zone !== "Z" && (Number(zone.slice(1, 3)) > 14 || Number(zone.slice(4)) > 59 ||
      (Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4)) !== 0))) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function attributes(markup) {
  const output = Object.create(null);
  for (const match of markup.matchAll(/(?:^|\s)([a-z_:][-a-z0-9_:.]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s"'=<>`]+))/gi)) {
    const key = match[1].toLowerCase();
    // Ambiguous duplicate attributes do not become metadata.
    if (Object.hasOwn(output, key)) return null;
    output[key] = plain(match[2] ?? match[3] ?? match[4]);
  }
  return output;
}

function publisherMetadata(html, pageUrl) {
  const dates = [];
  const titles = [];
  const identities = [];
  // Remove opaque non-JSON scripts before looking for actual metadata tags.
  // A tag inside JavaScript or an HTML comment is not publication metadata.
  const uncommented = html.replace(/<!--[\s\S]*?-->/g, " ");
  const metaHtml = uncommented.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  for (const match of metaHtml.matchAll(/<meta\b([^<>]*)>/gi)) {
    const attrs = attributes(match[1]);
    if (!attrs) continue;
    const property = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (property === "article:published_time") dates.push(attrs.content ?? "");
    if (property === "og:title" && attrs.content) titles.push(attrs.content);
    if (property === "og:url") identities.push(attrs.content ?? "");
  }
  for (const match of metaHtml.matchAll(/<link\b([^<>]*)>/gi)) {
    const attrs = attributes(match[1]);
    if (attrs?.rel?.toLowerCase().split(/\s+/).includes("canonical")) identities.push(attrs.href ?? "");
  }
  let nodes = 0;
  const visit = (value, depth = 0) => {
    if (++nodes > 256 || depth > 8 || value === null || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const item of value.slice(0, 64)) visit(item, depth + 1); return; }
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.some((type) => typeof type === "string" && ARTICLE_TYPES.has(type.replace(/^https?:\/\/schema.org\//, "")))) {
      if (Object.hasOwn(value, "datePublished")) dates.push(value.datePublished);
      if (typeof value.url === "string") identities.push(value.url);
      if (typeof value.mainEntityOfPage === "string") identities.push(value.mainEntityOfPage);
      if (value.mainEntityOfPage && typeof value.mainEntityOfPage === "object" && typeof value.mainEntityOfPage["@id"] === "string") {
        identities.push(value.mainEntityOfPage["@id"]);
      }
      if (typeof value["@id"] === "string" && /^(?:https?:\/\/|\/|#)/i.test(value["@id"])) identities.push(value["@id"]);
    }
    // Follow only schema containers, not related-item or arbitrary data trees.
    if (value["@graph"]) visit(value["@graph"], depth + 1);
    if (value.mainEntity) visit(value.mainEntity, depth + 1);
  };
  for (const match of uncommented.matchAll(/<script\b([^<>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = attributes(match[1]);
    if (attrs?.type?.toLowerCase() !== "application/ld+json" || match[2].length > 100_000) continue;
    try { visit(JSON.parse(match[2])); } catch { /* Invalid metadata is not evidence. */ }
  }
  // Never borrow an article date from a different canonical page, related
  // article or publisher merely because its JSON-LD was embedded in this HTML.
  for (const identity of identities) {
    let resolved;
    try {
      if (!identity || /[\p{Cc}\p{Cf}]/u.test(identity)) return { code: "ARTICLE_IDENTITY_CONFLICT" };
      resolved = reviewedSearchPublisher(new URL(identity, pageUrl).href);
    } catch { return { code: "ARTICLE_IDENTITY_CONFLICT" }; }
    if (resolved?.url !== pageUrl) return { code: "ARTICLE_IDENTITY_CONFLICT" };
  }
  if (!dates.length) return { code: "PUBLICATION_DATE_MISSING" };
  const normalizedDates = dates.map(instant);
  if (normalizedDates.some((value) => !value)) return { code: "PUBLICATION_DATE_INVALID" };
  if (new Set(normalizedDates).size !== 1) return { code: "PUBLICATION_DATE_CONFLICT" };
  const region = metaHtml.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i)?.[1] ??
    metaHtml.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1] ?? "";
  const title = plain(titles[0] ?? region.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1]);
  if (!title || title.length > 240 || new Set(titles).size > 1) return { code: "ARTICLE_TITLE_INVALID" };
  return { title, publishedAt: normalizedDates[0] };
}

/** Admit search leads only after fetching a reviewed publisher's own article.
 * fetchArticlePage must enforce the existing pinned-public-DNS HTTPS transport.
 * Search snippets, search titles, search dates and search desk labels are never
 * copied into evidence, dates, publisher ownership or classification priors.
 */
export async function admitSearchArticles({ results, reportingWindow, retrievedAt, fetchArticlePage,
  maxFetches = MAX_SEARCH_ARTICLE_FETCHES }) {
  const start = instant(reportingWindow?.startInclusive);
  const end = instant(reportingWindow?.endExclusive);
  const retrieved = instant(retrievedAt);
  if (!start || !end || Date.parse(start) >= Date.parse(end) || !retrieved) throw new Error("Search article admission needs a valid reporting window and retrieval time.");
  if (!Array.isArray(results) || typeof fetchArticlePage !== "function") throw new Error("Search article admission needs results and a reviewed article fetcher.");
  if (!Number.isInteger(maxFetches) || maxFetches < 1 || maxFetches > MAX_SEARCH_ARTICLE_FETCHES) throw new Error("Invalid search article budget.");
  const diagnostics = { considered: Math.min(results.length, 120), fetched: 0, admitted: 0, rejected: {} };
  const reject = (code) => { diagnostics.rejected[code] = (diagnostics.rejected[code] ?? 0) + 1; };
  const seenLeads = new Set();
  const uniqueLeads = [];
  for (const result of results.slice(0, 120)) {
    const resolved = reviewedSearchPublisher(result?.url);
    if (!resolved) { reject("UNREVIEWED_OR_UNSAFE_URL"); continue; }
    if (seenLeads.has(resolved.url)) { reject("DUPLICATE_URL"); continue; }
    seenLeads.add(resolved.url);
    uniqueLeads.push({ ...resolved, budgetDesk: result?.desk });
  }
  const leads = fairFetchLeads(uniqueLeads, reject, maxFetches);
  const admitted = new Array(leads.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: MAX_SEARCH_ARTICLE_CONCURRENCY }, async () => {
    while (cursor < leads.length) {
      const position = cursor++;
      const lead = leads[position];
      diagnostics.fetched++;
      try {
        const page = await fetchArticlePage({ url: lead.url, publisherKey: lead.source.publisherKey });
        const final = reviewedSearchPublisher(page?.finalUrl, lead.source.publisherKey);
        if (!final) { reject("PUBLISHER_OWNERSHIP_MISMATCH"); continue; }
        const html = page?.body;
        if (typeof html !== "string" || Buffer.byteLength(html) > 600_000 ||
            (html.match(/</g) ?? []).length > 12_000 ||
            (html.match(/<(?:script|style|article|main|meta)\b/gi) ?? []).length > 300) {
          reject("ARTICLE_SIZE_OR_COMPLEXITY"); continue;
        }
        const metadata = publisherMetadata(html, final.url);
        if (metadata.code) { reject(metadata.code); continue; }
        if (Date.parse(metadata.publishedAt) < Date.parse(start) || Date.parse(metadata.publishedAt) >= Date.parse(end) ||
            Date.parse(metadata.publishedAt) > Date.parse(retrieved)) { reject("OUTSIDE_REPORTING_WINDOW"); continue; }
        const excerpt = extractArticleEvidence(html);
        if (!excerpt) { reject("ARTICLE_EVIDENCE_MISSING"); continue; }
        const source = final.source;
        admitted[position] = {
          itemId: `search-${source.id}-${createHash("sha256").update(final.url).digest("hex").slice(0, 16)}`,
          sourceId: source.id, publisher: source.publisher, publisherKey: source.publisherKey,
          relationship: source.relationship, primaryEntity: source.primaryEntity ?? null,
          title: metadata.title, summary: articleScoringSummary(excerpt, metadata.title) || metadata.title, articleExcerpt: excerpt,
          url: final.url, discoveryUrl: final.url, discoveryKind: "web-search",
          // Publisher homepage is explicitly context only, never a fabricated
          // feed item or a second factual source for corroboration.
          contextUrl: `${new URL(final.url).origin}/`, contextTitle: `${source.publisher} website`,
          publishedAt: metadata.publishedAt, updatedAt: null, retrievedAt: retrieved,
          categories: [], deskPriors: Object.fromEntries(DESKS.map((desk) => [desk, Number(source.deskPriors?.[desk] ?? 0)])),
          feedPosition: position,
        };
      } catch { reject("ARTICLE_FETCH_FAILED"); }
    }
  }));
  const seenFinalUrls = new Set();
  const items = admitted.filter(Boolean).filter((item) => {
    if (seenFinalUrls.has(item.url)) { reject("DUPLICATE_FINAL_URL"); return false; }
    seenFinalUrls.add(item.url); return true;
  });
  diagnostics.admitted = items.length;
  return { items, diagnostics };
}
