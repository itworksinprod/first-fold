import test from 'node:test';
import assert from 'node:assert/strict';
import { extractArticleEvidence, prepareArticleRegion } from '../scripts/automation/free/article-evidence.mjs';
import { reviewedSearchPublisher, REVIEWED_SEARCH_DOMAINS } from '../scripts/automation/free/publisher-registry.mjs';
import { FREE_FEED_SOURCES } from '../scripts/automation/free/feed-sources.mjs';

// Synthetic layout fixture; no full publisher article is stored in the repo.
const report = `<header><h1>Outside article title</h1></header><article>
<p id="pacing-title">Measurements for<br> understanding model development</p>
<h2>(1) Measuring automation</h2>
<p>What we measured. The organization classified development tasks by automation level.</p>
<p>What we found. Leading means completing tasks while the human supervises.</p>
<p>As of August 2026,</p><ul><li>AI leads 26% of the measured work.</li><li>No measured category is fully autonomous.</li></ul>
<p>Two obstacles limit comparison: inconsistent methods and judges that can repeat the writer's errors.</p>
<h2>(2) Measuring compute</h2>
<p>What we measured. The compute snapshot covers one week, not a long-term trend.</p>
<p>Safety research tends to need less compute; compute is an imperfect proxy for safety effort.</p>
<p>What we found. Safety accounts for 6% of research compute in that snapshot.</p>
<p>These are deliberately conservative estimates. Safeguard classifiers are excluded.</p>
<h2>Appendix</h2><p>What we found. APPENDIX DISTRACTOR ${'Background methods. '.repeat(500)}</p>
</article>`;

test('Anthropic article admission is exact-host, originating, and not a fabricated feed', () => {
  const source = reviewedSearchPublisher('https://www.anthropic.com/institute/measuring-pace-of-ai-development', 'anthropic');
  assert.equal(source.source.relationship, 'originating');
  assert.ok(REVIEWED_SEARCH_DOMAINS.includes('www.anthropic.com'));
  assert.equal(reviewedSearchPublisher('https://www.anthropic.com.evil.test/report'), null);
  assert.equal(reviewedSearchPublisher('https://www.anthropic.com/report', 'google'), null);
  assert.equal(FREE_FEED_SOURCES.some(s => s.id === 'anthropic-articles'), false);
});

test('report extraction preserves title, dated list, definitions and limitations together', () => {
  assert.equal(prepareArticleRegion(report).title, 'Measurements for understanding model development');
  const text = extractArticleEvidence(report);
  for (const expected of ['26%', 'human supervises', 'As of August 2026', 'fully autonomous', 'Two obstacles', 'one week', 'imperfect proxy', 'classifiers are excluded']) assert.ok(text.includes(expected), expected);
  assert.ok(!text.includes('APPENDIX DISTRACTOR'));
  assert.ok(text.length <= 5000);
});

test('oversized labelled report fails closed rather than dropping selected caveats', () => {
  assert.equal(extractArticleEvidence(report.replace('Two obstacles limit comparison:', `Two obstacles ${'Long context. '.repeat(500)} limit comparison:`)), '');
});

test('dated findings without their list fail closed', () => {
  assert.equal(extractArticleEvidence(report.replace(/<ul>[\s\S]*?<\/ul>/, '')), '');
});
