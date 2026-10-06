import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnose } from '../src/mailboxes/diagnostics.js';
import { diagnosticInput,protocolFixture } from './diagnostics-fixture.js';
test('live diagnostics enforce pinned TLS without DATA',async()=>{
 const fixture=await protocolFixture();try{
 const result=await diagnose(diagnosticInput,new Map([['smtp.gmail.com',30],['imap.gmail.com',30]]),new AbortController().signal,fixture.connector);
 assert.equal(result.smtp.tls,'verified');assert.equal(result.smtp.auth,'success');assert.equal(result.imap.tls,'verified');assert.equal(result.imap.auth,'success');
 assert.ok(!fixture.verbs.some(v=>['MAIL','RCPT','DATA','BDAT','SELECT','FETCH','APPEND','STORE'].includes(v)));
 }finally{await fixture.close();}
});
