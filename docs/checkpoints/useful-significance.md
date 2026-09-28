# Step 2 — useful significance, isolated saved-article experiment

Status: **accepted for the exact saved sample** after live and independent
full-text review; see the [completion receipt](useful-significance-accepted-2026-09-27.md).
The earlier attempts below remain rejected. Step 1 is closed only for the
[accepted saved MIT draft](plain-language-accepted-2026-09-27.md).

## Predeclared change and acceptance criteria

The `saved-useful-significance` mode may prepend **one sentence of at most 40
words** to Why it matters. Every accepted sentence, its relative order, the other
sections and the headline remain byte-identical. Total body length stays
110–225 words. There is no minimum introduction length and no padding target.

The new sentence must explain a relevant audience/application and a concrete
stake, not merely repeat mechanics. Only saved MIT passages S1P2, S1P6, S1P10
and S1P11 authorize new context: mandatory requirements, potential usefulness
where strict limits matter, and the hypothetical robot-path example. Potential
benefits must be attributed; hypothetical situations remain hypothetical.
No deployment, guaranteed safety, prevented injuries, adoption, cost savings,
instructions to readers, or invented consequences may be inferred. Internal
generated candidates must not be confused with actions of a physical robot.

The editor receives the accepted article as reading context, not as evidence
for new claims. It returns only a hash-bound add/abstain decision and the new
sentence. It cannot return replacement article text. Shape/length/originality
failures and abstention hold the experiment; there is no alternate prose fallback.
Sentence segmentation is mechanical containment, not a proof of grammar.

## Checks and limits

The new private packet is pinned to SHA-256
`34c8da8fe843e7685efea7309e5de3a2e01370bb0efe2d28f708184cb09f3950`.
It contains the accepted text and saved source excerpts, not credentials.
The loader checks this exact packet before inference; the workflow exposes it
only for this mode. Legacy packets, prompts and experiments are unchanged.

One existing Cloudflare GPT-OSS editor request (2,400 maximum output tokens)
is followed by the same four Llama source-review field checks (600 each):
**five single-attempt calls, 4,800 requested output tokens maximum**. This is a
request ceiling, not a claim of actual usage or guaranteed free quota availability.
No retries, new provider, paid fallback, research, email, recipient change,
production integration, billing change or schedule change occurs. Quota errors
hold without retry. Only encrypted diagnostics are retained publicly, for one day.

The old sentences are preserved by exact identity; the new proposition is
**not** described as equivalent to absent text. The strict legacy bidirectional
meaning reviewer is neither changed nor repurposed to approve additions.
All four assembled fields undergo the unchanged source-support policy, with
the same supplementary-source scope as Step 1. The introduction's supporting
citation IDs must belong to the four-passage inventory. Citation membership
does not establish scoped entailment: independent full-text review must check
every new assertion against those passages, retained meaning in context,
naturalness and practical usefulness before acceptance.

A green automated result remains `draft-awaiting-manual-review`. The source
reviewer is experimental, not generally qualified. This manually scoped saved
sample does not demonstrate fresh discovery or an unseen automatic writer.
Step 3 (meaningful watch guidance), daily production and delivery stay separate.

## First live trial — held, not accepted

[Run 36365028473](https://github.com/itworksinprod/first-fold/actions/runs/36365028473)
on `d0d5850dc218c29988d8322651c3d232a545be05` stopped with
`SIGNIFICANCE_SCOPE_REJECTED`. The source reviewer approved the added sentence
but cited S1P1 and S1P5 alongside S1P10, outside the predeclared inventory.
The gate correctly stopped after four calls (4,200 requested output tokens);
Why it matters is absent from passed fields. No email or accepted addition.
Artifact ID 10947126512, 43,254 bytes, ZIP SHA-256
`c499a0b50495eb0238090adde654eab083588030487200919ed531660cd70fb9`.
Local capture SHA-256
`c93fdef64747959d8e2a9aa04b8d21b2ca9ea4132911b4e894fd09c2dc2594f6`.
Independent exact-text review also held the addition: it repeated compliance
rather than explaining concrete stakes, attributed an inferred beneficiary to
the source, and risked conflating a generated plan with physical safety.
The accepted 150-word baseline remains unchanged; this 170-word trial is rejected.

The follow-up tightens instructions: Why's first claim is explicitly restricted
to the same four passages, while retained claims keep their existing evidence.
The complete provider request hash binds this instruction. Source schema,
underlying support policy, post-check and call/token ceilings are unchanged.
The editor is also told not to turn potential usefulness into a promise of safe
real-world actions, to use the source's hypothetical stakes, and not to invent
a named beneficiary. This changes neither allowed evidence nor acceptance criteria.

## Second live trial — automated pass, editorial rejection

[Run 36365346026](https://github.com/itworksinprod/first-fold/actions/runs/36365346026)
on `dc048fb8813b9e8649a7d2fcf565b9aeda2c77f1` completed five calls and all four
automated source checks. Offline captured-payload/request replay and exact
baseline identity passed; the assembled draft was 182 words. **Primary editorial
review and independent review reject the addition:** it explicitly converted hypothetical stakes into
a safety guarantee. The source reviewer incorrectly approved that claim using
S1P10/P11. This is a documented false positive, not accepted prose or proof of
reviewer reliability. No email or production change occurred.

Artifact ID 10947212598, 54,565 bytes, ZIP SHA-256
`5fa126813d40b364a25f9872ff270e22ccb8bdf90973606b13ebea0adf4a4d91`.
Local capture SHA-256
`dad4e825786508203940754398d970fbbdf75bfbfd64eb731488ab51116d9e79`.
Rejected draft SHA-256
`144a44b87e7f7d60b722e30dd1a225a7697d2c558d5c601784e6e4db0dc44f63`.

The next experiment narrows the introduction to **problem context and hypothetical
stakes only**, with no method-behavior, achievement or safety-benefit assertion.
The locked paragraph already describes the method. A conservative local veto
blocks assurance terms (guarantee/ensure/prevent/eliminate variants, including
Unicode compatibility spellings) before review. It is an observed-regression
guard, not a semantic classifier or a substitute for independent inspection.
The Why reviewer is reminded that evidence of a problem does not prove a method
avoids that problem. Allowed evidence, identity, source policy, token/call limits
and mandatory full-text review remain unchanged. No rejected prose is reused.
The exact rejected local editor response is now vetoed before any source call;
its full text remains private. Synthetic inflection/Unicode regressions are in
the public tests. All 1,597 local tests passed before the next preflight.
