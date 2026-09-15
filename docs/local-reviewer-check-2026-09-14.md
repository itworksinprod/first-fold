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

## Explicit direct-output diagnostic (not activated for production)

Read-only local metadata identifies Ollama `0.34.0` and the installed
`qwen3:30b-a3b` model with digest
`ad815644918f0eaab341c12b67837cc6dd4562342cdaf118f83d5d554cb37226`.
It is the 30.5B `Q4_K_M` model with completion, tools and thinking capabilities;
the digest matches the [official Ollama tag](https://ollama.com/library/qwen3:30b-a3b).
The [exact Qwen model card](https://huggingface.co/Qwen/Qwen3-30B-A3B/blob/main/README.md#enable_thinkingfalse)
supports a non-thinking mode, and Ollama documents the native
[`think:false` request switch](https://docs.ollama.com/capabilities/thinking).
Local structured responses continue to use the same JSON schema in `format`.

The installed legacy Go template itself ends with an opening thinking tag;
metadata does not expose every native template-selection detail. Documentation
therefore establishes support for the mode, not proof of its exact behavior or
review quality on this machine. A controlled diagnostic must establish whether
it finishes a valid answer here. No model/template replacement or new download
has been made.

The separate opt-in command is:

```sh
node scripts/automation/check-local-reviewer.mjs --synthetic-direct
```

It requests `think:false`; the existing command and adapter default remain
`think:true`. Both modes retain one loopback request, the fixed 8,000-token cap,
five-minute deadline, 32,768-token context guard, same sampling settings, frozen
holdouts and strict verdict requirements. Only real boolean thinking options
are accepted programmatically. Reports label the requested thinking mode and
include a SHA-256 fingerprint of the exact request body; successful response
provenance must match that fingerprint. These are request settings, not a claim
that hidden thinking was absent or that semantic checks passed.

Independent reviews cleared the implementation, and the full 971-test suite
passed before one authorized direct-mode request. That request completed after
12,623 milliseconds with 3,102 prompt tokens and 609 completion tokens. Its
request fingerprint was
`6fa7330e476ffb594bc39f3684bad97e7d0a7deaf576c1f58dff4eeb52b3b172`.
It returned a complete, schema-valid response, but failed with
`LOCAL_REVIEW_VERDICT_MISMATCH`: the supported transit control passed, while
the deliberately swapped branch-specific condition was incorrectly approved
(both claim verdicts and all whole-story flags were true). That negative
requires the second claim and `factsSupported` to be false.

This run avoided the earlier truncation but did not pass the quality holdout.
The direct profile is not validated for production approval or delivery. No
expected label, acceptance rule or default was changed, and no retry, cloud
request or email followed.

The native endpoint and structured-output behavior were checked against
[Ollama's chat API](https://docs.ollama.com/api/chat) and
[structured-output documentation](https://docs.ollama.com/capabilities/structured-outputs).
