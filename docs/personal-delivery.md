# Personal Morning Paper delivery

The Personal Morning Paper is the repository's only automatically researched
edition. At **5:05 AM `America/New_York` every calendar day, including
weekends**, Cloudflare dispatches one owner-only GitHub Actions job. That job
reads current items from the curated feed catalog, optionally discovers more
articles through Tavily web search, and attempts at most 24 distinct publisher pages
across the edition's research attempts. The fixed free-tier Cloudflare model
`@cf/meta/llama-3.3-70b-instruct-fp8-fast` gets at most four calls per edition:
assess importance/usefulness, write specific source-grounded summaries, optionally
revise locally rejected drafts once, and check the final summaries against the evidence.
It validates the result and sends it to one email
address through Resend. The delivered paper adapts to
the number of stories that clear the unchanged editorial gates: regular with
two to four stories, slim with one, or quiet with zero.

This automatic path does not call OpenAI and has no paid fallback. Optional
web discovery searches beyond the feed catalog, but admission remains restricted
to the existing reviewed publishers and verified publisher pages. The separate OpenAI Morning Press generator remains
available only as a deliberate manual, billable experiment. The separate Free
Morning Press comparison also remains manual and keeps its stricter comparison
rules.

The lane is not live merely because its files exist on `main`. Do not record a
successful setup until a manual run and a real 5:05 AM scheduled run have both
succeeded end to end.

## Hard boundary

Keep the Cloudflare account on **Workers Free** to enforce zero inference
spending. Workers AI includes a daily free allowance; on Free, exhaustion rejects
calls and this pipeline keeps its deterministic source-bound fallback. This is
not Mac-local inference; the optional [Mac-local model preview](local-model-preview.md)
is a separate manual workflow. A Workers Paid account can
incur overages from account-wide use, so request caps alone are not a billing
guarantee. No code here enables a paid plan or calls OpenAI.

Tavily search is optional and disabled without its dedicated key. Before search,
the adapter checks `/usage` for the free Researcher plan, no pay-as-you-go usage,
and a provider-enforced key limit no greater than 900 monthly credits. A zero
pay-as-you-go limit is accepted. An explicit `null` limit is accepted only with
the operator verification described below and exactly 1,000 free plan credits;
missing, positive or malformed limits remain rejected.
If any check or provider call fails, feed research remains available; no paid
search, extraction, crawl, or research fallback is invoked.

The owner-only **Check free paper quality (no email)** workflow performs live
research, writing, evidence review and rendering using the existing credentials.
It does not send mail, change the repeat ledger, publish a paper, or archive
article text. Public logs contain only stage/status/count diagnostics. It uses
an isolated empty test ledger, so it is not a replay of personal repeat filtering.
It can be started manually and also runs when its own workflow file changes on
trusted `main`, providing a live integration check for its initial rollout.

| Property | Personal Morning Paper |
| --- | --- |
| Schedule | 5:05 AM `America/New_York` every day, including weekends |
| Reporting window | The 72 elapsed hours ending at 5:00 AM New York time on the edition date; start inclusive and end exclusive |
| Discovery | Live allowlisted feeds plus optional free Tavily searches beyond feeds. At most 16 search-page fetches share the existing 24-article budget across the edition. Only reviewed publisher pages with verified dates, identity, and article text enter the unchanged selection gates |
| Drafting | Up to four fixed-model calls: editorial assessment, concrete factual writing, one optional revision of locally rejected drafts, and a separate evidence-checking prompt. No transport retries or repeated revision loop. Rejected or unavailable synthesis retains the deterministic source-bound fallback |
| Completion rule | Deliver a regular edition with two to four validated stories, a slim edition with one, or a healthy quiet edition with zero; every edition keeps all four desks and no desk receives more than one story |
| Recipient | Exactly the one address stored in `PERSONAL_PAPER_EMAIL` |
| Sender | `First Fold <onboarding@resend.dev>`, Resend's self-only testing sender |
| Message | Static, escaped HTML plus an equivalent plain-text part; no client-side JavaScript |
| Repository permissions | Read-only contents and Actions metadata; no pull-request, branch, commit, Pages, or public-content write permission; the workflow may download its bounded private-state ledger and upload only that ledger plus a separately validated public-safe diagnostic report |
| Persistence | The candidate remains on the ephemeral runner; a keyed-HMAC-only ledger artifact retains bounded repeat state for 35 days, while an optional source-health artifact retains only public-safe operational counts for 14 days. Optional feedback stores one minimal response in D1, never the recipient, raw token, headline, story copy, or source URL |
| Quiet edition | Healthy, internally consistent research with zero qualifying stories produces a deterministic all-quiet paper and research receipt without a model call; it is delivered and recorded in the ledger |
| Failure | Feed coverage, repeat-ledger, source, canonical schema, rendering, required configuration, or send-precondition errors remain failed runs and send no email. Quota, transient provider, or model-output rejection uses the deterministic source-bound fallback. Missing or broken advisory feedback and source-health reporting do not block an otherwise valid delivery |
| Feedback | Optional signed story and edition links accept one private, human-reviewed response for 14 days. Feedback never changes scores, thresholds, vetoes, desk assignment, sources, or automation by itself |
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
   instructions. With a configured free Tavily key, four broad searches give
   every desk an opportunity, then adaptive slots prioritize missing
   corroboration, desk gaps and fresh reviewed-publisher leads. Remaining slots
   cover unused broad angles, up to twelve searches total. No hard-vetoed
   promotion or rumor receives a follow-up. The bounded query plan and results
   are cached across the optional research retry, not spent again.
   Every query uses Tavily's explicit `include_domains_mode: "filter"` with
   the exact article hosts derived from the checked-in publisher registry.
   All reviewed hosts remain available to every desk's query, including
   independent reporting and cross-topic corroboration. This uses the same
   request/credit budget; provider filtering never replaces local URL checks.
   Search titles, snippets, and dates are discovery hints, never factual evidence.
   Admission requires an existing reviewed publisher, a directly fetched page,
   consistent page/canonical identity, publication metadata inside the same
   reporting window, and usable article text. Unknown publishers do not enter
   automatically, and a feed/search duplicate earns no second source vote.
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
6. The edition can attempt 24 distinct shortlisted publisher pages over pinned public DNS,
   with reviewed exact hosts, bounded redirects, deadlines, and 600 KB compressed
   and decompressed limits. Search admission can consume at most 16 of those
   shared slots, leaving at least eight available for feed enrichment. Each page
   operation allows at most one redirect, so the 24-page cap permits at most 48
   HTTP hops, not unlimited redirect chains. Feed enrichment and research retries
   reuse the same bounded fetch cache. Only article regions are extracted.
   Extractive selection reads across the size-bounded region, retaining complete
   relevant blocks and nearby conditions instead of stopping at a 5,000-character
   prefix. It still emits at most 5,000 characters. Writer packets favor an
   originating and a distinct independent publisher when available, with at most
   two sources, 5,800 characters and forty passages per source. Source text stays
   untrusted data; this does not add publishers, fetches or model calls. The importance
   and usefulness assessment uses one bounded model request shared across both
   research attempts; any cached assessment is tied to an exact evidence digest.
   It cannot rescue hard vetoes, weak source evidence, repeats or insufficient
   topicality. Source strength, freshness, desk relevance, score weights, the
   70-point threshold and originating-source component floors remain local.
   If the first healthy pass selects fewer than three stories, the job makes one
   bounded research retry. Both attempts use the same reporting window, cutoff, source
   allowlist, and editorial rules. The retry replaces the first snapshot only
   when its deterministic selected slate contains more qualifying stories; the
   job never merges candidates or feed state across attempts. A failed initial
   coverage check is still a hard failure. If the optional retry loses coverage,
   the already validated first snapshot remains the complete research record.
7. The chosen intact snapshot produces one of three formats: a regular edition
   with two to four stories, a slim edition with one story, or a deterministic
   all-quiet edition with zero. A zero-story edition skips Workers AI and states
   how many reviewed feeds completed plus why nothing cleared the unchanged
   threshold. For one or more stories, local code builds a validated baseline.
   The writer can replace headline, deck, factual summary, implications and
   watch items. Each factual claim must cite a locally assigned passage ID bound
   to an exact factual source excerpt. Local checks enforce length, numeric/version
   anchors, attribution, originality and safe text. A claim's numbers and
   versions must appear in its actual cited passages, not elsewhere in the
   dossier. A separate prompt to the same model then checks every draft's
   factual support, caveats, attribution and reader value, returning explicit
   support IDs for both claims as well as the exact draft hash. This is not
   an independent second model or an external fact checker.
   Provider field bounds are also enforced locally. Reader prose containing JSON
   field spillover, repeated serialization fragments or unfinished sentences is
   rejected before that model review. A bounded lexical guard additionally checks
   Secure Boot prerequisites for firmware-execution claims, explicit uncertainty
   about exploitation, and unsupported fix-version claims. These are specific
   regression defenses, not a general semantic fact checker.
   Only explicitly approved exact draft hashes are adopted, independently per
   story. Source metadata, timestamps, desks, event identities and scores are
   locally owned. The edition mode `source-grounded-summary` means at least one
   story passed both writing checks; other stories may retain the baseline.
   This is a quality check, not proof of factual truth or independent reporting.
   Checked private summaries may be 100–225 body words. The private local
   fallback is a visibly labeled **Source digest**, allowed 60–225 words with no
   word-count padding. Its short source excerpt stays attributed, and fixed
   event-specific questions distinguish what to investigate from what is known.
   Only exact locally reconstructed briefs with the private provenance marker
   receive this format; model output cannot claim it by inventing an ID.
   Public editions retain their existing 150–225-word contract. Shortening a
   fallback does not reduce story-selection thresholds or factual requirements.
8. Each selected story receives a trusted validation receipt containing its total score,
   five component scores, required threshold, evidence tier, and factual source
   and publisher counts. The email renderer recomputes and validates that receipt
   rather than trusting model-controlled display text.
9. After all deterministic checks pass, the workflow records the delivered
   edition and only the domain-separated HMAC-SHA-256 fingerprints of any
   selected stories, keyed by the existing Workers AI token, then stages that
   immutable ledger as an artifact
   before delivery. It then sends one escaped HTML and plain-text message through
   Resend. Both rendered formats must retain the validated paragraphs exactly and
   pass a final copy-integrity check, including after any preview wrapper. Bad copy
   is rejected, never silently stripped into a supposedly verified story. A later
   run trusts the staged artifact only when GitHub records that
   run's exact send step as successful; artifacts from unsent runs are ignored.
   This ordering prevents an artifact-service failure after delivery from losing
   the repeat state. The workflow makes no commit, branch, pull request, Pages
   dispatch, or public archive change, and never uploads the candidate or email
   body. Separately, the generator renders a public-safe source-health snapshot
   outside the checkout. The workflow revalidates its exact JSON and HTML before
   offering only those two files as a uniquely named 14-day diagnostic artifact.
   A missing, malformed, or failed diagnostic upload is reported but cannot
   suppress the email. When the optional feedback Worker is configured, the
   final send step also adds signed review links; those credentials exist only
   in that final step.

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
research-attempt count and outcome, evidence policy, validation receipts,
repeat-ledger digest and counts, and zero through four selected stories. It
contains no recipient or API credential. An optional `webSearch` receipt records
only the provider, query count, conservative `creditsReserved`, and admitted
article count. Reservations are upper bounds, not billing claims. The research
method becomes `curated-live-feeds-and-web-search` only when a publisher article
was admitted, not merely because search was attempted. The email shows a short
web-discovery count without adding snippets or provider responses. The
distinction is intentional: a file prepared for a private email must never
become a public publication candidate merely because its shape is similar.

The private candidate and email body are still ephemeral, but duplicate control
now persists a bounded keyed-HMAC-only ledger named
`personal-repeat-ledger-v1`. The
ledger covers exactly the previous 30 calendar dates and stores only
domain-separated HMAC-SHA-256 fingerprints derived from event identity, factual
source URLs, strong vulnerability identifiers, canonical entities, and title
tokens, plus bounded counts and score metadata. It does not retain cleartext
headlines, copy, URLs, publishers, CVE or GHSA identifiers, recipients, or Resend
IDs. It also stores a one-way key check so a missing or rotated token cannot
silently disable repeat matching. The token itself and reusable unkeyed identity
hashes are never stored. Because this repository is public, treat workflow
artifacts as potentially readable by repository visitors even though their
contents are pseudonymous.
An all-quiet delivery still adds its edition date and advances the lifetime and
first-five-pilot counts, but its `stories` list is empty because there are no
story identities to retain.
Same-day workflow and Resend idempotency remain a separate defense against a
second delivery for one edition date.

Ledger schema 2 introduced keyed fingerprints. During that one-time upgrade, a
structurally valid schema-1 artifact is replaced with an empty keyed ledger while
preserving only its lifetime edition count; the old unkeyed story hashes cannot
be securely transformed and are discarded. A later Workers AI token rotation
does not auto-reset state: its key check fails closed so an operator can make a
deliberate recovery decision rather than silently losing the 30-day repeat
window.

Ledger artifacts are retained for 35 days. If the paper has not sent for longer
than the 30-day repeat window and every old artifact has expired, the next run
may bootstrap without stale fingerprints while reconstructing enough trusted
workflow history to preserve whether the first-five pilot is complete. A
missing or expired artifact for a delivery still inside the 30-day window
remains a hard failure.

GitHub-hosted runners are ephemeral, but the complete transaction is not
retention-free. GitHub retains workflow metadata and logs; Cloudflare processes
the bounded research request and response; optional Tavily discovery processes
public news queries; Resend processes the recipient and
message; and the mailbox provider stores the delivered email. If feedback is
enabled, Cloudflare also processes the form request and D1 stores its minimized
review record. The workflow must
not print the recipient, API tokens, candidate, or email body to logs and must
not upload them as artifacts. Only the bounded keyed-HMAC ledger and the
separately validated public-safe source-health JSON and HTML may be uploaded. See
GitHub's
[hosted-runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
Cloudflare's [privacy policy](https://www.cloudflare.com/privacypolicy/), and
Resend's [privacy policy](https://resend.com/legal/privacy-policy).

## First-five quality pilot and advisory feedback

The first five successfully sent editions are labeled privately as **Quality
pilot · Edition N of 5**. Review each received paper for importance, relevance,
source quality, reader usefulness, freshness, desk assignment, and repeat
accuracy. Record false positives, missed stories, and any claim that needed
correction. A successfully delivered
regular, slim, or quiet edition each advances this count once.

When private feedback is enabled, every populated story has **Review this
story**, and every edition has **Review this edition** and **Report a missed
story**. The categories are Useful, Not relevant, Repeated, Wrong desk, Missed
story, and Correction. Opening a link does not submit anything: the signed
token stays in the URL fragment, the form removes it from the visible address,
and a deliberate submit click is required. The token is scoped to one edition
or story, expires exactly 14 days after generation, and is stored only as a
SHA-256 digest after a successful response.

The D1 row contains only the token digest, edition date and issue number, scope,
bounded story ID and desk when applicable, category, a bounded note, and a
creation timestamp. It contains no recipient, raw token, headline, story copy,
source URL, user agent, or application-recorded IP address. The Worker exposes
no read or export route; the owner reviews rows deliberately in Cloudflare D1.
Because notes persist until the owner deletes them, do not enter email
addresses, links, confidential information, or other sensitive data.

This is an evidence-gathering loop, not an automatic optimizer. No feedback row
can trigger research, edit policy, lower a threshold, publish content, or send
email. After enough observations, a human may propose a reviewed code or policy
change.

After five reviewed deliveries, summarize the evidence and propose any weight,
threshold, or veto changes for explicit owner approval. Do not tune the policy
automatically from five observations and do not weaken a threshold merely to
fill a desk.

## Source-health diagnostics

Generation receives `PERSONAL_SOURCE_HEALTH_ROOT` only for its own step and
writes under the GitHub runner's temporary directory, never the repository.
Each attempt reports checked-in source IDs and publisher labels, safe status and
failure codes, parsed and eligible item counts, rejection counts, desk coverage,
retry outcome, and selected counts. It excludes feed and article URLs, raw feed
or article text, story identifiers, recipient data, model responses, provider
IDs, hashes, and secrets.

The generator adds a compact Markdown view to the GitHub run summary. The
workflow then independently validates `source-health.json` and confirms that
`source-health.html` is byte-for-byte the trusted renderer's output. Only those
two files are uploaded as
`personal-source-health-<run-id>-<edition-date>` for 14 days. The Markdown file,
candidate, email, ledger, and credentials are not included in that artifact.
Because this is a public repository, the report is deliberately public-safe and
must be treated as readable by visitors.

Open the artifact's HTML file for the per-attempt source and desk dashboard.
This report is diagnostic only: it cannot participate in story selection or
change delivery. If capture, validation, or upload fails, the summary says it
is unavailable and the valid paper continues.

## One-time owner setup

The automatic lane uses one required repository variable and three required
repository secrets. Web discovery and private feedback each add one optional secret; the feedback
Worker URL is fixed in the final email step:

| Name | GitHub type | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Actions variable | Account whose Workers AI free allocation is used |
| `CLOUDFLARE_AI_API_TOKEN` | Actions secret | Narrow token allowed to call Workers AI and the HMAC key for repeat identities |
| `RESEND_API_KEY` | Actions secret | Sending-only Resend credential |
| `PERSONAL_PAPER_EMAIL` | Actions secret | One self-only recipient address |
| `TAVILY_API_KEY` | Actions secret, optional | Dedicated free-search key with a provider-enforced monthly cap of 900 credits |
| `TAVILY_PAYGO_DISABLED_VERIFIED` | Actions variable, optional | Exact `true` records an operator's verification that the Tavily billing dashboard says PAYGO is disabled; required only when `/usage` reports a null PAYGO limit |
| `PERSONAL_FEEDBACK_SIGNING_KEY` | Actions secret, optional | Dedicated 32-byte-or-longer key shared only with the feedback Worker |

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

### 3. Optionally enable private feedback

The feedback service is isolated in `cloudflare/feedback-worker`. It has one D1
binding, `DB`, and one runtime secret, `PERSONAL_FEEDBACK_SIGNING_KEY`. It has no
Workers AI, GitHub, Resend, recipient, or publishing credential.

The reviewed service is deployed at
`https://first-fold-personal-feedback.h-josue122.workers.dev/`, and that exact
HTTPS root is fixed in the workflow's final send step. It is not a repository
variable or workflow input, so an untrusted dispatch cannot redirect signed
links to another host.

Create a dedicated high-entropy signing key of at least 32 bytes and retain it
in a password manager. Use the same value for the Worker's interactive secret
and the GitHub Actions secret; never place it in `wrangler.jsonc`, a shell
command argument, a committed file, a screenshot, or a log.

The database ID is already bound in the reviewed `wrangler.jsonc`. To apply the
checked-in migration and redeploy that same service from
`cloudflare/feedback-worker`, run:

```bash
NODE_USE_SYSTEM_CA=1 npx wrangler@latest d1 migrations apply first-fold-personal-feedback --remote
NODE_USE_SYSTEM_CA=1 npx wrangler@latest secret put PERSONAL_FEEDBACK_SIGNING_KEY
NODE_USE_SYSTEM_CA=1 npx wrangler@latest deploy
```

The secret command prompts for the value without putting it in command history.
In GitHub Actions, create the secret `PERSONAL_FEEDBACK_SIGNING_KEY` with that
same value. There is no feedback URL variable to create.

The GitHub secret is optional. If it is absent or invalid, the email still sends
without feedback links and the GitHub summary says feedback is disabled. The
secret and signed tokens are never printed. Rotating the key immediately
invalidates every outstanding link.

### 4. Deploy and verify the dispatcher

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

### 5. Optionally enable free web discovery

This integration is not enabled merely by adding its code. Complete account
setup and a live no-email check before describing search as operational:

1. Use a Tavily **Researcher** account with the monthly free allocation. Keep
   pay-as-you-go disabled. Verify the billing dashboard explicitly says
   **Pay as you go: Disabled**. When `/usage` reports `paygo_limit: null`, set
   repository Actions variable `TAVILY_PAYGO_DISABLED_VERIFIED` to exact `true`
   to record that verified setting. Null alone is not proof that billing is off;
   this compatibility path still requires exactly 1,000 plan credits, zero
   `paygo_usage`, the dedicated key cap, and sufficient remaining free credits.
   Recheck or clear the attestation after any account, key or billing change.
2. Create a dedicated **First Fold** API key and set its provider-enforced
   monthly usage limit to **900 credits**. An unlimited key is rejected even on
   a free account. Do not reuse this key for another application.
3. Store the value in **GitHub → Settings → Secrets and variables → Actions →
   Secrets** as `TAVILY_API_KEY`. Do not paste it into chat, logs, or repository
   files. The adapter checks account and key limits through Tavily's
   [usage endpoint](https://docs.tavily.com/documentation/api-reference/endpoint/usage)
   before making a search request.
4. Run the owner-only, manual `.github/workflows/web-search-quality-check.yml`
   workflow on `main` to test discovery, page admission, drafting, validation,
   and rendering without sending email. It does not change the recipient,
   schedule, repeat ledger, or public paper. Review its safe counts rather than
   treating a passing feeds-only run as proof that search worked.

Tavily currently includes **1,000 free credits per month**; advanced search uses
two credits per query. The bounded adaptive plan of up to twelve searches reserves at
most **24 credits per run**, or **744 credits for 31 daily runs**. Manual tests
and extra runs share the dedicated key's 900-credit monthly cap. The provider
limit, rather than an in-memory counter alone, constrains repeated runs. See
[Tavily's current credit pricing](https://docs.tavily.com/documentation/api-credits).

Reviewed-domain targeting uses the documented `include_domains` filter, not
an extra crawl, extract, or model request. The serialized search request is
bounded to 4,096 bytes to fit the fixed host list and a maximum-length query.
See [Tavily's search parameters](https://docs.tavily.com/documentation/api-reference/endpoint/search).
The [September 12 source review](source-discovery-review-2026-09-12.md) records
new feed checks and sources deliberately not admitted. Model availability is
a separate dependency: better search does not fix a Workers AI quota or
provider failure, and no paid fallback is enabled.

The verification variable is an operator attestation, not a live provider
guarantee. `/usage` does not document null as disabled PAYGO. Other applications
share the free allowance, so do not enable PAYGO: a key cap alone cannot prevent
charges if account billing is later enabled and other keys consume free credits.

A missing key, changed/unverifiable plan, exhausted allowance, or provider error
leaves the feed pipeline available with its existing quality gates. Search does
not authorize adding unreviewed publishers, accepting snippets as evidence,
lowering the score threshold, or increasing the four-call Cloudflare budget.

## Manual run and same-day recovery

### Owner-requested September 13 preview

The separate `personal-preview.yml` workflow fulfills the owner's explicit
request for one additional demonstration email on September 13, 2026. It is
owner-only on trusted main, rejects rerun attempts, and expires at midnight
Eastern. It performs fresh free research using an isolated empty repeat ledger
and sends only when every selected story has a checked source-grounded summary.
The latest explicitly requested demonstration includes free web discovery and
requires a valid receipt with at least one publisher article admitted. Its
confirmation is exactly `SEND CHECKED SUMMARY PREVIEW 2026-09-13`, the subject begins
`[Updated preview]`, and both message parts explain the comparison context.
It uses the existing recipient secret and fixed Resend key
`first-fold-personal-preview-checked-summary-upgrade-2026-09-13`, distinct from both
the already-sent original preview and the daily edition, with no send retry.
The workflow is manual-only; publishing its code does not send an email.
It never changes daily duplicate protection,
the private repeat ledger, the schedule, or any public edition. It has no cron
trigger. No additional preview is authorized after the fixed date.
This preview tests the allowlisted Cloudflare-hosted GPT-OSS writer before changing the daily
writer. The older September 11 and historical-preview grants remain expired.
The profile permits one 3,000-token draft request, one optional 2,400-token repair,
and one 2,400-token review, using low reasoning and JSON schema mode. This preserves
the 7,800-output-token ceiling with three writing calls, or four including assessment.
The Qwen experiment remains available only to the separate no-email checks; it
did not pass the September 13 preview requirements and is not the daily writer.
Both call count and total output allowance are locally enforced. It never retries
a quota, credential or transport failure, or switches to a paid model.

### Reader-facing quality safeguards

Checked summaries must be self-contained: a named subject, an actual development,
an evidence-supported consequence, and a specific next signal. The local copy
gate rejects disconnected quotation headlines and known generic source-lead filler;
the semantic reviewer must also judge usefulness and specificity. Source, citation,
originality, numeric, caveat and completeness checks remain separate and mandatory.

Private source-digest fallbacks now render as **source links**, with original linked
titles and an explicit summary-unavailable label. They do not reuse disconnected
excerpts or generic advice as article sections and are not labeled regular editions.
Two related publisher accounts do not automatically produce an independent-verification
label: checked claim IDs and their exact cited source coverage determine the narrower
reader-facing description. Editorial score weights and thresholds are unchanged.

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
- a hard editorial veto, score below 70, recent-repeat match, missing validation
  receipt, or receipt mismatch;
- a missing, malformed, key-mismatched, ambiguous, or untrusted repeat-ledger artifact after the
  guarded bootstrap run;
- an unknown Workers AI configuration or credential error that prevents the
  fixed account boundary from being established;
- an unsafe, stale, unreachable, unbound, or insufficient source;
- a critical or independent claim lacking independent evidence;
- schema, word-count, temporal, duplicate, desk, evidence, or provenance
  validation failure;
- a candidate or message that cannot be rendered safely; or
- Resend rejecting the single bounded request.

An absent or invalid optional feedback configuration, an unavailable
source-health snapshot, or a diagnostic artifact upload failure is not a paper
failure. Those facilities are strictly downstream and advisory; they never
relax a research or editorial check.

A healthy zero-story result is not an error: it sends a clearly labeled quiet
edition only after complete feed coverage and deterministic validation. An
actual error never disguises itself as that quiet result and never sends
yesterday's paper, an unvalidated partial edition, an unverified feed summary,
or a paid-model fallback. There is no failure-notice email because email is the
operation being protected; inspect GitHub Actions or use a separate non-email
monitor.

“Sent only to me” describes the recipient boundary, not exclusive data
possession. Send only public source material. Never add confidential business
information, credentials, health data, private notes, or other sensitive data
to prompts, candidate copy, or the recipient field.

## Zero-cost guardrail

Keep the Cloudflare account on **Workers Free** and do not enable prepaid AI
Gateway credits. Cloudflare currently includes **10,000 Workers AI neurons per
account per day** at no charge. On Workers Free, exhausting that allocation
makes the optional inference fail; this workflow then sends the deterministic
source-bound fallback instead, not a Mac-local model edition. It must not switch
to a paid model or provider.
Other Workers AI activity on the same account shares the daily allocation, so
no code can guarantee model-assisted guidance for the paper if another job
consumes it first. Check Cloudflare's current
[Workers AI pricing and free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/)
before changing plans or models.

The automatic workflow fixes the model to `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; there is no
model override. It is a Meta Llama model hosted by Cloudflare Workers AI and
does not use an OpenAI API key or OpenAI API billing account.
One edition permits at most four model requests: editorial assessment (2,000
output tokens / 65 KB request), writing (4,000 tokens / 70 KB), one optional
revision (3,000 tokens / 70 KB), and checking (800 tokens / 70 KB).
If the initial writer returns a recognized invalid editorial format, the same
single revision slot can request a fresh complete JSON response. This consumes
the slot: it never permits a further local-copy repair, retries quota/authentication
errors, or skips the final checks. Invalid output itself is never salvaged.
Revisions preserve the same source, numeric, attribution, originality and length
checks, and only the final, hashed draft can pass the separate semantic review.
The September 11 malformed-email regression runs without contacting any provider.
The writer uses one consistent character/whole-body length contract, without
conflicting per-field word quotas. The one existing revision receives the exact
failed field, bound, caveat or citation diagnostic; it can also recover a missing
story, but cannot create another revision slot.
An AI review returning all approval flags cannot override the deterministic copy
or source-caveat vetoes. The manual no-email quality workflow reports success only
after its story and final-render assertions pass; it does not certify factual
truth or guarantee a model-written edition when free quota is exhausted.
Each request has one attempt and a 90-second timeout. The optional
second research pass shares the same one-call assessment budget. These are
capacity guards, not permission to spend beyond the free allocation.

### Quality checks without email

`npm run quality:offline` runs a synthetic four-desk editorial evaluation pack.
It checks accepted useful copy against deliberate JSON corruption, fabricated
figures, wrong-passage citations, omitted security conditions, false independence
and generic text, plus actual rendered-copy integrity. It uses no network,
provider quota or email and reports named failures instead of a misleading
"paid-quality percentage."

The manual owner-only **Check free writer on synthetic stories (no email)** workflow exercises the
real fixed free model against those synthetic sources at any time of day. It
permits only the existing writer/optional-repair/reviewer calls, has no search
or delivery credentials, saves no raw model output, and requires all four
synthetic stories to pass for green. It is not today's edition and does not
test real-news discovery or delivery. The separate full discovery quality
workflow tests the complete private candidate and rendered email in its normal
edition window, also without sending. Live checks share the account's free
allowance; do not repeatedly rerun a quota failure.

Neither test proves paid-model parity. Review live editions for factual accuracy,
importance, relevance, usefulness, freshness, desk placement, missed stories and
repeats before proposing changes to score weights or thresholds.

Keep Resend on a free plan appropriate for one daily self-only message and keep
the repository public if relying on public-repository GitHub Actions usage.
Pricing and free limits can change, and other account usage shares them, so
review [Resend pricing](https://resend.com/pricing) and GitHub's
[Actions billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
before changing either account. A provider limit remains a failed run with no
email; it never authorizes spending.

The optional feedback Worker and D1 database are designed for one person's tiny
daily volume and can fit within Cloudflare's free allocations, but the repository
cannot enforce an account plan or guarantee a zero-dollar bill. Keep the Worker
on Workers Free, do not attach paid resources, and check the current
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/). If a
free limit is unavailable or exhausted, feedback may fail; paper research and
email delivery remain independent.

## Emergency disable and rollback

For the fastest personal-only stop:

1. Open **GitHub → Actions → Send personal Morning Paper**.
2. Open `…`, choose **Disable workflow**, and cancel any in-progress personal
   run.
3. Revoke `First Fold Personal Delivery` in Resend and the Workers AI token in
   Cloudflare if either may be exposed, then delete or replace the matching
   GitHub secrets.

To disable feedback without stopping the paper, delete the
`PERSONAL_FEEDBACK_SIGNING_KEY` GitHub secret. To invalidate outstanding
links, rotate the signing key in both Cloudflare and GitHub before reenabling
it. Disabling or deleting the feedback Worker does not affect paper generation
or delivery; existing D1 rows remain until deliberately removed.

This does not affect an already delivered email or the public Pages site. The
dispatcher may log a failed personal dispatch while the workflow is disabled,
but it cannot research or send.

To keep manual workflows while pausing all scheduled dispatch, disable the
four Cron Triggers or roll the Worker back in **Cloudflare → Workers & Pages →
first-fold-morning-dispatcher → Deployments**. Re-enable service only after the
cause is fixed, credentials are rotated if necessary, the reviewed Worker is
deployed, and manual plus real-schedule verification succeeds again.
