import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, stat, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { freezeFactBaseline, loadFrozenFactBaseline, frozenBaselineReceipt } from '../scripts/automation/free/frozen-fact-baseline.mjs';
import { privateBaselinePath, writePrivateBaseline } from '../scripts/automation/freeze-fact-baseline.mjs';
import { normalizeClaimwiseSummary } from '../scripts/automation/fact-summary-diagnostic.mjs';
import { phraseCopyeditUnitsHash } from '../scripts/automation/free/phrase-copyedit.mjs';
import { buildSentenceRewriteView } from '../scripts/automation/free/sentence-rewrite.mjs';

// Synthetic fixtures exercise integrity, not factual support or prose quality.
// Actual private summaries and publisher excerpts must not enter public tests.
const sha = text => createHash('sha256').update(text).digest('hex');
const hash = value => sha(JSON.stringify(value));
const fields = ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch'];
function fixture() {
  const excerpt = 'Synthetic source paragraph one.\nSynthetic source paragraph two.';
  const raw = { headline: 'MIT describes a synthetic research example',
    whatHappened: ['MIT describes an example of research in which a model produces a draft answer for a person to examine before using it in further work.',
      'The example keeps responsibility for the final decision with the person who reads the answer, rather than claiming that the system can perform an entire project without supervision.'],
    whyItMatters: ['The distinction between a suggested answer and a completed task is important when describing the scope of an experiment and comparing it with a different approach.'],
    whatToWatch: ['The report describes an experiment rather than a deployed service, and it leaves unanswered whether a later implementation would behave in the same way outside the conditions of the original test.'] };
  const normalized = normalizeClaimwiseSummary(raw, excerpt, 'MIT');
  const source = { url: 'https://example.test/synthetic', excerpt, excerptSha256: sha(excerpt) };
  const sheet = { sourceUrl: source.url, excerptSha256: source.excerptSha256,
    attribution: 'Synthetic fixture only', facts: [{ id: 'synthetic', text: 'Synthetic fact.', passageIds: ['P1'] }] };
  const qualification = { id: 'synthetic-test-only', status: 'source-qualified-for-private-editing-only',
    originSelection: 'beforeCopyedit', publisher: 'MIT', sourceUrl: source.url,
    excerptSha256: source.excerptSha256, draftSha256: hash(normalized.draft), unitsSha256: phraseCopyeditUnitsHash(normalized.units),
    factContextSha256: hash({ attribution: sheet.attribution, facts: sheet.facts }), factSheetSha256: hash(sheet),
    bodyWords: fields.slice(1).map(field => normalized.draft[field]).join(' ').split(/\s+/u).length,
    review: { verdict: 'supported-by-captured-source', evidenceMap: fields.flatMap(field =>
      normalized.units[field].map((_, unitIndex) => ({ field, unitIndex, passageIds: ['P1'] }))) } };
  const diagnostic = { source, beforeCopyedit: { ...normalized, draftSha256: qualification.draftSha256,
    unitsSha256: qualification.unitsSha256 }, draft: { headline: 'HELD FINAL MUST NOT BE SELECTED' } };
  return { diagnostic, sheet, qualification };
}
const make = ({ diagnostic, sheet, qualification }) => freezeFactBaseline(JSON.stringify(diagnostic), JSON.stringify(sheet), JSON.stringify(qualification));

test('freezes only the reviewed BEFORE draft and builds the same future rewrite inventory', () => {
  const f = fixture(), text = make(f), pins = JSON.stringify(f.qualification);
  const baseline = loadFrozenFactBaseline(text, pins), receipt = frozenBaselineReceipt(text, pins);
  assert.deepEqual(baseline.draft, f.diagnostic.beforeCopyedit.draft);
  assert.deepEqual(buildSentenceRewriteView(baseline.units).data,
    buildSentenceRewriteView(f.diagnostic.beforeCopyedit.units).data);
  assert.equal(receipt.bodyWords, f.qualification.bodyWords);
  assert.equal(receipt.reviewedUnits, 5);
  assert.equal(receipt.modelCalls, 0);
  assert.equal(receipt.emailSent, false);
  assert.equal(receipt.status, 'integrity-verified-not-publication-approval');
  assert.ok(!JSON.stringify(receipt).includes(baseline.draft.headline));
  assert.ok(Object.isFrozen(baseline.units.whatHappened));
  assert.throws(() => { baseline.units.whatHappened[0] = 'mutated'; }, TypeError);
  assert.equal(make(f), text, 'Freeze is deterministic; it cannot generate a new draft');
});

test('rejects mutations even when untrusted artifact hashes are recomputed', () => {
  for (const mutate of [
    a => { a.draft.headline += ' edited'; },
    a => { a.units.whatHappened.reverse(); },
    a => { a.units.whatToWatch[0] += ' Additional unsupported claim.'; a.draft.whatToWatch = a.units.whatToWatch[0]; },
    a => { a.source.excerpt += '\nA new claim.'; a.source.excerptSha256 = sha(a.source.excerpt); },
    a => { a.source.url = 'https://other.example.test/'; },
    a => { a.factContext.facts[0].text = 'Changed instruction'; },
    a => { a.scope.emailAuthorized = true; },
    a => { a.approved = true; },
    a => { a.qualificationSha256 = '0'.repeat(64); },
    a => { a.units.headline.push('extra'); },
    a => { a.units.whatHappened[0] = null; },
  ]) {
    const f = fixture(), artifact = JSON.parse(make(f));
    mutate(artifact);
    assert.throws(() => loadFrozenFactBaseline(JSON.stringify(artifact), JSON.stringify(f.qualification)));
  }
});

test('changed or missing baseline and fact sheet cannot be frozen', () => {
  for (const mutate of [
    f => { delete f.diagnostic.beforeCopyedit; },
    f => { f.diagnostic.beforeCopyedit.draftSha256 = '0'.repeat(64); },
    f => { f.diagnostic.beforeCopyedit.unitsSha256 = '0'.repeat(64); },
    f => { f.diagnostic.beforeCopyedit.draft.headline = 'Changed'; },
    f => { f.sheet.facts[0].text += ' changed'; },
    f => { f.qualification.originSelection = 'draft'; },
    f => { f.diagnostic.source.excerpt = 'Changed'; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => make(f)); }
});

test('evidence map covers every unit in order with real nonempty captured paragraphs', () => {
  for (const mutate of [
    q => { q.review.evidenceMap.pop(); },
    q => { q.review.evidenceMap.reverse(); },
    q => { q.review.evidenceMap[1] = q.review.evidenceMap[0]; },
    q => { q.review.evidenceMap[0].passageIds = []; },
    q => { q.review.evidenceMap[0].passageIds = ['P99']; },
    q => { q.review.evidenceMap[0].passageIds = ['P1', 'P1']; },
    q => { q.review.evidenceMap[0].passageIds = ['P01']; },
    q => { q.review.evidenceMap[0].unitIndex = '0'; },
    q => { q.review.verdict = 'not-reviewed'; },
    q => { q.bodyWords++; },
  ]) { const f = fixture(); mutate(f.qualification); assert.throws(() => make(f)); }
});

test('shape, attribution and 110–225 words remain mandatory even for self-consistent new pins', () => {
  for (const change of [
    u => { u.whatToWatch = ['Brief.']; },
    u => { u.whatToWatch = [Array(180).fill('extra').join(' ') + '.']; },
    u => { u.whatHappened[0] = u.whatHappened[0].replace('MIT', 'A lab'); },
    u => { u.headline[0] = '<script>'; },
  ]) {
    const f = fixture(), b = f.diagnostic.beforeCopyedit;
    change(b.units);
    b.draft = Object.fromEntries(fields.map(field => [field, b.units[field].join(' ')]));
    f.qualification.draftSha256 = b.draftSha256 = hash(b.draft);
    f.qualification.unitsSha256 = b.unitsSha256 = phraseCopyeditUnitsHash(b.units);
    f.qualification.bodyWords = fields.slice(1).map(field => b.draft[field]).join(' ').split(/\s+/u).length;
    assert.throws(() => make(f));
  }
});

test('rejects malformed and excessive JSON without executing object properties', () => {
  const f = fixture(), pins = JSON.stringify(f.qualification);
  for (const text of ['{', 'null', '[]', ' '.repeat(2_000_001)]) assert.throws(() => loadFrozenFactBaseline(text, pins));
  let read = false;
  assert.throws(() => loadFrozenFactBaseline({ get format() { read = true; } }, pins));
  assert.equal(read, false);
});

test('private output is exclusive, owner-readable only, and rejects escape paths and symlinks', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'first-fold-baseline-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, 'frozen.json');
  await writePrivateBaseline(target, 'private synthetic fixture', root);
  assert.equal((await stat(target)).mode & 0o777, 0o600);
  await assert.rejects(writePrivateBaseline(target, 'replace', root), { code: 'EEXIST' });
  assert.equal(await readFile(target, 'utf8'), 'private synthetic fixture');
  await assert.rejects(privateBaselinePath(path.join(root, '..', 'public.json'), root), /PRIVATE_PATH/);
  await symlink(path.dirname(root), path.join(root, 'escape'));
  await assert.rejects(privateBaselinePath(path.join(root, 'escape', 'public.json'), root), /PRIVATE_PATH/);
  await symlink(target, path.join(root, 'alias.json'));
  await assert.rejects(writePrivateBaseline(path.join(root, 'alias.json'), 'replace', root), { code: 'EEXIST' });
  assert.equal(await readFile(target, 'utf8'), 'private synthetic fixture');
});

test('public checkpoint pins the qualified draft but contains no private summary or excerpt', async () => {
  const text = await readFile(new URL('../docs/checkpoints/mit-frozen-baseline.json', import.meta.url), 'utf8');
  const q = JSON.parse(text);
  assert.equal(q.draftSha256, 'e0a2421baa12d87c3f76f4825c9a76b6d41c5b21dd2897fec362a47c90ff0687');
  assert.equal(q.originSelection, 'beforeCopyedit');
  assert.equal(q.review.evidenceMap.length, 7);
  assert.equal(q.bodyWords, 148);
  assert.doesNotMatch(text, /"(?:draft|units|excerpt)"\s*:/u);
});
