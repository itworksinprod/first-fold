# September 21: source link repair and isolated review qualification

## Production link repair

Scheduled run [35581476593](https://github.com/itworksinprod/first-fold/actions/runs/35581476593)
failed in `Generate the private source-checked candidate`, with final source
QA reporting `LINK_REDIRECT_LIMIT` for `blog.google`. Delivery was skipped.
Drafting/semantic review also rejected the available summary; repairing the
link is not evidence that a complete daily paper now works.

The checked-in Google AI feed URL returned a 301 to
`https://blog.google/innovation-and-ai/technology/ai/rss/`. Feed discovery allows
bounded vetted redirects, but item context sources retained the configured old
feed address. Final source QA deliberately allows zero redirects. Commit
`979f18c` updates that one manifest address, not the redirect or quality policy.
A live call through the existing pinned transport, with `maxRedirects: 0`,
returned HTTP 200, no redirects and 20 parsed items, all bound to the direct
context URL. The full suite passed 1,221 tests before publication.

## Why the experimental reviewer is still isolated

The September 20 real-story diagnostic was green but manual inspection found
a factual clause supported only by an uncited passage, generic promotional
analysis and an unsupported connection to a separate metrics announcement.
That copy is not approved for delivery. No automatic policy, threshold,
recipient, schedule, billing or daily-writer switch is authorized by a green
unit test or synthetic model result.

The new `split-review-controls` mode is available only in the owner/main/manual
encrypted diagnostic workflow. It runs no research and has no email key.
It uses two calls, at most 1,800 requested output tokens each, the existing
Cloudflare model/endpoint and no retries or alternate provider. The
[Cloudflare model documentation](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)
and [free-allocation behavior](https://developers.cloudflare.com/workers-ai/platform/pricing/)
were checked; this work does not enable or modify account billing.

1. Citation review receives each claim with only its paired citations, not
   full dossiers or reader analysis. Other claims in the batch are explicitly
   not evidence. This separation reduces context confusion; it is not a
   guarantee of semantic correctness or isolation between batch entries.
2. Editorial review receives the exact whole draft and full source context,
   including uncited caveats. Its independent verdict cannot override a
   citation rejection. Exact draft and claim hashes bind both results.

Controls cover a valid joint citation, a missing citation whose fact exists
elsewhere, an unsupported metric-to-productivity connection and a branch-specific
vulnerability prerequisite swap. Expected labels are authored offline and
never included in requests. Blanket acceptance and blanket rejection both fail.

Run [35673341243](https://github.com/itworksinprod/first-fold/actions/runs/35673341243)
at `12e20a4` had valid response structure and correct final acceptance decisions
for all four cases: the positive passed and all three negatives were vetoed.
However, two cases incorrectly retained `factsSupported: true`, so the fixed
qualification correctly failed (2/4 exact case checks). No email was sent.

Commit `611cc2a` asks for factual verdicts separately for headline, deck, each
claim, analysis and next action. Aggregate factual approval is their conjunction;
no semantic result is guessed from keywords or silently corrected. Independent
attribution, analysis and usefulness flags are preserved. This change remains
experimental; the same control expectations, two-call cap and daily writer remain
unchanged. The complete suite passes 1,226 tests, including real CLI startup,
quota stop, encrypted output, strict binding, non-boolean rejection and per-field
veto tests.

Run [35673701838](https://github.com/itworksinprod/first-fold/actions/runs/35673701838)
at `611cc2a` passed 3/4 exact controls. It accepted the supported story, rejected
the uncited clause, correctly marked the invented metric relationship as both
factually and analytically unsupported, and rejected the swapped prerequisite
through its citation verdict. Its separate whole-story check still incorrectly
marked that last claim factually supported. Consequently qualification remains
failed, even though the final accept/reject decision was correct for every case.
No additional rerun, production promotion or email followed. Expected labels
were not changed to convert this partial improvement into a pass.

Encrypted artifact digests (checked against downloaded archives):

- `35673341243`: `e96c21a3adc4432f30347e61777ea8dfa7bb8db8ad79287f165416667371d4f0`
- `35673701838`: `4ea6f50eacbf05c1785018343060e455a80c7df85024a45a72d9fdd8a60fc54d`

## Remaining promotion gates

### Further isolated checks (September 21 evening)

- Run `35675534676` at `1adffbf` aligned exact draft fields with verdict keys.
  The public summary remained 3/4; it did not qualify.
- Run `35675821468` at `e55cfdd` isolated each whole-story review into its own
  request. Decrypted evidence confirms the same factual false positive on the
  swapped-condition claim, while the separate citation check rejected it.
  All final accept/reject decisions were correct, but exact qualification failed.
  Five requests shared a 3,600 requested-output-token ceiling; no email or search.
  Downloaded encrypted archive SHA-256:
  `a5b58690db4bf732f9a9ded5f9aa2f5fe1f0f407359e498923277b05dee5418e`.
- Commit `05c52dc` adds short, bounded per-field evidence comparisons to the
  isolated experiment only. Notes cannot override vetoes, change draft text,
  supply missing citations or enter the production approval object. Malformed
  notes fail closed. The fixed expected labels remain unchanged. The same
  3,600 output ceiling is divided into 1,200 citation tokens and four 600-token
  editorial checks. The supported `npm test` suite passes all 1,228 tests.

These repeated fixtures are regression controls, not unseen holdouts. Success
on them would not establish general reviewer accuracy or paper readiness.

Run [35676356821](https://github.com/itworksinprod/first-fold/actions/runs/35676356821)
at `05c52dc` completed all five requests within the unchanged 3,600 output cap,
with valid response structure, but again failed the swapped-condition case.
The decrypted claim1 evidence note merely says "Source details prerequisites";
it does not compare the contradictory relationships and leaves claim1 true.
This is a semantic review failure, not missing credentials, provider quota,
JSON parsing or an email delivery problem. The separate citation veto still
rejects that story; the broad review is not independently qualified.
Verified encrypted archive SHA-256:
`e29beb45fa78351b082c674a4cab385133e046aa2773f7080f1c5d9a81106efd`.

Do not retry this unchanged experiment hoping for a pass. The next design
should test narrow field-to-evidence entailment, including contradictory
uncited context, rather than trusting a broad story-level approval. Preserve
the fixed labels and include unseen controls before real-paper qualification.
No daily writer change, email, recipient change or billing change was made.

### Required before promotion

- Pass the fixed live controls with all required verdicts correct.
- Test previously unseen controls and the actual manually rejected story.
- Integrate into a bounded no-email real-story experiment without increasing
  the daily writing allowance or losing full-source caveat checks.
- Manually inspect fresh summaries, then qualify a complete paper before
  changing daily production or sending a new test email.
