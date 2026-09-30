import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {CONDITIONAL_SCOPE_CONTROLS as controls, CONDITIONAL_SCOPE_CONTROLSET_SHA256 as digest} from '../scripts/automation/experiments/conditional-scope-controls.mjs';
import {prepareConditionalScopeCalibration as prepare, scoreConditionalScopeCalibration as score} from '../scripts/automation/experiments/conditional-scope-calibration.mjs';
import {buildSourceSentenceReview, SOURCE_SENTENCE_PROMPT, SOURCE_SENTENCE_CONTRACT} from '../scripts/automation/experiments/source-sentence-review.mjs';
import {SPAN_SOURCE_CONTROLSET_SHA256} from '../scripts/automation/experiments/span-source-controls.mjs';

const sha = x => createHash('sha256').update(x).digest('hex');
const frozen = x => {if (x && typeof x === 'object') {assert.ok(Object.isFrozen(x)); Object.values(x).forEach(frozen);}};
// These are INJECTED labels, not provider replies or evidence that the model works.
const records = plan => plan.cases.map((c, i) => ({caseId: c.caseId, response: {
  reviewSha256: c.view.data.reviewSha256,
  judgments: c.view.data.spans.map((s, n) => ({spanId: s.spanId, verdict: controls[i].expectedVerdicts[n],
    explanation: 'Synthetic label injection tests scoring only; no factual or model qualification.',
    evidence: [{sentenceId: c.view.data.catalog[0].sentenceId}]})),
}}));

test('fixed development corpus is independently labelable, balanced and distinct from original calibration', () => {
  assert.equal(digest, '22ba98ba1abbc942aff656912fefb3f2c35aae2ba9bb56b736b8f7ccff2b6341');
  assert.equal(digest, sha(JSON.stringify(controls))); frozen(controls);
  assert.equal(controls.length, 16); assert.equal(new Set(controls.map(c => c.id)).size, 16);
  assert.equal(new Set(controls.map(c => c.category)).size, 8);
  assert.equal(controls.filter(c => c.expectedVerdicts.every(v => v === 'supported')).length, 8);
  assert.equal(controls.filter(c => c.expectedVerdicts.every(v => v === 'unsupported')).length, 8);
  assert.equal(SPAN_SOURCE_CONTROLSET_SHA256, 'c7a74593f9b8e5d4714f6122029a4f5a15f93f9c7d4647a6aac287ddb7a7b94d');
  for (let i = 0; i < controls.length; i += 2) {
    assert.deepEqual(controls[i].input.sources, controls[i + 1].input.sources);
    assert.equal(controls[i].category, controls[i + 1].category);
    assert.notEqual(controls[i].input.text, controls[i + 1].input.text);
  }
  assert.ok(controls.some(c => c.expectedVerdicts[0] === 'supported' && /\bAll\b/.test(c.input.text)));
  assert.ok(controls.some(c => c.expectedVerdicts[0] === 'supported' && /\bEvery\b/.test(c.input.text)));
  assert.ok(controls.filter(c => c.expectedVerdicts[0] === 'unsupported' && !/\ball\b/i.test(c.input.text)).length >= 6);
});

test('each model-facing view uses the unchanged selector, splitter, full source and prompt without labels', () => {
  const plan = prepare(); frozen(plan);
  assert.equal(plan.controlsetSha256, digest); assert.equal(plan.evidenceContract, SOURCE_SENTENCE_CONTRACT);
  for (const [i, c] of plan.cases.entries()) {
    assert.deepEqual(c.view, buildSourceSentenceReview(controls[i].input));
    assert.equal(c.view.prompt, SOURCE_SENTENCE_PROMPT);
    assert.equal(c.view.data.sentence, controls[i].input.text);
    assert.equal(c.view.data.spans.length, controls[i].expectedVerdicts.length);
    assert.deepEqual(c.view.data.passages, controls[i].input.sources.flatMap(s =>
      s.passages.map(p => ({...p, publisher: s.publisher}))));
    assert.doesNotMatch(JSON.stringify(c.view), /expectedVerdicts|rationale|category|CS\d\d|labelMatch/);
    assert.equal(c.view.data.spans.map(s => s.text).join(''), controls[i].input.text);
    for (const s of c.view.data.catalog) {
      assert.equal(s.text, c.view.data.passages.find(p => p.evidenceId === s.evidenceId).text.slice(s.start, s.end));
    }
  }
  assert.doesNotMatch(SOURCE_SENTENCE_PROMPT, /Cedar|Lumen|Archive|Willow|Meridian|Harbor/);
});

test('predeclared eligibility fixture explicitly grants entitlement instead of assuming only-if means if', () => {
  const p = controls.find(c => c.id === 'CS15').input.sources[0].passages;
  assert.equal(p[0].text, "Every book borrowed during the library's July pilot receives the loan extension.");
  assert.match(p[1].text, /applies only to books borrowed during/);
  assert.equal(p[2].text, 'Earlier loans keep their original due dates.');
  assert.deepEqual(p, controls.find(c => c.id === 'CS16').input.sources[0].passages);
  assert.match(controls.find(c => c.id === 'CS07').input.sources[0].passages[1].text, /alone is insufficient/);
});

test('a perfect injected vector tests bookkeeping only and can never approve a model or article', () => {
  const plan = prepare(), out = score(records(plan), plan); frozen(out);
  assert.equal(out.report.casesExpected, 16); assert.equal(out.report.casesRecorded, 16);
  assert.equal(out.report.casesValid, 16); assert.equal(out.report.casesMatching, 16);
  assert.equal(out.report.structuralComplete, true); assert.equal(out.report.labelAgreementComplete, true);
  for (const k of ['provenanceVerified', 'modelQualified', 'articleApproved', 'publicationReady']) assert.equal(out.report[k], false);
  assert.equal(out.report.independentReview, 'required-not-performed-by-this-offline-scorer');
  assert.deepEqual(out.report.falsePositives, []); assert.deepEqual(out.report.falseNegatives, []);
  assert.deepEqual(out.report.uncertain, []); assert.deepEqual(out.report.invalidCases, []);
});

test('accept-all and reject-all shortcuts both fail balanced comparison', () => {
  for (const verdict of ['supported', 'unsupported']) {
    const plan = prepare(), r = records(plan);
    r.forEach(c => c.response.judgments.forEach(j => {j.verdict = verdict;}));
    const out = score(r, plan);
    assert.equal(out.report.structuralComplete, true); assert.equal(out.report.labelAgreementComplete, false);
    assert.equal(out.report.casesMatching, 8);
    assert.equal(out.report.falsePositives.length, verdict === 'supported' ? 8 : 0);
    assert.equal(out.report.falseNegatives.length, verdict === 'unsupported' ? 8 : 0);
  }
});

test('quantifier keyword shortcuts miss genuine universals and unsupported claims without all', () => {
  const plan = prepare(), r = records(plan);
  r.forEach((c, i) => {c.response.judgments[0].verdict = /\b(all|every)\b/i.test(plan.cases[i].view.data.sentence) ? 'unsupported' : 'supported';});
  const out = score(r, plan);
  assert.equal(out.report.labelAgreementComplete, false);
  assert.ok(out.report.falseNegatives.some(m => m.caseId === 'CS03'));
  assert.ok(out.report.falseNegatives.some(m => m.caseId === 'CS11'));
  assert.ok(out.report.falsePositives.some(m => m.caseId === 'CS06'));
});

test('real source identifiers cannot turn a false positive into a correct label', () => {
  const plan = prepare(), r = records(plan);
  r[1].response.judgments[0].verdict = 'supported';
  const out = score(r, plan);
  assert.equal(out.results[1].verdict.valid, true);
  assert.equal(out.results[1].verdict.supported, true);
  assert.equal(out.results[1].labelMatch, false);
  assert.deepEqual(out.report.falsePositives, [{caseId:'CS02', spanId:'T1', expected:'unsupported', observed:'supported'}]);
  assert.equal(out.report.labelAgreementComplete, false);
});

test('uncertain is a hold rather than a correct supported or unsupported answer', () => {
  const plan = prepare(), r = records(plan);
  r[0].response.judgments[0].verdict = 'uncertain'; r[1].response.judgments[0].verdict = 'uncertain';
  const out = score(r, plan);
  assert.equal(out.report.casesMatching, 14); assert.equal(out.report.uncertain.length, 2);
  assert.deepEqual(out.report.falseNegatives, []); assert.deepEqual(out.report.falsePositives, []);
  assert.equal(out.report.labelAgreementComplete, false);
});

test('empty and partial prefixes cannot become complete success', () => {
  const plan = prepare();
  for (const count of [0, 1, 8, 15]) {
    const out = score(records(plan).slice(0, count), plan);
    assert.equal(out.report.complete, false); assert.equal(out.report.structuralComplete, false);
    assert.equal(out.report.labelAgreementComplete, false); assert.equal(out.report.casesMatching, count);
    assert.equal(out.report.casesMissing.length, 16 - count);
  }
});

for (const kind of ['unknown-id', 'extra', 'missing', 'wrong-hash', 'typed-quote', 'unsupported-with-empty-evidence'])
  test(`${kind} uses unchanged citation validation and retains the original response`, () => {
    const plan = prepare(), r = records(plan), j = r[1].response.judgments[0];
    if (kind === 'unknown-id') j.evidence[0].sentenceId = 'S1P1S999';
    if (kind === 'extra') r[1].response.extra = 'Original rejected data.';
    if (kind === 'missing') r[1].response.judgments.pop();
    if (kind === 'wrong-hash') r[1].response.reviewSha256 = '0'.repeat(64);
    if (kind === 'typed-quote') j.evidence[0].quote = 'A fabricated substitute.';
    if (kind === 'unsupported-with-empty-evidence') j.evidence = [];
    const before = structuredClone(r[1].response), out = score(r, plan);
    assert.deepEqual(out.results[1].rawResponse, before);
    const valid = kind === 'unsupported-with-empty-evidence';
    assert.equal(out.report.labelAgreementComplete, valid);
    assert.equal(out.results[1].verdict.valid, valid);
    assert.deepEqual(out.report.invalidCases, valid ? [] : ['CS02']);
    r[1].response.reviewSha256 = 'mutated after scoring';
    assert.deepEqual(out.results[1].rawResponse, before);
  });

test('missing evidence for a supported label and duplicate citations stay invalid', () => {
  const plan = prepare();
  for (const duplicate of [false, true]) {
    const r = records(plan), j = r[0].response.judgments[0];
    j.evidence = duplicate ? [j.evidence[0], {...j.evidence[0]}] : [];
    const out = score(r, plan); assert.equal(out.report.labelAgreementComplete, false);
    assert.deepEqual(out.report.invalidCases, ['CS01']);
  }
});

test('plain JSON non-object replies are preserved as invalid, not hidden or counted as disagreement', () => {
  const plan = prepare();
  for (const response of [null, false, 1, 'unparsed-looking text', []]) {
    const r = records(plan); r[0].response = response;
    const out = score(r, plan);
    assert.deepEqual(out.results[0].rawResponse, response);
    assert.deepEqual(out.report.invalidCases, ['CS01']);
    assert.deepEqual(out.report.falsePositives, []); assert.deepEqual(out.report.falseNegatives, []);
    assert.equal(out.report.labelAgreementComplete, false);
  }
});

test('cloned plans, reordered or extra cases cannot be scored as the fixed experiment', () => {
  const plan = prepare(); assert.throws(() => score(records(plan), structuredClone(plan)), /SCOPE_PLAN/);
  for (const change of [r => r.reverse(), r => [...r, r[0]], r => {r[1].caseId = r[0].caseId; return r;},
    r => {r[0].extra = 'hidden'; return r;}, r => {r[0].caseId = 'CS99'; return r;}]) {
    assert.throws(() => score(change(records(plan)), plan), /SCOPE_RECORD/);
  }
  assert.throws(() => score({}, plan), /SCOPE_RECORDS/);
});

test('hostile values are rejected before access or cloning', () => {
  const plan = prepare(); let touched = 0;
  for (const make of [
    () => new Proxy([], {ownKeys() {touched++; return [];}}),
    () => {const r = records(plan); Object.defineProperty(r[0], 'response', {enumerable:true, get() {touched++;}}); return r;},
    () => {const r = records(plan); r[0].response.self = r; return r;},
    () => Array(1),
    () => [{caseId:'CS01', response:'x'.repeat(60001)}],
    () => [{caseId:'CS01', response:{toJSON() {touched++;}}}],
  ]) assert.throws(() => score(make(), plan), /SPAN_REVIEW_DATA/);
  assert.equal(touched, 0);
});

test('source catalog and live runner stay unchanged; new modules have no provider or file-write path', async () => {
  const catalog = await readFile(new URL('../scripts/automation/experiments/source-sentence-review.mjs', import.meta.url));
  assert.equal(sha(catalog), '906fcf509072e3a92f9dd1f4de4a435bbc9d3a48b3678a886d910fa22c0d4653');
  for (const name of ['conditional-scope-controls.mjs', 'conditional-scope-calibration.mjs']) {
    const src = await readFile(new URL(`../scripts/automation/experiments/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(|requestWorkersAi|process\.env|writeFile|node:fs|node:child_process|RESEND|CLOUDFLARE/);
  }
  for (const path of ['../scripts/automation/full-article-sentence-review.mjs', '../.github/workflows/full-article-sentence-review.yml',
    '../.github/workflows/personal-morning-paper.yml']) {
    assert.doesNotMatch(await readFile(new URL(path, import.meta.url), 'utf8'), /conditional-scope/);
  }
});
