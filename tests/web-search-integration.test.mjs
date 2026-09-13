import assert from "node:assert/strict";
import test from "node:test";
import { buildFreeFollowupQueries, collectFreeResearchSnapshot, createReviewedArticlePageFetcher, fetchReviewedArticlePage } from
  "../scripts/automation/free/feed-engine.mjs";
import { FREE_FEED_SOURCES } from "../scripts/automation/free/feed-sources.mjs";

const reportingWindow = { startInclusive: "2026-09-10T09:00:00.000Z", endExclusive: "2026-09-11T09:00:00.000Z" };
const retrievedAt = "2026-09-11T09:05:00.000Z";
const publishedAt = "2026-09-10T12:30:00.000Z";
const articleUrl = "https://openai.com/index/gpt-5-6-enterprise-launch/";
const articleTitle = "OpenAI launches GPT-5.6 AI model for enterprise developers";
const articleProse = "OpenAI released GPT-5.6 through the API for enterprise developers and customers. The launch changes model access and deployment options for administrators. Customers must review the migration documentation before replacing existing production workloads. The release includes new security controls and updated data retention settings for enterprise deployments.";
const html = (url = articleUrl) => `<html><head><meta property="og:title" content="${articleTitle}">
  <meta property="article:published_time" content="${publishedAt}"><link rel="canonical" href="${url}"></head>
  <body><article><h1>${articleTitle}</h1><p>${articleProse}</p></article></body></html>`;
const feedByUrl = new Map(FREE_FEED_SOURCES.map((source) => [source.url, source]));
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const feedBody = (source, active = false) => `<?xml version="1.0"?><rss><channel><item>
  <guid>integration-${source.id}</guid><title>${active ? articleTitle : "Archived publisher announcement"}</title>
  <link>${active ? articleUrl : `https://${source.itemHosts[0]}/integration-archived-${source.id}/`}</link>
  <pubDate>${active ? publishedAt : "2026-08-01T12:30:00Z"}</pubDate>
  <description>${active ? "Original originating feed account of the enterprise model release." : "An older item outside this edition's reporting window."}</description>
  </item></channel></rss>`;

function fixture({ activeFeed = false, onArticle, lookupImpl = publicLookup } = {}) {
  const requests = [];
  const requestImpl = async (url, options) => {
    requests.push({ url, options });
    const source = feedByUrl.get(url);
    if (source) return { status: 200, headers: { "content-type": "application/rss+xml" },
      body: feedBody(source, activeFeed && source.id === "openai-news") };
    if (onArticle) return onArticle(url, options);
    return { status: 200, headers: { "content-type": "text/html" }, body: html(url) };
  };
  return { requests, requestImpl, lookupImpl };
}

const discovery = (overrides = {}) => ({ results: [{ url: articleUrl,
  title: "Search provider title must never become evidence", content: "Search snippet says fictional acquisition and CVE-9999-9999",
  publishedAtHint: "2099-01-01", desk: "ai" }],
  diagnostics: { searchRequests: 8, creditsReserved: 16 }, ...overrides });
const collect = (network, overrides = {}) => collectFreeResearchSnapshot({ reportingWindow, retrievedAt,
  evidencePolicy: "authoritative-or-corroborated", enrichArticles: true,
  requestImpl: network.requestImpl, lookupImpl: network.lookupImpl,
  discoverWebArticles: async () => discovery(), ...overrides });

test("follow-up queries prioritize missing evidence without rescuing vetoed content", () => {
  const entry = (title, desk, score, evidenceTier, reasons = [], decision = "accepted") => ({
    candidate: { title, suggestedDesk: desk, canonicalEventKey: title, ranking: { score, evidenceTier } },
    rejectionReasons: reasons.map((code) => ({ code })), decision,
  });
  const queries = buildFreeFollowupQueries([
    entry("Already corroborated model release", "ai", 95, "corroborated"),
    entry("Official model release needing another account", "ai", 78, "authoritative-single"),
    entry("Buy this promotional deal", "ai", 99, "authoritative-single", ["PROMOTIONAL_OR_DEAL_CONTENT"], "rejected"),
    entry("New workspace controls", "work-and-tools", 68, "authoritative-single", ["BELOW_EDITORIAL_THRESHOLD"], "rejected"),
    entry("Confirmed platform change", "platforms-and-power", 88, "corroborated"),
  ]);
  assert.equal(queries.length, 3);
  assert.equal(queries[0].priority, "corroboration");
  assert.match(queries[0].query, /^Official model release/);
  assert.equal(queries[1].priority, "desk-gap");
  assert.equal(queries[2].priority, "context");
  assert.doesNotMatch(JSON.stringify(queries), /promotional deal/);
});

test("wired discovery reads reviewed articles, retains factual provenance, and does not inflate feed coverage", async () => {
  const network = fixture();
  const snapshot = await collect(network);
  assert.equal(snapshot.diagnostics.sourceResults.length, FREE_FEED_SOURCES.length);
  assert.ok(snapshot.diagnostics.sourceResults.every((entry) => entry.status === "ok"));
  assert.equal(snapshot.diagnostics.eligibleItemCount, 0, "Web articles must not masquerade as eligible feed entries");
  assert.deepEqual(snapshot.diagnostics.webSearch,
    { provider: "tavily", queriesUsed: 8, creditsReserved: 16, admittedArticles: 1 });
  assert.equal(snapshot.sourceTextTrust, "untrusted");
  const candidate = snapshot.candidates.find((entry) => entry.sources.some((source) => source.url === articleUrl));
  assert.ok(candidate, "The publisher article must reach the normal candidate scorecard");
  const factual = candidate.sources.filter((source) => source.relationship !== "context");
  assert.equal(factual.length, 1);
  assert.equal(factual[0].publisher, "OpenAI");
  assert.equal(factual[0].title, articleTitle);
  assert.equal(factual[0].publishedAt, publishedAt);
  const context = candidate.sources.filter((source) => source.relationship === "context");
  assert.equal(context.length, 1);
  assert.equal(context[0].url, "https://openai.com/");
  assert.equal(context[0].title, "OpenAI website");
  assert.equal(context[0].publishedAt, null);
  assert.match(candidate.feedEvidence[0].articleExcerpt, /migration documentation/);
  assert.doesNotMatch(JSON.stringify(candidate), /Search provider title|fictional acquisition|CVE-9999-9999|2099-01-01|feed index/);
  const articleRequests = network.requests.filter((entry) => !feedByUrl.has(entry.url));
  assert.equal(articleRequests.length, 1, "Search extraction and subsequent enrichment share the page");
  assert.deepEqual(articleRequests[0].options.addresses, ["93.184.216.34"]);
});

test("a URL already present in a feed retains its timestamp and one factual vote", async () => {
  const network = fixture({ activeFeed: true });
  const snapshot = await collect(network);
  const candidate = snapshot.candidates.find((entry) => entry.sources.some((source) => source.url === articleUrl));
  assert.ok(candidate);
  assert.equal(candidate.sources.filter((source) => source.relationship !== "context").length, 1);
  assert.equal(candidate.sources.find((source) => source.url === articleUrl).publishedAt, publishedAt);
  assert.equal(candidate.sources.find((source) => source.relationship === "context").url, "https://openai.com/news/rss.xml");
  assert.equal(candidate.feedEvidence.filter((entry) => entry.title === articleTitle).length, 1);
  assert.equal(network.requests.filter((entry) => entry.url === articleUrl).length, 1);
});

test("zero-query or invalid-credit receipts cannot admit provider results", async () => {
  for (const diagnostics of [{ searchRequests: 0, creditsReserved: 0 }, { searchRequests: 8, creditsReserved: 0 },
    { searchRequests: 13, creditsReserved: 26 }]) {
    const network = fixture();
    const snapshot = await collect(network, { discoverWebArticles: async () => discovery({ diagnostics }) });
    assert.equal(snapshot.diagnostics.webSearch, undefined);
    assert.equal(snapshot.candidates.length, 0);
    assert.equal(network.requests.filter((entry) => !feedByUrl.has(entry.url)).length, 0,
      "Invalid or unused discovery must be rejected before article fetches");
  }
});

test("a search outage preserves feed coverage and cannot invent a search receipt", async () => {
  const network = fixture({ activeFeed: true });
  const notices = [];
  const snapshot = await collect(network, { discoverWebArticles: async () => { throw new Error("sensitive-key-value"); },
    onSearchDiagnostic: (event) => notices.push(event) });
  assert.equal(snapshot.diagnostics.webSearch, undefined);
  assert.equal(snapshot.diagnostics.sourceResults.length, FREE_FEED_SOURCES.length);
  assert.ok(snapshot.candidates.some((entry) => entry.sources.some((source) => source.url === articleUrl)));
  assert.doesNotMatch(JSON.stringify(notices), /sensitive-key-value/);
});

test("search results without trustworthy article dates remain leads, not candidates", async () => {
  const network = fixture({ onArticle: async (url) => ({ status: 200, headers: { "content-type": "text/html" },
    body: html(url).replace(`<meta property="article:published_time" content="${publishedAt}">`, "") }) });
  const snapshot = await collect(network);
  assert.equal(snapshot.candidates.length, 0);
  assert.deepEqual(snapshot.diagnostics.webSearch,
    { provider: "tavily", queriesUsed: 8, creditsReserved: 16, admittedArticles: 0 });
  assert.ok(snapshot.diagnostics.sourceResults.every((entry) => entry.status === "ok"));
});

test("the reviewed article cache shares in-flight duplicates, failures and its twenty-four fetch budget", async () => {
  let requests = 0;
  const fetchPage = createReviewedArticlePageFetcher({ lookupImpl: publicLookup, requestImpl: async (url) => {
    requests++;
    if (url.endsWith("/fail/")) throw new Error("upstream failure body should not leak");
    return { status: 200, headers: { "content-type": "text/html" }, body: html(url) };
  } });
  const first = { url: "https://openai.com/cache/first/", publisherKey: "openai" };
  const results = await Promise.all([fetchPage(first), fetchPage({ ...first, url: `${first.url}?utm_source=search#article` })]);
  assert.equal(results[0], results[1]);
  assert.equal(requests, 1);
  const failed = { url: "https://openai.com/cache/fail/", publisherKey: "openai" };
  await assert.rejects(fetchPage(failed));
  await assert.rejects(fetchPage(failed));
  assert.equal(requests, 2, "A failed URL still consumes one slot and is not retried");
  for (let index = 0; index < 22; index++) await fetchPage({ url: `https://openai.com/cache/${index}/`, publisherKey: "openai" });
  assert.equal(requests, 24);
  await assert.rejects(fetchPage({ url: "https://openai.com/cache/overflow/", publisherKey: "openai" }), /budget/);
  assert.equal(requests, 24);
  assert.equal(await fetchPage(first), results[0], "Cached pages remain usable after the budget is exhausted");
});

test("a shared edition cache limits combined search and later feed enrichment requests", async () => {
  const network = fixture();
  const shared = createReviewedArticlePageFetcher({ requestImpl: network.requestImpl, lookupImpl: network.lookupImpl });
  const desks = ["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"];
  const hosts = ["openai.com", "blog.google", "www.microsoft.com", "huggingface.co"];
  const urls = desks.flatMap((desk, deskIndex) => Array.from({ length: 8 }, (_, index) => ({
    url: `https://${hosts[index % hosts.length]}/integration-${deskIndex}-${index}/`, desk,
  })));
  await collect(network, { articlePageFetcher: shared, discoverWebArticles: async () => discovery({ results: urls }) });
  assert.equal(network.requests.filter((entry) => !feedByUrl.has(entry.url)).length, 16);
  for (let deskIndex = 0; deskIndex < desks.length; deskIndex++) {
    assert.equal(network.requests.filter((entry) => new URL(entry.url).pathname.startsWith(`/integration-${deskIndex}-`)).length, 4,
      "The smaller search budget still gives each desk four page opportunities");
  }
  for (let index = 0; index < 8; index++) {
    await shared({ url: `https://openai.com/enrichment-${index}/`, publisherKey: "openai" });
  }
  await assert.rejects(shared({ url: "https://openai.com/enrichment-overflow/", publisherKey: "openai" }), /budget/);
  assert.equal(network.requests.filter((entry) => !feedByUrl.has(entry.url)).length, 24);
  await collect(network, { articlePageFetcher: shared, discoverWebArticles: async () => discovery({ results: urls }) });
  assert.equal(network.requests.filter((entry) => !feedByUrl.has(entry.url)).length, 24,
    "The second research pass reuses the same already-fetched pages");
});

test("reviewed page transport pins public DNS and rejects private addresses and wrong owners", async () => {
  let requests = 0;
  const options = { lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }],
    requestImpl: async () => { requests++; return { status: 200, headers: { "content-type": "text/html" }, body: html() }; } };
  await assert.rejects(fetchReviewedArticlePage({ url: articleUrl, publisherKey: "openai" }, options));
  await assert.rejects(fetchReviewedArticlePage({ url: articleUrl, publisherKey: "google" }, options));
  assert.equal(requests, 0);
});
