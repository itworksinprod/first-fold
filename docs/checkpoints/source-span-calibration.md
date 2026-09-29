# Source-span coverage calibration

Status: v2 published and live-tested once; calibration **HOLD**, with 6/8 exact
per-segment matches (v1 was 5/8). This does not repair or approve the held GitHub
article. No further trial is authorized by this completed bounded attempt.

## Why a new contract

Run 36575945893 produced a supported opening followed by an unsupported
security/features guarantee. Its automated reviewer's explanation addressed
only the opening. The old prompt already required all assertions, so merely
repeating that instruction is not the proposed fix.

The new isolated contract gives every losslessly retained text segment a required
verdict, explanation and source quote. A host-generated partition prevents the
reviewer from omitting a tail or returning one blanket verdict. Every segment is
judged in its complete sentence context, including connectors, conditions,
negation and causal relationships. There is no "ignore" category. Unsupported
and uncertain are distinct holds. Only all-supported can pass the structural
review. Every positive quote must occur exactly in its named saved passage.

This is observable text coverage, **not deterministic factual verification**.
The punctuation/connective heuristic is not a grammatical parser: it can split
noun phrases/dates and can leave multiple assertions together. Exact quote
membership does not prove entailment. A unit test explicitly demonstrates that
a structurally valid, all-positive false judgment can still parse. The negative
control with an unpunctuated guarantee tests this remaining model dependency.
No article workflow imports this experiment; no legacy reviewer is replaced.

## Predeclared controls and outcome

An independent reviewer proposed eight fictional development controls, four
supported and four unsupported, before inference. Each pair tests guarantees,
causality, operating conditions or population scope. Labels and decisive reasons
stay host-only, not in the prompt, schema or request data. Host scoring checks
every expected segment verdict as well as the whole-sentence result; merely
returning false or uncertain for every input cannot pass. After exact artifact
replay, independent review must check the explanations and quoted evidence
against each predeclared distinction. Passing labels alone is insufficient.

Corpus SHA-256, including predeclared segment labels:
`c7a74593f9b8e5d4714f6122029a4f5a15f93f9c7d4647a6aac287ddb7a7b94d`.

First live (v1) prompt SHA-256:
`15926a4c97b5ba241fa2511290d44841f236a5b0e7abfe516e308f4ffb89efcf`.

The previously held real article remains byte-identical and unapproved. These
controls are fictional calibration, not an unseen news sample. A control pass
would justify only a separately bounded check of real article text, not another
writer attempt or automatic delivery.

## Bounded live-test design

- Manual owner dispatch, trusted main and attempt one only.
- Eight predetermined reviewer requests, one sentence each, existing Cloudflare
  Llama model. No writer, article secret, search or email input.
- 600 requested output tokens per request, 4,800 total; one attempt per case.
  30-second request timeouts and an eight-minute job limit.
- A provider, transport, provenance or malformed-response error stops the run.
  Truncation is a format/resource hold, never a semantic negative. No retry,
  alternate provider, raised budget or paid fallback follows a hold.
- A valid wrong label remains evidence; the other fixed, predeclared cases still
  run once. The final result stays held unless all expected segment labels match.
- Only a one-day encrypted artifact is uploaded. The fresh private decryption
  key stays on Carlos's Mac. Exact requests and parsed responses are retained;
  original HTTP response bytes are not independently replayable.
- Even a green workflow says `controls-passed-awaiting-independent-review`.

The existing provider adapter is unchanged. Model and request options were
checked against the [official Cloudflare model documentation](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/).
This setup does not inspect account billing status or guarantee available free
quota. It does not enable billing or change the configured account plan.

## Local checks

The first independent code review found a sparse-array correctness gap: a
numeric-looking non-index property could substitute for an absent array element.
Exact indices are now required, and an empty flattened source inventory rejects.
The regression confirms that malformed arrays cannot issue an evidence-free
review. This is not a demonstrated native JSON-provider exploit.

The 34 new focused tests cover lossless source coverage, the known tail omission,
quote binding, held verdicts, bad shapes, resource limits, provenance, encryption,
authority, no label leakage, no hidden retries, and unchanged article code. These
mock checks establish mechanics only; live classifier behavior remains unproven.
The full local suite passes all 1,828 tests after building the application.
Independent preflight reran all 122 workflow-selected tests and cleared the
sparse-array repair, caps, authority and isolation. The final requested alignment
advertises the validator's eight-character quote minimum in both schema and
prompt; this changes no verdict or editorial threshold.

## First live result — September 29, 2026

[Run 36590877240](https://github.com/itworksinprod/first-fold/actions/runs/36590877240)
used trusted main `c9741edcf0746dba94e49f7a7392e1a6d0963635`, owner manual dispatch,
attempt one. All 122 workflow-selected tests and input validation passed.
The step **Check eight synthetic sentences without articles or delivery** failed
with `SPAN_CALIBRATION_MISMATCH`: eight requests completed, 4,800 requested
output tokens, five cases matched every predeclared segment label. No provider,
quota, transport, malformed-response or truncation error occurred. No email was
sent and no article was generated or edited.

Run identity, head, workflow, actor, attempt, artifact name and digest were
verified before decrypting locally. Artifact `11043429591` was 21,285 ZIP bytes,
SHA-256 `303eb6bfe0e6b1cacd08b78d478c0d842e81d33874694d8e1da1273d1dfbb39e`.
Saved capture SHA-256:
`6697173e0f84101a913f8d997543461705e6562002f2e34540ce7fb498a709f7`.
All eight exact requests and parsed responses replayed offline, reproducing the
complete score/report with zero real network calls. Original HTTP bytes were
not independently replayed.

All four unsupported whole sentences were held, but only two of the four
supported sentences passed. Overall sentence labels were 6/8; stricter
per-segment scoring remains 5/8 and has not been relaxed:

- SC03: the reviewer treated a faithful conjunction of two observations as if
  it claimed causation, despite no causal wording in the candidate.
- SC06: it correctly rejected continued sounding after door closure, but also
  rejected the independently supported open-door part of that sentence.
- SC07: it rejected a faithful paraphrase of the two-room measurement scope
  while quoting the source wording that supports the same scope.

Independent review inspected every positive and negative explanation, retained
the original labels and confirmed the hold: 5/8 exact case vectors, 15/18
individual segment verdicts and 6/8 whole-sentence verdicts. The matched negatives
identify the actual unsupported guarantee, causal link, continued closed-door
operation and widened measurement scope. The three misses above are genuine
semantic errors, not merely scoring artifacts. The result remains frozen and
held. No post-result retry or article trial occurred.

## Narrow v2 clarification — published and live-tested

The independent reviewer recommended three generic distinctions, now implemented
in v2: exact matching applies to evidence quotes rather than candidate prose;
conjunction/chronology alone do not assert causation; and a neighboring unsupported
assertion must not automatically invalidate a separately supported segment.
Full-sentence interpretation, actual causal evidence requirements, source scopes,
quote membership and uncertainty holds are unchanged. No example, expected
answer, publisher detail or corrected article prose enters the prompt.

Contract `lossless-contextual-span-source-v2` binds a distinct request hash so
v1 verdicts cannot be replayed as v2 judgments. The new prompt SHA-256 is
`ef268f860df247fb96d97dc21f2372d623e40e210ca8023af3044b5c0ef1af61`.
Controls, labels, segmentation, response schema, model and eight-call/4,800-token
ceiling remain fixed. Another attempt would be reused development calibration,
not a fresh holdout or an independent reliability measurement. The v1 artifact
and failed verdicts remain unchanged. Carlos explicitly approved publishing this
revision and one additional eight-case attempt; its result is recorded below.
All 1,829 local tests pass. Independent preflight reran the 35 focused tests and
found no weakening of source support or insertion of a case-specific answer.
It cleared this revision for one later authorized bounded calibration, not
article integration. Replaying the v1 artifact requires its recorded c9741ed
code revision; the intentionally distinct v2 hashes cannot validate v1 responses.

## Second live result — September 29, 2026

[Run 36601205488](https://github.com/itworksinprod/first-fold/actions/runs/36601205488)
used trusted main `180a46a1d55672cd7c2ddeb50f4fa975a9e63d33`, owner manual dispatch,
attempt one. All 123 workflow-selected tests and input validation passed. The
step **Check eight synthetic sentences without articles or delivery** failed
with `SPAN_CALIBRATION_MISMATCH`: eight model/network requests completed with
4,800 requested output tokens. Every response was structurally valid; no provider,
quota, transport, malformed-response or truncation error occurred. No retry,
writer, research or email request followed.

Run identity, head, workflow, actor, attempt, artifact name and digest were
verified before local decryption. Artifact `11049083780` was 21,368 ZIP bytes,
SHA-256 `7b3a27014fe545c3aaf4226c0e829f05a90ff1062522f76ce3dad32bb629462a`.
Saved capture SHA-256:
`92f5c239ab98db3cd8bdefd5da85a65184c6a0d8d853a74faabbd6b5436e271c`.
All eight exact requests and parsed responses replayed offline, reproducing the
complete report and case results with zero real network calls. Original provider
HTTP bytes were not independently replayed.

Independent exact-output review inspected all eight sources, complete sentences,
segments, explanations and quotes, and confirmed **HOLD**:

- 6/8 exact per-case vectors, 16/18 individual segment labels and 7/8
  whole-sentence decisions matched the unchanged expected labels.
- All four unsupported sentences were held; three of four supported sentences
  passed. SC07 now correctly resolves the faithful two-pilot-room paraphrase.
- SC03 T2 still invents a causal claim from a conjunction of observations and
  wrongly rejects it for missing causal evidence.
- SC06 T2 still wrongly rejects the supported open-door clause beside the
  correctly rejected claim of continued sounding after closure.
- Some matched explanations are terse or ambiguous, but their decisive quotes
  support the expected judgments. Independent review found no additional proven
  semantic false positive among those matched cases. This small reused corpus
  does not establish a general false-positive rate or production reliability.

The result is frozen; original labels, scoring, source requirements, article text
and production settings remain unchanged. The eight-case request ceiling is
exhausted for this approval. The independent reviewer recommends a separately
scoped model/profile comparison with the same frozen contract and controls,
rather than another wording patch. No alternative was selected or called.
Any such comparison needs its own free-quota/budget preflight and authorization;
even a pass would still need a new holdout and separately bounded real-article
qualification before production integration.
