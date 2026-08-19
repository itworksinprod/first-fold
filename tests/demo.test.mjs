import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  loadEditionArtifacts,
  validateCanonicalEdition,
} from "../scripts/edition-content.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const canonicalEditionUrl = new URL(
  "../content/editions/2026-08-19.json",
  import.meta.url,
);

let generatedArtifactsPromise;

function generatedArtifacts() {
  generatedArtifactsPromise ??= loadEditionArtifacts(projectRoot);
  return generatedArtifactsPromise;
}

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("cache", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

test("the morning edition renders the product promise", async () => {
  const response = await worker.fetch(new Request("https://first-fold.example/"));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
  assert.match(html, /First Fold/);
  assert.match(html, /On the doorstep · 6:00 AM ET/);
  assert.match(html, /Nothing cleared the bar today/);
  assert.match(html, /Three developments\. One quiet desk/);
  assert.match(html, /AI &amp; Models/);
  assert.match(html, /Work &amp; Tools/);
  assert.match(html, /Security &amp; Privacy/);
  assert.match(html, /Platforms &amp; Power/);
  assert.match(html, /Watch next/i);
});

test("the hosted response converts social metadata to an absolute URL", async () => {
  const response = await worker.fetch(new Request("https://demo.first-fold.example/"));
  assert.match(await response.text(), /content="https:\/\/demo\.first-fold\.example\/og\.png"/);
});

test("security headers and closed routes are present", async () => {
  const response = await worker.fetch(new Request("https://first-fold.example/not-real"));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy") ?? "", /object-src 'none'/);

  const trailingSlashResponse = await worker.fetch(
    new Request("https://first-fold.example/not-real/"),
  );
  assert.equal(trailingSlashResponse.status, 404);
});

test("the archive, editor, and generated edition routes are shipped", async (context) => {
  const htmlRoutes = [
    ["/archive/", /Edition Archive|The archive begins here/],
    ["/editor/", /Press Desk|Ready for/],
  ];

  for (const [pathname, expectedCopy] of htmlRoutes) {
    await context.test(pathname, async () => {
      const response = await worker.fetch(
        new Request(`https://first-fold.example${pathname}`),
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
      assert.match(await response.text(), expectedCopy);
    });
  }

  const expectedArtifacts = await generatedArtifacts();
  for (const pathname of [
    "/editions/index.json",
    "/editions/2026-08-19.json",
  ]) {
    await context.test(pathname, async () => {
      const expected = expectedArtifacts.get(pathname);
      assert.ok(expected, `edition-content did not generate ${pathname}`);

      const response = await worker.fetch(
        new Request(`https://first-fold.example${pathname}`),
      );
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-type") ?? "",
        /^application\/json/,
      );
      assert.deepEqual(await response.json(), JSON.parse(expected));
    });
  }
});

test("the interaction layer includes finite navigation and accessible announcements", async () => {
  const script = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(script, /ArrowLeft/);
  assert.match(script, /ArrowRight/);
  assert.match(script, /aria-current/);
  assert.match(script, /Page \$\{index \+ 1\} of \$\{pages\.length\}/);
  assert.match(script, /Math\.abs\(deltaX\) < 60/);
  assert.match(script, /"ai-at-work": "work-and-tools"/);
  assert.match(script, /cybersecurity: "security-and-privacy"/);
  assert.match(script, /technology: "platforms-and-power"/);
  assert.match(script, /renderWatchNext\(data\.backPage\.watchNext\)/);
});

test("static pages keep asset and data URLs safe for a GitHub project path", async () => {
  const [readerHtml, archiveHtml, editorHtml, readerScript, archiveScript, editorScript, workflow] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../archive/index.html", import.meta.url), "utf8"),
    readFile(new URL("../editor/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
    readFile(new URL("../archive.js", import.meta.url), "utf8"),
    readFile(new URL("../editor.js", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
  ]);

  assert.match(readerHtml, /href="styles\.css\?v=2"/);
  assert.match(archiveHtml, /href="\.\.\/styles\.css\?v=2"/);
  assert.match(editorHtml, /href="\.\.\/styles\.css\?v=2"/);
  assert.doesNotMatch(`${readerHtml}${archiveHtml}${editorHtml}`, /(?:href|src)="\//);
  assert.match(readerScript, /fetch\(`editions\/\$\{editionId\}\.json\?v=2`/);
  assert.match(archiveScript, /fetch\("\.\.\/editions\/index\.json\?v=2"/);
  assert.match(editorScript, /fetch\("\.\.\/editions\/index\.json\?v=2"/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /path: dist\/client/);
});

test("the canonical edition passes the executable content validator", async () => {
  const canonical = JSON.parse(await readFile(canonicalEditionUrl, "utf8"));
  const validation = validateCanonicalEdition(canonical);

  assert.deepEqual(validation, { valid: true, issues: [] });
  assert.equal(canonical.schemaVersion, 2);
  assert.equal(canonical.publication.targetLocalTime, "06:00");
  assert.deepEqual(Object.keys(canonical.desks), [
    "ai",
    "work-and-tools",
    "security-and-privacy",
    "platforms-and-power",
  ]);
  assert.equal(canonical.desks["platforms-and-power"].story, null);
  assert.match(canonical.desks["platforms-and-power"].emptyReason, /No Platforms & Power story/i);
  assert.equal(canonical.frontPage.diversityException, null);
  assert.equal(canonical.backPage.watchNext.length, 2);
});

test("schema v2 enforces edition balance and keeps weak signals off the desks", async (context) => {
  const canonical = JSON.parse(await readFile(canonicalEditionUrl, "utf8"));

  await context.test("rejects legacy schema versions", () => {
    const edition = structuredClone(canonical);
    edition.schemaVersion = 1;
    assert.match(validateCanonicalEdition(edition).issues.join(" "), /schema version/i);
  });

  await context.test("caps AI-adjacent stories at two", () => {
    const edition = structuredClone(canonical);
    edition.desks["security-and-privacy"].story.editorial.aiAdjacent = true;
    assert.match(validateCanonicalEdition(edition).issues.join(" "), /at most two AI-adjacent/i);
  });

  await context.test("requires an explicit exception for a repeated primary entity", () => {
    const edition = structuredClone(canonical);
    edition.desks["security-and-privacy"].story.editorial.primaryEntity = "OpenAI";
    assert.match(validateCanonicalEdition(edition).issues.join(" "), /diversity exception/i);

    edition.frontPage.diversityException = "Both verified developments require distinct reader decisions today.";
    assert.deepEqual(validateCanonicalEdition(edition), { valid: true, issues: [] });
  });

  await context.test("bounds Watch Next to three complete signals", () => {
    const edition = structuredClone(canonical);
    edition.backPage.watchNext.push(...structuredClone(canonical.backPage.watchNext));
    assert.match(validateCanonicalEdition(edition).issues.join(" "), /at most three/i);
  });
});

test("reader projection and archive manifest stay consistent with canonical data", async () => {
  const canonical = JSON.parse(await readFile(canonicalEditionUrl, "utf8"));
  const artifacts = await generatedArtifacts();
  const readerPath = `/editions/${canonical.editionDate}.json`;
  const readerSource = artifacts.get(readerPath);
  const manifestSource = artifacts.get("/editions/index.json");

  assert.ok(readerSource, `missing generated reader projection ${readerPath}`);
  assert.ok(manifestSource, "missing generated archive manifest");

  const reader = JSON.parse(readerSource);
  const manifest = JSON.parse(manifestSource);
  const canonicalStories = Object.values(canonical.desks)
    .map((page) => page.story)
    .filter(Boolean);
  const readerStories = reader.desks.filter((desk) => desk.state === "story");
  const canonicalQuietCount = Object.values(canonical.desks).filter(
    (page) => page.story === null,
  ).length;

  assert.equal(reader.kind, "first-fold/reader-edition");
  assert.equal(reader.readerProjectionVersion, 2);
  assert.equal(reader.canonicalEditionId, canonical.id);
  assert.equal(reader.id, canonical.editionDate);
  assert.equal(reader.issueNumber, canonical.issueNumber);
  assert.equal(reader.status, canonical.status);
  assert.equal(reader.frontPage.leadStoryId, canonical.frontPage.leadStoryId);
  assert.deepEqual(reader.frontPage.storyOrder, canonical.frontPage.storyOrder);
  assert.equal(reader.validation.issues.length, 0);
  assert.equal(reader.validation.contentSha256, reader.sourceRevision);
  assert.deepEqual(reader.backPage.watchNext, canonical.backPage.watchNext);
  assert.deepEqual(
    reader.desks.map(({ id, label }) => ({ id, label })),
    [
      { id: "ai", label: "AI & Models" },
      { id: "work-and-tools", label: "Work & Tools" },
      { id: "security-and-privacy", label: "Security & Privacy" },
      { id: "platforms-and-power", label: "Platforms & Power" },
    ],
  );
  assert.equal(readerStories.length, canonicalStories.length);
  assert.equal(
    reader.desks.filter((desk) => desk.state === "quiet").length,
    canonicalQuietCount,
  );

  for (const story of canonicalStories) {
    const projectedStory = readerStories.find(
      (candidate) => candidate.storyId === story.id,
    );
    assert.ok(projectedStory, `missing reader projection for ${story.id}`);
    assert.equal(projectedStory.headline, story.headline);
    assert.equal(projectedStory.deck, story.deck);
    assert.equal(projectedStory.score, story.selection.score);
    assert.equal(projectedStory.sources.length, story.sources.length);
    assert.deepEqual(projectedStory.sections, {
      whatHappened: story.whatHappened,
      whyItMatters: story.whyItMatters,
      whatToDoOrWatch: story.whatToDoOrWatch,
    });
  }

  assert.equal(manifest.kind, "first-fold/archive-manifest");
  assert.equal(manifest.latest, reader.id);
  assert.equal(manifest.editions.length, 1);

  const manifestEntry = manifest.editions[0];
  assert.equal(manifestEntry.id, reader.id);
  assert.equal(manifestEntry.issueNumber, reader.issueNumber);
  assert.equal(manifestEntry.storyCount, readerStories.length);
  assert.equal(manifestEntry.quietDeskCount, canonicalQuietCount);
  assert.equal(manifestEntry.estimatedMinutes, reader.estimatedMinutes);

  for (const edition of manifest.editions) {
    assert.ok(
      artifacts.has(`/editions/${edition.id}.json`),
      `archive entry ${edition.id} has no reader artifact`,
    );
  }
});

test("the editorial policy still encodes the cutoff and quiet-desk rules", async () => {
  const pipeline = await readFile(new URL("../lib/editorial/pipeline.ts", import.meta.url), "utf8");
  const policy = await readFile(new URL("../lib/editorial/prompts/policy.ts", import.meta.url), "utf8");

  assert.match(pipeline, /05:00 ET/);
  assert.match(pipeline, /06:00 ET/);
  assert.match(policy, /Never publish filler/i);
  assert.match(policy, /AI & Models, Work &/);
  assert.match(policy, /at most two AI-adjacent stories/i);
  assert.match(policy, /Watch Next is a bounded watchlist/i);
});
