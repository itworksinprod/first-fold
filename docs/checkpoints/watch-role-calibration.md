# Offline question-role calibration checkpoint

Status: offline contract/control checkpoint complete after local tests and
independent implementation review; not a successful model-quality result.
No provider trial, live qualification or Step 3 article acceptance. This is a
separate offline candidate, not a replacement of the existing factual checks.

## Scope and predeclared distinction

Run 36512680336 returned well-formed JSON but misread stipulated comparison
conditions as claims of an executed experiment. It also introduced an exclusive
baseline and a promised effect absent from the question. Its automated HOLD
remains unchanged. Do not repair the saved response or rerun until green.

The next bounded checkpoint uses fictional examples to separate:

- **Factual premise:** what the question takes as true. Requires source entailment.
- **Hypothetical control:** an explicitly stipulated comparison condition whose
  ingredients and relationships are grounded. Does not assert an actual repeated
  trial, switch, guarantee or operating mode.
- **Unknown outcome:** the grounded measure/relationship being asked about, not
  proof that any particular answer occurred or will occur.

Every true finding needs scoped citations and an explanation, regardless of role.
An invented assertion stays a factual presupposition even inside hypothetical
wording. No difference and worse outcomes must remain open when the text does not
assert a result. Conditions cannot turn into operational assurances, and varying
one optional goal cannot silently remove other goals.

## Frozen fictional controls — expectations defined before model output

All cases share two source passages: a laboratory route avoided marked obstacles
as required, and minimizing route length can be an extra quality goal alongside
that requirement. Independent pre-results review requested explicit minimization
in the source before assigning A a positive label; that correction was made
before any model result. No MIT article or private saved source is used here.

| Case | Expected | Decisive distinction |
| --- | --- | --- |
| A | True | Same hypothetical task/requirements, optional goal varied, unknown effect |
| B | True | Unchanged length is an open answer, not a reported result |
| C | False | Invented completed comparison |
| D | False | Invented announced trials and date |
| E | False | Invented universal real-world collision guarantee |
| F | False | Presupposed demonstrated shortening and causal contribution |
| G | False | Invented documented obstacle-only mode |
| H | False | Hypothetical framing still contains an asserted proven guarantee |

The exact questions, source text and host-only decisive anchor/role expectations
are in `scripts/automation/experiments/watch-role-controls.mjs`. Their combined
SHA-256 is `5d7a7d4451f66feb6784ef41a9f5990bb2d6be67f52cde838d735d6edb618859`.
Any change requires pre-results re-review, not quiet relabeling after a failure.

Case IDs, expected labels and expected classifications never enter request data,
prompt or response schema. Scoring requires both the correct question-level
verdict and the decisive anchored role judgments. A negative case cannot pass
merely by rejecting an unrelated phrase. These eight cases are a narrow reused
calibration set, not evidence of broad reviewer reliability or an unseen holdout.

## Candidate contract and limits

`experiments/watch-role-review.mjs` is pure offline code. It issues immutable,
input-hashed request views and checks exact question echo, bounded reasons,
neutral-answer-description shape, valid scoped citations, role enums, exact text
anchors, source citations for true findings and duplicate/shape/accessor guards.
At least one factual-premise and unknown-outcome item is required. Anchors may
overlap: roles can share wording, so character partitioning is not imposed.

There is no independent automatic semantic proof. Substring membership does not
prove that a reason is faithful, all premises are listed, or the unknown-answer
description is neutral. A regression test explicitly demonstrates that a
well-shaped but wrong explanation can pass parsing. Every result is reported as
a model judgment awaiting independent exact-text review, never approval.

The local tests use labeled structure-only mock responses to check parsing and
scoring. Their passes are not successful model classifications. Existing article
length, factual and meaning guards, saved drafts, source checks and live workflow
requests remain unchanged. The new files are not imported by a production entry
point or workflow. There is no network, credential, provider, writer, renderer,
email, quota, billing or schedule integration in this checkpoint.

## Required evidence before advancing

1. Freeze source/questions/expected roles before provider results; independently
   review both positive and negative labels.
2. Test request binding, parser and scorer locally, including known false-negative
   and hypothetical-guarantee regressions, then independent implementation review.
3. Only after that offline checkpoint, separately scope any opt-in live synthetic
   calibration: provider, exact payload, request/token ceiling and no retries.
4. A live calibration would require all expected verdicts AND exact independent
   explanation/coverage review. No provider call is authorized by this document.
5. Article integration and a new exact-article test are later checkpoints. No live
   calibration, article acceptance or daily promotion follows from unit tests.

## Offline completion evidence

All 1,689 repository tests passed. The independent reviewer ran 92 focused and
legacy watch tests, verified the corrected corpus/expected roles, request-label
separation, strict parsing, issued-view binding and absence of live integration,
and found no blocker. Their suggested literal corpus-hash regression pin was
added; integration checks also recursively scan automation and workflows for
accidental imports of the candidate. Earlier failed runs remain held.

This closes the offline request/control/parser/scorer checkpoint only. No new
model response was obtained or classified successfully here. Neither reviewer
qualification nor Step 3 is complete. Next, separately define an isolated
synthetic-only live harness and its bounded execution scope; do not jump directly
to the saved article or add this reviewer to production.
