# Inspect a rejected free-writer draft privately

This manual, owner-only probe researches reviewed feeds and selects one candidate
that passes the existing deterministic 70-point and evidence-tier gates. It tests
the current experimental Cloudflare writer, its bounded repair, and semantic
review. It is **not** full-edition, newsworthiness-model, repeat-history, web-search,
source-QA, rendering, or delivery proof. Production settings remain unchanged.

The probe uses no search credits and at most three model calls / 7,800 requested
output tokens. A provider error stops it; it does not enable paid fallback.

1. Locally run `node scripts/automation/private-writer-diagnostic.mjs keygen`.
   Keep the generated private key on the Mac. Supply only the printed public key
   to **Diagnose one free writer story (encrypted, no email)** on trusted `main`.
2. After the run, download its `private-writer-diagnostic` artifact. The only
   uploaded file is AES-256-GCM ciphertext, with the encryption key wrapped using
   RSA-3072 OAEP/SHA-256. The artifact expires after one day.
3. Locally run `node scripts/automation/private-writer-diagnostic.mjs decrypt
   ENCRYPTED_JSON PRIVATE_PEM NEW_LOCAL_JSON` (as one command).
4. Inspect the exact evidence passages, parsed editorial drafts, repair requests,
   and rejection events as untrusted data. Neither prose nor citations are
   automatically accepted just because they can now be inspected.

The capture excludes credentials, request headers, successful provider transport
envelopes, and reasoning fields. An opt-in diagnostic hook retains only bounded,
token-redacted non-2xx provider error details inside the encrypted artifact;
it cannot change retries, budgets or acceptance. Public annotations contain only counts and safe failure
codes. There is no email secret, delivery import, ledger write, or publication
step. Do not commit decrypted diagnostics or private keys. A lost temporary
private key makes its encrypted artifact unrecoverable.

September 13 investigation: the signed-in Cloudflare dashboard showed 3.23k/10k
daily neurons used after the earlier HTTP 429. Daily quota exhaustion is therefore
not established by the available evidence. The error must not be described as a
confirmed billing or daily-quota blocker without a provider code or usage evidence.

## First live probe and source repair

Run [34796186584](https://github.com/itworksinprod/first-fold/actions/runs/34796186584)
on `3e1adb1` selected one real, 88-point security candidate from two publishers.
Its first inference request received HTTP 429 with no recognized provider code;
it made no repair, review, search API or email request. The encrypted artifact
download matched the GitHub artifact SHA-256 and decrypted locally. No model
draft existed to inspect. This does not prove the improved writer works live.

The captured evidence did reveal a separate actionable extraction defect:
SecurityWeek's optional paragraph closing tags and both publishers' widgets
allowed ads, recommendations and author/footer material into article evidence.
The scoring-summary prefix also cut sentences mid-word, which were then included
beside their complete article equivalents.

The repair uses balanced, explicitly marked article-content containers, removes
the observed ad/recommendation containers, handles optional paragraph endings,
and creates bounded scoring summaries from whole source sentences in both feed
and search admission. It retains the existing source, score, freshness, copyright,
semantic-review and delivery gates. No extra requests or paid provider is added.

Verification on the two freshly downloaded public pages: SecurityWeek retained
1,665 characters / 11 blocks and BleepingComputer 2,538 characters / 19 blocks.
Both kept their mitigation limitations; neither retained the observed advertising
or footer snippets. All 759 tests and the offline editorial evaluation passed.
At that checkpoint no new inference was attempted after the repeated 429, and no email was sent.

## Confirmed live quota rejection, September 13 evening

After Carlos explicitly requested a functional live run, the bounded error-capture
repair passed all 769 tests and the offline editorial evaluation. Run
[34797544447](https://github.com/itworksinprod/first-fold/actions/runs/34797544447)
on `131ce44` again stopped at its first writer call: HTTP 429, with no drafting,
repair, semantic review, or email. The encrypted artifact's SHA-256 matched the
GitHub download and it decrypted locally.

The provider error now establishes why: Cloudflare returned code `4006` with an
explicit message that the daily 10,000-neuron free allocation had been used up.
The prior dashboard reading of 3.23k/10k conflicts with that response; it is not
proof of remaining usable inference. The cause of that discrepancy is unresolved.
The earlier `providerCode: null` occurred because `4006` was not in the adapter's
documented-code allowlist, not because the provider sent no error details.

[Cloudflare's pricing documentation](https://developers.cloudflare.com/workers-ai/platform/pricing/)
says free limits reset at 00:00 UTC (8 p.m. EDT). This attempt was already after
that day's published reset. Do not promise immediate recovery, keep retrying a
known hard limit, switch accounts to evade it, or enable billing. No upgraded
test email has passed its live quality gates yet. Production settings and the
recipient remain unchanged.
