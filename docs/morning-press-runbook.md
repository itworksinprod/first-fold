# Manual paid Morning Press pilot runbook

This runbook covers the optional five-edition OpenAI-assisted pilot. It is a
**manual, explicitly billable path**: an operator must deliberately start each
research run in GitHub Actions. It is not dispatched by the morning scheduler,
and a Cloudflare-triggered request exits as a neutral no-op before checkout,
secret access, or API use.

GitHub Actions may research and prepare a proposed paper after that manual
start, but one authorized human remains the editor and must approve the exact
pull-request revision. The browser press desk is a review surface, not an
approval or publication system. No model, link check, or browser control
substitutes for the human review.

The zero-cost automatic Personal Morning Paper is documented separately in
[`personal-delivery.md`](personal-delivery.md). Do not add this paid workflow to
the Cloudflare schedule and do not use it as a fallback when the free lane
fails.

## Non-negotiable pilot boundary

- Automation may research, draft, validate, and open a same-repository pull
  request. It may not approve its own work or publish from its branch.
- This repository is public. A bot branch, proposed JSON, copy, and source links
  are publicly visible in its pull request before approval. They are not
  deployed or reader-facing in First Fold until the approval and delivery gates
  pass. The OpenAI credential remains secret.
- A generated canonical file is release-shaped (`status: "published"` with the
  intended publication time) so the release gate can test the exact final
  payload. That field does not mean the proposal has been approved. Approval is
  the authorized GitHub review of the exact current SHA.
- Only a bot pull request that is approved and merged to `main` counts. Manual
  editions, rejected or closed proposals, and failed runs do not count.
- Assisted proposals carry `provenance.automation.pilotSequence` from 1 through
  5. After sequence 5 is present on `main`, manual research must stop before
  calling the API and must not open a sixth proposal.
- A desk with no verified, consequential candidate stays quiet. The generator
  must never use a weak or unsupported story to fill a page.
- Automated `backPage.watchNext` remains empty because the v2 WatchItem cannot
  retain source and evidence mappings. Manual, human-reviewed editions may use
  the bounded list; the pilot may not publish an unauditable weak signal.
- A failure leaves the previous successful GitHub Pages deployment intact.
  After a clean build and test, an expected morning when today's canonical
  edition is absent and the archive is empty or strictly older than today is
  recorded as a neutral **Morning Press delivery — no action** result. A present
  draft, invalid or future-dated state, a test failure, a dispatch error, and
  other unsafe conditions still fail.
  Human-free merge and publication remain disabled throughout this pilot.

## One-time repository setup

### Protect the approval boundary

In GitHub's branch settings, protect `main`, require a pull request, require one
human approval, and dismiss stale approvals when new commits are pushed.
Restrict direct pushes and force-pushes to `main`, and do not grant Actions a
branch-protection bypass. The pilot merge workflow performs its own trusted
exact-SHA validation. Do not make ordinary pull-request CI from a
`GITHUB_TOKEN`-created bot proposal the pilot approval gate; it may not become
usable automatically.

Keep **GitHub Actions** selected as the Pages publishing source. The research
workflow may write only its dated `automation/morning-press-YYYY-MM-DD` branch
and bot pull request. Pull-request code must not receive drafting credentials.
Pages publication permission belongs only to the delivery workflow running from
`main`.

In **Settings → Actions → General**, allow GitHub Actions to create pull
requests. The GitHub setting mentions creating and approving pull requests, but
this pilot never permits the workflow to approve itself.

### Add the optional paid drafting credential

In **Settings → Secrets and variables → Actions**:

1. Follow the official [API quickstart](https://developers.openai.com/api/docs/quickstart)
   to create a dedicated API project/key and confirm API billing, then create a
   repository secret named `OPENAI_API_KEY` with that key.
2. Create a repository variable named `MORNING_PRESS_REVIEWERS` containing a
   comma-separated allowlist of GitHub usernames. Every listed reviewer must
   also currently have write, maintain, or admin permission to this repository.
3. Optionally create a repository variable named `OPENAI_MODEL`. If omitted,
   the pilot uses [`gpt-5.6-luna`](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

The API key is required only by this trusted, manually dispatched paid research
workflow. It is not needed by the scheduled personal lane, Pages, or readers.
Never put it in the repository, an edition, a
pull-request body, a Pages environment, browser JavaScript, screenshots, or
logs. Follow the official server-side
[API-key guidance](https://developers.openai.com/api/reference/overview#authentication),
use a project-scoped key, set an owner-defined spend limit and alert in the API
account, review usage after each run, rotate it if exposure is suspected, and
remove or disable it when the pilot ends.

The installed PWA and GitHub Pages hosting remain independent of this key. API
drafting is not free: Responses API tokens and web-search tool calls can incur
charges under [current API pricing](https://developers.openai.com/api/docs/pricing),
and a failed attempt may still consume usage. The five-edition stop is an
editorial boundary, not a billing guarantee. The research request uses
`store: false`; do not treat that flag alone as a Zero Data Retention promise.
Send only public source material and repository metadata. Source URLs, evidence,
and resulting copy become visible in the public repository pull request and
remain public after approval.

### Deploy the external morning dispatcher

GitHub's native cron is not the project clock. A scheduled-only Cloudflare
Worker dispatches the **free private Personal Morning Paper at 5:05 AM every
day** and the **model-free public Pages delivery gate at 6:00 AM on weekdays**.
It does not dispatch this paid OpenAI research workflow. This requires a
Cloudflare account and a GitHub account allowed to create a token for this
repository. No custom domain, KV namespace, or additional server is required.
The Worker uses four UTC Cron Trigger slots. Keep the account on Workers Free
and do not enable prepaid AI Gateway credits when the automatic path must remain
zero-cost.

1. In GitHub, create a fine-grained personal access token owned by
   `itworksinprod`. Limit **Repository access** to only
   `itworksinprod/first-fold`, grant only **Actions: Read and write** under
   repository permissions, choose an expiration that covers the bounded pilot,
   record that expiration in the private pilot log, set an owner reminder to
   rotate or remove it, and leave unrelated write permissions disabled. GitHub
   documents that
   [`workflow_dispatch` requires Actions write permission](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).
2. Test and deploy the versioned Worker:

   ```bash
   cd cloudflare/morning-dispatcher
   node --test test/*.test.mjs
   npx wrangler@latest login
   npx wrangler@latest secret put GITHUB_TOKEN
   npx wrangler@latest deploy
   ```

   Enter the fine-grained `github_pat_...` value only at Wrangler's local secret
   prompt. `GITHUB_TOKEN` is a Cloudflare encrypted secret binding; it is not
   the repository's automatic Actions token. Never paste it into chat, commit
   it, put it in `wrangler.jsonc`, expose it as a plain environment variable, or
   reuse it as `OPENAI_API_KEY`. If the shell has no `node`, use a trusted Node
   20-or-newer binary for the test command.
3. Keep the four UTC Cron Triggers in
   `cloudflare/morning-dispatcher/wrangler.jsonc`: `5 9 * * *`,
   `5 10 * * *`, `0 10 * * *`, and `0 11 * * *`. These are the
   daylight and standard-time candidates for 5:05 and 6:00 AM. The Worker uses
   each event's scheduled time in `America/New_York` and ignores the nonmatching
   UTC candidate, so daylight-saving changes do not double-dispatch a workflow.
   Personal email is selected at 5:05 every day. The public Pages delivery gate
   remains weekday-only at 6:00 and contains no model call. Paid OpenAI research
   is never selected.
   Cloudflare recommends managing Wrangler-owned
   [Cron Triggers in the Wrangler configuration](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
4. At the next trigger, verify a successful Cron Event in **Cloudflare →
   Workers & Pages → first-fold-morning-dispatcher → Triggers**, then verify
   the corresponding GitHub Actions run. Scheduled dispatches identify their origin
   with `trigger_source: cloudflare`, preserve the Cron event as a canonical
   `.000Z` ISO timestamp in `scheduled_at`, and use a New York date-scoped label:
   `personal:YYYY-MM-DD` or `delivery:YYYY-MM-DD` in `dispatch_key`. The 5:05
   event dispatches only `personal-morning-paper.yml`; the weekday 6:00 event
   dispatches `pages.yml` on `main` and additionally sets `recovery_reason` to
   `Cloudflare 6:00 AM ET scheduled delivery`. These public inputs provide
   correlation and are not credentials or authentication; the workflows also
   validate the GitHub actor, branch, date, and real operating window. A
   missing or non-`github_pat_` secret, a rejected GitHub response, or an
   unknown matching schedule must be
   treated as a Worker error rather than silently reported as delivery.

Cloudflare says new or changed Cron Triggers can take up to 15 minutes to propagate.
After deployment, keep the manual GitHub controls below available and verify a
real personal event and public delivery event. Do not
restore GitHub cron alongside the Worker: two active schedulers create duplicate
dispatches and make the audit trail ambiguous. Workers Free provides no
exact-time service guarantee. During this bounded pilot, the operator remains
responsible for checking Cron Events and GitHub Actions promptly, watching
the PAT expiration, and using the time-gated manual fallback when a dispatch is
missing. The dispatcher requires GitHub's correlated run-ID response and makes
one bounded retry for a network error or server error. It does not immediately
retry a rate limit. The repository workflows' concurrency groups serialize
ambiguous duplicate personal and delivery attempts. No dispatcher retry can
start an OpenAI call. Duplicate delivery remains serialized and each selected
`main` revision is tested.
Persisted Worker logs are enabled at full sampling and contain only the cron,
scheduled time, sanitized failure stage or HTTP status, selected dispatch names,
and returned GitHub run IDs. They must never contain the PAT or response body.

### Keep the prompt and provenance auditable

The authoritative instruction sources are
`lib/editorial/prompts/policy.ts` and
`lib/editorial/prompts/daily-run.ts`. The trusted generator reads their raw
UTF-8 text from `main` and supplies the actual run context separately; a literal
template placeholder inside the source file is not today's context. Change
either instruction source only through an ordinary reviewed code pull request,
never through the dated edition branch.

The model returns only `frontPage`, the four desks, and the allowed back-page
experiment. Trusted code composes the canonical identity, schedule,
publication-ready candidate state, empty Watch Next array, corrections, and
provenance. Keep the existing v2 `policyVersion`, `promptVersion`, and
`pipelineVersion` fields for backward compatibility. Trusted automation records
the model and response ID plus SHA-256 bindings for the complete prompt input
and structured-output schema. The source-check result, CLI-reported candidate
file digest, and reviewed Git commit add the remaining audit trail; the model
must not invent any of them.

## Manual paid candidate and weekday release

1. Let the reporting window close at 5:00 AM `America/New_York`. Do not start a
   normal edition from an incomplete window.
2. If the owner deliberately accepts OpenAI API charges for this comparison,
   open **Actions → Prepare Morning Press candidate → Run workflow** on `main`
   during the permitted New York research window. Leave Cloudflare audit inputs
   blank. The workflow resolves the date and next pilot sequence, and stops
   before an API call if sequence 5 is already on `main` or today's canonical
   file exists. A Cloudflare-triggered request always ends successfully with
   **Morning Press research — no action** before checkout, credentials, or API
   usage; it is not a recovery path.
3. The workflow runs:

   ```bash
   node scripts/automation/generate-edition.mjs "$EDITION_DATE"
   ```

   The command writes exactly `content/editions/$EDITION_DATE.json` with
   exclusive-create semantics in its clean checkout of `main`. It never
   overwrites a canonical file already on `main`.
4. The drafting instructions require web search for discovery, inspection of
   direct source pages, verification of publication or material-update
   timestamps against the half-open reporting window, and a mapping from each
   material claim to an included source. Deterministic QA confirms that cited
   URLs came from the run's web-search results and checks link safety,
   reachability, and evidence references; it does not record proof that the
   model read a page body. Search snippets and inaccessible pages are not
   acceptable evidence. Unknown timestamps stay `null`; URLs, facts, quotes,
   versions, CVEs, and dates are never guessed. The human verifies this work.
5. The generator considers every desk, preserves a null story with an honest
   final explanation when no candidate clears 70, leaves Watch Next empty,
   attributes company claims and allegations, and keeps recommended action
   proportionate to the evidence. It uses a back-page experiment only when the
   step follows from a selected story, introduces no new factual premise, and
   is low-risk and reversible; otherwise it uses `null`.
6. Schema, editorial, source-link, and pilot-provenance checks must pass before
   the workflow commits the file to `automation/morning-press-YYYY-MM-DD` and opens
   or maintains a regular pull request labeled `morning-press-bot`. A
   deliberate manual rerun may regenerate from the latest `main` and refresh
   only that bot pull request with exact-SHA force-with-lease. Any branch,
   author, base, label, file-set, or observed-head mismatch fails closed. The
   new SHA invalidates an earlier approval. The proposal is publicly reviewable
   but is not deployed.
7. Review the current pull-request SHA. Open every direct source and check:

   Download the `morning-press-YYYY-MM-DD-<full-head-SHA>` review artifact from
   the generation run linked in the pull-request body. Its full SHA must match
   the current pull-request head. The bundle is retained for seven days and is
   downloadable, not a hosted preview. After extracting it, serve the extracted
   folder locally, for example:

   ```bash
   python3 -m http.server 4173 --directory /absolute/path/to/extracted-bundle
   ```

   Open `http://127.0.0.1:4173/`, `/archive/`, and `/editor/`. Do not approve a
   preview artifact named for an earlier SHA.

   - reporting-window eligibility and any named material delta;
   - headline, deck, material claims, attribution, dates, and evidence mappings;
   - desk fit, duplicate events, repeated entities, AI adjacency, and story
     order;
   - security severity, affected scope, exploitation status, action, and any
     deadline;
   - quiet-desk explanations, the required empty Watch Next array, the
     back-page experiment, and the phone-sized reader/archive preview; and
   - `provenance.automation` (`workflow`, `runId`, `runUrl`, `candidate`,
     `generatedAt`, `pilotSequence`, `model`, `responseId`, `promptSha256`, and
     `schemaSha256`) plus a `passed` `provenance.sourceCheck` result, its
     `checkedAt` generation timestamp used by QA, checked-source count, and
     empty issues list.

   For this pilot, `warnings`, `failed`, and `not-run` all block approval and
   merge. There is no warning override. Replace or fix the inaccessible source,
   regenerate the proposal, and review the resulting new SHA.
   A `passed` link/source-structure check is necessary but does not establish
   that the claim, summary, attribution, or advice is true; the human source and
   copy review remains mandatory.

   In a private pilot log keyed by pull-request number and current SHA, record
   active review minutes, material corrections, replaced sources, quiet desks,
   and the approval decision. Start the review clock when the editor opens the
   sources and stop it when the decision is made; do not count time merely
   waiting in the queue. Keep reader identities and the API key out of the
   repository and workflow logs.

8. If anything changes, request a new automation run or reject the proposal; do
   not hand-edit its bot branch. Review the new head SHA and artifact from the
   beginning. If a human-authored correction is required, close the bot proposal
   and use a separate ordinary reviewed pull request. Never approve one SHA and
   then accept a different revision under that approval.
9. Submit an **Approve** review only when the current SHA is ready. **Merge
   approved Morning Press edition** verifies that the reviewer is listed in
   `MORNING_PRESS_REVIEWERS` and still has write, maintain, or admin permission, the
   reviewed SHA is still the pull-request head, the bot label/branch and pilot
   provenance are valid, and exactly one expected edition JSON changed. It also
   requires the exact-SHA success status created by the trusted research job,
   verifies that originating Actions run completed successfully from `main`,
   downloads that JSON at the reviewed SHA, reruns link/source QA, validates and
   tests it with trusted code from `main`, and then squash-merges that exact
   revision. The successful merge—not PR creation—consumes the pilot sequence.
10. At 6:00 AM, the Cloudflare Morning Press dispatcher calls
    `workflow_dispatch` for **Validate and deliver Morning Press** on `main`.
    The workflow rebuilds and retests the repository and deploys only when
    today's newest artifact is `published`. Only after checkout, dependency
    installation, build, and tests pass may an absent current-day canonical file
    become a neutral **Morning Press delivery — no action** result—and only when
    the built archive is empty or strictly older than today. It then skips
    packaging and deployment and leaves the previous Pages release intact. A
    present draft, invalid or future-dated state, or test failure remains a real
    failure. An approval
    merge at or after 6:00 AM explicitly dispatches delivery itself. Verify the
    Actions run and, when a paper was released, the live front page, dated URL,
    archive entry, source links, and phone layout. Add the delivery time,
    no-paper result, failures or corrections, and that run's API usage and cost
    to the private pilot log. Read usage and cost from the dedicated OpenAI API
    project's usage view; the candidate provenance does not record billing.

The external dispatcher replaces GitHub cron for the scheduled personal and
delivery workflows. It does not replace the explicit human start for this paid
research workflow.
GitHub documents that
[`schedule` events can be delayed or even dropped during high load](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
This repository observed it twice: the
[August 20 research run](https://github.com/itworksinprod/first-fold/actions/runs/32361020891)
and [August 21 research run](https://github.com/itworksinprod/first-fold/actions/runs/32474674192)
were queued for 5:17 AM but did not begin until about 6:52–6:53 AM New York
time. Their safety gate correctly rejected a late API call, and delivery then
had no current-day edition. That history is why paid research is now manual
only: no background scheduler can incur OpenAI usage. Keep the remaining time
gates. A manual request from an invalid window and any Cloudflare-triggered paid
request must exit before API use; delivery received before 6:00 AM must exit
without publishing. An unsafe current-day edition or a validation, credential,
build, or deployment problem remains a failure. A late approval of an already
prepared candidate must pass the same gates; do not bypass review to make the
clock.

## Rejecting or correcting a proposal

- Request changes when a supported correction is possible. A new commit makes
  the old approval stale and requires a fresh exact-SHA review.
- To ask the paid assistant for a new same-day candidate, open **Actions →
  Prepare Morning Press candidate → Run workflow** in a permitted manual window.
  Leave `trigger_source`, `scheduled_at`, and `dispatch_key` blank; those fields
  are validated Cloudflare audit metadata, not values for an operator to forge.
  The run can incur new API usage and will refresh only the correctly shaped
  existing bot pull request; verify its new artifact and SHA from the beginning.
- Remove a story or leave its desk quiet when its material claim cannot be
  supported. Do not “fix” an inaccessible source by citing a search result or
  copying another article's unsupported assertion.
- Close a bot pull request that is unsafe, stale, or unnecessary. A closed or
  rejected proposal does not consume its pilot sequence. For another same-day
  automation attempt, either reopen that exact expected pull request or, after
  recording its SHA, delete only its exact dated
  `automation/morning-press-YYYY-MM-DD` branch in GitHub. The workflow fails
  closed when the branch exists without its open pull request. Never delete
  `main` or a broad branch prefix, and do not assume branch deletion makes the
  already public proposal private.
- The generator refuses to overwrite an existing canonical file on `main`.
  Do not hand-edit the automation branch. A deliberate same-day research rerun
  may refresh only the expected bot branch with force-with-lease; review the
  resulting new SHA from the beginning. Use a separate reviewed correction path
  for human-authored changes.
- If a problem is found after publication, append a visible correction through
  a reviewed pull request. Do not rewrite history or directly edit generated
  `dist/` files.

## Emergency stop

To stop this paid pilot, disable **Prepare Morning Press candidate** in the
repository's Actions tab and delete the `OPENAI_API_KEY` repository secret.
Revoke the project key in the OpenAI API account when exposure is suspected or
a definitive billing stop is needed. Close any open bot proposal after
preserving the run URL and current SHA for the audit trail. These actions stop
new paid research; they do not erase an already public pull request, stop the
free Personal Morning Paper, or change the last successful Pages deployment.
Do not disable the Cloudflare Cron Triggers merely to stop OpenAI: the deployed
dispatcher does not call OpenAI and those triggers also operate the free
personal and public delivery lanes. Re-enable paid research only through an
explicit owner decision after the cause has been fixed.

## Dispatcher rollback and scheduled-lane fallback

If Cloudflare dispatch is missing or unhealthy, do not weaken the time,
approval, or publication gates:

1. In Cloudflare, disable the four Cron Triggers for
   `first-fold-morning-dispatcher`. If the token may be exposed, revoke it in
   GitHub first; install a replacement locally with
   `npx wrangler@latest secret put GITHUB_TOKEN` from
   `cloudflare/morning-dispatcher`.
2. Recover the private personal paper only with the time-gated manual or
   same-day-backfill procedure in
   [`personal-delivery.md`](personal-delivery.md#manual-run-and-same-day-recovery).
   Do not substitute the paid public workflow for a missed free personal run.
3. At or after 6:00 AM ET, use **Actions → Validate and deliver Morning Press →
   Run workflow** on `main`, leave the three dispatcher metadata inputs blank,
   and enter a concise `recovery_reason`. A genuinely absent current-day
   canonical file ends neutrally; a present unsafe file still fails.
4. Fix the dispatcher through a reviewed commit, run
   `node --test test/*.test.mjs` in `cloudflare/morning-dispatcher`, deploy it,
   and observe both the personal and delivery Cron Events before returning to
   unattended use.

For a longer rollback, leave the Worker triggers disabled and keep using the
documented personal and Pages recovery controls. Do not casually add a GitHub
`schedule` block to the paid workflow. If native cron is ever restored for any
scheduled lane, do it through a reviewed change and remove the corresponding
Cloudflare trigger first so only one scheduler is live. Disabling the Worker
does not remove an existing candidate, undo an approval, rewrite an edition, or
alter the last successful Pages deployment.

## Recovery publication

Use manual delivery recovery only after the 6:00 external dispatch was missed
or a real deployment failed; it is not a preview, approval, or early-publish
control. A neutral **Morning Press delivery — no action** result needs no recovery
unless a current-day canonical file was present or the built archive was not
strictly older than today.

1. Fix the edition or workflow through the same exact-revision pull-request path
   and merge the approved commit to `main`.
2. Open **Actions → Validate and deliver Morning Press → Run workflow**.
3. Select `main`; leave `trigger_source`, `scheduled_at`, and `dispatch_key`
   blank; enter a concise recovery reason; and run the workflow.
4. Confirm the packaged edition date and commit SHA in the logs, then verify the
   live paper and archive.

A manual run from another branch fails closed. A missing, stale, draft, invalid,
test-failing, or pre-6:00 AM New York recovery never reaches the deploy job.
Preserve failed-run logs, the pull-request SHA, and the recovery reason as the
audit trail.

## Stop after five and make an explicit decision

When `pilotSequence: 5` is merged, confirm the next research run exits before
an API call and creates no sixth bot pull request. Export the five pull-request
checklists, human edits, validation/source-check results, delivery times,
corrections, reader feedback, and API usage.

Full-auto publication is a **no** unless every criterion below is satisfied:

| Gate | Required result across the five manually started paid proposals |
| --- | --- |
| Source integrity | Every published material claim maps to an opened direct source; zero invented or broken citations and zero unsupported claims found during review. |
| Editorial safety | Zero critical factual corrections, wrong-window stories, duplicate events, disproportionate security actions, or filler used instead of a quiet desk. |
| Draft reliability | At least four of five need no material change to facts, sources, attribution, desk, or recommended action, and the final three require no such change consecutively. |
| Human burden | Median active source-and-copy review time is 15 minutes or less, using the editor's logged start and decision times rather than PR wall-clock waiting. |
| Operations | Five exact-SHA approval gates work, no proposal or secret reaches the First Fold deployment early, failures preserve the prior edition, and at least four editions are live by 6:05 AM ET. |
| Cost control | Per-edition and total API usage are recorded, remain inside the owner's written pilot budget, and the spend alert is verified. |
| Reader value | At least three of five target readers complete three or more issues and say the paper was worth six minutes and they would continue using it. |
| Recovery | The owner can stop research, revoke the key, issue a correction, and recover a failed delivery using the documented paths. |

If any safety, source-integrity, secret, or recovery gate fails, keep human
approval and fix the system before another pilot. If quality is promising but
the sample or timing is insufficient, extend the assisted workflow only through
a separately reviewed change with a new bounded count and budget. If every gate
passes, full auto is merely eligible for consideration: enabling it still
requires an explicit owner decision and a separate reviewed implementation with
monitoring, a kill switch, correction/unpublish handling, and a documented
rollback. Metrics never remove the human gate automatically.
