import { DESKS, type Edition, type Story } from "./schema";

export interface EditionValidationContext {
  previousWindowEnd?: string;
  recentEventKeys?: ReadonlySet<string>;
}

export interface EditionValidationResult {
  valid: boolean;
  errors: readonly string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SEARCH_HOSTS = new Set([
  "bing.com",
  "duckduckgo.com",
  "google.com",
  "search.yahoo.com",
  "www.bing.com",
  "www.google.com",
]);

function isInstant(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function isDirectHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !SEARCH_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function isInWindow(
  value: string,
  startInclusive: string,
  endExclusive: string,
): boolean {
  const instant = Date.parse(value);
  return instant >= Date.parse(startInclusive) && instant < Date.parse(endExclusive);
}

function wordCount(value: string): number {
  return value.trim().match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function localClock(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  return `${hour}:${minute}`;
}

function validateStory(
  story: Story,
  edition: Edition,
  errors: string[],
): void {
  const prefix = `Story ${story.id}`;
  const { startInclusive, endExclusive } = edition.reportingWindow;

  if (!story.id.trim()) errors.push("A selected story has no id.");
  if (!story.canonicalEventKey.trim()) {
    errors.push(`${prefix} has no canonicalEventKey.`);
  }
  if (!story.headline.trim() || !story.deck.trim()) {
    errors.push(`${prefix} needs a headline and deck.`);
  }
  if (!story.editorial.primaryEntity.trim()) {
    errors.push(`${prefix} needs a primary editorial entity.`);
  }
  if (!story.editorial.deskFit.trim()) {
    errors.push(`${prefix} needs a concise desk-fit rationale.`);
  }
  if (story.editorial.maturity !== "verified-development") {
    errors.push(`${prefix} is an emerging signal and belongs on Watch Next.`);
  }
  if (story.desk === "ai" && !story.editorial.aiAdjacent) {
    errors.push(`${prefix} is on AI & Models but is not marked AI-adjacent.`);
  }
  if (story.selection.score < 70 || story.selection.score > 100) {
    errors.push(`${prefix} has an ineligible selection score.`);
  }

  const readerWordCount = wordCount(
    `${story.whatHappened} ${story.whyItMatters} ${story.whatToDoOrWatch}`,
  );
  if (readerWordCount < 150 || readerWordCount > 225) {
    errors.push(`${prefix} must contain 150–225 reader-facing words; found ${readerWordCount}.`);
  }

  if (story.status === "material-update") {
    if (!story.timing.materiallyUpdatedAt) {
      errors.push(`${prefix} is a material update without an update timestamp.`);
    } else if (
      !isInWindow(story.timing.materiallyUpdatedAt, startInclusive, endExclusive)
    ) {
      errors.push(`${prefix} has a material update outside the reporting window.`);
    }
    if (!story.selection.materialDelta?.trim()) {
      errors.push(`${prefix} is a material update without a named material delta.`);
    }
  } else {
    const eligibleTimestamp = story.timing.eventAt ?? story.timing.firstPublishedAt;
    if (!isInWindow(eligibleTimestamp, startInclusive, endExclusive)) {
      errors.push(`${prefix} is outside the reporting window.`);
    }
    if (story.selection.materialDelta !== null) {
      errors.push(`${prefix} is new but contains a material-update delta.`);
    }
  }

  if (story.sources.length === 0) {
    errors.push(`${prefix} has no sources.`);
  }
  const sourceIds = new Set<string>();
  for (const source of story.sources) {
    if (sourceIds.has(source.id)) {
      errors.push(`${prefix} repeats source id ${source.id}.`);
    }
    sourceIds.add(source.id);
    if (!isDirectHttpsUrl(source.url)) {
      errors.push(`${prefix} has a non-direct or non-HTTPS source URL.`);
    }
    if (source.publishedAt && !isInstant(source.publishedAt)) {
      errors.push(`${prefix} has an invalid source publication timestamp.`);
    }
    if (!isInstant(source.retrievedAt)) {
      errors.push(`${prefix} has an invalid source retrieval timestamp.`);
    }
  }

  const hasOriginatingSource = story.sources.some(
    (source) => source.relationship === "originating",
  );
  if (!hasOriginatingSource && story.sources.length < 2) {
    errors.push(`${prefix} needs an originating source or independent corroboration.`);
  }
  if (
    story.priority === "critical" &&
    (!hasOriginatingSource ||
      !story.sources.some((source) => source.relationship === "independent"))
  ) {
    errors.push(`${prefix} is critical but lacks originating and independent evidence.`);
  }

  if (story.evidence.length === 0) {
    errors.push(`${prefix} has no evidence claims.`);
  }
  const claimIds = new Set<string>();
  for (const claim of story.evidence) {
    if (claimIds.has(claim.id)) {
      errors.push(`${prefix} repeats evidence claim id ${claim.id}.`);
    }
    claimIds.add(claim.id);
    for (const sourceId of claim.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        errors.push(`${prefix} claim ${claim.id} references unknown source ${sourceId}.`);
      }
    }
  }

  if (story.securityAction && story.desk !== "security-and-privacy") {
    errors.push(`${prefix} has a security action outside the Security & Privacy desk.`);
  }
}

export function validateEdition(
  edition: Edition,
  context: EditionValidationContext = {},
): EditionValidationResult {
  const errors: string[] = [];

  if (edition.schemaVersion !== 2) errors.push("Unsupported edition schema version.");
  if (!ISO_DATE.test(edition.editionDate)) errors.push("editionDate must be YYYY-MM-DD.");
  if (edition.issueNumber < 1 || !Number.isInteger(edition.issueNumber)) {
    errors.push("issueNumber must be a positive integer.");
  }
  if (edition.timezone !== "America/New_York") {
    errors.push("The authoritative timezone must be America/New_York.");
  }

  const { startInclusive, endExclusive } = edition.reportingWindow;
  if (!isInstant(startInclusive) || !isInstant(endExclusive)) {
    errors.push("Reporting-window values must be valid instants.");
  } else if (Date.parse(startInclusive) >= Date.parse(endExclusive)) {
    errors.push("The reporting window must be non-empty and half-open.");
  }
  if (context.previousWindowEnd && context.previousWindowEnd !== startInclusive) {
    errors.push("The reporting window is not contiguous with the previous edition.");
  }

  if (!isInstant(edition.publication.publishAt)) {
    errors.push("publishAt must be a valid instant.");
  } else if (localClock(edition.publication.publishAt, edition.timezone) !== "06:00") {
    errors.push("The edition must publish at 06:00 America/New_York.");
  }
  if (edition.publication.targetLocalTime !== "06:00") {
    errors.push("targetLocalTime must be 06:00.");
  }
  if (Date.parse(endExclusive) > Date.parse(edition.publication.publishAt)) {
    errors.push("The reporting cutoff cannot occur after publication.");
  }
  if (
    edition.status === "published" &&
    edition.publication.publishedAt === null
  ) {
    errors.push("A published edition needs a publishedAt timestamp.");
  }

  const deskKeys = Object.keys(edition.desks).sort();
  const expectedDeskKeys = [...DESKS].sort();
  if (
    deskKeys.length !== expectedDeskKeys.length ||
    deskKeys.some((desk, index) => desk !== expectedDeskKeys[index])
  ) {
    errors.push("The edition must contain exactly the four configured desks.");
  }

  const stories: Story[] = [];
  for (const desk of DESKS) {
    const page = edition.desks[desk];
    if (!page) continue;
    if (page.desk !== desk) errors.push(`Desk page ${desk} is mislabeled.`);
    if (page.story === null) {
      if (!page.emptyReason.trim()) {
        errors.push(`Empty desk ${desk} needs an honest explanation.`);
      }
      continue;
    }
    if (page.story.desk !== desk) {
      errors.push(`Story ${page.story.id} is filed under the wrong desk.`);
    }
    stories.push(page.story);
    validateStory(page.story, edition, errors);
  }

  const storyIds = new Set<string>();
  const eventKeys = new Set<string>();
  const primaryEntities = new Map<string, string[]>();
  for (const story of stories) {
    if (storyIds.has(story.id)) errors.push(`Duplicate story id ${story.id}.`);
    storyIds.add(story.id);
    if (eventKeys.has(story.canonicalEventKey)) {
      errors.push(`Event ${story.canonicalEventKey} appears in more than one desk.`);
    }
    eventKeys.add(story.canonicalEventKey);
    const normalizedEntity = story.editorial.primaryEntity.trim().toLocaleLowerCase("en-US");
    const entityStories = primaryEntities.get(normalizedEntity) ?? [];
    entityStories.push(story.id);
    primaryEntities.set(normalizedEntity, entityStories);
    if (
      context.recentEventKeys?.has(story.canonicalEventKey) &&
      story.status !== "material-update"
    ) {
      errors.push(`Previously covered event ${story.canonicalEventKey} is not a material update.`);
    }
  }

  const aiAdjacentStories = stories.filter((story) => story.editorial.aiAdjacent);
  if (aiAdjacentStories.length > 2) {
    errors.push(
      `An edition may contain at most two AI-adjacent stories; found ${aiAdjacentStories.length}.`,
    );
  }

  const repeatedEntities = [...primaryEntities.entries()].filter(
    ([, storyIdsForEntity]) => storyIdsForEntity.length > 1,
  );
  if (repeatedEntities.length > 0 && !edition.frontPage.diversityException?.trim()) {
    errors.push(
      "A repeated primary entity requires a specific front-page diversity exception.",
    );
  }
  if (repeatedEntities.length === 0 && edition.frontPage.diversityException !== null) {
    errors.push("A diversity exception was supplied, but no primary entity is repeated.");
  }

  const order = edition.frontPage.storyOrder;
  if (new Set(order).size !== order.length) {
    errors.push("The front-page story order contains duplicates.");
  }
  if (
    order.length !== stories.length ||
    stories.some((story) => !order.includes(story.id)) ||
    order.some((storyId) => !storyIds.has(storyId))
  ) {
    errors.push("The front-page story order must include every selected story exactly once.");
  }
  if (
    edition.frontPage.leadStoryId !== null &&
    !storyIds.has(edition.frontPage.leadStoryId)
  ) {
    errors.push("leadStoryId does not reference a selected story.");
  }

  const stopThePressesId = edition.frontPage.stopThePressesStoryId;
  if (stopThePressesId !== null) {
    const alertStory = stories.find((story) => story.id === stopThePressesId);
    if (
      !alertStory ||
      alertStory.desk !== "security-and-privacy" ||
      !alertStory.securityAction
    ) {
      errors.push("Stop the Presses must reference the selected Security & Privacy story.");
    }
  }

  if (edition.backPage.watchNext.length > 3) {
    errors.push("Watch Next may contain at most three emerging signals.");
  }
  for (const item of edition.backPage.watchNext) {
    if (
      !item.topic.trim() ||
      !item.unresolved.trim() ||
      !item.meaningfulSignal.trim() ||
      !item.whyItMatters.trim()
    ) {
      errors.push("Every Watch Next item needs a topic, unresolved question, signal, and consequence.");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidEdition(
  edition: Edition,
  context?: EditionValidationContext,
): void {
  const result = validateEdition(edition, context);
  if (!result.valid) {
    throw new Error(`Invalid First Fold edition:\n- ${result.errors.join("\n- ")}`);
  }
}
