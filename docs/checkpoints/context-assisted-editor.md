# Context-assisted editor checkpoint

Status: local preflight passed; live and independent outcome review pending.

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
