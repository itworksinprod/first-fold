# Local-model preview (no paid inference)

This is an explicitly requested private test, not an unattended replacement for
the daily Cloudflare workflow. The Mac performs research and drafting; GitHub
checks the exact candidate again and sends it through the existing Resend
configuration. Email credentials never move to the Mac. The recipient does not
change, and no public edition or daily delivery-ledger entry is created.

## Local runtime

The task-local installation uses official Ollama 0.34.0 and `qwen3:30b-a3b`
(Q4_K_M, approximately 18.6 GB). The release downloads were checked against their
published SHA-256 digests, the macOS app signature verified, and Ollama verified
the model digest before installing it. Runtime/model files live outside this
repository, in the sibling `first-fold-local-runtime` directory; do not commit
them.

The installed model digest is
`ad815644918f0eaab341c12b67837cc6dd4562342cdaf118f83d5d554cb37226`.
Its local metadata identifies a Qwen3 Thinking model. The adapter pins reasoning
on and uses temperature 0.6, top-p 0.95, top-k 20, min-p 0, and repeat penalty 1;
it does not inherit the cloud writer's low-temperature settings. See the
[official Qwen sampling guidance](https://huggingface.co/Qwen/Qwen3-30B-A3B/blob/main/README.md).

The server listens only on `127.0.0.1:11434`, with cloud features disabled and one
parallel request. No tunnel, public endpoint, login service, or scheduled local
job is installed. The Mac must be awake and the server running for inference.
Local inference does not consume Cloudflare or OpenAI API credits; it does use
the Mac's memory, disk, and electricity.

## Research and validation

`scripts/automation/local-paper.mjs research OUTPUT_JSON` fetches the reviewed
feed list and eligible publisher pages. This mode uses curated live feeds, not
Tavily or unrestricted web search. It preserves the 70-point selection threshold
and the originating-source/independent-corroboration distinction.

`scripts/automation/local-paper.mjs draft RESEARCH_JSON OUTPUT_JSON` requires a
research snapshot less than one hour old. Each selected story receives an
isolated claims-only draft, one early factual audit when the deterministic checks
pass, at most one claims-only repair, a four-field copy refinement that cannot
change the checked claims, and one separate final semantic review. The early
audit is never repeated to obtain approval. There is a maximum of 20 calls and
240,000 requested output tokens across
four stories, including the local model's reasoning. Only final structured
answers are retained; model responses must finish normally and match the JSON
contract. Each inference call has a five-minute deadline.

All selected stories must pass exact-passage citation checks, numeric and caveat
checks, originality and reader-prose checks, semantic review, canonical edition
validation, and live source-link QA. Failure does not create a sendable candidate
or substitute generic fallback prose. Parsed diagnostic inputs/outputs stay in
private local files; they contain untrusted public-source text, not credentials
or model reasoning. Automated approval is not a guarantee of factual accuracy;
inspect the real preview and its cited evidence before relying on it.

## One-time email handoff

The `Send requested local-model paper preview` workflow accepts bounded,
compressed public-news JSON and its exact SHA-256 digest. It requires the owner,
`main`, the dedicated confirmation, and the original dispatch attempt. Before
email credentials are available it runs tests and rechecks the candidate,
publisher allowlist, source links, and time window. Sending performs the checks
again and uses a separate idempotency key. It does not automatically retry a
send.

Dispatch inputs are read from GitHub's bounded event file, not injected into the
runner's printed step environment. The reversible payload is masked before
ordinary output. This is not encrypted secret storage: the payload must contain
only public-news content, never personal data, credentials, local paths, or
private diagnostics. No candidate artifact or public edition is published.

The current grant remains specifically for the September 13, 2026 preview. Carlos
explicitly extended the one-time test through September 14 Eastern: the allowed
interval starts September 13 at 04:00 UTC and ends exclusively September 15 at
04:00 UTC. The edition date, original confirmation, revision, recipient and
idempotency key are unchanged; this does not create a September 14 daily paper.
The workflow fails closed after that deadline. A later preview or a recurring local fallback needs a separately
reviewed authorization and operational design; do not bypass the date checks or
present this one-time test as a working daily local schedule.

An accepted Resend API request is not proof of inbox delivery. Confirm the
delivery event or the recipient's receipt separately.
