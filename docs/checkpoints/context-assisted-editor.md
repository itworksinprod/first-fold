# Context-assisted editor checkpoint

Status: live technical checkpoint passed; article readability remains on HOLD.

The held 157-word edit still leaves two technical concepts unexplained and
replaces some already-plain language with parenthetical jargon. A review-only
run cannot fix that known readability failure. This opt-in experiment starts
again from the original 148-word, source-qualified baseline, not a manually
improved example or the held output.

## Fixed inputs and changed variables

Private packet SHA-256:
`b0040624abca91f1ab059a9e374a4e40ea39b26c1e6ea6d10cec9c302d5b7f1a`.
It contains the original baseline and the already-reviewed supplementary
terminology registry. Its paper capture hash is
`45170ba778ecf7c39e2ce63b73da62b3ea2dd69767815752570aa18d821ca1c9`;
its glossary manifest hash is
`9fbeb3dcacfb5d29217e9285cab49da3f4d230bd4c9972c93d07e6d0427ba275`.
Plaintext remains outside this public repository. The exact packet and original
baseline are validated before provider credentials are exposed.

This is a new combined context/editor-guidance/meaning-model experiment, not a
single-variable comparison. The editor gets the original units, fact context
and relevant definitions/senses, with no sample finished answer. Three generic
instructions favor direct natural equivalents and retaining already-plain
wording. Headline, unit order, qualifications and 110–225 body words remain
required.

Source checks use the unchanged Llama prompt. What happened and what to watch
also receive four fixed authors' paper passages supporting the terminology;
these are not independent corroboration or permission to add paper claims.
Meaning checks use the unchanged definition-preservation prompt with GPT-OSS,
original/final aligned units and definitions—not factual passages. The earlier
synthetic controls/holdouts do not qualify this new context or article.

## Limits and acceptance

- One GPT-OSS editor call, maximum 2,400 output tokens.
- Four Llama source calls, maximum 600 each.
- Up to three GPT-OSS meaning calls, maximum 600 each; exact unchanged text
  receives local identity checks, without skipping its source review.
- Maximum eight single-attempt calls and 6,600 requested output tokens.
- Truncation, provider denial, invalid output or either review veto holds the
  result. No automatic retry, cap increase, paid fallback or provider switch.
- A separate independent readability and source/meaning inspection is required
  after valid model checks. A green workflow alone is not article approval.

The owner/main/manual-only workflow exposes the new private input only to
`context-assisted-language`, encrypts the capture, and retains it for one day.
No email credentials, research, daily delivery or public-edition changes occur.

## Local evidence

Build and all 1,535 tests passed. Tests cover exact request routing and budgets,
source/meaning isolation, bad input bindings, headline/shape/length gates,
provider/truncation failures and no fallback. All three prior grammar/holdout
captures replay exactly without inference. The exact private packet also
passed an offline mocked transport check (11,856-byte editor request; largest
review request 13,908 bytes). Mocked verdicts establish plumbing only, not
semantic correctness or readable prose. Live outcome is still pending.

Independent implementation review found no blocking findings after 89 focused
and legacy tests. It verified the private pins, original baseline, evidence
roles, model routing, limits, encryption and lack of inherited qualification.
This clears setup for one authorized trial, not its outcome.

## Live outcome — September 26 Eastern / September 27 UTC

After Carlos explicitly approved sharing the expanded context, the single
[run 36287679788](https://github.com/itworksinprod/first-fold/actions/runs/36287679788)
completed on trusted main `d2594e922b4da3d944645f5a5763bfb406d4e9ef`.
All four source checks and three meaning checks passed, with exact-text local
identity for the unchanged headline. Eight single-attempt requests used the
6,600-token requested-output ceiling. The result has 186 body words and retains
the original headline and unit order. No research, retry, email, billing change
or daily-delivery change occurred.

Artifact `10921815194`: 81,463 bytes; ZIP SHA-256
`3902b8288c998ed6d465c9a9e1ce5cc27719bcb2df07ed2e7586c7cd15edfe73`.
Decrypted capture SHA-256
`7bd189d01881fa283989b77b3b1ea7bdd4f52444eeb3a5b3c057665f84d4324b`;
draft SHA-256
`4a216ab60fb66e007b1a9893a44295f2373911831503da284e72e9fb8f638a35`.
An offline replay reconstructed every request and parsed verdict and matched
the complete capture exactly, without inference. Independent review reproduced
the mechanical pass and confirmed coverage of all seven units.

The article is **not approved**. It contains five parenthetical definitions plus
an em-dash definition, retains the original technical labels, and reintroduces
technical terminology alongside previously plain wording. The primary agent's
full-text inspection and the independent reviewer's non-reconstructive clarity
checks both support a readability HOLD. The independent reviewer respected a
prior restriction against printing private prose; it did not claim a fresh
complete semantic certification. Positive model verdicts are not that
certification either. Some selected citation IDs do not cover the whole
multi-clause claim, although additional supporting passages were available.

Next proposed bounded change: edit only original glossary-bearing units, lock
already-plain units, and require direct definition-based phrasing rather than
technical labels followed by glosses. Preserve source, meaning and independent
readability gates. No second trial was run under this one-run approval.
