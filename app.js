const pages = [...document.querySelectorAll("[data-page]")];
const pageButtons = [...document.querySelectorAll("[data-go-page]")];
const previousButton = document.querySelector("[data-previous-page]");
const nextButton = document.querySelector("[data-next-page]");
const pageStatus = document.querySelector("[data-page-status]");
const announcer = document.querySelector("[data-page-announcer]");
const reader = document.querySelector("[data-reader]");
const sourcesDialog = document.querySelector("#sources-dialog");
const sourcesIntro = document.querySelector("[data-sources-intro]");
const sourcesList = document.querySelector("[data-sources-list]");
const offlineNotice = document.querySelector("[data-offline-notice]");
const offlineTitle = document.querySelector("[data-offline-title]");
const offlineMessage = document.querySelector("[data-offline-message]");
const unavailablePanel = document.querySelector("[data-edition-unavailable]");
const unavailableMessage = document.querySelector("[data-unavailable-message]");
const installBanner = document.querySelector("[data-install-banner]");
const installButton = document.querySelector("[data-install-app]");
const installCopy = document.querySelector("[data-install-copy]");
const installDialog = document.querySelector("#install-dialog");
const editionControls = document.querySelector(".edition-controls");
const keyboardHint = document.querySelector(".keyboard-hint");
const demoRibbon = document.querySelector(".demo-ribbon");

const fallbackSourceSets = {
  ai: {
    headline: "OpenAI rewrites its safety rules as Astra tests the old ones",
    sources: [
      {
        badge: "Independent reporting",
        publisher: "Axios · August 18, 2026",
        title: "OpenAI to rewrite its safety rules post-Hugging Face",
        url: "https://www.axios.com/2026/08/18/openai-pause-astra-preparedness-framework",
      },
      {
        badge: "Primary source",
        publisher: "OpenAI · August 7, 2026",
        title: "Responding to the next frontier of critical cyber capabilities",
        url: "https://openai.com/index/responding-next-frontier-critical-cyber-capabilities/",
      },
      {
        badge: "Context",
        publisher: "OpenAI · August 17, 2026",
        title: "The Defender’s Window",
        url: "https://openai.com/index/the-defenders-window/",
      },
    ],
  },
  "work-and-tools": {
    headline: "Microsoft folds Deep Research into a paid workflow",
    sources: [
      {
        badge: "Primary source",
        publisher: "Microsoft Support · effective August 18, 2026",
        title: "Deep Research is being retired in the Copilot app",
        url: "https://support.microsoft.com/en-us/microsoft-copilot/deep-research-in-microsoft-copilot",
      },
    ],
  },
  "security-and-privacy": {
    headline: "France’s tax breach reaches 678,000 people and businesses",
    sources: [
      {
        badge: "Independent reporting",
        publisher: "Le Monde · August 18, 2026",
        title: "French government embroiled in taxpayer data hack",
        url: "https://www.lemonde.fr/en/politics/article/2026/08/18/french-government-embroiled-in-taxpayer-data-hack-decried-as-country-s-most-serious-ever_6756624_5.html",
      },
      {
        badge: "Initial reporting",
        publisher: "Le Monde · August 14, 2026",
        title: "French taxpayers’ data stolen in hack of Finance Ministry",
        url: "https://www.lemonde.fr/en/pixels/article/2026/08/14/french-taxpayers-data-stolen-in-hack-of-finance-ministry_6756510_13.html",
      },
    ],
  },
};

const pageSlugs = ["front", "ai", "work-and-tools", "security-and-privacy", "platforms-and-power", "back"];
const legacyPageSlugAliases = {
  "ai-at-work": "work-and-tools",
  cybersecurity: "security-and-privacy",
  technology: "platforms-and-power",
};
const deskLabels = {
  ai: "AI & Models",
  "work-and-tools": "Work & Tools",
  "security-and-privacy": "Security & Privacy",
  "platforms-and-power": "Platforms & Power",
};
let sourceSets = fallbackSourceSets;
let editionData = null;

let currentPage = 0;
let dialogOpener = null;
let pointerStart = null;
let pageStateInitialized = false;
let turnTimer = null;
let deferredInstallPrompt = null;
let editionLoadState = "loading";
let cachedEditionAt = null;
let unavailableEditionId = null;

function setText(selector, value, root = document) {
  const element = root.querySelector(selector);
  if (element && typeof value === "string") element.textContent = value;
}

function requestedEditionId() {
  const value = new URLSearchParams(window.location.search).get("edition");
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function cachedAtLabel(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "at an unknown time";
  return `at ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))}`;
}

function updateOfflineNotice() {
  const disconnected = navigator.onLine === false;
  const shouldShow = disconnected || editionLoadState === "cached" || editionLoadState === "fallback";
  offlineNotice.hidden = !shouldShow;
  if (!shouldShow) return;

  if (editionLoadState === "fallback") {
    offlineTitle.textContent = "Edition unavailable.";
    const requestedCopy = unavailableEditionId
      ? `The requested ${unavailableEditionId} edition could not be verified.`
      : "The latest edition could not be checked.";
    offlineMessage.textContent = `${requestedCopy} No different issue has been substituted.`;
    return;
  }

  offlineTitle.textContent = "Offline copy.";
  if (editionLoadState === "cached") {
    const editionLabel = editionData?.displayDate ?? editionData?.id ?? "this edition";
    offlineMessage.textContent = `Showing ${editionLabel}, saved ${cachedAtLabel(cachedEditionAt)}. Reconnect before treating it as today’s paper.`;
    return;
  }

  const editionLabel = editionData?.displayDate ?? "the loaded edition";
  offlineMessage.textContent = `Showing ${editionLabel}. Reconnect to check whether a newer paper is on the doorstep.`;
}

function setEditionAvailable(available, message = "") {
  reader.hidden = !available;
  editionControls.hidden = !available;
  keyboardHint.hidden = !available;
  demoRibbon.hidden = !available;
  unavailablePanel.hidden = available;
  if (!available) unavailableMessage.textContent = message;
}

async function latestEditionId() {
  const response = await fetch("editions/index.json?v=2", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("Edition index not found");
  const manifest = await response.json();
  if (!manifest || !/^\d{4}-\d{2}-\d{2}$/.test(manifest.latest)) {
    throw new Error("Edition index failed validation");
  }
  return {
    id: manifest.latest,
    source: response.headers.get("x-first-fold-source"),
    cachedAt: response.headers.get("x-first-fold-cached-at"),
  };
}

function validateEditionData(data) {
  if (!data || data.readerProjectionVersion !== 2 || !data.canonicalEditionId || !Array.isArray(data.desks)) return false;
  const ids = data.desks.map((desk) => desk.id);
  return ids.length === 4 && new Set(ids).size === 4 && ids.every((id) => Object.hasOwn(deskLabels, id));
}

function pageIndexFromHash(hash = window.location.hash) {
  const requestedSlug = hash.slice(1);
  const canonicalSlug = legacyPageSlugAliases[requestedSlug] ?? requestedSlug;
  return pageSlugs.indexOf(canonicalSlug);
}

function hydrateStoryPage(desk) {
  const page = document.querySelector(`[data-desk-id="${desk.id}"]`);
  if (!page || desk.state !== "story") return;

  setText(".story-header .section-label", `${desk.statusLabel} · ${desk.confidenceLabel}`, page);
  setText(".story-header h2", desk.headline, page);
  setText(".story-deck", desk.deck, page);
  setText(".story-meta", `${desk.readTime} · Checked ${desk.checkedAt}`, page);

  const sectionParagraphs = page.querySelectorAll(".story-copy section p");
  const sectionValues = [desk.sections.whatHappened, desk.sections.whyItMatters, desk.sections.whatToDoOrWatch];
  sectionParagraphs.forEach((paragraph, index) => {
    if (sectionValues[index]) paragraph.textContent = sectionValues[index];
  });

  setText(".short-version strong, .action-box strong", desk.shortVersion, page);
  setText(".editor-note p:last-child", desk.selectedBecause, page);
  setText(".paper-footer > span:first-child", `Desk score: ${desk.score} / 100`, page);

  const sourceButton = page.querySelector("[data-story-sources]");
  if (sourceButton) {
    const count = desk.sources.length;
    sourceButton.setAttribute("aria-label", `Open ${count} sources for ${desk.headline}`);
    const countLabel = sourceButton.querySelector("span");
    if (countLabel) countLabel.textContent = `(${count}) ↗`;
  }
}

function renderWatchNext(items) {
  const card = document.querySelector("[data-watch-next-card]");
  const list = document.querySelector("[data-watch-next]");
  if (!card || !list || !Array.isArray(items)) return;

  const watchItems = items.slice(0, 3);
  card.hidden = watchItems.length === 0;
  list.replaceChildren();

  for (const item of watchItems) {
    const entry = document.createElement("li");
    const topic = document.createElement("strong");
    const unresolved = document.createElement("span");
    const signal = document.createElement("span");
    const signalLabel = document.createElement("b");

    topic.textContent = item.topic;
    unresolved.textContent = item.unresolved;
    signalLabel.textContent = "Meaningful next signal: ";
    signal.append(signalLabel, item.meaningfulSignal);
    entry.append(topic, unresolved, signal);
    list.append(entry);
  }
}

function hydrateEdition(data) {
  editionData = data;
  document.body.dataset.editionId = data.id;
  document.title = `${data.masthead.name} — ${data.displayDate}`;

  setText("[data-edition-data-status]", `Issue ${String(data.issueNumber).padStart(3, "0")} data loaded`);
  setText("[data-edition-date]", data.displayDate);
  setText("[data-edition-issue]", `Vol. I · No. ${String(data.issueNumber).padStart(3, "0")}`);
  setText("[data-edition-published]", `New York · ${data.publishedAt.replace(" ET", "")}`);
  setText("[data-edition-masthead]", data.masthead.name);
  setText("[data-edition-tagline]", data.masthead.tagline);
  setText("[data-front-headline]", data.frontPage.headline);
  setText("[data-front-standfirst]", data.frontPage.standfirst);
  setText("[data-front-editor-note]", data.frontPage.editorNote);
  setText("[data-reporting-window]", `Window: ${data.reportingWindow}`);
  setText("[data-back-issue]", `Issue ${String(data.issueNumber).padStart(3, "0")} · Demo edition`);

  for (const desk of data.desks) {
    const deskLabel = deskLabels[desk.id] ?? desk.label;
    const cover = document.querySelector(`[data-cover-desk="${desk.id}"]`);
    if (cover) {
      setText(".story-folio", `${deskLabel} · Page ${desk.page}`, cover);
      setText("strong", desk.headline, cover);
      const summary = cover.querySelector(":scope > span:last-child");
      if (summary) summary.textContent = desk.frontDeck;
      cover.setAttribute("aria-label", `Turn to ${deskLabel}, page ${desk.page}`);
      cover.closest(".front-story")?.classList.toggle(
        "is-edition-lead",
        desk.storyId === data.frontPage.leadStoryId,
      );
    }

    if (desk.state === "story") hydrateStoryPage(desk);
    if (desk.state === "quiet") {
      const quietPage = document.querySelector(`[data-desk-id="${desk.id}"]`);
      setText(".quiet-center h2", desk.headline, quietPage);
      setText(".quiet-center > p:not(.section-label)", desk.emptyReason, quietPage);
      const figures = quietPage?.querySelectorAll(".quiet-details strong");
      if (figures?.[0]) figures[0].textContent = desk.candidateCount == null ? "—" : String(desk.candidateCount);
      if (figures?.[1]) figures[1].textContent = String(desk.minimumScore);
    }
  }

  setText(".back-finish h2", data.backPage.headline);
  setText(".back-finish > p:not(.section-label)", data.backPage.summary);
  setText(".tomorrow-box h3", data.backPage.experimentTitle);
  setText(".tomorrow-box p:last-child", data.backPage.experiment);
  renderWatchNext(data.backPage.watchNext);

  sourceSets = Object.fromEntries(
    data.desks
      .filter((desk) => desk.state === "story")
      .map((desk) => [desk.id, { headline: desk.headline, sources: desk.sources }]),
  );

  const sourceFooter = document.querySelector(".source-footer");
  if (sourceFooter) {
    sourceFooter.textContent = `Edition checked ${data.shortDate} at ${data.checkedAt}. Links open the original reporting or primary material.`;
  }
}

async function loadEditionData() {
  const explicitEditionId = requestedEditionId();
  let editionId = explicitEditionId;
  let indexMetadata = null;
  unavailableEditionId = null;

  try {
    if (!editionId) {
      indexMetadata = await latestEditionId();
      editionId = indexMetadata.id;
    }
    const response = await fetch(`editions/${editionId}.json?v=2`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("Edition not found");
    const data = await response.json();
    if (!validateEditionData(data)) throw new Error("Edition data failed validation");
    hydrateEdition(data);
    setEditionAvailable(true);

    const responseSource = response.headers.get("x-first-fold-source");
    editionLoadState = responseSource === "offline-cache" || indexMetadata?.source === "offline-cache"
      ? "cached"
      : "live";
    cachedEditionAt =
      response.headers.get("x-first-fold-cached-at") ?? indexMetadata?.cachedAt ?? null;
    if (editionLoadState === "cached") {
      setText(
        "[data-edition-data-status]",
        `Offline copy · Issue ${String(data.issueNumber).padStart(3, "0")}`,
      );
    }
  } catch {
    editionLoadState = "fallback";
    cachedEditionAt = null;
    unavailableEditionId = explicitEditionId;
    setEditionAvailable(
      false,
      explicitEditionId
        ? `The ${explicitEditionId} edition is not saved here. Reconnect to check the archive, or return to the latest available paper.`
        : "The latest edition is not saved here. Reconnect once to put today’s paper on this device.",
    );
    setText("[data-edition-data-status]", "Edition unavailable");
  }
  updateOfflineNotice();
}

function isAppleMobileBrowser() {
  const appleUserAgent = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const modernIPad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return appleUserAgent || modernIPad;
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function updateInstallBanner() {
  if (isStandaloneApp()) {
    installBanner.hidden = true;
    return;
  }

  const canPrompt = Boolean(deferredInstallPrompt);
  const needsAppleInstructions = isAppleMobileBrowser();
  installBanner.hidden = !canPrompt && !needsAppleInstructions;
  if (needsAppleInstructions && !canPrompt) {
    installButton.textContent = "How to install";
    installCopy.textContent = "Add First Fold from Safari’s Share menu.";
  } else {
    installButton.textContent = "Install app";
    installCopy.textContent = "First Fold can open in its own app window.";
  }
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallBanner();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installBanner.hidden = true;
});

installButton.addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    installBanner.hidden = true;
    return;
  }

  if (isAppleMobileBrowser()) openDialog(installDialog, installButton);
});

window.addEventListener("offline", updateOfflineNotice);
window.addEventListener("online", () => {
  if (editionLoadState === "cached" || editionLoadState === "fallback") {
    loadEditionData();
  } else {
    updateOfflineNotice();
  }
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js", {
        scope: "./",
        updateViaCache: "none",
      });
      await registration.update();
    } catch {
      // The reader still works online when service workers are unavailable.
    }
  });
}

updateInstallBanner();

function pageLabel(index) {
  return `Page ${index + 1} of ${pages.length}: ${pages[index].dataset.pageTitle}.`;
}

function focusPageHeading(page) {
  const heading = page.querySelector("h1, h2");
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

function showPage(index, options = {}) {
  const numericIndex = Number(index);
  const boundedIndex = Number.isFinite(numericIndex)
    ? Math.max(0, Math.min(pages.length - 1, Math.trunc(numericIndex)))
    : 0;
  const previousIndex = currentPage;
  const isSamePage = pageStateInitialized && boundedIndex === previousIndex;

  const direction = boundedIndex >= previousIndex ? "forward" : "back";
  if (turnTimer) window.clearTimeout(turnTimer);
  pages.forEach((page, pageIndex) => {
    const isActive = pageIndex === boundedIndex;
    page.hidden = !isActive;
    page.classList.toggle("is-active", isActive);
    page.classList.remove("is-turning-forward", "is-turning-back", "is-turning-out-forward", "is-turning-out-back");
    page.style.removeProperty("position");
    page.style.removeProperty("inset");
    page.style.removeProperty("width");
    page.style.removeProperty("z-index");
  });

  const activePage = pages[boundedIndex];
  if (!isSamePage && pageStateInitialized) {
    const outgoingPage = pages[previousIndex];
    outgoingPage.hidden = false;
    outgoingPage.style.position = "absolute";
    outgoingPage.style.inset = "0";
    outgoingPage.style.width = "100%";
    outgoingPage.style.zIndex = "3";
    outgoingPage.classList.add(direction === "forward" ? "is-turning-out-forward" : "is-turning-out-back");
    activePage.classList.add(direction === "forward" ? "is-turning-forward" : "is-turning-back");
    turnTimer = window.setTimeout(() => {
      outgoingPage.hidden = true;
      outgoingPage.classList.remove("is-turning-out-forward", "is-turning-out-back");
      outgoingPage.style.removeProperty("position");
      outgoingPage.style.removeProperty("inset");
      outgoingPage.style.removeProperty("width");
      outgoingPage.style.removeProperty("z-index");
      activePage.classList.remove("is-turning-forward", "is-turning-back");
      turnTimer = null;
    }, 460);
  }

  currentPage = boundedIndex;
  pageStateInitialized = true;
  previousButton.disabled = currentPage === 0;
  nextButton.disabled = currentPage === pages.length - 1;
  pageStatus.textContent = `Page ${currentPage + 1} of ${pages.length}`;

  pageButtons.forEach((button) => {
    if (!button.closest(".page-tabs")) return;
    if (Number(button.dataset.goPage) === currentPage) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  announcer.textContent = pageLabel(currentPage);
  if (options.focus) focusPageHeading(activePage);
  if (options.updateHash !== false) {
    const nextHash = `#${pageSlugs[currentPage]}`;
    if (window.location.hash !== nextHash) history.replaceState(null, "", nextHash);
  }

  const readerTop = document.querySelector(".reader").getBoundingClientRect().top;
  if (readerTop < -8) {
    document.querySelector(".reader").scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }
}

function openDialog(dialog, opener) {
  if (!dialog || dialog.open) return;
  dialogOpener = opener;
  document.body.dataset.dialogOpen = "true";
  document.body.style.overflow = "hidden";
  dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function renderSources(key) {
  const set = sourceSets[key];
  if (!set) return;

  sourcesIntro.textContent = `The reporting and primary material behind “${set.headline}.” Dates shown are publication or effective dates.`;
  sourcesList.replaceChildren();

  for (const source of set.sources) {
    const item = document.createElement("article");
    item.className = "source-item";

    const badge = document.createElement("span");
    badge.className = "source-badge";
    badge.textContent = source.badge;

    const title = document.createElement("h3");
    title.textContent = source.title;

    const publisher = document.createElement("p");
    publisher.textContent = source.publisher;

    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.textContent = "Read the original ";

    const external = document.createElement("span");
    external.setAttribute("aria-hidden", "true");
    external.textContent = "↗";
    link.append(external);

    const screenReaderNote = document.createElement("span");
    screenReaderNote.className = "sr-only";
    screenReaderNote.textContent = ", opens in a new tab";
    link.append(screenReaderNote);

    item.append(badge, title, publisher, link);
    sourcesList.append(item);
  }
}

pageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showPage(Number(button.dataset.goPage), { focus: true });
  });
});

previousButton.addEventListener("click", () => showPage(currentPage - 1));
nextButton.addEventListener("click", () => showPage(currentPage + 1));

document.querySelectorAll("[data-open-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    openDialog(document.querySelector(`#${button.dataset.openDialog}`), button);
  });
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => closeDialog(button.closest("dialog")));
});

document.querySelectorAll("[data-dialog-page]").forEach((button) => {
  button.addEventListener("click", () => {
    const pageIndex = Number(button.dataset.dialogPage);
    const dialog = button.closest("dialog");
    dialog.close();
    window.setTimeout(() => showPage(pageIndex, { focus: true }), 0);
  });
});

document.querySelectorAll("[data-story-sources]").forEach((button) => {
  button.addEventListener("click", () => {
    renderSources(button.dataset.storySources);
    openDialog(sourcesDialog, button);
  });
});

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });

  dialog.addEventListener("close", () => {
    delete document.body.dataset.dialogOpen;
    document.body.style.overflow = "";
    if (dialogOpener?.isConnected) dialogOpener.focus({ preventScroll: true });
    dialogOpener = null;
  });
});

document.addEventListener("keydown", (event) => {
  if ([...document.querySelectorAll("dialog")].some((dialog) => dialog.open)) return;
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;

  const target = event.target;
  const isTyping = target.matches?.("input, textarea, select, [contenteditable='true']");
  if (isTyping) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showPage(currentPage - 1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    showPage(currentPage + 1);
  }
});

reader.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch") return;
  if (event.target.closest("button, a, dialog")) return;
  pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  reader.setPointerCapture?.(event.pointerId);
  reader.classList.add("is-dragging");
  reader.style.setProperty("--drag-offset", "0px");
});

reader.addEventListener("pointermove", (event) => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const deltaY = event.clientY - pointerStart.y;
  const deltaX = Math.max(-110, Math.min(110, event.clientX - pointerStart.x));
  if (Math.abs(deltaY) > 18 && Math.abs(deltaY) > Math.abs(deltaX)) {
    pointerStart = null;
    reader.classList.remove("is-dragging");
    reader.style.removeProperty("--drag-offset");
    delete reader.dataset.dragDirection;
    reader.releasePointerCapture?.(event.pointerId);
    return;
  }
  reader.style.setProperty("--drag-offset", `${deltaX}px`);
  reader.dataset.dragDirection = deltaX < 0 ? "forward" : "back";
});

reader.addEventListener("pointerup", (event) => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const deltaX = event.clientX - pointerStart.x;
  const deltaY = event.clientY - pointerStart.y;
  pointerStart = null;
  reader.classList.remove("is-dragging");
  reader.style.removeProperty("--drag-offset");
  delete reader.dataset.dragDirection;

  if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
  showPage(deltaX < 0 ? currentPage + 1 : currentPage - 1);
});

reader.addEventListener("pointercancel", () => {
  pointerStart = null;
  reader.classList.remove("is-dragging");
  reader.style.removeProperty("--drag-offset");
  delete reader.dataset.dragDirection;
});

window.addEventListener("hashchange", () => {
  const index = pageIndexFromHash();
  if (index >= 0) showPage(index, { focus: true, updateHash: false });
});

loadEditionData().finally(() => {
  const initialIndex = pageIndexFromHash();
  showPage(initialIndex >= 0 ? initialIndex : 0, { updateHash: initialIndex < 0 });
});
