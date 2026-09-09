import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { enqueueN3, claimN3Jobs, acknowledgeN3, runN3Batch } from '../src/n3-outbox.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('isolated TEST_DATABASE_URL required');
const pool = new pg.Pool({ connectionString:process.env.TEST_DATABASE_URL });
const accounts: string[] = [];
async function seed() {
  const accountId = randomUUID(); accounts.push(accountId);
  await pool.query('insert into accounts(id,email) values($1,$2)',[accountId,`${accountId}@example.test`]);
  return accountId;
}
async function transaction<T>(fn: (c:pg.PoolClient)=>Promise<T>) {
  const c=await pool.connect();
  try { await c.query('begin');await c.query('set local role app_service');const r=await fn(c);await c.query('commit');return r; }
  catch(error) { await c.query('rollback');throw error; } finally { c.release(); }
}
afterAll(async()=> { for(const id of accounts) await pool.query('delete from accounts where id=$1',[id]);await pool.end(); });
describe('N3 durable outbox',()=>{
  it('parallel enqueue is unique and conflicting payload refuses',async()=>{
    const accountId=await seed(), key=randomUUID();
    await Promise.all(Array.from({length:10},()=>transaction(c=>enqueueN3(c,accountId,'payment.succeeded',key,{orderId:key,event:'payment.succeeded',objectId:key}))));
    expect((await pool.query('select * from n3_bridge_outbox where business_key=$1',[key])).rows).toHaveLength(1);
    await expect(transaction(c=>enqueueN3(c,accountId,'payment.succeeded',key,{different:true}))).rejects.toMatchObject({code:'N3_EVENT_CONFLICT'});
  });
  it('leases fence stale acknowledgement and retry after lost acknowledgement is idempotent',async()=>{
    const accountId=await seed(),key=randomUUID();
    await transaction(c=>enqueueN3(c,accountId,'payment.succeeded',key,{orderId:key,event:'payment.succeeded',objectId:key}));
    const claimed=(await claimN3Jobs(pool)).find(j=>j.account_id===accountId)!;
    expect(claimed).toBeTruthy();
    await pool.query("update n3_bridge_outbox set lease_until=now()-interval '1 second' where id=$1",[claimed.id]);
    const reissued=(await claimN3Jobs(pool)).find(j=>j.id===claimed.id)!;
    expect(reissued.lease_token).not.toBe(claimed.lease_token);
    expect(await acknowledgeN3(pool,claimed)).toBe(false);
    expect(await acknowledgeN3(pool,reissued)).toBe(true);
  });
  it('network failure remains pending and successful signup acknowledgement marks binding',async()=>{
    const accountId=await seed(),email=`${accountId}@example.test`,proofId=randomUUID();
    await pool.query('insert into n3_email_proofs(account_id,id,email) values($1,$2,$3)',[accountId,proofId,email]);
    await transaction(c=>enqueueN3(c,accountId,'signup',`${accountId}:${proofId}`,{customerId:accountId,email,emailVerified:true}));
    await runN3Batch(pool,async()=>{throw new Error('offline');});
    let job=(await pool.query('select * from n3_bridge_outbox where account_id=$1',[accountId])).rows[0];
    expect(job.delivered_at).toBeNull();expect(job.last_error).toBe('N3_DELIVERY_FAILED');
    expect(job.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
    await pool.query('update n3_bridge_outbox set next_attempt_at=now() where account_id=$1',[accountId]);
    await runN3Batch(pool,async(_route,payload)=>({customerId:(payload as {customerId:string}).customerId,bindingId:randomUUID()}));
    job=(await pool.query('select * from n3_bridge_outbox where account_id=$1',[accountId])).rows[0];expect(job.delivered_at).not.toBeNull();
    expect((await pool.query('select bound_at from n3_email_proofs where account_id=$1',[accountId])).rows[0].bound_at).not.toBeNull();
  });
  it('capacity admission serializes concurrent producers and existing retry works at limit',async()=>{
    const accountId=await seed();
    const count=(await pool.query('select count(*)::int as n from n3_bridge_outbox where delivered_at is null')).rows[0].n;
    await pool.query(`insert into n3_bridge_outbox(account_id,kind,business_key,payload)
      select $1,'payment.succeeded',gen_random_uuid()::text,'{}'::jsonb from generate_series(1,$2::int)`,[accountId,9999-count]);
    const keys=[randomUUID(),randomUUID()];
    const results=await Promise.allSettled(keys.map(key=>transaction(c=>enqueueN3(c,accountId,'payment.succeeded',key,{key}))));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const winner=keys[results.findIndex(r=>r.status==='fulfilled')]!;
    expect((await pool.query('select count(*)::int as n from n3_bridge_outbox where delivered_at is null')).rows[0].n).toBe(10000);
    await expect(transaction(c=>enqueueN3(c,accountId,'payment.succeeded',winner,{key:winner}))).resolves.toBeUndefined();
    await pool.query('delete from accounts where id=$1',[accountId]);
  });
  it('old signup cannot bind a newer same-email proof and acknowledgement uses persisted job fields',async()=>{
    const accountId=await seed(),email=`${accountId}@example.test`,oldId=randomUUID(),newId=randomUUID();
    await pool.query('insert into n3_email_proofs(account_id,id,email) values($1,$2,$3)',[accountId,oldId,email]);
    await transaction(c=>enqueueN3(c,accountId,'signup',`${accountId}:${oldId}`,{customerId:accountId,email,emailVerified:true}));
    const old=(await claimN3Jobs(pool)).find(j=>j.account_id===accountId)!;
    await pool.query('update n3_email_proofs set id=$2 where account_id=$1',[accountId,newId]);
    expect(await acknowledgeN3(pool,old)).toBe(true);
    expect((await pool.query('select bound_at from n3_email_proofs where account_id=$1',[accountId])).rows[0].bound_at).toBeNull();
    await transaction(c=>enqueueN3(c,accountId,'signup',`${accountId}:${newId}`,{customerId:accountId,email,emailVerified:true}));
    const current=(await claimN3Jobs(pool)).find(j=>j.account_id===accountId)!;
    expect(await acknowledgeN3(pool,{...current,account_id:randomUUID(),kind:'payment.succeeded',payload:{email:'forged@example.test'}})).toBe(true);
    expect((await pool.query('select bound_at from n3_email_proofs where account_id=$1',[accountId])).rows[0].bound_at).not.toBeNull();
  });
});
