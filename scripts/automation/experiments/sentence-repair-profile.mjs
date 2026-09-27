// One pinned, still-unapproved seed. It never replaces the factual baseline.
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {buildSentenceRewriteView} from '../free/sentence-rewrite.mjs';
import {NAMED_COMPOSITION_PROMPT} from './direct-definition-editor.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex');
const fail=()=>Object.assign(new Error('SENTENCE_REPAIR_PACKET_INVALID'),{code:'SENTENCE_REPAIR_PACKET_INVALID'});
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const SENTENCE_REPAIR_PACKET_SHA256='37c21351754b87a32c9251a8a7cde4c60f2c3d046b3b9bd6b4fb367b6868f60a';
export const SENTENCE_REPAIR_PROMPT=NAMED_COMPOSITION_PROMPT+`
This is a targeted repair of an unapproved seed, not a fresh rewrite. Change only the units with repairReferences; all other seed sentences must remain byte-for-byte unchanged. On abstention, return every seed catalog unit unchanged, not the originalText references.
For each repair, preserve the complete originalText meaning using the FULL reviewed definition and its stated sense, not the seed's incomplete paraphrase. Preserve all defining components and their relationships, not just a definition's opening category or general description.
DUPLICATE_OBLIGATION: express the mandatory force once using a compact natural modifier, rather than adding a relative clause that repeats an obligation already expressed by the verb. Do not weaken a mandatory condition to a preference.
INCOMPLETE_DEFINITION_COMPONENTS: restore every defining component and relationship omitted by the seed, using direct ordinary wording. A broad category or the opening clause of a definition is not equivalent to its full meaning. Do not paste an entire glossary sentence or add claims beyond the original concept.
The feedback is not proof that a repair is correct. Source, original-to-final meaning and independent full-text checks still apply. If a safe repair is uncertain, abstain; do not improve unrelated sentences.`;
export const PLAIN_SENTENCE_REPAIR_PROMPT=SENTENCE_REPAIR_PROMPT+`
The technical labels in definitions and originalText are reference vocabulary, NOT phrases to copy into a repaired sentence. forbiddenTechnicalLabels is the complete canonical list checked by the style guard, including explicit singular/plural forms; it is vocabulary, not additional source facts. No changed sentence may contain any label in that list, including a term associated with a different unit. Preserve required names, but express every technical concept fully in ordinary language instead of restoring its label.
Before returning JSON, check both repaired sentences against forbiddenTechnicalLabels. If a label remains, replace it with a concise natural expression of its FULL meaning, including its defining components and relationships. Never drop meaning just to avoid a label. If you cannot satisfy both requirements, abstain with the unchanged seed catalog.`;

export function loadSentenceRepairPacketText(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>12000||sha(text)!==SENTENCE_REPAIR_PACKET_SHA256)throw fail();
  const packet=JSON.parse(text);
  const catalog=buildSentenceRewriteView(packet.seedUnits);
  if(catalog.data.baselineSha256!==packet.seedUnitsSha256)throw fail();
  return freeze({...packet,packetSha256:SENTENCE_REPAIR_PACKET_SHA256});
}
export function decodeSentenceRepairPacket(encoded){
  if(typeof encoded!=='string'||!encoded||encoded.length>16000||!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded))throw fail();
  const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)throw fail();
  let text;try{text=gunzipSync(bytes,{maxOutputLength:12000}).toString('utf8');}catch{throw fail();}
  loadSentenceRepairPacketText(text);return text;
}
