# Frozen-draft editing trial

This is one opt-in, no-email experiment using saved research. It is not a fresh
daily edition or an approval to send or publish the result. The original
baseline's `offlineOnly` scope records how it was qualified; the separate manual
diagnostic authorizes bounded provider processing, not promotion of that baseline
to a finished paper. All edited text still needs factual, meaning and readability
review.

## Private setup

The local freeze utility verifies the repository's fixed qualification manifest
before exporting a secret value. It accepts only private paths inside the sibling
`first-fold-review` directory and never prints the value:

```text
node scripts/automation/freeze-fact-baseline.mjs export-secret <private-baseline.json> <new-private-secret.txt>
```

Create a **repository secret**, not a variable or workflow input, named
`FIRST_FOLD_FROZEN_BASELINE_B64`, using the exported file's contents. Base64 is
encoding, not encryption: the value remains private data. GitHub stores the
secret; this workflow never echoes it or its decoded content. The single-line
transport is capped at 48,000 bytes. Do not commit either plaintext file.
See [GitHub's secret setup instructions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

Generate an ephemeral result-encryption key with the existing diagnostic tool:

```text
node scripts/automation/private-writer-diagnostic.mjs keygen
```

Keep the private key on the Mac. Only the public key belongs in the workflow's
`public_key` input. Do not share the private key or API tokens.

## One bounded run

Open **Diagnose one free writer story (encrypted, no email)** on GitHub Actions.
Run from `main`, choose `frozen-definition-language`, and supply the public key.
This separate opt-in mode uses the definition-aware reviewer qualified by
[run 36213351283](https://github.com/itworksinprod/first-fold/actions/runs/36213351283).
The older `frozen-sentence-language` mode remains unchanged for auditability; do
not rerun it to chase a different answer. Run 36217395043 passed the new meaning
context check but failed independent readability review. The next revision of
`frozen-definition-language` changed only its editor instruction to test
assembled-sentence fluency; it did not pass the live article review.
Run 36219118294 then failed meaning preservation after changing a partial output
into a process step. The current increment shares the existing relevant glossary
entries (including their sense boundaries) with the editor. It does not change
the editor prompt or either reviewer. Run 36219672362 passed the live automated
checks and independent review of this context correction. The article remains
held for repetitive wording, unexplained jargon and incomplete selected citations;
do not rerun the unchanged setup or treat this bounded pass as article approval.
The next isolated increment appends one fictional, topic-independent example of
natural definition integration to the editor prompt. Its original, literal and
fluent sentences retain the same actor, possibility and two necessary conditions.
This is writing guidance, not source evidence, reviewer input or a prescribed
article answer. The actual editor data and both reviewers remain unchanged.
Run 36220438673 passed automated source/meaning checks but produced the exact
same proposal and draft as its predecessor; the example did not solve fluency.
The next experiment changes only the remaining term-substitution priority:
compose the sentence naturally from reviewed meaning rather than copying a
definition's wording. This is a hypothesis, not a diagnosed cause. Every other
instruction and all data, reviewers and budgets remain unchanged.
Run 36220958652 also produced the identical held text. The current experiment
therefore adds a separately bounded fluency-polish stage after the first proposal,
rather than repeating another unchanged prompt trial. The first proposal remains
unapproved; the polish call receives the original catalog and vocabulary/facts,
and both proposals must bind to that original catalog. It cannot create a new
baseline. A failed, malformed, abstaining or unchanged polish holds immediately,
with no retry or fallback to the first proposal.
The same owner/main/first-attempt restrictions remain in force. Do not use the
older `sentence-language-second-article` mode: it generates a new baseline.

The private secret is exposed only in these two frozen modes. Before provider credentials
are made available, the CLI checks the artifact against the fixed source,
fact-context, draft, unit and qualification hashes. The runtime repeats that
check. The new mode additionally verifies the source and meaning prompt hashes,
model, fixed-control identity and glossary manifests against the audited reviewer
qualification. The MIT glossary must match the exact saved source. Missing,
changed or malformed input fails without a provider call; there
is no fallback to a new writer, fresh discovery or another provider.

In the current definition mode, one rewrite and one polish call are followed by
four final-source checks and up to three changed-body meaning checks: at most
nine requests and 6,600 requested output tokens. This increase applies only to
that isolated experiment; the older frozen-sentence mode retains eight/5,400.
Meaning checks compare the final units against the ORIGINAL, not the intermediate.
Byte-identical fields use exact local identity for meaning only; their
source check still runs. The model, qualified source/meaning reviewer prompts,
110–225-word limits, unchanged headline and ordered-unit protections remain
unchanged. The current definition mode uses editor strategy
`sentence-definition-polish-v1`, first editor prompt SHA-256
`936ce587507b25fe0298722062db5f03c6b96df5b2a1d504210fc9aea0687a7e`.
The separate polish prompt SHA-256 is
`caf9d4e5f116c9d4029a1598692949c2bbcc3936d5988a69f2d6892d68529d1a`.
Its base fluency prompt's definition instruction differs from the original editor:
it permits surrounding grammar adjustments that eliminate repetition without
weakening obligations, scope or conditions. The appended synthetic contrast
illustrates that rule but must never supply article facts. All legacy editor modes retain their
original prompt. Changed-field meaning checks use minimal, reviewed term
definitions; they cannot see the article passages or expected control labels.
The current editor additionally receives the same source/manifest binding and
term/definition/sense entries selected from its original body sentences. Shared
selection keeps the entries identical wherever the editor and reviewer encounter
the same term. Meaning review also checks terms in the proposed output; that does
not add them retroactively to the editor's input. No inferred definitions, full
article passages or reviewer verdicts are added to the editor request.
This is vocabulary context, not automatic factual or readability approval.
Quota failure, abstention or a rejected check holds the result.
No automatic retry, email, public edition, billing or daily-workflow change occurs.

## Review, not merely a green job

The artifact remains RSA/AES-encrypted with one-day retention. Public output
contains only counts, status and sanitized error codes. Download and decrypt it
locally with the matching private key. Before claiming success:

1. Verify the recorded before draft and units match the qualification manifest.
2. Replay request hashes, applied edits, final word count, headline and order.
3. Confirm every final-source and changed-meaning gate passed.
4. Have an independent reviewer assess the exact final prose for ordinary-reader
   clarity and source/meaning drift. A transport test is not a readability pass.
   For this increment, require genuinely smoother assembled wording without the
   prior tautology or concept-category drift, not merely more words or a differently spelled technical term.
   Remaining jargon and incomplete passage citations remain explicit holds; they
   cannot be hidden by a successful editor-only experiment.

Retain a failed trial and diagnose it before changing the experiment. Do not
rerun an identical experiment until it happens to pass. Do not change the
qualification hashes or reviewer rules to make an unsupported result pass.
