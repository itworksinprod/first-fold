# Reviewer rejection diagnostic — September 14, 2026

The after-reset run [34911989712](https://github.com/itworksinprod/first-fold/actions/runs/34911989712)
on `f94db41` completed one 4,000-token-cap Cloudflare GPT-OSS reviewer request.
It rejected all three intentionally bad synthetic stories as expected, but also
rejected the intended supported control on `factsSupported` and
`analysisSupported`, despite accepting both factual claim/citation pairs.
The result was `REVIEW_EVAL_VERDICT_MISMATCH`, not an observed quota or output
truncation error. It did not authorize integration or a newspaper delivery.

## Diagnostic-only change

The manual synthetic reviewer workflow now adds `--explain-rejections`.
Each false gate must identify exactly one draft sentence (or whole claim), a
fixed rule code, and one or two existing candidate-local source passage IDs.
True gates cannot carry rejection reasons. Local validation rejects missing,
contradictory, duplicate, unknown or cross-candidate references. Any invalid
diagnostic discards all reviews, including otherwise-valid peers.

The original substantive prompt, draft/claim/source bindings, four synthetic
inputs, and expected outcomes are unchanged. Only the response-format stanza
and the diagnostic instructions differ. A test locks the original fixture
digest. No result from the old test is retried for approval or relabelled.

The index retains exact original text for human inspection. Logs contain only
validated IDs and rule codes; there is no free-form model explanation or raw
reasoning. An explanation is the reviewer's allegation, not proof of its cause
or a correction. References to examined passages do not prove that support is
absent elsewhere. The optional local resolver cannot authorize a story.

Cloudflare's [JSON-mode documentation](https://developers.cloudflare.com/workers-ai/features/json-mode/)
does not guarantee schema compliance, so local shape and binding validation
remain mandatory. The diagnostic stays at one request, a 4,000-output-token
cap, a 90-second deadline, and a 70 KB request ceiling. Its request is 29,144
bytes with the current fixed examples. No budget is enlarged for explanations.

## Isolation and verification

The daily writer/reviewer, quality thresholds, source policy, public reader,
recipient, email behavior and production schedule are unchanged. This workflow
has no news search, email or delivery-state capability. No paid provider or
billing change is introduced.

The build and all 910 offline tests pass, including all 64 combinations of
claim and whole-story verdicts. Independent review cleared this diagnostic
path only. A live result must be examined separately; it will not by itself
establish a working newspaper or explain the prior model's internal cause.
