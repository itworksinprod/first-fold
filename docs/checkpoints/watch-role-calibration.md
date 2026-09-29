# Question-role calibration checkpoint

Status: offline contract/control checkpoint complete; two live synthetic trials
stopped before scoring a case. The instrumented second run identified
`ANCHOR_MEMBERSHIP`. A separately versioned indexed-span representation is now
being prepared; it has not passed live. No reviewer qualification or Step 3 article acceptance.
This separate candidate does not replace the existing factual checks.

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

`experiments/watch-role-review.mjs` is pure request/validation code. It issues immutable,
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
requests remain unchanged. At offline closure, the new files were not imported by
any live entry point or workflow. The subsequent opt-in synthetic harness below
is separate; production article and delivery paths remain unchanged.

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

## Next opt-in live calibration — pre-results scope

Following Carlos's request to test the frozen fictional examples, a separate
`watch-role-calibration.yml` workflow uses only the existing Cloudflare account
variable and Workers AI token. No article secrets or arbitrary source input exist.
Only the owner may manually dispatch trusted main on attempt one. Tests, corpus
pin verification and encryption-key validation precede provider credentials.

Exactly eight single-attempt requests at most, in frozen A–H order, use the
existing GPT-OSS-120B profile with 2,400 maximum output tokens and a 90-second
timeout each. Ceiling: 19,200 requested output tokens, not actual consumption.
The workflow allows 16 minutes for requests, setup and encrypted upload. It has
no retry, probe, alternate model/provider, writer, research or delivery action.
Existing account settings/billing are unchanged; free capacity is not guaranteed.

A valid wrong verdict or wrong role is recorded while the remaining fixed cases
run. Quota, transport, truncation, malformed response or provenance failure stops
immediately. All eight verdicts and decisive role checks must match, followed by
independent review of exact explanations and semantic coverage. A green workflow
means only controls awaiting review, never an approved article or policy update.

Each request, prompt and parsed response is bound to the frozen input and recorded
only in a one-day encrypted artifact. Malformed payloads remain omitted, and a
missing response prevents a full replay claim. No expected labels or role anchors
are supplied to the model. The frozen corpus, prompt and schema are unchanged;
only a separate execution wrapper and workflow are added.

Preflight: all 1,713 repository tests and 159 independently run workflow/focused
tests passed. Independent review verified all eight data/prompt/schema views are
identical to the frozen offline revision and cleared the scoped implementation
for one requested synthetic trial. This is execution readiness, not a live pass.

## First live synthetic trial — structural hold

[Run 36516460890](https://github.com/itworksinprod/first-fold/actions/runs/36516460890)
used trusted main revision `57d72204fc8e856a98dbbbde9f9b32fecd9c0f6f`.
Setup, tests, frozen-corpus and encryption-key checks passed. The step
**Review eight fictional questions without research or delivery** failed with
`ROLE_CALIBRATION_RESPONSE_INVALID` on case A. One model/network request used a
2,400 requested-output-token ceiling; zero cases were completed or scored. There
were no retries, writer calls, searches or email sends.

Artifact `11011615976` was 2,352 bytes. Verified ZIP SHA-256:
`aceaa5d82ed9fe9f66de776f23caba3843f3fc6967cb1ba3f185d3cda132c3c1`.
Decrypted capture SHA-256:
`bf17c52439424541f6ae26c35afa5bcde81311b1ef07e2f7d36c3f1b2e35938b`.
Case A prompt SHA-256:
`266c56ebb59968caa7fc87b3f51ff17f07966a6a2f48c830eb4ece50bb3ec7a1`.
Request SHA-256:
`ce68ec3be15db4b87e73a821e4674f9cdd514e63e6b41656767a3313c01a0150`.

The exact request/prompt and transport provenance were reconstructed locally and
independently verified. The rejected parsed payload was deliberately omitted;
therefore a full response replay, exact predicate diagnosis and semantic review
are impossible for this run. The receipt does not establish quota exhaustion,
truncation, or a factual/role judgment. Do not infer those causes or override the
hold. No second provider trial was made.

## Diagnostic-only repair after the hold

The same structural validator now exposes its first failed predicate as one of
17 fixed reason codes. Only the encrypted rejected-call record receives that
code. Rejected prose and values remain omitted; public reports/logs and the
acceptance criteria are unchanged. This cannot recover the missing previous
response or retroactively identify its failed predicate.

All 1,714 repository tests passed. Independent preflight passed 38 focused tests
and compared 192 mutated responses with `57d7220`, finding identical public
verdicts. A separate local comparison checked 1,072 mutations with the same
result. Both checks confirmed all eight input views, prompts and schemas remain
unchanged. Code review found no blocker to this diagnostic-only repair.

This closes the offline diagnostic repair, not live calibration. A separately
scoped future trial would be needed to obtain the first-failure code; no extra
provider request is authorized by this receipt. Step 3, article integration and
daily delivery remain unchanged and unqualified by this work.

## Instrumented trial — exact anchor membership failed

[Run 36520110639](https://github.com/itworksinprod/first-fold/actions/runs/36520110639)
used verified main `721d2aeaa8d4628077ff24c433a127dc3a51833e`. Setup and
validation passed; **Review eight fictional questions without research or
delivery** failed with `ROLE_CALIBRATION_RESPONSE_INVALID`. The encrypted
first-failure code is `ANCHOR_MEMBERSHIP`: an anchor was not an exact contiguous
substring of the question. Its actual wording was not retained, so the precise
copying error, any later defects and semantic verdict remain unknown.

One request / 2,400 requested-output-token ceiling, zero scored cases, no retries
or article/email actions. Artifact `11012219163`, 2,389 bytes, ZIP SHA-256
`648db031b799d09a17d5c2b0308d753e74cf4840c1edc4090c1a895ef1188244`;
capture SHA-256
`88e02fbc715da1815795b46a98864d98691884c702be5c33b6e81bc7d185a3be`.
Primary and independent request-hash verification passed; full response replay
and explanation review are unavailable because the response was omitted.

## Next representation — indexed word spans, not repaired model quotes

Carlos requested continued iteration through Step 3. The separately versioned
`watch-role-word-spans-v2` adapter gives the model a host-built, numbered word
inventory of the unchanged question. Findings select 1-based inclusive start/end
word IDs instead of generating anchor text. Tokenization uses non-whitespace
spans; code slices the original string so punctuation and intervening whitespace
remain exact. No clamping, text replacement or guessing is permitted.

The immutable inventory is bound with the complete question, passages and v2
policy hash. Exact question and hash echo are still required. After strict raw
shape/range checks, decoding creates a canonical anchor and applies the original
240-character, role, reason, citation, duplicate and coverage checks. The old v1
contract and failed captures stay untouched. This is a declared protocol change,
not automatic correction or acceptance of a rejected v1 response.

The eight questions, evidence, expected labels and decisive role checks remain
frozen. Valid raw index responses and decoded anchors are captured distinctly,
inside the encrypted artifact, for exact replay and independent inspection.
Index validity cannot prove the correct words were selected or that explanations
are sound. All eight scores and independent exact-text review remain required.

Local preflight passed all 1,723 tests, including 47 role-focused tests. The next
live scope remains one fixed A–H sequence, at most eight single-attempt calls,
2,400 output tokens each / 19,200 requested total. No probe, retries, additional
provider, real article, email, billing or daily changes. Stop on provider or
structural failure. A calibration pass would permit consideration of a separate
article integration, preserving the retained watch assertion's factual check;
the question-only reviewer cannot silently replace it.

Independent preflight passed 169 workflow/focused tests and checked exact span
reconstruction across repeated/nonbreaking spaces, punctuation and Unicode.
It found no blocking issue and cleared one bounded synthetic trial after
publication, not semantic approval or article integration.
