# Free Gemini writer qualification — opt-in, not activated

This adds a separate Google Gemini adapter and a manual qualification workflow.
It does **not** switch the daily paper, run live news discovery, send email,
publish a paper or establish parity with a paid writer. Mock tests establish
code behavior, not model quality. No successful live Gemini result has yet been
recorded for this implementation.

## Free account requirement

Create a key in [Google AI Studio](https://aistudio.google.com/api-keys) in a
project whose tier is **Free**, with **no linked billing account**. Save it as
the repository Actions secret `GEMINI_API_KEY`. Never commit it or paste it in
a task, report or issue. Free-tier content may be used to improve Google's
products; this test supplies only offline public-source/synthetic evidence,
not a recipient address or private paper.

The key inherits the project's billing status. Code and an operator's
confirmation cannot independently verify or disable billing. Confirm the
project status before each test; do not run this workflow with a paid project.
Do not link billing to overcome a quota failure.

Sources checked September 16, 2026:
[pricing](https://ai.google.dev/gemini-api/docs/pricing),
[billing](https://ai.google.dev/gemini-api/docs/billing),
[rate limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[generateContent API](https://ai.google.dev/api/generate-content).

## Boundaries

- Pinned provider/model: `google-gemini` / `gemini-3.8-flash`.
- One fixed HTTPS endpoint; key only in the request header; no redirects.
- No built-in Google Search, tools, caches, paid fallback or provider switching.
- At most five requests, each allowing 8,000 output tokens and 180 seconds.
  No retry loop. A quota or transport failure stops the sequence.
- 80 KB request and 120 KB response limits; structured JSON only; incomplete
  output is rejected. Provider errors, reasoning and keys are never logged.
- Strict existing citation, prose, attribution, originality and word-count checks.
  No threshold changes. The provider's schema constraint is not a substitute
  for the local validator or factual review.

Free quotas depend on the project. A fixed request allowance is not a promise
that its free quota will accommodate this test. Stop if the allowance is exhausted.

## Manual test after publication to main

1. Open Actions → **Test free Gemini writer (no email)**.
2. Choose `main`. Re-check the Google project's Free status and disabled billing.
3. Enter `FREE PROJECT BILLING DISABLED` and run once.
4. Inspect the sanitized `gemini-qualification` artifact. Do not repeatedly rerun
   to obtain a passing verdict. A new attempt needs a reason and retained evidence.

The workflow permits only the repository owner, trusted `main`, and a first
run attempt. It has read-only repository permissions. Only its model step
receives `GEMINI_API_KEY`; it receives no mail or other provider credentials.
The artifact expires after one day and contains only verdicts, counts, hashes
and allowlisted failure codes—not drafts, source passages or keys.

The same manual harness can run locally only if the key is securely supplied
as `GEMINI_API_KEY` and the exact confirmation is supplied as
`GEMINI_FREE_PROJECT_CONFIRMATION`:

```sh
node scripts/automation/check-gemini-writer.mjs --qualification-only
```

## What must pass

Three fixed batches evaluate eight known regression cases: accurate controls,
swapped security conditions, unsupported model compatibility, hypothetical
examples presented as measurements, invented safety benefits, research
misrepresented as a product release, and generic filler. Expected answers and
case labels never go to the model. Both false approvals and false rejections
fail qualification; the recorded verdicts are not rewritten.

Only after those pass does the writer create two new summaries from supplied
evidence. Every summary must pass existing deterministic validation and a
separate semantic review call. All requested summaries must pass. Nothing is
emailed, even if the final report says `passed`.

These are known regressions, not unseen evaluation data. A successful report
would justify a fresh real-news preview and human review, **not automatic
production activation**. Another call to the same model is not an independent
publisher or a guarantee of factual accuracy. Daily integration still needs
truthful Gemini provenance, a bounded daily budget, review of a full current
paper, and a separately authorized delivery test to the unchanged recipient.
