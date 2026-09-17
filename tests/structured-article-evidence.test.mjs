import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractStructuredArticleEvidence as extract, captureStructuredArticle } from "../scripts/automation/free/structured-article-evidence.mjs";
import { enrichShortlist } from "../scripts/automation/free/article-evidence.mjs";
import { buildEvidencePacketSources } from "../scripts/automation/free/evidence-packets.mjs";
import { previewEvidenceHolds } from "../scripts/automation/free/preview-evidence-gate.mjs";
import { collectFreeResearchSnapshot } from "../scripts/automation/free/feed-engine.mjs";
import { selectPreviewReadyCandidates } from '../scripts/automation/preview-fresh-gemini.mjs';
const intro = "Example Server contains two distinct local vulnerabilities. The installed version and the relevant advisory determine the applicable remediation.";
const article = s => `<article><h1>Example Server security advisory</h1><p>${intro}</p>${s}</article>`;
const table = '<table><caption>Affected releases</caption><tr><th>CVE</th><th>Version</th><th>CVSS</th></tr><tr><td>CVE-2026-1111</td><td>1.0</td><td>7.2</td></tr><tr><td>CVE-2026-2222</td><td>2.0</td><td>9.1</td></tr></table>';
const candidateFor = capture => ({ candidateId: "test", ranking: { score: 80, evidenceTier: "authoritative-single" },
  sources: [{ id: "s", publisher: "Example", publisherKey: "example", title: "Feed title", relationship: "originating", publishedAt: "2026-09-16T12:00:00Z", url: "https://example.com/advisory" }],
  feedEvidence: [{ sourceId: "s", publisher: "Example", title: "Feed title", summary: "CONTAMINATED truncated feed fragment", publishedAt: "2026-09-16T12:00:00Z",
    articleExcerpt: capture.excerpt, articleBlocks: capture.blocks, articleExtraction: { version: capture.version, status: capture.status, holds: capture.holds, identity: capture.identity, structuredContext: capture.structuredContext } }] });

test("table cells retain exact headers, row identity and caption through writer dossier", () => {
  const capture = extract(article(table + '<h2>Remediation</h2><p>No patch available.</p><p>Exploitation requires an authenticated local user. Remote access alone does not establish vulnerability.</p>'));
  assert.equal(capture.status, "usable", JSON.stringify(capture));
  const sources = buildEvidencePacketSources(candidateFor(capture));
  assert.match(sources[0].text, /Affected releases — CVE: CVE-2026-1111; Version: 1.0; CVSS: 7.2/);
  assert.match(sources[0].text, /CVE: CVE-2026-2222; Version: 2.0; CVSS: 9.1/);
  assert.ok(sources[0].passages.some(p => p.text.includes("CVE-2026-1111") && !p.text.includes("9.1")));
  assert.ok(sources[0].passages.some(p => p.text.endsWith("Remediation — No patch available.")));
  assert.doesNotMatch(sources[0].text, /CONTAMINATED|Feed title/);
});
test("column reorder and inline formatting preserve header/value relationships", () => {
  const capture = extract(article('<table><tr><th>Version</th><th>CVE</th></tr><tr><td><strong>2.0</strong></td><td>CVE-2026-2222</td></tr></table>'));
  assert.equal(capture.status, "usable"); assert.match(capture.excerpt, /Version: 2.0; CVE: CVE-2026-2222/);
});
test("ambiguous, nested, incomplete and footnoted tables fail closed", () => {
  for (const altered of [table.replace('<td>1.0</td>', '<td></td>'), table.replace('<th>Version</th>', '<th>CVE</th>'),
    table.replace('<th>Version</th>', '<th></th>'), table.replace('<td>1.0</td>', '<td colspan="2">1.0</td>'),
    table.replace('<td>1.0</td>', '<td rowspan="1">1.0</td>'), table.replace('</table>', ''),
    table.replace('<td>1.0</td>', '<td><table><tr><td>1.0</td></tr></table></td>'),
    table.replace('</table>', 'Footnote: not all deployments are affected.</table>')]) {
    assert.equal(extract(article(altered)).status, "held", altered);
  }
});
test("definition and row-header relationships stay atomic; orphaned definitions are held", () => {
  const capture = extract(article('<h2>Deployment limits</h2><dl><dt>Prerequisite</dt><dd>Secure Boot is disabled.</dd><dt>Patch</dt><dd>No patch available.</dd></dl>'));
  assert.equal(capture.status, "usable");
  assert.ok(capture.blocks.some(b => b.endsWith("Deployment limits — Patch: No patch available.")));
  assert.equal(extract(article('<dl><dd>Orphaned condition.</dd></dl>')).status, "held");
  assert.equal(extract(article('<dl><dt>Patch</dt><dd>None.</dd><dd>Another value.</dd></dl>')).status, "held");
  assert.equal(extract(article('<table><tr><th>Patch</th><td>Not available</td></tr><tr><th>Prerequisite</th><td>Local access</td></tr></table>')).status, "usable");
});
test("late conditions survive; budget overflow, clipped text and unsupported text containers hold", () => {
  const late = '<h2>Limits</h2><p>The workaround applies only when the administrator has disabled external access.</p>';
  const capture = extract(article('<p>' + 'Background explanation. '.repeat(150) + '</p>' + late));
  assert.equal(capture.status, "usable"); assert.match(capture.excerpt, /only when the administrator/);
  assert.equal(extract(article('<p>' + 'Only local installations are affected. '.repeat(200) + '</p>')).status, "held");
  assert.equal(extract(article('<p>To obtain and install the latest</p>')).status, "held");
  assert.equal(extract(article('<div>Critical prerequisite not wrapped in a supported text block.</div>')).status, "held");
  assert.equal(extract('<article><p>Loading article...</p></article>').status, "held");
});
test("strict enrichment does not retain legacy excerpt on failed page fetch", async () => {
  const item = { url: "https://example.com/advisory", publisherKey: "example", title: "Feed title", summary: intro, articleExcerpt: intro };
  const assess = () => [{ canonicalEventKey: "a", rejectionReasons: [], candidate: { suggestedDesk: "security-and-privacy", ranking: { score: 80 }, sources: [{ url: item.url, relationship: "originating" }] } }];
  const [result] = await enrichShortlist([item], { assess, structuredPreview: true, fetchArticle: async () => { throw Error("403"); } });
  assert.equal(result.articleExcerpt, "");
  assert.deepEqual(result.articleExtraction.holds, ["ARTICLE_FETCH_OR_EXTRACTION_UNAVAILABLE"]);
  const c = candidateFor({ ...result.articleExtraction, excerpt: "", blocks: [] });
  const dossier = { candidateId: "test", sources: buildEvidencePacketSources(c) };
  const holds = previewEvidenceHolds(c, dossier, { startInclusive: "2026-09-15", endExclusive: "2026-09-17" }, { requireStructured: true });
  assert.ok(holds.includes("ARTICLE_FETCH_OR_EXTRACTION_UNAVAILABLE"));
  assert.ok(holds.includes("USABLE_STRUCTURED_ARTICLE_REQUIRED"));
});
test("collector re-extracts feed articles and writer dossiers exclude feed-summary contamination", async () => {
  const original = JSON.parse(readFileSync(new URL("./fixtures/rejected-preview-run6.json", import.meta.url), "utf8")).records[0].dossier.sources[0];
  const title = original.passages[0].text;
  const url = "https://workspaceupdates.googleblog.com/2026/09/test-access-controls.html";
  const summary = original.passages.slice(1, 4).map(p => p.text).join(" ") + " CONTAMINATED summary fragment.";
  const html = `<link rel="canonical" href="${url}"><article><h1>${title}</h1>${original.passages.slice(1).map(p => `<p>${p.text}</p>`).join("")}</article>`;
  const xml = `<rss version="2.0"><channel><title>Workspace Updates</title><item><title>${title}</title><category>Google Workspace</category><link>${url}</link><pubDate>Wed, 16 Sep 2026 12:00:00 GMT</pubDate><description>${summary}</description></item></channel></rss>`;
  let pageReads = 0;
  const snapshot = await collectFreeResearchSnapshot({ reportingWindow: { startInclusive: "2026-09-15T00:00:00Z", endExclusive: "2026-09-17T00:00:00Z" },
    retrievedAt: "2026-09-17T00:00:00Z", enrichArticles: true, articleEvidenceMode: "structured-preview", evidencePolicy: "authoritative-or-corroborated",
    lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
    requestImpl: async requestUrl => requestUrl === "https://feeds.feedburner.com/GoogleAppsUpdates"
      ? { status: 200, headers: { "content-type": "application/rss+xml" }, body: xml }
      : { status: 503, headers: {}, body: "unavailable" },
    articlePageFetcher: async () => { pageReads++; return { body: html, finalUrl: url, redirects: [] }; } });
  assert.equal(pageReads, 1, JSON.stringify(snapshot.diagnostics.rejectionCounts));
  assert.ok(snapshot.candidates.length, JSON.stringify(snapshot.diagnostics));
  const candidate = snapshot.candidates[0];
  assert.equal(candidate.feedEvidence[0].articleExtraction.status, "usable");
  const sources = buildEvidencePacketSources(candidate);
  assert.match(sources[0].text, /disabled\/enabled at the device level/);
  assert.doesNotMatch(sources[0].text, /CONTAMINATED/);
});
test("independent-review probes: nested regions, trailing warnings and section identity", () => {
  assert.equal(extract(article('<article><p>An unrelated nested report contains enough filler for a false usable result.</p></article><p>No patch available.</p>')).status, "held");
  const capture = extract(article('<h2>CVE-2026-1111</h2><h3>Affected versions</h3><p>Version 1.0 only.</p><h2>CVE-2026-2222</h2><h3>Affected versions</h3><p>Version 2.0 only.</p><h2>No patch available.</h2>'));
  assert.equal(capture.status, "usable");
  assert.ok(capture.blocks.some(b => b.includes("CVE-2026-1111 — Affected versions — Version 1.0 only.")));
  assert.ok(capture.blocks.some(b => b.endsWith("No patch available.")));
  assert.equal(extract(article(table.replace('</td><td>1.0', '</td>Only if authentication is disabled.<td>1.0'))).status, "held");
  assert.equal(extract(article(table.replace('</tr><tr><td>CVE-2026-1111', '</tr><tr><th>Product</th><th>Status</th><th>Patch</th></tr><tr><td>CVE-2026-1111'))).status, "held");
});
test("independent-review neighbors: single-column headers, duplicate captions and title outside body", () => {
  assert.equal(extract(article('<table><tr><th>Affected versions</th></tr><tr><th>Fixed versions</th></tr><tr><td>1.0</td></tr></table>')).status, "held");
  assert.equal(extract(article(table.replace('<caption>Affected releases</caption>', '<caption>Affected releases</caption><caption>Only when authentication is disabled.</caption>'))).status, "held");
  const result = extract(`<article><h1>Example Product version 3.7</h1><div itemprop="articleBody"><h2>Impact</h2><p>${intro}</p><p>No patch available.</p></div></article>`);
  assert.equal(result.status, "usable");
  const source = buildEvidencePacketSources(candidateFor(result))[0];
  assert.match(source.text, /Example Product version 3.7 — Impact — No patch available/);
});
test("observed Google DOM retains every captured fact and excludes surrounding navigation", () => {
  const html = readFileSync(new URL("./fixtures/google-meet-dom-2026-09-17.html", import.meta.url), "utf8");
  const capture = extract(html);
  assert.equal(capture.status, "usable"); assert.equal(capture.omittedBlocks, 0);
  const source = buildEvidencePacketSources(candidateFor(capture))[0];
  const original = JSON.parse(readFileSync(new URL("./fixtures/rejected-preview-run6.json", import.meta.url), "utf8")).records[0].dossier.sources[0];
  for (const passage of original.passages) assert.ok(source.text.includes(passage.text), passage.text);
  assert.doesNotMatch(source.text, /arrow_back|CONTAMINATED/);
  const changed = html.replace('<p><br></p>', '<div>No patch available.</div><p><br></p>');
  const result = extract(changed);
  assert.equal(result.status, "held");
  assert.match(result.diagnostic.snippet, /No patch available/);
  assert.ok(result.diagnostic.snippet.length <= 240);
  assert.equal(extract(html.replace('</article>', '<div class="blog-post-full__body"><p>Another ambiguous body contains competing evidence.</p></div></article>')).status, "held");
  assert.equal(extract('<article><h1>Title</h1><div class="blog-post-full__body"><p>A supported fact appears in the publisher article.</p><p>A second fact provides additional context for the update.</p></div><p>No patch available.</p></div></article>').status, "held");
});
test("observed related-advisory cards cannot become primary article evidence", () => {
  const html = '<main><h1>Siemens Mendix SAML</h1><p>Primary advisory ICSA-26-258-06.</p><section><h2>Related Advisories</h2><article class="is-promoted c-teaser c-teaser--horizontal"><p>ICSA-26-258-03 is another advisory with a different product and different scope.</p></article></section></main>';
  assert.deepEqual(extract(html).holds, ["RELATED_ARTICLE_NOT_PRIMARY"]);
});
test("capture failure diagnostics are stage-specific and exclude arbitrary exception text", async () => {
  for (const code of ["TIMEOUT", "HTTP_STATUS", "ARTICLE_BUDGET_EXHAUSTED", "SECRET_TOKEN_TEXT"]) {
    const capture = await captureStructuredArticle({}, async () => { throw Object.assign(Error("private provider details"), { code }); });
    assert.equal(capture.diagnostic.category, "fetch");
    assert.equal(capture.diagnostic.code, code === "SECRET_TOKEN_TEXT" ? "UNCLASSIFIED_FETCH_FAILURE" : code);
    assert.doesNotMatch(JSON.stringify(capture), /SECRET_TOKEN_TEXT|private provider details/);
  }
  const capture = await captureStructuredArticle({}, async () => ({ get body() { throw Error("private body failure"); } }));
  assert.equal(capture.diagnostic.category, "identity");
  assert.doesNotMatch(JSON.stringify(capture), /private body failure/);
});
test("actual CISA HTTP main captures retain full advisory context, ranges and late republication dates", async () => {
  for (const [id,title,code,cve] of [["cisa-mendix","Siemens Mendix SAML","06","CVE-2026-80465"], ["cisa-teamcenter","Siemens Teamcenter","07","CVE-2026-58113"]]) {
    const body = JSON.parse(readFileSync(new URL(`./fixtures/${id}-http-main.json`, import.meta.url), "utf8")).body;
    const url = `https://www.cisa.gov/news-events/ics-advisories/icsa-26-258-${code}`;
    const item = { title, url, publisherKey: "cisa" };
    const capture = await captureStructuredArticle(item, async () => ({ body, finalUrl: url, redirects: [] }));
    assert.equal(capture.status, "usable", JSON.stringify(capture.holds));
    assert.equal(capture.omittedBlocks, 0);
    const source = buildEvidencePacketSources(candidateFor(capture))[0];
    assert.equal(source.text, capture.excerpt);
    assert.equal(source.passages.length, capture.blocks.length);
    assert.equal(new Set(source.passages.map(p => p.evidenceId)).size, source.passages.length);
    assert.match(source.text, /verbatim republication of Siemens ProductCERT/);
    assert.match(source.text, /Initial CISA Republication/);
    assert.match(source.text, /Initial Release Date/);
    assert.match(source.text, new RegExp(cve));
    assert.doesNotMatch(source.text, /mySCADA myPRO Manager|ICSA-26-258-03/);
    assert.ok(source.passages.some(p => p.text.includes(cve) && p.text.includes("Base Score:")));
    const badRange = body.replace('vers:intdot/&lt;', 'vers:intdot/&gt;');
    assert.equal((await captureStructuredArticle(item, async () => ({ body: badRange, finalUrl: url, redirects: [] }))).status, "held");
    const wrongId = body.replace(`<div class="c-field__content">ICSA-26-258-${code}`, '<div class="c-field__content">ICSA-26-258-99');
    assert.equal((await captureStructuredArticle(item, async () => ({ body: wrongId, finalUrl: url, redirects: [] }))).status, "held");
  }
});
test("reviewer regressions: source prose conditions, version bijection and original capture time", async () => {
  const body = JSON.parse(readFileSync(new URL('./fixtures/cisa-mendix-http-main.json', import.meta.url), 'utf8')).body;
  const url = 'https://www.cisa.gov/news-events/ics-advisories/icsa-26-258-06';
  const item = {url,title:'Siemens Mendix SAML',publisherKey:'cisa'};
  const fetcher = html => async () => ({body:html,finalUrl:url,redirects:[],retrievedAt:'2026-09-16T12:00:00Z'});
  const condition = 'Cookie validation is required before this fix is effective.';
  const retained = await captureStructuredArticle(item,fetcher(body.replace('<h2>Summary</h2>',`<p>${condition}</p><h2>Summary</h2>`)));
  assert.equal(retained.status,'usable'); assert.ok(retained.excerpt.includes(condition));
  assert.equal(retained.identity.retrievedAt,'2026-09-16T12:00:00Z');
  assert.notEqual(retained.identity.inspectedAt,retained.identity.retrievedAt);
  const duplicate = body.replace('Mendix 11 compatible) vers:intdot/', 'Mendix 10 compatible) vers:intdot/');
  assert.deepEqual((await captureStructuredArticle(item,fetcher(duplicate))).holds,['ADVISORY_VERSION_RANGE_UNVERIFIED']);
});
test("identity binds exact title, transport and canonical metadata with narrow HTTP metadata equivalence", async () => {
  const url = 'https://workspaceupdates.googleblog.com/2026/09/identity-test.html';
  const title = 'Observed article';
  const body = `<meta property="og:url" content="${url.replace('https:', 'http:')}"><link rel="canonical" href="${url}"><article><h1>${title}</h1><p>${intro}</p></article>`;
  const item = { url, title, publisherKey: 'google' };
  assert.equal((await captureStructuredArticle(item, async () => ({ body, finalUrl: url, redirects: [] }))).status, 'usable');
  for(const page of [
    {body,finalUrl:url+'?other=1',redirects:[]},
    {body:body.replace('<h1>Observed article','<h1>Other article'),finalUrl:url,redirects:[]},
    {body:body.replace('http://workspaceupdates.googleblog.com','http://example.com'),finalUrl:url,redirects:[]},
    {body:body+'<h1>Extra title</h1>',finalUrl:url,redirects:[]},
    {body,finalUrl:url,redirects:[url+'?other=1']},
  ]) assert.deepEqual((await captureStructuredArticle(item,async()=>page)).holds,['ARTICLE_IDENTITY_NOT_VERIFIED']);
});
test("unallocated feed evidence cannot silently retain a legacy excerpt in strict mode", async () => {
  const [item] = await enrichShortlist([{ url: "https://example.com/unallocated", articleExcerpt: intro }], {
    structuredPreview: true, assess: () => [], fetchArticle: () => { throw Error("must not fetch"); },
  });
  assert.equal(item.articleExcerpt, "");
  assert.deepEqual(item.articleExtraction.holds, ["ARTICLE_NOT_CAPTURED_UNDER_ALLOCATION"]);
});
test('strict collector exposes an accepted fourth candidate after three unreadable leaders',async()=>{
  const titles=Array.from({length:5},(_,i)=>`Google patches Example${i} vulnerability CVE-2026-${10000+i}`);
  const urls=titles.map((_,i)=>`https://workspaceupdates.googleblog.com/2026/09/security-${i}.html`);
  const text='A critical vulnerability permits unauthenticated remote code execution and exposes customer data. Administrators must install the available security patch to remediate affected versions. The update protects enterprise deployments and provides mitigation guidance.';
  const xml=`<rss><channel>${titles.map((title,i)=>`<item><title>${title}</title><link>${urls[i]}</link><pubDate>Thu, 17 Sep 2026 12:00:00 GMT</pubDate><description>${text}</description></item>`).join('')}</channel></rss>`;
  const window={startInclusive:'2026-09-14T21:00:00Z',endExclusive:'2026-09-17T21:00:00Z'};
  const run=async structured=>collectFreeResearchSnapshot({reportingWindow:window,retrievedAt:window.endExclusive,enrichArticles:true,
    ...(structured?{articleEvidenceMode:'structured-preview'}:{}),evidencePolicy:'authoritative-or-corroborated',
    lookupImpl:async()=>[{address:'93.184.216.34',family:4}],
    requestImpl:async url=>url==='https://feeds.feedburner.com/GoogleAppsUpdates'?{status:200,headers:{'content-type':'application/rss+xml'},body:xml}:{status:503,headers:{},body:''},
    articlePageFetcher:async item=>{
      const i=urls.indexOf(item.url);return {body:`<link rel="canonical" href="${item.url}"><article><h1>${titles[i]}</h1>${i<3?'<div>Unsupported primary prose.</div>':`<p>${text}</p>`}</article>`,finalUrl:item.url,redirects:[],retrievedAt:window.endExclusive};
    }});
  const snapshot=await run(true);
  assert.ok(snapshot.diagnostics.rankedCandidateCount>3,JSON.stringify(snapshot.diagnostics));
  assert.equal(snapshot.candidates.length,snapshot.diagnostics.rankedCandidateCount);
  // All accepted alternatives reach readiness; their own capture holds remain.
  assert.equal(new Set(snapshot.candidates.map(c=>c.candidateId)).size,snapshot.candidates.length);
  const selection=selectPreviewReadyCandidates(snapshot,window,{requireStructured:true});
  assert.ok(selection.held.length>=3);
  assert.equal(selection.selectedCandidates.length,1);
  const legacy=await run(false);assert.ok(legacy.candidates.length<=3);
});
