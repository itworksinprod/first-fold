# First Fold

**A six-minute morning paper for people who work with technology.**

First Fold is a small, newspaper-inspired daily briefing for technology professionals, managers, builders, defenders, and serious technology users who want to understand what matters without opening an endless feed. Every morning, it presents **at most one consequential story from each of four permanent desks**:

- AI & Models
- Work & Tools
- Security & Privacy
- Platforms & Power

The interface borrows the ritual and pacing of a folded newspaper—masthead, sections, columns, and page turns—while keeping the reading experience accessible on phones, keyboards, touchscreens, and reduced-motion displays.

This repository contains the **First Fold MVP**: a deterministic, fixture-backed edition that demonstrates the product, editorial contract, archive, and reading experience without requiring live news or AI credentials. One canonical JSON document is the source of truth for each issue; the build validates it and derives every browser-facing edition and archive artifact from it.

## Why this exists

Most news products optimize for how long a reader stays. First Fold optimizes for reaching the end.

The product has three constraints:

1. One finished edition is delivered each morning.
2. Each desk receives no more than one story.
3. A weak story never gets published merely to fill space.

The result should feel less like checking a feed and more like completing a calm, finite daily ritual.

## The four desks

The desks are defined by the reader question each story answers, not merely by the company or technology named in its headline:

- **AI & Models — What became possible or better understood?** Model capabilities, consequential releases, research, safety, and governance belong here. An ordinary product feature does not qualify just because it uses AI.
- **Work & Tools — What should I change about how I work?** Meaningful workflow changes, productivity tools, workplace policy, labor effects, and evidence of enterprise adoption belong here. Routine feature announcements do not.
- **Security & Privacy — What risk requires attention or action?** Exploited vulnerabilities, breaches, identity, surveillance, privacy, and proportionate defensive decisions belong here.
- **Platforms & Power — Who controls the systems, access, and rules?** Chips, cloud infrastructure, operating systems, app stores, developer platforms, antitrust, and digital regulation belong here.

Editors assign an overlapping story according to its primary consequence for the reader. The same underlying event cannot fill two desks, and the broad subject of “technology” is the paper's scope rather than a catch-all fifth desk.

## The morning edition

All editorial times use the IANA timezone `America/New_York`, including daylight-saving changes.

- **5:00 AM ET — editorial cutoff.** The normal edition covers material developments after the previous edition's cutoff and at or before this cutoff.
- **5:00–5:20 AM — verification.** Supporting sources may be retrieved to verify an eligible development.
- **5:20 AM — research lock.** The candidate set closes for the normal edition.
- **5:30–5:55 AM — selection, copy lock, validation, and staging.** Stories, dates, citations, desk assignments, and layout are checked.
- **6:00 AM — publication.** A validated edition becomes public as one immutable release.

Ordinary developments after 5:00 AM roll into the following morning. A verified, time-sensitive security event may eventually use a separately labeled **Stop the Presses** bulletin; that exception is outside the MVP.

Every production run should use an idempotent edition key such as `2026-08-19@America/New_York`, so retries cannot publish the same issue twice.

## The quiet-desk rule

First Fold guarantees a page for each desk, not a mandatory story.

If no candidate clears the evidence and quality threshold, that desk prints:

> No edition-worthy development this morning.

This is a feature, not an error. It makes the absence of filler visible and protects the central promise: one story is the maximum, not the quota.

Promising developments that do not yet clear the story threshold may appear briefly in **Watch Next** on the back page. Watch Next is a small weak-signal list, not another desk and not a way to publish unsupported claims. It preserves the four-desk, six-minute edition while showing readers what the newsroom is monitoring.

## Run the fixture demo

### Prerequisites

- Node.js 20 or newer
- npm

### Local setup

```bash
cd first-fold
npm ci
npm run dev
```

Open the local URL printed by the development server, normally `http://127.0.0.1:4173/`.

Run the production build and test suite with:

```bash
npm run build && npm test
```

No environment variables or paid services are needed. The demo reads the canonical edition in `content/editions/`, validates it during the build, and serves derived JSON to the reader and archive. It does **not** crawl publishers, call a model, require an API key, or mutate production data.

For a fresh GitHub checkout, `npm ci` reproduces the lockfile exactly. Use `npm install` only when intentionally changing dependencies, and commit the resulting lockfile change. Generated output, local dependencies, logs, and environment files are ignored.

## Install the free app

First Fold is a Progressive Web App (PWA), so the same free GitHub Pages deployment can be installed without maintaining separate iOS, Android, macOS, or Windows projects.

- On supported Android and desktop browsers, use the **Install app** prompt above the paper.
- On iPhone or iPad, open First Fold in Safari, tap **Share**, choose **Add to Home Screen**, and tap **Add**. The site also shows these steps when viewed on iOS.
- Once installed, First Fold opens in its own app window and keeps the reader shell plus the last verified edition available offline.

Edition data is always requested from the network first. If the connection fails, a saved edition may be shown only with a prominent **Offline copy** label, its edition date, and when it was cached. An unavailable requested date never silently presents the bundled demo as that date, and reconnecting makes the reader check the latest archive manifest again.

The manifest, service worker, and icon URLs are relative, so installation works both at a domain root and at a GitHub Pages project path such as `username.github.io/first-fold/`. Each production build injects a content-derived cache version into the service worker; old First Fold caches are removed only after the replacement worker activates.

### Routes

| Route | Availability | Purpose |
| --- | --- | --- |
| `/` | Local and hosted | Opens the current fixture-backed morning edition. |
| `/?edition=2026-08-19#front` | Local and hosted | Opens a dated edition in the same finite reader; page hashes remain shareable. |
| `/archive/` | Local and hosted | Lists every validated edition from the generated archive manifest. |
| `/editions/2026-08-19.json` | Generated artifact | Reader-safe projection used by the newspaper, source dialog, and press-desk prototype. |
| `/editions/index.json` | Generated artifact | Archive manifest derived from all validated reader projections. |
| `/manifest.webmanifest` | Local and hosted | Install metadata for the standalone First Fold app. |
| `/service-worker.js` | Local and hosted | Versioned offline shell and network-first edition caching. |
| `/editor/` | Demo only | Prototype press desk for reviewing desk decisions, validation state, and the 6:00 AM pipeline. |

The press desk is intentionally not a production administration system. Its approve/reset control writes only to `localStorage` in the current browser; it cannot change the canonical edition, publish content, or affect another reader.

## Publish with GitHub Pages

The repository includes `.github/workflows/pages.yml`. On every push to `main`, GitHub Actions installs the locked project, runs the build-gated test suite, uploads `dist/client`, and deploys that static artifact to GitHub Pages. Relative asset and data URLs keep the demo working when it is hosted at a project path such as `username.github.io/first-fold/`.

After the first push, open **Settings → Pages** in the GitHub repository and choose **GitHub Actions** as the publishing source. You can also run the workflow manually from the Actions tab. A failed editorial validation or test prevents deployment.

The press desk is included in the portfolio demo so visitors can inspect the concept. Its approval state remains isolated to their browser; it has no server-side authority.

## Architecture

The MVP has one editorial source of truth per issue:

```text
content/editions/YYYY-MM-DD.json        canonical edition
                 |
                 v
      canonical schema validation       fail the build on invalid content
                 |
                 v
      reader-safe edition projection    /editions/YYYY-MM-DD.json
                 |                       + source-revision SHA-256
                 |
                 +---------------------> /editions/index.json
                 |                        generated archive manifest
                 |
                 +--> finite reader
                 +--> public archive
                 +--> local-only press desk prototype
```

`scripts/edition-content.mjs` loads every canonical edition, enforces the runtime editorial invariants, creates a stable reader projection, and derives the archive manifest from those projections. The projection includes its canonical edition ID, projection version, validation result, and content digest so a displayed issue can be traced back to the exact source revision.

The canonical JSON is the only hand-maintained edition payload. Do not separately edit the projected edition, archive manifest, fallback reader copy, or files under `dist/`; the build regenerates artifacts from `content/editions/`.

Presentation stays downstream of that contract:

- The reader fetches the requested `/editions/<date>.json` artifact and renders six finite pages: front, four desks, and back.
- The archive fetches `/editions/index.json` and links each entry back into the same reader.
- The local press desk reads the same reader projection, so its desk, source, score, and validation views cannot drift into a second editorial dataset.
- Desktop page turns progressively enhance a mobile reading flow with keyboard navigation, accessible announcements, and reduced-motion support.
- The back page closes the edition with a practical next step and a bounded Watch Next list; it does not continue into an open-ended feed.

The production pipeline is designed to replace only the fixture input:

```text
Curated RSS feeds and permitted APIs
        |
        v
Normalize dates and canonical URLs
        |
        v
Cluster duplicate coverage and prior-edition events
        |
        v
Deterministic eligibility and shortlist rules
        |
        v
Bounded, source-grounded editorial selection
        |
        v
Citation, date, duplicate, and schema validation
        |
        v
Canonical edition JSON
        |
        v
Build-time validation --> reader projection + archive artifact --> First Fold renderer
```

The renderer never calls news or model APIs per visitor. A daily job will eventually produce one canonical edition; the build then emits validated, cacheable artifacts that the public site only reads and renders.

### Edition contract

A valid edition must satisfy these invariants:

- It has exactly the four known desks—AI & Models, Work & Tools, Security & Privacy, and Platforms & Power—with no duplicate desk.
- Each desk contains zero or one selected story.
- An empty desk contains the standard quiet-desk message.
- The same underlying event cannot appear in more than one desk.
- Every story records its primary entity, AI adjacency, maturity, and desk-fit rationale.
- No edition contains more than two AI-adjacent stories.
- Repeating a primary entity requires a specific front-page diversity exception.
- Watch Next contains no more than three complete emerging signals.
- Every selected story has a canonical source URL and publication or update date.
- Material factual claims are traceable to supporting sources.
- An out-of-window continuing story is eligible only when it identifies a material update inside the window.
- Published editions retain their timestamp and version; later changes are recorded as corrections.

### Add or review an edition

1. Add one canonical file at `content/editions/YYYY-MM-DD.json`; use the existing edition as the shape reference.
2. Keep exactly the four configured desk keys. Set a desk's `story` to `null` and provide an honest `emptyReason` when nothing qualifies.
3. Record direct source URLs, evidence-to-source mappings, reporting-window timestamps, editorial classification, the selection rationale, and any material-update delta in that file.
4. Run `npm run build`. Invalid dates, duplicate events, weak scores, missing sources, unsupported claims, malformed quiet desks, and other contract failures stop artifact generation.
5. Run `npm test`, then inspect the edition at `/?edition=YYYY-MM-DD#front`, its archive card at `/archive/`, and the local review at `/editor/`.

The build-generated reader projection intentionally contains only what the public experience needs. Rich editorial evidence and provenance remain in the canonical source document.

## Editorial safety

First Fold is an editorial layer, not a republishing engine.

- Prefer official advisories, research, filings, documentation, and original announcements, with reputable independent reporting for context.
- Distinguish event time, publication time, and update time. A newly published article does not make an old event new.
- Collapse multiple articles about the same event into one story and assign it to only one primary desk.
- Treat company performance claims, allegations, and early reports as claims; add visible caveats or reject them when evidence is insufficient.
- Use direct source links and original summaries. Do not reproduce full articles, bypass paywalls, or assume an RSS item grants republication rights.
- Avoid publisher photography, logos, and feed images unless their reuse is expressly licensed.
- Treat all fetched text as untrusted input. It must never provide tool instructions, override editorial policy, or choose arbitrary network destinations.
- Label AI-assisted copy, preserve source provenance, and keep a visible corrections and takedown path before automating public editions.

The intended production selector uses deterministic eligibility gates before any model step. A model may help compare and summarize a bounded shortlist, but it is never the evidence and cannot invent missing facts or citations.

## MVP scope

Included:

- A complete four-desk sample edition
- One canonical edition JSON transformed into validated reader and archive artifacts
- Newspaper-inspired layout and navigation
- Finite reading progress
- Quiet-desk handling
- A bounded Watch Next back-page list
- Source and editorial-transparency surfaces
- A dated edition archive
- A local-only press-desk review prototype with device-local approval state
- Responsive and reduced-motion behavior
- Free home-screen installation on supported mobile and desktop browsers
- A versioned offline reading shell with explicitly labeled saved-edition fallback
- Deterministic tests against fixture content

Deliberately deferred:

- Live ingestion and scheduling
- Automated model-based selection
- Accounts, saved stories, comments, or recommendations
- Personalized desks
- Email or push delivery
- Advertising, engagement ranking, or infinite scroll

## Roadmap

1. **First Fold:** validate the visual ritual and reading flow with a fixed edition.
2. **Editorial engine:** connect the existing edition contract to a curated-source registry, normalization, deduplication, scoring, and replayable research fixtures.
3. **Morning press:** stage at 5:55 AM ET, publish atomically at 6:00 AM, and alert on missing or invalid editions.
4. **Archive depth and corrections:** grow the existing dated archive and add visible correction history, source suppression, and a rapid unpublish path.
5. **Reader refinements:** improve typography, accessibility, and completion cues while preserving the same four-desk, six-minute edition.
6. **Optional delivery:** add an accessible email edition or notifications only after consent, unsubscribe, privacy, and retention controls are in place.

The project should remain intentionally small enough for one person to understand, operate, and audit.

## Contributing

Issues and focused pull requests are welcome. Changes to selection behavior should include a fixture or test demonstrating the editorial rule they protect. Please do not add scraped article bodies, publisher images, API credentials, or real personal data to the repository.

## License and third-party content

The application code is available under the [MIT License](LICENSE).

That license does not grant rights to third-party articles, headlines, publisher marks, photographs, linked pages, or other source material. Those remain the property of their respective owners and are used only as allowed by the applicable source terms or license. Demo fixtures should use original or appropriately licensed copy, and production editions should publish attribution, links, and original summaries rather than archived article bodies.

“First Fold” is a working project name. Trademark, domain, package, and GitHub-name availability have not been cleared.
