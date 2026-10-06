import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderLiveMessage } from '../src/dispatch/message.js';
import { parseTransportHeaders } from '../src/replies/headers.js';
import { parseTransportGrant } from '../src/mailboxes/transport-authority.js';
import { TransportBudget } from '../src/mailboxes/transport-channel.js';
test('live MIME enforces literal bounds and preserves seven bit wire',()=>{
 const m=renderLiveMessage('a@example.com','b@example.com',{subject:'😀'.repeat(200),body:'Привет\n.dot'},'http://127.0.0.1');assert.ok(!m.message.wire.includes('N7 LOCAL TEST'));assert.ok(!/[^\x00-\x7f]/.test(m.message.wire));assert.match(m.message.messageId,/@example.com>$/);assert.ok(m.message.wire.endsWith('\r\n.\r\n'));assert.ok(m.message.wire.split('\r\n').slice(1).filter(x=>x.startsWith(' =?')).every(x=>x.length<=76));
 for(const payload of [{subject:'x\r\nInjected: 1',body:'x'},{subject:'x'.repeat(201),body:'x'},{subject:'x',body:'x'.repeat(32769)}])assert.throws(()=>renderLiveMessage('a@example.com','b@example.com',payload,'http://127.0.0.1'));
 assert.throws(()=>renderLiveMessage('а@example.com','b@example.com',{subject:'x',body:'x'},'http://127.0.0.1'));
});
test('headers reject duplicates ambiguous sender oversized references and literal tags',()=>{
 assert.deepEqual(parseTransportHeaders(1,Buffer.from('From: b@example.com\r\nReferences: <one@example.com>\r\n <two@example.com>\r\n\r\n')).references,['<one@example.com>','<two@example.com>']);
 for(const text of ['From: a@example.com,b@example.com\r\n','From: a@example.com\r\nFrom: b@example.com\r\n','From: a@example.com\r\na4 OK done\r\n','From: a@example.com\r\nReferences: '+Array(51).fill('<x@example.com>').join(' ')+'\r\n'])assert.throws(()=>parseTransportHeaders(1,Buffer.from(text)));
 assert.throws(()=>parseTransportHeaders(1,Buffer.alloc(8193,65)));assert.throws(()=>parseTransportGrant({scope:'diagnostics'}));
});
test('transport phase deadlines and cancellation remain finite',async()=>{await assert.rejects(new TransportBudget(new AbortController().signal,10).phase(()=>new Promise(()=>{})),/timeout/);const c=new AbortController();c.abort();await assert.rejects(new TransportBudget(c.signal,100).phase(async()=>{}),/cancelled/);});
