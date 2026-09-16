# Gemini qualification — September 16, 2026

## Setup confirmed

- GitHub lists the `GEMINI_API_KEY` repository secret. Its value was not read.
- Google AI Studio shows the Default Gemini Project on **Free tier** with
  **Set up billing** available. Billing was not activated.
- Carlos explicitly approved publishing only this isolated no-email test and
  running it. No daily workflow, recipient, email sender or editorial threshold
  was changed. The earlier local-model experimental commits were not published.
- Isolated branch: `codex/gemini-free-qualification`. The original checkout retains its local
  experimental history and untracked Gemini drafts; it is not the deployed tree.

## Observed runs

1. [Run 35122478928](https://github.com/itworksinprod/first-fold/actions/runs/35122478928)
   used `1e4d310`. Local tests: 996 passed. The first model request failed with
   `GEMINI_HTTP_ERROR`; the initial sanitized report omitted HTTP status.
   Zero drafts, reviews or emails were produced. No raw provider error was logged.
2. [Run 35122909314](https://github.com/itworksinprod/first-fold/actions/runs/35122909314)
   used `8d9087a`, a narrow diagnostics repair. Local tests: 997 passed. Google
   returned **HTTP 503 / UNAVAILABLE** on the first request. Zero drafts, reviews
   or emails were produced. This was a provider failure, not a semantic rejection
   or a successful model qualification.
3. [Run 35123166902](https://github.com/itworksinprod/first-fold/actions/runs/35123166902)
   used the same `8d9087a` after a delay. Its first request again returned
   **HTTP 503 / UNAVAILABLE**. No stories were written or reviewed, and no
   email was sent. The session stopped provider requests after this result.

The diagnostics repair keeps only an HTTP status, known provider-status/reason
enums and exact allowlisted invalid-field names. It never retains provider error
messages, arbitrary metadata, credentials, hidden reasoning or source text.

Google's [troubleshooting guide](https://ai.google.dev/gemini-api/docs/troubleshooting)
recommends bounded delayed retries for transient 503 errors. The one final
delayed attempt did not resolve the service rejection. There was no repeated
quality-approval sampling or automatic paid/model fallback. A future pass would
qualify only the offline-evidence test, not today's paper or actual email delivery.

## Current disposition

**Live qualification blocked by provider availability; not passed.** The code
and manual workflow are published, with all 997 tests passing after the narrow
diagnostics fix. Passing offline tests is not evidence of successful Gemini
output. Do not enable the daily Gemini writer or claim a successful paper.
Re-test only when provider availability changes, with the Free-tier/billing
check repeated and a bounded, recorded attempt.
