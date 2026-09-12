import { FREE_FEED_SOURCES } from "./feed-sources.mjs";

// A search result is a lead, not permission to fetch an arbitrary host. These
// identities come only from the checked-in newsroom publisher review.
const TRACKING_PARAMETER = /^(?:utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid|at_campaign|at_medium)$/i;

export function reviewedSearchPublisher(value, expectedPublisherKey) {
  if (typeof value !== "string" || value.length > 2_048 || /[\p{Cc}\p{Cf}]/u.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  const matches = FREE_FEED_SOURCES.filter((source) =>
    source.itemHosts.includes(url.hostname) && (!expectedPublisherKey || source.publisherKey === expectedPublisherKey));
  if (!matches.length || new Set(matches.map((source) => source.publisherKey)).size !== 1) return null;
  // Shared publishers have multiple feeds. The actual URL path, never a search
  // engine's desk label, selects the closest reviewed source metadata.
  const commonPath = (source) => {
    const path = new URL(source.url).pathname.split("/").filter(Boolean);
    const articlePath = url.pathname.split("/").filter(Boolean);
    let count = 0;
    while (count < Math.min(path.length, articlePath.length) && path[count] === articlePath[count]) count++;
    return count;
  };
  const source = matches.map((entry, index) => ({ entry, index, score: commonPath(entry) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0].entry;
  url.hash = "";
  if (source.itemPathPolicy === "append-trailing-slash" && url.pathname !== "/" && !url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMETER.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return { url: url.href, source };
}
