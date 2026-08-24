import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  default as worker,
  dispatchForScheduledTime,
  dispatchesForScheduledTime,
  dispatchGitHubWorkflow,
  handleScheduled,
  requireFineGrainedToken,
} from "../src/worker.mjs";

const token = `github_pat_${"a".repeat(40)}`;

function timestamp(iso) {
  return Date.parse(iso);
}

function response(status = 200) {
  return {
    status,
    headers: new Headers(),
    async json() {
      return {
        workflow_run_id: 123,
        run_url: "https://api.github.com/repos/itworksinprod/first-fold/actions/runs/123",
        html_url: "https://github.com/itworksinprod/first-fold/actions/runs/123",
      };
    },
  };
}

function workflowFromUrl(url) {
  return new URL(url).pathname.split("/").at(-2);
}

test("New York gates select only the daily personal and weekday delivery dispatches across DST", () => {
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-08-24T09:05:00Z")), [
    "personal",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-08-24T10:05:00Z")), []);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-08-24T10:00:00Z")), [
    "delivery",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-08-24T11:00:00Z")), []);

  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-01-12T09:05:00Z")), []);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-01-12T10:05:00Z")), [
    "personal",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-01-12T10:00:00Z")), []);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-01-12T11:00:00Z")), [
    "delivery",
  ]);

  // The first weekdays after both 2026 clock changes use the correct companion.
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-03-09T09:05:00Z")), [
    "personal",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-03-09T10:00:00Z")), [
    "delivery",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-11-02T10:05:00Z")), [
    "personal",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-11-02T11:00:00Z")), [
    "delivery",
  ]);

  assert.equal(dispatchForScheduledTime(timestamp("2026-08-24T09:05:00Z")), "personal");
  assert.equal(dispatchForScheduledTime(timestamp("2026-01-12T11:00:00Z")), "delivery");
});

test("weekends receive only the personal paper and inactive times stay quiet", () => {
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-08-22T09:05:00Z")), [
    "personal",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-08-22T10:00:00Z")), []);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-01-11T10:05:00Z")), [
    "personal",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-01-11T11:00:00Z")), []);

  // The clock-change Sundays are also personal-only at the new local offset.
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-03-08T09:05:00Z")), [
    "personal",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-11-01T10:05:00Z")), [
    "personal",
  ]);

  assert.equal(dispatchForScheduledTime(timestamp("2026-08-22T09:05:00Z")), "personal");
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-08-24T09:04:00Z")), []);
  assert.throws(() => dispatchesForScheduledTime(Number.NaN), /scheduled event time/i);
});

test("weekday morning dispatches only the personal workflow with exact inputs", async () => {
  const requests = [];
  const result = await handleScheduled(
    {
      cron: "5 9 * * *",
      scheduledTime: timestamp("2026-08-24T09:05:00Z"),
    },
    { GITHUB_TOKEN: token },
    async (...request) => {
      requests.push(request);
      return response();
    },
  );

  assert.deepEqual(result, {
    status: "dispatched",
    dispatches: ["personal"],
    workflowRuns: [
      {
        dispatch: "personal",
        workflowRunId: 123,
        htmlUrl: "https://github.com/itworksinprod/first-fold/actions/runs/123",
      },
    ],
  });
  assert.equal(requests.length, 1);

  const requestsByWorkflow = Object.fromEntries(
    requests.map(([url, options]) => [workflowFromUrl(url), { url, options }]),
  );
  assert.deepEqual(Object.keys(requestsByWorkflow), ["personal-morning-paper.yml"]);

  const personal = requestsByWorkflow["personal-morning-paper.yml"];
  assert.equal(
    personal.url,
    "https://api.github.com/repos/itworksinprod/first-fold/actions/workflows/personal-morning-paper.yml/dispatches",
  );
  assert.deepEqual(JSON.parse(personal.options.body), {
    ref: "main",
    return_run_details: true,
    inputs: {
      trigger_source: "cloudflare",
      scheduled_at: "2026-08-24T09:05:00.000Z",
      dispatch_key: "personal:2026-08-24",
      run_mode: "on_time",
      backfill_date: "",
      backfill_reason: "",
      backfill_confirmation: "",
    },
  });

  for (const [url, options] of requests) {
    assert.equal(options.body.includes(token), false);
    assert.equal(url.includes(token), false);
  }
});

test("weekend morning dispatches only the personal workflow", async () => {
  const requests = [];
  const result = await handleScheduled(
    {
      cron: "5 9 * * *",
      scheduledTime: timestamp("2026-08-22T09:05:00Z"),
    },
    { GITHUB_TOKEN: token },
    async (...request) => {
      requests.push(request);
      return response();
    },
  );

  assert.deepEqual(result, {
    status: "dispatched",
    dispatches: ["personal"],
    workflowRuns: [
      {
        dispatch: "personal",
        workflowRunId: 123,
        htmlUrl: "https://github.com/itworksinprod/first-fold/actions/runs/123",
      },
    ],
  });
  assert.equal(requests.length, 1);
  assert.equal(workflowFromUrl(requests[0][0]), "personal-morning-paper.yml");
  assert.deepEqual(JSON.parse(requests[0][1].body), {
    ref: "main",
    return_run_details: true,
    inputs: {
      trigger_source: "cloudflare",
      scheduled_at: "2026-08-22T09:05:00.000Z",
      dispatch_key: "personal:2026-08-22",
      run_mode: "on_time",
      backfill_date: "",
      backfill_reason: "",
      backfill_confirmation: "",
    },
  });
});

test("the exact failed Sunday event normalizes the secret and reaches GitHub", async () => {
  let captured;
  const result = await handleScheduled(
    {
      cron: "5 9 * * *",
      scheduledTime: timestamp("2026-08-23T09:05:51Z"),
    },
    { GITHUB_TOKEN: `\n${token}  ` },
    async (url, options) => {
      captured = { url, options };
      return response();
    },
  );

  assert.equal(
    captured.url,
    "https://api.github.com/repos/itworksinprod/first-fold/actions/workflows/personal-morning-paper.yml/dispatches",
  );
  assert.equal(captured.options.headers.authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(captured.options.body), {
    ref: "main",
    return_run_details: true,
    inputs: {
      trigger_source: "cloudflare",
      scheduled_at: "2026-08-23T09:05:51.000Z",
      dispatch_key: "personal:2026-08-23",
      run_mode: "on_time",
      backfill_date: "",
      backfill_reason: "",
      backfill_confirmation: "",
    },
  });
  assert.deepEqual(result.workflowRuns, [
    {
      dispatch: "personal",
      workflowRunId: 123,
      htmlUrl: "https://github.com/itworksinprod/first-fold/actions/runs/123",
    },
  ]);
});

test("weekday delivery dispatch keeps the recovery payload unchanged", async () => {
  let captured;
  const result = await handleScheduled(
    {
      cron: "0 11 * * *",
      scheduledTime: timestamp("2026-01-12T11:00:00Z"),
    },
    { GITHUB_TOKEN: token },
    async (url, options) => {
      captured = { url, options };
      return response();
    },
  );

  assert.deepEqual(result, {
    status: "dispatched",
    dispatches: ["delivery"],
    workflowRuns: [
      {
        dispatch: "delivery",
        workflowRunId: 123,
        htmlUrl: "https://github.com/itworksinprod/first-fold/actions/runs/123",
      },
    ],
  });
  assert.equal(
    captured.url,
    "https://api.github.com/repos/itworksinprod/first-fold/actions/workflows/pages.yml/dispatches",
  );
  assert.deepEqual(JSON.parse(captured.options.body), {
    ref: "main",
    return_run_details: true,
    inputs: {
      trigger_source: "cloudflare",
      scheduled_at: "2026-01-12T11:00:00.000Z",
      dispatch_key: "delivery:2026-01-12",
      recovery_reason: "Cloudflare 6:00 AM ET scheduled delivery",
    },
  });
});

test("inactive DST companions and weekend delivery are no-ops without a token", async () => {
  let fetched = false;
  const fetchImpl = async () => {
    fetched = true;
    return response();
  };

  assert.deepEqual(
    await handleScheduled(
      {
        cron: "5 10 * * *",
        scheduledTime: timestamp("2026-08-24T10:05:00Z"),
      },
      {},
      fetchImpl,
    ),
    { status: "ignored" },
  );
  assert.deepEqual(
    await handleScheduled(
      {
        cron: "0 10 * * *",
        scheduledTime: timestamp("2026-08-22T10:00:00Z"),
      },
      {},
      fetchImpl,
    ),
    { status: "ignored" },
  );
  assert.equal(fetched, false);
});

test("the runtime handler awaits every dispatch before resolving", async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  let finishPersonal;

  globalThis.fetch = async (url) => {
    const workflow = workflowFromUrl(url);
    events.push(`start:${workflow}`);
    await new Promise((resolve) => {
      finishPersonal = resolve;
    });
    events.push(`finish:${workflow}`);
    return response();
  };

  try {
    let settled = false;
    const scheduled = worker
      .scheduled(
        {
          cron: "5 9 * * *",
          scheduledTime: timestamp("2026-08-24T09:05:00Z"),
          noRetry() {
            events.push("noRetry");
          },
        },
        { GITHUB_TOKEN: token },
      )
      .then(() => {
        settled = true;
      });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(events.includes("start:personal-morning-paper.yml"), true);
    assert.equal(events.includes("start:morning-research.yml"), false);
    assert.equal(settled, false);

    finishPersonal();
    await scheduled;
    assert.equal(settled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(events.includes("noRetry"), false);
  assert.equal(events.filter((event) => event.startsWith("finish:")).length, 1);
});

test("unknown and timestamp-mismatched cron events fail closed", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response();
  };

  await assert.rejects(
    handleScheduled(
      { cron: "* * * * *", scheduledTime: timestamp("2026-08-24T09:05:00Z") },
      { GITHUB_TOKEN: token },
      fetchImpl,
    ),
    /approved cron trigger/i,
  );
  await assert.rejects(
    handleScheduled(
      {
        cron: "5 9 * * *",
        scheduledTime: timestamp("2026-08-24T09:06:00Z"),
      },
      { GITHUB_TOKEN: token },
      fetchImpl,
    ),
    /does not match/i,
  );
  await assert.rejects(
    handleScheduled(
      {
        cron: "5 9 * * MON-FRI",
        scheduledTime: timestamp("2026-08-24T09:05:00Z"),
      },
      { GITHUB_TOKEN: token },
      fetchImpl,
    ),
    /approved cron trigger/i,
  );
  assert.equal(calls, 0);
});

test("a fine-grained GitHub token is normalized without assuming its suffix format", () => {
  assert.equal(requireFineGrainedToken({ GITHUB_TOKEN: token }), token);
  assert.equal(requireFineGrainedToken({ GITHUB_TOKEN: `  ${token}\n` }), token);
  const futureFormatToken = `github_pat_${"a".repeat(22)}-${"b".repeat(40)}`;
  assert.equal(
    requireFineGrainedToken({ GITHUB_TOKEN: futureFormatToken }),
    futureFormatToken,
  );
  for (const invalid of [
    undefined,
    "",
    "ghp_classic_token_that_is_long_enough_1234",
    "github_pat_short",
    `github_pat_${"a".repeat(20)} ${"b".repeat(20)}`,
    `github_pat_${"a".repeat(30)}\u200b`,
    `github_pat_${"a".repeat(30)}é`,
  ]) {
    assert.throws(
      () => requireFineGrainedToken({ GITHUB_TOKEN: invalid }),
      /fine-grained personal access token/i,
    );
  }
});

test("workflow allowlisting excludes paid research and keeps scheduled lanes separate", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response();
  };

  await assert.rejects(
    dispatchGitHubWorkflow(
      "personal",
      token,
      timestamp("2026-08-22T09:05:00Z"),
      async () => response(204),
    ),
    (error) => {
      assert.match(error.message, /HTTP 204/);
      assert.equal(error.stage, "github-response");
      assert.equal(error.httpStatus, 204);
      return true;
    },
  );

  await assert.rejects(
    dispatchGitHubWorkflow(
      "research",
      token,
      timestamp("2026-08-22T09:05:00Z"),
      fetchImpl,
    ),
    /not approved for dispatch/i,
  );
  await assert.rejects(
    dispatchGitHubWorkflow(
      "personal",
      token,
      timestamp("2026-08-24T10:00:00Z"),
      fetchImpl,
    ),
    /does not match the scheduled New York time/i,
  );
  await assert.rejects(
    dispatchGitHubWorkflow(
      "free-comparison",
      token,
      timestamp("2026-08-24T09:05:00Z"),
      fetchImpl,
    ),
    /not approved for dispatch/i,
  );
  assert.equal(calls, 0);
});

test("individual GitHub failures are sanitized and fail the invocation", async () => {
  await assert.rejects(
    dispatchGitHubWorkflow(
      "personal",
      token,
      timestamp("2026-08-24T09:05:00Z"),
      async () => response(403),
    ),
    (error) => {
      assert.match(error.message, /HTTP 403/);
      assert.equal(error.message.includes(token), false);
      return true;
    },
  );

  let networkAttempts = 0;
  await assert.rejects(
    dispatchGitHubWorkflow(
      "personal",
      token,
      timestamp("2026-08-22T09:05:00Z"),
      async () => {
        networkAttempts += 1;
        throw new Error(`network failure involving ${token}`);
      },
    ),
    (error) => {
      assert.equal(error.message, "GitHub workflow dispatch could not be confirmed.");
      assert.equal(error.message.includes(token), false);
      return true;
    },
  );
  assert.equal(networkAttempts, 2);

  await assert.rejects(
    dispatchGitHubWorkflow(
      "personal",
      token,
      timestamp("2026-08-24T09:05:00Z"),
      async () => ({
        status: 200,
        async json() {
          return {
            workflow_run_id: 123,
            run_url: "https://api.github.com/repos/someone/else/actions/runs/123",
            html_url: "https://github.com/someone/else/actions/runs/123",
          };
        },
      }),
    ),
    /invalid success response/i,
  );
});

test("one bounded retry recovers a transient GitHub response", async () => {
  let attempts = 0;
  const result = await dispatchGitHubWorkflow(
    "personal",
    token,
    timestamp("2026-08-22T09:05:00Z"),
    async () => {
      attempts += 1;
      return attempts === 1 ? response(503) : response();
    },
  );

  assert.equal(attempts, 2);
  assert.deepEqual(result, {
    dispatch: "personal",
    workflowRunId: 123,
    htmlUrl: "https://github.com/itworksinprod/first-fold/actions/runs/123",
  });
});

test("rate limits fail without an immediate retry", async () => {
  for (const limitedResponse of [
    () => response(429),
    () => ({
      ...response(403),
      headers: new Headers({ "x-ratelimit-remaining": "0" }),
    }),
  ]) {
    let attempts = 0;
    await assert.rejects(
      dispatchGitHubWorkflow(
        "personal",
        token,
        timestamp("2026-08-22T09:05:00Z"),
        async () => {
          attempts += 1;
          return limitedResponse();
        },
      ),
      (error) => {
        assert.equal(error.stage, "github-rate-limit");
        return true;
      },
    );
    assert.equal(attempts, 1);
  }
});

test("scheduled morning failure reports only the personal dispatch", async () => {
  const calls = [];
  let resolveRequest;
  const pending = handleScheduled(
    {
      cron: "5 9 * * *",
      scheduledTime: timestamp("2026-08-24T09:05:00Z"),
    },
    { GITHUB_TOKEN: token },
    async (url) => {
      const workflow = workflowFromUrl(url);
      calls.push(workflow);
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    },
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, ["personal-morning-paper.yml"]);

  resolveRequest(response(403));
  await assert.rejects(
    pending,
    (error) => {
      assert.equal(error.message, "One or more GitHub workflow dispatches failed.");
      assert.equal(error.message.includes("403"), false);
      assert.equal(error.message.includes(token), false);
      return true;
    },
  );
});

test("structured failure logs identify the personal dispatch without secrets", async () => {
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const originalError = console.error;
  const errorRecords = [];

  globalThis.fetch = async () => response(403);
  console.info = () => {};
  console.error = (record) => errorRecords.push(record);

  try {
    await assert.rejects(
      worker.scheduled(
        {
          cron: "5 9 * * *",
          scheduledTime: timestamp("2026-08-24T09:05:00Z"),
        },
        { GITHUB_TOKEN: token },
      ),
      /dispatches failed/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    console.error = originalError;
  }

  assert.equal(errorRecords.length, 1);
  const serialized = errorRecords[0];
  const record = JSON.parse(serialized);
  assert.deepEqual(record, {
    component: "first-fold-morning-dispatcher",
    event: "scheduled-failed",
    cron: "5 9 * * *",
    scheduled_at: "2026-08-24T09:05:00.000Z",
    stage: "github-response",
    http_status: 403,
    failed_dispatches: ["personal"],
    workflow_run_ids: [],
  });
  assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes("paper content"), false);
});

test("Wrangler config is cron-only and declares exactly four daily UTC triggers", async () => {
  const config = JSON.parse(
    await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  );

  assert.equal(config.main, "src/worker.mjs");
  assert.equal(config.workers_dev, false);
  assert.deepEqual(config.observability, { enabled: true, head_sampling_rate: 1 });
  assert.equal(config.compatibility_date, "2026-08-23");
  assert.deepEqual(config.compatibility_flags, ["nodejs_compat"]);
  assert.deepEqual(config.secrets, { required: ["GITHUB_TOKEN"] });
  assert.deepEqual(config.triggers.crons, [
    "5 9 * * *",
    "5 10 * * *",
    "0 10 * * *",
    "0 11 * * *",
  ]);
  assert.equal(config.triggers.crons.length, 4);
  assert.equal("routes" in config, false);
  assert.deepEqual(Object.keys(worker), ["scheduled"]);
});
