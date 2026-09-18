# Private reviewed email test

This is a manual test, not a replacement for the scheduled paper and not
qualification for unattended delivery. No paid provider fallback is enabled.

The workflow remains closed while its checked-in manifest is `null`. Activation
requires the owner's test authorization and actual independent field-by-field
reviews of the exact summary text. Passing automated checks alone is insufficient.

## Acceptance

- Retain the original fresh research run, source identities, complete captured
  context, rejected drafts, corrections and review bindings privately.
- Check every headline, deck, factual claim, analysis and suggested next step
  against its own source passages. No unsupported claims or source-link fallback
  may be presented as a finished summary.
- Record genuine independent review, then render the unchanged six prose fields
  into both HTML and text. Include publisher links and an honest test/coverage
  label. Do not email captured publisher articles or internal reviewer notes.
- Encrypt the full approved input using a new temporary key. Only ciphertext and
  non-content integrity metadata may be committed to the public repository.
- Rebuild the complete review gate and recapture the publisher pages before
  sending. Changed or unavailable evidence, stale authorizations, mismatched
  recipients and changed payloads block the test.
- Send only to the existing `PERSONAL_PAPER_EMAIL`, through the existing fixed
  Resend sender. Never add a recipient input or modify the daily ledger.
- Provider acceptance is not inbox delivery. Verify a delivery event or obtain
  recipient confirmation before reporting the email delivered.

## Authorization and duplicate handling

Authorization expires no more than six hours after issuance. Model revisions
also retain their separate, short-lived evidence and request bounds.

The email test uses a unique, stable test ID and the exact same bound body and
recipient. A repeated manual dispatch can create another HTTP request; it is not
a durable request lock. Resend retains idempotency keys for 24 hours and returns
the original response without sending another email for the same request. The
entire six-hour authorization window falls inside that retention period, measured
from the first attempted send. Do not change the test ID to retry an uncertain
delivery. See [Resend's idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Cleanup

Remove the temporary `FIRST_FOLD_REVIEWED_TEST_KEY` repository secret after the
test completes, or on terminal failure or abandonment. Do not leave it for a
future session by default. Close the revision and email manifests after their
authorized test. Retain only necessary private audit artifacts; never print keys,
recipient values, decrypted source captures or email bodies in public run logs.

Two reviewed stories can demonstrate this limited email test. They do not prove
complete desk coverage, three-story daily delivery, or paid-model equivalence.
