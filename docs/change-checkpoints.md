# Change completion checkpoints

For each future change: define the bounded success criteria, implement, test
locally, review the diff, publish the intended revision, verify that revision
live, and report evidence. A failed checkpoint remains unfinished. Distinguish
built, locally tested, published, and live verified; do not advance on tests alone.

Current experimental summary requirement: the user explicitly lowered the
minimum body length to **110 words**, retaining the **225-word maximum**. The
headline is excluded. This supersedes only the length floor in the historical
checkpoints below, not their recorded outcomes or any factual/editorial veto.
Daily production requirements remain unchanged until a separate integration
checkpoint; this change applies to the isolated fact-summary diagnostics.

Current sequential editorial status: **step 1 (plain language) is still held**.
The qualification guard and exact phrase containment are locally tested and
live-verified, but the edited article is not approved. Step 2 (useful significance) and step 3 (meaningful watch guidance)
have not started. Do not advance merely because a safety guard works as intended.

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

### Second-article result: tested, not passed

Live run [35942202356](https://github.com/itworksinprod/first-fold/actions/runs/35942202356)
used `fb2591094c8731d6f420131286e399d426f9c21d` and the frozen prompt hash above.
The protected source excerpt matched the predeclared fingerprint. One writer
request succeeded, but its six body units contained only 116 words, below the
unchanged 150–225-word requirement. The gate returned `FACT_SUMMARY_LENGTH` before
any model review. No retries, repair prompts, alternative models, email or daily
changes followed. The request allowed at most 1,200 output tokens (not a
measurement of billed/actual generated tokens). All 1,278 local tests passed,
including short-output rejection before review with the raw response retained
only inside the encrypted diagnostic.

Downloaded artifact SHA-256:
`a48be668c59d1f735b08f81c2c11d93d7df586bac750e5d90733cd16f3bd0abb`.
Raw, unapproved response SHA-256:
`9f8e29982c3488d4dc509ad0d312668ab160a932e957065230bdd81edac1528f`.
The decrypted capture stays outside the public repository.

Manual inspection of all seven units (including headline) found the factual
content supported by the captured passages: method P4/P15, experiments P5,
deployment P6, intermediate-sample limitation P13, control formulation P16, and
conditional robot-path example P20. However, the response mostly reproduced the
manually prepared facts with limited explanation. A supported short digest is
not a pass for the requested finished summary, nor evidence that the reviewer
generalizes: no automated review calls were reached. This remains an unapproved
draft and does not inherit the first article's approval.

The experiment is complete; generalization remains unproven. Next small repair
should address reliable body planning/length and useful synthesis in a generic,
bounded way, with its own tests and a predeclared live evaluation. Do not add
MIT-specific instructions, pad the text, weaken the length limit, or retry until
a lucky response passes. Automatic fact selection remains a separate checkpoint.

## User-approved 110-word floor

The user requested the minimum change after seeing the second-article result.
Both isolated fact-summary prompt variants and their shared validator now use
110–225 body words. No source, originality, attribution, per-unit evidence review,
manual editorial review, cost, request, or delivery guard was weakened. The generic
prompt differs from the frozen trial only in the user-approved numeric floor;
new prompt SHA-256:
`aeee569b4d1ab6897555eff115ebc832eb53db4e8e461caac7687d2998d6c149`.

Re-evaluating the exact saved MIT response from run 35942202356 locally passes
the static shape, length (116 words), attribution and originality checks. No text
was rewritten and no model was called. This is NOT a retrospective successful
workflow run: that run remains failed, and the four automated field reviews never
ran. Editorial usefulness and the completed review chain remain open gates.

All 1,279 local tests pass. Boundary regression tests reject 109 and 226 words,
accept 110 through 225, including the 116-word range, and exclude headline words.
Next: a bounded no-email
live check under the revised contract, then exact-text source and usefulness
review. Do not claim publication readiness merely because the length gate passes.

### Revised-contract live result: factual pass, editorial hold

Run [35946385748](https://github.com/itworksinprod/first-fold/actions/runs/35946385748)
used `f47b8f8101c537b0ed8190aea45967cbf92db824` and the revised generic prompt
fingerprint above. It completed five requests, all four automated field reviews,
and the unchanged static checks. The body contains 116 words across six units,
plus one headline unit. No retry, paid provider, email or daily promotion occurred.
The local suite also passed all 1,279 tests at this revision.

Artifact 10786504316 SHA-256:
`c724b2319bc2e51026ba9f1f49a12ae51f81129016cd38679d8856edf3077891`.
Exact normalized draft SHA-256:
`fe46377ea567bf84f9ea6d662ca3c62b041a3f37c0f2e66687d5e4bbdff016b7`.
The downloaded artifact hash, source hash, draft hash and complete displayed-text
coverage were checked locally. Its prose is unchanged from the prior failed
116-word attempt; lowering the user-approved floor let it reach evidence review,
but did not improve the prose. The old failed run remains failed.

Exact-text inspection by the primary agent and a separate reviewing agent agrees
with factual support: method P4/P15, experiments P5, deployment-time use P6,
mechanism P13/P16 and conditional quality-goal example P20. No universal safety,
deployed-system, independent-corroboration or verified-freshness claim was found.
This is a bounded single-source check, not human approval or general reliability.

Reader-ready status remains HOLD. Core terms such as hard constraints and
intermediate samples are unexplained; the analysis emphasizes technical mechanism
without clear practical stakes; and What to watch describes an existing capability,
not a future development or unresolved observation. The captured evidence does
not announce a next step, so none may be invented. The shorter minimum does not
remove the usefulness and clarity requirements.

Next narrow checkpoint: one bounded, generic editorial revision using the same
evidence, explaining core terms and practical significance and handling the watch
section honestly. Review the exact replacement text before approving any preview
or email. Do not carry this draft's factual verdict across an edit. Daily delivery,
automatic fact selection, full-article coverage and broader generalization remain
separate unfinished checkpoints.

## Sequential editorial checkpoints: 1. Plain language

The user requested the three editorial repairs separately. This checkpoint changes
only generic readability instructions: use everyday wording, explain necessary
technical terms using the supplied facts, and preserve scope and limitations.
The section-purpose rules for Why it matters and What to watch are unchanged;
their respective improvements remain later checkpoints. A regression test removes
the four new instructions and recovers the prior prompt fingerprint exactly.

Predeclared prompt SHA-256:
`2976ca639f09e1a68bb675633b352738ee96c086e396910f32b6fe59a390ee46`.
The fixed source, manually selected fact sheet, 110–225 body-word limit,
originality gate and exact-text factual review stay unchanged. One live no-email
attempt, at most five requests and 3,600 requested output tokens; no retry or paid
fallback. Source and draft captures remain encrypted in GitHub artifacts.

Pass criteria for this step: a non-specialist can understand the headline and
core explanation without unexplained technical terminology; necessary names are
identified through what they do; simpler wording does not add unsupported facts,
guarantees, deployments or stronger claims. Both the exact-text source check and a
separate reviewer must pass this scope before the next editorial change. A pass
here is not approval of the complete article, automatic discovery or daily email.

### Plain-language instruction-only result: HOLD

Run [35949335191](https://github.com/itworksinprod/first-fold/actions/runs/35949335191)
used `0e7794a48afb48fa1da3a309e6fe0814e26a1c83`. All four automated field reviews
passed after five requests, but the 119-word body retained unexplained hard
constraints, intermediate samples, pretrained models, trajectory optimization
and optimal control. A green factual check did not satisfy this checkpoint.
No retry or step-two/step-three changes were made for that attempt. All 1,280
software tests passed before publishing. Artifact 10788276230 SHA-256:
`d1147cdb5bdc1106836711d1468ef0cf2a260d9daa895cca2b9176040987d64a`.
Draft SHA-256:
`a013eeb25c9d442a6b7ca3c0a499c0df46553323582e33ca5f126636f2bb0a40`.

The captured request confirms that the writer received jargon-heavy fact entries,
not the source's explicit definitions in P2 and P12. This is an evidence-input
limitation as well as an observed failure to follow the plain-language instruction;
repeating the same run would not address it. The next repair must remain within
step one and be tested separately; factual support cannot be carried across edits.

### Step-one input repair (separate bounded experiment)

The independent reviewer also held the exact text for unexplained terms. The
generic prompt is now frozen unchanged at the step-one fingerprint above. The
fact sheet adds two separately identified definitions, manually paraphrased from
P2 and P12, and restates the mechanism fact in concrete language from P13/P16.
The five development facts, attribution and all unresolved scope flags remain;
no factual capability, benefit, future development or deployment claim is added.
The source excerpt fingerprint is unchanged. This is a manually improved evidence
packet, NOT demonstrated automatic extraction or a topic-independent success.

One new no-email experiment will test that distinct input change under the same
five-request/3,600-token ceiling and original plain-language pass criteria. No
unchanged-run retry, model swap, section-purpose change or email. The new draft
must receive its own exact-text factual and separate plain-language review.

### Definition-enriched input result: clearer, still held

Run [35949619786](https://github.com/itworksinprod/first-fold/actions/runs/35949619786)
used `3d4fb9079e07216007f9830bd8a5095292283069` with the same generic prompt.
Five requests and all four automatic reviews completed; no email or retry.
Artifact 10788490691 SHA-256:
`710c62f0cdf072a14c7ee9fd18f924b356b975bfbdd1bff45e479fdf9c9b715c`.
Draft SHA-256:
`e0a2421baa12d87c3f76f4825c9a76b6d41c5b21dd2897fec362a47c90ff0687`.
The draft explained hard constraints with examples and used the concrete mechanism
description, but retained intermediate samples, pretrained/deployment time and
optimization formulation. Source-backed wording improved; the full plain-language
criterion did not pass. Automatic factual approval again did not close this step.

### Isolated copyediting experiment (still step one)

Independent exact-text review also held the definition-enriched 148-word draft.
Rather than rewriting the evidence into a ready-made article, the new opt-in
`plain-language-second-article` mode adds one presentation-only copyeditor after
the existing writer. The baseline is that run's fresh, privately captured draft,
not an inherited approval. Its normalized text, units and hash are saved before
copyediting; the original raw output is also retained inside the encrypted capture.

The copyeditor receives the draft and the same reviewed facts. It must preserve
claims, attribution, conditions, section placement and per-field unit counts.
It must not add analysis, a benefit, advice or a future development. Fixed prompt
SHA-256: `e72898a39a163fcc1a58023da19e2ff99e54ab65ef20eed445a6c6d2959155b3`.
The final edited text receives the unchanged static and four exact-text factual
checks. Count checks are structural only; separate before/after manual review
must also establish that the copyeditor did not omit, replace or move a claim.

Predeclared budget for this explicit mode only: one writer, one copyeditor, four
review calls; at most six requests and 4,800 requested output tokens. One attempt
per call, no retry, writer fallback, alternative model or paid provider. Existing
modes retain their original budgets. No email, recipient, daily production,
schedule or account change. A step-one pass requires source support, preservation
of the baseline's claims, and plain language before steps two and three begin.
The workflow's existing eight-minute outer timeout remains intentional: very slow
provider responses may end the run before encrypted capture is written. That is
a failed experiment, never permission to bypass review or retry automatically.

### Copyeditor result: clearer prose, factual-preservation veto

Run [35950208529](https://github.com/itworksinprod/first-fold/actions/runs/35950208529)
used `d8426c1609de9f7464c3286ee6c79a9fdc5d556d`. Six requests completed and all
four automatic checks passed. The 154-word edited body was clearer, but exact
before/after inspection caught two material changes: a possible obstacle to a
better answer became an inability to find the best answer; absence of deployment
evidence became a claim that the capability had not been demonstrated. Neither
preserves the baseline's qualification. The automated reviewer approved both.
This run is a factual-preservation failure, NOT a completed plain-language step.

Artifact 10788217869 SHA-256:
`581a3562edab5dedba8297e07b33aac17ad0e5e68f7dfbc9325aff49baa8c73b`.
Baseline draft SHA-256:
`f16bba0d8be5d6baa815d8cf2929bd7510e79c3661fcc10282d2887fd7806120`.
Rejected edited draft SHA-256:
`30df9f73fd82de94ff88df07ccd56d3495dbface5c5a8024ebff4c2caa8b6a52`.
The full suite passed 1,304 tests before publication. No email or promotion was
performed. Next repair stays within copyediting: regression coverage for altered
certainty, comparisons and negative-evidence scope, with a conservative guard
before model review. Such lexical checks do not replace exact-text semantic review.

### Copyediting qualification guard (step one remains open)

Independent review confirmed both material changes above and noted omitted model
category/deployment conditions and added causal phrasing. The copyeditor prompt
now explicitly preserves possibility, comparative degree, category, operating
conditions and the subject of a limitation. New fixed prompt SHA-256:
`c98b26af1c8eef3a40510964b3ab105851862ef0266137ce3aefde22f5d84e81`.

A conservative lexical guard compares modality, degree and negative-evidence cue
counts per aligned unit before any model review. It rejects both observed faulty
sections in the saved capture without another provider call. This is a hold
trigger, not a semantic verifier: benign paraphrases can fail, and category,
condition or causal drift without those cues can still pass. Synthetic tests
explicitly preserve that limitation. Manual before/after and source comparison
remain required and cannot be overridden by a green run.

One new six-request/4,800-token maximum no-email trial will evaluate the distinct
guarded copyeditor. No retry or switch of model; step two and step three remain
blocked until the exact edited result passes factual preservation and clarity.

### Guarded live result: protection verified, article still held

Run [35950798848](https://github.com/itworksinprod/first-fold/actions/runs/35950798848)
used `b86a03de3edf65316823ff3e956f4fa5e5608733`. It stopped at
`FACT_SUMMARY_COPYEDIT_QUALIFICATION` after the writer and copyeditor: two requests,
2,400 requested output tokens, no factual-review calls, no accepted draft, no
fallback and no email. The 120-word raw edit was retained only in the encrypted
diagnostic. The existing source fingerprint was unchanged.

Artifact 10788233781 SHA-256:
`1200d7991d72f701b9117143b88a31d2a069182e737bb7a6fe715d4c4480a498`.
Unapproved normalized edit SHA-256, calculated locally for evidence only:
`8b40172144c62896265d5f394f87edbeeb8cc1d56831d6b64acd2e07bad7075e`.
No provider review or publication approval is implied by that local normalization.

Exact before/after inspection found substantive omissions, not merely a harmless
lexical false positive: the intermediate-versus-final distinction, one experimental
domain, the generative-model category and deployment-time condition, and the
deployment-evidence caveat were removed. The edit also changed can to could and
added a better-results claim to the first unit. The guard correctly held this
version; its success does not solve the readability task. A separate reviewing
agent independently confirmed these omissions and the justified hold. All 1,309 local tests
passed before the run, including negative controls and explicit demonstrations
that same-signature semantic drift can still evade this lexical guard.

The bounded experiment is concluded without a retry. Step one remains incomplete.
Next narrow design: constrain the editor to small, exact phrase replacements in
the immutable baseline, leaving surrounding claims/conditions untouched, then
apply the same qualification checks and exact-text review. This should be tested
as a new isolated checkpoint, not used to override today's hold. Steps two/three,
email, daily promotion, automatic fact extraction and wider generalization wait.

### Exact phrase-replacement checkpoint (step one only)

The user requested restricting edits to small phrase replacements. The opted-in
`plain-language-second-article` diagnostic now asks for substitutions, not a new
draft. The ordinary writer, fact sheet, model, source fingerprint, selection and
four final factual checks are unchanged. This is not wired into daily delivery.

The proposed edit inventory is bound to the exact ordered unit arrays by SHA-256.
Only body fields can change; the headline, unit order and text outside approved
literal spans are immutable. Each proposal permits 1–6 substitutions total and
at most two per sentence. Find phrases have at most five words; replacements at
most eight; each has at most 80 characters. Only lowercase English letters,
single spaces and internal hyphens/apostrophes are allowed. Joined components
count separately. Original changed words cannot exceed 25% of a sentence, capped
at eight. Matches must be unique whole tokens in the immutable original, with an
untouched word between replacements. Unknown keys, stale hashes, missing or
ambiguous matches, omissions, overlapping/adjacent spans, protected qualification
words and whole-draft responses fail closed. No repair retry or original-draft
fallback is added. All remaining text is assembled from unchanged original slices.

Independent preflight review identified supplementary Unicode boundary and
compound-word counting loopholes. Those are fixed with complete-code-point
boundary checks and consistent lexical-component counts; negative controls cover
them. These controls contain an edit, not its meaning: small noun or verb changes
can still alter model category, causality or a caveat's subject. Exact source and
before/after review is mandatory even when all model verdicts are green.

Predeclared live test: one no-email run, fixed MIT article and reviewed fact sheet,
unchanged writer prompt, no article-specific phrase substitutions supplied by us,
at most six provider requests/4,800 requested output tokens, one attempt each.
Success requires valid bounded substitutions, 110–225 body words, all four exact
final-text factual checks, preserved baseline claims/conditions/qualifications,
and an independent clarity/preservation verdict. Any failed gate remains a hold;
do not rewrite the resulting article manually or keep rerunning for a lucky pass.
Steps two/three, email, paid services and production promotion remain out of scope.

Independent recheck found both mechanical issues resolved, with no remaining
blocking finding in this narrow implementation. All 1,317 automated tests pass.
Phrase prompt SHA-256:
`b9d08ea0419d6c2957d5159e90ef0043929d001a1d0ce7f5492d99a4489b6dc3`.

### Phrase-replacement live result: containment passed, wording held

Run [36075869420](https://github.com/itworksinprod/first-fold/actions/runs/36075869420)
used `3d265bd70c2cc72a76b0d546b1e19eb3ba21c343`. All four final-text factual
reviews passed within six requests/4,800 requested output tokens. The model
proposed three replacements, taking the body from 148 to 154 words. Local replay
from immutable baseline offsets reproduced the captured final text exactly.
Independent review confirmed the headline, unit order, all surrounding text,
deployment conditions and deployment-evidence caveat remained unchanged.

This is nevertheless an **editorial HOLD**, not approval of the summary. Two
replacements narrowed general requirements to particular examples, and one lost
the quality dimension from quality goals. The assembled wording also repeated
the safety/physical-limit example phrase and duplicated an adjacent modifier.
Several specialist terms remain unexplained. The independent reviewer confirmed
these defects even though all automated factual checks were green. The prior
wholesale sentence omissions are contained; meaning preservation and clarity are
not yet solved. No email, retry, daily integration or step-two/three work occurred.

Artifact 10840376688 SHA-256:
`0edcc1b4ef6f8e1a2156ea1071e33c7a7fa2bbf165163da494dbdd716fee278b`.
Baseline draft SHA-256:
`f16bba0d8be5d6baa815d8cf2929bd7510e79c3661fcc10282d2887fd7806120`.
Ordered baseline unit SHA-256:
`378ddf7a74ebe3f507f7188ba400fb8f9153046726d3d3ae6aeb77dd105cb3bb`.
Unapproved final draft SHA-256:
`7fc1796f8e3514b378a67c2abb7189850dd551d4517c0063b255763ca0380809`.
Source fingerprint remains unchanged. Decrypted evidence stays outside the public
repository under the local 2026-09-24 review directory.

Next narrow checkpoint, not implemented by this trial: check each replacement in
its full sentence context before approval. Add offline rejection controls for
newly repeated words at replacement boundaries and repeated multiword phrases;
retain semantic negative cases for replacing a general category with examples
or dropping a meaningful modifier. Preserve the original wording on a hold only
as diagnostic evidence, not an automatically accepted fallback. A new bounded
trial needs its own stated criteria; do not rerun this one for a lucky result.

### Sentence-context checkpoint (step one only)

The next user-authorized increment keeps the phrase-only interface and adds local
repetition holds on each complete assembled sentence. It rejects newly increased
adjacent duplicate-word counts or repetitions of any phrase of three or more
lexical words. Counts are normalized, overlapping and compared with the original
sentence; existing repetitions are not silently rewritten. All phrase lengths
are checked because a longer repeated sequence can recombine shorter windows
without increasing their counts. Input is bounded at 2,000 characters and 512
lexical components per sentence to bound that local work.

Replay of the previous encrypted capture holds the opening's duplicated examples
and the watch section's duplicated modifier locally. The significance edit's
scope narrowing does not create repetition, so it still passes this mechanical
guard and requires semantic review. Negative controls explicitly retain this
limitation; no claim of deterministic meaning verification is made.

The same four review requests now include the exact aligned original sentences
in this opt-in mode only. The v3 review hash binds final claims, previous claims,
source evidence and policy. A true verdict requires BOTH source support and
preserved meaning, including no omissions, added assertions, category narrowing,
modifier loss, changed conditions or caveat subject. Prior wording is comparison
context, not evidence. Malformed prior inventories cannot silently use the old
policy. Callers without a prior inventory retain their exact v2 data and prompt.
Automated semantic judgment remains fallible; independent manual review is still
the final checkpoint, not replaced by a green run.

The phrase prompt now asks the editor to evaluate the whole assembled sentence,
leave already explained terms alone, and retain generality and meaningful
modifiers. No supplied source-specific replacements or manually polished draft
are added. Prompt SHA-256:
`c5401ac07ddd1e108a9b608d5fea295087644c033aaaf1f373dd589342c25006`.

Predeclared live check: one fixed-source no-email trial, same model, fact sheet,
writer prompt, 110–225-word body requirement, one attempt per call, and unchanged
six-request/4,800-requested-output-token ceiling. Require local containment and
context checks, all four source-and-preservation reviews, then independent
before/after/source review confirming faithful, genuinely clearer prose. Any
failed gate stays held; no automatic accepted fallback, rerun-until-green,
email, paid provider, daily promotion or step-two/three work is authorized here.

Preflight: all 1,330 tests pass. Independent code and regression review found no
blocking issue; saved faulty output fails the new context gate. The review also
confirmed bounded local work, exact legacy-v2 compatibility and unchanged model
request limits. This clears the implementation for the single trial, not a news
summary for delivery.

### Sentence-context live result: held on a misaddressed phrase

Run [36076772550](https://github.com/itworksinprod/first-fold/actions/runs/36076772550)
used `d11a15609b8926d532f94ec549411895037413a7`. It stopped at
`FACT_SUMMARY_PHRASE_EDIT_MATCH` after two requests/2,400 requested output tokens.
The editor asked to replace a phrase in a sentence where that phrase did not
exist. No accepted draft, fallback, source/preservation review call or email was
produced. This was a malformed edit proposal, not a credential or provider block.

Local replay of the three proposed edits separately shows: the opening's edit
passes mechanical checks; the significance edit has the missing match; the watch
edit would introduce a duplicate modifier and is rejected by the new context
guard. That replay is diagnostic evidence only, not cherry-picking a publishable
subset. The entire proposal remains held. The context protection is tested
against real captured proposals locally; the newly added v3 semantic comparisons
were NOT exercised live because the exact-match gate stopped the run first.

Artifact 10840650725 SHA-256:
`745045c7511e1f2c22c4fd6b787d537a421838fd8b19a672e68cc157ec599247`.
Baseline draft SHA-256:
`37be93ef7ca66ba26abd3640d9474d69b17f5ecbed16277ae4e80f88312d82b4`.
Ordered baseline unit SHA-256:
`14d4af8f9cc3db7909a2f526ad6366ebf7a6257aef6aebb03b29f4f26feb74a4`.
There is no final accepted draft hash. Source fingerprint remains unchanged;
the encrypted capture was decrypted only into the local 2026-09-24 review folder.

This bounded trial ends without a retry. Next small design should make the
sentence/phrase target explicit and mechanically bound, rather than relying on
the editor to infer an array index and repeat a phrase from memory. Preserve
strict exact matching; never use fuzzy retargeting or silently drop rejected
edits. Step one remains open, and steps two/three and daily/email integration wait.

Independent exact-text review confirmed the missing target and the further
duplicate/modifier-loss defect, while judging the first isolated substitution
faithful and clearer. It recommends a frozen, baseline-bound catalog of exact
editable spans (IDs, locations and sentence context), with the model returning
only an existing span ID and replacement. That is the next addressing-only
checkpoint, not permission to bypass any meaning or quality hold.

### Frozen phrase-catalog checkpoint (step one only)

The next increment removes model-supplied phrase locations. The program enumerates
eligible exact body spans using the same grammar, protected-word, whole-token,
unique-match and per-sentence coverage rules as the existing application guard.
The editor receives those spans, their complete sentence context, and a dynamic
schema; it returns only an existing span ID and new wording. It cannot supply a
field, sentence index, find phrase or offset. No source-specific phrase choices
or manually improved article text are supplied.

The ordered catalog is deeply frozen, baseline-hash-bound (including the unchanged
headline) and bound to its issued object through private runtime state. A catalog
hash binds its version, sentences, span IDs, order, text and positions. Stale
baselines, copied catalogs, unknown/duplicate IDs, extra locations and invalid
edits hold the entire proposal. All resolved substitutions enter the existing
batch guards together; there is no fuzzy match, dropped edit or accepted original
fallback. Empty catalogs or catalogs above 512 spans/40,000 serialized UTF-8 bytes
hold before the editor request, without truncation.

Tests found a local-input edge case where a hidden array serialization method
could disguise a changed baseline. Baselines now require ordinary own data
properties and dense native arrays, rejecting custom methods, inherited indices,
accessors and additional properties. Provider JSON cannot contain such methods,
but local callers now receive the same dependable binding. Exact boundary tests
cover 512/513 spans and 40,000/40,001 bytes, including multibyte input.

All 1,344 tests pass. Independent code review found no blocking issue for the
isolated JSON provider path. An offline six-response mock using the previous
captured MIT baseline and real fact sheet measured complete serialized provider
requests of 4,990 / 45,874 / 10,313 / 11,792 / 11,108 / 10,868 bytes (limit 70,000)
and a full capture of 110,641 bytes (limit 350,000). That is transport-size evidence,
not factual approval or a live success. The baseline produced 367 eligible spans;
the previous nonexistent significance-section target has no selectable ID.
Prompt SHA-256:
`be49e5d0207620e8d2b95758a23d4d2c2d05fe81069e6487efe66c20d19d0fa6`.

Predeclared trial: one no-email `plain-language-second-article` run on the unchanged
fixed MIT article/fact sheet and writer prompt, with the same free model, six-call
and 4,800-requested-output-token ceilings, one attempt per call. Require a valid
issued-ID proposal, all local gates, a 110–225-word body, four final source and
before/after reviews, and an independent exact-text verdict confirming preserved
meaning and genuinely clearer prose. IDs prove location, not meaning. A failure
remains a hold; do not retry for a lucky result. No daily promotion, recipient or
schedule changes, email, billing, step-two/three work or automatic fact extraction.

### Frozen-catalog live result: valid addresses, unchanged-edit hold

Run [36078074990](https://github.com/itworksinprod/first-fold/actions/runs/36078074990)
used `c571d919f1f6cc5ba76083cfb7f993d72ea71409`. It stopped at
`FACT_SUMMARY_PHRASE_EDIT_UNCHANGED` after two requests/2,400 requested output
tokens. The entire proposal stayed held; no accepted draft, four-field semantic
reviews, fallback, retry or email followed. This was a model-proposal defect,
not a provider quota or credential failure.

Rebuilding the catalog locally reproduced all 380 spans and its hash exactly.
All six proposed IDs existed and identified exact original spans in the right
sentences; the prior missing-target defect did not recur. The first proposed
edit replaced a phrase with itself, and the last did the same. The first sentence
also had three proposed edits, exceeding the two-edit batch limit. No invalid
edit was silently removed to produce an accepted subset. The baseline had 148
body words; there is no final accepted draft hash.

Artifact 10840816676 SHA-256:
`329f4c1ecf1810965b88e8605acdfb949f941cf06e27514ee1b63183bd8558a6`.
Baseline draft SHA-256:
`e0a2421baa12d87c3f76f4825c9a76b6d41c5b21dd2897fec362a47c90ff0687`.
Ordered baseline unit SHA-256:
`7c861c82935843bcf4d249d0267e76182b17cd95d8c9a37abbe82a82b4a36acc`.
Catalog SHA-256:
`a7bd81c9b194e314233b9267ae4c992369d8c272fea2c4b14552cdcaa4f3272b`.
The source fingerprint is unchanged; decrypted source/model data remains only in
the local 2026-09-24 review directory, outside this public repository.

Independent exact-text review confirmed the whole-batch hold and catalog/source
hashes. Besides the no-ops and three-edit limit violation, two opening targets
were adjacent with no untouched word between them. Meaning and clarity remain
unqualified: changing hard constraints to tight constraints confuses mandatory
status with restrictiveness, and changing optimization formulation to improvement
formulation loses precision while remaining awkward. Two minor synonym changes
were harmless but did not adequately resolve the remaining jargon. No subset is
approved; the v3 before/after review calls still have not executed in a live run.

This completes the bounded addressing trial, not step one. The next small
experiment should ask for one meaningful, source-supported technical-phrase
replacement or an explicit abstention, rather than a batch of up to six edits.
An abstention must not be counted as an improved or approved article; retain all
existing vetoes and independent exact review. Any manually chosen focus must be
identified as a targeted/manual experiment, not generic selection success. This
next experiment is not implemented by this result record. No retry, email or
daily production change occurred.

### One phrase or abstention checkpoint (step one only)

The user authorized the next incremental change: ask for one meaningful phrase
replacement, not a batch. A new opt-in decision wrapper requires exactly the
catalog hash, a `replace` or `abstain` decision, and a replacements array. Replace
requires exactly one existing span ID and replacement; abstain requires an empty
array. The runtime enforces this pairing independently of the response schema.
The old batch catalog and lower-level phrase guards remain unchanged.

Both decisions require the issued frozen view and unchanged original inventory.
Strict own-data descriptors and dense native arrays reject inherited values,
getters and hidden serialization/iterator methods without invoking them. An
unknown target, unchanged phrase, extra edit, malformed decision or invalid
substitution is still an error, never converted to abstention or silently dropped.
A valid abstention is captured as `FACT_SUMMARY_COPYEDIT_ABSTAINED` and stops the
diagnostic before any accepted draft or final review call. It remains a red/held
run, not a successful summary or acceptance of the unchanged writer output.

The generic prompt asks for one complete technical phrase whose meaning is
established by the supplied facts, with genuinely easier wording in its full
sentence. It discourages isolated modifier swaps and familiar-word synonyms.
It supplies no manually chosen target, source-specific vocabulary or replacement.
This is an instruction, not a mechanical proof of term completeness or meaning:
the catalog still includes fragments, and all source/preservation and independent
readability checks remain required. Prompt SHA-256:
`2fa180aeda7b76ddc6ff1e87e9686d9e0cbf395c76d4801963cc76f150932719`.

All 1,359 tests pass, including eight independent new test groups and integration
checks for both decision branches, malformed abstentions, no-op holds and the
unchanged ordinary five-call mode. Independent code review found no blocking
issue. Offline mocked replay of the prior MIT baseline and real fact sheet gave
complete request sizes of 4,990 / 47,919 / 10,313 / 11,798 / 11,066 / 10,868 bytes
and a 112,919-byte capture. The abstention branch stopped after the first two
requests, with a 78,662-byte capture. Both fit the unchanged 70,000-byte request
and 350,000-byte capture caps; these are size/control-flow tests, not semantic
approval or live results.

Predeclared live trial: one no-email `plain-language-second-article` run, unchanged
MIT evidence/fact sheet, writer prompt, free model, and six-request/4,800-requested
output-token ceiling; one attempt per request. Success requires one meaningful
replacement, 110–225 body words, all existing mechanical checks, all four exact
source/preservation reviews, and independent clarity/meaning approval. A valid
abstention is a safe hold, not completion. No retries for a lucky result, accepted
original fallback, email, billing, daily promotion or step-two/three changes.

### Single-phrase live result: mechanical pass, semantic review hold

Run [36083381051](https://github.com/itworksinprod/first-fold/actions/runs/36083381051)
used `f2b7693fbfdb6e2dbab406ddde2006c0fdbf83f7`. The single replacement passed the
local gates and all four automated source/preservation reviews within six calls
and 4,800 requested output tokens. The body remained 148 words. No email was sent.
The run was green, but its status was only `draft-awaiting-manual-review`.

Independent exact-text review **holds** this draft. The only edit changed hard
constraints to tight limits. The source defines the former by nonnegotiability:
requirements must be met, not merely restrictive or narrow limits. The replacement
does not adequately preserve/explain that distinction. Other specialist terms
remain unexplained, so the full article has not met the readability checkpoint.
All other wording, attribution, conditions and caveats remained byte-identical.

Catalog reissuance and single-edit replay reproduced the exact final text and
hash. All four captured requests equal rebuilt v3 source-plus-before/after review
inputs and response hashes match. Thus the preservation policy genuinely ran
live; this is not a stale review or wrong-input problem. The model's short
source-match verdicts nevertheless missed the meaning shift. A green automated
review does not override the independent hold. The abstention branch remains
verified offline only; this live model chose replacement.

Artifact 10843221833 SHA-256:
`a2c2c193d556ddfec0fd3cd4ed3ee1e08854bc3b90c9254a22d07c886743b27d`.
Baseline draft SHA-256:
`e0a2421baa12d87c3f76f4825c9a76b6d41c5b21dd2897fec362a47c90ff0687`.
Ordered baseline unit SHA-256:
`7c861c82935843bcf4d249d0267e76182b17cd95d8c9a37abbe82a82b4a36acc`.
Unapproved final draft SHA-256:
`23fe1cae95d7a76bbe8c32c91265ae495d5a63cf71efcdc4dfe4cd61d97ecb61`.
Catalog/source fingerprints match the previous fixed-source trial. Exact capture
size is 112,481 bytes, retained decrypted only in the local 2026-09-24 review folder.

This completes the one-edit implementation/test checkpoint, not step one or
delivery qualification. The next independent recommendation is a small isolated
reviewer check using frozen neutral sentence pairs: faithful definition paraphrase
versus changed dimension, lost modifier/category or dropped condition. Keep
expected labels out of model inputs; use no writer/editor regeneration, manually
fixed article, source-specific replacement rule or retry-until-pass. This tests
the observed reviewer false-positive separately from editor proposal quality.
No further live test, daily promotion, email or step-two/three work occurred here.

### Fixed preservation-review controls (step one diagnostic only)

The next authorized checkpoint isolates the reviewer from the writer/editor.
The opt-in `preservation-review-controls` mode makes six separate stateless
requests, each containing one frozen synthetic source and one before/after pair.
Two edits preserve meaning; four lose an obligation, modifier, category or
observed operating circumstance. The negative final sentences are themselves
source-supported: rejection must catch the preservation loss rather than merely
the absence of source evidence. Independent review corrected an ambiguous use
of “enforces” before freezing the obligation/restrictiveness contrast. The
credential example does not claim that credential validity was proven necessary
or that requests would fail after expiry; it tests retention of an observed
operating circumstance only.

Frozen case-set SHA-256:
`d17df1cf570ba50385b56b837c30d566c98ee46777e44cad70ac30169f4e70cb`.
The existing v3 reviewer prompt is unchanged (SHA-256
`04b918fe7e676bfbbab9e77cc10a343e1e7645d23c64b572a37dfa653e3c612a`).
Its comparison-length suffix, schema transport, model, temperature and per-call
limits match the actual fact-summary reviewer. Expected labels, case IDs and
rationales remain evaluation-side and are not in model messages. No previous
response or correction is supplied to a later request.

Predeclared trial: one run, at most six inference/network calls and 3,600
requested output tokens, one attempt per call. All six valid labels must match
the frozen answers; a majority, all-accept or all-reject result cannot pass.
Valid wrong answers are recorded while the remaining fixed cases continue.
Malformed responses, provenance/network violations and provider/quota failures
stop the trial without a retry or alternate model. Exact requests, responses,
labels, rationales and hashes are encrypted for local independent inspection;
public output contains only bounded status/counts and per-case validity/results.
No research, article fetching, writer, copyeditor, email, edition or promotion
runs in this mode. A six-case pass would be evidence on these controls only,
not proof of general reviewer reliability or completion of step one.

Independent code preflight found no blocking issue and independently verified
the frozen hashes, hidden answers, exact prompt assembly and failure boundaries.
Offline mocked replay through the real request builder produced request sizes
of 3,979 / 4,031 / 3,959 / 4,030 / 3,944 / 4,064 bytes and a 36,067-byte capture,
within the existing limits. These mocked labels establish plumbing/size only,
not semantic performance. The inherited eight-minute workflow deadline can stop
six worst-case 90-second responses before the final encrypted artifact exists;
such an interrupted trial cannot pass or qualify the reviewer.

All 1,366 automated tests pass, including seven independently authored diagnostic
test groups. Those tests caught two noncompliant-adapter edge cases before any
live request: forwarding after a swallowed refusal and invoking a retained
callback after the diagnostic returned. The new runner now latches any refusal
and closes each callback on both success and failure. Regression tests and
independent re-review verify both fixes. Existing reviewer/editor policies and
ordinary production paths remain unchanged.

### Preservation controls live result: two false approvals

Run [36086122705](https://github.com/itworksinprod/first-fold/actions/runs/36086122705)
used `08a946f19fed700ebfd4c488b13a08f4372ca428`. All six calls returned structurally
valid, exactly bound responses. Four answers were correct; the unchanged reviewer
falsely accepted two source-supported but unfaithful edits. The predeclared gate
correctly failed with `PRESERVATION_REVIEW_MISCLASSIFIED`, not a provider, quota,
transport or malformed-output failure. No retry or further live request followed.

| Case | Expected | Live result | Interpretation |
| --- | --- | --- | --- |
| PR01: mandatory → must meet | Accept | Accept | Faithful rewrite recognized |
| PR02: mandatory → narrow range | Reject | Accept | Obligation replaced by restrictiveness |
| PR03: remove noise-resistant | Reject | Reject | Meaningful modifier loss caught |
| PR04: pretrained → already trained | Accept | Accept | Faithful rewrite recognized |
| PR05: category → selected examples | Reject | Accept | Narrowing wrongly allowed |
| PR06: remove observed credential condition | Reject | Reject | Operating circumstance loss caught |

PR02's comparison said “Matches source”; PR05's said “narrower claim” yet still
approved it. This is evidence that the model sometimes prioritizes truth in the
source over before/after preservation despite the existing explicit instruction.
It is not evidence that a broader rewrite is safe, or that the reviewer reliably
detects all other kinds of drift. Two faithful positives and two negative types
passed only on this small fixed sample.

The encrypted artifact ID is 10843677400; its downloaded ZIP SHA-256 matches the
GitHub digest:
`7bc7306c9a0ce290d9efcf76e3e5e8a2a71d1de914660d6a01dd848d50660193`.
Exact local replay verified all six frozen inputs, v3 prompts, suffix/schema
assembly, request hashes, response review hashes and computed outcomes. The
serialized capture is 35,957 bytes. Six inference/network calls used at most
3,600 requested output tokens; zero search requests and no email. This closes
the isolated measurement checkpoint, not step one or reviewer qualification.

Independent audit confirms the hold and those exact input/outcome bindings. Raw
provider envelopes are intentionally absent: their recorded response SHA-256
values have validated shape/provenance but cannot be independently recomputed
from the parsed editorial payload alone. This limitation does not affect the
recomputed request/review hashes or the observed classification errors.

Next smallest recommended checkpoint: an opt-in controls-only variant with
separate `sourceSupported` and `meaningPreserved` judgments, separate short
comparisons, and local AND acceptance. Keep this frozen case set, model, budget,
and ordinary v3/publication paths unchanged. All six final claims are
source-supported; only PR01/PR04 preserve the original meaning. Require both
dimensions correct for every case, not merely the combined classification.
This next variant is not implemented here. No newspaper delivery, paid provider,
billing, schedule, recipient or editorial-threshold changes occurred.

### Separate source and preservation judgments (controls-only checkpoint)

The user authorized the next small change. New opt-in mode
`split-preservation-review-controls` uses an experimental v4 response contract:
each claim receives its own `sourceSupported` and `meaningPreserved` booleans,
with separate short comparisons. Acceptance is their conjunction computed
locally, never an overall model-issued approval. Source support still requires
1–3 valid evidence IDs even when preservation is false. The prompt distinguishes
truth in the source from faithful editing, and checks both source-true additions
and loss/narrowing. It contains no case-specific wording or expected answers.

The v4 policy, complete before/after inventory and source passages bind a new
review hash. Only an issued frozen view accepts its exact response shape and
complete unique claim IDs. Missing fields, stale v3 hashes/verdicts, strings in
place of booleans, invalid evidence, sparse/accessor arrays and extra properties
are rejected. The v3 builder, prompt, schema, ordinary fact-summary flow and
production reviewer are not edited.

The unchanged six controls remain frozen at
`d17df1cf570ba50385b56b837c30d566c98ee46777e44cad70ac30169f4e70cb`.
V4 prompt SHA-256:
`bc3477446736333236b73d6b31736c46d726e762a34c48c0d124afe41d6df962`.
Expected dimensions stay audit-side: all six final sentences are source-supported;
only PR01 and PR04 preserve meaning. Both dimensions must be correct in every
case, not just the combined AND. A false source verdict cannot earn a correct
rejection by accident. These controls test preservation discrimination, not
detection of unsupported source claims or general reviewer reliability.

Predeclared live trial: one no-email run, same model, six stateless calls at most,
600 requested output tokens per call, same temperature and transport bounds,
one attempt per call, no correction feedback or extra provider. Valid wrong
answers continue through the fixed set; malformed/provider/transport failures
stop. Existing refusal/lifetime guards and encrypted-only evidence remain.
No fixture edits, writer/editor calls, article fetching, search, billing,
delivery, production promotion, or step-two/three changes belong to this trial.

Preflight: all 1,375 automated tests pass, including nine independently authored
new test groups. Testing caught sparse input inventories and validation after
cloning; the v4 builder now rejects sparse inventories before using the old
builder, and the diagnostic validates the exact v4 object before cloning it.
Invalid v4 objects are not traversed for capture: the audit records null plus
`responseRejectedBeforeCapture`, then stops as malformed. Valid but incorrect
judgments still retain their exact content for inspection. Independent review
verified these fixes and found no blocking issue. It also clarified the generic
replacement-direction wording before the final prompt hash was frozen.

An offline replay through the real request builder with mocked answers measured
3,940 / 3,992 / 3,920 / 3,991 / 3,905 / 4,025 request bytes and a 38,413-byte
serialized capture, within unchanged limits. This verifies plumbing and size,
not live semantic accuracy. Existing v3 controls and production tests still pass.

### Split-judgment live result: all meaning decisions correct, one source error

Run [36087196399](https://github.com/itworksinprod/first-fold/actions/runs/36087196399)
used `8d8e16ea6ff7e09c08785b1cac921b3e9cc2dc9a`. All six responses were structurally
valid. Meaning preservation was correct on all six controls, including both
previous false approvals. Source support was correct on five controls. Thus
five cases met the predeclared two-dimension criterion; the run correctly
remained red with `PRESERVATION_REVIEW_MISCLASSIFIED`.

| Case | Source judgment | Preservation judgment | Both dimensions correct |
| --- | --- | --- | --- |
| PR01 | True | True | Yes |
| PR02 | True | False | Yes |
| PR03 | True | False | Yes |
| PR04 | True | True | Yes |
| PR05 | True | False | Yes |
| PR06 | False | False | No: source should be true |

PR02 now identifies the lost mandatory status; PR05 identifies the lost broader
category. PR06 correctly identifies a lost credential condition, but its separate
source comparison says “missing expiration detail” and returns false. The
sentence still describes only the observed trial, during which no requests
occurred after expiry. Missing that contextual detail is a preservation loss,
not by itself evidence that the retained observation is false. PR03's source
comparison also discusses a missing detail while its source boolean is true,
so the model's separation is not yet consistent.

The local combined accept/reject result is correct on all six, but that does not
override the stricter requirement that both judgments be correct. No relabeling,
gate relaxation or retry was used to obtain a green status. This is limited
evidence from one previously used fixed set, not a general accuracy measurement.

Artifact 10844606680 ZIP SHA-256 matched the GitHub digest:
`1598e5de40133e0bc8d2cc3a3a6523d91c5c47b127235bf78a946265959fbbd5`.
Local replay rebuilt all six exact inputs, prompts, schemas and request hashes,
validated response review hashes, and recomputed both judgments and local AND
outcomes. The capture is 38,448 serialized bytes. Six model/network calls, at
most 3,600 requested output tokens, zero searches and no email. Raw provider
envelopes are absent, so their recorded response hashes cannot be independently
recomputed from the parsed responses. Step one and production qualification
remain on hold; this bounded split-review trial itself has finished.

Independent audit confirms the exact bindings, outcomes and hold. Its smallest
next recommendation is to clarify only the generic SOURCE SUPPORT instructions:
judge assertions actually made, not completeness against previous wording or
every source detail. Omission alone need not make a claim unsupported, but an
omission that broadens scope or strengthens the assertion still can. Freeze the
preservation instructions, schema, case set, model and budget for that separate
trial. This recommendation is not implemented here. No further live run,
relabeling, promotion, delivery, paid-provider or billing change occurred.

### Source support versus completeness: narrow follow-up

Carlos asked to continue until step one is functionally ready, retaining the
incremental test/review workflow. The next change adds only three generic
sentences to the v4 SOURCE SUPPORT instructions. Judge assertions actually made;
missing details alone are not unsupported claims, but missing conditions that
broaden scope or certainty still fail. The meaning-preservation block, schema,
six cases, labels, model and budgets remain unchanged. Prompt SHA-256 is frozen at
`c017f5f4154c07e31f3e82f2ac4eda4ca0d517c4c91ebecb92b82c898609459a`.

Predeclared trial: one fixed six-case run, at most six network/model calls and
3,600 requested output tokens, no retries or correction feedback. Both dimensions
must be right in every case. Passing this reused set is only a prerequisite:
independent held-out source-negative cases and a preserved, readable 110–225-word
article must pass before step one can be called ready. No email, daily promotion,
recipient, schedule, threshold or billing change is authorized by this trial.

The clarification did not resolve the error. Run
[36089683469](https://github.com/itworksinprod/first-fold/actions/runs/36089683469)
on `006565c4663e15d1b34aa5f2bdaf4b0b54aef6ea` returned six valid responses, five
fully correct cases, and the same PR06 false source rejection (“condition
omitted”). All six preservation decisions were right. The expected labels and
strict hold remain unchanged. Artifact 10845665189 SHA-256:
`9fc7747eb2672e821df228294c002e16b3a3bcf5e66312d998e12c4d235acceb`.
Independent replay checked exact inputs, prompt, schema, request hashes and
outcomes. No unchanged rerun was attempted.

### Isolate the two review contexts

The next incremental hypothesis is context interference: asking about loss of
meaning in the same request may contaminate source-support assessment. New
opt-in controls make two stateless requests per case. Source-only sees the final
claims and passages, never the previous sentence. Meaning-only sees both versions
and the passages, never the source verdict. These are separate requests to the
same free model, not independent providers. Role-specific hashes and exact
schemas bind each response; the local program computes their conjunction.

Freeze both prompts before running. Predeclared original-set trial: six unchanged
cases, twelve calls maximum, 600 requested output tokens per call (7,200 total),
one attempt each, no correction feedback. Each call has a 30-second timeout,
bounding provider waits to six minutes within the existing eight-minute job.
Failures stop and seal available evidence. Valid negative/wrong judgments do not
skip the other dimension. Prior diagnostic modes and budgets remain unchanged.

An independent reviewer authored and separately adjudicated four fresh controls
before any provider call, one per source/preservation truth combination. Their
frozen hash is `e7e009c6cecb1f4c95e24c4d546517a9cc04db9e1ad7518ab319177cbefd1b9b`.
The optional holdout mode uses only those four fixed cases, at most eight calls
and 4,800 requested output tokens with the same frozen policy. It is reserved
until the original controls pass, and cannot select arbitrary inputs. Both
dimensions and their explanations require independent audit; neither gate is
weakened. No email, paid research, billing, daily delivery or editorial promotion.

Preflight caught a new-contract mistake before live use: requiring publisher
citations for a true meaning judgment would conflate source truth with equality
of the two sentences. The isolated meaning response therefore permits 0–3 known
IDs (useful for source-defined terms), while a true source judgment still needs
1–3 supporting IDs. Both judgments remain independently required; an unchanged
false claim passes preservation only and is still rejected by source review.
Old reviewer contracts are untouched. Frozen prompt SHA-256 values:

- Source: `153fe4f6767cae01903dd734dbb12245ba914ada5bd97d4506a1fb2a8006b4a7`.
- Meaning: `80f9d3a58321336d6c9c380643de06e709f393732da37dc8e7591a41dc5d1532`.

Preflight: all 1,389 automated tests pass, including 13 new isolated-builder and
runner groups. Tests cover all truth combinations, context isolation, malformed
objects before cloning, replay, encryption, provider failures and closed request
callbacks. Independent read-only review and real-adapter offline mocks found no
blocking issue. Mock success verifies transport/scoring, not model reliability.

Live original-set run
[36090597465](https://github.com/itworksinprod/first-fold/actions/runs/36090597465)
on `e1700c92d0817a59e6b5c31182d45ce085a0bab2` passed all six cases on both
dimensions (twelve valid responses/calls, 7,200 requested output-token cap).
PR06 now has source=true and meaning=false; the preservation explanation names
the lost credential-validity condition. The other previous meaning failures
remain rejected. This is evidence for the context-isolation hypothesis, not a
general accuracy estimate. No prompts, labels or fixtures changed during the run.
Artifact 10845960518 ZIP SHA-256 matched GitHub:
`5aa88b941c0b4740f2a1503ca6482fb2c76b1e8fb4b841eab4fe4de7563b01ec`.

The independent audit verified all exact bindings and permitted the frozen
holdout trial. Run
[36090841497](https://github.com/itworksinprod/first-fold/actions/runs/36090841497)
used the same `e1700c9` revision and unchanged prompts. Eight valid responses:
source judgments 4/4 correct, preservation 3/4 correct. PH03 correctly failed
source support but incorrectly failed preservation despite identical before/after
sentences. The other three pairs passed. Thus the unchanged strict gate correctly
held at 3/4; no article integration or step-one approval followed. Artifact
10846050861 ZIP SHA-256 matched GitHub:
`b8519a6ca049d4cd4b7c6ebbb655da3d1fba93a9da363ea33728762d4c5f5c7b`.
This set is now a regression set, not an untouched holdout for future revisions.

### Text-only meaning and exact identity

Independent audit confirmed PH03's factual-context contamination. The next
opt-in experiment separates the roles completely: source review keeps all
publisher evidence and its frozen prompt; meaning review receives only aligned
before/after sentences. It checks language equivalence, not factual truth. If an
unknown specialized term needs an unavailable definition, the meaning gate must
hold rather than invent one. This loses source-assisted term disambiguation; it
is not an automatic reliability claim.

After validating and binding the full inventory, byte-identical before/after
text has a deterministic local preservation result. It skips only the meaning
request, never source checking. No normalization or matching by partial text is
allowed. Local decisions have separate provenance and zero provider calls; no
provider response is fabricated. Any changed unit requires complete model review
of the aligned inventory. Old diagnostic modes remain unchanged.

Freeze text-only meaning prompt SHA-256:
`f5fb2ef48f411206c144deb92d0956e6fa89d63cdbb521c71d4caf5ede221e27`.
The independent reviewer supplied fresh PH05 before implementation: a false
shipping assertion rewritten from active to passive voice. Labels false/true
and all quantities/actor/time were independently checked. It cannot take the
identity shortcut. Separate fixture SHA-256:
`4efffdd8cda3804ab7e3eaa865d6ab890090ee5026e0bb3550fb2317f851c21e`.

Predeclared order, one run each and no result-dependent retries: fresh PH05
(two calls/1,200 requested output tokens), then the original six controls
(twelve/7,200), then the unchanged four-case regression set (seven/4,200 plus
one local identity check). Stop on a failed gate, diagnose before changing
anything, and retain every outcome. The existing strict both-dimensions criterion
and transport timeout/limits remain. No article, email or daily promotion follows
without its own exact-text review. Sentence-level rewriting is a separate user
choice; the existing phrase-only editor has not been expanded.

Preflight: all 1,400 automated tests pass, including eleven new text-only/identity
test groups. Independent review found no blocking issue. Offline real-adapter
mocks checked new and legacy modes, source failure before the identity decision,
and PH05 taking the actual model path. Prompt and fixtures are frozen for the
predeclared live sequence.

Fresh PH05 run
[36092178986](https://github.com/itworksinprod/first-fold/actions/runs/36092178986)
on `d4dedef3f02fa6841dd5575eb8e149ab756211d8` passed both labels with two actual
provider calls and zero identity shortcuts (1,200 requested output-token cap).
Source=false correctly cites that none of the crates shipped; meaning=true
recognizes the active/passive paraphrase. Independent replay verified the exact
fixture, prompts, schemas, request bindings, verdicts and provenance fields.
Artifact 10846395966 ZIP SHA-256 matched GitHub:
`b97d814a3824ab51bb3ca663bf62be12c44d5816274c3b6595c194fbb6db1ff3`.
This single fresh case is not an article or step-one qualification.

Original six-case run
[36092326305](https://github.com/itworksinprod/first-fold/actions/runs/36092326305)
used the same frozen revision and passed 6/6 on both dimensions. Twelve actual
calls, zero identity shortcuts, 7,200 requested output-token cap. Preservation
correctly rejected replacing mandatory limits with narrow limits, dropping a
noise-resistance modifier, narrowing a category to examples, and removing the
credential-validity condition. Artifact 10845558182 ZIP SHA-256 matched GitHub:
`245cbd1247318d0d3634ba2ad32b5870616dc1bb34b4c8dec799a1157d047838`.

Unchanged four-case regression run
[36092496797](https://github.com/itworksinprod/first-fold/actions/runs/36092496797)
on the same `d4dedef` revision passed 4/4. Seven actual calls, one separate local
identity decision, 4,200 requested output-token cap. PH03's source contradiction
was still rejected; its unchanged wording was recognized locally rather than
assigned a fabricated model response. The changed lighting condition and removed
battery-powered qualifier were both rejected. Artifact 10846435998 ZIP SHA-256
matched GitHub:
`5fc2ba10822f121ec0838ad9898d1be414c65aef9436630a92156bbca41ee4ff`.

These three live trials used the same frozen prompt revision, with no unchanged
retries: eleven distinct cases, twenty-one actual calls, and one local identity
decision. Ten cases were previously exercised regressions; only PH05 was new to
the provider. This is a bounded reviewer qualification, not a general accuracy
estimate or proof that the article is readable. Step one remains held.

### Article integration of the qualified separate reviewers

The next narrow integration keeps the existing single-phrase-or-abstain editor
and writer unchanged. Each final article field receives a source-only check;
meaning checks see aligned before/after text only, with exact identity recorded
locally for untouched fields. Both checks must pass; source failure can never be
overridden by identity. The headline remains immutable. The maximum is seven
actual calls and 5,400 requested output tokens (two 1,200-token writing/editing
calls, four 600-token source calls and one 600-token changed-field meaning call),
plus three local identity checks. Reviewer timeouts are 30 seconds; writer/editor
timeouts remain 90 seconds, within the existing eight-minute workflow limit.

After local tests and independent preflight, allow one fixed-article live trial
with unchanged prompts, then independent exact-text source/meaning/readability
review. Retain the actual result even if the editor abstains or the article is
awkward. Do not rerun unchanged for a lucky draft. No email, daily integration,
editorial threshold change, or sentence-level rewrite is authorized by this
reviewer integration. Permission to expand beyond phrase edits is still pending.

Article integration local verification: all 1,402 automated tests pass, including
64 targeted fact-summary/preservation groups. Tests cover the seven-call budget,
three local identities, mandatory source checking, same-role stale review hashes,
malformed payload rejection before capture, 30/90-second timeout split, skipped
or swallowed transport failures, and callbacks invoked after their request ends.
Legacy diagnostic modes, writer/editor prompts and the source fact sheet are
unchanged. No live article result is claimed by these offline tests.
Independent preflight found no blocking issue and approved the one bounded
phrase-only article trial. It did not approve sentence-level rewriting or
completion of step one.

Live article trial
[36092991729](https://github.com/itworksinprod/first-fold/actions/runs/36092991729)
on `82283d0169e8dcc8d2e58e611f6f0a8e20e11257` stopped with
`FACT_SUMMARY_REVIEW_REJECTED`: five actual calls, 4,200 requested output-token
cap, one local identity decision, only the headline passed. The phrase editor
again proposed `hard constraints` → `tight limits`. The three what-happened
source judgments accepted the text, but the new meaning reviewer rejected its
changed first unit while accepting the two unchanged units. The mandatory
combined gate therefore blocked the draft before later fields or any email.
This is a functioning rejection safeguard, not a successful plain-language
article or completion of step one. No unchanged retry was attempted.

The 148-word draft meets the length bound but remains unapproved. Exact local
replay verified the issued phrase catalog, applied substitution, unchanged
surrounding units, source fingerprint, final hash, review requests/verdicts and
separate headline identity record. Artifact 10846511708 ZIP SHA-256 matched
GitHub: `b795eb6319d5a556e3166b2cf96f9b54b34e9856e2043c31dbeb22c9a9365421`.
Baseline SHA-256:
`f16bba0d8be5d6baa815d8cf2929bd7510e79c3661fcc10282d2887fd7806120`.
Final SHA-256:
`ebec66ee33388377d78db5476e19b84cbfef50f880cd597509bd7ce89743f33e`.
The source remains the manually reviewed MIT excerpt
`081196aa0f2c507e6b75f5a7018a594af882468006401c1b1428f96e4eb74801`.

The next proposed change is a bounded sentence-by-sentence rewrite with fixed
facts, ordering and headline, separate source and meaning checks, and independent
exact-text review. This expands the user's earlier phrase-only restriction, so
the requested permission remains a necessary decision before implementation.
No daily delivery, recipient, schedule, billing, or public edition changed.

Independent exact-text audit confirmed HOLD. It replayed all five requests,
source/catalog/substitution/final bindings and the headline identity. The
preservation veto is justified: nonnegotiable requirements are not synonymous
with tight limits. Both before/after bodies are 148 words. Other factual content
and the deployment caveat remain intact, but unexplained intermediate samples,
pretrained models, deployment time and optimization formulation still impede
plain-language readability. Later fields never completed automated review.
The review safeguard checkpoint is complete for this bounded trial; step one
as a whole remains incomplete pending the editing-strategy decision and a
passing exact-text article test. Steps two and three have not begun.
