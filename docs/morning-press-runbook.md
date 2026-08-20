# Morning Press assisted-pilot runbook

This runbook covers the five-edition automatic-draft pilot. GitHub Actions may
research and prepare a proposed paper, but one authorized human remains the
editor and must approve the exact pull-request revision. The browser press desk
is a review surface, not an approval or publication system. After the source
and copy review, one submitted GitHub **Approve** review is the single human
authorization action; no model, link check, or browser control substitutes for
it.

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
- Automatic editions carry `provenance.automation.pilotSequence` from 1 through
  5. After sequence 5 is present on `main`, research must stop before calling
  the API and must not open a sixth proposal.
- A desk with no verified, consequential candidate stays quiet. The generator
  must never use a weak or unsupported story to fill a page.
- Automated `backPage.watchNext` remains empty because the v2 WatchItem cannot
  retain source and evidence mappings. Manual, human-reviewed editions may use
  the bounded list; the pilot may not publish an unauditable weak signal.
- A failure leaves the previous successful GitHub Pages deployment intact.
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

### Add the drafting credential

In **Settings → Secrets and variables → Actions**:

1. Follow the official [API quickstart](https://developers.openai.com/api/docs/quickstart)
   to create a dedicated API project/key and confirm API billing, then create a
   repository secret named `OPENAI_API_KEY` with that key.
2. Create a repository variable named `MORNING_PRESS_REVIEWERS` containing a
   comma-separated allowlist of GitHub usernames. Every listed reviewer must
   also currently have write, maintain, or admin permission to this repository.
3. Optionally create a repository variable named `OPENAI_MODEL`. If omitted,
   the pilot uses [`gpt-5.6-luna`](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

The API key is required only by the trusted research workflow, whether scheduled
or manually dispatched. Never put it in the repository, an edition, a
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

## Normal weekday release

1. Let the reporting window close at 5:00 AM `America/New_York`. Do not start a
   normal edition from an incomplete window.
2. At 5:17 AM on weekdays, **Prepare Morning Press candidate** checks out `main`,
   resolves the edition date and next pilot sequence, and fails before an API
   call if sequence 5 is already on `main` or today's canonical file exists.
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
   or maintains a regular pull request labeled `morning-press-bot`. A same-day
   rerun may regenerate from the latest `main` and refresh only that correctly
   shaped bot pull request with exact-SHA force-with-lease. Any branch, author,
   base, label, file-set, or observed-head mismatch fails closed. The new SHA
   invalidates an earlier approval. The proposal is publicly reviewable but is
   not deployed.
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
10. At 6:00 AM, **Validate and deliver Morning Press** checks out the latest
    `main`, rebuilds and retests it, and requires today's newest artifact to be
    `published`. Only then may it deploy GitHub Pages. An approval merge at or
    after 6:00 AM explicitly dispatches this delivery workflow; an earlier
    merge relies on the separate 6:00 schedule. Verify the Actions run, live
    front page, dated URL, archive entry, source links, and phone layout. Add the
    delivery time, failures or corrections, and that run's API usage and cost to
    the private pilot log. Read usage and cost from the dedicated OpenAI API
    project's usage view; the candidate provenance does not record billing.

GitHub scheduled runs can start late. Treat the scheduled times as the opening
of short operating windows, not exact-second guarantees. Research that has not
started before 6:00 AM must exit before an API call; do not create a nominal
6:00 edition after its publication time. A late approval of an already prepared
candidate must pass the same gates; do not bypass review to make the clock.

## Rejecting or correcting a proposal

- Request changes when a supported correction is possible. A new commit makes
  the old approval stale and requires a fresh exact-SHA review.
- To ask automation for a new same-day candidate, open **Actions → Prepare
  Morning Press candidate → Run workflow** after 5:00 and before 6:00 AM ET.
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

To stop the pilot before all five automatic editions, disable **Prepare Morning
Press candidate** in the repository's Actions tab and delete the
`OPENAI_API_KEY` repository secret. Revoke the project key in the OpenAI API
account as well when exposure is suspected or a definitive billing stop is
needed. Close any open bot proposal after preserving the run URL and current
SHA for the audit trail. These actions stop new First Fold research; they do not
erase the already public pull request or change the last successful Pages
deployment. Re-enable research only through an explicit owner decision after
the cause has been fixed.

## Recovery publication

Use manual delivery recovery only after a scheduled deployment was missed or
failed; it is not a preview, approval, or early-publish control.

1. Fix the edition or workflow through the same exact-revision pull-request path
   and merge the approved commit to `main`.
2. Open **Actions → Validate and deliver Morning Press → Run workflow**.
3. Select `main`, enter a concise recovery reason, and run the workflow.
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

| Gate | Required result across the five automatic editions |
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
