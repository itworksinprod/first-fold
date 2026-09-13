# Free source discovery review — September 12, 2026

## What changed

The private paper already uses Tavily for web discovery and Cloudflare Workers
AI for bounded synthesis. The model does not independently browse the web:
the application searches, verifies publisher pages, and gives the model a
bounded evidence packet.

Search now explicitly filters to the reviewed registry's article hosts. The
September 12 daily run returned 49 search leads, but admission rejected 40 as
unreviewed or unsafe URLs. Targeting reviewed hosts addresses that mismatch
without purchasing more search capacity. It does not guarantee that returned
pages are fresh, relevant, or correct. Exact-host ownership, public-DNS pinning,
publication metadata, article extraction, editorial score, vetoes, and repeat
checks remain authoritative.

All reviewed hosts are available to every desk's query so a desk-specific
filter does not accidentally hide independent or cross-topic reporting.
Unknown publishers are not automatically promoted from search results.

## New reviewed feeds

Live checks used the existing bounded HTTPS feed client and parser. These
measurements describe the checks, not a recurring uptime guarantee.

| Source | Official endpoint | Observed parser result | Coverage and limitation |
| --- | --- | --- | --- |
| Ollama | <https://ollama.com/blog/rss.xml> | HTTP 200, no redirects, 28,887 bytes, 58 dated items | Local-model runtime, compatibility, and integrations; sparse publication cadence |
| OpenRouter | <https://openrouter.ai/blog/feed.xml> | HTTP 200, no redirects, 61,212 bytes, 80 dated items retained from 124 raw entries by the existing parser cap | Model gateway/API capabilities and developer tools; many tutorials and promotional posts must still be rejected |

Only `ollama.com` and `openrouter.ai` respectively are approved feed/article
hosts for these entries. They are originating accounts of their own services,
not independent verification of another company's model capabilities or
benchmark claims. A working feed never grants every item a place in the paper.

For the 72-hour window ending September 12 at 05:00 Eastern, Ollama had zero
eligible items; OpenRouter had four date-eligible tutorials/insights, not four
verified news stories. This expansion therefore improves future discovery,
not a demonstrated increase in today's qualifying stories. OpenRouter's
observed feed timestamps use midnight UTC; do not describe them as precise
launch times.

OpenRouter's [August 19 announcement](https://openrouter.ai/blog/announcements/openrouter-is-joining-stripe/)
described a Stripe transaction subject to closing conditions. Closure was not
verified in this review. No Stripe publisher is currently admitted separately;
review common ownership before adding one or claiming independent
corroboration between those organizations.

## Sources deliberately postponed

The [VS Code Atom feed](https://code.visualstudio.com/feed.xml) returned HTTP
200 and 42 entries, but no item supplied a first-publication timestamp. The
existing parser correctly admitted zero entries because `<updated>` is not
proof of first publication. One entry also had a future modification date.
Do not weaken date rules to make this source pass. VS Code and GitHub also
share Microsoft's publisher identity and would not corroborate each other.

Sampled Mistral pages had promising bounded article text and publication
metadata, but a separate search-only publisher review was not completed.
Sampled Anthropic pages lacked the required publication metadata, and one
exceeded the article body limit. Neither publisher was newly allowlisted.

The existing eight-source shadow trial remains separate and unchanged. This
change does not restart it or promote any of its sources.

## Cost and validation boundaries

- No new service, model call, or paid fallback. Existing account and key
  configuration is reused.
- At most 12 advanced Tavily searches and 24 reserved credits per run; cached
  research retries do not spend those credits twice. The dedicated provider
  key cap remains 900 monthly credits and PAYGO must remain disabled.
- The reviewed catalog grows from 46 to 48 feeds. The 1 MB per-feed, 10 MB
  aggregate feed download, 320 retained feed-item, and 24 article-fetch limits
  remain unchanged. Source-fair retention keeps a high-volume new feed from
  consuming the entire item budget.
- The search request's serialization cap alone grows to 4,096 bytes to fit
  the fixed domain array plus a maximum-length query. Response and query-count
  limits do not change.
- No email, recipient, schedule, public edition, editorial threshold, global
  score weight, or existing hard veto changes.

Tavily documents [domain filtering](https://docs.tavily.com/documentation/api-reference/endpoint/search)
and [1,000 free monthly credits, with two credits per advanced search](https://docs.tavily.com/documentation/api-credits).
One full run each day reserves at most 744 credits over 31 days; manual tests and other
runs share the remaining capped allowance. Account-wide use can consume that
allowance sooner, so billing guards and disabled PAYGO remain essential.

The implementation has offline regression coverage for request targeting,
injection resistance, strict local admission, source identity, parsing, and
fairness. A live before/after search-yield comparison has not been performed;
do not claim a measured improvement in story count or paid-model parity.
The recent Workers AI unavailability is a separate unresolved provider/account
issue: stronger discovery does not by itself restore model-written summaries.
