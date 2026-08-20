import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateCanonicalEdition } from "./edition-content.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = path.resolve(path.dirname(scriptPath), "..");
const EDITORIAL_TIMEZONE = "America/New_York";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DESKS = [
  ["ai", "AI & Models"],
  ["work-and-tools", "Work & Tools"],
  ["security-and-privacy", "Security & Privacy"],
  ["platforms-and-power", "Platforms & Power"],
];

const localDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EDITORIAL_TIMEZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EDITORIAL_TIMEZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  month: "long",
  day: "numeric",
  year: "numeric",
});

function dateParts(value) {
  if (!DATE_PATTERN.test(value ?? "")) {
    throw new Error("Edition date must use YYYY-MM-DD.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Edition date ${value} is not a real calendar date.`);
  }
  return { year, month, day };
}

function formattedParts(instant) {
  return Object.fromEntries(
    localDateTimeFormatter
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

/**
 * Convert a First Fold local wall-clock time to an ISO instant without assuming
 * that New York days are always 24 hours long.
 */
export function localTimeToIso(editionDate, hour, minute) {
  const { year, month, day } = dateParts(editionDate);
  const desiredLocalEpoch = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = desiredLocalEpoch;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rendered = formattedParts(instant);
    const renderedLocalEpoch = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second,
    );
    const adjustment = desiredLocalEpoch - renderedLocalEpoch;
    instant += adjustment;
    if (adjustment === 0) break;
  }

  const verified = formattedParts(instant);
  if (
    verified.year !== year ||
    verified.month !== month ||
    verified.day !== day ||
    verified.hour !== hour ||
    verified.minute !== minute
  ) {
    throw new Error(`Unable to resolve ${editionDate} ${hour}:${minute} in ${EDITORIAL_TIMEZONE}.`);
  }

  return new Date(instant).toISOString();
}

function localDateAndClock(instant) {
  const parts = formattedParts(instant);
  return {
    date: [parts.year, parts.month, parts.day]
      .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
      .join("-"),
    clock: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

function reportingWindowLabel(startInclusive, endExclusive) {
  return `${longDateFormatter.format(new Date(startInclusive))} at 5:00 AM ET through ${longDateFormatter.format(new Date(endExclusive))} at 5:00 AM ET`;
}

async function pathExists(filename) {
  try {
    await stat(filename);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function loadCanonicalEditions(projectRoot) {
  const contentRoot = path.join(projectRoot, "content", "editions");
  const filenames = (await readdir(contentRoot))
    .filter((filename) => filename.endsWith(".json"))
    .sort();

  if (filenames.length === 0) {
    throw new Error("At least one canonical edition is required as the stable masthead and policy source.");
  }

  const editions = [];
  const issueNumbers = new Set();
  const editionDates = new Set();

  for (const filename of filenames) {
    let edition;
    try {
      edition = JSON.parse(await readFile(path.join(contentRoot, filename), "utf8"));
    } catch (error) {
      throw new Error(`Unable to read canonical edition ${filename}: ${error.message}`);
    }

    const validation = validateCanonicalEdition(edition);
    if (!validation.valid) {
      throw new Error(`Canonical edition ${filename} is invalid:\n- ${validation.issues.join("\n- ")}`);
    }

    dateParts(edition.editionDate);
    if (filename !== `${edition.editionDate}.json`) {
      throw new Error(`${filename} must match its editionDate (${edition.editionDate}).`);
    }
    if (!Number.isInteger(edition.issueNumber) || edition.issueNumber < 1) {
      throw new Error(`${filename} must have a positive integer issueNumber.`);
    }
    if (issueNumbers.has(edition.issueNumber)) {
      throw new Error(`Issue number ${edition.issueNumber} is duplicated.`);
    }
    if (editionDates.has(edition.editionDate)) {
      throw new Error(`Edition date ${edition.editionDate} is duplicated.`);
    }

    issueNumbers.add(edition.issueNumber);
    editionDates.add(edition.editionDate);
    editions.push(edition);
  }

  return editions.sort((left, right) => left.editionDate.localeCompare(right.editionDate));
}

export function buildEditionDraft({ latestEdition, editionDate, issueNumber }) {
  dateParts(editionDate);
  if (editionDate <= latestEdition.editionDate) {
    throw new Error(`Edition date must be later than the latest canonical edition (${latestEdition.editionDate}).`);
  }

  const startInclusive = latestEdition.reportingWindow.endExclusive;
  const priorCutoff = localDateAndClock(startInclusive);
  if (priorCutoff.date !== latestEdition.editionDate || priorCutoff.clock !== "05:00") {
    throw new Error("The latest canonical edition does not end at its 5:00 AM New York cutoff.");
  }

  const endExclusive = localTimeToIso(editionDate, 5, 0);
  if (Date.parse(startInclusive) >= Date.parse(endExclusive)) {
    throw new Error("The new reporting window must end after the previous edition cutoff.");
  }

  const desks = Object.fromEntries(
    DESKS.map(([desk, label]) => [
      desk,
      {
        desk,
        story: null,
        emptyReason: `No ${label} story has been selected for the ${editionDate} draft yet.`,
      },
    ]),
  );

  return {
    schemaVersion: 2,
    id: `first-fold-${editionDate}`,
    issueNumber,
    editionDate,
    status: "draft",
    masthead: {
      name: latestEdition.masthead.name,
      tagline: latestEdition.masthead.tagline,
    },
    timezone: EDITORIAL_TIMEZONE,
    reportingWindow: {
      startInclusive,
      endExclusive,
      displayLabel: reportingWindowLabel(startInclusive, endExclusive),
    },
    publication: {
      targetLocalTime: "06:00",
      publishAt: localTimeToIso(editionDate, 6, 0),
      generatedAt: localTimeToIso(editionDate, 5, 50),
      publishedAt: null,
    },
    frontPage: {
      note: "Draft edition: no developments have been selected yet.",
      estimatedMinutes: 1,
      leadStoryId: null,
      storyOrder: [],
      stopThePressesStoryId: null,
      diversityException: null,
    },
    desks,
    backPage: {
      tryThisTomorrow: null,
      watchNext: [],
    },
    corrections: [],
    provenance: {
      policyVersion: latestEdition.provenance.policyVersion,
      promptVersion: latestEdition.provenance.promptVersion,
      pipelineVersion: latestEdition.provenance.pipelineVersion,
    },
  };
}

export async function createEditionDraft({
  projectRoot = defaultProjectRoot,
  editionDate,
} = {}) {
  dateParts(editionDate);
  const destination = path.join(projectRoot, "content", "editions", `${editionDate}.json`);
  if (await pathExists(destination)) {
    throw new Error(`Edition ${editionDate} already exists; nothing was overwritten.`);
  }

  const editions = await loadCanonicalEditions(projectRoot);
  const latestEdition = editions.at(-1);
  const issueNumber = Math.max(...editions.map((edition) => edition.issueNumber)) + 1;
  const draft = buildEditionDraft({ latestEdition, editionDate, issueNumber });
  const validation = validateCanonicalEdition(draft);
  if (!validation.valid) {
    throw new Error(`Generated draft failed validation:\n- ${validation.issues.join("\n- ")}`);
  }

  try {
    await writeFile(destination, `${JSON.stringify(draft, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Edition ${editionDate} already exists; nothing was overwritten.`);
    }
    throw error;
  }

  return { destination, draft };
}

async function main() {
  const [editionDate, ...extraArguments] = process.argv.slice(2);
  if (!editionDate || extraArguments.length > 0 || editionDate === "--help" || editionDate === "-h") {
    console.log("Usage: npm run edition:new -- YYYY-MM-DD");
    if (!editionDate || extraArguments.length > 0) process.exitCode = 1;
    return;
  }

  const { destination, draft } = await createEditionDraft({ editionDate });
  console.log(
    `Created ${path.relative(defaultProjectRoot, destination)} as issue ${String(draft.issueNumber).padStart(3, "0")} (draft).`,
  );
  console.log("All four desks start quiet. Production builds omit the issue until its status is published.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(`Could not create edition: ${error.message}`);
    process.exitCode = 1;
  });
}
