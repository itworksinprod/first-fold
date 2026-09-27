import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { CONTEXT_EDITOR_PROMPT, decodeContextEditorPacket, loadContextEditorPacketText } from '../scripts/automation/experiments/context-editor-profile.mjs';
import { loadContextDefinitionGlossary } from '../scripts/automation/experiments/definition-glossaries.mjs';
import { DEFINITION_COMPOSITION_PROMPT } from '../scripts/automation/experiments/definition-composition-prompt.mjs';
import { prepareContextDiagnostic, resolvePrivateWriterDiagnosticMode } from '../scripts/automation/private-writer-diagnostic.mjs';
import { diagnoseFactSummary } from '../scripts/automation/fact-summary-diagnostic.mjs';

test('context packet rejects unpinned, malformed and over-limit inputs', async () => {
  for (const value of [undefined, '', '{}', 'AAA', 'AAAA ', 'a'.repeat(48001),
    Buffer.from('not gzip').toString('base64'), gzipSync('{}').toString('base64'),
    gzipSync('x'.repeat(75001)).toString('base64')]) {
    assert.throws(() => decodeContextEditorPacket(value), /CONTEXT_EDITOR_PACKET_INVALID/);
  }
  for (const value of [undefined, '{}', 'x'.repeat(75001)]) {
    await assert.rejects(loadContextEditorPacketText(value), /CONTEXT_EDITOR_PACKET_INVALID/);
  }
  assert.throws(() => loadContextDefinitionGlossary('{}', 'source'), /DEFINITION_GLOSSARY_BINDING/);
});

test('context input is required only for its opt-in mode and rejected elsewhere', async () => {
  assert.equal(resolvePrivateWriterDiagnosticMode('context-assisted-language'), 'context-assisted-language');
  assert.equal(resolvePrivateWriterDiagnosticMode('context-direct-language'), 'context-direct-language');
  assert.equal(resolvePrivateWriterDiagnosticMode('context-direct-unit-language'), 'context-direct-unit-language');
  assert.equal(resolvePrivateWriterDiagnosticMode('context-named-unit-language'), 'context-named-unit-language');
  assert.equal(resolvePrivateWriterDiagnosticMode('context-two-unit-repair'), 'context-two-unit-repair');
  assert.equal(resolvePrivateWriterDiagnosticMode('context-two-unit-plain-repair'), 'context-two-unit-plain-repair');
  assert.equal(resolvePrivateWriterDiagnosticMode('context-complete-repair'), 'context-complete-repair');
  for (const mode of ['source', 'frozen-reasoning-language', 'saved-final-review', 'grammar-reasoning-holdouts']) {
    assert.equal(await prepareContextDiagnostic(mode, ''), undefined);
    await assert.rejects(prepareContextDiagnostic(mode, 'private'), /UNEXPECTED_CONTEXT_PACKET/);
  }
  await assert.rejects(prepareContextDiagnostic('context-assisted-language', ''), /CONTEXT_EDITOR_PACKET_INVALID/);
  await assert.rejects(prepareContextDiagnostic('context-direct-language', ''), /CONTEXT_EDITOR_PACKET_INVALID/);
  await assert.rejects(prepareContextDiagnostic('context-direct-unit-language', ''), /CONTEXT_EDITOR_PACKET_INVALID/);
  await assert.rejects(prepareContextDiagnostic('context-named-unit-language', ''), /CONTEXT_EDITOR_PACKET_INVALID/);
  await assert.rejects(prepareContextDiagnostic('context-two-unit-repair', ''), /CONTEXT_EDITOR_PACKET_INVALID/);
  await assert.rejects(prepareContextDiagnostic('context-two-unit-plain-repair', ''), /CONTEXT_EDITOR_PACKET_INVALID/);
  await assert.rejects(prepareContextDiagnostic('context-complete-repair', ''), /CONTEXT_EDITOR_PACKET_INVALID/);
});

test('new generic fluency guidance retains all existing composition safeguards', () => {
  assert.ok(CONTEXT_EDITOR_PROMPT.startsWith(DEFINITION_COMPOSITION_PROMPT));
  const added = CONTEXT_EDITOR_PROMPT.slice(DEFINITION_COMPOSITION_PROMPT.length);
  assert.match(added, /Keep wording that is already plain/);
  assert.match(added, /all its qualifications/);
  assert.doesNotMatch(added, /\b(?:HardFlow|MIT|deployment|optimization|159|157)\b/i);
});

test('bad context combinations, pins and baseline mismatch fail before inference', async () => {
  const base = { claimwise: true, profile: 'mit-generalization', sentenceLanguageRewrite: true,
    frozenBaselineText: 'baseline', definitionPreservation: true, reasoningEditor: true,
    contextPacketText: '{}', aiRequestImpl: () => assert.fail('no inference'), fetchImpl: () => assert.fail('no network') };
  await assert.rejects(diagnoseFactSummary({ ...base, reasoningEditor: false }), /FACT_SUMMARY_MODE/);
  await assert.rejects(diagnoseFactSummary({ ...base, contextPacketText: undefined, directDefinitions: true }), /FACT_SUMMARY_MODE/);
  await assert.rejects(diagnoseFactSummary({ ...base, directDefinitions: 'true' }), /FACT_SUMMARY_MODE/);
  await assert.rejects(diagnoseFactSummary({ ...base, unitMeaning: true }), /FACT_SUMMARY_MODE/);
  await assert.rejects(diagnoseFactSummary({ ...base, namedComposition: true }), /FACT_SUMMARY_MODE/);
  await assert.rejects(diagnoseFactSummary({ ...base, namedComposition: 'true' }), /FACT_SUMMARY_MODE/);
  await assert.rejects(diagnoseFactSummary(base), /CONTEXT_EDITOR_PACKET_INVALID/);
  await assert.rejects(diagnoseFactSummary({ ...base, contextLoader: async () => ({ baselineText: 'other' }) }), /CONTEXT_EDITOR_BASELINE_CHANGED/);
});

test('workflow scopes private context to two opt-in steps and tests before credentials', async () => {
  const workflow = await readFile(new URL('../.github/workflows/private-writer-diagnostic.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/\(inputs.mode == 'context-assisted-language' \|\| inputs.mode == 'context-direct-language' \|\| inputs.mode == 'context-direct-unit-language' \|\| inputs.mode == 'context-named-unit-language' \|\| inputs.mode == 'context-two-unit-repair' \|\| inputs.mode == 'context-two-unit-plain-repair' \|\| inputs.mode == 'context-complete-repair'\) && secrets.FIRST_FOLD_CONTEXT_EDITOR_PACKET_B64 \|\| ''/gu) ?? []).length, 2);
  assert.equal((workflow.match(/\(inputs.mode == 'context-two-unit-repair' \|\| inputs.mode == 'context-two-unit-plain-repair' \|\| inputs.mode == 'context-complete-repair'\) && secrets.FIRST_FOLD_SENTENCE_REPAIR_B64 \|\| ''/gu)??[]).length,2);
  assert.ok(workflow.indexOf('tests/context-editor-profile.test.mjs') < workflow.indexOf('secrets.CLOUDFLARE_AI_API_TOKEN'));
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /RESEND|OPENAI_API|schedule:|pull_request:/);
});
