import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { application } from '../src/server.js';
import { newSession } from '../src/auth/session.js';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { MailboxStore } from '../src/mailboxes/store.js';
import { DiagnosticStore } from '../src/mailboxes/diagnostic-store.js';
import { publishAuthority,configFingerprint } from '../src/mailboxes/diagnostic-authority.js';
import { protocolFixture,diagnosticInput } from './diagnostics-fixture.js';
async function barrier(check:()=>Promise<boolean>){for(let i=0;i<150;i++){if(await check())return;await new Promise(r=>setTimeout(r,10));}throw new Error('fixture_lock_wait_timeout');}
test('final cancellation after FIRST wait and persisted SQL rolls back and releases admission',async t=>{
 const config=loadConfig(),pool=createPool(config.databaseUrl);await migrate(pool);const tenant=randomUUID();await pool.query('INSERT INTO tenant(id) VALUES($1)',[tenant]);
 const boxes=new MailboxStore(pool,config.credentialKeyring,config.providerAllowlist,async()=>[{address:'8.8.8.8',family:4}]);const box=await boxes.save(tenant,diagnosticInput);
 let release:()=>void=()=>{};let reached:()=>void=()=>{};let held=false;let authGate=new Promise<void>(r=>{release=r;});let authReached=new Promise<void>(r=>{reached=r;});
 const fixture=await protocolFixture({holdAuth:async()=>{if(held){reached();await authGate;}}});const store=new DiagnosticStore(pool,config.credentialKeyring,config.providerAllowlist,fixture.connector,'protocol_fixture');
 const revision=(await pool.query('SELECT authority_revision FROM diagnostic_authority')).rows[0].authority_revision;
 await publishAuthority(pool,revision,{scope:'diagnostics',tenant,mailbox:box.id,smtpHost:diagnosticInput.smtpHost,smtpPort:465,imapHost:diagnosticInput.imapHost,imapPort:993,configFingerprint:configFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+120000).toISOString()});
 const blocked=async(key:number)=>(await pool.query("SELECT count(*) AS n FROM pg_locks WHERE locktype='advisory' AND classid=7 AND objid=$1 AND NOT granted",[key])).rows[0].n!=='0';
 try{
 for(const phase of ['first_lock','persistence'] as const)await t.test(phase,async()=>{
  held=true;authGate=new Promise<void>(r=>{release=r;});authReached=new Promise<void>(r=>{reached=r;});
  const controller=new AbortController();const pending=store.run(tenant,box.id,controller.signal);await authReached;
  const lock=await pool.connect();const key=phase==='first_lock'?1:810;
  try{
   await lock.query('SELECT pg_advisory_lock(7,$1)',[key]);
   if(phase==='persistence'){
    await pool.query('CREATE FUNCTION n7_f08_cancel_final() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(7,810); RETURN NEW; END $$');
    await pool.query('CREATE TRIGGER n7_f08_cancel_final BEFORE UPDATE OF diagnostic_result ON mailbox FOR EACH ROW WHEN (NEW.diagnostic_result IS NOT NULL) EXECUTE FUNCTION n7_f08_cancel_final()');
   }
   held=false;release();await barrier(()=>blocked(key));controller.abort();assert.equal(controller.signal.aborted,true);await lock.query('SELECT pg_advisory_unlock(7,$1)',[key]);
   await assert.rejects(pending,/diagnostic_cancelled/);
   const row=(await pool.query('SELECT diagnostic_result,diagnostic_attempt FROM mailbox WHERE id=$1',[box.id])).rows[0];assert.equal(row.diagnostic_result,null);assert.equal(row.diagnostic_attempt,null);assert.equal((await boxes.read(tenant,box.id)).diagnostics.state,'stale');
  }finally{await lock.query('SELECT pg_advisory_unlock(7,$1)',[key]);lock.release();if(phase==='persistence'){await pool.query('DROP TRIGGER IF EXISTS n7_f08_cancel_final ON mailbox');await pool.query('DROP FUNCTION IF EXISTS n7_f08_cancel_final()');}}
  const retry=await store.run(tenant,box.id,new AbortController().signal);assert.equal(retry.smtp.auth,'success');
 });
 await t.test('actual HTTP disconnect during final lock wait observes server abort before release',async()=>{
  const signals:AbortSignal[]=[];const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}],diagnosticChannel:budget=>{signals.push(budget.signal);return fixture.connector(budget);}});
  const account=randomUUID();await pool.query("INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,'fixture')",[account,tenant,account+'@example.test']);const session=newSession(config.sessionKey);await pool.query('INSERT INTO session(id,account_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[randomUUID(),account,session.digest,session.expiresAt]);
  await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(app.server.address() as {port:number}).port;
  const request=(signal?:AbortSignal)=>fetch(base+'/api/mailboxes/'+box.id+'/diagnostics',{method:'POST',signal,headers:{Origin:config.origin,'Content-Type':'application/json',Cookie:'n7_session='+session.token},body:'{}'});
  held=true;authGate=new Promise<void>(r=>{release=r;});authReached=new Promise<void>(r=>{reached=r;});const controller=new AbortController();const pending=request(controller.signal).then(response=>({response,error:null}),error=>({response:null,error}));await authReached;const lock=await pool.connect();
  try{await lock.query('SELECT pg_advisory_lock(7,1)');held=false;release();await barrier(()=>blocked(1));controller.abort();await barrier(async()=>signals.length>0&&signals.every(signal=>signal.aborted));await lock.query('SELECT pg_advisory_unlock(7,1)');assert.ok((await pending).error);await barrier(async()=>(await pool.query('SELECT diagnostic_attempt FROM mailbox WHERE id=$1',[box.id])).rows[0].diagnostic_attempt===null);assert.equal((await pool.query('SELECT diagnostic_result FROM mailbox WHERE id=$1',[box.id])).rows[0].diagnostic_result,null);const next=await request();assert.equal(next.status,200);}
  finally{held=false;release();await lock.query('SELECT pg_advisory_unlock(7,1)');lock.release();await new Promise<void>(r=>app.server.close(()=>r()));}
 });
 await t.test('abort after committed success cannot retroactively invalidate the observation',async()=>{const controller=new AbortController();await store.run(tenant,box.id,controller.signal);controller.abort();assert.equal((await boxes.read(tenant,box.id)).diagnostics.state,'current');});
 }finally{held=false;release();await pool.query('DROP TRIGGER IF EXISTS n7_f08_cancel_final ON mailbox');await pool.query('DROP FUNCTION IF EXISTS n7_f08_cancel_final()');const current=(await pool.query('SELECT authority_revision FROM diagnostic_authority')).rows[0].authority_revision;await publishAuthority(pool,current,null);await fixture.close();await pool.end();}
});
