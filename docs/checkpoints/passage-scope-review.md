# Passage qualification review

Status: offline checkpoint complete with 2,162 passing tests and independent clearance.

This checkpoint makes conditions and exceptions explicit in the experimental
source checker. The preceding [live baseline](conditional-scope-live.md) accepted
a copied general rule despite an exemption in the next source passage. A second
explanation confused unestablished exclusivity with a contradiction. This change
exposes the model's passage-by-passage assessments and rejects inconsistent
records. It does not prove that those assessments are true.

No provider request, new live workflow, writer change, article correction, email,
production integration, billing change or editorial-threshold change is included.
The original article remains held. This is the next offline checkpoint, not a
claim that the previous live false positive is repaired.

## Review contract

The separate `contextual-passage-scope-v1` wrapper reuses the unchanged source
sentence builder and validator. Candidate text, genuine publisher identity,
mechanical spans, complete source passages, catalog IDs and excluded source text
remain byte-for-byte unchanged. A new contract hash binds the expanded schema to
the candidate and full source context. Old replies cannot be reused as new reviews.

For every contextual candidate span, require exactly one assessment of every
original passage, in order. Each assessment records two independent dimensions:

| Field | Choices | Purpose |
| --- | --- | --- |
| Contribution | support, contradiction, context, unrelated, uncertain | What this passage contributes to the contextual claim |
| Qualification | none, preserved, missing, uncertain | Whether relevant limits are retained |

A passage can support a base assertion while supplying a qualification the
candidate drops. Support means contributing evidence, not independently proving
the entire claim. Faithful synthesis across passages remains possible, and a
qualification does not have to be repeated verbatim when the actual assertion
does not erase or exceed it.

Every assessment has a bounded explanation and zero to two existing sentence
IDs from that same passage. Support, contradiction, preserved and missing require
cited evidence. Unrelated is exclusive: no qualification and no citation. Full
passages without selectable catalog units still require assessment; unavailable
evidence must not be fabricated, shortened or silently ignored. The model can
record uncertainty instead of claiming verified support.

The final span verdict includes a separate basis: supported, contradiction,
insufficient evidence or uncertain. Missing evidence is not a contradiction, and
unreported observations do not prove no events occurred. The generic prompt
contains no case names, expected answers or instructions tailored to the saved
article. Original reviewer prompts and the old live baseline stay unchanged.

## Host consistency checks

The host rejects unsupported shapes, changed hashes, missing or repeated passage
IDs, wrong order, foreign citations, duplicate evidence, unknown classifications,
inconsistent verdicts and missing decisive evidence. It does not repair a response
or change the model's verdict after review.

A supported verdict cannot coexist with an acknowledged contradiction, missing
qualification or uncertainty. It must cite evidence from a support-contributing
assessment; context alone does not become support. A contradiction basis needs
an evidenced contradiction assessment. Without one, an acknowledged missing
qualification requires an insufficient-evidence basis and a citation from that
qualification assessment. A decisive evidenced negative can remain unsupported
despite separate uncertainty. With no decisive negative, acknowledged uncertainty
requires an uncertain verdict.

Final evidence must have been cited in a related assessment for the same span,
including at least one citation for its decisive recorded basis. The inherited
final citation limits and exact host reconstruction remain in force. Raw expanded
responses, host-projected citation selections and reconstructed quotations are
separately labeled; none is silently substituted for the other.

Input remains explicitly bounded to eight passages and eight spans, at most
64 assessments, with no truncation. These are short-source prototype limits,
not a claim that long research dossiers can already use this contract.

## Frozen calibration and evidence limits

The sixteen existing fictional controls, their sources and expected verdicts are
unchanged. Their SHA-256 remains
`22ba98ba1abbc942aff656912fefb3f2c35aae2ba9bb56b736b8f7ccff2b6341`.
The unchanged sentence-catalog implementation SHA-256 remains
`906fcf509072e3a92f9dd1f4de4a435bbc9d3a48b3678a886d910fa22c0d4653`.
No expected labels, case IDs or scoring rationales appear in model-facing views.

A separate pure scorer records ordered responses, invalid records, false
positives, false negatives, uncertainty and incomplete coverage against those
same labels. It preserves invalid parsed replies rather than filling missing
fields. Perfect injected answers leave model qualification, article approval,
publication readiness and provider provenance false.

Offline tests include an explicit wrong-but-consistent classification: calling
the exemption unrelated can still produce a structurally valid false positive.
The scorer counts it wrong. Thus complete recorded coverage is observable, but
the host cannot prove that the model actually understood every passage. Likewise,
a model can still mislabel insufficient evidence as contradiction; a field name
does not make its explanation correct. Independent exact-text review remains
required, including for responses with matching final labels.

The injected assessments exercise contract mechanics and balanced scoring only.
They are not fresh model replies, a held-out evaluation, or evidence that the
new prompt has repaired live behavior. Earlier captures and their documented
failures remain immutable historical evidence.

## Live work still required

The local suite and independent implementation review are complete. The next
checkpoint is a separately bounded live evaluation of the new contract on the
unchanged corpus. Verify its exact revision, request and
response provenance, local replay and independent full-source explanations before
judging the semantic result. Do not promote the held article or daily integration
because local fixtures pass.

## Local verification

All 2,162 tests pass, including 54 new adapter and scorer tests. The combined
focused run passes 150 tests. Coverage includes mixed support and missing limits,
cross-passage exceptions, preserved qualifications, insufficient evidence versus
contradiction, uncertainty alongside a decisive negative, unselectable text,
ordered per-span passage coverage, hostile object rejection, exact citation
bindings, immutable raw outputs, stale-contract rejection and balanced scoring.

All sixteen frozen cases prepare successfully without network access. Combined
data, prompt and schema sizes are 9,455–10,026 bytes before a provider-specific
request wrapper; these are not token counts or evidence of live feasibility.
Only the new offline adapter/scorer and their tests import this contract. No
existing workflow or production module calls it.

## Independent completion review

The existing independent reviewer cleared the offline adapter, scorer, tests and
receipt with no blocking findings, independently rerunning 147 selected tests:
all 54 new tests plus 93 relevant legacy tests. Review confirmed ordered coverage,
mixed contribution and qualification handling, decisive-evidence consistency,
citation binding, hostile-input guards, immutable scoring and unchanged controls.

The reviewer specifically accepted the regression demonstrating a structurally
valid false positive when an exception is misclassified. This limitation is not
hidden by passing tests or the new required fields. Clearance permits publication
of this offline experiment only. The held article and live semantic qualification
remain unresolved. No new provider request or trial occurred during this change.
