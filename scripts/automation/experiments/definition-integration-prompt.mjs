// Isolated editor-only style example. It is not source evidence or a model eval.
import { createHash } from 'node:crypto';
import { DEFINITION_FLUENCY_PROMPT } from './definition-fluency-prompt.mjs';

const baseSha256 = '53552e27a77bf1f5e53b3030b35e27940fe4ee78958a4b2a57c862b0be89f74c';
const example = `
Fictional style example only — never article evidence, never a sentence to copy into the output:
Original: Applicants may skip orientation only if they have an orientation waiver and have submitted proof of prior training.
Reviewed definition: An orientation waiver means written permission to skip orientation. Its sense is permission for that applicant to omit that orientation.
Mechanical but meaning-preserving: Applicants may skip orientation only if they have written permission to skip orientation and have submitted proof of prior training.
Natural integration: Applicants may skip orientation only if they have written permission and have submitted proof of prior training.
The sentence already names the permitted action, so the integrated definition need not repeat it. The actor, may, only if, and both necessary conditions remain intact.
This is not a general license to shorten definitions: omit repeated wording only when its exact action and referent remain unambiguous in that same sentence. Never discard a distinct condition, scope, obligation, or caveat.
Apply only that writing principle to the supplied catalog and reviewed vocabulary. Do not import the example's people, permissions, training, or other facts. Return only the originally required JSON, with no example or explanation.`;

export function buildDefinitionIntegrationPrompt(base) {
  if (typeof base !== 'string' || createHash('sha256').update(base).digest('hex') !== baseSha256) {
    throw Object.assign(new Error('DEFINITION_INTEGRATION_PROMPT_DRIFT'), {code:'DEFINITION_INTEGRATION_PROMPT_DRIFT'});
  }
  return `${base}${example}`;
}

export const DEFINITION_INTEGRATION_PROMPT = buildDefinitionIntegrationPrompt(DEFINITION_FLUENCY_PROMPT);
