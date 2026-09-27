# Fresh meaning-review holdouts

Status: expected answers independently adjudicated before inference; runtime
preflight complete. No live result is claimed by this preparation.

The [model-only comparison](grammar-review-contrast.md) passed its ten known
scored examples. Carlos requested proceeding to unfamiliar examples. This new
set tests ordinary-language meaning preservation across fictional domains,
not source truth, specialized definitions, readability or a complete article.
The provider receives each pair independently, without prior conversation,
case IDs, expected labels or scoring rationales. These are new evaluation inputs,
not a claim that related language never appeared in model training.

## Frozen expected outcomes

| Case | Domain/change | Meaning preserved |
| --- | --- | --- |
| H01 | Gallery: active/passive, actor, six objects and timing retained | Yes |
| H02 | Weather: possible consequence becomes certain under the same condition | No |
| H03 | Library: permission and eligibility exclusion paraphrased | Yes |
| H04 | Laboratory: testing and publication actors swapped | No |
| H05 | Railway: clause order changes, weekday/weekend conditions retained | Yes |
| H06 | Archive: some maps becomes all maps | No |
| H07 | Maintenance: mandatory replacement, exact use count and reset timing retained | Yes |
| H08 | Study: association without established causation becomes established causation | No |
| H09 | Cooperative: attribution, comparison and unpublished-measurement caveat retained | Yes |
| H10 | Sensors: exact hourly reading count changes | No |
| P02 | Council software: purpose/function ambiguity | Unscored |

Independent adjudication caught an added permission-granter in the proposed H03
paraphrase. Passive wording now preserves eligibility without adding that actor.
H08's rationale was also corrected: failure to establish causation is not proof
that causation is absent. Both corrections and the following hash were frozen
before any inference. Re-review accepted all ten scored labels and P02's unscored
status, with no remaining ambiguity requiring a scored-label change.

Case-set SHA-256:
`cc41aad87789d98c8d54cb74992da1065610fbc3bf9332238be41acdad2f56c3`.
Unchanged reviewer prompt SHA-256:
`b0711232aac6664bf9ff040aa4edb61a8e2c3bac199949adea8132db299c9785`.

The previous printshop glossary binding is retained to avoid changing the review
contract. None of these sentences matches a glossary term, so every view contains
an empty definitions list. No unrelated definition text is sent. This therefore
does not test unfamiliar glossary senses or their generalization.

## One-run contract

The isolated `grammar-reasoning-holdouts` workflow mode uses only Cloudflare-hosted
`@cf/openai/gpt-oss-120b`. It reuses the unchanged meaning prompt, schema,
temperature and response validation. Only the fixed input pairs and diagnostic
metadata differ from the prior GPT-OSS comparison.

- Eleven requests maximum, one per case/probe, one attempt each.
- 600 requested output tokens and 30 seconds per request; 6,600 tokens maximum.
- All eleven structurally valid replies and all ten scored answers correct are
  required to pass this bounded set. Neither probe answer counts as correct.
- Wrong valid answers are recorded while completing the fixed set. Malformed,
  truncated, provider, quota, network or provenance failures stop the run.
- No retries, larger budgets, label changes after results, alternate model,
  article input, source checking, research, email or paid fallback.
- Owner/main/manual/attempt-one gates, credential-free tests, encrypted one-day
  artifact retention and no production/qualification writes remain unchanged.

The [model reference](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/)
and [pricing documentation](https://developers.cloudflare.com/workers-ai/platform/pricing/)
were checked for this preparation. They document the native endpoint and free
allowance behavior; they do not attest to the account's current plan or quota.
No account or billing configuration is changed by this diagnostic.

## Completion and next-step boundary

Local build and all 1,526 tests passed, including nine new holdout tests.
Independent implementation review initially caught a legacy timeout assertion
that omitted the new mode. It was corrected to add only this mode to the existing
ten-minute allowlist; no existing timeout or runtime gate was weakened.
Independent re-review passed 51 focused/legacy tests with no remaining blocker.
Both previous live captures replay exactly with their original results and zero
network calls under the updated code. This clears the one-run setup only.

Before inference: full local tests, old-capture regression replay, and independent
implementation preflight. After inference: verify trusted revision/attempt,
artifact hash, exact parsed-response/request replay, labels and explanations,
then independent outcome review. Raw provider envelopes/reasoning are not saved;
their hashes cannot be independently reconstructed from the parsed capture.

Passing this small holdout set would complete this checkpoint, not establish
general accuracy or clear the held MIT draft. It may support proposing a separate
no-email test on that draft with unchanged factual and readability checks.
Production reviewer, daily delivery, source policy and qualification records
must not change automatically. A failed or incomplete set remains visible; it
does not permit rerunning until a favorable result appears.
