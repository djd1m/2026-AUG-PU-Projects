import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { MailboxStore } from '../src/mailboxes/store.js';
import { DiagnosticStore } from '../src/mailboxes/diagnostic-store.js';
import { publishAuthority,configFingerprint,type DiagnosticGrant } from '../src/mailboxes/diagnostic-authority.js';
import { DispatchSeams } from '../src/dispatch/seams.js';
import { protocolFixture,diagnosticInput } from './diagnostics-fixture.js';
const config=loadConfig();
async function waitUntil(condition:()=>Promise<boolean>){for(let i=0;i<100;i++){if(await condition())return;await new Promise(r=>setTimeout(r,15));}throw new Error('fixture_barrier_timeout');}
test('post-lock expiry queued revoke complaint order and actual CLI are fenced',async t=>{
 const pool=createPool(config.databaseUrl);await migrate(pool);const tenant=randomUUID();await pool.query('INSERT INTO tenant(id) VALUES($1)',[tenant]);
 const boxes=new MailboxStore(pool,config.credentialKeyring,config.providerAllowlist,async()=>[{address:'8.8.8.8',family:4}]);const box=await boxes.save(tenant,diagnosticInput);const id=box.id;
 let revision=(await pool.query('SELECT authority_revision FROM diagnostic_authority')).rows[0].authority_revision as string;
 const grant=(expires=Date.now()+60000):DiagnosticGrant=>({scope:'diagnostics',tenant,mailbox:id,smtpHost:diagnosticInput.smtpHost,smtpPort:465,imapHost:diagnosticInput.imapHost,imapPort:993,configFingerprint:configFingerprint(config.providerAllowlist),expiresAt:new Date(expires).toISOString()});
 const authorize=async(expires?:number)=>{revision=await publishAuthority(pool,revision,grant(expires));};
 let release:()=>void=()=>{};let entered:()=>void=()=>{};let held=false;let barrier=new Promise<void>(r=>{release=r;});let reached=new Promise<void>(r=>{entered=r;});
 const fixture=await protocolFixture({holdAuth:async()=>{if(held){entered();await barrier;}}});const diagnostics=new DiagnosticStore(pool,config.credentialKeyring,config.providerAllowlist,fixture.connector,'protocol_fixture');
 const run=()=>diagnostics.run(tenant,id,new AbortController().signal);
 const hold=()=>{held=true;barrier=new Promise<void>(r=>{release=r;});reached=new Promise<void>(r=>{entered=r;});};
 const directory=await mkdtemp(join(tmpdir(),'n7-f08-cli-'));const file=join(directory,'grant.json');
 const cli=async(...args:string[])=>{
 try{return {...await promisify(execFile)(process.execPath,['dist/mailboxes/diagnostic-operator.js',...args],{timeout:10000}),exit:0};}
 catch(e){const error=e as {stdout:string;stderr:string;code:number};return {stdout:error.stdout,stderr:error.stderr,exit:error.code};}
 };
 try{
 await t.test('DB clock sampled after FIRST lock denies authority expiry while waiting',async()=>{
 await authorize(Date.now()+1100);hold();const pending=run();await reached;
 const lock=await pool.connect();try{await lock.query('SELECT pg_advisory_lock(7,1)');held=false;release();
 await waitUntil(async()=>(await pool.query("SELECT count(*) AS n FROM pg_locks WHERE locktype='advisory' AND classid=7 AND objid=1 AND NOT granted")).rows[0].n!=='0');
 await new Promise(r=>setTimeout(r,1200));await lock.query('SELECT pg_advisory_unlock(7,1)');await assert.rejects(pending,/live_provider_disabled/);assert.equal((await pool.query('SELECT diagnostic_result FROM mailbox WHERE id=$1',[id])).rows[0].diagnostic_result,null);
 }finally{await lock.query('SELECT pg_advisory_unlock(7,1)');lock.release();}await authorize();
 });
 await t.test('revoke waits behind final authority read and makes committed observation noncurrent',async()=>{
 const lock=await pool.connect();await lock.query('SELECT pg_advisory_lock(7,809)');
 try{
 await pool.query('CREATE FUNCTION n7_f08_wait_final() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(7,809); RETURN NEW; END $$');
 await pool.query('CREATE TRIGGER n7_f08_wait BEFORE UPDATE OF diagnostic_result ON mailbox FOR EACH ROW WHEN (NEW.diagnostic_result IS NOT NULL) EXECUTE FUNCTION n7_f08_wait_final()');
 const pending=run();await waitUntil(async()=>(await pool.query("SELECT count(*) AS n FROM pg_locks WHERE locktype='advisory' AND classid=7 AND objid=809 AND NOT granted")).rows[0].n!=='0');
 const revoked=publishAuthority(pool,revision,null);await waitUntil(async()=>(await pool.query("SELECT count(*) AS n FROM pg_locks WHERE locktype='advisory' AND classid=7 AND objid=1 AND NOT granted")).rows[0].n!=='0');
 await lock.query('SELECT pg_advisory_unlock(7,809)');await pending;revision=await revoked;
 const row=await boxes.read(tenant,id);assert.equal(row.diagnostics.state,'disabled');assert.ok(row.diagnostics.result);assert.notEqual(row.diagnostics.result.authorityRevision,revision);
 }finally{await lock.query('SELECT pg_advisory_unlock(7,809)');lock.release();await pool.query('DROP TRIGGER IF EXISTS n7_f08_wait ON mailbox');await pool.query('DROP FUNCTION IF EXISTS n7_f08_wait_final()');}await authorize();
 });
 await t.test('complaint shared cancel before and after final publication preserves submitting',async()=>{
 const jobs=[];for(const state of ['queued','claimed','submitting']){const job=randomUUID();jobs.push(job);await pool.query("INSERT INTO send_job(id,tenant_id,mailbox_id,scope,state) VALUES($1,$2,$3,'pool',$4)",[job,tenant,id,state]);}
 const stop=new DispatchSeams(pool);hold();const pending=run();await reached;await stop.complaint(tenant,id);held=false;release();await assert.rejects(pending,/mailbox_changed/);
 const states=(await pool.query('SELECT state FROM send_job WHERE id=ANY($1::uuid[]) ORDER BY state',[jobs])).rows.map(r=>r.state);assert.deepEqual(states,['cancelled','cancelled','submitting']);
 await boxes.save(tenant,diagnosticInput,id);await run();await stop.complaint(tenant,id);assert.equal((await boxes.read(tenant,id)).diagnostics.state,'stale');await boxes.save(tenant,diagnosticInput,id);
 });
 await t.test('actual privileged CLI commits revoke for invalid missing and expired input',async()=>{
 for(const input of ['missing','invalid','expired'] as const){await authorize();if(input==='invalid')await writeFile(file,'{invalid SERVER_SECRET_CANARY');if(input==='expired')await writeFile(file,JSON.stringify(grant(Date.now()-1000)));
 const result=await cli('publish',revision,input==='missing'?join(directory,'absent.json'):file);assert.equal(result.exit,1);assert.match(result.stderr,/invalid_input_authority_revoked/);assert.match(result.stdout,/authority_committed_revision=/);const current=(await pool.query('SELECT authority_revision,state FROM diagnostic_authority')).rows[0];assert.notEqual(current.authority_revision,revision);assert.equal(current.state,'revoked');revision=current.authority_revision;assert.ok(!JSON.stringify(result).includes('CANARY'));
 }
 });
 await t.test('actual stale importer and database failure never claim successful revoke',async()=>{
 await writeFile(file,JSON.stringify(grant()));await authorize();const stale=await cli('publish','0',file);assert.equal(stale.exit,1);assert.equal(stale.stdout,'');assert.match(stale.stderr,/authority_action_failed/);assert.equal((await pool.query('SELECT authority_revision FROM diagnostic_authority')).rows[0].authority_revision,revision);
 await pool.query("CREATE FUNCTION n7_f08_cli_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SERVER_SECRET_CANARY'; END $$");await pool.query('CREATE TRIGGER n7_f08_cli_failure BEFORE UPDATE ON diagnostic_authority FOR EACH ROW EXECUTE FUNCTION n7_f08_cli_fail()');
 const rolledBack=await cli('revoke',revision);assert.equal(rolledBack.exit,1);assert.equal(rolledBack.stdout,'');assert.ok(!rolledBack.stderr.includes('CANARY'));assert.equal((await pool.query('SELECT authority_revision FROM diagnostic_authority')).rows[0].authority_revision,revision);await pool.query('DROP TRIGGER n7_f08_cli_failure ON diagnostic_authority');await pool.query('DROP FUNCTION n7_f08_cli_fail()');revision=await publishAuthority(pool,revision,null);
 });
 }finally{held=false;release();await fixture.close();await pool.query('DROP TRIGGER IF EXISTS n7_f08_wait ON mailbox');await pool.query('DROP FUNCTION IF EXISTS n7_f08_wait_final()');await pool.query('DROP TRIGGER IF EXISTS n7_f08_cli_failure ON diagnostic_authority');await pool.query('DROP FUNCTION IF EXISTS n7_f08_cli_fail()');const current=(await pool.query('SELECT authority_revision FROM diagnostic_authority')).rows[0].authority_revision;await publishAuthority(pool,current,null);await rm(directory,{recursive:true,force:true});await pool.end();}
});
