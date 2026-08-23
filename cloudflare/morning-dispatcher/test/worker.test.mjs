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

test("New York gates select the daily personal and weekday paid dispatches across DST", () => {
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-08-24T09:05:00Z")), [
    "personal",
    "research",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-08-24T10:05:00Z")), []);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-08-24T10:00:00Z")), [
    "delivery",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-08-24T11:00:00Z")), []);

  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-01-12T09:05:00Z")), []);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-01-12T10:05:00Z")), [
    "personal",
    "research",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-01-12T10:00:00Z")), []);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-01-12T11:00:00Z")), [
    "delivery",
  ]);

  // The first weekdays after both 2026 clock changes use the correct companion.
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-03-09T09:05:00Z")), [
    "personal",
    "research",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-03-09T10:00:00Z")), [
    "delivery",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-11-02T10:05:00Z")), [
    "personal",
    "research",
  ]);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-11-02T11:00:00Z")), [
    "delivery",
  ]);

  // The legacy paid-only selector remains unchanged for existing callers.
  assert.equal(dispatchForScheduledTime(timestamp("2026-08-24T09:05:00Z")), "research");
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

  assert.equal(dispatchForScheduledTime(timestamp("2026-08-22T09:05:00Z")), null);
  assert.deepEqual(dispatchesForScheduledTime(timestamp("2026-08-24T09:04:00Z")), []);
  assert.throws(() => dispatchesForScheduledTime(Number.NaN), /scheduled event time/i);
});

test("weekday research time dispatches the personal and paid workflows with exact inputs", async () => {
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
    dispatches: ["personal", "research"],
  });
  assert.equal(requests.length, 2);

  const requestsByWorkflow = Object.fromEntries(
    requests.map(([url, options]) => [workflowFromUrl(url), { url, options }]),
  );
  assert.deepEqual(Object.keys(requestsByWorkflow).sort(), [
    "morning-research.yml",
    "personal-morning-paper.yml",
  ]);

  const personal = requestsByWorkflow["personal-morning-paper.yml"];
  assert.equal(
    personal.url,
    "https://api.github.com/repos/itworksinprod/first-fold/actions/workflows/personal-morning-paper.yml/dispatches",
  );
  assert.deepEqual(JSON.parse(personal.options.body), {
    ref: "main",
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

  const research = requestsByWorkflow["morning-research.yml"];
  assert.equal(
    research.url,
    "https://api.github.com/repos/itworksinprod/first-fold/actions/workflows/morning-research.yml/dispatches",
  );
  assert.equal(research.options.method, "POST");
  assert.equal(research.options.redirect, "error");
  assert.equal(research.options.headers.authorization, `Bearer ${token}`);
  assert.equal(research.options.headers["x-github-api-version"], "2026-03-10");
  assert.deepEqual(JSON.parse(research.options.body), {
    ref: "main",
    inputs: {
      trigger_source: "cloudflare",
      scheduled_at: "2026-08-24T09:05:00.000Z",
      dispatch_key: "research:2026-08-24",
    },
  });

  for (const [url, options] of requests) {
    assert.equal(options.body.includes(token), false);
    assert.equal(url.includes(token), false);
  }
});

test("weekend research time dispatches only the personal workflow", async () => {
  const requests = [];
  const result = await handleScheduled(
    {
      cron: "5 9 * * *",
      scheduledTime: timestamp("2026-08-22T09:05:00Z"),
    },
    { GITHUB_TOKEN: token },
    async (...request) => {
      requests.push(request);
      return response(204);
    },
  );

  assert.deepEqual(result, { status: "dispatched", dispatches: ["personal"] });
  assert.equal(requests.length, 1);
  assert.equal(workflowFromUrl(requests[0][0]), "personal-morning-paper.yml");
  assert.deepEqual(JSON.parse(requests[0][1].body), {
    ref: "main",
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

test("weekday delivery dispatch keeps the paid recovery payload unchanged", async () => {
  let captured;
  const result = await handleScheduled(
    {
      cron: "0 11 * * *",
      scheduledTime: timestamp("2026-01-12T11:00:00Z"),
    },
    { GITHUB_TOKEN: token },
    async (url, options) => {
      captured = { url, options };
      return response(204);
    },
  );

  assert.deepEqual(result, { status: "dispatched", dispatches: ["delivery"] });
  assert.equal(
    captured.url,
    "https://api.github.com/repos/itworksinprod/first-fold/actions/workflows/pages.yml/dispatches",
  );
  assert.deepEqual(JSON.parse(captured.options.body), {
    ref: "main",
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

test("the runtime handler awaits every dispatch and leaves recovery retries enabled", async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  let finishResearch;

  globalThis.fetch = async (url) => {
    const workflow = workflowFromUrl(url);
    events.push(`start:${workflow}`);
    if (workflow === "morning-research.yml") {
      await new Promise((resolve) => {
        finishResearch = resolve;
      });
    }
    events.push(`finish:${workflow}`);
    return response(204);
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
    assert.equal(events.includes("start:morning-research.yml"), true);
    assert.equal(settled, false);

    finishResearch();
    await scheduled;
    assert.equal(settled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(events.includes("noRetry"), false);
  assert.equal(events.filter((event) => event.startsWith("finish:")).length, 2);
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

test("only a fine-grained GitHub token is accepted", () => {
  assert.equal(requireFineGrainedToken({ GITHUB_TOKEN: token }), token);
  for (const invalid of [
    undefined,
    "",
    "ghp_classic_token_that_is_long_enough_1234",
    "github_pat_short",
  ]) {
    assert.throws(
      () => requireFineGrainedToken({ GITHUB_TOKEN: invalid }),
      /fine-grained personal access token/i,
    );
  }
});

test("workflow allowlisting and local-time gates keep the personal and paid lanes separate", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response();
  };

  await assert.rejects(
    dispatchGitHubWorkflow(
      "research",
      token,
      timestamp("2026-08-22T09:05:00Z"),
      fetchImpl,
    ),
    /does not match the scheduled New York time/i,
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
      "research",
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

  await assert.rejects(
    dispatchGitHubWorkflow(
      "personal",
      token,
      timestamp("2026-08-22T09:05:00Z"),
      async () => {
        throw new Error(`network failure involving ${token}`);
      },
    ),
    (error) => {
      assert.equal(error.message, "GitHub workflow dispatch could not be confirmed.");
      assert.equal(error.message.includes(token), false);
      return true;
    },
  );

  await assert.rejects(
    dispatchGitHubWorkflow(
      "research",
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

test("multi-dispatch attempts and awaits every due workflow before a sanitized failure", async () => {
  const calls = [];
  const resolvers = new Map();
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
        resolvers.set(workflow, resolve);
      });
    },
  );

  let settled = false;
  const observed = pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls.sort(), ["morning-research.yml", "personal-morning-paper.yml"]);

  resolvers.get("personal-morning-paper.yml")(response(403));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(settled, false);

  resolvers.get("morning-research.yml")(response(204));
  await assert.rejects(
    pending,
    (error) => {
      assert.equal(error.message, "One or more GitHub workflow dispatches failed.");
      assert.equal(error.message.includes("403"), false);
      assert.equal(error.message.includes(token), false);
      return true;
    },
  );
  await observed;
  assert.equal(settled, true);
});

test("Wrangler config is cron-only and declares exactly four daily UTC triggers", async () => {
  const config = JSON.parse(
    await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  );

  assert.equal(config.main, "src/worker.mjs");
  assert.equal(config.workers_dev, false);
  assert.deepEqual(config.observability, { enabled: false });
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
