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
