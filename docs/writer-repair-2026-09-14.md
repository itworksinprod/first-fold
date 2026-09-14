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

The next live check,
[34845134497](https://github.com/itworksinprod/first-fold/actions/runs/34845134497)
on `9d6cfac`, verified seven publisher articles. Two initial 145/134-word drafts
needed originality repairs; both repaired drafts passed local checks. Final
review rejected the factual support of both drafts, returning empty support for
all four claims and false factual approval. No format recovery was needed on
this run. The result remains a failed quality test, not a successful paper.

The existing encrypted one-story diagnostic is now pinned to the daily Llama
writer rather than the separate experimental reasoning model. It retains the
same one-candidate, three-call/7,800-output-token ceiling and makes no search API,
email or ledger writes. Its source, draft and review payloads are encrypted to
an ephemeral public key; the private key stays on Carlos's Mac. The purpose is
to compare rejected claims with their actual passages, not rerun a reviewer to
obtain a more favorable verdict or publish rejected material.

The private diagnostic
[34846133947](https://github.com/itworksinprod/first-fold/actions/runs/34846133947)
used two requests and a 4,800-token output allowance, with no provider error.
Its artifact digest matched GitHub before local decryption. The 132-word draft
passed local checks but its final review returned empty support for both claims.
Manual comparison found a directly supported operating-system compatibility
claim among those rejections, alongside overly confident promotional-benefit
wording elsewhere in the draft. That does not justify approving the whole draft
or assuming the same cause for previous batches.

The follow-up supplies each review claim alongside its exact, locally resolved
cited passages and publisher identity, while retaining the full dossier for
qualifications and the full draft for all-field review. Per-claim support and
whole-article verdicts are explicitly separate: a supported claim cannot excuse
an overbroad headline or unsupported analysis. Default-writer guidance also
distinguishes advertised benefits from measured outcomes. No captured draft is
hardcoded or republished, and no previous rejected review is retried for approval.

All 862 tests pass. Synthetic regressions cover colliding passage IDs across
different candidates, preserved full-source caveats, unchanged factual and
whole-article vetoes, and conditional-benefit instructions on initial writing
and focused repairs. If the optional duplicated evidence view exceeds the
existing 70KB request limit, the original complete review view is retained.
Call and output-token limits are unchanged; pairing can add bounded input tokens.

The subsequent full live check,
[34848420909](https://github.com/itworksinprod/first-fold/actions/runs/34848420909)
on `1656785`, verified ten publisher articles but still failed the strict quality
assertion. Its first response contained two stories plus unrecognized outer
fields. Structure recovery consumed the one revision slot; the resulting
143/150-word drafts both failed originality in their first claim. Final review
was not reached, so this run neither proves nor disproves the paired-evidence
review change. No email was sent. Unknown outer fields are not being silently
discarded: their meaning has not been established by these count-only logs.

The next repair separates daily generation into cited claim foundations,
focused reader-copy composition and claim repairs, then one final full-draft
review. The allocation is 2,000 + 4,000 + 1,800 requested output tokens within
the same three-call/7,800-token ceiling. The second call is also the only
full-draft recovery if the foundation's structure is unusable. Accepted claims
must remain frozen; the assembled story must pass all existing quality checks.
This is a structural change under verification, not a successful live result.

The implemented daily path uses native structured output for the smaller
foundation and composition contracts. Good claims are normalized and frozen
individually; only named rejected claims can change. Cross-publisher coverage
and attribution repairs preserve an unaffected sibling claim. The final full
story validator and exact-hash, full-source review remain mandatory. Other
provider profiles and the daily delivery workflow are unchanged. Normal daily
writing now always reserves all three stages rather than sometimes completing
in two calls, but its maximum requested output allowance has not increased.

The focused checks pass: 77 grounded-writer tests and 41 diagnostic/integration
tests, including mixed originality/corroboration failures, immutable facts,
unknown candidate/outer-field rejection, no fourth call, and every final review
veto. An independent implementation review found no remaining blocker after
the two attribution/corroboration repair cases were corrected. Live verification
must still pass before the summary failure can be considered resolved.

Final local build and complete regression suite pass: 864 tests, zero failures.

The first split-writing live check,
[34850694004](https://github.com/itworksinprod/first-fold/actions/runs/34850694004)
on `537afab`, verified ten publisher articles. Both claim foundations passed;
the two assembled summaries failed only the body-length check at 84 and 87
words. Review was not reached and no email was sent. This establishes progress
on initial structure/originality for this batch, not end-to-end success.

The composition input now gives an explicit remaining-copy word range after
subtracting the canonical fixed-claim count. When claims need repair, the model
must subtract the final repaired-claim words too. Approximate analysis/watch
paragraph ranges clarify the intended balance, without changing acceptance
lengths, character bounds, factual gates or the three-call budget. No text is
mechanically padded to pass the minimum.

After this targeted correction, the build and all 867 tests pass. Three new
regressions cover canonical remaining-word arithmetic, final repaired-claim
counts, and continued rejection of 84/87-word drafts without another call.

The latest full live check,
[34851578946](https://github.com/itworksinprod/first-fold/actions/runs/34851578946)
on `27fd74d`, verified five publisher articles. Both foundations passed. The
assembled stories were 95 and 106 words: one failed the unchanged 100-word
minimum, and one reached the paired-evidence review. That review returned empty
support arrays for both claims while all four whole-story flags were true.
The collector records every failed flag, not only the first, so this is a
contradictory review result; it is not proof that the story is accurate. The
exact citation gate correctly rejected it. No email was sent.

**Status: not fixed end to end.** The structural repairs are deployed and all
867 tests pass, but no full daily-Llama live check in this repair session has
passed the all-summaries assertion. The last observed Cloudflare dashboard
usage was 9.26k of 10k daily free neurons. The allowance was not exhausted and
this run did not fail with a provider quota error. Further speculative live
runs were stopped to conserve it; billing and the daily schedule were not
changed.

A reviewed follow-up option is a default-only explicit per-claim verdict bound
to the exact claim, support set and source passages, avoiding the citation-ID
echo task. This is only a proposal, not implemented or approved output: hashes
prove binding, not factual truth, and boolean verdicts may have different
false-positive behavior. It needs negative/adversarial live evaluation before
adoption, with all original full-source and whole-story vetoes retained. The
separate short-copy problem also remains; neither can be solved by treating
this failed run as a successful paper or lowering acceptance requirements.
