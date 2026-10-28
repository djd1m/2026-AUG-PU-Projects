import { afterAll,beforeAll,describe,it,expect } from 'vitest';
import { randomBytes,randomUUID } from 'node:crypto';
import { createPool,transaction,setOwnerUnlimited,hasOwnerUnlimited,checkAndConsumeQuota,refundUploadSlot,
  reserveVideoCreditsTx,finalizeVideoCreditsTx,lockCreditAccountForVideo,effectivePlanSql,readAccountBilling,type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { loadLimits } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { moscowDay } from '../packages/shared/src/upload';
const url=process.env.DATABASE_URL, now=new Date('2030-01-01T00:00:00Z'), limits=loadLimits(environment());
describe.skipIf(!url)('private owner entitlement on PostgreSQL',()=>{
  let pool:Pool; const schema=`owner_${randomBytes(8).toString('hex')}`;
  beforeAll(async()=>{if(!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Only *_test database');
    pool=createPool(url,schema);await pool.query(`CREATE SCHEMA ${schema}`);await migrate(pool);});
  afterAll(async()=>{if(pool){await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();}});
  async function account(){return (await pool.query<{id:string}>(`INSERT INTO account(email,password_hash,plan,billing_policy)
    VALUES($1,'x','free','credits_v1') RETURNING id`,[`${randomUUID()}@test.invalid`])).rows[0]!.id;}
  const set=(accountId:string,enabled:boolean)=>setOwnerUnlimited(pool,{accountId,enabled,operator:'test',reason:'owner test'});
  const quota=(id:string,reason:'upload'|'minutes'|'llm'|'rerender',n=1)=>transaction(pool,tx=>checkAndConsumeQuota(tx,limits,id,reason,n,now));
  async function video(id:string){return(await pool.query<{id:string}>(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,status,object_key,actual_bytes)
    VALUES($1,$2,'upload',1,'queued','original',1) RETURNING id`,[id,randomUUID()])).rows[0]!.id;}
  const reserve=(v:string)=>transaction(pool,async tx=>{await lockCreditAccountForVideo(tx,v);await tx.query('SELECT id FROM video WHERE id=$1 FOR UPDATE',[v]);return reserveVideoCreditsTx(tx,v,120,now);});
  it('default false, UUID-only mutation, active check, audit atomicity, paid projection and revoke preserve stored metadata',async()=>{
    const id=await account();expect(await hasOwnerUnlimited(pool,id)).toBe(false);
    expect(await set('bad',true)).toEqual({kind:'invalid'});await set(id,true);
    expect((await pool.query(`SELECT plan,plan_source,${effectivePlanSql('a')} effective FROM account a WHERE id=$1`,[id])).rows[0])
      .toEqual({plan:'free',plan_source:'none',effective:'paid'});
    const audit=(await pool.query(`SELECT plan_before,plan_after,reason FROM operator_action WHERE account_id=$1`,[id])).rows;
    expect(audit).toEqual([{plan_before:'free',plan_after:'free',reason:'owner_unlimited:false->true; owner test'}]);
    expect((await readAccountBilling(pool,id))?.owner_unlimited).toBe(true);
    await set(id,false);expect(await hasOwnerUnlimited(pool,id)).toBe(false);
    await pool.query("UPDATE account SET status='erasing',owner_unlimited=true WHERE id=$1",[id]);
    expect(await hasOwnerUnlimited(pool,id)).toBe(false);expect(await set(id,true)).toEqual({kind:'not_found'});
  });
  it('audit INSERT failure rolls back entitlement and leaves no audit row',async()=>{
    const id=await account();
    await pool.query(`CREATE FUNCTION reject_owner_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'owner audit unavailable'; END $$`);
    await pool.query(`CREATE TRIGGER reject_owner_audit BEFORE INSERT ON operator_action FOR EACH ROW EXECUTE FUNCTION reject_owner_audit()`);
    try {
      await expect(set(id,true)).rejects.toThrow('owner audit unavailable');
      expect(await hasOwnerUnlimited(pool,id)).toBe(false);
      expect((await pool.query('SELECT id FROM operator_action WHERE account_id=$1',[id])).rows).toHaveLength(0);
    } finally {
      await pool.query('DROP TRIGGER reject_owner_audit ON operator_action');
      await pool.query('DROP FUNCTION reject_owner_audit()');
    }
    expect(await set(id,true)).toMatchObject({kind:'updated',before:false,after:true});
  });
  it('owner records all personal usage above ceilings, never consumes global pool; ordinary still refuses',async()=>{
    const owner=await account(),ordinary=await account();await set(owner,true);
    await pool.query(`DELETE FROM quota_counter WHERE scope_key='all' AND day=$1`,[moscowDay(now)]);
    for(const [reason,n] of [['upload',3],['minutes',1000],['llm',30],['rerender',30]] as const){
      expect(await quota(owner,reason,n)).toEqual({granted:true});expect((await quota(ordinary,reason,n)).granted).toBe(false);
    }
    expect((await pool.query(`SELECT scope,used FROM quota_counter WHERE scope_key=$1 ORDER BY scope`,[owner])).rows)
      .toEqual([{scope:'user_llm',used:30},{scope:'user_minutes',used:1000},{scope:'user_rerenders',used:30},{scope:'user_uploads',used:3}]);
    expect((await pool.query("SELECT * FROM quota_counter WHERE scope_key='all'")).rows).toHaveLength(0);
  });
  it('global last-slot concurrency keeps exactly one ordinary winner while owner bypasses exhausted pool',async()=>{
    await pool.query(`INSERT INTO quota_counter(scope,scope_key,day,used) VALUES('global_llm','all',$1,$2)
      ON CONFLICT(scope,scope_key,day) DO UPDATE SET used=excluded.used`,[moscowDay(now),limits.N5_LIMIT_GLOBAL_LLM-1]);
    const ids=await Promise.all(Array.from({length:8},()=>account()));
    const results=await Promise.all(ids.map(id=>quota(id,'llm')));expect(results.filter(r=>r.granted)).toHaveLength(1);
    const owner=await account();await set(owner,true);expect(await quota(owner,'llm',100)).toEqual({granted:true});
    expect((await pool.query("SELECT used FROM quota_counter WHERE scope='global_llm' AND scope_key='all' AND day=$1",[moscowDay(now)])).rows[0]?.used).toBe(limits.N5_LIMIT_GLOBAL_LLM);
  });
  it('upload grant/revoke transitions retain paired refunds and cannot make counters negative',async()=>{
    const id=await account();await quota(id,'upload');await set(id,true);await quota(id,'upload',3);await set(id,false);
    for(let i=0;i<3;i++) await transaction(pool,tx=>refundUploadSlot(tx,limits,id,moscowDay(now),'too_long',now));
    expect((await pool.query("SELECT used FROM quota_counter WHERE scope='user_uploads' AND scope_key=$1",[id])).rows[0]?.used).toBe(2);
    await set(id,true);await quota(id,'upload');expect((await pool.query("SELECT used FROM quota_counter WHERE scope='user_uploads' AND scope_key=$1",[id])).rows[0]?.used).toBe(3);
  });
  it('zero balance owner new work is exempt, reserved charge survives grant and releases once; released retry exempt',async()=>{
    const id=await account(),fresh=await video(id);expect(await reserve(fresh)).toBe('shortage');await set(id,true);
    expect(await reserve(fresh)).toBe('owner_exempt');expect((await pool.query('SELECT * FROM video_credit_charge WHERE video_id=$1',[fresh])).rows).toHaveLength(0);
    expect((await pool.query('SELECT * FROM credit_grant WHERE account_id=$1',[id])).rows).toHaveLength(0);
    await set(id,false);await pool.query(`INSERT INTO credit_grant(account_id,source,source_key,total_seconds,remaining_seconds,available_at)
      VALUES($1,'signup',$2,120,120,$3)`,[id,randomUUID(),now]);expect(await reserve(fresh)).toBe('reserved');await set(id,true);
    expect(await reserve(fresh)).toBe('reserved');
    for(let i=0;i<2;i++) await transaction(pool,async tx=>{await lockCreditAccountForVideo(tx,fresh);await tx.query("UPDATE video SET status='failed' WHERE id=$1",[fresh]);await finalizeVideoCreditsTx(tx,fresh,now);});
    expect(await reserve(fresh)).toBe('owner_exempt');
    expect((await pool.query('SELECT remaining_seconds,reserved_seconds FROM credit_grant WHERE account_id=$1',[id])).rows).toEqual([{remaining_seconds:120,reserved_seconds:0}]);
    expect((await pool.query('SELECT state,cycle FROM video_credit_charge WHERE video_id=$1',[fresh])).rows).toEqual([{state:'released',cycle:1}]);
  });
  it('concurrent revoke and admission do not deadlock; next committed admission uses ordinary ceiling',async()=>{
    const id=await account();await set(id,true);
    // Either statement snapshot may win; accepted work remains accepted. No account lock after video.
    await Promise.all([set(id,false),quota(id,'upload',10)]);
    expect((await quota(id,'upload',10)).granted).toBe(false);
  });
});
