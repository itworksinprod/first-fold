import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {decodeSentenceRepairPacket,loadSentenceRepairPacketText,SENTENCE_REPAIR_PROMPT,PLAIN_SENTENCE_REPAIR_PROMPT} from '../scripts/automation/experiments/sentence-repair-profile.mjs';
import {NAMED_COMPOSITION_PROMPT} from '../scripts/automation/experiments/direct-definition-editor.mjs';
import {prepareSentenceRepair} from '../scripts/automation/private-writer-diagnostic.mjs';
import {diagnoseFactSummary} from '../scripts/automation/fact-summary-diagnostic.mjs';

test('repair packet rejects unpinned, malformed or oversized inputs',()=>{
  for(const input of [undefined,'','{}','x'.repeat(12001)])assert.throws(()=>loadSentenceRepairPacketText(input),/SENTENCE_REPAIR_PACKET_INVALID/);
  for(const input of [undefined,'','AAAA ','AAA',Buffer.from('not gzip').toString('base64'),gzipSync('{}').toString('base64'),gzipSync('x'.repeat(12001)).toString('base64'),'A'.repeat(16001)])assert.throws(()=>decodeSentenceRepairPacket(input),/SENTENCE_REPAIR_PACKET_INVALID/);
});
test('repair input is confined to its one explicit no-email mode',async()=>{
  for(const mode of ['source','context-named-unit-language','context-assisted-language','saved-final-review']){
    assert.equal(await prepareSentenceRepair(mode,''),undefined);
    await assert.rejects(prepareSentenceRepair(mode,'private'),/UNEXPECTED_REPAIR_PACKET/);
  }
  await assert.rejects(prepareSentenceRepair('context-two-unit-repair',''),/SENTENCE_REPAIR_PACKET_INVALID/);
  await assert.rejects(prepareSentenceRepair('context-two-unit-plain-repair',''),/SENTENCE_REPAIR_PACKET_INVALID/);
  await assert.rejects(diagnoseFactSummary({plainRepair:true}),/FACT_SUMMARY_MODE/);
  await assert.rejects(diagnoseFactSummary({repairPacketText:'private'}),/FACT_SUMMARY_MODE/);
});
test('repair instructions preserve full definitions without article-specific replacement answers',()=>{
  assert.ok(SENTENCE_REPAIR_PROMPT.startsWith(NAMED_COMPOSITION_PROMPT));
  assert.match(SENTENCE_REPAIR_PROMPT,/On abstention, return every seed catalog unit unchanged, not the originalText references/);
  for(const instruction of ['byte-for-byte unchanged','FULL reviewed definition','all defining components and their relationships','mandatory force once','not proof','abstain','110 and 225'])assert.ok(SENTENCE_REPAIR_PROMPT.includes(instruction));
  assert.doesNotMatch(SENTENCE_REPAIR_PROMPT,/HardFlow|MIT|robot|optimization formulation|mathematical statement/u);
  assert.ok(PLAIN_SENTENCE_REPAIR_PROMPT.startsWith(SENTENCE_REPAIR_PROMPT));
  assert.match(PLAIN_SENTENCE_REPAIR_PROMPT,/Preserve required names/);
  assert.match(PLAIN_SENTENCE_REPAIR_PROMPT,/Never drop meaning just to avoid a label/);
});
test('repair profile and CLI can import in cold processes without an initialization cycle',()=>{
  for(const name of ['sentence-repair-profile','context-editor-profile']){
    const url=new URL(`../scripts/automation/experiments/${name}.mjs`,import.meta.url).href;
    execFileSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(url)})`],{stdio:'pipe'});
  }
});
