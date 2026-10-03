import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { parsePage,messageId,singleAddress,type PageInput } from '../src/replies/input.js';
const page=():PageInput=>({runId:randomUUID(),attempt:1,uidvalidity:'1',expectedCursor:0,coveredThrough:100,kind:'scan',headers:[{uid:3,from:' Person <A@example.test> ',references:['<own@EXAMPLE.test>']}],startedAt:new Date(),completedAt:new Date()});
test('F04a bounded header-only input normalization and optional incoming ID',()=>{
 assert.equal(singleAddress(' Person <A@example.test> '),'a@example.test');
 for(const bad of ['a@example.test,b@example.test','a@example.test; b@example.test','a@example.test\r\nX: yes','<a@example.test><b@example.test>']) assert.equal(singleAddress(bad),null);
 assert.equal(messageId('<Local@EXAMPLE.test>'),'<Local@example.test>');assert.equal(messageId('broken'),null);
 const p=page();assert.equal(parsePage(p).headers[0]!.messageId,null);assert.deepEqual(parsePage(p).headers[0]!.references,['<own@example.test>']);
 p.headers[0]!.messageId='malformed';assert.equal(parsePage(p).headers[0]!.messageId,null);
});
test('F04a explicit page/header/reference/range/validity limits reject before any writes',()=>{
 for(const mutate of [
  (p:PageInput)=>{p.headers=Array.from({length:101},(_,i)=>({uid:i+1,from:'a@example.test'}));},
  (p:PageInput)=>{p.headers[0]!.from='x'.repeat(8193);},
  (p:PageInput)=>{p.headers[0]!.references=Array(51).fill('<x@example.test>');},
  (p:PageInput)=>{p.headers[0]!.inReplyTo='<x@example.test>\r\nSubject: injected';},
  (p:PageInput)=>{Object.assign(p.headers[0]!,{body:'N7_BODY_CANARY_F04A'});},
  (p:PageInput)=>{p.headers.push(p.headers[0]!);},
  (p:PageInput)=>{p.expectedCursor=3;},
  (p:PageInput)=>{p.coveredThrough=2;},
  (p:PageInput)=>{p.uidvalidity='0';},
  (p:PageInput)=>{p.uidvalidity='4294967296';},
  (p:PageInput)=>{p.completedAt=new Date(NaN);},
 ]) {const p=page();mutate(p);assert.throws(()=>parsePage(p));}
 const p=page();p.headers=[];assert.equal(parsePage(p).coveredThrough,100);
 const tail:PageInput={...p,kind:'tail',tailHighWater:100,expectedCursor:100};assert.equal(parsePage(tail).headers.length,0);
 for(const horizon of [undefined,-1,99,4294967296]) assert.throws(()=>parsePage({...tail,tailHighWater:horizon} as PageInput));
 assert.equal(parsePage({...tail,tailHighWater:101}).coveredThrough,100);
 assert.throws(()=>parsePage({...tail,coveredThrough:102}));
});
