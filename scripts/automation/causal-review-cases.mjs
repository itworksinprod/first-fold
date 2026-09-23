import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fetchReviewedArticle } from './free/feed-engine.mjs';
import { factSummaryCausalRegression } from '../../tests/fixtures/fact-summary-causal-regression.mjs';

// Labels and rationales remain offline. Full live captured context is supplied
// identically to both positive and negative versions, not selected by outcome.
export function causalReviewCases(excerpt) {
  const sources = [{ publisher: 'Anthropic', passages: excerpt.split('\n').map((text, i) => ({ evidenceId: `S1P${i + 1}`, text })) }];
  const synthetic = [{ publisher: 'Synthetic Harbor Observatory', passages: [
    { evidenceId: 'S1P1', text: 'Harbor reports that its traffic-counting sensor misses some vehicles during heavy rain. Its report measures counting accuracy, not traffic throughput or driver behaviour.' },
    { evidenceId: 'S1P2', text: 'A comparison with manually counted recordings found that the sensor undercounts passing vehicles in wet weather. Harbor has not measured any effect of the sensor on journey times.' },
  ] }];
  const item = (caseId, text, expected, context = sources) => ({ caseId, input: { text, sources: structuredClone(context) }, expected });
  return [
    item('observed-unsupported-development-consequence', factSummaryCausalRegression.statement, false),
    item('supported-automation-rating-limitation', 'Anthropic warns that using its own models to judge automation can reproduce their errors, limiting confidence in the automation ratings.', true),
    item('rephrased-unsupported-development-consequence', 'Anthropic identifies possible errors in its automation ratings; those errors may slow progress toward models that can conduct research without human supervision.', false),
    item('supervision-not-autonomy', 'Anthropic reports that Claude led 26% of its AI R&D in August 2026 with human supervision, rather than fully autonomous operation.', true),
    item('wrong-compute-cause', 'Compute share is an imperfect measure of safety effort because Anthropic used different denominators for its two percentages.', false),
    item('supported-compute-limitation', 'Safety research can require less compute than frontier training, so compute share does not directly measure the attention given to safety.', true),
    item('new-sensor-consequence', 'Harbor reports inaccurate vehicle counts in rain, which could increase journey times for drivers.', false, synthetic),
    item('new-sensor-measurement', 'Harbor says its sensor can undercount vehicles in wet weather; it has not measured an effect on journey times.', true, synthetic),
  ];
}

export async function loadCausalReviewCases() {
  const sheet = JSON.parse(await readFile(new URL('../../docs/checkpoints/anthropic-fact-sheet.json', import.meta.url), 'utf8'));
  const url = 'https://www.anthropic.com/institute/measuring-pace-of-ai-development';
  const excerpt = await fetchReviewedArticle({ url, publisherKey: 'anthropic' });
  if (sheet.sourceUrl !== url || createHash('sha256').update(excerpt).digest('hex') !== sheet.excerptSha256) {
    throw new Error('CAUSAL_REVIEW_EVIDENCE_CHANGED');
  }
  return causalReviewCases(excerpt);
}
