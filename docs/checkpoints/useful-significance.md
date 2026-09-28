# Step 2 — useful significance, isolated saved-article experiment

Status: implemented locally; live and exact editorial review pending. Step 1 is
closed only for the [accepted saved MIT draft](plain-language-accepted-2026-09-27.md).

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
