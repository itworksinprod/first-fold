import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const DESKS = [
  "ai",
  "work-and-tools",
  "security-and-privacy",
  "platforms-and-power",
];

const SOURCE_RELATIONSHIPS = new Set([
  "originating",
  "independent",
  "context",
]);

const VERIFICATION_LEVELS = new Set([
  "confirmed",
  "company-claimed",
  "preliminary",
  "disputed",
]);

const SEARCH_HOSTS = new Set([
  "bing.com",
  "duckduckgo.com",
  "google.com",
  "search.yahoo.com",
  "www.bing.com",
  "www.google.com",
]);

const PRIVATE_HOST_SUFFIXES = [
  ".home",
  ".internal",
  ".lan",
  ".local",
  ".localhost",
];

const PRIVATE_HOSTS = new Set([
  "home",
  "internal",
  "lan",
  "local",
  "localhost",
]);

const TRACKING_PARAMETER = /^(?:utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid)$/i;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseInstant(value) {
  if (typeof value !== "string") return Number.NaN;
  const match = INSTANT_PATTERN.exec(value);
  if (!match) return Number.NaN;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = ""] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction.padEnd(3, "0").slice(0, 3));

  if (
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return Number.NaN;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return Number.NaN;

  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, second, millisecond);
  return instant.getTime();
}

function isInstant(value) {
  return Number.isFinite(parseInstant(value));
}

function inWindow(instant, start, end) {
  const value = parseInstant(instant);
  return value >= start && value < end;
}

function createIssue(code, path, message, extras = {}) {
  return {
    code,
    severity: "error",
    path,
    message,
    ...extras,
  };
}

function ipv4Parts(address) {
  if (isIP(address) !== 4) return null;
  return address.split(".").map(Number);
}

function isPublicIpv4(address) {
  const parts = ipv4Parts(address);
  if (!parts) return false;
  const [a, b, c, d] = parts;

  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 31 && c === 196) return false;
  if (a === 192 && b === 52 && c === 193) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 175 && c === 48) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  if (a === 255 && b === 255 && c === 255 && d === 255) return false;
  return true;
}

function expandIpv6(address) {
  let value = address.toLowerCase();
  if (value.startsWith("[") && value.endsWith("]")) {
    value = value.slice(1, -1);
  }
  value = value.split("%")[0];

  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const embedded = value.slice(lastColon + 1);
    const parts = ipv4Parts(embedded);
    if (!parts) return null;
    const high = ((parts[0] << 8) | parts[1]).toString(16);
    const low = ((parts[2] << 8) | parts[3]).toString(16);
    value = `${value.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const omitted = 8 - left.length - right.length;
  if ((halves.length === 1 && omitted !== 0) || omitted < 0) return null;

  const groups = [
    ...left,
    ...Array(halves.length === 2 ? omitted : 0).fill("0"),
    ...right,
  ];
  if (groups.length !== 8) return null;
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

function hasIpv6Prefix(groups, prefixAddress, prefixLength) {
  const prefix = expandIpv6(prefixAddress);
  if (!prefix) return false;

  let remainingBits = prefixLength;
  for (let index = 0; index < groups.length && remainingBits > 0; index += 1) {
    const bits = Math.min(remainingBits, 16);
    const mask = (0xffff << (16 - bits)) & 0xffff;
    if ((groups[index] & mask) !== (prefix[index] & mask)) return false;
    remainingBits -= bits;
  }
  return remainingBits === 0;
}

function isPublicIpv6(address) {
  const groups = expandIpv6(address);
  if (!groups) return false;

  // Literal source addresses only need normal globally routed unicast space.
  // This excludes loopback, ULA, link-local, multicast, transition, and
  // documentation ranges without relying on a mutable DNS classification.
  // Block IANA special-purpose prefixes rather than relying only on broad
  // global-unicast syntax. Even globally reachable protocol anycast space is
  // not a valid destination for a cited web page.
  const blockedPrefixes = [
    ["64:ff9b::", 96],
    ["64:ff9b:1::", 48],
    ["100::", 64],
    ["100:0:0:1::", 64],
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["2620:4f:8000::", 48],
    ["3ffe::", 16],
    ["3fff::", 20],
    ["5f00::", 16],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ];
  if (blockedPrefixes.some(([prefix, length]) =>
    hasIpv6Prefix(groups, prefix, length))) {
    return false;
  }
  if ((groups[0] & 0xe000) !== 0x2000) return false;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return false;
  return true;
}

export function isPublicNetworkAddress(address) {
  if (typeof address !== "string") return false;
  const family = isIP(address.replace(/^\[|\]$/g, ""));
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function inspectSourceUrl(value) {
  if (!nonEmptyString(value)) {
    return {
      ok: false,
      code: "SOURCE_URL_INVALID",
      message: "Source URL must be a non-empty absolute URL.",
    };
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return {
      ok: false,
      code: "SOURCE_URL_INVALID",
      message: "Source URL must be a valid absolute URL.",
    };
  }

  if (url.protocol !== "https:") {
    return {
      ok: false,
      code: "SOURCE_URL_NOT_HTTPS",
      message: "Source URL must use HTTPS.",
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      code: "SOURCE_URL_CREDENTIALS",
      message: "Source URL must not contain embedded credentials.",
    };
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const bareHostname = hostname.replace(/^\[|\]$/g, "");
  if (
    PRIVATE_HOSTS.has(hostname) ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return {
      ok: false,
      code: "SOURCE_URL_PRIVATE_HOST",
      message: "Source URL must not target a private or loopback hostname.",
    };
  }
  if (isIP(bareHostname) && !isPublicNetworkAddress(bareHostname)) {
    return {
      ok: false,
      code: "SOURCE_URL_PRIVATE_HOST",
      message: "Source URL must not target a non-public IP address.",
    };
  }
  if (SEARCH_HOSTS.has(hostname)) {
    return {
      ok: false,
      code: "SOURCE_URL_SEARCH_PAGE",
      message: "Source URL must point to the cited page, not a search-results page.",
    };
  }

  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMETER.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();

  return {
    ok: true,
    normalized: url.href,
    hostname: bareHostname,
  };
}

/**
 * Normalize only equivalence-preserving URL details used by Responses source
 * grounding: URL parser normalization, fragments, known tracking parameters,
 * and query order. Unsafe or non-HTTPS URLs return null.
 */
export function normalizeSourceUrl(value) {
  const inspected = inspectSourceUrl(value);
  return inspected.ok ? inspected.normalized : null;
}

function sourceCandidates(value) {
  if (Array.isArray(value) || value instanceof Set) return [...value];
  if (Array.isArray(value?.sources)) return value.sources;
  if (Array.isArray(value?.action?.sources)) return value.action.sources;
  return [];
}

export function buildSourceUrlAllowlist(searchSources) {
  const allowlist = new Set();
  for (const source of sourceCandidates(searchSources)) {
    const candidate = typeof source === "string" ? source : source?.url;
    const normalized = normalizeSourceUrl(candidate);
    if (normalized) allowlist.add(normalized);
  }
  return allowlist;
}

export function sourceUrlMatchesAllowlist(sourceUrl, searchSources) {
  const normalized = normalizeSourceUrl(sourceUrl);
  if (!normalized) return false;
  return buildSourceUrlAllowlist(searchSources).has(normalized);
}

function collectPriorEventKeys(priorEditions) {
  const keys = new Set();
  for (const edition of Array.isArray(priorEditions) ? priorEditions : []) {
    if (!isObject(edition?.desks)) continue;
    for (const desk of DESKS) {
      const key = edition.desks[desk]?.story?.canonicalEventKey;
      if (nonEmptyString(key)) keys.add(key);
    }
  }
  return keys;
}

function statusForIssues(issues) {
  if (issues.some((item) => item.severity === "error")) return "failed";
  if (issues.some((item) => item.severity === "warning")) return "warnings";
  return "passed";
}

function finalizeSourceCheck({ checkedAt, checkedSourceCount, issues }) {
  return {
    status: statusForIssues(issues),
    checkedAt,
    checkedSourceCount,
    issues,
  };
}

function requireNonBlankFields(issues, value, path, fields, label) {
  for (const field of fields) {
    if (!nonEmptyString(value?.[field])) {
      issues.push(
        createIssue(
          "EDITORIAL_TEXT_MISSING",
          `${path}.${field}`,
          `${label} requires non-blank ${field}.`,
        ),
      );
    }
  }
}

function analyzeNewsroomDraft(edition, options = {}) {
  const issues = [];
  const linkCandidates = [];
  let checkedSourceCount = 0;

  if (!isObject(options)) {
    issues.push(
      createIssue(
        "QA_OPTIONS_INVALID",
        "sourceCheck",
        "Newsroom QA options must be an object.",
      ),
    );
    options = {};
  }

  const checkedAt = options.checkedAt ?? null;
  if (checkedAt !== null && !isInstant(checkedAt)) {
    issues.push(
      createIssue(
        "CHECKED_AT_INVALID",
        "sourceCheck.checkedAt",
        "checkedAt must be a UTC ISO instant or null.",
      ),
    );
  }

  if (!isObject(edition)) {
    issues.push(
      createIssue(
        "EDITION_NOT_OBJECT",
        "$",
        "Edition must be an object before newsroom QA can run.",
      ),
    );
    return {
      checkedAt: isInstant(checkedAt) ? checkedAt : null,
      checkedSourceCount,
      issues,
      linkCandidates,
    };
  }

  const windowStart = parseInstant(edition.reportingWindow?.startInclusive);
  const windowEnd = parseInstant(edition.reportingWindow?.endExclusive);
  if (
    !Number.isFinite(windowStart) ||
    !Number.isFinite(windowEnd) ||
    windowStart >= windowEnd
  ) {
    issues.push(
      createIssue(
        "REPORTING_WINDOW_INVALID",
        "reportingWindow",
        "Reporting window must contain valid UTC instants with start before end.",
      ),
    );
  }

  const generatedAt = parseInstant(edition.publication?.generatedAt);
  if (!Number.isFinite(generatedAt)) {
    issues.push(
      createIssue(
        "GENERATED_AT_INVALID",
        "publication.generatedAt",
        "publication.generatedAt must be a valid UTC ISO instant.",
      ),
    );
  }

  const publishAt = parseInstant(edition.publication?.publishAt);
  if (!Number.isFinite(publishAt)) {
    issues.push(
      createIssue(
        "PUBLISH_AT_INVALID",
        "publication.publishAt",
        "publication.publishAt must be a valid UTC ISO instant.",
      ),
    );
  } else if (Number.isFinite(generatedAt) && generatedAt > publishAt) {
    issues.push(
      createIssue(
        "GENERATED_AFTER_PUBLICATION",
        "publication.generatedAt",
        "The edition cannot be generated after its scheduled publication instant.",
      ),
    );
  }

  if (edition.status === "published") {
    if (!isInstant(edition.publication?.publishedAt)) {
      issues.push(
        createIssue(
          "PUBLISHED_AT_MISSING",
          "publication.publishedAt",
          "A published edition requires a valid publishedAt instant.",
        ),
      );
    }
  } else if (
    ["draft", "validated"].includes(edition.status) &&
    edition.publication?.publishedAt !== null
  ) {
    issues.push(
      createIssue(
        "UNPUBLISHED_HAS_PUBLISHED_AT",
        "publication.publishedAt",
        "A draft or validated edition must keep publishedAt null.",
      ),
    );
  }

  requireNonBlankFields(
    issues,
    edition.frontPage,
    "frontPage",
    ["note"],
    "Front-page editorial copy",
  );

  if (options.priorEditions !== undefined && !Array.isArray(options.priorEditions)) {
    issues.push(
      createIssue(
        "PRIOR_EDITIONS_INVALID",
        "sourceCheck.priorEditions",
        "priorEditions must be an array when supplied.",
      ),
    );
  }
  const priorEventKeys = collectPriorEventKeys(options.priorEditions);
  const allowlistWasProvided = options.allowedSourceUrls !== undefined;
  const sourceAllowlist = allowlistWasProvided
    ? buildSourceUrlAllowlist(options.allowedSourceUrls)
    : null;

  if (!isObject(edition.desks)) {
    issues.push(
      createIssue(
        "DESKS_MISSING",
        "desks",
        "Edition desks must be present before source QA can run.",
      ),
    );
  }

  for (const desk of DESKS) {
    const pagePath = `desks.${desk}`;
    const page = edition.desks?.[desk];
    if (!isObject(page)) {
      issues.push(
        createIssue(
          "DESK_MISSING",
          pagePath,
          `Desk ${desk} is missing or invalid.`,
        ),
      );
      continue;
    }
    if (page.story === null) {
      requireNonBlankFields(
        issues,
        page,
        pagePath,
        ["emptyReason"],
        `Quiet desk ${desk}`,
      );
      continue;
    }
    if (!isObject(page.story)) {
      issues.push(
        createIssue(
          "STORY_INVALID",
          `${pagePath}.story`,
          "Selected story must be an object or null.",
        ),
      );
      continue;
    }

    const story = page.story;
    const storyPath = `${pagePath}.story`;
    const storyLabel = nonEmptyString(story.id) ? story.id : `${desk} story`;

    requireNonBlankFields(
      issues,
      story,
      storyPath,
      [
        "id",
        "canonicalEventKey",
        "headline",
        "deck",
        "whatHappened",
        "whyItMatters",
        "whatToDoOrWatch",
      ],
      storyLabel,
    );
    requireNonBlankFields(
      issues,
      story.editorial,
      `${storyPath}.editorial`,
      ["primaryEntity", "deskFit"],
      `${storyLabel} editorial classification`,
    );
    requireNonBlankFields(
      issues,
      story.selection,
      `${storyPath}.selection`,
      ["selectedBecause"],
      `${storyLabel} selection`,
    );
    requireNonBlankFields(
      issues,
      story.confidence,
      `${storyPath}.confidence`,
      ["rationale"],
      `${storyLabel} confidence`,
    );
    if (story.securityAction !== undefined && story.securityAction !== null) {
      if (!isObject(story.securityAction)) {
        issues.push(
          createIssue(
            "SECURITY_ACTION_INVALID",
            `${storyPath}.securityAction`,
            `${storyLabel} security action must be an object or absent.`,
          ),
        );
      } else {
        requireNonBlankFields(
          issues,
          story.securityAction,
          `${storyPath}.securityAction`,
          ["affected", "action"],
          `${storyLabel} security action`,
        );
        if (
          story.securityAction.deadline !== null &&
          !nonEmptyString(story.securityAction.deadline)
        ) {
          issues.push(
            createIssue(
              "EDITORIAL_TEXT_MISSING",
              `${storyPath}.securityAction.deadline`,
              `${storyLabel} security action deadline must be non-blank or null.`,
            ),
          );
        }
      }
    }

    const firstPublishedAt = parseInstant(story.timing?.firstPublishedAt);
    const eventAt = story.timing?.eventAt === null
      ? null
      : parseInstant(story.timing?.eventAt);
    const materiallyUpdatedAt = story.timing?.materiallyUpdatedAt === null
      ? null
      : parseInstant(story.timing?.materiallyUpdatedAt);

    if (!Number.isFinite(firstPublishedAt)) {
      issues.push(
        createIssue(
          "FIRST_PUBLISHED_AT_INVALID",
          `${storyPath}.timing.firstPublishedAt`,
          `${storyLabel} needs a valid firstPublishedAt UTC instant.`,
        ),
      );
    }
    if (story.timing?.eventAt !== null && !Number.isFinite(eventAt)) {
      issues.push(
        createIssue(
          "EVENT_AT_INVALID",
          `${storyPath}.timing.eventAt`,
          `${storyLabel} has an invalid eventAt timestamp.`,
        ),
      );
    }

    if (story.status === "material-update") {
      if (!Number.isFinite(materiallyUpdatedAt)) {
        issues.push(
          createIssue(
            "MATERIAL_UPDATE_TIMESTAMP_MISSING",
            `${storyPath}.timing.materiallyUpdatedAt`,
            `${storyLabel} is a material update without a valid update timestamp.`,
          ),
        );
      } else {
        if (
          Number.isFinite(windowStart) &&
          Number.isFinite(windowEnd) &&
          !inWindow(story.timing.materiallyUpdatedAt, windowStart, windowEnd)
        ) {
          issues.push(
            createIssue(
              "MATERIAL_UPDATE_OUTSIDE_WINDOW",
              `${storyPath}.timing.materiallyUpdatedAt`,
              `${storyLabel} has a material update outside the reporting window.`,
            ),
          );
        }
        if (
          Number.isFinite(firstPublishedAt) &&
          materiallyUpdatedAt < firstPublishedAt
        ) {
          issues.push(
            createIssue(
              "MATERIAL_UPDATE_BEFORE_PUBLICATION",
              `${storyPath}.timing.materiallyUpdatedAt`,
              `${storyLabel} has a material update before its first publication.`,
            ),
          );
        }
      }
      if (!nonEmptyString(story.selection?.materialDelta)) {
        issues.push(
          createIssue(
            "MATERIAL_DELTA_MISSING",
            `${storyPath}.selection.materialDelta`,
            `${storyLabel} must name the in-window material delta.`,
          ),
        );
      }
    } else if (story.status === "new-development") {
      const eligibleAt = Number.isFinite(eventAt) ? eventAt : firstPublishedAt;
      if (
        Number.isFinite(eligibleAt) &&
        Number.isFinite(windowStart) &&
        Number.isFinite(windowEnd) &&
        (eligibleAt < windowStart || eligibleAt >= windowEnd)
      ) {
        issues.push(
          createIssue(
            "NEW_DEVELOPMENT_OUTSIDE_WINDOW",
            `${storyPath}.timing`,
            `${storyLabel} is outside the reporting window.`,
          ),
        );
      }
      if (story.timing?.materiallyUpdatedAt !== null) {
        issues.push(
          createIssue(
            "NEW_DEVELOPMENT_HAS_UPDATE_TIMESTAMP",
            `${storyPath}.timing.materiallyUpdatedAt`,
            `${storyLabel} is new but carries a material-update timestamp.`,
          ),
        );
      }
      if (story.selection?.materialDelta !== null) {
        issues.push(
          createIssue(
            "NEW_DEVELOPMENT_HAS_MATERIAL_DELTA",
            `${storyPath}.selection.materialDelta`,
            `${storyLabel} is new but carries a material-update delta.`,
          ),
        );
      }
    } else {
      issues.push(
        createIssue(
          "STORY_STATUS_INVALID",
          `${storyPath}.status`,
          `${storyLabel} must be new-development or material-update.`,
        ),
      );
    }

    if (
      nonEmptyString(story.canonicalEventKey) &&
      priorEventKeys.has(story.canonicalEventKey) &&
      story.status !== "material-update"
    ) {
      issues.push(
        createIssue(
          "REPEATED_EVENT_NOT_MATERIAL_UPDATE",
          `${storyPath}.canonicalEventKey`,
          `${storyLabel} repeats a previously covered event without an eligible material update.`,
        ),
      );
    }

    const sources = story.sources;
    const sourceById = new Map();
    const distinctSourceUrls = new Set();
    const sourceRelationships = new Set();
    if (!Array.isArray(sources) || sources.length === 0) {
      issues.push(
        createIssue(
          "SOURCE_LIST_MISSING",
          `${storyPath}.sources`,
          `${storyLabel} needs at least two source records.`,
        ),
      );
    } else {
      for (const [sourceIndex, source] of sources.entries()) {
        checkedSourceCount += 1;
        const sourcePath = `${storyPath}.sources[${sourceIndex}]`;
        if (!isObject(source)) {
          issues.push(
            createIssue(
              "SOURCE_INVALID",
              sourcePath,
              `${storyLabel} contains a non-object source record.`,
            ),
          );
          continue;
        }

        if (!nonEmptyString(source.id)) {
          issues.push(
            createIssue(
              "SOURCE_ID_MISSING",
              `${sourcePath}.id`,
              `${storyLabel} contains a source without an id.`,
            ),
          );
        } else if (sourceById.has(source.id)) {
          issues.push(
            createIssue(
              "SOURCE_ID_DUPLICATE",
              `${sourcePath}.id`,
              `${storyLabel} repeats source id ${source.id}.`,
            ),
          );
        } else {
          sourceById.set(source.id, source);
        }

        if (!nonEmptyString(source.title) || !nonEmptyString(source.publisher)) {
          issues.push(
            createIssue(
              "SOURCE_METADATA_MISSING",
              sourcePath,
              `${storyLabel} source metadata needs a title and publisher.`,
            ),
          );
        }
        if (!SOURCE_RELATIONSHIPS.has(source.relationship)) {
          issues.push(
            createIssue(
              "SOURCE_RELATIONSHIP_INVALID",
              `${sourcePath}.relationship`,
              `${storyLabel} contains an invalid source relationship.`,
            ),
          );
        } else {
          sourceRelationships.add(source.relationship);
        }

        const inspectedUrl = inspectSourceUrl(source.url);
        let grounded = !allowlistWasProvided;
        if (!inspectedUrl.ok) {
          issues.push(
            createIssue(
              inspectedUrl.code,
              `${sourcePath}.url`,
              inspectedUrl.message,
              { url: typeof source.url === "string" ? source.url : null },
            ),
          );
        } else {
          distinctSourceUrls.add(inspectedUrl.normalized);
          if (sourceAllowlist) {
            grounded = sourceAllowlist.has(inspectedUrl.normalized);
            if (!grounded) {
              issues.push(
                createIssue(
                  "SOURCE_URL_NOT_GROUNDED",
                  `${sourcePath}.url`,
                  `${storyLabel} cites a URL absent from the web-search source allowlist.`,
                  { url: source.url },
                ),
              );
            }
          }
          linkCandidates.push({
            path: `${sourcePath}.url`,
            storyId: story.id ?? null,
            sourceId: source.id ?? null,
            url: source.url,
            normalizedUrl: inspectedUrl.normalized,
            grounded,
          });
        }

        const publishedAt = source.publishedAt === null
          ? null
          : parseInstant(source.publishedAt);
        const retrievedAt = parseInstant(source.retrievedAt);
        if (source.publishedAt !== null && !Number.isFinite(publishedAt)) {
          issues.push(
            createIssue(
              "SOURCE_PUBLISHED_AT_INVALID",
              `${sourcePath}.publishedAt`,
              `${storyLabel} contains an invalid source publication timestamp.`,
            ),
          );
        }
        if (!Number.isFinite(retrievedAt)) {
          issues.push(
            createIssue(
              "SOURCE_RETRIEVED_AT_INVALID",
              `${sourcePath}.retrievedAt`,
              `${storyLabel} contains an invalid source retrieval timestamp.`,
            ),
          );
        } else {
          if (Number.isFinite(publishedAt) && retrievedAt < publishedAt) {
            issues.push(
              createIssue(
                "SOURCE_RETRIEVED_BEFORE_PUBLICATION",
                `${sourcePath}.retrievedAt`,
                `${storyLabel} retrieved a source before its stated publication time.`,
              ),
            );
          }
          if (Number.isFinite(generatedAt) && retrievedAt > generatedAt) {
            issues.push(
              createIssue(
                "SOURCE_RETRIEVED_AFTER_GENERATION",
                `${sourcePath}.retrievedAt`,
                `${storyLabel} contains a source retrieved after edition generation.`,
              ),
            );
          }
          if (Number.isFinite(publishAt) && retrievedAt > publishAt) {
            issues.push(
              createIssue(
                "SOURCE_RETRIEVED_AFTER_PUBLICATION",
                `${sourcePath}.retrievedAt`,
                `${storyLabel} contains a source retrieved after scheduled publication.`,
              ),
            );
          }
        }
      }
    }

    if (distinctSourceUrls.size < 2) {
      issues.push(
        createIssue(
          "INSUFFICIENT_DISTINCT_SOURCES",
          `${storyPath}.sources`,
          `${storyLabel} needs at least two distinct, valid source URLs.`,
        ),
      );
    }
    if (
      !sourceRelationships.has("originating") &&
      !sourceRelationships.has("independent")
    ) {
      issues.push(
        createIssue(
          "STORY_LACKS_AUTHORITATIVE_SOURCE",
          `${storyPath}.sources`,
          `${storyLabel} needs at least one originating or independent source.`,
        ),
      );
    }
    if (
      story.priority === "critical" &&
      (!sourceRelationships.has("originating") ||
        !sourceRelationships.has("independent"))
    ) {
      issues.push(
        createIssue(
          "CRITICAL_STORY_SOURCE_MIX",
          `${storyPath}.sources`,
          `${storyLabel} is critical and needs both originating and independent sources.`,
        ),
      );
    }

    const evidence = story.evidence;
    const evidenceIds = new Set();
    const citedRelationships = new Set();
    if (!Array.isArray(evidence) || evidence.length === 0) {
      issues.push(
        createIssue(
          "EVIDENCE_LIST_MISSING",
          `${storyPath}.evidence`,
          `${storyLabel} needs mapped evidence claims.`,
        ),
      );
    } else {
      for (const [claimIndex, claim] of evidence.entries()) {
        const claimPath = `${storyPath}.evidence[${claimIndex}]`;
        if (!isObject(claim)) {
          issues.push(
            createIssue(
              "EVIDENCE_INVALID",
              claimPath,
              `${storyLabel} contains a non-object evidence claim.`,
            ),
          );
          continue;
        }

        if (!nonEmptyString(claim.id)) {
          issues.push(
            createIssue(
              "EVIDENCE_ID_MISSING",
              `${claimPath}.id`,
              `${storyLabel} contains an evidence claim without an id.`,
            ),
          );
        } else if (evidenceIds.has(claim.id)) {
          issues.push(
            createIssue(
              "EVIDENCE_ID_DUPLICATE",
              `${claimPath}.id`,
              `${storyLabel} repeats evidence id ${claim.id}.`,
            ),
          );
        } else {
          evidenceIds.add(claim.id);
        }

        if (!nonEmptyString(claim.statement)) {
          issues.push(
            createIssue(
              "EVIDENCE_STATEMENT_MISSING",
              `${claimPath}.statement`,
              `${storyLabel} contains an evidence claim without a statement.`,
            ),
          );
        }
        if (!VERIFICATION_LEVELS.has(claim.verification)) {
          issues.push(
            createIssue(
              "EVIDENCE_VERIFICATION_INVALID",
              `${claimPath}.verification`,
              `${storyLabel} contains an invalid evidence verification level.`,
            ),
          );
        }
        if (!Array.isArray(claim.sourceIds) || claim.sourceIds.length === 0) {
          issues.push(
            createIssue(
              "EVIDENCE_SOURCE_IDS_MISSING",
              `${claimPath}.sourceIds`,
              `${storyLabel} claim ${claim.id ?? claimIndex + 1} has no source ids.`,
            ),
          );
          continue;
        }

        const claimSourceIds = new Set();
        const claimRelationships = [];
        for (const [sourceIdIndex, sourceId] of claim.sourceIds.entries()) {
          const sourceIdPath = `${claimPath}.sourceIds[${sourceIdIndex}]`;
          if (!nonEmptyString(sourceId)) {
            issues.push(
              createIssue(
                "EVIDENCE_SOURCE_ID_INVALID",
                sourceIdPath,
                `${storyLabel} contains an invalid evidence source id.`,
              ),
            );
            continue;
          }
          if (claimSourceIds.has(sourceId)) {
            issues.push(
              createIssue(
                "EVIDENCE_SOURCE_ID_DUPLICATE",
                sourceIdPath,
                `${storyLabel} claim ${claim.id} repeats source id ${sourceId}.`,
              ),
            );
          }
          claimSourceIds.add(sourceId);
          const source = sourceById.get(sourceId);
          if (!source) {
            issues.push(
              createIssue(
                "EVIDENCE_SOURCE_UNKNOWN",
                sourceIdPath,
                `${storyLabel} claim ${claim.id} references unknown source ${sourceId}.`,
              ),
            );
          } else if (SOURCE_RELATIONSHIPS.has(source.relationship)) {
            claimRelationships.push(source.relationship);
            citedRelationships.add(source.relationship);
          }
        }

        if (
          claim.verification === "confirmed" &&
          claimRelationships.length > 0 &&
          claimRelationships.every((relationship) => relationship === "context")
        ) {
          issues.push(
            createIssue(
              "CONFIRMED_CLAIM_CONTEXT_ONLY",
              `${claimPath}.verification`,
              `${storyLabel} marks a claim confirmed using context-only sources.`,
            ),
          );
        }
      }
    }

    if (
      !citedRelationships.has("originating") &&
      !citedRelationships.has("independent")
    ) {
      issues.push(
        createIssue(
          "EVIDENCE_LACKS_AUTHORITATIVE_SOURCE",
          `${storyPath}.evidence`,
          `${storyLabel} evidence must cite at least one originating or independent source.`,
        ),
      );
    }
    if (
      story.priority === "critical" &&
      (!citedRelationships.has("originating") ||
        !citedRelationships.has("independent"))
    ) {
      issues.push(
        createIssue(
          "CRITICAL_STORY_EVIDENCE_MIX",
          `${storyPath}.evidence`,
          `${storyLabel} evidence must cite both originating and independent sources.`,
        ),
      );
    }
  }

  const experiment = edition.backPage?.tryThisTomorrow;
  if (experiment !== undefined && experiment !== null) {
    if (!isObject(experiment)) {
      issues.push(
        createIssue(
          "EXPERIMENT_INVALID",
          "backPage.tryThisTomorrow",
          "Try This Tomorrow must be an object or null.",
        ),
      );
    } else {
      requireNonBlankFields(
        issues,
        experiment,
        "backPage.tryThisTomorrow",
        ["title", "goal", "successMeasure", "riskCheck"],
        "Try This Tomorrow",
      );
      if (!Array.isArray(experiment.steps)) {
        issues.push(
          createIssue(
            "EXPERIMENT_STEPS_INVALID",
            "backPage.tryThisTomorrow.steps",
            "Try This Tomorrow steps must be an array.",
          ),
        );
      } else {
        for (const [index, step] of experiment.steps.entries()) {
          if (!nonEmptyString(step)) {
            issues.push(
              createIssue(
                "EDITORIAL_TEXT_MISSING",
                `backPage.tryThisTomorrow.steps[${index}]`,
                "Try This Tomorrow steps must be non-blank.",
              ),
            );
          }
        }
      }
    }
  }

  if (options.requireEmptyWatchNext !== false) {
    const watchNext = edition.backPage?.watchNext;
    if (!Array.isArray(watchNext)) {
      issues.push(
        createIssue(
          "WATCH_NEXT_INVALID",
          "backPage.watchNext",
          "Automated editions must provide Watch Next as an array.",
        ),
      );
    } else if (watchNext.length > 0) {
      issues.push(
        createIssue(
          "WATCH_NEXT_UNSOURCED",
          "backPage.watchNext",
          "Automated editions must leave Watch Next empty until its claims support source mappings.",
        ),
      );
    }
  }

  return {
    checkedAt: isInstant(checkedAt) ? checkedAt : null,
    checkedSourceCount,
    issues,
    linkCandidates,
  };
}

/**
 * Pure deterministic QA. The caller supplies prior editions, the exact
 * Responses web-search source list, and checkedAt; the helper never reads the
 * clock, filesystem, DNS, or network.
 */
export function validateNewsroomDraft(edition, options = {}) {
  const analysis = analyzeNewsroomDraft(edition, options);
  return finalizeSourceCheck(analysis);
}

class QaTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "QaTimeoutError";
  }
}

async function withTimeout(operation, timeoutMs, onTimeout = () => {}) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          onTimeout();
          reject(new QaTimeoutError(`Operation exceeded ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeLookupResults(results) {
  const values = Array.isArray(results) ? results : [results];
  return values
    .map((item) => (typeof item === "string" ? item : item?.address))
    .filter(nonEmptyString);
}

async function resolvePublicHost(hostname, { lookupImpl, timeoutMs }) {
  if (isIP(hostname)) {
    return isPublicNetworkAddress(hostname)
      ? { ok: true, addresses: [hostname] }
      : {
          ok: false,
          kind: "unsafe",
          message: `Hostname resolves to non-public address ${hostname}.`,
        };
  }

  let results;
  try {
    results = await withTimeout(
      () => lookupImpl(hostname, { all: true, verbatim: true }),
      timeoutMs,
    );
  } catch (error) {
    return {
      ok: false,
      kind: error instanceof QaTimeoutError ? "timeout" : "dns",
      message: error instanceof QaTimeoutError
        ? `DNS resolution for ${hostname} timed out.`
        : `DNS resolution for ${hostname} failed: ${error?.message ?? String(error)}`,
    };
  }

  const addresses = normalizeLookupResults(results);
  if (addresses.length === 0) {
    return {
      ok: false,
      kind: "dns",
      message: `DNS resolution for ${hostname} returned no addresses.`,
    };
  }
  const unsafeAddress = addresses.find((address) => !isPublicNetworkAddress(address));
  if (unsafeAddress) {
    return {
      ok: false,
      kind: "unsafe",
      message: `Hostname ${hostname} resolves to non-public address ${unsafeAddress}.`,
    };
  }
  return { ok: true, addresses };
}

function pinnedHttpsRequest(url, options) {
  return new Promise((resolve, reject) => {
    const address = options.addresses[0];
    const family = isIP(address);
    let settled = false;
    const request = httpsRequest(url, {
      method: options.method,
      agent: false,
      signal: options.signal,
      servername: isIP(options.hostname) ? undefined : options.hostname,
      headers: {
        accept: "text/html,application/json,application/pdf,*/*;q=0.8",
        connection: "close",
      },
      // Pin the connection to an address that was already classified. This is
      // intentionally not global fetch: a second resolver call would reopen a
      // DNS-rebinding gap between validation and the TCP connection.
      lookup(_hostname, lookupOptions, callback) {
        if (lookupOptions?.all) {
          callback(null, [{ address, family }]);
        } else {
          callback(null, address, family);
        }
      },
    }, (response) => {
      settled = true;
      resolve({ status: response.statusCode, headers: response.headers });
      response.destroy();
    });

    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new QaTimeoutError(`${options.method} request timed out.`));
    });
    request.on("error", (error) => {
      if (!settled) reject(error);
    });
    request.end();
  });
}

function responseHeader(headers, name) {
  if (typeof headers?.get === "function") return headers.get(name);
  const value = headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value ?? null;
}

async function requestFollowingRedirects(startUrl, method, options) {
  let currentUrl = startUrl;
  const redirects = [];

  for (let redirectCount = 0; ; redirectCount += 1) {
    const inspected = inspectSourceUrl(currentUrl);
    if (!inspected.ok) {
      return {
        ok: false,
        kind: "unsafe",
        message: `Unsafe ${method} target: ${inspected.message}`,
        url: currentUrl,
        redirects,
      };
    }

    const resolved = await resolvePublicHost(inspected.hostname, options);
    if (!resolved.ok) {
      return {
        ok: false,
        kind: resolved.kind,
        message: resolved.message,
        url: currentUrl,
        redirects,
      };
    }

    let response;
    const requestController = new AbortController();
    try {
      response = await withTimeout(
        () => options.requestImpl(currentUrl, {
          method,
          timeoutMs: options.timeoutMs,
          addresses: resolved.addresses,
          hostname: inspected.hostname,
          signal: requestController.signal,
        }),
        options.timeoutMs,
        () => requestController.abort(),
      );
    } catch (error) {
      return {
        ok: false,
        kind: error instanceof QaTimeoutError ? "timeout" : "network",
        message: error instanceof QaTimeoutError
          ? `${method} request timed out.`
          : `${method} request failed: ${error?.message ?? String(error)}`,
        url: currentUrl,
        redirects,
      };
    }

    const status = Number(response?.status);
    if (!Number.isInteger(status)) {
      return {
        ok: false,
        kind: "network",
        message: `${method} returned an invalid response status.`,
        url: currentUrl,
        redirects,
      };
    }

    if (!REDIRECT_STATUSES.has(status)) {
      return {
        ok: true,
        status,
        url: currentUrl,
        redirects,
      };
    }

    const location = responseHeader(response.headers, "location");
    if (!location) {
      return {
        ok: false,
        kind: "redirect",
        message: `${method} returned ${status} without a Location header.`,
        url: currentUrl,
        redirects,
      };
    }
    if (redirectCount >= options.maxRedirects) {
      return {
        ok: false,
        kind: "redirect-limit",
        message: `${method} exceeded the ${options.maxRedirects}-redirect limit.`,
        url: currentUrl,
        redirects,
      };
    }

    let nextUrl;
    try {
      nextUrl = new URL(location, currentUrl).href;
    } catch {
      return {
        ok: false,
        kind: "redirect",
        message: `${method} returned an invalid redirect target.`,
        url: currentUrl,
        redirects,
      };
    }
    const nextInspected = inspectSourceUrl(nextUrl);
    if (!nextInspected.ok) {
      return {
        ok: false,
        kind: "unsafe",
        message: `${method} redirected to an unsafe target: ${nextInspected.message}`,
        url: nextUrl,
        redirects,
      };
    }
    redirects.push(nextInspected.normalized);
    currentUrl = nextInspected.normalized;
  }
}

function fatalReachabilityResult(result) {
  return ["unsafe", "redirect", "redirect-limit"].includes(result.kind);
}

async function checkOneLink(url, options) {
  const head = await requestFollowingRedirects(url, "HEAD", options);
  if (head.ok && head.status >= 200 && head.status < 400) return head;
  if (!head.ok && fatalReachabilityResult(head)) return head;

  return requestFollowingRedirects(url, "GET", options);
}

function issueForReachability(result, candidate) {
  const extras = {
    url: candidate.url,
    ...(Number.isInteger(result.status) ? { httpStatus: result.status } : {}),
  };

  if (result.ok) {
    if ([401, 403, 405, 429].includes(result.status)) {
      return {
        ...createIssue(
          "LINK_ACCESS_RESTRICTED",
          candidate.path,
          `Source returned HTTP ${result.status}; access control or bot protection may be responsible.`,
          extras,
        ),
        severity: "warning",
      };
    }
    if (result.status === 404 || result.status === 410) {
      return createIssue(
        "LINK_NOT_FOUND",
        candidate.path,
        `Source returned HTTP ${result.status}.`,
        extras,
      );
    }
    if (result.status < 200 || result.status >= 400) {
      return createIssue(
        "LINK_HTTP_STATUS",
        candidate.path,
        `Source returned HTTP ${result.status}.`,
        extras,
      );
    }
    return null;
  }

  const code = result.kind === "unsafe"
    ? "LINK_UNSAFE_RESOLUTION"
    : result.kind === "timeout"
      ? "LINK_TIMEOUT"
      : result.kind === "dns"
        ? "LINK_DNS_FAILED"
        : result.kind === "redirect-limit"
          ? "LINK_REDIRECT_LIMIT"
          : result.kind === "redirect"
            ? "LINK_REDIRECT_INVALID"
            : "LINK_REQUEST_FAILED";
  return createIssue(code, candidate.path, result.message, extras);
}

/**
 * Full QA with optional reachability. Network checks are opt-in, resolve every
 * hostname before each HEAD/GET request, manually validate redirects, and can
 * inject DNS/pinned-request implementations for deterministic tests.
 */
export async function runNewsroomQa(edition, options = {}) {
  const safeOptions = isObject(options) ? options : {};
  const analysis = analyzeNewsroomDraft(edition, options);

  if (safeOptions.checkLinks === true) {
    const timeoutMs = Number.isInteger(safeOptions.timeoutMs) && safeOptions.timeoutMs > 0
      ? Math.min(safeOptions.timeoutMs, 60_000)
      : 5_000;
    const maxRedirects = Number.isInteger(safeOptions.maxRedirects) && safeOptions.maxRedirects >= 0
      ? Math.min(safeOptions.maxRedirects, 10)
      : 5;
    const networkOptions = {
      requestImpl: safeOptions.requestImpl ?? pinnedHttpsRequest,
      lookupImpl: safeOptions.lookupImpl ?? dnsLookup,
      timeoutMs,
      maxRedirects,
    };

    if (safeOptions.fetchImpl !== undefined && safeOptions.requestImpl === undefined) {
      analysis.issues.push(
        createIssue(
          "LINK_FETCH_UNSAFE",
          "sourceCheck",
          "Fetch-based link checks are disabled because they cannot pin the vetted DNS address; use requestImpl or the built-in pinned HTTPS client.",
        ),
      );
    } else if (typeof networkOptions.requestImpl !== "function") {
      analysis.issues.push(
        createIssue(
          "LINK_REQUEST_UNAVAILABLE",
          "sourceCheck",
          "Link checking was requested but no pinned request implementation is available.",
        ),
      );
    } else if (typeof networkOptions.lookupImpl !== "function") {
      analysis.issues.push(
        createIssue(
          "LINK_DNS_UNAVAILABLE",
          "sourceCheck",
          "Link checking was requested but no DNS implementation is available.",
        ),
      );
    } else {
      const resultsByUrl = new Map();
      for (const candidate of analysis.linkCandidates) {
        // Never request an ungrounded model-emitted URL.
        if (!candidate.grounded) continue;
        let result = resultsByUrl.get(candidate.normalizedUrl);
        if (!result) {
          result = await checkOneLink(candidate.normalizedUrl, networkOptions);
          resultsByUrl.set(candidate.normalizedUrl, result);
        }
        const issue = issueForReachability(result, candidate);
        if (issue) analysis.issues.push(issue);
      }
    }
  }

  return {
    sourceCheck: finalizeSourceCheck(analysis),
  };
}
