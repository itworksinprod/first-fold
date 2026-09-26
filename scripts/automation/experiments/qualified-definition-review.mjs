// Fixed control qualification, not article/readability or delivery approval.
// Only the opt-in saved-article diagnostic uses this gate.
import { createHash } from 'node:crypto';
import { DEFAULT_CLOUDFLARE_AI_MODEL } from '../free/workers-ai.mjs';
import { buildIsolatedPreservationReview } from '../free/isolated-preservation-review.mjs';
import { buildDefinitionPreservationReview } from './definition-preservation.mjs';
import { DEFINITION_PRESERVATION_CONTROLS, DEFINITION_CASESET_SHA256 } from './definition-preservation-cases.mjs';
import { loadDefinitionGlossary, SYNTHETIC_DEFINITION_SOURCE } from './definition-glossaries.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const fail = () => Object.assign(new Error('DEFINITION_QUALIFICATION_CHANGED'), { code: 'DEFINITION_QUALIFICATION_CHANGED' });
export const DEFINITION_REVIEW_QUALIFICATION = Object.freeze({
  runId: '36213351283', revision: 'c3338d37455869c8f9fb29c4d19fcef116d76614',
  artifactSha256: '7541c1cf4322a051d2999be416560fa451715f5a286f87810e48d3876b17dce3',
  scope: 'fixed-controls-only-not-article-approval',
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  sourcePromptSha256: '153fe4f6767cae01903dd734dbb12245ba914ada5bd97d4506a1fb2a8006b4a7',
  meaningPromptSha256: 'b0711232aac6664bf9ff040aa4edb61a8e2c3bac199949adea8132db299c9785',
  caseSetSha256: '1138e8fa6bedeb41e87772f2e5b151b974fea6bd8269ff56097dccbc44936df2',
  syntheticManifestSha256: '0cf61d8cd2c159df5444d79ea6975b681d7120d922d258a166f2a3035015fec9',
  syntheticSourceSha256: '2b87ea63bb2269705506a6914a470faea5b1ca2920423bc1bfb2a63e186ab66b',
  mitManifestSha256: 'a52f89f3eaf76fd1e20acdd680e0ab8be14a3ecbe7eebf8726ca6611bca138ca',
});

// Pure pin comparison is exported for drift tests; callers cannot replace pins.
export function validateDefinitionReviewerIdentity(identity) {
  const keys = ['model', 'sourcePromptSha256', 'meaningPromptSha256', 'caseSetSha256',
    'syntheticManifestSha256', 'syntheticSourceSha256'];
  if (!identity || keys.some(key => identity[key] !== DEFINITION_REVIEW_QUALIFICATION[key])) throw fail();
}

export function assertQualifiedDefinitionReviewer() {
  const glossary = loadDefinitionGlossary('synthetic-generation-definitions-v1', SYNTHETIC_DEFINITION_SOURCE);
  const input = DEFINITION_PRESERVATION_CONTROLS[0].input;
  validateDefinitionReviewerIdentity({ model: DEFAULT_CLOUDFLARE_AI_MODEL,
    sourcePromptSha256: sha(buildIsolatedPreservationReview(input, 'source').prompt),
    meaningPromptSha256: sha(buildDefinitionPreservationReview(input, glossary).prompt),
    caseSetSha256: DEFINITION_CASESET_SHA256, syntheticManifestSha256: glossary.manifestSha256,
    syntheticSourceSha256: glossary.sourceSha256 });
  return DEFINITION_REVIEW_QUALIFICATION;
}

export function loadQualifiedMitGlossary(excerpt) {
  assertQualifiedDefinitionReviewer();
  const glossary = loadDefinitionGlossary('mit-generation-definitions-v1', excerpt);
  if (glossary.manifestSha256 !== DEFINITION_REVIEW_QUALIFICATION.mitManifestSha256) throw fail();
  return glossary;
}
