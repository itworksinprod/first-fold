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

Initial status: implementation and local validation in progress; no live result
or production approval is recorded by this document.
