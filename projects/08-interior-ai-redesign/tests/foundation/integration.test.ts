import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { AuthService } from '@n8/domain/identity';
import { passwords, tokenPort } from '@n8/adapters/auth';
import { PgAuthStore, PgProjects, PgRateGate } from '@n8/db/identity';
import { freshDb } from '../helpers/db';
import { authHandler, projectHandler, projectsHandler, meHandler } from '../../apps/web/src/server/handlers';
import { loadConfig } from '../../apps/web/src/server/config';
import { guardRequest, readJson } from '../../apps/web/src/server/http';
import type { Base } from '../../apps/web/src/server/composition';
let pool: Pool, close: () => Promise<void>, base: Base;
const origin = 'https://n8.test', password = 'safe-password123';
let actorId: string, token: string, otherId: string;
function request(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(origin + path, { method, headers: { 'x-n8-peer': '192.0.2.1', origin, cookie: `n8_session=${token}`, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeAll(async () => {
  ({ pool, close } = await freshDb());
  const tokens = tokenPort('s'.repeat(32)), store = new PgAuthStore(pool);
  const auth = new AuthService(store, passwords, tokens, { now: () => new Date() });
  token = await auth.register('owner@example.org', password); actorId = (await auth.authenticate(token))!.accountId;
  const otherToken = await auth.register('other@example.org', password); otherId = (await auth.authenticate(otherToken))!.accountId;
  base = { pool, config: loadConfig({ DATABASE_URL: 'postgresql://localhost/test', N8_PUBLIC_ORIGIN: origin, N8_SESSION_SECRET: 's'.repeat(32), N8_ASSET_DIR: '/tmp' }), auth,
    projects: new PgProjects(pool), rate: new PgRateGate(pool), hashSubject: value => tokens.hash(value) };
});
afterAll(async () => { if (close) await close(); });
describe('actual PG foundation acceptance', () => {
  it('FND-R1 malformed cursor timestamps return400 before SQL while microsecond cursor remains valid', async()=>{
    for(const createdAt of ['0','2026-02-31T00:00:00Z','2026-10-13T25:00:00Z','2026-10-13','2026-10-13 12:00:00+23:00']) {
      const cursor=Buffer.from(JSON.stringify({createdAt,id:randomUUID()})).toString('base64url');
      await expect(base.projects.list(actorId,10,cursor)).rejects.toMatchObject({status:400,code:'INVALID_CURSOR'});
      const response=await projectsHandler('GET',()=>base)(request(`/api/projects?cursor=${cursor}`,'GET'));
      expect(response.status).toBe(400);expect((await response.json()).error.code).toBe('INVALID_CURSOR');
    }
  });

  it('SC-US-001-1/2 registration duplicate neutral dummy token; login/logout/expiry/disabled persisted', async () => {
    const duplicate = await base.auth.register('OWNER@example.org', password); expect(await base.auth.authenticate(duplicate)).toBeNull();
    const valid = await base.auth.login('owner@example.org', password); expect(valid).not.toBe(token); expect((await base.auth.authenticate(valid))?.accountId).toBe(actorId);
    await base.auth.logout(valid); expect(await base.auth.authenticate(valid)).toBeNull();
    await expect(base.auth.login('owner@example.org', 'wrong-password123')).rejects.toMatchObject({ status: 401 });
    const expiry = await base.auth.login('owner@example.org', password);
    await pool.query("UPDATE session SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [tokenPort('s'.repeat(32)).hash(expiry)]); expect(await base.auth.authenticate(expiry)).toBeNull();
    await pool.query("UPDATE account SET status='disabled' WHERE id=$1", [otherId]);
    await expect(base.auth.login('other@example.org', password)).rejects.toMatchObject({ status: 401 });
    await pool.query("UPDATE account SET status='active' WHERE id=$1", [otherId]);
    const rows = await pool.query('SELECT token_hash FROM session'); expect(rows.rows.every(row => /^[a-f0-9]{64}$/.test(row.token_hash))).toBe(true);
  });
  it('SC-US-002-1 and SC-US-020-2 owned SQL/HTML text roundtrips; projects isolated and DTO excludes account/private fields', async () => {
    const name = "<script>alert('x')</script> '; DROP TABLE account; --";
    const one = await base.projects.create(actorId, { name, region: 'Москва' }); const two = await base.projects.create(actorId, { name: 'Другой', region: 'Казань' });
    const updated = await base.projects.update(actorId, one.id, one.version, { name: 'Переименован', region: 'Тула' });
    expect(updated.version).toBe(2); expect(await base.projects.get(actorId, one.id)).toEqual(updated); expect((await base.projects.get(actorId, two.id)).name).toBe('Другой');
    expect(Object.keys(updated)).not.toContain('account_id'); expect(JSON.stringify(updated)).not.toMatch(/password|tokenHash|fileKey/);
    expect((await pool.query('SELECT count(*) FROM account')).rows[0].count).toBe('2');
  });
  it('SC-US-002-2/019-1 foreign and missing resources same404; ownership/CAS persists through races', async () => {
    const own = await base.projects.create(actorId, { name: 'CAS', region: 'Москва' });
    for (const id of [own.id, randomUUID()]) await expect(base.projects.get(otherId, id)).rejects.toMatchObject({ status: 404 });
    await expect(base.projects.update(otherId, own.id, 1, { name: 'attack' })).rejects.toMatchObject({ status: 404 });
    const changes = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => base.projects.update(actorId, own.id, 1, { name: 'race' + i })));
    expect(changes.filter(x => x.status === 'fulfilled')).toHaveLength(1); expect(changes.filter(x => x.status === 'rejected' && x.reason.code === 'VERSION_CONFLICT')).toHaveLength(9);
    expect((await base.projects.get(actorId, own.id)).version).toBe(2);
    await base.projects.update(actorId, own.id, 2, { archive: true });
    await expect(base.projects.update(actorId, own.id, 3, { name: 'after' })).rejects.toMatchObject({ status: 409, code: 'PROJECT_ARCHIVED' });
    expect((await base.projects.get(actorId, own.id)).state).toBe('archived');
  });
  it('SC-US-016-2 atomic PG 59 attempts then 20 concurrent admits exactly one; rejected attempts counted', async () => {
    const hash = base.hashSubject('race-rate'); const now = new Date('2026-10-13T22:20:10Z');
    for (let i = 0; i < 59; i++) expect((await base.rate.hit(hash, 'mutation', 60, now)).allowed).toBe(true);
    const results = await Promise.all(Array.from({ length: 20 }, () => base.rate.hit(hash, 'mutation', 60, now)));
    expect(results.filter(x => x.allowed)).toHaveLength(1); expect(results.filter(x => !x.allowed)).toHaveLength(19); expect(results.every(x => x.retryAfter === 50)).toBe(true);
    expect((await pool.query('SELECT count FROM rate_bucket WHERE subject_hash=$1', [hash])).rows[0].count).toBe(79);
  });
  it('SC-US-020-1 invalid JSON counts before parse with no retained pool client; exact Origin failures count too', async () => {
    const req = new Request(origin, { method: 'POST', headers: { 'x-n8-peer': '192.0.2.2', origin, 'content-type': 'application/json' }, body: '{' });
    await guardRequest(req, { access: 'auth' }, base); expect(pool.waitingCount).toBe(0); expect(pool.idleCount).toBe(pool.totalCount);
    await expect(readJson(req)).rejects.toMatchObject({ status: 400 });
    const foreign = request('/api/auth/login', 'POST', {}, { 'x-n8-peer': '192.0.2.2', origin: 'https://evil.test' });
    await expect(guardRequest(foreign, { access: 'auth' }, base)).rejects.toMatchObject({ status: 403 });
    expect((await pool.query('SELECT count FROM rate_bucket WHERE subject_hash=$1 AND kind=$2', [base.hashSubject('192.0.2.2'), 'auth'])).rows[0].count).toBe(2);
  });
  it('SC-US-016-3 route mutation saves, envelope camelCase, me private response safe; foreign HTTP read404', async () => {
    const created = await projectsHandler('POST', () => base)(request('/api/projects', 'POST', { name: 'HTTP', region: 'Москва' })); expect(created.status).toBe(201);
    const document = await created.json(); expect(document.meta.version).toBe(1); expect(document.data.currentShellId).toBeNull();
    const patch = await projectHandler('PATCH', document.data.id, () => base)(request('/api/projects/' + document.data.id, 'PATCH', { name: 'Сохранён' }, { 'if-match': '1' })); expect(patch.status).toBe(200);
    expect((await base.projects.get(actorId, document.data.id)).name).toBe('Сохранён');
    const other = await base.projects.create(otherId, { name: 'Чужой', region: 'Москва' });
    expect((await projectHandler('GET', other.id, () => base)(request('/api/projects/' + other.id, 'GET'))).status).toBe(404);
    const me = await meHandler(() => base)(request('/api/me', 'GET')); const data = await me.json(); expect(me.status).toBe(200); expect(data.data.email).toBe('owner@example.org'); expect(JSON.stringify(data)).not.toMatch(/password|sessionSecret|databaseUrl/);
  });
  it('bounded cursor survives PostgreSQL microseconds and quota20 is atomic at concurrency edge', async () => {
    const quotaToken = await base.auth.register('quota@example.org', password); const quotaActor = (await base.auth.authenticate(quotaToken))!.accountId;
    for (let i = 0; i < 19; i++) await base.projects.create(quotaActor, { name: 'P' + i, region: 'Москва' });
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => base.projects.create(quotaActor, { name: 'last', region: 'Москва' })));
    expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1); expect(results.filter(x => x.status === 'rejected' && x.reason.code === 'PROJECT_LIMIT')).toHaveLength(9);
    await pool.query("UPDATE project SET created_at='2026-10-13 22:00:00.123456+00' WHERE account_id=$1", [quotaActor]);
    const first = await base.projects.list(quotaActor, 10); const second = await base.projects.list(quotaActor, 10, first.nextCursor!);
    expect(new Set([...first.items, ...second.items].map(x => x.id)).size).toBe(20); expect(second.nextCursor).toBeNull();
    await expect(base.projects.list(quotaActor, 51)).rejects.toMatchObject({ status: 400 });
  });
  it('SC-US-001-1 real auth HTTP register neutral201 + login cookie then logout204 revokes', async () => {
    const body = { email: 'http@example.org', password };
    const register = await authHandler('register', () => base)(request('/api/auth/register', 'POST', body, { 'x-n8-peer': '192.0.2.8' })); expect(register.status).toBe(201);
    const cookie = register.headers.get('set-cookie')!.split(';')[0]; const rawToken = cookie.split('=')[1]; expect(await base.auth.authenticate(rawToken)).not.toBeNull();
    const duplicate = await authHandler('register', () => base)(request('/api/auth/register', 'POST', body, { 'x-n8-peer': '192.0.2.8' })); expect(duplicate.status).toBe(201);
    expect(await base.auth.authenticate(duplicate.headers.get('set-cookie')!.split(';')[0].split('=')[1])).toBeNull();
    const logout = await authHandler('logout', () => base)(request('/api/auth/logout', 'POST', undefined, { cookie })); expect(logout.status).toBe(204); expect(logout.headers.get('set-cookie')).toContain('Max-Age=0'); expect(await base.auth.authenticate(rawToken)).toBeNull();
  });
});

describe('archive dispatch ordering and readiness', () => {
  it('archive revokes links, releases predispatch origin-day reservations/credits once, retains dispatched uncertain holds', async () => {
    const p = await base.projects.create(actorId, { name: 'Архив', region: 'Москва' });
    const shell = (await pool.query(`INSERT INTO shell_revision(project_id,mode,geometry,calibration,floor_area_source,hash) VALUES($1,'manual','{}','{}','unknown','shell') RETURNING id`, [p.id])).rows[0].id;
    const design = (await pool.query(`INSERT INTO design_revision(project_id,shell_id,shell_hash,scene,style,mode,fit,change_reason) VALUES($1,$2,'shell','{}','minimal','manual','unconfirmed','test') RETURNING id`, [p.id, shell])).rows[0].id;
    const asset = (await pool.query(`INSERT INTO asset(project_id,kind,original_key,normalized_key,original_hash,mime,bytes,rights_confirmed,state,stored_bytes)
      VALUES($1,'share_image',$2,$3,'hash','image/png',10,true,'ready',20) RETURNING id`, [p.id, randomUUID(), randomUUID()])).rows[0].id;
    await pool.query("INSERT INTO share_link(project_id,design_id,asset_id,token_hash,caption,expires_at) VALUES($1,$2,$3,$4,'preview',now()+interval '7 days')", [p.id, design, asset, randomUUID()]);
    await pool.query('UPDATE account SET credits_held=3 WHERE id=$1', [actorId]);
    const day = '2026-10-12';
    await pool.query("INSERT INTO spend_budget(scope,account_id,day,reserved_micro_usd,cap_micro_usd) VALUES('account',$1,$2,300,1000),('global',NULL,$2,300,2000)", [actorId, day]);
    const ids: string[] = [];
    for (const [state, dispatched] of [['queued', false], ['running', false], ['uncertain', true]] as const) {
      ids.push((await pool.query(`INSERT INTO job(project_id,account_id,shell_id,style,input_text,input_hash,request_body,consent_hash,origin_project_version,expires_at,idempotency_key,mode,state,
        request_dispatched_at,reserved_micro_usd,admission_day,credit_state) VALUES($1,$2,$3,'minimal','','hash','{}','consent',1,now()+interval '120 seconds',$4,'live',$5,$6,100,$7,'held') RETURNING id`,
      [p.id, actorId, shell, randomUUID(), state, dispatched ? new Date() : null, day])).rows[0].id);
    }
    await base.projects.update(actorId, p.id, 1, { archive: true });
    const jobs = await pool.query('SELECT id,state,credit_state,lease_fence FROM job WHERE project_id=$1', [p.id]);
    expect(jobs.rows.filter(j => j.state === 'failed' && j.credit_state === 'released' && j.lease_fence === 1)).toHaveLength(2);
    expect(jobs.rows.find(j => j.id === ids[2])).toMatchObject({ state: 'uncertain', credit_state: 'held' });
    const account = (await pool.query('SELECT credits_held,credits_available FROM account WHERE id=$1', [actorId])).rows[0]; expect(account).toEqual({ credits_held: 1, credits_available: 2 });
    expect((await pool.query('SELECT reserved_micro_usd FROM spend_budget WHERE day=$1 ORDER BY scope', [day])).rows.map(x => x.reserved_micro_usd)).toEqual(['100', '100']);
    expect((await pool.query('SELECT revoked_at FROM share_link WHERE project_id=$1', [p.id])).rows[0].revoked_at).not.toBeNull();
    await expect(base.projects.update(actorId, p.id, 2, { archive: true })).rejects.toMatchObject({ code: 'PROJECT_ARCHIVED' });
    expect((await pool.query('SELECT credits_available FROM account WHERE id=$1', [actorId])).rows[0].credits_available).toBe(2);
  });
  it('SC-US-016-2 HTTP concurrent edge returns one200 nineteen429 Retry-After and no body reads rejected', async () => {
    const subject = base.hashSubject('192.0.2.99'); const now = new Date();
    const start = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    await pool.query("INSERT INTO rate_bucket(subject_hash,kind,window_start,count) VALUES($1,'auth',$2,9)", [subject, start]);
    // Auth uses the same production atomic boundary with its literal 10/min limit.
    const results = await Promise.all(Array.from({ length: 20 }, () => authHandler('login', () => base)(request('/api/auth/login', 'POST', { email: 'owner@example.org', password }, { 'x-n8-peer': '192.0.2.99' }))));
    expect(results.filter(x => x.status === 200)).toHaveLength(1); expect(results.filter(x => x.status === 429)).toHaveLength(19);
    expect(results.filter(x => x.status === 429).every(x => Number(x.headers.get('retry-after')) >= 1)).toBe(true);
  });
});
