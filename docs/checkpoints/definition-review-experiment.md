# Definition-aware meaning review — offline checkpoint

Status: **isolated control-run implementation; live semantic qualification pending**.
This does not close the plain-language article step or approve a daily edition.

## The change

Run 36210756187 exposed unequal reviewer context: the editor knew the source's
definition of a technical term, while the meaning reviewer did not. The proposed
fix supplies the meaning reviewer with only the relevant, reviewed definitions.
It does not supply the full article, factual results, desired verdicts or editing
instructions, and it does not replace the separate source-support review.

Glossary/review code is isolated under `scripts/automation/experiments/`. The only
integration is the manually selected `definition-preservation-controls` mode in
the existing encrypted no-email diagnostic. No daily writer or delivery path
imports the new reviewer. The editor prompt, current article reviewer, headline
lock, sentence order and 110–225-word requirement are unchanged.

## Trust and acceptance boundaries

- A fixed repository registry binds each glossary to an exact captured source
  SHA and a complete manifest hash, including its supporting passage IDs.
  Hashes prove identity with a reviewed reference, not that its statements are true.
- Caller/model-supplied definitions, replacement pins, cloned tokens, stale
  sources and self-reported approval are rejected. New sources require separate
  glossary review; this is not an automatic glossary extractor for arbitrary feeds.
- The MIT glossary covers two concepts supported by captured P2/P12. Explicit
  singular/plural entries avoid losing a definition or inferring arbitrary word
  forms. Partial solutions are distinct from the generation steps themselves.
- The request includes only relevant term/definition/sense entries and opaque
  source/manifest bindings. Selection uses whole terms in either aligned sentence.
  A lexical match supplies vocabulary context, not proof that the sense applies.
- The existing strict verdict schema and descriptor validation are reused.
  The new review hash covers the aligned inventories and exact definition context;
  old text-only or other-role answers cannot be replayed as new approvals.
- No automatic semantic pass exists. Missing or ambiguous definitions remain a
  veto. Obligations, conditions, quantities, actors, comparisons and categories
  must survive. Definition substitutions cannot authorize added claims.
- Future acceptance must still require both **source support AND meaning
  preservation**, followed by a separate readability review. The experiment's
  meaning verdict alone is not an article or publication approval.

## Predeclared controls

A separate reviewer authored and adjudicated the synthetic controls before any
model inference. Their vocabulary differs from the held MIT example. Full inputs
and labels live in `definition-preservation-cases.mjs`; labels never enter model
inputs. Source labels concern the final statement, meaning labels the entire edit.

| Case | Change | Source supported | Meaning preserved |
| --- | --- | --- | --- |
| G01 | Defined mandatory-requirement equivalent | Yes | Yes |
| G02 | Defined partial-answer equivalent | Yes | Yes |
| G03 | Mandatory becomes optional | No | No |
| G04 | Operating condition removed | No | No |
| G05 | Requirement obligation becomes range restrictiveness | Yes | No |
| G06 | Possibility becomes certainty | No | No |
| G07 | Full category becomes selected examples | Yes | No |
| G08 | Actor changed | No | No |
| G09 | Quantity changed | No | No |
| G10 | Equivalent paraphrase of a false assertion | No | Yes |
| G11 | Valid definition plus unsupported added fact | No | No |

The unit tests use mocked responses to verify plumbing, not to claim that a model
can distinguish these cases. They also cover source/manifest integrity, minimal
selection, singular forms, input isolation, unsafe descriptors, stale answers,
multi-claim completeness and independent vetoes. The actual private baseline was
checked locally: both `hard constraints` and singular `intermediate sample`
receive context, with no full excerpt exposed. No private draft is committed.

Verification: all 1,440 automated tests pass. Final independent review cleared
this offline implementation, re-ran all nine focused tests and independently
checked the private-baseline selection, definition senses and documented pins.
It did not approve live inference or article readiness.

Pinned identities:

- Meaning prompt: `b0711232aac6664bf9ff040aa4edb61a8e2c3bac199949adea8132db299c9785`.
- Eleven-case set: `1138e8fa6bedeb41e87772f2e5b151b974fea6bd8269ff56097dccbc44936df2`.
- Synthetic glossary: `0cf61d8cd2c159df5444d79ea6975b681d7120d922d258a166f2a3035015fec9`.
- MIT glossary: `a52f89f3eaf76fd1e20acdd680e0ab8be14a3ecbe7eebf8726ca6611bca138ca`.

## Controlled qualification — prepared, not executed

The fixed synthetic set uses the existing free-plan-compatible Cloudflare Llama
reviewer, not the article or a new provider. Expected labels stay outside requests,
exact prompt/schema/input hashes are bound, and every result is retained, including
failures. The new manual mode has these fixed limits:

- Eleven cases, each with one source and one meaning request: at most 22 requests.
- At most 600 requested output tokens per request, 13,200 in total; one attempt
  each, no retries, no local-identity shortcuts or paid-provider fallback.
- Every request uses the existing fixed model and native endpoint, a 30-second
  timeout, 70,000-byte request and 100,000-byte response caps. Sticky denial,
  exact request binding and closed callback lifetimes remain enforced.
- Valid but wrong answers are recorded, without retries, while completing the
  fixed set. Malformed answers, provenance failures and provider/quota errors stop
  further requests and record an incomplete failure.
- Only this mode gets a 15-minute job timeout, allowing the worst-case 22×30-second
  request time plus setup and encrypted artifact upload. Other modes retain eight
  minutes. Existing owner/main/manual/attempt-one restrictions remain unchanged.
- Results use the existing encrypted artifact with one-day retention. Public
  output contains counts, hashes and per-case result flags, never response text.
  No email, research, article generation, private baseline input or billing change.

Cloudflare's [published pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
lists this model in its allocation-based pricing and requires upgrading to use
more than the Free-plan allowance. This mode does not enable billing or purchase
credits; on the existing Free account, quota exhaustion must stop the trial.
It cannot guarantee available quota or detect an account upgrade made elsewhere.

### Launch once

In GitHub Actions, open **Diagnose one free writer story (encrypted, no email)**,
choose **Run workflow**, keep branch `main`, and select mode
`definition-preservation-controls`. Use the previously prepared RSA-3072 public
key from the private review directory, never a private key. Run only once; a failed
result is evidence to inspect, not permission to retry until it passes. Download
`private-writer-diagnostic` when complete for local decryption and exact review.

No new repository secret is required. The existing Cloudflare secret is used only
after the mode, encryption key and diagnostic boundaries pass preflight. The frozen
article secret remains exposed only to the separate frozen-article mode.

Setup verification: all 1,447 automated tests pass. Final independent preflight
passed 44 focused tests with no blockers and cleared one manual synthetic run.
The session preparing this mode has no authenticated GitHub dispatch access;
publication of the mode must not be confused with starting or passing its test.

Predeclared success requires valid, correct results on **all eleven meaning
judgments and all eleven independent source judgments**. Source support alone
must not pass G05/G07, and meaning alone must not pass G10. A malformed response,
quota/provider block, wrong verdict or missing result leaves qualification pending
or failed; do not cherry-pick or silently retry until a green result appears.

After successful controlled qualification and independent result review, one
separate frozen-article trial may be considered. It must preserve all existing
content and readability gates. A successful control run is evidence about this
bounded set only, not a guarantee of daily-paper reliability.
