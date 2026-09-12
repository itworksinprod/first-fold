import assert from "node:assert/strict";
import test from "node:test";
import { createTavilyDiscovery, TAVILY_MAX_RESPONSE_BYTES } from "../scripts/automation/free/web-search.mjs";

const apiKey = "tvly-dev-fixture-secret";
const reportingWindow = { startInclusive: "2026-09-10T09:05:00Z", endExclusive: "2026-09-11T09:05:00Z" };
const usage = () => ({ key: { usage: 0, limit: 900 }, account: { current_plan: "Researcher",
  plan_usage: 0, plan_limit: 1_000, paygo_usage: 0, paygo_limit: 0 } });
const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { "Content-Type": "application/json" } });
const result = (suffix = "1") => ({ title: "A concrete independently reported technology development",
  url: `https://publisher.com/news/${suffix}`, published_date: "Fri, 11 Sep 2026 07:00:00 GMT",
  content: "UNTRUSTED SEARCH SNIPPET NOT EVIDENCE", raw_content: "NEVER USE THIS", score: 1 });
const searches = (results = [result()]) => ({ results, usage: { credits: 2 } });

test("eight fixed advanced searches use verified free billing and return only discovery hints", async () => {
  const calls = [], events = [];
  const discovery = createTavilyDiscovery({ apiKey, onDiagnostic: (event) => events.push(event),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return json(url.endsWith("/usage") ? usage() : searches([result(String(calls.length))]));
    } });
  const output = await discovery({ reportingWindow });
  assert.equal(calls.length, 9);
  assert.equal(calls[0].url, "https://api.tavily.com/usage");
  assert.equal(calls[0].options.method, "GET");
  const deskCounts = new Map();
  for (const { url, options } of calls.slice(1)) {
    assert.equal(url, "https://api.tavily.com/search");
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.equal(options.headers.Authorization, `Bearer ${apiKey}`);
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.search_depth, "advanced");
    assert.equal(body.auto_parameters, false);
    assert.equal(body.topic, "news");
    assert.equal(body.max_results, 5);
    assert.equal(body.chunks_per_source, 1);
    assert.equal(body.start_date, "2026-09-10");
    assert.equal(body.end_date, "2026-09-12");
    assert.equal(body.include_usage, true);
    assert.equal(body.include_answer, false);
    assert.equal(body.include_raw_content, false);
    assert.equal(body.include_images, false);
    assert.equal(body.filter_by_published_date, false);
    assert.equal(body.api_key, undefined);
  }
  for (const hint of output.results) {
    deskCounts.set(hint.desk, (deskCounts.get(hint.desk) || 0) + 1);
    assert.deepEqual(Object.keys(hint).sort(), ["desk", "publishedAtHint", "title", "url"]);
    assert.equal(hint.publishedAtHint, "2026-09-11T07:00:00.000Z");
  }
  assert.deepEqual([...deskCounts.values()], [2, 2, 2, 2]);
  assert.equal(output.diagnostics.status, "complete");
  assert.equal(output.diagnostics.creditsReserved, 16);
  assert.equal(events.length, 1);
  assert.doesNotMatch(JSON.stringify(events), /fixture-secret|publisher|SNIPPET|concrete/);
});

test("edition retries, concurrent calls and changed windows cannot spend beyond the first twelve-query slate", async () => {
  let calls = 0;
  const discovery = createTavilyDiscovery({ apiKey, fetchImpl: async (url) => {
    calls++; return json(url.endsWith("/usage") ? usage() : searches([result(String(calls))]));
  } });
  const followupQueries = Array.from({ length: 9 }, (_, index) => ({ query: `Official details item ${index}`, desk: "ai" }));
  const [one, two] = await Promise.all([discovery({ reportingWindow, followupQueries }), discovery({ reportingWindow })]);
  assert.equal(calls, 13);
  assert.equal(one.diagnostics.searchRequests, 12);
  assert.equal(one.diagnostics.creditsReserved, 24);
  assert.deepEqual(one, two);
  one.results[0].title = "Mutated by caller";
  const next = await discovery({ reportingWindow: { ...reportingWindow, startInclusive: "2026-09-09T09:05:00Z" }, followupQueries });
  assert.notEqual(next.results[0].title, "Mutated by caller");
  assert.equal(calls, 13);
});

test("unknown search-index dates remain hints for independent publisher-date admission", async () => {
  const discovery = createTavilyDiscovery({ apiKey, fetchImpl: async (url, options) => {
    if (url.endsWith("/usage")) return json(usage());
    const request = JSON.parse(options.body);
    assert.equal(request.include_published_date, true);
    assert.equal(request.filter_by_published_date, false);
    assert.equal(request.start_date, "2026-09-10");
    assert.equal(request.end_date, "2026-09-12");
    return json(searches([{ ...result(), published_date: null }]));
  } });
  const output = await discovery({ reportingWindow });
  assert.equal(output.results.length, 1);
  assert.equal(output.results[0].publishedAtHint, null);
  assert.equal(Object.hasOwn(output.results[0], "publishedAt"), false);
});

test("missing or malformed keys disable discovery without network or secret exposure", async () => {
  for (const key of [undefined, "", "invalid\ncredential"]) {
    let calls = 0;
    const output = await createTavilyDiscovery({ apiKey: key, fetchImpl: async () => { calls++; } })({ reportingWindow });
    assert.equal(calls, 0);
    assert.ok(["disabled", "invalid_key"].includes(output.diagnostics.status));
    assert.deepEqual(output.results, []);
  }
});

test("unknown billing, paid plans, PAYGO and absent key cap all fail closed before any search", async () => {
  const cases = [
    [{}, "usage_unverified"],
    [{ ...usage(), account: { ...usage().account, current_plan: "Project" } }, "free_plan_required"],
    [{ ...usage(), account: { ...usage().account, paygo_limit: 100 } }, "free_plan_required"],
    [{ ...usage(), account: { ...usage().account, paygo_usage: 1 } }, "free_plan_required"],
    [{ ...usage(), key: { usage: 0, limit: null } }, "key_limit_required"],
    [{ ...usage(), key: { usage: 0, limit: 1_000 } }, "key_limit_required"],
    [{ ...usage(), key: { usage: "0", limit: 900 } }, "usage_unverified"],
  ];
  for (const [payload, status] of cases) {
    let calls = 0;
    const output = await createTavilyDiscovery({ apiKey, fetchImpl: async () => { calls++; return json(payload); } })({ reportingWindow });
    assert.equal(calls, 1);
    assert.equal(output.diagnostics.status, status);
  }
});

test("monthly remaining credits are reserved across requests and provider errors stop all retries", async () => {
  let calls = 0;
  const discovery = createTavilyDiscovery({ apiKey, fetchImpl: async (url) => {
    calls++;
    return json(url.endsWith("/usage") ? { ...usage(), key: { usage: 897, limit: 900 } } : searches());
  } });
  assert.equal((await discovery({ reportingWindow })).diagnostics.status, "quota_exhausted");
  assert.equal(calls, 2);
  await discovery({ reportingWindow });
  assert.equal(calls, 2);
  for (const [status, reason] of [[401, "authentication_failed"], [403, "authentication_failed"],
    [429, "quota_exhausted"], [432, "quota_exhausted"], [433, "quota_exhausted"], [500, "provider_unavailable"]]) {
    let requests = 0;
    const output = await createTavilyDiscovery({ apiKey, fetchImpl: async (url) => {
      requests++;
      return url.endsWith("/usage") ? json(usage()) : json({ error: `secret ${apiKey}` }, status);
    } })({ reportingWindow });
    assert.equal(requests, 2);
    assert.equal(output.diagnostics.status, reason);
    assert.doesNotMatch(JSON.stringify(output), /secret|tvly/);
  }
});

test("redirects, oversized streamed output, invalid JSON and unknown charge data stop search safely", async () => {
  const bodies = [
    [() => new Response(null, { status: 302, headers: { location: "https://evil.com" } }), "redirect_blocked"],
    [() => new Response("x", { headers: { "Content-Type": "application/json", "Content-Length": String(TAVILY_MAX_RESPONSE_BYTES + 1) } }), "response_too_large"],
    [() => new Response("x".repeat(TAVILY_MAX_RESPONSE_BYTES + 1), { headers: { "Content-Type": "application/json" } }), "response_too_large"],
    [() => new Response("not json", { headers: { "Content-Type": "application/json" } }), "malformed_response"],
    [() => json({ results: [] }), "usage_unverified"],
    [() => json(searches(Array.from({ length: 6 }, () => result()))), "malformed_response"],
    [() => json({ results: "unexpected", usage: { credits: 2 } }), "malformed_response"],
  ];
  for (const [response, reason] of bodies) {
    let calls = 0;
    const output = await createTavilyDiscovery({ apiKey, fetchImpl: async (url) => {
      calls++; return url.endsWith("/usage") ? json(usage()) : response();
    } })({ reportingWindow });
    assert.equal(calls, 2);
    assert.equal(output.diagnostics.status, reason);
  }
});

test("malformed URLs and titles never leave the discovery boundary; snippets and duplicate hints are dropped", async () => {
  const unsafe = ["http://publisher.com/news", "https://localhost/news", "https://127.0.0.1/news",
    "https://[::1]/news", "https://user:pass@publisher.com/news", "https://publisher.com:444/news",
    "https://private.internal/news", "https://publisher.com/space here", "file:///etc/passwd", "https://publisher.com\\@evil.com/news"];
  for (const url of unsafe) {
    const output = await createTavilyDiscovery({ apiKey, fetchImpl: async (endpoint) =>
      json(endpoint.endsWith("/usage") ? usage() : searches([{ ...result(), url }])) })({ reportingWindow });
    assert.deepEqual(output.results, []);
    assert.equal(output.diagnostics.discardedResults, 8);
  }
  const output = await createTavilyDiscovery({ apiKey, fetchImpl: async (endpoint) => json(endpoint.endsWith("/usage") ? usage() : searches([
    result(), result(), { ...result("2"), title: "<script>Untrusted</script>" },
    { ...result("3"), published_date: "garbage" }, null,
  ])) })({ reportingWindow });
  assert.equal(output.results.length, 2);
  assert.equal(output.results[1].publishedAtHint, null);
  assert.doesNotMatch(JSON.stringify(output), /SNIPPET|raw_content|score|script/);
});

test("invalid reporting windows never issue requests; unsafe followups cannot alter fixed parameters", async () => {
  for (const window of [undefined, { startInclusive: "x", endExclusive: "y" },
    { startInclusive: "2026-01-01", endExclusive: "2026-09-01" }]) {
    let calls = 0;
    const output = await createTavilyDiscovery({ apiKey, fetchImpl: async () => { calls++; } })({ reportingWindow: window });
    assert.equal(calls, 0);
    assert.equal(output.diagnostics.status, "invalid_request");
  }
  let calls = 0;
  await createTavilyDiscovery({ apiKey, fetchImpl: async (endpoint) => {
    calls++; return json(endpoint.endsWith("/usage") ? usage() : searches());
  } })({ reportingWindow, followupQueries: [{ query: "bad\nquery", desk: "ai" },
    { query: "x".repeat(301), desk: "ai" }, { query: "valid text", desk: "attacker" }] });
  assert.equal(calls, 9);
});

test("a hanging provider is aborted at the fixed deadline and no caller retries it", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0, signal;
  const discovery = createTavilyDiscovery({ apiKey, fetchImpl: async (_endpoint, options) => {
    calls++; signal = options.signal;
    return new Promise(() => {});
  } });
  const pending = discovery({ reportingWindow });
  context.mock.timers.tick(10_000);
  const output = await pending;
  assert.equal(output.diagnostics.status, "provider_timeout");
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
  assert.deepEqual(await discovery({ reportingWindow }), output);
  assert.equal(calls, 1);
});

test("an unavailable usage endpoint and lying redirected response cannot start a search", async () => {
  for (const fetchImpl of [
    async () => { throw new Error(`sensitive ${apiKey}`); },
    async () => {
      const response = json(usage());
      Object.defineProperty(response, "redirected", { value: true });
      return response;
    },
  ]) {
    let calls = 0;
    const output = await createTavilyDiscovery({ apiKey, fetchImpl: async (...args) => {
      calls++; return fetchImpl(...args);
    } })({ reportingWindow });
    assert.equal(calls, 1);
    assert.equal(output.diagnostics.searchRequests, 0);
    assert.ok(["provider_unavailable", "redirect_blocked"].includes(output.diagnostics.status));
    assert.doesNotMatch(JSON.stringify(output), /sensitive|tvly/);
  }
});
