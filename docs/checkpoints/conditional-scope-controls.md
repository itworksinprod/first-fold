# Conditional-scope calibration — offline checkpoint

Status: offline fixture/scorer checkpoint complete; live semantic qualification pending.

Carlos said “go” to condition-and-scope checking after the sentence-citation
trial. The proposed next narrow checkpoint was balanced, predeclared offline
controls. This change adds those controls and a pure comparison harness only.
It does not change any reviewer prompt, model, citation adapter, live workflow,
held article, editorial threshold, email, schedule or billing setting. No live
requests are authorized or made by these modules.

## Why this checkpoint exists

[The live citation trial](source-sentence-live-review.md) completed valid exact
quotations, yet its checker incorrectly accepted an unconditional upgrade
recommendation against conditional, platform-scoped source guidance. Quoting
real evidence did not establish the broader recommendation. This remains a
false positive; it is not repaired by adding synthetic fixtures.

## Fixed development controls

Sixteen fictional cases form eight supported/unsupported pairs sharing exactly
the same source passages. The changed candidates alter population, eligibility,
exceptions or logical relationship—not the citation mechanism. Each candidate
happens to yield one span under the unchanged splitter; no slicing rule changed.

| Pair | Faithful counterpart | Changed counterpart |
| --- | --- | --- |
| CS01–02 | Replace cracked outdoor sensor seals | Replace every sensor's seals |
| CS03–04 | All badges expire under a universal rule | Only visitor badges expire |
| CS05–06 | Reservation rule respects age exemption | Opening rule loses later exemption |
| CS07–08 | Latch engagement is necessary | Latch engagement guarantees operation |
| CS09–10 | Permit rule applies in one district | Permit rule covers the excluded district |
| CS11–12 | Every printed trial sample was inspected | Inspection expands to uninspected digital samples |
| CS13–14 | Conditional overweight-rejection policy | Policy becomes an observed rejection event |
| CS15–16 | Extension applies during eligible loan period | Extension applies before that period |

The necessity/sufficiency pair is a relationship control, not merely a population
test. The policy/observation pair does not assert zero events: lack of a report
cannot prove absence. Genuinely universal positive cases and negatives without
the word “all” defeat a word-ban shortcut. These are visible synthetic development
examples, not held-out news or independent evidence of broad model quality.

The independently reviewed controlset SHA-256 is
`22ba98ba1abbc942aff656912fefb3f2c35aae2ba9bb56b736b8f7ccff2b6341`.
The expected vectors and rationales stay in a separate frozen local controlset.
Only the unchanged `buildSourceSentenceReview(input)` view is model-facing; it
contains complete original sources and catalog, never labels, rationale, case
category or scoring results. The new modules have no network, provider, credential,
filesystem-write or delivery path. Original eight calibration controls remain
unchanged. Future live callers would still need separate bounded preflight,
request/provenance capture and independent exact-output review.

## Offline completion criteria

An independent reviewer must adjudicate every exact pair before any inference.
Freeze the accepted corpus hash. Verify identical per-pair source context, balanced
explicit labels, unchanged selector/prompt/splitter, full ordered coverage and
model-data separation. The pure scorer must distinguish false positives, false
negatives, uncertainty, invalid output and incomplete runs. It preserves raw
parsed responses separately from immutable validated results; it cannot repair
invalid evidence or silently skip a case. Unissued/cloned plans, reordered/unknown
case IDs and hostile object access must fail before unsafe reads.

`labelAgreementComplete` means only that supplied replies match the local labels.
Even perfect injected replies leave `provenanceVerified`, `modelQualified`,
`articleApproved` and `publicationReady` false. A schema-valid incorrect verdict
with real evidence IDs must still be counted as a wrong label. Wrong or irrelevant
explanations can remain despite matching labels, so exact-text review is required.
Injected tests are not model responses or semantic proof.

Completion of this offline checkpoint prepares a future baseline evaluation of
the unchanged checker. It does not close the live semantic qualification gate or
authorize another provider trial. Any later prompt or structured-review repair
must keep these labels fixed, be separately tested and reviewed, and must not
contain a hand-written answer for the saved GitHub article. The original article
and daily integration remain held.

## Independent review repair before freezing

Initial independent review passed 91 focused tests and found no scorer blocker,
but held CS15's wording. “Applies only” establishes necessary eligibility, not
sufficient entitlement. Its source now explicitly grants the extension to every
July-pilot book while retaining the only-July restriction and earlier-loan caveat.
Both paired cases share the corrected full context. The corpus pin and regression
tests were updated before any inference; neither model results nor a held-out
answer were used to adjust the expected labels.

The reviewer found the other labels defensible. CS04's exclusive visitor-only
claim lacks support; this does not prove other badge types actually exist. CS14's
asserted observed event likewise lacks evidence rather than proving zero events.
These distinctions are documented so later evaluation cannot reward explanations
that overstate the source while arriving at the expected label.

## Offline completion evidence

All **2,081 automated tests pass**, including 20 new fixture/scorer tests. Final
independent review accepted all sixteen labels and the corpus hash, independently
reran **93 focused tests**, and returned **offline PASS** with no remaining
blockers. This clears only publication of the offline fixture/scorer checkpoint.

The original sentence-catalog implementation SHA-256 remains
`906fcf509072e3a92f9dd1f4de4a435bbc9d3a48b3678a886d910fa22c0d4653`.
The historical seven-unit capture SHA-256 remains
`10f6cf563257ae71e9a4c9356ba4ce9ab2eac8ad0297c7df5ef360d8eeff37a0`.
No provider requests, model replies, live workflow changes or email sends occurred.
The existing factual false positive remains unresolved. The next step is a
separately bounded live baseline on the frozen controls, followed by exact-response
replay and independent explanation/evidence review—not claiming that injected
test labels repaired the checker. No generic scope prompt change has been made.
