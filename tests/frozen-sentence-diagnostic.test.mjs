import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { diagnoseFactSummary, normalizeClaimwiseSummary } from '../scripts/automation/fact-summary-diagnostic.mjs';
import { freezeFactBaseline, encodeFrozenBaselineSecret, decodeFrozenBaselineSecret } from '../scripts/automation/free/frozen-fact-baseline.mjs';
import { phraseCopyeditUnitsHash } from '../scripts/automation/free/phrase-copyedit.mjs';
import { buildSentenceRewriteView } from '../scripts/automation/free/sentence-rewrite.mjs';
import { SENTENCE_REWRITE_PROMPT } from '../scripts/automation/free/sentence-rewrite-prompt.mjs';
import { buildIsolatedPreservationReview } from '../scripts/automation/free/isolated-preservation-review.mjs';
import { buildTextPreservationReview } from '../scripts/automation/free/text-preservation-review.mjs';
import { buildDefinitionPreservationReview } from '../scripts/automation/experiments/definition-preservation.mjs';
import { loadDefinitionGlossary, SYNTHETIC_DEFINITION_SOURCE } from '../scripts/automation/experiments/definition-glossaries.mjs';
import { DEFINITION_REVIEW_QUALIFICATION } from '../scripts/automation/experiments/qualified-definition-review.mjs';
import { DEFINITION_FLUENCY_PROMPT } from '../scripts/automation/experiments/definition-fluency-prompt.mjs';
import { buildDefinitionContext } from '../scripts/automation/experiments/definition-context.mjs';
import { requestWorkersAiEditorial, buildWorkersAiRequest, DEFAULT_CLOUDFLARE_AI_MODEL } from '../scripts/automation/free/workers-ai.mjs';
import { prepareFrozenDiagnosticBaseline, resolvePrivateWriterDiagnosticMode, diagnoseOneWriter } from '../scripts/automation/private-writer-diagnostic.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const hash = value => sha(JSON.stringify(value));
const fields = ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch'];
const accountId = '0'.repeat(32);
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`;
// Mock support judgments and invented facts test the plumbing only.
function fixture(definition = false) {
  const raw = { headline: 'MIT describes a research method',
    whatHappened: ['MIT described a research method for studying how a model responds to a fixed collection of tasks under conditions specified by the researchers.',
      'The report explains the procedure and its limits, while separating observations made during the experiment from claims that would require additional testing in other settings.'],
    whyItMatters: ['The account offers a way to discuss the measurements in context, but does not establish that the method will produce the same results for every model.',
      'A reader would need comparable definitions and a matching evaluation procedure before drawing conclusions from differences between this report and measurements published by another team.'],
    whatToWatch: ['Future reports could explain whether the researchers keep the same task definitions and how any changes affect the interpretation of measurements collected during later evaluations.'] };
  if (definition) raw.whatHappened[0] = raw.whatHappened[0].replace('fixed collection of tasks', 'set of binding rules');
  const excerpt = definition ? SYNTHETIC_DEFINITION_SOURCE : 'PRIVATE_SYNTHETIC_EVIDENCE: source placeholder for request testing.\nSecond synthetic passage.';
  const before = normalizeClaimwiseSummary(raw, excerpt, 'MIT');
  const sheet = { sourceUrl: 'https://news.mit.edu/2026/new-method-enables-ai-safety-critical-situations-0914',
    excerptSha256: sha(excerpt), attribution: 'Private synthetic fact context', facts: [] };
  const q = { id: 'synthetic-test-only', status: 'source-qualified-for-private-editing-only', publisher: 'MIT',
    originSelection: 'beforeCopyedit', sourceUrl: sheet.sourceUrl, excerptSha256: sheet.excerptSha256,
    draftSha256: hash(before.draft), unitsSha256: phraseCopyeditUnitsHash(before.units),
    factContextSha256: hash({ attribution: sheet.attribution, facts: sheet.facts }), factSheetSha256: hash(sheet),
    bodyWords: fields.slice(1).map(f => before.draft[f]).join(' ').split(/\s+/u).length,
    review: { verdict: 'supported-by-captured-source', evidenceMap: fields.flatMap(field =>
      before.units[field].map((_, unitIndex) => ({ field, unitIndex, passageIds: ['P1'] }))) } };
  const source = { url: sheet.sourceUrl, excerpt, excerptSha256: sha(excerpt) };
  const diagnostic = { source, beforeCopyedit: { ...before, draftSha256: q.draftSha256, unitsSha256: q.unitsSha256 } };
  const pins = JSON.stringify(q);
  return { raw, before, excerpt, pins, text: freezeFactBaseline(JSON.stringify(diagnostic), JSON.stringify(sheet), pins) };
}
async function run({ rejectAt = -1, rejection = '', mutateInput, mutateProposal, changedFields = fields.slice(1),
  definition = false, glossaryLoader, sourceMismatch = false } = {}) {
  const f = fixture(definition && !sourceMismatch), requests = [], network = [];
  const glossary = definition ? loadDefinitionGlossary('synthetic-generation-definitions-v1', SYNTHETIC_DEFINITION_SOURCE) : null;
  const catalog = buildSentenceRewriteView(f.before.units);
  const rawAfter = structuredClone(f.raw);
  for (const field of changedFields) {
    const pair = { whatHappened: ['research method', 'research approach'], whyItMatters: ['discuss', 'describe'], whatToWatch: ['explain', 'describe'] }[field];
    rawAfter[field][0] = rawAfter[field][0].replace(...pair);
  }
  const after = normalizeClaimwiseSummary(rawAfter, f.excerpt, 'MIT');
  const proposal = { baselineSha256: catalog.data.baselineSha256, decision: 'rewrite',
    sentences: catalog.data.units.map(u => ({ unitId: u.unitId, text: after.units[u.field][u.unitIndex] })) };
  if (mutateProposal) mutateProposal(proposal);
  let input = f.text;
  if (mutateInput) { const a = JSON.parse(input); mutateInput(a); input = JSON.stringify(a); }
  const result = await diagnoseFactSummary({ publicKey: 'synthetic', accountId, apiToken: 'PRIVATE_TOKEN',
    endpoint, now: new Date('2026-09-25T20:00:00Z'), claimwise: true, profile: 'mit-generalization',
    sentenceLanguageRewrite: true, frozenBaselineText: input, qualificationLoader: async () => f.pins,
    definitionPreservation: definition,
    ...(definition ? { definitionGlossaryLoader: glossaryLoader ?? (() => glossary) } : {}),
    articleFetcher: () => assert.fail('Frozen trials must not fetch a fresh article'),
    sheetLoader: () => assert.fail('Frozen trials must use pinned fact context'), sealDiagnostic: v => v,
    aiRequestImpl: async request => {
      const index = requests.length; requests.push(request);
      assert.equal(request.model, DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(request.maxAttempts, 1);
      assert.equal(request.maxTokens, index === 0 ? 1200 : 600);
      assert.equal(request.timeoutMs, index === 0 ? 90000 : 30000);
      assert.equal(request.temperature, 0.1);
      const { body } = buildWorkersAiRequest(request);
      const init = { method: 'POST', redirect: 'error', body: JSON.stringify(body) };
      if (index === rejectAt && rejection === 'extra-network') {
        try { await request.fetchImpl('https://not-approved.example/', init); } catch { /* Must remain denied. */ }
      }
      const answer = await requestWorkersAiEditorial(request);
      if (index === rejectAt && rejection === 'provenance') answer.requestSha256 = '0'.repeat(64);
      if (index === rejectAt && rejection === 'retry') {
        try { await request.fetchImpl(endpoint, init); } catch { /* Sticky denial must propagate. */ }
      }
      return answer;
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, endpoint); assert.equal(init.redirect, 'error');
      const index = requests.length - 1, request = requests[index], body = JSON.parse(init.body);
      const data = JSON.parse(body.messages[1].content);
      network.push({ url, body });
      if (index === rejectAt && rejection === 'quota') return new Response(JSON.stringify({ success: false,
        errors: [{ code: 3036, message: 'PRIVATE_QUOTA_DETAIL' }] }), { status: 429 });
      let payload;
      if (index === 0) {
        assert.equal(request.messages[0].content, `${definition ? DEFINITION_FLUENCY_PROMPT : SENTENCE_REWRITE_PROMPT}\nJSON schema: ${JSON.stringify(catalog.schema)}`);
        assert.deepEqual(data, { catalog: catalog.data, attribution: 'Private synthetic fact context', facts: [],
          ...(definition ? buildDefinitionContext(catalog.data.units.map(unit => unit.text), glossary) : {}) });
        payload = proposal;
      } else {
        const meaning = ['text-only-preservation-v1', 'definition-preservation-offline-v1'].includes(data.policy);
        const field = fields.find(k => JSON.stringify(after.units[k]) === JSON.stringify(data.claims.map(c => c.text)));
        assert.ok(field);
        const view = meaning ? (definition
          ? buildDefinitionPreservationReview({ claims: after.units[field], previousClaims: f.before.units[field] }, glossary)
          : buildTextPreservationReview({ claims: after.units[field], previousClaims: f.before.units[field] }))
          : buildIsolatedPreservationReview({ text: after.draft[field], claims: after.units[field],
            sources: [{ publisher: 'MIT', passages: f.excerpt.split('\n').map((text, i) => ({ evidenceId: `S1P${i + 1}`, text })) }] }, 'source');
        assert.deepEqual(data, view.data);
        assert.equal(request.messages[0].content, `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`);
        if (meaning) assert.equal(Object.hasOwn(data, 'passages'), false);
        else assert.equal(Object.hasOwn(data, 'previousClaims'), false);
        payload = { reviewSha256: data.reviewSha256, judgments: data.claims.map(c => ({ claimId: c.claimId,
          comparison: 'Synthetic verdict, not semantic qualification.', ...(!meaning ? { evidenceIds: ['S1P1'] } : {}),
          [meaning ? 'meaningPreserved' : 'sourceSupported']: !(index === rejectAt && rejection === 'false') })) };
        if (index === rejectAt && rejection === 'malformed') payload.judgments.pop();
      }
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(payload) }, errors: [] }),
        { headers: { 'content-type': 'application/json' } });
    } });
  assert.equal(result.report.modelRequests, requests.length);
  assert.equal(result.report.networkRequests, network.length);
  assert.ok(requests.length <= 8 && result.report.outputBudget <= 5400);
  assert.equal(result.report.emailSent, false); assert.equal(result.report.searchQueries, 0);
  assert.doesNotMatch(JSON.stringify(result.report), /PRIVATE_|Private synthetic/);
  return { ...result, requests, network, f, after };
}

test('frozen trial skips writing and discovery, with eight bound requests and all final review gates', async () => {
  const r = await run();
  assert.equal(r.report.status, 'draft-awaiting-manual-review');
  assert.equal(r.report.mode, 'frozen-sentence-language-rewrite-awaiting-manual-review');
  assert.equal(r.report.modelRequests, 8); assert.equal(r.report.outputBudget, 5400);
  assert.deepEqual(r.report.fieldsPassed, fields);
  assert.equal(r.sealed.writerSkipped, true);
  assert.equal(r.sealed.copyeditStrategy, 'sentence-by-sentence-v1');
  assert.equal(r.sealed.copyeditPromptSha256, sha(SENTENCE_REWRITE_PROMPT));
  assert.equal(r.sealed.promptSha256, undefined, 'Must not attribute a writer request that never happened');
  assert.deepEqual(r.sealed.beforeCopyedit.draft, r.f.before.draft);
  assert.deepEqual(r.sealed.draft, r.after.draft);
  assert.equal(r.sealed.draft.headline, r.f.raw.headline);
  assert.equal(r.sealed.calls.filter(c => c.dimension === 'source').length, 4);
  assert.equal(r.sealed.calls.filter(c => c.dimension === 'meaning').length, 3);
  assert.deepEqual(r.sealed.localReviews.map(v => v.field), ['headline']);
  r.sealed.calls.forEach((call, i) => {
    const { body } = buildWorkersAiRequest(r.requests[i]);
    assert.equal(call.requestSha256, hash({ provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, body }));
    assert.equal(call.promptSha256, sha(r.requests[i].messages[0].content));
    assert.equal(call.stage, i === 0 ? 'copyedit' : 'review');
  });
});
test('unchanged fields retain source checks and use only local exact-text meaning checks', async () => {
  const r = await run({ changedFields: ['whatHappened'] });
  assert.equal(r.report.status, 'draft-awaiting-manual-review');
  assert.equal(r.report.modelRequests, 6); assert.equal(r.report.outputBudget, 4200);
  assert.deepEqual(r.sealed.localReviews.map(v => v.field), ['headline', 'whyItMatters', 'whatToWatch']);
  assert.equal(r.sealed.calls.filter(c => c.dimension === 'source').length, 4);
});
test('every source and meaning veto holds the result without inherited baseline approval', async () => {
  for (const rejection of ['false', 'malformed']) for (const rejectAt of [1, 2, 3, 4, 5, 6, 7]) {
    const r = await run({ rejection, rejectAt });
    assert.equal(r.report.code, 'FACT_SUMMARY_REVIEW_REJECTED');
    assert.equal(r.sealed.fieldReviews.at(-1).verdict.supported, false);
    assert.equal(r.requests.length, rejectAt + 1 + Number(rejection === 'false' && [2, 4, 6].includes(rejectAt)));
  }
});
test('edited input and source drift stop before any provider request', async () => {
  for (const mutateInput of [a => { a.units.headline[0] += ' changed'; }, a => { a.source.excerpt += ' extra'; },
    a => { a.factContext.attribution = 'Different'; }, a => { a.qualificationSha256 = '0'.repeat(64); }]) {
    const r = await run({ mutateInput });
    assert.equal(r.report.status, 'failed'); assert.equal(r.requests.length, 0);
    assert.deepEqual(r.report.fieldsPassed, []);
  }
});
test('rewrite shape and length failure or abstention cannot become a reviewed result', async () => {
  for (const mutateProposal of [p => { p.sentences.pop(); }, p => { p.sentences.reverse(); },
    p => { p.sentences.forEach((s, i) => { s.text = `MIT short unit ${i}.`; }); }]) {
    const r = await run({ mutateProposal });
    assert.equal(r.report.status, 'failed'); assert.equal(r.requests.length, 1);
    assert.deepEqual(r.sealed.fieldReviews, []);
  }
  const r = await run({ changedFields: [], mutateProposal: p => { p.decision = 'abstain'; } });
  assert.equal(r.report.code, 'FACT_SUMMARY_COPYEDIT_ABSTAINED'); assert.equal(r.requests.length, 1);
});
test('free-provider denial, quota and provenance failures cannot retry or switch endpoints', async () => {
  for (const rejection of ['quota', 'provenance', 'retry', 'extra-network']) {
    const r = await run({ rejectAt: 0, rejection });
    assert.equal(r.report.status, 'failed'); assert.equal(r.requests.length, 1);
    assert.equal(r.network.length, rejection === 'extra-network' ? 0 : 1);
    assert.deepEqual(r.sealed.fieldReviews, []);
  }
});
test('base64 is canonical bounded transport, not self-authentication or encryption', async () => {
  const f = fixture();
  const encoded = encodeFrozenBaselineSecret(f.text, f.pins);
  assert.equal(decodeFrozenBaselineSecret(`\n${encoded}\n`), f.text);
  for (const bad of [undefined, '', '{}', 'not+base64', 'AA', 'a'.repeat(48003), Buffer.from([255]).toString('base64')]) {
    assert.throws(() => decodeFrozenBaselineSecret(bad));
  }
  await assert.rejects(prepareFrozenDiagnosticBaseline('frozen-sentence-language', encoded), /FROZEN_BASELINE_/,
    'Synthetic pins are not accepted by the fixed CLI loader');
  await assert.rejects(prepareFrozenDiagnosticBaseline('source', encoded), /UNEXPECTED_BASELINE/);
  assert.equal(await prepareFrozenDiagnosticBaseline('source', ''), undefined);
  assert.equal(resolvePrivateWriterDiagnosticMode('frozen-sentence-language'), 'frozen-sentence-language');
  assert.equal(resolvePrivateWriterDiagnosticMode('frozen-definition-language'), 'frozen-definition-language');
  await assert.rejects(prepareFrozenDiagnosticBaseline('frozen-definition-language', encoded), /FROZEN_BASELINE_/);
});
test('frozen mode cannot silently enter another diagnostic path or use unvalidated text', async () => {
  for (const options of [{ sentenceLanguageRewrite: false }, { frozenBaselineText: null }, { plainLanguageCopyedit: true },
    { definitionPreservation: true, frozenBaselineText: undefined }, { definitionPreservation: 'true' },
    { definitionPreservation: true, profile: 'anthropic' }, { definitionPreservation: true, claimwise: false }]) {
    await assert.rejects(diagnoseFactSummary({ profile: 'mit-generalization', claimwise: true,
      sentenceLanguageRewrite: true, frozenBaselineText: fixture().text, ...options }), /FACT_SUMMARY_MODE/);
  }
  await assert.rejects(diagnoseOneWriter({ mode: 'frozen-sentence-language', publicKey: 'invalid',
    aiRequestImpl: () => assert.fail('No inference') }), /DIAGNOSTIC_KEY_INVALID/);
});
test('workflow keeps private input in a mode-scoped secret and validates before provider credentials', async () => {
  const workflow = await readFile(new URL('../.github/workflows/private-writer-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /- frozen-sentence-language/);
  assert.equal((workflow.match(/FIRST_FOLD_FROZEN_BASELINE_B64: \$\{\{ \(inputs.mode == 'frozen-sentence-language' \|\| inputs.mode == 'frozen-definition-language'\) && secrets.FIRST_FOLD_FROZEN_BASELINE_B64 \|\| '' \}\}/gu) ?? []).length, 2);
  assert.ok(workflow.indexOf('private-writer-diagnostic.mjs validate') < workflow.indexOf('CLOUDFLARE_AI_API_TOKEN:'));
  const validateStep = workflow.slice(workflow.indexOf('- name: Validate diagnostic mode'), workflow.indexOf('- name: Inspect the selected'));
  assert.doesNotMatch(validateStep, /CLOUDFLARE_AI_API_TOKEN|RESEND|GITHUB_TOKEN/);
  assert.doesNotMatch(workflow, /inputs\.baseline|RESEND|OPENAI_API_KEY|contents: write|actions: write/);
  assert.match(workflow, /tests\/frozen-sentence-diagnostic.test.mjs/);
  assert.match(workflow, /- frozen-definition-language/);
});

test('definition trial selects only the fluency editor while retaining qualified source and meaning gates', async () => {
  const r = await run({ definition: true });
  assert.equal(r.report.status, 'draft-awaiting-manual-review');
  assert.equal(r.report.mode, 'frozen-definition-language-rewrite-awaiting-manual-review');
  assert.equal(r.report.modelRequests, 8); assert.equal(r.report.outputBudget, 5400);
  assert.deepEqual(r.report.fieldsPassed, fields);
  assert.deepEqual(r.sealed.reviewerQualification, DEFINITION_REVIEW_QUALIFICATION);
  assert.equal(r.sealed.glossaryBinding.sourceSha256, sha(r.f.excerpt));
  assert.equal(r.sealed.reviewStrategy, 'isolated-source-plus-qualified-definition-preservation-v1');
  assert.equal(r.sealed.copyeditStrategy, 'sentence-definition-context-v1');
  assert.equal(r.sealed.copyeditPromptSha256, sha(DEFINITION_FLUENCY_PROMPT));
  assert.equal(r.sealed.draft.headline, r.f.raw.headline);
  assert.deepEqual(r.sealed.beforeCopyedit.draft, r.f.before.draft);
  assert.deepEqual(r.sealed.draft, r.after.draft);
  assert.equal(r.sealed.calls.filter(c => c.dimension === 'source').length, 4);
  const meaning = r.sealed.calls.filter(c => c.dimension === 'meaning');
  assert.equal(meaning.length, 3);
  assert.deepEqual(meaning[0].request.definitions.map(d => d.term), ['binding rules']);
  const editor = r.sealed.calls[0].request;
  assert.deepEqual(editor.definitions, meaning[0].request.definitions);
  assert.deepEqual(editor.glossaryBinding, meaning[0].request.glossaryBinding);
  assert.deepEqual(Object.keys(editor).sort(), ['attribution', 'catalog', 'definitions', 'facts', 'glossaryBinding']);
  assert.deepEqual(meaning.slice(1).map(c => c.request.definitions), [[], []]);
  assert.deepEqual(r.sealed.localReviews.map(v => v.field), ['headline']);
  for (const call of meaning) {
    assert.equal(call.request.policy, 'definition-preservation-offline-v1');
    assert.equal(call.request.passages, undefined);
    assert.equal(call.request.glossaryBinding.manifestSha256, r.sealed.glossaryBinding.manifestSha256);
  }
});
test('legacy frozen editor inputs and prompts do not receive experimental vocabulary context', async () => {
  const r = await run();
  assert.deepEqual(Object.keys(r.sealed.calls[0].request).sort(), ['attribution', 'catalog', 'facts']);
  assert.equal(r.sealed.copyeditPromptSha256, sha(SENTENCE_REWRITE_PROMPT));
});
test('definition trial still source-checks identical fields; local identity does not become glossary approval', async () => {
  const r = await run({ definition: true, changedFields: ['whatHappened'] });
  assert.equal(r.report.status, 'draft-awaiting-manual-review');
  assert.equal(r.report.modelRequests, 6);
  assert.equal(r.sealed.calls.filter(c => c.dimension === 'source').length, 4);
  assert.equal(r.sealed.calls.filter(c => c.dimension === 'meaning').length, 1);
  assert.deepEqual(r.sealed.localReviews.map(v => v.field), ['headline', 'whyItMatters', 'whatToWatch']);
  for (const local of r.sealed.localReviews) assert.equal(local.request.policy, 'text-only-preservation-v1');
});
test('every source and definition-meaning veto or malformed verdict holds the new trial', async () => {
  for (const rejection of ['false', 'malformed']) for (const rejectAt of [1, 2, 3, 4, 5, 6, 7]) {
    const r = await run({ definition: true, rejection, rejectAt });
    assert.equal(r.report.code, 'FACT_SUMMARY_REVIEW_REJECTED');
    assert.equal(r.sealed.fieldReviews.at(-1).verdict.supported, false);
  }
});
test('new trial rejects unknown, cloned or wrong-source glossaries before the editor', async () => {
  for (const glossaryLoader of [() => ({}), () => structuredClone(loadDefinitionGlossary('synthetic-generation-definitions-v1', SYNTHETIC_DEFINITION_SOURCE)),
    () => { throw new Error('unavailable'); }]) {
    const r = await run({ definition: true, glossaryLoader });
    assert.equal(r.report.status, 'failed'); assert.equal(r.requests.length, 0);
  }
  const r = await run({ definition: true, mutateInput: a => { a.source.excerpt += ' drift'; } });
  assert.equal(r.report.status, 'failed'); assert.equal(r.requests.length, 0);
  const mismatch = await run({ definition: true, sourceMismatch: true });
  assert.equal(mismatch.report.code, 'DEFINITION_GLOSSARY_BINDING'); assert.equal(mismatch.requests.length, 0);
});
test('new trial keeps structure, length, abstention and free-provider failure gates', async () => {
  for (const mutateProposal of [p => { p.sentences.reverse(); }, p => { p.sentences.pop(); },
    p => { p.sentences.forEach((s, i) => { s.text = `MIT short unit ${i}.`; }); }]) {
    const r = await run({ definition: true, mutateProposal });
    assert.equal(r.report.status, 'failed'); assert.equal(r.requests.length, 1);
  }
  const abstained = await run({ definition: true, changedFields: [], mutateProposal: p => { p.decision = 'abstain'; } });
  assert.equal(abstained.report.code, 'FACT_SUMMARY_COPYEDIT_ABSTAINED');
  for (const rejection of ['quota', 'provenance', 'retry', 'extra-network']) {
    const r = await run({ definition: true, rejectAt: 3, rejection });
    assert.equal(r.report.status, 'failed'); assert.equal(r.requests.length, 4);
  }
});
