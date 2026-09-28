import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {significanceFixture, sha} from './fixtures/significance-fixture.mjs';
import {buildSignificancePlan, decodeSignificancePacket, loadSignificancePlan, applySignificanceIntroduction,
  buildSignificanceFieldReview, significanceSourceRequest, SIGNIFICANCE_PROMPT, SIGNIFICANCE_PASSAGES} from '../scripts/automation/experiments/significance-introduction.mjs';
import {prepareSignificanceDiagnostic, resolvePrivateWriterDiagnosticMode, diagnoseOneWriter} from '../scripts/automation/private-writer-diagnostic.mjs';

test('one addition preserves every accepted unit, order and headline byte-for-byte', () => {
  const {plan, proposal} = significanceFixture(), before = JSON.stringify(plan);
  const result = applySignificanceIntroduction(plan, proposal);
  assert.equal(result.retainedTextIdentity, true);
  for (const field of ['headline', 'whatHappened', 'whatToWatch']) assert.deepEqual(result.units[field], plan.baseline.units[field]);
  assert.deepEqual(result.units.whyItMatters, [proposal.introduction, ...plan.baseline.units.whyItMatters]);
  assert.equal(JSON.stringify(plan), before);
  assert.deepEqual(plan.data.allowedContext.map(p => p.evidenceId), SIGNIFICANCE_PASSAGES);
  assert.equal(Object.isFrozen(plan.baseline.units.whatHappened), true);
});

test('proposal shape and sentence boundary reject edits, getters, multiple sentences and leaked markup', () => {
  const {plan, proposal} = significanceFixture();
  const getter = {...proposal}; Object.defineProperty(getter, 'introduction', {get: () => assert.fail('must not invoke getter')});
  for (const value of [null, {...proposal, headline: 'Changed'}, {...proposal, baselineSha256: '0'.repeat(64)}, getter,
    {...proposal, decision: 'rewrite'}, {...proposal, decision: 'abstain'},
    ...['', ' unfinished', 'No punctuation', 'One complete sentence. A second sentence.', 'First sentence. another follows.',
      'Markup <script> bad.', 'Hidden\u200b text.', 'line\nbreak.', 'word '.repeat(41) + 'end.', plan.baseline.units.whyItMatters[0]]
      .map(introduction => ({...proposal, introduction}))]) {
    assert.throws(() => applySignificanceIntroduction(plan, value));
  }
  assert.deepEqual(applySignificanceIntroduction(plan, {...proposal, decision: 'abstain', introduction: ''}), {decision: 'abstain'});
  assert.throws(() => applySignificanceIntroduction(structuredClone(plan), proposal), /PLAN_INVALID/);
});

test('whole-body length, originality and baseline pins remain enforced', () => {
  const {plan, proposal, packet} = significanceFixture();
  const copied = plan.sourceRecord.excerpt.split('\n').slice(0, 2).join(' ').replaceAll('.', ',') + ' end.';
  assert.throws(() => applySignificanceIntroduction(plan, {...proposal, introduction: copied}), /ORIGINALITY/);
  const large = structuredClone(packet);
  large.units.whatToWatch[0] = Array.from({length: 180}, () => 'word').join(' ') + '.';
  large.draftSha256 = sha(JSON.stringify(Object.fromEntries(Object.entries(large.units).map(([k,v]) => [k,v.join(' ')]))));
  assert.throws(() => buildSignificancePlan(large), /LENGTH/);
  assert.throws(() => buildSignificancePlan({...packet, draftSha256: '0'.repeat(64)}), /BASELINE_INVALID/);
  assert.throws(() => buildSignificancePlan({...packet, source: {...packet.source, excerptSha256: '0'.repeat(64)}}), /BASELINE_INVALID/);
  const nearLimit = structuredClone(packet);
  const otherWords = ['whatHappened', 'whyItMatters'].flatMap(f => nearLimit.units[f]).join(' ').split(/\s+/u).length;
  nearLimit.units.whatToWatch = [Array.from({length: 220 - otherWords}, () => 'word').join(' ') + '.'];
  nearLimit.draftSha256 = sha(JSON.stringify(Object.fromEntries(Object.entries(nearLimit.units).map(([k,v]) => [k,v.join(' ')]))));
  const boundedPlan = buildSignificancePlan(nearLimit);
  assert.throws(() => applySignificanceIntroduction(boundedPlan, {...proposal, baselineSha256: boundedPlan.data.baselineSha256}), /LENGTH/);
});

test('observed outcome-assurance failure is vetoed locally without treating the guard as semantic proof', () => {
  const {plan, proposal} = significanceFixture();
  for (const verb of ['guarantees', 'ensure', 'ensures', 'prevents', 'eliminates', 'ｇｕａｒａｎｔｅｅｓ']) {
    assert.throws(() => applySignificanceIntroduction(plan, {...proposal,
      introduction: `The synthetic method ${verb} a safe outcome for all users.`}), /ASSURANCE_LANGUAGE/);
  }
  assert.match(SIGNIFICANCE_PROMPT, /problem context only/);
  assert.match(SIGNIFICANCE_PROMPT, /do not describe the method's behavior, achievement or safety benefit/);
});

test('unchanged four-field source review policy and supplementary-source scope are retained', () => {
  const {plan, proposal} = significanceFixture(), result = applySignificanceIntroduction(plan, proposal);
  for (const field of ['headline', 'whatHappened', 'whyItMatters', 'whatToWatch']) {
    const view = buildSignificanceFieldReview(plan, result, field);
    assert.equal(view.data.policy, 'isolated-claimwise-source-v1');
    assert.equal(view.data.claims.length, result.units[field].length);
    assert.equal(view.data.passages.some(p => p.evidenceId === 'S2P1'), ['whatHappened', 'whatToWatch'].includes(field));
    assert.ok(!Object.hasOwn(view.data, 'previousClaims'));
    const request = significanceSourceRequest(view, field);
    assert.deepEqual(request.data, view.data);
    assert.deepEqual(request.schema, view.schema);
    if (field === 'whyItMatters') {
      assert.ok(request.prompt.startsWith(view.prompt));
      assert.match(request.prompt, /For C1 only, use exclusively S1P2, S1P6, S1P10, S1P11/);
      assert.match(request.prompt, /return sourceSupported false/);
    } else assert.equal(request, view);
  }
  const altered = structuredClone(result); altered.draft.headline = 'Changed';
  assert.throws(() => buildSignificanceFieldReview(plan, altered, 'headline'), /BASELINE_CHANGED/);
});

test('only canonical bounded pinned secrets enter this opt-in mode', async () => {
  for (const encoded of [undefined, '', 'AAA', 'AAAA ', 'a'.repeat(24001), Buffer.from('not gzip').toString('base64'),
    gzipSync('{}').toString('base64'), gzipSync('x'.repeat(20001)).toString('base64')]) assert.throws(() => decodeSignificancePacket(encoded), /PACKET_INVALID/);
  for (const text of [undefined, '{}', 'x'.repeat(20001)]) assert.throws(() => loadSignificancePlan(text), /PACKET_INVALID/);
  assert.equal(resolvePrivateWriterDiagnosticMode('saved-useful-significance'), 'saved-useful-significance');
  assert.equal(await prepareSignificanceDiagnostic('source', ''), undefined);
  await assert.rejects(prepareSignificanceDiagnostic('source', 'private'), /UNEXPECTED_SIGNIFICANCE_PACKET/);
  await assert.rejects(prepareSignificanceDiagnostic('saved-useful-significance', ''), /PACKET_INVALID/);
  await assert.rejects(diagnoseOneWriter({mode: 'saved-useful-significance', publicKey: 'invalid',
    aiRequestImpl: () => assert.fail('no inference'), researchImpl: () => assert.fail('no research')}), /KEY_INVALID/);
});

test('workflow gates new secret to two no-email steps and keeps production unchanged', async () => {
  const workflow = await readFile(new URL('../.github/workflows/private-writer-diagnostic.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/inputs.mode == 'saved-useful-significance' && secrets.FIRST_FOLD_SIGNIFICANCE_BASELINE_B64 \|\| ''/gu) ?? []).length, 2);
  assert.ok(workflow.indexOf('tests/significance-introduction.test.mjs') < workflow.indexOf('secrets.FIRST_FOLD_SIGNIFICANCE_BASELINE_B64'));
  assert.match(workflow, /contents: read/); assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /RESEND|OPENAI_API|schedule:|pull_request:/);
  assert.match(SIGNIFICANCE_PROMPT, /ONLY allowedContext/);
  assert.match(SIGNIFICANCE_PROMPT, /Keep hypothetical examples hypothetical/);
  assert.match(SIGNIFICANCE_PROMPT, /do not merely repeat constraint compliance/);
  assert.match(SIGNIFICANCE_PROMPT, /Do not invent a named stakeholder/);
});
