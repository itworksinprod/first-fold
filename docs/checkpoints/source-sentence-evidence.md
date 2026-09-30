# Source-sentence evidence catalog — offline checkpoint

Status: offline checkpoint passed; no live trial or integration.

Carlos approved the next narrow fix after range-citation run 36655424494 chose
five-character year fragments. The new `exact-source-sentence-catalog-v1` is a
pure offline evidence adapter. No provider call, workflow integration, rewrite,
email, research, billing, recipient or daily-delivery change is included.

## Contract and boundaries

The adapter retains the exact candidate, old lossless spans, complete original
source passages and genuine publisher. It derives selectable sentence units
with stable passage/ordinal IDs and exact start/end UTF-16 offsets. Catalog text
is a single original substring, never paraphrased, combined from separate ranges,
truncated, padded or normalized. The model may select only `sentenceId`; the host
resolves both source identity and complete quote. It cannot request a year-only
subrange or supply replacement quote text. Raw selections remain separate from
`quotedPayload`; future callers must preserve raw invalid replies as well.

Full passages, catalog entries and excluded-unit boundaries/reasons are bound
into a new hash. An immutable issued view binds validation. Stale, cloned,
changed-source and cross-contract replies fail closed. Existing v2 validation
still enforces complete ordered span coverage, supported/unsupported/uncertain,
explanation limits, 8–400 UTF-16-code-unit quotes, one/two evidence entries for
supported, duplicate rejection and exact source membership. The semantic prompt
is unchanged except citation transport wording. A real sentence ID is not a
proof of entailment, usefulness, grammar or article readiness.

## Conservative sentence units, not a grammatical parser

The deterministic punctuation scanner does not cut on commas, semicolons,
conjunctions, decimal/version internals, common English abbreviations, initials,
ellipses or unclosed paired punctuation. Dates, conditional clauses, negation
and qualifiers remain inside their sentence units. Generic ambiguity can group
adjacent sentences instead of splitting them; these remain exact contiguous
quotes subject to the same 400-code-unit maximum. The catalog is not advertised
as universally correct linguistic segmentation or proof of standalone meaning.

Too-short, too-long, unterminated or unbalanced units are unavailable for citation.
Their original text stays visible in the full passage and excluded offsets are
recorded; nothing is silently discarded from the review context. If no selectable
unit exists, preparation stops before any model call. Unknown abbreviations,
headings, fragments, unusual punctuation and cross-sentence qualifications still
require judgment; preserving full context and independent review remain essential.
The scanner intentionally favors holding ambiguous evidence over cutting it down
to fit a quota. Its generic rules contain no article-specific names or fixes.

Local resource bounds are 160 segments and 50,000 serialized data bytes, in
addition to the existing input guard. These are not provider limits or changes
to production editorial policy. Both older citation adapters, workflows and
historical replies remain unchanged. The new adapter has no network, credential
access, filesystem write or delivery path.

## Offline completion criteria

Run the full suite plus independent code/result review. Cover exact offsets,
Unicode and whitespace; abbreviations, initials, versions and decimals; quoted
and bracketed punctuation; qualifiers and excluded units; evidence/count/length
gates; binding and malicious-object rejection; and known false claims that cite
real source text without magically becoming factually correct. Preserve all
eight original synthetic calibration controls and their expected labels outside
model-facing data. No synthetic success is model qualification.

Rebuild the same saved seven units / 23 spans / six source passages unchanged.
Verify the new source catalog and historical capture hashes locally. A clearly
labeled synthetic uncertain selection may exercise exact host reconstruction;
it must stay held and must not replace the model's original reply. Closing this
checkpoint means offline mechanics only. A later bounded live comparison and
independent exact-text review remain necessary; the held article is not approved.

## Local verification

All **2,033 tests passed**; 73 focused catalog/range/v2 tests also passed. Initial
independent review found an ASCII-only initial rule that could split accented or
non-Latin names. It was corrected to preserve Unicode letters and combining marks
without normalizing text. Composed/decomposed/non-Latin/lowercase initials and
combining-mark possessives have regressions, alongside common rank/title cases.

The exact saved packet rebuilt seven unchanged units / 23 spans, retaining all
six source passages. Each view offers eleven source-sentence units. The sole
excluded unit is an unterminated heading, still present in full context. The
dates now appear in the complete 105-character shipping/enforcement sentence,
not year-only entries. A synthetic uncertain selection reconstructs that exact
sentence and remains held. Both old parsed replies stay rejected by the new
contract; the original failed capture stays byte-identical. This is zero-network
mechanical verification, not new model output or approval of any claim.

- Adapter SHA-256: `906fcf509072e3a92f9dd1f4de4a435bbc9d3a48b3678a886d910fa22c0d4653`.
- Final private audit SHA-256: `9764bbb5a5f7f69866ac81194c9f074599c19cd70639eff36f113f6892df717f`.
- Provider requests: zero; email sends: zero.

The v1/v2 intermediate offline audit receipts remain private historical records;
v3 binds the final Unicode-corrected implementation. The saved article's catalog
was unchanged by the generic Unicode repair. Final independent review returned
**PASS** with no remaining blocker, independently reran all 73 focused tests,
rebuilt the actual views and verified the final hashes, source reconstruction,
unchanged historical captures and held synthetic selections. It clears only
publication of the offline adapter/tests/docs. The next checkpoint remains a
bounded live citation-selection test with separate semantic and exact-text review;
the original article and daily integration remain held.
