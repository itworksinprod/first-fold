const archiveList = document.querySelector("[data-archive-list]");
const archiveCount = document.querySelector("[data-archive-count]");
const archiveScope = document.querySelector("[data-archive-scope]");

function renderEmpty(message) {
  const empty = document.createElement("p");
  empty.className = "utility-empty";
  empty.textContent = message;
  archiveList.replaceChildren(empty);
}

function renderEditions(manifest) {
  archiveList.replaceChildren();
  const unpublishedCount = manifest.editions.filter((edition) => edition.status !== "published").length;
  archiveScope.textContent = unpublishedCount > 0 ? "Local review archive" : "Published issues";
  archiveCount.textContent = unpublishedCount > 0
    ? `${manifest.editions.length} editions · ${unpublishedCount} unpublished`
    : `${manifest.editions.length} ${manifest.editions.length === 1 ? "edition" : "editions"}`;

  for (const edition of manifest.editions) {
    const article = document.createElement("article");
    article.className = "archive-card";
    if (edition.status !== "published") article.classList.add("is-unpublished");

    const folio = document.createElement("p");
    folio.className = "archive-folio";
    folio.textContent = `Issue ${String(edition.issueNumber).padStart(3, "0")} · ${edition.status}`;

    const heading = document.createElement("h3");
    const link = document.createElement("a");
    link.href = `../?edition=${edition.id}#front`;
    link.textContent = edition.displayDate;
    heading.append(link);

    const summary = document.createElement("p");
    summary.className = "archive-summary";
    summary.textContent = edition.summary;

    const stats = document.createElement("p");
    stats.className = "archive-stats";
    stats.textContent = `${edition.storyCount} stories · ${edition.quietDeskCount} ${edition.quietDeskCount === 1 ? "quiet desk" : "quiet desks"} · ${edition.estimatedMinutes} minutes`;

    const action = document.createElement("a");
    action.className = "archive-action";
    action.href = link.href;
    action.textContent = edition.status === "published" ? "Unfold this edition →" : "Review this draft →";

    article.append(folio, heading, summary, stats, action);
    archiveList.append(article);
  }
}

fetch("../editions/index.json?v=2", { headers: { accept: "application/json" } })
  .then((response) => {
    if (!response.ok) throw new Error("Archive unavailable");
    return response.json();
  })
  .then((manifest) => {
    if (!Array.isArray(manifest.editions)) throw new Error("Invalid archive");
    renderEditions(manifest);
  })
  .catch(() => {
    archiveCount.textContent = "Archive unavailable";
    renderEmpty("The edition index could not be loaded. Today’s paper is still available from the masthead.");
  });
