const approveButton = document.querySelector("[data-approve-edition]");
const reviewStatus = document.querySelector("[data-review-status]");
const reviewDetail = document.querySelector("[data-review-detail]");
const pipelineList = document.querySelector("[data-pipeline-list]");
const deskReview = document.querySelector("[data-desk-review]");
const deskSummary = document.querySelector("[data-desk-summary]");
const validationList = document.querySelector("[data-validation-list]");
const validationSummary = document.querySelector("[data-validation-summary]");
const announcer = document.querySelector("[data-editor-announcer]");

let edition = null;
let approvalKey = null;
let canApprove = false;

function currentApproval() {
  if (!approvalKey) return null;
  try {
    return JSON.parse(window.localStorage.getItem(approvalKey));
  } catch {
    return null;
  }
}

function renderStatus() {
  const approval = currentApproval();
  if (!canApprove) {
    reviewStatus.textContent = "Preflight blocked";
    reviewDetail.textContent = "Resolve the validation issues before a human decision can be recorded.";
    approveButton.textContent = "Approval unavailable";
    approveButton.disabled = true;
    approveButton.dataset.approved = "false";
    return;
  }

  const approved = Boolean(approval);
  reviewStatus.textContent = approved ? "Approved locally" : "Validated · awaiting review";
  reviewDetail.textContent = approved
    ? `This device approved revision ${edition.sourceRevision.slice(0, 10)} at ${new Date(approval.approvedAt).toLocaleString()}. No published content changed.`
    : "Automatic checks passed. Human approval is the final demo gate.";
  approveButton.textContent = approved ? "Reset local approval" : "Approve demo edition";
  approveButton.disabled = false;
  approveButton.dataset.approved = String(approved);
}

function renderPipeline(stages) {
  pipelineList.replaceChildren();
  for (const stage of stages) {
    const item = document.createElement("li");
    item.className = "pipeline-step";
    item.dataset.status = stage.status;

    const time = document.createElement("span");
    time.textContent = stage.time;
    const name = document.createElement("strong");
    name.textContent = stage.stage;
    const status = document.createElement("small");
    status.textContent = stage.status;

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
    label.textContent = `${desk.label} · page ${desk.page}`;
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

  return [
    {
      label: "Generated from canonical Edition v1",
      passed: data.kind === "first-fold/reader-edition" && data.readerProjectionVersion === 1,
    },
    {
      label: "Revision-bound SHA-256 record",
      passed: /^[a-f0-9]{64}$/.test(data.sourceRevision ?? "") && data.validation?.contentSha256 === data.sourceRevision,
    },
    {
      label: "Exactly four unique desks",
      passed: desks.length === 4 && new Set(deskIds).size === 4,
    },
    {
      label: "Every selected story has evidence",
      passed: stories.length > 0 && stories.every((desk) => Array.isArray(desk.sources) && desk.sources.length > 0 && desk.score >= 70),
    },
    {
      label: "Quiet desks explain the omission",
      passed: quietDesks.every((desk) => typeof desk.emptyReason === "string" && desk.emptyReason.trim().length > 0),
    },
    {
      label: "Canonical build validation",
      passed: generatedIssues.length === 0,
      detail: generatedIssues.length === 0 ? null : generatedIssues.join(" "),
    },
  ];
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

approveButton.addEventListener("click", () => {
  if (!edition || !canApprove || !approvalKey) return;
  const approved = approveButton.dataset.approved === "true";
  if (approved) {
    window.localStorage.removeItem(approvalKey);
  } else {
    window.localStorage.setItem(approvalKey, JSON.stringify({
      canonicalEditionId: edition.canonicalEditionId,
      sourceRevision: edition.sourceRevision,
      approvedAt: new Date().toISOString(),
    }));
  }
  renderStatus();
  announcer.textContent = approved ? "Local demo approval reset." : "Demo edition approved on this device.";
});

async function loadLatestEdition() {
  const manifestResponse = await fetch("../editions/index.json", { headers: { accept: "application/json" } });
  if (!manifestResponse.ok) throw new Error("Archive unavailable");
  const manifest = await manifestResponse.json();
  if (manifest.kind !== "first-fold/archive-manifest" || !manifest.latest) throw new Error("Invalid archive manifest");

  const editionResponse = await fetch(`../editions/${manifest.latest}.json`, { headers: { accept: "application/json" } });
  if (!editionResponse.ok) throw new Error("Edition unavailable");
  return editionResponse.json();
}

loadLatestEdition()
  .then((data) => {
    edition = data;
    approvalKey = `first-fold:demo-approval:${data.canonicalEditionId}:${data.sourceRevision}`;
    renderPipeline(Array.isArray(data.pipeline) ? data.pipeline : []);
    renderDesks(Array.isArray(data.desks) ? data.desks : []);
    canApprove = renderValidation(data);
    renderStatus();
  })
  .catch(() => {
    reviewStatus.textContent = "Edition unavailable";
    reviewDetail.textContent = "The generated edition and archive artifacts could not be loaded.";
    deskSummary.textContent = "Unavailable";
    validationSummary.textContent = "Unavailable";
    approveButton.disabled = true;
  });
