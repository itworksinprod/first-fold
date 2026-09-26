# Definition-aware meaning review — controlled qualification

Status: **live fixed-control qualification and saved-article reviewer-context check passed**.
Independent readability review still holds the article; this does not close the
plain-language article step or approve a daily edition.

## The change

Run 36210756187 exposed unequal reviewer context: the editor knew the source's
definition of a technical term, while the meaning reviewer did not. The proposed
fix supplies the meaning reviewer with only the relevant, reviewed definitions.
It does not supply the full article, factual results, desired verdicts or editing
instructions, and it does not replace the separate source-support review.

Glossary/review code is isolated under `scripts/automation/experiments/`. The
manually selected `definition-preservation-controls` mode qualifies the reviewer;
the separate `frozen-definition-language` mode now prepares one saved-article
trial in the existing encrypted no-email diagnostic. No daily writer or delivery
path imports the new reviewer. Following the saved-article readability failure,
only `frozen-definition-language` now uses an editor-only sentence-fluency variant.
After run 36219118294's preservation veto, that same mode also supplies the editor
with the existing relevant source-bound definitions and their explicit senses.
The prompt and qualified reviewer inputs remain unchanged; the shared selection
helper prevents editor/reviewer vocabulary entries from drifting independently.
Run 36219672362 then passed automated review and independent review of the shared
context correction. This is a bounded saved-article result, not a readability
pass: repetitive wording, unexplained jargon and incomplete citation selection
still hold the article. See the change checkpoints for the exact result receipt.
The qualified reviewers, other diagnostic modes, headline lock, sentence order
and 110–225-word requirement remain unchanged. See the frozen-trial checkpoint
for the current editor hash and still-pending live acceptance.

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

## Controlled qualification — executed and audited

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

### Run settings (historical; do not repeat automatically)

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

### Exact result — September 25 Eastern

[Run 36213351283](https://github.com/itworksinprod/first-fold/actions/runs/36213351283)
completed successfully on `c3338d37455869c8f9fb29c4d19fcef116d76614`, main,
owner-launched `workflow_dispatch`, first attempt. Its capture time was
`2026-09-26T02:58:40.802Z`. All eleven cases completed with all eleven source and
eleven meaning judgments correct: 22 model/network requests, 13,200 requested
output-token budget, no retry, no search and no email. Only G01/G02 satisfied both
acceptance dimensions; the other cases correctly failed at least one dimension.

The user-supplied ZIP matches GitHub artifact `10895798951`:
`7541c1cf4322a051d2999be416560fa451715f5a286f87810e48d3876b17dce3`.
It contains only the encrypted envelope and was authenticated/decrypted locally
outside the repository into a 0600 file. Private formatted audit-file SHA-256:
`0b50e86a67e1d4846aefc7ff562a5ef4aa6910b54d50a8528e4a5cad039a3d27`.
No plaintext capture, encryption key or response text was committed.

Main and independent reviews rebuilt every request view, schema and full prompt,
verified request/prompt hashes and byte sizes, checked fixed case/glossary pins and
provider/model/attempt bindings, and revalidated all recorded responses against
the predeclared labels. Results and the complete report were reproduced exactly.
Source/meaning inputs remained separate; labels and rationales were not supplied
to the model. Positive source citations and contradiction citations were decisive;
the added energy claim was rejected as unsupported. Provider response hashes are
recorded but cannot be recomputed because raw envelopes are deliberately omitted.

G07's meaning explanation identifies the newly named specifics rather than
explicitly explaining category narrowing. Its veto is correct and the separate
source review correctly accepts the supported subset, so this is not a blocker
under the declared criteria. It is not evidence of robust category reasoning.

Independent exact-result review clears this **bounded control checkpoint only**.
It is ready for preparation and independent preflight of a separate frozen-article
trial, not an automatic rerun. That trial still needs source, meaning, structural,
110–225-word and readability checks. No daily-paper reliability, freshness or
publication claim follows from one small fixed synthetic set.

Predeclared success requires valid, correct results on **all eleven meaning
judgments and all eleven independent source judgments**. Source support alone
must not pass G05/G07, and meaning alone must not pass G10. A malformed response,
quota/provider block, wrong verdict or missing result leaves qualification pending
or failed; do not cherry-pick or silently retry until a green result appears.

With controlled qualification and independent result review complete, one
separate frozen-article trial may now be prepared. It must preserve all existing
content and readability gates. A successful control run is evidence about this
bounded set only, not a guarantee of daily-paper reliability.
