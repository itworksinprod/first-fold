import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { diagnoseFactSummary, normalizeClaimwiseSummary } from '../scripts/automation/fact-summary-diagnostic.mjs';
import { buildSentenceRewriteView } from '../scripts/automation/free/sentence-rewrite.mjs';
import { buildIsolatedPreservationReview } from '../scripts/automation/free/isolated-preservation-review.mjs';
import { buildTextPreservationReview, exactTextPreservation } from '../scripts/automation/free/text-preservation-review.mjs';
import { buildWorkersAiRequest, requestWorkersAiEditorial, DEFAULT_CLOUDFLARE_AI_MODEL } from '../scripts/automation/free/workers-ai.mjs';
import { resolvePrivateWriterDiagnosticMode } from '../scripts/automation/private-writer-diagnostic.mjs';
import { GENERIC_FACT_SUMMARY_PROMPT } from '../scripts/automation/free/generic-fact-summary-prompt.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const fields = ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch'];
const excerpt = 'Synthetic evidence for request plumbing only, not factual or semantic qualification.';
const writer = {
  headline: 'MIT describes a method for studying model responses',
  whatHappened: [
    'MIT described a research method for studying how a model responds to a fixed collection of tasks under conditions specified by the researchers.',
    'The report explains the procedure and its limits, while separating observations made during the experiment from claims that would require additional testing in other settings.',
  ],
  whyItMatters: [
    'The account offers a way to discuss the measurements in context, but does not establish that the method will produce the same results for every model.',
    'A reader would need comparable definitions and a matching evaluation procedure before drawing conclusions from differences between this report and measurements published by another team.',
  ],
  whatToWatch: [
    'Future reports could explain whether the researchers keep the same task definitions and how any changes affect the interpretation of measurements collected during later evaluations.',
    'The article leaves those broader questions open and does not provide an independent demonstration of improved safety or productivity in systems used beyond the reported experiment.',
  ],
};
const sheet = { sourceUrl: 'https://news.mit.edu/2026/new-method-enables-ai-safety-critical-situations-0914', publisherKey: 'mit',
  status: 'manually-reviewed-source-backed-facts-not-an-edition', excerptSha256: hash(excerpt), attribution: 'Synthetic fixture', facts: [] };
const accountId = '0'.repeat(32);
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${DEFAULT_CLOUDFLARE_AI_MODEL}`;
const substitutions = { whatHappened: ['described a research method', 'reported a research method'],
  whyItMatters: ['offers a way', 'provides a way'], whatToWatch: ['could explain', 'may explain'] };
function changedWriter(changedFields = fields.slice(1)) {
  const after = structuredClone(writer);
  for (const field of changedFields) after[field][0] = after[field][0].replace(...substitutions[field]);
  return after;
}

async function run({ changedFields, proposalMutation, rejectAt = -1, rejection, options = {} } = {}) {
  const before = normalizeClaimwiseSummary(writer, excerpt, 'MIT');
  const after = normalizeClaimwiseSummary(changedWriter(changedFields), excerpt, 'MIT');
  const view = buildSentenceRewriteView(before.units), requests = [], network = [], metadata = [];
  let getterReads = 0;
  const answer = (data, index) => {
    if (index === 0) return structuredClone(writer);
    if (index === 1) {
      const proposal = { baselineSha256: view.data.baselineSha256, decision: 'rewrite',
        sentences: view.data.units.map(unit => ({ unitId: unit.unitId, text: after.units[unit.field][unit.unitIndex] })) };
      if (proposalMutation) proposalMutation(proposal);
      return proposal;
    }
    const meaning = data.policy === 'text-only-preservation-v1';
    const field = fields.find(key => JSON.stringify(after.units[key]) === JSON.stringify(data.claims.map(claim => claim.text)));
    assert.ok(field, 'Every reviewed claim must come from the final fixed inventory');
    const role = meaning ? 'meaning' : 'source';
    metadata[index] = { field, dimension: role };
    const expectedView = meaning ? buildTextPreservationReview({ claims: after.units[field], previousClaims: before.units[field] })
      : buildIsolatedPreservationReview({ text: after.draft[field], claims: after.units[field],
        sources: [{ publisher: 'MIT', passages: [{ evidenceId: 'S1P1', text: excerpt }] }] }, 'source');
    assert.deepEqual(data, expectedView.data);
    assert.deepEqual(requests[index].schema, expectedView.schema);
    assert.equal(requests[index].messages[0].content, `${expectedView.prompt}\nJSON schema: ${JSON.stringify(expectedView.schema)}`);
    if (meaning) assert.deepEqual(Object.keys(data), ['policy', 'claims', 'previousClaims', 'reviewSha256']);
    else assert.equal(Object.hasOwn(data, 'previousClaims'), false);
    const response = { reviewSha256: data.reviewSha256, judgments: data.claims.map(({ claimId }) => ({
      claimId, comparison: 'Synthetic answer for plumbing only, not semantic qualification.',
      ...(!meaning ? { evidenceIds: ['S1P1'] } : {}),
      [meaning ? 'meaningPreserved' : 'sourceSupported']: !(index === rejectAt && rejection === 'false'),
    })) };
    if (index === rejectAt && rejection === 'malformed') response.judgments.pop();
    return response;
  };
  const result = await diagnoseFactSummary({ publicKey: 'mock', accountId, apiToken: 'PRIVATE_TEST_TOKEN',
    now: new Date('2026-09-25T04:00:00Z'), endpoint, claimwise: true, profile: 'mit-generalization',
    sentenceLanguageRewrite: true, ...options, sealDiagnostic: value => value,
    articleFetcher: async input => { assert.deepEqual(input, { url: sheet.sourceUrl, publisherKey: 'mit' }); return excerpt; },
    sheetLoader: async () => sheet,
    aiRequestImpl: async request => {
      const index = requests.length; requests.push(request);
      assert.equal(request.maxAttempts, 1);
      assert.equal(request.maxTokens, index < 2 ? 1200 : 600);
      assert.equal(request.timeoutMs, index < 2 ? 90000 : 30000);
      assert.equal(request.model, DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(request.temperature, 0.1);
      assert.equal(request.maxRequestBytes, 70000);
      const data = JSON.parse(request.messages[1].content), { body } = buildWorkersAiRequest(request);
      const init = { method: 'POST', redirect: 'error', body: JSON.stringify(body) };
      assert.doesNotMatch(JSON.stringify(request.messages), /Synthetic answer for plumbing|PRIVATE_TEST_TOKEN/);
      if (index === 0) assert.equal(request.messages[0].content.split('\nJSON schema:')[0], GENERIC_FACT_SUMMARY_PROMPT);
      if (index === 1) {
        assert.deepEqual(data, { catalog: view.data, attribution: sheet.attribution, facts: sheet.facts });
        assert.deepEqual(request.schema, view.schema);
      }
      if (index === rejectAt && rejection === 'skip') return { editorialPayload: answer(data, index),
        provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, attemptCount: 1,
        responseSha256: 'b'.repeat(64), requestSha256: hash(JSON.stringify({ provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, body })) };
      if (index === rejectAt && rejection === 'swallowed') {
        try { await request.fetchImpl('https://unapproved.example/', init); } catch { /* Must stay terminal. */ }
      }
      const response = await requestWorkersAiEditorial(request);
      if (index === rejectAt && rejection === 'repeat') {
        try { await request.fetchImpl(endpoint, init); } catch { /* Must stay terminal. */ }
      }
      if (index === rejectAt && rejection === 'provenance') response.requestSha256 = '0'.repeat(64);
      if (index === rejectAt && rejection === 'attempt') response.attemptCount = 2;
      if (index === rejectAt && rejection === 'getter') Object.defineProperty(response.editorialPayload.judgments[0], 'comparison',
        { enumerable: true, get() { getterReads++; return 'Do not invoke'; } });
      return response;
    }, fetchImpl: async (url, init) => {
      assert.equal(url, endpoint); assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
      const index = requests.length - 1, body = JSON.parse(init.body), data = JSON.parse(body.messages[1].content);
      network.push({ index, body });
      if (index === rejectAt && rejection === 'quota') return new Response(JSON.stringify({ success: false,
        errors: [{ code: 3036, message: 'PRIVATE_QUOTA_DETAIL' }] }), { status: 429 });
      return new Response(JSON.stringify({ success: true, result: { response: JSON.stringify(answer(data, index)) }, errors: [] }),
        { headers: { 'content-type': 'application/json' } });
    } });
  assert.ok(requests.length <= 9 && network.length <= 9);
  assert.equal(result.report.modelRequests, requests.length);
  assert.equal(result.report.networkRequests, network.length);
  assert.equal(result.report.outputBudget, requests.reduce((sum, request) => sum + request.maxTokens, 0));
  assert.ok(result.report.outputBudget <= 6600);
  assert.equal(result.report.emailSent, false); assert.equal(result.report.searchQueries, 0);
  assert.doesNotMatch(JSON.stringify(result.report), /PRIVATE_QUOTA_DETAIL|Synthetic fixture|PRIVATE_TEST_TOKEN/);
  assert.equal(getterReads, 0);
  assert.ok(Buffer.byteLength(JSON.stringify(result.sealed)) <= 350000);
  return { ...result, before, after, view, requests, network, metadata };
}

test('one sentence rewrite pass uses nine bounded calls and independent final source/meaning gates', async () => {
  const result = await run();
  assert.equal(result.report.status, 'draft-awaiting-manual-review');
  assert.equal(result.report.mode, 'sentence-language-rewrite-awaiting-manual-review');
  assert.equal(result.report.modelRequests, 9); assert.equal(result.report.outputBudget, 6600);
  assert.deepEqual(result.report.fieldsPassed, fields);
  assert.equal(result.sealed.copyeditStrategy, 'sentence-by-sentence-v1');
  assert.equal(result.sealed.reviewStrategy, 'isolated-source-plus-text-preservation-v1');
  assert.equal(result.sealed.copyeditDecision, 'rewrite');
  assert.deepEqual(result.sealed.copyeditCatalog, result.view.data);
  assert.deepEqual(result.sealed.beforeCopyedit.units, result.before.units);
  assert.deepEqual(result.sealed.reviewUnits, result.after.units);
  assert.deepEqual(result.sealed.draft, result.after.draft);
  assert.equal(result.sealed.editsApplied.length, 3);
  assert.equal(result.sealed.draft.headline, writer.headline);
  assert.deepEqual(result.sealed.localReviews.map(review => review.field), ['headline']);
  assert.deepEqual(result.sealed.localReviews[0].verdict, exactTextPreservation(buildTextPreservationReview({
    claims: result.before.units.headline, previousClaims: result.before.units.headline })));
  for (const [index, call] of result.sealed.calls.entries()) {
    const { body } = buildWorkersAiRequest(result.requests[index]);
    assert.equal(call.requestSha256, hash(JSON.stringify({ provider: 'cloudflare-workers-ai', model: DEFAULT_CLOUDFLARE_AI_MODEL, body })));
    assert.equal(call.promptSha256, hash(result.requests[index].messages[0].content));
    assert.equal(call.provider, 'cloudflare-workers-ai'); assert.equal(call.model, DEFAULT_CLOUDFLARE_AI_MODEL);
    assert.equal(call.attemptCount, 1); assert.match(call.responseSha256, /^[a-f0-9]{64}$/u);
    if (index > 1) { assert.equal(call.field, result.metadata[index].field); assert.equal(call.dimension, result.metadata[index].dimension); }
  }
  for (const review of result.sealed.fieldReviews) assert.deepEqual(review.verdict,
    { valid: true, supported: true, sourceSupported: true, meaningPreserved: true });
});

test('unchanged units use only exact identity while every field still requires source review', async () => {
  const result = await run({ changedFields: ['whatHappened'] });
  assert.equal(result.report.modelRequests, 7); assert.equal(result.report.outputBudget, 5400);
  assert.deepEqual(result.sealed.localReviews.map(review => review.field), ['headline', 'whyItMatters', 'whatToWatch']);
  assert.equal(result.sealed.calls.filter(call => call.dimension === 'source').length, 4);
  assert.equal(result.sealed.calls.filter(call => call.dimension === 'meaning').length, 1);
  for (const local of result.sealed.localReviews) assert.equal(local.verdict.method, 'exact-text-identity');
});

test('every source and changed-meaning judgment can reject without inherited approval or later work', async () => {
  for (const rejection of ['false', 'malformed', 'getter']) for (const rejectAt of [2, 3, 4, 5, 6, 7, 8]) {
    const result = await run({ rejectAt, rejection });
    const fieldIndex = rejectAt === 2 ? 0 : Math.floor((rejectAt - 1) / 2);
    const falseSourceNeedsMeaning = rejection === 'false' && [3, 5, 7].includes(rejectAt);
    assert.equal(result.report.code, 'FACT_SUMMARY_REVIEW_REJECTED');
    assert.equal(result.requests.length, rejectAt + 1 + Number(falseSourceNeedsMeaning));
    assert.deepEqual(result.report.fieldsPassed, fields.slice(0, fieldIndex));
    const failed = result.sealed.fieldReviews.at(-1);
    assert.equal(failed.field, fields[fieldIndex]); assert.equal(failed.verdict.supported, false);
    if (rejection !== 'false' && [2, 3, 5, 7].includes(rejectAt)) {
      assert.equal(failed.meaning, null); assert.equal(failed.source.response, null);
      assert.ok(!result.sealed.localReviews.some(review => review.field === failed.field));
    }
    if (falseSourceNeedsMeaning) {
      assert.equal(failed.verdict.sourceSupported, false); assert.equal(failed.verdict.meaningPreserved, true);
    }
  }
});

test('malformed rewrite bindings, inventory, headline or final length hold before factual calls', async () => {
  const mutations = [
    p => { p.baselineSha256 = '0'.repeat(64); }, p => { p.sentences.reverse(); }, p => { p.sentences.pop(); },
    p => { p.sentences[0].unitId = 'U99'; }, p => { p.sentences[1].unitId = p.sentences[0].unitId; },
    p => { p.headline = 'Changed headline'; }, p => { p.sentences[0].extra = true; },
    p => { p.sentences[0].text = '<script>'; }, p => { p.decision = 'repair'; },
  ];
  for (const proposalMutation of mutations) {
    const result = await run({ proposalMutation });
    assert.equal(result.report.status, 'failed'); assert.match(result.report.code, /^FACT_SUMMARY_SENTENCE_REWRITE_/);
    assert.equal(result.requests.length, 2); assert.deepEqual(result.sealed.fieldReviews, []);
    assert.deepEqual(result.sealed.localReviews, []); assert.equal(result.sealed.draft, undefined);
  }
  const short = await run({ proposalMutation: p => p.sentences.forEach((unit, i) => { unit.text = `MIT synthetic unit ${i}.`; }) });
  assert.equal(short.report.code, 'FACT_SUMMARY_LENGTH'); assert.equal(short.requests.length, 2);
  assert.deepEqual(short.sealed.fieldReviews, []);
  const long = await run({ proposalMutation: p => p.sentences.forEach(unit => {
    unit.text = `MIT ${Array.from({ length: 45 }, (_, i) => `token${i}`).join(' ')} ${unit.unitId}.`;
  }) });
  assert.equal(long.report.code, 'FACT_SUMMARY_LENGTH'); assert.equal(long.requests.length, 2);
  assert.deepEqual(long.sealed.fieldReviews, []);
  const abstained = await run({ changedFields: [], proposalMutation: p => { p.decision = 'abstain'; } });
  assert.equal(abstained.report.code, 'FACT_SUMMARY_COPYEDIT_ABSTAINED');
  assert.equal(abstained.requests.length, 2); assert.equal(abstained.sealed.copyeditDecision, 'abstain');
  assert.deepEqual(abstained.sealed.fieldReviews, []); assert.equal(abstained.sealed.draft, undefined);
});

test('transport attempts and provenance cannot bypass the fixed source checks or nine-call cap', async () => {
  for (const rejection of ['skip', 'swallowed', 'provenance', 'attempt', 'quota', 'repeat']) {
    const rejectAt = rejection === 'repeat' ? 8 : 2;
    const result = await run({ rejectAt, rejection });
    assert.equal(result.report.status, 'failed'); assert.equal(result.requests.length, rejectAt + 1);
    if (['skip', 'repeat'].includes(rejection)) assert.equal(result.report.code, 'FACT_SUMMARY_NETWORK', rejection);
    // The real provider adapter wraps the second sticky denial; the generic
    // failure must still block all forwarding, later work and local identities.
    if (rejection === 'swallowed') assert.equal(result.report.code, 'FACT_SUMMARY_FAILED');
    if (['provenance', 'attempt'].includes(rejection)) assert.equal(result.report.code, 'FACT_SUMMARY_PROVENANCE');
    assert.equal(result.network.length, rejectAt + Number(!['skip', 'swallowed'].includes(rejection)));
    if (rejectAt === 2) { assert.deepEqual(result.report.fieldsPassed, []); assert.deepEqual(result.sealed.localReviews, []); }
    const saved = result.requests.at(-1), { body } = buildWorkersAiRequest(saved), count = result.network.length;
    await assert.rejects(saved.fetchImpl(endpoint, { method: 'POST', redirect: 'error', body: JSON.stringify(body) }),
      error => error.code === 'FACT_SUMMARY_NETWORK');
    assert.equal(result.network.length, count);
  }
});

test('sentence rewriting is opt-in, MIT claimwise-only, mutually exclusive and explicitly routed', async () => {
  for (const options of [{ sentenceLanguageRewrite: 'true' }, { sentenceLanguageRewrite: null },
    { sentenceLanguageRewrite: true, claimwise: false }, { sentenceLanguageRewrite: true, profile: 'anthropic' },
    { sentenceLanguageRewrite: true, plainLanguageCopyedit: true }]) {
    await assert.rejects(diagnoseFactSummary({ claimwise: true, profile: 'mit-generalization', ...options,
      articleFetcher: () => assert.fail('No evidence fetch'), sheetLoader: () => assert.fail('No sheet load'),
      aiRequestImpl: () => assert.fail('No inference'), sealDiagnostic: () => assert.fail('No capture') }),
    error => error.code === 'FACT_SUMMARY_MODE');
  }
  assert.equal(resolvePrivateWriterDiagnosticMode('sentence-language-second-article'), 'sentence-language-second-article');
  const source = await readFile(new URL('../scripts/automation/private-writer-diagnostic.mjs', import.meta.url), 'utf8');
  assert.match(source, /sentenceLanguageRewrite:\s*mode === ['"]sentence-language-second-article['"]/);
  assert.match(source, /plainLanguageCopyedit:\s*mode === ['"]plain-language-second-article['"]/);
});
