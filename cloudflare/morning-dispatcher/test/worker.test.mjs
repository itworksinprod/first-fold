import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  default as worker,
  dispatchForScheduledTime,
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

test("New York gates select one research and delivery trigger across DST", () => {
  assert.equal(dispatchForScheduledTime(timestamp("2026-08-24T09:05:00Z")), "research");
  assert.equal(dispatchForScheduledTime(timestamp("2026-08-24T10:05:00Z")), null);
  assert.equal(dispatchForScheduledTime(timestamp("2026-08-24T10:00:00Z")), "delivery");
  assert.equal(dispatchForScheduledTime(timestamp("2026-08-24T11:00:00Z")), null);

  assert.equal(dispatchForScheduledTime(timestamp("2026-01-12T09:05:00Z")), null);
  assert.equal(dispatchForScheduledTime(timestamp("2026-01-12T10:05:00Z")), "research");
  assert.equal(dispatchForScheduledTime(timestamp("2026-01-12T10:00:00Z")), null);
  assert.equal(dispatchForScheduledTime(timestamp("2026-01-12T11:00:00Z")), "delivery");

  // The first weekdays after both 2026 clock changes use the correct twin.
  assert.equal(dispatchForScheduledTime(timestamp("2026-03-09T09:05:00Z")), "research");
  assert.equal(dispatchForScheduledTime(timestamp("2026-03-09T10:00:00Z")), "delivery");
  assert.equal(dispatchForScheduledTime(timestamp("2026-11-02T10:05:00Z")), "research");
  assert.equal(dispatchForScheduledTime(timestamp("2026-11-02T11:00:00Z")), "delivery");
});

test("the local gate excludes weekends and nearby minutes", () => {
  assert.equal(dispatchForScheduledTime(timestamp("2026-08-22T09:05:00Z")), null);
  assert.equal(dispatchForScheduledTime(timestamp("2026-08-24T09:04:00Z")), null);
  assert.throws(() => dispatchForScheduledTime(Number.NaN), /scheduled event time/i);
});

test("research dispatch targets the fixed workflow with exact provenance", async () => {
  const requests = [];
  const result = await handleScheduled(
    {
      cron: "5 9 * * MON-FRI",
      scheduledTime: timestamp("2026-08-24T09:05:00Z"),
    },
    { GITHUB_TOKEN: token },
    async (...request) => {
      requests.push(request);
      return response();
    },
  );

  assert.deepEqual(result, { status: "dispatched", dispatch: "research" });
  assert.equal(requests.length, 1);
  const [url, options] = requests[0];
  assert.equal(
    url,
    "https://api.github.com/repos/itworksinprod/first-fold/actions/workflows/morning-research.yml/dispatches",
  );
  assert.equal(options.method, "POST");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers.authorization, `Bearer ${token}`);
  assert.equal(options.headers["x-github-api-version"], "2026-03-10");
  assert.deepEqual(JSON.parse(options.body), {
    ref: "main",
    inputs: {
      trigger_source: "cloudflare",
      scheduled_at: "2026-08-24T09:05:00.000Z",
      dispatch_key: "research:2026-08-24",
    },
  });
  assert.equal(options.body.includes(token), false);
  assert.equal(url.includes(token), false);
});

test("delivery dispatch includes the required recovery reason", async () => {
  let captured;
  const result = await handleScheduled(
    {
      cron: "0 11 * * MON-FRI",
      scheduledTime: timestamp("2026-01-12T11:00:00Z"),
    },
    { GITHUB_TOKEN: token },
    async (url, options) => {
      captured = { url, options };
      return response(204);
    },
  );

  assert.deepEqual(result, { status: "dispatched", dispatch: "delivery" });
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

test("the inactive DST companion is a no-op and does not require a token", async () => {
  let fetched = false;
  const result = await handleScheduled(
    {
      cron: "5 10 * * MON-FRI",
      scheduledTime: timestamp("2026-08-24T10:05:00Z"),
    },
    {},
    async () => {
      fetched = true;
      return response();
    },
  );

  assert.deepEqual(result, { status: "ignored" });
  assert.equal(fetched, false);
});

test("the runtime handler leaves recovery retries enabled", async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  globalThis.fetch = async () => {
    events.push("fetch");
    return response();
  };

  try {
    await worker.scheduled(
      {
        cron: "5 9 * * MON-FRI",
        scheduledTime: timestamp("2026-08-24T09:05:00Z"),
        noRetry() {
          events.push("noRetry");
        },
      },
      { GITHUB_TOKEN: token },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(events, ["fetch"]);
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
        cron: "5 9 * * MON-FRI",
        scheduledTime: timestamp("2026-08-24T09:06:00Z"),
      },
      { GITHUB_TOKEN: token },
      fetchImpl,
    ),
    /does not match/i,
  );
  assert.equal(calls, 0);
});

test("only a fine-grained GitHub token is accepted", async () => {
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

test("GitHub failures are sanitized and fail the invocation", async () => {
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
      "research",
      token,
      timestamp("2026-08-24T09:05:00Z"),
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

test("Wrangler config is cron-only and declares exactly four UTC triggers", async () => {
  const config = JSON.parse(
    await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  );

  assert.equal(config.main, "src/worker.mjs");
  assert.equal(config.workers_dev, false);
  assert.deepEqual(config.observability, { enabled: false });
  assert.deepEqual(config.secrets, { required: ["GITHUB_TOKEN"] });
  assert.deepEqual(config.triggers.crons, [
    "5 9 * * MON-FRI",
    "5 10 * * MON-FRI",
    "0 10 * * MON-FRI",
    "0 11 * * MON-FRI",
  ]);
  assert.equal("routes" in config, false);
});
