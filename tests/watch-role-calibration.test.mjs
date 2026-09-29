import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {prepareWatchRoleCalibration, runWatchRoleCalibration, assertRoleCalibrationAuthority, ROLE_CALIBRATION_PIN} from '../scripts/automation/watch-role-calibration.mjs';
import {WATCH_ROLE_CONTROLS, watchRoleControlView} from '../scripts/automation/experiments/watch-role-controls.mjs';
import {buildWorkersAiRequest, requestWorkersAiEditorial, workersAiRunUrl, FREE_REASONING_WRITER_MODEL} from '../scripts/automation/free/workers-ai.mjs';
import {openDiagnostic} from '../scripts/automation/private-writer-diagnostic.mjs';

const pair = generateKeyPairSync('rsa', {modulusLength: 3072});
const publicKey = pair.publicKey.export({format: 'der', type: 'spki'}).toString('base64');
// Scoring/transport fixtures only: host expectations synthesize these replies.
// This is not evidence a model understands the questions.
function mockResponse(control, data) {
  const findings = control.checks.map(c => ({...c, reason: 'Synthetic structural mock; not editorial qualification.',
    evidenceIds: c.grounded ? ['S1P20'] : []}));
  if (!findings.some(f => f.role === 'unknown_outcome')) findings.push({anchor: control.question.split(' ').slice(0, 3).join(' '),
    role: 'unknown_outcome', reason: 'Synthetic structural unknown.', grounded: true, evidenceIds: ['S1P20']});
  return {reviewSha256: data.reviewSha256, question: control.question,
    unknownAnswer: 'An unresolved hypothetical answer, represented by a structure-only mock.', findings};
}

async function run(failure, at = 3) {
  const plan = prepareWatchRoleCalibration(), requests = [], network = [], late = [], accountId = '0'.repeat(32);
  const result = await runWatchRoleCalibration({plan, publicKey, accountId, apiToken: 'PRIVATE_TEST_TOKEN',
    now: new Date('2026-09-29T04:00:00Z'), sealImpl: value => value,
    aiRequestImpl: async request => {
      const index = requests.length; requests.push(request); late.push(request.fetchImpl);
      const view = watchRoleControlView(WATCH_ROLE_CONTROLS[index]);
      assert.deepEqual(JSON.parse(request.messages[1].content), view.data);
      assert.equal(request.messages[0].content, `${view.prompt}\nJSON schema: ${JSON.stringify(view.schema)}`);
      assert.doesNotMatch(JSON.stringify(request.messages), /"expected"|"checks"|"caseId"|"gold"/);
      assert.equal(request.model, FREE_REASONING_WRITER_MODEL);
      assert.equal(request.maxTokens, 2400); assert.equal(request.timeoutMs, 90000);
      assert.equal(request.maxAttempts, 1); assert.equal(request.temperature, 0.1);
      const {body} = buildWorkersAiRequest(request);
      const url = workersAiRunUrl(accountId, request.model), init = {method: 'POST', redirect: 'error', body: JSON.stringify(body)};
      if (index === at && failure === 'no-network') return {};
      if (index === at && ['endpoint', 'method', 'body', 'redirect'].includes(failure)) {
        const altered = {...init};
        if (failure === 'method') altered.method = 'GET';
        if (failure === 'body') altered.body = '{}';
        if (failure === 'redirect') altered.redirect = 'follow';
        try {await request.fetchImpl(failure === 'endpoint' ? 'https://unapproved.test' : url, altered);} catch { /* sticky */ }
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
      const data = JSON.parse(JSON.parse(init.body).messages[1].content), c = WATCH_ROLE_CONTROLS[index];
      const payload = mockResponse(c, data);
      if (index === at && failure === 'wrong-verdict') {
        payload.findings[0].grounded = !payload.findings[0].grounded;
        payload.findings[0].evidenceIds = ['S1P20'];
      }
      if (index === at && failure === 'wrong-role') {
        payload.findings[0].role = 'hypothetical_control';
        payload.findings.push({anchor: 'LumenRoute', role: 'factual_premise', reason: 'Synthetic structural mock.', grounded: true, evidenceIds: ['S1P5']});
      }
      if (index === at && failure === 'malformed') payload.extra = 'PRIVATE_INVALID_PROSE';
      if (index === at && failure === 'scope') payload.findings[0].evidenceIds = ['S2P1'];
      if (index === at && failure === 'echo') payload.question += ' Changed.';
      const result = index === at && failure === 'truncated'
        ? {choices: [{index: 0, message: {role: 'assistant', content: JSON.stringify(payload)}, finish_reason: 'length'}]}
        : {response: JSON.stringify(payload)};
      return new Response(JSON.stringify({success: true, result, errors: []}), {headers: {'content-type': 'application/json'}});
    }});
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST_TOKEN'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_INVALID_PROSE'));
  assert.ok(!JSON.stringify(result.report).includes('PRIVATE_QUOTA_DETAIL'));
  assert.ok(!JSON.stringify(result.report).includes('PRIVATE_TRANSPORT_DETAIL'));
  const count = network.length;
  for (const fetcher of late) await assert.rejects(fetcher('https://unapproved.test', {}), /ROLE_CALIBRATION_NETWORK/);
  assert.equal(network.length, count);
  assert.ok(network.length <= 8); assert.ok(result.report.outputBudget <= 19200);
  return {result, requests, network};
}

test('fixed eight-case calibration sends only frozen requests and requires every verdict plus decisive roles', async () => {
  const {result, requests, network} = await run();
  assert.equal(result.report.status, 'controls-passed-awaiting-manual-review');
  assert.equal(requests.length, 8); assert.equal(network.length, 8);
  assert.equal(result.report.outputBudget, 19200); assert.equal(result.report.casesPassed, 8);
  assert.equal(result.report.writerRequests, 0); assert.equal(result.report.searchQueries, 0); assert.equal(result.report.emailSent, false);
  assert.equal(result.sealed.corpusSha256, ROLE_CALIBRATION_PIN);
  assert.equal(result.sealed.draft, undefined);
});
for (const failure of ['wrong-verdict', 'wrong-role']) test(`valid ${failure} finishes the fixed set but does not qualify the reviewer`, async () => {
  const {result, requests} = await run(failure);
  assert.equal(requests.length, 8); assert.equal(result.report.casesCompleted, 8);
  assert.equal(result.report.casesPassed, 7); assert.equal(result.report.code, 'ROLE_CALIBRATION_MISMATCH');
  assert.equal(result.sealed.cases[3].matched, false);
  assert.equal(result.sealed.calls[3].response !== undefined, true);
});
for (const failure of ['quota', 'transport', 'no-network', 'endpoint', 'method', 'body', 'redirect', 'retry',
  'provenance', 'model', 'provider', 'attempt', 'response-hash', 'malformed', 'scope', 'echo', 'truncated']) {
  test(`${failure} stops immediately without retries, more cases, a paid fallback or raw rejected prose`, async () => {
    const {result, requests} = await run(failure);
    assert.equal(result.report.status, 'failed'); assert.equal(requests.length, 4);
    assert.equal(result.report.casesCompleted, 3); assert.equal(result.report.outputBudget, 9600);
    if (['malformed', 'scope', 'echo'].includes(failure)) assert.equal(result.report.code, 'ROLE_CALIBRATION_RESPONSE_INVALID');
    if (['malformed', 'scope', 'echo'].includes(failure)) {
      assert.equal(result.sealed.calls[3].validationReason, {malformed: 'ENVELOPE_SHAPE', scope: 'CITATIONS_SCOPE', echo: 'QUESTION_ECHO'}[failure]);
      assert.equal(Object.hasOwn(result.report, 'validationReason'), false);
    }
    if (failure === 'truncated') {
      assert.equal(result.report.code, 'WORKERS_AI_EDITORIAL_FORMAT_INVALID');
      assert.equal(result.sealed.failure.formatReason, 'OUTPUT_TOKEN_LIMIT');
    }
    assert.equal(result.sealed.calls[3].response, undefined);
  });
}
test('first request quota block stops with one request and no calibration verdicts', async () => {
  const {result, requests} = await run('quota', 0);
  assert.equal(requests.length, 1); assert.equal(result.report.casesCompleted, 0); assert.equal(result.report.outputBudget, 2400);
});
test('authority, issued plan and encryption key are checked before any provider call', async () => {
  const plan = prepareWatchRoleCalibration();
  await assert.rejects(runWatchRoleCalibration({plan: structuredClone(plan), publicKey, aiRequestImpl: () => assert.fail('no provider')}), /PLAN/);
  await assert.rejects(runWatchRoleCalibration({plan, publicKey: 'invalid', aiRequestImpl: () => assert.fail('no provider')}), /KEY_INVALID/);
  const env = {GITHUB_REPOSITORY: 'itworksinprod/first-fold', GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: 'itworksinprod/first-fold/.github/workflows/watch-role-calibration.yml@refs/heads/main',
    GITHUB_ACTOR: 'itworksinprod', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1'};
  assert.doesNotThrow(() => assertRoleCalibrationAuthority(env));
  for (const key of Object.keys(env)) assert.throws(() => assertRoleCalibrationAuthority({...env, [key]: 'other'}), /AUTHORITY/);
});
test('real encryption seals the diagnostic while the public report contains no question or source text', async () => {
  const plan = prepareWatchRoleCalibration();
  const result = await runWatchRoleCalibration({plan, publicKey, accountId: '0'.repeat(32), apiToken: 'PRIVATE',
    aiRequestImpl: async () => {throw Object.assign(new Error('PRIVATE_ERROR'), {code: 'FIXTURE'});}});
  const capture = openDiagnostic(result.sealed, pair.privateKey);
  assert.equal(capture.purpose, 'synthetic-watch-role-calibration-awaiting-manual-review');
  assert.equal(capture.report.code, 'FIXTURE');
  assert.ok(!JSON.stringify(result).includes('LumenRoute')); assert.ok(!JSON.stringify(result).includes('PRIVATE_ERROR'));
  assert.ok(JSON.stringify(capture).includes('LumenRoute'));
});
test('manual trusted-main workflow uses only Cloudflare credentials, fixed output, ample timeout and encryption', async () => {
  const w = await readFile(new URL('../.github/workflows/watch-role-calibration.yml', import.meta.url), 'utf8');
  assert.match(w, /workflow_dispatch/); assert.match(w, /github.run_attempt == 1/); assert.match(w, /timeout-minutes: 16/);
  assert.match(w, /contents: read/); assert.match(w, /persist-credentials: false/);
  assert.ok(w.indexOf('tests/watch-role-calibration.test.mjs') < w.indexOf('secrets.CLOUDFLARE_AI_API_TOKEN'));
  assert.ok(w.indexOf('watch-role-calibration.mjs validate') < w.indexOf('secrets.CLOUDFLARE_AI_API_TOKEN'));
  assert.match(w, /path: \$\{\{ runner.temp \}\}\/watch-role-calibration.encrypted.json/);
  assert.match(w, /retention-days: 1/);
  assert.deepEqual([...w.matchAll(/secrets\.([A-Z_]+)/g)].map(m => m[1]), ['CLOUDFLARE_AI_API_TOKEN']);
  assert.doesNotMatch(w, /FIRST_FOLD|RESEND|OPENAI_API|TAVILY|schedule:|pull_request:|contents: write/);
});
