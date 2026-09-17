import test from 'node:test';
import assert from 'node:assert/strict';
import { captureStructuredArticle } from '../scripts/automation/free/structured-article-evidence.mjs';
import { extractArticleEvidence, enrichShortlist } from '../scripts/automation/free/article-evidence.mjs';
import { buildEvidencePacketSources } from '../scripts/automation/free/evidence-packets.mjs';

// Synthetic prose in the exact observed September 17 publisher container shapes.
// Full fetched pages are kept privately, never committed as news fixtures.
const text = '<p>The service changes request limits for hosted accounts. Authentication selects the applicable plan limit; anonymous requests have a separate limit.</p>';
const late = '<h2>Scope</h2><p>This applies only to hosted accounts. Self-managed deployments are not affected.</p>';
const title = 'Example hosted service changes';
const layouts = {
  gitlab: { url: 'https://about.gitlab.com/blog/example-change/', publisherKey: 'gitlab',
    wrap: b => `<div id="page-blog-example-change"><div class="hero"><h1>${title}</h1><p class="slp-text-body1">Only organizations in the early access group are eligible.</p><img src="banner.png"></div><div class="content"><div class="body"><div>${b}</div></div></div><div class="share">Sidebar promotion</div></div>` },
  aws: { url: 'https://aws.amazon.com/about-aws/whats-new/2026/09/example-change/', publisherKey: 'amazon',
    wrap: b => `<main><div class="wn-content-with-nav"><main class="wn-post"><h1>${title}</h1><div class="wn-body">Posted on: Sep 17, 2026</div><div class="wn-body">${b}</div></main></div></main>` },
  doj: { url: 'https://www.justice.gov/opa/pr/example-change', publisherKey: 'doj',
    wrap: b => `<article><div class="node-content node-press-release"><h1>${title}</h1><div class="node-top">Share</div><div class="node-subtitle"><div><div class="field_subtitle">Relief is limited to the stated markets.</div></div></div><div class="node-body"><div><div class="field_body">${b}</div></div></div></div></article>` },
};
async function capture(name, body = text + late, mutate = h => h) {
  const l = layouts[name];
  const html = `<link rel="canonical" href="${l.url}">` + mutate(l.wrap(body));
  return captureStructuredArticle({ ...l, title }, async () => ({ body: html, finalUrl: l.url, redirects: [], retrievedAt: '2026-09-17T12:00:00Z' }));
}
test('observed layouts preserve primary prose and late scope, not menus', async () => {
  for (const name of Object.keys(layouts)) {
    const c = await capture(name);
    assert.equal(c.status, 'usable', JSON.stringify({name,c}));
    assert.equal(c.version, 'structured-complete-preview-v1');
    assert.equal(c.omittedBlocks, 0);
    assert.match(c.excerpt, /Self-managed deployments are not affected/);
    assert.doesNotMatch(c.excerpt, /Sidebar promotion|Share|Posted on/);
    if (name === 'doj') assert.match(c.excerpt, /Relief is limited/);
    if (name === 'gitlab') assert.match(c.excerpt, /Only organizations in the early access group are eligible/);
  }
});
test('ambiguous bodies, broken boundaries, unexpected text and lost scope fail closed', async () => {
  for (const name of Object.keys(layouts)) {
    const c = await capture(name, text + '<div>Only for selected customers.</div>');
    assert.equal(c.status, 'held');
  }
  const probes = [
    ['gitlab', h => h.replace('<div class="body">', '<div class="body"></div><div class="body">')],
    ['gitlab', h => h.replace('<div class="body">', 'Only on paid plans.<div class="body">')],
    ['gitlab', h => h.replace('page-blog-example-change', 'page-blog-unrelated')],
    ['gitlab', h => h + '</div>'],
    ['gitlab', h => h.replace('</h1>', '</h1><p class="slp-text-body1">A conflicting introduction.</p>')],
    ['gitlab', h => h.replace('<img ', 'Unparsed scope outside the standfirst.<img ')],
    ['aws', h => h.replace('Posted on: Sep 17, 2026', 'Posted on: Sep 17, 2026. Only in selected regions.')],
    ['aws', h => h.replace('</h1>', '</h1>Not available to existing users.')],
    ['aws', h => h.replace('</main>', '<div class="wn-body"><p>Another body.</p></div></main>')],
    ['doj', h => h.replace('<div class="field_body">', 'Only after approval.<div class="field_body">')],
    ['doj', h => h.replace('<div class="field_body">', '<div class="field_body"></div><div class="field_body">')],
    ['doj', h => h + '<article><p>Unrelated card</p></article>'],
  ];
  for (const [name, mutate] of probes) assert.equal((await capture(name, text + late, mutate)).status, 'held', name + mutate);
});
test('adapters cannot bypass title/canonical identity or change legacy extraction', async () => {
  assert.equal((await capture('gitlab', text, h => h.replace(title, 'Wrong title'))).status, 'held');
  assert.equal(extractArticleEvidence(layouts.gitlab.wrap(text + late)), '');
});
test('complete preview passes all blocks unchanged to dossier and stays bounded', async () => {
  const long = Array.from({length:30}, (_,i)=>`<p>Condition ${i}: this change applies only when the hosted service is used, and the account administrator must check the selected subscription before changing an integration.</p>`).join('');
  const c = await capture('gitlab', long + late);
  assert.equal(c.status, 'usable'); assert.ok(c.excerpt.length > 5000);
  const source = {id:'s',publisher:'GitLab',publisherKey:'gitlab',title,url:layouts.gitlab.url,relationship:'originating',publishedAt:'2026-09-17T00:00:00Z'};
  const candidate = {sources:[source],feedEvidence:[{sourceId:'s',publisher:'GitLab',title,publishedAt:source.publishedAt,summary:'Feed fragment must not be used',articleExcerpt:c.excerpt,articleBlocks:c.blocks,articleExtraction:c}]};
  const packet = buildEvidencePacketSources(candidate)[0];
  assert.equal(packet.text, c.excerpt);
  assert.deepEqual(packet.passages.map(p=>p.text), c.blocks);
  const duplicate = await capture('gitlab', text + text + late);
  const duplicateRecord={...candidate.feedEvidence[0],articleExcerpt:duplicate.excerpt,articleBlocks:duplicate.blocks,articleExtraction:duplicate};
  const duplicatePacket=buildEvidencePacketSources({...candidate,feedEvidence:[duplicateRecord]})[0];
  assert.equal(new Set(duplicatePacket.passages.map(p=>p.evidenceId)).size,duplicate.blocks.length);
  assert.deepEqual(duplicatePacket.passages.map(p=>p.text),duplicate.blocks);
  assert.doesNotMatch(packet.text, /Feed fragment/);
  assert.equal((await capture('gitlab', long.repeat(4))).status, 'held');
  candidate.feedEvidence[0].articleExcerpt += 'corruption';
  assert.deepEqual(buildEvidencePacketSources(candidate), []);
});
test('enrichment accepts complete preview but keeps the original scoring input budget', async () => {
  const c = await capture('gitlab', text.repeat(28) + late);
  assert.equal(c.status, 'usable');
  const item = {itemId:'x',url:layouts.gitlab.url,publisherKey:'gitlab',title,summary:'Old clipped feed'};
  const assess = () => [{canonicalEventKey:'x',rejectionReasons:[],candidate:{suggestedDesk:'work-and-tools',ranking:{score:75},sources:[{url:item.url,relationship:'originating'}]}}];
  const [out] = await enrichShortlist([item], {structuredPreview:true,assess,fetchArticle:async()=>c});
  assert.equal(out.articleExcerpt,c.excerpt); assert.ok(out.summary.length <= 1200);
  assert.notEqual(out.summary,item.summary);
});
