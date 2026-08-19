export const PIPELINE_VERSION = "first-fold-pipeline-v1";

export const EDITORIAL_TIMEZONE = "America/New_York" as const;
export const RESEARCH_CUTOFF_LOCAL_TIME = "05:00" as const;
export const PUBLICATION_LOCAL_TIME = "06:00" as const;

/**
 * Cloudflare cron is UTC. Running at the three possible UTC hours and applying
 * a New York local-time gate handles daylight-saving changes without manually
 * changing the schedule. The 06:00 local run is recovery-only and must remain
 * idempotent.
 */
export const CRON_EXPRESSION = "0 9,10,11 * * *" as const;

export const EDITORIAL_PIPELINE = [
  {
    id: "open-run",
    target: "05:00 ET",
    work: "Calculate the edition date and exact UTC reporting window; claim an idempotency key.",
  },
  {
    id: "discover",
    target: "05:02 ET",
    work: "Collect candidates from curated feeds, advisories, and primary sources.",
  },
  {
    id: "normalize",
    target: "05:15 ET",
    work: "Canonicalize URLs and timestamps; assign event keys; cluster duplicates.",
  },
  {
    id: "verify",
    target: "05:25 ET",
    work: "Extract supported facts, resolve dates, compare the prior 30 editions, and flag conflicts.",
  },
  {
    id: "select-and-draft",
    target: "05:38 ET",
    work: "Run the stable editorial policy and daily prompt over bounded candidate dossiers.",
  },
  {
    id: "validate",
    target: "05:50 ET",
    work: "Validate the schema, invariants, source mappings, URLs, word counts, and security requirements.",
  },
  {
    id: "stage",
    target: "05:55 ET",
    work: "Persist an immutable validated edition with visibility set to 06:00 ET.",
  },
  {
    id: "publish",
    target: "06:00 ET",
    work: "Expose the edition atomically; retain the last valid edition if the run failed.",
  },
] as const;
