# Direct-definition editor checkpoint

Status: name-preserving live run passed automated checks; full readability review pending.

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
Independent implementation review found no blocker before this live run.

## Second live result: a real meaning veto

[Run 36288808906](https://github.com/itworksinprod/first-fold/actions/runs/36288808906)
on main `ad7d6576e081b3ed1da55f36403bf09d67d03d43` completed eight calls within
the same 6,600 requested-token ceiling without truncation. The last meaning
check rejected a lost named-method reference in U6. All source checks passed,
but source support cannot substitute for preservation of the original meaning.
The 172-word candidate remains HOLD, with `FACT_SUMMARY_REVIEW_REJECTED`.
Exact request/response replay preserves that failed verdict. No email was sent.

Artifact `10921022365`, 80,727 bytes; ZIP SHA-256
`201c1b854b34dd2131c6fed3b42b206ff79f300043cd5cd394d0cc706905d79b`.
Capture SHA-256
`402fa33617f1a5be6771f69686a14844cc024dc725cb801ddda64724493f739d`.

## Next bounded repair: preserve names and compose naturally

`context-named-unit-language` derives conservative camel-case/all-capital name
anchors from each original sentence and rejects their deletion, renaming or
movement before any model review. This is deliberately limited lexical
recognition, not general named-entity detection. Name presence does not prove
ownership or semantic equivalence: all existing source and meaning checks stay.

The generic editor guidance now explicitly treats definitions as references for
natural composition rather than literal replacement strings. No custom article
answer is supplied. Original baseline, private packet, locked units, headline,
order, 110–225-word gate, models, temperature 0.1, single-attempt budgets and
review prompts remain unchanged. The previous modes remain replayable.

Independent full-prose inspection through the reviewing agent's tool channel was
denied by the privacy boundary. That reviewer can assess implementation and
redacted structural checks, not certify the candidate's complete semantics or
readability. Do not present those limited checks as a full editorial approval.

Preflight: build and all 1,556 tests passed; independent implementation review
passed 96 focused/legacy tests with no blocker. Both complete previous captures
replay exactly. The actual private-packet offline check rejects the held
name-losing output before review and preserves all original editor input except
the derived name anchors. Request size: 9,140 bytes; system prompt/schema SHA-256
`3707f8e0ac1769f90da50665e36cf6f3a7fff3d849513993bf809044e9b2de52`.
This authorizes no quality claim: the next live candidate remains unqualified.

## Name-preserving live result: automated pass, final review pending

[Run 36289375100](https://github.com/itworksinprod/first-fold/actions/runs/36289375100)
used trusted main `a853a6037052d22e66df8882f8d51cff44102373`. Its 149-word body
passed the containment gate, all four source checks and all required meaning
checks. Eight single-attempt calls used at most 6,600 requested output tokens;
there was no truncation, retry, search, email or production promotion.

The encrypted artifact's digest was verified before local decryption. Exact
offline request/parsed-response replay reproduced every captured result with
zero actual network calls. These results establish an automated pass on this
saved article, not independent readability approval or unseen-article success.
Explicit permission for full local draft/source inspection has been requested
because the independent reviewing agent's privacy boundary blocked that step.

Artifact `10922125038`, 80,363 bytes; ZIP SHA-256
`def0c0e0a51c4db1b0173f8afaa2f047036ca9da55a75f85dd9199f1b35ff0c4`.
Capture SHA-256
`fada8d01580821cc7a8a3836c836a7daed39a63a7822ecb38988cebebf30c343`.
Final draft SHA-256
`af75d19d28c412cbea76a2402e4d1f596c6983d485aefbe91f07264fe7b4b123`.
