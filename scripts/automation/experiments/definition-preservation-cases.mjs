// Offline controls proposed and labeled by a separate reviewer BEFORE inference.
// These labels/rationales are local evaluation metadata, NEVER reviewer inputs.
import { createHash } from 'node:crypto';
import { SYNTHETIC_DEFINITION_SOURCE } from './definition-glossaries.mjs';

const make = (caseId, previous, final, source, meaning, rationale) => ({
  caseId, expectedSourceSupported: source, expectedMeaningPreserved: meaning, rationale,
  input: { text: final, claims: [final], previousClaims: [previous],
    sources: [{ publisher: 'Synthetic Evaluation Lab', passages: SYNTHETIC_DEFINITION_SOURCE.split('\n')
      .map((text, index) => ({ evidenceId: `S1P${index + 1}`, text })) }] },
});
const controls = [
  make('G01', 'Its completed output satisfies all binding rules.',
    'Its completed output satisfies all nonoptional requirements.', true, true,
    'Defined equivalent; completed-output scope and all retained.'),
  make('G02', 'The controller creates draft candidates.',
    'The controller creates partial answers before a final answer.', true, true,
    'Defined partial answers and temporal scope retained.'),
  make('G03', 'Completed outputs must satisfy binding rules.',
    'Completed outputs may satisfy binding rules but need not do so.', false, false,
    'Mandatory becomes optional despite the supplied definition.'),
  make('G04', 'The controller checks a route only when its alert is on.',
    'The controller checks a route regardless of its alert state.', false, false,
    'Operating condition removed and contradicted.'),
  make('G05', 'Its completed output satisfies all binding rules.',
    'Its completed output stays within narrow permitted ranges.', true, false,
    'Both supported, but mandatory requirements and restrictiveness are different properties.'),
  make('G06', 'The controller may reduce travel distance.',
    'The controller is guaranteed to reduce travel distance.', false, false,
    'Possibility becomes certainty.'),
  make('G07', 'Its completed output satisfies all binding rules.',
    'Its completed output satisfies safety rules and physical limits.', true, false,
    'Supported subset loses task-specific requirements and the broader category.'),
  make('G08', 'Mira checked two routes on Monday.', 'Niko checked two routes on Monday.', false, false,
    'Actor changed.'),
  make('G09', 'Mira checked two routes on Monday.', 'Mira checked three routes on Monday.', false, false,
    'Quantity changed.'),
  make('G10', 'Mira checked four routes on Monday.', 'Four routes were checked by Mira on Monday.', false, true,
    'Same false assertion, active-to-passive; meaning alone must not authorize acceptance.'),
  make('G11', 'Its completed output satisfies all binding rules.',
    'Its completed output satisfies all nonoptional requirements and uses less energy.', false, false,
    'A valid definition substitution does not authorize an unsupported added fact.'),
];
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const DEFINITION_PRESERVATION_CONTROLS = freeze(controls);
export const DEFINITION_CASESET_SHA256 = createHash('sha256').update(JSON.stringify(controls)).digest('hex');
