import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { citationCorrectionFixture } from './fixtures/citation-correction.mjs';
import { FREE_PROJECT_CONFIRMATION } from '../scripts/automation/check-gemini-writer.mjs';
import { GEMINI_LITE_MODEL } from '../scripts/automation/free/gemini-ai.mjs';
import { previewCitationCorrectionAllowed as allowed, applyPreviewCitationAdditions as apply,
  proposePreviewCitationCorrection as propose } from '../scripts/automation/free/preview-citation-correction.mjs';
import { buildPreviewReviewPacket } from '../scripts/automation/free/preview-editorial-review.mjs';

const apiKey = 'synthetic-key-never-print-this';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const response = additions => ({ editorialPayload: { additions }, model: GEMINI_LITE_MODEL,
  requestSha256: 'a'.repeat(64), responseSha256: 'b'.repeat(64) });
const argumentsFor = fixture => ({ ...fixture, apiKey, freeProjectConfirmation: FREE_PROJECT_CONFIRMATION });

test('synthetic sole audience-map failure permits additive IDs, never changes raw prose or other citations', () => {
  const fixture = citationCorrectionFixture(), before = structuredClone(fixture);
  assert.equal(allowed(fixture.result, fixture.dossier), true);
  const corrected = apply(fixture.result, fixture.dossier, fixture.additions);
  const original = fixture.result.rejectedDiagnostic.payload;
  assert.equal(JSON.stringify(corrected.stories), JSON.stringify(original.stories));
  assert.deepEqual(corrected.evidenceForFields.deck, ['S1P3', 'S1P4']);
  for (const field of ['headline', 'whyItMatters', 'whatToDoOrWatch']) assert.deepEqual(corrected.evidenceForFields[field], original.evidenceForFields[field]);
  assert.deepEqual(buildPreviewReviewPacket(corrected.stories[0], fixture.dossier, corrected.evidenceForFields).holds, []);
  assert.deepEqual(fixture, before);
});

test('eligibility rejects incorrect status, model, provenance, additional errors or malformed saved details', () => {
  const changes = [
    f => { f.result.report.status = 'human-review-required'; },
    f => { f.result.report.code = 'GEMINI_INCOMPLETE_OR_BLOCKED'; },
    f => { f.result.report.model = 'another-model'; },
    f => { f.result.report.approved = true; },
    f => { f.result.report.qualified = true; },
    f => { f.result.report.productionEnabled = true; },
    f => { f.result.report.emailRequests = 1; },
    f => { f.result.html = '<html>not a rejected raw draft</html>'; },
    f => { f.result.report.structuralErrors.push('SHAPE'); },
    f => { f.result.report.structuralErrors.push('MAPPED_AUDIENCE_SUPPORT_REQUIRED'); },
    f => { f.result.rejectedDiagnostic.unapproved = false; },
    f => { f.result.rejectedDiagnostic.payload.stories[0].candidateId = 'different'; },
    f => { f.result.rejectedDiagnostic.payload.stories.push(f.result.rejectedDiagnostic.payload.stories[0]); },
    f => { f.result.rejectedDiagnostic.extra = 'unexplained rejection'; },
    f => { f.result.rejectedDiagnostic.rejectionDetails[0].feedback.extra = 'other defect'; },
    f => { f.result.rejectedDiagnostic.rejectionDetails[0].feedback.field = 'claims.0'; },
    f => { f.result.rejectedDiagnostic.rejectionDetails.push(f.result.rejectedDiagnostic.rejectionDetails[0]); },
    f => { f.result.rejectedDiagnostic.rejectionDetails = []; },
    f => { f.result.rejectedDiagnostic.payload.evidenceForFields.deck = ['S1P1', 'S1P2', 'S1P3', 'S1P6']; },
    f => { f.dossier.sources[0].passages.push({ ...f.dossier.sources[0].passages[0] }); },
  ];
  for (const change of changes) {
    const fixture = citationCorrectionFixture(); change(fixture);
    assert.equal(allowed(fixture.result, fixture.dossier), false);
    assert.throws(() => apply(fixture.result, fixture.dossier, fixture.additions));
  }
});

test('full reconstruction catches unreported reader, claim, advisory/source and structural defects', () => {
  const changes = [
    f => { f.result.rejectedDiagnostic.payload.stories[0].whyItMatters += ' This guarantees reliability.'; },
    f => { f.result.rejectedDiagnostic.payload.stories[0].claims[0].text += ' Free accounts are included.'; },
    f => { f.result.rejectedDiagnostic.payload.stories[0].claims[0].supports = [{ evidenceId: 'S1P99' }]; },
    f => { f.result.rejectedDiagnostic.payload.stories[0].deck = 'Free accounts receive 999 requests.'; },
    f => { f.result.rejectedDiagnostic.payload.stories[0].whyItMatters = 'Too short.'; },
    f => { f.dossier.sources[0].text += ' Update to V'; },
    f => { f.result.rejectedDiagnostic.payload.evidenceForFields.deck = ['S1P4']; },
    f => { f.result.rejectedDiagnostic.rejectionDetails[0].feedback.field = 'headline'; },
    f => { f.result.rejectedDiagnostic.payload.stories[0].whatToDoOrWatch += ' Premium accounts should check their phase.'; },
  ];
  for (const change of changes) {
    const fixture = citationCorrectionFixture(); change(fixture);
    assert.equal(allowed(fixture.result, fixture.dossier), false);
  }
});

test('all four flagged reader fields must each receive an addition, without touching claim supports', () => {
  const fixture = citationCorrectionFixture(), payload = fixture.result.rejectedDiagnostic.payload;
  payload.stories[0].headline = 'Free accounts lead Acme’s staged workspace transition';
  payload.stories[0].whyItMatters += ' Free accounts are the first named tier.';
  payload.stories[0].whatToDoOrWatch += ' Free accounts can check the applicable stage.';
  const fields = ['headline', 'deck', 'whyItMatters', 'whatToDoOrWatch'];
  fixture.result.rejectedDiagnostic.rejectionDetails = fields.map(field => ({ reason: 'MAPPED_AUDIENCE_SUPPORT_REQUIRED', feedback: { field } }));
  assert.equal(allowed(fixture.result, fixture.dossier), true);
  const additions = fields.map(field => ({ field, evidenceIds: ['S1P4'] }));
  assert.throws(() => apply(fixture.result, fixture.dossier, additions.slice(1)));
  const corrected = apply(fixture.result, fixture.dossier, additions);
  assert.deepEqual(corrected.stories, payload.stories);
  for (const field of fields) assert.equal(corrected.evidenceForFields[field].at(-1), 'S1P4');
});

test('unknown, duplicate, existing, unrelated and prose-bearing additions all fail closed', () => {
  const invalid = [
    [], [{ field: 'deck', evidenceIds: [] }], [{ field: 'deck', evidenceIds: ['S1P99'] }],
    [{ field: 'deck', evidenceIds: ['S1P3'] }], [{ field: 'deck', evidenceIds: ['S1P5'] }],
    [{ field: 'deck', evidenceIds: ['S1P6'] }], [{ field: 'deck', evidenceIds: ['S1P4', 'S1P6'] }],
    [{ field: 'deck', evidenceIds: ['S1P4', 'S1P4'] }], [{ field: 'deck', evidenceIds: [null] }],
    [{ field: 'headline', evidenceIds: ['S1P4'] }], [{ field: 'claims.0', evidenceIds: ['S1P4'] }],
    [{ field: 'deck', evidenceIds: ['S1P4'], text: 'replacement prose' }],
    [{ field: 'deck', evidenceIds: ['S1P4'], remove: ['S1P3'] }],
    [{ field: 'deck', evidenceIds: ['S1P4'] }, { field: 'deck', evidenceIds: ['S1P4'] }],
  ];
  for (const additions of invalid) {
    const fixture = citationCorrectionFixture(), before = structuredClone(fixture);
    assert.throws(() => apply(fixture.result, fixture.dossier, additions));
    assert.deepEqual(fixture, before);
  }
});

test('added passages must close every missing audience and cannot introduce another reader alarm', () => {
  const fixture = citationCorrectionFixture();
  fixture.result.rejectedDiagnostic.payload.stories[0].deck = 'Free and unauthenticated accounts lead the initial workspace transition.';
  fixture.dossier.sources[0].passages.push({ evidenceId: 'S1P7', text: 'Free accounts start their transition first.' });
  fixture.dossier.sources[0].passages.push({ evidenceId: 'S1P8', text: 'A request with no credentials is unauthenticated traffic in the first phase.' });
  assert.equal(allowed(fixture.result, fixture.dossier), true);
  assert.throws(() => apply(fixture.result, fixture.dossier, [{ field: 'deck', evidenceIds: ['S1P7'] }]));
  assert.doesNotThrow(() => apply(fixture.result, fixture.dossier, [{ field: 'deck', evidenceIds: ['S1P7', 'S1P8'] }]));
  fixture.result.rejectedDiagnostic.payload.stories[0].deck = 'Free accounts get preview windows for the transition.';
  fixture.dossier.sources[0].passages[3].text += ' These preview windows for Free and unauthenticated traffic occur during the first stage.';
  assert.equal(allowed(fixture.result, fixture.dossier), true);
  assert.throws(() => apply(fixture.result, fixture.dossier, fixture.additions));
});

test('one fixed free provider request returns bound unapproved proposal and no render or email', async () => {
  const fixture = citationCorrectionFixture(), original = structuredClone(fixture);
  let calls = 0;
  const output = await propose({ ...argumentsFor(fixture), requestImpl: async options => {
    calls++;
    assert.equal(options.model, GEMINI_LITE_MODEL); assert.equal(options.maxAttempts, 1);
    assert.equal(options.maxTokens, 1500); assert.equal(options.thinking, 'low'); assert.equal(options.freeTierConfirmed, true);
    assert.equal(options.tools, undefined); assert.equal(options.endpoint, undefined);
    const prompt = JSON.parse(options.messages[1].content);
    assert.deepEqual(prompt.dossier, fixture.dossier); assert.deepEqual(prompt.unapprovedOriginal, fixture.result.rejectedDiagnostic.payload);
    assert.deepEqual(prompt.fields, ['deck']);
    assert.equal(options.validatePayload({ additions: fixture.additions }), true);
    return response(fixture.additions);
  } });
  assert.equal(calls, 1); assert.equal(output.report.status, 'human-review-required');
  assert.equal(output.report.modelRequests, 1); assert.equal(output.report.emailRequests, 0);
  assert.equal(output.report.approved, false); assert.equal(output.report.qualified, false); assert.equal(output.report.productionEnabled, false);
  assert.equal(output.html, undefined); assert.deepEqual(output.originalPayload, original.result.rejectedDiagnostic.payload);
  assert.equal(output.originalBinding.draftSha256, output.correctedBinding.draftSha256);
  assert.equal(output.originalBinding.renderedStorySha256, output.correctedBinding.renderedStorySha256);
  assert.equal(output.originalBinding.dossierSha256, output.correctedBinding.dossierSha256);
  assert.notEqual(output.originalBinding.evidenceMapSha256, output.correctedBinding.evidenceMapSha256);
  assert.equal(output.originalBinding.payloadSha256, hash(output.originalPayload));
  assert.equal(output.correctedBinding.payloadSha256, hash(output.correctedPayload));
  assert.deepEqual(fixture, original);
});

test('ineligible, unconfirmed, invalid-key and oversized requests never call a provider', async () => {
  let calls = 0;
  for (const change of [
    args => { args.result.report.approved = true; },
    args => { args.freeProjectConfirmation = 'not confirmed'; },
    args => { args.apiKey = 'short'; },
    args => { args.dossier.metadata = 'x'.repeat(70000); },
  ]) {
    const args = argumentsFor(citationCorrectionFixture()); change(args);
    const output = await propose({ ...args, requestImpl: async () => { calls++; } });
    assert.equal(output.report.status, 'failed'); assert.equal(output.report.modelRequests, 0);
  }
  assert.equal(calls, 0);
});

test('provider reply is checked again even when an injected provider skips its validator', async () => {
  const fixture = citationCorrectionFixture();
  const output = await propose({ ...argumentsFor(fixture), requestImpl: async () => response([{ field: 'deck', evidenceIds: ['S1P99'] }]) });
  assert.equal(output.report.status, 'failed'); assert.equal(output.correctedPayload, undefined);
  assert.deepEqual(output.rejectedProposal, { additions: [{ field: 'deck', evidenceIds: ['S1P99'] }] });
  assert.equal(output.report.code, 'CITATION_ADDITIONS_INVALID');
});

test('explicit provider refusal is schema-valid but never becomes a corrected draft or retry', async () => {
  const fixture = citationCorrectionFixture(); let calls = 0;
  const output = await propose({ ...argumentsFor(fixture), requestImpl: async options => {
    calls++;
    assert.equal(options.schema.properties.additions.minItems, 0);
    assert.equal(options.validatePayload({ additions: [] }), true);
    assert.equal(options.validatePayload({ additions: [], explanation: 'not supported' }), false);
    return response([]);
  } });
  assert.equal(calls, 1); assert.equal(output.report.status, 'failed');
  assert.equal(output.report.code, 'CITATION_CORRECTION_DECLINED');
  assert.deepEqual(output.rejectedProposal, { additions: [] });
  assert.equal(output.correctedPayload, undefined); assert.equal(output.html, undefined);
  assert.equal(output.report.emailRequests, 0); assert.equal(output.report.approved, false);
});

test('caller mutation while awaiting a provider cannot change snapshots, prose or provenance hashes', async () => {
  const fixture = citationCorrectionFixture(), original = structuredClone(fixture);
  const output = await propose({ ...argumentsFor(fixture), requestImpl: async options => {
    fixture.result.rejectedDiagnostic.payload.stories[0].headline = 'Mutated after request';
    fixture.result.rejectedDiagnostic.payload.evidenceForFields.deck.push('S1P6');
    fixture.dossier.sources[0].text = 'Mutated source context';
    assert.equal(options.validatePayload({ additions: original.additions }), true);
    return response(original.additions);
  } });
  assert.equal(output.report.status, 'human-review-required');
  assert.deepEqual(output.originalPayload, original.result.rejectedDiagnostic.payload);
  assert.deepEqual(output.correctedPayload.stories, original.result.rejectedDiagnostic.payload.stories);
  assert.equal(output.originalBinding.payloadSha256, hash(original.result.rejectedDiagnostic.payload));
  assert.equal(output.originalBinding.dossierSha256, hash(original.dossier));
});

test('safe rejected citation JSON can be audited, while prose, secrets and errors are never echoed', async () => {
  const fixture = citationCorrectionFixture();
  for (const payload of [{ additions: [{ field: 'deck', evidenceIds: ['S1P5'] }] },
    { additions: [{ field: 'deck', evidenceIds: ['S1P4'], prose: apiKey }] }]) {
    const output = await propose({ ...argumentsFor(fixture), requestImpl: async options => {
      assert.equal(options.validatePayload(payload), false);
      throw Object.assign(new Error(apiKey), { code: 'GEMINI_EDITORIAL_VALIDATION_FAILED', thought: apiKey });
    } });
    assert.equal(output.report.status, 'failed'); assert.equal(output.report.modelRequests, 1);
    assert.doesNotMatch(JSON.stringify(output), new RegExp(apiKey));
    if (Object.hasOwn(payload.additions[0], 'prose')) assert.equal(output.rejectedProposal, undefined);
    else assert.deepEqual(output.rejectedProposal, payload);
  }
  let calls = 0;
  const output = await propose({ ...argumentsFor(fixture), requestImpl: async () => {
    calls++; throw Object.assign(new Error(apiKey), { code: 'GEMINI_FREE_QUOTA_EXHAUSTED', httpStatus: 429, message: apiKey });
  } });
  assert.equal(calls, 1); assert.equal(output.report.httpStatus, 429); assert.doesNotMatch(JSON.stringify(output), new RegExp(apiKey));
});

test('non-plain and executable input graphs fail without running getters or serialization hooks', () => {
  const fixture = citationCorrectionFixture(); let invoked = 0;
  Object.defineProperty(fixture.result.rejectedDiagnostic.payload, 'unexpected', { enumerable: true, get() { invoked++; return 'bad'; } });
  assert.equal(allowed(fixture.result, fixture.dossier), false); assert.equal(invoked, 0);
  const other = citationCorrectionFixture();
  other.result.rejectedDiagnostic.payload.toJSON = () => { invoked++; return {}; };
  assert.equal(allowed(other.result, other.dossier), false); assert.equal(invoked, 0);
  const cycle = citationCorrectionFixture(); cycle.dossier.cycle = cycle.dossier;
  assert.equal(allowed(cycle.result, cycle.dossier), false);
});
