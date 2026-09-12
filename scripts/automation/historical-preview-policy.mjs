// One explicitly requested private preview, not a general historical-run switch.
// Authorization is process-local and cannot be supplied in a candidate JSON file.
export const HISTORICAL_PREVIEW = Object.freeze({
  editionDate: "2026-09-11",
  requestedOn: "2026-09-12",
  revision: "free-quality-preview-2026-09-11-requested-2026-09-12",
  confirmation: "SEND SEPTEMBER 11 PREVIEW 2026-09-12",
  runMode: "requested_historical_preview",
});
const issued = new WeakSet();
const localDate = value => {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
};
const closed = () => Object.assign(new Error("The requested historical preview authorization is closed."),
  { code: "HISTORICAL_PREVIEW_CLOSED" });

export function isHistoricalPreviewTiming({ editionDate, generatedAt, checkedAt = generatedAt } = {}) {
  return editionDate === HISTORICAL_PREVIEW.editionDate &&
    typeof generatedAt === "string" && typeof checkedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(generatedAt) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(checkedAt) &&
    localDate(generatedAt) === HISTORICAL_PREVIEW.requestedOn &&
    localDate(checkedAt) === HISTORICAL_PREVIEW.requestedOn &&
    Date.parse(checkedAt) >= Date.parse(generatedAt);
}

export function isHistoricalPreviewRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join() === "editionDate,requestedOn,revision" &&
    ["editionDate", "requestedOn", "revision"].every(key => value[key] === HISTORICAL_PREVIEW[key]);
}

export function authorizeHistoricalPreview(env, now = new Date()) {
  if (localDate(now) !== HISTORICAL_PREVIEW.requestedOn ||
      env?.PREVIEW_CONFIRMATION !== HISTORICAL_PREVIEW.confirmation ||
      env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "itworksinprod/first-fold" ||
      env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_ACTOR !== "itworksinprod" ||
      env.GITHUB_TRIGGERING_ACTOR !== "itworksinprod" || env.GITHUB_RUN_ATTEMPT !== "1" ||
      env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GITHUB_WORKFLOW_REF !== "itworksinprod/first-fold/.github/workflows/personal-preview.yml@refs/heads/main" ||
      !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID ?? "") || !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA ?? "")) {
    throw closed();
  }
  const token = Object.freeze({ editionDate: HISTORICAL_PREVIEW.editionDate,
    requestedOn: HISTORICAL_PREVIEW.requestedOn, revision: HISTORICAL_PREVIEW.revision });
  issued.add(token);
  return token;
}

export function assertHistoricalPreviewAuthorization(token, now = new Date(), editionDate) {
  if (!token || typeof token !== "object" || !issued.has(token) ||
      !isHistoricalPreviewRecord(token) || editionDate !== HISTORICAL_PREVIEW.editionDate ||
      localDate(now) !== HISTORICAL_PREVIEW.requestedOn) throw closed();
  return true;
}
