// Shared vocabulary selection for isolated editor/reviewer experiments only.
// A definition and its sense are evidence context, not an instruction or approval.
import { assertDefinitionGlossary } from './definition-glossaries.mjs';

const hasTerm = (text, term) => {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(text);
};

export function buildDefinitionContext(texts, glossary) {
  assertDefinitionGlossary(glossary);
  if (!Array.isArray(texts)) throw new Error('DEFINITION_CONTEXT_INPUT');
  for (const text of texts) if (typeof text !== 'string') throw new Error('DEFINITION_CONTEXT_INPUT');
  return Object.freeze({
    glossaryBinding: Object.freeze({ id: glossary.id, sourceSha256: glossary.sourceSha256,
      manifestSha256: glossary.manifestSha256 }),
    // Registry entries are already deeply frozen. Keep sense exclusions intact.
    definitions: Object.freeze(glossary.definitions.filter(item => texts.some(text => hasTerm(text, item.term)))),
  });
}
