import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildWatchRoleTypedReview, diagnoseWatchRoleTypedReview, WATCH_ROLE_CHECKS, WATCH_ROLE_TYPED_CONTRACT} from '../scripts/automation/experiments/watch-role-typed-review.mjs';
import {buildWatchRoleSpanReview} from '../scripts/automation/experiments/watch-role-span-review.mjs';
import {WATCH_ROLE_CONTROLS,watchRoleControlView,scoreWatchRoleControl} from '../scripts/automation/experiments/watch-role-controls.mjs';
const old = watchRoleControlView(WATCH_ROLE_CONTROLS[0]);
const input = () => ({question:old.data.question,passages:structuredClone(old.data.passages)});
const fixture = view => ({reviewSha256:view.data.reviewSha256,question:view.data.question,
  unknownAnswer:'What difference, if any, the hypothetical comparison yields.',findings:[
    {startWord:1,endWord:5,role:'unknown_outcome',check:WATCH_ROLE_CHECKS.unknown_outcome,
      supportTarget:'The source describes route length as a quality measure for route outputs.',supported:true,evidenceIds:['S1P20'],reason:'Structure-only fixture.'},
    {startWord:22,endWord:26,role:'factual_premise',check:WATCH_ROLE_CHECKS.factual_premise,
      supportTarget:'An optional length goal is described.',supported:true,evidenceIds:['S1P20'],reason:'Structure-only fixture.'}]});

test('v3 independently binds question, words, evidence, typed task and exact raw response',()=>{
  const view=buildWatchRoleTypedReview(input()),{reviewSha256,...data}=view.data;
  assert.equal(view.data.policy,WATCH_ROLE_TYPED_CONTRACT);
  assert.equal(reviewSha256,createHash('sha256').update(JSON.stringify(data)).digest('hex'));
  const span=buildWatchRoleSpanReview(input());
  assert.notEqual(reviewSha256,span.data.reviewSha256);
  assert.deepEqual(view.data.words,span.data.words); assert.deepEqual(view.data.passages,span.data.passages);
  assert.equal(Object.isFrozen(view.schema.properties.findings.items.oneOf[0]),true);
  assert.equal(diagnoseWatchRoleTypedReview(fixture(view),view).verdict.valid,true);
  assert.equal(diagnoseWatchRoleTypedReview(fixture(view),structuredClone(view)).reason,'VIEW');
  const changed=input();changed.passages[0].text+=' Different evidence.';
  assert.equal(diagnoseWatchRoleTypedReview(fixture(view),buildWatchRoleTypedReview(changed)).reason,'REVIEW_HASH');
  const response=fixture(view);response.question+=' Altered';
  assert.equal(diagnoseWatchRoleTypedReview(response,view).reason,'QUESTION_ECHO');
});

test('each role strictly selects its source-support check, without prototype keys or extra fields',()=>{
  const view=buildWatchRoleTypedReview(input());
  for(const role of Object.keys(WATCH_ROLE_CHECKS)) for(const check of Object.values(WATCH_ROLE_CHECKS)) {
    if(check===WATCH_ROLE_CHECKS[role])continue;
    const response=fixture(view);Object.assign(response.findings[0],{role,check});
    assert.equal(diagnoseWatchRoleTypedReview(response,view).reason,'CHECK_ROLE');
  }
  for(const role of ['toString','__proto__','constructor',null,{}]) {
    const response=fixture(view);response.findings[0].role=role;
    assert.equal(diagnoseWatchRoleTypedReview(response,view).reason,'CHECK_ROLE');
  }
  const response=fixture(view);response.findings[0].grounded=true;
  assert.equal(diagnoseWatchRoleTypedReview(response,view).reason,'FINDING_SHAPE');
});

test('support targets are bounded explicit text, separate from unknownAnswer and retained in raw capture',()=>{
  const view=buildWatchRoleTypedReview(input());
  for(const target of ['', ' ', ' padded', 'x'.repeat(241),'line\nbreak','hidden\u200btext',true]) {
    const response=fixture(view);response.findings[0].supportTarget=target;
    assert.equal(diagnoseWatchRoleTypedReview(response,view).reason,'SUPPORT_TARGET');
  }
  const response=fixture(view),saved=structuredClone(response),decoded=diagnoseWatchRoleTypedReview(response,view);
  assert.deepEqual(response,saved); assert.equal(decoded.canonical.unknownAnswer,response.unknownAnswer);
  assert.equal(decoded.canonical.findings[0].grounded,response.findings[0].supported);
  assert.match(view.prompt,/not the check being asked/);
  assert.match(view.prompt,/Cover shared hypothetical conditions/);
});

test('no result upgrade, citation synthesis, range correction, or relaxed legacy validation',()=>{
  const view=buildWatchRoleTypedReview(input());
  const response=fixture(view);response.findings[0].supported=false;response.findings[0].evidenceIds=[];
  response.findings[0].reason='Even plausible support wording cannot override the supplied false result.';
  const decoded=diagnoseWatchRoleTypedReview(response,view);
  assert.equal(decoded.verdict.valid,true); assert.equal(decoded.verdict.reportedGrounded,false);
  assert.equal(decoded.canonical.findings[0].grounded,false);assert.deepEqual(decoded.canonical.findings[0].evidenceIds,[]);
  for(const mutate of [
    x=>{x.findings[0].supported='true';},x=>{x.findings[0].evidenceIds=[];},x=>{x.findings[0].evidenceIds=['S2P1'];},
    x=>{x.findings[0].startWord=0;},x=>{x.findings[0].endWord=100;},x=>{x.findings[0].reason='x'.repeat(241);},
    x=>{x.findings[0].reason='\n';},x=>{x.findings.push(structuredClone(x.findings[0]));},
  ]){const bad=fixture(view);mutate(bad);assert.equal(diagnoseWatchRoleTypedReview(bad,view).verdict.valid,false);}
});

test('accessors, sparse arrays and hidden fields never execute or slip into decoding',()=>{
  const view=buildWatchRoleTypedReview(input());
  for(const mutate of [
    x=>Object.defineProperty(x,'question',{get(){assert.fail('getter');}}),
    x=>Object.defineProperty(x.findings[0],'check',{get(){assert.fail('getter');}}),
    x=>Object.defineProperty(x.findings[0],'supportTarget',{get(){assert.fail('getter');}}),
    x=>Object.defineProperty(x.findings[0].evidenceIds,'0',{get(){assert.fail('getter');}}),
    x=>Object.defineProperty(x.findings,'0',{get(){assert.fail('getter');}}),
    x=>{x.findings=Array(2);},x=>{x.findings.extra=true;},x=>{x[Symbol('extra')]=true;},
  ]){const bad=fixture(view);mutate(bad);assert.equal(diagnoseWatchRoleTypedReview(bad,view).verdict.valid,false);}
});

test('known answer-absence error remains a semantic rejection even if a v3-shaped response parses',()=>{
  const view=buildWatchRoleTypedReview(input()),response=fixture(view);
  // Counterexample adapted from the held A reasoning. NOT a valid source-support
  // judgment: absence of an answer does not refute the setup ingredients.
  response.findings[0].supportTarget='Whether the requested difference in route length is provided.';
  response.findings[0].reason='The passages do not provide that difference.';
  response.findings[0].supported=false;response.findings[0].evidenceIds=[];
  const decoded=diagnoseWatchRoleTypedReview(response,view);
  assert.equal(decoded.verdict.valid,true); assert.equal(decoded.verdict.reportedGrounded,false);
  assert.equal(scoreWatchRoleControl(WATCH_ROLE_CONTROLS[0],old,decoded.canonical).matched,false);
  assert.equal(decoded.canonical.findings[0].reason,response.findings[0].reason);
  assert.equal(decoded.verdict.approved,undefined);
  // No regex judges semantics or rewrites false to true. Independent exact-text
  // inspection must reject this misconstrued support target in future captures.
  response.findings[0].supported=true;response.findings[0].evidenceIds=['S1P20'];
  assert.equal(diagnoseWatchRoleTypedReview(response,view).verdict.valid,true);
  assert.equal(diagnoseWatchRoleTypedReview(response,view).verdict.approved,undefined);
});
