// Independently authored synthetic hold-outs, not news or publication evidence.
// Expected dimensions and rationales are local audit data, never model input.
import { createHash } from 'node:crypto';

const makeCase = (caseId, source, previous, final, expectedSourceSupported, expectedMeaningPreserved, rationale) => ({
  caseId, expectedSourceSupported, expectedMeaningPreserved, rationale,
  input: { text: final, claims: [final], previousClaims: [previous],
    sources: [{ publisher: 'Evaluation Lab', passages: [{ evidenceId: 'S1P1', text: source }] }] },
});

const controls = [
  makeCase('PH01',
    'Visitors have read-only access to the museum catalog: they can view its entries but cannot change them.',
    'Visitors have read-only access to the museum catalog.',
    'Visitors can view museum catalog entries but cannot change them.', true, true,
    'The source explicitly defines read-only access as viewing without changing entries. The final sentence preserves both permissions and the same visitors and catalog.'),
  makeCase('PH02',
    'In the exhibition trial, every lamp used a rechargeable battery. All ten lamps stayed lit for two hours. No mains-powered lamps were tested.',
    'In the trial, all ten battery-powered lamps stayed lit for two hours.',
    'In the trial, all ten lamps stayed lit for two hours.', true, false,
    'The final sentence directly follows from the observed trial: all ten tested lamps stayed lit for two hours. It nevertheless removes the meaningful battery-powered circumstance from the prior sentence; it makes no claim about untested lamps.'),
  makeCase('PH03',
    'The archive tested file retrieval using twelve folders. It did not test password recovery.',
    'The archive tested password recovery.',
    'The archive tested password recovery.', false, true,
    'The source explicitly contradicts the asserted password-recovery test. The before and after sentences are identical, so their meaning is preserved despite the unsupported assertion.'),
  makeCase('PH04',
    'During testing, all six photographs taken in bright light were sharp, and all four photographs taken in dim light were blurred.',
    'During testing, every photograph taken in bright light was sharp.',
    'During testing, every photograph was sharp.', false, false,
    'Removing the bright-light restriction expands every photograph from the six bright-light photographs to all tested photographs. The source reports four blurred dim-light photographs, so the final assertion is contradicted and the original restricted meaning is not preserved.'),
];

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const PRESERVATION_HOLDOUT_CONTROLS = freeze(controls);
export const PRESERVATION_HOLDOUT_CASESET_SHA256 = createHash('sha256').update(JSON.stringify(controls)).digest('hex');
