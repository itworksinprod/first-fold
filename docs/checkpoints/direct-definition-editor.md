# Direct-definition editor checkpoint

Status: preflight passed; live outcome pending.

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
