import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const [readerHtml, readerScript, readerStyles, editorHtml, editorScript] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
  readFile(new URL("../editor/index.html", import.meta.url), "utf8"),
  readFile(new URL("../editor.js", import.meta.url), "utf8"),
]);

function loadEditorFunctions() {
  const placeholder = {};
  const context = vm.createContext({
    console,
    document: { querySelector: () => placeholder },
    fetch: () => new Promise(() => {}),
  });
  vm.runInContext(editorScript, context, { filename: "editor.js" });
  return context;
}

function candidateData(sourceCheckStatus = "passed") {
  const revision = "a".repeat(64);
  return {
    status: "published",
    sourceRevision: revision,
    review: {
      generation: {
        workflow: "morning-press",
        runId: "12345",
        runUrl: "https://github.com/itworksinprod/first-fold/actions/runs/12345",
        candidate: true,
        generatedAt: "2026-08-20T09:50:00.000Z",
        pilotSequence: 1,
      },
      sourceCheck: {
        status: sourceCheckStatus,
        checkedAt: sourceCheckStatus === "not-run" ? null : "2026-08-20T09:52:00.000Z",
        checkedSourceCount: sourceCheckStatus === "not-run" ? 0 : 8,
        issues: sourceCheckStatus === "passed" ? [] : [{
          code: "source-check-incomplete",
          severity: "error",
          path: "desks.ai.story.sources[0]",
          message: "Source QA is incomplete.",
        }],
      },
    },
  };
}

test("Press Desk treats a publication-ready bot artifact as an unapproved candidate", () => {
  const editor = loadEditorFunctions();
  const candidate = candidateData();

  assert.equal(editor.isAutomatedCandidate(candidate), true);
  assert.equal(editor.isReviewSurface({ hostname: "127.0.0.1", search: "", protocol: "http:" }), true);
  assert.equal(editor.isReviewSurface({ hostname: "itworksinprod.github.io", search: "", protocol: "https:" }), false);
  assert.equal(
    editor.editionStatusPresentation("published", true).label,
    "Automated candidate · Awaiting human approval",
  );
  assert.equal(editor.effectivePipelineStatus({ stage: "Publish", status: "complete" }, "published", true), "pending");
  assert.match(editor.automationPresentation(candidate).detail, /does not record approval/);
  assert.equal(
    editor.automationPresentation(candidate).runUrl,
    "https://github.com/itworksinprod/first-fold/actions/runs/12345",
  );
  assert.match(editor.sourceCheckPresentation(candidate).detail, /does not approve claims, copy, or model output/);
  assert.equal(editor.revisionPresentation(candidate, true).label, candidate.sourceRevision);
  assert.match(editor.revisionPresentation(candidate, true).detail, /Content SHA-256 lets the artifact be matched to the candidate content/);
  assert.match(editor.revisionPresentation(candidate, true).detail, /not a Git commit SHA or an approval record/);
  assert.match(editor.revisionPresentation(candidate, true).detail, /current PR commit SHA shown in GitHub/);
  assert.match(editor.revisionPresentation(candidate, true).detail, /not deployed until the release gate passes/);
});

test("Press Desk only links to this repository's numeric Actions run path", () => {
  const editor = loadEditorFunctions();
  const candidate = candidateData();

  for (const runUrl of [
    "https://example.com/itworksinprod/first-fold/actions/runs/12345",
    "https://github.com/another-owner/first-fold/actions/runs/12345",
    "https://github.com/itworksinprod/first-fold/actions/runs/not-a-number",
    "https://github.com/itworksinprod/first-fold/actions/runs/12345?attempt=2",
  ]) {
    candidate.review.generation.runUrl = runUrl;
    assert.equal(editor.automationPresentation(candidate).runUrl, null);
  }
});

test("missing or incomplete source QA never appears as approval-ready", () => {
  const editor = loadEditorFunctions();
  assert.equal(editor.sourceCheckPresentation({}).state, "missing");
  assert.match(editor.sourceCheckPresentation({}).label, /treat as unchecked/);
  assert.equal(editor.sourceCheckPresentation(candidateData("not-run")).state, "not-run");

  const candidateChecks = editor.browserPreflight({
    ...candidateData("not-run"),
    kind: "first-fold/reader-edition",
    readerProjectionVersion: 2,
    validation: { contentSha256: "a".repeat(64), issues: [] },
    desks: ["ai", "work-and-tools", "security-and-privacy", "platforms-and-power"].map((id) => ({
      id,
      state: "quiet",
      emptyReason: "No story cleared the bar.",
    })),
  });
  const sourceGate = candidateChecks.find(({ label }) => label === "Automated source check passed");
  assert.equal(sourceGate?.passed, false);
  assert.match(sourceGate?.detail ?? "", /do not approve this revision/);
});

test("reader and Press Desk visibly separate generation, checking, and approval", () => {
  assert.match(editorHtml, /data-automation-status/);
  assert.match(editorHtml, /data-source-check-status/);
  assert.match(editorHtml, /data-revision-status/);
  assert.match(editorHtml, /<dt>Content SHA-256<\/dt>/);
  assert.match(editorHtml, /Automation and model output are inputs—not approval/);
  assert.match(editorHtml, /Checks do not approve model output/);
  assert.match(editorScript, /Not approved or deployed · No model output is approved/);

  assert.match(readerScript, /candidate: "Automated candidate · Awaiting human approval"/);
  assert.match(readerScript, /generationMetadata\(data\)\?\.candidate === true && isReviewSurface\(\)/);
  assert.match(readerScript, /source QA and model output are not editorial approval/);
  assert.match(readerScript, /It is not approved or deployed/);
  assert.match(readerScript, /Content SHA-256 \$\{contentSha256\} lets this artifact be matched to the candidate content/);
  assert.match(readerScript, /current PR commit SHA shown in GitHub/);
  assert.match(
    readerScript,
    /the paper was researched and drafted automatically; source QA and exact-revision human review passed before release/,
  );
  assert.match(readerScript, /publishedMethodStatus\(data\)/);
  assert.match(readerScript, /shareEditionButton\.disabled = displayStatus === "candidate"/);
  assert.match(readerHtml, /data-edition-review-summary hidden/);
  assert.match(readerStyles, /\.demo-ribbon\[data-publication-status="candidate"\]/);
});
