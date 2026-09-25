// Synthetic fixed controls, not news or publication evidence. Labels stay local.
import { createHash } from 'node:crypto';

const makeCase = (caseId, source, previous, final, expected, rationale) => ({
  caseId, expected, rationale,
  input: { text: final, claims: [final], previousClaims: [previous],
    sources: [{ publisher: 'Engineering Lab', passages: [{ evidenceId: 'S1P1', text: source }] }] },
});

const controls = [
  makeCase('PR01',
    'The planner enforces mandatory limits: every final route must meet them. These limits also allow only a narrow range of route lengths.',
    'The planner’s limits on final routes are mandatory.',
    'Final routes must meet the planner’s limits.', true,
    'Mandatory status is preserved by must meet; no new restriction or scope is introduced.'),
  makeCase('PR02',
    'The planner enforces mandatory limits: every final route must meet them. These limits also allow only a narrow range of route lengths.',
    'The planner’s limits on final routes are mandatory.',
    'The planner’s limits allow only a narrow range of final route lengths.', false,
    'Narrow limits are source-supported, but range restrictiveness does not preserve mandatory status.'),
  makeCase('PR03',
    'The team tested a noise-resistant measurement method. It continued to measure the signal accurately when background noise was added.',
    'The team tested a noise-resistant measurement method.',
    'The team tested a measurement method.', false,
    'The final sentence is true but drops the meaningful noise-resistance property.'),
  makeCase('PR04',
    'The tool works with pretrained models and does not require retraining those models before use.',
    'The tool works with pretrained models without retraining them.',
    'The tool works with models that have already been trained, without training them again.', true,
    'Already trained and without training again preserve both original assertions.'),
  makeCase('PR05',
    'The trial tested renewable energy generators, including solar panels, wind turbines and tidal turbines.',
    'The trial tested renewable energy generators.',
    'The trial tested solar panels and wind turbines.', false,
    'Both examples were tested, but naming only two examples loses the original broader category.'),
  makeCase('PR06',
    'During the trial, requests made while cached credentials were valid worked without network access. No requests were made after those credentials expired.',
    'During the trial, requests worked without network access while cached credentials remained valid.',
    'During the trial, requests worked without network access.', false,
    'The observed outcome is true, but the edit drops the observed operating circumstance. Neither credential necessity nor failure after expiry was established.'),
];

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const PRESERVATION_REVIEW_CONTROLS = freeze(controls);
export const PRESERVATION_CASESET_SHA256 = createHash('sha256').update(JSON.stringify(controls)).digest('hex');
