# Personal Morning Paper delivery

The Personal Morning Paper is an optional, owner-only delivery lane. It turns the free curated-feed research result into one static newspaper email for the repository owner without changing either the paid public pilot or the manual free comparison.

The lane is not live merely because its files exist on `main`. If both personal-delivery secrets are absent, a scheduled run succeeds as a neutral **personal delivery not enabled** no-op before checkout, feed fetches, or AI use. Automatic delivery requires the existing Cloudflare Workers AI repository configuration, both new personal-delivery secrets below, and a deployed version of the Cloudflare dispatcher that includes the personal dispatch. Do not record a successful setup until both a manual run and a real scheduled run have been observed end to end.

## Hard boundary

| Property | Personal Morning Paper |
| --- | --- |
| Schedule | 5:05 AM `America/New_York` every calendar day, including weekends |
| Reporting window | Previous New York calendar day's 5:00 AM, inclusive, through the edition date's 5:00 AM, exclusive |
| Research | The checked-in curated feed manifest and fixed Cloudflare Workers AI path used by the free pilot |
| Recipient | Exactly the one email address in the `PERSONAL_PAPER_EMAIL` repository secret |
| Sender | `First Fold <onboarding@resend.dev>`, Resend's self-only testing sender |
| Message | Static, escaped HTML plus an equivalent plain-text part; no page-turn JavaScript or tracking requirement |
| Repository permissions | Read-only contents; no pull-request, branch, commit, Pages, or artifact permission is needed |
| Persistence | No candidate file is uploaded or committed; temporary job files remain only on the GitHub-hosted runner |
| Disabled/failure | Both personal secrets absent is a neutral no-op. Exactly one absent is a hard misconfiguration. Once enabled, any research, quota, validation, source, rendering, configuration, or send-precondition failure sends no email |
| Duplicate control | Suppress an earlier successful same-day workflow, then make at most one Resend request with `Idempotency-Key: first-fold-personal-YYYY-MM-DD`; no application-level send retry |

The workflow file is `.github/workflows/personal-morning-paper.yml`, displayed in GitHub Actions as **Send personal Morning Paper**. It is intentionally independent of:

- the paid public workflow in `.github/workflows/morning-research.yml`, its approval pull request, and its GitHub Pages delivery;
- the manual free comparison in `.github/workflows/free-morning-research.yml`, its `content/free-candidates/` file, artifact, and comparison pull request; and
- the public reader, dated archive, service worker, and files under `dist/`.

See the [paid Morning Press runbook](morning-press-runbook.md) and [free comparison guide](free-pilot.md) for those lanes. A failure or disablement here does not authorize a paid fallback, public publication, or reuse of either lane's credentials.

## Daily execution

Cloudflare Cron Triggers run in UTC, so the dispatcher retains four UTC companion schedules: `5 9 * * *`, `5 10 * * *`, `0 10 * * *`, and `0 11 * * *`. Its `America/New_York` gate selects only the companion that is actually 5:05 or 6:00 AM Eastern after daylight-saving changes.

At the matching 5:05 AM event on every day:

1. The dispatcher requests `.github/workflows/personal-morning-paper.yml` on `main` with `trigger_source: cloudflare`, the canonical scheduled time, `dispatch_key: personal:YYYY-MM-DD`, `run_mode: on_time`, and blank backfill fields.
2. The workflow checks only the presence of `RESEND_API_KEY` and `PERSONAL_PAPER_EMAIL`. If both are absent, it records the safe disabled no-op and stops before repository checkout, feed access, Workers AI, or email. If exactly one is present, it fails as a partial configuration and sends nothing.
3. On Monday through Friday, that same Cloudflare event also dispatches the separate paid research workflow. The personal workflow does not wait for, consume, or modify the paid candidate.
4. With both personal secrets present, GitHub provisions a fresh hosted runner for the personal job and requires the Cloudflare account variable and AI token. The job fetches the bounded feeds, builds dossiers, calls the fixed Workers AI model, binds sources, and applies the same editorial, originality, length, link, and canonical validation gates as the free path.
5. Only a completely valid candidate is projected into static HTML and plain text. The HTML must escape all feed- and model-controlled values; source destinations remain the validated `https:` URLs from the closed research set.
6. The job sends one `POST https://api.resend.com/emails` request to the fixed recipient. Resend's self-only `resend.dev` sender accepts only the email associated with the Resend account. A recipient mismatch fails instead of widening delivery.
7. The job writes the candidate only to the ephemeral runner, then ends without committing or uploading it, pushing a branch, opening a pull request, writing `content/editions/`, dispatching Pages, or updating the public archive.

The 6:00 AM companion remains a weekday-only paid public delivery event. It has no personal-email action.

GitHub documents that a standard GitHub-hosted job uses a fresh virtual machine that is decommissioned after the job. That makes the runner workspace ephemeral, but it does **not** make the whole transaction retention-free: GitHub retains workflow metadata and logs, Cloudflare processes the feed-derived model input and output, Resend processes the recipient and complete message, and the receiving mailbox provider stores the delivered email. The workflow must never print the recipient, API key, complete candidate, or message body to logs and must not upload them as artifacts. See GitHub's [hosted-runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), Resend's [privacy policy](https://resend.com/legal/privacy-policy), and Resend's [legal and subprocessor index](https://resend.com/legal/).

## One-time owner setup

The research half retains the free pilot's Cloudflare configuration. Confirm—without exposing their values—that `CLOUDFLARE_AI_API_TOKEN` exists under GitHub **Actions secrets** and `CLOUDFLARE_ACCOUNT_ID` exists under **Actions variables**, following [One-time Cloudflare setup](free-pilot.md#one-time-cloudflare-setup). These are required in addition to the two new personal-delivery secrets; this guide does not assume any credential is already present.

### 1. Create the self-only Resend credential

Sign up for or open a Resend account using the exact mailbox that should receive the paper. The default `resend.dev` testing domain can send only to the email associated with that account; sending to anyone else requires a verified domain and is deliberately outside this owner-only design. Resend documents that restriction in its [`resend.dev` 403 guide](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

In the Resend dashboard:

1. Open **API Keys**.
2. Select **Create API Key**.
3. Enter the name `First Fold Personal Delivery`.
4. Select **Sending access**, not **Full access**. Do not grant management permissions.
5. Create the key and copy the `re_...` value immediately; Resend displays it only once. Its [API-key guide](https://resend.com/docs/dashboard/api-keys/introduction) describes the same permission choices.

Do not paste the key into chat, an issue, a pull request, a terminal command, a committed `.env` file, or a screenshot.

### 2. Add the two personal-delivery GitHub repository secrets

In `itworksinprod/first-fold`:

1. Open **Settings**.
2. In the left sidebar under **Security**, select **Secrets and variables**, then **Actions**.
3. Select the **Secrets** tab.
4. Select **New repository secret**.
5. Enter `RESEND_API_KEY` as the name, paste the `re_...` value into **Secret**, and select **Add secret**.
6. Select **New repository secret** again.
7. Enter `PERSONAL_PAPER_EMAIL` as the name, enter the one bare email address associated with the Resend account as the value, and select **Add secret**.

Do not use a comma-separated list, display-name form, `CC`, `BCC`, repository variable, or workflow input for the recipient. The workflow accepts one address only and never exposes a recipient input in **Run workflow**. GitHub's official [repository-secret instructions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets?tool=webui) show the same UI path. Secret values cannot be read back later; replace a secret if its value is uncertain.

Adding the secrets does not deploy the dispatcher. If the updated dispatcher is already deployed, adding both secrets enables delivery at the next eligible daily run automatically. Deploying while both personal secrets are absent is safe: each personal run records a neutral no-op and consumes no feed or AI usage. Configuring only one of the two personal secrets is unsafe partial setup, so the run fails and sends nothing. With both present, missing Cloudflare AI configuration is also a hard failure.

### 3. Deploy and verify the updated dispatcher

The dispatcher still uses its existing encrypted Cloudflare `GITHUB_TOKEN` binding to invoke GitHub's workflow-dispatch API. The token must remain repository-scoped to `itworksinprod/first-fold` with only **Actions: Read and write**. Do not add the Resend key or recipient to Cloudflare; those belong only in GitHub repository secrets.

After the personal workflow and dispatcher changes are reviewed on `main`:

1. Follow the test and Wrangler deployment procedure in the [Morning Press runbook](morning-press-runbook.md#deploy-the-external-morning-dispatcher).
2. Confirm the deployed Worker's Cron list contains exactly the four daily UTC companions above. Cloudflare recommends managing Wrangler-owned [Cron Triggers in Wrangler configuration](https://developers.cloudflare.com/workers/configuration/cron-triggers/) and notes that changes may take time to propagate.
3. Before relying on automation, run one permitted manual `on_time` test using the steps below.
4. At the next 5:05 AM Eastern event, verify a successful Cron Event in **Cloudflare → Workers & Pages → first-fold-morning-dispatcher → Triggers**, a corresponding **Send personal Morning Paper** run in GitHub Actions, and one received message.

Do not call the lane operational until that real scheduled run succeeds. The four Cron expressions are intentionally daily; the dispatcher's New York gate, rather than weekday-only cron syntax, keeps personal delivery daily while paid research and delivery remain weekdays only.

The dispatcher persists secret-free structured logs at full sampling. A failed
Cron Event records a sanitized stage such as `token-validation`,
`github-network`, `github-rate-limit`, or `github-response` and, when available,
the HTTP status. A successful dispatch records the returned GitHub run ID. These
records must not include the token, recipient, response body, or paper content.

## Manual run and same-day recovery

GitHub supports manual runs only for workflows with `workflow_dispatch`; its official [manual-run guide](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) illustrates the controls below.

### Normal `on_time` run

Use this to test or recover the normal window before it closes:

1. Open **Actions → Send personal Morning Paper**.
2. Select **Run workflow** and keep **Branch: main**.
3. Set `run_mode` to `on_time`.
4. Leave `trigger_source`, `scheduled_at`, `dispatch_key`, `backfill_date`, `backfill_reason`, and `backfill_confirmation` blank.
5. Select **Run workflow** between 5:00 and 5:59 AM `America/New_York`.

The workflow derives today's New York date itself and rejects an out-of-window manual `on_time` request. First inspect the day's runs and inbox: starting it after a successful delivery is unnecessary. If two same-day attempts reach Resend within its 24-hour idempotency window with the same payload, the key `first-fold-personal-YYYY-MM-DD` prevents a second delivery. Resend documents this behavior and its 24-hour window in [Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

### Same-day backfill

Use this only after the normal morning window was missed:

1. Open **Actions → Send personal Morning Paper → Run workflow** on `main`.
2. Set `run_mode` to `same_day_backfill`.
3. Enter today's New York date in `backfill_date` as `YYYY-MM-DD`.
4. Enter an 8–200 character, one-line operational explanation in `backfill_reason`.
5. Enter exactly `BACKFILL YYYY-MM-DD` in `backfill_confirmation`, using the same date.
6. Leave `trigger_source`, `scheduled_at`, and `dispatch_key` blank, then select **Run workflow**.

The backfill is allowed only from 6:00 AM through the end of that same `America/New_York` calendar date. It sends nothing for a past or future date, the wrong actor or repository, a non-`main` run, incomplete confirmation, or a reason outside the allowed shape. It records its actual execution time; it does not pretend to have run at 5:05 AM.

Never weaken research or validation to force a late email. If a run fails before the Resend request, inspect the sanitized failing step and correct the external condition. If the send response is ambiguous, first check the Resend dashboard. A same-day rerun keeps the same idempotency key: Resend can return the original result when the payload is unchanged, or reject a regenerated payload with HTTP 409, but it must not create a second same-day delivery. Once the New York date changes, let the next normal edition run; this MVP has no historical-email override.

## Failure and privacy posture

The lane sends nothing unless every prerequisite passes. Both personal secrets absent is the intentional disabled state, not an error. Once either secret is configured, expected fail-closed causes include:

- exactly one of `RESEND_API_KEY` and `PERSONAL_PAPER_EMAIL` is absent, or either configured value is malformed;
- both personal secrets are present but the Cloudflare AI account variable or token is absent or malformed;
- the recipient is not one bare email address or does not match Resend's self-only account address;
- required feed coverage, corroboration, publication dates, or reporting-window evidence is missing;
- Workers AI is unavailable, over quota, rejects the model, or returns output that fails schema, originality, length, source binding, or editorial validation;
- a citation is unsafe, unapproved, redirected, unreachable, or not bound to the exact dossier;
- HTML/text rendering cannot safely represent the validated candidate; or
- Resend rejects the one bounded send request before accepting it.

No send request is made before all research, validation, configuration, and rendering checks pass. A transport timeout after the one request begins can still leave acceptance ambiguous; the fixed same-day idempotency key is the recovery control for that boundary. There is no failure-notice email because email is the operation whose safety is uncertain. GitHub records the failed run; the owner must inspect Actions or add a separate, non-email monitor later. There is no automatic switch to the paid OpenAI workflow, no partial paper, and no fallback to the previous day's message.

“Sent only to me” describes the recipient boundary, not exclusive data possession. Public source metadata and generated summaries pass through GitHub Actions, Cloudflare Workers AI, Resend, and the receiving mailbox provider. Resend also receives the owner email address. Those services are independent processors or providers with their own logs, retention, subprocessors, security controls, and legal obligations. Do not put private notes, confidential business information, credentials, health data, or other sensitive personal data into prompts, feed configuration, edition copy, or the recipient field. Review the providers' current terms and privacy materials before enabling the lane; code-level non-persistence does not override provider retention.

In particular, Resend currently advertises 30-day data retention on its Free plan. Treat the complete delivered paper and recipient address as data processed outside the ephemeral GitHub runner, and recheck that policy on the linked [Resend pricing page](https://resend.com/pricing) before enabling delivery.

## Zero-dollar guardrail

One owner email per day is designed to fit current free allowances, but **$0 is conditional, not guaranteed**:

- Cloudflare currently gives Workers AI accounts 10,000 neurons per day at no charge, reset at 00:00 UTC. On Workers Free, operations beyond that allocation fail rather than become paid usage. The quota is shared with all other Workers AI activity in the account, and model eligibility, pricing, and limits can change. Keep the account on Workers Free, retain the fixed free-plan-compatible model, and check [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) before changing either.
- Resend's current Free transactional plan includes 3,000 messages per month and a 100-message daily limit. One personal paper is well below those numbers, but other account activity shares the limits. Keep the account on Free and review [Resend pricing](https://resend.com/pricing) before changing the sender or recipient design.
- Standard GitHub-hosted runners are currently free and unlimited for public repositories. Making the repository private or selecting a different runner can change Actions billing; consult GitHub's [hosted-runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

Do not enable a Workers Paid plan, prepaid AI Gateway credits, Resend paid plan, paid-only model, or paid fallback merely to keep delivery running. A quota failure must remain a failed run with no email until the owner deliberately reviews and authorizes a cost change.

## Emergency disable and rollback

For the fastest personal-only stop:

1. Open **GitHub → Actions → Send personal Morning Paper**.
2. Open the workflow options menu (`…`) and choose **Disable workflow**. GitHub documents this reversible control in [Disabling and enabling a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).
3. Cancel any personal run already in progress.
4. In Resend, revoke the `First Fold Personal Delivery` API key. In GitHub, delete or replace `RESEND_API_KEY` if compromise is possible.

Disabling only the GitHub workflow leaves paid Morning Press research and delivery available. The Cloudflare dispatcher may record a failed personal dispatch while the workflow is disabled, but it cannot send an email.

For a scheduler rollback while retaining the workflow for manual use, use **Cloudflare → Workers & Pages → first-fold-morning-dispatcher → Deployments** to roll back to the last known version before personal dispatch, or revert the reviewed dispatcher change and deploy it through the normal Wrangler procedure. Confirm that paid weekday 5:05 and 6:00 events still behave as intended after any rollback. Do not delete all Cron Triggers unless the goal is to stop the paid scheduler too.

To restore service, create a new sending-only Resend key if the old one was revoked, update `RESEND_API_KEY`, re-enable **Send personal Morning Paper**, redeploy the reviewed personal-aware dispatcher if it was rolled back, and repeat manual plus real-schedule verification. A disable, revocation, or rollback cannot recall an email already delivered.
