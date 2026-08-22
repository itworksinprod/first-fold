# Free Morning Press pilot

The free pilot is a separate research experiment. It does not replace, modify, or automatically fall back from the paid Morning Press workflow.

| Path | Paid production pilot | Free research pilot |
| --- | --- | --- |
| Research model | OpenAI `gpt-5.6-luna` | Fixed Cloudflare Workers AI `@cf/openai/gpt-oss-120b` |
| Discovery | Model-assisted web research | A bounded allowlist of curated RSS, Atom, and JSON feeds |
| Start | Cloudflare's 5:05 AM New York dispatch or a permitted manual run | Manual GitHub Actions run only |
| Output | A publication-shaped candidate pull request | A separate comparison pull request containing `content/free-candidates/YYYY-MM-DD.json` |
| Publication authority | Existing exact-SHA review and merge gates | None |
| Delivery | Existing 6:00 AM delivery workflow | Never |

The paid workflow in `.github/workflows/morning-research.yml` remains the production candidate generator. Its Cloudflare schedule, OpenAI secret, candidate branch, approval rule, and delivery path continue unchanged. The free workflow lives in `.github/workflows/free-morning-research.yml`; it uses the branch prefix `experiment/free-morning-press-`, label `free-morning-press-pilot`, candidate status `first-fold/free-morning-press-candidate`, and a separate output directory so it cannot be mistaken for a production edition.

## What the free pilot does

The pilot:

1. Reads only the project's checked-in, 17-source manifest. Twelve first-party or regulator feeds cover AI research and releases, developer tools, security advisories, cloud platforms, and competition policy. Five reviewed independent outlets—Ars Technica, The Verge, TechCrunch, BleepingComputer, and WIRED—supply a bounded corroboration pool representing four controlling publisher identities; Ars Technica and WIRED share one identity.
2. Fetches and normalizes eligible feed items inside the edition's reporting window. Only an item's first-published timestamp qualifies; a later `updatedAt` value does not invent a material update.
3. Deduplicates and ranks those items before the model call. Publisher aliases under the same controlling organization collapse to one reviewed publisher identity—for example, the Google family is one publisher, and GitHub and Microsoft are one publisher.
4. Requires every non-quiet story dossier to contain at least two distinct factual article URLs controlled by two distinct reviewed publisher identities. A feed endpoint is retained only as context and provenance; it never counts as corroboration for its article.
5. Sends only the normalized feed titles, summaries, dates, and URLs from those closed-world dossiers to Cloudflare Workers AI for selection and drafting. It does not download or show article bodies to the model.
6. Applies strict schema, dossier-to-citation binding, and no-redirect reachability checks. The generated copy cannot introduce a citation URL that was absent from its exact input dossier. These checks are structural; they do not establish that a reachable article supports the generated claim.
7. Writes a comparison candidate to `content/free-candidates/YYYY-MM-DD.json` and uploads the exact candidate as a run artifact from a read-only research job.
8. Downloads and revalidates that artifact in a separate staging job, which has GitHub write permission but receives no Cloudflare AI token, then opens the comparison pull request.

It does **not** add a canonical file under `content/editions/`, approve a candidate, merge to `main`, deploy GitHub Pages, or dispatch the production delivery workflow. A free-pilot result is research material until a human deliberately evaluates it.

When every desk has usable parsed-feed coverage from at least two controlling publisher identities but no event clears the two-publisher evidence rule, the pipeline creates a deterministic all-quiet preview without calling Workers AI. If any desk falls below that coverage floor, the run fails before writing a candidate file. An HTTP `200` response containing zero valid allowlisted entries does not count as a successful feed. This distinction keeps a genuinely quiet news window separate from missing research coverage.

## Independent daily reporting window

Every free candidate covers one complete New York local day: from **5:00 AM on the previous `America/New_York` calendar date, inclusive, through 5:00 AM on the edition date, exclusive**. The boundary is calculated in the named timezone, so it remains correct across daylight-saving changes.

This free window never inherits the latest paid edition's cutoff. Weekend and Monday free runs therefore remain one-local-calendar-day editions instead of expanding to cover days skipped by the weekday paid schedule.

## One-time Cloudflare setup

The GitHub workflow calls Workers AI through Cloudflare's REST API. It needs an account ID and a narrowly scoped API token; it does not need the OpenAI API key.

1. In the Cloudflare dashboard, open **AI → Workers AI** and choose **Use REST API**.
2. Choose **Create a Workers AI API Token**. Use Cloudflare's Workers AI token template, or create a custom account token with only **Workers AI Read** and **Workers AI Edit**.
3. Copy the token when Cloudflare displays it. Treat it like a password and never paste it into an issue, pull request, candidate file, or terminal output shared with someone else.
4. Copy the **Account ID** shown on the same Workers AI REST API page.
5. In GitHub, open `itworksinprod/first-fold` and go to **Settings → Secrets and variables → Actions**.
6. Under **Secrets**, create `CLOUDFLARE_AI_API_TOKEN` and paste the token as its value.
7. Under **Variables**, create `CLOUDFLARE_ACCOUNT_ID` and paste the account ID as its value.

The free workflow fixes the model to `@cf/openai/gpt-oss-120b`; there is no model override to configure. This prevents an accidental switch to a paid-only model from weakening the zero-dollar guardrail.

Cloudflare's official [Workers AI REST API setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/) describes the same credentials. The token is stored only as an encrypted GitHub Actions secret and must never be committed to this repository.

## Run one comparison manually

1. Open the repository's **Actions** tab.
2. Select **Prepare free Morning Press comparison**.
3. Choose **Run workflow**, leave the branch set to `main`, and start the run between 5:00 and 5:59 AM `America/New_York`. The manual window is available every day, including weekends. The workflow uses the current New York edition date and does not accept a custom date.
4. Open the completed run and review its summary and logs. A successful run uploads an artifact named `free-morning-press-<run-id>-<date>-<sha>` and opens a comparison pull request from `experiment/free-morning-press-<date>`.
5. Open and read both cited article pages for every non-quiet story, then independently verify every material claim, attribution, date, and caveat. A passing link check means only that the URL was reachable; it is not evidence that the draft is true.
6. When a paid candidate exists and its reporting boundaries match exactly, compare the two results directly. After a skipped paid day or weekend, the paid candidate may span a longer window; compare topic choices and output quality, but do not treat differences in story coverage as a like-for-like recall test. On a day without a paid candidate, review the free result on its own. Check every desk assignment, omission, and quiet-desk decision manually.
7. Record the comparison result and close the free comparison pull request without merging it. Merging is neither required nor part of this pilot.

For a trusted local or test invocation, the generator entry point is:

```bash
npm run edition:free -- YYYY-MM-DD
```

The script requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_API_TOKEN` in its environment and accepts only the fixed `@cf/openai/gpt-oss-120b` model. It also enforces trusted GitHub run metadata and the 5:00–6:00 AM New York generation window, so the GitHub workflow is the supported way to run a real comparison; direct invocation is primarily for controlled testing. Do not put credentials in a `.env` file that could be committed. A local output is still a non-publishing experiment candidate.

## Cost guardrail

Keep the Cloudflare account on the **Workers Free** plan for this pilot. Cloudflare currently includes 10,000 Workers AI neurons per account per day at no charge and resets that allowance at 00:00 UTC. On Workers Free, reaching the daily allowance makes later inference requests fail with an account-limited error; it does not silently continue as billable usage. The pipeline treats that response as a failed experiment and does not create a publishable edition.

This guarantee depends on the account remaining on Workers Free and on using a model available to that plan. Do not upgrade the Workers plan, enable prepaid AI Gateway credits, or change to a paid-only model if the goal is a hard zero-dollar pilot. Check the current [Workers AI pricing and free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/) before changing models because model availability and limits can change.

A failed run is safe:

- The existing paid workflow is unaffected.
- The prior public edition remains live.
- No incomplete free candidate is promoted into `content/editions/`.
- No retry should bypass validation or switch automatically to the paid OpenAI path.

## What to compare

Run the paid and free paths across several editions. Use strict story-discovery comparisons only when their reporting boundaries match exactly; otherwise record the different windows and compare editorial choices and output quality. Score them independently on:

- consequential stories found;
- important stories missed;
- source authority and date accuracy;
- duplicate-event and desk-assignment accuracy;
- factual corrections needed;
- headline, summary, and practical-value quality;
- quiet desks used honestly; and
- editor time required before approval.

Do not judge the free pilot only by how polished its prose sounds. The more important question is whether its narrower discovery method consistently finds the right developments and represents the cited evidence faithfully.

## Known limitations

- **Narrower discovery.** Curated feeds cover known publishers well but can miss a consequential development that appears elsewhere first. The free path has no general open-web search step.
- **Conservative event matching.** The deterministic matcher intentionally favors false negatives over combining unrelated stories. Without a strong shared identifier, materially similar headlines that paraphrase the same event may fail to form a corroborated dossier and leave the desk quiet.
- **Feed inconsistency.** Publishers can delay entries, omit useful summaries, change formats, block automated requests, or publish timestamps that do not reflect a material update. Each desk needs usable parsed feeds from at least two controlling publisher identities; an empty or invalid `200` response is a failed feed. Falling below that floor fails the run as insufficient corroboration coverage, while adequate coverage with no qualifying event produces an honest quiet desk.
- **Late feed arrival.** Eligibility uses the item's first-published time and the exact daily 5:00 AM–5:00 AM New York window. If a publisher adds an older eligible item to its feed only after that window closes, the pilot can miss it because there is no overlap or persistent free history yet.
- **Narrower corroboration.** The source pool is intentionally bounded and remains first-party-heavy despite its five reviewed independent outlets, which represent four controlling publisher identities. A feed URL is context only, and two brands controlled by one organization still count as one publisher. If two distinct reviewed publishers do not supply factual article pages for an event, that desk stays quiet.
- **No article-body research.** The model drafts from normalized feed titles and summaries. Link QA checks reachability and exact dossier binding, not the semantic contents of the article page. A human must open and read both cited pages before trusting, judging, or reusing any claim.
- **No persistent free-selection history yet.** Comparison pull requests are closed without merging, so yesterday's free selections are not available as canonical deduplication history. Nonoverlapping daily first-published windows reduce repeats, but a different publisher can reintroduce the same event on a later day. Reviewers must flag and score cross-day duplicates manually. Persistent free history is a later milestone, not a hidden capability of this pilot.
- **Model variability.** Workers AI can still return malformed, incomplete, repetitive, or poorly reasoned copy. Deterministic validation catches structural failures, not every editorial or factual error.
- **Shared daily quota.** Other Workers AI activity in the same Cloudflare account consumes the same daily free allocation. Capacity and rate-limit failures are also possible before the quota is exhausted.
- **Quiet editions are expected.** When the source pool contains too little eligible evidence, the correct result is a quiet desk or a failed experiment—not filler.
- **No automatic publication.** Even a strong free result remains outside the production approval and delivery chain during this pilot.

The free path should earn broader responsibility only after repeated side-by-side review shows that it is accurate, useful, and predictable. Until then, paid Morning Press remains production and the free pilot remains a manual comparison tool.
