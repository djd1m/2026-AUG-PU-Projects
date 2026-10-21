import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { MailboxStore } from '../src/mailboxes/store.js';
import { FixtureAdapter,type ReplyAdapter } from '../src/replies/adapter.js';
import { seedFixture,claimPoll,observePoll } from '../src/replies/fixture.js';
import { PollWorker } from '../src/replies/worker.js';
import { eligibilityTransaction } from '../src/consent/transaction.js';
function barrier() {
 let entered!:()=>void,release!:()=>void;
 const reached=new Promise<void>(r=>{entered=r;}),resume=new Promise<void>(r=>{release=r;});
 return {reached,release,wait:async()=>{entered();await resume;}};
}
test('B-R1 real fixture callbacks fenced by durable owner and source generation',{timeout:60000},async t=>{
 const config=loadConfig(),pool=createPool(config.databaseUrl);await migrate(pool);
 const mailboxes=new MailboxStore(pool,config.credentialKeyring,new Map([['smtp.gmail.com',30],['imap.gmail.com',30]]),async()=>[{address:'8.8.8.8',family:4}]);
 let tenant='',mailbox='';
 const worker=(adapter?:ReplyAdapter)=>new PollWorker(pool,config.credentialKeyring,'local_test',adapter);
 async function setup() {
  await pool.query('TRUNCATE tenant CASCADE');tenant=randomUUID();await pool.query('INSERT INTO tenant(id) VALUES($1)',[tenant]);
  mailbox=(await mailboxes.save(tenant,{label:'fixture',senderAddress:'sender@example.test',smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:'fixture',smtpPassword:'fixture',imapUsername:'fixture',imapPassword:'fixture'})).id;
 }
 const seed=(v='1',failed=false)=>seedFixture(pool,tenant,mailbox,{uidvalidity:v,uidNext:4,headers:[{uid:3,from:'unrelated@example.test'}],failed});
 const durable=async()=> (await pool.query(`SELECT jsonb_build_object('run',(SELECT row_to_json(r) FROM reply_rescan r WHERE mailbox_id=$1),
  'poll',(SELECT row_to_json(p) FROM mailbox_poll p WHERE mailbox_id=$1),'observations',(SELECT jsonb_agg(o ORDER BY uidvalidity,uid) FROM reply_observation o),
  'messages',(SELECT jsonb_agg(m) FROM reply_message m),'effects',(SELECT jsonb_agg(e) FROM reply_effect e),'jobs',(SELECT jsonb_agg(j ORDER BY id) FROM send_job j)) AS state`,[mailbox])).rows[0].state;
 try {
  for(const kind of ['first-success','first-failure','changed-tail-success','same-validity-success','same-validity-failure','same-validity-owner-only'] as const) {
   await t.test(kind,async()=>{
    await setup();await seed('1',kind.includes('failure'));const gate=barrier(),real=new FixtureAdapter(pool);let snapshots=0;
    if(kind==='changed-tail-success') await seedFixture(pool,tenant,mailbox,{uidvalidity:'1',uidNext:1,headers:[]});
    const adapter:ReplyAdapter={mode:'local_test',read:(...args)=>real.read(...args),async snapshot(a,b) {
     snapshots++;const delay=kind==='changed-tail-success'?snapshots===2:snapshots===1;
     if(kind==='changed-tail-success' && delay) await seed('2');
     let result;let failure:unknown;
     try {result=await real.snapshot(a,b);} catch(error) {failure=error;}
     if(delay) await gate.wait();
     if(failure) throw failure;return result!;
    }};
    const old=worker(adapter).poll(tenant,mailbox);await gate.reached;
    if(kind!=='same-validity-owner-only') await seed(kind.startsWith('same-validity')?'1':'3');
    assert.equal((await worker().poll(tenant,mailbox)).state,'complete');
    const before=await durable();assert.equal(before.run.state,'complete');assert.equal(before.poll.scan_complete,true);
    gate.release();await old;assert.deepEqual(await durable(),before,'obsolete callback changed newer complete run/poll/timestamps/effects');
   });
  }
  for(const failed of [false,true]) await t.test('generation alone fences '+(failed?'failure':'capture'),async()=>{
   await setup();await seed('1',failed);const gate=barrier(),real=new FixtureAdapter(pool);
   const adapter:ReplyAdapter={mode:'local_test',read:(...args)=>real.read(...args),async snapshot(a,b) {
    let result;let failure:unknown;try {result=await real.snapshot(a,b);} catch(e) {failure=e;}await gate.wait();if(failure) throw failure;return result!;
   }};
   const pending=worker(adapter).poll(tenant,mailbox);await gate.reached;await seed('1');const before=await durable();gate.release();await pending;assert.deepEqual(await durable(),before);
   assert.equal((await worker().poll(tenant,mailbox)).state,'complete');
  });
  await t.test('current missing and failed fixture pause; current poll completes',async()=>{
   await setup();await seed();assert.equal((await worker().poll(tenant,mailbox)).state,'complete');
   await pool.query('DELETE FROM local_reply_fixture WHERE mailbox_id=$1',[mailbox]);assert.equal((await worker().poll(tenant,mailbox)).state,'paused');assert.equal((await durable()).poll.scan_complete,false);
   await seed('2',true);assert.equal((await worker().poll(tenant,mailbox)).state,'paused');assert.equal((await durable()).poll.scan_complete,false);
   await seed('2');assert.equal((await worker().poll(tenant,mailbox)).state,'complete');
  });
  await t.test('generation check and seed serialize on the shared lock',async()=>{
   await setup();await seed();const owner=await claimPoll(pool,tenant,mailbox),guard=await observePoll(pool,tenant,mailbox,owner),gate=barrier();
   const held=eligibilityTransaction(pool,async c=>{await guard(c);await gate.wait();});await gate.reached;
   const updating=seed();let completed=false;void updating.then(()=>{completed=true;});
   for(let i=0;i<100;i++) {if(Number((await pool.query("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=7 AND objid=1 AND NOT granted")).rows[0].count)>0) break;await new Promise(r=>setTimeout(r,5));}
   assert.equal(completed,false);assert.ok(Number((await pool.query("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=7 AND objid=1 AND NOT granted")).rows[0].count)>0);
   gate.release();await held;await updating;await assert.rejects(eligibilityTransaction(pool,c=>guard(c)),/stale_poll_owner/);
  });
 } finally {await pool.end();}
});
