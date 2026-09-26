import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadDefinitionGlossary, SYNTHETIC_DEFINITION_SOURCE } from '../scripts/automation/experiments/definition-glossaries.mjs';
import { buildDefinitionPreservationReview as build, validateDefinitionPreservationReview as validate } from '../scripts/automation/experiments/definition-preservation.mjs';
import { DEFINITION_PRESERVATION_CONTROLS as controls, DEFINITION_CASESET_SHA256 } from '../scripts/automation/experiments/definition-preservation-cases.mjs';
import { buildTextPreservationReview as buildText, validateTextPreservationReview as validateText } from '../scripts/automation/free/text-preservation-review.mjs';
import { buildIsolatedPreservationReview as buildSource, validateIsolatedPreservationReview as validateSource } from '../scripts/automation/free/isolated-preservation-review.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const glossary = () => loadDefinitionGlossary('synthetic-generation-definitions-v1', SYNTHETIC_DEFINITION_SOURCE);
const input = () => structuredClone(controls[0].input);
const invalid = { valid: false, supported: false };
const payload = (view, meaningPreserved = true) => ({ reviewSha256: view.data.reviewSha256,
  judgments: view.data.claims.map(({ claimId }) => ({ claimId,
    comparison: 'Mock verdict for plumbing only; not model semantic qualification.', meaningPreserved })) });
const frozen = value => {
  if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozen); }
};

test('only fixed registry entries and exact captured definition sources can issue a glossary', () => {
  const issued = glossary(); frozen(issued);
  assert.equal(issued.sourceSha256, sha(SYNTHETIC_DEFINITION_SOURCE));
  assert.equal(issued.manifestSha256, '0cf61d8cd2c159df5444d79ea6975b681d7120d922d258a166f2a3035015fec9');
  for (const [id, source] of [
    ['unknown', SYNTHETIC_DEFINITION_SOURCE], ['synthetic-generation-definitions-v1', ''],
    ['synthetic-generation-definitions-v1', `${SYNTHETIC_DEFINITION_SOURCE}\n`],
    ['synthetic-generation-definitions-v1', SYNTHETIC_DEFINITION_SOURCE.replace('nonoptional', 'optional')],
    ['synthetic-generation-definitions-v1', { toString() { throw new Error('must not execute'); } }],
    ['synthetic-generation-definitions-v1', 'x'.repeat(100_001)],
    ['mit-generation-definitions-v1', SYNTHETIC_DEFINITION_SOURCE],
  ]) assert.throws(() => loadDefinitionGlossary(id, source), /DEFINITION_GLOSSARY_BINDING/);
  for (const fake of [undefined, null, structuredClone(issued), { ...issued },
    { approved: true, definitions: issued.definitions }, { id: issued.id, sourceSha256: issued.sourceSha256 }]) {
    assert.throws(() => build(input(), fake), /DEFINITION_GLOSSARY_BINDING/);
  }
  assert.throws(() => { issued.definitions[0].definition = 'optional requirements'; }, TypeError);
});

test('offline cases and prompt are pinned; meaning input contains only aligned sentences and relevant definitions', () => {
  assert.equal(DEFINITION_CASESET_SHA256, '1138e8fa6bedeb41e87772f2e5b151b974fea6bd8269ff56097dccbc44936df2');
  assert.equal(controls.length, 11); frozen(controls);
  for (const control of controls) {
    const view = build(control.input, glossary()); frozen(view);
    assert.equal(sha(view.prompt), 'b0711232aac6664bf9ff040aa4edb61a8e2c3bac199949adea8132db299c9785');
    assert.deepEqual(Object.keys(view.data), ['policy', 'claims', 'previousClaims', 'glossaryBinding', 'definitions', 'reviewSha256']);
    const { reviewSha256, ...bound } = view.data;
    assert.equal(reviewSha256, sha(JSON.stringify(bound)));
    assert.deepEqual(view.schema.properties.reviewSha256.enum, [reviewSha256]);
    assert.deepEqual(view.data.claims.map(c => c.text), control.input.claims);
    assert.deepEqual(view.data.previousClaims.map(c => c.text), control.input.previousClaims);
    assert.deepEqual(Object.keys(view.schema.properties.judgments.items.properties), ['claimId', 'comparison', 'meaningPreserved']);
    assert.doesNotMatch(JSON.stringify(view.data), /"sources"|"passages"|"publisher"|"evidence"|"caseId"|"rationale"|"expected/);
    assert.ok(!JSON.stringify(view).includes(control.rationale));
    assert.ok(!JSON.stringify(view).includes(SYNTHETIC_DEFINITION_SOURCE));
    assert.match(view.prompt, /Definition presence alone is not a pass/);
    assert.match(view.prompt, /missing or ambiguous, reject/);
    assert.match(view.prompt, /Source support and readability require separate checks/);
    for (const entry of view.data.definitions) assert.deepEqual(Object.keys(entry), ['term', 'definition', 'sense']);
  }
});

test('minimal selection uses whole terms in either inventory and never invents missing definitions', () => {
  const make = (before, after = before) => build({ claims: [after], previousClaims: [before] }, glossary()).data.definitions;
  assert.equal(make('BINDING RULES apply.')[0].term, 'binding rules');
  assert.equal(make('Its rules apply.', 'Its binding rules apply.')[0].term, 'binding rules');
  assert.equal(make('Its binding rules apply.', 'Its requirements apply.')[0].term, 'binding rules');
  assert.equal(make('Binding rules constrain draft candidates.').length, 2);
  assert.deepEqual(make('A binding rule constrains every draft candidate.').map(d => [d.term, d.definition]), [
    ['binding rule', 'a nonoptional requirement'], ['draft candidate', 'a partial answer made before a final answer'],
  ]);
  for (const text of ['Nonbinding rules apply.', 'Binding rulesets apply.', 'ébinding rules apply.',
    'binding rulesé apply.', '_binding rules apply.', 'Nonoptional requirements apply.', 'Unknown technical terms apply.']) {
    assert.deepEqual(make(text), []);
  }
  // Defining the word is not a verdict that the definition fits this sentence.
  const outOfSense = build({ previousClaims: ['The book’s binding rules are obscure.'],
    claims: ['The book’s nonoptional requirements are obscure.'] }, glossary());
  assert.equal(outOfSense.data.definitions[0].sense, 'Requirements for completed outputs.');
  assert.equal(validate(payload(outOfSense, false), outOfSense).supported, false);
});

test('source or caller metadata never leaks through input accessors or caller mutations', () => {
  const value = input(); let reads = 0;
  for (const key of ['sources', 'text', 'definitions', 'expectedMeaningPreserved', 'rationale']) {
    Object.defineProperty(value, key, { enumerable: true, get() { reads++; throw new Error('not reviewer input'); } });
  }
  Object.defineProperty(value, 'toJSON', { value() { reads++; throw new Error('not serializable input'); } });
  const view = build(value, glossary());
  assert.deepEqual(view, build(input(), glossary()));
  assert.equal(reads, 0);
  value.claims[0] = 'A changed assertion.';
  assert.equal(view.data.claims[0].text, controls[0].input.claims[0]);
});

test('new bindings reject stale, cross-role, plain-text and cloned-view answers', () => {
  const view = build(input(), glossary()), response = payload(view), old = buildText(input());
  assert.notEqual(view.data.reviewSha256, old.data.reviewSha256);
  assert.deepEqual(validateText(response, old), invalid);
  assert.deepEqual(validate(payload(old), view), invalid);
  assert.deepEqual(validate(response, buildSource(input(), 'source')), invalid);
  for (const fake of [structuredClone(view), { ...view }, undefined, null]) assert.deepEqual(validate(response, fake), invalid);
  const swapped = input(); [swapped.claims, swapped.previousClaims] = [swapped.previousClaims, swapped.claims];
  assert.deepEqual(validate(response, build(swapped, glossary())), invalid);
  const changed = input(); changed.claims[0] += ' An additional assertion.';
  assert.deepEqual(validate(response, build(changed, glossary())), invalid);
  const changedContext = structuredClone(view); changedContext.data.definitions[0].definition = 'optional requirements';
  assert.deepEqual(validate(response, changedContext), invalid);
});

test('each veto stays authoritative; mocked label replay checks plumbing, NOT model reasoning', () => {
  const accepted = [];
  for (const control of controls) {
    const meaningView = build(control.input, glossary()), sourceView = buildSource(control.input, 'source');
    const meaning = validate(payload(meaningView, control.expectedMeaningPreserved), meaningView);
    const source = validateSource({ reviewSha256: sourceView.data.reviewSha256, judgments: [{ claimId: 'C1',
      comparison: 'Mock source verdict; not a live factual review.', sourceSupported: control.expectedSourceSupported,
      evidenceIds: control.expectedSourceSupported ? ['S1P1'] : [] }] }, sourceView);
    assert.equal(meaning.valid, true); assert.equal(source.valid, true);
    assert.equal(meaning.supported, control.expectedMeaningPreserved);
    assert.equal(source.supported, control.expectedSourceSupported);
    if (source.supported && meaning.supported) accepted.push(control.caseId);
  }
  assert.deepEqual(accepted, ['G01', 'G02']);
  // Both dimensions may be individually true when the other dimension is false.
  assert.deepEqual(controls.filter(c => c.expectedSourceSupported && !c.expectedMeaningPreserved).map(c => c.caseId), ['G05', 'G07']);
  assert.deepEqual(controls.filter(c => !c.expectedSourceSupported && c.expectedMeaningPreserved).map(c => c.caseId), ['G10']);
});

test('response adapter preserves strict descriptor validation without invoking getters', () => {
  const view = build(input(), glossary()); let reads = 0;
  const mutations = [
    p => { p.reviewSha256 = '0'.repeat(64); }, p => { p.approved = true; },
    p => { p.judgments = []; }, p => { p.judgments = Array(1); }, p => { p.judgments[0].claimId = 'C2'; },
    p => { p.judgments[0].sourceSupported = true; }, p => { p.judgments[0].evidenceIds = ['P1']; },
    p => { p.judgments[0].meaningPreserved = 'true'; }, p => { p.judgments[0].comparison = ' '; },
    p => { p.judgments[0].comparison = 'x'.repeat(241); }, p => { Object.setPrototypeOf(p, { inherited: true }); },
    p => { p[Symbol('hidden')] = true; }, p => { Object.defineProperty(p, 'hidden', { value: true }); },
    p => { Object.defineProperty(p, 'reviewSha256', { value: p.reviewSha256, enumerable: false }); },
    p => { Object.defineProperty(p, 'reviewSha256', { enumerable: true, get() { reads++; return view.data.reviewSha256; } }); },
    p => { Object.defineProperty(p, 'judgments', { enumerable: true, get() { reads++; return []; } }); },
    p => { Object.defineProperty(p.judgments, '0', { enumerable: true, get() { reads++; return {}; } }); },
    p => { Object.defineProperty(p.judgments[0], 'meaningPreserved', { enumerable: true, get() { reads++; return true; } }); },
    p => { Object.defineProperty(p, 'toJSON', { value() { reads++; return {}; } }); },
  ];
  for (const mutate of mutations) { const response = payload(view); mutate(response); assert.deepEqual(validate(response, view), invalid); }
  assert.equal(reads, 0);
  const nullProto = payload(view); Object.setPrototypeOf(nullProto, null);
  assert.equal(validate(nullProto, view).valid, true);
});

test('all aligned claims are required and independent false judgments remain false', () => {
  const pair = { claims: ['Final one.', 'Final two.'], previousClaims: ['Earlier one.', 'Earlier two.'] };
  const view = build(pair, glossary());
  for (const first of [false, true]) for (const second of [false, true]) {
    const response = payload(view);
    response.judgments[0].meaningPreserved = first; response.judgments[1].meaningPreserved = second;
    response.judgments.reverse();
    assert.deepEqual(validate(response, view), { valid: true, supported: first && second,
      claims: [{ claimId: 'C1', meaningPreserved: first }, { claimId: 'C2', meaningPreserved: second }] });
  }
  const duplicate = payload(view); duplicate.judgments[1].claimId = 'C1';
  assert.deepEqual(validate(duplicate, view), invalid);
  const missing = payload(view); missing.judgments.pop(); assert.deepEqual(validate(missing, view), invalid);
});

test('definition context does not bypass the existing input guards or auto-approve text', () => {
  let reads = 0;
  const mutations = [
    p => { p.claims = []; p.previousClaims = []; }, p => { p.claims = Array(1); },
    p => { p.previousClaims = []; }, p => { p.claims[0] = ' padded '; },
    p => { p.previousClaims[0] = 'x'.repeat(1001); }, p => { p.claims[0] = null; },
    p => { Object.defineProperty(p, 'claims', { enumerable: true, get() { reads++; return []; } }); },
  ];
  for (const mutate of mutations) { const value = input(); mutate(value); assert.throws(() => build(value, glossary()), /TEXT_PRESERVATION_INPUT/); }
  assert.equal(reads, 0);
  const identical = input(); identical.claims = [...identical.previousClaims];
  const view = build(identical, glossary());
  assert.deepEqual(Object.keys(view), ['data', 'schema', 'prompt']);
  assert.equal(validate(payload(view, false), view).supported, false, 'No implicit approval, even for identical text');
});
