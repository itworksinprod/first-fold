# Blinded claim and passage review

Status: live scope reasoning remains held; the independently reviewed v3 repair
is locally tested but has not been tested with a provider. The daily paper and
all article holds remain unchanged.

The [compact joint trial](joint-passage-inference.md) returned eight valid,
correct final labels but only five matching reasoning-field sets. It also
misdescribed a necessary prerequisite as a sufficiency condition, then exhausted
the ninth request's output limit. That evidence does not justify an unchanged
rerun or acceptance based on labels alone.

## Actual workload split

This separate experiment gives two requests different responsibilities. Claim
review supplies each contextual span's final verdict, basis, short explanation
and exact final evidence IDs. Passage review supplies every ordered passage's
contribution, qualification, explanation and evidence IDs. Neither receives the
other's answer, expected results, control IDs or a corrective instruction.

Both requests for all cases are prepared before inference. Each includes the
identical complete candidate, every original passage, the immutable catalog and
unselectable text. They receive distinct stage hashes bound to the same original
review. The split does not turn a passage into isolated context or hide an
exception from either call.

The host copies the two responses' fields without edits into a separately labeled
composite. It does not union citations, change a verdict, infer qualifications or
repair disagreement. The unchanged full joint/passage/citation validator then
checks that composite. A supported claim plus a missing qualification is held.
Even separately valid citations can fail if the final evidence was not selected
by its corresponding passage review. Both raw responses remain preserved; the
composite is never presented as a single provider response.

The requests come from the same model, so blinding does not make them independent
factual proof. Independent exact-text review remains required, including when
every declared label and role matches. Completion and quality improvement are
unproven hypotheses.

## Fixed bounded study

The predeclared targeted subset is CS03–CS10: four balanced pairs covering
universal/exclusive scope, separate exceptions, necessity/sufficiency, and
geographic applicability. It includes the previous uncompleted CS09. This is
selected development data, not a fresh holdout or a sixteen-case qualification.

Each of eight cases gets at most two requests, for the unchanged aggregate limit
of sixteen requests and 76,800 requested output tokens. Each request is capped at
4,800 tokens and 90 seconds, with medium effort and no retries. A malformed stage,
provider refusal, provenance mismatch or invalid composite stops the sequence.
A valid disagreement with frozen expected labels remains a measurement and can
continue, but can never make the study pass.

The full controlset and existing verdict/basis/qualification expectations are
unchanged. Subset SHA-256 is
`67cc8dccf3f58ba1c00b88245234eacce06f6ebc99e760bda03e2495e413feee`.
Claim prompt SHA-256 is
`23b71cb5448218906b42b6461e7689e0cad35dff8c3cf7e1bb35ea85dc77137d`.
Passage prompt SHA-256 is
`1c40343da654c883bb8146b33dc835569e6c480d00cd85d43f396e4a9cee6469`.

The new manual workflow uses only the existing free Workers AI credential on
trusted main, owner dispatch and first attempt. Its permissions are read-only;
provider output stays in a one-day encrypted artifact with the private key local.
Public notices include only fixed labels and bounded counts. No paid fallback,
email, research, recipient or production-setting change is included. A fresh
Workers Free/account-usage check is required before live dispatch; quota refusal
must stop without billing changes.

## Local verification

All 2,310 local tests pass, including 42 new split tests. They cover full-context
blinding, stage/case binding, raw-output preservation, lossless composition,
conflicting decisions, uncited final evidence, uncertainty precedence, unselectable
premises, malformed inputs, wrong endpoint/method/body, provenance, output limits,
quota stops, no retries, encryption and public-report privacy.

Historical replies projected into synthetic stage fixtures preserve their
original validator outcomes and reasoning defects. They are not new live model
responses. A deliberately injected perfect eight-case result still leaves full
corpus success, explanation review, model qualification and article approval
false. Local tests verify mechanics, not live semantic quality.

## First live subset result

[Run 36801262924](https://github.com/itworksinprod/first-fold/actions/runs/36801262924)
used trusted main `ccaff3b1dd6762587fea1e847f72d7e1a7143903` after independent
implementation preflight and an authenticated Workers Free check. It made ten
requests, with no retries, and stopped at the fifth case (CS07) when the two
responses could not satisfy the unchanged composite validator. No email was sent.

The artifact ZIP SHA-256 is
`0d1dc2091e05588d5a4751dfe4641ed59ae7b640b1a8e10f934e53e54f65ca0b`;
the decrypted capture SHA-256 is
`c86b13369a85d2867ddc686adc4b0466f4c9f551b1c73b2db328f46efb348ccf`.
All ten exact request hashes, raw stage validations and the complete parsed-response
runner replay were verified locally with no provider calls. Raw HTTP bytes were
not replayed. The independent reviewer checked all ten responses and nineteen
selected complete source slices against the saved sources.

Counts describe different sets, not four successful cases:

- Four composites were structurally valid and matched the binary verdict: CS03–06.
- Four raw basis/anchor sets matched: CS03, CS05, CS06 and CS07.
- Only three cases met both conditions: CS03, CS05 and CS06. This is still not
  article or complete-subset approval.

CS04 continued to infer contradiction from a universal rule and an exclusive
subgroup assertion without evidence that another subgroup exists. Its rejection
label was correct but its decisive basis was not. CS07's claim stage correctly
recognized a necessary condition, while its passage stage incorrectly called an
additional prerequisite a missing qualification. The unchanged validator held
that disagreement. CS08–10 were not called; nothing is claimed about them.

The complete fictional responses are retained as a regression fixture. A test
also preserves the fact that an anchored reasoning match does not rescue an
invalid unscored passage row. The frozen expected labels and validators have not
been changed to accommodate this result.

This trial demonstrates intact failure handling, not a qualified model. Any
follow-up must address the actual claim-obligation error and preserve raw answers,
exact evidence, blinding, original gates and independent explanation review. An
eight-case pass would still leave the other eight controls, unseen articles and
daily integration unfinished.

## Offline follow-up: explicit decision obligations

The opt-in `blinded-claim-passage-obligations-v2` builder adds an operational
decision sequence, rather than changing the candidate or repairing a returned
answer. Claim review distinguishes a source-consistent false situation, a
source-consistent true situation and established incompatibility. Passage review
must identify the actual assertion and the source boundary it crosses before
calling a qualification missing. It explicitly tests whether another prerequisite
can fail while the named condition remains necessary. Both stages still receive
all source context and remain blind to sibling answers and expected labels.

This is a hypothesis awaiting live evidence, not a demonstrated semantic fix.
At this offline checkpoint the v1 default and live routing were unchanged.
The later bounded live wiring below changes only the isolated workflow's opt-in;
the validators, schema and expected labels remain unchanged. The prompt bindings are:

- Claim: `2bf5d26d435a61fe402f43390c8479ff760437aedde031ee69234bde558e8c85`.
- Passage: `3720d5f7e2b7b26263271ad3e6d48ac57ea66f9bd169b961a9edfdb7f3614732`.

All 2,314 local tests pass (46 split tests). Historical v1 answers do not bind to
the new view. Explicitly labeled hash-only offline projections retain the wrong
CS04 basis and the CS07 hold; the new instructions cannot manufacture a pass from
old answers. These tests establish unchanged contracts, not model competence.
The independent reviewer cleared the offline revision after verifying the
hypothetical/established-fact distinction, zero getter/proxy execution and all
46 focused tests. That clearance is not permission to bypass the live budget
preflight or evidence that the semantic failures have been fixed.

At the last authenticated account check on October 1 UTC, daily usage displayed
6.97k of 10k neurons, above the existing launch preflight threshold of 6.3k. No
new provider call followed, and that threshold was not raised. The account
remained Workers Free with no payment method. A later live preflight requires
fresh allowance, independent review of the opt-in revision and explicit binding
of that revision to a bounded runner. No production or delivery claim follows
from this result.

## Approved one-time live verification

Carlos approved one no-email test for October 1, 2026 at 8:05 p.m.
America/New_York, after the daily free allowance resets. This is an isolated
eight-case development test, not a change to the morning delivery schedule.
The existing daily monitor remains separate and unchanged.

The explicit v2 live route passed all 2,325 local tests, including 221 tests in
the workflow-selected suite. Independent implementation review cleared its
prompt and request bindings, unchanged v1 replay, fail-stop behavior and guarded
launcher. This clears the setup for one bounded trial, not the live result.

The scheduled attempt must use the explicit obligation-revision entry points,
not the historical v1 default. All cases, expected labels, source text,
validators and request ceilings remain the same. The local launcher refuses to
start before October 2 at 00:05 UTC or after 02:05 UTC. It requires fresh account
and billing observations, Workers Free with no payment method, and at most
1,000 daily neurons already used. This stricter allowance check replaces no
editorial gate and is not a guarantee against provider quota or availability
failure. If a prerequisite fails, the attempt stops without trying another
model, enabling billing or expanding its budget.

Only one dispatch is permitted. Its local encryption key must be preserved,
the observed run must match the intended trusted main revision, and both raw
responses must remain unchanged in the encrypted result. After artifact and
request verification, the same independent exact-text review is required.
A successful workflow or an eight-case result alone cannot approve an article,
qualify the model on the full controlset, or enable daily integration.

## Expired scheduled window and subsequent evidence

Execution resumed after the October 2 one-time dispatch window had closed. No
provider request was made by that follow-up, and the one-time automation was
removed. Its v2 launch helper and approval must not be reused on another date.
The separate daily delivery monitor was left unchanged.

The earlier remaining-allowance smoke measurement,
[run 36804291981](https://github.com/itworksinprod/first-fold/actions/runs/36804291981),
used revision `d79d0d63d9050ce072832b8ad9d7727806330df3` and four requests on
CS04 and CS07. All four raw responses are now preserved in a fictional-data
regression fixture. CS07 retained necessity correctly in that observation.
CS04 still chose contradiction without establishing an instance outside the
exclusive subgroup. The workflow's green status did not make its reasoning pass.
The verified decrypted capture SHA-256 was
`59ad32c96c27f0cbcfbfac572a1f7fc72bdb3b9e717f00c63241e44347722c16`.

## Local v3 scope-witness repair

The separately selected `blinded-claim-passage-scope-witness-v3` experiment
requires both stages to identify an actual source-backed incompatibility before
calling a claim contradicted. A universal outcome rule does not establish that
an outside subgroup exists. Unresolved membership can therefore leave an
exclusive assertion unsupported without making it contradicted. Explicit policy
exemptions still constrain an obligation, and an additional prerequisite still
does not refute an assertion of necessity alone.

These generic instructions contain no control IDs, gold labels, fictional case
names, or sibling answers. They prepend the unchanged v1 stage instructions;
redundant v2 wording is not repeated, to keep the free test's input workload
bounded. Every candidate, source passage, schema, gold label and validation gate
remains unchanged. Historical wrong answers remain wrong in regression replay;
no answer is edited or counted as a new provider success.

The isolated workflow's `scope_witnesses` input selects v3 explicitly and defaults
to false, preserving the previous v2 route. The owner/main/first-attempt gates,
sixteen-request ceiling, 4,800 output tokens per request, 90-second timeouts,
medium reasoning, no retries and encrypted artifact remain unchanged. No daily
paper, email, billing, recipient or editorial-threshold path changes.

Exact v3 bindings:

- Claim prompt: `a1e4a0f75204b19fcba45ebe17911f8b772aa1020ef08ee6db7c752d0f3068f2`.
- Passage prompt: `2cf1af8897105d444f1a63a0dfe8f7cdb4ed0c29d7fcec7962d9e41b59b597fa`.
- Ordered cases: `eadcc2e157d0ba029e35219e7b364f0114b02acd97ac0054604580a70ada3535`.
- Sixteen request hashes: `6d28bf8fd99b6269f6dc6713b41fa592864fdc3d42618e8c3ebc1535e15ef83d`.

The final workflow-selected local suite passed 236 tests. Two independent
read-only reviews cleared the implementation and live-test wiring, not the
model's behavior. The complete local suite passed all 2,340 tests. These checks establish
contract preservation and failure handling, not live semantic improvement.

Authenticated October 3 account observations showed zero daily neurons used,
Workers Free Active, and no payment method. These observations are not permanent
availability or a dispatch authorization. A new bounded test requires a fresh
usage/billing preflight, a new non-overwritable intent and local key, exact trusted
main/run/artifact verification, and independent review of the complete raw
answers. The expired helper is not a substitute. No new provider requests or
remote publication occurred at this local checkpoint.

Scope-witness live success, even if later observed on these eight development
cases, would still leave the other eight controls, unseen articles and daily
integration unqualified.
