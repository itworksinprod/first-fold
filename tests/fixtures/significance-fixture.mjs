import {createHash} from 'node:crypto';
import {normalizeClaimwiseSummary} from '../../scripts/automation/fact-summary-diagnostic.mjs';
import {buildSignificancePlan} from '../../scripts/automation/experiments/significance-introduction.mjs';
export const sha = text => createHash('sha256').update(text).digest('hex');
export function significanceFixture() {
  const units = {
    headline: ['MIT describes a synthetic research example'],
    whatHappened: ['MIT researchers described an experimental method for generating candidate answers under a fixed set of requirements, while distinguishing laboratory observations from performance in ordinary use.',
      'The team tested the method under the conditions documented in the report and recorded the results for comparison with the alternatives included in the same evaluation.'],
    whyItMatters: ['The report explains how the requirements influence which candidates are retained during the process, rather than treating every intermediate answer as a finished product.',
      'Those distinctions help readers interpret what was measured without assuming that the experiment demonstrated successful operation in every setting where the method might be considered.'],
    whatToWatch: ['Further reports may describe additional evaluation settings, but this account does not establish deployment or results outside the experiments that the researchers actually reported.'],
  };
  const excerpt = Array.from({length: 21}, (_, i) => `Synthetic source evidence passage number ${i + 1}.`).join('\n');
  const draft = normalizeClaimwiseSummary({...units, headline: units.headline[0]}, excerpt, 'MIT').draft;
  const packet = {version: 1, originRunId: 'synthetic', originCaptureSha256: '1'.repeat(64), draftSha256: sha(JSON.stringify(draft)), units,
    source: {url: 'https://example.test/synthetic', excerpt, excerptSha256: sha(excerpt)},
    supplementSource: {publisher: 'Synthetic context', passages: [{evidenceId: 'S2P1', text: 'Synthetic context evidence.'}]}};
  const plan = buildSignificancePlan(packet);
  const proposal = {baselineSha256: plan.data.baselineSha256, decision: 'add',
    introduction: 'MIT describes an application in which a plausible answer could still leave important requirements unmet, illustrating the distinction between a candidate answer and an acceptable finished result.'};
  return {packet, plan, proposal};
}
