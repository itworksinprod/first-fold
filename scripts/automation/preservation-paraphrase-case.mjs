// Independently authored before the text-only preservation experiment.
import { createHash } from 'node:crypto';
const controls = [{
  caseId: 'PH05', expectedSourceSupported: false, expectedMeaningPreserved: true,
  rationale: 'Active-to-passive preserves actor, all-six quantity, shipment and trial timing; the source contradicts both versions.',
  input: {
    text: 'During the trial, all six crates were shipped by the depot.',
    claims: ['During the trial, all six crates were shipped by the depot.'],
    previousClaims: ['During the trial, the depot shipped all six crates.'],
    sources: [{ publisher: 'Evaluation Lab', passages: [{ evidenceId: 'S1P1',
      text: 'During the trial, the depot stored six crates and shipped none of them.' }] }],
  },
}];
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const PRESERVATION_PARAPHRASE_CONTROLS = freeze(controls);
export const PRESERVATION_PARAPHRASE_CASESET_SHA256 = createHash('sha256').update(JSON.stringify(controls)).digest('hex');
