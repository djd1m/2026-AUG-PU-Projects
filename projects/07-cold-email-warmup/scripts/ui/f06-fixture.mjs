// Trusted operator-only fixture: imports accepted image modules and touches own TEST DB.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig } from '/app/dist/src/config.js';
import { createPool } from '/app/dist/src/db.js';
import { seedFixture } from '/app/dist/src/replies/fixture.js';
import { PollWorker } from '/app/dist/src/replies/worker.js';
import { DispatchStore } from '/app/dist/src/dispatch/store.js';
import { SubmissionStore } from '/app/dist/src/dispatch/submission.js';
import { SuppressionStore } from '/app/dist/src/suppression/store.js';
import { BillingService } from '/app/dist/src/billing/service.js';
import { LocalProvider } from '/app/dist/src/billing/provider.js';
const input=JSON.parse(readFileSync(0,'utf8')), config=loadConfig(), pool=createPool(config.databaseUrl);
assert.equal(config.origin,'http://127.0.0.1:18709');
assert.equal(config.dispatchMode,'local_test');
const poll=new PollWorker(pool,config.credentialKeyring,'local_test');
let result;
try {
 const {tenant,mailbox,campaign}=input;
 if(tenant) assert((await pool.query('SELECT 1 FROM account WHERE tenant_id=$1 AND email LIKE $2',[tenant,'n7-f06b-%@example.test'])).rowCount===1,'owned fixture tenant');
 if(mailbox) assert((await pool.query('SELECT 1 FROM mailbox WHERE tenant_id=$1 AND id=$2',[tenant,mailbox])).rowCount===1);
 if(input.action==='poll') {
  await seedFixture(pool,tenant,mailbox,{uidvalidity:'1',uidNext:1,headers:[]});
  result=await poll.poll(tenant,mailbox);assert.equal(result.state,'complete');
 } else if(input.action==='send') {
  const dispatch=new DispatchStore(pool), submit=new SubmissionStore(pool,config); const messages=[];
  for(let i=0;i<3;i++) {const job=await dispatch.claim();assert(job && job.tenant_id===tenant && job.campaign_id===campaign,'own TEST claim');const sent=await submit.submit(job.id,job.lease_owner);assert.equal(sent.state,'submitted');}
  for(const m of await submit.messages(tenant)) {assert(m.body.includes('N7 LOCAL TEST'));assert(m.body.includes('/unsubscribe/'));assert.equal(m.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');messages.push(m);}
  result={messages};
 } else if(input.action==='reply') {
  const m=(await pool.query('SELECT * FROM local_test_message WHERE tenant_id=$1 AND recipient=$2',[tenant,input.recipient])).rows[0];assert(m);
  await seedFixture(pool,tenant,mailbox,{uidvalidity:'1',uidNext:2,headers:[{uid:1,from:m.recipient,inReplyTo:m.message_id,messageId:'<f06b-reply@example.test>'}]});
  const polled=await poll.poll(tenant,mailbox);assert.equal(polled.state,'complete');
  result={poll:polled,enrollments:(await pool.query('SELECT e.state,e.stop_reason FROM enrollment e WHERE e.tenant_id=$1 AND e.campaign_id=$2',[tenant,campaign])).rows};
  assert(result.enrollments.some(e=>e.state==='stopped'));
 } else if(input.action==='complaint') {
  result=await new SuppressionStore(pool,config.recipientHashKey).complaint({eventId:`f06b-${mailbox}`,tenantId:tenant,mailboxId:mailbox,recipientAddress:input.recipient});
  result.mailbox=(await pool.query('SELECT state FROM mailbox WHERE tenant_id=$1 AND id=$2',[tenant,mailbox])).rows[0];assert.equal(result.mailbox.state,'quarantined');
 } else if(input.action==='payment') {
  const row=(await pool.query('SELECT payment_id FROM billing_intent WHERE tenant_id=$1 AND id=$2',[tenant,input.intent])).rows[0];assert(row);
  await new LocalProvider(pool,'local_test').simulate(row.payment_id,{status:'succeeded'});
  result=await new BillingService(pool,config.sessionKey,'local_test').reconcile(input.intent);
  assert.equal(result.state,'succeeded');
 } else if(input.action==='expire') {
  result={expired:(await pool.query("UPDATE session SET expires_at=clock_timestamp()-interval '1 second' WHERE account_id IN(SELECT id FROM account WHERE tenant_id=$1)",[tenant])).rowCount};
 } else if(input.action==='effects') {
  result={jobs:(await pool.query('SELECT state,count(*)::int FROM send_job WHERE tenant_id=$1 GROUP BY state',[tenant])).rows,consents:(await pool.query('SELECT scope,revoked_at FROM consent WHERE tenant_id=$1',[tenant])).rows,grants:(await pool.query('SELECT count(*)::int AS count FROM billing_entitlement WHERE tenant_id=$1',[tenant])).rows[0].count};
 } else throw new Error('unknown_action');
 console.log(JSON.stringify({ok:true,result}));
} catch(error) {console.log(JSON.stringify({ok:false,kind:error.name,code:error.code??null}));process.exitCode=1;}
finally {await pool.end();}
