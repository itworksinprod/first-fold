import { createHash } from "node:crypto";

export const LOCAL_PREVIEW = Object.freeze({
  editionDate: "2026-09-13", requestedOn: "2026-09-13", revision: "ollama-preview-2026-09-13",
  confirmation: "SEND LOCAL PREVIEW 2026-09-13", runMode: "requested_local_preview",
  provider: "ollama-local", model: "qwen3:30b-a3b", workflow: "local-paper-preview",
  startsAt: "2026-09-13T04:00:00.000Z",
  expiresAt: "2026-09-15T04:00:00.000Z",
  idempotencyKey: "first-fold-personal-preview-ollama-2026-09-13",
});
const issued = new WeakMap();
const recordKeys = ["editionDate", "requestedOn", "revision"];
export function isLocalPreviewWindow(value) {
  const instant = new Date(value).getTime();
  return Number.isFinite(instant) && instant >= Date.parse(LOCAL_PREVIEW.startsAt) &&
    instant < Date.parse(LOCAL_PREVIEW.expiresAt);
}
const closed = () => Object.assign(new Error("The requested local preview authorization is closed."),
  { code: "LOCAL_PREVIEW_CLOSED" });
export const localPreviewCandidateSha256 = candidate => createHash("sha256")
  .update(JSON.stringify(candidate), "utf8").digest("hex");

export function isLocalPreviewRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join() === recordKeys.join() &&
    recordKeys.every(key => value[key] === LOCAL_PREVIEW[key]);
}

export function isLocalPreviewTiming({ editionDate, generatedAt, checkedAt = generatedAt, now } = {}) {
  return editionDate === LOCAL_PREVIEW.editionDate &&
    [generatedAt, checkedAt].every(value => typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) && isLocalPreviewWindow(value)) &&
    Date.parse(checkedAt) >= Date.parse(generatedAt) &&
    (now === undefined || Number.isFinite(new Date(now).getTime()) && Date.parse(checkedAt) <= new Date(now).getTime());
}

export function authorizeLocalPreview(env, candidate, now = new Date()) {
  if (!isLocalPreviewWindow(now) ||
      env?.LOCAL_PREVIEW_CONFIRMATION !== LOCAL_PREVIEW.confirmation ||
      !/^[a-f0-9]{64}$/u.test(env.CANDIDATE_SHA256 ?? "") ||
      localPreviewCandidateSha256(candidate) !== env.CANDIDATE_SHA256 ||
      env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "itworksinprod/first-fold" ||
      env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_ACTOR !== "itworksinprod" ||
      env.GITHUB_TRIGGERING_ACTOR !== "itworksinprod" || env.GITHUB_RUN_ATTEMPT !== "1" ||
      env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GITHUB_WORKFLOW_REF !== "itworksinprod/first-fold/.github/workflows/local-paper-preview.yml@refs/heads/main" ||
      !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID ?? "") || !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA ?? "")) throw closed();
  const token = Object.freeze({});
  issued.set(token, env.CANDIDATE_SHA256);
  return token;
}

export function assertLocalPreviewAuthorization(token, candidate, now = new Date()) {
  if (!token || typeof token !== "object" || !issued.has(token) ||
      issued.get(token) !== localPreviewCandidateSha256(candidate) ||
      candidate?.editionDate !== LOCAL_PREVIEW.editionDate || !isLocalPreviewWindow(now)) throw closed();
  return true;
}
