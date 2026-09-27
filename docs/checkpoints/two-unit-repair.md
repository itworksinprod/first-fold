# Review-guided two-unit repair

Status: two live repairs held, including an automated pass rejected by full-text
review. Complete-task refinement passes preflight; its live prose is unqualified.

This is a manually scoped repair experiment on saved research. It is not proof
of an unassisted general writer, source discovery, daily reliability or paid-model
equivalence. It does not send an email or modify production delivery or billing.

## Two explicit baselines

- The exact unapproved 149-word output of run 36289375100 is the editor seed.
  Only its U1/U6 may change; U2/U3/U4/U5 and the headline remain byte-exact.
- The original 148-word source-qualified baseline remains the final meaning
  reference. Definitions and name anchors also come from the original units.
  In particular, locked seed U3 still differs from the original and must receive
  its own meaning review. The final changed-unit budget also uses the original.

Private repair packet SHA-256:
`37c21351754b87a32c9251a8a7cde4c60f2c3d046b3b9bd6b4fb367b6868f60a`.
Original units SHA-256:
`7c861c82935843bcf4d249d0267e76182b17cd95d8c9a37abbe82a82b4a36acc`.
Seed units SHA-256:
`add4bab848b9a5421d6181b08394c8ec4901c886109a9230e0e66d6647f5d9d9`.

The small new private input contains only the seed units, lineage/binding hashes,
and fixed repair feedback codes. Original context, sources and credentials stay
unchanged. No hand-written replacement sentence is supplied. Generic editing
guidance requests concise mandatory force and complete defining components and
relationships rather than a broad category or a definition's opening clause.

The repair modes are owner/main/manual-only. Their separate secret
is exposed only to those modes' validation and execution steps. Plaintext remains
outside the public repository. The original modes remain unchanged/replayable.

## Acceptance and ceilings

One GPT-OSS editor: at most 2,400 output tokens. Four Llama source checks and up to
three GPT-OSS original-to-final meaning checks: at most 600 tokens each. All calls
retain temperature 0.1, one attempt, and the eight-call/6,600 requested-output-token
ceiling. No retries, paid fallback, cap increase or provider switch is added.

Shape, full source support, original meaning, headline/order, name anchors and
110–225 body words remain mandatory. An unchanged or abstaining editor leaves
the known-held seed held; no earlier positive verdict transfers to the result.
The known incomplete-definition false positive remains a reviewer limitation:
independent full-definition and full-text review is essential. Do not qualify
unattended approval without separate reviewer regression/holdout evaluation.

## Preflight evidence

Build and all 1,566 automated tests pass. Tests cover seed locks, separate original
meaning comparisons, headline/digest/cardinality binding, original-to-final change
count, abstention, negative/malformed reviews, provider errors and no fallback.
Both previous complete live captures replay exactly, preserving their verdicts.

An actual-packet offline preflight verified U1/U6 repair scope, all four other
locks, unchanged facts/definitions/context, retained original comparisons and
zero network calls. Editor request size: 11,059 bytes. System prompt/schema hash:
`a4fb471f7933a5ca8407d2d8c630ffa7256ecec5d43bc8d6eb0f254d0e4782bf`.
Independent implementation review passed 106 focused/legacy tests and verified
the actual private seed and original bindings. Its suggested abstention wording
was clarified: returning an unchanged result means the seed catalog, not the
original reference sentences. Full tests and private preflight passed again.
A live outcome remains unqualified until exact-output review.

## First live repair — style rejection

[Run 36357685405](https://github.com/itworksinprod/first-fold/actions/runs/36357685405)
used main revision `9e1035965f3484f96b5cc4a7d0737f628dc83106` and failed in
“Inspect the selected bounded diagnostic without delivery” with
`DIRECT_DEFINITION_RETAINED_LABEL`. It stopped after one editor call / 2,400
requested output tokens, before factual or meaning review. No email was sent.
The rejected response was deliberately not captured, so its offending term and
unit are unknown. This is not a complete response replay or a semantic verdict.

Artifact: `10944343937`, 25,414 bytes. ZIP SHA-256:
`fde2e634bdb4f486512917d2f5ab665d304bdea7cb0580bfb4d8c3ea8cb4cc41`.
Decrypted capture SHA-256:
`5741620748e2725f08edbc5eacd10668d407e4847b1595a28ebf93ce68ac3899`.

## Distinct plain-repair refinement

`context-two-unit-plain-repair` retains the same input, original meaning baseline,
locks, models, sampling, ceilings, source/meaning reviewer prompts and acceptance
gates. The editor guidance treats technical labels as reference vocabulary and
requests their full meaning in ordinary words without dropping components or
relationships. A new mode-only input lists every canonical label checked by the
guard, including explicit singular/plural forms; it adds no definitions or source
facts. Old modes and prompts remain unchanged.

For this mode only, a retained-label rejection adds bounded encrypted metadata:
the issued unit ID and hashes of matching canonical glossary terms. No arbitrary
model text or rejected response is retained, and no such metadata reaches the
public report. This aids diagnosis without pretending a rejected response can
be replayed or approved.

All 1,567 automated tests pass. Actual-packet offline preflight verifies the same
two editable/four locked sentences and unchanged source material, with zero
network requests. New request size: 12,139 bytes. System prompt/schema SHA-256:
`68e8c5dd0dad46e74e46917921fdf4b0435dc883390a410ecb385995c9177049`.
The original repair preflight still matches its 11,059-byte request and hash.
Independent preflight found a mismatch between the five selected definitions and
seven labels checked by the guard. The complete canonical label list and exact-set
regression address it, and the actual private-input preflight confirms all seven
labels. Live exact-output review remains required.

Independent scoped re-review cleared that fix and passed 107 focused/legacy
tests. Run 36358574378 was dispatched once on
`c225937abe77d28c07f1b3669c2a6c92206df5dd`. This is permission to test, not a
candidate approval; no result is inferred from setup success.

## Plain-repair live outcome — automated pass, manual HOLD

[Run 36358574378](https://github.com/itworksinprod/first-fold/actions/runs/36358574378)
passed all four source fields and three changed-unit meaning checks within eight
calls / 6,600 requested tokens. Its 146-word draft and immutable capture replayed
exactly offline. This did **not** complete the saved-article checkpoint.

Both full-text reviewers retained HOLD: U6 was byte-identical to the rejected
seed, still missing defining requirements/quality-goal relationships. The meaning
reviewer again quoted only the opening part of the supplied definition. U1 removed
the repeated obligation clause but left an awkward category/example construction.
The source material is sufficient; the model's selected citation list is not a
complete evidence map. These repeated reviewer false positives preclude automatic
qualification based on this sample. No email occurred.

Artifact `10945100629`, 81,685 bytes, ZIP SHA-256:
`98e15bf2f78e96cd335cc87c7ff95f92747fb22c7aea498f258c11b6cf3128d0`.
Capture SHA-256:
`3d9eaf46b907e81146d694ba606a53a078b2146ee11004fedf2d3165d5eba9ca`.
Draft SHA-256:
`dab5d23978f5261d288f1ac0fe38a9654d97f9e722ca66b30d7ed2b23e6ed6ae`.

## Complete-task repair refinement

`context-complete-repair` refuses a rewrite if **any** explicitly flagged seed
unit remains unchanged, before spending requests on factual or meaning review.
It still permits honest whole-seed abstention (which cannot approve a candidate).
Changing a sentence is only a prerequisite, never proof of semantic completion.

The new concise editor prompt replaces the stack of earlier editor instructions
only in this mode. It requires all repairs or abstention, complete definitions,
compatible category/example grammar, name/qualifier preservation and plain prose.
Per-task original text, seed text and matched full definitions are grouped together;
they are derived from the same approved inputs, not added evidence or replacement
answers. Original reviewer prompts, budgets, sources and all old modes stay exact.

All 1,569 tests pass; independent preflight passed 109 focused/legacy tests. The
exact previous live output is rejected offline as `FACT_SUMMARY_INCOMPLETE_REPAIR`
with U6 unchanged and zero provider/reviewer calls. Its old mode still replays
exactly. Actual-packet preflight request: 11,784 bytes; prompt/schema SHA-256:
`61ab4de87962dbed81c15801e6c7cbbc573586cdd6465893771b257f37478433`.
Independent review clears one bounded trial, not the resulting prose.
