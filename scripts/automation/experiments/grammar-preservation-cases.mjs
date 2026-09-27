// Fixed controls: labels independently adjudicated before any model inference.
// No provider, delivery, article input, reviewer-policy change or auto-approval.
import {createHash} from 'node:crypto';
import {loadDefinitionGlossary, PRINTSHOP_DEFINITION_SOURCE} from './definition-glossaries.mjs';
import {buildDefinitionPreservationReview} from './definition-preservation.mjs';

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const make = (caseId, previous, final, expectedMeaningPreserved, rationale) => ({
  caseId, input: {previousClaims:[previous], claims:[final]}, expectedMeaningPreserved, rationale,
});
// Explicit retained clauses state both purpose of use and actual performance.
// Thus the positive contrast need not infer either one from the other.
const original = 'The shop uses a tool to align counted batches; the shop uses it for that alignment task, and the tool aligns them only while its latch is closed.';
const grammar = original.replace('a tool to align', 'a tool that aligns');
const gloss = text => text.replace('counted batches', 'counted batches (groups of exactly twelve sheets each)');
const obligation = 'Staff must align every counted batch only while the latch is closed.';
const controls = [
  make('R01', original, original, true,
    'Identity control; a model judgment is still required in any future model test.'),
  make('R02', original, grammar, true,
    'Infinitive-to-relative-clause grammar; identical clauses retain the purpose of use, actual alignment and operating condition.'),
  make('R03', original, gloss(original), true,
    'Only the exact registered definition is inserted; actor, quantifier and latch condition stay intact.'),
  make('R04', original, gloss(grammar), true,
    'Combines the same grammar and exact definition without adding performance not already asserted.'),
  make('R05', original, gloss(grammar).replace('only while its latch is closed', 'whether its latch is open or closed'), false,
    'Grammatical reformulation and a valid gloss cannot excuse contradicting the operating condition.'),
  make('R06', obligation, obligation.replace('must align', 'may align'), false,
    'A mandatory instruction becomes permission; the original obligation is lost.'),
  make('R07', obligation, obligation.replace('every counted batch', 'some counted batches'), false,
    'A requirement covering all batches is narrowed to some batches.'),
  make('R08', original, grammar.replace('counted batches', 'counted batches (groups of exactly thirteen sheets each)'), false,
    'The proposed gloss contradicts the registered exactly-twelve definition with exactly thirteen.'),
  make('R09', original, gloss(grammar).replace('its latch is closed.', 'its latch is closed, without damaging any sheets.'), false,
    'An otherwise equivalent edit adds an unsupported damage-free assurance.'),
  make('R10', 'The shop has a tool designed to align counted batches, but it has not tested whether the tool can align them.',
    'The shop has a tool that aligns counted batches, but it has not tested whether the tool can align them.', false,
    'Intended function without tested capability becomes an asserted capability; different from R02’s explicit performance context.'),
];
// Do not force a gold label on the context-poor construction from which either
// purpose or function may be inferred. Report any future answer descriptively.
const probes = [make('P01', 'The shop has a tool to align counted batches.',
  'The shop has a tool that aligns counted batches.', null,
  'Context-poor purpose/function ambiguity; unscored and never counted as passing qualification.')];

export const GRAMMAR_PRESERVATION_CONTROLS = freeze(controls);
export const GRAMMAR_PRESERVATION_PROBES = freeze(probes);
export const GRAMMAR_CONTRAST_SHA256 = createHash('sha256')
  .update(JSON.stringify({controls,probes})).digest('hex');

// The diagnostic must send ONLY view.prompt/view.data/view.schema. Case IDs,
// labels and explanations are local evaluation metadata, not reviewer input.
export function buildGrammarPreservationViews() {
  const glossary = loadDefinitionGlossary('synthetic-printshop-definitions-v1', PRINTSHOP_DEFINITION_SOURCE);
  return freeze([...controls, ...probes].map(control => ({caseId:control.caseId,
    view:buildDefinitionPreservationReview(control.input,glossary)})));
}
