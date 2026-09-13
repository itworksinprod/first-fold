# Free writer verification — September 12, 2026

Delivery success is not proof that AI synthesis worked. The daily September 12
run succeeded using a source-digest fallback. No email was sent by this audit.

Live checks (all owner-only, no email):

- [34733734680](https://github.com/itworksinprod/first-fold/actions/runs/34733734680):
  Llama responded; three synthetic drafts passed after repair, none passed review.
- [34734030783](https://github.com/itworksinprod/first-fold/actions/runs/34734030783):
  removing provider string-length constraints worsened shape compliance. Reverted.
- [34734248992](https://github.com/itworksinprod/first-fold/actions/runs/34734248992):
  12 free searches, 10 verified articles. Three drafts failed originality; their
  repairs failed reader-copy checks. One other draft failed claim-support review.
- [34734625551](https://github.com/itworksinprod/first-fold/actions/runs/34734625551):
  12 free searches, 11 verified articles. Drafts failed originality, claim shape,
  and numeric citation. Repair failed with `WORKERS_AI_EDITORIAL_FORMAT_INVALID`.

Repairs retain all acceptance checks: exact candidate/hash/evidence-label grammar;
specific originality field feedback; revisions rebuilt from evidence rather than
replaying defective copy; safe HTTP/documented-code diagnostics. No raw provider
response, credentials, or generated copy is logged.

The synthetic-only workflow now evaluates `@cf/qwen/qwen3-30b-a3b-fp8` explicitly.
Production still defaults to Llama until live evidence justifies changing it.
The first Qwen trial [34734964858](https://github.com/itworksinprod/first-fold/actions/runs/34734964858)
passed three drafts locally but failed review formatting. The next trial
[34735168527](https://github.com/itworksinprod/first-fold/actions/runs/34735168527)
identified incomplete sentences and repair output-token exhaustion. Qwen now uses
its author's documented `/no_think` switch and recommended non-thinking temperature
of 0.7, rather than Llama's 0.1. The 7,800-token total ceiling is redistributed as
4,000 drafting, 2,000 revision and 1,800 review. This remains an experiment.
See the [Qwen model card](https://huggingface.co/Qwen/Qwen3-30B-A3B#switching-between-thinking-and-non-thinking-mode).
The documented-profile test
[34735310999](https://github.com/itworksinprod/first-fold/actions/runs/34735310999)
passed all four synthetic stories after one revision and a separate factual review,
using three model calls and no email. The no-email current-news workflow now opts
into this same profile. Daily production remains unchanged pending that check.
The model is fixed and allowlisted, with the same three-request ceiling, token,
timeout, response-size, citation, originality and factual-review checks. It is not
an automatic provider fallback or permission to increase spending.

Current primary documentation:

- [Qwen API parameters](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/)
  document `response_format` and a 32,768-token context window.
- [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
  lists Qwen at 4,625 input / 30,475 output neurons per million tokens, within the
  Free plan's 10,000-neuron daily allocation. It is not listed as paid-only.
- [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)
  explicitly does not guarantee schema adherence. Local validation remains mandatory.
- [Errors](https://developers.cloudflare.com/workers-ai/platform/errors/) distinguish
  free quota exhaustion (3036), capacity (3040), and paid-model restriction (5035).
  Earlier generic unavailability errors alone cannot establish which occurred.

No paid plan, PAYGO, billing setting, recipient, editorial threshold, schedule,
or public edition was changed. A failed live test must not be described as fixed
merely because offline regression tests pass.
