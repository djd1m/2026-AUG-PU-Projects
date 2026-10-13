import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Budget,LineBuffer,DiagnosticFailure,fixtureChannel } from '../src/mailboxes/diagnostic-channel.js';
import { admitDiagnostic,diagnose } from '../src/mailboxes/diagnostics.js';
import { certificates,diagnosticInput,protocolFixture } from './diagnostics-fixture.js';
const allowlist=new Map([['smtp.gmail.com',30],['imap.gmail.com',30]]);
test('diagnostic byte deadlines cancellation and admission are bounded',async()=>{
 const bytes=new LineBuffer();assert.deepEqual(bytes.push(Buffer.from('A'.repeat(8190)+'\r')),[]);assert.deepEqual(bytes.push(Buffer.from('\n')),['A'.repeat(8190)]);
 assert.throws(()=>new LineBuffer().push(Buffer.alloc(8193,65)),DiagnosticFailure);assert.throws(()=>new LineBuffer().push(Buffer.alloc(65537,65)),DiagnosticFailure);
 const total=new LineBuffer();for(let i=0;i<8;i++)total.push(Buffer.from('a'.repeat(8190)+'\r\n'));assert.equal(total.total,65536);assert.throws(()=>total.push(Buffer.from('x')),DiagnosticFailure);
 assert.throws(()=>new LineBuffer().push(Buffer.from('x\ny')),DiagnosticFailure);
 const one=admitDiagnostic('a'),two=admitDiagnostic('b');assert.throws(()=>admitDiagnostic('a'));assert.throws(()=>admitDiagnostic('c'));one();two();admitDiagnostic('c')();
 const budget=new Budget(new AbortController().signal,20);await assert.rejects(budget.phase(()=>new Promise(()=>{})),/timeout/);
 const controller=new AbortController();controller.abort();await assert.rejects(new Budget(controller.signal).phase(async()=>{}),/cancelled/);
});
test('SMTP and IMAP authenticate independently without message commands',async()=>{
 for(const smtpPort of [465,587] as const){const fixture=await protocolFixture({imapReject:true,hostile:'SERVER_SECRET_CANARY'});try{
 const result=await diagnose({...diagnosticInput,smtpPort},allowlist,new AbortController().signal,fixture.connector);
 assert.equal(result.smtp.auth,'success');assert.equal(result.imap.auth,'failed');assert.equal(result.imap.code,'auth_rejected');assert.ok(!JSON.stringify(result).includes('CANARY'));
 assert.ok(fixture.verbs.includes('AUTH'));assert.ok(fixture.verbs.includes('AUTHENTICATE'));assert.ok(!fixture.verbs.some(v=>['MAIL','RCPT','DATA','BDAT','SELECT','EXAMINE','FETCH','APPEND','STORE','IDLE'].includes(v)));
 }finally{await fixture.close();}}
});
test('production TLS adapter pins peer and rejects certificate downgrade rebinding',async()=>{
 const fixture=await protocolFixture();try{
 let resolutions=0;let dials=0;const connector=fixtureChannel({ca:fixture.cert.cert,resolver:async()=>{resolutions++;return [{address:resolutions<=2?'8.8.8.8':'127.0.0.1',family:4}];},dial:(address,port)=>{assert.equal(address,'8.8.8.8');dials++;return {address:'127.0.0.1',port:port===465?fixture.ports[0]!:fixture.ports[2]!};}});
 const result=await diagnose(diagnosticInput,allowlist,new AbortController().signal,connector);assert.equal(result.smtp.auth,'success');assert.equal(result.imap.auth,'success');assert.equal(resolutions,2);assert.equal(dials,2);
 const wrong=fixtureChannel({ca:fixture.cert.cert,resolver:async()=>[{address:'8.8.8.8',family:4}],dial:()=>({address:'127.0.0.1',port:fixture.ports[0]!})});
 const invalid=await diagnose({...diagnosticInput,smtpHost:'wrong.example.com'},new Map([...allowlist,['wrong.example.com',30]]),new AbortController().signal,wrong);assert.equal(invalid.smtp.tls,'failed');assert.equal(invalid.smtp.auth,'not_checked');
 let unsafeDials=0;for(const answers of [[],[{address:'127.0.0.1',family:4}],[{address:'8.8.8.8',family:6}],Array(33).fill({address:'8.8.8.8',family:4}),[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]]){
 const unsafe=fixtureChannel({ca:fixture.cert.cert,resolver:async()=>answers,dial:()=>{unsafeDials++;throw new Error();}});const r=await diagnose(diagnosticInput,allowlist,new AbortController().signal,unsafe);assert.equal(r.smtp.code,'unsafe_address');}assert.equal(unsafeDials,0);
 }finally{await fixture.close();}
});
test('hostile TLS protocol states fail closed and cancellation destroys owned sockets',async()=>{
 for(const behavior of [{noStarttls:true},{noPostTlsPlain:true},{preauth:true},{wrongTag:true},{oversize:true}]){const fixture=await protocolFixture(behavior);try{const result=await diagnose({...diagnosticInput,smtpPort:587},allowlist,new AbortController().signal,fixture.connector);assert.ok(result.smtp.code||result.imap.code);}finally{await fixture.close();}}
 const fixture=await protocolFixture({stall:true});try{const controller=new AbortController();const pending=diagnose(diagnosticInput,allowlist,controller.signal,fixture.connector);setTimeout(()=>controller.abort(),25);const result=await pending;assert.ok(result.smtp.code);await new Promise(r=>setTimeout(r,25));assert.equal(fixture.sockets.size,0);}finally{await fixture.close();}
});

test('untrusted certificates TLS downgrade and late cancelled DNS never authenticate',async()=>{
 for(const options of [{}, {minVersion:'TLSv1.1' as const,maxVersion:'TLSv1.1' as const}]){
 const fixture=await protocolFixture({},options);try{
 const untrusted=fixtureChannel({ca:certificates().cert,resolver:async()=>[{address:'8.8.8.8',family:4}],dial:(_address,port)=>({address:'127.0.0.1',port:port===465?fixture.ports[0]!:fixture.ports[2]!})});
 const r=await diagnose(diagnosticInput,allowlist,new AbortController().signal,untrusted);assert.equal(r.smtp.tls,'failed');assert.equal(r.imap.tls,'failed');assert.equal(r.smtp.auth,'not_checked');assert.ok(!fixture.verbs.includes('AUTH'));
 }finally{await fixture.close();}}
 let dials=0;const controller=new AbortController();const late=fixtureChannel({ca:'unused',resolver:async()=>{await new Promise(r=>setTimeout(r,50));return [{address:'8.8.8.8',family:4}];},dial:()=>{dials++;throw new Error();}});
 const pending=diagnose(diagnosticInput,allowlist,controller.signal,late);setTimeout(()=>controller.abort(),5);await pending;await new Promise(r=>setTimeout(r,80));assert.equal(dials,0);
});
