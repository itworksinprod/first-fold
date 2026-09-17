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
