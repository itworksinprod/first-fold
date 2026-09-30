# Conditional-scope live baseline

Status: live baseline and exact local replay complete; semantic qualification held.

This isolated experiment measures the unchanged source-sentence reviewer on the
sixteen fictional development cases frozen in [the offline checkpoint](conditional-scope-controls.md).
It does not write or approve an article, change any source, prompt or expected
label, integrate a checker into daily delivery, or send email.

## Frozen measurement and bounds

Controlset SHA-256: `22ba98ba1abbc942aff656912fefb3f2c35aae2ba9bb56b736b8f7ccff2b6341`.
The existing catalog, span splitter, full source context, prompt and schema are
unchanged. The model receives only those normal review inputs, not case IDs,
category, expected labels or scoring rationales. Each case is a separate request.

One manual owner/main run permits at most sixteen requests to Cloudflare Workers
AI `@cf/openai/gpt-oss-120b`, temperature 0.1, 4,800 requested output tokens each
(76,800 total maximum), 90 seconds per request, and no retries. No alternate
provider, paid fallback or extra probes are included. The workflow has a
30-minute outer timeout. Free-plan status and available daily allowance must be
checked before dispatch; provider refusal ends the attempt, never enables billing.

Valid semantic disagreements continue through the remaining cases. A transport,
provenance or response-structure failure stops immediately and preserves the
completed prefix and rejected parsed response when available. Exact requests,
parsed responses and provenance hashes are retained only in a one-day encrypted
artifact. The RSA private key stays local. Public output contains codes and counts,
not credentials or response prose. No existing article secret is accessed.

## What a result can establish

The original offline scorer compares every valid response with the predeclared
labels, distinguishing false positives, false negatives, uncertainty, invalid
output and incomplete coverage. Even all sixteen correct labels cannot set
`modelQualified`, `articleApproved`, `publicationReady` or `provenanceVerified`
to true. A green run means structurally complete measurement awaiting review.

Before interpreting results, verify the trusted main revision, run identity and
artifact hashes; replay the exact requests and parsed responses locally; and
obtain independent review of every explanation and selected source sentence.
An expected unsupported label must not be rewarded for inventing a contradiction
or turning missing evidence into proof of absence. These are visible synthetic
development controls, not unseen news or a model qualification sample. The held
real article remains held regardless of this baseline's label agreement.

## Preflight evidence

All 2,108 tests pass. Independent review reran the workflow's 184 selected tests,
verified the unchanged corpus, prompt, catalog and label-free request views, and
cleared one bounded baseline. Requests are 5,334–5,924 bytes. The catalog module's
SHA-256 remains `906fcf509072e3a92f9dd1f4de4a435bbc9d3a48b3678a886d910fa22c0d4653`.

At approximately 12:16 UTC on September 30, authenticated read-only checks showed
Workers Free, Active, no payment method on file, and 1.69k/10k daily neurons used.
This supports attempting the bounded run, not a guarantee that capacity remains
available or every response succeeds. Under the [published free-plan rules](https://developers.cloudflare.com/workers-ai/platform/pricing/),
exceeding the allocation causes an error rather than an automatic paid upgrade.
No billing setting was changed.

## Live result — September 30, 2026

[Run 36713974906](https://github.com/itworksinprod/first-fold/actions/runs/36713974906)
used trusted main `edc9b8d46306659f1e5224ea69f84971eb8f9450`, manual event,
owner actor and attempt 1. Created at 12:19:31 UTC and completed at 12:21:06 UTC,
it made sixteen requests without retries. All responses were structurally valid;
fifteen labels matched the predeclared answers. All eight faithful claims passed,
seven of eight changed claims were rejected, and one changed claim was incorrectly
accepted. There were no uncertain verdicts or false negatives. The 76,800 number
is the requested-output ceiling, not measured token consumption.

CS06 copied the first source passage's desk-reservation rule while omitting the
next passage's under-sixteen exemption. The checker accepted it because the text
matched the first passage exactly. The correct quotation did not justify ignoring
the full source's exception. CS05 correctly retained that same exception; accepting
CS06 is a factual-scope false positive, not a source-ingestion failure.

This is 15/16 label agreement on a small visible development set, not an estimated
news accuracy rate. No labels or responses were repaired, no prompt was tuned,
and no second provider attempt was made. The run remains an unqualified baseline.

## Capture verification and replay

The run identity, revision, artifact name and digest were verified before local
decryption. Artifact `11094519810` is 67,414 bytes with SHA-256
`d0f675833029f25ef5074a27425014b3057d8ebf781e5d6cacabacb8f2adb3f0`.
The decrypted capture SHA-256 is
`1f2bc747e5f06dd56678d053ce06d709f807170b91c2f011cadc67981632a754`.

Every model-facing view, prompt hash, request-body hash and parsed-response
validation was replayed locally against the frozen corpus. The full runner's
report and scorer results match exactly without network access. All 25 selected
quotations are exact original source units, 19–121 UTF-16 characters. That proves
source membership, not the truth of the verdict. Raw provider HTTP bytes were not
retained or replayed; their recorded digest is distinct from the parsed replay.
The original capture and receipts remain immutable in the private review directory.

## Independent interpretation and next checkpoint

Independent review read every complete candidate, source passage, verdict,
explanation and selected quote, independently reconstructed all sixteen request
and prompt hashes and parsed verdicts/scoring, and confirmed **baseline measurement
complete; semantic qualification HOLD**. CS06 is selective contextual checking,
not missing source data: its faithful CS05 counterpart correctly used both passages.

CS04 has the expected unsupported label, but its explanation overstates the
evidence by calling the visitor-only claim contradicted. Universal expiry does not
establish that non-visitor badges exist; the unsupported exclusivity is sufficient
to hold the claim without inventing that premise. Thus 15/16 label agreement must
not be described as fifteen wholly correct explanations. CS14 correctly says
actual rejections were unconfirmed, not that none occurred; its “no report” wording
should stay limited to the supplied notice. The other labels and decisive evidence
were sound. CS02's intact-seal detail appears in the full source although it was
not separately selected, and its quoted indoor exclusion already defeats the
every-sensor claim.

The next proposed **offline** checkpoint is an observable, per-passage review of
qualifications and exceptions on these short sources. The model would identify
which passages limit the contextual claim and whether the candidate retains
those limitations; acknowledging a lost or uncertain limitation must not coexist
with an overall supported verdict. This is a structured consistency check, not a
deterministic proof of meaning. Keep corpus labels, original sources and citation
catalog fixed, distinguish contradiction from insufficient evidence, and reject
missing coverage rather than silently accepting it. Test and independently review
that change before any new live run. Another reminder alone would duplicate a
full-context requirement already in the existing prompt.

No response was edited and no additional provider attempt occurred. The held
article remains held. Daily delivery, email, recipient, billing, writer prompts
and editorial thresholds remain unchanged.
