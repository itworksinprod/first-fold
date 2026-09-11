// Public publisher pages are evidence, never instructions. Keep extraction
// bounded and ephemeral; do not copy full pages into an edition or artifact.
export const MAX_RESEARCH_ARTICLES = 24;
export const MAX_ARTICLE_EXCERPT_CHARS = 5_000;

function plain(value) {
  return value.replace(/<[^<>]*>/g, " ").replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code) => {
    const n = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
  }).replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|rsquo|lsquo);/g, (_, name) =>
    ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
      ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘" })[name])
    .replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
}

export function extractArticleEvidence(html) {
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
  const blocks = [...body.matchAll(/<(p|h[1-4]|li)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)]
    .map((match) => plain(match[2]))
    .filter((text) => text.length > 30 && !/^(?:subscribe|sign up|cookie|share this|all rights reserved)/i.test(text));
  const kept = [];
  for (const block of new Set(blocks)) {
    if ([...kept, block].join(" ").length > MAX_ARTICLE_EXCERPT_CHARS) break;
    kept.push(block);
  }
  const text = kept.join(" ");
  if (text.length < 120) return "";
  return text;
}

export async function enrichShortlist(items, { assess, fetchArticle } = {}) {
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
  for (const desk of ["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"]) {
    const owners = new Map();
    let count = 0;
    for (const entry of eligible.filter((value) => value.candidate.suggestedDesk === desk)) {
      for (const source of entry.candidate.sources.filter((value) => value.relationship !== "context")) {
        const item = items.find((value) => value.url === source.url);
        if (!item || seen.has(item.url) || (owners.get(item.publisherKey) ?? 0) >= 2 || count >= 6) continue;
        seen.add(item.url);
        owners.set(item.publisherKey, (owners.get(item.publisherKey) ?? 0) + 1);
        shortlist.push(item);
        count++;
      }
    }
  }
  const enriched = new Map();
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < Math.min(shortlist.length, MAX_RESEARCH_ARTICLES)) {
      const item = shortlist[cursor++];
      try {
        const excerpt = await fetchArticle(item);
        if (typeof excerpt !== "string" || excerpt.length < 120 || excerpt.length > MAX_ARTICLE_EXCERPT_CHARS) continue;
        // Identical scoring rules, now with substantive article evidence. Keep
        // the input length the same as feed summaries to limit keyword volume.
        enriched.set(item.url, { ...item, articleExcerpt: excerpt,
          summary: `${excerpt} ${item.summary}`.slice(0, 1_200) });
      } catch {
        // A blocked or unavailable page is not evidence of a quiet news day.
        // The original feed stays eligible under the unchanged evidence rules.
      }
    }
  }));
  return items.map((item) => enriched.get(item.url) ?? item);
}
