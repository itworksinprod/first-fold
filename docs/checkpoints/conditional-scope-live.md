# Conditional-scope live baseline

Status: local tests and independent preflight pass; live measurement pending.

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
