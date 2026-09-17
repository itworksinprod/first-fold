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

## Fresh research preview — September 16, 2026

The isolated `gemini-fresh-human-preview.yml` workflow uses the existing bounded
free research collector and at most four Flash-Lite writing calls. It has no
delivery credentials or production path. Source packets and drafts leave the
runner only as RSA-OAEP/AES-GCM ciphertext, with the private key retained locally.
Damaged extraction and conflicting URL-date signals hold a candidate for review,
not an automatic assertion that the publisher is wrong. A live Free-tier project
check is required before launch; Tavily retains its existing free-budget checks.

[Run 35173569008](https://github.com/itworksinprod/first-fold/actions/runs/35173569008)
at `4bf1ea7` completed 47/48 feeds, 12 searches, 12 admitted publisher articles,
and one model request. Two candidates were selected; damaged CISA version text
was held before drafting. All 1,012 software tests passed. The Google Meet draft
passed structural checks but **failed manual editorial review**: its analysis
invented ambient-noise causes, frequent meeting delays and guaranteed operational
benefits absent the supplied evidence. The green job is not editorial approval.

The next preview revision requires passage IDs for every non-claim field before
drafting, in addition to existing claim citations. The prompt forbids invented
failure causes and benefits, and asks for source-established eligibility, controls
and limitations instead. IDs are checked locally, but ID validity alone does not
prove entailment. Human review remains mandatory; the earlier 6/8 reviewer result
is unchanged, and no production qualification or delivery is implied.

Run `35174101359` at `f88ea68` again completed 47/48 feeds and 12 searches,
but its one writing response failed `NUMERIC_ANCHOR`. The shared validator
requires non-claim numbers to occur in the two claims' cited passages; the new
analysis reference map does not override that rule. The next prompt explicitly
states this existing constraint. Failed fresh payloads and detailed validation
feedback are retained only inside the encrypted review packet (never rendered
or logged) to make further diagnosis evidence-based. No validator was relaxed.

Run `35174476728` at `6399212` preserved the precise rejection. Its watch paragraph
used September 15, 2026 and explicitly cited `S1P8`, which contained that rollout
date. The old numeric rule nevertheless searched only the claims' citations.
This was a false rejection under the new field-mapped preview contract, not an
invented date. The unchanged saved response passed a local replay after adding
an explicit preview-only field-evidence option: each field's numbers must occur
in that field's own supplied passages. Unknown IDs, duplicate IDs, wrong-field
borrowing and unsupported numbers still fail. All existing production callers
omit the option and retain their previous behavior. This does not establish
semantic support by itself and does not override human review.

## Repaired live preview result

[Run 35175031563](https://github.com/itworksinprod/first-fold/actions/runs/35175031563)
at `61dc77d` succeeded in 2m45s. All 1,014 software tests passed. Research completed
47/48 feeds, 12 free-budgeted searches and 13 admitted publisher articles. One
Flash-Lite request produced a structurally valid Google Meet story; the CISA
candidate remained held for damaged extraction. No email was sent.

Manual comparison with the source found the body grounded in the feature,
eligibility, device-level controls and rollout facts, without the first run's
invented meeting-delay causes and guaranteed benefits. The headline still
awkwardly credited the publication as the product actor. A local reviewed sample
preserves the exact model body and explicitly identifies an assistant-edited
headline. The original model output and evidence remain available separately.

This demonstrates a working free research-to-draft preview, not a qualified
automatic editor, a complete multi-desk paper, or deployed daily delivery.
The automatic reviewer remains unqualified (6/8); daily behavior is unchanged.

The preview now filters the already-accepted shortlist for evidence holds before
reusing the existing desk/entity-diverse assignment. It never admits a rejected
or lower-threshold candidate. Run `35175567442` at `48ecada` found a usable CISA
reserve after the top advisory was held, but both model drafts failed validation:
Google Meet copied a source sequence; the CISA deck cited a passage that did not
contain its version number. That run is a failure, despite the prior success.

A subsequent preview-only change permits one feedback-directed correction for a
structurally rejected draft, provided the entire run remains within four model
requests and initial calls remain reserved for the other candidates. It retains
the initial rejection, repeats all checks and does not retry provider/quota errors
or semantic reviewer verdicts. No repeated-until-green loop or billing fallback
exists. Automatic reviewer qualification remains unresolved.

Run `35176112523` at `ba979a0` succeeded in 2m29s with 1,017 passing software
tests, 47/48 feeds, two model requests and two structurally valid drafts. No
correction request was needed in this run, so the bounded correction mechanism
has local test coverage but was not exercised live here. Three shortlist items
were held; the CISA reserve was selected successfully. Search made one request
and admitted zero extra articles; do not describe this run as twelve searches.

Manual review still found overconfident connectivity wording in the Google draft
and a need to keep the vendor's non-exploitability condition alongside the CISA
impact statement. The local two-story reading preview is explicitly assistant-
edited, not unmodified model output. Google was checked directly; CISA was
checked against captured passages because a separate fetch returned 403. The
pipeline can produce a useful human-reviewed preview for free, but unattended
editorial quality and daily delivery are NOT fixed or enabled by this result.
The Tavily dashboard session expired; its remaining allowance was not verified
in the UI. Existing API-based free-budget guards stayed enabled throughout.
