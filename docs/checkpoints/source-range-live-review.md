# Source-range citation comparison — live checkpoint

Status: live attempt stopped at U2; full checkpoint HOLD.

Carlos said “go” to the bounded live test following publication of the offline
source-range adapter. This is a separate, manual, encrypted no-email workflow.
It changes the citation contract only: unchanged saved GitHub-runner headline,
six body sentences, six source blocks, unit order, genuine publisher, model,
sampling and maximum request budget. No article rewrite or fresh research.

## Frozen boundaries

- Workflow: `.github/workflows/full-article-range-review.yml`.
- Input secret: existing `FIRST_FOLD_FULL_ARTICLE_SPAN_B64`; do not overwrite it.
- Packet SHA-256: `ca573169c8a123d8bc2f6cddb9d4d24e1c948107e5320504526f17ecd5b5b52c`.
- Draft SHA-256: `528072d9a3a0804c81a2798e384f450ea8120e2f7e59089f1e5652c02ea926f4`.
- Evidence contract: `lossless-source-word-range-v1`, as independently tested in
  [the offline receipt](source-range-evidence.md).
- Model: Cloudflare `@cf/openai/gpt-oss-120b`, temperature 0.1, at most seven
  calls, each one attempt, 90 seconds and 4,800 output tokens; maximum requested
  output 33,600 tokens. No alternate providers or quota retries.
- Owner/main/manual/first-attempt guards, fifteen-minute workflow limit,
  read-only repository permissions, existing personal-paper concurrency group.
- Ephemeral RSA-3072 public key supplied to the workflow; private key stays local.
  Only encrypted result retained as an artifact for one day. No email credentials.

The original quoted-evidence workflow, v2 checker, model captures, expected
labels and historical failure remain unchanged. The indexed passages add input
overhead; no claim is made that the previous citation contract qualifies this one.
Free-account status and allowance must be inspected before the single dispatch.
No billing setting is changed; quota/provider refusal ends the attempt.

## Success criteria declared before inference

First verify identity, trusted main revision, run attempt and artifact digest;
decrypt locally, replay the exact saved requests and parsed responses, and retain
the raw model selections separately from host-constructed quotes. Any failure
of provenance, transport, structure or ranges stops remaining calls immediately.
Semantic holds remain holds while the remaining units can be examined.

All seven units / 23 spans must receive structurally valid complete reviews to
pass citation mechanics. Independent exact-text review must additionally check
whether each selected passage actually supports its explanation and verdict.
It must assess the same predeclared 19 supported and three unsupported determinate
spans from [the prior receipt](full-article-span-review.md), plus the ambiguous
headline without manufacturing a gold label. Date direction, conditional scope,
registration-versus-runtime rules and invented patch/feature guarantees remain
specific known risks; no expected labels are sent to the model.

A green workflow means captured reviews, not factual accuracy. Even if every
model answer says supported, `articleApproved` and `publicationReady` remain
false. Passing citation mechanics alone cannot close semantic qualification.
The original article remains held pending a separate correction-and-review step.
No production integration, delivery or editorial-threshold changes are included.

## Preflight

All 1,996 automated tests passed. Independent review passed all 182 focused
tests and rebuilt the actual packet: 149 body words, seven units, 23 spans,
six source passages per request, and 17,161–17,900 serialized request bytes.
The reviewer found no blocker to one bounded live citation-format comparison.
The legacy workflow is unchanged; no semantic qualification is inherited.

At approximately September 30, 2026 01:28 UTC, Cloudflare displayed 411.94 of
10,000 daily neurons used. Billing showed Workers Free, Active, with no payment
method on file. No settings were changed. Current official model/API and pricing
documentation was consulted. Availability remains subject to provider limits.

## Bounded live result

[Run 36655424494](https://github.com/itworksinprod/first-fold/actions/runs/36655424494)
used trusted main `18af1af38a787bb7726dfdc51da3d75de428f3a9`, owner/manual,
first attempt. Tests and pinned-packet validation passed. The run failed in
**Review every unit once with exact source ranges** with
`FULL_ARTICLE_RANGE_RESPONSE_INVALID`. Two requests were made, with 9,600
requested output tokens maximum. One valid unit completed; U3–U7 were not called.
There was no quota refusal, transport failure, retry or email.

U1 returned legal ranges and the host reconstructed exact source quotes; the
earlier ellipsis-copying error did not recur in these two responses. Its supported
headline verdict still does not resolve the prior ambiguity about the direction
of the date change: the explanation establishes the date and platform only.

U2 returned six supported labels but its T3 and T6 selected only `2026.` and
`2026,`, respectively. Both exact substrings are five UTF-16 code units, below
the unchanged eight-unit citation minimum. The adapter correctly rejected the
whole response without expanding either range. Even the valid month/day ranges
offer little contextual evidence by themselves. Exact quotation copying has
been demonstrated on these replies; reliable contextual selection has not.

- Artifact ID: `11072316407`; verified ZIP size 31,797 bytes.
- ZIP SHA-256: `d377e86b3c719dd75fa89946fa8e41fce9eda0b9a08d0922b5e35f0a43d89ff1`.
- Decrypted capture SHA-256: `430574eba0b3e3f4fb45370014f128b8859878867b27ac632c5d3c60e9363d72`.

Run/revision/event/actor/attempt, artifact identity, size and digest were verified
before local decryption. Both exact request hashes and parsed responses replay
locally to the same failed report with zero network calls. Raw provider HTTP
bytes were not replayed. An explicitly synthetic, in-memory expansion of only
the two year selections passes structural validation and isolates the immediate
length rejection; it is not model output or a repaired/approved article. The
original capture remains byte-identical. Independent outcome review reproduced
both validations and retained HOLD: one structurally valid unit is not one
independently approved unit. U2's underlying date assertions remain supported;
the immediate failure is citation selection, not evidence that the dates are
false. The reviewer also noted that U1's scope quote omits “only,” which remains
available in its complete source context.

No overall citation success, semantic accuracy score, article acceptance or
production readiness is claimed. The new transport experiment is held; all
earlier historical captures and production behavior remain unchanged.

## Next proposed offline step

Independent review recommends a source-sentence evidence catalog, not another
prompt patch or unchanged retry. The host would offer complete exact source
sentences with stable IDs and bound offsets; the model selects IDs and the host
reconstructs separate quotations. Keep full source passages, semantic judgments,
8–400 code-unit and one/two-evidence limits. Test version numbers, decimals,
abbreviations and qualification boundaries; reject unsuitable segments rather
than truncate or silently expand evidence. This is not implemented here. It
could prevent tiny date-only selections but cannot prove entailment or resolve
the ambiguous headline. No further provider call was made.
