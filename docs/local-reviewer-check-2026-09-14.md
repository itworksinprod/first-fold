# Local reviewer check, September 14

This was work performed while Cloudflare's daily free allocation was exhausted.
It does not change the daily delivery model, recipient, schedule or quality rules.

## Completed offline

- Added two synthetic holdouts: a supported transit-data summary with coverage
  and snapshot caveats, and a gateway advisory with deliberately swapped
  version-specific attack conditions. Expected labels remain outside model input.
- Added a manual local-only reviewer diagnostic using the existing installed
  Qwen model. It initially permitted one request, 4,000 output tokens and a five-minute
  deadline. It performs no news research, cloud calls, email or credential access.
- Fixed timeout cleanup in the local adapter. Hanging response readers cancel
  and release their locks; late responses cannot proceed to validation, and a
  late validator cannot replace a timed-out result with success. Existing
  deadlines, reasoning settings, context bounds and quality gates are unchanged.

Independent review cleared the fixtures, diagnostic route and timeout repair.
At that point, the build and full regression suite passed: 898 tests, zero failures.

## Actual local execution

One local request completed after 65,452 milliseconds with
`LOCAL_AI_EDITORIAL_FORMAT_INVALID`. Neither case had an accepted verdict. The
initial diagnostic did not retain the narrower format-reason code, so this
result alone does not distinguish truncation, malformed JSON or schema failure.
No unsupported cause is inferred from its duration. No raw response or model
reasoning was displayed or retained by the diagnostic.

One subsequent, explicitly authorized instrumented request completed after
62,805 milliseconds with `LOCAL_AI_EDITORIAL_FORMAT_INVALID` and the precise
reason `OUTPUT_TOKEN_LIMIT`. Both case verdicts were absent. This establishes
truncation of that request, not whether the model would approve or reject either
case after completing its answer.

The manual synthetic diagnostic now has a fixed 8,000-output-token allowance
to investigate that observed truncation. It still permits exactly one local
request to the installed `qwen3:30b-a3b` model, a five-minute deadline, the same
two holdouts and unchanged verdict requirements. Caller options cannot increase
its budget. Production budgets, provider selection, delivery and scheduling
are unchanged. Only allowlisted failure reasons and bounded counts/verdicts are
reported; no raw response or reasoning is displayed or retained.

Independent review cleared this diagnostic-only change, with 27 focused tests
and the full 944-test suite passing. Exactly one authorized 8,000-token local
request then completed after 130,872 milliseconds with
`LOCAL_AI_EDITORIAL_FORMAT_INVALID` / `OUTPUT_TOKEN_LIMIT`. Both case verdicts
were again absent. The additional allowance did not produce a complete review;
no semantic success or failure is inferred. No retry followed, and no cloud
request, email, installation, schedule change or production-budget change
occurred.

A synthetic pass, if obtained later, would still not establish a working
research-to-email paper or an unattended local delivery service.

Run explicitly with:

```sh
node scripts/automation/check-local-reviewer.mjs --synthetic-only
```

The native endpoint and structured-output behavior were checked against
[Ollama's chat API](https://docs.ollama.com/api/chat) and
[structured-output documentation](https://docs.ollama.com/capabilities/structured-outputs).
