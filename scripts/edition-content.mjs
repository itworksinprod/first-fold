import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DESKS = ["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"];
const DESK_PRESENTATION = {
  ai: { id: "ai", label: "AI & Models", page: 2 },
  "work-and-tools": { id: "work-and-tools", label: "Work & Tools", page: 3 },
  "security-and-privacy": { id: "security-and-privacy", label: "Security & Privacy", page: 4 },
  "platforms-and-power": { id: "platforms-and-power", label: "Platforms & Power", page: 5 },
};

const PIPELINE = [
  { time: "05:02", stage: "Discover", status: "complete" },
  { time: "05:15", stage: "Normalize", status: "complete" },
  { time: "05:25", stage: "Verify", status: "complete" },
  { time: "05:38", stage: "Select & write", status: "complete" },
  { time: "05:50", stage: "Validate", status: "complete" },
  { time: "06:00", stage: "Publish", status: "complete" },
];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInstant(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isInWindow(value, startInclusive, endExclusive) {
  const instant = Date.parse(value);
  return instant >= Date.parse(startInclusive) && instant < Date.parse(endExclusive);
}

function isDirectHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !["google.com", "www.google.com", "bing.com", "www.bing.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

function wordCount(value) {
  return value.trim().match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function localClock(instant) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  return `${parts.find((part) => part.type === "hour")?.value}:${parts.find((part) => part.type === "minute")?.value}`;
}

export function validateCanonicalEdition(edition) {
  const issues = [];
  if (!isObject(edition)) return { valid: false, issues: ["Edition must be an object."] };
  if (edition.schemaVersion !== 2) issues.push("Unsupported canonical schema version.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(edition.editionDate ?? "")) issues.push("editionDate must be YYYY-MM-DD.");
  if (edition.timezone !== "America/New_York") issues.push("Timezone must be America/New_York.");
  if (!isObject(edition.desks) || Object.keys(edition.desks).sort().join("|") !== [...DESKS].sort().join("|")) {
    issues.push("Edition must contain exactly the four configured desks.");
    return { valid: false, issues };
  }

  const start = edition.reportingWindow?.startInclusive;
  const end = edition.reportingWindow?.endExclusive;
  if (!isInstant(start) || !isInstant(end) || Date.parse(start) >= Date.parse(end)) issues.push("Reporting window is invalid.");
  if (!isInstant(edition.publication?.publishAt) || localClock(edition.publication.publishAt) !== "06:00") {
    issues.push("Publication must resolve to 06:00 America/New_York.");
  }

  const storyIds = new Set();
  const eventKeys = new Set();
  const selectedStories = [];
  const primaryEntities = new Map();

  for (const desk of DESKS) {
    const page = edition.desks[desk];
    if (!isObject(page) || page.desk !== desk) {
      issues.push(`Desk ${desk} is missing or mislabeled.`);
      continue;
    }
    if (page.story === null) {
      if (typeof page.emptyReason !== "string" || !page.emptyReason.trim()) issues.push(`Quiet desk ${desk} needs an explanation.`);
      continue;
    }

    const story = page.story;
    selectedStories.push(story);
    if (story.desk !== desk) issues.push(`Story ${story.id ?? "unknown"} is filed under the wrong desk.`);
    if (!story.id || storyIds.has(story.id)) issues.push(`Story id ${story.id ?? "missing"} is missing or duplicated.`);
    storyIds.add(story.id);
    if (!story.canonicalEventKey || eventKeys.has(story.canonicalEventKey)) issues.push(`Event key ${story.canonicalEventKey ?? "missing"} is missing or duplicated.`);
    eventKeys.add(story.canonicalEventKey);
    if (!Number.isFinite(story.selection?.score) || story.selection.score < 70 || story.selection.score > 100) {
      issues.push(`Story ${story.id} has an ineligible score.`);
    }

    if (!isObject(story.editorial)) {
      issues.push(`Story ${story.id} has no editorial classification.`);
    } else {
      if (typeof story.editorial.primaryEntity !== "string" || !story.editorial.primaryEntity.trim()) {
        issues.push(`Story ${story.id} has no primary editorial entity.`);
      } else {
        const normalizedEntity = story.editorial.primaryEntity.trim().toLocaleLowerCase("en-US");
        const entityStories = primaryEntities.get(normalizedEntity) ?? [];
        entityStories.push(story.id);
        primaryEntities.set(normalizedEntity, entityStories);
      }
      if (typeof story.editorial.aiAdjacent !== "boolean") {
        issues.push(`Story ${story.id} must declare whether it is AI-adjacent.`);
      }
      if (story.editorial.maturity !== "verified-development") {
        issues.push(`Story ${story.id} is an emerging signal and belongs on Watch Next.`);
      }
      if (typeof story.editorial.deskFit !== "string" || !story.editorial.deskFit.trim()) {
        issues.push(`Story ${story.id} has no desk-fit rationale.`);
      }
      if (story.desk === "ai" && story.editorial.aiAdjacent !== true) {
        issues.push(`Story ${story.id} is on AI & Models but is not AI-adjacent.`);
      }
    }

    const readerWords = wordCount(`${story.whatHappened ?? ""} ${story.whyItMatters ?? ""} ${story.whatToDoOrWatch ?? ""}`);
    if (readerWords < 150 || readerWords > 225) issues.push(`Story ${story.id} must contain 150–225 reader-facing words.`);

    if (story.status === "material-update") {
      if (!isInstant(story.timing?.materiallyUpdatedAt) || !isInWindow(story.timing.materiallyUpdatedAt, start, end)) {
        issues.push(`Story ${story.id} has no eligible material-update timestamp.`);
      }
      if (!story.selection?.materialDelta?.trim()) issues.push(`Story ${story.id} has no named material delta.`);
    } else {
      const eligibleAt = story.timing?.eventAt ?? story.timing?.firstPublishedAt;
      if (!isInstant(eligibleAt) || !isInWindow(eligibleAt, start, end)) issues.push(`Story ${story.id} is outside the reporting window.`);
    }

    if (!Array.isArray(story.sources) || story.sources.length === 0) {
      issues.push(`Story ${story.id} has no sources.`);
      continue;
    }
    const sourceIds = new Set();
    for (const source of story.sources) {
      if (!source.id || sourceIds.has(source.id)) issues.push(`Story ${story.id} repeats a source id.`);
      sourceIds.add(source.id);
      if (!isDirectHttpsUrl(source.url)) issues.push(`Story ${story.id} has a non-direct source URL.`);
    }
    if (!story.sources.some((source) => source.relationship === "originating") &&
        !story.sources.some((source) => source.relationship === "independent")) {
      issues.push(`Story ${story.id} lacks originating or independent evidence.`);
    }
    for (const claim of story.evidence ?? []) {
      if (!Array.isArray(claim.sourceIds) || claim.sourceIds.length === 0) issues.push(`Claim ${claim.id} has no evidence sources.`);
      for (const sourceId of claim.sourceIds ?? []) {
        if (!sourceIds.has(sourceId)) issues.push(`Claim ${claim.id} references an unknown source.`);
      }
    }

    if (story.securityAction && story.desk !== "security-and-privacy") {
      issues.push(`Story ${story.id} has a security action outside the Security & Privacy desk.`);
    }
  }

  const aiAdjacentCount = selectedStories.filter((story) => story.editorial?.aiAdjacent === true).length;
  if (aiAdjacentCount > 2) issues.push(`An edition may contain at most two AI-adjacent stories; found ${aiAdjacentCount}.`);

  const repeatedEntities = [...primaryEntities.values()].filter((storyIdsForEntity) => storyIdsForEntity.length > 1);
  const diversityException = edition.frontPage?.diversityException;
  if (repeatedEntities.length > 0 && (typeof diversityException !== "string" || !diversityException.trim())) {
    issues.push("A repeated primary entity requires a specific front-page diversity exception.");
  }
  if (repeatedEntities.length === 0 && diversityException !== null) {
    issues.push("A diversity exception was supplied, but no primary entity is repeated.");
  }

  const order = edition.frontPage?.storyOrder ?? [];
  if (order.length !== selectedStories.length || new Set(order).size !== order.length || order.some((id) => !storyIds.has(id))) {
    issues.push("Front-page order must reference every selected story exactly once.");
  }
  if (edition.frontPage?.leadStoryId && !storyIds.has(edition.frontPage.leadStoryId)) issues.push("Lead story is not selected.");

  const stopThePressesId = edition.frontPage?.stopThePressesStoryId;
  if (stopThePressesId !== null) {
    const alertStory = selectedStories.find((story) => story.id === stopThePressesId);
    if (!alertStory || alertStory.desk !== "security-and-privacy" || !alertStory.securityAction) {
      issues.push("Stop the Presses must reference the selected Security & Privacy story.");
    }
  }

  const watchNext = edition.backPage?.watchNext;
  if (!Array.isArray(watchNext)) {
    issues.push("Watch Next must be an array.");
  } else {
    if (watchNext.length > 3) issues.push("Watch Next may contain at most three signals.");
    for (const [index, item] of watchNext.entries()) {
      if (!isObject(item) || ["topic", "unresolved", "meaningfulSignal", "whyItMatters"].some(
        (field) => typeof item?.[field] !== "string" || !item[field].trim(),
      )) {
        issues.push(`Watch Next item ${index + 1} is incomplete.`);
      }
    }
  }

  if (
    edition.provenance?.policyVersion !== "first-fold-editorial-v2" ||
    edition.provenance?.promptVersion !== "first-fold-daily-v2" ||
    edition.provenance?.pipelineVersion !== "first-fold-pipeline-v2"
  ) {
    issues.push("Edition provenance must reference the v2 editorial pipeline.");
  }

  return { valid: issues.length === 0, issues };
}

function formatDate(value, options) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...options }).format(new Date(value));
}

function sourceBadge(relationship) {
  if (relationship === "originating") return "Primary source";
  if (relationship === "independent") return "Independent reporting";
  return "Context";
}

function displayStatus(status) {
  return status === "material-update" ? "Material update" : "New development";
}

function toReaderDesk(desk, page) {
  const presentation = DESK_PRESENTATION[desk];
  if (page.story === null) {
    return {
      ...presentation,
      state: "quiet",
      headline: "Nothing cleared the bar today.",
      frontDeck: "No stale launch, recycled announcement, or filler took the fourth slot.",
      emptyReason: page.emptyReason,
      candidateCount: null,
      minimumScore: 70,
    };
  }

  const story = page.story;
  const totalWords = wordCount(`${story.whatHappened} ${story.whyItMatters} ${story.whatToDoOrWatch}`);
  return {
    ...presentation,
    state: "story",
    storyId: story.id,
    headline: story.headline,
    deck: story.deck,
    frontDeck: story.deck,
    statusLabel: displayStatus(story.status),
    confidenceLabel: `${story.confidence.level[0].toUpperCase()}${story.confidence.level.slice(1)} confidence`,
    readTime: `${Math.max(2, Math.ceil(totalWords / 140))} min read`,
    checkedAt: formatDate(story.sources.reduce((latest, source) => source.retrievedAt > latest ? source.retrievedAt : latest, story.sources[0].retrievedAt), { hour: "numeric", minute: "2-digit" }) + " ET",
    score: story.selection.score,
    sections: {
      whatHappened: story.whatHappened,
      whyItMatters: story.whyItMatters,
      whatToDoOrWatch: story.whatToDoOrWatch,
    },
    shortVersion: story.deck,
    selectedBecause: story.selection.selectedBecause,
    sources: story.sources.map((source) => ({
      badge: sourceBadge(source.relationship),
      publisher: `${source.publisher}${source.publishedAt ? ` · ${formatDate(source.publishedAt, { month: "long", day: "numeric", year: "numeric" })}` : ""}`,
      title: source.title,
      url: source.url,
    })),
  };
}

export function toReaderEdition(edition, validation) {
  const desks = DESKS.map((desk) => toReaderDesk(desk, edition.desks[desk]));
  const stories = desks.filter((desk) => desk.state === "story");
  const quietCount = desks.length - stories.length;
  const generatedAt = edition.publication.generatedAt;
  const digest = createHash("sha256").update(JSON.stringify(edition)).digest("hex");

  return {
    kind: "first-fold/reader-edition",
    readerProjectionVersion: 2,
    canonicalEditionId: edition.id,
    sourceRevision: digest,
    id: edition.editionDate,
    issueNumber: edition.issueNumber,
    status: edition.status,
    displayDate: formatDate(`${edition.editionDate}T12:00:00Z`, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    shortDate: formatDate(`${edition.editionDate}T12:00:00Z`, { month: "short", day: "numeric", year: "numeric" }),
    timezone: edition.timezone,
    reportingWindow: edition.reportingWindow.displayLabel,
    publishedAt: "6:00 AM ET",
    checkedAt: formatDate(generatedAt, { hour: "numeric", minute: "2-digit" }) + " ET",
    estimatedMinutes: edition.frontPage.estimatedMinutes,
    masthead: edition.masthead,
    frontPage: {
      headline: `${stories.length} developments. ${quietCount === 1 ? "One quiet desk" : `${quietCount} quiet desks`}. Your morning, finished.`,
      standfirst: `One consequential development from each desk—when the evidence clears the bar. Today’s paper takes about ${edition.frontPage.estimatedMinutes} minutes from front to back.`,
      editorNote: edition.frontPage.note,
      leadStoryId: edition.frontPage.leadStoryId,
      storyOrder: edition.frontPage.storyOrder,
    },
    desks,
    backPage: {
      headline: "You’re caught up.",
      summary: `${stories.length} stories. ${quietCount === 1 ? "One honest blank" : `${quietCount} honest blanks`}. Nothing else is waiting.`,
      experimentTitle: edition.backPage.tryThisTomorrow?.title ?? "Begin with the finish line.",
      experiment: edition.backPage.tryThisTomorrow?.goal ?? "Define a useful result before choosing the tool.",
      watchNext: edition.backPage.watchNext,
    },
    pipeline: PIPELINE,
    validation: {
      validatorVersion: "first-fold-runtime-v2",
      checkedAt: generatedAt,
      contentSha256: digest,
      issues: validation.issues,
    },
  };
}

export function toArchiveManifest(readerEditions) {
  const sorted = [...readerEditions].sort((a, b) => b.id.localeCompare(a.id));
  return {
    kind: "first-fold/archive-manifest",
    archiveIndexVersion: 1,
    latest: sorted[0]?.id ?? null,
    editions: sorted.map((edition) => ({
      id: edition.id,
      issueNumber: edition.issueNumber,
      displayDate: edition.displayDate,
      storyCount: edition.desks.filter((desk) => desk.state === "story").length,
      quietDeskCount: edition.desks.filter((desk) => desk.state === "quiet").length,
      estimatedMinutes: edition.estimatedMinutes,
      status: edition.status,
      summary: edition.desks.filter((desk) => desk.state === "story").map((desk) => desk.headline).join(" · "),
    })),
  };
}

export async function loadEditionArtifacts(projectRoot) {
  const contentRoot = path.join(projectRoot, "content", "editions");
  const filenames = (await readdir(contentRoot)).filter((filename) => filename.endsWith(".json")).sort();
  const readerEditions = [];

  for (const filename of filenames) {
    const source = await readFile(path.join(contentRoot, filename), "utf8");
    const canonical = JSON.parse(source);
    const validation = validateCanonicalEdition(canonical);
    if (!validation.valid) {
      throw new Error(`Invalid canonical edition ${filename}:\n- ${validation.issues.join("\n- ")}`);
    }
    readerEditions.push(toReaderEdition(canonical, validation));
  }

  const artifacts = new Map();
  for (const edition of readerEditions) {
    artifacts.set(`/editions/${edition.id}.json`, JSON.stringify(edition, null, 2));
  }
  artifacts.set("/editions/index.json", JSON.stringify(toArchiveManifest(readerEditions), null, 2));
  return artifacts;
}
