const reviewStatus = document.querySelector("[data-review-status]");
const reviewDetail = document.querySelector("[data-review-detail]");
const issueLabel = document.querySelector("[data-editor-issue]");
const pipelineList = document.querySelector("[data-pipeline-list]");
const deskReview = document.querySelector("[data-desk-review]");
const deskSummary = document.querySelector("[data-desk-summary]");
const validationList = document.querySelector("[data-validation-list]");
const validationSummary = document.querySelector("[data-validation-summary]");
const reviewBanner = document.querySelector("[data-review-banner]");
const automationFact = document.querySelector("[data-automation-fact]");
const automationStatus = document.querySelector("[data-automation-status]");
const automationDetail = document.querySelector("[data-automation-detail]");
const automationRun = document.querySelector("[data-automation-run]");
const sourceCheckFact = document.querySelector("[data-source-check-fact]");
const sourceCheckStatus = document.querySelector("[data-source-check-status]");
const sourceCheckDetail = document.querySelector("[data-source-check-detail]");
const revisionFact = document.querySelector("[data-revision-fact]");
const revisionStatus = document.querySelector("[data-revision-status]");
const revisionDetail = document.querySelector("[data-revision-detail]");

const deskLabels = {
  ai: "AI & Models",
  "work-and-tools": "Work & Tools",
  "security-and-privacy": "Security & Privacy",
  "platforms-and-power": "Platforms & Power",
};

function generationMetadata(data) {
  return data?.review?.generation ?? data?.provenance?.automation ?? null;
}

function sourceCheckMetadata(data) {
  return data?.review?.sourceCheck ?? data?.provenance?.sourceCheck ?? null;
}

function isAutomatedCandidate(data) {
  return generationMetadata(data)?.candidate === true;
}

function trustedAutomationRunUrl(value) {
  return /^https:\/\/github\.com\/itworksinprod\/first-fold\/actions\/runs\/\d+\/?$/.test(value ?? "")
    ? value
    : null;
}

function isReviewSurface(locationLike = globalThis.location) {
  const hostname = locationLike?.hostname ?? "";
  const search = locationLike?.search ?? "";
  return (
    locationLike?.protocol === "file:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    /(?:^|[?&])review=candidate(?:&|$)/.test(search)
  );
}

function editionStatusPresentation(status, automatedCandidateReview = false) {
  if (automatedCandidateReview) {
    return {
      label: "Automated candidate · Awaiting human approval",
      detail: "This publication-ready candidate is not approved or deployed.",
    };
  }
  if (status === "draft") return { label: "Draft · not approved", detail: "This draft has not been approved." };
  if (status === "validated") return { label: "Validated · awaiting editor", detail: "Automatic checks passed; editor approval is still required." };
  if (status === "published") return { label: "Published", detail: "This edition is publicly released." };
  return { label: "Unknown status", detail: "The canonical edition status is not recognized." };
}

function automationPresentation(data) {
  const generation = generationMetadata(data);
  if (!generation) {
    return {
      state: "missing",
      label: "Not recorded",
      detail: "This artifact cannot prove whether automation generated it. Do not infer provenance.",
      runUrl: null,
    };
  }

  const workflow = generation.workflow === "morning-press"
    ? "Morning Press"
    : generation.workflow || "Recorded workflow";
  const run = generation.runId ? `Run ${generation.runId}` : "Run id missing";
  const pilot = Number.isInteger(generation.pilotSequence) ? ` · pilot ${generation.pilotSequence}` : "";
  const generated = Number.isFinite(Date.parse(generation.generatedAt ?? ""))
    ? ` · generated ${generation.generatedAt}`
    : " · generation time missing";
  return {
    state: generation.candidate === true ? "candidate" : "recorded",
    label: `${workflow} automation`,
    detail: `${run}${pilot}${generated}. Generation records origin; it does not record approval.`,
    runUrl: trustedAutomationRunUrl(generation.runUrl),
  };
}

function sourceCheckPresentation(data) {
  const check = sourceCheckMetadata(data);
  if (!check) {
    return {
      state: "missing",
      label: "Not recorded · treat as unchecked",
      detail: "Source links are present, but this artifact contains no source-check result.",
    };
  }

  const count = Number.isInteger(check.checkedSourceCount)
    ? `${check.checkedSourceCount} ${check.checkedSourceCount === 1 ? "source" : "sources"}`
    : "source count not recorded";
  const issueCount = Array.isArray(check.issues) ? check.issues.length : 0;
  const checkedAt = Number.isFinite(Date.parse(check.checkedAt ?? ""))
    ? ` Checked ${check.checkedAt}.`
    : " Check time not recorded.";
  if (check.status === "passed") {
    return {
      state: "passed",
      label: `Passed · ${count}`,
      detail: `Automated source QA passed.${checkedAt} It does not approve claims, copy, or model output.`,
    };
  }
  if (check.status === "warnings") {
    return {
      state: "warnings",
      label: `Warnings · ${count}`,
      detail: `${issueCount} ${issueCount === 1 ? "issue needs" : "issues need"} human review; approval must wait.${checkedAt}`,
    };
  }
  if (check.status === "failed") {
    return {
      state: "failed",
      label: `Failed · ${count}`,
      detail: `${issueCount || "One or more"} source-check ${issueCount === 1 ? "issue blocks" : "issues block"} approval.${checkedAt}`,
    };
  }
  return {
    state: "not-run",
    label: "Not run · treat as unchecked",
    detail: "The source check must pass before this candidate is ready for human approval.",
  };
}

function revisionPresentation(data, automatedCandidateReview) {
  const contentSha256 = /^[a-f0-9]{64}$/.test(data.sourceRevision ?? "")
    ? data.sourceRevision
    : "Content digest unavailable";
  if (automatedCandidateReview) {
    return {
      state: "pending",
      label: contentSha256,
      detail: "This Content SHA-256 lets the artifact be matched to the candidate content; it is not a Git commit SHA or an approval record. Approval must target the current PR commit SHA shown in GitHub, and any commit change requires a new approval. It is not deployed until the release gate passes.",
    };
  }
  if (data.status === "published") {
    return {
      state: "published",
      label: contentSha256,
      detail: "This Content SHA-256 matches the released artifact to its canonical content; it is not a Git commit SHA or an approval record. Verify the approved PR commit SHA in GitHub merge history.",
    };
  }
  return {
    state: "pending",
    label: contentSha256,
    detail: "This Content SHA-256 matches the artifact to its candidate content; it is not a Git commit SHA or an approval record. Validation and model output never approve a commit; GitHub review must target the current PR commit SHA.",
  };
}

function renderReviewRecord(data, automatedCandidateReview) {
  const automation = automationPresentation(data);
  automationFact.dataset.state = automation.state;
  automationStatus.textContent = automation.label;
  automationDetail.textContent = automation.detail;
  automationRun.hidden = !automation.runUrl;
  if (automation.runUrl) automationRun.href = automation.runUrl;

  const sourceCheck = sourceCheckPresentation(data);
  sourceCheckFact.dataset.state = sourceCheck.state;
  sourceCheckStatus.textContent = sourceCheck.label;
  sourceCheckDetail.textContent = sourceCheck.detail;

  const revision = revisionPresentation(data, automatedCandidateReview);
  revisionFact.dataset.state = revision.state;
  revisionStatus.textContent = revision.label;
  revisionDetail.textContent = revision.detail;

  reviewBanner.textContent = automatedCandidateReview
    ? "Automated candidate · Not approved or deployed · No model output is approved"
    : data.status === "published"
      ? "Published edition record · Generation alone never records approval"
      : "Review-only draft · No model output is approved · GitHub records current-commit approval";
}

function renderStatus(data, preflightPassed, automatedCandidateReview = false) {
  const presentation = editionStatusPresentation(data.status, automatedCandidateReview);
  const issueNumber = Number.isInteger(data.issueNumber)
    ? String(data.issueNumber).padStart(3, "0")
    : "—";
  issueLabel.textContent = `${automatedCandidateReview ? "Morning Press candidate" : "Morning run"} · Issue ${issueNumber}`;
  reviewStatus.textContent = presentation.label;
  reviewDetail.textContent = preflightPassed
    ? `${presentation.detail} Automation, validation, and model output do not approve it. Approval must target the current PR commit SHA shown in GitHub and is recorded by reviewing and merging that pull request, never in this browser.`
    : `Browser preflight found blocking issues. Resolve them before reviewing the current PR commit SHA in GitHub; approval is never recorded in this browser.`;
  renderReviewRecord(data, automatedCandidateReview);
}

function effectivePipelineStatus(stage, editionStatus, automatedCandidateReview = false) {
  if (stage.stage !== "Publish") return stage.status;
  return editionStatus === "published" && !automatedCandidateReview ? "complete" : "pending";
}

function renderPipeline(stages, editionStatus, automatedCandidateReview = false) {
  pipelineList.replaceChildren();
  for (const stage of stages) {
    const effectiveStatus = effectivePipelineStatus(stage, editionStatus, automatedCandidateReview);
    const item = document.createElement("li");
    item.className = "pipeline-step";
    item.dataset.status = effectiveStatus;

    const time = document.createElement("span");
    time.textContent = stage.time;
    const name = document.createElement("strong");
    name.textContent = stage.stage;
    const status = document.createElement("small");
    status.textContent = effectiveStatus;

    item.append(time, name, status);
    pipelineList.append(item);
  }
}

function appendSourceLinks(card, desk) {
  if (desk.state !== "story") return;
  const list = document.createElement("ul");
  list.className = "press-source-list";
  for (const source of desk.sources) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.textContent = `${source.badge}: ${source.publisher} ↗`;
    item.append(link);
    list.append(item);
  }
  card.append(list);
}

function renderDesks(desks) {
  deskReview.replaceChildren();
  const selected = desks.filter((desk) => desk.state === "story").length;
  deskSummary.textContent = `${selected} selected · ${desks.length - selected} quiet`;

  for (const desk of desks) {
    const card = document.createElement("article");
    card.className = `press-desk-card is-${desk.state}`;

    const header = document.createElement("div");
    const label = document.createElement("p");
    label.textContent = `${deskLabels[desk.id] ?? desk.label} · page ${desk.page}`;
    const badge = document.createElement("span");
    badge.textContent = desk.state === "story" ? `Score ${desk.score}` : "Quiet desk";
    header.append(label, badge);

    const headline = document.createElement("h3");
    headline.textContent = desk.headline;
    const detail = document.createElement("p");
    detail.textContent = desk.state === "story" ? desk.selectedBecause : desk.emptyReason;

    const meta = document.createElement("p");
    meta.className = "press-desk-meta";
    meta.textContent = desk.state === "story"
      ? `${desk.confidenceLabel} · ${desk.sources.length} ${desk.sources.length === 1 ? "source" : "sources"}`
      : `No qualifying story · threshold ${desk.minimumScore}`;

    card.append(header, headline, detail, meta);
    appendSourceLinks(card, desk);
    deskReview.append(card);
  }
}

function browserPreflight(data) {
  const desks = Array.isArray(data.desks) ? data.desks : [];
  const deskIds = desks.map((desk) => desk.id);
  const stories = desks.filter((desk) => desk.state === "story");
  const quietDesks = desks.filter((desk) => desk.state === "quiet");
  const generatedIssues = Array.isArray(data.validation?.issues) ? data.validation.issues : ["Missing build validation record."];
  const generation = generationMetadata(data);
  const sourceCheck = sourceCheckMetadata(data);

  const checks = [
    {
      label: "Generated from canonical Edition v2",
      passed: data.kind === "first-fold/reader-edition" && data.readerProjectionVersion === 2,
    },
    {
      label: "Content SHA-256 matches build record",
      passed: /^[a-f0-9]{64}$/.test(data.sourceRevision ?? "") && data.validation?.contentSha256 === data.sourceRevision,
    },
    {
      label: "Exactly four unique desks",
      passed: desks.length === 4 && new Set(deskIds).size === 4,
    },
    {
      label: "Every selected story has evidence",
      passed: stories.every((desk) => Array.isArray(desk.sources) && desk.sources.length > 0 && desk.score >= 70),
    },
    {
      label: "Quiet desks explain the omission",
      passed: quietDesks.every((desk) => typeof desk.emptyReason === "string" && desk.emptyReason.trim().length > 0),
    },
    {
      label: "Canonical build validation (not editorial approval)",
      passed: generatedIssues.length === 0,
      detail: generatedIssues.length === 0 ? null : generatedIssues.join(" "),
    },
  ];

  if (generation?.candidate === true) {
    checks.push(
      {
        label: "Morning Press automation provenance recorded",
        passed: generation.workflow === "morning-press" && Boolean(generation.runId),
        detail: generation.workflow === "morning-press" && generation.runId
          ? "Generation origin is recorded; this is not approval."
          : "The automated candidate is missing its workflow or run id.",
      },
      {
        label: "Automated source check passed",
        passed: sourceCheck?.status === "passed",
        detail: sourceCheck?.status === "passed"
          ? "Source QA passed; claims and copy still require human review."
          : `Source-check status is ${sourceCheck?.status ?? "not recorded"}; do not approve this revision.`,
      },
    );
  }

  return checks;
}

function renderValidation(data) {
  validationList.replaceChildren();
  const checks = browserPreflight(data);
  const passed = checks.filter((check) => check.passed).length;
  validationSummary.textContent = `${passed} of ${checks.length} passed`;

  for (const check of checks) {
    const item = document.createElement("li");
    item.dataset.passed = String(check.passed);
    const mark = document.createElement("span");
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = check.passed ? "✓" : "!";
    const copy = document.createElement("span");
    const label = document.createElement("strong");
    label.textContent = check.label;
    copy.append(label);
    if (check.detail) {
      const detail = document.createElement("small");
      detail.textContent = check.detail;
      copy.append(detail);
    }
    item.append(mark, copy);
    validationList.append(item);
  }

  return checks.every((check) => check.passed);
}

async function loadLatestEdition() {
  const manifestResponse = await fetch("../editions/index.json?v=2", { headers: { accept: "application/json" } });
  if (!manifestResponse.ok) throw new Error("Archive unavailable");
  const manifest = await manifestResponse.json();
  if (manifest.kind !== "first-fold/archive-manifest" || !manifest.latest) throw new Error("Invalid archive manifest");

  const editionResponse = await fetch(`../editions/${manifest.latest}.json?v=2`, { headers: { accept: "application/json" } });
  if (!editionResponse.ok) throw new Error("Edition unavailable");
  return editionResponse.json();
}

loadLatestEdition()
  .then((data) => {
    const automatedCandidateReview = isAutomatedCandidate(data) && isReviewSurface();
    renderPipeline(Array.isArray(data.pipeline) ? data.pipeline : [], data.status, automatedCandidateReview);
    renderDesks(Array.isArray(data.desks) ? data.desks : []);
    const preflightPassed = renderValidation(data);
    renderStatus(data, preflightPassed, automatedCandidateReview);
  })
  .catch(() => {
    issueLabel.textContent = "Morning run · unavailable";
    reviewStatus.textContent = "Edition unavailable";
    reviewDetail.textContent = "The generated edition and archive artifacts could not be loaded.";
    deskSummary.textContent = "Unavailable";
    validationSummary.textContent = "Unavailable";
  });
