# Separate free Flash-Lite experiment

Carlos authorized this alternative after four Gemini 3.8 Flash qualification
attempts failed with provider unavailability. It does not activate a daily writer.

The manual `gemini-lite-quality-check.yml` workflow first makes one 512-output-token
availability request to the explicitly allowlisted `gemini-3.5-flash-lite` model.
Failure stops immediately, including quota errors. Success runs the same eight
regression cases and two write/review controls used for Gemini 3.8, with unchanged
prompts, expected verdicts and editorial validation. Maximum: six requests and
40,512 requested output tokens. No automatic retry or model fallback exists.

The existing Gemini 3.8 workflow and default model are unchanged. Both workflows
share a concurrency group. Model identity, fixed HTTPS endpoint, response version,
request hashes, JSON format, output limits, and billing confirmation remain checked.
Only sanitized diagnostic receipts are retained. No email or live news is generated.

Verify the actual Google project still shows Free tier before running; the caller's
confirmation is not independent API proof of billing status. Google's current
[pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) lists
free standard input/output, but not free Google Search grounding. This test uses no
search tools. [Model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
lists structured outputs. Neither published availability nor passing local tests
proves live service access, useful news quality, or successful delivery.
