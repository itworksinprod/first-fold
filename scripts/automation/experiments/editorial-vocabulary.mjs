// Manually reviewed term-level wording, not article facts or automatic approval.
// Kept separate from the qualified reviewer's canonical definitions.
import {createHash} from 'node:crypto';
import {buildDefinitionContext} from './definition-context.mjs';
import {DEFINITION_COMPOSITION_PROMPT} from './definition-composition-prompt.mjs';

const freeze=value=>{
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
};
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const registry=freeze([
  {glossaryId:'mit-generation-definitions-v1',
    sourceSha256:'081196aa0f2c507e6b75f5a7018a594af882468006401c1b1428f96e4eb74801',
    glossaryManifestSha256:'a52f89f3eaf76fd1e20acdd680e0ab8be14a3ecbe7eebf8726ca6611bca138ca',
    entries:[{term:'hard constraints',phrase:'mandatory requirements'},
      {term:'hard constraint',phrase:'a mandatory requirement'}]},
  {glossaryId:'synthetic-generation-definitions-v1',
    sourceSha256:'2b87ea63bb2269705506a6914a470faea5b1ca2920423bc1bfb2a63e186ab66b',
    glossaryManifestSha256:'0cf61d8cd2c159df5444d79ea6975b681d7120d922d258a166f2a3035015fec9',
    entries:[{term:'binding rules',phrase:'mandatory requirements'},
      {term:'binding rule',phrase:'a mandatory requirement'}]},
]);

export function buildEditorialVocabulary(texts,glossary){
  // The shared selector rejects fabricated/cloned glossaries and malformed text.
  const canonical=buildDefinitionContext(texts,glossary);
  const entry=registry.find(item=>item.glossaryId===glossary.id);
  if(!entry||entry.sourceSha256!==glossary.sourceSha256||
      entry.glossaryManifestSha256!==glossary.manifestSha256){
    throw Object.assign(new Error('EDITOR_VOCABULARY_BINDING'),{code:'EDITOR_VOCABULARY_BINDING'});
  }
  const terms=new Set(canonical.definitions.map(item=>item.term));
  return freeze({wordingPolicy:{id:'reviewed-editor-wording-v1',
    sourceSha256:entry.sourceSha256,glossaryManifestSha256:entry.glossaryManifestSha256,
    wordingSha256:sha(entry)},wordingHints:entry.entries.filter(item=>terms.has(item.term))});
}

export const EDITORIAL_VOCABULARY_PROMPT = `${DEFINITION_COMPOSITION_PROMPT}
Optional wordingHints are manually reviewed term-level language suggestions, not new evidence or approved article text. They may help express an existing concept idiomatically; use one only when it retains the original term's complete canonical definition, sense, scope and grammatical role in that sentence. Do not copy any phrase mechanically when the assembled sentence becomes awkward. Keep the full supplied definitions and sense exclusions authoritative about the concept. A suggested phrase never authorizes adding a fact, changing a condition, forcing a rewrite, or passing any review. The original output contract and abstention rule remain unchanged.`;
