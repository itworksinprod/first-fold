// Qualification of the existing daily writer, never a delivery authorization.
export function assertDailyProductionCheckAuthority(env) {
  const expected = {
    GITHUB_REPOSITORY: "itworksinprod/first-fold",
    GITHUB_REF: "refs/heads/main",
    GITHUB_ACTOR: "itworksinprod",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_WORKFLOW_REF: "itworksinprod/first-fold/.github/workflows/daily-production-quality-check.yml@refs/heads/main",
  };
  if (Object.entries(expected).some(([key, value]) => env[key] !== value) || env.FREE_WRITER_MODEL) {
    throw Object.assign(new Error("Daily qualification requires the trusted manual workflow and unchanged writer."),
      { code: "DAILY_QUALITY_AUTHORITY_REJECTED" });
  }
}

export function assertDailySummaryCoverage(stories, checkedStories) {
  if (!Number.isInteger(stories) || stories < 3 || stories > 4 || checkedStories !== stories) {
    throw Object.assign(new Error("Daily qualification requires at least three checked summaries, not fallback links."),
      { code: "DAILY_QUALITY_THREE_SUMMARIES_REQUIRED" });
  }
}
