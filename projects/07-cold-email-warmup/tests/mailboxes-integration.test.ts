import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { application } from '../src/server.js';
import { eligibilityTransaction } from '../src/consent/transaction.js';
import { POOL_DISCLOSURE } from '../src/consent/store.js';
import { decryptCredentials,type Envelope } from '../src/mailboxes/crypto.js';
import type { Identity } from '../src/auth/store.js';
test('F02 real PostgreSQL tenant, AEAD, scopes, locking and atomic stop writers',async t=>{
  const config=loadConfig();const pool=createPool(config.databaseUrl);await migrate(pool);
  await pool.query('TRUNCATE send_job,pool_member,consent,campaign,mailbox,session,account,tenant,auth_bucket CASCADE');
  let transports=0;let providerFailure=false;let unsafeDns=false;
  const app=await application(config,pool,{resolver:async()=>[{address:unsafeDns?'127.0.0.1':'8.8.8.8',family:4}],adapter:{mode:'local_test',async connect(){transports++;if(providerFailure) throw new Error(canary);}}});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const address=app.server.address();assert.ok(address && typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
  const canary='N7_CREDENTIAL_CANARY_'+randomBytes(16).toString('hex');
  const request=async(path:string,method='GET',cookie?:string,payload:unknown={},origin=config.origin)=>{
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:method==='GET'?undefined:JSON.stringify(payload)});
    const data=await response.json();return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const raw={label:'Mailbox',senderAddress:'sender@example.com',smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:canary,smtpPassword:canary,imapUsername:canary,imapPassword:canary};
  let cookieA='',cookieB='',id='',other='',identity:Identity={tenant_id:'',account_id:''};let campaign:{id:string;content_version:number;recipient_fingerprint:string};
  const job=async(state:string,scope='pool',campaignId:string|null=null,recipient:string|null=null)=>{
    const jid=randomUUID();await eligibilityTransaction(pool,async client=>{await client.query('INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,campaign_id,state) VALUES($1,$2,$3,$4,$5,$6,$7)',[jid,identity.tenant_id,id,recipient,scope,campaignId,state]);});return jid;
  };
  const poolGrant=()=>request(`/api/mailboxes/${id}/consents`,'POST',cookieA,{scope:'pool',action:'grant',affirmative:true,scopeVersion:1});
  const campaignGrant=()=>request(`/api/mailboxes/${id}/consents`,'POST',cookieA,{scope:'campaign',action:'grant',affirmative:true,campaignId:campaign.id,scopeVersion:campaign.content_version,recipientFingerprint:campaign.recipient_fingerprint});
  try {
    await t.test('AC1 authenticated masked persistence sends0, no implicit consent, foreign404 and origin0writes',async()=>{
      cookieA=(await request('/api/auth/register','POST',undefined,{email:'a@example.test',password:randomBytes(20).toString('hex')})).cookie!;
      cookieB=(await request('/api/auth/register','POST',undefined,{email:'b@example.test',password:randomBytes(20).toString('hex')})).cookie!;
      identity=(await request('/api/auth/me','GET',cookieA)).data.data;
      assert.equal((await pool.query('SELECT count(*) FROM consent')).rows[0].count,'0');
      const saved=await request('/api/mailboxes','POST',cookieA,raw);assert.equal(saved.status,201);id=saved.data.data.id;
      other=(await request('/api/mailboxes','POST',cookieB,raw)).data.data.id;
      assert.equal(saved.data.data.state,'configured');assert.equal(saved.data.data.daily_limit,10);assert.equal(transports,0);
      for(const response of [saved,await request('/api/mailboxes','GET',cookieA),await request('/api/mailboxes/'+id,'GET',cookieA)]) assert.ok(!JSON.stringify(response).includes(canary));
      const persisted=(await pool.query('SELECT * FROM mailbox WHERE id=$1',[id])).rows[0];assert.ok(!JSON.stringify(persisted).includes(canary));
      assert.equal((decryptCredentials<{smtpPassword:string}>(persisted.credential_envelope,identity.tenant_id,id,config.credentialKeyring)).smtpPassword,canary);
      assert.equal((await pool.query('SELECT count(*) FROM consent')).rows[0].count,'0');
      for(const method of ['GET','PUT','PATCH']) assert.equal((await request('/api/mailboxes/'+id,method,cookieB,raw)).status,404);
      assert.equal((await request('/api/mailboxes/'+randomUUID(),'GET',cookieA)).status,404);
      for(const cookie of [undefined,'n7_session=forged']) assert.equal((await request('/api/mailboxes','POST',cookie,raw)).status,401);
      const before=(await pool.query('SELECT * FROM mailbox WHERE id=$1',[id])).rows;
      assert.equal((await request('/api/mailboxes/'+id,'PUT',cookieA,raw,'http://wrong.example')).status,403);
      assert.deepEqual((await pool.query('SELECT * FROM mailbox WHERE id=$1',[id])).rows,before);
      assert.equal((await request('/api/mailboxes/'+id,'PUT',cookieA,{...raw,label:'Updated'})).status,200);assert.equal(transports,0);
    });
    await t.test('AC2/3 tampered/substituted ciphertext0transport, scrubbed error, verified_test only and DNS revalidation',async()=>{
      const original=(await pool.query('SELECT credential_envelope FROM mailbox WHERE id=$1',[id])).rows[0].credential_envelope as Envelope;
      const foreign=(await pool.query('SELECT credential_envelope FROM mailbox WHERE id=$1',[other])).rows[0].credential_envelope;
      for(const value of [foreign,{...original,version:'missing'},{...original,tag:Buffer.alloc(16).toString('base64')}]) {
        await pool.query('UPDATE mailbox SET credential_envelope=$2 WHERE id=$1',[id,value]);const before=transports;
        const response=await request(`/api/mailboxes/${id}/verify-test`,'POST',cookieA);assert.equal(response.status,503);assert.equal(transports,before);assert.ok(!JSON.stringify(response).includes(canary));
      }
      await pool.query('UPDATE mailbox SET credential_envelope=$2 WHERE id=$1',[id,original]);
      providerFailure=true;const failed=await request(`/api/mailboxes/${id}/verify-test`,'POST',cookieA);assert.equal(failed.status,503);assert.equal(failed.data.error.code,'provider_failed');assert.ok(!JSON.stringify(failed).includes(canary));providerFailure=false;
      unsafeDns=true;const before=transports;assert.equal((await request(`/api/mailboxes/${id}/verify-test`,'POST',cookieA)).status,400);assert.equal(transports,before);unsafeDns=false;
      const verified=await request(`/api/mailboxes/${id}/verify-test`,'POST',cookieA);assert.equal(verified.status,200);assert.equal(verified.data.data.state,'verified_test');assert.equal(verified.data.meta.verificationMode,'local_test');
    });
    await t.test('AC4 distinct affirmative scopes/version/content/recipient snapshots and tenant ownership',async()=>{
      assert.equal(await app.consents.current(identity,id,'pool'),false);
      assert.equal((await request(`/api/mailboxes/${id}/consents`,'POST',cookieA,{scope:'pool',action:'grant',scopeVersion:1})).status,400);
      const granted=await poolGrant();assert.equal(granted.status,200);assert.deepEqual(granted.data.data.disclosure,{...POOL_DISCLOSURE,senderAddress:raw.senderAddress});
      campaign=(await request('/api/campaigns','POST',cookieA,{content:'Hello',recipients:['recipient@example.com']})).data.data;
      assert.equal(await app.consents.current(identity,id,'pool'),true);assert.equal(await app.consents.current(identity,id,'campaign',campaign.id),false);
      assert.equal((await request(`/api/mailboxes/${id}/consents`,'POST',cookieB,{scope:'campaign',action:'grant',affirmative:true,campaignId:campaign.id,scopeVersion:1})).status,404);
      assert.equal((await request(`/api/mailboxes/${other}/consents`,'POST',cookieB,{scope:'campaign',action:'grant',affirmative:true,campaignId:campaign.id,scopeVersion:1})).status,404);
      assert.equal((await request(`/api/mailboxes/${id}/consents`,'POST',cookieA,{scope:'campaign',action:'grant',affirmative:true,campaignId:randomUUID(),scopeVersion:1})).status,404);
      assert.equal((await campaignGrant()).status,200);assert.equal(await app.consents.current(identity,id,'campaign',campaign.id),true);
      const active=(await pool.query("SELECT * FROM consent WHERE mailbox_id=$1 AND revoked_at IS NULL",[id])).rows;
      assert.ok(active.every(c=>c.actor_id===identity.account_id && c.granted_at instanceof Date));
      campaign=(await request('/api/campaigns/'+campaign.id,'PUT',cookieA,{content:'Changed content',recipients:['recipient@example.com']})).data.data;
      assert.equal(await app.consents.current(identity,id,'campaign',campaign.id),false);assert.equal(await app.consents.current(identity,id,'pool'),true);
      await campaignGrant();const queued=await job('queued','campaign',campaign.id);const submitting=await job('submitting','campaign',campaign.id);
      campaign=(await request('/api/campaigns/'+campaign.id,'PUT',cookieA,{content:'Changed content',recipients:['recipient@example.com','new@example.com']})).data.data;
      assert.equal(await app.consents.current(identity,id,'campaign',campaign.id),false);assert.equal(await app.consents.current(identity,id,'pool'),true);
      assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[queued])).rows[0].state,'cancelled');assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[submitting])).rows[0].state,'submitting');
    });
    await t.test('AC5 revoke queue/member atomicity, submitting preserved and real rollback',async()=>{
      await campaignGrant();await poolGrant();const queued=await job('queued');const claimed=await job('claimed');const submitting=await job('submitting');const campaignQueued=await job('queued','campaign',campaign.id);
      await pool.query("CREATE FUNCTION n7_f02_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rollback fixture'; END $$");
      await pool.query('CREATE TRIGGER n7_f02_stop BEFORE UPDATE ON send_job FOR EACH ROW EXECUTE FUNCTION n7_f02_fail()');
      const failed=await request(`/api/mailboxes/${id}/consents`,'POST',cookieA,{scope:'pool',action:'revoke'});assert.equal(failed.status,503);
      assert.equal(await app.consents.current(identity,id,'pool'),true);assert.equal((await pool.query('SELECT count(*) FROM pool_member WHERE mailbox_id=$1',[id])).rows[0].count,'1');assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[queued])).rows[0].state,'queued');
      await pool.query('DROP TRIGGER n7_f02_stop ON send_job');await pool.query('DROP FUNCTION n7_f02_fail()');
      assert.equal((await request(`/api/mailboxes/${id}/consents`,'POST',cookieA,{scope:'pool',action:'revoke'})).status,200);
      assert.equal(await app.consents.current(identity,id,'pool'),false);assert.equal(await app.consents.current(identity,id,'campaign',campaign.id),true);
      assert.equal((await pool.query('SELECT count(*) FROM pool_member WHERE mailbox_id=$1',[id])).rows[0].count,'0');
      for(const jid of [queued,claimed]) assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[jid])).rows[0].state,'cancelled');
      assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[submitting])).rows[0].state,'submitting');assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[campaignQueued])).rows[0].state,'queued');
      await request(`/api/mailboxes/${id}/consents`,'POST',cookieA,{scope:'campaign',action:'revoke',campaignId:campaign.id});assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[campaignQueued])).rows[0].state,'cancelled');
    });
    await t.test('AC5 all real writers wait on shared advisory lock first; default/ceiling/provider cap',async()=>{
      const writes=[()=>app.mailboxes.change(identity.tenant_id,id,{dailyLimit:30}),()=>app.consents.act(identity,id,{scope:'pool',action:'grant',affirmative:true,scopeVersion:1}),()=>app.consents.act(identity,id,{scope:'pool',action:'revoke'}),()=>app.consents.campaign(identity,{content:'Lock change',recipients:['recipient@example.com']},campaign.id),()=>app.mailboxes.save(identity.tenant_id,raw,id),()=>app.mailboxes.verify(identity.tenant_id,id),()=>app.mailboxes.change(identity.tenant_id,id,{state:'paused'})];
      for(const write of writes) {
        const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(7,1)');let finished=false;
        const pending=write().finally(()=>{finished=true;});await new Promise(resolve=>setTimeout(resolve,50));assert.equal(finished,false);
        const waits=await pool.query("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=7 AND objid=1 AND NOT granted");assert.ok(Number(waits.rows[0].count)>=1);
        await blocker.query('ROLLBACK');blocker.release();await pending;
      }
      assert.equal((await request('/api/mailboxes/'+id,'PATCH',cookieA,{dailyLimit:31})).status,400);
      const narrow=new Map([['smtp.gmail.com',7],['imap.gmail.com',8]]);const previous=config.providerAllowlist;
      const {MailboxStore}=await import('../src/mailboxes/store.js');const store=new MailboxStore(pool,config.credentialKeyring,narrow,async()=>[{address:'8.8.8.8',family:4}]);
      const capped=await store.save(identity.tenant_id,{...raw,dailyLimit:30},id);assert.equal(capped.effective_limit,7);assert.equal(capped.daily_limit,30);assert.equal(previous.get('smtp.gmail.com'),30);
      const before=(await pool.query('SELECT * FROM mailbox WHERE id=$1',[id])).rows;
      await assert.rejects(eligibilityTransaction(pool,async client=>{await client.query('UPDATE mailbox SET daily_limit=1 WHERE id=$1',[id]);throw new Error('rollback');}));assert.deepEqual((await pool.query('SELECT * FROM mailbox WHERE id=$1',[id])).rows,before);
      await request('/api/auth/logout','POST',cookieA);assert.equal((await request('/api/mailboxes','POST',cookieA,raw)).status,401);
    });
  } finally {await new Promise<void>(resolve=>app.server.close(()=>resolve()));await pool.end();}
});
