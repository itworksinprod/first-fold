# Structured article trial — no email

This experiment improves evidence entering the free Gemini preview. It does not
activate a new daily writer, send email, enable billing or qualify the automatic
reviewer that previously scored 6/8.

## Evidence contract

Only the manual fresh preview requests `articleEvidenceMode: structured-preview`.
The ordinary collector and production writer retain their defaults. Fetches use
the same reviewed publishers, pinned public DNS, redirects, byte limits and
shared 24-page cache. Search excerpts are re-extracted from their cached fetched
page; a pre-existing excerpt does not count as structured provenance.

The narrow extractor retains captured article titles, heading ancestry,
paragraphs, simple labelled table rows and unambiguous term/definition pairs.
Unsupported relationships (including spanning cells, custom header associations,
multiple captions and extra header rows) are held, not guessed. Nested article
regions and unconsumed text structures are held. This is not a general-purpose
HTML parser and does not guarantee all malformed markup is detected.

The entire permitted page response is examined, but retained evidence remains
bounded to 5,000 characters and 32 atomic units. Omitted units matching the
conservative required-context detector hold the article. Other omitted blocks
are counted. These checks do not prove completeness or semantic entailment.
Article blocks reach the writer without sentence splitting or feed-summary
mixing. Failed or missing structured evidence prevents drafting; a clipped feed
summary cannot quietly substitute for an article.

## Fixed live-test procedure

1. Run the complete test suite and independent extraction review first.
2. Check that the configured Gemini project still shows Free tier. Do not enable
   billing. Existing search free-budget guards remain mandatory.
3. Run the manual no-email workflow once, with encrypted artifacts and the
   unchanged four-request ceiling. The existing single targeted structural
   correction may run within that ceiling; provider/quota failures are not retried.
4. Preserve raw output, initial rejection history, mapped evidence, source holds,
   publication dates, retrieval time and request counts. No manual prose edits.
5. Have the separate reviewer examine each reader-facing field against its
   mapped passages and complete retained context. Record both failures and
   supported controls. A green workflow is not editorial approval.
6. Report actual coverage and usable unedited summaries. An empty or partial
   slate is not a complete edition. A successful single trial does not qualify
   unattended delivery or establish day-to-day reliability.

The earlier edited Google preview is a regression/reference sample only. It
cannot be counted as autonomous success in this trial.

## First live result and observed-layout repair

Run `35239292531` at `ba338a5` read 47/48 feeds but held all four shortlisted
candidates before writing: zero model calls, zero drafts, zero email. Three
were held for unsupported article text layout; the remaining advisory retained
its damaged-evidence hold. This is a failed experiment, not a successful edition.

Direct browser inspection of the Google article identified an observed
`blog-post-full__body` container: the surrounding article contains a Back control
and tags, while the uniquely bounded body contains the full prose and caveats.
The strict extractor now recognizes that body only with unique, balanced div
boundaries, preserves its fetched H1 and retains the existing leftover-text
hold. A provenance-labelled DOM-fragment fixture retains all article prose,
headings and inline links, omitting image URLs; it is not advertised as the
original HTTP response. Tests verify every previously captured source fact
survives into the writer dossier. Unsupported text added inside the body still
causes a hold, including a short new condition.

Encrypted hold records now include candidate URLs and bounded extraction
diagnostics. Public logs retain counts, not source snippets. The unchanged
failed-run packet remains the baseline; a subsequent live result must be
reported separately rather than replacing it.

Independent review also reproduced an unmatched closing-div case that could
hide a later caveat. Strict mode now rejects both unmatched opening and closing
divs. The reviewer verified the regression and cleared one additional bounded
experiment. All 1,036 automated tests pass; this is not editorial approval.

## Second live result: no drafts; diagnosis remains open

Run `35241159841` at `ed22a6c` again read 47/48 feeds, held four candidates,
and made zero model calls and zero email requests. It did not establish
autonomous summary quality. The original encrypted download SHA256 is
`599663e67576c0abff74309458e739aaf84bd0b803b8434e026c256370e131f6`.
The separately preserved decrypted packet is not committed to this repository.

Google's generic exception cannot distinguish fetch from processing failure;
it must not be described as another proven layout failure. The follow-up adds
fixed, allowlisted failure codes and separates fetch/extract/enrich stages.
Unallocated items now have an explicit hold instead of looking like a failed
article capture. No arbitrary exception messages are retained.

Direct inspection of CISA's `icsa-26-258-06` page confirmed its main title and
alert identifier are correct. Its `<article>` elements are related-advisory
cards; the old region preference selected the first card, not the actual
advisory in `<main>`. Strict extraction now explicitly holds this observed
`c-teaser` layout. This is containment, not completed CISA extraction support.
Transport/canonical/primary-heading identity binding and full advisory layout
support remain work to do before those pages can safely be used.

All 1,039 tests pass after these diagnostic/containment changes. Neither live
trial produced a summary for independent editorial approval. No thresholds,
paid services, recipients or daily writer settings were changed. Do not rerun
the writer merely to obtain a green result; diagnose the source boundary first.

## Primary identity and observed advisory support

Guarded local HTTPS replay on September 17 retrieved the actual Google page
(HTTP 200; 204,035 bytes) and both CISA pages (HTTP 200). Google produced 13
usable evidence units locally. This does not retrospectively establish the
cause of the earlier GitHub transport/processing exception.

Strict capture now binds the requested/final URLs, redirects, canonical/og:url
metadata, unique H1 and feed title. It retains the response body hash and capture
time separately from inspection time. A metadata-only HTTP→HTTPS equivalence
requires the same host/path/query and never permits an HTTP request. Contradictory
identities are held. Candidate and dossier identities must also agree.

The observed CISA layout requires a unique primary main, title, alert-code,
release-date and csaf-imported body; it never chooses related advisory cards.
The preview-only advisory format keeps the complete supported body in source
order, including version groups, remediation statements, CVE-scoped metric
rows, disclaimer and revision history. Its explicit ceiling is 18,000 characters
and 128 passages per source. Oversized or unsupported bodies remain held;
the ordinary/production excerpt limits are unchanged.

`vers:intdot/` is version-range notation, not intrinsically a broken fragment
([VERS types](https://www.packageurl.org/docs/vers/vers-types.html)). The narrow
adapter supports only the observed single-CVE, complete `<` integer-dot ranges,
keeps their original wording, and requires exact unique agreement with the
separately labelled product-version group. Other forms remain held. It never
pairs product and fix lists by their DOM order. The prior flattened-advisory
alarms remain for legacy evidence; intact, hash-bound complete advisory context
gets the explicit structured handling. Changed/incomplete context is held.

Local fixtures preserve actual main HTML and identity metadata (original whole
response hashes are in their provenance comments). Reviewer regressions cover
conditions that begin with “Cookie,” duplicated ranges, stale capture timestamps,
and unique passage IDs. Both advisories identify their CISA posting as a later
vendor republication; the writer must not portray it as a newly discovered flaw
or newly released fix. All 1,042 tests pass before the next live experiment.

## Third live result and bounded replacement repair

Run `35272033595` at `29c4052` read 47/48 feeds and made zero model calls and
zero email requests. New ABB and Bransys advisory formats were held; Mendix
was not allocated a capture. This was not a writing success. The encrypted
artifact SHA256 was `d5c10dbb3182c037b6ceaa120055d94e8b3b53524b8b470af195d88e36c33529`.

The preview adapter now supports ordinary `<dotted-version` platform ranges
with CVE-specific accordion membership, exact product/version agreement,
known-affected status, remediation presence and separately labelled metric
tables. Complete source context is still retained. Unsupported compound/mixed
status ABB material remains held. Both complete and unmatched heading resets
that could lose CVE attribution are rejected. Tests cover reordered CVE sections
and table columns, duplicate/missing products/CVEs, orphaned relationships,
and the late exploitation caveat.

Preview allocation reserves four initial attempts per desk (16 total), then
up to eight remaining attempts round-robin across desks. At most two usable
captures per publisher/desk and six per desk are retained, with a separate
four-attempt publisher/desk and eight-attempt desk ceiling. All attempts share
the existing 24-page network cache; search may already have consumed some
slots. Failed captures remain visible. Legacy allocation is unchanged.

Local current-feed checks exposed scoring excerpt contamination: generic CISA
recommended practices crowded actual event/CVE details out of the 1,200-character
scoring input. A preview advisory scoring view now rotates through complete
summary, vulnerability, remediation and product-scope blocks. It excludes
generic legal/defensive boilerplate from scoring only; all of that context still
reaches the writer. Score weights, component floors and thresholds are unchanged.
The saved two-source replay leaves Bransys below its materiality floor and
restores Mendix's topicality; the change does not force a candidate to pass.

Verified identities survive extraction holds. Optional-search diagnostics now
distinguish disabled, no-request, completed and failed stages without recording
arbitrary exception text. Prior `webSearch:null` does not establish search usage
or remaining quota. No daily writer, recipient, billing or delivery changes are
part of this experiment. Raw resulting prose still requires independent review.

## Fourth live result: reserve capture reached; readiness shortlist truncated

Run `35275761499` at `75fcca1` completed 24 capture attempts, including eight
replacements, and retained four usable captures. It still made zero model calls
and produced no drafts. Discovery recorded zero requests (not an invented
successful search receipt). Its original encrypted artifact SHA256 is
`e777bdb93c563263fce69efc6a208104122ec8e2b737b8bb6e63d0dece9920e4`.

The collector applied its ordinary three-candidate-per-desk display shortlist
before the preview readiness gate. Three held leaders could therefore conceal
a captured accepted alternative. Strict previews now expose up to ten already
accepted candidates per desk, within the existing 40-candidate preview ceiling,
before readiness and the unchanged final desk/entity-diversity selection.
Ordinary production candidate limits are unchanged. An end-to-end collector
fixture verifies three unreadable leaders plus a readable fourth candidate
produce one ready selection; no threshold, source veto or fetch limit is relaxed.

## Fifth live result: real draft produced, independent editorial review rejected it

Run `35276594259` at `8a9ff9e` completed 47/48 feeds, 24 capture attempts and
eight replacements. It produced one draft after an initial structural rejection
and the existing single correction (two model calls, zero email requests).
The encrypted artifact SHA256 was
`655acd7b9d2080c26fb2d9e500fbcaf5d38ac92b024224eca59eed73dad2ce24`.
This is evidence of functioning research-to-draft plumbing, not writing quality
or delivery readiness. The independent reviewer held the unedited raw draft:
its claims were supported, but the deck lost an attack condition, its analysis
invented score causality and operator error, its action omitted update-branch
applicability, and its chronology omitted the vendor origin/republication.

The raw rejected draft and field map are retained as a negative regression.
A preview-only advisory outline now asks for concrete scope and action facts,
with chronology and conditions made explicit. Narrow known-defect alarms are
also rebuilt during final review; they are not an entailment checker and cannot
approve prose. The ordinary production writer and editorial scorecard are not
changed. Fresh previews do not automatically retry an advisory editorial alarm.

The next isolated experiment reconstructs the same 59 source passages from the
already-public stored CISA main capture. Both source text and serialized passage
hashes must match run11. That fixture is NOT the same full HTTP response: its
capture hash is distinct, retrieval timestamps are unknown, and a new dossier
and review binding are generated. It is labelled stored-evidence correction,
not fresh research or today's paper. One actual Gemini request maximum, no
retry, no search/email credentials, and encrypted outputs including failures.
The raw result requires a new independent field-by-field review. No manual
prose rewrite is part of the experiment.

## First stored correction: date false alarm and remaining editorial defects

Run `35278773452` at `127846c` made exactly one model request and no research
or email requests. The artifact SHA256 is
`ea2d4837866b3e9f7943e62e6c62161a9ec99191e3825414518e94e92fafa229`.
It was held for `NUMERIC_CITATION`: correctly written calendar dates were
compared with ISO source strings as unrelated numeric tokens. Independent
review also found a date-only citation attached to a technical claim and
inferred compatibility/fix pairings. The scope analysis genuinely improved,
but this remained an unapproved failed attempt, saved as another regression.

Evidence-mapped previews now treat calendar-valid ISO and full-month written
dates as atomic equivalent anchors within the same field's cited passages.
No day/year fragments are added to a numeric allowlist; wrong dates, invalid
dates, versions and dates available only to another claim remain constrained.
Production callers retain their existing numeric contract. The chronology
alarm uses the same complete-date equivalence. The outline separates provenance
from technical substance, and known-defect alarms retain the remaining citation
and unpaired-fix failures. The next single-request experiment uses the latest
raw rejection and preserves both failed predecessors. All 1,071 tests pass;
independent review cleared the experiment only, not its output or delivery.

## Second stored correction and citation-assisted private handoff

Run `35279835448` at `1f7b0ba` completed one model request and passed structural
checks. Its encrypted artifact SHA256 is
`2f10611aa93a4507e02674c2edb7f901d905e291f3b3ea5b787e78218879f549`.
Independent review found the factual writing supportable but held two exact
citation gaps: the headline needed S1P18 for the signature flaw, and the
chronology claim needed S1P54 for verbatim vendor conversion. The original
model output and held review remain preserved; this was not untouched-output
semantic approval.

For the private handoff only, the assistant added those two citations with
zero prose edits and generated a new packet, audit and independent review.
The reviewer approved all six fields of that exact corrected packet. The
rendered-story hash stayed
`d98a7122fbee721ed2715e901e36d8d7643bbdd415ae01afe345ce7ccebd9660`.
The review gate reports readyForPrivatePreview true, humanApproved false and
deliveryAuthorized false. This is explicitly citation-assisted stored evidence,
not fresh research, a complete paper or unattended delivery qualification.

Preview claims can now include three distinct supporting passages when origin
and two dates need separate citations. Production remains at two supports;
claim counts, word limits, source checks and independent review are unchanged.
Tests reject zero, duplicate, unknown and excess supports. All 1,072 tests pass.
No email, recipient, daily writer, billing or public-edition settings changed.
Fresh multi-desk research and unattended citation correctness remain unproven.

## Publisher coverage and evidence-based selection experiment

The untouched second correction is now an exact negative fixture. Field-local
alarms require technical-description evidence in a technical headline and the
origin disclaimer in the same claim that describes verbatim conversion. These
are known-gap alarms, not proof of entailment or automatic citation repair.

Read-only current-feed diagnostics on September 17 exposed unreadable GitLab,
AWS What's New and DOJ layouts. Preview-only, exact-host/path adapters now
preserve the balanced primary body, GitLab's visible standfirst and DOJ's
subtitle. AWS's distinct date/prose containers are explicitly checked. Unknown,
duplicate or unbalanced containers and unparsed substantive text remain held.
These sources use a complete-context ceiling of 12,000 characters/96 blocks,
with no omitted blocks or re-selection in the writer dossier. Repeated blocks
receive distinct source-order citation IDs. Production extraction is unchanged.

The first read-only comparison improved usable captures from 4 to 11, but still
selected one story: keyword-only ranking discarded useful non-security evidence.
The isolated fresh preview now includes one evidence-based editorial assessment
using the existing importance/usefulness rubric, 70-point threshold and single-
source component floors. It receives only structurally verified, in-window
source passages, with at most two candidates per desk/eight total and a 52KB
slate ceiling; whole dossiers are omitted rather than clipped. Hard vetoes,
source strength, freshness, desk assignment and other score components cannot
be changed by this model. Scores, exact passage-bound quotations, rationale and
dossier hashes are retained privately for independent review. A valid quotation
does not itself establish that the model's proposed significance is justified.

The editor shares the unchanged four-model-request cap: one assessment leaves
at most three story calls, including any structural corrections. Budget omissions
are explicit, not described as quiet desks. Provider/format/quote-validation
failures stop later model requests. No paid fallback, automatic approval, email
credential or production policy change is introduced. Full local suite: 1,084
tests pass before the live experiment; this is not a successful-live-paper claim.

Independent review required retention of the exact editor slate, initial
scorecards, omitted candidates and bounded parsed failures, not merely hashes.
These now remain inside the encrypted audit. Fresh diagnostics retain raw
draft/map/evidence rather than duplicate rendered HTML; a review view can be
rebuilt offline. The packet is bounded to 340KB inside the pre-existing 350KB
encryption envelope, with a conservative reservation before writer calls.
Neither encrypted artifact storage nor a model's selection verdict grants
delivery authority or independent factual approval.
Post-editor research, coverage and selection failures also return a fixed-code
sealed no-draft record, preserving the spent call and its original audit rather
than throwing away the diagnostic when a later gate fails.

## First publisher/editor live trial: more coverage, no approved drafts

Run `35283661213` at `fe7e574` read 47/48 feeds and captured 11 usable articles
within 24 requests. Web discovery recorded zero search requests. One editor call
and three writer calls selected GitLab rate limits, AWS T8i and Bransys ELD. The
workflow was green because GitLab passed structural checks; independent review
held it. The encrypted download SHA256 was
`f8220abe1014cf9350a2ed7af29a919cdef0a5adae9487b9898360e00bd8b4b5`.

GitLab's deck lacked its own cited Free-account support; the analysis turned the
publisher's rationale into a guarantee and lost preview-window audience limits.
AWS failed originality and dropped the second percentage's upper bound. Bransys
lost the source's subset-of-carriers restriction and invented remedy ambiguity.
All seven model-assessed scores increased; several rationales drew details from
uncited passages. This is not evidence of editor selectivity or autonomous quality.

The untouched three outputs remain negative regressions. Shared preview alarms
now cover the observed guarantee, percentage upper-bound and preview-audience
losses; advisory checks cover the specific subset scope. Identical remedy texts
repeated by CVE no longer falsely trigger the ambiguous-fix-list rule; genuinely
different unmapped fixes retain it. The writer is instructed to attribute vendor
performance claims in each field, preserve scope, cite eligibility locally and
use shorter original sentence structures. The editor must keep rationale facts
within its own quoted passage. These instructions and narrow alarms are not
semantic proof; another unchanged-budget experiment still needs independent
review, with no email, billing or daily-production changes.

## Second publisher/editor trial: two structured drafts, still held

Run `35284845154` at `e668236` completed 47/48 feeds, 24 article requests and
10 usable captures. One editor and three writer calls remained within four.
Two drafts passed structural checks, but independent review held both: GitLab's
analysis omitted its own detailed workload-rationale passage; AWS's deck and
analysis still needed publisher attribution, and its action resolved ambiguous
purchase-option wording into an unsupported specific relationship. Bransys was
correctly held for subset loss and also merged different protocols' impacts.
No prose, map or source was changed to turn either result into a live success.
The encrypted artifact SHA256 is
`65593aaad28a77b238b01e054c09704889507e79bf65a68fd4f568536d8a35db`.

All seven editorial rationales stayed within their quoted passage in substance;
six scores increased and one was unchanged. Every assessed candidate passed,
so ranking calibration and selectivity are still unproven. Search again issued
zero requests. A narrow diagnostic fix now retains only an allowlisted provider
status, so future zero-request quota/billing holds have an explanation. No quota
increase, credential exposure, retry, source admission or selection change results.

The next isolated writer revision adds a shared single-publisher performance
attribution alarm, keeps applicability prose away from unsupported causal benefits,
and sends separate intact per-CVE descriptions/conditions to discourage merged
impact scopes. Raw run-13 drafts remain negative fixtures. These remain narrow
alarms and prompt obligations, not an automatic semantic approval system.

## Third trial: reserve correction capacity, keep rejected outputs

Run `35285896178` at `c2730d9` retained zero drafts: GitLab encountered the
legacy prose guard's literal `access token` ban in otherwise legitimate
authentication advice; AWS and Bransys repeated twelve-word source sequences.
Independent reading found no further substantive GitLab defect, but its raw
output remains held. Bransys's deck still needs scope/impact review. Artifact
SHA256: `c9da23f64ae5613c8eff4886cfd6d11b8c9c80246ef1618563fcec1c035b500f`.
Web search now positively records `quota_exhausted`; no paid or extra-account
workaround was enabled. Feed research remains available.

The isolated preview now reserves one of the unchanged four calls for a single
targeted mechanical correction, selecting up to two first drafts after its
editor call. Omitted lower-ranked desks are explicitly budget omissions, not
quiet desks. Only originality and recognized bounded text-field shape feedback
qualify; broad unknown shape, provider, quota and semantic/advisory failures do
not. Original rejection and correction remain encrypted and separately auditable.
The credential guard is unchanged; the writer can describe authentication
generically. A corrected draft still needs the same independent semantic review.
Known advisory/reader alarms are evaluated even when an earlier structural check
fails, provided the parsed fields have a safe bounded shape. Mixed shape/certainty
and copying/advisory regressions prevent such failures from being misclassified
as mechanical-only corrections. Unassessable malformed drafts receive an explicit
non-mechanical hold instead of an empty alarm list. The full suite passes 1,095 tests before another
live experiment; this is not a live quality or delivery success.

## Fourth trial: isolate invalid editorial citations

Run `35287063892` at `97e10aa` stopped after one editor call, before any writer.
It completed 47/48 feeds and 11 usable captures within 24 article requests.
Web discovery explicitly remained `quota_exhausted`. The encrypted artifact
SHA256 is `dcfd072a2341e58e93b3c6250425d8d4af93ce45ed0ff730381012956bc338ef`.
Independent inspection confirmed five exact own-passage editorial quotations;
Corretto inserted `/of`, and ECS cited P1 while quoting P2. Neither raw binding
has been corrected or presented as valid.

The isolated editor now separates global schema/ID failures from per-candidate
source binding failures. Malformed, empty, duplicate or unknown-ID responses and
provider failures still stop all model work. A well-shaped invalid citation
explicitly rejects its candidate, even if the prior scorecard had accepted it.
Submitted omissions are also explicitly rejected; unsubmitted candidates remain
unchanged and distinguishable. The original scores, complete raw response and
each disposition stay in the encrypted audit. Entirely unusable slates stop;
surviving bound proposals still face unchanged score floors, evidence checks,
selection and independent draft review. This is failure isolation, not semantic
entailment or proof of adequate editorial calibration, and adds no model calls.

## Fifth trial: source-qualification correction remains independently gated

Run `35288058141` at `83cfcb3` correctly isolated Corretto's invalid quote and
reached two writers. It used three calls, 47/48 feeds, 24 article requests and
10 usable captures, with search still `quota_exhausted`. Neither draft passed.
Artifact SHA256: `ea76a6df128f8154ed7be0f8120742961607e8f08ee50af3eb24dd740c15c48e`.
GitLab omitted its preview audience and its deck cited a passage that did not
name unauthenticated traffic. Bransys's warnings included lexical false positives,
but independent review also found omitted affected-broker scope and unsupported
"server files"/"stored data" wording. Both unchanged drafts remain negative
fixtures. Some editorial rationales again exceeded their cited quotes; quote
binding must not be represented as factual entailment or ranking calibration.

A narrowly named source-qualification correction can now use the existing
single spare call: only `PREVIEW_AUDIENCE_SCOPE_REQUIRED`, reproducible in the
named field and tied to its intact source passage, optionally alongside already
eligible mechanical errors. Every other semantic/advisory error and all provider
or quota errors remain nonretryable. First drafts also receive the exact source
audience paragraph as an explicit obligation. Corrections must recheck all own-
field citations, including unflagged fields; flags are not exhaustive semantic
review. Original and correction remain separate, the repair kind is recorded,
and the unchanged validator and independent review still gate private preview.
No raw fixture, alarm, quality threshold, daily workflow or billing was bypassed.

## Sixth trial: ranking drift requires a named diagnostic target

Run `35289154556` at `c80a499` used three calls and produced no reviewable drafts.
All 48 feeds completed; 10 captures were usable, and web search remained quota-
exhausted. Artifact SHA256:
`fadb1a83f30b3d09d7618ffeb61ca5dff02d249564593af7c655bd99c2e70963`.
Ranking selected Bransys and AWS rather than GitLab, so the new audience
correction was not exercised. Bransys still omitted affected-broker scope and
strengthened a conditional impact; AWS again inferred a Savings-Plan/Spot
relationship and cited the wrong passage for a T3 reference. These are genuine
holds, not reasons to broaden retries or loosen validation.

The manual preview now offers one fixed diagnostic target, the exact GitLab
rate-limit source and candidate identity. It is selected only after normal
editorial acceptance, evidence, freshness and source gates. An absent, rejected
or ambiguous target stops with no substitute. Baseline ranking and displaced
candidates remain recorded. This mode has a smaller three-call cap: one editor,
one first writer and at most one already-permitted correction. Standard sampling
and its four-call cap are unchanged. Targeting is not evidence of ranking quality
or an edition; independent review is still required, and a first-pass success or
an unrelated failure must not be forced into a correction.
