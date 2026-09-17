# Separate free Flash-Lite experiment

Carlos authorized this alternative after four Gemini 3.8 Flash qualification
attempts failed with provider unavailability. It does not activate a daily writer.

The manual `gemini-lite-quality-check.yml` workflow first makes one 512-output-token
availability request to the explicitly allowlisted `gemini-3.5-flash-lite` model.
Failure stops immediately, including quota errors. Success runs the same eight
regression cases and two write/review controls used for Gemini 3.8, with unchanged
prompts, expected verdicts and editorial validation. Maximum: six requests and
40,512 requested output tokens. No automatic retry or model fallback exists.

The existing Gemini 3.8 workflow and default model are unchanged. Both workflows
share a concurrency group. Model identity, fixed HTTPS endpoint, response version,
request hashes, JSON format, output limits, and billing confirmation remain checked.
Only sanitized diagnostic receipts are retained. No email or live news is generated.

Verify the actual Google project still shows Free tier before running; the caller's
confirmation is not independent API proof of billing status. Google's current
[pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) lists
free standard input/output, but not free Google Search grounding. This test uses no
search tools. [Model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
lists structured outputs. Neither published availability nor passing local tests
proves live service access, useful news quality, or successful delivery.

## Live result — September 16, 2026

[Run 35136151174](https://github.com/itworksinprod/first-fold/actions/runs/35136151174)
used commit `46ee0ef`. The project visibly remained Free tier before launch.
All 1,002 local tests passed. The availability probe succeeded, and all three
regression batches returned structured verdicts without provider errors.

Six of eight cases passed. The reviewer falsely approved both
`hypothetical-path-as-measured-result` and
`research-misrepresented-as-product-release`. These are substantive failures,
not transport failures. The existing prompt already requires factual support for
measurements and for headline/deck assertions, so availability is not a fix for
the demonstrated quality problem. Preserve these verdicts; do not repeatedly
sample this unchanged test until it passes or lower expected outcomes.

The gate stopped before writer controls: zero drafted stories, zero delivered
emails and no production changes. Free model access is demonstrated; automatic
editorial qualification is not. A future reviewed design change needs a new
version and additional regression coverage, not relabeling this failed result.

## Human-review writing experiment

The separate manual `gemini-lite-human-preview.yml` workflow makes one bounded
8,000-token writing request using only the stored MIT source dossier. It retains
an escaped, script-disabled HTML sample alongside the evidence, prominently
marked unapproved. It has no delivery credentials, receipt, schedule or live
research. A successful job means sample creation, never editorial approval.

Run `35165174732` failed the unchanged attribution validator. Commit `fc1dbc9`
clarified the existing exact-publisher-name requirement in the isolated preview
prompt; no validator or quality expectation was relaxed. Run `35165325394`
then produced a sample. All 1,007 local software tests passed.

Direct inspection still rejected the original model prose: it generalized to
operational safety assurances, asserted future evaluations without evidence,
and included architecture-specific wording not established by its paired
citations. An assistant-edited sample and explicit review notes were provided
locally to Carlos, separate from the preserved original model output. That edit
is not a successful automatic generation result. Nothing was emailed or enabled
in production. The free model can draft; factual editing remains necessary.
