# Step 3 — assisted verification proposal

Status: **Carlos explicitly approved the acceptance-method change on September
29, 2026**. The separate opt-in implementation passes 1,761 local tests and
independent preflight, but its first live trial held at the ingredient review.
No article approval yet.

## Why a different method is proposed

The whole-question reviewers repeatedly check whether an unanswered comparison's
outcome is documented, rather than whether its premises are supported. The last
three live role trials also exposed exact-anchor, citation and reason-text
failures. Typed role/check names did not resolve meaning drift. Those failures
remain in [the calibration receipt](watch-role-calibration.md); they are not
overridden or reclassified as passing.

The proposed method is source-checked, constrained composition plus mandatory
independent exact-text review. It replaces the experimental whole-question model
acceptance gate, **not the factual standard**. Existing permission to keep
iterating does not by itself authorize this change to the agreed acceptance
method. Carlos subsequently gave that explicit approval; the new method still
requires the separate live result and independent exact-text review below.

## Limited scope

Only the pinned saved MIT sample and its existing 27-word question are in scope.
The earlier headline, text and order remain byte-identical, with a 110–225-word
body and at most 36 words in the labeled question. The current assembled candidate
has 210 body words. This is manually curated/template-assisted verification, not
automatic fact extraction, a generalized writer or production qualification.

The private premise map is `watch-assisted-premises-proposal-v1.json` in the
existing September 25 review directory. It separates complete source assertions
and relationships from editorial stipulations. It is not an approved evidence
catalog; quoted-span membership, hashes and grammar are integrity checks, not
proof of entailment.

## Proposed gates, in order

1. Verify the saved baseline, allowed source passages, curated map and template
   identities. Reject extra inputs or changes to the accepted earlier text.
2. Source-check the complete factual assertions and relationships: collision-free
   output property, task, optional quality goal, and the goal's relationship to the
   named measure. Reading individual terms in a passage is insufficient. A
   capability must not become a deployed feature, experiment or guaranteed result.
   Each request must include and check both the complete assertion and its
   relationship text, not silently drop the latter from the model's view.
3. Assemble only the frozen hypothetical comparison. The same task and required
   conditions are stipulations, not documented tested modes. Holding collision
   avoidance as a requirement in both alternatives is our editorial comparison
   setup, drawn from the source's collision-free output property; the reported
   experiments do not establish this exact matched comparison. Only inclusion of
   the selected additional goal varies; the template must not imply that all
   other goals are absent. Do not assert the direction or size of the outcome.
4. Recheck all retained article assertions under their existing source context.
   Their previous source gates stay required. Require every new ingredient and
   relationship judgment to pass; malformed, missing or negative output holds.
5. Independently inspect the entire question, surrounding article and saved
   sources. Explicitly assess presuppositions, unchanged meaning, concrete
   usefulness and readability. Reject a question that merely repeats the text or
   hides a factual assertion behind a question mark.

The approved first prototype must stay separate from the old failed review
path and use a new method identifier. The four retained-field source requests
plus one ingredient/relationship request may use at most five single-attempt
requests and 4,800 requested output tokens, with the existing free provider and
allowlisted models. No editor, retries, fresh research, alternate provider or
email. Independent preflight is required before any bounded live attempt.
Provider unavailability remains an external blocker, not permission to use paid
services or skip a gate.

## Offline negative cases to establish before implementation

The private map freezes decisions for changes that make the optional goal
required, invent an exclusive required-condition-only mode, claim an executed
comparison, assert a safety guarantee, substitute an unrelated quality measure,
change the task or constraints between alternatives, or invent a planned test.

There are two distinct checks: production input binding should reject any
unapproved map/template change; semantic review of each mutation must separately
identify its unsupported assertion or broken comparison. Merely proving that a
modified file has a different hash is not a factuality test. None of these
predeclared decisions is evidence of model performance until tested.
The unrelated-measure case is outside the allowed evidence, not proof that the
proposed measurement would be intrinsically impossible.

## Closure and limits

Implementation: `scripts/automation/assisted-watch-review.mjs` and the manual
`assisted-watch-review.yml` workflow. It pins the existing baseline, catalog,
assembled draft and private premise-map file. The first three source requests
are unchanged; the fourth checks the retained watch assertion against all its
existing evidence. The fifth checks all three complete assertion/relationship
pairs against P5/P20, without a question, prior expected verdicts or mutation
labels in the model input. Synthetic tests exercise negative/missing/malformed
judgments, preserved scopes, request identity, no retries, encryption and late
network rejection. They do not prove the model's semantic reliability.

The full private map stays local/in a scoped secret and encrypted artifact input;
the public repository contains pins, mechanics and receipts, not the saved article.
Even all-positive provider replies return only `awaiting-independent-review`.

Independent preflight passed 164 focused/legacy tests, verified the exact private
pins and unchanged candidate hash, and confirmed all five request boundaries.
An actual-packet mocked run exercised encryption with five requests/4,800
requested tokens and zero real network requests. No code-review blocker was
found for one bounded no-email live trial. These are not model-quality results.

Offline independent review found the three ingredient assertions supported and
all seven negative expectations defensible, subject to the explicit
source-property/editorial-requirement distinction and complete relationship
checks now documented above. Local reconstruction confirmed the pinned question,
draft identity, retained-text identity, 27 question words and 210 body words.
This is feasibility evidence only; no new model performance or Step 3 acceptance.

The new path can close Step 3 for this exact saved sample only after approved
scope, tests, independent code preflight, one bounded live result, verified
encrypted artifact/provenance, exact local replay and independent full-text
approval. A green workflow alone remains `awaiting-independent-review`.
Do not overwrite old holds, modify gold labels, synthesize positive judgments or
transfer approval to revised prose. The new result must state the method change.

No daily delivery, production policy, recipient, billing, editorial score,
freshness threshold or email changes belong to this step. Generalization and
delivery remain later checkpoints even if this sample passes.

## First live result — retained article passes, ingredients held

[Run 36555124430](https://github.com/itworksinprod/first-fold/actions/runs/36555124430)
used verified main `711feb418a9c47f4336e3350291e2a410d9cec23`.
`Check retained assertions and question ingredients without delivery` failed with
`ASSISTED_SOURCE_REJECTED`, after five single-attempt requests and a 4,800-token
requested-output ceiling. All four retained fields passed; all three ingredient
judgments were structurally valid false answers. No email or retry followed.

Artifact `11027301623`, 62,343 bytes, ZIP SHA-256
`a647d829867c6209db05c4815cf3432053bedf9d88b5462f0472fcfaf7be749a`;
decrypted capture SHA-256
`cf3cf1a73f1a2e8f3effc913e44eb4cc518103c6299900bed22c9515a6d3907c`.
All five exact requests and retained parsed responses replayed offline, reproducing
the hold. Earlier text identity passed; the candidate remains 210 body words with
a 27-word question. This did not approve the article or the question.

C1's explanation rejected the statement that a capability example is not evidence
of a performed comparison. C2 rejected non-mandatory/non-exclusive goal wording.
C3 rejected the path-length interpretation and excluded metrics. The source
assertions were concatenated with relationship notes that also contained
editorial review instructions and scope cautions. A proposed narrow repair must
distinguish source-backed relationships from those editorial obligations without
dropping either from the full verification process. Independent assessment is
required before another trial; the current false judgments remain unchanged.

## V2 representation repair — facts and editorial obligations are distinct

Independent exact-text review passed the unchanged candidate but retained the
live hold. It found a repair within the approved method: keep every positive
factual premise and relationship model-checked, while treating source-scope notes
and review instructions as explicit mandatory editorial obligations. In particular,
C3 rejected the substantive shortest-distance/path-length bridge too; that bridge
must not be moved to manual-only review.

The private `watch-assisted-premises-v2.json` freezes all three source assertions
and relationships, seven editorial checks, and a clause-by-clause coverage map
from v1. SHA-256:
`138f99b6eb4c863f23c0dce3b78da4a23b11035995b4353435b8792dbd024fd5`.
The fifth request still checks same-path collision/distance properties, the
additional-goal relationship alongside collision avoidance, and path-length
equivalence. It no longer asks the publisher to support our review instructions.
Every editorial obligation remains in the encrypted capture for mandatory
independent whole-text review; these are not automatically marked satisfied.

All four retained source requests and the assembled article remain byte-identical.
The CLI pins v2; v1 remains available only as a library preparation path for
replaying its recorded failed result. Wrong-version or changed input is rejected
before providers. All 1,764 local tests pass, including 35 assisted-path tests.
No old verdict has been edited, upgraded or discarded. A passing workflow still
only awaits independent review. Independent preflight precedes any v2 live call.

V2 independent preflight cleared one five-call/4,800-token no-email trial after
79 focused tests. It checked clause coverage, unchanged positive assertions,
explicit same-path/additional-goal/path-length relationships, mandatory editorial
checks, exact old-capture replay, candidate identity and all four retained views.
No real provider call was made during preflight; live and whole-text approval
remain outstanding.
