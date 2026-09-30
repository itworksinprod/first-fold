# Complete held-article source-span check

Status: isolated setup built; local and independent preflight passed.
No live run or whole-article approval yet.

Carlos approved applying the same checker to the complete saved GitHub-runner
draft, then explicitly approved transmitting its headline, six sentences and
six saved source blocks to Cloudflare for at most seven requests at 4,800 output
tokens each. This is an examined development sample, not fresh news or an unseen
holdout. No rewrite, search, retry, alternative model, billing change or email.

## Frozen input and contract

- Original run: 36575945893.
- Original capture SHA-256: `af3b7a78d3b8d28a8964425c335ca0c1b2d6626bc30f5490a55e1795a8132397`.
- Exact full-draft SHA-256: `528072d9a3a0804c81a2798e384f450ea8120e2f7e59089f1e5652c02ea926f4`.
- New private packet SHA-256: `ca573169c8a123d8bc2f6cddb9d4d24e1c948107e5320504526f17ecd5b5b52c`.
- Retained source SHA-256: `15202ce25de2d6cc9a0ddbc0d935807da70864472d843efc8b3b239789bf5169`.

The source registry and original summary normalizer revalidate attribution,
110–225 body words, plain text, original wording and exact unit reconstruction.
The saved draft has 149 body words. Seven units in original field order cover
the headline and every body sentence without omission or hand correction.
Each request uses unchanged v2 span prompt/schema/validator, GPT-OSS-120B,
temperature 0.1, 4,800 output-token ceiling, 90 seconds and one attempt. All six
source blocks and genuine publisher identity accompany every unit. Neighboring
draft sentences are not injected into the frozen single-sentence contract;
whole-article context is assessed separately by independent review.

The total ceiling is seven requests / 33,600 requested output tokens, not actual
usage. Transport, truncation, provenance or structural rejection stops remaining
calls immediately. Valid semantic holds remain held, but inspection continues
through the other units. Article/source/model payloads are encrypted to a fresh
ephemeral public key, retained in GitHub for one day; its private key stays local.
Public logs contain bounded counts and codes only.
The fixed-packet CLI is owner/main/manual/first-attempt only. There is no source
hash selector or ability to submit a different packet through workflow inputs.

## Expectations declared before inference

An independent reviewer read the complete unchanged source and draft first.
S means supported; U means unsupported. Headline ambiguity is not forced into
a gold label or excluded from the actual request.

| Unit | Location | Expected span verdicts |
| --- | --- | --- |
| U1 | Headline | Ambiguous; explanation requires independent judgment |
| U2 | What happened, first sentence | S S S S S S |
| U3 | What happened, second sentence | S S S S S S S |
| U4 | Why it matters, first sentence | S U U |
| U5 | Why it matters, second sentence | S S S |
| U6 | What to watch, first sentence | U |
| U7 | What to watch, second sentence | S S |

There are 19 supported and three unsupported determinate spans, plus one
ambiguous headline. The source establishes a date change, not its direction;
the headline cannot establish postponement without the previous date. U4 adds
unsupported patch/feature guarantees. U6 broadens conditional platform-scoped
advice into an all-runners instruction. Date fragments retain their sentence
context; registration and runtime minima must remain distinct.

## Completion is not approval

Workflow success means all seven structurally valid reviews were captured,
**not** correct labels or article acceptance. The report always sets
`articleApproved` and `publicationReady` false, even if every injected/model
verdict is positive. `sourceGatePassed` records only the model's complete
all-supported result, never an independent fact determination. Expected labels
are in this host-side record only, never sent to the model.

After verified run/artifact provenance and exact local request/parsed-response
replay, independent review must assess all 22 determinate judgments, the headline
explanation, quotations, scope and usefulness. The earlier citation omission
(runtime explanation citing only a registration passage) must also be recorded
where present. Do not claim 23/23 because the headline is genuinely ambiguous.
Any missed error, false rejection or incomplete run keeps checker qualification
held. Even full checkpoint success keeps the original article held until a
separate correction-and-review step. No daily integration is part of this test.

## Preflight evidence

All 1,944 local tests passed; the independent reviewer also ran all 157
workflow-selected tests and verified the actual private packet, exact original
text, seven views and 23 spans. No runtime blocker was found. A documentation
correction distinguishes public-key encryption from local private-key retention.
Current Cloudflare documentation for the model and pricing was consulted. At
approximately September 30 00:42 UTC, the account dashboard showed Workers Free
Active, no payment method and 341.85 of 10,000 daily neurons used. No billing
setting changed; this observation does not guarantee provider acceptance.
