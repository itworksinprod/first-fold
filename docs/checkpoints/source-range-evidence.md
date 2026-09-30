# Source-range evidence adapter — offline checkpoint

Status: offline checkpoint passed; no live inference or integration.

Carlos said "go" to the offline range-selection fix after full-article run
36651712972 failed on a quotation joined with an ellipsis. The historical run
and response remain held and unchanged. This is a new versioned evidence
transport experiment, not retrospective repair, a live retry or article approval.

## Change and invariants

`lossless-source-word-range-v1` supplies the same complete source text plus
numbered whitespace-delimited tokens. Tokens retain punctuation; boundaries use
UTF-16 offsets, with one-based inclusive word numbers in the model's response.
The model selects `evidenceId`, `startWord`, and `endWord`; it cannot supply quote
text. The host slices the original passage once between those boundaries,
preserving all internal spaces, Unicode and punctuation. Separate selections
remain separate quotations; the host never stitches, normalizes or repairs them.

The new review hash binds the sentence, original lossless spans, full passages
and token index. An issued immutable view binds validation. The host translates
the selections into a separately labeled `quotedPayload` against the old issued
v2 view, and reuses its existing exact-membership, 8–400 UTF-16 code-unit length,
one/two-evidence, duplicate, verdict, explanation and full-span coverage checks.
The new response preserves model `rawSelection` separately from constructed
quotes. Future callers must privately retain the original parsed response even
when invalid; a materialization must never replace the raw model capture.

Entailment rules are unchanged except the transport-specific citation wording.
An unsupported assertion remains unsupported even with a valid source range;
range validity and source membership alone cannot prove meaning. Tests deliberately
demonstrate that an injected model false positive remains possible. No overall
article approval field is introduced. Semantic calibration and independent
exact-text review remain required before any model/profile is qualified.

Indexing rejects malformed UTF-16, over 400 tokens per passage, over 800 total,
or over 50,000 serialized data bytes; nothing is silently truncated. These are
local resource bounds, not provider limits or production news-source policy.
The adapter is pure and has no network, credential, file-write or delivery path.
It is not imported by the full-article workflow. The v2 contract and old live
workflow are unchanged.

## Offline success criteria

Tests cover exact substring reconstruction, punctuation and Unicode boundaries,
inclusive endpoints, reversed/out-of-bounds/noninteger selections, source IDs,
duplicate/extra evidence, stale hashes, reordered/missing spans, source limits,
malicious objects, immutable provenance, unsupported assertions with valid quotes,
and rejection of old ellipsis replies without guessing a corresponding range.

The original eight balanced development controls are structurally built without
changing text, labels, evidence or semantic instructions. No model evaluates them
in this checkpoint. The seven held-article units and all six source blocks must
also build unchanged; a separately labeled synthetic uncertain control may test
host reconstruction of the full 297-character first passage. It is not an
article judgment. The historical response must remain invalid and byte-identical.

Offline completion requires the full test suite, actual-input mechanical audit
and independent code/result review. Live word-range selection accuracy, semantics,
headline ambiguity, article correction and daily delivery remain unqualified.
A later bounded live comparison must be separately configured; no live request
is part of this offline fix.

## Verified offline result

All **1,968 tests passed**. The independent reviewer separately passed all 36
focused new-adapter/old-contract tests and found no blocker. They independently
rebuilt all seven saved article units and 23 spans with the same six source
blocks. The old ellipsis reply remains invalid; the synthetic uncertain range
reconstructs the complete 297-character passage exactly without changing its
held verdict or the original capture.

- Adapter SHA-256: `6b0b4adb8975d9934dda8d276f5b150a0f4fc0055594704ccc5d4e89531ca8dd`.
- Private offline audit SHA-256: `163440b7f5c2c93bdf378ab870fe26bb4c0ca02e15666581015cbdf04e4a5b4f`.
- Provider requests: zero; email sends: zero.

Independent conclusion: **PASS for offline mechanics**, clear to publish this
isolated adapter/tests/docs. There is no inherited semantic qualification from
the former citation contract. Live selection behavior and evidence relevance
still require a bounded test and exact independent review before integration.
The complete-article checkpoint and original draft remain held. No API setting,
model, billing, recipient, workflow or production schedule was changed.
