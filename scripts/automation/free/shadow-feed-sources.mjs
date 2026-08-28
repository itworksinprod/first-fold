import { FREE_DESKS } from "./feed-engine.mjs";
import { FREE_FEED_SOURCES } from "./feed-sources.mjs";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/**
 * Trial-only sources. They are deliberately kept outside FREE_FEED_SOURCES:
 * the shadow observer may count their usable entries, but it cannot nominate
 * or publish a story.
 */
export const SHADOW_FEED_SOURCES = deepFreeze([
  {
    id: "together-ai-blog",
    publisher: "Together AI",
    publisherKey: "together-ai",
    primaryEntity: "Together AI",
    relationship: "originating",
    format: "xml",
    url: "https://www.together.ai/blog/rss.xml",
    feedHosts: ["www.together.ai"],
    itemHosts: ["www.together.ai"],
    coverageDesks: ["ai"],
    deskPriors: { ai: 24 },
  },
  {
    id: "cohere-release-notes",
    publisher: "Cohere Release Notes",
    publisherKey: "cohere",
    primaryEntity: "Cohere",
    relationship: "originating",
    format: "xml",
    url: "https://docs.cohere.com/changelog.rss",
    feedHosts: ["docs.cohere.com"],
    itemHosts: ["docs.cohere.com"],
    coverageDesks: ["ai"],
    deskPriors: { ai: 24 },
  },
  {
    id: "tailscale-blog",
    publisher: "Tailscale Blog",
    publisherKey: "tailscale",
    primaryEntity: "Tailscale",
    relationship: "originating",
    format: "xml",
    url: "https://tailscale.com/blog/index.xml",
    feedHosts: ["tailscale.com"],
    itemHosts: ["tailscale.com"],
    coverageDesks: ["work-and-tools"],
    deskPriors: { "work-and-tools": 24 },
  },
  {
    id: "sentry-blog",
    publisher: "Sentry Blog",
    publisherKey: "sentry",
    primaryEntity: "Sentry",
    relationship: "originating",
    format: "xml",
    url: "https://blog.sentry.io/feed.xml",
    feedHosts: ["blog.sentry.io"],
    itemHosts: ["blog.sentry.io"],
    coverageDesks: ["work-and-tools"],
    deskPriors: { "work-and-tools": 24 },
  },
  {
    id: "unit-42",
    publisher: "Unit 42",
    publisherKey: "palo-alto-networks",
    primaryEntity: "Palo Alto Networks",
    relationship: "originating",
    format: "xml",
    url: "https://unit42.paloaltonetworks.com/feed/",
    feedHosts: ["unit42.paloaltonetworks.com"],
    itemHosts: ["unit42.paloaltonetworks.com"],
    coverageDesks: ["security-and-privacy"],
    deskPriors: { "security-and-privacy": 28 },
  },
  {
    id: "krebs-on-security",
    publisher: "KrebsOnSecurity",
    publisherKey: "krebs-on-security",
    primaryEntity: null,
    relationship: "independent",
    format: "xml",
    url: "https://krebsonsecurity.com/feed/",
    feedHosts: ["krebsonsecurity.com"],
    itemHosts: ["krebsonsecurity.com"],
    coverageDesks: ["security-and-privacy"],
    deskPriors: { "security-and-privacy": 26 },
  },
  {
    id: "rest-of-world-tech-giants",
    publisher: "Rest of World Tech Giants",
    publisherKey: "rest-of-world-media",
    primaryEntity: null,
    relationship: "independent",
    format: "xml",
    url: "https://restofworld.org/feed/series/tech-giants/",
    feedHosts: ["restofworld.org"],
    itemHosts: ["restofworld.org"],
    coverageDesks: ["platforms-and-power"],
    deskPriors: { "platforms-and-power": 26 },
  },
  {
    id: "eff-updates",
    publisher: "EFF Updates",
    publisherKey: "electronic-frontier-foundation",
    primaryEntity: null,
    relationship: "independent",
    format: "xml",
    url: "https://www.eff.org/rss/updates.xml",
    feedHosts: ["www.eff.org"],
    itemHosts: ["www.eff.org"],
    coverageDesks: ["platforms-and-power"],
    deskPriors: { "platforms-and-power": 26 },
  },
]);

export function assertShadowFeedSourceManifest(
  shadowSources = SHADOW_FEED_SOURCES,
  productionSources = FREE_FEED_SOURCES,
) {
  if (!Array.isArray(shadowSources) || shadowSources.length !== 8) {
    throw new Error("The shadow feed trial must contain exactly eight sources.");
  }
  const ids = new Set();
  const owners = new Set();
  const productionIds = new Set(productionSources.map((source) => source.id));
  const productionUrls = new Set(productionSources.map((source) => source.url));
  const productionOwners = new Set(productionSources.map((source) => source.publisherKey));
  const countsByDesk = Object.fromEntries(FREE_DESKS.map((desk) => [desk, 0]));
  for (const source of shadowSources) {
    if (!Object.isFrozen(source) || !Object.isFrozen(source.feedHosts) ||
        !Object.isFrozen(source.itemHosts) || !Object.isFrozen(source.coverageDesks) ||
        !Object.isFrozen(source.deskPriors)) {
      throw new Error(`Shadow feed source ${source?.id ?? "(unknown)"} must be deeply frozen.`);
    }
    if (ids.has(source.id) || owners.has(source.publisherKey)) {
      throw new Error("Shadow feed source ids and owners must be distinct.");
    }
    if (
      productionIds.has(source.id) ||
      productionUrls.has(source.url) ||
      productionOwners.has(source.publisherKey)
    ) {
      throw new Error(`Shadow feed source ${source.id} overlaps the production manifest.`);
    }
    if (source.coverageDesks.length !== 1 || !FREE_DESKS.includes(source.coverageDesks[0])) {
      throw new Error(`Shadow feed source ${source.id} must cover exactly one known desk.`);
    }
    ids.add(source.id);
    owners.add(source.publisherKey);
    countsByDesk[source.coverageDesks[0]] += 1;
  }
  if (FREE_DESKS.some((desk) => countsByDesk[desk] !== 2)) {
    throw new Error("The shadow feed trial must contain exactly two sources per desk.");
  }
  return shadowSources;
}

assertShadowFeedSourceManifest();
