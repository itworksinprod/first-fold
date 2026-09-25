import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildTextPreservationReview as build, validateTextPreservationReview as validate,
  exactTextPreservation as identity } from '../scripts/automation/free/text-preservation-review.mjs';
import { PRESERVATION_REVIEW_CONTROLS as controls } from '../scripts/automation/preservation-review-cases.mjs';
import { PRESERVATION_HOLDOUT_CONTROLS as holdouts } from '../scripts/automation/preservation-holdout-cases.mjs';
import { PRESERVATION_PARAPHRASE_CONTROLS as paraphrases } from '../scripts/automation/preservation-paraphrase-case.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const invalid = { valid: false, supported: false };
const input = () => ({ claims: ['The depot shipped six crates.'], previousClaims: ['The depot shipped six crates.'] });
const payload = (view, supported = true) => ({ reviewSha256: view.data.reviewSha256,
  judgments: view.data.claims.map(({ claimId }) => ({ claimId,
    comparison: 'Synthetic plumbing answer, not semantic qualification.', meaningPreserved: supported })) });
const frozen = value => {
  if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozen); }
};

test('text-only views bind only aligned sentences and expose no source or citation fields', () => {
  for (const control of [...controls, ...holdouts, ...paraphrases]) {
    const view = build(control.input); frozen(view);
    assert.equal(hash(view.prompt), 'f5fb2ef48f411206c144deb92d0956e6fa89d63cdbb521c71d4caf5ede221e27');
    assert.deepEqual(Object.keys(view.data), ['policy', 'claims', 'previousClaims', 'reviewSha256']);
    assert.equal(view.data.policy, 'text-only-preservation-v1');
    const { reviewSha256, ...data } = view.data;
    assert.equal(reviewSha256, hash(JSON.stringify(data)));
    assert.deepEqual(view.data.claims.map(c => c.text), control.input.claims);
    assert.deepEqual(view.data.previousClaims.map(c => c.text), control.input.previousClaims);
    assert.deepEqual(view.schema.required, ['reviewSha256', 'judgments']);
    assert.equal(view.schema.additionalProperties, false);
    assert.deepEqual(view.schema.properties.reviewSha256.enum, [reviewSha256]);
    const item = view.schema.properties.judgments.items;
    assert.equal(item.additionalProperties, false);
    assert.deepEqual(item.required, ['claimId', 'comparison', 'meaningPreserved']);
    assert.deepEqual(Object.keys(item.properties), item.required);
    assert.doesNotMatch(JSON.stringify(view.data), /passages|publisher|statement|caseId|rationale|expectedSourceSupported|expectedMeaningPreserved/);
    assert.doesNotMatch(JSON.stringify(view.schema), /evidenceIds|sourceSupported|supported/);
    assert.match(view.prompt, /not whether either statement is true/);
    assert.match(view.prompt, /Do not fact-check/);
  }
  let reads = 0;
  const extra = input();
  for (const key of ['sources', 'text', 'rationale']) Object.defineProperty(extra, key,
    { enumerable: true, get() { reads++; throw new Error('Source context must not be read'); } });
  Object.defineProperty(extra, 'toJSON', { value() { reads++; return {}; } });
  extra[Symbol('unused')] = 'UNUSED_SOURCE_MARKER';
  assert.deepEqual(build(extra), build(input()));
  assert.equal(reads, 0);
});

test('exact identity is issued, fully aligned byte equality with local-only provenance', () => {
  const original = input(), view = build(original);
  assert.deepEqual(identity(view), { valid: true, supported: true,
    claims: [{ claimId: 'C1', meaningPreserved: true }], method: 'exact-text-identity', reviewSha256: view.data.reviewSha256 });
  original.claims[0] = 'A later caller mutation.';
  assert.equal(identity(view).method, 'exact-text-identity');
  assert.throws(() => identity(structuredClone(view)), /TEXT_PRESERVATION_BINDING/);
  assert.throws(() => identity({ ...view }), /TEXT_PRESERVATION_BINDING/);
  for (const claim of ['The depot shipped six crates!', 'the depot shipped six crates.',
    'The depot shipped  six crates.', 'The depot shipped six boxes.']) {
    assert.equal(identity(build({ ...input(), claims: [claim] })), null);
  }
  assert.equal(identity(build({ claims: ['Café opened.'], previousClaims: ['Cafe\u0301 opened.'] })), null,
    'Unicode normalization is not byte identity');
  const pair = { claims: ['First claim.', 'Second claim.'], previousClaims: ['First claim.', 'Second claim.'] };
  assert.equal(identity(build(pair)).claims.length, 2);
  assert.equal(identity(build({ ...pair, previousClaims: [...pair.previousClaims].reverse() })), null);
  assert.equal(identity(build({ ...pair, previousClaims: ['First claim.', 'Changed second.'] })), null);
  const unsupported = holdouts.find(c => c.caseId === 'PH03');
  assert.equal(unsupported.expectedSourceSupported, false);
  assert.equal(identity(build(unsupported.input)).supported, true, 'Identity establishes meaning only, never source support');
  assert.equal(identity(build(paraphrases[0].input)), null, 'PH05 requires a model meaning judgment');
});

test('validated model answers are dimension-local, complete and canonically ordered', () => {
  const view = build({ claims: ['First claim.', 'Second claim.'], previousClaims: ['Earlier first.', 'Earlier second.'] });
  for (const first of [false, true]) for (const second of [false, true]) {
    const response = payload(view);
    response.judgments[0].meaningPreserved = first; response.judgments[1].meaningPreserved = second;
    response.judgments.reverse();
    assert.deepEqual(validate(response, view), { valid: true, supported: first && second,
      claims: [{ claimId: 'C1', meaningPreserved: first }, { claimId: 'C2', meaningPreserved: second }] });
  }
  const duplicate = payload(view); duplicate.judgments[1].claimId = 'C1';
  assert.deepEqual(validate(duplicate, view), invalid);
  assert.deepEqual(validate(payload(view), structuredClone(view)), invalid);
  assert.deepEqual(validate(payload(view), build(input())), invalid);
});

test('response validation rejects extra approval/citation fields and unsafe descriptors without reading them', () => {
  const view = build(input()); let reads = 0;
  const mutations = [
    p => { p.reviewSha256 = '0'.repeat(64); }, p => { p.supported = true; },
    p => { p.judgments = []; }, p => { p.judgments = Array(1); }, p => { p.judgments[0].claimId = 'C2'; },
    p => { p.judgments[0].evidenceIds = []; }, p => { p.judgments[0].sourceSupported = true; },
    p => { p.judgments[0].meaningPreserved = 'true'; }, p => { p.judgments[0].comparison = ' '; },
    p => { p.judgments[0].comparison = 'x'.repeat(241); },
    p => { Object.setPrototypeOf(p, { inherited: true }); }, p => { p[Symbol('hidden')] = true; },
    p => { Object.defineProperty(p, 'hidden', { value: true }); },
    p => { Object.defineProperty(p, 'reviewSha256', { enumerable: true, get() { reads++; return view.data.reviewSha256; } }); },
    p => { Object.defineProperty(p.judgments, '0', { enumerable: true, get() { reads++; return {}; } }); },
    p => { Object.defineProperty(p.judgments[0], 'meaningPreserved', { enumerable: true, get() { reads++; return true; } }); },
    p => { Object.defineProperty(p.judgments, 'toJSON', { value() { reads++; return []; } }); },
  ];
  for (const mutate of mutations) { const response = payload(view); mutate(response); assert.deepEqual(validate(response, view), invalid); }
  assert.equal(reads, 0);
  const plain = payload(view); Object.setPrototypeOf(plain, null); Object.setPrototypeOf(plain.judgments[0], null);
  assert.equal(validate(plain, view).valid, true);
});

test('identity cannot bypass strict original inventory validation', () => {
  let reads = 0;
  const mutations = [
    p => { delete p.previousClaims; }, p => { p.claims = []; p.previousClaims = []; },
    p => { p.claims = Array(1); }, p => { p.previousClaims = Array(1); },
    p => { p.claims.push(p.claims[0]); p.previousClaims.push(p.previousClaims[0]); },
    p => { p.previousClaims = []; }, p => { p.claims[0] = ''; }, p => { p.claims[0] = ' padded '; },
    p => { p.previousClaims[0] = 'x'.repeat(1001); }, p => { p.claims[0] = {}; },
    p => { Object.setPrototypeOf(p, { claims: p.claims }); },
    p => { Object.setPrototypeOf(p.claims, Object.create(Array.prototype)); },
    p => { Object.defineProperty(p, 'claims', { enumerable: true, get() { reads++; return ['text']; } }); },
    p => { Object.defineProperty(p.previousClaims, '0', { enumerable: true, get() { reads++; return 'text'; } }); },
    p => { Object.defineProperty(p.claims, 'toJSON', { value() { reads++; return ['text']; } }); },
    p => { Object.defineProperty(p, 'previousClaims', { value: p.previousClaims, enumerable: false }); },
  ];
  for (const mutate of mutations) { const value = input(); mutate(value); assert.throws(() => build(value), /TEXT_PRESERVATION_INPUT/); }
  for (const value of [null, [], 'text', undefined]) assert.throws(() => build(value), /TEXT_PRESERVATION_INPUT/);
  assert.equal(reads, 0);
});
