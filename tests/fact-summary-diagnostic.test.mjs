import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { diagnoseFactSummary, validateFactSummary, normalizeClaimwiseSummary } from '../scripts/automation/fact-summary-diagnostic.mjs';
import { buildWorkersAiRequest, DEFAULT_CLOUDFLARE_AI_MODEL } from '../scripts/automation/free/workers-ai.mjs';
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
  for (const bad of [{ ...draft, extra: true }, { ...draft, whatHappened: '{}' }, { ...draft, whatToWatch: 'Short.' },
    { ...draft, headline: '<script>' }, { ...draft, whatHappened: draft.whatHappened.replace('Anthropic', 'A vendor') }]) {
    assert.throws(() => validateFactSummary(bad, excerpt));
  }
  assert.throws(() => validateFactSummary(draft, draft.whatHappened), /ORIGINALITY/);
});

const unitDraft = Object.fromEntries(Object.entries(draft).map(([field, value]) =>
  [field, field === 'headline' ? value : value.match(/[^.]+\./g).map(s => s.trim())]));

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

for (const outcome of ['pass', 'veto', 'omitted', 'bad-hash', 'quota', 'changed-source']) {
  test(`claimwise new summary ${outcome} checks all units without email or retry`, async () => {
    let calls = 0;
    const checkedUnits = [];
    const result = await diagnoseFactSummary({ publicKey: 'mock', accountId: '0'.repeat(32), apiToken: 'mock',
      now: new Date('2026-09-23T04:00:00Z'), endpoint: 'https://provider.example/fixed', claimwise: true,
      articleFetcher: async () => outcome === 'changed-source' ? 'changed' : excerpt, sheetLoader: async () => sheet,
      sealDiagnostic: v => v, fetchImpl: async () => ({ ok: true }), aiRequestImpl: async options => {
        calls++;
        assert.equal(options.maxAttempts, 1);
        assert.equal(options.maxTokens, calls === 1 ? 1200 : 600);
        const { body } = buildWorkersAiRequest(options);
        await options.fetchImpl('https://provider.example/fixed', { method: 'POST', redirect: 'error', body: JSON.stringify(body) });
        if (outcome === 'quota') throw Object.assign(new Error('private quota detail'), { code: 'QUOTA' });
        const data = JSON.parse(options.messages[1].content);
        let editorialPayload = unitDraft;
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
    assert.equal(calls, outcome === 'pass' ? 5 : outcome === 'changed-source' ? 0 : outcome === 'quota' ? 1 : 2);
    assert.equal(result.report.status, outcome === 'pass' ? 'draft-awaiting-manual-review' : 'failed');
    assert.doesNotMatch(JSON.stringify(result.report), /private quota detail/);
    if (outcome === 'pass') {
      assert.deepEqual(checkedUnits, Object.values(result.sealed.reviewUnits));
      assert.deepEqual(result.sealed.draft, draft);
      assert.equal(result.sealed.draftSha256, hash(JSON.stringify(draft)));
    }
  });
}

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
