const TIME_ZONE = "America/New_York";
const MAX_DISPATCH_ATTEMPTS = 2;

const REPOSITORY = Object.freeze({
  owner: "itworksinprod",
  name: "first-fold",
  ref: "main",
});

const CRON_SLOTS = Object.freeze({
  "5 9 * * *": Object.freeze({ hour: 9, minute: 5 }),
  "5 10 * * *": Object.freeze({ hour: 10, minute: 5 }),
  "0 10 * * *": Object.freeze({ hour: 10, minute: 0 }),
  "0 11 * * *": Object.freeze({ hour: 11, minute: 0 }),
});

const DISPATCHES = Object.freeze({
  personal: Object.freeze({
    workflow: "personal-morning-paper.yml",
    inputs: Object.freeze({
      run_mode: "on_time",
      backfill_date: "",
      backfill_reason: "",
      backfill_confirmation: "",
    }),
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

class DispatcherError extends Error {
  constructor(
    stage,
    message,
    { httpStatus, failedDispatches = [], workflowRunIds = [] } = {},
  ) {
    super(message);
    this.name = "DispatcherError";
    this.stage = stage;
    if (Number.isInteger(httpStatus)) this.httpStatus = httpStatus;
    this.failedDispatches = Object.freeze([...failedDispatches]);
    this.workflowRunIds = Object.freeze([...workflowRunIds]);
  }
}

function logScheduledEvent(level, event, details = {}) {
  const record = JSON.stringify({
    component: "first-fold-morning-dispatcher",
    event,
    ...details,
  });
  if (level === "error") console.error(record);
  else console.info(record);
}

function scheduledTimeForLog(value) {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

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

  const matches =
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

  if (parts.hour === "05" && parts.minute === "05") {
    return "personal";
  }
  if (
    ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) &&
    parts.hour === "06" &&
    parts.minute === "00"
  ) {
    return "delivery";
  }
  return null;
}

export function dispatchesForScheduledTime(scheduledTime) {
  const scheduledDate = requireScheduledTime(scheduledTime);
  const parts = newYorkParts(scheduledDate);
  if (parts.hour === "05" && parts.minute === "05") {
    return Object.freeze(["personal"]);
  }
  if (
    ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) &&
    parts.hour === "06" &&
    parts.minute === "00"
  ) {
    return Object.freeze(["delivery"]);
  }
  return Object.freeze([]);
}

export function requireFineGrainedToken(env) {
  const rawToken = env?.GITHUB_TOKEN;
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  if (
    token.length < 32 ||
    token.length > 512 ||
    !token.startsWith("github_pat_") ||
    !/^[\x21-\x7e]+$/.test(token)
  ) {
    throw new DispatcherError(
      "token-validation",
      "GITHUB_TOKEN must be a GitHub fine-grained personal access token.",
    );
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
    throw new DispatcherError(
      "dispatch-validation",
      "The requested GitHub workflow is not approved for dispatch.",
    );
  }
  const normalizedToken = requireFineGrainedToken({ GITHUB_TOKEN: token });
  const scheduledDate = requireScheduledTime(scheduledTime);
  if (!dispatchesForScheduledTime(scheduledTime).includes(dispatchName)) {
    throw new DispatcherError(
      "dispatch-validation",
      "The requested workflow does not match the scheduled New York time.",
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new DispatcherError(
      "dispatch-validation",
      "A Fetch-compatible implementation is required.",
    );
  }

  const workflow = encodeURIComponent(dispatch.workflow);
  const url =
    `https://api.github.com/repos/${REPOSITORY.owner}/${REPOSITORY.name}` +
    `/actions/workflows/${workflow}/dispatches`;
  const parts = newYorkParts(scheduledDate);
  const editionDate = `${parts.year}-${parts.month}-${parts.day}`;
  const payload = {
    ref: REPOSITORY.ref,
    // GitHub otherwise returns 204 with no run identity. The dispatcher treats
    // an exact run URL/id as part of its fail-closed success contract.
    return_run_details: true,
    inputs: {
      trigger_source: "cloudflare",
      scheduled_at: scheduledDate.toISOString(),
      dispatch_key: `${dispatchName}:${editionDate}`,
      ...(dispatch.inputs ?? {}),
    },
  };

  const request = {
    method: "POST",
    redirect: "manual",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${normalizedToken}`,
      "content-type": "application/json",
      "user-agent": "first-fold-morning-dispatcher",
      "x-github-api-version": "2026-03-10",
    },
    body: JSON.stringify(payload),
  };
  let response;
  for (let attempt = 1; attempt <= MAX_DISPATCH_ATTEMPTS; attempt += 1) {
    try {
      response = await fetchImpl(url, request);
    } catch {
      // The request may have reached GitHub. The trusted workflows serialize
      // ambiguous duplicates and suppress an already successful delivery.
      if (attempt < MAX_DISPATCH_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        continue;
      }
      throw new DispatcherError(
        "github-network",
        "GitHub workflow dispatch could not be confirmed.",
      );
    }
    const retryAfter = response.headers?.get?.("retry-after");
    const rateLimitRemaining = response.headers?.get?.("x-ratelimit-remaining");
    const isRateLimited =
      response.status === 429 ||
      (response.status === 403 &&
        (typeof retryAfter === "string" || rateLimitRemaining === "0"));
    if (isRateLimited) {
      throw new DispatcherError(
        "github-rate-limit",
        "GitHub workflow dispatch was rate limited.",
        { httpStatus: response.status },
      );
    }
    const retryableStatus = response.status >= 500;
    if (retryableStatus && attempt < MAX_DISPATCH_ATTEMPTS) {
      try {
        await response.body?.cancel?.();
      } catch {
        // Discarding a retryable response body is best-effort only.
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      continue;
    }
    break;
  }

  if (response.status !== 200) {
    throw new DispatcherError(
      "github-response",
      `GitHub workflow dispatch failed with HTTP ${response.status}.`,
      { httpStatus: response.status },
    );
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new DispatcherError(
      "github-response-contract",
      "GitHub workflow dispatch returned an invalid success response.",
    );
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
    throw new DispatcherError(
      "github-response-contract",
      "GitHub workflow dispatch returned an invalid success response.",
    );
  }
  return Object.freeze({
    dispatch: dispatchName,
    workflowRunId: runId,
    htmlUrl: expectedHtmlUrl,
  });
}

export async function handleScheduled(controller, env, fetchImpl = globalThis.fetch) {
  const scheduledDate = requireScheduledTime(controller?.scheduledTime);
  requireKnownCron(controller?.cron, scheduledDate);

  const dispatchNames = dispatchesForScheduledTime(controller.scheduledTime);
  if (dispatchNames.length === 0) {
    return Object.freeze({ status: "ignored" });
  }

  const token = requireFineGrainedToken(env);
  const results = await Promise.allSettled(
    dispatchNames.map((dispatchName) =>
      dispatchGitHubWorkflow(dispatchName, token, controller.scheduledTime, fetchImpl),
    ),
  );
  const failed = results.filter(({ status }) => status === "rejected");
  if (failed.length > 0) {
    const failedDispatches = results.flatMap((result, index) =>
      result.status === "rejected" ? [dispatchNames[index]] : [],
    );
    const workflowRunIds = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value.workflowRunId] : [],
    );
    const stages = new Set(
      failed.map(({ reason }) => reason?.stage).filter((stage) => typeof stage === "string"),
    );
    const statuses = new Set(
      failed
        .map(({ reason }) => reason?.httpStatus)
        .filter((status) => Number.isInteger(status)),
    );
    throw new DispatcherError(
      stages.size === 1 ? [...stages][0] : "github-dispatch",
      "One or more GitHub workflow dispatches failed.",
      {
        httpStatus: statuses.size === 1 ? [...statuses][0] : undefined,
        failedDispatches,
        workflowRunIds,
      },
    );
  }
  return Object.freeze({
    status: "dispatched",
    dispatches: dispatchNames,
    workflowRuns: results.map(({ value }) => value),
  });
}

export default {
  async scheduled(controller, env) {
    // There are two daily UTC companions for each Eastern time. Local-time and
    // weekday gating select the due workflows. Each outbound dispatch gets one
    // bounded retry; the GitHub workflows serialize duplicate attempts by key.
    const scheduledAt = scheduledTimeForLog(controller?.scheduledTime);
    logScheduledEvent("info", "scheduled-start", {
      cron: typeof controller?.cron === "string" ? controller.cron : null,
      scheduled_at: scheduledAt,
    });
    try {
      const result = await handleScheduled(controller, env);
      logScheduledEvent("info", `scheduled-${result.status}`, {
        cron: controller.cron,
        scheduled_at: scheduledAt,
        dispatches: result.dispatches ?? [],
        workflow_run_ids: result.workflowRuns?.map(({ workflowRunId }) => workflowRunId) ?? [],
      });
    } catch (error) {
      logScheduledEvent("error", "scheduled-failed", {
        cron: typeof controller?.cron === "string" ? controller.cron : null,
        scheduled_at: scheduledAt,
        stage: typeof error?.stage === "string" ? error.stage : "schedule-validation",
        http_status: Number.isInteger(error?.httpStatus) ? error.httpStatus : null,
        failed_dispatches: error?.failedDispatches ?? [],
        workflow_run_ids: error?.workflowRunIds ?? [],
      });
      throw error;
    }
  },
};
