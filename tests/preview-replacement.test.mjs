import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichShortlist} from '../scripts/automation/free/article-evidence.mjs';
import {createReviewedArticlePageFetcher} from '../scripts/automation/free/feed-engine.mjs';
import {captureStructuredArticle} from '../scripts/automation/free/structured-article-evidence.mjs';
const text = 'This captured report describes a specific product release, its affected users and the exact limits of availability. The publisher provides an explicit release date and eligibility conditions.';
const usable = {version:'structured-preview-v1',status:'usable',holds:[],excerpt:text,blocks:[text],inputBlocks:1,omittedBlocks:0};
const held = {status:'held',holds:['UNSUPPORTED_ARTICLE_TEXT_STRUCTURE'],identity:{title:'verified'}};
function options(items, fetchArticle, onAllocation, structuredPreview = true) {
  return {structuredPreview,fetchArticle,onAllocation,assess:()=>items.map((item,i)=>({canonicalEventKey:String(i),rejectionReasons:item.veto?[{code:'PROMOTIONAL_OR_DEAL_CONTENT'}]:[],
    candidate:{ranking:{score:90-i/100},suggestedDesk:item.desk??'security-and-privacy',sources:[{url:item.url,relationship:'originating'}]}}))};
}
const itemsFor = (n,owner='cisa') => Array.from({length:n},(_,i)=>({url:`https://example.com/${owner}/${i}`,publisherKey:owner,title:'fixture',summary:text}));
test('two held captures are replaced, identity retained, and usable owner quota remains two', async()=>{
  const items=itemsFor(6),calls=[];let receipt;
  const out=await enrichShortlist(items,options(items,async i=>{calls.push(i.url);return calls.length<=2?held:usable;},r=>receipt=r));
  assert.deepEqual(calls,items.slice(0,4).map(i=>i.url));
  assert.equal(out[0].articleExtraction.identity.title,'verified');
  assert.equal(out[2].articleExtraction.status,'usable');
  assert.deepEqual(receipt,{captureAttempts:4,replacementAttempts:2,budgetExhausted:false,usableCaptures:2});
});
test('usable initial captures do not prompt extra sampling; all failures stop at owner attempt cap',async()=>{
  for(const result of [usable,held]){
    const items=itemsFor(12),calls=[];
    await enrichShortlist(items,options(items,async i=>{calls.push(i.url);return result;}));
    assert.equal(calls.length,result===usable?2:4);
  }
});
test('reserved other publishers precede replacements; async timing does not affect allocation',async()=>{
  const items=[...itemsFor(5),...itemsFor(3,'other')];const sequences=[];
  for(const delay of [false,true]){
    const calls=[];
    await enrichShortlist(items,options(items,async i=>{calls.push(i.url);if(delay)await new Promise(r=>setTimeout(r,i.url.endsWith('/0')?5:1));return i.publisherKey==='cisa'?held:usable;}));
    sequences.push(calls);
    assert.ok(calls.indexOf(items[5].url)<calls.indexOf(items[2].url));
  }
  assert.deepEqual(...sequences);
});
test('global 24 attempts, per-desk 8 attempts, duplicates and hard vetoes remain bounded',async()=>{
  const desks=['ai','work-and-tools','security-and-privacy','platforms-and-power'];
  const items=desks.flatMap((desk,d)=>itemsFor(20,`p${d}`).map(i=>({...i,desk})));
  items.push({...items[0]}, {...itemsFor(1,'veto')[0],veto:true});
  const calls=[];
  await enrichShortlist(items,options(items,async i=>{calls.push(i);return held;}));
  assert.ok(calls.length<=24); assert.equal(new Set(calls.map(i=>i.url)).size,calls.length);
  assert.ok(calls.every(i=>!i.veto));
  for(const desk of desks)assert.ok(calls.filter(i=>i.desk===desk).length<=8);
});
test('shared budget exhaustion prevents replacement and remains distinct from unsupported capture',async()=>{
  const items=itemsFor(8);let calls=0, receipt;
  const out=await enrichShortlist(items,options(items,async()=>++calls===1?held:{status:'held',holds:['ARTICLE_FETCH_FAILED'],diagnostic:{category:'fetch',code:'ARTICLE_BUDGET_EXHAUSTED'}},r=>receipt=r));
  assert.equal(calls,2);assert.equal(receipt.budgetExhausted,true);assert.equal(receipt.replacementAttempts,0);
  assert.equal(out[1].articleExtraction.diagnostic.code,'ARTICLE_BUDGET_EXHAUSTED');
  assert.deepEqual(out[2].articleExtraction.holds,['ARTICLE_NOT_CAPTURED_UNDER_ALLOCATION']);
});
test('legacy allocation is unchanged and does not add replacement calls',async()=>{
  const items=itemsFor(6);let calls=0;
  await enrichShortlist(items,options(items,async()=>{calls++;return '';},undefined,false));assert.equal(calls,2);
});
test('23 preconsumed shared slots permit only one new network request including cached duplicates',async()=>{
  let requests=0;
  const fetch=createReviewedArticlePageFetcher({lookupImpl:async()=>[{address:'93.184.216.34',family:4}],requestImpl:async url=>{
    requests++;return {status:200,headers:{'content-type':'text/html'},body:`<link rel="canonical" href="${url}"><article><h1>fixture</h1><div>Unsupported source layout with a short caveat.</div></article>`};
  }});
  for(let i=0;i<23;i++)await fetch({url:`https://openai.com/cache/${i}/`,publisherKey:'openai'});
  const items=[{url:'https://openai.com/cache/0/',publisherKey:'openai',title:'fixture'},
    ...itemsFor(5,'openai').map((i,n)=>({...i,url:`https://openai.com/new/${n}/`}))];
  let receipt;
  const out=await enrichShortlist(items,options(items,i=>captureStructuredArticle(i,fetch),r=>receipt=r));
  assert.equal(requests,24);assert.equal(receipt.budgetExhausted,true);
  assert.equal(receipt.captureAttempts,3);assert.equal(receipt.replacementAttempts,1);
  assert.equal(out[2].articleExtraction.diagnostic.code,'ARTICLE_BUDGET_EXHAUSTED');
});
test('full four-desk pool reserves room for replacements instead of spending all24 upfront',async()=>{
  const desks=['ai','work-and-tools','security-and-privacy','platforms-and-power'];
  const items=desks.flatMap((desk,d)=>['a','b','c'].flatMap(owner=>itemsFor(5,`${d}-${owner}`).map(i=>({...i,desk}))));
  const calls=[];let receipt;
  await enrichShortlist(items,options(items,async i=>{calls.push(i);return i.url.endsWith('/2')?usable:held;},r=>receipt=r));
  assert.equal(receipt.captureAttempts,24);assert.equal(receipt.replacementAttempts,8);
  assert.ok(receipt.usableCaptures>=4);
  for(const desk of desks)assert.equal(calls.slice(0,16).filter(i=>i.desk===desk).length,4);
});
