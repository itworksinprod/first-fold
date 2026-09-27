# Grammar versus meaning — bounded contrast diagnostic

Status: one authorized live diagnostic completed; seven of ten scored cases
correct. Reviewer remains unqualified for this grammatical-edit use case.

Run 36282585253 produced a complete draft but the meaning reviewer rejected a
grammatical change. The explanation may be a false positive; that does not
authorize ignoring the veto or assuming the full article is good enough.

This deliberately small, fictional printshop set tests that hypothesis without
MIT text, a new editor, altered reviewer instructions, or desired answers supplied
to a model. It is a known diagnostic set, not a blind holdout or general reviewer
qualification. It does not test source truth or reader usefulness.

## Predeclared contrasts

The positive grammar case retains explicit clauses stating both the shop's purpose
of use and the tool's performance. It does not ask the model to infer either one
from the other.
The registered glossary defines a counted batch as exactly twelve sheets. This
invented vocabulary defines words, not real events or tool capability.

| Case | Change | Expected meaning preserved |
| --- | --- | --- |
| R01 | Exact identity | Yes |
| R02 | Infinitive to relative clause; existing performance context retained | Yes |
| R03 | Exact definition added parenthetically | Yes |
| R04 | Both grammatical rewrite and exact definition | Yes |
| R05 | Operating condition contradicted despite valid grammar/definition | No |
| R06 | Mandatory instruction changed to permission | No |
| R07 | Requirement for every batch narrowed to some | No |
| R08 | Exactly twelve contradicted by exactly thirteen in the gloss | No |
| R09 | Damage-free assurance added | No |
| R10 | Intended but untested function changed to asserted capability | No |
| P01 | Context-poor purpose/function phrasing | Unscored probe |

P01 is intentionally not forced into a gold label: without the performance
context, the infinitive can describe purpose or function. Any eventual answer is
descriptive evidence, never an extra scored success. Independent label review
finished before inference. Any future contested scored example must be resolved
or excluded explicitly before a new run, not relabeled after seeing model output.

## Offline checkpoint result — September 26, 2026 Eastern

Independent review identified two ambiguities before any inference: the positive
grammar example needed to retain the shop's explicit purpose of use as well as
the tool's actual performance, and an inaccurate-definition negative needed an
unambiguous contradiction rather than a weaker but entailed description. Both
fixtures were corrected and their new hashes pinned before re-review.

The independent re-review accepted all ten scored labels and the unscored probe,
confirmed that labels remain outside provider input, and found no remaining
offline-checkpoint blocker. The full build/test suite passed 1,505/1,505 tests;
the reviewer independently passed 19 focused/regression tests. These tests verify
fixture isolation, exact input binding and unchanged validation behavior using
mocked responses. They do **not** establish the AI reviewer's accuracy.

This completes only offline preparation. The next separate checkpoint is a
bounded live diagnostic using these frozen cases and the existing meaning
reviewer, not another article run. The previous draft remains on hold.

## Live-run boundaries

Only aligned sentences and relevant definitions enter the unchanged review view.
Case IDs, expected labels and rationales remain outside it. The existing prompt,
schema, strict binding and veto behavior do not change. No private article input,
research, email or daily changes are added here. The opt-in diagnostic uses the
existing Cloudflare credential only for these synthetic reviewer requests.
The unit tests use invented verdicts to test data isolation and validation, not
to claim that the model knows the correct answers.

The separate live diagnostic makes one meaning request per case
and probe, at most 11 single-attempt requests of 600 requested output tokens each
(6,600 maximum). No identity shortcut, source-review call, retry, repair, model
switch or article run is part of this contrast. A valid but incorrect answer is
recorded while completing the fixed set; malformed/transport/quota failures stop
and mark it incomplete. All eleven responses must be structurally valid and all
ten scored answers correct for this bounded set's criterion to be met. Report
the unscored probe separately. Passing must not clear the held article, update
prior qualification records, or relax production gates.

The owner/main/manual/first-attempt workflow mode is
`grammar-preservation-controls`. Its runner is
`scripts/automation/grammar-preservation-diagnostic.mjs`. All case and runner
tests execute before the provider secret is made available. The job has ten
minutes for at most eleven 30-second requests plus setup and encrypted artifact
upload; existing modes keep their original deadlines. Article input secrets
remain unavailable to this mode. Exact parsed verdicts, prompts and request hashes
are encrypted through the existing one-day artifact; public output includes only
case IDs, boolean results, counts and sanitized errors. Provider envelopes and
reasoning are not retained, so response-envelope hashes cannot be independently
recomputed from this capture.

The model remains `@cf/meta/llama-3.3-70b-instruct-fp8-fast` with the existing
temperature, JSON schema and request assembly. The [model reference](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)
documents the native endpoint and response cap. [Cloudflare's pricing documentation](https://developers.cloudflare.com/workers-ai/platform/pricing/)
states that Workers Free rejects usage beyond its daily allowance. This runner
does not upgrade the account, configure billing or switch providers; the docs
alone do not establish the account's live plan or remaining quota.

Implementation passed all 1,512 build/unit tests, including seven new runner
tests. No live result or publication decision is implied by that local result.

Pins (must change visibly if independent adjudication changes a fixture):

- Reviewer prompt: `b0711232aac6664bf9ff040aa4edb61a8e2c3bac199949adea8132db299c9785`.
- Cases and probe: `481ef7c7343d959e9970f6d423b83a3888d7600172a38e83bf8c8b8186fe44a8`.
- Synthetic glossary: `caee6e7494fa292d08ea32a53b9c11527fb567e15c2f6217f92ec493ff2310b2`.

## Live result — September 26, 2026 Eastern

Carlos explicitly approved publishing the isolated setup and one bounded test.
[Run 36283997090](https://github.com/itworksinprod/first-fold/actions/runs/36283997090)
used trusted main `51992c6082454f1012bd669c6850a0ff29a98e07`, owner/manual/attempt
one. All eleven requests returned structurally valid, bound verdicts. The failing
step was **Inspect the selected bounded diagnostic without delivery**, code
`GRAMMAR_REVIEW_MISCLASSIFIED`. There was no transport, format or quota failure.
The run used eleven model/network requests and a 6,600-token requested-output
budget, without retries, research, article input, email or billing changes.

| Cases | Result |
| --- | --- |
| R01 identity | Correctly accepted |
| R02 harmless grammatical rewrite | Incorrectly rejected; explanation cited the added word “that” |
| R03 exact registered definition | Incorrectly rejected; explanation cited the definition's added words |
| R04 grammar plus exact definition | Incorrectly rejected; explanation again cited “that” |
| R05–R10 actual meaning changes | All correctly rejected by label |
| P01 ambiguous construction | Accepted, still unscored |

R10's label was correct, but its explanation reversed the edit direction: it
described “designed to” as added when the final sentence removed it. Correct
classification is therefore not evidence that every rationale was sound. The
7/10 score describes only these frozen, known examples, not general accuracy.

The encrypted ZIP (artifact `10919568347`, 64,731 bytes) matched GitHub SHA-256
`48cb375cec12c8e00ce43f113af948f6d4dfa70ed1a13f2e3577ea2c3d7fd95d`.
The local decrypted capture SHA-256 is
`cab61c4a347155d536bf0a99c762a90d1975f5021b391ab0a5451b1ba30821ab`.
Offline replay reproduced all eleven exact requests, parsed replies, validations,
scores and the complete capture without network access. The original provider
envelopes were not retained, so their hashes are not independently recomputable.

This result supports the earlier false-positive hypothesis: the current reviewer
can mistake harmless wording/definition changes for new assertions. It does not
clear the held article, prove its source support/readability, or authorize a veto
bypass. No labels, reviewer prompts, prior qualification records or production
policies were changed after seeing the result. Independent outcome review
confirmed the exact replay, three false rejections, R10's rationale error and
continued HOLD. This supports a false-positive diagnosis, not a universal claim
that the model only compares characters.

Next proposed checkpoint: offline-preflight a separate model-only meaning-review
comparison using these unchanged synthetic inputs, labels, prompt, schema and
600-token settings. Any unsupported or truncated response must still fail closed;
do not silently increase the budget or substitute another model mid-run. Seek
authorization before this new inference. A bounded pass plus later fresh holdouts
would be needed before considering qualification; no production replacement,
article input, prompt change or second inference is authorized by this receipt.
