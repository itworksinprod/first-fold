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
