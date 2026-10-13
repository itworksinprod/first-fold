# Ten-article summary evaluation

Carlos approved a practical reset on October 3, 2026: retrieve substantive article
text, identify concrete facts, write 110–225 reader-body words with the existing
free writer, screen the complete article, and independently review ten real
articles across the four desks before considering daily integration.

This replaces neither production nor old experiment outcomes. Historical holds
remain holds. The formal-logic work is preserved but is not a prerequisite for
this separate empirical evaluation.

## Fixed first corpus

Private packet SHA-256:
`99ac5742fc6344120eb952db6d1905f115a014cda7673a6f517e5a7333b0429f`

| ID | Desk | Archived article |
| --- | --- | --- |
| A01 | AI & Models | MIT: AI for safety-critical situations |
| A02 | AI & Models | Anthropic: measuring the pace of AI development |
| A03 | AI & Models | AWS: Kimi K3 on Bedrock |
| A04 | Work & Tools | GitHub: self-hosted runner enforcement date |
| A05 | Work & Tools | Google Meet: room-code connections |
| A06 | Work & Tools | GitLab.com: subscription-based rate limits |
| A07 | Security & Privacy | CISA: Siemens Mendix SAML |
| A08 | Security & Privacy | CISA: Bransys ELD |
| A09 | Platforms & Power | AWS: automatic Step Functions integrations |
| A10 | Platforms & Power | AWS: OpenSearch Serverless on Vercel v0 |

Nine use preserved publisher captures; A10 was fetched through the existing
reviewed-host, pinned-public-DNS reader. No source was selected based on a new
writer result. Text is the **entire retained capture**, not a claim to include
the whole original website: some captures are bounded excerpts. Do not invent
facts from omitted tables or appendices. This is a development corpus, including
previously seen cases, not an unseen holdout or a test of current-news discovery.
It is primarily first-party reporting, not independent corroboration.

## Minimal evaluation path

1. One GPT-OSS-120B request identifies source-anchored facts and writes a summary.
2. Local checks enforce word bounds, source-ID validity, attribution, original
   wording and clean output. Facts are a working inventory, not verified truth.
3. One separate GPT-OSS-120B request receives the entire unchanged draft and
   retained source, but not the writer's fact inventory. It checks the headline
   and each body item against all relevant qualifications, plus readability,
   usefulness and whole-article faithfulness. Local checks enforce exact item
   coverage and ordering. They **do not prove all factual clauses were checked**.
4. Independent exact-text review of all ten original sources, drafts and model
   explanations remains mandatory. Same-model agreement is correlated evidence,
   not an independent factual audit. No automatic repair or article-specific
   prompt patch can turn a held draft into a pass.

Both stages use one attempt, medium reasoning, respectively 3,200 and 4,800
maximum output tokens: at most twenty requests and 80,000 requested output
tokens. No paid fallback, automatic retry, research search call or email. Fresh
authenticated usage and billing checks must confirm Workers Free, Active and
no payment method before dispatch. Stop the entire batch on provider refusal;
do not retry to conceal quota or availability failures.

## Success criteria and evidence

- Every result stays in the ten-article denominator, including unavailable,
  malformed, short, unsupported or unhelpful outputs.
- Report draft structure, reviewer structure, support, readability, usefulness,
  faithfulness and independent findings separately.
- The independent reviewer must find the actual development clear, selected
  claims accurately scoped, and significance/next steps specific and supported.
- Each source, request and parsed answer is retained privately with hashes.
  Encrypted per-call artifacts preserve rejected answers before validation;
  the public report contains only status/counts. No source text, credentials or
  keys are committed. The private decryption key stays on Carlos's Mac.
- An Actions success means **awaiting independent review**, never permission to
  send or proof that the daily paper works. Ten satisfactory archived summaries
  permit planning the next fresh end-to-end test, not silent production rollout.

## October 3 live result — not ready

Run `37169149442`, trusted main `6e951cee9f2773ee0b3ba2e2b2296743cff0411e`,
attempted all ten articles with seventeen requests. No provider quota blocker
occurred. The encrypted artifact and exact requests/answers were verified and
replayed offline. Private independent exact-text review covered all sources,
all ten writer responses and the seven available model reviews.

- Nine complete drafts; A02 was cut off at its output-token ceiling.
- Eight complete drafts require material correction. A07 was substantially
  faithful with minor editorial cautions; this is not production approval.
- All four model-approved drafts (A03, A06, A08, A09) contain material errors:
  invented compliance/mandatory steps; merged rate-limit populations and missing
  per-IP scope; "not reported to CISA" changed to "not observed"; and immediate
  availability substituted for an explicit within-weeks qualification.
- The reviewer correctly caught other errors but also rejected an ordinary
  consequence of an administrator disabling a feature. Rejection alone is not
  evidence of good review.
- Two local guards were overstrict: the MIT feed category was demanded as part
  of publisher attribution; numeric version comparisons in the private fact
  inventory were treated as markup. Both are narrowly repaired with regressions.
  Saved A01/A07 now pass local structure at 166/136 words. Original failed run
  statuses are preserved; A01 still requires factual correction.

The private record is `ten-article-benchmark-v1/independent-review-v1.json` in
the existing review directory. This corpus is not an unseen-accuracy estimate.
Daily delivery, thresholds, recipient and billing are unchanged.

## One bounded follow-up: frozen-draft clause review

The explicit `saved-claim-review` mode receives six unchanged drafts from the
original run: A03, A05, A06, A07, A08 and A09. It uses the complete retained source
and exact visible draft, with no writer inventory, expected verdicts or known
discrepancies in provider input. A07 is a supported control; A05 includes both
a real unsupported hardware claim and a supported admin-disablement consequence.

The candidate reviewer partitions each sentence into contiguous claim spans.
Local validation requires their byte-exact concatenation and rejects any
unsupported span regardless of other supported spans. This proves coverage,
**not entailment**; independent exact-text inspection remains mandatory.

Limits: six requests, 4,800 output tokens each, medium reasoning, one attempt,
no writer calls, retries, research, email or integration. Fresh free-plan/usage
verification, a new local encryption key, frozen input hash, non-repeatable
dispatch intent and exact artifact/request replay are required. Preserve v1
evidence and the unchanged baseline prompts for comparison. A green run alone
does not pass this test: it must identify the actual unsupported assertions and
preserve supported controls. If core errors persist, stop layering review
machinery and record that this reviewer setup remains unreliable.

### Follow-up result: reject this reviewer variant

Run `37171841004`, exact main `478c88c3df7c4c843323e13ed96f1cd90d08ee3c`,
completed all six one-attempt reviews. Artifact SHA-256:
`81f5031a90ee95eb32fd7756e017907fe7150e4717f4f1ab2e44e916b5907958`.
The new replay packet is
`b0b0e06d25a369bf22fab1a1a0f6b79dd3a6fdd562de4ff6aa343ce914daf95b`.
All exact saved requests/native answers were verified and replayed offline,
without additional provider calls. Six requests reserved 28,800 output tokens;
provider usage reported approximately 1,519 neurons. There was no quota blocker.

Independent exact-text comparison found **one of seven predefined material
errors detected**: the Google Meet hardware/network assurance, already caught
by the baseline reviewer. The other six errors remained approved. This is a
small diagnostic result, not a model-wide accuracy estimate.

- A03 passed structure and received an incorrect all-supported verdict.
- A09 passed structure but was held for the wrong reason: the reviewer rejected
  ordinary AWS announcement attribution while approving "immediately" despite
  the source's within-weeks condition.
- A05, A06, A07 and A08 failed exact text coverage (dropped punctuation, spaces
  or connective words). Their raw answers were still independently examined;
  those holds do not count as catching the factual discrepancies.
- Neither supported control was preserved by the semantic judgments. The
  administrator-disablement consequence was again called speculation. The A07
  risk explanation ignored relevant industrial/exploit context while treating
  a minor editorial concern as unsupported content.

**Decision:** stop this reviewer variant, with no retry or extra schema/prompt
layering. Keep its isolated manual diagnostic and original evidence for audit;
do not wire it into daily publication. The two valid local guard fixes remain.
All 2,430 local tests and the independent implementation preflight passed, which
proves tested software behavior—not reliable news judgment.

Next substantive work belongs in drafting: reduce unsupported additions through
source-first, minimally transformed factual writing, then independently compare
complete articles. Another review label is not a substitute for that evidence.
Any future qualification must preserve the 110–225-word requirement and all ten
articles in the denominator, include supported controls, and precede a fresh
end-to-end delivery test. No daily integration, email, recipient, billing or
editorial-threshold change has been made.

## Source-first writer experiment (next bounded step)

The `source-first-writer` mode drafts the same frozen ten articles with one
generic prompt. Each headline/body sentence contains 1–3 exact excerpts from
identified passages before its minimally transformed paraphrase. The excerpts
stay in private encrypted evidence and never appear in reader prose. Full
retained source context is supplied; no expected answers, article-specific
corrections or model-review verdicts are supplied.

Local validation checks that excerpts really exist, and preserves existing
110–225-word, attribution, plain-prose and copying bounds. An exact excerpt is
traceability only, not evidence that all paraphrased assertions follow from it:
`semanticApproval` remains false and factual/readability judgments remain unset.
Independent comparison of all ten complete sources and actual outputs is still
required, including drafts rejected mechanically.

Limits: ten requests, one writer request per article, 4,000 output tokens each,
medium reasoning, no retries or model-reviewer calls. The modestly larger writer
cap accommodates private excerpts and the previously truncated response; this
is a combined drafting-format/budget experiment, not an isolated causal test of
the prompt. The existing encrypted transport/provenance boundaries and whole-
batch provider/storage stop rules apply. Fresh authenticated Free/Active/no-
payment checks and sufficient remaining daily allowance precede dispatch.
No daily-delivery integration or email. Prior failed variants remain unchanged.

### Source-first writer result: improvement, not release approval

Run `37172758769` used exact main
`2de8fe07d9f3a9de37a8f06056bfb20fc8a4029c`. Artifact SHA-256:
`8dbb7b3c0f3589b2ddcbd0157b4519c9f3c336d7b2efceb889953eedc827f4bb`.
All ten one-attempt writer requests completed, with 40,000 requested-output
tokens reserved and approximately 2,613.34 neurons reported. There was no
provider refusal. Authenticated daily usage after the batch showed 7.75k/10k;
the separate rolling-24-hour total was not used as the daily allowance.
Exact run identity, archive digest, frozen corpus, requests and native answers
were verified and replayed locally without further provider calls.

All ten answers contained complete prose. Six passed automatic structural
checks. The other four were correctly held under the existing rules:

- A01: missing explicit MIT News publisher attribution (140 body words).
- A04: at least twelve contiguous copied source words (138 words).
- A08: an eleven-character evidence quotation violates the twelve-character
  minimum; this is **not** a factual-error detection (131 words).
- A10: only 105 body words, below the unchanged 110-word minimum.

Independent full-source/exact-answer review found five semantically adequate
drafts: A01, A03, A05, A06 and A09. Four also passed structural checks: A03,
A05, A06 and A09. Five require material content correction:

- A02 merges platform-limited monitoring with the separate company-wide compute
  snapshot, changes a share of work into a share of tasks, and drops the important
  limitation on using compute as a measure of safety effort.
- A04 still omits the already-enforced Enterprise Cloud Data Residency exception.
- A07 labels the vendor advisory with the CISA republication identifier and adds
  an industrial-operations consequence not established by the account-hijack
  evidence. It needs correction before reader delivery.
- A08 loses the affected-broker restriction and broadens the carefully qualified
  statement about exploitation reports received by CISA.
- A10 drops South America from its geographic summary as well as missing length.

A01's final integration sentence is weak editorial inference/repetition, not
the previous invented validation roadmap. A06 now says capacity purchase is
planned rather than definitely launching later this year; the joined timing
sentence could be clearer but is not counted as a definite factual error.
Neither minor caution is inflated into a material semantic failure.

This is a descriptive improvement on a reused ten-article regression set, not
an unseen accuracy estimate or proof that exact quotations imply faithful
paraphrases. The initial baseline had one substantially faithful complete draft;
this variant has five semantically adequate drafts, four satisfying both kinds
of checks. The batch still fails its all-ten acceptance contract. Keep it
isolated: no automatic publication, email or production integration.

The private independent record is
`source-first-writer-v1/independent-review-source-first-v1.json`. All 2,434 local
tests and the independent implementation preflight passed before the run;
those results do not supersede the article findings. Next drafting work must
preserve quantities' denominators, scope exceptions and reporting qualifiers,
rather than weakening gates or adding another unreliable reviewer verdict.
No additional provider trials were made after this bounded result.

## Scope-first writer: local implementation ready, live result pending

The next isolated `scope-first-writer` mode keeps the full frozen ten-article
corpus and the source-first baseline unchanged. Before each reader sentence,
the writer records relevant exact source qualifications and a `preservedAs`
span that must appear in that same sentence. Local checks reject missing or
fabricated quotations, absent rendering spans, duplicate bindings and malformed
prose. The publisher metadata also supplies its already-approved attribution
name, without widening the reader attribution guard.

The generic drafting instructions keep measurement frames separate, preserve
exceptions to group/schedule claims, distinguish an absence of reports from an
absence of events, and retain the organization attached to document identifiers.
No case-specific corrections or expected verdicts are sent. The requested
output ceiling is still 4,000 tokens per article, ten writer requests total,
medium reasoning, one attempt, no reviewer/retries/email. The 110–225-word limit
and all existing reader checks remain intact.

This is **not** semantic validation: a model can omit a qualification or attach
the wrong paraphrase to a real quote. `qualificationCoverageVerified` and
`semanticApproval` stay false. The exact full output and full retained source
still require independent review. Tests deliberately demonstrate those limits.

All 2,438 local tests pass; independent implementation preflight passed all 115
focused tests with no blocking finding. These counts say nothing yet about live
article quality. On October 3 at approximately 11:30 PM Eastern, fresh Cloudflare
daily usage remained 7.75k/10k. The preceding ten-article test used 2,613.34
neurons; the remaining allowance is inadequate headroom for repeating this full
test. No provider call or workflow dispatch was made for the new mode.

The private `scope-first-writer-v1` directory holds the unchanged corpus and a
new local encryption key. Prepared helpers are `prepare-scope-first-writer.mjs`,
`launch-scope-first-writer.mjs` and `fetch-scope-first-writer.mjs` in the existing
review directory. Do not rerun the preparer. The launch requires a new Free /
Active / no-payment observation and daily usage at most 5,500, both observations
under thirty minutes old, the pinned local/main revision, and no prior dispatch
intent. No successful preflight has been recorded, and nothing is scheduled.
After sufficient verified allowance, dispatch once, fetch and replay exact
encrypted evidence, then compare all ten drafts independently under the same
acceptance contract. Do not substitute fewer articles, shorter budgets, paid
fallbacks or weaker checks merely to fit the current daily balance.

### October 11 live scope-first result — no release approval

After Carlos explicitly approved this exact ten-article transfer to Cloudflare,
run `38194738894` used trusted main
`f9a83f831076b15708bfb312bf65b1b3057b21d1`, first attempt, starting at
10:10 PM America/New_York on October 11 (02:10 UTC October 12). Fresh account
checks showed Workers Free, Active, no payment method and zero daily usage.
All 2,438 local tests passed before dispatch. There were ten one-attempt writer
requests, 40,000 requested output tokens and 3,091.39 reported neurons. The
postflight daily dashboard showed 3.09k/10k. No provider quota refusal occurred.

Artifact SHA-256:
`01baabbeb7ae84314fbe7d521c118f9ab03726a85cc050733813a79b83d7148c`.
Run identity, exact revision, archive size/digest, frozen corpus and every saved
request/native response were verified and replayed offline. The private key,
original encrypted responses, decoded evidence and audit are preserved under
`scope-first-writer-v1` in the existing private review directory. No hidden model
reasoning was displayed or used for editorial review.

- Nine complete drafts; A06 hit the 4,000-output-token limit and stopped
  mid-sentence. It remains incomplete, with no reconstruction or retry.
- Three mechanical passes: A02, A07, A08. All three require material content
  correction. An exact source quote and matching rendered span still do not
  establish that the claim follows from its source.
- Six materially adequate drafts: A01, A03, A04, A05, A09, A10. All six remain
  mechanically held for inexact evidence, mismatched `preservedAs` text, or
  copied source wording. Separate offline diagnostics preserve additional
  copying findings even when an earlier binding check stopped validation.
- **Zero of ten pass both checks.** The all-ten acceptance contract fails.

Independent exact-text review read every complete retained source, nine new
headlines and 53 complete body sentences, plus A06's partial visible answer.
Its private record is `scope-first-writer-v1/independent-review.json`:

- A02 says AI directs most research despite the 26% leading-work figure;
  attaches the platform-only agent-monitoring limit to separate company-wide
  compute/index measurements; and omits the imperfect-compute-proxy caveat.
- A07 again identifies the Siemens advisory with CISA's republication ID and
  drops the specific-SSO-configuration condition on account hijacking.
- A08 turns the absence of known reports received by CISA into an unbounded
  absence of public-exploitation reports. The broker-bounded access sentence
  could be clearer, but is not counted as a separate demonstrated material
  scope expansion.

Real improvements are retained as evidence: A04 now states the Data Residency
exception; A09 keeps within-weeks timing; A10 gives non-exhaustive regional
examples instead of an incomplete exclusive list. A01's exclusive experimental-
maturity caveat and other minor editorial cautions remain documented, not
inflated into separate material failures or silently polished away.

Compared descriptively with the preceding source-first batch, semantic adequacy
rose from five to six while mechanical passes fell from six to three and joint
passes fell from four to zero. This reused corpus cannot establish causal prompt
improvement or general accuracy. The extra scope-binding format is not ready for
integration; another schema layer or silent relaxation would not fix the actual
meaning errors. Preserve this failed result. The next proposed design step is to
reduce duplicated evidence-output bookkeeping while keeping source-backed scope
checks and independent exact-text review, before seeking another bounded trial.
No new trial, model substitution, daily integration, email, recipient, billing,
production setting or editorial-threshold change followed this evaluation.

## Compact passage-reference prototype — local only

Carlos's subsequent “okay” is being implemented as the next local design/test
increment, not authority to run another provider batch. The new exported
`compactReferenceWriterView` and `normalizeCompactReferenceSummary` are
deliberately **not** connected to `runBenchmark`, its CLI mode allowlist, or the
GitHub workflow. No new credential, provider request, deployment, email or
production change occurs in this step.

The model-facing format now asks for each headline/sentence once, alongside
1–3 passage IDs. It does not ask the writer to duplicate exact source quotations
and then duplicate a paraphrase as `preservedAs`. The host verifies the retained
source hash and complete passage mapping, resolves the IDs to exact original
passages, and keeps those passages and their hashes privately. The full retained
source, not just selected IDs, remains the basis for independent review.

The generic writing prompt emphasizes separate measurement frames, qualified
negative reports, prerequisite configurations, and document ownership. It has
no named article correction, expected answer, or fixture-specific example.
This is a hypothesis about reducing output overhead and scope mistakes, **not a
demonstrated factual fix**. The model can still cite a real passage and write an
incorrect sentence. `referenceIdsValid` means only that the IDs exist;
`semanticApproval` and `qualificationCoverageVerified` remain false, independent
review is required, and `productionApproved` remains false.

All old modes and validators are unchanged. The new format reuses the exact
110–225 body-word, attribution, clean-prose, repeated-text and twelve-contiguous-
source-word guards, including headline and cross-section copying checks. Old
failed responses are neither transformed into passes nor repaired in place.

New local tests exercise source/passage integrity, every-unit reference
coverage, immutable evidence, strict output shape, word limits, copying, exact
full-source review input and the live CLI's rejection of this prototype mode.
Six paired fictional clause controls cover activity/denominator confusion,
transferred measurement scope, proxy limitations, advisory ownership, exploit
prerequisites and reporting-recipient limits. Both the supported and unsupported
clauses can pass reference-format validation and remain unapproved. These are
regressions against **claiming that structure proves truth**, not an automatic
detector for those factual errors or a semantic accuracy score. Fixture answers
are excluded from writer input. Adapter tests use only mocked network responses.

Local verification: 40 focused tests and the full 2,454-test suite passed on
October 11/12, 2026, with no skipped tests or provider calls. Independent review
found one source-completeness defect: array iteration skipped sparse passage
entries. The validator now iterates every original source-block index and
requires its own matching passage entry. Regressions cover a missing middle
entry, an all-hole array and explicit undefined entries in both functions.
The reviewer verified the repair, independently reran the 40 focused tests and
found no remaining blocker to local-only handoff. The full 2,454-test suite also
passed again after the fix. No independent full-suite run is claimed.

This local increment is complete but uncommitted and unpublished. A separately
authorized bounded live evaluation and independent exact-text review would
still be required before judging writing quality or planning integration; all
ten articles, including any failures, must stay in that future denominator.

### Approved compact-reference live test

Carlos then requested “live test.” The prototype is now wired only into the
explicit `compact-reference-writer` manual diagnostic mode. Default and daily
execution paths are unchanged. It uses the same frozen ten articles, generic
prompt and reader guards reviewed above, one GPT-OSS-120B writer request per
article, medium reasoning, at most 4,000 output tokens each (40,000 total),
90-second timeouts, no retries and no provider reviewer calls. It stops the
batch on provider refusal, preserves encrypted native responses before local
validation and never treats structural success as factual approval.

The new live transport tests retain all ten cases in the denominator, verify
request limits and encrypted evidence, and prove that support/readability/
faithfulness judgments remain unset. The workflow runs them before exposing
provider credentials. The prior local-only CLI test now verifies explicit
opt-in admission rather than rejection; no existing mode was broadened.

Preparation, one-shot launch, verified artifact retrieval/offline replay and
visible-answer extraction helpers are in the existing private review directory
under `*-compact-reference-*.mjs`, with fresh state in
`compact-reference-writer-v1`. Dispatch requires a freshly verified Free,
Active account with no payment method, daily usage at most 5,500, matching
local/trusted-main revision and a non-overwritable intent. No extra probes or
automatic retry are part of this approval. Exact-text independent review of
every output, including any mechanically rejected drafts, follows this test.
No email, fresh research, paid fallback or production integration is authorized.

### Compact-reference live result — October 11/12, 2026

The authorized batch ran once as GitHub run `38199938735` on trusted main
`a11b6648eab5313ccab0c4090802d15b81e53585`. The focused 133-test suite and full
2,456-test suite passed before dispatch; the independent implementation reviewer
also ran the focused suite and cleared the private retrieval/replay helpers.
Free/Active/no-payment-method status and the explicit daily 3.09k/10k usage
indicator were freshly observed before dispatch. No billing setting changed.

All ten writer requests returned complete parsed drafts, 142–177 body words,
with finish reason `stop`; no quota refusal, retry or truncation occurred.
Requested output allowance was 40,000 tokens; reported usage was 21,151 input
tokens, 18,776 completion tokens and 1,953.16 neurons. The explicit daily
dashboard showed 5.04k/10k afterward. These are observed usage figures, not a
future cost or availability guarantee.

The workflow failed at **Run the bounded saved-article evaluation without
sending email** because not all ten drafts cleared mechanical validation:

- Seven passed: A02, A04, A06, A07, A08, A09, A10.
- A01 and A05 were held for missing the required publisher attribution string
  in `whatHappened` (they name MIT researchers and Google Meet, respectively).
- A03 was held for one twelve-word source-text overlap. None of the other nine
  has a twelve-word overlap under the same normalization.

Artifact SHA-256:
`5181e7c77a1b14fca5e9a1dd12ecfd5e7d1870c8c8f36462a432de8f098844b3`.
Run identity, pinned revision, archive digest/size and frozen corpus were
verified. All ten exact saved request/native-response pairs replayed offline
with zero provider calls. Original encrypted evidence, fresh private key,
decoded records and visible-answer review packet are retained privately in
`compact-reference-writer-v1`. Hidden reasoning was not displayed or used to
judge the editorial text.

Independent exact-text review covers all ten complete sources, ten headlines
and 59 body units, including mechanically rejected drafts. Five drafts require
material factual correction:

- A01 invents an intention to release code and turns a described optimization
  challenge into an asserted ongoing limitation.
- A02 conflates the August automation measurement with July's compute snapshot,
  transfers the platform-only monitoring limit onto company-wide compute, and
  infers limited safety focus despite the source's imperfect-proxy caution.
- A06 suggests upgrading can avoid limits on anonymous traffic; the source says
  unauthenticated calls remain capped even against paid accounts.
- A08 broadens FTP access to all data and loses the recipient/time limitation
  on exploitation reports received by CISA. Its safety-critical consequence is
  also not established by the retained source.
- A10 gives 18 regions although the retained list contains 17, and adds a
  real-time capability not established by the source.

Five drafts are materially adequate against the full retained source: A03,
A04, A05, A07 and A09. Of these, only **A04, A07 and A09 pass both mechanical
and full-source content review (3/10)**. Minor cautions remain: A05 has generic
cross-room benefit language; A07 frames standing defensive guidance as useful
until patching without explicitly saying to remove it later; and A09's task
execution wording is imprecise but its MicroVM-integration lead-in reasonably
limits the claim. These are not inflated into additional demonstrated material
errors. Source-reference completeness is a separate axis: a valid selected ID
does not ensure it contains every detail in the sentence (for example A07's
headline CVE is elsewhere in the full source, not its selected P5).

The change reduced format overhead: all ten answers finished, compared with
nine in the previous scope-first batch, and reported neurons fell from 3,091.39
to 1,953.16. Mechanical passes increased from 3 to 7 and combined mechanical/
full-source content passes from 0 to 3, while materially adequate drafts fell
from 6 to 5. This is mixed descriptive evidence on the same reused corpus,
not a causal improvement claim or a general reliability estimate. The next
design decision must address unsupported conclusions and lost qualifications,
not merely relax guards or rerun until favorable outputs appear.

The independent per-article record is
`compact-reference-writer-v1/independent-review.json`, SHA-256
`0f2302e6d02b35c7c1d2e2b163c6657008658f428be9d449dd56a18264f7644c`.
It separates readability, usefulness, factual findings, minor cautions and
incomplete selected-reference coverage. The primary agent also inspected every
source and draft and reconciled the material findings without changing the
underlying answers or weakening the automated holds.

This result is not an all-ten quality pass. The unchanged mechanical guards
were not bypassed; no model answer was repaired, no additional trial was run,
and nothing was emailed, freshly researched or integrated into daily delivery.

### Explicitly requested unchanged repeat — October 11/12, 2026

Carlos requested another “live test” after receiving the result above. The
assistant explicitly identified it as a repeatability test, not a repaired
revision. Run `38201395589` uses the same main revision, ten archived articles,
compact prompt, model, sampling settings, request limits and all quality guards.
The earlier failed result remains intact and is not replaced by this repeat.

The 133 focused tests passed again. Authenticated Free/Active/no-payment-method
and explicit daily 5.04k/10k usage were observed before dispatch. Fresh local
encryption keys and an exclusive intent are preserved separately in
`compact-reference-writer-repeat-v1`. The four private repeat helpers differ
from the already reviewed helpers only in that private state directory; exact
normalized byte equivalence and syntax were checked locally. One new dispatch
was accepted; no in-run retry, extra probe, daily change or email is authorized.

The repeat completed all ten requests with finish reason `stop` and 116–178
body words. There was no provider refusal, truncation or evidence-storage
failure. Reported usage was 21,151 prompt tokens, 17,314 completion tokens and
1,853.48 neurons. The immediate daily dashboard still displayed its pre-run
5.04k total; that delayed display is not evidence of zero usage. Native usage
is retained separately. The account remained on its verified free configuration
and no billing action was taken.

Five drafts passed mechanical checks: A02, A04, A06, A07 and A08. A01, A03,
A05 and A10 failed required publisher attribution; A09 failed the unchanged
copying guard. All ten exact requests and native responses replayed offline
with zero provider calls. The failed workflow step is again **Run the bounded
saved-article evaluation without sending email**, reflecting held drafts rather
than inability to reach the provider. Archive size, digest, actor, first-attempt
identity, revision and unchanged corpus were verified. Artifact SHA-256:
`0e4b843efbea0f987acfedc4d3298f2e6e5b9677a4dc3c2310428c699ceb5088`.
The fresh key, encrypted originals and unedited decoded drafts are preserved
under the repeat's separate private directory.

Offline cross-run assertions confirmed that every provider request body and
request hash is identical to the first compact-reference run, while all ten
parsed response hashes differ. This is an unchanged-input repeat, not evidence
of an implemented repair. Both runs stay in the record; neither a best-of-two
selection nor silent answer editing is part of this test.

Independent exact-text review is complete: **2/10 materially adequate, 8/10
requiring material factual correction, and 0/10 passing both mechanical and
content review**. A05 and A09 are content-adequate with minor editorial cautions,
but both remain mechanically held. All ten are readable in a grammatical sense;
that is not evidence of reliable factual meaning. Selected-passage completeness
was assessed separately from whole-source support. All ten complete sources,
ten headlines and sixty body units were reviewed, including held drafts.

The five earlier material-failure cases all fail again, with varying errors:
A01 invents commercialization status and adoption prerequisites; A02 changes
measurement denominators and scope and makes optional verification mandatory;
A06 applies the anonymous per-IP cap to authenticated Free-plan requests; A08
transfers impacts between vulnerabilities and strengthens CISA's bounded
reporting statement; and A10 again counts 18 regions where the source lists 17.
New defects occur in A03 (customer-location access prohibition), A04 ("below
2.329.0" becomes "2.329.0 or older", with enforcement-scope distortion), and A07
(unsupported specific industrial-control application impact and exposure scale).
The unchanged-input repeat therefore does not establish a repair or reliability:
the first compact run had 7 mechanical, 5 content and 3 joint passes; this run
has 5, 2 and 0. Neither is discarded or combined into a best-of-two edition.
These are repeated-development-corpus observations, not unseen accuracy or
statistical proof of regression.

Final independent record: `compact-reference-writer-repeat-v1/independent-review.json`,
SHA-256 `f94eab9548cf9e579212daa1ee79d5d1eb13147a912a9a19ddb9e375c2e94768`.
The reviewer validated 26 reader quotations and 26 source anchors against the
saved packet; the primary agent read the complete final review. No held answer
was repaired or released. A targeted drafting/validation design change is
needed before further live testing, rather than repeating unchanged prompts
until favorable outputs appear. No email, new provider attempt, billing action,
fresh news research, production integration or editorial-threshold change was
performed following this result.

### Incremental local repair — version endpoint inclusion, October 12

The next change is a **narrow rejection screen**, not another drafting prompt or
a claim that the summaries have been repaired. The compact-reference experiment
now screens recognized dotted numeric version comparisons in every headline and
body item against that item's selected source passages. With the same version,
same comparison direction and an unambiguous source relation, changing a strict
endpoint into an inclusive one (or vice versa) holds the draft for review using
`BENCHMARK_VERSION_BOUNDARY_REVIEW`. Equivalent supported comparison phrases are
not flagged. Drafts, complete sources, exact native responses and private source
spans remain unchanged and retained; public reports contain only the code/counts.
The prompt, model, request limits, word bounds, attribution and copying checks
remain unchanged. Other experiment modes and daily delivery do not use this
screen. The manual benchmark runs its tests before provider credentials.

The scope is deliberately limited: this is not subject, action, negation, range,
prerelease, entity or full-sentence entailment checking. Opposite comparisons can
describe complementary populations. Missing or ambiguous selected-source
relations are recorded as uncovered, not approved. A source comparator attached
to the wrong product can evade this screen. A detected lexical conflict requests
review rather than asserting semantic contradiction; unusual equivalent
constructions can be held conservatively. `semanticApproval` remains false in
all cases. It does not address the other seven materially flawed repeat drafts,
or A04's separate enforcement-scope error.

Concrete limitations from review: a source saying "version X or older, except X"
can produce a false hold for a faithful "below X" paraphrase; different products
with strict and inclusive cutoffs at the same number in one passage are marked
ambiguous; the form "earlier than or equal to X" is outside the recognized
grammar. None is treated as a factual pass. This lexical screen is not the
mechanism for deciding those semantic cases.

Offline replay of all twenty unedited drafts from the two compact runs flags
only the repeated-run A04 item U3: the source says below version 2.329.0, while
the draft includes that version with "or older". The first run's strict boundary
is not flagged. This is regression evidence on saved cases, not a new live
pass or an improvement to generated text. Original results and the 0/10 repeat
joint-pass count remain unchanged. Content-free replay evidence is saved privately
as `version-boundary-screen-2026-10-12.json`; source/draft text is not committed.

Focused local tests pass (167), including synthetic endpoint families, faithful
paraphrases, explicit blind spots, malformed/sparse input and encrypted mock-run
holding without retries or text repair. The complete local suite passes all
2,490 tests. Independent review found and prompted two repairs: Unicode-dash
prereleases could be partially parsed as release endpoints, and repeated source
span diagnostics could exceed the encrypted envelope limit and stop the batch.
The final screen excludes those suffixes and stores bounded offset-only details
with complete counters and explicit truncation metadata. Complete source, draft
and native provider evidence are unaffected. A ten-article encrypted mock batch
with dense repeated comparisons now remains article-held rather than failing
evidence storage. The independent reviewer reproduced the original overflow
counterexample after repair: its summary is now 29,627 bytes, all twenty
conflicts remain counted, and it seals successfully. The reviewer found no
remaining blocker to this **narrow local handoff**, with all 167 workflow-listed
tests passing and the documented lexical limitations intact. The final screen
SHA-256 is `c94d1e0227d48ddadb900ca2136cd6a0a4114159b9ebd31033e3685ee22b15c4`;
the two-run offline replay was repeated against that exact file and produced
unchanged outcomes. No provider allowance, email, publishing, billing or
production change was used for this local step.

This step is locally complete, not deployed and not a qualification of the
writer. Next is a separate drafting repair for unsupported conclusions and
scope transfer, with faithful counterexamples as well as failures. Do not spend
another live batch merely to demonstrate this deterministic screen: the saved
failure and encrypted mock regression already exercise it. Any later live
writing test must be identified as a new bounded experiment and evaluated on
the complete unedited output, not made successful by this extra rejection gate.

### Next isolated drafting experiment — frozen source plan, October 12

Implemented locally, **not published or run against a provider**. The manual
benchmark has a new opt-in `source-plan-writer` mode. Its first request selects
only IDs of host-segmented source sentence-units. The host validates and freezes
that selection before a separate writer request paraphrases those fixed slots.
The complete retained publisher text remains visible at both stages, including
unselectable material and exceptions. There are no article-specific examples,
gold summaries, custom corrections or model-facing prior failure judgments.

This is a hypothesis about reducing the simultaneous selection/composition
burden, not evidence that references establish truth. It changes staging,
selection granularity and budget together; a future result cannot isolate a
single cause. The writer can still add unsupported clauses or move meanings
between mechanically correct slots. Explicit synthetic counterexamples retain
those errors unchanged and remain `semanticApproval: false`. Independent review
must assess the complete exact draft against the entire original source, not
only the chosen IDs. No new automatic factual approval gate was introduced.

The source-plan identity includes article ID, source hash, publisher, attribution,
title, URL, capture note, full ordered passages, and the catalog's exact offsets.
Plans are descriptor-checked, copied, deeply frozen and tied to their issued
view; cloned or cross-article plans are rejected. Selection requires 1–3 units
per section, keeps source order within a section, and cannot repeat body units.
An explicit abstention preserves the case in the denominator and prevents the
writer call. The ordinary attribution, copying, prose and 110–225-word checks
remain unchanged, as does the narrow version-boundary hold. Exact native answers
are sealed before plan/draft validation; no answer is silently repaired.

The isolated profile allows at most **20 calls / 52,000 requested output tokens**
for all ten saved articles: one 1,200-token planner followed by one 4,000-token
writer per article. Both use the existing GPT-OSS-120B model, medium reasoning,
90-second timeout and no retries. Malformed or abstaining planners skip writing;
provider/provenance or storage failures stop remaining work. Quality holds retain
all cases and permit the remaining articles to be attempted. There is no model
reviewer call, email, billing change, fresh research or daily-delivery integration.
These ceilings do not establish that a live run fits the free neuron allowance.

Independent implementation review found a real preflight-size defect: counting
raw strings missed the additional JSON escaping in the actual request. The
repair now measures the shared adapter's exact serialized request and also
bounds the largest reachable rewrite before planning, then checks the actual
rewrite again. Quote/backslash-heavy and multibyte cases exercise this without
increasing the request, decoded-corpus or encrypted-evidence limits. Oversized
local cases are not misreported as provider failures. The legacy sentence-review
file remains byte-for-byte unchanged; a new isolated segmentation copy is locked
to that original algorithm by a parity test rather than repinning old evidence.

The complete frozen ten-source corpus was inventoried locally with its original
capture notes and verified packet hash. Eligible/excluded sentence-unit counts:

| Article | Eligible | Excluded |
| --- | ---: | ---: |
| A01 | 28 | 1 |
| A02 | 29 | 4 |
| A03 | 10 | 1 |
| A04 | 11 | 1 |
| A05 | 8 | 5 |
| A06 | 71 | 10 |
| A07 | 26 | 43 |
| A08 | 27 | 58 |
| A09 | 13 | 1 |
| A10 | 5 | 3 |

All ten inputs pass local size bounds; exact planner requests are 7,016–29,008
bytes. Offsets, context/source hashes and reasons are recorded privately in
`source-plan-catalog-inventory-2026-10-12.json`. This is transport coverage, not
editorial adequacy. In particular, CISA version/score/background/fix fields and
A10's region list include unterminated or oversized units that cannot be selected.
Their full text is still context, not omitted evidence. This selection bias may
force abstention or limit useful coverage. Do not drop those articles, loosen
segmentation silently, or count a reduced denominator as success.

Verification: all **2,514** local automated tests pass, including **24** new
source-plan tests. The independent reviewer rechecked all ten source inventories
and the escaped-input repair, found no remaining implementation blocker, and
cleared **local prototype mechanics only**. The reviewer explicitly withheld
live, semantic-quality, publishing and production approval. Earlier compact-run
failure counts remain unchanged. This step is locally ready for consideration
of a separately approved bounded no-email trial, not proof that the writer is
fixed. Before any trial, verify trusted revision, fresh free-plan/allowance
status and the exact scope/budget; preserve all raw answers and independently
review all ten results without cherry-picking. No live attempt occurred here.
