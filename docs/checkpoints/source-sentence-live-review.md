# Complete-source-sentence citation comparison — live checkpoint

Status: preflight; one bounded live attempt authorized, not article approval.

Carlos said “go” following the offline catalog checkpoint. This separate manual,
encrypted, no-email experiment tests `exact-source-sentence-catalog-v1` against
the same saved article. It does not rewrite the article or alter any production
workflow, legacy reviewer, source text, expected verdict, or editorial threshold.

## Frozen boundaries

- Workflow: `.github/workflows/full-article-sentence-review.yml`.
- Existing input secret: `FIRST_FOLD_FULL_ARTICLE_SPAN_B64`; never overwrite it.
- Packet SHA-256: `ca573169c8a123d8bc2f6cddb9d4d24e1c948107e5320504526f17ecd5b5b52c`.
- Draft SHA-256: `528072d9a3a0804c81a2798e384f450ea8120e2f7e59089f1e5652c02ea926f4`.
- Seven unchanged units (headline plus six sentences), 23 spans, 149 body words,
  all six saved source passages and genuine publisher. Eleven exact source units
  per catalog; the excluded heading remains visible in full source context.
- Cloudflare `@cf/openai/gpt-oss-120b`, temperature 0.1, one attempt per unit,
  at most seven requests, 4,800 output tokens each, 33,600 total requested output,
  90-second request timeout. No retries or alternate providers.
- Owner/main/manual/attempt-one restrictions, read-only repository permissions,
  fifteen-minute workflow timeout and existing personal-paper concurrency group.
- Ephemeral RSA-3072 public key only in workflow inputs; private key stays local.
  Only encrypted output retained for one day. No email or paid-provider secrets.

Free plan and current allowance must be inspected before dispatch. Refusal ends
the bounded attempt without a retry. No billing settings may change.

## Success criteria fixed before inference

Verify run/revision/event/actor/attempt and encrypted artifact size/digest before
local decryption. Rebuild every exact request and replay captured parsed responses
with no network. Preserve raw model selections separately from host-materialized
quotes. Structure/provenance/transport failure stops remaining calls. Valid
semantic holds continue to the remaining units, without rewriting any claim.

All seven units / 23 spans require complete valid reviews for citation mechanics.
Every quote must be the original complete catalog substring within unchanged
8–400-code-unit and one/two-evidence limits. No truncation, stitching, silent
expansion or manual repair of model output is permitted.

Separate independent exact-text review must assess quote relevance and contextual
entailment against the predeclared 19 supported / three unsupported determinate
spans plus the ambiguous headline, without giving expected labels to the model.
Check date-change direction, conditional platform scope, registration versus
runtime requirements and invented patch/feature guarantees. Correct identifiers
do not make unsupported claims true. The original article remains held even if
reviewer mechanics pass; article correction and review are a separate checkpoint.

The [offline receipt](source-sentence-evidence.md) does not qualify model judgment.
A green workflow captures reviews only; `articleApproved` and `publicationReady`
remain false. No fresh research, email, production integration or schedule change.

## Local verification

All 2,061 automated tests pass, including 28 new integration tests. These cover
exact packet and legacy-source preservation, full seven-unit coverage, separate
raw selections and quotes, continued semantic holds, stop-on-invalid output,
single-attempt network bounds, encryption, provenance and owner/main authority.
Injected fixture verdicts are mechanical tests, not model qualification.

Independent preflight returned CLEAR with no blockers, independently passing all
195 workflow-selected tests. The actual saved packet produces 8,939–9,678-byte
requests, preserving seven units / 23 spans and all six full source passages.
Legacy workflows remain unchanged. Clearance covers this bounded test only.

At approximately September 30, 2026 02:03 UTC, Cloudflare showed Workers Free,
Active, no payment method on file, and 889.24 / 10,000 daily neurons used. No
settings changed. Current official model/API and pricing documentation was read.
Free allowance is not a guarantee that the provider will accept every request.
