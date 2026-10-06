import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { acquireTransportSlot,closedOwnerProof,releaseTransportSlot } from '../src/mailboxes/transport-slots.js';
import { transportFixture,recoveryScenario } from './f09-transport-fixture.js';
test('transport grants are separate scoped expiring authority',recoveryScenario);
test('final live submission preserves all eligibility fences',recoveryScenario);
test('UID reset crash and replay preserve atomic stop effects',recoveryScenario);
test('expired occupied slots survive actual SIGSTOP120s until exact child exit',async()=>{
 const config=loadConfig(),pool=createPool(config.databaseUrl),f=await transportFixture({stall:true});let child:ReturnType<typeof fork>|undefined;
 try{
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'n7f09_a1');await migrate(pool);await pool.query('TRUNCATE tenant,auth_bucket CASCADE');await pool.query("INSERT INTO transport_operation(protocol,slot) VALUES('smtp',1),('smtp',2),('imap',1),('imap',2),('imap',3),('imap',4) ON CONFLICT DO NOTHING");const tenant=randomUUID(),mailbox=randomUUID();await pool.query('INSERT INTO tenant(id) VALUES($1)',[tenant]);await pool.query("INSERT INTO mailbox(id,tenant_id,label,state,daily_limit,provider_limit) VALUES($1,$2,'f09','configured',10,30)",[mailbox,tenant]);
  const slot=await acquireTransportSlot(pool,'smtp',tenant,mailbox);child=fork(new URL('./f09-slot-owner-fixture.ts',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced'});const exit=new Promise<void>(r=>child!.once('exit',()=>r()));const ready=new Promise<void>((resolve,reject)=>{child!.once('message',()=>resolve());child!.once('error',reject);});child.send({port:f.options!.smtp465,ca:f.cert.cert});await ready;assert.ok(child.pid);process.kill(child.pid,'SIGSTOP');
  const started=Date.now();await new Promise(r=>setTimeout(r,120100));assert.ok(Date.now()-started>=120000);assert.equal((await pool.query('SELECT expires_at<clock_timestamp() AS expired FROM transport_operation WHERE operation=$1',[slot.operation])).rows[0].expired,true);
  await assert.rejects(acquireTransportSlot(pool,'smtp',tenant,mailbox));assert.equal(f.sockets.size,1);assert.equal(f.maxConnections,1);
  const other=randomUUID();await pool.query("INSERT INTO mailbox(id,tenant_id,label,state,daily_limit,provider_limit) VALUES($1,$2,'second','configured',10,30)",[other,tenant]);const second=await acquireTransportSlot(pool,'smtp',tenant,other);await assert.rejects(acquireTransportSlot(pool,'smtp',tenant,randomUUID()));
  child.kill('SIGTERM');await assert.rejects(acquireTransportSlot(pool,'smtp',tenant,mailbox));assert.equal(child.exitCode,null);child.kill('SIGKILL');await exit;await new Promise(r=>setTimeout(r,25));assert.equal(f.sockets.size,0);
  assert.equal(await releaseTransportSlot(pool,closedOwnerProof(slot)),true);const replacement=await acquireTransportSlot(pool,'smtp',tenant,mailbox);assert.equal(await releaseTransportSlot(pool,closedOwnerProof(slot)),false);await releaseTransportSlot(pool,closedOwnerProof(replacement));await releaseTransportSlot(pool,closedOwnerProof(second));
 }finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await f.close();await pool.end();}
});
