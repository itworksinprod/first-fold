const TIME_ZONE = "America/New_York";

const REPOSITORY = Object.freeze({
  owner: "itworksinprod",
  name: "first-fold",
  ref: "main",
});

const CRON_SLOTS = Object.freeze({
  "5 9 * * MON-FRI": Object.freeze({ hour: 9, minute: 5 }),
  "5 10 * * MON-FRI": Object.freeze({ hour: 10, minute: 5 }),
  "0 10 * * MON-FRI": Object.freeze({ hour: 10, minute: 0 }),
  "0 11 * * MON-FRI": Object.freeze({ hour: 11, minute: 0 }),
});

const DISPATCHES = Object.freeze({
  research: Object.freeze({
    workflow: "morning-research.yml",
    inputs: undefined,
  }),
  delivery: Object.freeze({
    workflow: "pages.yml",
    inputs: Object.freeze({
      recovery_reason: "Cloudflare 6:00 AM ET scheduled delivery",
    }),
  }),
});

const newYorkFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function requireScheduledTime(value) {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw new Error("The scheduled event time must be a finite millisecond timestamp.");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("The scheduled event time is invalid.");
  }
  return date;
}

function requireKnownCron(cron, scheduledDate) {
  const slot = CRON_SLOTS[cron];
  if (!slot) {
    throw new Error("The scheduled event did not originate from an approved cron trigger.");
  }

  const weekday = scheduledDate.getUTCDay();
  const matches =
    weekday >= 1 &&
    weekday <= 5 &&
    scheduledDate.getUTCHours() === slot.hour &&
    scheduledDate.getUTCMinutes() === slot.minute;
  if (!matches) {
    throw new Error("The scheduled event timestamp does not match its cron trigger.");
  }
}

function newYorkParts(scheduledDate) {
  return Object.fromEntries(
    newYorkFormatter
      .formatToParts(scheduledDate)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
}

export function dispatchForScheduledTime(scheduledTime) {
  const scheduledDate = requireScheduledTime(scheduledTime);
  const parts = newYorkParts(scheduledDate);

  if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday)) {
    return null;
  }
  if (parts.hour === "05" && parts.minute === "05") {
    return "research";
  }
  if (parts.hour === "06" && parts.minute === "00") {
    return "delivery";
  }
  return null;
}

export function requireFineGrainedToken(env) {
  const token = env?.GITHUB_TOKEN;
  if (
    typeof token !== "string" ||
    token.length < 32 ||
    token.length > 512 ||
    !/^github_pat_[A-Za-z0-9_]+$/.test(token)
  ) {
    throw new Error("GITHUB_TOKEN must be a GitHub fine-grained personal access token.");
  }
  return token;
}

export async function dispatchGitHubWorkflow(
  dispatchName,
  token,
  scheduledTime,
  fetchImpl = globalThis.fetch,
) {
  const dispatch = DISPATCHES[dispatchName];
  if (!dispatch) {
    throw new Error("The requested GitHub workflow is not approved for dispatch.");
  }
  requireFineGrainedToken({ GITHUB_TOKEN: token });
  const scheduledDate = requireScheduledTime(scheduledTime);
  if (dispatchForScheduledTime(scheduledTime) !== dispatchName) {
    throw new Error("The requested workflow does not match the scheduled New York time.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("A Fetch-compatible implementation is required.");
  }

  const workflow = encodeURIComponent(dispatch.workflow);
  const url =
    `https://api.github.com/repos/${REPOSITORY.owner}/${REPOSITORY.name}` +
    `/actions/workflows/${workflow}/dispatches`;
  const parts = newYorkParts(scheduledDate);
  const editionDate = `${parts.year}-${parts.month}-${parts.day}`;
  const payload = {
    ref: REPOSITORY.ref,
    inputs: {
      trigger_source: "cloudflare",
      scheduled_at: scheduledDate.toISOString(),
      dispatch_key: `${dispatchName}:${editionDate}`,
      ...(dispatch.inputs ?? {}),
    },
  };

  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      redirect: "error",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "first-fold-morning-dispatcher",
        "x-github-api-version": "2026-03-10",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // The request may have reached GitHub. Keep this error secret-free; a
    // platform retry is serialized and deduplicated by the trusted workflows.
    throw new Error("GitHub workflow dispatch could not be confirmed.");
  }

  // GitHub's current API returns 200; 204 remains accepted for compatibility
  // with the endpoint's earlier success contract.
  if (response.status === 204) return;
  if (response.status !== 200) {
    throw new Error(`GitHub workflow dispatch failed with HTTP ${response.status}.`);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("GitHub workflow dispatch returned an invalid success response.");
  }

  const runId = result?.workflow_run_id;
  const expectedApiUrl =
    `https://api.github.com/repos/${REPOSITORY.owner}/${REPOSITORY.name}/actions/runs/${runId}`;
  const expectedHtmlUrl =
    `https://github.com/${REPOSITORY.owner}/${REPOSITORY.name}/actions/runs/${runId}`;
  if (
    !Number.isSafeInteger(runId) ||
    runId <= 0 ||
    result.run_url !== expectedApiUrl ||
    result.html_url !== expectedHtmlUrl
  ) {
    throw new Error("GitHub workflow dispatch returned an invalid success response.");
  }
}

export async function handleScheduled(controller, env, fetchImpl = globalThis.fetch) {
  const scheduledDate = requireScheduledTime(controller?.scheduledTime);
  requireKnownCron(controller?.cron, scheduledDate);

  const dispatchName = dispatchForScheduledTime(controller.scheduledTime);
  if (!dispatchName) {
    return Object.freeze({ status: "ignored" });
  }

  const token = requireFineGrainedToken(env);
  await dispatchGitHubWorkflow(dispatchName, token, controller.scheduledTime, fetchImpl);
  return Object.freeze({ status: "dispatched", dispatch: dispatchName });
}

export default {
  async scheduled(controller, env) {
    // There are two UTC companions for each Eastern time. Local-time gating
    // selects only one. Platform retries remain enabled; the GitHub workflows
    // serialize duplicate attempts and no-op repeated research before the API.
    await handleScheduled(controller, env);
  },
};
