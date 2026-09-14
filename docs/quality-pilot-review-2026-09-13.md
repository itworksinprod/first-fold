# First-five review: September 13, 2026

Carlos's September 13 verdict: **below my standard**. He explicitly authorized
the recommended repairs and one test email to the existing recipient.

Five distinct editions have received qualitative feedback in this task:
August 27, August 28, August 29, September 11, September 13. These are not five
complete numeric surveys or evidence that summary quality has been proven.

The supplied samples repeatedly expose generic filler, source-link fallbacks
presented as ordinary papers, disconnected quotations, and weak summary usefulness.
The September 11 sample additionally contained serialized JSON inside prose.
September 13's IPO headline omitted the story's actual subject; its two-publisher
label did not distinguish shared claims from separate coverage of a related event.

## Authorized response

- Keep score weights and selection thresholds unchanged. More score tuning is
  not justified by these qualitative samples alone.
- Enforce self-contained, non-generic summary copy alongside existing factual,
  citation, originality, completeness and semantic-review vetoes.
- Identify source-link fallbacks as a different, incomplete product. Show original
  linked titles instead of disconnected quotations and padded advice.
- Show the narrower source relationship actually established by claim evidence.
- Route explicit IPO headlines to Platforms & Power and developer integrations
  to Work & Tools, preserving security precedence and existing selection gates.
- Test Qwen against current news before adopting it for the daily writer. Preserve
  the 7,800-output-token writing ceiling, free-only model allowlist and search cap.
- Authorize only the September 13 preview with a date-bound confirmation, a fixed
  idempotency key, unchanged recipient and no daily-ledger or public-edition write.
  Every preview story must pass checked-summary validation before sending.

Live verification and delivery outcomes must be appended after observation; passing
offline tests is not proof that a newly researched email was sent.

The first preview attempt, [34791606095](https://github.com/itworksinprod/first-fold/actions/runs/34791606095),
stopped before sending: four initial drafts failed format bounds, only one revision
passed locally, the reviewer returned an invalid shape, and final source QA failed.
No email was sent. Qwen drafting is now isolated by story: up to four 1,000-token
requests, one 2,000-token repair, and one 1,800-token factual review. The total
output ceiling stays 7,800; the call ceiling is six for writing and seven including
newsworthiness. A local counter enforces both bounds. Llama's three writing calls
are unchanged, and existing four-call provenance remains readable.

The second preview, [34792224210](https://github.com/itworksinprod/first-fold/actions/runs/34792224210),
verified six search-discovered articles but sent no email. Its drafts failed field
bounds and numeric citations; whole-story repair fixed none. The repair slot now
accepts only an exact, locally requested set of field edits when the draft's
structure is usable. It measures all field lengths together, identifies bad
numeric citations and missing publisher coverage, and preserves clean fields.
Malformed, extra, duplicate or unsupported edits remain rejected; every rebuilt
story still needs full local and semantic approval. No extra call, output tokens,
paid provider or loosened acceptance threshold is authorized by this repair.

The third preview, [34792755021](https://github.com/itworksinprod/first-fold/actions/runs/34792755021),
approved one summary but again sent nothing: a missing draft forced whole-story
repair for other candidates, and one final link check exceeded its redirect limit.
Repair now combines exact field edits for usable drafts with a full rewrite only
for a missing/structurally invalid story. A looping HEAD request gets a fresh GET
with the same pinned public-address checks and redirect limit; unsafe redirects
still fail immediately and a GET loop still fails.

The live drafts also exposed an unnecessary layout constraint: a 101-character
fact or a 448-character analysis could be rejected even when the complete story
was an appropriate length. Per-field bounds now permit natural balance: claims
60–480 characters, why 120–650, watch 100–550. The complete body must still have
100–225 words and complete sentences. Specificity, factual and numeric support,
source caveats, originality, semantic approval, editorial scores and source
requirements are unchanged. This is a deliberate layout tolerance change, not
evidence that unreviewed prose is acceptable.

The fourth preview, [34793373187](https://github.com/itworksinprod/first-fold/actions/runs/34793373187),
sent nothing. Qwen's remaining failures were outer-object shape, incomplete
sentences, one 98-word draft and a reviewer response that exhausted its output
limit. It is not promoted. The next date-bound preview explicitly evaluates
Cloudflare-hosted `@cf/openai/gpt-oss-120b`, not the paid OpenAI API. Its fixed
profile uses low reasoning, JSON schema mode, 3,800 drafting / 1,600 optional
repair / 2,400 review output tokens (the same 7,800 total), with no provider
fallback or transport retry. Daily production remains Llama pending success.

The [Cloudflare pricing page](https://developers.cloudflare.com/workers-ai/platform/pricing/)
includes this model in the free-allocation pricing table and does not list it
among paid-only models. Workers Free rejects allowance exhaustion; no account
billing setting is changed. The
[official model-format guidance](https://developers.openai.com/cookbook/articles/openai-harmony#reasoning)
documents `Reasoning: low` in the system message. Reasoning text is never used as
article evidence, logged or delivered; only a complete, validated final object
can enter the existing review gates.

The first GPT-OSS preview, [34793883894](https://github.com/itworksinprod/first-fold/actions/runs/34793883894),
sent nothing: two numeric citation mismatches and short drafts required repair,
which exhausted its response budget. The same 7,800-token total is now split
3,000 drafting / 2,400 repair / 2,400 review. A short but structurally usable draft
can repair only its analysis fields to reach the unchanged whole-story length;
its factual claims are preserved and reviewed. This is the final planned live
trial in this pass; free quota or persistent model failure must be reported, not
converted into a weak test email or paid fallback.

## Observed outcome

The final live trial, [34794352882](https://github.com/itworksinprod/first-fold/actions/runs/34794352882)
at commit `75b845b`, verified nine search-discovered articles, then Cloudflare
returned **HTTP 429** for both the optional assessment and writer. No documented
provider code accompanied the errors, so this does not distinguish a short-term
rate limit from exhausted daily allowance. No retry or paid fallback was made.
The `CHECKED_SUMMARY_REQUIRED` send gate stopped the preview before Resend.

**No test email was sent in this pass.** All 747 repository tests, the build and
offline quality evaluation pass, but the revised writer is not proven end to end.
The daily writer remains Llama; neither Qwen nor GPT-OSS was promoted. The
reader-copy, fallback-label, source-relationship, desk-routing and targeted-repair
changes are published. No recipient, schedule, account billing, daily ledger or
public edition was changed. The user-owned untracked edition and design files
were preserved. A future live preview requires a fresh date-bound authorization
after the provider restriction clears; offline passes must not be described as
successful delivery or paid-model parity.
