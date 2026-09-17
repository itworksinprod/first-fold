import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureStructuredArticle} from '../scripts/automation/free/structured-article-evidence.mjs';
import {inspectPreviewIdentity} from '../scripts/automation/free/preview-article-identity.mjs';
import {divRegions,advisoryScoringSummary} from '../scripts/automation/free/article-evidence.mjs';
import {assessFeedCandidates} from '../scripts/automation/free/feed-engine.mjs';
import {buildEvidencePacketSources} from '../scripts/automation/free/evidence-packets.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/cisa-bransys-http-main.json',import.meta.url)));
const item={title:'Bransys ELD',url:fixture.provenance.url,publisherKey:'cisa'};
const page=body=>({body,finalUrl:item.url,redirects:[],retrievedAt:fixture.provenance.retrievedAt});
const capture=body=>captureStructuredArticle(item,async()=>page(body));
test('actual multi-CVE advisory retains full conditions, exact versions and CVE-scoped metric pairs',async()=>{
  const c=await capture(fixture.body);assert.equal(c.status,'usable',JSON.stringify(c));assert.equal(c.omittedBlocks,0);
  const source=buildEvidencePacketSources({sources:[{id:'s',relationship:'originating',publisher:'CISA'}],feedEvidence:[{sourceId:'s',publisher:'CISA',articleExcerpt:c.excerpt,articleBlocks:c.blocks,articleExtraction:{...c}}]})[0];
  assert.equal(source.text,c.excerpt);
  assert.match(source.text,/subset of carriers/);assert.match(source.text,/No known public exploitation specifically targeting these vulnerabilities has been reported to CISA at this time/);
  assert.match(source.text,/Android users should be on version 11.00.00 or newer. iOS users should be on version 1.1.54 or newer/);
  for(const [cve,v3,v4] of [['86520','7.5','8.7'],['86689','5.9','8.2'],['77960','5.3','6.9']]){
    for(const [v,score] of [['3.1',v3],['4.0',v4]])assert.ok(c.blocks.some(b=>b.includes(`CVE-2026-${cve} — Metrics — CVSS Version: ${v}; Base Score: ${score};`)));
  }
  assert.equal(new Set(source.passages.map(p=>p.evidenceId)).size,source.passages.length);
  const summary=advisoryScoringSummary(c.blocks);
  assert.ok(summary.length<=1200);assert.match(summary,/CVE-2026-86520/);
  assert.match(summary,/Android users should be on version 11.00.00 or newer/);
  assert.doesNotMatch(summary,/Recommended Practices|Legal Notice/);
  for(const line of summary.split('\n'))assert.ok(c.blocks.includes(line));
  const assessed=assessFeedCandidates({items:[{...item,itemId:'fixture',sourceId:'cisa-advisories',publisher:'CISA',relationship:'originating',primaryEntity:'CISA',
    title:'Bransys ELD',summary,categories:[],deskPriors:{'security-and-privacy':30},publishedAt:'2026-09-17T12:00:00Z',retrievedAt:'2026-09-17T21:00:00Z'}],
    evidencePolicy:'authoritative-or-corroborated',reportingWindow:{startInclusive:'2026-09-14T21:00:00Z',endExclusive:'2026-09-17T21:00:00Z'}});
  assert.ok(assessed.some(a=>a.candidate?.suggestedDesk==='security-and-privacy'),JSON.stringify(assessed));
});
test('scoring view is bounded and cannot mutate or inflate complete source evidence',async()=>{
  const c=await capture(fixture.body), original=JSON.stringify(c.blocks);
  const sample=advisoryScoringSummary(c.blocks);
  assert.equal(JSON.stringify(c.blocks),original);
  assert.ok(sample.length<=1200);
  const unchanged=advisoryScoringSummary([...c.blocks,...Array(30).fill('Bransys ELD — Recommended Practices — Critical remote exploit patch mitigation update vulnerability.')]);
  assert.equal(sample,unchanged);
  assert.ok(c.excerpt.includes('No known public exploitation specifically targeting these vulnerabilities has been reported to CISA at this time.'));
});
test('CVE, product, metric and status ambiguity are held rather than relaxed',async()=>{
  const body=fixture.body;
  const changes=[
    body.replace('Bransys Android: &lt;11.00.00','Bransys Android: &lt;12.00.00'),
    body.replace('Bransys iOS: &lt;1.1.54','Bransys Android: &lt;11.00.00'),
    body.replace('Product Status:</strong><br>known_affected','Product Status:</strong><br>fixed, known_affected'),
    body.replace('>CVE-2026-86520</a></h3>','>CVE-2026-86689</a></h3>'),
    body.replace('<td>4.0</td>','<td>3.1</td>'),
    body.replace('<h4>Metrics</h4>','<h2>Metrics</h2>'),
    body.replace('<h4>Affected Products</h4>','<h2>Affected Products</h2>'),
    body.replace('<h4>Metrics</h4>','<h3>Metrics'),
  ];
  const advisory=inspectPreviewIdentity(item,page(body)).advisoryBody;
  const sections=divRegions(advisory,true).filter(r=>r.attributes.class?.includes('csaf-accordion-item'));
  const first=advisory.slice(sections[0].start,sections[0].end);
  changes.push(body.replace(first,''),body.replace(first,first+first));
  const metrics=divRegions(first,true).find(r=>r.attributes.class?.includes('csaf-metrics-table'));
  const metric=first.slice(metrics.start,metrics.end);
  changes.push(body.replace(metric,'').replace('<h2>Acknowledgments</h2>',metric+'<h2>Acknowledgments</h2>'));
  const group=divRegions(first,true).find(r=>r.attributes.class?.includes('ics-vendor-version-status'));
  const product=first.slice(group.start,group.end);
  changes.push(body.replace(product,'').replace('<h3><a class="csaf-accordion-toggle"',product+'<h3><a class="csaf-accordion-toggle"'));
  for(const changed of changes)assert.equal((await capture(changed)).status,'held');
  const reordered=body.replace(advisory,advisory.replace(sections.map(r=>advisory.slice(r.start,r.end)).join('\n'),sections.map(r=>advisory.slice(r.start,r.end)).reverse().join('\n')));
  assert.notEqual(reordered,body);
  assert.equal((await capture(reordered)).status,'usable');
  for(const [suffix,score] of [['86520','7.5'],['86689','5.9'],['77960','5.3']]) {
    const reorderedCapture=await capture(reordered);
    assert.ok(reorderedCapture.blocks.some(b=>b.includes(`CVE-2026-${suffix} — Metrics — CVSS Version: 3.1; Base Score: ${score}`)));
    assert.ok(reorderedCapture.blocks.some(b=>b.includes(`CVE-2026-${suffix} — Affected Products — Bransys ELD — Remediations — Vendor fix`)));
  }
});
test('metric column and CVE section permutations retain emitted associations',async()=>{
  const body=fixture.body.replace(/<tr>[^]*?<\/tr>/g, row=>{
    const cells=row.match(/<(?:th|td)\b[^>]*>[^]*?<\/(?:th|td)>/g);
    return cells?.length===4?`<tr>${cells[1]}${cells[0]}${cells[3]}${cells[2]}</tr>`:row;
  });
  assert.notEqual(body,fixture.body);
  const c=await capture(body);assert.equal(c.status,'usable',JSON.stringify(c.holds));
  for(const [suffix,score] of [['86520','7.5'],['86689','5.9'],['77960','5.3']])assert.ok(c.blocks.some(b=>b.includes(`CVE-2026-${suffix} — Metrics — Base Score: ${score}; CVSS Version: 3.1;`)));
});
test('ABB compound range with mixed statuses stays held and retains verified identity',async()=>{
  const abb=JSON.parse(readFileSync(new URL('./fixtures/cisa-abb-http-main.json',import.meta.url)));
  const c=await captureStructuredArticle({title:'ABB Ability Edgenius',url:abb.provenance.url,publisherKey:'cisa'},async()=>({body:abb.body,finalUrl:abb.provenance.url,redirects:[]}));
  assert.equal(c.status,'held');assert.equal(c.diagnostic.code,'ADVISORY_RANGE_GRAMMAR_UNSUPPORTED');assert.equal(c.identity.title,'ABB Ability Edgenius');
});
