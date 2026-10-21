import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retryDelay } from '../src/dispatch/adapter.js';
import { renderTestMessage,tokenHash,TEST_LABEL } from '../src/dispatch/message.js';
test('B3 plain local test message, random bound token, one-click and reference headers',()=>{
 const a=renderTestMessage('sender@example.test','recipient@example.test',{subject:'Hello',body:'Plain body'},'http://127.0.0.1:18704','<prior@n7.local.test>');
 const b=renderTestMessage('sender@example.test','recipient@example.test',{subject:'Hello',body:'Plain body'},'http://127.0.0.1:18704');
 assert.notEqual(a.token,b.token);assert.equal(a.token.length,43);assert.equal(a.tokenHash,tokenHash(a.token));
 assert.match(a.message.body,/Plain body\n\nUnsubscribe: http/);assert.match(a.message.body,new RegExp(a.token));
 assert.equal(a.message.testLabel,TEST_LABEL);assert.equal(a.message.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
 assert.equal(a.message.headers.References,'<prior@n7.local.test>');assert.equal(a.message.headers['Message-ID'],a.message.messageId);
 assert.throws(()=>renderTestMessage('sender\r\nBcc:evil','x',{subject:'X',body:'X'},'http://127.0.0.1:18704'));
});
test('B4 retry delays/max3 and exact120s ceiling',()=>{
 const first=new Date(0);
 assert.equal(retryDelay(1,first,new Date(0)),5000);assert.equal(retryDelay(2,first,new Date(5000)),30000);
 assert.equal(retryDelay(3,first,new Date(35000)),null);assert.equal(retryDelay(1,first,new Date(114999)),5000);
 assert.equal(retryDelay(1,first,new Date(115000)),null);assert.equal(retryDelay(2,first,new Date(90000)),null);
 assert.equal(retryDelay(1,first,new Date(120000)),null);assert.equal(retryDelay(1,first,new Date(-1)),null);
});
