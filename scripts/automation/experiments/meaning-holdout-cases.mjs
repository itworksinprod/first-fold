// Fresh fictional holdouts. Freeze and independently adjudicate before inference.
// Labels are local scoring metadata, never reviewer instructions or source facts.
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
const controls = [
  make('H01', 'Mara catalogued all six donated paintings after the gallery closed.',
    'All six donated paintings were catalogued by Mara after the gallery closed.', true,
    'Active to passive voice retains the actor, all six objects and timing.'),
  make('H02', 'The weather office says ferry departures could be delayed if strong winds arrive tonight.',
    'The weather office says ferry departures will be delayed if strong winds arrive tonight.', false,
    'Possible delay becomes a certain consequence under the same condition.'),
  make('H03', "Adult residents may borrow the library's tablets, but nobody else may borrow them.",
    "The library's tablets may be borrowed by adult residents, and by no one else.", true,
    'Permission and exclusion are retained, without widening eligibility or imposing an obligation.'),
  make('H04', 'The independent laboratory tested the battery, and the manufacturer published the results.',
    'The manufacturer tested the battery, and the independent laboratory published the results.', false,
    'Testing and publication roles are swapped between the two actors.'),
  make('H05', 'The train stops at Pine station on weekdays but does not stop there on weekends.',
    'On weekdays the train stops at Pine station; it does not stop there on weekends.', true,
    'Reordered syntax retains both the weekday stop and the weekend exclusion.'),
  make('H06', 'The archive offers free downloads of some maps, while all photographs require a paid license.',
    'The archive offers free downloads of all maps, while all photographs require a paid license.', false,
    'Free download coverage expands from some maps to all maps; the photograph clause does not excuse it.'),
  make('H07', 'Workers must replace the filter after exactly six uses; the counter resets to zero after replacement.',
    'After exactly six uses, workers are required to replace the filter; after replacement, the counter resets to zero.', true,
    'Clause reordering and a mandatory-language paraphrase retain the exact quantity, obligation and reset timing.'),
  make('H08', 'The study found that farms with shaded ponds had fewer algae blooms, without establishing that shade caused the difference.',
    'The study found that shade caused farms with shaded ponds to have fewer algae blooms.', false,
    'An observation that explicitly does not establish causation is changed to an established causal result.'),
  make('H09', 'The cooperative says its new pumps use less electricity than its previous pumps, but it has not published measurements.',
    'According to the cooperative, its new pumps use less electricity than its previous pumps; measurements have not been published by the cooperative.', true,
    'Publisher attribution, comparison group and the absence of its published measurements are all preserved.'),
  make('H10', 'During the trial, each sensor recorded exactly twelve readings per hour and transmitted them once a day.',
    'During the trial, each sensor recorded exactly twenty readings per hour and transmitted them once a day.', false,
    'The exact measurement frequency changes despite the retained trial scope and transmission schedule.'),
];
const probes = [make('P02', 'The council has software to identify duplicate applications.',
  'The council has software that identifies duplicate applications.', null,
  'Unscored purpose/function ambiguity without evidence of actual performance; neither answer is a scored success.')];

export const MEANING_HOLDOUT_CONTROLS = freeze(controls);
export const MEANING_HOLDOUT_PROBES = freeze(probes);
export const MEANING_HOLDOUT_SHA256 = createHash('sha256')
  .update(JSON.stringify({controls,probes})).digest('hex');

export function buildMeaningHoldoutViews() {
  // Keep the existing reviewer context contract. These ordinary-language cases
  // match no printshop terms, so no definitions are sent or inferred.
  const glossary = loadDefinitionGlossary('synthetic-printshop-definitions-v1', PRINTSHOP_DEFINITION_SOURCE);
  return freeze([...controls, ...probes].map(control => ({caseId:control.caseId,
    view:buildDefinitionPreservationReview(control.input,glossary)})));
}
