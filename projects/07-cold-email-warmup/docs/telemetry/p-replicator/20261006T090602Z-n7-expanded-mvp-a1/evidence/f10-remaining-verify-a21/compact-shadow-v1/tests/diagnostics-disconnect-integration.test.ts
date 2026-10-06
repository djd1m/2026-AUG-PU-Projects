import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes,randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { application } from '../src/server.js';
import { publishAuthority,configFingerprint } from '../src/mailboxes/diagnostic-authority.js';
import type { ChannelFactory } from '../src/mailboxes/diagnostic-channel.js';
import { protocolFixture,diagnosticInput } from './diagnostics-fixture.js';
import { blockedFixture } from './diagnostics-deadline-fixture.js';
test('HTTP disconnect in every phase clears owned resources and admission without late publication',async()=>{
 const config=loadConfig(),pool=createPool(config.databaseUrl);await migrate(pool);await pool.query('TRUNCATE public_stop_bucket');
 const successful=await protocolFixture();let selected:ChannelFactory=successful.connector;
 const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}],diagnosticChannel:budget=>selected(budget)});
 await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(app.server.address() as {port:number}).port;
 const request=async(path:string,payload:unknown={},cookie?:string,signal?:AbortSignal)=>fetch(base+path,{method:'POST',signal,headers:{Origin:config.origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(payload)});
 const revision=(await pool.query('SELECT authority_revision FROM diagnostic_authority')).rows[0].authority_revision;
 try{
 const register=await request('/api/auth/register',{email:randomUUID()+'@example.test',password:randomBytes(24).toString('hex')});const cookie=register.headers.get('set-cookie')!.split(';')[0]!;
 const saved=await request('/api/mailboxes',diagnosticInput,cookie);const mailbox=(await saved.json()).data;const tenant=(await pool.query('SELECT tenant_id FROM mailbox WHERE id=$1',[mailbox.id])).rows[0].tenant_id;
 await publishAuthority(pool,revision,{scope:'diagnostics',tenant,mailbox:mailbox.id,smtpHost:diagnosticInput.smtpHost,smtpPort:465,imapHost:diagnosticInput.imapHost,imapPort:993,configFingerprint:configFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+120000).toISOString()});
 for(const phase of ['dns','connect','tls','greeting','auth','trickle'] as const){
 const fixture=await blockedFixture(phase);selected=fixture.connector;const controller=new AbortController();
 try{
 const pending=request('/api/mailboxes/'+mailbox.id+'/diagnostics',{},cookie,controller.signal);await fixture.started;controller.abort();await assert.rejects(pending);
 for(let i=0;i<100&&!fixture.budgets.every(b=>b.signal.aborted);i++)await new Promise(r=>setTimeout(r,10));assert.ok(fixture.budgets.length&&fixture.budgets.every(b=>b.signal.aborted),'server observes disconnect before gate release '+phase);fixture.release();await new Promise(r=>setTimeout(r,100));
 for(const channel of fixture.channels)assert.deepEqual(channel.resources(),{sockets:0,listeners:0,pending:0,timers:0,abortListeners:0});
 const row=(await pool.query('SELECT diagnostic_result FROM mailbox WHERE id=$1',[mailbox.id])).rows[0];assert.equal(row.diagnostic_result,null,'no result after actual '+phase+' start');
 assert.equal((await app.mailboxes.read(tenant,mailbox.id)).diagnostics.state,'stale','cancelled operation is not reported pending');
 selected=successful.connector;const next=await request('/api/mailboxes/'+mailbox.id+'/diagnostics',{},cookie);assert.equal(next.status,200,'admission released after '+phase);const result=(await next.json()).data;assert.equal(result.diagnostics.result.smtp.auth,'success');
 }finally{await fixture.close();}
 }
 }finally{const current=(await pool.query('SELECT authority_revision FROM diagnostic_authority')).rows[0].authority_revision;await publishAuthority(pool,current,null);await successful.close();await new Promise<void>(r=>app.server.close(()=>r()));await pool.end();}
});
