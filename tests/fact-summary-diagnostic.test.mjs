import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { diagnoseFactSummary, validateFactSummary, normalizeClaimwiseSummary } from '../scripts/automation/fact-summary-diagnostic.mjs';
import { buildWorkersAiRequest, DEFAULT_CLOUDFLARE_AI_MODEL } from '../scripts/automation/free/workers-ai.mjs';
import { GENERIC_FACT_SUMMARY_PROMPT } from '../scripts/automation/free/generic-fact-summary-prompt.mjs';
import { PLAIN_LANGUAGE_COPYEDIT_PROMPT } from '../scripts/automation/free/plain-language-copyedit-prompt.mjs';
import { phraseCopyeditUnitsHash, PHRASE_COPYEDIT_PROTECTED_WORDS } from '../scripts/automation/free/phrase-copyedit.mjs';
import { buildSinglePhraseCopyeditView, SINGLE_PHRASE_COPYEDIT_LIMITS } from '../scripts/automation/free/single-phrase-copyedit.mjs';
import { buildIsolatedPreservationReview } from '../scripts/automation/free/isolated-preservation-review.mjs';
import { buildTextPreservationReview, exactTextPreservation } from '../scripts/automation/free/text-preservation-review.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
const excerpt = 'Synthetic evidence used solely for control-flow tests, not real factual qualification.';
const draft = {
  headline: 'Anthropic describes supervised research automation',
  whatHappened: 'Anthropic has published measurements of how it uses its own models in research. The company describes a category in which a system handles much of a task while a person remains responsible for supervision. This is different from a system completing research with nobody overseeing the work. The figures describe a particular reporting period and should not be presented as a measurement of the entire industry.',
  whyItMatters: 'The distinction matters because assigning work to a model does not remove the need for human judgment. The measurements offer a way to discuss different levels of delegation, rather than treating every use of an assistant as the same kind of automation. They remain the reporting company’s assessment, not an independent demonstration that the work is safer or more productive.',
  whatToWatch: 'Watch whether later reports explain their methods consistently and separate supervised work from autonomous activity. Comparing numbers from different organizations would require checking that they describe equivalent tasks and use compatible definitions. The current source does not settle those broader questions.',
};
const sheet = { sourceUrl: 'https://www.anthropic.com/institute/measuring-pace-of-ai-development', publisherKey: 'anthropic',
  status: 'manually-reviewed-source-backed-facts-not-an-edition', excerptSha256: hash(excerpt), attribution: 'Synthetic fixture', facts: [] };

test('summary requires exact fields, bounded prose, attribution and original wording', () => {
  assert.equal(validateFactSummary(draft, excerpt), true);
  for (const bad of [{ ...draft, extra: true }, { ...draft, whatHappened: '{}' }, { ...draft, whatHappened: 'Anthropic reports a change.', whyItMatters: 'Short.', whatToWatch: 'Short.' },
    { ...draft, headline: '<script>' }, { ...draft, whatHappened: draft.whatHappened.replace('Anthropic', 'A vendor') }]) {
    assert.throws(() => validateFactSummary(bad, excerpt));
  }
  assert.throws(() => validateFactSummary(draft, draft.whatHappened), /ORIGINALITY/);
});

const unitDraft = Object.fromEntries(Object.entries(draft).map(([field, value]) =>
  [field, field === 'headline' ? value : value.match(/[^.]+\./g).map(s => s.trim())]));

// Deliberately synthetic prose and always-mocked judgments: these fixtures test
// transport, inventory and review binding, never factual or semantic quality.
const copyeditInput = JSON.parse(JSON.stringify(unitDraft).replaceAll('Anthropic', 'MIT'));
const copyeditProposal = { unitsSha256: phraseCopyeditUnitsHash(normalizeClaimwiseSummary(copyeditInput, excerpt, 'MIT').units), replacements: [
  { field: 'whatHappened', unitIndex: 0, find: 'published measurements', replace: 'shared measurements' },
] };
const copyeditOutput = structuredClone(copyeditInput);
for (const edit of copyeditProposal.replacements) {
  copyeditOutput[edit.field][edit.unitIndex] = copyeditOutput[edit.field][edit.unitIndex].replace(edit.find, edit.replace);
}
function catalogProposal(writerPayload, edits) {
  const catalog = buildSinglePhraseCopyeditView(normalizeClaimwiseSummary(writerPayload, excerpt, 'MIT').units);
  return { catalogSha256: catalog.data.catalogSha256, decision: 'replace', replacements: edits.map(edit => {
    const unit = catalog.data.units.find(unit => unit.field === edit.field && unit.unitIndex === edit.unitIndex);
    const span = catalog.data.spans.find(span => span.unitId === unit.unitId && span.find === edit.find);
    assert.ok(span, 'Fixture targets must exist in the program-issued catalog');
    return { spanId: span.spanId, replace: edit.replace };
  }) };
}
const boundCopyeditProposal = catalogProposal(copyeditInput, copyeditProposal.replacements);
const copyeditSheet = { ...sheet, publisherKey: 'mit',
  sourceUrl: 'https://news.mit.edu/2026/new-method-enables-ai-safety-critical-situations-0914' };
const copyeditEndpoint = 'https://provider.example/fixed';
async function runCopyeditFixture({ options = {}, writerPayload = copyeditInput, editedPayload = boundCopyeditProposal,
  rejectAt = -1, rejection = null } = {}) {
  const requests = [], networkCalls = [], reviewRequests = [], reviewMeta = [];
  let writerSchema, copyeditPrompt, payloadGetterReads = 0;
  const result = await diagnoseFactSummary({ publicKey: 'mock', accountId: '0'.repeat(32), apiToken: 'mock',
    now: new Date('2026-09-23T04:00:00Z'), endpoint: copyeditEndpoint,
    claimwise: true, profile: 'mit-generalization', plainLanguageCopyedit: true, ...options,
    articleFetcher: async input => {
      assert.deepEqual(input, { url: copyeditSheet.sourceUrl, publisherKey: copyeditSheet.publisherKey });
      return excerpt;
    }, sheetLoader: async () => copyeditSheet, sealDiagnostic: value => value,
    fetchImpl: async (url, init) => {
      networkCalls.push({ url, init });
      assert.equal(url, copyeditEndpoint, 'No email or alternate provider endpoint is allowed');
      return { ok: true };
    }, aiRequestImpl: async request => {
      const index = requests.length;
      requests.push(request);
      assert.equal(request.maxAttempts, 1);
      assert.equal(request.model, DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(request.responseFormat, 'json_object');
      const data = JSON.parse(request.messages[1].content);
      const editing = index === 1 && options.plainLanguageCopyedit !== false;
      assert.equal(request.maxTokens, index === 0 || editing ? 1200 : 600);
      assert.equal(request.timeoutMs, options.plainLanguageCopyedit !== false && index > 1 ? 30000 : 90000);
      const { body } = buildWorkersAiRequest(request);
      const init = { method: 'POST', redirect: 'error', body: JSON.stringify(body) };
      assert.ok(Buffer.byteLength(init.body) <= 70000, 'Complete serialized request, including escaped prompt/schema/evidence, must fit');
      if (index === rejectAt && rejection === 'endpoint') {
        await request.fetchImpl('https://unapproved.example/send-email', init);
      }
      if (index === rejectAt && rejection === 'body') {
        await request.fetchImpl(copyeditEndpoint, { ...init, body: '{}' });
      }
      if (index === rejectAt && rejection === 'swallowed-denial') {
        try { await request.fetchImpl('https://unapproved.example/', init); } catch { /* Denial remains terminal. */ }
      }
      if (!(index === rejectAt && rejection === 'skip-fetch')) await request.fetchImpl(copyeditEndpoint, init);
      if (index === rejectAt && rejection === 'retry') await request.fetchImpl(copyeditEndpoint, init);
      if (index === rejectAt && rejection === 'quota') {
        throw Object.assign(new Error('private copyediting quota detail'), { code: 'QUOTA' });
      }
      let editorialPayload;
      if (index === 0) {
        writerSchema = request.schema;
        assert.equal(request.messages[0].content.split('\nJSON schema:')[0], GENERIC_FACT_SUMMARY_PROMPT);
        assert.deepEqual(data, { attribution: copyeditSheet.attribution, facts: copyeditSheet.facts });
        editorialPayload = structuredClone(writerPayload);
      } else if (editing) {
        assert.notDeepEqual(request.schema, writerSchema);
        const before = normalizeClaimwiseSummary(writerPayload, excerpt, 'MIT');
        const catalog = buildSinglePhraseCopyeditView(before.units);
        assert.deepEqual(request.schema, catalog.schema);
        assert.deepEqual(data, { catalog: catalog.data,
          limits: SINGLE_PHRASE_COPYEDIT_LIMITS, protectedWords: PHRASE_COPYEDIT_PROTECTED_WORDS,
          attribution: copyeditSheet.attribution, facts: copyeditSheet.facts });
        copyeditPrompt = request.messages[0].content.split('\nJSON schema:')[0];
        assert.notEqual(copyeditPrompt, GENERIC_FACT_SUMMARY_PROMPT);
        editorialPayload = structuredClone(editedPayload);
      } else {
        reviewRequests.push(data);
        const meaning = data.policy === 'text-only-preservation-v1';
        const field = meaning ? reviewMeta.at(-1).field
          : Object.keys(copyeditInput)[reviewMeta.filter(review => review.dimension === 'source').length];
        reviewMeta.push({ field, dimension: meaning ? 'meaning' : 'source', requestIndex: index });
        const before = normalizeClaimwiseSummary(writerPayload, excerpt, 'MIT');
        let verdictKey = 'supported';
        if (options.plainLanguageCopyedit !== false) {
          const input = { text: data.claims.map(claim => claim.text).join(' '),
            claims: data.claims.map(claim => claim.text), previousClaims: before.units[field],
            sources: [{ publisher: 'MIT', passages: [{ evidenceId: 'S1P1', text: excerpt }] }] };
          const view = meaning ? buildTextPreservationReview(input) : buildIsolatedPreservationReview(input, 'source');
          assert.deepEqual(data, view.data);
          assert.deepEqual(request.schema, view.schema);
          assert.equal(request.messages[0].content, `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`);
          verdictKey = meaning ? 'meaningPreserved' : 'sourceSupported';
          if (meaning) {
            assert.deepEqual(Object.keys(data), ['policy', 'claims', 'previousClaims', 'reviewSha256']);
            assert.deepEqual(data.previousClaims.map(claim => claim.text), before.units[field]);
            assert.doesNotMatch(JSON.stringify(data), /passages|publisher|Synthetic plumbing judgment/);
          } else {
            assert.equal(data.passages[0].text, excerpt);
            assert.equal(data.policy, 'isolated-claimwise-source-v1');
            assert.equal(data.previousClaims, undefined);
          }
        } else {
          assert.equal(data.passages[0].text, excerpt);
          assert.equal(data.policy, 'explicit-claimwise-evidence-v2');
          assert.equal(data.previousClaims, undefined);
        }
        editorialPayload = { reviewSha256: data.reviewSha256, judgments: data.claims.map(claim => ({
          claimId: claim.claimId, comparison: 'Synthetic plumbing judgment, not semantic qualification.',
          ...(!meaning ? { evidenceIds: ['S1P1'] } : {}), [verdictKey]: !(index === rejectAt && rejection === 'unsupported'),
        })) };
        if (index === rejectAt && rejection === 'omitted') editorialPayload.judgments.pop();
        if (index === rejectAt && rejection === 'stale-review') {
          editorialPayload.reviewSha256 = meaning
            ? buildTextPreservationReview({ claims: data.claims.map(claim => claim.text),
              previousClaims: before.units[field].map((text, i) => i ? text : `${text} Changed prior meaning.`) }).data.reviewSha256
            : buildIsolatedPreservationReview({ text: before.draft[field], claims: before.units[field],
              sources: [{ publisher: 'MIT', passages: [{ evidenceId: 'S1P1', text: excerpt }] }] }, 'source').data.reviewSha256;
          assert.notEqual(editorialPayload.reviewSha256, data.reviewSha256);
        }
        if (index === rejectAt && rejection === 'getter') {
          Object.defineProperty(editorialPayload.judgments[0], 'comparison', { enumerable: true,
            get() { payloadGetterReads++; return 'Getter must not execute'; } });
        }
      }
      return { editorialPayload, provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, attemptCount: 1,
        responseSha256: 'b'.repeat(64), requestSha256: index === rejectAt && rejection === 'provenance' ? '0'.repeat(64)
          : hash(JSON.stringify({ provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, body })) };
    } });
  assert.equal(result.report.emailSent, false);
  assert.equal(result.report.searchQueries, 0);
  assert.ok(requests.length <= 7);
  assert.ok(networkCalls.length <= 7);
  assert.ok(result.report.outputBudget <= 5400);
  assert.equal(result.report.modelRequests, requests.length);
  assert.equal(result.report.networkRequests, networkCalls.length);
  assert.ok(Buffer.byteLength(JSON.stringify(result.sealed)) <= 350000, 'Full successful or failed capture must fit the encryption limit');
  assert.doesNotMatch(JSON.stringify(result.report), /private copyediting quota detail|Revised MIT|Synthetic fixture/);
  return { ...result, requests, networkCalls, reviewRequests, reviewMeta, copyeditPrompt, payloadGetterReads };
}

test('opt-in copyediting plumbing captures both versions and reviews every final edited unit from scratch', async () => {
  const result = await runCopyeditFixture();
  const before = normalizeClaimwiseSummary(copyeditInput, excerpt, 'MIT');
  const after = normalizeClaimwiseSummary(copyeditOutput, excerpt, 'MIT');
  assert.equal(result.report.status, 'draft-awaiting-manual-review');
  assert.equal(result.report.mode, 'plain-language-copyedit-awaiting-manual-review');
  assert.equal(result.report.outputBudget, 5400);
  assert.equal(result.requests.length, 7);
  assert.equal(result.networkCalls.length, 7);
  assert.deepEqual(result.sealed.beforeCopyedit, { ...before, draftSha256: hash(JSON.stringify(before.draft)), unitsSha256: phraseCopyeditUnitsHash(before.units) });
  assert.equal(result.sealed.promptSha256, hash(GENERIC_FACT_SUMMARY_PROMPT));
  assert.equal(result.copyeditPrompt, PLAIN_LANGUAGE_COPYEDIT_PROMPT);
  assert.match(PLAIN_LANGUAGE_COPYEDIT_PROMPT, /ONE meaningful plain-language phrase replacement, not rewritten sentences/);
  assert.equal(hash(PLAIN_LANGUAGE_COPYEDIT_PROMPT), '2fa180aeda7b76ddc6ff1e87e9686d9e0cbf395c76d4801963cc76f150932719');
  assert.doesNotMatch(PLAIN_LANGUAGE_COPYEDIT_PROMPT, /\b(?:Anthropic|MIT|HardFlow|Claude|robot)\b/i);
  assert.equal(result.sealed.copyeditPromptSha256, hash(result.copyeditPrompt));
  assert.equal(result.sealed.copyeditStrategy, 'single-phrase-or-abstain-v4');
  assert.deepEqual(result.sealed.copyeditCatalog, buildSinglePhraseCopyeditView(before.units).data);
  assert.deepEqual(result.sealed.rawCopyedit, boundCopyeditProposal);
  assert.equal(result.sealed.copyeditDecision, 'replace');
  assert.equal(result.sealed.editsApplied.length, 1);
  assert.deepEqual(result.sealed.rawDraft, copyeditOutput);
  assert.deepEqual(result.sealed.draft, after.draft);
  assert.deepEqual(result.sealed.reviewUnits, after.units);
  assert.equal(result.sealed.draftSha256, hash(JSON.stringify(after.draft)));
  assert.notEqual(result.sealed.draftSha256, result.sealed.beforeCopyedit.draftSha256);
  assert.deepEqual(result.report.fieldsPassed, Object.keys(after.draft));
  assert.deepEqual(result.sealed.fieldReviews.map(review => review.field), Object.keys(after.draft));
  const sourceRequests = result.reviewRequests.filter(review => review.policy === 'isolated-claimwise-source-v1');
  assert.deepEqual(sourceRequests.map(review => review.statement), Object.values(after.draft));
  assert.deepEqual(sourceRequests.map(review => review.claims.map(claim => claim.text)), Object.values(after.units));
  assert.deepEqual(result.reviewMeta, [
    { field: 'headline', dimension: 'source', requestIndex: 2 },
    { field: 'whatHappened', dimension: 'source', requestIndex: 3 },
    { field: 'whatHappened', dimension: 'meaning', requestIndex: 4 },
    { field: 'whyItMatters', dimension: 'source', requestIndex: 5 },
    { field: 'whatToWatch', dimension: 'source', requestIndex: 6 },
  ]);
  assert.equal(result.sealed.reviewStrategy, 'isolated-source-plus-text-preservation-v1');
  assert.deepEqual(result.sealed.localReviews.map(review => review.field), ['headline', 'whyItMatters', 'whatToWatch']);
  for (const local of result.sealed.localReviews) {
    const view = buildTextPreservationReview({ claims: after.units[local.field], previousClaims: before.units[local.field] });
    assert.equal(local.dimension, 'meaning');
    assert.deepEqual(local.request, view.data);
    assert.deepEqual(local.verdict, exactTextPreservation(view));
    assert.equal(local.provider, undefined);
    assert.equal(local.responseSha256, undefined);
  }
  for (const [index, call] of result.sealed.calls.entries()) {
    const { body } = buildWorkersAiRequest(result.requests[index]);
    assert.equal(call.requestSha256, hash(JSON.stringify({ provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, body })));
    assert.equal(call.responseSha256, 'b'.repeat(64));
    assert.equal(call.provider, 'cloudflare-workers-ai');
    assert.equal(call.model, DEFAULT_CLOUDFLARE_AI_MODEL);
    assert.equal(call.attemptCount, 1);
    if (index > 1) {
      assert.equal(call.field, result.reviewMeta[index - 2].field);
      assert.equal(call.dimension, result.reviewMeta[index - 2].dimension);
      assert.equal(call.promptSha256, hash(result.requests[index].messages[0].content));
    }
  }
  for (const review of result.sealed.fieldReviews) {
    assert.deepEqual(review.verdict, { valid: true, supported: true, sourceSupported: true, meaningPreserved: true });
    assert.equal(review.source.verdict.valid, true);
    assert.equal(review.source.verdict.supported, true);
    assert.equal(review.meaning.verdict.valid, true);
    assert.equal(review.meaning.verdict.supported, true);
    assert.equal(review.meaning.local === true, review.field !== 'whatHappened');
  }
  for (const [field, units] of Object.entries(after.units)) {
    assert.equal(units.length, before.units[field].length);
    if (field !== 'whatHappened') assert.deepEqual(units, before.units[field]);
    else assert.ok(units.some((unit, index) => unit !== before.units[field][index]));
  }
});

test('copyediting opt-in rejects invalid modes before evidence, inference or sealing', async () => {
  for (const options of [
    { plainLanguageCopyedit: 'true' }, { plainLanguageCopyedit: 1 }, { plainLanguageCopyedit: null },
    { plainLanguageCopyedit: true, claimwise: false },
    { plainLanguageCopyedit: true, profile: 'anthropic' },
  ]) {
    await assert.rejects(diagnoseFactSummary({ claimwise: true, profile: 'mit-generalization', ...options,
      articleFetcher: async () => assert.fail('No evidence fetch'), sheetLoader: async () => assert.fail('No fact sheet load'),
      aiRequestImpl: async () => assert.fail('No inference'), sealDiagnostic: () => assert.fail('No capture'),
    }), error => error.code === 'FACT_SUMMARY_MODE');
  }
});

test('explicit false retains the existing five-call generic writer and review budget', async () => {
  const result = await runCopyeditFixture({ options: { plainLanguageCopyedit: false } });
  assert.equal(result.report.status, 'draft-awaiting-manual-review');
  assert.equal(result.report.mode, 'generic-second-article-awaiting-manual-review');
  assert.equal(result.requests.length, 5);
  assert.equal(result.networkCalls.length, 5);
  assert.equal(result.report.outputBudget, 3600);
  assert.equal(result.sealed.beforeCopyedit, undefined);
  assert.equal(result.sealed.rawCopyedit, undefined);
  assert.equal(result.sealed.copyeditPromptSha256, undefined);
  assert.equal(result.sealed.copyeditStrategy, undefined);
  assert.equal(result.sealed.copyeditDecision, undefined);
  assert.equal(result.sealed.reviewStrategy, undefined);
  assert.equal(result.sealed.localReviews, undefined);
  assert.deepEqual(result.sealed.rawDraft, copyeditInput);
});

test('empty or oversized target catalogs hold after the writer and before the editor request', async () => {
  for (const oversized of [false, true]) {
    const words = Array.from({ length: 210 }, (_, i) => oversized
      ? `word${String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26)}` : String(1000 + i));
    const writerPayload = { headline: 'MIT synthetic catalog limit fixture',
      whatHappened: [`MIT ${words.slice(0, 70).join(' ')}.`],
      whyItMatters: [`${words.slice(70, 140).join(' ')}.`],
      whatToWatch: [`${words.slice(140).join(' ')}.`] };
    const result = await runCopyeditFixture({ writerPayload });
    assert.equal(result.report.code, `FACT_SUMMARY_PHRASE_CATALOG_${oversized ? 'BUDGET' : 'EMPTY'}`);
    assert.equal(result.requests.length, 1);
    assert.equal(result.report.outputBudget, 1200);
    assert.equal(result.sealed.rawCopyedit, undefined);
    assert.equal(result.sealed.draft, undefined);
    assert.deepEqual(result.sealed.fieldReviews, []);
  }
});

for (const stage of ['writer']) {
  for (const defect of ['shape', 'units', 'too-short']) {
    test(`copyediting rejects ${stage} ${defect} before further requests`, async () => {
      const payload = structuredClone(stage === 'writer' ? copyeditInput : copyeditOutput);
      if (defect === 'shape') payload.extra = 'Unreviewed text';
      if (defect === 'units') payload.whatHappened = [];
      if (defect === 'too-short') {
        for (const field of Object.keys(payload).slice(1)) payload[field] = payload[field].map((_, i) => `MIT fixture ${i}.`);
      }
      const result = await runCopyeditFixture({ [stage === 'writer' ? 'writerPayload' : 'editedPayload']: payload });
      assert.equal(result.report.status, 'failed');
      assert.equal(result.report.code, defect === 'shape' ? 'FACT_SUMMARY_SHAPE' : defect === 'units' ? 'FACT_SUMMARY_UNITS' : 'FACT_SUMMARY_LENGTH');
      assert.equal(result.requests.length, stage === 'writer' ? 1 : 2);
      assert.equal(result.sealed.fieldReviews.length, 0);
      assert.equal(result.sealed.draft, undefined);
      if (stage === 'copyedit') assert.deepEqual(result.sealed.rawCopyedit, payload);
    });
  }
}

for (const defect of ['whole-rewrite', 'stale-hash', 'unknown-id', 'duplicate-id', 'second-edit', 'missing-decision', 'unknown-decision', 'abstain-with-edit', 'unchanged-edit', 'invented-location', 'protected-cue', 'extra-prose', 'empty-edits', 'repeated-context']) {
  test(`phrase copyediting rejects ${defect} after two calls without fallback`, async () => {
    const editedPayload = defect === 'whole-rewrite' ? structuredClone(copyeditOutput) : structuredClone(boundCopyeditProposal);
    if (defect === 'stale-hash') editedPayload.catalogSha256 = '0'.repeat(64);
    if (defect === 'unknown-id') editedPayload.replacements[0].spanId = 'P99999';
    if (defect === 'duplicate-id') editedPayload.replacements.push(structuredClone(editedPayload.replacements[0]));
    if (defect === 'second-edit') editedPayload.replacements.push(catalogProposal(copyeditInput, [
      { field: 'whyItMatters', unitIndex: 0, find: 'assigning work', replace: 'giving work' },
    ]).replacements[0]);
    if (defect === 'missing-decision') delete editedPayload.decision;
    if (defect === 'unknown-decision') editedPayload.decision = 'approved';
    if (defect === 'abstain-with-edit') editedPayload.decision = 'abstain';
    if (defect === 'unchanged-edit') editedPayload.replacements[0].replace = 'published measurements';
    if (defect === 'invented-location') editedPayload.replacements[0].find = 'invented location';
    if (defect === 'protected-cue') editedPayload.replacements[0].replace = 'can share measurements';
    if (defect === 'extra-prose') editedPayload.whatHappened = copyeditOutput.whatHappened;
    if (defect === 'empty-edits') editedPayload.replacements = [];
    if (defect === 'repeated-context') editedPayload.replacements[0] = catalogProposal(copyeditInput, [{
      field: 'whatHappened', unitIndex: 1, find: 'category', replace: 'a category',
    }]).replacements[0];
    const result = await runCopyeditFixture({ editedPayload });
    assert.equal(result.report.status, 'failed');
    assert.match(result.report.code, /^FACT_SUMMARY_(?:PHRASE_(?:EDIT|CATALOG)|SINGLE_PHRASE)_/);
    assert.equal(result.requests.length, 2);
    assert.equal(result.sealed.fieldReviews.length, 0);
    assert.deepEqual(result.sealed.rawCopyedit, editedPayload);
    assert.equal(result.sealed.draft, undefined);
    assert.equal(result.sealed.reviewUnits, undefined);
    assert.equal(result.sealed.draftSha256, undefined);
    assert.equal(result.sealed.copyeditDecision, undefined);
  });
}

test('valid abstention is a captured hold after two calls, never an approved original or fallback', async () => {
  const editedPayload = { catalogSha256: boundCopyeditProposal.catalogSha256, decision: 'abstain', replacements: [] };
  const result = await runCopyeditFixture({ editedPayload });
  assert.equal(result.report.status, 'failed', 'CLI must not portray an abstention as a qualified draft');
  assert.equal(result.report.code, 'FACT_SUMMARY_COPYEDIT_ABSTAINED');
  assert.equal(result.sealed.copyeditDecision, 'abstain');
  assert.deepEqual(result.sealed.rawCopyedit, editedPayload);
  assert.deepEqual(result.sealed.beforeCopyedit.units, normalizeClaimwiseSummary(copyeditInput, excerpt, 'MIT').units);
  assert.equal(result.requests.length, 2);
  assert.equal(result.report.outputBudget, 2400);
  assert.deepEqual(result.sealed.fieldReviews, []);
  assert.deepEqual(result.report.fieldsPassed, []);
  for (const field of ['draft', 'reviewUnits', 'draftSha256', 'editsApplied']) assert.equal(result.sealed[field], undefined);
});

test('malformed or stale abstentions cannot use the intentional-hold outcome', async () => {
  const valid = { catalogSha256: boundCopyeditProposal.catalogSha256, decision: 'abstain', replacements: [] };
  for (const editedPayload of [{ ...valid, catalogSha256: '0'.repeat(64) }, { ...valid, extra: 'unreviewed' },
    { ...valid, replacements: null }, { ...valid, decision: null }, { ...valid, replacements: boundCopyeditProposal.replacements }]) {
    const result = await runCopyeditFixture({ editedPayload });
    assert.equal(result.report.status, 'failed');
    assert.notEqual(result.report.code, 'FACT_SUMMARY_COPYEDIT_ABSTAINED');
    assert.equal(result.sealed.copyeditDecision, undefined);
    assert.equal(result.requests.length, 2);
    assert.deepEqual(result.sealed.fieldReviews, []);
    assert.equal(result.sealed.draft, undefined);
  }
});

test('valid phrase edits still face the final body-length check before factual requests', async () => {
  const writerPayload = structuredClone(copyeditInput);
  // Build exactly 110 synthetic words with a five-word span eligible for reduction.
  writerPayload.whatHappened = ['MIT provides a synthetic neutral control for a bounded local fixture.'];
  writerPayload.whyItMatters = ['The marker moves across a synthetic blue square in the controlled fixture.'];
  const words = 110 - [...writerPayload.whatHappened, ...writerPayload.whyItMatters].join(' ').split(/\s+/).length;
  writerPayload.whatToWatch = [Array.from({ length: words }, (_, i) => `word${i}`).join(' ') + '.'];
  const editedPayload = catalogProposal(writerPayload, [
    { field: 'whyItMatters', unitIndex: 0, find: 'synthetic blue square', replace: 'box' },
  ]);
  const result = await runCopyeditFixture({ writerPayload, editedPayload });
  assert.equal(result.report.code, 'FACT_SUMMARY_LENGTH');
  assert.equal(result.requests.length, 2);
  assert.equal(result.sealed.draft, undefined);
  assert.equal(result.sealed.fieldReviews.length, 0);
});

for (const rejection of ['unsupported', 'omitted', 'stale-review', 'getter']) {
  test(`copyediting final ${rejection} review stops immediately without inheriting earlier approval`, async () => {
    // Same-policy hashes must bind the edited claim and its exact prior wording.
    for (const rejectAt of rejection === 'stale-review' ? [3, 4] : [2, 3, 4, 5, 6]) {
      const result = await runCopyeditFixture({ rejectAt, rejection });
      const fieldIndex = [0, 1, 1, 2, 3][rejectAt - 2];
      assert.equal(result.report.status, 'failed');
      assert.equal(result.report.code, 'FACT_SUMMARY_REVIEW_REJECTED');
      assert.equal(result.requests.length, rejectAt + 1 + (rejection === 'unsupported' && rejectAt === 3 ? 1 : 0));
      assert.equal(result.sealed.fieldReviews.length, fieldIndex + 1);
      assert.deepEqual(result.report.fieldsPassed, Object.keys(copyeditInput).slice(0, fieldIndex));
      const failed = result.sealed.fieldReviews.at(-1);
      assert.equal(failed.verdict.supported, false);
      if (rejection !== 'unsupported' && rejectAt !== 4) {
        assert.equal(failed.meaning, null, 'Malformed source cannot reach meaning or identity');
        assert.equal(failed.source.response, null);
        assert.equal(failed.source.responseRejectedBeforeCapture, true);
      }
      if (rejection === 'unsupported' && rejectAt === 3) {
        assert.equal(failed.verdict.sourceSupported, false);
        assert.equal(failed.verdict.meaningPreserved, true);
        assert.equal(failed.meaning.verdict.valid, true, 'A valid false source still gets a separate meaning judgment');
      }
      assert.equal(result.payloadGetterReads, 0, 'Reject malformed descriptors before cloning private captures');
      assert.ok(result.sealed.localReviews.every(review => review.field !== failed.field || rejection === 'unsupported'));
    }
  });
}

test('source transport and provenance failures stop before any local identity can be created', async () => {
  for (const rejection of ['skip-fetch', 'swallowed-denial', 'provenance', 'quota']) {
    const result = await runCopyeditFixture({ rejectAt: 2, rejection });
    assert.equal(result.report.code, rejection === 'provenance' ? 'FACT_SUMMARY_PROVENANCE'
      : rejection === 'quota' ? 'QUOTA' : 'FACT_SUMMARY_NETWORK');
    assert.equal(result.requests.length, 3);
    assert.equal(result.networkCalls.length, ['skip-fetch', 'swallowed-denial'].includes(rejection) ? 2 : 3);
    assert.deepEqual(result.report.fieldsPassed, []);
    assert.deepEqual(result.sealed.localReviews, []);
    const saved = result.requests[2], { body } = buildWorkersAiRequest(saved);
    await assert.rejects(saved.fetchImpl(copyeditEndpoint, { method: 'POST', redirect: 'error', body: JSON.stringify(body) }),
      error => error.code === 'FACT_SUMMARY_NETWORK');
    assert.equal(result.networkCalls.length, ['skip-fetch', 'swallowed-denial'].includes(rejection) ? 2 : 3);
  }
});

for (const rejectAt of [0, 1, 2]) {
  test(`copyediting quota failure on request ${rejectAt + 1} cannot trigger another request`, async () => {
    const result = await runCopyeditFixture({ rejectAt, rejection: 'quota' });
    assert.equal(result.report.status, 'failed');
    assert.equal(result.report.code, 'QUOTA');
    assert.equal(result.requests.length, rejectAt + 1);
    assert.equal(result.networkCalls.length, rejectAt + 1);
    assert.equal(result.sealed.fieldReviews.length, 0);
  });
}

for (const rejection of ['endpoint', 'body', 'retry', 'provenance']) {
  test(`copyediting ${rejection} cannot escape the fixed transport or provenance contract`, async () => {
    const result = await runCopyeditFixture({ rejectAt: 1, rejection });
    assert.equal(result.report.status, 'failed');
    assert.equal(result.report.code, rejection === 'provenance' ? 'FACT_SUMMARY_PROVENANCE' : 'FACT_SUMMARY_NETWORK');
    assert.equal(result.requests.length, 2);
    assert.equal(result.networkCalls.length, ['endpoint', 'body'].includes(rejection) ? 1 : 2);
    assert.equal(result.sealed.fieldReviews.length, 0);
  });
}

test('user-approved 110-word minimum and 225-word maximum exclude the headline', () => {
  for (const count of [109, 110, 116, 149, 150, 225, 226]) {
    // Synthetic text checks boundaries only, never editorial quality.
    const words = Array.from({ length: count }, (_, i) => i === 0 ? 'MIT' : `token${i}`);
    const candidate = { headline: 'This headline never contributes to the body word count',
      whatHappened: words.slice(0, 40).join(' '), whyItMatters: words.slice(40, 75).join(' '),
      whatToWatch: words.slice(75).join(' ') };
    if (count >= 110 && count <= 225) assert.equal(validateFactSummary(candidate, excerpt, 'MIT'), true);
    else assert.throws(() => validateFactSummary(candidate, excerpt, 'MIT'), /FACT_SUMMARY_LENGTH/);
  }
});

test('claimwise summary derives every displayed word from the captured review inventory', () => {
  const input = structuredClone(unitDraft);
  const normalized = normalizeClaimwiseSummary(input, excerpt);
  assert.deepEqual(normalized.draft, draft);
  for (const field of Object.keys(draft)) assert.equal(normalized.units[field].join(' '), draft[field]);
  input.whatHappened[0] = 'Changed';
  assert.notEqual(normalized.units.whatHappened[0], 'Changed');
  for (const bad of [
    { ...unitDraft, unreviewedProse: 'Extra' }, { ...unitDraft, whatHappened: draft.whatHappened },
    { ...unitDraft, whatHappened: [] }, { ...unitDraft, whatHappened: Array(5).fill('Text.') },
    { ...unitDraft, whatHappened: [' Same text.'] }, { ...unitDraft, whatHappened: ['Same.', 'Same.'] },
    { ...unitDraft, headline: '<script>' },
  ]) assert.throws(() => normalizeClaimwiseSummary(bad, excerpt));
  assert.throws(() => normalizeClaimwiseSummary(unitDraft, draft.whatHappened), /ORIGINALITY/);
});

for (const profile of ['anthropic', 'mit-generalization']) {
for (const outcome of ['pass', 'veto', 'omitted', 'bad-hash', 'quota', 'changed-source', 'wrong-source', 'too-short']) {
  test(`claimwise ${profile} summary ${outcome} checks all units without email or retry`, async () => {
    const generic = profile === 'mit-generalization';
    const expectedDraft = generic ? JSON.parse(JSON.stringify(draft).replaceAll('Anthropic', 'MIT')) : draft;
    const expectedUnits = generic ? JSON.parse(JSON.stringify(unitDraft).replaceAll('Anthropic', 'MIT')) : unitDraft;
    const expectedSheet = generic ? { ...sheet, publisherKey: 'mit', sourceUrl: 'https://news.mit.edu/2026/new-method-enables-ai-safety-critical-situations-0914' } : sheet;
    let calls = 0;
    const checkedUnits = [];
    const result = await diagnoseFactSummary({ publicKey: 'mock', accountId: '0'.repeat(32), apiToken: 'mock',
      now: new Date('2026-09-23T04:00:00Z'), endpoint: 'https://provider.example/fixed', claimwise: true, profile,
      articleFetcher: async input => {
        assert.deepEqual(input, { url: expectedSheet.sourceUrl, publisherKey: expectedSheet.publisherKey });
        return outcome === 'changed-source' ? 'changed' : excerpt;
      }, sheetLoader: async () => outcome === 'wrong-source' ? { ...expectedSheet, sourceUrl: 'https://untrusted.example/' } : expectedSheet,
      sealDiagnostic: v => v, fetchImpl: async () => ({ ok: true }), aiRequestImpl: async options => {
        calls++;
        assert.equal(options.maxAttempts, 1);
        assert.equal(options.maxTokens, calls === 1 ? 1200 : 600);
        const { body } = buildWorkersAiRequest(options);
        await options.fetchImpl('https://provider.example/fixed', { method: 'POST', redirect: 'error', body: JSON.stringify(body) });
        if (outcome === 'quota') throw Object.assign(new Error('private quota detail'), { code: 'QUOTA' });
        const data = JSON.parse(options.messages[1].content);
        let editorialPayload = expectedUnits;
        if (outcome === 'too-short') editorialPayload = Object.fromEntries(Object.entries(expectedUnits).map(([k, v]) =>
          [k, k === 'headline' ? v : [v[0]]]));
        if (calls === 1 && generic) {
          assert.equal(options.messages[0].content.split('\nJSON schema:')[0], GENERIC_FACT_SUMMARY_PROMPT);
          assert.deepEqual(data, { attribution: expectedSheet.attribution, facts: expectedSheet.facts });
        }
        if (calls > 1) {
          checkedUnits.push(data.claims.map(c => c.text));
          assert.equal(data.passages[0].text, excerpt);
          editorialPayload = { reviewSha256: data.reviewSha256, judgments: data.claims.map(c => ({
            claimId: c.claimId, comparison: 'Mock only, not semantic qualification.', evidenceIds: ['S1P1'], supported: outcome !== 'veto',
          })) };
          if (outcome === 'omitted') editorialPayload.judgments.pop();
          if (outcome === 'bad-hash') editorialPayload.reviewSha256 = '0'.repeat(64);
        }
        return { editorialPayload, provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, attemptCount: 1,
          responseSha256: 'b'.repeat(64), requestSha256: hash(JSON.stringify({ provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, body })) };
      } });
    assert.equal(result.report.emailSent, false);
    assert.equal(result.report.searchQueries, 0);
    assert.ok(result.report.outputBudget <= 3600);
    assert.equal(calls, outcome === 'pass' ? 5 : ['changed-source', 'wrong-source'].includes(outcome) ? 0 : ['quota', 'too-short'].includes(outcome) ? 1 : 2);
    assert.equal(result.report.status, outcome === 'pass' ? 'draft-awaiting-manual-review' : 'failed');
    assert.doesNotMatch(JSON.stringify(result.report), /private quota detail/);
    if (outcome === 'too-short') {
      assert.equal(result.report.code, 'FACT_SUMMARY_LENGTH');
      assert.equal(result.sealed.fieldReviews.length, 0);
      assert.ok(result.sealed.rawDraft);
      assert.equal(result.sealed.draft, undefined);
    }
    if (outcome === 'pass') {
      assert.deepEqual(checkedUnits, Object.values(result.sealed.reviewUnits));
      assert.deepEqual(result.sealed.draft, expectedDraft);
      assert.equal(result.sealed.draftSha256, hash(JSON.stringify(expectedDraft)));
      if (generic) assert.equal(result.sealed.promptSha256, hash(GENERIC_FACT_SUMMARY_PROMPT));
    }
  });
}
}

test('generalization prompt is frozen, topic-independent and profile scope is closed', async () => {
  assert.equal(hash(GENERIC_FACT_SUMMARY_PROMPT), '2976ca639f09e1a68bb675633b352738ee96c086e396910f32b6fe59a390ee46');
  assert.match(GENERIC_FACT_SUMMARY_PROMPT, /hard bounds 110–225, headline excluded/);
  assert.doesNotMatch(GENERIC_FACT_SUMMARY_PROMPT, /\b(?:Anthropic|MIT|HardFlow|compute|Claude|robot)\b|26%/i);
  for (const options of [{ profile: 'arbitrary-url', claimwise: true }, { profile: 'mit-generalization', claimwise: false }]) {
    await assert.rejects(diagnoseFactSummary(options), /FACT_SUMMARY_PROFILE/);
  }
  assert.throws(() => validateFactSummary(draft, excerpt, ''), /ATTRIBUTION/);
  assert.throws(() => validateFactSummary({ ...draft, whatHappened: draft.whatHappened.replace('Anthropic', 'COMMIT') }, excerpt, 'MIT'), /ATTRIBUTION/);
});

test('plain-language checkpoint changes only presentation instructions, not section purposes or evidence rules', () => {
  const added = [
    'Write for a curious reader who follows technology but is not a specialist in this subject.',
    'Use everyday wording in the headline and body. Replace technical terms with a source-supported explanation on first use, rather than adding a second technical term.',
    'Keep a technical name only when needed to identify the method or product; explain what it does using the reviewed facts.',
    'A simpler explanation must preserve the original conditions and limits. If the reviewed facts do not support an explanation, omit the nonessential term rather than supply background from memory.',
  ].join('\n') + '\n';
  assert.equal(GENERIC_FACT_SUMMARY_PROMPT.split(added).length, 2);
  assert.equal(hash(GENERIC_FACT_SUMMARY_PROMPT.replace(added, '')),
    'aeee569b4d1ab6897555eff115ebc832eb53db4e8e461caac7687d2998d6c149');
});

test('plain-language fact inputs include source-bound definitions without changing evidence scope', async () => {
  const facts = JSON.parse(await readFile(new URL('../docs/checkpoints/mit-fact-sheet.json', import.meta.url), 'utf8'));
  assert.equal(facts.excerptSha256, '081196aa0f2c507e6b75f5a7018a594af882468006401c1b1428f96e4eb74801');
  assert.equal(facts.facts.length, 7);
  assert.deepEqual(facts.facts.find(f => f.id === 'definition-required-rules').passageIds, ['P2']);
  assert.deepEqual(facts.facts.find(f => f.id === 'definition-partial-solutions').passageIds, ['P12']);
  assert.doesNotMatch(facts.facts.find(f => f.id === 'mechanism').text, /trajectory optimization|optimal control/);
  assert.deepEqual(facts.scope, { manuallySelectedFacts: true, independentCorroboration: false,
    fullArticleIncluded: false, publicationFreshnessVerified: false, summaryApproved: false,
    emailAuthorizedByThisArtifact: false });
});

for (const outcome of ['pass', 'changed-source', 'veto', 'bad-hash', 'quota', 'copy']) {
  test(`bounded fact summary ${outcome} cannot send or silently retry`, async () => {
    let requests = 0;
    const result = await diagnoseFactSummary({ publicKey: 'test', accountId: '0'.repeat(32), apiToken: 'test-token',
      now: new Date('2026-09-23T00:00:00Z'), endpoint: 'https://provider.example/fixed',
      articleFetcher: async () => outcome === 'changed-source' ? 'changed' : excerpt,
      sheetLoader: async () => sheet, sealDiagnostic: value => value,
      fetchImpl: async () => ({ ok: true }),
      aiRequestImpl: async options => {
        requests++;
        assert.equal(options.maxAttempts, 1);
        assert.equal(options.model, DEFAULT_CLOUDFLARE_AI_MODEL);
        if (outcome === 'quota') throw Object.assign(new Error('private provider message'), { code: 'QUOTA' });
        const { body } = buildWorkersAiRequest(options);
        await options.fetchImpl('https://provider.example/fixed', { method: 'POST', redirect: 'error', body: JSON.stringify(body) });
        const data = JSON.parse(options.messages[1].content);
        if (requests === 1) {
          assert.ok(Array.isArray(data.facts));
          assert.equal(Object.hasOwn(data, 'sourceExcerpt'), false);
        } else assert.equal(data.passages[0].text, excerpt);
        const payload = requests === 1 ? (outcome === 'copy' ? { ...draft, whatHappened: excerpt.repeat(5) } : draft)
          : { reviewSha256: data.reviewSha256, comparison: 'Synthetic mock only, not a semantic assessment.',
            evidenceIds: ['S1P1'], supported: outcome !== 'veto' };
        return { editorialPayload: payload, provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL,
          attemptCount: 1, responseSha256: 'b'.repeat(64), requestSha256: outcome === 'bad-hash' ? 'a'.repeat(64)
            : hash(JSON.stringify({ provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, body })) };
      } });
    assert.equal(result.report.emailSent, false);
    assert.ok(result.report.outputBudget <= 2800);
    assert.equal(requests, outcome === 'pass' ? 5 : outcome === 'changed-source' ? 0 : outcome === 'veto' ? 2 : 1);
    assert.equal(result.report.status, outcome === 'pass' ? 'draft-awaiting-manual-review' : 'failed');
    assert.ok(!JSON.stringify(result.report).includes('private provider message'));
  });
}
