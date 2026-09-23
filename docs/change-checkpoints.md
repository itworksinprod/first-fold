# Change completion checkpoints

For each future change: define the bounded success criteria, implement, test
locally, review the diff, publish the intended revision, verify that revision
live, and report evidence. A failed checkpoint remains unfinished. Distinguish
built, locally tested, published, and live verified; do not advance on tests alone.

## Anthropic reader checkpoint

Scope: approve the exact www.anthropic.com publisher host as an originating
article source (not a feed), and retain the selected report's headline, dated
automation findings, human supervision definition, self-evaluation limitation,
compute window, findings, and caveats within the existing 5,000-character budget.

The layout-specific extractor is not a general-purpose full-document parser.
Tables and the appendix are not captured. No claim based on those omitted areas
is qualified by this checkpoint. Publication-date eligibility, story selection,
writing, review, and email delivery are separate later checkpoints.

The no-secret, no-email article-reader-check workflow tests the published revision
against the fixed public URL. It logs checks, not publisher prose. Its success
does not approve a summary or promote any experimental writer.

## Anthropic fact-sheet checkpoint

`checkpoints/anthropic-fact-sheet.json` contains five manually reviewed facts,
supporting passage IDs (one-based newline blocks from the existing extractor),
retrieval time, source fingerprint, and explicit unresolved scope flags. No full
publisher text is republished. Review compares each paraphrase against its cited
passages; figures, denominators, dates, attribution and qualifications must agree.

The hosted evidence-binding check re-fetches the approved URL and rejects any
change to the reviewed excerpt. A passing fingerprint proves evidence stability,
not semantic correctness or independent corroboration. Changed evidence requires
manual re-review, not automatic fingerprint replacement. This is a worked example,
not an automated fact-sheet generator and not a publication-ready daily candidate.

## Fact-summary checkpoint — held after exact-text review

The new opt-in `reviewed-fact-summary` mode uses the existing free Cloudflare
transport and encrypted artifact workflow. Daily delivery is unchanged. One
writer request plus four section checks are capped at five calls and 2,800
requested output tokens, with no retries, paid fallback, search, or email access.
Source drift aborts before inference. The writer receives reviewed facts only;
the reviewer receives the complete captured excerpt. Local checks retain the
150–225-word body requirement, strict text shape, attribution, and 12-word
originality rejection. None is a semantic guarantee.

Live evidence:

- 35812969654 (`969040c`): held at 148 body words, before review.
- 35813294735 (`4671e1c`): reviewer returned ten citations (maximum eight).
  Manual inspection also found unsupported causal/scope expansions.
- 35813534716 (`a9e11ec`): headline passed; next review comparison was 246
  characters (maximum 240). Manual inspection still found scope expansion.
- 35813841200 (`a314cf3`): all four automated field checks passed. Exact-text
  manual review rejected an unsupported implication about impeding autonomous
  AI development, and noted weak/generic analysis. This is NOT email-ready.

The last artifact's SHA-256 is
`7f5a6815c21c722211e0ff22ef3602b90f5947684913de433e1a4ebc9854f4b5`.
The rejected draft SHA-256 is
`aa3d12c7d4d662c2e61cb11a899dfe0b964862e38db1393295b3fb62935a46fa`.
Only encrypted captures are retained in GitHub; local decrypted evidence stays
outside this repository. The observed false positive is recorded in
`tests/fixtures/fact-summary-causal-regression.mjs`; it is not yet a passing live
reviewer qualification. No email, renderer approval, or daily promotion occurred.

Next gate: demonstrate rejection of that unsupported causal inference and
acceptance of a supported measurement-only counterpart before trusting this
reviewer on another draft. Then repeat exact-text editorial review. Do not
replace a rejected statement and carry over its old review approval.

## Causal-review qualification checkpoint

The opt-in `causal-review-controls` diagnostic evaluates four supported controls
and four unsupported ones, including the observed false positive, a rephrased
version, an incorrect compute explanation, and a separate synthetic sensor case.
Expected outcomes and case labels are withheld from the model. The first six
receive the same complete, fingerprint-checked article excerpt. The remaining
pair receives identical synthetic evidence. No draft is generated or emailed.

The experimental strict profile requires support for every clause and causal
relationship, including consequences qualified by “could” or “may.” Its policy
identifier is bound into the evidence/statement hash. Default reviewers and daily
delivery remain unchanged. Maximum eight single-attempt requests, 400 requested
output tokens each; no retry or provider fallback. Invalid responses stop the
run. All expected verdicts plus exact-text inspection of their explanations are
required to close this limited checkpoint. Local mocks verify plumbing, not
semantic reliability; a live pass is not general publication approval.
