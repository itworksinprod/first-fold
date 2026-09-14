# Daily summary repair — September 14, 2026

Carlos reported that the delivered paper had three source-link items and no
finished summaries. Run [34826051869](https://github.com/itworksinprod/first-fold/actions/runs/34826051869)
at `878bb89` sent the accurately labelled fallback, not a successful AI paper.

The ordered generation logs show an initial `EDITORIAL_FORMAT` failure. Its
single format-recovery request produced three drafts, rejected for a copied
phrase in the first claim and two short bodies (109, 99 and 71 body words).
The 109-word draft failed originality, not length. No repair remained. These
logs did not identify the original malformed response's precise cause.

## Bounded repair

The daily Llama writer can now repair only rejected fields when the initial
object is usable. Short bodies retain their existing claims, headlines and
decks; copied claims are rephrased from their exact existing cited passages.
A standalone edit contract avoids mixing whole-story and field-edit output
instructions. Every reconstructed story still needs the original validators
and a final review bound to its exact hash. No second repair is added after
format recovery, and no failed reviewer is retried to obtain approval.

The provider diagnostics now distinguish explicit schema-mode failure,
malformed JSON, absent payload and reported output truncation. Bounded observed
completion counts help investigate native Llama responses without exposing
source text, generated prose, reasoning or credentials.

The no-email quality checker uses the daily Llama model and the same configured
free Tavily discovery. It requires verified search articles, checked summaries
for every selected story, source QA, canonical validation and email rendering.
Its repeat-history ledger is isolated and empty, so its story selection is not
an exact replay of a previously delivered edition. A link-only fallback cannot
make this check green. The checker cannot send email or update daily history.

## Boundaries and verification

The default model, three-call/7,800-output-token writer ceiling, editorial
thresholds, source requirements, recipient, schedule and daily fallback policy
remain unchanged. No paid API or billing setting is enabled. The targeted-field
repair does not, by itself, prove the initial format failure is resolved.

Live verification results will be recorded after observation; regression tests
alone are not proof of a working live summary or email delivery.
