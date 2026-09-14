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

The capture excludes credentials, request headers, provider transport envelopes,
and reasoning fields. Public annotations contain only counts and safe failure
codes. There is no email secret, delivery import, ledger write, or publication
step. Do not commit decrypted diagnostics or private keys. A lost temporary
private key makes its encrypted artifact unrecoverable.

September 13 investigation: the signed-in Cloudflare dashboard showed 3.23k/10k
daily neurons used after the earlier HTTP 429. Daily quota exhaustion is therefore
not established by the available evidence. The error must not be described as a
confirmed billing or daily-quota blocker without a provider code or usage evidence.
