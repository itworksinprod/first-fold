# Blinded claim and passage review

Status: first live subset trial held. The daily paper and all article holds
remain unchanged.

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
The v1 default, live workflow, validators, schema and expected labels remain
unchanged. The opt-in prompt bindings are:

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
remained Workers Free with no payment method. The next live preflight requires
fresh allowance, independent review of the opt-in revision and explicit binding
of that revision to a bounded runner. No automatic later run has been scheduled
by this checkpoint, and no production or delivery claim follows from it.
