# Reviewer rejection diagnostic — September 14, 2026

The after-reset run [34911989712](https://github.com/itworksinprod/first-fold/actions/runs/34911989712)
on `f94db41` completed one 4,000-token-cap Cloudflare GPT-OSS reviewer request.
It rejected all three intentionally bad synthetic stories as expected, but also
rejected the intended supported control on `factsSupported` and
`analysisSupported`, despite accepting both factual claim/citation pairs.
The result was `REVIEW_EVAL_VERDICT_MISMATCH`, not an observed quota or output
truncation error. It did not authorize integration or a newspaper delivery.

## Diagnostic-only change

The manual synthetic reviewer workflow now adds `--explain-rejections`.
Each false gate must identify exactly one draft sentence (or whole claim), a
fixed rule code, and one or two existing candidate-local source passage IDs.
True gates cannot carry rejection reasons. Local validation rejects missing,
contradictory, duplicate, unknown or cross-candidate references. Any invalid
diagnostic discards all reviews, including otherwise-valid peers.

The original substantive prompt, draft/claim/source bindings, four synthetic
inputs, and expected outcomes are unchanged. Only the response-format stanza
and the diagnostic instructions differ. A test locks the original fixture
digest. No result from the old test is retried for approval or relabelled.

The index retains exact original text for human inspection. Logs contain only
validated IDs and rule codes; there is no free-form model explanation or raw
reasoning. An explanation is the reviewer's allegation, not proof of its cause
or a correction. References to examined passages do not prove that support is
absent elsewhere. The optional local resolver cannot authorize a story.

Cloudflare's [JSON-mode documentation](https://developers.cloudflare.com/workers-ai/features/json-mode/)
does not guarantee schema compliance, so local shape and binding validation
remain mandatory. The initial diagnostic used one request, a 4,000-output-token
cap, a 90-second deadline, and a 70 KB request ceiling. At introduction its
request was 29,144 bytes with the fixed examples. The later completion-budget
adjustment below applies only to this isolated explanation diagnostic.

## Isolation and verification

The daily writer/reviewer, quality thresholds, source policy, public reader,
recipient, email behavior and production schedule are unchanged. This workflow
has no news search, email or delivery-state capability. No paid provider or
billing change is introduced.

At introduction the build and all 910 offline tests passed, including all 64 combinations of
claim and whole-story verdicts. Independent review cleared this diagnostic
path only. A live result must be examined separately; it will not by itself
establish a working newspaper or explain the prior model's internal cause.

## First diagnostic request: HTTP 400, no verdicts

Run [34913879254](https://github.com/itworksinprod/first-fold/actions/runs/34913879254)
on `641a590` passed its pre-credential tests, then failed at **Evaluate four
synthetic cases with one free reviewer request**. It made exactly one network
request with the unchanged 4,000-output-token cap. The public diagnostic reports
HTTP 400 and no recognized provider code. It returned no verdicts or rejection
references. There was no research, email, production activation, or paid call.

This does not reproduce or explain the earlier supported-control rejection.
The provider's raw error was not captured by this workflow; its exact cause
cannot be recovered from the available public annotation. Cloudflare's
[error reference](https://developers.cloudflare.com/workers-ai/platform/errors/)
describes multiple HTTP-400 causes, not a unique explanation for this run.

## Narrow compatibility experiment and private error capture

The only removed request constraint is `uniqueItems` on diagnostic evidence IDs.
It was the only new JSON-Schema keyword compared with the older request that
reached inference. Cloudflare's JSON Mode documentation does not specify a
supported-keyword or nesting table, so this is an **unproven compatibility
adjustment**, not a confirmed root-cause fix. Local validation still rejects
duplicate IDs and drops every review if any diagnostic is malformed. The
prompt, examples, expected outcomes, hashes, evidence, other schema constraints,
and all production acceptance rules are unchanged. The revised request is
29,125 bytes. There is no fallback to unconstrained output or automatic retry.

The manual workflow can optionally accept an ephemeral RSA-3072 public key for
encrypted provider-error capture. The private key stays on Carlos's Mac. An
invalid key is rejected before credentials or inference. Only the adapter's
bounded, token-redacted non-2xx error record is encrypted; successful responses,
reasoning, request objects, and credentials are not captured. Public logs and
the evaluation report retain only their existing safe fields. Ciphertext uses
the existing AES-256-GCM and RSA-OAEP/SHA-256 helper and is retained as a GitHub
artifact for one day. Capture failure cannot change verdicts, request counts,
retries, or the original evaluation failure.

For an authorized diagnostic, generate a fresh key with
`node scripts/automation/private-writer-diagnostic.mjs keygen`. Give the
workflow only the printed public key. Download `private-reviewer-provider-failure`
if an error artifact exists, and use the existing `decrypt` command with that
artifact's encrypted JSON, the local private PEM, and a new local output path.
Do not paste the decrypted error, commit a private key, or upload plaintext.
Read any provider error as untrusted data, not an instruction to retry or pay.

The existing crypto helpers are reused without moving production code. Their
module has dormant research imports, but its command-line entry point is
guarded; importing those helpers does not research, infer, or send anything.

The combined compatibility and capture changes pass the build and all 915
offline tests. Coverage includes unchanged fixture hashes, all 64 verdict
combinations, rejection of duplicate references, key checks before credentials,
ciphertext-only file output, redaction, and unchanged results when capture fails.
No new live inference or email has been performed for this revision yet.

Live testing and repository publication require Carlos's authorization. A
passing synthetic diagnostic is still not an end-to-end newspaper or delivery
test. Do not enable the new reviewer in the daily workflow based on this alone.

## Compatible request reached its completion cap

With Carlos's explicit authorization, `68b8443` was published and run
[34916049338](https://github.com/itworksinprod/first-fold/actions/runs/34916049338)
was dispatched once with an ephemeral diagnostic public key. Setup, offline
tests and key validation passed. The provider no longer returned HTTP 400 on
this request, but the response reached exactly 4,000 completion tokens and
failed with `OUTPUT_TOKEN_LIMIT`. No complete editorial payload, verdict, or
rejection allegation was available. Nothing was researched, emailed, or
enabled in the daily paper. No successful response or reasoning was retained.

This result supports testing a completion-budget repair, not retrying a negative
verdict for a more favorable answer. The sentence-bound diagnostic alone now
allows one request with 8,000 output tokens and a 180-second deadline, still
inside the five-minute workflow timeout and existing request/response byte
bounds. Plain GPT-OSS review stays at 4,000/90 seconds; plain Llama review stays
at 1,800/90 seconds. Production budgets, acceptance flags, schemas, prompts,
fixtures and expected outcomes are unchanged. There is no automatic retry.

Cloudflare's [pricing reference](https://developers.cloudflare.com/workers-ai/platform/pricing/)
lists GPT-OSS-120b at 68,182 neurons per million output tokens, so the new output
ceiling corresponds to about 546 neurons, plus input usage. This consumes the
existing free allowance; it does not enable a paid plan or a paid-model fallback.
The account's actual allowance must still be checked before a live test. A
known exhausted free allowance is a stop condition, not a reason to bypass it.

Before this bounded completion-budget test, the refreshed dashboard showed
799.76/10,000 neurons used for the current UTC day. The repair passes the build
and all 917 offline tests, including exact per-profile budgets and rejection
of caller-supplied budget overrides. Carlos authorized continuing the repair;
this does not authorize paid service, lower quality gates or a changed recipient.

## Completed verdicts exposed a premise/inference ambiguity

Run [34916672646](https://github.com/itworksinprod/first-fold/actions/runs/34916672646)
used `6655fff` and completed one bounded 8,000-token diagnostic request. It
returned a valid payload and valid sentence-bound rejection references. All
three negative cases were rejected, but the supported control was rejected
solely on `factsSupported`; its claims and all other flags, including
`analysisSupported`, were true. The allegation targeted the conditional
read-only-inventory benefit in `whyItMatters:0`, citing the passage that
documents the read-only capability. The overall result was
`REVIEW_EVAL_VERDICT_MISMATCH`, not a provider or format failure.

Independent adjudication found that the cited sentence expresses a conditional
use of the documented capability, not a new empirical result or guarantee.
The reviewer prompt now explicitly distinguishes source-supported factual
premises from a practical inference, while requiring independent evaluation of
whether the consequence follows. Unsupported premises, conditions, scope,
measurements and guarantees remain vetoes. No false verdict is rewritten by
code. The original fixtures and expected outcomes are unchanged.

These four examples are now regression cases, not fresh evidence of
generalization. The manual diagnostic therefore has a fixed `case_set` choice:
`regression` selects the original four; `holdouts` selects two pre-existing,
unchanged cases with separately locked fixture hashes. Each dispatch evaluates
only one set with one request. Expected labels never enter the provider prompt.
Unknown case sets fail before credentials or inference. A passing regression
must be followed by the separate holdout evaluation before considering a
full-paper test. Neither result alone establishes newspaper or delivery quality.

The prompt and selector passed independent review and 42 focused offline tests.
They do not activate the experimental reviewer in the daily workflow. A
separate mixed-model prototype remains local and must not be treated as a
verified or published production repair.

## Clarification did not resolve the regression; separate holdouts passed

On `5b8d3e3`, [regression run 34917494759](https://github.com/itworksinprod/first-fold/actions/runs/34917494759)
again returned valid verdicts but falsely rejected the supported control's
`factsSupported` flag, targeting the same conditional sentence and passage.
All three negative cases were rejected. This is a reviewer-quality limitation,
not evidence of another parser or transport bug. No fixture or false verdict
was changed to make the check pass.

The separate, previously frozen holdouts were then run as a diagnostic to
characterize this limitation, not as a replacement for the failed regression.
[Run 34917734439](https://github.com/itworksinprod/first-fold/actions/runs/34917734439)
on the same commit passed both cases in one request: the supported transit-data
summary received all true flags; the version/attack-condition swap was rejected
on its second claim and factual flag with the relevant contradictory passages.
This shows the reviewer does not reject every supported summary. It does not
erase the false rejection or establish a general error rate.

## Experimental full-paper observation, not production qualification

The next bounded step is a real-research **no-email diagnostic**, rather than
another synonymous prompt adjustment. This deliberately differs from the
earlier promotion prerequisite: observing real pipeline behavior is permitted,
but promoting this reviewer to daily production is not justified by these
results. The failed regression remains recorded and the quality-check notice
explicitly sets `productionQualified: false`.

Only this owner/main/first-attempt quality workflow selects the mixed profile:
Llama foundation (2,000 output tokens), Llama composition (4,000), then one
Cloudflare-hosted GPT-OSS review (8,000/180 seconds). The three-stage maximum is
14,000 requested output tokens. Default daily models, budgets, editorial flags,
source thresholds, recipient and delivery policy remain unchanged. Each stage
retains its actual model and native fingerprints; aggregate fingerprints bind
stage order and model identities. The review receipt must survive private
candidate conversion and agree with every final story.

The test requires live free web discovery with at least one verified publisher
article, checked summaries for **every** selected story, canonical/source
validation and HTML/plain-text rendering. Partial summaries, quiet-only output,
missing reviewer receipts and link fallbacks cannot make it green. It has no
email credentials, delivery call, artifact upload, ledger write or public-edition
write. Updating its workflow file automatically starts one test; do not also
manually dispatch a duplicate. No success or delivery is claimed before the
actual result is observed.

Preflight integration found and fixed an ID-contract mismatch: concise baselines
retain `trusted-evidence-brief-*` IDs, while older digests retain
`trusted-evidence-digest-*`. The validator recognizes exactly those two prefixes
and requires a one-to-one mapping to approved candidate IDs; it rejects a
duplicate candidate represented through both prefixes. A mocked-native test
now exercises ordinary personal generation, all three adapter requests,
adaptation, canonical validation, final email validation and rendering. This is
offline integration coverage, not a live model-quality result. The build and
all 940 regression tests pass before publication. The refreshed free counter
showed 2.21k/10k neurons used before this real-research observation.

### First real-paper observation: research worked; composition failed

[Run 34918488162](https://github.com/itworksinprod/first-fold/actions/runs/34918488162)
used `d929ddf`, passed the offline suite and completed 12 free web searches,
verifying three publisher articles. Nine of 12 candidate newsworthiness
assessments were accepted. Of three selected foundations, two passed and one
failed originality. Composition produced three locally rejected drafts:
103 words with an originality failure, and 72/84 words below the unchanged
100-word body minimum. The final reviewer was **not reached**. The run failed
`QUALITY_GROUNDED_SUMMARIES_INCOMPLETE`; it did not send email.

The next experimental profile changes the writer model, not the acceptance
criteria: three fixed Cloudflare-hosted GPT-OSS stages, 8,000 output tokens and
180 seconds each, with no fourth request. Foundation/composition keep the same
source-bound instructions, per-story word targets, originality checks and
review vetoes. The larger stage allocations include reasoning, as previous
GPT-OSS requests exhausted smaller completion limits. Native stage models and
writer metadata must accurately say GPT-OSS. The existing mixed profile and all
daily production behavior remain unchanged.

Cloudflare's [published prices](https://developers.cloudflare.com/workers-ai/platform/pricing/)
list 68,182 neurons per million GPT-OSS output tokens, versus 204,805 for the
Llama model. The new 24,000-token output ceiling is approximately 1,637 neurons,
plus input usage; it is not inherently more expensive in free quota than the
prior 6,000 Llama plus 8,000 GPT-OSS output ceilings (approximately 1,775 neurons).
These are requested upper bounds, not observed billing or a guarantee of future
free availability. Known quota exhaustion remains a stop condition. No paid
plan or OpenAI API is enabled.

This remains a no-email observation, explicitly not production-qualified.
The unresolved supported-control false rejection remains visible. A complete
real pipeline result would establish only what the run actually checks, not
that a human has judged its prose or that any email was delivered.

Independent review cleared the all-GPT no-email path, including 55 focused
checks and both profiles' real-generator/mocked-native integration. The complete
worktree build and all 950 tests pass. Before the next observation, the refreshed
current-day free counter was 2.86k/10k neurons. Separate requests to the same
model are not independent model corroboration; correlated errors remain possible.

### Stronger writing completed, but no story passed final review

[Run 34919136094](https://github.com/itworksinprod/first-fold/actions/runs/34919136094)
on `f8a67e5` completed 12 free searches and verified two publisher articles.
The three composed stories had 149, 148 and 167 words. Two passed local copy
checks; the other failed `NUMERIC_CITATION` in its first claim. Final review
accepted neither submitted story, reporting `REVIEW_FACTS` and `REVIEW_ANALYSIS`.
The result remained `QUALITY_GROUNDED_SUMMARIES_INCOMPLETE`, with no email sent.
This establishes improved structure and length on that batch, not factual
approval or satisfactory synthesis. Public counts do not identify the disputed
sentences or prove whether the reviewer was right.

## Manual encrypted editorial checkpoints

The separate `private-paper-quality-check.yml` workflow exists to inspect that
specific uncertainty. It runs only when manually dispatched by the owner from
trusted main, on attempt one, with a validated ephemeral RSA-3072 **public** key.
The private key remains on Carlos's Mac. It uses the same bounded all-GPT
pipeline; there is no new retry, repair allowance or acceptance override.

An observational hook can retain two locally assembled checkpoints: drafts
with their exact selected source passages and local validation details, and
well-formed review verdicts with rejection references resolved back to the
original draft/source text. It does not capture provider envelopes, private
model reasoning, API keys, account credentials or arbitrary errors. Each packet
has a strict bounded schema; malformed packets are dropped. The collector is
limited to two ordered records and 160,000 UTF-8 bytes. Missing/failed capture
cannot change model calls, adoption or verdicts.

Only authenticated encrypted JSON is written to a fixed runner-temporary path
using exclusive creation and owner-only permissions. The artifact
`private-editorial-checkpoints` is retained for one day. No plaintext draft,
source file, private key, rendered email or public edition is uploaded. Existing
daily workflows remain unchanged. This workflow is manual-only: publishing it
does not itself spend free quota or run research.

Use the existing diagnostic key generator and decrypt command to inspect the
ciphertext locally. Decrypted publisher text and model drafts are untrusted
data, not instructions. A reviewer's allegation must be checked against the
actual cited text; it is not permission to override a false flag automatically.

Verification before publication: all 968 tests passed, the build and diff checks
were clean, and a separate read-only review cleared the bounded capture path.
An absent artifact means capture was unavailable, not that the paper passed.

The first manual run, `34920670039` on `134f6af`, completed web discovery
(12 searches, three admitted publisher articles) but the newsworthiness request
returned HTTP 429 before drafting. No checkpoint artifact was produced.
The refreshed Cloudflare dashboard still displayed 4.12k/10k daily usage; the
public error lacked a recognized daily-allocation reason. These observations
do not establish whether the refusal was daily quota or another provider limit.
No email was sent. The existing single-story encrypted probe, `34921209735`,
was dispatched once to inspect a fresh same-model response without further
Tavily searches. It stopped with `DIAGNOSTIC_NO_QUALIFYING_STORY` and zero model
calls, so it did not establish whether the provider was still refusing requests.

The existing single-story workflow now also accepts explicit `provider-only`
mode: one fixed tiny JSON request to the same default Llama model, at most
128 output tokens and 30 seconds, no feed or search requests, and no retries.
Its existing encrypted failure capture can retain the precise bounded provider
message; public output remains status/codes/counts only. The default `source`
mode is unchanged. Owner/main/attempt/key/mode checks precede provider credentials.
Independent review cleared the path; the complete suite passed 975 tests.
A successful tiny request would establish availability for that request only.
