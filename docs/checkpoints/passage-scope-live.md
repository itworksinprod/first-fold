# Live passage qualification calibration

Status: one live attempt completed, replayed and independently reviewed;
calibration remains on hold. The run stopped after five responses.

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

[Run 36791068732](https://github.com/itworksinprod/first-fold/actions/runs/36791068732)
used verified main revision `f4709da16fd808f91fcd55b708a08076bad34c44` on
September 30, 2026, starting at 23:26:12 UTC. Setup, local workflow tests and
credential-free preflight passed. The step “Measure each fictional scope case
once” failed with `PASSAGE_SCOPE_LIVE_RESPONSE_INVALID` after five requests.
The encrypted artifact was saved successfully. No sixth request or retry occurred.

Four responses were structurally valid and matched their expected final labels.
The fifth, CS05, failed `PASSAGE_SCOPE_FINAL_EVIDENCE`: its recorded missing
qualification cited the second passage, but its final verdict cited only the
first. This is not a quota, transport or credential failure. The requested-output
allowance consumed by the five attempts was 24,000 tokens; this is a budget
ceiling, not measured billable or generated tokens.

Exact-text inspection also found semantic failures. CS04 still describes
visitor-only badge expiry as directly contradicted by a universal expiry rule.
The sources do not establish whether nonvisitor badges exist, so exclusivity is
unsupported rather than proven false. Its matching unsupported label does not
clear the explanation. CS05 rejects the faithful age-at-least-sixteen statement
because the age condition is not directly stated in one sentence, despite the
general reservation rule and separate under-sixteen exemption jointly supporting
it. Its invalid response is not counted as a valid false negative by the scorer,
but its raw unsupported judgment is still a substantive erroneous rejection.

CS06 through CS16 were not attempted. In particular, the earlier copied-rule
false positive in CS06 has not been retested under this contract. The observed
subset does not establish an improvement over the historical sixteen-case run.
Required passage fields expose assessments and allow consistency checks; they
have not established reliable understanding of the passage relationships.

## Artifact and replay verification

Artifact `11131539155` was 33,166 bytes. Its ZIP SHA-256 was
`fbc7b318afa9d7eb6c969e04ccd8bee29196708e97dc7f2b8bcdf85a9c92ff97`.
The decrypted capture SHA-256 was
`d4631178588e6815ebe8fa1ac7a86b6fc904cf9e09ecffa4be280dcee1f08282`.
Run identity, owner, event, first attempt, main revision, artifact size and digest,
encryption key, purpose and limits were verified before reviewing the capture.

All five exact request hashes and parsed responses were verified against the
frozen plan. Offline replay of the complete five-call prefix reproduced the
same invalid fifth verdict, scorer output and stop. It made no provider calls.
Raw provider HTTP bytes were not replayed. The encrypted capture retains the
unchanged parsed response, including the invalid citation selection.

Private receipts use the prefix `passage-scope-live-36791068732` in the existing
September 25 review directory. The original baseline remains intact. Neither
the held article nor daily delivery is approved by this measurement.

## Independent outcome and next step

The independent reviewer returned HOLD after verifying the capture digest,
local file protections, all five frozen request views, prompt/request hashes,
source-catalog offsets, validator results and the full scorer without provider
calls. CS01–CS03 have sound final judgments. CS01's first passage assessment is
imprecise: its outdoor/cracked restrictions are preserved rather than absent,
although the second assessment and overall explanation keep them correctly.
The reviewer confirmed both the CS04 overclaim and CS05's substantive and
citation failures, and found the result receipt accurate.

The execution and diagnosis checkpoint is complete, but semantic qualification
is not. The next narrow offline step is to preserve these raw counterexamples
and add host-only expected basis/qualification-role checks that distinguish
preserved limits and cross-passage inference from isolated-sentence support.
Keep the existing gold labels, citation binding and historical captures intact.
Changing CS05's final citation alone would not fix its reasoning. Any later
prompt revision and live evaluation must remain separately bounded; no unchanged
retry, article correction, email or production integration was performed here.
