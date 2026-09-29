import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, generateKeyPairSync} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {prepareArticleTrial, normalizeArticleTrialSummary, articleTrialWriterView, articleTrialReviewViews,
  assertArticleTrialAuthority, runArticleTrial, ARTICLE_TRIAL_PROMPT} from '../scripts/automation/article-summary-trial.mjs';
import {requestWorkersAiEditorial, buildWorkersAiRequest, workersAiRunUrl,
  DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';

const sha = s => createHash('sha256').update(s).digest('hex');
const pair = generateKeyPairSync('rsa', {modulusLength: 3072});
const publicKey = pair.publicKey.export({type: 'spki', format: 'der'}).toString('base64');
const excerpt = 'This invented fixture describes a service policy change with constraints and exceptions. It does not represent a real report or qualification.\nOperators must check the documented service scope before acting on any account notice.';
const packet = () => ({version: 1, url: 'https://github.blog/changelog/synthetic-fixture/', publisherKey: 'microsoft', excerpt, excerptSha256: sha(excerpt)});
const encode = p => {const text = JSON.stringify(p); return [gzipSync(text).toString('base64'), sha(text)];};
const planFor = (p = packet()) => prepareArticleTrial(...encode(p));
const raw = () => ({headline: 'A fictional platform changes its operating policy',
  whatHappened: ['GitHub describes a change affecting the way teams manage a fictional service, with the important dates and eligibility conditions tied to the specific setting described in the source.',
    'This synthetic example exists solely to test the isolated adapter and does not report any actual product update or independently verified development.'],
  whyItMatters: ['The stated limitations matter because the described change does not necessarily apply to every installation or every account, so the precise scope remains part of the summary.',
    'These extra fixture words exercise the required body size while making no claim that this synthetic prose is useful or factually qualified.'],
  whatToWatch: ['The publisher directs operators to consult the relevant guidance before taking action, and the summary preserves that limited instruction without adding a prediction about what a future release might contain.']});
const reply = data => ({reviewSha256: data.reviewSha256, judgments: data.claims.map(c => ({claimId: c.claimId,
  comparison: 'Mock verdict for transport testing only.', evidenceIds: ['S1P1'], sourceSupported: true}))});

test('source-neutral plans derive publisher identity from reviewed URLs and preserve every block', () => {
  const p = planFor();
  assert.equal(p.source.publisher, 'GitHub');
  assert.deepEqual(p.source.passages.map(x => x.text), excerpt.split('\n'));
  assert.deepEqual(p.source.passages.map(x => x.evidenceId), ['S1P1', 'S1P2']);
  const mit = packet(); mit.url = 'https://news.mit.edu/synthetic-fixture'; mit.publisherKey = 'mit';
  const m = planFor(mit);
  assert.notEqual(m.source.publisher, 'GitHub');
  assert.equal(articleTrialWriterView(m).prompt, articleTrialWriterView(p).prompt);
  assert.equal(Object.isFrozen(p.source.passages[0]), true);
  assert.equal(sha(ARTICLE_TRIAL_PROMPT), '8525ed12a2c7a8021c3fe3c7763e1d1c5d6790fb125b236ed0894bfbb01cbb37');
  assert.doesNotMatch(ARTICLE_TRIAL_PROMPT, /HardFlow|MIT|GitHub|runner|September/);
});

test('input bindings reject changed, oversized, unreviewed and misattributed evidence', () => {
  for (const mutate of [p => {p.version = 2;}, p => {p.publisher = 'MIT';}, p => {p.publisherKey = 'mit';},
    p => {p.url = 'https://unapproved.test/article';}, p => {p.url = 'http://github.blog/article';},
    p => {p.url = 'https://secret@github.blog/article';}, p => {p.url += '#fragment';},
    p => {p.excerptSha256 = '0'.repeat(64);}, p => {p.excerpt = 'x'.repeat(12001); p.excerptSha256 = sha(p.excerpt);},
    p => {p.excerpt += '\n'; p.excerptSha256 = sha(p.excerpt);},
    p => {p.excerpt += '\u200b'; p.excerptSha256 = sha(p.excerpt);},
    p => {p.excerpt = Array(41).fill('Synthetic paragraph.').join('\n'); p.excerptSha256 = sha(p.excerpt);},
  ]) {const p = packet(); mutate(p); assert.throws(() => planFor(p));}
  const [encoded, hash] = encode(packet());
  assert.throws(() => prepareArticleTrial(encoded, '0'.repeat(64)), /ARTICLE_PACKET_HASH/);
  assert.throws(() => prepareArticleTrial(encoded + '\n', hash), /ARTICLE_PACKET_INVALID/);
  assert.throws(() => prepareArticleTrial(gzipSync('x'.repeat(20001)).toString('base64'), sha('x'.repeat(20001))), /ARTICLE_PACKET_INVALID/);
});

test('all displayed text enters four unchanged source review views with full evidence', () => {
  const p = planFor(), s = normalizeArticleTrialSummary(raw(), p), views = articleTrialReviewViews(s, p);
  assert.ok(s.bodyWords >= 110 && s.bodyWords <= 225);
  assert.equal(views.length, 4);
  for (const {field, view} of views) {
    assert.deepEqual(view.data.claims.map(c => c.text), s.units[field]);
    assert.deepEqual(view.data.passages.map(x => x.text), excerpt.split('\n'));
    assert.equal(s.draft[field], s.units[field].join(' '));
  }
  assert.throws(() => articleTrialReviewViews({...s, draftSha256: '0'.repeat(64)}, p), /ARTICLE_SUMMARY_BINDING/);
  assert.throws(() => articleTrialWriterView(structuredClone(p)), /ARTICLE_PLAN_INVALID/);
});

test('110–225 body words exclude the headline; attribution, originality and broken text fail closed', () => {
  const p = planFor();
  for (const n of [109, 110, 225, 226]) {
    const words = ['GitHub', ...Array(n - 3).fill('bit')];
    const v = {headline: 'Many extra headline words cannot change the body count',
      whatHappened: [words.join(' ') + '.'], whyItMatters: ['Context.'], whatToWatch: ['Guidance.']};
    if (n === 109 || n === 226) assert.throws(() => normalizeArticleTrialSummary(v, p), /LENGTH/);
    else assert.equal(normalizeArticleTrialSummary(v, p).bodyWords, n);
  }
  for (const mutate of [r => {r.extra = 'Hidden prose';}, r => {r.whatHappened = ['No publisher attribution here.'];},
    r => {r.whatHappened[0] = r.whatHappened[0].replace('GitHub', 'NotGitHub');},
    r => {r.whatToWatch[0] += ' “whyItMatters”: “leak';}, r => {r.whatToWatch[0] += '\u200b';},
    r => {r.whyItMatters = Array(1);}, r => {r.headline = '<b>Markup</b>';},
    r => {r.whatToWatch = [excerpt.split('\n')[0]];}, r => {r.whatToWatch = ['unfinished fragment'];},
    r => {r.whatToWatch.push(r.whatToWatch[0]);},
  ]) {const r = raw(); mutate(r); assert.throws(() => normalizeArticleTrialSummary(r, p));}
  const r = raw(); Object.defineProperty(r, 'headline', {get() {assert.fail('Do not invoke accessor');}});
  assert.throws(() => normalizeArticleTrialSummary(r, p), /SHAPE/);
});

async function run(failure, at = 4, encrypted = false) {
  const plan = planFor(), requests = [], late = [], network = [], accountId = '0'.repeat(32);
  const result = await runArticleTrial({plan, publicKey, accountId, apiToken: 'PRIVATE_TEST_TOKEN',
    ...(encrypted ? {} : {sealImpl: x => x}), aiRequestImpl: async request => {
      const index = requests.length; requests.push(request); late.push(request.fetchImpl);
      assert.equal(request.model, index === 0 ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(request.maxTokens, index === 0 ? 2400 : 600);
      assert.equal(request.maxAttempts, 1); assert.equal(request.temperature, 0.1);
      const {body} = buildWorkersAiRequest(request);
      const url = workersAiRunUrl(accountId, request.model), init = {method: 'POST', redirect: 'error', body: JSON.stringify(body)};
      if (index === at && failure === 'no-network') return {};
      if (index === at && ['endpoint', 'method', 'body', 'redirect'].includes(failure)) {
        const bad = {...init};
        if (failure === 'method') bad.method = 'GET';
        if (failure === 'body') bad.body = '{}';
        if (failure === 'redirect') bad.redirect = 'follow';
        try {await request.fetchImpl(failure === 'endpoint' ? 'https://unapproved.test' : url, bad);} catch { /* sticky */ }
      }
      const answer = await requestWorkersAiEditorial(request);
      if (index === at && failure === 'retry') try {await request.fetchImpl(url, init);} catch { /* sticky */ }
      if (index === at && failure === 'provenance') answer.requestSha256 = '0'.repeat(64);
      if (index === at && failure === 'model') answer.model = 'unapproved';
      if (index === at && failure === 'provider') answer.provider = 'unapproved';
      if (index === at && failure === 'attempt') answer.attemptCount = 2;
      if (index === at && failure === 'response-hash') answer.responseSha256 = 'invalid';
      return answer;
    }, fetchImpl: async (url, init) => {
      const index = network.length; network.push(url);
      if (index === at && failure === 'quota') return new Response(JSON.stringify({success: false,
        errors: [{code: 3036, message: 'PRIVATE_QUOTA_DETAIL'}]}), {status: 429});
      if (index === at && failure === 'transport') throw new Error('PRIVATE_TRANSPORT_DETAIL');
      const data = JSON.parse(JSON.parse(init.body).messages[1].content), payload = index === 0 ? raw() : reply(data);
      if (index === at && failure === 'unsupported') payload.judgments[0].sourceSupported = false;
      if (index === at && failure === 'malformed') payload.extra = 'PRIVATE_REJECTED_PROSE';
      if (index === at && failure === 'scope') payload.judgments[0].evidenceIds = ['S1P20'];
      if (index === at && failure === 'empty-citation') payload.judgments[0].evidenceIds = [];
      if (index === at && failure === 'missing') payload.judgments.pop();
      if (index === at && failure === 'hash') payload.reviewSha256 = '0'.repeat(64);
      if (index === at && failure === 'short') payload.whatHappened = ['GitHub reports this example.'];
      const providerResult = index === at && failure === 'truncated'
        ? {choices: [{index: 0, message: {role: 'assistant', content: JSON.stringify(payload)}, finish_reason: 'length'}]}
        : {response: JSON.stringify(payload)};
      return new Response(JSON.stringify({success: true, result: providerResult}), {headers: {'content-type': 'application/json'}});
    }});
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST_TOKEN'));
  assert.ok(!JSON.stringify(result.report).includes('PRIVATE_'));
  const before = network.length;
  for (const fn of late) await assert.rejects(fn('https://unapproved.test', {}), /ARTICLE_NETWORK/);
  assert.equal(network.length, before);
  assert.ok(network.length <= 5); assert.ok(result.report.outputBudget <= 4800);
  return {result, requests, network};
}

test('one writer and four reviews at most; all positive mock checks still await independent review', async () => {
  const {result, network} = await run();
  assert.equal(network.length, 5); assert.equal(result.report.outputBudget, 4800);
  assert.equal(result.report.status, 'awaiting-independent-review');
  assert.equal(result.sealed.independentReview, 'required-not-performed-by-this-workflow');
  assert.equal(result.report.emailSent, false);
  assert.deepEqual(result.report.fieldsPassed, ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch']);
});
for (const failure of ['quota', 'transport', 'no-network', 'endpoint', 'method', 'body', 'redirect', 'retry',
  'provenance', 'model', 'provider', 'attempt', 'response-hash', 'unsupported', 'malformed', 'scope', 'empty-citation', 'missing', 'hash', 'truncated']) {
  test(`${failure} stops without a repair, retry, alternate provider or hidden approval`, async () => {
    const {result, requests} = await run(failure);
    assert.equal(result.report.status, 'failed'); assert.equal(requests.length, 5);
    assert.equal(result.report.fieldsPassed.length, 3);
  });
}
test('writer rejection and every early review hold stop remaining calls; rejected parsed draft remains private', async () => {
  const short = await run('short', 0);
  assert.equal(short.result.report.code, 'ARTICLE_SUMMARY_LENGTH');
  assert.equal(short.requests.length, 1);
  assert.ok(short.result.sealed.calls[0].response);
  for (const at of [1, 2, 3]) {
    const {result, requests} = await run('unsupported', at);
    assert.equal(result.report.code, 'ARTICLE_SOURCE_REJECTED'); assert.equal(requests.length, at + 1);
  }
});
test('encryption-only artifacts replay parsed evidence and never grant mock article approval', async () => {
  const {result} = await run(undefined, 4, true);
  assert.ok(!JSON.stringify(result.sealed).includes('fictional'));
  const capture = openDiagnostic(result.sealed, pair.privateKey);
  assert.equal(capture.calls.length, 5);
  assert.equal(capture.report.status, 'awaiting-independent-review');
  assert.equal(capture.source.excerpt, excerpt);
});
test('unissued input and invalid key reject before any provider invocation', async () => {
  let calls = 0;
  for (const args of [{plan: structuredClone(planFor()), publicKey}, {plan: planFor(), publicKey: 'bad'}]) {
    await assert.rejects(runArticleTrial({...args, aiRequestImpl: async () => {calls++;}}));
  }
  assert.equal(calls, 0);
});
test('adapter responses reject behavior before capture without running getters or toJSON', async () => {
  let invoked = 0;
  const variants = [
    () => {const p = raw(); Object.defineProperty(p, 'headline', {enumerable: true, get() {invoked++; return 'Unsafe';}}); return p;},
    () => ({...raw(), toJSON() {invoked++; return raw();}}),
    () => new Proxy(raw(), {ownKeys() {invoked++; return [];}}),
    () => {const p = raw(); p.cycle = p; return p;},
    () => ({...raw(), extra: new Date()}),
    () => ({...raw(), extra: NaN}),
    () => ({...raw(), extra: BigInt(1)}),
    () => ({...raw(), extra: undefined}),
    () => ({...raw(), extra: 'x'.repeat(20001)}),
    () => ({...raw(), extra: Array(501).fill(null)}),
    () => {let value = {}; for (let i = 0; i < 22; i++) value = {value}; return value;},
  ];
  for (const variant of variants) {
    let requests = 0;
    const result = await runArticleTrial({plan: planFor(), publicKey, accountId: '0'.repeat(32), apiToken: 'TEST', sealImpl: x => x,
      aiRequestImpl: async options => {requests++; const result = await requestWorkersAiEditorial(options); result.editorialPayload = variant(); return result;},
      fetchImpl: async () => new Response(JSON.stringify({success: true, result: {response: JSON.stringify(raw())}}),
        {headers: {'content-type': 'application/json'}})});
    assert.equal(result.report.code, 'ARTICLE_RESPONSE_DATA');
    assert.equal(requests, 1);
    assert.equal(result.sealed.calls[0].response, undefined);
  }
  assert.equal(invoked, 0);
});
test('manual trusted-main workflow separates credential-free validation from inference and exposes no delivery secrets', async () => {
  const good = {GITHUB_REPOSITORY: 'itworksinprod/first-fold', GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: 'itworksinprod/first-fold/.github/workflows/article-summary-trial.yml@refs/heads/main',
    GITHUB_ACTOR: 'itworksinprod', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1'};
  assert.doesNotThrow(() => assertArticleTrialAuthority(good));
  for (const key of Object.keys(good)) assert.throws(() => assertArticleTrialAuthority({...good, [key]: 'wrong'}), /AUTHORITY/);
  const workflow = await readFile(new URL('../.github/workflows/article-summary-trial.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /\b(?:push|schedule|pull_request|workflow_run):|RESEND|OPENAI_API_KEY|TAVILY|contents: write|git push/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /retention-days: 1/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.ok(workflow.indexOf('Test source-neutral') < workflow.indexOf('FIRST_FOLD_ARTICLE_TRIAL_B64'));
  assert.ok(workflow.indexOf('Validate saved input') < workflow.indexOf('CLOUDFLARE_AI_API_TOKEN'));
  assert.match(workflow, /article-summary-trial\.encrypted\.json/);
});
