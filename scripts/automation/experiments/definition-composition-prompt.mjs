// One editor-only instruction replacement. Prior experiments remain auditable.
import {createHash} from 'node:crypto';
import {DEFINITION_INTEGRATION_PROMPT} from './definition-integration-prompt.mjs';

const baseSha256 = '56cff94f6bc64500881a8b46e08b39d6406e1a13e6d76fdced6f007f93002433';
const anchor = 'First look for a genuinely confusing technical term whose meaning is explicitly established by the supplied reviewed facts. Prioritize replacing that term with an exactly equivalent, equally scoped plain-language expression before considering structural edits.';
const replacement = 'First look for a genuinely confusing technical concept whose meaning is explicitly established by the supplied reviewed facts and definitions. Use the reviewed definitions to understand that concept, then compose its containing sentence naturally. Definition wording need not be copied verbatim: preserve its complete meaning, grammatical kind, stated sense, scope, and conditions. Do not introduce any concept or assertion absent from the original sentence.';

export function buildDefinitionCompositionPrompt(base) {
  if (typeof base !== 'string' || base.split(anchor).length !== 2 ||
      createHash('sha256').update(base).digest('hex') !== baseSha256) {
    throw Object.assign(new Error('DEFINITION_COMPOSITION_PROMPT_DRIFT'), {code:'DEFINITION_COMPOSITION_PROMPT_DRIFT'});
  }
  return base.replace(anchor, replacement);
}

export const DEFINITION_COMPOSITION_PROMPT = buildDefinitionCompositionPrompt(DEFINITION_INTEGRATION_PROMPT);
