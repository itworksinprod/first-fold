# Joint source inference repair

Status: offline implementation checkpoint complete with 2,226 passing tests and
independent clearance. There has been no new model request or live semantic pass.

This isolated revision addresses the two reasoning failures in the
[five-call passage trial](passage-scope-live.md): rejecting a conclusion supported
by a general rule and a separate exception, and calling unsupported exclusivity
a direct contradiction. It also records when a correctly retained restriction is
misclassified as absent. It does not change the original sixteen source controls,
their final labels, the existing evidence gates or the daily newspaper.

## Generic review instructions

The new `joint-passage-inference-v2` view adds a generic clarification to the
existing passage prompt. It asks the reviewer to combine all supplied passages
before judging their contributions. A rule and its explicit exception can jointly
support a conclusion about the remainder of the same population; no one source
sentence has to repeat that conclusion word for word. A retained restriction is
preserved rather than missing or absent merely because it is inferred correctly.

The same instructions preserve the limits on that inference. A necessary
condition is not a guarantee, a conditional rule does not prove an observed
event, and a universal statement does not establish an unmentioned subgroup.
Unsupported exclusivity must not become a contradiction through an invented
population. No control names, answers, case IDs or article-specific replacement
text appear in these instructions.

The wrapper binds the revised prompt hash into a new review hash. It preserves
the source text, publishers, spans, full passages, catalog and response schema,
apart from that binding. All structural and citation checks delegate to the
unchanged prior validator. A separately labeled host projection changes only the
binding hash for that delegation; raw model text, verdicts, passage classifications
and citations are never repaired. Old captures cannot pass as new reviews.

## Host only reasoning checks

The independent reviewer recommended exact final-basis expectations for all
sixteen existing controls and fourteen decisive qualification anchors. These are
new, explicitly declared development-set checks informed by observed failures,
not hidden tests or a claim of generalization. The original source and verdict
labels remain unchanged. Expected fields and their rationale never enter model
inputs.

The host checks supported versus contradiction versus insufficient evidence,
plus one unambiguous preserved or missing qualification where appropriate.
Visitor-only exclusivity and unobserved rejection events deliberately have no
forced qualification tag: their basis is clear, but those passage tags can be
reasonably interpreted in more than one way. Other contribution and qualification
fields remain unscored and need independent review. They are not silently counted
as semantically correct.

The expectations SHA-256 is
`174aca301c001c89e9279177ee2529aeb010e288630ec8e432066821d5fde9d0`.
The original controlset SHA-256 is still
`22ba98ba1abbc942aff656912fefb3f2c35aae2ba9bb56b736b8f7ccff2b6341`.

Diagnostics can inspect recognizable rejected replies without making them valid.
Complete reasoning-field agreement requires complete ordered results, structural
validity, matching original labels and matching declared fields. Even perfect
injected answers leave model qualification, article approval, publication readiness,
provider provenance and explanation-review flags false. Field matching does not
prove that a free-text explanation or a cited inference is sound.

## Frozen failure evidence

The test fixture retains all five parsed replies from run 36791068732 unchanged,
with its main revision and capture digest. It contains fictional development text,
not credentials or private article inputs. The original encrypted capture and
private receipts remain intact. The fixture SHA-256 is
`8fe919c023e28e5f6992d129ca9c87a0850f7d1fbc2aca732634caf734d957f8`.
These are parsed JSON responses, not raw provider HTTP bytes.

Offline replay reproduces four valid matching labels and the fifth response's
final-evidence failure. The new diagnostic layer separately exposes three cases:
the preserved condition marked absent, the overclaimed contradiction, and the
incorrect rejection of the rule-plus-exception inference. A citation-only change
to a separate test clone does not fix the last case's reasoning. No historical
response is changed, rebound or counted as a fresh v2 model success.

## Verification and remaining work

All 2,226 local tests pass, including 34 new tests for hash binding, frozen raw
responses, unchanged rejection gates, strict input handling, balanced scoring,
unscored ambiguity and separation of structural validity from reasoning labels.
The historical prompt, validator, calibration and live workflow remain byte-for-
byte unchanged. No production module or workflow imports the new contract.

Independent implementation review passed after a narrow raw-data preservation
fix. Malformed object-valued diagnostic fields had been retained by reference,
so freezing the report could freeze the caller's response. Observations are now
copied first; the regression covers objects, arrays and nested caller mutability
for verdict, basis and qualification fields. The reviewer independently passed
181 selected tests, including all 34 new tests, and verified the frozen fixture
against the private original capture. No remaining offline blocker was found.

A later live test needs its own bounded setup and exact request/artifact verification, followed
by independent review of the actual responses. This change proposes a prompt
repair and improves what failures the host can measure; it does not yet prove the
model follows the repair. The held different-article draft remains held. No email,
provider trial, new research, billing or delivery-setting change occurred.

When adding live plumbing, keep detailed malformed observed values in the
encrypted capture, not public workflow notices. The offline diagnostics do not
log them or transmit any data. Their successful replay is not a new provider result.
