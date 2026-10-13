import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, generateKeyPairSync} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareBenchmark, BENCHMARK_DESKS, compactReferenceWriterView, normalizeCompactReferenceSummary,
  benchmarkReviewView, scopeFirstWriterView, runBenchmark} from '../scripts/automation/article-benchmark.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';
import {requestWorkersAiEditorial, FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const fields = ['whatHappened', 'whyItMatters', 'whatToWatch'];
const sourceText = Array.from({length: 8}, (_, i) =>
  `Fictional passage ${i + 1}: a synthetic service has policy conditions, eligibility limitations and exclusions that a reader-facing summary must preserve.`).join('\n');
const encode = value => {const body = JSON.stringify(value); return [gzipSync(body).toString('base64'), sha(body)];};
const packet = (source = sourceText) => ({version: 1, articles: Array.from({length: 10}, (_, i) => ({
  id: `A${String(i + 1).padStart(2, '0')}`, desk: BENCHMARK_DESKS[i % 4], title: `Fictional policy ${i}`,
  url: `https://github.blog/changelog/compact-fixture-${i}/`, publisherKey: 'microsoft', sourceText: source,
  sourceSha256: sha(source), captureNote: 'Fictional structural fixture, not a factual or editorial qualification.'}))});
const article = () => prepareBenchmark(...encode(packet())).articles[0];
// Deliberately synthetic transport text: these tests do NOT certify readable news.
function draft(n = 130) {
  const item = text => ({text, passageIds: ['P1']});
  return {headline: item('A fictional service updates its policy'),
    whatHappened: [item(['GitHub', ...Array.from({length: n - 3}, (_, i) => `v${i}`)].join(' ') + '.')],
    whyItMatters: [item('Context.')], whatToWatch: [item('Limitations.')]};
}

test('compact view supplies the entire retained source with a generic prompt and no duplicate evidence schema', () => {
  const a = article(), view = compactReferenceWriterView(a);
  assert.equal(view.prompt, compactReferenceWriterView(prepareBenchmark(...encode(packet())).articles[1]).prompt);
  assert.deepEqual(view.data.passages, a.passages);
  assert.equal(view.data.requiredAttribution, 'GitHub');
  assert.equal(compactReferenceWriterView({...a, publisher: 'MIT News — Artificial Intelligence'}).data.requiredAttribution, 'MIT News');
  assert.deepEqual(Object.keys(view.schema.properties.headline.properties), ['text', 'passageIds']);
  assert.equal(view.schema.properties.headline.additionalProperties, false);
  assert.deepEqual(Object.keys(view.data), ['publisher', 'requiredAttribution', 'title', 'sourceUrl', 'sourceScope', 'passages']);
  assert.doesNotMatch(JSON.stringify(view.schema), /quote|preservedAs|qualifications|verdict|supported|confidence/);
  // Bookkeeping is actually smaller, not merely renamed private prose.
  assert.ok(JSON.stringify(view.schema).length < JSON.stringify(scopeFirstWriterView(a).schema).length);
});

test('host resolves exact retained passages and hashes without asking the model to retype evidence', () => {
  const a = article(), input = draft();
  input.headline.passageIds = ['P3', 'P1']; input.whyItMatters[0].passageIds = ['P2'];
  const s = normalizeCompactReferenceSummary(input, a);
  assert.equal(s.bodyWords, 130); assert.equal(s.sourceSha256, a.sourceSha256);
  assert.deepEqual(s.sourceReferences.map(x => x.unitId), s.units.map(x => x.id));
  assert.deepEqual(s.sourceReferences.map(x => x.section), s.units.map(x => x.section));
  assert.deepEqual(s.referencedPassages, a.passages.slice(0, 3).map(p => ({...p, sha256: sha(p.text)})));
  assert.deepEqual(s.sourceReferences[0].passageIds, ['P3', 'P1']);
  assert.equal(s.draftSha256, sha(JSON.stringify(s.units)));
  assert.equal(s.semanticApproval, false); assert.equal(s.qualificationCoverageVerified, false);
  assert.equal(s.productionApproved, false); assert.equal(s.independentReview, 'required');
  assert.equal(s.referenceIdsValid, true);
  assert.ok(Object.isFrozen(s.referencedPassages[0])); assert.ok(Object.isFrozen(s.sourceReferences[0].passageIds));
  input.headline.text = 'Changed later'; input.headline.passageIds.push('P8');
  assert.notEqual(s.raw.headline, input.headline.text); assert.equal(s.sourceReferences[0].passageIds.length, 2);
  assert.doesNotMatch(JSON.stringify(s.raw), /passageIds|Fictional passage/);
});

test('independent review receives all original passages and exact reader text, without selected writer references', () => {
  const a = article(), s = normalizeCompactReferenceSummary(draft(), a), review = benchmarkReviewView(s, a);
  assert.equal(s.referencedPassages.length, 1); assert.equal(review.data.passages.length, 8);
  assert.deepEqual(review.data.passages, a.passages); assert.deepEqual(review.data.units, s.units);
  assert.equal(review.data.draftSha256, s.draftSha256);
  assert.doesNotMatch(JSON.stringify(review.data), /sourceReferences|referenceIdsValid|referencedPassages|semanticApproval/);
});

test('compact source hash and complete passage mapping cannot be silently altered', () => {
  for (const mutate of [a => a.sourceSha256 = '0'.repeat(64), a => a.sourceText += ' changed',
    a => a.passages.pop(), a => a.passages.reverse(), a => a.passages[1].id = 'P1',
    a => a.passages[0].text += ' changed', a => a.passages[0].approved = true,
    a => a.passages = null, a => a.sourceText = null, a => delete a.passages[1],
    a => a.passages = new Array(a.passages.length), a => a.passages[1] = undefined]) {
    const a = structuredClone(article()); mutate(a);
    assert.throws(() => compactReferenceWriterView(a), /BENCHMARK_REFERENCE_SOURCE/);
    assert.throws(() => normalizeCompactReferenceSummary(draft(), a), /BENCHMARK_REFERENCE_SOURCE/);
  }
});

test('model references require known unique IDs for every unit, including the headline', () => {
  for (const mutate of [r => r.headline.passageIds = [], r => r.headline.passageIds = ['P99'],
    r => r.headline.passageIds = ['P1', 'P1'], r => r.headline.passageIds = ['P1', 'P2', 'P3', 'P4'],
    r => r.headline.passageIds = ['p1'], r => r.headline.passageIds = [1], r => r.headline.passageIds = [null],
    r => r.headline.passageIds = 'P1', r => delete r.whatHappened[0].passageIds,
    r => r.whatToWatch[0].quote = 'Host evidence must not be supplied here.', r => r.headline.supported = true,
    r => r.headline.passageIds = [{id: 'P1'}]]) {
    const r = draft(); mutate(r);
    assert.throws(() => normalizeCompactReferenceSummary(r, article()), /BENCHMARK_REFERENCE_ANCHOR/);
  }
});

test('body remains strictly 110–225 words, excluding headline and evidence', () => {
  for (const n of [109, 110, 225, 226]) {
    if (n < 110 || n > 225) assert.throws(() => normalizeCompactReferenceSummary(draft(n), article()), /DRAFT_LENGTH/);
    else assert.equal(normalizeCompactReferenceSummary(draft(n), article()).bodyWords, n);
  }
});

test('compact draft rejects malformed text, new approval fields, omissions and duplicate prose', () => {
  for (const mutate of [r => r.semanticApproval = true, r => r.headline.text = '<script>bad</script>',
    r => r.whatToWatch[0].text = 'unfinished', r => r.whatToWatch[0].text = 'Broken “whatHappened”: text.',
    r => r.whatToWatch[0].text = 'Escaped\nnewline.', r => r.whatToWatch[0].text = 'Hidden\u200bcontrol.',
    r => r.whatToWatch[0].text = r.whyItMatters[0].text, r => r.whatHappened = [],
    r => r.whyItMatters = null, r => r.whatToWatch.push(...r.whatToWatch, ...r.whatToWatch, ...r.whatToWatch),
    r => r.headline.text = 'x'.repeat(181), r => r.whatToWatch[0].text = 'x'.repeat(1201) + '.',
    r => r.whatHappened[0].text = r.whatHappened[0].text.replace('GitHub', 'Someone')]) {
    const r = draft(); mutate(r); assert.throws(() => normalizeCompactReferenceSummary(r, article()));
  }
  assert.throws(() => normalizeCompactReferenceSummary({unexpected: 'x'.repeat(50001)}, article()), /RESPONSE_SIZE/);
});

test('copying guard still covers headline and section boundaries, not only individual items', () => {
  const a = article(), tokens = a.passages[0].text.split(/\s+/);
  for (const modify of [r => r.whatToWatch[0].text = tokens.slice(0, 16).join(' ') + '.',
    r => r.headline.text = tokens.slice(0, 16).join(' '),
    r => {r.whyItMatters[0].text = tokens.slice(0, 8).join(' ') + '.';
      r.whatToWatch[0].text = tokens.slice(8, 16).join(' ') + '.';}]) {
    const r = draft(); modify(r); assert.throws(() => normalizeCompactReferenceSummary(r, a), /DRAFT_COPY/);
  }
});

const paired = JSON.parse(await readFile(new URL('./fixtures/compact-reference-scope-cases.json', import.meta.url), 'utf8'));
for (const c of paired.cases) test(`scope counterexample stays unapproved despite valid references: ${c.id}`, () => {
  const a = prepareBenchmark(...encode(packet(c.source + '\n' + sourceText))).articles[0];
  const view = compactReferenceWriterView(a);
  assert.ok(view.data.passages.some(p => p.text === c.source));
  assert.doesNotMatch(view.prompt, /Meridian|Larch|CSO-442|LA-918|June 18|24 percent/);
  assert.ok(!JSON.stringify(view.data).includes(c.supported));
  assert.ok(!JSON.stringify(view.data).includes(c.unsupported));
  assert.ok(!JSON.stringify(view.data).includes(c.reason));
  for (const claim of [c.supported, c.unsupported]) {
    const r = draft(); r.whatToWatch[0].text = claim;
    const s = normalizeCompactReferenceSummary(r, a);
    assert.equal(s.referenceIdsValid, true); assert.equal(s.semanticApproval, false);
    assert.equal(s.qualificationCoverageVerified, false); assert.equal(s.productionApproved, false);
    assert.equal(s.independentReview, 'required');
    assert.equal(s.units.at(-1).text, claim); // No keyword repair, removal or favorable rewriting.
  }
});

test('compact native response works with the existing adapter using only a mock network', async () => {
  const a = article(), view = compactReferenceWriterView(a); let calls = 0;
  const result = await requestWorkersAiEditorial({accountId: '0'.repeat(32), apiToken: 'TEST_ONLY',
    model: FREE_REASONING_WRITER_MODEL, messages: [{role: 'system', content: view.prompt},
      {role: 'user', content: JSON.stringify(view.data)}], schema: view.schema, responseFormat: 'json_object',
    maxTokens: 4000, maxAttempts: 1, reasoningEffort: 'medium', timeoutMs: 90000,
    validatePayload: x => Boolean(x && typeof x === 'object'),
    fetchImpl: async (_url, init) => {
      calls++; assert.equal(init.redirect, 'error'); assert.equal(JSON.parse(init.body).max_tokens, 4000);
      return new Response(JSON.stringify({success: true, result: {response: JSON.stringify(draft())}}),
        {headers: {'content-type': 'application/json'}});
    }});
  assert.equal(calls, 1); assert.equal(normalizeCompactReferenceSummary(result.editorialPayload, a).semanticApproval, false);
});

test('compact mode is opt-in, no-email, owner/manual/main and tested before credentials', async () => {
  const workflow = await readFile(new URL('../.github/workflows/article-benchmark.yml', import.meta.url), 'utf8');
  assert.match(workflow, /default: write-and-review/); assert.match(workflow, /- compact-reference-writer/);
  assert.match(workflow, /tests\/compact-reference-writer.test.mjs/);
  assert.ok(workflow.indexOf('tests/compact-reference-writer.test.mjs') < workflow.indexOf('CLOUDFLARE_AI_API_TOKEN'));
  assert.doesNotMatch(workflow, /RESEND|OPENAI_API_KEY|schedule:|contents: write/);
  const key = generateKeyPairSync('rsa', {modulusLength: 3072}).publicKey.export({type: 'spki', format: 'der'}).toString('base64');
  const [encoded, digest] = encode(packet());
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/automation/article-benchmark.mjs', import.meta.url)), 'validate'],
    {encoding: 'utf8', env: {GITHUB_REPOSITORY: 'itworksinprod/first-fold', GITHUB_ACTOR: 'itworksinprod',
      GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_WORKFLOW_REF: 'itworksinprod/first-fold/.github/workflows/article-benchmark.yml@refs/heads/main',
      GITHUB_SHA: '1'.repeat(40), BENCHMARK_REVISION: '1'.repeat(40), DIAGNOSTIC_PUBLIC_KEY: key,
      FIRST_FOLD_BENCHMARK_B64: encoded, BENCHMARK_PACKET_SHA256: digest, BENCHMARK_MODE: 'compact-reference-writer'}});
  assert.equal(result.status, 0); assert.equal(result.stderr.trim(), '');
});

test('compact live path bounds ten requests, retains exact encrypted answers and leaves judgment unset', async () => {
  const p = prepareBenchmark(...encode(packet())), pair = generateKeyPairSync('rsa', {modulusLength: 3072});
  const publicKey = pair.publicKey.export({type: 'spki', format: 'der'}).toString('base64');
  let calls = 0; const saved = [];
  const report = await runBenchmark({plan: p, compactReference: true, publicKey, accountId: '0'.repeat(32), apiToken: 'TEST_ONLY',
    save: async (id, sealed) => saved.push({id, data: openDiagnostic(sealed, pair.privateKey)}), fetchImpl: async (_url, init) => {
      const b = JSON.parse(init.body), d = JSON.parse(b.messages[1].content);
      assert.equal(b.max_tokens, 4000); assert.equal(b.reasoning_effort, 'medium'); assert.equal(init.redirect, 'error');
      assert.deepEqual(d.passages, p.articles[calls++].passages);
      return new Response(JSON.stringify({success: true, result: {response: JSON.stringify(draft())}}), {headers: {'content-type': 'application/json'}});
    }});
  assert.equal(calls, 10); assert.equal(report.requests, 10); assert.equal(report.networkRequests, 10);
  assert.equal(report.requestedOutputTokens, 40000); assert.equal(report.mode, 'compact-reference-writer');
  assert.equal(report.results.length, 10); assert.equal(report.emailSent, false); assert.equal(report.productionApproved, false);
  assert.ok(report.results.every(r => r.status === 'awaiting-independent-review' && r.sourceSupported === null && r.faithful === null && !r.reviewerStructural));
  assert.equal(saved.length, 20); assert.ok(saved.every(r => !r.id.includes('reviewer')));
  assert.ok(saved.filter(r => r.id.endsWith('-writer')).every(r => r.data.nativeResponseBase64));
  for (const row of saved.filter(r => !r.id.endsWith('-writer'))) {
    assert.equal(row.data.mode, 'compact-reference-writer'); assert.equal(row.data.summary.semanticApproval, false);
  }
  for (const mode of [{compactReference: 'yes'}, {compactReference: true, scopeFirst: true}, {compactReference: true, sourceFirst: true}])
    await assert.rejects(runBenchmark({plan: p, ...mode, publicKey, save: async () => {}}), /BENCHMARK_MODE/);
});

test('compact mode keeps rejected cases and stops the batch at provider refusal without retry', async () => {
  const p = prepareBenchmark(...encode(packet())), pair = generateKeyPairSync('rsa', {modulusLength: 3072});
  const publicKey = pair.publicKey.export({type: 'spki', format: 'der'}).toString('base64');
  let calls = 0; const saved = [];
  const report = await runBenchmark({plan: p, compactReference: true, publicKey, accountId: '0'.repeat(32), apiToken: 'TEST_ONLY',
    save: async (id, sealed) => saved.push({id, data: openDiagnostic(sealed, pair.privateKey)}), fetchImpl: async () => {
      if (++calls === 2) return new Response('{"success":false}', {status: 429});
      const r = draft(); r.headline.passageIds = ['P999'];
      return new Response(JSON.stringify({success: true, result: {response: JSON.stringify(r)}}), {headers: {'content-type': 'application/json'}});
    }});
  assert.equal(calls, 2); assert.equal(report.results.length, 10); assert.equal(report.requestedOutputTokens, 8000);
  assert.equal(report.results[0].code, 'BENCHMARK_REFERENCE_ANCHOR'); assert.equal(report.results[1].code, 'BENCHMARK_PROVIDER_STOP');
  assert.equal(report.results.filter(r => r.status === 'not-attempted-provider-blocker').length, 8);
  assert.ok(saved.find(r => r.id === 'A01-writer').data.nativeResponseBase64);
});

test('version boundary screening holds an unchanged complete draft and retains private evidence without extra calls', async () => {
  const source = 'Synthetic agents below version 4.8.2 cannot register.\n' + sourceText;
  const p = prepareBenchmark(...encode(packet(source))), pair = generateKeyPairSync('rsa', {modulusLength: 3072});
  const publicKey = pair.publicKey.export({type: 'spki', format: 'der'}).toString('base64');
  const bad = draft(); bad.whyItMatters[0].text = 'Agents on version 4.8.2 or older cannot register.';
  const good = structuredClone(bad); good.whyItMatters[0].text = 'Agents older than version 4.8.2 cannot register.';
  const snapshot = JSON.stringify(bad), saved = []; let calls = 0;
  const report = await runBenchmark({plan: p, compactReference: true, publicKey, accountId: '0'.repeat(32), apiToken: 'TEST_ONLY',
    save: async (id, sealed) => saved.push({id, data: openDiagnostic(sealed, pair.privateKey)}), fetchImpl: async () => {
      return new Response(JSON.stringify({success: true, result: {response: JSON.stringify(++calls === 1 ? bad : good)}}),
        {headers: {'content-type': 'application/json'}});
    }});
  assert.equal(calls, 10); assert.equal(report.networkRequests, 10); assert.equal(report.requestedOutputTokens, 40000);
  assert.equal(report.results[0].status, 'held'); assert.equal(report.results[0].code, 'BENCHMARK_VERSION_BOUNDARY_REVIEW');
  assert.equal(report.results[0].draftStructural, true); assert.equal(report.results[0].sourceSupported, null);
  assert.ok(report.results.slice(1).every(r => r.status === 'awaiting-independent-review'));
  const capture = saved.find(r => r.id === 'A01').data;
  assert.equal(capture.summary.raw.whyItMatters[0], bad.whyItMatters[0].text);
  assert.equal(capture.summary.versionBoundaryScreen.issues[0].unitId, 'U2');
  assert.equal(capture.summary.versionBoundaryScreen.issues[0].source[0].passageId, 'P1');
  assert.equal(capture.summary.semanticApproval, false); assert.equal(capture.summary.productionApproved, false);
  const native = saved.find(r => r.id === 'A01-writer').data;
  assert.equal(JSON.parse(Buffer.from(native.nativeResponseBase64, 'base64')).result.response, snapshot);
  assert.doesNotMatch(JSON.stringify(report), /Synthetic agents|4\.8\.2|cannot register/);
  assert.equal(report.emailSent, false); assert.equal(report.productionApproved, false);
});

test('dense valid boundary evidence cannot overflow encryption and stop the remaining articles', async () => {
  const source = Array.from({length: 3}, (_, p) => Array.from({length: 70}, (_, n) =>
    `Synthetic branch ${p}-${n} denies below version 4.8.2 under its special local policy.`).join(' ')).join('\n');
  assert.ok(source.length < 18000); assert.ok(source.split('\n').every(p => p.length <= 6000));
  const p = prepareBenchmark(...encode(packet(source))), pair = generateKeyPairSync('rsa', {modulusLength: 3072});
  const publicKey = pair.publicKey.export({type: 'spki', format: 'der'}).toString('base64');
  const payload = draft(110);
  payload.whyItMatters[0] = {text: Array.from({length: 20}, (_, i) => `Group${i} at most 4.8.2`).join('; ') + '.', passageIds: ['P1', 'P2', 'P3']};
  const saved = []; let calls = 0;
  const report = await runBenchmark({plan: p, compactReference: true, publicKey, accountId: '0'.repeat(32), apiToken: 'TEST_ONLY',
    save: async (id, sealed) => saved.push({id, data: openDiagnostic(sealed, pair.privateKey)}), fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({success: true, result: {response: JSON.stringify(payload)}}),
        {headers: {'content-type': 'application/json'}});
    }});
  assert.equal(calls, 10); assert.equal(report.stoppedOnEvidenceBlocker, false);
  assert.ok(report.results.every(r => r.code === 'BENCHMARK_VERSION_BOUNDARY_REVIEW' && r.draftStructural));
  const capture = saved.find(x => x.id === 'A01').data;
  assert.equal(capture.summary.versionBoundaryScreen.issueCount, 20);
  assert.equal(capture.summary.versionBoundaryScreen.detailsTruncated, true);
  assert.ok(capture.summary.versionBoundaryScreen.issues.every(x => x.sourceComparisonCount === 210));
  assert.ok(Buffer.byteLength(JSON.stringify(capture)) < 100000);
  assert.equal(capture.article.sourceText, source);
  assert.equal(capture.summary.raw.whyItMatters[0], payload.whyItMatters[0].text);
});
