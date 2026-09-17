// Preview-only, intentionally narrow extraction grammar. Unsupported structures
// are held rather than guessed. This is bounded article evidence, not a claim
// that every fact on the publisher's site has been captured.
import { prepareArticleRegion, plainArticleText, MAX_ARTICLE_EXCERPT_CHARS, divRegions } from "./article-evidence.mjs";
import { inspectPreviewIdentity, textHash } from "./preview-article-identity.mjs";
import { selectEvidencePassages } from "./evidence-packets.mjs";
import { previewSourceIntegrityHolds } from "./preview-evidence-gate.mjs";
import { inspectPlatformRanges } from './advisory-platform-ranges.mjs';
const version = "structured-preview-v1";
const critical = /\b(?:not|no|only|unless|requires?|must|except|if|when|affected|versions?|mitigations?|patch|fixed|limitations?|eligibility|rollout)\b/iu;
const held = (reason, diagnostic) => ({ version, status: "held", holds: [reason], excerpt: "", blocks: [], inputBlocks: 0, omittedBlocks: 0,
  ...(diagnostic ? { diagnostic } : {}) });
const count = (s, tag) => (s.match(new RegExp(`<${tag}\\b`, "gi")) ?? []).length;

// Only fixed codes leave an exception boundary. Never retain arbitrary provider
// errors: they can contain URLs, credentials, or source-controlled text.
const fetchCodes = new Set(["TIMEOUT", "REQUEST_FAILED", "HTTP_STATUS", "STATUS_INVALID",
  "BODY_TOO_LARGE", "CONTENT_TYPE_INVALID", "ENCODING_UNSUPPORTED", "REDIRECT_LIMIT",
  "REDIRECT_INVALID", "DNS_FAILED", "DNS_EMPTY", "DNS_UNSAFE", "HOST_UNSAFE",
  "URL_INVALID", "URL_UNSAFE", "HOST_NOT_ALLOWED", "URL_TOO_LONG", "ARTICLE_BUDGET_EXHAUSTED"]);
const identityCodes = new Set(["ARTICLE_IDENTITY_AMBIGUOUS", "ARTICLE_TRANSPORT_IDENTITY_CONFLICT", "ARTICLE_TITLE_IDENTITY_CONFLICT",
  "ARTICLE_CANONICAL_IDENTITY_CONFLICT", "ARTICLE_CAPTURE_TIME_INVALID", "ADVISORY_IDENTITY_AMBIGUOUS", "ADVISORY_IDENTITY_CONFLICT"]);
export async function captureStructuredArticle(item, fetchPage) {
  let page;
  try { page = await fetchPage(item); }
  catch (error) { return held("ARTICLE_FETCH_FAILED", { category: "fetch", code: fetchCodes.has(error?.code) ? error.code : "UNCLASSIFIED_FETCH_FAILURE" }); }
  let verified;
  try { verified = inspectPreviewIdentity(item, page); }
  catch (error) { return held("ARTICLE_IDENTITY_NOT_VERIFIED", { category: "identity", code: identityCodes.has(error.message) ? error.message : "INVALID_IDENTITY" }); }
  try {
    const capture = verified.advisoryBody ? extractAdvisory(verified.advisoryBody, verified.identity)
      : extractStructuredArticleEvidence(page.body);
    return { ...capture, identity: verified.identity };
  }
  catch { return held("ARTICLE_PROCESSING_FAILED", { category: "extract", code: "UNEXPECTED_EXTRACTION_FAILURE" }); }
}

function extractAdvisory(body, identity) {
  const regions = divRegions(body, true);
  if (!regions) return held("ADVISORY_STRUCTURE_AMBIGUOUS");
  // Observed leaf label/value containers are paragraphs, not table columns.
  // Keep all product versions and all remediation statements in source order;
  // never pair the lists by position.
  const leaves = regions.filter(r => r.attributes.class?.some(c => ["ics-vendor", "ics-version", "ics-status"].includes(c)));
  let converted = "", cursor = 0;
  for (const r of leaves) {
    if (r.start < cursor || /<div\b/i.test(body.slice(r.innerStart, r.innerEnd))) return held("ADVISORY_STRUCTURE_AMBIGUOUS");
    converted += body.slice(cursor, r.start) + "<p>" + body.slice(r.innerStart, r.innerEnd) + "</p>";
    cursor = r.end;
  }
  converted += body.slice(cursor);
  const ranges = [...body.matchAll(/<li\b[^>]*>([^]*?)<\/li\s*>/gi)].map(m => plainArticleText(m[1]))
    .filter(t => t.includes("vers:intdot/"));
  const productGroups = leaves.filter(r => r.attributes.class.includes("ics-version"))
    .flatMap(r => plainArticleText(body.slice(r.innerStart, r.innerEnd)).replace(/^Product Version:\s*/, "").split(/,\s*/));
  // Support only the observed, complete single '< integer-dot' range. Retain
  // the original notation and cross-check the separately labelled version group.
  const cves = new Set(ranges.flatMap(text => text.match(/CVE-\d{4}-\d+/g) ?? []));
  const allCves = new Set(plainArticleText(body).match(/CVE-\d{4}-\d+/g) ?? []);
  const mappedRanges = ranges.map(text => {
    const m = /^(.*?) vers:intdot\/(<\d+(?:\.\d+)+) \((CVE-\d{4}-\d+)\)$/.exec(text);
    return m ? `${m[1]} < V${m[2].slice(1)}` : null;
  });
  if (!ranges.length) {
    const platform = inspectPlatformRanges(body, regions);
    if (platform.code) return held('ADVISORY_VERSION_RANGE_UNVERIFIED', { category: 'advisory', code: platform.code });
    return extractRegion({ body: converted, title: identity.title }, { advisory: true,
      prefix: `${identity.advisoryCode} — ${identity.releaseDate}`, ranges: platform.ranges, rangeFormat: 'platform-cve-v1', scopes: platform.scopes });
  }
  if (cves.size !== 1 || allCves.size !== 1 || mappedRanges.includes(null) ||
      new Set(mappedRanges).size !== mappedRanges.length || new Set(productGroups).size !== productGroups.length ||
      JSON.stringify([...mappedRanges].sort()) !== JSON.stringify([...productGroups].sort())) return held("ADVISORY_VERSION_RANGE_UNVERIFIED");
  return extractRegion({ body: converted, title: identity.title }, { advisory: true,
    prefix: `${identity.advisoryCode} — ${identity.releaseDate}`, ranges });
}

function tableUnits(markup, heading) {
  if (count(markup, "table") !== 1 || /\b(?:rowspan|colspan|scope|headers)\s*=/iu.test(markup)) throw Error("AMBIGUOUS_TABLE");
  if (count(markup, "caption") > 1) throw Error("AMBIGUOUS_TABLE");
  const caption = plainArticleText(markup.match(/<caption\b[^>]*>([\s\S]*?)<\/caption\s*>/iu)?.[1] ?? "");
  const rows = [...markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/giu)];
  if (!rows.length || rows.length !== count(markup, "tr") || rows.length > 80) throw Error("AMBIGUOUS_TABLE");
  if (plainArticleText(markup.replace(/<tr\b[^>]*>[\s\S]*?<\/tr\s*>/giu, "").replace(/<caption\b[^>]*>[\s\S]*?<\/caption\s*>/giu, ""))) throw Error("AMBIGUOUS_TABLE");
  const cells = rows.map(row => {
    const found = [...row[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1\s*>/giu)];
    if (found.length !== count(row[1], "(?:td|th)") || !found.length || found.length > 12) throw Error("AMBIGUOUS_TABLE");
    if (plainArticleText(row[1].replace(/<(th|td)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ""))) throw Error("AMBIGUOUS_TABLE");
    return found.map(c => ({ kind: c[1].toLowerCase(), text: plainArticleText(c[2]) }));
  });
  const prefix = [heading, caption].filter(Boolean).join(" — ");
  const headers = cells[0];
  if (headers.every(c => c.kind === "th") && headers.every(c => c.text) &&
      new Set(headers.map(c => c.text.toLowerCase())).size === headers.length) {
    if (cells.length < 2 || cells.slice(1).some(row => row.length !== headers.length || row.some(c => !c.text) || row.every(c => c.kind === "th") || row.slice(1).some(c => c.kind !== "td"))) throw Error("AMBIGUOUS_TABLE");
    return cells.slice(1).map(row => `${prefix ? `${prefix} — ` : ""}${row.map((c, i) => `${headers[i].text}: ${c.text}`).join("; ")}`);
  }
  if (cells.every(row => row.length === 2 && row[0].kind === "th" && row[1].kind === "td" && row.every(c => c.text)) &&
      new Set(cells.map(row => row[0].text.toLowerCase())).size === cells.length) {
    return cells.map(row => `${prefix ? `${prefix} — ` : ""}${row[0].text}: ${row[1].text}`);
  }
  throw Error("AMBIGUOUS_TABLE");
}

function definitionUnits(markup, heading) {
  if (count(markup, "dl") !== 1) throw Error("AMBIGUOUS_DEFINITION_LIST");
  const entries = [...markup.matchAll(/<(dt|dd)\b[^>]*>([\s\S]*?)<\/\1\s*>/giu)];
  if (!entries.length || entries.length % 2 || entries.length !== count(markup, "(?:dt|dd)")) throw Error("AMBIGUOUS_DEFINITION_LIST");
  if (plainArticleText(markup.replace(/<(dt|dd)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ""))) throw Error("AMBIGUOUS_DEFINITION_LIST");
  const units = [];
  for (let i = 0; i < entries.length; i += 2) {
    const term = plainArticleText(entries[i][2]), definition = plainArticleText(entries[i + 1][2]);
    if (entries[i][1].toLowerCase() !== "dt" || entries[i + 1][1].toLowerCase() !== "dd" || !term || !definition) throw Error("AMBIGUOUS_DEFINITION_LIST");
    units.push(`${heading ? `${heading} — ` : ""}${term}: ${definition}`);
  }
  return units;
}

export function extractStructuredArticleEvidence(html) {
  // Observed CISA pages use <main> for the advisory and <article> only for
  // related-story cards. Never attach the first such card to the feed story.
  const firstArticle = typeof html === "string" ? html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").match(/<article\b[^>]*>/i)?.[0] : "";
  if (/\bclass\s*=\s*(["'])[^"']*\bc-teaser\b[^"']*\1/iu.test(firstArticle ?? "")) return held("RELATED_ARTICLE_NOT_PRIMARY");
  const region = prepareArticleRegion(html, { structuredPreview: true });
  if (!region?.body) return held("ARTICLE_REGION_UNAVAILABLE");
  return extractRegion(region);
}

function extractRegion(region, { advisory = false, prefix = "", ranges = [], rangeFormat, scopes } = {}) {
  const { body, title } = region;
  if (/<(?:article|main)\b/iu.test(body)) return held("NESTED_ARTICLE_REGION");
  // Fetched H1 may sit outside a narrowed articleBody container. Keep that
  // captured identity, never replace it with a feed/search title.
  const blocks = title ? [title] : [];
  if (prefix) blocks.push(prefix);
  const headings = title ? [title] : [];
  let heading = title, tables = 0, definitions = 0, cursor = 0, unparsed = "", unsupportedOffset = null;
  try {
    // Compound structures are consumed as a whole before paragraph matching.
    const pattern = /<table\b[^>]*>[\s\S]*?<\/table\s*>|<dl\b[^>]*>[\s\S]*?<\/dl\s*>|<(p|h[1-6]|li)\b[^>]*>([\s\S]*?)(?=<(?:p|h[1-6]|li|table|dl)\b|<\/(?:p|h[1-6]|li|article|main|div|section)\s*>|$)/giu;
    for (const match of body.matchAll(pattern)) {
      const gap = body.slice(cursor, match.index);
      if (unsupportedOffset === null && plainArticleText(gap)) unsupportedOffset = cursor;
      unparsed += gap; cursor = match.index + match[0].length;
      if (/^<table\b/iu.test(match[0])) { tables++; blocks.push(...tableUnits(match[0], heading)); }
      else if (/^<dl\b/iu.test(match[0])) { definitions++; blocks.push(...definitionUnits(match[0], heading)); }
      else {
        const text = plainArticleText(match[2]);
        if (!text) continue; // primary prose is never removed by a word-prefix heuristic
        if (/^h/iu.test(match[1])) {
          const level = Number(match[1].slice(1)); headings.length = level; headings[level - 1] = text;
          heading = headings.filter(Boolean).join(" — ");
          blocks.push(heading); // trailing short warnings and section identity are evidence too
          continue;
        }
        blocks.push(`${heading ? `${heading} — ` : ""}${text}`);
      }
    }
    unparsed += body.slice(cursor);
    if (plainArticleText(unparsed)) return held("UNSUPPORTED_ARTICLE_TEXT_STRUCTURE", {
      category: "unconsumed-text", regionOffset: unsupportedOffset ?? cursor,
      snippet: plainArticleText(unparsed).slice(0, 240),
    });
    if (tables !== count(body, "table")) throw Error("AMBIGUOUS_TABLE");
    if (definitions !== count(body, "dl")) throw Error("AMBIGUOUS_DEFINITION_LIST");
  } catch (error) { return held(error.message); }
  if (!blocks.length || blocks.length > 1000) return held("ARTICLE_CONTENT_UNAVAILABLE");
  const fullText = blocks.join("\n");
  const structuredContext = advisory ? { kind: "cisa-csaf-complete-v1", textSha256: textHash(fullText), ranges,
    ...(rangeFormat ? {rangeFormat, scopes} : {}) } : undefined;
  const damage = previewSourceIntegrityHolds({ sources: [{ text: fullText, passages: blocks.map(text => ({ text })), structuredContext }] });
  // Flattened advisory text remains unsupported here too. Correct table rows
  // retain header/value associations but are not automatically exempted.
  if (damage.length) return held(damage[0]);
  if (advisory) {
    if (fullText.length > 18_000 || blocks.length > 128) return held("REQUIRED_CONTEXT_EXCEEDS_BUDGET");
    return { version: "structured-advisory-preview-v1", status: "usable", holds: [], excerpt: fullText,
      blocks, inputBlocks: blocks.length, omittedBlocks: 0, structuredContext };
  }
  const kept = selectEvidencePassages(blocks, { title, maxChars: MAX_ARTICLE_EXCERPT_CHARS, maxPassages: 32, minChars: 1 });
  if (blocks.some(block => critical.test(block) && !kept.includes(block))) return held("REQUIRED_CONTEXT_EXCEEDS_BUDGET");
  const excerpt = kept.join("\n");
  if (excerpt.length < 120 || kept.length < 2) return held("ARTICLE_CONTENT_INSUFFICIENT");
  return { version, status: "usable", holds: [], excerpt, blocks: kept, inputBlocks: blocks.length, omittedBlocks: blocks.filter(b => !kept.includes(b)).length };
}
