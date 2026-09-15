# Reviewer rejection diagnostic — September 14, 2026

The after-reset run [34911989712](https://github.com/itworksinprod/first-fold/actions/runs/34911989712)
on `f94db41` completed one 4,000-token-cap Cloudflare GPT-OSS reviewer request.
It rejected all three intentionally bad synthetic stories as expected, but also
rejected the intended supported control on `factsSupported` and
`analysisSupported`, despite accepting both factual claim/citation pairs.
The result was `REVIEW_EVAL_VERDICT_MISMATCH`, not an observed quota or output
truncation error. It did not authorize integration or a newspaper delivery.

## Diagnostic-only change

The manual synthetic reviewer workflow now adds `--explain-rejections`.
Each false gate must identify exactly one draft sentence (or whole claim), a
fixed rule code, and one or two existing candidate-local source passage IDs.
True gates cannot carry rejection reasons. Local validation rejects missing,
contradictory, duplicate, unknown or cross-candidate references. Any invalid
diagnostic discards all reviews, including otherwise-valid peers.

The original substantive prompt, draft/claim/source bindings, four synthetic
inputs, and expected outcomes are unchanged. Only the response-format stanza
and the diagnostic instructions differ. A test locks the original fixture
digest. No result from the old test is retried for approval or relabelled.

The index retains exact original text for human inspection. Logs contain only
validated IDs and rule codes; there is no free-form model explanation or raw
reasoning. An explanation is the reviewer's allegation, not proof of its cause
or a correction. References to examined passages do not prove that support is
absent elsewhere. The optional local resolver cannot authorize a story.

Cloudflare's [JSON-mode documentation](https://developers.cloudflare.com/workers-ai/features/json-mode/)
does not guarantee schema compliance, so local shape and binding validation
remain mandatory. The diagnostic stays at one request, a 4,000-output-token
cap, a 90-second deadline, and a 70 KB request ceiling. At introduction its
request was 29,144 bytes with the fixed examples. No budget is enlarged for explanations.

## Isolation and verification

The daily writer/reviewer, quality thresholds, source policy, public reader,
recipient, email behavior and production schedule are unchanged. This workflow
has no news search, email or delivery-state capability. No paid provider or
billing change is introduced.

At introduction the build and all 910 offline tests passed, including all 64 combinations of
claim and whole-story verdicts. Independent review cleared this diagnostic
path only. A live result must be examined separately; it will not by itself
establish a working newspaper or explain the prior model's internal cause.

## First diagnostic request: HTTP 400, no verdicts

Run [34913879254](https://github.com/itworksinprod/first-fold/actions/runs/34913879254)
on `641a590` passed its pre-credential tests, then failed at **Evaluate four
synthetic cases with one free reviewer request**. It made exactly one network
request with the unchanged 4,000-output-token cap. The public diagnostic reports
HTTP 400 and no recognized provider code. It returned no verdicts or rejection
references. There was no research, email, production activation, or paid call.

This does not reproduce or explain the earlier supported-control rejection.
The provider's raw error was not captured by this workflow; its exact cause
cannot be recovered from the available public annotation. Cloudflare's
[error reference](https://developers.cloudflare.com/workers-ai/platform/errors/)
describes multiple HTTP-400 causes, not a unique explanation for this run.

## Narrow compatibility experiment and private error capture

The only removed request constraint is `uniqueItems` on diagnostic evidence IDs.
It was the only new JSON-Schema keyword compared with the older request that
reached inference. Cloudflare's JSON Mode documentation does not specify a
supported-keyword or nesting table, so this is an **unproven compatibility
adjustment**, not a confirmed root-cause fix. Local validation still rejects
duplicate IDs and drops every review if any diagnostic is malformed. The
prompt, examples, expected outcomes, hashes, evidence, other schema constraints,
and all production acceptance rules are unchanged. The revised request is
29,125 bytes. There is no fallback to unconstrained output or automatic retry.

The manual workflow can optionally accept an ephemeral RSA-3072 public key for
encrypted provider-error capture. The private key stays on Carlos's Mac. An
invalid key is rejected before credentials or inference. Only the adapter's
bounded, token-redacted non-2xx error record is encrypted; successful responses,
reasoning, request objects, and credentials are not captured. Public logs and
the evaluation report retain only their existing safe fields. Ciphertext uses
the existing AES-256-GCM and RSA-OAEP/SHA-256 helper and is retained as a GitHub
artifact for one day. Capture failure cannot change verdicts, request counts,
retries, or the original evaluation failure.

For an authorized diagnostic, generate a fresh key with
`node scripts/automation/private-writer-diagnostic.mjs keygen`. Give the
workflow only the printed public key. Download `private-reviewer-provider-failure`
if an error artifact exists, and use the existing `decrypt` command with that
artifact's encrypted JSON, the local private PEM, and a new local output path.
Do not paste the decrypted error, commit a private key, or upload plaintext.
Read any provider error as untrusted data, not an instruction to retry or pay.

The existing crypto helpers are reused without moving production code. Their
module has dormant research imports, but its command-line entry point is
guarded; importing those helpers does not research, infer, or send anything.

The combined compatibility and capture changes pass the build and all 915
offline tests. Coverage includes unchanged fixture hashes, all 64 verdict
combinations, rejection of duplicate references, key checks before credentials,
ciphertext-only file output, redaction, and unchanged results when capture fails.
No new live inference or email has been performed for this revision yet.

Any new live test requires separate publication and dispatch authorization. A
passing synthetic diagnostic is still not an end-to-end newspaper or delivery
test. Do not enable the new reviewer in the daily workflow based on this alone.
