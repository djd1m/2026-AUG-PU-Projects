import { randomBytes } from 'node:crypto';
import { assert, object, safeTree, str, id, hash } from '../domain/common.mjs';
import { transaction } from '../infrastructure/postgres.mjs';
import { persistChanges } from '../infrastructure/journal.mjs';
import { hashPassword, verifyPassword, emailInput, passwordInput } from './password.mjs';
import { realState, advanceRealClock } from './state.mjs';
import { createGrant, validGrant } from '../application/access.mjs';

const token = () => randomBytes(32).toString('base64url');
const ttl = 7 * 86400000;
function credential(value) { assert(typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value), 'UNAUTHENTICATED', 401, 'Войдите в аккаунт'); return hash(value); }
function uuid(value) { assert(typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value)); return value; }
export function createIdentity(pool, now) {
  async function limit(key, maximum = 10) {
    // Durable admission before KDF; no password hashing holds SQL resources.
    await transaction(pool,async client=>{
      const locked=(await client.query('SELECT pg_try_advisory_xact_lock(330805) AS ok')).rows[0].ok;
      assert(locked,'AUTH_BUSY',429,'Повторите попытку позже');
      await client.query('DELETE FROM auth_attempts WHERE until_at <= $1',[new Date(now())]);
      const capacity=(await client.query('SELECT count(*)::int AS n FROM auth_attempts')).rows[0].n;
      const existing=(await client.query('SELECT key FROM auth_attempts WHERE key=$1',[hash(key)])).rowCount;
      assert(existing || capacity<10000,'AUTH_BUSY',429,'Повторите попытку позже');
      const result=await client.query(`INSERT INTO auth_attempts(key,count,until_at) VALUES($1,1,$2)
        ON CONFLICT(key) DO UPDATE SET count=auth_attempts.count+1 RETURNING count`,[hash(key),new Date(now()+900000)]);
      // Admission count must commit even when request exceeds quota.
      return result.rows[0].count;
    }).then(count=>assert(count<=maximum,'AUTH_RATE_LIMIT',429,'Слишком много попыток; повторите через 15 минут'));
  }
  function fresh(expiresAt) { assert(new Date(expiresAt).getTime()>now(),'UNAUTHENTICATED',401,'Сеанс истёк; войдите снова'); }

  async function issue(client, account) {
    const plain = token(), expiresAt = new Date(now() + ttl).toISOString();
    await client.query('INSERT INTO user_sessions(token_hash,account_id,version,expires_at) VALUES($1,$2,$3,$4)',
      [hash(plain), account.id, account.version, expiresAt]);
    return { token: plain, expiresAt };
  }
  async function session(client, plain) {
    const row = (await client.query(`SELECT a.id,a.email,a.version,s.expires_at FROM user_sessions s JOIN accounts a ON a.id=s.account_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > $2 AND s.version=a.version FOR SHARE OF s,a`,
    [credential(plain), new Date(now())])).rows[0];
    assert(row, 'UNAUTHENTICATED', 401, 'Сеанс истёк; войдите снова'); return row;
  }
  async function membership(client, accountId, membershipId) {
    const row = (await client.query(`SELECT m.*,t.mode FROM memberships m JOIN tenants t ON t.id=m.tenant_id
      WHERE m.id=$1 AND m.account_id=$2 FOR SHARE OF m`, [uuid(membershipId), accountId])).rows[0];
    assert(row?.mode === 'real', 'FORBIDDEN', 403, 'Нет доступа к организации'); return row;
  }
  async function resolveUser(client, plain, membershipId) {
    const account = await session(client, plain), member = await membership(client, account.id, membershipId);
    return { ...member, actorId: member.actor_id, actor_ids: [member.actor_id], expires_at: account.expires_at, account_id: account.id };
  }
  async function resolveAgent(client, plain) {
    const row = (await client.query(`SELECT c.*,m.actor_id,m.tenant_id,m.account_id,a.version AS current_version
      FROM agent_credentials c JOIN memberships m ON m.id=c.membership_id JOIN accounts a ON a.id=m.account_id
      JOIN tenants t ON t.id=m.tenant_id WHERE c.token_hash=$1 AND c.revoked_at IS NULL AND c.expires_at>$2
      AND c.version=a.version AND t.mode='real' FOR SHARE OF c,m,a`, [credential(plain), new Date(now())])).rows[0];
    assert(row, 'UNAUTHENTICATED', 401, 'Агентный ключ недействителен');
    return { ...row, actorId: row.actor_id, actor_ids: [row.actor_id], grantId: row.grant_id };
  }
  async function lockedState(client, resolved) {
    const state = (await client.query("SELECT state FROM tenants WHERE id=$1 AND mode='real' FOR UPDATE", [resolved.tenant_id])).rows[0]?.state;
    assert(state, 'FORBIDDEN', 403); advanceRealClock(state,now());
    const actor = state.actors.find(a => a.id === resolved.actor_id); assert(actor, 'FORBIDDEN', 403);
    return { state, actor };
  }
  async function register(input) {
    safeTree(input); object(input, ['email','password','name'], ['email','password','name']);
    const email = emailInput(input.email); str(input.name, 100); passwordInput(input.password);
    await limit(`register:${email}`, 5);
    const passwordHash = await hashPassword(input.password);
    return transaction(pool, async client => {
      const account = { id: id(), version: 1 }, tenantId = id(), memberId = id();
      const inserted = await client.query('INSERT INTO accounts(id,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id',
        [account.id, email, passwordHash]);
      assert(inserted.rowCount, 'REGISTRATION_UNAVAILABLE', 409, 'Не удалось зарегистрироваться; попробуйте вход');
      const state = realState(tenantId, input.name, now());
      await client.query("INSERT INTO tenants(id,state,mode) VALUES($1,$2,'real')", [tenantId, JSON.stringify(state)]);
      await persistChanges(client, tenantId, {}, state);
      await client.query('INSERT INTO memberships(id,account_id,tenant_id,actor_id) VALUES($1,$2,$3,$4)', [memberId, account.id, tenantId, state.actors[0].id]);
      return { ...await issue(client, account), membershipId: memberId };
    });
  }
  async function login(input) {
    safeTree(input); object(input, ['email','password'], ['email','password']);
    const email = emailInput(input.email); passwordInput(input.password); await limit(`login:${email}`);
    const account = (await pool.query('SELECT id,version,password_hash FROM accounts WHERE email=$1', [email])).rows[0];
    const valid = await verifyPassword(account?.password_hash, input.password);
    assert(valid && account, 'LOGIN_FAILED', 401, 'Почта или пароль не подходят');
    return transaction(pool, async client => {
      const current = (await client.query('SELECT id,version FROM accounts WHERE id=$1 AND version=$2 FOR SHARE', [account.id, account.version])).rows[0];
      assert(current, 'LOGIN_FAILED', 401, 'Повторите вход'); return issue(client, current);
    });
  }
  async function me(plain) {
    return transaction(pool, async client => {
      const account = await session(client, plain);
      const rows = (await client.query(`SELECT m.id,m.tenant_id,m.actor_id,t.state->>'name' AS name,
        (SELECT a FROM jsonb_array_elements(t.state->'actors') a WHERE a->>'id'=m.actor_id::text) AS actor
        FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.account_id=$1 AND t.mode='real' ORDER BY m.id`, [account.id])).rows;
      fresh(account.expires_at);
      return { email: account.email, expiresAt: account.expires_at, memberships: rows.map(r => ({ membershipId:r.id, tenantId:r.tenant_id, actorId:r.actor_id, name:r.name, role:r.actor.role })), simulated:false };
    });
  }
  async function logout(plain) {
    await pool.query('UPDATE user_sessions SET revoked_at=$2 WHERE token_hash=$1', [credential(plain), new Date(now())]); return { loggedOut:true };
  }
  async function changePassword(plain, input) {
    safeTree(input); object(input, ['currentPassword','newPassword'], ['currentPassword','newPassword']);
    passwordInput(input.currentPassword); passwordInput(input.newPassword);
    const account = await transaction(pool, async client => {
      const a = await session(client, plain); return (await client.query('SELECT id,version,password_hash FROM accounts WHERE id=$1', [a.id])).rows[0];
    });
    await limit(`password:${account.id}`);
    assert(await verifyPassword(account.password_hash,input.currentPassword), 'LOGIN_FAILED',401,'Текущий пароль не подходит');
    const next = await hashPassword(input.newPassword);
    await transaction(pool, async client => {
      const sourceSession=await session(client, plain);
      const changed = await client.query('UPDATE accounts SET password_hash=$3,version=version+1 WHERE id=$1 AND version=$2 RETURNING id', [account.id, account.version, next]);
      assert(changed.rowCount, 'CONFLICT',409,'Пароль уже изменился; войдите снова'); fresh(sourceSession.expires_at);
    });
    return { loggedOut:true };
  }
  async function invite(plain, membershipId, input) {
    safeTree(input); object(input,['role'],['role']); assert(['partner','customer'].includes(input.role));
    return transaction(pool,async client => {
      const resolved=await resolveUser(client,plain,membershipId), {state,actor}=await lockedState(client,resolved);
      assert(actor.role==='merchant','FORBIDDEN',403); const value=token(), expiresAt=new Date(now()+86400000).toISOString();
      const count=(await client.query('SELECT count(*)::int AS n FROM invitations WHERE tenant_id=$1 AND expires_at>$2 AND accepted_by IS NULL',[resolved.tenant_id,new Date(now())])).rows[0].n;
      assert(count<100,'LIMIT',429);
      await client.query('INSERT INTO invitations(token_hash,tenant_id,role,expires_at) VALUES($1,$2,$3,$4)',[hash(value),state.runId,input.role,expiresAt]);
      fresh(resolved.expires_at); return { invitation:value, role:input.role, expiresAt };
    });
  }
  async function acceptInvite(plain,input) {
    safeTree(input); object(input,['invitation','name'],['invitation','name']); str(input.name,100);
    return transaction(pool,async client=>{
      const account=await session(client,plain);
      const invitation=(await client.query('SELECT * FROM invitations WHERE token_hash=$1 AND expires_at>$2 AND accepted_by IS NULL FOR UPDATE',[credential(input.invitation),new Date(now())])).rows[0];
      assert(invitation,'INVITE_INACTIVE',409,'Приглашение использовано или истекло');
      const exists=await client.query('SELECT id FROM memberships WHERE account_id=$1 AND tenant_id=$2',[account.id,invitation.tenant_id]);
      assert(!exists.rowCount,'ALREADY_MEMBER',409,'Вы уже участник организации');
      const state=(await client.query("SELECT state FROM tenants WHERE id=$1 AND mode='real' FOR UPDATE",[invitation.tenant_id])).rows[0]?.state;
      assert(state,'FORBIDDEN',403); assert(state.actors.length<1000,'LIMIT',429); const before=structuredClone(state);
      const actor={id:id(),role:invitation.role,name:input.name,promoCode:randomBytes(8).toString('hex').toUpperCase()};
      state.actors.push(actor); state.clock=new Date(now()).toISOString(); const membershipId=id();
      await client.query('INSERT INTO memberships(id,account_id,tenant_id,actor_id) VALUES($1,$2,$3,$4)',[membershipId,account.id,invitation.tenant_id,actor.id]);
      await client.query('UPDATE invitations SET accepted_by=$2 WHERE token_hash=$1',[hash(input.invitation),account.id]);
      await persistChanges(client,state.runId,before,state); fresh(account.expires_at); fresh(invitation.expires_at); return {membershipId,actorId:actor.id,role:actor.role};
    });
  }
  async function mintAgent(plain,membershipId,input) {
    return transaction(pool,async client=>{
      const resolved=await resolveUser(client,plain,membershipId), {state,actor}=await lockedState(client,resolved), before=structuredClone(state);
      safeTree(input); const grant=createGrant(state,actor,input,now()), value=token();
      const account=(await client.query('SELECT version FROM accounts WHERE id=$1',[resolved.account_id])).rows[0];
      await client.query('INSERT INTO agent_credentials(token_hash,membership_id,version,grant_id,expires_at) VALUES($1,$2,$3,$4,$5)',
        [hash(value),membershipId,account.version,grant.id,grant.expiresAt]);
      await persistChanges(client,state.runId,before,state);
      fresh(resolved.expires_at); fresh(grant.expiresAt); return {token:value,grantId:grant.id,actions:grant.actions,expiresAt:grant.expiresAt};
    });
  }
  async function authenticateAgent(plain) {
    return transaction(pool,async client=>{
      const resolved=await resolveAgent(client,plain), {state,actor}=await lockedState(client,resolved);
      const grant=validGrant(state,actor,resolved.grantId,now());
      return {actorId:actor.id,role:actor.role,actions:grant.actions,grantId:grant.id,expiresAt:grant.expiresAt};
    });
  }
  return {register,login,me,logout,changePassword,invite,acceptInvite,mintAgent,authenticateAgent,resolveUser,resolveAgent,lockedState,fresh};
}
