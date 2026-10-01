# Joint source inference repair

Status: v2, default-effort v3 and high-effort v3 live attempts are held. A narrow
v4 entailment-instruction repair is being verified. Daily delivery is unchanged.

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

## Bounded live verification

The separate `joint-passage-live.yml` workflow measures the same sixteen fictional
cases using GPT-OSS-120B on the existing Workers Free account. It allows one
request per case, at most 4,800 output tokens each and 76,800 total, with no retries.
It stops on an invalid response or provider refusal. Valid disagreements remain
measurements and do not cause a retry or a change to the case. The host-only
reasoning expectations never enter the model request.

The setup checks main-branch owner provenance, attempt one, the frozen corpus,
the expectation hash and the encryption key before provider credentials. Detailed
responses and malformed observed fields stay in a one-day encrypted artifact.
Public notices contain only explicitly selected status values and numeric counts.
The private key stays local. Fresh account checks, a unique dispatch intent,
artifact integrity verification and exact parsed-response replay accompany launch.

Independent preflight passed 234 selected tests with no blocking findings. The
complete suite passes 2,259 tests, including 33 new live-boundary tests. Success
requires all sixteen valid responses, matching verdicts and declared reasoning
fields, followed by independent review of every explanation and source passage.
A green workflow alone is not qualification. Even a successful development-set
trial does not approve a news article or prove generalization. Daily research,
email, recipients, billing and editorial gates remain unchanged.

## First joint inference live result

[Run 36795623890](https://github.com/itworksinprod/first-fold/actions/runs/36795623890)
used trusted main `15abe18a6a61a9c7f2ebdf9d929b2618f1919ecf` on October 1 UTC
(September 30 Eastern). It stopped after five single requests, with four valid
matching verdicts and three matching declared reasoning-field sets. No sixth
request occurred. CS05 failed `PASSAGE_SCOPE_CONSISTENCY`: its final joint
inference and citations were sound, but a passage label said a qualification was
missing because the source sentence did not mention the candidate's age phrase.
That reverses the required comparison; the candidate lost no source restriction.

Independent review agrees with the hold. CS01 still marks retained restrictions
as absent, and CS04 still calls unsupported exclusivity a contradiction. CS02 and
CS03 have sound final judgments and evidence. CS06 through CS16 were not tested.
The model's improved CS05 conclusion is not a complete pass.

The artifact ZIP digest is
`6646f04c5c86b2b469357e0b5ca4c6b2633d06830f01d1fd18ac8ea263825388`;
the private decrypted capture digest is
`97aac14be9c096e0b978995909dc126b4a0edd001d3673a099cd6c05ebff006f`.
Run identity, all five exact requests and parsed responses, validation and scoring
were verified and replayed locally with no additional provider requests. Raw HTTP
bytes were not replayed. The unchanged parsed-reply regression fixture digest is
`839200786410138754a5c6467e195edaadb661fcbf8a86b1131cc1c2d08775e2`.

## Consolidated instruction repair

Version 3 replaces the layered model prompt with one ordered generic contract.
It explicitly distinguishes a restriction dropped by the candidate from wording
absent in an individual source passage. It retains joint inference, contextual
spans, every-passage review, contradiction versus insufficient evidence, exact
catalog citations, uncertainty and unchanged negative-precedence checks. A final
self-check asks the model to make its recorded fields consistent, not to change
evidence to force an answer through.

The original controls, host expectations, schemas, validators and request limits
are unchanged. No case-specific answer or example is added. The v2 prompt remains
verbatim for hash auditing, and its live capture remains immutable. New tests
reconstruct the historical binding, reject old replies as v3 results and reproduce
the consistency failure with an explicitly labeled offline projection. A prompt
repair is a hypothesis; neither shorter instructions nor synthetic tests establish
that the model now follows it.

## Consolidated prompt live result

[Run 36796305352](https://github.com/itworksinprod/first-fold/actions/runs/36796305352)
on `f7c2a89a8234180dd1de7e5a63af05520512fd38` stopped after seven requests: six
valid matching verdicts and five matching declared reasoning-field sets. CS05 now
combines the rule and exemption correctly, and CS06 rejects the omitted exemption.
CS01's scored preserved-restriction anchor is corrected. CS04 still overclaims a
contradiction. CS07 marks an additional requirement missing even though the
candidate asserts only a necessary condition, not sufficiency. Its supported
verdict conflicts with that missing flag, so the consistency gate correctly holds.
The independent reviewer confirms these findings; CS08 through CS16 are unobserved.

Artifact SHA-256:
`4f79eb3b00d811b0c4aa4b4d4283b996f0c12d564df7d90ee377868b4dd97134`.
Private capture SHA-256:
`77077e79ebcd39fa6d44be1cd32c035215cf0ccff19fb5bb971d3e7b245cfbde`.
Unchanged parsed-reply fixture SHA-256:
`cd45151ea85145c5def3a8994e0a8ff0232c7cfee5134e9ae863c209f2615b0e`.
All seven exact requests, parsed validations and scoring replayed locally. The
independent reviewer also checked all 26 recorded citation selections. No raw
HTTP replay or model qualification is claimed.

## Explicit reasoning comparison

The next isolated run keeps the exact v3 prompt, model, sources, corpus, schema,
validators, expected results and limits. Only requested reasoning effort changes
to high. [Cloudflare's provider documentation](https://github.com/cloudflare/ai/blob/main/packages/workers-ai-provider/README.md#reasoning-controls)
documents `reasoning_effort` in the REST body; its
[model page](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/)
lists low, medium by default and high. Requesting high does not prove the provider
honored it or that the results improve.

The adapter accepts this field only when explicitly supplied for the approved
reasoning model, with a closed low/medium/high enum. Omission preserves prior
request bytes. Only this no-email live runner opts in; daily callers and provider
defaults remain unchanged. The value enters the request digest and encrypted
capture. Maximum output remains 4,800 per call, sixteen calls, no retries; a
refusal or truncation still stops the attempt. No paid upgrade is permitted.

## High-effort result and actual-assertion repair

[Run 36796955396](https://github.com/itworksinprod/first-fold/actions/runs/36796955396)
used main `4d66d1bfa21e0d9cbcbcd542fec8b3c3839ee812` and stopped after eleven
single requests. Ten replies were structurally valid, nine final labels matched,
and seven declared reasoning-field sets matched. CS07 is now a valid but wrong
rejection: it requires an additional condition even though the candidate asserts
only necessity, not sufficiency. CS04 still invents contradiction, and CS06
mislabels an explicit exemption conflict as insufficient evidence. CS11 has a
sound final inference but marks a retained cohort restriction `none` and emits
an unrelated check with a citation; `PASSAGE_SCOPE_EVIDENCE` correctly stops it.
CS12–16 remain unobserved. Higher reasoning did not establish improvement.

Independent review reconstructed eleven requests and 43 exact source selections
and confirmed the hold. Artifact SHA-256 is
`a45b9100f80ab69726bffb4d55253fe216d724d4888cc0365f97dc04a6e5d9ab`;
private capture SHA-256 is
`1d0501911038c9669fcc21551ef588e1b6dce3bc175a497576ae087ff90b857a`.
The unchanged parsed-reply fixture SHA-256 is
`d475b88c5f9e219818403289c76864fad3075fd4dfed6608bfe55737ec226c23`.
Exact parsed-request validation and scoring replayed without provider calls;
raw HTTP bytes were not replayed. Offline historical-binding projections are
explicitly synthetic and cannot count as new model responses.

Version 4 evaluates entailment of the assertion actually made, not completeness
as a source summary. It distinguishes naming a necessary condition from claiming
it is the only or sufficient condition. Missing qualifications must change an
assertion the candidate actually makes. Applying a rule to an expressly exempt
group conflicts with the policy; retaining the exemption does not. Joint
possibility rules out proven contradiction but never establishes support. A
literal final check preserves the existing unrelated/evidence constraints.

The repair replaces relevant generic instructions, adds no case answers, and
preserves all sources, controls, expectations, gates, budgets and the high-effort
setting. Historical v3 remains byte-identical. V4 prompt SHA-256 is
`d389e13cf229f4147420e1a20e96fb46bb605d11a76a7411602f988fdb839362`.
This is a hypothesis pending bounded live measurement and independent exact-text
review. No daily integration, article approval, email or billing change follows.

Independent v4 preflight passed 201 selected tests, verified the historical
capture and prompt bytes, and found no remaining implementation blocker. The
full local suite passes 2,267 tests. The free-account check remains a launch
condition, not a promise that all requests will fit the remaining daily allowance.
