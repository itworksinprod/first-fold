# Change completion checkpoints

For each future change: define the bounded success criteria, implement, test
locally, review the diff, publish the intended revision, verify that revision
live, and report evidence. A failed checkpoint remains unfinished. Distinguish
built, locally tested, published, and live verified; do not advance on tests alone.

## Anthropic reader checkpoint

Scope: approve the exact www.anthropic.com publisher host as an originating
article source (not a feed), and retain the selected report's headline, dated
automation findings, human supervision definition, self-evaluation limitation,
compute window, findings, and caveats within the existing 5,000-character budget.

The layout-specific extractor is not a general-purpose full-document parser.
Tables and the appendix are not captured. No claim based on those omitted areas
is qualified by this checkpoint. Publication-date eligibility, story selection,
writing, review, and email delivery are separate later checkpoints.

The no-secret, no-email article-reader-check workflow tests the published revision
against the fixed public URL. It logs checks, not publisher prose. Its success
does not approve a summary or promote any experimental writer.

## Anthropic fact-sheet checkpoint

`checkpoints/anthropic-fact-sheet.json` contains five manually reviewed facts,
supporting passage IDs (one-based newline blocks from the existing extractor),
retrieval time, source fingerprint, and explicit unresolved scope flags. No full
publisher text is republished. Review compares each paraphrase against its cited
passages; figures, denominators, dates, attribution and qualifications must agree.

The hosted evidence-binding check re-fetches the approved URL and rejects any
change to the reviewed excerpt. A passing fingerprint proves evidence stability,
not semantic correctness or independent corroboration. Changed evidence requires
manual re-review, not automatic fingerprint replacement. This is a worked example,
not an automated fact-sheet generator and not a publication-ready daily candidate.

## Fact-summary checkpoint — held after exact-text review

The new opt-in `reviewed-fact-summary` mode uses the existing free Cloudflare
transport and encrypted artifact workflow. Daily delivery is unchanged. One
writer request plus four section checks are capped at five calls and 2,800
requested output tokens, with no retries, paid fallback, search, or email access.
Source drift aborts before inference. The writer receives reviewed facts only;
the reviewer receives the complete captured excerpt. Local checks retain the
150–225-word body requirement, strict text shape, attribution, and 12-word
originality rejection. None is a semantic guarantee.

Live evidence:

- 35812969654 (`969040c`): held at 148 body words, before review.
- 35813294735 (`4671e1c`): reviewer returned ten citations (maximum eight).
  Manual inspection also found unsupported causal/scope expansions.
- 35813534716 (`a9e11ec`): headline passed; next review comparison was 246
  characters (maximum 240). Manual inspection still found scope expansion.
- 35813841200 (`a314cf3`): all four automated field checks passed. Exact-text
  manual review rejected an unsupported implication about impeding autonomous
  AI development, and noted weak/generic analysis. This is NOT email-ready.

The last artifact's SHA-256 is
`7f5a6815c21c722211e0ff22ef3602b90f5947684913de433e1a4ebc9854f4b5`.
The rejected draft SHA-256 is
`aa3d12c7d4d662c2e61cb11a899dfe0b964862e38db1393295b3fb62935a46fa`.
Only encrypted captures are retained in GitHub; local decrypted evidence stays
outside this repository. The observed false positive is recorded in
`tests/fixtures/fact-summary-causal-regression.mjs`; it is not yet a passing live
reviewer qualification. No email, renderer approval, or daily promotion occurred.

Next gate: demonstrate rejection of that unsupported causal inference and
acceptance of a supported measurement-only counterpart before trusting this
reviewer on another draft. Then repeat exact-text editorial review. Do not
replace a rejected statement and carry over its old review approval.

## Causal-review qualification checkpoint

The opt-in `causal-review-controls` diagnostic evaluates four supported controls
and four unsupported ones, including the observed false positive, a rephrased
version, an incorrect compute explanation, and a separate synthetic sensor case.
Expected outcomes and case labels are withheld from the model. The first six
receive the same complete, fingerprint-checked article excerpt. The remaining
pair receives identical synthetic evidence. No draft is generated or emailed.

The experimental strict profile requires support for every clause and causal
relationship, including consequences qualified by “could” or “may.” Its policy
identifier is bound into the evidence/statement hash. Default reviewers and daily
delivery remain unchanged. Maximum eight single-attempt requests, 400 requested
output tokens each; no retry or provider fallback. Invalid responses stop the
run. All expected verdicts plus exact-text inspection of their explanations are
required to close this limited checkpoint. Local mocks verify plumbing, not
semantic reliability; a live pass is not general publication approval.

### Live result: checkpoint remains held

- Run 35814761170, revision `ecc1c74`: first negative was rejected, but the
  comparison exceeded the existing 240-character response limit. Stopped after
  one request; no format bypass. Artifact SHA-256:
  `901805083bd04dc3c1dfd32fb42d0b0b2f268a70fb28b9352bc4522270206e9d`.
- Run 35814982994, revision `747ec0b`: after a shorter-explanation instruction,
  all eight responses were structurally valid, but only five verdicts were
  correct. All four supported controls passed. Three unsupported article claims
  were wrongly approved: the observed development consequence, its rephrasing,
  and the incorrect denominator-based causal explanation. The sensor negative
  was correctly rejected. Artifact SHA-256:
  `64d57e51acbdb508f59b7f43e35e18a15868ae08d83d200b0113b9b54752f7c8`.

Exact-response inspection confirms the problem is semantic, not a provider or
delivery error. The first false positive explains only the supported ratings
clause and ignores the unsupported development consequence. The other two
repeat keywords rather than establish the claimed causal relationship. A shorter
answer requirement did not reliably fix reasoning. This profile is NOT qualified
for summary approval; a green local suite (1,252 tests) does not change that.
No new draft, email, paid provider, or daily promotion occurred.

Next narrow experiment: explicit clause-level evidence judgments with an
all-clauses-must-pass decision, evaluated against these unchanged controls plus
unseen controls. Do not keep rerunning this prompt until a lucky pass, hand-edit
expected labels to fit outputs, or approve the prior rejected summary.

## Claimwise reviewer experiment

`claimwise-review-controls` preserves the eight original statements, full source
contexts and overall expected verdicts, but manually enumerates their substantive
claims. Two new synthetic controls cover a supported display-delay consequence
and an unsupported staffing consequence. Manual claim decomposition is a limitation
of this isolated evaluation, not proof that arbitrary prose can be decomposed safely.

Every claim must receive an exact-ID, source-bound verdict. Code derives approval
only if all claims pass; missing/duplicate/unknown claims or malformed responses
fail closed. Qualification additionally requires every individual verdict to match
its offline label, so rejecting the wrong clause cannot earn a pass. Labels are
not sent to the model. No source prose or decrypted model output is published.

The single run is capped at ten requests of 600 requested output tokens each,
with one attempt per case and no provider fallback. Existing free provider and
account settings are unchanged. Quota/format errors stop the run. No draft,
email, paid fallback, schedule change or production promotion is authorized by
this experiment. Exact explanations must be manually inspected after a live pass.

### Claimwise live qualification: limited checkpoint passed

- Run 35815691265 (`a1914d3`) stopped at the fifth case because an unsupported
  causal claim had no evidence IDs. Manual inspection found the first five cases'
  substantive judgments correct, but the run did not qualify. Artifact SHA-256:
  `a7c2205150d2d8c79de89a2b32c43df5f9a910a4c54955cc961bf76f98bed8e1`.
- Revision `9cfa01a` explicitly represents absent evidence as an empty list ONLY
  for rejected claims. Approved claims still require valid supporting references;
  empty-citation approval fails closed. This is policy `explicit-claimwise-evidence-v2`.
- Run 35815956988 on that revision passed all ten cases and all 17 individual
  judgments (12 supported, five unsupported), with ten requests, no retries and
  no email. Artifact SHA-256:
  `47c82397c0ee97e8f2dfeea0826fcb67c74bd98d05a71a5c10c9eb5eb6bcb571`.

Exact-response manual review checked all 17 judgments and the cited passages.
The reviewer distinguishes rating accuracy from effects on AI development, rejects
the denominator-based explanation, and separates observed display/sensor effects
from unmeasured staffing/journey-time consequences. All six real-source contexts
match the reviewed article fingerprint. Explanations remain terse; absent evidence
means unsupported here, not proof that a consequence is impossible in reality.
The full local suite passed 1,260 tests. No daily reviewer or writer was promoted.

This closes ONLY the fixed-control claimwise evaluation, not general reviewer
reliability or summary readiness. Decomposition was manually enumerated. Next:
apply it to a new single-article draft with a complete, independently checked claim
inventory, then inspect exact prose for usefulness, attribution, originality and
factual accuracy. Do not carry over approval from these fixtures or silently omit
claims during decomposition. Email and daily integration remain later checkpoints.

## New single-article summary checkpoint

The opt-in `claimwise-fact-summary` mode re-fetches the same reviewed Anthropic
article and verifies its full excerpt fingerprint before a new writing request.
It is a newly written summary of that article, not a fresh daily news search.
The writer receives the reviewed fact sheet only. Each body field is an array of
one to four sentence-sized units. Joining those exact units is the displayed
prose; no separate text can bypass the inventory. The headline is reviewed too.
Every review receives the complete captured source context and uses the qualified
claimwise policy. Missing or rejected unit verdicts stop the run.

This guarantees text coverage, not semantic decomposition: a generated unit
could still contain several assertions. Manual inventory and prose review remain
mandatory, and a compound unit with an unsupported assertion cannot be approved.
Success also requires specific useful prose, correct attribution and qualifications,
150–225 body words, and the existing 12-word originality check. Local mocks test
control flow only. No partial pass is publication or email approval.

Budget: one writer request (1,200 requested output tokens), then at most four
unit-review requests (600 each), maximum five calls / 3,600 output tokens. No
retry, alternate model, paid fallback, email, scheduling change, or daily promotion.

First live run 35817719595 (`3a256fd`) passed automated checks but was held after
manual review: repeated numbers replaced useful analysis, generated units merged
several assertions, and the compute-proxy explanation blurred the source's stated
mechanism with separate coverage exclusions. The draft hash is
`c0e4a8158981859f87b8e68b0ee96de727221f3b846972de69e96c6a032f0b37`;
artifact SHA-256 is
`0983acb8a60829d64cc916cb4128d5cfc8e0a884dd748460ce495bce4f7f3035`.
It is not an approved summary.

For a narrow revision, fact-sheet entries 2 and 5 now include the source's actual
verification proposal (P4) and compute-intensity explanation (P8), separating the
coverage exclusions (P10). Those paraphrases were manually checked against the
unchanged captured passages. No scope flag or source fingerprint was changed.
The experimental writer instructions now request useful non-repetitive analysis,
separate assertions and a concrete headline. Validation thresholds are unchanged.

### Single-article result: exact sample passed, daily integration still held

Run 35818064321 (`f75a5df`) passed automated review but remained on manual hold:
one sentence called the compute-allocation figures estimates of safety attention.
Its artifact SHA-256 is
`34173510cfaa506ad544ed96151f4374572c65c39d51112555876d0a670a1a74`.
The next writer-instruction revision explicitly preserves that distinction.

Run 35818252323 (`bc758b5`) produced a new summary and passed all four field
reviews. Five provider requests, maximum 3,600 requested output tokens, no retries
or email. Artifact SHA-256:
`dcc06a5639b5e66316bac54afbc4d24456d3476c532c0fc30f3255eb6ae3156e`.
Exact draft SHA-256:
`8b0d829ceb2c8eecb101eaf60a1df22ade5b2e6f3d4f8b504a74ca863ba406f1`.

Manual review compared every assertion in its nine displayed units (including
the headline) with the complete captured passages, including assertions combined
within a sentence. The dated supervision finding agrees with P3; both compute
denominators and the snapshot agree with P7/P9; the agent count and platform scope
agree with P6; the explanation and separate exclusions agree with P8/P10; the
ratings limitations and proposed verification agree with P4. The article provides
a concrete finding, an explanation of the measurement limitation and a specific
verification proposal rather than repeated numbers or generic advice. It is
approved as this exact single-source example, with a clear sample label—not as
today's news, independently corroborated reporting, or a daily production edition.

The local sample preserves the exact reviewed text; any subsequent copyedit needs
a new review. The full suite passed 1,267 tests. No production writer, delivery
schedule, recipient, billing setting, or email adapter was changed. Manual review
still caught faults the automated reviewer missed in earlier runs. Sentence-sized
units do not prove automatic atomic-claim extraction. Next checkpoint: test a
different article without article-specific prompt changes, and assess whether the
writer/reviewer approach generalizes before daily integration or an email test.

## Second-article generalization checkpoint (predeclared, no-email)

The new opt-in `generic-second-article` mode tests the reviewed MIT HardFlow
article with a separate, topic-independent writer prompt. The previously passed
Anthropic path and daily production are unchanged. The generic prompt was fixed
before any live second-article writing response; SHA-256:
`47895a243263950e287a6da63c67551e7d125aa376a52cb5901fc150d780457a`.
No topic examples, expected prose or article-specific correction instructions
are part of it. One live attempt, no retry or prompt tuning to rescue this sample.

The five fact-sheet entries were manually compared with the protected reader's
captured paragraphs: method P4/P15, reported experiments P5, deployment P6,
mechanism P12/P13/P16, additional goals and conditional example P20. The bounded
excerpt does not include the entire article or underlying paper. This tests
writing and review from manually prepared facts, not automatic extraction,
selection, freshness, independent corroboration or full daily delivery.

The fixed source URL/publisher and full excerpt hash must match before writing.
Success requires unchanged 150–225-word and originality limits, every displayed
unit reviewed against captured source passages, and a separate exact-text manual
check of usefulness, attribution, scope and unsupported implications. It remains
a hold if the automated reviewer passes text that fails manual review. Budget:
five requests at most, 3,600 requested output tokens, existing free provider only.
No email, paid fallback, scheduling changes, recipient changes or promotion.
