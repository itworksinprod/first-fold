import { pathToFileURL } from "node:url";
import { open } from "node:fs/promises";
import { decodeLocalPreviewPayload } from "./local-preview-payload.mjs";
import { LOCAL_PREVIEW, authorizeLocalPreview, assertLocalPreviewAuthorization } from "./local-preview-policy.mjs";
import { FREE_FEED_SOURCES } from "./free/feed-sources.mjs";
import { assertPersonalEmailCandidate, renderPersonalEditionEmail, sendPersonalEditionPreview } from "./personal-email.mjs";
import { buildSourceUrlAllowlist, runNewsroomQa } from "./newsroom-qa.mjs";

const fail = code => Object.assign(new Error(code), { code });
const safeCodes = new Set([
  "LOCAL_PREVIEW_CLOSED", "LOCAL_PREVIEW_MODE", "LOCAL_PREVIEW_SOURCES", "LOCAL_PREVIEW_QA_FAILED",
  "LOCAL_PREVIEW_CONFIGURATION", "LOCAL_PREVIEW_PAYLOAD_SHAPE", "LOCAL_PREVIEW_PAYLOAD_PRIVATE_FIELD",
  "LOCAL_PREVIEW_PAYLOAD_SIZE", "LOCAL_PREVIEW_PAYLOAD_ENCODING", "LOCAL_PREVIEW_PAYLOAD_GZIP",
  "LOCAL_PREVIEW_PAYLOAD_HASH", "LOCAL_PREVIEW_PAYLOAD_JSON", "LOCAL_PREVIEW_EVENT_INVALID",
]);

export const LOCAL_PREVIEW_MAX_EVENT_BYTES = 256 * 1024;
// Inputs are not secrets. In particular, never inject this reversible payload
// into step-level YAML env: the runner prints that environment before Node runs.
// Read the runner's event file instead and mask the payload before normal output.
export function localPreviewDispatchInputs(bytes, mask = () => {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length > LOCAL_PREVIEW_MAX_EVENT_BYTES) throw fail("LOCAL_PREVIEW_EVENT_INVALID");
  let event;
  try { event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw fail("LOCAL_PREVIEW_EVENT_INVALID"); }
  const inputs = event?.inputs;
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs) ||
      Object.keys(inputs).sort().join() !== "candidate_gzip_base64,candidate_sha256,confirmation" ||
      typeof inputs.candidate_gzip_base64 !== "string" || inputs.candidate_gzip_base64.length > 60_000 ||
      typeof inputs.candidate_sha256 !== "string" || inputs.candidate_sha256.length !== 64 ||
      typeof inputs.confirmation !== "string" || inputs.confirmation.length > 100) throw fail("LOCAL_PREVIEW_EVENT_INVALID");
  mask(inputs.candidate_gzip_base64);
  return { CANDIDATE_GZIP_BASE64: inputs.candidate_gzip_base64,
    CANDIDATE_SHA256: inputs.candidate_sha256, LOCAL_PREVIEW_CONFIRMATION: inputs.confirmation };
}

export async function readLocalPreviewEventInputs(env = process.env) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      typeof env.GITHUB_EVENT_PATH !== "string" || !env.GITHUB_EVENT_PATH.startsWith("/") ||
      /[\p{Cc}\p{Cf}]/u.test(env.GITHUB_EVENT_PATH)) throw fail("LOCAL_PREVIEW_EVENT_INVALID");
  let handle;
  try {
    handle = await open(env.GITHUB_EVENT_PATH, "r");
    if (!(await handle.stat()).isFile()) throw fail("LOCAL_PREVIEW_EVENT_INVALID");
    const bytes = Buffer.alloc(LOCAL_PREVIEW_MAX_EVENT_BYTES + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    return localPreviewDispatchInputs(bytes.subarray(0, offset), value => {
      // Escape workflow-command delimiters even for invalid untrusted inputs.
      const escaped = value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
      process.stdout.write(`::add-mask::${escaped}\n`);
    });
  } catch { throw fail("LOCAL_PREVIEW_EVENT_INVALID"); }
  finally { await handle?.close(); }
}

// The owner-confirmed payload is public news, not a network allowlist. Each URL
// must independently belong to the checked-in feed/publisher review. Context
// feeds are admitted only at their exact reviewed URL, never an arbitrary path
// on a shared feed host. Live DNS pinning remains the newsroom QA's job.
export function localPreviewSources(candidate) {
  const stories = Object.values(candidate?.desks ?? {}).flatMap(desk => desk?.story ? [desk.story] : []);
  const sources = stories.flatMap(story => Array.isArray(story.sources) ? story.sources : []);
  if (stories.length < 1 || stories.length > 4 || sources.length < 2 || sources.length > 32) {
    throw fail("LOCAL_PREVIEW_SOURCES");
  }
  for (const source of sources) {
    let url;
    try { url = new URL(source.url); } catch { throw fail("LOCAL_PREVIEW_SOURCES"); }
    if (typeof source.url !== "string" || source.url.length > 2_048 || /[\p{Cc}\p{Cf}]/u.test(source.url) ||
        url.protocol !== "https:" || url.username || url.password || url.hash ||
        (url.port && url.port !== "443")) throw fail("LOCAL_PREVIEW_SOURCES");
    const reviewed = FREE_FEED_SOURCES.filter(feed =>
      (!source.publisherKey || feed.publisherKey === source.publisherKey) &&
      (source.relationship === "context" && url.href === new URL(feed.url).href ||
        feed.itemHosts.includes(url.hostname)));
    if (!reviewed.length || new Set(reviewed.map(feed => feed.publisherKey)).size !== 1) {
      throw fail("LOCAL_PREVIEW_SOURCES");
    }
  }
  return sources;
}

// Dependencies can be replaced in offline tests. The CLI below always uses the
// real canonical/prose gates, pinned HTTPS source checks and fixed Resend sender.
export async function runLocalPaperPreview({ mode, env = process.env, now = new Date(), clock = () => new Date(),
  assertCandidate = assertPersonalEmailCandidate, render = renderPersonalEditionEmail,
  qa = runNewsroomQa, send = sendPersonalEditionPreview } = {}) {
  if (!["validate", "send"].includes(mode)) throw fail("LOCAL_PREVIEW_MODE");
  const candidate = decodeLocalPreviewPayload(env.CANDIDATE_GZIP_BASE64, env.CANDIDATE_SHA256);
  const localPreviewAuthorization = authorizeLocalPreview(env, candidate, now);
  const options = { localPreviewAuthorization, now };
  assertCandidate(candidate, options);
  render(candidate, options);
  const sources = localPreviewSources(candidate);
  const result = await qa(candidate, {
    allowedSourceUrls: buildSourceUrlAllowlist(sources), checkedAt: now.toISOString(),
    checkLinks: true, timeoutMs: 8_000, maxRedirects: 0, temporalMode: "local-requested-preview",
  });
  if (result?.sourceCheck?.status !== "passed" || !Array.isArray(result.sourceCheck.issues) ||
      result.sourceCheck.issues.length !== 0) throw fail("LOCAL_PREVIEW_QA_FAILED");
  // Do not install the fresh receipt into the input: the local receipt and every
  // byte of the edition remain bound to the confirmed digest. Recheck after QA.
  const sendNow = clock();
  assertLocalPreviewAuthorization(localPreviewAuthorization, candidate, sendNow);
  if (mode === "send") {
    if (!env.RESEND_API_KEY || !env.PERSONAL_PAPER_EMAIL) throw fail("LOCAL_PREVIEW_CONFIGURATION");
    await send(candidate, {
      localPreviewAuthorization, previewNow: sendNow, previewClock: clock,
      previewRevision: LOCAL_PREVIEW.revision, previewConfirmation: LOCAL_PREVIEW.confirmation,
      apiKey: env.RESEND_API_KEY, recipient: env.PERSONAL_PAPER_EMAIL,
    });
  }
  return {
    status: mode === "send" ? "sent" : "validated", editionDate: LOCAL_PREVIEW.editionDate,
    stories: Object.values(candidate.desks).filter(desk => desk?.story).length,
    checkedSourceUrls: buildSourceUrlAllowlist(sources).size,
    provider: LOCAL_PREVIEW.provider, model: LOCAL_PREVIEW.model, researchMethod: "curated-live-feeds",
    resendAccepted: mode === "send", dailyLedgerChanged: false, publicEditionCreated: false,
  };
}

export function localPreviewFailureSummary(error) {
  const code = safeCodes.has(error?.code) ? error.code : "LOCAL_PREVIEW_FAILED";
  const status = /^Resend rejected personal email delivery with status (\d{3})\.$/u.exec(error?.message ?? "")?.[1];
  return { code, resendStatus: status && Number(status) >= 100 && Number(status) <= 599 ? Number(status) : null,
    automaticSendRetry: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const mode = args.length === 1 && ["--validate", "--send"].includes(args[0]) ? args[0].slice(2) : null;
  // Do not fall back to caller-supplied payload environment variables. Only the
  // exact bounded dispatch event supplies the candidate, digest and confirmation.
  Promise.resolve().then(() => {
    if (!mode) throw fail("LOCAL_PREVIEW_MODE");
    return readLocalPreviewEventInputs();
  }).then(inputs => runLocalPaperPreview({ mode,
    env: { ...process.env, ...inputs } })).then(report => {
    console.info(`::notice title=Local paper preview::${JSON.stringify(report)}`);
  }).catch(error => {
    console.error(`::error title=Local preview stopped::${JSON.stringify(localPreviewFailureSummary(error))}`);
    process.exitCode = 1;
  });
}
