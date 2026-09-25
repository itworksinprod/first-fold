import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildIsolatedPreservationReview as build, validateIsolatedPreservationReview as validate } from '../scripts/automation/free/isolated-preservation-review.mjs';
import { buildSplitPreservationReview } from '../scripts/automation/free/split-preservation-review.mjs';
import { PRESERVATION_REVIEW_CONTROLS as controls, PRESERVATION_CASESET_SHA256 } from '../scripts/automation/preservation-review-cases.mjs';
import { PRESERVATION_HOLDOUT_CONTROLS as holdouts } from '../scripts/automation/preservation-holdout-cases.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const invalid = { valid: false, supported: false };
const verdictFor = dimension => dimension === 'source' ? 'sourceSupported' : 'meaningPreserved';
const payloadFor = (view, dimension, supported = true) => ({ reviewSha256: view.data.reviewSha256,
  judgments: view.data.claims.map(({ claimId }) => ({ claimId,
    comparison: 'Synthetic plumbing judgment; not semantic qualification.',
    evidenceIds: supported ? ['S1P1'] : [], [verdictFor(dimension)]: supported })) });
const freezeCheck = value => {
  if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(freezeCheck); }
};
const cloneInput = () => structuredClone(controls[0].input);

test('dimension views freeze exact prompt adaptations, schemas and independently bound policies', () => {
  assert.equal(PRESERVATION_CASESET_SHA256, 'd17df1cf570ba50385b56b837c30d566c98ee46777e44cad70ac30169f4e70cb');
  const promptHashes = { source: '153fe4f6767cae01903dd734dbb12245ba914ada5bd97d4506a1fb2a8006b4a7',
    meaning: '80f9d3a58321336d6c9c380643de06e709f393732da37dc8e7591a41dc5d1532' };
  for (const control of [...controls, ...holdouts]) for (const dimension of ['source', 'meaning']) {
    const view = build(control.input, dimension), prior = buildSplitPreservationReview(control.input);
    freezeCheck(view);
    assert.equal(hash(view.prompt), promptHashes[dimension]);
    assert.equal(view.data.policy, `isolated-claimwise-${dimension}-v1`);
    const { reviewSha256, ...bound } = view.data;
    assert.equal(reviewSha256, hash(JSON.stringify(bound)));
    assert.notEqual(reviewSha256, prior.data.reviewSha256);
    assert.deepEqual(view.data.claims, prior.data.claims);
    assert.deepEqual(view.data.passages, prior.data.passages);
    assert.deepEqual(view.schema.required, ['reviewSha256', 'judgments']);
    assert.equal(view.schema.additionalProperties, false);
    const item = view.schema.properties.judgments.items;
    assert.equal(item.additionalProperties, false);
    assert.deepEqual(item.required, ['claimId', 'comparison', 'evidenceIds', verdictFor(dimension)]);
    assert.deepEqual(Object.keys(item.properties), item.required);
    assert.deepEqual(view.schema.properties.reviewSha256.enum, [view.data.reviewSha256]);
    assert.deepEqual(item.properties.evidenceIds.items.enum, ['S1P1']);
    const sourceStart = prior.prompt.indexOf('\n\nSOURCE SUPPORT:') + 2;
    const meaningStart = prior.prompt.indexOf('\n\nMEANING PRESERVATION:');
    const expectedBlock = dimension === 'source'
      ? prior.prompt.slice(sourceStart, meaningStart).replace('In sourceComparison ', 'In comparison ')
      : prior.prompt.slice(meaningStart + 2).replace('In preservationComparison ', 'In comparison ')
        .replace('Never infer meaningPreserved from sourceSupported. Evaluate both questions even when one answer is false.',
          'Evaluate meaning even when a claim is not source-supported.');
    assert.equal(view.prompt.slice(view.prompt.indexOf('\n\n') + 2), expectedBlock);
    assert.doesNotMatch(view.prompt, /Evaluate both questions|sourceComparison|preservationComparison/);
    if (dimension === 'source') {
      assert.equal(Object.hasOwn(view.data, 'previousClaims'), false);
      assert.doesNotMatch(JSON.stringify(view.schema), /meaningPreserved|previousClaims/);
      assert.doesNotMatch(view.prompt, /MEANING PRESERVATION:|meaningPreserved/);
    } else {
      assert.deepEqual(view.data.previousClaims, prior.data.previousClaims);
      assert.doesNotMatch(view.prompt, /SOURCE SUPPORT:|sourceSupported/);
    }
    assert.doesNotMatch(JSON.stringify(view), /"caseId"|"expected"|"rationale"|expectedSourceSupported|expectedMeaningPreserved/);
    assert.ok(!JSON.stringify(view).includes(control.rationale));
  }
});

test('source construction ignores prior wording and untrusted context; meaning alone binds prior claims', () => {
  const original = cloneInput(), changed = cloneInput();
  changed.previousClaims = ['PRIOR_ONLY_SENTINEL unrelated old sentence.'];
  changed.text = 'CONTEXT_ONLY_SENTINEL old draft context.';
  const absent = cloneInput(); delete absent.previousClaims;
  const source = build(original, 'source');
  assert.deepEqual(build(changed, 'source'), source);
  assert.deepEqual(build(absent, 'source'), source);
  assert.deepEqual(build({ ...changed, previousClaims: null }, 'source'), source);
  assert.doesNotMatch(JSON.stringify(build(changed, 'source')), /PRIOR_ONLY_SENTINEL|CONTEXT_ONLY_SENTINEL/);
  assert.equal(source.data.statement, original.claims.join(' '));
  assert.notEqual(build(original, 'meaning').data.reviewSha256, build(changed, 'meaning').data.reviewSha256);
  assert.doesNotMatch(JSON.stringify(build(changed, 'meaning')), /CONTEXT_ONLY_SENTINEL/);
  assert.throws(() => build(absent, 'meaning'), /ISOLATED_PRESERVATION_PREVIOUS_REQUIRED/);
});

test('issued identity and dimension hashes prevent cloned, stale and cross-dimension replay', () => {
  const input = cloneInput(), source = build(input, 'source'), meaning = build(input, 'meaning');
  assert.notEqual(source.data.reviewSha256, meaning.data.reviewSha256);
  for (const [dimension, view, other] of [['source', source, meaning], ['meaning', meaning, source]]) {
    const response = payloadFor(view, dimension);
    assert.deepEqual(validate(response, structuredClone(view)), invalid);
    assert.deepEqual(validate(response, { ...view }), invalid);
    assert.deepEqual(validate(response, undefined), invalid);
    assert.deepEqual(validate(response, other), invalid);
    assert.deepEqual(validate({ ...response, reviewSha256: other.data.reviewSha256 }, view), invalid);
    input.claims[0] += ' Changed.';
    assert.deepEqual(validate(response, build(input, dimension)), invalid);
  }
});

test('dimension-local truth combinations are independent and all claim IDs are returned canonically', () => {
  const input = cloneInput();
  input.claims.push('A second synthetic assertion.');
  input.previousClaims.push('A second earlier synthetic assertion.');
  // These supplied answers test plumbing, not model reasoning or publication suitability.
  for (const dimension of ['source', 'meaning']) {
    const view = build(input, dimension), key = verdictFor(dimension);
    for (const first of [false, true]) for (const second of [false, true]) {
      const response = payloadFor(view, dimension);
      response.judgments.forEach((j, i) => { j[key] = i ? second : first; j.evidenceIds = j[key] ? ['S1P1'] : []; });
      response.judgments.reverse();
      assert.deepEqual(validate(response, view), { valid: true, supported: first && second,
        claims: [{ claimId: 'C1', [key]: first }, { claimId: 'C2', [key]: second }] });
    }
    const duplicate = payloadFor(view, dimension);
    duplicate.judgments[1].claimId = 'C1';
    assert.deepEqual(validate(duplicate, view), invalid);
  }
});

test('only source true requires evidence; meaning may compare faithful unsupported text without IDs', () => {
  const input = cloneInput();
  input.sources[0].passages.push(...[2, 3, 4].map(i => ({ evidenceId: `S1P${i}`, text: `Synthetic passage ${i}.` })));
  for (const dimension of ['source', 'meaning']) {
    const view = build(input, dimension);
    for (const evidenceIds of [['S1P1'], ['S1P1', 'S1P2'], ['S1P1', 'S1P2', 'S1P3']]) {
      const response = payloadFor(view, dimension); response.judgments[0].evidenceIds = evidenceIds;
      assert.equal(validate(response, view).valid, true);
    }
    assert.equal(validate(payloadFor(view, dimension, false), view).valid, true);
    const empty = payloadFor(view, dimension); empty.judgments[0].evidenceIds = [];
    assert.equal(validate(empty, view).valid, dimension === 'meaning');
    for (const evidenceIds of [['S1P1', 'S1P1'], ['S1P99'], ['S1P1', 'S1P2', 'S1P3', 'S1P4']]) {
      const response = payloadFor(view, dimension); response.judgments[0].evidenceIds = evidenceIds;
      assert.deepEqual(validate(response, view), invalid);
    }
  }
  const faithfulUnsupported = holdouts.find(control => control.caseId === 'PH03');
  assert.equal(faithfulUnsupported.expectedSourceSupported, false);
  assert.equal(faithfulUnsupported.expectedMeaningPreserved, true);
  assert.deepEqual(faithfulUnsupported.input.claims, faithfulUnsupported.input.previousClaims);
  const view = build(faithfulUnsupported.input, 'meaning'), response = payloadFor(view, 'meaning');
  response.judgments[0].evidenceIds = [];
  assert.deepEqual(validate(response, view), { valid: true, supported: true,
    claims: [{ claimId: 'C1', meaningPreserved: true }] });
});

test('strict response descriptors reject hidden, accessor, inherited and sparse shapes without side effects', () => {
  let reads = 0;
  for (const dimension of ['source', 'meaning']) {
    const view = build(cloneInput(), dimension), key = verdictFor(dimension);
    const mutations = [
      p => { p.supported = true; }, p => { p.reviewSha256 = '0'.repeat(64); },
      p => { p.judgments = []; }, p => { p.judgments = Array(1); },
      p => { p.judgments[0].claimId = 'C2'; }, p => { p.judgments[0][key] = 'true'; },
      p => { p.judgments[0][dimension === 'source' ? 'meaningPreserved' : 'sourceSupported'] = true; },
      p => { p.judgments[0].comparison = ' '; }, p => { p.judgments[0].comparison = 'x'.repeat(241); },
      p => { p.judgments[0].sourceComparison = 'Extra field'; },
      p => { p.judgments[0].evidenceIds = Array(1); },
      p => { Object.setPrototypeOf(p, { inherited: true }); },
      p => { Object.setPrototypeOf(p.judgments, Object.create(Array.prototype)); },
      p => { Object.setPrototypeOf(p.judgments[0], { inherited: true }); },
      p => { p[Symbol('hidden')] = true; }, p => { Object.defineProperty(p, 'hidden', { value: true }); },
      p => { Object.defineProperty(p, 'reviewSha256', { enumerable: true, get() { reads++; return view.data.reviewSha256; } }); },
      p => { Object.defineProperty(p.judgments, '0', { enumerable: true, get() { reads++; return {}; } }); },
      p => { Object.defineProperty(p.judgments[0], key, { enumerable: true, get() { reads++; return true; } }); },
      p => { Object.defineProperty(p.judgments[0].evidenceIds, '0', { enumerable: true, get() { reads++; return 'S1P1'; } }); },
      p => { Object.defineProperty(p.judgments[0].evidenceIds, 'toJSON', { value() { reads++; return ['S1P1']; } }); },
    ];
    for (const mutate of mutations) { const response = payloadFor(view, dimension); mutate(response); assert.deepEqual(validate(response, view), invalid); }
    const plainNull = payloadFor(view, dimension);
    Object.setPrototypeOf(plainNull, null); Object.setPrototypeOf(plainNull.judgments[0], null);
    assert.equal(validate(plainNull, view).valid, true);
  }
  assert.equal(reads, 0);
});

test('builder rejects malformed input descriptors and inventories without executing getters', () => {
  let reads = 0;
  assert.throws(() => build(cloneInput(), 'both'), /ISOLATED_PRESERVATION_DIMENSION/);
  for (const dimension of ['source', 'meaning']) {
    const mutations = [
      p => { p.claims = []; }, p => { p.claims = Array(1); }, p => { p.claims = [{}]; },
      p => { p.sources = Array(1); }, p => { p.sources[0].passages = Array(1); },
      p => { Object.defineProperty(p, 'previousClaims', { enumerable: true, get() { reads++; return []; } }); },
      p => { Object.defineProperty(p.claims, '0', { enumerable: true, get() { reads++; return 'Synthetic claim.'; } }); },
      p => { Object.defineProperty(p.sources[0], 'publisher', { enumerable: true, get() { reads++; return 'Lab'; } }); },
      p => { Object.defineProperty(p.sources[0].passages[0], 'text', { enumerable: true, get() { reads++; return 'Text'; } }); },
      p => { p.sources[0].passages[0].evidenceId = { toString() { reads++; return 'S1P1'; } }; },
      p => { Object.defineProperty(p, 'toJSON', { value() { reads++; return {}; } }); },
      p => { p[Symbol('extra')] = true; }, p => { Object.setPrototypeOf(p, { inherited: true }); },
    ];
    for (const mutate of mutations) { const input = cloneInput(); mutate(input); assert.throws(() => build(input, dimension)); }
  }
  for (const previousClaims of [[], Array(1), ['too', 'many']]) {
    assert.throws(() => build({ ...cloneInput(), previousClaims }, 'meaning'));
  }
  assert.equal(reads, 0);
});
