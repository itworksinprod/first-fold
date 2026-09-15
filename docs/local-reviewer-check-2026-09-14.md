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
a token-limit guard rejection, not which native condition caused it or whether
the model would approve or reject either case after an accepted answer. The
guard rejects both native length stops and completion counts above the cap.

The manual synthetic diagnostic now has a fixed 8,000-output-token allowance
to investigate that observed token-limit rejection. It still permits exactly one local
request to the installed `qwen3:30b-a3b` model, a five-minute deadline, the same
two holdouts and unchanged verdict requirements. Caller options cannot increase
its budget. Production budgets, provider selection, delivery and scheduling
are unchanged. Only allowlisted failure reasons and bounded counts/verdicts are
reported; no raw response or reasoning is displayed or retained.

Independent review cleared this diagnostic-only change, with 27 focused tests
and the full 944-test suite passing. Exactly one authorized 8,000-token local
request then completed after 130,872 milliseconds with
`LOCAL_AI_EDITORIAL_FORMAT_INVALID` / `OUTPUT_TOKEN_LIMIT`. Both case verdicts
were again absent. The additional allowance did not produce an accepted review;
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

This run avoided the earlier token-limit guard but did not pass the quality holdout.
The direct profile is not validated for production approval or delivery. No
expected label, acceptance rule or default was changed, and no retry, cloud
request or email followed.

The native endpoint and structured-output behavior were checked against
[Ollama's chat API](https://docs.ollama.com/api/chat) and
[structured-output documentation](https://docs.ollama.com/capabilities/structured-outputs).

## Distinguishing native token-limit conditions

The adapter now preserves a small scalar-only failure diagnostic: allowlisted
`doneReason` (`stop`, `length`, or `null`), `promptTokens`, `completionTokens`,
`finalContentPresent`, and a `tokenLimitCause` when applicable. The causes are
`NATIVE_LENGTH`, `COMPLETION_COUNT_OVER_CAP`, or
`NATIVE_LENGTH_AND_COUNT_OVER_CAP`. Counts must be integers from zero through
65,536; malformed or larger values become `null`. Presence of final content
does not mean it is valid JSON, supported evidence, or acceptable copy. No final
content, reasoning, arbitrary stop reason, response envelope or model text is
copied to this diagnostic. Transport/callback errors cannot impersonate it.

The original rejection conditions, request schema, prompt, holdouts, 8,000-token
allowance, thinking default and five-minute deadline are unchanged.

The pinned [Ollama 0.34.0 Go chat implementation](https://github.com/ollama/ollama/blob/v0.34.0/server/routes.go#L2588)
delays native format constraints until thinking ends in its two-pass path,
passes the same options to both completions, and adds the first pass's evaluated
tokens to the final count. Therefore a count above `num_predict` can reflect
aggregate generation, not necessarily a final length stop. The separate
[native chat path](https://github.com/ollama/ollama/blob/v0.34.0/llm/llama_server.go#L2001)
passes thinking and response format to llama-server; the metadata inspection
alone did not establish which path handled the earlier requests. No claim is
made that applying grammar during thinking caused the failures.

After 37 focused and 978 full-suite tests passed and independent review cleared
the instrumentation, exactly one authorized original-thinking diagnostic ran.
It completed after 156,829 milliseconds with `OUTPUT_TOKEN_LIMIT` and the precise
cause `COMPLETION_COUNT_OVER_CAP`: native `doneReason` was `stop`, prompt count
was 3,102, completion count was 8,242, and final content was present. Its request
fingerprint was
`255ddff1f2fab5e1db153b286ea6990d66062f6b60c7b831c183d9ca68d4a0af`.

This was not a native length stop. It is consistent with aggregate two-pass
counting, but does not establish the exact execution path or the content's
validity. The unchanged 8,000-token guard rejected the response before parsing
or validating its final editorial payload, so both case verdicts remain absent.
No content or reasoning was displayed or retained; no retry, cloud request or
email followed.

## Isolated reasoning with prompt-only JSON schema

An additional explicitly selected transport diagnostic is available:

```sh
node scripts/automation/check-local-reviewer.mjs --synthetic-reasoning-json
```

It keeps `think:true`, the same review rubric, holdouts, 8,000-token allowance
and five-minute deadline. It omits native `format` and appends the exact JSON
schema to the existing system prompt. The source/candidate user message is
unchanged. This uses the documented optional-format chat route to investigate
whether avoiding native format enforcement avoids the two-pass aggregate-count
issue; neither that cause nor semantic success is assumed in advance.

The programmatic opt-in is `formatMode:"prompt-json"`, which requires boolean
`think:true` and an existing first system message. Other modes are rejected.
Default `formatMode:"native"` and direct-output requests are unchanged. The
actual appended schema is counted once inside the messages for conservative
context accounting, and the complete constructed body determines its request
fingerprint. Reports identify `requestedFormatMode` separately from reasoning.

Native formatting is a generation constraint, not an acceptance gate: final
content must still independently parse as one JSON object with the exact
schema, claim/draft hashes and verdict requirements. No fenced-output recovery,
reasoning salvage, extra request, budget increase or quality-rule change is
permitted. Any false approval, false control rejection, malformed response or
token-limit rejection leaves the diagnostic failed. No cloud, email, downloads
or production activation are part of this test.

After independent review and 983 passing regression tests, exactly one
authorized prompt-JSON request completed after 110,077 milliseconds. It used
3,687 prompt tokens and 6,355 completion tokens, within the unchanged
8,000-output-token allowance. The request fingerprint was
`0cd6c52127db62f9a660b04008f3673fbba128cb61cef8f6791e0ad053fe7b16`.

Both unchanged holdouts passed. The transit control had both claim verdicts and
all four whole-story flags true. The version-condition swap had claim verdicts
`[true,false]` and `factsSupported:false`; its remaining three flags were true,
so the invalid story was correctly rejected. This is one successful synthetic
transport/reviewer check, not a claim of general model accuracy, paid-model
parity, real-news quality or working email delivery. No retry, cloud call or
email occurred, and no production default was changed.
