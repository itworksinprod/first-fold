import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadEditionArtifacts,
  validateCanonicalEdition,
} from "../scripts/edition-content.mjs";
import {
  createEditionDraft,
  localTimeToIso,
} from "../scripts/new-edition.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceEditionPath = path.join(
  projectRoot,
  "content",
  "editions",
  "2026-08-19.json",
);

async function withFixtureProject(run) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "first-fold-edition-"));
  const editionsRoot = path.join(temporaryRoot, "content", "editions");
  await mkdir(editionsRoot, { recursive: true });
  await writeFile(
    path.join(editionsRoot, "2026-08-19.json"),
    await readFile(sourceEditionPath),
  );

  try {
    await run({ temporaryRoot, editionsRoot });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function markPublished(edition) {
  edition.status = "published";
  edition.publication.publishedAt = edition.publication.publishAt;
  return edition;
}

test("edition scaffolder creates a safe, schema-valid next issue", async () => {
  await withFixtureProject(async ({ temporaryRoot, editionsRoot }) => {
    const { destination, draft } = await createEditionDraft({
      projectRoot: temporaryRoot,
      editionDate: "2026-08-20",
    });

    assert.equal(destination, path.join(editionsRoot, "2026-08-20.json"));
    assert.equal(draft.id, "first-fold-2026-08-20");
    assert.equal(draft.issueNumber, 2);
    assert.equal(draft.editionDate, "2026-08-20");
    assert.equal(draft.status, "draft");
    assert.equal(draft.reportingWindow.startInclusive, "2026-08-19T09:00:00.000Z");
    assert.equal(draft.reportingWindow.endExclusive, "2026-08-20T09:00:00.000Z");
    assert.equal(
      draft.reportingWindow.displayLabel,
      "August 19, 2026 at 5:00 AM ET through August 20, 2026 at 5:00 AM ET",
    );
    assert.deepEqual(draft.publication, {
      targetLocalTime: "06:00",
      publishAt: "2026-08-20T10:00:00.000Z",
      generatedAt: "2026-08-20T09:50:00.000Z",
      publishedAt: null,
    });
    assert.deepEqual(draft.frontPage.storyOrder, []);
    assert.equal(draft.frontPage.leadStoryId, null);
    assert.equal(draft.frontPage.stopThePressesStoryId, null);
    assert.equal(draft.frontPage.diversityException, null);
    assert.equal(draft.backPage.tryThisTomorrow, null);
    assert.deepEqual(draft.backPage.watchNext, []);
    assert.deepEqual(draft.corrections, []);
    assert.deepEqual(draft.provenance, {
      policyVersion: "first-fold-editorial-v2",
      promptVersion: "first-fold-daily-v2",
      pipelineVersion: "first-fold-pipeline-v2",
    });
    assert.ok(
      Object.values(draft.desks).every(
        (page) => page.story === null && page.emptyReason.includes("draft yet"),
      ),
    );
    assert.deepEqual(validateCanonicalEdition(draft), { valid: true, issues: [] });

    const writtenDraft = JSON.parse(await readFile(destination, "utf8"));
    assert.deepEqual(writtenDraft, draft);
  });
});

test("edition scaffolder never overwrites an existing canonical file", async () => {
  await withFixtureProject(async ({ temporaryRoot }) => {
    const { destination } = await createEditionDraft({
      projectRoot: temporaryRoot,
      editionDate: "2026-08-20",
    });
    const original = await readFile(destination, "utf8");

    await assert.rejects(
      createEditionDraft({ projectRoot: temporaryRoot, editionDate: "2026-08-20" }),
      /already exists; nothing was overwritten/i,
    );
    assert.equal(await readFile(destination, "utf8"), original);
  });
});

test("a skipped edition date keeps the preceding cutoff as the window start", async () => {
  await withFixtureProject(async ({ temporaryRoot }) => {
    const { draft } = await createEditionDraft({
      projectRoot: temporaryRoot,
      editionDate: "2026-08-22",
    });

    assert.equal(draft.reportingWindow.startInclusive, "2026-08-19T09:00:00.000Z");
    assert.equal(draft.reportingWindow.endExclusive, "2026-08-22T09:00:00.000Z");
    assert.equal(
      draft.reportingWindow.displayLabel,
      "August 19, 2026 at 5:00 AM ET through August 22, 2026 at 5:00 AM ET",
    );

    const localArtifacts = await loadEditionArtifacts(temporaryRoot, {
      includeUnpublished: true,
    });
    assert.equal(localArtifacts.has("/editions/2026-08-22.json"), true);
  });
});

test("edition scheduling follows New York daylight-saving boundaries", () => {
  const springStart = localTimeToIso("2026-03-07", 5, 0);
  const springEnd = localTimeToIso("2026-03-08", 5, 0);
  assert.equal(springStart, "2026-03-07T10:00:00.000Z");
  assert.equal(springEnd, "2026-03-08T09:00:00.000Z");
  assert.equal(Date.parse(springEnd) - Date.parse(springStart), 23 * 60 * 60 * 1000);

  const fallStart = localTimeToIso("2026-10-31", 5, 0);
  const fallEnd = localTimeToIso("2026-11-01", 5, 0);
  assert.equal(fallStart, "2026-10-31T09:00:00.000Z");
  assert.equal(fallEnd, "2026-11-01T10:00:00.000Z");
  assert.equal(Date.parse(fallEnd) - Date.parse(fallStart), 25 * 60 * 60 * 1000);

  assert.throws(() => localTimeToIso("2026-02-30", 5, 0), /not a real calendar date/i);
});

test("public artifacts omit drafts while local preview can include them", async () => {
  await withFixtureProject(async ({ temporaryRoot, editionsRoot }) => {
    const { destination } = await createEditionDraft({
      projectRoot: temporaryRoot,
      editionDate: "2026-08-20",
    });

    const publicArtifacts = await loadEditionArtifacts(temporaryRoot);
    assert.equal(publicArtifacts.has("/editions/2026-08-20.json"), false);
    assert.equal(JSON.parse(publicArtifacts.get("/editions/index.json")).latest, "2026-08-19");

    const localArtifacts = await loadEditionArtifacts(temporaryRoot, {
      includeUnpublished: true,
    });
    assert.equal(localArtifacts.has("/editions/2026-08-20.json"), true);
    assert.equal(JSON.parse(localArtifacts.get("/editions/index.json")).latest, "2026-08-20");

    const invalidDraft = JSON.parse(await readFile(destination, "utf8"));
    invalidDraft.desks.ai.emptyReason = "";
    await writeFile(path.join(editionsRoot, "2026-08-20.json"), JSON.stringify(invalidDraft));
    await assert.rejects(
      loadEditionArtifacts(temporaryRoot),
      /Invalid canonical edition 2026-08-20\.json[\s\S]*Quiet desk ai needs an explanation/,
    );
  });
});

test("canonical validation enforces identity and publication timing", async (context) => {
  const canonical = JSON.parse(await readFile(sourceEditionPath, "utf8"));
  const cases = [
    [
      "positive integer issue number",
      (edition) => { edition.issueNumber = 0; },
      /issueNumber must be a positive integer/i,
    ],
    [
      "real calendar date",
      (edition) => {
        edition.editionDate = "2026-02-30";
        edition.id = "first-fold-2026-02-30";
      },
      /real calendar date/i,
    ],
    [
      "canonical edition id",
      (edition) => { edition.id = "first-fold-wrong"; },
      /id must match/i,
    ],
    [
      "target local time",
      (edition) => { edition.publication.targetLocalTime = "07:00"; },
      /targetLocalTime must be 06:00/i,
    ],
    [
      "valid generated instant",
      (edition) => { edition.publication.generatedAt = "not-an-instant"; },
      /generatedAt must be a valid instant/i,
    ],
    [
      "publishedAt for a published edition",
      (edition) => { edition.publication.publishedAt = null; },
      /published edition requires a valid.*publishedAt/i,
    ],
    [
      "null publishedAt for a draft",
      (edition) => { edition.status = "draft"; },
      /unpublished edition must have.*publishedAt.*null/i,
    ],
    [
      "publication on editionDate",
      (edition) => { edition.publication.publishAt = "2026-08-20T10:00:00.000Z"; },
      /must occur on editionDate/i,
    ],
    [
      "reporting cutoff clock",
      (edition) => { edition.reportingWindow.endExclusive = "2026-08-19T08:59:00.000Z"; },
      /must end at 05:00.*on editionDate/i,
    ],
    [
      "reporting cutoff date",
      (edition) => { edition.reportingWindow.endExclusive = "2026-08-20T09:00:00.000Z"; },
      /must end at 05:00.*on editionDate/i,
    ],
  ];

  for (const [name, mutate, expectedIssue] of cases) {
    await context.test(name, () => {
      const edition = structuredClone(canonical);
      mutate(edition);
      assert.match(validateCanonicalEdition(edition).issues.join(" "), expectedIssue);
    });
  }
});

test("artifact loader rejects mismatched filenames", async () => {
  await withFixtureProject(async ({ temporaryRoot, editionsRoot }) => {
    await rename(
      path.join(editionsRoot, "2026-08-19.json"),
      path.join(editionsRoot, "wrong-name.json"),
    );
    await assert.rejects(
      loadEditionArtifacts(temporaryRoot),
      /filename wrong-name\.json must match editionDate 2026-08-19/i,
    );
  });
});

test("artifact loader rejects duplicate issue numbers across all statuses", async () => {
  await withFixtureProject(async ({ temporaryRoot }) => {
    const { destination, draft } = await createEditionDraft({
      projectRoot: temporaryRoot,
      editionDate: "2026-08-20",
    });
    draft.issueNumber = 1;
    await writeFile(destination, JSON.stringify(draft));

    await assert.rejects(
      loadEditionArtifacts(temporaryRoot),
      /issue number 1 is duplicated/i,
    );
  });
});

test("artifact loader requires contiguous chronological reporting windows", async () => {
  await withFixtureProject(async ({ temporaryRoot }) => {
    const { destination, draft } = await createEditionDraft({
      projectRoot: temporaryRoot,
      editionDate: "2026-08-20",
    });
    markPublished(draft);
    draft.reportingWindow.startInclusive = "2026-08-19T09:00:01.000Z";
    await writeFile(destination, JSON.stringify(draft));

    await assert.rejects(
      loadEditionArtifacts(temporaryRoot),
      /reporting windows are not contiguous[\s\S]*2026-08-20\.json must start at the 2026-08-19\.json cutoff/i,
    );
  });
});

test("package exposes the deterministic edition:new command", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(projectRoot, "package.json"), "utf8"),
  );
  assert.equal(packageJson.scripts["edition:new"], "node scripts/new-edition.mjs");
});
