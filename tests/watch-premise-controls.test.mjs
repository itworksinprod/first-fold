import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {WATCH_PREMISE_CONTROLS, watchPremiseControlView, diagnoseWatchPremiseControls} from '../scripts/automation/experiments/watch-premise-controls.mjs';
import {watchSourceRequest} from '../scripts/automation/experiments/watch-question.mjs';
import {requestWorkersAiEditorial, buildWorkersAiRequest, workersAiRunUrl, DEFAULT_CLOUDFLARE_AI_MODEL, FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';
import {resolvePrivateWriterDiagnosticMode, diagnoseOneWriter, openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';

async function run({failure, at = 0, profile = 'baseline'} = {}) {
  const requests = [], network = [], delayed = [], accountId = '0'.repeat(32);
  const result = await diagnoseWatchPremiseControls({publicKey: 'synthetic', accountId, apiToken: 'PRIVATE_TEST_TOKEN', profile,
    now: new Date('2026-09-28T02:00:00Z'), sealDiagnostic: value => value,
    aiRequestImpl: async request => {
      const index = requests.length; requests.push(request);
      assert.equal(request.model, profile === 'reasoning' ? FREE_REASONING_WRITER_MODEL : DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(request.maxTokens, profile === 'reasoning' ? 2400 : 600);
      assert.equal(request.maxAttempts, 1); assert.equal(request.temperature, 0.1);
      const {body} = buildWorkersAiRequest(request), init = {method: 'POST', redirect: 'error', body: JSON.stringify(body)};
      delayed.push(() => request.fetchImpl(workersAiRunUrl(accountId, request.model), init));
      if (index === at && failure === 'no-network') return {};
      if (index === at && ['wrong-endpoint', 'body', 'method', 'redirect'].includes(failure)) {
        try {await request.fetchImpl(failure === 'wrong-endpoint' ? 'https://not-approved.test/' : workersAiRunUrl(accountId, request.model),
          {...init, ...(failure === 'body' ? {body: '{}'} : {}), ...(failure === 'method' ? {method: 'GET'} : {}),
            ...(failure === 'redirect' ? {redirect: 'follow'} : {})});} catch { /* sticky violation */ }
      }
      const answer = await requestWorkersAiEditorial(request);
      if (index === at && failure === 'retry') {try {await delayed.at(-1)();} catch { /* sticky violation */ }}
      if (index === at && failure === 'provenance') answer.requestSha256 = '0'.repeat(64);
      if (index === at && failure === 'model') answer.model = 'unapproved';
      if (index === at && failure === 'fallback-model') answer.model = DEFAULT_CLOUDFLARE_AI_MODEL;
      return answer;
    }, fetchImpl: async (url, init) => {
      const index = requests.length - 1; network.push(url);
      const data = JSON.parse(JSON.parse(init.body).messages[1].content);
      if (index === at && failure === 'quota') return new Response(JSON.stringify({success: false,
        errors: [{code: 3036, message: 'PRIVATE_QUOTA_DETAIL'}]}), {status: 429});
      const payload = {reviewSha256: data.reviewSha256, judgments: data.claims.map((claim, i) => {
        let supported = WATCH_PREMISE_CONTROLS[index].expected[i];
        if (index === at && failure === 'wrong-verdict' && i === 1) supported = !supported;
        if (index === at && failure === 'wrong-retained' && i === 0) supported = false;
        return {claimId: claim.claimId, comparison: 'Synthetic mock only.',
          evidenceIds: supported ? ['S1P5', 'S1P20'] : [], sourceSupported: supported};
      })};
      if (index === at && failure === 'malformed') payload.extra = 'PRIVATE_UNEXPECTED_RESPONSE';
      if (index === at && failure === 'truncated') return new Response(JSON.stringify({success: true,
        result: {choices: [{finish_reason: 'length', message: {role: 'assistant', content: JSON.stringify(payload)}}]}}),
        {headers: {'content-type': 'application/json'}});
      return new Response(JSON.stringify({success: true, result: {response: JSON.stringify(payload)}, errors: []}),
        {headers: {'content-type': 'application/json'}});
    }});
  for (const late of delayed) await assert.rejects(late(), /WATCH_CONTROL_NETWORK/);
  assert.ok(network.length <= 4);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST_TOKEN'));
  assert.ok(!JSON.stringify(result.report).includes('PRIVATE_QUOTA_DETAIL'));
  return {result, requests, network};
}

test('frozen controls keep supported premises separate from unknown answers and invented plans/guarantees', () => {
  assert.deepEqual(WATCH_PREMISE_CONTROLS.map(c => c.expected), [[true,true],[true,true],[true,false],[true,false]]);
  assert.ok(Object.isFrozen(WATCH_PREMISE_CONTROLS[0].expected));
  assert.match(WATCH_PREMISE_CONTROLS[1].question, /shorter, leave its length unchanged, or make it longer/);
  const views = WATCH_PREMISE_CONTROLS.map(watchPremiseControlView);
  for (const view of views) {
    assert.deepEqual(view.data.passages, views[0].data.passages);
    assert.deepEqual(view.data.claims[0], views[0].data.claims[0]);
    assert.deepEqual(view.data.claims.map(c => c.claimId), ['C1', 'C2']);
    assert.deepEqual(view.data.passages.map(p => p.evidenceId), ['S1P5', 'S1P20']);
    assert.doesNotMatch(JSON.stringify(view), /"expected"|"caseId"|"gold"|negative control|positive control/);
    assert.match(watchSourceRequest(view, 'whatToWatch').prompt, /True means source-supported factual premises, not that the question's future answer is established/);
  }
  assert.throws(() => watchPremiseControlView({...WATCH_PREMISE_CONTROLS[0]}), /CONTROL_INVALID/);
});

test('four single-attempt reviews score all eight judgments without an article or general approval', async () => {
  const {result, network} = await run();
  assert.equal(result.report.status, 'controls-passed-awaiting-manual-review');
  assert.equal(result.report.outputBudget, 2400); assert.equal(network.length, 4);
  assert.equal(result.report.casesPassed, 4); assert.equal(result.report.emailSent, false);
  assert.equal(result.sealed.draft, undefined);
  assert.equal(result.sealed.cases.reduce((sum,c) => sum+c.observed.length, 0), 8);
  assert.equal(result.report.searchQueries, 0);
});

for (const failure of ['wrong-verdict', 'wrong-retained']) test(`${failure} fails even when all responses are well-formed`, async () => {
  const {result, requests} = await run({failure});
  assert.equal(result.report.code, 'WATCH_CONTROL_MISMATCH');
  assert.equal(result.report.status, 'failed'); assert.equal(requests.length, 4);
  assert.equal(result.report.casesPassed, 3);
});
test('observed open-alternatives false negative remains a scored failure under unchanged labels', async () => {
  const {result} = await run({failure: 'wrong-verdict', at: 1});
  assert.equal(result.report.code, 'WATCH_CONTROL_MISMATCH');
  assert.deepEqual(result.sealed.cases[1].expected, [true, true]);
  assert.deepEqual(result.sealed.cases[1].observed, [true, false]);
  assert.equal(result.report.casesPassed, 3);
});
for (const failure of ['quota', 'wrong-endpoint', 'body', 'method', 'redirect', 'retry', 'no-network', 'provenance', 'model', 'malformed']) {
  test(`${failure} holds without provider retries or later cases`, async () => {
    const {result, requests} = await run({failure, at: 1});
    assert.equal(result.report.status, 'failed'); assert.equal(requests.length, 2);
    assert.equal(result.report.casesCompleted, 1);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_UNEXPECTED_RESPONSE'));
  });
}

test('entrypoint accepts only the isolated mode and rejects unrelated private packets before inference', async () => {
  assert.equal(resolvePrivateWriterDiagnosticMode('watch-premise-controls'), 'watch-premise-controls');
  const pair = generateKeyPairSync('rsa', {modulusLength: 3072});
  const publicKey = pair.publicKey.export({format: 'der', type: 'spki'}).toString('base64');
  for (const packet of ['watchBaselineB64', 'significanceBaselineB64', 'frozenBaselineB64']) {
    await assert.rejects(diagnoseOneWriter({mode: 'watch-premise-controls', publicKey, [packet]: 'private',
      researchImpl: () => assert.fail('no research'), aiRequestImpl: () => assert.fail('no provider')}), /UNEXPECTED/);
  }
  const result = await diagnoseOneWriter({mode: 'watch-premise-controls', publicKey, accountId: '0'.repeat(32), apiToken: 'PRIVATE',
    researchImpl: () => assert.fail('no research'), aiRequestImpl: async () => {throw Object.assign(new Error('fixture'), {code: 'FIXTURE'});},
    fetchImpl: () => assert.fail('no network')});
  const capture = openDiagnostic(result.sealed, pair.privateKey);
  assert.equal(capture.purpose, 'synthetic-watch-premise-controls-not-an-article');
  assert.equal(result.report.code, 'FIXTURE'); assert.equal(capture.emailSent, false);
});

test('workflow keeps article secrets excluded and calibration tests before credentials', async () => {
  const workflow = await readFile(new URL('../.github/workflows/private-writer-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /- watch-premise-controls/);
  assert.ok(workflow.indexOf('tests/watch-premise-controls.test.mjs') < workflow.indexOf('secrets.CLOUDFLARE_AI_API_TOKEN'));
  for (const line of workflow.split('\n').filter(l => l.includes('secrets.'))) assert.doesNotMatch(line, /watch-premise-controls/);
  assert.doesNotMatch(workflow, /RESEND|OPENAI_API|schedule:|pull_request:/);
});

test('reasoning comparison changes only fixed model, output allowance and timeout, not prompts, cases or labels', async () => {
  const baseline = await run(), reasoning = await run({profile: 'reasoning'});
  assert.equal(reasoning.result.report.status, 'controls-passed-awaiting-manual-review');
  assert.equal(reasoning.result.report.mode, 'synthetic-watch-premise-reasoning-controls-not-an-article');
  assert.equal(reasoning.result.report.outputBudget, 9600); assert.equal(reasoning.requests.length, 4);
  assert.deepEqual(reasoning.result.sealed.cases, baseline.result.sealed.cases);
  for (let i = 0; i < 4; i++) {
    const {model: bm, max_tokens: bt, ...bbody} = buildWorkersAiRequest(baseline.requests[i]).body;
    const {model: rm, max_tokens: rt, ...rbody} = buildWorkersAiRequest(reasoning.requests[i]).body;
    assert.deepEqual(rbody, bbody); assert.equal(bt, 600); assert.equal(rt, 2400);
    assert.equal(reasoning.requests[i].timeoutMs, 90000);
  }
});

test('reasoning comparison cannot accept fallback provenance, retry errors or arbitrary profiles', async () => {
  for (const failure of ['quota', 'retry', 'no-network', 'provenance', 'fallback-model', 'malformed', 'truncated']) {
    const {result, requests} = await run({profile: 'reasoning', failure});
    assert.equal(result.report.status, 'failed'); assert.equal(requests.length, 1);
    assert.equal(result.report.outputBudget, 2400);
  }
  const mismatch = await run({profile: 'reasoning', failure: 'wrong-verdict', at: 1});
  assert.equal(mismatch.result.report.code, 'WATCH_CONTROL_MISMATCH');
  assert.equal(mismatch.result.report.casesPassed, 3);
  await assert.rejects(run({profile: 'unapproved'}), /PROFILE_INVALID/);
});

test('reasoning control mode remains opt-in and cannot receive an article packet', async () => {
  assert.equal(resolvePrivateWriterDiagnosticMode('watch-premise-reasoning-controls'), 'watch-premise-reasoning-controls');
  const workflow = await readFile(new URL('../.github/workflows/private-writer-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /- watch-premise-reasoning-controls/);
  for (const line of workflow.split('\n').filter(l => l.includes('secrets.'))) assert.doesNotMatch(line, /watch-premise-reasoning-controls/);
});
