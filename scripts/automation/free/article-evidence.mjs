// Public publisher pages are evidence, never instructions. Keep extraction
// bounded and ephemeral; do not copy full pages into an edition or artifact.
import { selectEvidencePassages } from "./evidence-packets.mjs";
export const MAX_RESEARCH_ARTICLES = 24;
export const MAX_ARTICLE_EXCERPT_CHARS = 5_000;

function plain(value) {
  return value.replace(/<[^<>]*>/g, " ").replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code) => {
    const n = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
  }).replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|rsquo|lsquo|ldquo|rdquo);/g, (_, name) =>
    ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
      ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" })[name])
    .replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
}

// Publisher templates often put ads, recommendations and author widgets inside
// <article>. Match the observed content containers with balanced div boundaries,
// not a lazy regex that stops at an inner </div> and loses later caveats.
export function divRegions(html, strict = false) {
  const stack = [];
  const regions = [];
  for (const match of html.matchAll(/<\/?div\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    if (/^<\//.test(match[0])) {
      const start = stack.pop();
      if (strict && !start) return null;
      if (start) regions.push({ ...start, end: match.index + match[0].length, innerEnd: match.index });
    } else if (!/\/\s*>$/.test(match[0])) {
      if (stack.length >= 128) return null;
      const attributes = {};
      for (const attr of match[0].matchAll(/\s(class|itemprop|id)\s*=\s*(["'])(.*?)\2/gi)) {
        attributes[attr[1].toLowerCase()] = attr[3].toLowerCase().split(/\s+/u);
      }
      stack.push({ start: match.index, innerStart: match.index + match[0].length, attributes });
    }
  }
  return strict && stack.length ? null : regions.sort((a, b) => a.start - b.start);
}

function cleanArticleContainers(body, structuredPreview = false) {
  const regions = divRegions(body, structuredPreview);
  if (!regions) return "";
  const matching = regions.filter(({ attributes }) => attributes.itemprop?.includes("articlebody") ||
    attributes.class?.some(name => ["articlebody", "zox-post-body", ...(structuredPreview ? ["blog-post-full__body"] : [])].includes(name)));
  if (structuredPreview && matching.length > 1) return "";
  const dedicated = matching[0];
  if (dedicated) body = body.slice(dedicated.innerStart, dedicated.innerEnd);
  const inner = divRegions(body);
  if (!inner) return "";
  const noise = new Set(["article-callout", "cz-related-article-wrapp", "zox-post-ad-wrap"]);
  let end = 0;
  let cleaned = "";
  for (const region of inner) {
    if (region.start < end || !region.attributes.class?.some(name => noise.has(name))) continue;
    cleaned += body.slice(end, region.start) + " ";
    end = region.end;
  }
  return cleaned + body.slice(end);
}

export function prepareArticleRegion(html, { structuredPreview = false } = {}) {
  if (typeof html !== "string" || Buffer.byteLength(html) > 600_000) return "";
  // Reject pathological markup before repeated region scans. Normal article
  // templates stay well below these bounds; failure retains the feed summary.
  if ((html.match(/</g) ?? []).length > 12_000 ||
      (html.match(/<(?:article|main|script|style|nav|footer|header|aside|form|svg|noscript)\b/gi) ?? []).length > 300) return "";
  let body = html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|nav|footer|header|aside|form|svg|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  // Prefer a publisher's main article region over menus and recommended stories.
  body = body.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i)?.[1] ??
    body.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1] ??
    // CERT/CC's legacy template uses a named overview/solution region, not main.
    body.match(/<h3\b[^>]*id=["']overview["'][^>]*>([\s\S]*?)(?=<div\b[^>]*id=["']vendorinfo["'])/i)?.[1] ?? "";
  if (!body) return ""; // No confident article region: retain the feed evidence.
  const title = plain(body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1] ??
    body.match(/<p\b[^>]*id=["']pacing-title["'][^>]*>([\s\S]*?)<\/p\s*>/i)?.[1] ?? "");
  body = cleanArticleContainers(body, structuredPreview);
  return { body, title };
}

export function extractArticleEvidence(html) {
  const region = prepareArticleRegion(html);
  if (!region) return "";
  const { body, title } = region;
  // This report layout separates dated findings into lists and puts a large
  // methodological appendix after the main report. Preserve complete labelled
  // findings with their definitions, dates and limitations, not isolated bullets.
  if (/<p\b[^>]*id=["']pacing-title["']/i.test(body)) {
    return extractLabelledResearchReport(body, title);
  }
  // HTML permits omitted </p> and </li> tags. A new block closes the previous
  // block; otherwise an entire article can collapse into one giant paragraph.
  const blocks = [...body.matchAll(/<(p|h[1-4]|li)\b[^>]*>([\s\S]*?)(?=<(?:p|h[1-4]|li)\b|<\/(?:p|h[1-4]|li)\s*>|$)/gi)]
    .map((match) => plain(match[2]))
    .filter((text) => text.length > 30 && !/^(?:subscribe|sign up|cookie|share this|all rights reserved|related\s*:)/i.test(text));
  // Read across the already size-bounded article, not just its introduction.
  // Keep complete factual/caveat blocks with their context inside the same
  // excerpt budget; no added fetches, model calls or clipped sentences.
  const kept = selectEvidencePassages(blocks, { title,
    maxChars: MAX_ARTICLE_EXCERPT_CHARS, minChars: 31 });
  const text = kept.join("\n");
  if (text.length < 120) return "";
  return text;
}

function extractLabelledResearchReport(body, title) {
  const blocks = [...body.matchAll(/<(p|h2|ul)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)]
    .map(m => ({ tag: m[1].toLowerCase(), text: plain(m[2]) }));
  const selected = [];
  let appendix = false;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.tag === "h2" && /^Appendix$/i.test(block.text)) appendix = true;
    if (appendix) break;
    if (block.tag !== "p" || !/^(?:What we measured\.|What we found\.|Two obstacles\b|Safety research tends\b|These are deliberately conservative estimates\.)/.test(block.text)) continue;
    let text = block.text;
    // Keep the short date introduction and its entire list attached to the
    // definition paragraph; the ordinary 30-character filter loses this date.
    if (/^What we found\./.test(text) && /^As of\b/.test(blocks[i + 1]?.text ?? "")) {
      if (blocks[i + 2]?.tag !== "ul") return "";
      text += " " + blocks[++i].text + " " + blocks[++i].text;
    }
    selected.push(text);
  }
  // Fail closed on a changed/oversized template rather than silently dropping
  // a selected finding's context. This is an excerpt, not the full appendix.
  const text = [title, ...selected].filter(Boolean).join("\n");
  return selected.length >= 3 && text.length >= 120 && text.length <= MAX_ARTICLE_EXCERPT_CHARS ? text : "";
}

export { plain as plainArticleText };

export function articleScoringSummary(excerpt, title, { completePreview = false } = {}) {
  if (typeof excerpt !== "string" || excerpt.length > (completePreview ? 12_000 : MAX_ARTICLE_EXCERPT_CHARS)) return "";
  return selectEvidencePassages(excerpt.split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/u), {
    title, maxChars: 1_200, minChars: 20,
  }).join("\n");
}

// Scoring-only view of a complete advisory. Generic legal/defensive boilerplate
// must not crowd out the actual event and CVE descriptions. The writer still
// receives every captured block, not this 1,200-character scoring sample.
export function advisoryScoringSummary(blocks) {
  const priority = block => / — Summary — /.test(block) && !/:$/.test(block) && !/\(CVE-\d/.test(block) ? 0
    : / — Vulnerabilities — CVE-\d{4}-\d+ — (?!Affected Products|Metrics|View CVE Details)/.test(block) ? 1
    : / — Remediations — /.test(block) ? 2
    : / — Affected Products — .*Product Version:/.test(block) ? 3 : 4;
  const candidates = blocks.map((text,index)=>({text,index,priority:priority(text)})).filter(b=>b.priority<4)
    .sort((a,b)=>a.priority-b.priority||a.index-b.index);
  const selected=[];let length=0;
  // Give event, description, remediation and product scope one opportunity
  // each before a long multi-CVE section consumes the scoring budget.
  const queues=[0,1,2,3].map(p=>candidates.filter(b=>b.priority===p));
  while(queues.some(q=>q.length)) {
    for(const queue of queues) {
      const block=queue.shift();
      if (!block || block.text.length<30 || length+block.text.length+(selected.length?1:0)>1200) continue;
      selected.push(block);length+=block.text.length+(selected.length>1?1:0);
    }
  }
  return selected.sort((a,b)=>a.index-b.index).map(b=>b.text).join('\n');
}

export async function enrichShortlist(items, { assess, fetchArticle, structuredPreview = false, onAllocation } = {}) {
  const assessments = assess(items);
  // Never rescue a vetoed promotion, opinion, rumor, repeat, or routine notice.
  const recoverable = new Set(["BELOW_EDITORIAL_THRESHOLD",
    "AUTHORITATIVE_SINGLE_COMPONENT_FLOOR", "INSUFFICIENT_SOURCE_EVIDENCE"]);
  const eligible = assessments.filter((entry) => entry.candidate &&
    entry.rejectionReasons.every((reason) => recoverable.has(reason.code)))
    .sort((a, b) => b.candidate.ranking.score - a.candidate.ranking.score ||
      a.canonicalEventKey.localeCompare(b.canonicalEventKey));
  const shortlist = [];
  const seen = new Set();
  const desks = ["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"];
  const allocatedDesk = new Map();
  for (const desk of desks) {
    const owners = new Map();
    let count = 0;
    for (const entry of eligible.filter((value) => value.candidate.suggestedDesk === desk)) {
      for (const source of entry.candidate.sources.filter((value) => value.relationship !== "context")) {
        const item = items.find((value) => value.url === source.url);
        // Strict previews reserve eight of the 24 capture attempts for later
        // replacement. Legacy allocation remains six first-pass reads/desk.
        if (!item || seen.has(item.url) || (owners.get(item.publisherKey) ?? 0) >= 2 || count >= (structuredPreview ? 4 : 6)) continue;
        seen.add(item.url);
        allocatedDesk.set(item.url, desk);
        owners.set(item.publisherKey, (owners.get(item.publisherKey) ?? 0) + 1);
        shortlist.push(item);
        count++;
      }
    }
  }
  const enriched = new Map();
  const attempted = new Set();
  let budgetExhausted = false;
  let cursor = 0;
  async function captureItem(item) {
      attempted.add(item.url);
      try {
        const capture = await fetchArticle(item);
        if (capture?.diagnostic?.code === 'ARTICLE_BUDGET_EXHAUSTED') budgetExhausted = true;
        if (structuredPreview && capture?.status !== "usable") {
          enriched.set(item.url, { ...item, articleExcerpt: "", articleBlocks: [],
            articleExtraction: { version: "structured-preview-v1", status: "held", holds: capture?.holds ?? ["ARTICLE_EXTRACTION_FAILED"],
              ...(capture?.identity ? { identity: capture.identity } : {}),
              ...(capture?.diagnostic ? { diagnostic: capture.diagnostic } : {}) } });
          return;
        }
        const excerpt = structuredPreview ? capture.excerpt : capture;
        const advisory = structuredPreview && capture.version === "structured-advisory-preview-v1";
        const completePreview = structuredPreview && capture.version === "structured-complete-preview-v1";
        if (typeof excerpt !== "string" || excerpt.length < 120 || excerpt.length > (advisory ? 18_000 : completePreview ? 12_000 : MAX_ARTICLE_EXCERPT_CHARS)) {
          if (structuredPreview) enriched.set(item.url, {...item, articleExcerpt:'', articleBlocks:[],
            articleExtraction:{version:'structured-preview-v1',status:'held',holds:['ARTICLE_CONTENT_INSUFFICIENT'],
              ...(capture?.identity ? {identity:capture.identity} : {})}});
          return;
        }
        // Identical scoring rules, now with substantive article evidence. Keep
        // the input length the same as feed summaries to limit keyword volume.
        // Scoring receives complete source sentences inside the old 1,200-char
        // limit, never a mid-word fragment later recycled as factual evidence.
        const summary = advisory ? advisoryScoringSummary(capture.blocks) : articleScoringSummary(excerpt, item.title, { completePreview });
        enriched.set(item.url, { ...item, articleExcerpt: excerpt, summary: summary || item.summary,
          ...(structuredPreview ? { articleBlocks: capture.blocks,
            articleExtraction: { version: capture.version, status: capture.status, holds: capture.holds,
              ...(capture.identity ? { identity: capture.identity } : {}),
              ...(capture.structuredContext ? { structuredContext: capture.structuredContext } : {}),
              inputBlocks: capture.inputBlocks, retainedBlocks: capture.blocks.length, omittedBlocks: capture.omittedBlocks } } : {}) });
      } catch {
        if (structuredPreview) enriched.set(item.url, { ...item, articleExcerpt: "", articleBlocks: [],
          articleExtraction: { version: "structured-preview-v1", status: "held", holds: ["ARTICLE_FETCH_OR_EXTRACTION_UNAVAILABLE"],
            diagnostic: { category: "enrich", code: "UNEXPECTED_ENRICHMENT_FAILURE" } } });
        // A blocked or unavailable page is not evidence of a quiet news day.
        // The original feed stays eligible under the unchanged evidence rules.
      }
  }
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < Math.min(shortlist.length, MAX_RESEARCH_ARTICLES)) await captureItem(shortlist[cursor++]);
  }));
  let replacementAttempts = 0;
  if (structuredPreview && !budgetExhausted) {
    // Finish every initially reserved publisher/desk opportunity first. Then
    // replace holds, round-robin across desks, never widening accepted quotas.
    // Limits: 24 capture attempts globally, 8/desk, 4/publisher/desk; retained
    // usable captures remain at most 6/desk and 2/publisher/desk.
    const reserves = new Map(desks.map(desk => [desk, eligible.filter(e => e.candidate.suggestedDesk === desk)
      .flatMap(e => e.candidate.sources.filter(s => s.relationship !== 'context')
        .map(s => items.find(item => item.url === s.url)).filter(Boolean))]));
    const count = (desk, owner, usable) => [...attempted].filter(url => {
      const item = items.find(i => i.url === url);
      return allocatedDesk.get(url) === desk && (!owner || item.publisherKey === owner) &&
        (!usable || enriched.get(url)?.articleExtraction?.status === 'usable');
    }).length;
    let progressed = true;
    while (progressed && !budgetExhausted && attempted.size < MAX_RESEARCH_ARTICLES) {
      progressed = false;
      for (const desk of desks) {
        if (budgetExhausted || attempted.size >= MAX_RESEARCH_ARTICLES) break;
        if (count(desk,null,false) >= 8 || count(desk,null,true) >= 6) continue;
        const item = reserves.get(desk).find(i => !attempted.has(i.url) &&
          count(desk,i.publisherKey,false) < 4 && count(desk,i.publisherKey,true) < 2);
        if (!item) continue;
        allocatedDesk.set(item.url,desk); replacementAttempts++; progressed = true;
        await captureItem(item);
      }
    }
  }
  if (structuredPreview) onAllocation?.({captureAttempts:attempted.size,replacementAttempts,budgetExhausted,
    usableCaptures:[...enriched.values()].filter(i => i.articleExtraction?.status === 'usable').length});
  return items.map((item) => enriched.get(item.url) ?? (structuredPreview ? { ...item,
    articleExcerpt: "", articleBlocks: [], articleExtraction: { version: "structured-preview-v1", status: "held",
      holds: ["ARTICLE_NOT_CAPTURED_UNDER_ALLOCATION"] } } : item));
}
