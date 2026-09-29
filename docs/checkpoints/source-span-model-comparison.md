# Frozen-contract source-span reviewer comparison

Status: published and live-tested once; **HOLD — incomplete calibration**.
Four cases were correct, then the fifth reached the output-token limit. The
remaining three were not attempted. There is no article approval or full-set pass.
Carlos's "go" authorized this comparison following the independently held v2
run; the bounded attempt is complete and no follow-up trial has been started.

## Question and fixed evidence

Can another already-allowlisted Cloudflare model/profile distinguish supported
conjunction, faithful paraphrase and local clause support while still rejecting
unsupported guarantees, causal claims, changed conditions and widened scope?

The comparator is the frozen Llama v2 run
[36601205488](https://github.com/itworksinprod/first-fold/actions/runs/36601205488),
which had 6/8 exact case vectors, 16/18 segment labels and 7/8 sentence decisions.
All four unsupported sentences were held. This is reused development calibration,
not a blinded holdout or an estimate of real-news accuracy.

Unchanged:

- Contract `lossless-contextual-span-source-v2` and prompt SHA-256
  `ef268f860df247fb96d97dc21f2372d623e40e210ca8023af3044b5c0ef1af61`.
- All eight cases, their full sentences, source passages, expected verdicts and
  decisive distinctions; corpus SHA-256
  `c7a74593f9b8e5d4714f6122029a4f5a15f93f9c7d4647a6aac287ddb7a7b94d`.
- Segmentation, JSON schema, message text, temperature 0.1, JSON-object format,
  local quote membership, whole-sentence context and all-supported acceptance.
- Exact per-segment scoring and independent inspection of every explanation and
  quotation. An uncertain label cannot qualify an unsupported control.
- No article, writer, research, delivery, recipient or production changes.

## Predeclared model-plus-resource contrast

The independent reviewer recommended the existing GPT-OSS-120B reasoning profile
with 2,400 tokens rather than forcing the reasoning model into the old 600-token
ceiling, which could measure truncation instead of semantic judgment. Both model
and resources differ; any outcome must not be attributed solely to model identity.

| Setting | Saved baseline | One new comparison |
| --- | --- | --- |
| Cloudflare model | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | `@cf/openai/gpt-oss-120b` |
| Requested output per call | 600 tokens | 2,400 tokens |
| Calls | 8 | At most 8 |
| Requested output ceiling | 4,800 tokens | 19,200 tokens |
| Per-call timeout | 30 seconds | 90 seconds |
| Job timeout | 8 minutes | 15 minutes |

No reasoning-effort override, custom model-specific prompt, new adapter, arbitrary
model ID, budget override or paid endpoint is introduced. The existing native
Cloudflare Execute Model adapter and free-model allowlist are unchanged. The
runner permits only two frozen profiles; caller-provided source text is not
accepted. Original baseline requests and capture/report shape remain unchanged.
The new encrypted capture adds the selected comparison profile and resource caps;
each request/provenance hash still binds the actual selected model and body.

Exactly one attempt per case. Valid semantic mismatches are retained while the
remaining predeclared cases run. Provider refusal, quota, transport, truncation,
malformed response or provenance error stops the experiment with no retry or
fallback. No follow-up provider trial is part of this comparison.

## Free-plan preflight

The [Cloudflare model page](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/)
documents GPT-OSS-120B on Workers AI. Its [pricing documentation](https://developers.cloudflare.com/workers-ai/platform/pricing/),
checked September 29, 2026, includes a 10,000-neuron daily free allocation and
does not list this model among paid-only models. On Workers Free, exceeding the
allocation causes refusal; on Workers Paid, excess can be charged. Therefore
model eligibility and a bounded token count alone do not establish zero cost.

Before dispatch, inspect current account plan and usage without changing either.
Do not proceed with a paid or unverified plan, purchase credits, enable billing,
or bypass a quota refusal. The cap is requested output tokens, not measured
usage, a token-to-neuron guarantee or guaranteed completion within free capacity.
No new broad account credential is required or requested.

## Completion gates

Run local tests and independent diff review before publishing. Verify trusted
main provenance, make one manual owner dispatch with a fresh RSA-3072 public key,
and retain the private key only locally. After completion, verify run identity,
artifact name/size/digest, decrypt locally and replay the exact saved request
inputs and parsed responses offline. Do not claim raw HTTP replay.

Independent exact-output review must confirm every predeclared distinction and
the explanations/quotes, even if all labels match. A pass qualifies only this
reused development set. Unseen controls and the held real article remain separate
checkpoints; nothing is promoted to daily production by this comparison.

## Local verification — September 29, 2026

The full build and all 1,850 tests pass. The independent reviewer reran all 144
workflow-selected tests and found no blockers. Tests check closed/frozen profile
selection, unchanged baseline messages/schema/temperature, model-bound request
hashes, exact caps, encrypted profile metadata, refusal/truncation/provenance
stops, blocked profile downgrade, no retry/fallback and unchanged exact scoring.

Both the main agent and independent reviewer replayed the previous real v2
capture offline under this modified runner. All eight request bindings and the
captured result were reproduced, without provider access or changes to the saved
failed verdicts. The main replay receipt remains in the private review directory
as `span-calibration-36601205488.profile-compat-audit.json`.

This cleared publication of the isolated setup, not a model result. Publication
was verified at `3e56e834bb3988dbd23f2b82bcb73720e16d650c`. The initial sign-in
blocker was resolved before the single dispatch described below.

## Live result — September 29, 2026

At approximately 19:04 UTC, read-only Cloudflare dashboard inspection confirmed
**Workers Free, Active**, no payment method on file, and displayed daily usage
of **5.31k/10k neurons**. These are rounded preflight observations, not measured
usage for this experiment. The GitHub account variable matched the inspected
account. No billing settings were changed.

[Run 36616705546](https://github.com/itworksinprod/first-fold/actions/runs/36616705546)
used trusted main `3e56e834bb3988dbd23f2b82bcb73720e16d650c`, owner manual dispatch,
the `reasoning` profile and attempt one. All 144 workflow-selected tests and
input validation passed. The step **Check eight synthetic sentences without
articles or delivery** stopped with `WORKERS_AI_EDITORIAL_FORMAT_INVALID`.

Five requests were made, reserving 12,000 requested output tokens. Four completed
cases matched all seven expected segment verdicts. On SC05 the retained private
diagnostic records `OUTPUT_TOKEN_LIMIT`, with 2,400 completion tokens against the
2,400-token requested cap. The adapter assigns that reason from the provider's
single-choice `finish_reason: length`; this is not a guessed semantic rejection
or a documented free-quota refusal. Its unsuccessful response text was not
retained. SC06–SC08 were not called. No retry, fallback or output-limit increase
followed the stop.

Verified artifact `11055064636`: 14,497 ZIP bytes, SHA-256
`e7f5f9f85143cf9a5c88edbb854a53f6589d71a9b2a7018ae8550bd24f25f405`.
Saved decrypted capture SHA-256:
`299cba22aa25dd3e3a2c8cb47edd3e0c461d073cfd73dde05d1eaba1aa60ee94`.
Run identity, revision, actor, attempt, artifact membership/digest and profile
were checked before local inspection. All five request hashes were verified.
The four retained parsed responses replayed through the adapter and unchanged
validator offline, with zero real network requests. The absent fifth response,
full run and original provider HTTP bytes were **not** replayed.

Independent exact-output review confirmed all four completed cases, not just
their labels:

- SC01: both actions and their shared subject are source-supported.
- SC02: range rejection does not supply an accuracy guarantee.
- SC03: the two observations are accepted without inventing a causal claim,
  correcting the earlier Llama error on this reused case.
- SC04: installation is supported but explicit causation is not established.

Result: **4/4 completed cases, 7/7 observed segment judgments; only four of eight
planned cases have usable results**. SC05's semantic judgment is unknown, as are
SC06–SC08. The model and output budget both changed, so this subset improvement
cannot be attributed solely to the model or promoted into an overall accuracy
claim. The independent decision remains HOLD for incomplete calibration.

The smallest recommended next experiment is one separately authorized SC05
resource-feasibility test with only a predeclared higher output cap changed.
Keep the model, prompt, input, schema, timeout and acceptance fixed, confirm free
capacity first, and do not retry or salvage truncated content. This would only
test completion at the new cap. Different-budget subsets must not be combined
into a claimed eight-case qualification. No such test is implemented or run here.
The held article and daily delivery remain unchanged; no email was sent.
