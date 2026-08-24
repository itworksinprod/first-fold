# Personal Morning Paper delivery

The Personal Morning Paper is the repository's only automatically researched
edition. At **5:05 AM `America/New_York` every calendar day, including
weekends**, Cloudflare dispatches one owner-only GitHub Actions job. That job
reads current items from the curated feed catalog, asks the fixed Cloudflare
Workers AI model `@cf/openai/gpt-oss-120b` to select and draft a complete paper,
validates it, and sends it to one email address through Resend.

This automatic path does not call OpenAI, does not use general open-web search,
and has no paid fallback. The separate OpenAI Morning Press generator remains
available only as a deliberate manual, billable experiment. The separate Free
Morning Press comparison also remains manual and keeps its stricter comparison
rules.

The lane is not live merely because its files exist on `main`. Do not record a
successful setup until a manual run and a real 5:05 AM scheduled run have both
succeeded end to end.

## Hard boundary

| Property | Personal Morning Paper |
| --- | --- |
| Schedule | 5:05 AM `America/New_York` every day, including weekends |
| Reporting window | The 72 elapsed hours ending at 5:00 AM New York time on the edition date; start inclusive and end exclusive |
| Discovery | Live entries from the repository's curated, allowlisted feeds; no general web search |
| Drafting | Fixed Cloudflare Workers AI model `@cf/openai/gpt-oss-120b` |
| Completion rule | Three or four validated stories, no more than one per desk; at most one honest quiet desk; fewer than three stories means no email |
| Recipient | Exactly the one address stored in `PERSONAL_PAPER_EMAIL` |
| Sender | `First Fold <onboarding@resend.dev>`, Resend's self-only testing sender |
| Message | Static, escaped HTML plus an equivalent plain-text part; no client-side JavaScript |
| Repository permissions | Read-only contents and Actions metadata; no pull-request, branch, commit, Pages, or public-content write permission; the workflow may download and upload only its bounded private-state ledger artifact |
| Persistence | The candidate remains on the ephemeral runner; a hash-only ledger artifact retains at most the previous 30 dates plus first-five-pilot progress, never paper copy, headlines, source URLs, publisher names, recipient data, or provider IDs |
| Failure | Feed, quota, model, scoring, repeat-ledger, three-story, source, schema, rendering, configuration, or send-precondition failure sends no email |
| Duplicate control | Suppress an earlier successful same-day workflow, veto matching story fingerprints from the previous 30 calendar dates, then make at most one Resend request with `Idempotency-Key: first-fold-personal-YYYY-MM-DD`; no application-level send retry |
| Paid fallback | None |

The workflow is `.github/workflows/personal-morning-paper.yml`, displayed in
GitHub Actions as **Send personal Morning Paper**. It is intentionally separate
from:

- `.github/workflows/morning-research.yml`, the manual OpenAI candidate and its
  public approval pull request;
- `.github/workflows/free-morning-research.yml`, the manual strict comparison
  and its `content/free-candidates/` artifact; and
- the public reader, archive, service worker, canonical `content/editions/`
  files, and generated `dist/` files.

Neither of those other research lanes can be used as an automatic fallback.

## Daily execution

Cloudflare Cron Triggers use UTC, so the dispatcher retains four companion
schedules: `5 9 * * *`, `5 10 * * *`, `0 10 * * *`, and `0 11 * * *`.
Its `America/New_York` gate selects only the companion that represents 5:05 or
6:00 AM Eastern after daylight-saving changes.

At the matching 5:05 AM event on every day:

1. The dispatcher requests `.github/workflows/personal-morning-paper.yml` on
   `main` with `trigger_source: cloudflare`, the canonical scheduled time,
   `dispatch_key: personal:YYYY-MM-DD`, `run_mode: on_time`, and blank backfill
   fields. It does **not** dispatch the paid OpenAI research workflow.
2. The workflow validates its repository, actor, branch, New York time, and
   date-scoped dispatch identity. When personal delivery is intentionally
   disabled, it exits before checkout or provider use. A partial configuration
   is a failure.
3. Before any model call, the job restores and validates the latest trusted
   `personal-repeat-ledger-v1` artifact. The first post-rollout run may create an
   empty ledger only when no earlier successful personal send or ledger artifact
   exists. A corrupt, ambiguous, expired-after-use, or missing post-rollout
   ledger fails closed.
4. The job fetches and parses the allowlisted live feeds. Every desk must have
   healthy coverage from the configured publisher set. It considers only items
   first published inside the bounded 72-hour lookback ending at the edition's
   5:00 AM New York cutoff. Feed text is treated as untrusted data, not
   instructions.
5. The deterministic selector first applies hard vetoes for promotional or deal
   content, reviews and lifestyle copy, rumors or speculation, routine or minor
   announcements, insufficient topicality, weak evidence, and recent repeats.
   Every surviving event receives a 100-point score: importance/materiality 30,
   desk relevance 20, source quality 20, reader usefulness/actionability 15, and
   freshness 15. Both
   independently corroborated events and explicitly attributed authoritative
   originating reports must score at least 70. A single-source originating story
   must stay explicitly attributed and cannot be presented as independently
   confirmed or critical. Independent allegations and critical claims still
   require independent evidence.
6. The fixed Workers AI model receives only the bounded, selected feed dossiers.
   It must return three or four stories with no more than one story per desk and
   no more than one honest quiet desk. It may not lower the quality threshold to
   fill a page. Local validation binds every draft to its selected feed URLs,
   enforces dates and story length, checks source reachability and evidence
   mappings, and rejects duplicate events or two quiet desks.
7. Each story receives a trusted validation receipt containing its total score,
   five component scores, required threshold, evidence tier, and factual source
   and publisher counts. The email renderer recomputes and validates that receipt
   rather than trusting model-controlled display text.
8. After all deterministic checks pass, the workflow records only domain-separated
   SHA-256 story fingerprints and stages that immutable ledger as an artifact
   before delivery. It then sends one escaped HTML and plain-text message through
   Resend. A later run trusts the staged artifact only when GitHub records that
   run's exact send step as successful; artifacts from unsent runs are ignored.
   This ordering prevents an artifact-service failure after delivery from losing
   the repeat state. The workflow makes no commit, branch, pull request, Pages
   dispatch, or public archive change, and never uploads the candidate or email
   body.

The 6:00 AM companion is the separate weekday public Pages delivery gate. It
contains no model call or research step and publishes only a valid edition
already approved and present on `main`.

## Private candidate and provenance

The generator writes `content/personal-candidates/YYYY-MM-DD.json` only inside
the current GitHub-hosted runner. The workflow never uploads or commits that
path. The email renderer accepts only a candidate with validated
`provenance.personalFreeResearch`; it rejects public paid-pilot provenance,
manual free-comparison provenance, and ordinary canonical-edition provenance.

The private provenance records the fixed provider and model, reporting run,
generation time and mode, bounded feed/inference hashes, coverage counts,
evidence policy, validation receipts, repeat-ledger digest and counts, and three
or four selected stories. It contains no recipient or API credential. The
distinction is intentional: a file prepared for a private email must never
become a public publication candidate merely because its shape is similar.

The private candidate and email body are still ephemeral, but duplicate control
now persists a bounded hash-only ledger named `personal-repeat-ledger-v1`. The
ledger covers exactly the previous 30 calendar dates and stores only
domain-separated SHA-256 fingerprints derived from event identity, factual
source URLs, strong vulnerability identifiers, canonical entities, and title
tokens, plus bounded counts and score metadata. It does not retain cleartext
headlines, copy, URLs, publishers, CVE or GHSA identifiers, recipients, or Resend
IDs. Because this repository is public, treat workflow artifacts as potentially
readable by repository visitors even though their contents are pseudonymous.
Same-day workflow and Resend idempotency remain a separate defense against a
second delivery for one edition date.

Ledger artifacts are retained for 35 days. If the paper has not sent for longer
than the 30-day repeat window and every old artifact has expired, the next run
may bootstrap without stale fingerprints while reconstructing enough trusted
workflow history to preserve whether the first-five pilot is complete. A
missing or expired artifact for a delivery still inside the 30-day window
remains a hard failure.

GitHub-hosted runners are ephemeral, but the complete transaction is not
retention-free. GitHub retains workflow metadata and logs; Cloudflare processes
the bounded research request and response; Resend processes the recipient and
message; and the mailbox provider stores the delivered email. The workflow must
not print the recipient, API tokens, candidate, or email body to logs and must
not upload them as artifacts. Only the bounded hash ledger may be uploaded. See
GitHub's
[hosted-runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
Cloudflare's [privacy policy](https://www.cloudflare.com/privacypolicy/), and
Resend's [privacy policy](https://resend.com/legal/privacy-policy).

## First-five quality pilot

The first five successfully sent editions are labeled privately as **Quality
pilot · Edition N of 5**. Review each received paper for importance, relevance,
source quality, reader usefulness, freshness, desk assignment, and repeat
accuracy. Record false positives, missed stories, and any claim that needed
correction. The software tracks only the ordinal in its hash ledger; it does not
store your editorial feedback in the repository.

After five reviewed deliveries, summarize the evidence and propose any weight,
threshold, or veto changes for explicit owner approval. Do not tune the policy
automatically from five observations and do not weaken a threshold merely to
fill a desk.

## One-time owner setup

The automatic lane uses one repository variable and three repository secrets:

| Name | GitHub type | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Actions variable | Account whose Workers AI free allocation is used |
| `CLOUDFLARE_AI_API_TOKEN` | Actions secret | Narrow token allowed to call Workers AI |
| `RESEND_API_KEY` | Actions secret | Sending-only Resend credential |
| `PERSONAL_PAPER_EMAIL` | Actions secret | One self-only recipient address |

`OPENAI_API_KEY` is not required and is never read by this automatic workflow.

### 1. Add the Cloudflare Workers AI variable and secret

In Cloudflare, create a narrowly scoped Workers AI token for the same account
that owns the dispatcher. Prefer Cloudflare's Workers AI token template, or a
custom account token with only **Workers AI Read** and **Workers AI Edit**.
Copy its value when shown and copy the 32-character Account ID.

In **GitHub → Settings → Secrets and variables → Actions**:

1. On the **Variables** tab, create `CLOUDFLARE_ACCOUNT_ID` with the Account ID.
2. On the **Secrets** tab, create `CLOUDFLARE_AI_API_TOKEN` with the token.

The account ID is configuration, not a secret. The token is a credential: never
paste it into chat, a terminal transcript, an issue, a pull request, a candidate
file, a committed `.env` file, or a screenshot.

### 2. Add the Resend secrets

Use the Resend account associated with the exact mailbox that should receive the
paper. Resend's default `resend.dev` testing domain is self-only; another
recipient requires a verified domain and is outside this design. Resend explains
that restriction in its [`resend.dev` 403 guide](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

1. In Resend **API Keys**, create `First Fold Personal Delivery` with
   **Sending access** rather than full access.
2. In GitHub Actions secrets, create `RESEND_API_KEY` with the `re_...` value.
3. Create `PERSONAL_PAPER_EMAIL` with one bare email address associated with the
   Resend account.

Do not use a display-name form, recipient list, `CC`, `BCC`, variable, or
workflow input for the recipient. Resend shows an API key only once; replace the
secret if its value is uncertain.

### 3. Deploy and verify the dispatcher

The dispatcher uses its existing encrypted Cloudflare `GITHUB_TOKEN` binding to
invoke GitHub. Keep that fine-grained GitHub token scoped to
`itworksinprod/first-fold` with only **Actions: Read and write**. The Resend and
Workers AI credentials stay in GitHub, not in the dispatcher.

After the workflow and dispatcher changes are on `main`:

1. Follow the test and Wrangler deployment procedure in the
   [Morning Press runbook](morning-press-runbook.md#deploy-the-external-morning-dispatcher).
2. Confirm the deployed Worker's Cron list contains exactly the four UTC
   companions above.
3. Run one permitted manual test using the instructions below.
4. At the next 5:05 AM Eastern event, verify a successful Cron Event in
   **Cloudflare → Workers & Pages → first-fold-morning-dispatcher → Triggers**, a
   corresponding **Send personal Morning Paper** run in GitHub Actions, and one
   received message.

The dispatcher stores only secret-free structured status such as the Cron time,
sanitized stage or HTTP status, dispatch name, and returned GitHub run ID. It
must not log a token, recipient, provider body, or paper content.

## Manual run and same-day recovery

### Normal `on_time` run

Use this only between 5:00 and 5:59 AM New York time:

1. Open **Actions → Send personal Morning Paper → Run workflow**.
2. Keep **Branch: main** and `run_mode: on_time`.
3. Leave the dispatcher and backfill fields blank.
4. Select **Run workflow**.

The workflow derives today's date and rejects an out-of-window request. Check
the day's runs and inbox first; a successful same-day delivery needs no rerun.

### Same-day backfill

Use this only after the normal window was missed:

1. Open **Actions → Send personal Morning Paper → Run workflow** on `main`.
2. Set `run_mode` to `same_day_backfill`.
3. Enter today's New York date as `YYYY-MM-DD` in `backfill_date`.
4. Enter an 8–200 character, one-line operational reason.
5. Enter exactly `BACKFILL YYYY-MM-DD` in `backfill_confirmation`.
6. Leave `trigger_source`, `scheduled_at`, and `dispatch_key` blank, then run.

Backfill is accepted only from 6:00 AM through the end of that same New York
calendar date. It records the actual execution time. It cannot prepare or send
a historical, future, or partially validated edition.

If a send response is ambiguous, inspect Resend before rerunning. The same-day
idempotency key can return the original result for the same payload or reject a
changed payload; it must not create a second delivery. Once the date changes,
wait for the next scheduled paper.

## Failure and privacy posture

The lane sends nothing unless every prerequisite passes. Expected fail-closed
causes include:

- a missing or malformed Cloudflare account ID, Workers AI token, Resend key, or
  recipient after delivery has been enabled;
- a feed outage or inadequate publisher coverage for any desk;
- fewer than three eligible selected events or more than one quiet desk;
- a hard editorial veto, score below 70, recent-repeat match, missing validation
  receipt, or receipt mismatch;
- a missing, malformed, ambiguous, or untrusted repeat-ledger artifact after the
  guarded bootstrap run;
- the Workers AI free allocation being unavailable or exhausted;
- a malformed, incomplete, repetitive, or unsupported model response;
- an unsafe, stale, unreachable, unbound, or insufficient source;
- a critical or independent claim lacking independent evidence;
- schema, word-count, temporal, duplicate, desk, evidence, or provenance
  validation failure;
- a candidate or message that cannot be rendered safely; or
- Resend rejecting the single bounded request.

No error sends an empty paper, yesterday's paper, a partial edition, an
unverified feed summary, or a paid-model fallback. There is no failure-notice
email because email is the operation being protected; inspect GitHub Actions or
use a separate non-email monitor.

“Sent only to me” describes the recipient boundary, not exclusive data
possession. Send only public source material. Never add confidential business
information, credentials, health data, private notes, or other sensitive data
to prompts, candidate copy, or the recipient field.

## Zero-cost guardrail

Keep the Cloudflare account on **Workers Free** and do not enable prepaid AI
Gateway credits. Cloudflare currently includes **10,000 Workers AI neurons per
account per day** at no charge. On Workers Free, exhausting that allocation
makes inference fail; this workflow then sends no email. It must not switch to a
paid model or provider. Other Workers AI activity on the same account shares the
daily allocation, so no code can guarantee capacity for the paper if another
job consumes it first. Check Cloudflare's current
[Workers AI pricing and free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/)
before changing plans or models.

The automatic workflow fixes the model to `@cf/openai/gpt-oss-120b`; there is no
model override. The model name includes `openai`, but it runs inside Cloudflare
Workers AI and does not use an OpenAI API key or OpenAI API billing account.
One edition permits at most two semantic model requests, caps each model output
at 6,000 tokens, and caps the serialized request at 100 KB. These are capacity
guards, not permission to spend beyond the free allocation.

Keep Resend on a free plan appropriate for one daily self-only message and keep
the repository public if relying on public-repository GitHub Actions usage.
Pricing and free limits can change, and other account usage shares them, so
review [Resend pricing](https://resend.com/pricing) and GitHub's
[Actions billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
before changing either account. A provider limit remains a failed run with no
email; it never authorizes spending.

## Emergency disable and rollback

For the fastest personal-only stop:

1. Open **GitHub → Actions → Send personal Morning Paper**.
2. Open `…`, choose **Disable workflow**, and cancel any in-progress personal
   run.
3. Revoke `First Fold Personal Delivery` in Resend and the Workers AI token in
   Cloudflare if either may be exposed, then delete or replace the matching
   GitHub secrets.

This does not affect an already delivered email or the public Pages site. The
dispatcher may log a failed personal dispatch while the workflow is disabled,
but it cannot research or send.

To keep manual workflows while pausing all scheduled dispatch, disable the
four Cron Triggers or roll the Worker back in **Cloudflare → Workers & Pages →
first-fold-morning-dispatcher → Deployments**. Re-enable service only after the
cause is fixed, credentials are rotated if necessary, the reviewed Worker is
deployed, and manual plus real-schedule verification succeeds again.
