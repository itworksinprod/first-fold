# Direct-definition editor checkpoint

Status: first live run held; bounded sentence-level repair preflight passed.

Carlos requested continued implementation and verification without continuation
prompts. The previous context-assisted trial passed factual/meaning checks but
failed readability. This opt-in `context-direct-language` experiment retains its
exact private capsule, original 148-word baseline, glossary, source evidence,
models, reviewer prompts and request limits. No new private data, provider,
recipient, daily-delivery setting or billing configuration is introduced.

The new editor instruction and derived edit plan permit only original
glossary-bearing units (U1/U3/U6). U2/U4/U5 are byte-locked. Changed eligible units
must use direct plain phrasing without retained glossary labels or new
parenthetical/bracketed glosses. Shape, headline, ordering and 110–225-word gates
remain, followed by all existing source and meaning checks. A structural/style
pass is not a semantic or readability pass; the code checks exact glossary
labels and ASCII parentheses/brackets, not every jargon variant or possible
aside. Unchanged technical sentences remain eligible for a readability HOLD.

The provider maximum remains one 2,400-token GPT-OSS editor, four 600-token Llama
source checks and up to three 600-token GPT-OSS meaning checks: eight
single-attempt requests / 6,600 requested output tokens. This actual baseline's
locked why-it-matters field limits the successful path to at most seven calls.
No automatic retry, paid fallback or cap increase is added.

Preflight discovered and fixed an ESM initialization cycle with a lazy baseline
loader import. Child-process cold-import tests now cover the profile, editor and
CLI-style preparation. Build and all 1,545 tests pass; independent review passed
85 focused/legacy tests with no remaining blocker. Exact prior live capture
replay still passes. The real-packet offline check confirms the new request only
adds the derived edit plan to the prior editor input, and rejects the previous
gloss-heavy proposal. It makes no provider calls and asserts no prose success.

Editor request size: 13,114 bytes. Complete system-prompt/schema SHA-256:
`080885de8b2cbaa6ccf8872aca344f3043b00629f9e938b1b971160e757fb880`.
Private packet SHA-256 remains
`b0040624abca91f1ab059a9e374a4e40ea39b26c1e6ea6d10cec9c302d5b7f1a`.
The previous mode remains unchanged and replayable. No plaintext is published;
the manual workflow still retains only an encrypted one-day artifact.

## First live result: review truncation, not approval

[Run 36288316471](https://github.com/itworksinprod/first-fold/actions/runs/36288316471)
on main `6ba8996d454df180ee4784bcfe4adfe9b7619fb7` passed editor containment,
headline source/identity and what-happened source review. Its fourth request,
the three-unit what-happened meaning review, reached the fixed 600-token output
limit. The runner failed closed with `WORKERS_AI_EDITORIAL_FORMAT_INVALID` /
`OUTPUT_TOKEN_LIMIT`; no retry, further calls or email occurred. Four calls used
4,200 requested output tokens. That output remains HOLD: the primary agent also
observed duplicated obligation wording and ambiguous attachment of a timing
phrase. A missing/truncated review is never inferred to have passed.

Artifact `10921811263`, 52,942 bytes, ZIP SHA-256
`bfde474bb1d59f5e9add6c0988734bef58f3121e98065fdb85ff24eed43c864f`.
Capture SHA-256
`c67e5d62aff69a51b0fe77ab74ca3c43da260a7989f46a74a7fa6ec455c96268`.

## Bounded repair: compact editor and per-unit meaning checks

The separate `context-direct-unit-language` mode combines a concise generic
editor instruction with single-changed-unit meaning review. It is not a
single-variable comparison or retry of the held output. Private input, original
baseline, edit locks, source prompts, meaning prompt/schema, providers and
per-request allowances remain unchanged. No article-specific replacement
sentences or manually edited example are supplied.

The runner rejects more than three changed units before any review call. Each
changed unit receives an aligned, hash-bound 600-token meaning review; unchanged
units receive exact identity checks. Missing, cross-unit-swapped, invalid or
negative responses fail closed. All four source checks remain mandatory. Thus
one 2,400-token editor plus four source and at most three meaning checks still
fits the original eight-call/6,600-token ceiling. No allowance increase or
automatic retry is added. Whole-article final review must still inspect
cross-sentence references and timing attachment because each meaning model
request now has less surrounding context.

Build and all 1,553 tests passed; independent review passed 93 focused/legacy
tests after identity verdicts were deeply frozen. Previous context-assisted
capture replay is unchanged. Exact private-packet preflight passed without
network and confirms the same editor data/plan, with an 8,225-byte request.
New system-prompt/schema SHA-256:
`f8e4a71d8289b249fb8ac050105392fccf120b109c15e19f0da0a7abd9d37354`.
Independent implementation review found no blocker; live outcome and final
article approval remain pending.
