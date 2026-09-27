# Grammar versus meaning — bounded contrast diagnostic

Status: independently adjudicated controls and isolated live runner implemented;
no model calls yet.

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
