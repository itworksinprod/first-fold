// Integrity check of a manually reviewed fact sheet, NOT a semantic AI review.
// Fixed public source only; no secrets, providers, summaries or email.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fetchReviewedArticle } from './free/feed-engine.mjs';

const sheet = JSON.parse(await readFile(new URL('../../docs/checkpoints/anthropic-fact-sheet.json', import.meta.url), 'utf8'));
const url = 'https://www.anthropic.com/institute/measuring-pace-of-ai-development';
assert.equal(sheet.sourceUrl, url);
assert.equal(sheet.publisherKey, 'anthropic');
assert.equal(sheet.status, 'manually-reviewed-source-backed-facts-not-an-edition');
assert.deepEqual(sheet.scope, {
  independentCorroboration: false, publicationFreshnessVerified: false,
  tablesAndAppendixIncluded: false, summaryApproved: false,
  emailAuthorizedByThisArtifact: false,
});
const excerpt = await fetchReviewedArticle({ url, publisherKey: 'anthropic' });
assert.equal(createHash('sha256').update(excerpt).digest('hex'), sheet.excerptSha256,
  'Evidence changed: manually re-review the fact sheet; do not auto-update its fingerprint.');
const passages = excerpt.split('\n');
assert.equal(sheet.facts.length, 5);
assert.equal(new Set(sheet.facts.map(f => f.id)).size, 5);
for (const fact of sheet.facts) {
  assert.ok(typeof fact.text === 'string' && fact.text.trim());
  assert.ok(Array.isArray(fact.passageIds) && fact.passageIds.length > 0);
  for (const id of fact.passageIds) {
    assert.match(id, /^P[1-9]\d*$/);
    assert.ok(passages[Number(id.slice(1)) - 1]?.trim(), 'Missing supporting passage');
  }
}
console.log('PASS: 5 manually reviewed facts remain bound to the exact live evidence. This is not independent factual corroboration or summary approval. No email sent.');
