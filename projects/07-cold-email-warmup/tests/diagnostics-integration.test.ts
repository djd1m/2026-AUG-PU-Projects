import { readFile } from 'node:fs/promises';
import { eligibilityTransaction } from '../src/consent/transaction.js';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { randomBytes,randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { application } from '../src/server.js';
import { publishAuthority,configFingerprint,type DiagnosticGrant } from '../src/mailboxes/diagnostic-authority.js';
import { protocolFixture,diagnosticInput } from './diagnostics-fixture.js';
const config=loadConfig();
test('diagnostic authority and tenant checks open no unauthorized sockets',async t=>{
 const pool=createPool(config.databaseUrl);const prior=(await pool.query('SELECT max(version) AS version FROM schema_migration')).rows[0].version;
 const before=(await pool.query('SELECT id,state,credential_envelope FROM mailbox ORDER BY id')).rows;
 await migrate(pool);assert.equal((await pool.query('SELECT max(version) AS version FROM schema_migration')).rows[0].version,13);
 assert.deepEqual((await pool.query('SELECT id,state,credential_envelope FROM mailbox ORDER BY id')).rows,before);
 if(prior===12)assert.equal((await pool.query('SELECT count(*) FROM mailbox WHERE diagnostic_result IS NOT NULL')).rows[0].count,'0');
 await pool.query('TRUNCATE send_job,pool_member,consent,campaign,mailbox,session,account,tenant,auth_bucket CASCADE');
 let revision=(await pool.query('SELECT authority_revision FROM diagnostic_authority')).rows[0].authority_revision as string;
 revision=await publishAuthority(pool,revision,null);
 let releaseAuth:()=>void=()=>{};let entered:()=>void=()=>{};let hold=false;
 let barrier=new Promise<void>(r=>{releaseAuth=r;});let reached=new Promise<void>(r=>{entered=r;});
 const fixture=await protocolFixture({holdAuth:async()=>{if(hold){entered();await barrier;}}});
 const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}],diagnosticChannel:fixture.connector});
 await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const address=app.server.address() as {port:number};const base='http://127.0.0.1:'+address.port;
 const request=async(path:string,method='GET',cookie?:string,payload:unknown={},origin=config.origin)=>{
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:method==='GET'?undefined:JSON.stringify(payload)});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 let cookie='',foreign='',id='',tenant='';
 const grant=():DiagnosticGrant=>({scope:'diagnostics',tenant,mailbox:id,smtpHost:diagnosticInput.smtpHost,smtpPort:465,imapHost:diagnosticInput.imapHost,imapPort:993,configFingerprint:configFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+60000).toISOString()});
 const authorize=async()=>{revision=await publishAuthority(pool,revision,grant());};
 const run=()=>request('/api/mailboxes/'+id+'/diagnostics','POST',cookie);
 const race=async(writer:()=>Promise<unknown>,expected:number)=>{
 barrier=new Promise<void>(r=>{releaseAuth=r;});reached=new Promise<void>(r=>{entered=r;});hold=true;
 const pending=run();await reached;await writer();hold=false;releaseAuth();assert.equal((await pending).status,expected);
 };
 try{
 cookie=(await request('/api/auth/register','POST',undefined,{email:randomUUID()+'@example.test',password:randomBytes(20).toString('hex')})).cookie!;
 foreign=(await request('/api/auth/register','POST',undefined,{email:randomUUID()+'@example.test',password:randomBytes(20).toString('hex')})).cookie!;
 tenant=(await request('/api/auth/me','GET',cookie)).data.data.tenant_id;
 id=(await request('/api/mailboxes','POST',cookie,diagnosticInput)).data.data.id;
 await t.test('owner origin session and disabled authority precede decrypt DNS sockets',async()=>{
 const original=(await pool.query('SELECT diagnostic_revision FROM mailbox WHERE id=$1',[id])).rows[0];
 assert.equal((await run()).status,503);assert.equal(fixture.verbs.length,0);
 assert.equal((await request('/api/mailboxes/'+id+'/diagnostics','POST',foreign)).status,404);
 assert.equal((await request('/api/mailboxes/'+id+'/diagnostics','POST',undefined)).status,401);
 assert.equal((await request('/api/mailboxes/'+id+'/diagnostics','POST',cookie,{},'http://wrong.example')).status,403);
 assert.deepEqual((await pool.query('SELECT diagnostic_revision FROM mailbox WHERE id=$1',[id])).rows[0],original);
 });
 await authorize();
 await t.test('AEAD and protocol error canaries never escape diagnostic sinks',async()=>{
 const envelope=(await pool.query('SELECT credential_envelope FROM mailbox WHERE id=$1',[id])).rows[0].credential_envelope;
 await pool.query('UPDATE mailbox SET credential_envelope=$2 WHERE id=$1',[id,{...envelope,tag:Buffer.alloc(16).toString('base64')}]);
 assert.equal((await run()).status,503);assert.equal(fixture.verbs.length,0);
 await pool.query('UPDATE mailbox SET credential_envelope=$2 WHERE id=$1',[id,envelope]);
 const result=await run();assert.equal(result.status,200);assert.equal(result.data.data.state,'configured');assert.equal(result.data.data.diagnostics.state,'current');assert.equal(result.data.data.diagnostics.result.evidenceMode,'protocol_fixture');
 assert.equal(result.data.data.diagnostics.result.smtp.auth,'success');assert.equal(result.data.data.diagnostics.result.imap.auth,'success');
 const stored=(await pool.query('SELECT diagnostic_result FROM mailbox WHERE id=$1',[id])).rows[0];assert.ok(!JSON.stringify(stored).includes('CANARY'));assert.ok(!JSON.stringify(result).includes('CANARY'));
 assert.equal((await pool.query('SELECT count(*) FROM capacity_lease WHERE state=\'active\'')).rows[0].count,'0');assert.equal((await pool.query('SELECT count(*) FROM consent')).rows[0].count,'0');assert.equal((await pool.query('SELECT count(*) FROM send_job')).rows[0].count,'0');
 });
 await t.test('diagnostic revision fences replacement stop quarantine and newer attempt',async()=>{
 await race(()=>app.mailboxes.change(tenant,id,{dailyLimit:11}),409);
 await race(()=>eligibilityTransaction(pool,async c=>{await c.query('UPDATE mailbox SET diagnostic_revision=diagnostic_revision+1 WHERE tenant_id=$1 AND id=$2',[tenant,id]);}),409);
 await race(async()=>{const child=await promisify(execFile)(process.execPath,['node_modules/tsx/dist/cli.mjs','tests/diagnostics-overlap-fixture.ts',tenant,id],{timeout:15000});assert.match(child.stdout,/overlap_completed/);},409);
 await race(()=>app.mailboxes.save(tenant,diagnosticInput,id),409);
 await race(()=>app.mailboxes.change(tenant,id,{state:'paused'}),409);
 await app.mailboxes.save(tenant,diagnosticInput,id);
 await race(()=>app.mailboxes.change(tenant,id,{state:'quarantined'}),409);
 await app.mailboxes.save(tenant,diagnosticInput,id);
 const old=(await pool.query('SELECT diagnostic_revision FROM mailbox WHERE id=$1',[id])).rows[0].diagnostic_revision;
 assert.equal((await run()).status,200);assert.notEqual((await pool.query('SELECT diagnostic_revision FROM mailbox WHERE id=$1',[id])).rows[0].diagnostic_revision,old);
 });
 await t.test('grant revoke orders before final publication and after publication invalidates projection',async()=>{
 await race(async()=>{revision=await publishAuthority(pool,revision,null);},503);
 assert.equal((await app.mailboxes.read(tenant,id)).diagnostics.state,'disabled');await authorize();assert.equal((await run()).status,200);
 revision=await publishAuthority(pool,revision,null);const observed=await app.mailboxes.read(tenant,id);assert.equal(observed.diagnostics.state,'disabled');assert.ok(observed.diagnostics.result);
 await assert.rejects(publishAuthority(pool,'0',grant()),/authority_changed/);await authorize();
 await race(authorize,503);
 });
 await t.test('authority and final persistence rollback leave no partial current result',async()=>{
 await pool.query("CREATE FUNCTION n7_f08_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SERVER_SECRET_CANARY'; END $$");
 await pool.query('CREATE TRIGGER n7_f08_authority BEFORE UPDATE ON diagnostic_authority FOR EACH ROW EXECUTE FUNCTION n7_f08_fail()');
 await assert.rejects(publishAuthority(pool,revision,null));assert.equal((await pool.query('SELECT authority_revision FROM diagnostic_authority')).rows[0].authority_revision,revision);
 await pool.query('DROP TRIGGER n7_f08_authority ON diagnostic_authority');
 await pool.query('CREATE TRIGGER n7_f08_result BEFORE UPDATE OF diagnostic_result ON mailbox FOR EACH ROW WHEN (NEW.diagnostic_result IS NOT NULL) EXECUTE FUNCTION n7_f08_fail()');
 const result=await run();assert.equal(result.status,503);assert.ok(!JSON.stringify(result).includes('CANARY'));assert.equal((await pool.query('SELECT diagnostic_result FROM mailbox WHERE id=$1',[id])).rows[0].diagnostic_result,null);
 await pool.query('DROP TRIGGER n7_f08_result ON mailbox');await pool.query('DROP FUNCTION n7_f08_fail()');
 });
 }finally{
 hold=false;releaseAuth();await fixture.close();await new Promise<void>(r=>app.server.close(()=>r()));
 await pool.query('DROP TRIGGER IF EXISTS n7_f08_authority ON diagnostic_authority');await pool.query('DROP TRIGGER IF EXISTS n7_f08_result ON mailbox');await pool.query('DROP FUNCTION IF EXISTS n7_f08_fail()');await pool.end();
 }
});

test('real schema12 to13 upgrade preserves encrypted data without verified backfill',async()=>{
 const pool=createPool(config.databaseUrl),schema='n7_f08_'+randomUUID().replaceAll('-','');const client=await pool.connect();
 try{await client.query('BEGIN');await client.query('CREATE SCHEMA '+schema);await client.query('SET LOCAL search_path TO '+schema);
 await client.query('CREATE TABLE schema_migration(version integer PRIMARY KEY);INSERT INTO schema_migration VALUES(12);CREATE TABLE mailbox(id uuid PRIMARY KEY,state text,credential_envelope jsonb)');
 const id=randomUUID(),envelope={ciphertext:'OPAQUE_MIGRATION_CANARY'};await client.query("INSERT INTO mailbox VALUES($1,'configured',$2)",[id,envelope]);
 await client.query(await readFile(new URL('../db/013-live-diagnostics.sql',import.meta.url),'utf8'));
 const row=(await client.query('SELECT * FROM mailbox')).rows[0];assert.deepEqual(row.credential_envelope,envelope);assert.equal(row.state,'configured');assert.equal(row.diagnostic_revision,'0');assert.equal(row.diagnostic_result,null);assert.equal(row.diagnostic_attempt,null);
 assert.equal((await client.query('SELECT state FROM diagnostic_authority')).rows[0].state,'revoked');assert.equal((await client.query('SELECT max(version) AS v FROM schema_migration')).rows[0].v,13);
 // Old-app columns stay readable; rollback preserves the additive source database.
 assert.deepEqual((await client.query('SELECT id,state,credential_envelope FROM mailbox')).rows[0],{id,state:'configured',credential_envelope:envelope});await client.query('ROLLBACK');
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});
