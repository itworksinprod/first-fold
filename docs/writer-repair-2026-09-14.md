# Daily summary repair — September 14, 2026

Carlos reported that the delivered paper had three source-link items and no
finished summaries. Run [34826051869](https://github.com/itworksinprod/first-fold/actions/runs/34826051869)
at `878bb89` sent the accurately labelled fallback, not a successful AI paper.

The ordered generation logs show an initial `EDITORIAL_FORMAT` failure. Its
single format-recovery request produced three drafts, rejected for a copied
phrase in the first claim and two short bodies (109, 99 and 71 body words).
The 109-word draft failed originality, not length. No repair remained. These
logs did not identify the original malformed response's precise cause.

## Bounded repair

The daily Llama writer can now repair only rejected fields when the initial
object is usable. Short bodies retain their existing claims, headlines and
decks; copied claims are rephrased from their exact existing cited passages.
A standalone edit contract avoids mixing whole-story and field-edit output
instructions. Every reconstructed story still needs the original validators
and a final review bound to its exact hash. No second repair is added after
format recovery, and no failed reviewer is retried to obtain approval.

The provider diagnostics now distinguish explicit schema-mode failure,
malformed JSON, absent payload and reported output truncation. Bounded observed
completion counts help investigate native Llama responses without exposing
source text, generated prose, reasoning or credentials.

The no-email quality checker uses the daily Llama model and the same configured
free Tavily discovery. It requires verified search articles, checked summaries
for every selected story, source QA, canonical validation and email rendering.
Its repeat-history ledger is isolated and empty, so its story selection is not
an exact replay of a previously delivered edition. A link-only fallback cannot
make this check green. The checker cannot send email or update daily history.

## Boundaries and verification

The default model, three-call/7,800-output-token writer ceiling, editorial
thresholds, source requirements, recipient, schedule and daily fallback policy
remain unchanged. No paid API or billing setting is enabled. The targeted-field
repair does not, by itself, prove the initial format failure is resolved.

Live verification results will be recorded after observation; regression tests
alone are not proof of a working live summary or email delivery.

The first repaired live check,
[34841632556](https://github.com/itworksinprod/first-fold/actions/runs/34841632556)
on `a776c1b`, completed twelve free searches and verified eight publisher
articles. Four initial drafts failed word-count or reader-copy checks. The
targeted revision brought all four through those checks; three then passed
the separate factual review. The fourth failed exact claim-support coverage.
The all-stories quality assertion correctly failed with
`QUALITY_GROUNDED_SUMMARIES_INCOMPLETE`; no email was sent. This demonstrates
three checked live summaries and working field repair, not an all-clear run or
proof that every future response will be well formatted.

## Citation discipline follow-up

The default writer now selects cited passages before composing claims, then
writes the headline from those claims. It is told to use the smallest sufficient
citation set, with every included passage contributing a fact, qualification or
independent account. Review instructions explicitly evaluate that submitted set
jointly, while rejecting any unsupported clause or irrelevant citation. Exact
per-claim evidence-set matching and every semantic approval flag remain required.
Bounded count-only diagnostics distinguish empty, mismatched and malformed
review coverage without exposing passages or generated prose.

All 847 regression tests pass, including complementary-passage support, strict
subset rejection, and the observed four-repaired/three-approved pattern. The
precise reason for the first live review mismatch was not recorded; clarification
of the contract is not evidence that the rejected claim was actually correct.

The next live check,
[34842958468](https://github.com/itworksinprod/first-fold/actions/runs/34842958468)
on `50d969f`, verified ten search-discovered publisher articles but failed before
semantic review. The initial full-story response was invalid JSON at 732 observed
completion tokens against a 4,000-token cap. Its single format-recovery request
returned four drafts that failed originality, length, numeric-citation or prose
checks. This is not evidence of an output-token-cap failure. No email was sent.

## Full-story transport follow-up

The full-story Llama request moves to the documented `json_object` mode, with
the exact evidence-first schema explicitly included in the system instructions.
This removes complex provider grammar constraints from long multi-story prose;
strict JSON parsing and all local shape, factual, originality and semantic
checks remain mandatory. Smaller targeted-edit and reviewer contracts retain
`json_schema`. The same single repair slot and output budget apply. This is a
bounded compatibility change, not a claim that the provider's internal cause
has been established or that JSON mode guarantees correct news.

Reference: [Cloudflare JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/).

All 853 regression tests pass after the transport change. Real-adapter tests
cover the full-story request, exact system schema, native-schema field repairs
and review, one format recovery only, rejection of malformed/wrong objects,
and rejection of broken reader prose inside otherwise valid JSON.

The live transport check,
[34843909930](https://github.com/itworksinprod/first-fold/actions/runs/34843909930)
on `4fa09a5`, verified eight publisher articles and failed the all-summaries
assertion. No writer checkpoint was recorded, so it does not establish which
writer condition failed. Inspection found a logging/recovery gap: a parseable
object with invalid outer story structure or candidate identities returned
silently, bypassing the existing format-recovery slot. The follow-up routes
that unusable response through the same single recovery, never adopts its
contents, and records safe fixed reasons/counts. Missing known stories still
use the existing focused repair path. Invalid candidate input is diagnosed
without making an inference request. This does not relax any acceptance gate.

The shared writer instruction also now explicitly says the body-word target is
per story, not per multi-story response. The default full-story instruction
distinguishes story data from the schema description. These remove instruction
ambiguities without changing any local word count or shape requirement.

All 857 tests pass, including one recovery from incorrect outer keys, reflected
schema, non-array stories, excessive counts, duplicate IDs and unknown IDs.
Repeated malformed responses stop after two calls; recovered drafts cannot
obtain another field repair. Invalid inference provenance cannot authorize
recovery, and successful recovery still requires exact-hash factual review.
