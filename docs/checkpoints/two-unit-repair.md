# Review-guided two-unit repair

Status: implementation and offline preflight passed; live result unqualified.

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

The mode `context-two-unit-repair` is owner/main/manual-only. Its separate secret
is exposed only to this mode's validation and execution steps. Plaintext remains
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
