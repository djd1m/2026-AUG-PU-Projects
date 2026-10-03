import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { HttpError } from '../src/errors.js';
import { test } from 'node:test';
import { observationInput,pageInput,uuidInput,type Observation } from '../src/evidence/input.js';
import { compare } from '../src/evidence/compare.js';
import { publicProjection,reportHtml,ReportStore } from '../src/growth/reports.js';
const now=Date.parse('2026-10-03T00:00:00.000Z');
const day=86400000;
function observation(end:number,numerator=10,denominator=30):Observation {
 return {sourceUrl:'https://source.example/private/alice@example.test?q=SECRET_CANARY',reference:'private mailbox id <script> CANARY',observedAt:new Date(end).toISOString(),windowStart:new Date(end-day).toISOString(),windowEnd:new Date(end).toISOString(),metric:'inbox_placement',unit:'count',direction:'higher',numerator,denominator,manualVerified:true};
}
test('B1 bounded manual observation input and explicit verification',()=>{
 const o=observation(now);assert.deepEqual(observationInput({...o}),o);
 for(const mutation of [{manualVerified:false},{sourceUrl:'file:///etc/passwd'},{sourceUrl:'https://u:p@source.test'},{reference:''},{metric:'reputation_score'},{unit:'percent'},{direction:'sideways'},{numerator:Infinity},{denominator:NaN},{numerator:31},{denominator:-1},{windowStart:o.windowEnd},{observedAt:'2026-10-02T99:00:00.000Z'},{sourceUrl:'https://source.test/'+ 'a'.repeat(2048)},{reference:'a'.repeat(501)},{extra:'rawHtml'},{numerator:0.5}]) assert.throws(()=>observationInput({...o,...mutation}));
});
test('B2 exact 7days/+1ms, 28days/+1ms, equal UTC windows, future and reasons',()=>{
 const l=observation(now-7*day,20),b=observation(now-8*day);
 assert.equal(compare(b,l,now).reason,'improved');assert.equal(compare(b,l,now+1).reason,'stale');
 assert.equal(compare(observation(Date.parse(l.observedAt)-28*day),l,now).reason,'improved');
 assert.equal(compare(observation(Date.parse(l.observedAt)-28*day-1),l,now).reason,'incomparable');
 assert.equal(compare(undefined,l,now).reason,'unknown');
 assert.equal(compare(b,observation(now+1,20),now).reason,'incomparable');
 for(const mutation of [{sourceUrl:'https://other.test/'},{reference:'different'},{metric:'spam_placement' as const},{unit:'other' as 'count'},{direction:'lower' as const},{windowStart:new Date(Date.parse(l.windowStart)+1).toISOString()},{windowStart:b.windowStart,windowEnd:b.windowEnd}]) assert.equal(compare(b,{...l,...mutation},now).reason,'incomparable');
 assert.equal(compare(b,{...l,numerator:b.numerator},now).reason,'noimprovement');
 assert.equal(compare({...b,direction:'lower',numerator:25},{...l,direction:'lower'},now).reason,'improved');
 assert.equal(compare({...b,direction:'lower'},{...l,direction:'lower'},now).reason,'noimprovement');
});
test('B2 denominators 29/30 gate ratios and strict raw count improvement',()=>{
 const b=observation(now-2*day,10,29),l=observation(now-day,11,30);
 assert.equal(compare(b,l,now).display,'raw_counts');assert.equal(compare(b,l,now).reason,'improved');
 assert.equal(compare({...b,denominator:30},l,now).display,'ratios');
 assert.equal(compare({...b,numerator:10,denominator:30},{...l,numerator:11,denominator:60},now).reason,'noimprovement');
 assert.equal(compare({...b,numerator:10,denominator:29},{...l,numerator:10,denominator:30},now).reason,'noimprovement');
 const html=reportHtml(publicProjection(b,l,'raw_counts'),true,false);assert.ok(!html.includes('%'));
});
test('B3/B4 explicit public whitelist, escaping, historical copy and exactly one badge',()=>{
 const b=observation(now-2*day),l=observation(now-day,20);const snapshot=publicProjection(b,l,'ratios');
 assert.deepEqual(Object.keys(snapshot).sort(),['baseline','direction','display','latest','metric','provenance','sourceOrigin','title','unit'].sort());
 const html=reportHtml(snapshot,true,false);
 for(const forbidden of ['alice@example.test','SECRET_CANARY','<script>','private mailbox','reference','sourceUrl']) assert.ok(!html.includes(forbidden));
 assert.equal((html.match(/data-n7-source-badge/g)??[]).length,1);
 assert.equal((reportHtml(snapshot,false,false).match(/data-n7-source-badge/g)??[]).length,0);
 const historical=reportHtml(snapshot,true,true);assert.ok(historical.includes('Historical snapshot; no current improvement claim.'));assert.ok(!historical.includes('<h1>Observed metric improvement'));
 assert.ok(reportHtml({...snapshot,sourceOrigin:'https://x.test/<script>&"'},true,false).includes('&lt;script&gt;&amp;&quot;'));
});
test('B5 bounded history pagination',()=>{
 assert.deepEqual(pageInput('/api/evidence'),{limit:50,offset:0});assert.deepEqual(pageInput('/api/evidence?limit=100&offset=10000'),{limit:100,offset:10000});
 for(const query of ['limit=101','limit=0','offset=10001','offset=-1','limit=NaN']) assert.throws(()=>pageInput('/?'+query));
});

test('F1 primitive enums reject array/object/null before any write',async()=>{
 const invalid=[['higher'],['lower'],{},null,new String('higher')];
 for(const direction of invalid) assert.throws(()=>observationInput({...observation(now),direction}),e=>e instanceof HttpError && e.status===400);
 let calls=0;const store=new ReportStore({connect:async()=>{calls++;throw new Error('unexpected database access');}} as unknown as Pool);
 for(const kind of [['copy'],['link'],{},null,new String('copy')]) await assert.rejects(store.event('tenant','ABCDEFAB-1234-1234-1234-ABCDEFABCDEF',{kind,idempotencyKey:'enumtest01'}),e=>e instanceof HttpError && e.status===400);
 assert.equal(calls,0);
 assert.equal(observationInput({...observation(now),direction:'lower'}).direction,'lower');
});
test('F2 validated UUID uses canonical lowercase identity',()=>{
 const lower='abcdefab-1234-1234-1234-abcdefabcdef';
 for(const id of [lower,lower.toUpperCase(),'aBcDeFaB-1234-1234-1234-aBcDeFaBcDeF']) assert.equal(uuidInput(id),lower);
 assert.throws(()=>uuidInput('invalid'),e=>e instanceof HttpError && e.status===404);
});
