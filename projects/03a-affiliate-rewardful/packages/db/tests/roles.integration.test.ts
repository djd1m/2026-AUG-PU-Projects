import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createUser, fixturePools, migrateFixture, removeUsers } from './helpers';
import { readRuntimeConfig } from '../../../apps/web/src/lib/auth/config';
import { serializeSessionCookie } from '../../../apps/web/src/lib/auth/cookie';
import { generateSessionToken } from '../../../apps/web/src/lib/auth/session';
const pools = fixturePools(); const ids: string[] = [];
beforeAll(migrateFixture);
afterAll(async () => { await removeUsers(pools.migrate, ids); await pools.app.end(); await pools.migrate.end(); });
it('runtime configuration cookie and database authority fail closed', async () => {
  expect(() => readRuntimeConfig({})).toThrow();
  const config = readRuntimeConfig({ DATABASE_URL: pools.urls.app, SESSION_SECRET: randomBytes(32).toString('base64url') });
  expect(config.sessionSecret.length).toBe(32);
  const cookie = serializeSessionCookie(generateSessionToken());
  for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=86400']) expect(cookie).toContain(attribute);
  expect(cookie).not.toContain('Domain=');
  const role = (await pools.app.query(`SELECT current_user AS name, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
    FROM pg_roles WHERE rolname=current_user`)).rows[0];
  expect(role).toEqual({ name: 'n3a_app', rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
  const owner = (await pools.app.query(`SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='n3a'`)).rows[0];
  expect(owner.owner).toBe('n3a_migrator');
  const user = await createUser(pools.migrate, 'role-test-snapshot'); ids.push(user.id);
  const forbidden = [
    'CREATE TABLE n3a.forbidden(id integer)',
    'CREATE TABLE public.forbidden(id integer)',
    'CREATE TEMP TABLE forbidden(id integer)',
    "INSERT INTO n3a.users(identity_hash,password_hash) VALUES (decode(repeat('aa',32),'hex'),'forbidden')",
    "UPDATE n3a.users SET password_hash='forbidden'",
    'UPDATE n3a.users SET enabled=false',
    'DELETE FROM n3a.users',
    "INSERT INTO n3a.sessions(user_id,token_hash,expires_at) VALUES ('" + user.id + "',decode(repeat('bb',32),'hex'),now()+interval '1 day')",
    'UPDATE n3a.sessions SET expires_at=now()',
    "INSERT INTO n3a.schema_migrations(filename,checksum) VALUES ('forbidden',repeat('a',64))",
    'SELECT * FROM n3a.schema_migrations',
    'SELECT rolpassword FROM pg_authid',
    'SET ROLE n3a_migrator',
  ];
  for (const sql of forbidden) await expect(pools.app.query(sql)).rejects.toMatchObject({ code: '42501' });
  const acl = await pools.migrate.query(`SELECT p.prosecdef, p.proconfig,
    EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='n3a' AND p.proname='issue_session_if_current'`);
  expect(acl.rows[0]).toMatchObject({ prosecdef: true, public_execute: false });
  expect(acl.rows[0].proconfig).toContain('search_path=pg_catalog, pg_temp');
});
it('hostile search path cannot redirect the privileged issuer', async () => {
  const user = await createUser(pools.migrate, 'exact-snapshot'); ids.push(user.id);
  const hostile = 'test_hostile_' + randomUUID().replaceAll('-', '');
  await pools.migrate.query(`CREATE SCHEMA "${hostile}"; CREATE TABLE "${hostile}".users(id uuid, password_hash text, enabled boolean);
    CREATE TABLE "${hostile}".sessions(user_id uuid, token_hash bytea); GRANT USAGE ON SCHEMA "${hostile}" TO n3a_app`);
  const client = await pools.app.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('search_path',$1,true)", [hostile + ',public,n3a']);
    expect((await client.query('SELECT * FROM n3a.issue_session_if_current($1,$2,$3)',
      [user.id, 'exact-snapshot', randomBytes(32)])).rows).toHaveLength(1);
    expect((await client.query('SELECT * FROM n3a.issue_session_if_current($1,$2,$3)',
      [user.id, 'EXACT-snapshot', randomBytes(32)])).rows).toHaveLength(0);
    await client.query('COMMIT');
    expect((await pools.migrate.query(`SELECT count(*)::int AS n FROM "${hostile}".sessions`)).rows[0].n).toBe(0);
  } finally {
    await client.query('ROLLBACK'); client.release();
    await pools.migrate.query(`DROP SCHEMA "${hostile}" CASCADE`);
  }
});
