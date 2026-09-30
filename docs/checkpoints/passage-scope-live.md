# Live passage qualification calibration

Status: bounded setup built and independently cleared, with 2,192 local tests passing. Live results and
independent semantic review are pending.

This separate experiment tests whether the frozen passage-by-passage review
contract notices conditions and exceptions that the earlier live checker missed.
It measures the same sixteen fictional development controls, not a news article
or an unseen holdout. The [offline contract](passage-scope-review.md), source
corpus, expected labels, request model and resource profile remain unchanged.

## Scope and success criteria

Exactly one owner-dispatched main-branch workflow attempt may make up to sixteen
Cloudflare Workers AI requests, one per control in its original order. Each uses
GPT-OSS-120B, temperature 0.1, at most 4,800 output tokens, a 90-second timeout
and no retries. The total requested-output ceiling is 76,800 tokens. Actual usage
is distinct from this ceiling. The job is limited to thirty minutes and shares
the personal-paper concurrency group without cancelling other runs.

Success requires complete ordered responses, valid passage coverage and citation
bindings, all expected labels, verified request/artifact provenance, exact local
parsed-response replay and independent full-source review of the explanations.
A green job means only that responses were recorded successfully. Matching labels
alone do not establish correct reasoning or authorize an article for publication.

The original corpus hash remains
`22ba98ba1abbc942aff656912fefb3f2c35aae2ba9bb56b736b8f7ccff2b6341`.
The contract is `contextual-passage-scope-v1`. Case IDs, scoring labels and
rationales stay outside provider inputs. No case-specific correction is permitted
during this attempt. Valid semantic disagreements are measured through the
remaining cases; provider, transport, provenance or structural failure ends the
attempt without another call. Raw parsed replies remain unchanged in the capture.

## Isolation and free allowance

The only model credential is the existing Cloudflare AI secret. The workflow has
read-only checkout permission, pinned actions and an ephemeral public-key input.
It stores only an encrypted artifact for one day; the private key stays locally.
No article secret, paid provider, fresh research, writer, email, recipient, daily
delivery setting or editorial threshold is changed. The historical baseline and
its failures are retained, not overwritten.

Before dispatch, confirm the authenticated account remains Workers Free and
inspect its current daily usage. On September 30 at about 23:24 UTC it displayed
2.69k/10k neurons, Workers Free Active and no payment method. The display is
rounded and can lag; it does not guarantee enough capacity for every request.
Free-plan refusal stops the attempt without retries or billing changes.

## Local verification

All 2,192 tests pass. The thirty new live-runner tests cover request identity,
single-attempt ceilings, missing or inconsistent passage assessments, invalid
citations, rejected-output retention, quota failures, encryption, main-owner
workflow constraints and the absence of delivery credentials. Injected accepted
responses deliberately overaccept the balanced corpus and score only 8/16; they
are transport fixtures, not evidence of model quality.

The existing independent reviewer found no blocking issues and independently
passed 248 tests, including the exact workflow suite and historical runner tests.
Clearance covers one bounded synthetic trial only, not semantic qualification.

## Live result

Not yet run. Preserve the final run identity, main revision, artifact digest,
capture digest, exact replay receipt and independent semantic findings here
before declaring this checkpoint complete. Even a successful calibration does
not release the held different-article draft or prove production readiness.
