import { createHash } from "node:crypto";
import { plainArticleText, divRegions } from "./article-evidence.mjs";
import { reviewedSearchPublisher } from "./publisher-registry.mjs";

export const textHash = value => createHash("sha256").update(value).digest("hex");
const normalizeTitle = value => plainArticleText(value).normalize("NFKC").replace(/\s+/gu, " ").trim();
export function cleanMarkup(html) {
  return html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|nav|footer|header|aside|form|svg|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
}
function attrs(tag) {
  const result = {};
  for (const m of tag.matchAll(/\s([a-z_:][-a-z0-9_:.]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s"'=<>`]+))/gi)) {
    const key = m[1].toLowerCase();
    if (Object.hasOwn(result, key)) throw Error("ARTICLE_IDENTITY_AMBIGUOUS");
    result[key] = plainArticleText(m[2] ?? m[3] ?? m[4]);
  }
  return result;
}
function metadataUrl(value, base) {
  const u = new URL(value, base);
  // Metadata-only equivalence: never issue an HTTP request.
  if (u.protocol === "http:" && !u.port && !u.username && !u.password) u.protocol = "https:";
  return u.href;
}
export function inspectPreviewIdentity(item, page) {
  const requested = reviewedSearchPublisher(item.url, item.publisherKey)?.url;
  if (!requested || page.finalUrl !== requested || !Array.isArray(page.redirects) ||
      page.redirects.some(url => url !== requested)) throw Error("ARTICLE_TRANSPORT_IDENTITY_CONFLICT");
  const clean = cleanMarkup(page.body);
  const heads = [...clean.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)];
  if (heads.length !== 1 || normalizeTitle(heads[0][1]) !== normalizeTitle(item.title ?? "")) throw Error("ARTICLE_TITLE_IDENTITY_CONFLICT");
  const identities = [];
  for (const m of clean.matchAll(/<(meta|link)\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if ((a.property ?? a.name)?.toLowerCase() === "og:url") identities.push(a.content);
    if (a.rel?.toLowerCase().split(/\s+/).includes("canonical")) identities.push(a.href);
  }
  if (!identities.length || identities.some(value => !value || metadataUrl(value, requested) !== requested)) throw Error("ARTICLE_CANONICAL_IDENTITY_CONFLICT");
  if (page.retrievedAt != null && (!Number.isFinite(Date.parse(page.retrievedAt)) || Date.parse(page.retrievedAt) > Date.now())) throw Error("ARTICLE_CAPTURE_TIME_INVALID");
  const identity = { requestedUrl: requested, finalUrl: page.finalUrl, redirects: page.redirects,
    retrievedAt: page.retrievedAt ?? null, inspectedAt: new Date().toISOString(), title: normalizeTitle(heads[0][1]), bodySha256: textHash(page.body) };
  if (new URL(requested).hostname === "www.cisa.gov" && /\/ics-advisories\//.test(requested)) {
    const main = [...clean.matchAll(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/gi)];
    if (main.length !== 1 || !main[0][1].includes(heads[0][0])) throw Error("ADVISORY_IDENTITY_AMBIGUOUS");
    const regions = divRegions(main[0][1], true);
    const codeFields = regions?.filter(r => r.attributes.class?.includes("c-field--name-field-alert-code"));
    const bodies = regions?.filter(r => r.attributes.class?.includes("csaf-imported"));
    const dates = regions?.filter(r => r.attributes.class?.includes("c-field--name-field-release-date"));
    const code = new URL(requested).pathname.split("/").at(-1).toUpperCase();
    if (codeFields?.length !== 1 || bodies?.length !== 1 || dates?.length !== 1 ||
        plainArticleText(main[0][1].slice(codeFields[0].innerStart, codeFields[0].innerEnd)) !== `Alert Code ${code}`) throw Error("ADVISORY_IDENTITY_CONFLICT");
    identity.advisoryCode = code;
    identity.releaseDate = plainArticleText(main[0][1].slice(dates[0].innerStart, dates[0].innerEnd));
    return { identity, advisoryBody: main[0][1].slice(bodies[0].innerStart, bodies[0].innerEnd) };
  }
  return { identity };
}
