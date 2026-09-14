# Local reviewer check, September 14

This was work performed while Cloudflare's daily free allocation was exhausted.
It does not change the daily delivery model, recipient, schedule or quality rules.

## Completed offline

- Added two synthetic holdouts: a supported transit-data summary with coverage
  and snapshot caveats, and a gateway advisory with deliberately swapped
  version-specific attack conditions. Expected labels remain outside model input.
- Added a manual local-only reviewer diagnostic using the existing installed
  Qwen model. It permits one request, 4,000 output tokens and a five-minute
  deadline. It performs no news research, cloud calls, email or credential access.
- Fixed timeout cleanup in the local adapter. Hanging response readers cancel
  and release their locks; late responses cannot proceed to validation, and a
  late validator cannot replace a timed-out result with success. Existing
  deadlines, reasoning settings, context bounds and quality gates are unchanged.

Independent review cleared the fixtures, diagnostic route and timeout repair.
The final build and full regression suite pass: 898 tests, zero failures.

## Actual local execution

One local request completed after 65,452 milliseconds with
`LOCAL_AI_EDITORIAL_FORMAT_INVALID`. Neither case had an accepted verdict. The
initial diagnostic did not retain the narrower format-reason code, so this
result alone does not distinguish truncation, malformed JSON or schema failure.
No unsupported cause is inferred from its duration. No raw response or model
reasoning was displayed or retained by the diagnostic.

The diagnostic now includes only allowlisted format-reason codes for future
checks; this instrumentation has offline tests but was not followed by another
model call. A synthetic pass, if obtained later, would still not establish a
working research-to-email paper or an unattended local delivery service.

Run explicitly with:

```sh
node scripts/automation/check-local-reviewer.mjs --synthetic-only
```

The native endpoint and structured-output behavior were checked against
[Ollama's chat API](https://docs.ollama.com/api/chat) and
[structured-output documentation](https://docs.ollama.com/capabilities/structured-outputs).
