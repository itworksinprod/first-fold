# Review-guided two-unit repair

Status: live repairs remain held, including automated passes rejected by full-text
review. The latest final-phrase attempt failed the original-to-final meaning gate.

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

## Complete-task outcome — changed sentences, unrepaired defects

[Run 36359045029](https://github.com/itworksinprod/first-fold/actions/runs/36359045029)
on `7d26c9b76d7134fb2790338309b7279f1a5eca53` passed automated reviews and exact
offline replay within eight calls / 6,600 requested tokens. Its 151-word output
changed both target sentences, but both full-text reviewers retained HOLD.
U1 changed an unrelated clause while retaining the redundant phrase. U6 retained
the incomplete concept, and changed the deployment-evidence caveat to a different
implementation claim. The meaning reviewer incorrectly called the remainder
identical. A completed edit is not proof that its defect was repaired.

Artifact `10944249387`, 84,872 bytes, ZIP SHA-256:
`e7391b67d2ef1680cf256f50ec02ea81014c20e21d1af7b9829e72c513d88237`.
Capture SHA-256:
`38c177c7cf85c9aeb124d92977c3cc4e56ca548d6fd911ba385858f12c937309`.
Draft SHA-256:
`e95331d40b5c738502b1cdd73a55d531b7eccc3dcd2ee3752dcdafe6d42366b2`.
No email, production change or semantic qualification occurred.

## Reviewed defect-span contract

`context-span-repair` narrows the permitted edit locations inside the same two
sentences. Manually reviewed offsets and substring hashes bind to the exact
unapproved seed; they supply locations, not replacement text. The defective span
itself must change, while its prefix and suffix remain byte-exact. In particular,
the original deployment caveat and predicate cannot be changed. Full proposal
validation, other-unit locks, 110–225 words, all original-to-final reviews and
independent semantic/readability review remain required.

This is a manual-scoping experiment, not a newly relaxed general phrase editor.
The old modes remain unchanged. It uses the same saved private packets, providers,
temperatures, one-attempt behavior and eight-call/6,600-token ceiling. No new secret
or replacement example is added. A phrase may satisfy the boundary but still fail
meaning or readability; the contract does not claim to solve reviewer accuracy.

All 1,574 tests pass. Actual-input preflight verifies both exact defect locations
and locked clauses with zero network calls. Request size: 12,008 bytes;
prompt/schema SHA-256:
`da9d610d7d620f3aad1227c3fb9995e660e1db2d7af0ebbcc6b828802531168d`.
Offline regression rejects both recent captured candidates, and separately the
deployment-to-implementation substitution without another failure masking it.
The old complete-task mode still replays exactly. Independent preflight checked
the actual private span boundaries/hashes and all regressions, and passed 114
focused/legacy tests. It clears one bounded trial, not final prose approval.

## Span-repair outcome — meaning retained, final phrase held

[Run 36359643581](https://github.com/itworksinprod/first-fold/actions/runs/36359643581)
on `95b744bb7c3c7bab03a3e733f89dfd6f9653b4ef` produced 156 words, passed the
automated source/meaning checks, and replayed exactly offline within eight calls /
6,600 requested tokens. Independent full-text review accepts the repaired opening
and complete meaning, including the deployment caveat. It still holds the final
introductory phrase for cumbersome wording and repetition. This is not final
editorial approval and no email occurred.

Artifact `10944853420`, 85,964 bytes; ZIP SHA-256:
`e46477c79176cc19a0b539e01d16f038e5b6d0a7282ed805bdcba30bdf1426a7`.
Capture SHA-256:
`76802e2abd9246ef2e4c76ef032b5b39516e460be373b0a06ff22eeb085ca800`.
Draft SHA-256:
`996f460663aeb966ff53a7dda53473c6c4716b04e51fb892e5a32c1922ea3c75`.

## Final-phrase repair preflight

`context-final-phrase-repair` uses that exact unapproved 156-word result as its
seed and locks U1–U5. Only the reviewed 15-word introductory phrase in U6 may
change, to at most ten words; its prefix, predicate and deployment caveat remain
byte-exact. This is a style bound, not proof of preserved meaning or readability.
If complete meaning cannot fit, the editor must abstain. No replacement answer
is supplied. All final meaning checks still compare against the original
148-word baseline, including previously accepted edits.

The separate private packet SHA-256 is
`0c437ff98f21992a2fdbe5cef3c4e64b6f99e03e84d1f76fb6164a60906513d5`;
seed units SHA-256 is
`79d5781f4422e8143eb48c4966357c38140898236385086988eea8bbb2100002`.
It uses `FIRST_FOLD_FINAL_PHRASE_REPAIR_B64` only in this isolated mode; existing
packets and modes are unchanged and reject cross-mode inputs. Article text stays
private. Providers, original factual/meaning reviews, 110–225 body words,
one-attempt behavior and eight-call/6,600-token ceiling remain unchanged.

All 1,576 tests pass. Actual-packet offline preflight verifies the single edit
location, five locked units and original meaning baseline, with zero network
calls. Request size: 11,180 bytes; prompt/schema SHA-256:
`0e9750cb2809c05c533ee7cfd195663301175105a50f87f058b95bd5723b7238`.
Independent preflight passed 116 focused/legacy tests. Full-text review of the
next live result is still required; source-review citation gaps and earlier
meaning-review false positives remain unresolved for unattended use.

## Final-phrase outcome — compression rejected

[Run 36360635537](https://github.com/itworksinprod/first-fold/actions/runs/36360635537)
on `f32275fca3fbb53f7b1aae84cf4a6782b766d43a` produced 148 words within the exact
edit boundaries. It passed source review but failed U6's original-to-final
meaning check (`FACT_SUMMARY_REVIEW_REJECTED`), after eight calls / 6,600 requested
tokens. The reviewer found the shortened paraphrase changed the specific concept.
The separate factual check could not substitute for this failed meaning check.
The capture replays exactly offline; it is not an approved candidate. No email.

Artifact `10944904610`, 84,045 bytes; ZIP SHA-256:
`aceab85a679f5f3e46c1edfde2706c5da9939396cc75a935be1a5b05613f04c3`.
Capture SHA-256:
`5916737624cc5bd6836992d7f3415bb8b5d32e9d2ade50a3adbdef319430ec04`.
Draft SHA-256:
`a325997e267c19f577ab7c8ad1adac53f595b24ca83bde8c3497f71c68441440`.

Independent full-text review agrees with the meaning veto: naming associated
components did not retain their formal defining relationship or full task/output
specificity. Readability still repeated a phrase. The replacement used seven of
the ten allowed words, so this result does not identify the word cap as the cause.

### Precision refinement, same bounded mode

The next revision changes only this mode's editor instructions and records
`final-phrase-repair-v6`. It distinguishes concept type, component roles and
defining relationship from merely listing associated ideas, and requires natural
fit with the locked suffix. It supplies no replacement answer. The same original
seed, one editable span, ten-word cap, providers, request ceilings and separate
reviewer inputs/gates remain unchanged. Captures are revision/prompt-hash bound;
the earlier exact replay refers to its original published revision.

All 1,577 tests pass, including explicit source and final-meaning veto regressions.
Actual-input preflight: zero network calls; 10,850 request bytes;
prompt/schema SHA-256:
`227e3bce76795dba59a528bf63eb8f1c9b16b0bb2ab14c966e24181892ef150a`.
