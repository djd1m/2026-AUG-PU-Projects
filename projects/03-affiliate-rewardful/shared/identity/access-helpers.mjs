import { randomBytes } from 'node:crypto';
import { assert, hash, id, str } from '../domain/common.mjs';
import { transaction } from '../infrastructure/postgres.mjs';
import { persistChanges } from '../infrastructure/journal.mjs';
import { realState } from './state.mjs';
import { originsFor } from '../contracts/deployment.mjs';

export const secret = () => randomBytes(32).toString('base64url');
export const accessOrigins = new Set(['A','B','C','D'].flatMap(originsFor).filter(x=>x.startsWith('https:')));
export function originInput(origin) { assert(accessOrigins.has(origin),'ORIGIN_DENIED',403,'Адрес приложения не разрешён'); return origin; }
export function tokenHash(value) { assert(typeof value==='string' && /^[A-Za-z0-9_-]{43}$/.test(value),'TOKEN_INVALID',400,'Ссылка недействительна или устарела'); return hash(value); }
export function live(row,now) { assert(row && !row.used_at && new Date(row.expires_at).getTime()>now(),'TOKEN_INVALID',400,'Ссылка недействительна или устарела'); }
export const emailLock = (client,email) => client.query('SELECT pg_advisory_xact_lock(330806,hashtext($1))',[email]);

// All three quota scopes are committed under ONE short admission lock. A pair
// lock alone cannot serialize different emails sharing the aggregate peer cap.
export function createAccessAdmission(pool,now) {
  return async (email,peer,scope='mail') => {
    str(peer,200);
    const admitted=await transaction(pool,async client=>{
      if (!(await client.query('SELECT pg_try_advisory_xact_lock(330809) AS ok')).rows[0].ok) return false;
      const at=new Date(now()), until=new Date(now()+3600000);
      await client.query('DELETE FROM access_limits WHERE expires_at<=$1',[at]);
      const keys=[[hash(`${scope}:email:${email}`),5,60000],[hash(`${scope}:peer:${peer}`),30,0],[hash(`${scope}:pair:${peer}:${email}`),5,0]];
      const rows=(await client.query('SELECT * FROM access_limits WHERE key=ANY($1)',[keys.map(x=>x[0])])).rows;
      const count=(await client.query('SELECT count(*)::int AS n FROM access_limits')).rows[0].n;
      if(count+keys.filter(([key])=>!rows.some(r=>r.key===key)).length>10000)return false;
      const ok=keys.every(([key,max])=>{const row=rows.find(r=>r.key===key);return !row || (row.count<max && new Date(row.next_at)<=at);});
      for(const [key,,cooldown] of keys) await client.query(`INSERT INTO access_limits(key,count,expires_at,next_at) VALUES($1,1,$2,$3)
        ON CONFLICT(key) DO UPDATE SET count=LEAST(access_limits.count+1,1000000),
        next_at=CASE WHEN $4 THEN EXCLUDED.next_at ELSE access_limits.next_at END`,[key,until,new Date(now()+cooldown),ok]);
      return ok;
    });
    assert(admitted,'ACCESS_RATE_LIMIT',429,'Слишком много запросов. Повторите позже.');
  };
}

export async function lockAccount(client,accountId) {
  const row=(await client.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE',[accountId])).rows[0];
  assert(row,'UNAUTHENTICATED',401,'Войдите снова');return row;
}
export async function sessionAccount(pool,identity,plain) {
  return transaction(pool,async client=>{
    const session=await identity.session(client,plain);
    const account=(await client.query('SELECT * FROM accounts WHERE id=$1',[session.id])).rows[0];
    identity.fresh(session.expires_at);return {...account,expires_at:session.expires_at};
  });
}
export async function currentSession(client,identity,plain,expected) {
  const account=await lockAccount(client,expected.id);
  const session=await identity.session(client,plain);
  assert(session.id===expected.id && account.version===expected.version,'UNAUTHENTICATED',401,'Войдите снова');
  identity.fresh(session.expires_at);return {...account,expires_at:session.expires_at};
}
export async function revoke(client,accountId,at) {
  await client.query('UPDATE user_sessions SET revoked_at=$2 WHERE account_id=$1 AND revoked_at IS NULL',[accountId,at]);
  await client.query(`UPDATE agent_credentials SET revoked_at=$2 WHERE membership_id IN
    (SELECT id FROM memberships WHERE account_id=$1) AND revoked_at IS NULL`,[accountId,at]);
  await client.query('UPDATE referral_credentials SET revoked_at=$2 WHERE account_id=$1 AND revoked_at IS NULL',[accountId,at]);
}
export async function createAccount(client,{email,passwordHash=null,name,verified=false},now) {
  const account={id:id(),version:1},tenantId=id(),membershipId=id();
  const row=await client.query(`INSERT INTO accounts(id,email,password_hash,email_verified_at) VALUES($1,$2,$3,$4)
    ON CONFLICT(email) DO NOTHING RETURNING id`,[account.id,email,passwordHash,verified?new Date(now()):null]);
  assert(row.rowCount,'ACCOUNT_COLLISION',409,'Адрес уже используется. Войдите существующим способом.');
  const state=realState(tenantId,name,now());
  await client.query("INSERT INTO tenants(id,state,mode) VALUES($1,$2,'real')",[tenantId,JSON.stringify(state)]);
  await persistChanges(client,tenantId,{},state);
  await client.query('INSERT INTO memberships(id,account_id,tenant_id,actor_id) VALUES($1,$2,$3,$4)',[membershipId,account.id,tenantId,state.actors[0].id]);
  return {...account,membershipId};
}
