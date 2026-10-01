# Blinded claim and passage review

Status: implemented and tested locally; not yet verified live. The daily paper
and all article holds remain unchanged.

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

The next checkpoint is independent implementation preflight, then at most one
bounded live subset attempt with exact request/artifact verification and review
of both outputs and every saved source. An eight-case pass would still leave
the other eight controls, unseen articles and daily integration unfinished.
