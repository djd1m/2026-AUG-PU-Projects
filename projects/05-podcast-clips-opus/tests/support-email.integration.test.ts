import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import bcrypt from 'bcrypt';
import {createPool,SupportEmailStore,SupportAdminStore,setSupportOperator,StaffNotFound,type Pool} from '../packages/db/src/index';
import {migrate} from '../packages/db/src/migrate';
import {ensureTestDatabase} from '../scripts/test-db.mjs';
import {AuthService} from '../apps/web/src/server/auth';
import {PgAuthStore} from '../apps/web/src/server/auth-store';
import {widgetSession} from '../apps/web/src/server/support/widget';
import {supportContext} from '../apps/web/src/server/support/context';
import {ErasureService} from '../apps/web/src/server/erasure';
import {eraseAccount} from '../apps/web/src/server/retention';
const databaseUrl=process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)('support PostgreSQL authority',()=>{
 let pool:Pool,auth:AuthService,store:SupportEmailStore;
 const schema=`support_${randomBytes(8).toString('hex')}_test`;
 beforeAll(async()=>{
  if(!databaseUrl||!new URL(databaseUrl).pathname.endsWith('_test'))throw new Error('test database required');
  await ensureTestDatabase(databaseUrl);pool=createPool(databaseUrl,schema);await pool.query(`CREATE SCHEMA ${schema}`);await migrate(pool);
  auth=new AuthService(new PgAuthStore(pool,'credits_v1'),randomBytes(32).toString('hex'));store=new SupportEmailStore(pool);
 });
 afterAll(async()=>{if(pool){await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();}});
 async function account(){const email=`${randomUUID()}@example.test`;const token=await auth.register(email,'password123','192.0.2.0/24');
  const id=(await auth.authenticate(token))!.account_id;return {email,token,id,authority:{accountId:id,sessionHash:auth.tokenHash(token)}};}
 it('24h proof permits same-account other device, is one-use and preserves signup credits',async()=>{
  const a=await account(),other=await auth.login(a.email,'password123','192.0.2.0/24');
  const issued=await store.issue('verify',a.email,randomUUID(),randomUUID(),a.authority);expect(issued).not.toBeNull();
  const ttl=(await pool.query('SELECT extract(epoch from (expires_at-created_at)) AS ttl FROM support_email_token WHERE id=$1',[issued!.id])).rows[0].ttl;
  expect(Number(ttl)).toBeGreaterThan(86399);expect(Number(ttl)).toBeLessThan(86401);
  expect(await store.confirm(issued!.token,{accountId:a.id,sessionHash:auth.tokenHash(other!)})).toBe(true);
  expect(await store.confirm(issued!.token,a.authority)).toBe(false);
  expect((await pool.query('SELECT total_seconds FROM credit_grant WHERE account_id=$1',[a.id])).rows).toEqual([{total_seconds:1800}]);
 });
 it('issuer logout and foreign account invalidate proof',async()=>{
  const a=await account(),b=await account();const t=await store.issue('verify',a.email,randomUUID(),randomUUID(),a.authority);
  expect(await store.confirm(t!.token,b.authority)).toBe(false);await auth.logout(a.token);
  expect(await store.confirm(t!.token,a.authority)).toBe(false);
 });
 for(let run=1;run<=5;run++)it(`concurrent one-use reset, revocation and no credit regrant run ${run}`,async()=>{
  const a=await account(),t=await store.issue('reset',a.email,randomUUID(),randomUUID());
  const proof=await store.issue('verify',a.email,randomUUID(),randomUUID(),a.authority);
  const hash=await bcrypt.hash('newpassword123',10);
  expect((await Promise.all(Array.from({length:6},()=>store.reset(t!.token,hash)))).filter(Boolean)).toHaveLength(1);
  expect(await auth.authenticate(a.token)).toBeNull();expect(await store.confirm(proof!.token,a.authority)).toBe(false);
  expect(await auth.login(a.email,'password123','192.0.2.0/24')).toBeNull();
  expect(await auth.login(a.email,'newpassword123','192.0.2.0/24')).not.toBeNull();
  expect((await pool.query('SELECT email_verified_at FROM account WHERE id=$1',[a.id])).rows[0].email_verified_at).toBeNull();
  expect((await pool.query('SELECT count(*) AS n FROM credit_grant WHERE account_id=$1',[a.id])).rows[0].n).toBe('1');
 });
 for(let run=1;run<=5;run++)it(`shared IP admission has literal 30/hour limit run ${run}`,async()=>{
  const ip=randomUUID();await Promise.all(Array.from({length:36},(_,i)=>store.issue('reset',`missing${i}@example.test`,ip,randomUUID())));
  expect((await pool.query('SELECT count(*) AS n FROM support_mail_admission WHERE ip_hash=$1',[ip])).rows[0].n).toBe('30');
 });
 it('same email/pair cooldown is persisted even for missing account',async()=>{
  const ip=randomUUID(),email=randomUUID();await Promise.all(Array.from({length:8},()=>store.issue('reset','missing@example.test',ip,email)));
  expect((await pool.query('SELECT count(*) AS n FROM support_mail_admission WHERE email_hash=$1',[email])).rows[0].n).toBe('1');
 });
 it('fresh staff guard rejects browser-like claims, grants only verified accounts, revokes immediately',async()=>{
  const a=await account(),admin=new SupportAdminStore(pool);
  await expect(admin.list(a.authority.sessionHash)).rejects.toBeInstanceOf(StaffNotFound);
  expect(await setSupportOperator(pool,{accountId:a.id,action:'grant',actor:'test',reason:'fixture grant'})).toBe(false);
  await pool.query('UPDATE account SET email_verified_at=clock_timestamp() WHERE id=$1',[a.id]);
  expect(await setSupportOperator(pool,{accountId:a.id,action:'grant',actor:'test',reason:'fixture grant'})).toBe(true);
  const list=await admin.list(a.authority.sessionHash);expect(list.items.length).toBeLessThanOrEqual(25);
  const card=await admin.card(a.authority.sessionHash,a.id);
  expect(JSON.stringify(card)).not.toMatch(/password_hash|cookie_token_hash|object_key|digest|source_url/);
  expect(card.ledger.length).toBeLessThanOrEqual(20);expect(card.jobs.length).toBeLessThanOrEqual(20);
  await setSupportOperator(pool,{accountId:a.id,action:'revoke',actor:'test',reason:'fixture revoke'});
  await expect(admin.card(a.authority.sessionHash,a.id)).rejects.toBeInstanceOf(StaffNotFound);
 });
 it('proof expiry and issuing session expiry are rechecked after an account-lock wait',async()=>{
  for(const expired of ['token','issuer']) {
   const a=await account(),t=await store.issue('verify',a.email,randomUUID(),randomUUID(),a.authority);
   const lock=await pool.connect();await lock.query('BEGIN');await lock.query('SELECT id FROM account WHERE id=$1 FOR NO KEY UPDATE',[a.id]);
   if(expired==='token')await lock.query("UPDATE support_email_token SET expires_at=clock_timestamp()+interval '100 milliseconds' WHERE id=$1",[t!.id]);
   else await lock.query("UPDATE session SET expires_at=clock_timestamp()+interval '100 milliseconds' WHERE cookie_token_hash=$1",[a.authority.sessionHash]);
   const pending=store.confirm(t!.token,a.authority);await new Promise(resolve=>setTimeout(resolve,180));await lock.query('COMMIT');lock.release();
   expect(await pending).toBe(false);
  }
 });
 it('supersession/current-email binding and password reset preserve existing proof, membership and credits',async()=>{
  const a=await account(),first=await store.issue('verify',a.email,randomUUID(),randomUUID(),a.authority);
  const second=await store.issue('verify',a.email,randomUUID(),randomUUID(),a.authority);
  expect(await store.confirm(first!.token,a.authority)).toBe(false);expect(await store.confirm(second!.token,a.authority)).toBe(true);
  await setSupportOperator(pool,{accountId:a.id,action:'grant',actor:'test',reason:'verified fixture'});
  const reset=await store.issue('reset',a.email,randomUUID(),randomUUID());
  expect(await store.reset(reset!.token,await bcrypt.hash('changedpassword123',10))).toBe(true);
  const row=(await pool.query('SELECT email_verified_at FROM account WHERE id=$1',[a.id])).rows[0];expect(row.email_verified_at).not.toBeNull();
  expect((await pool.query('SELECT revoked_at FROM support_operator WHERE account_id=$1',[a.id])).rows[0].revoked_at).toBeNull();
  expect((await pool.query('SELECT count(*) n FROM credit_grant WHERE account_id=$1',[a.id])).rows[0].n).toBe('1');
  const b=await account(),proof=await store.issue('verify',b.email,randomUUID(),randomUUID(),b.authority),wrongReset=await store.issue('reset',b.email,randomUUID(),randomUUID());
  await pool.query("UPDATE account SET email='changed-'||email WHERE id=$1",[b.id]);
  expect(await store.confirm(proof!.token,b.authority)).toBe(false);expect(await store.reset(wrongReset!.token,'synthetic-hash')).toBe(false);
 });
 it('stale pre-reset credentials cannot create a post-reset session under existing hash recheck',async()=>{
  const a=await account(),authStore=new PgAuthStore(pool),old=await authStore.findAccount(a.email),t=await store.issue('reset',a.email,randomUUID(),randomUUID());
  expect(await store.reset(t!.token,await bcrypt.hash('newpassword123',10))).toBe(true);
  expect(await authStore.createSession(old!,{hash:randomBytes(32).toString('hex'),ipPrefix:'192.0.2.0/24',expiresAt:new Date(Date.now()+3600000)})).toBe(false);
 });
 it('literal email-purpose five/hour ceiling survives elapsed cooldown',async()=>{
  const email=randomUUID();for(let i=0;i<5;i++){
   await store.issue('reset','missing@example.test',randomUUID(),email);
   await pool.query("UPDATE support_mail_admission SET created_at=created_at-interval '61 seconds' WHERE email_hash=$1",[email]);
  }
  await store.issue('reset','missing@example.test',randomUUID(),email);
  expect((await pool.query('SELECT count(*) AS n FROM support_mail_admission WHERE email_hash=$1',[email])).rows[0].n).toBe('5');
 });
 it('widget signs only current verified UUID/email and foreign/missing context are identical',async()=>{
  const a=await account();const config={mode:'test' as const,baseURL:'http://support.test',inboxID:randomUUID(),identifiedEnabled:true,contactEmail:null,synthetic:true,secret:randomBytes(32).toString('hex')};
  expect((await widgetSession(pool,config,a.authority.sessionHash)).mode).toBe('anonymous');
  await pool.query('UPDATE account SET email_verified_at=clock_timestamp() WHERE id=$1',[a.id]);
  const session=await widgetSession(pool,config,a.authority.sessionHash);expect(session.mode).toBe('verified');
  if(session.mode==='verified'){const payload=JSON.parse(Buffer.from(session.jwt.split('.')[1]!,'base64url').toString());expect(payload.external_user_id).toBe(a.id);expect(payload.email).toBe(a.email);expect(payload.user_id).toBeUndefined();expect(payload.exp-payload.iat).toBe(60);}
  const foreign=await account();
  const video=(await pool.query("INSERT INTO video(account_id,idempotency_key,source,declared_bytes,status) VALUES($1,'context','upload',1,'failed') RETURNING id",[foreign.id])).rows[0].id;
  await expect(supportContext(pool,a.authority.sessionHash,randomUUID())).rejects.toMatchObject({status:404,code:'not_found'});
  await expect(supportContext(pool,a.authority.sessionHash,video)).rejects.toMatchObject({status:404,code:'not_found'});
  await auth.logout(a.token);expect((await widgetSession(pool,config,a.authority.sessionHash)).mode).toBe('anonymous');
 });
 it('local erasure revokes proof and sessions immediately, then removes token/email membership rows',async()=>{
  const a=await account();await pool.query('UPDATE account SET email_verified_at=clock_timestamp() WHERE id=$1',[a.id]);
  await setSupportOperator(pool,{accountId:a.id,action:'grant',actor:'test',reason:'erasure fixture'});
  const proof=await store.issue('verify',a.email,randomUUID(),randomUUID(),a.authority);
  await store.issue('reset',a.email,randomUUID(),randomUUID());
  await new ErasureService(pool).request(a.id,{confirm:true});
  expect(await auth.authenticate(a.token)).toBeNull();expect(await store.confirm(proof!.token,a.authority)).toBe(false);
  expect((await pool.query('SELECT email_verified_at FROM account WHERE id=$1',[a.id])).rows[0].email_verified_at).toBeNull();
  expect((await pool.query('SELECT count(*) n FROM support_email_token WHERE account_id=$1 AND used_at IS NULL',[a.id])).rows[0].n).toBe('0');
  await eraseAccount(pool,{delete:async()=>{},eraseClipPrefix:async()=>{},erasePrefix:async()=>{}},a.id,new Date());
  expect((await pool.query('SELECT count(*) n FROM support_email_token WHERE account_id=$1',[a.id])).rows[0].n).toBe('0');
  expect((await pool.query('SELECT count(*) n FROM support_operator WHERE account_id=$1',[a.id])).rows[0].n).toBe('0');
 });
 it('literal10000 storage bounds refuse uniformly and expired pruning removes at most100',async()=>{
  const a=await account();await pool.query('TRUNCATE support_mail_admission,support_email_token');
  await pool.query(`INSERT INTO support_mail_admission(email_hash,ip_hash,purpose) SELECT 'email'||i,'ip'||i,'reset' FROM generate_series(1,10000) i`);
  expect(await store.issue('reset',a.email,randomUUID(),randomUUID())).toBeNull();
  expect((await pool.query('SELECT count(*) n FROM support_mail_admission')).rows[0].n).toBe('10000');
  await pool.query('TRUNCATE support_mail_admission');
  await pool.query(`INSERT INTO support_email_token(account_id,email,purpose,digest,expires_at,used_at)
    SELECT $1,$2,'reset','digest'||i,clock_timestamp()+interval '1 hour',clock_timestamp() FROM generate_series(1,10000) i`,[a.id,a.email]);
  expect(await store.issue('reset',a.email,randomUUID(),randomUUID())).toBeNull();
  await pool.query("UPDATE support_email_token SET used_at=clock_timestamp()-interval '8 days'");
  await store.issue('reset','missing@example.test',randomUUID(),randomUUID());
  expect((await pool.query('SELECT count(*) n FROM support_email_token')).rows[0].n).toBe('9900');
 });
});
