import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const [editorScript, editorHtml] = await Promise.all([
  readFile(new URL("../editor.js", import.meta.url), "utf8"),
  readFile(new URL("../editor/index.html", import.meta.url), "utf8"),
]);

function loadEditorFunctions() {
  const placeholder = {};
  const context = vm.createContext({
    console,
    document: {
      querySelector: () => placeholder,
    },
    fetch: () => new Promise(() => {}),
  });
  vm.runInContext(editorScript, context, { filename: "editor.js" });
  return context;
}

test("the Press Desk is review-only and routes approval to GitHub", () => {
  assert.doesNotMatch(editorScript, /localStorage|Approved locally|Approve demo edition|Reset local approval/);
  assert.doesNotMatch(editorHtml, /data-approve-edition|approval is stored on this device/i);
  assert.match(editorHtml, /data-editor-issue/);
  assert.match(editorHtml, /href="https:\/\/github\.com\/itworksinprod\/first-fold\/pulls"/);
  assert.match(editorHtml, /review-only · GitHub records approval/);
  assert.match(editorScript, /Approval must target the current PR commit SHA shown in GitHub/);
  assert.match(editorScript, /recorded by reviewing and merging that pull request, never in this browser/);
  assert.match(editorScript, /String\(data\.issueNumber\)\.padStart\(3, "0"\)/);
});

test("canonical edition status controls the review label and Publish stage", () => {
  const editor = loadEditorFunctions();

  assert.equal(editor.editionStatusPresentation("draft").label, "Draft · not approved");
  assert.equal(editor.editionStatusPresentation("validated").label, "Validated · awaiting editor");
  assert.equal(editor.editionStatusPresentation("published").label, "Published");

  const publishStage = { stage: "Publish", status: "complete" };
  assert.equal(editor.effectivePipelineStatus(publishStage, "draft"), "pending");
  assert.equal(editor.effectivePipelineStatus(publishStage, "validated"), "pending");
  assert.equal(editor.effectivePipelineStatus(publishStage, "published"), "complete");
  assert.equal(
    editor.effectivePipelineStatus({ stage: "Validate", status: "complete" }, "draft"),
    "complete",
  );
});

test("an all-quiet edition passes the selected-story evidence check", () => {
  const editor = loadEditorFunctions();
  const revision = "a".repeat(64);
  const data = {
    kind: "first-fold/reader-edition",
    readerProjectionVersion: 2,
    sourceRevision: revision,
    validation: {
      contentSha256: revision,
      issues: [],
    },
    desks: [
      "ai",
      "work-and-tools",
      "security-and-privacy",
      "platforms-and-power",
    ].map((id) => ({
      id,
      state: "quiet",
      emptyReason: "No edition-worthy development cleared the bar.",
    })),
  };

  const checks = editor.browserPreflight(data);
  const evidenceCheck = checks.find(({ label }) => label === "Every selected story has evidence");

  assert.equal(evidenceCheck?.passed, true);
  assert.equal(checks.every(({ passed }) => passed), true);
});
