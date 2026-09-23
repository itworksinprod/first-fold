// One fixed public URL. No models, secrets, search credits, email, or artifacts.
import assert from 'node:assert/strict';
import { fetchReviewedArticle } from './free/feed-engine.mjs';

const excerpt = await fetchReviewedArticle({
  url: 'https://www.anthropic.com/institute/measuring-pace-of-ai-development',
  publisherKey: 'anthropic',
});
const checks = {
  boundedExcerpt: excerpt.length >= 120 && excerpt.length <= 5000,
  title: excerpt.includes('Measurements for understanding the pace of AI development'),
  datedFinding: /As of August 2026,[\s\S]*26%/.test(excerpt),
  humanSupervision: excerpt.includes('human supervises'),
  autonomyLimitation: excerpt.includes('not operating fully autonomously'),
  judgeLimitation: excerpt.includes('same kinds of errors'),
  computeWindow: excerpt.includes('July 13 to July 20'),
  computeFindings: excerpt.includes('6%') && excerpt.includes('12%'),
  computeLimitation: excerpt.includes('imperfect proxy'),
  computeExclusion: excerpt.includes('do not account for safeguards classifiers'),
};
console.log(JSON.stringify({ checks, excerptCharacters: excerpt.length, emailSent: false, modelCalls: 0 }, null, 2));
assert.ok(Object.values(checks).every(Boolean), 'Article reader checkpoint failed; inspect source changes before proceeding.');
