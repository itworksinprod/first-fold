// One pinned private experiment, not automatic source discovery or deployment.
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {CONTEXT_EDITOR_PACKET_SHA256,loadContextDefinitionGlossary} from './definition-glossaries.mjs';
import {DEFINITION_COMPOSITION_PROMPT} from './definition-composition-prompt.mjs';
const fail=()=>Object.assign(new Error('CONTEXT_EDITOR_PACKET_INVALID'),{code:'CONTEXT_EDITOR_PACKET_INVALID'});
const sha=t=>createHash('sha256').update(t).digest('hex');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const CONTEXT_EDITOR_PROMPT=DEFINITION_COMPOSITION_PROMPT+`
Keep wording that is already plain: do not replace it with technical terminology merely because a definition is supplied.
For an unclear term with a reviewed definition, prefer a direct, natural equivalent over a technical label followed by a parenthetical gloss.
Retain the concept's grammatical role and all its qualifications. Definitions clarify existing concepts; they do not license new story claims.`;
export function decodeContextEditorPacket(encoded){
  if(typeof encoded!=='string'||!encoded||encoded.length>48_000||!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded))throw fail();
  const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)throw fail();
  let text;try{text=gunzipSync(bytes,{maxOutputLength:75_000}).toString('utf8');}catch{throw fail();}
  if(sha(text)!==CONTEXT_EDITOR_PACKET_SHA256)throw fail();return text;
}
export async function loadContextEditorPacketText(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>75_000||sha(text)!==CONTEXT_EDITOR_PACKET_SHA256)throw fail();
  const packet=JSON.parse(text);
  // The baseline validator uses fact-summary validation. Defer this import so
  // prompt-only consumers and cold CLI imports cannot form an ESM init cycle.
  const {loadPinnedFrozenFactBaseline}=await import('../free/frozen-fact-baseline.mjs');
  const baseline=await loadPinnedFrozenFactBaseline(packet.baselineText);
  return freeze({baselineText:packet.baselineText,
    glossary:loadContextDefinitionGlossary(text,baseline.source.excerpt),
    supplementSource:packet.supplementSource,packetSha256:CONTEXT_EDITOR_PACKET_SHA256,
    supplementCaptureSha256:packet.supplementCaptureSha256,supplementUrl:packet.supplementUrl});
}
