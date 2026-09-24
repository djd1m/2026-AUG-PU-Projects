import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { PartnerService } from '../apps/web/src/server/partner';
import { ensurePartnerCode } from '../apps/web/src/server/partner-code';
import { ipPrefix } from '../apps/web/src/server/ip';
import { referralCookie } from '../apps/web/src/lib/partner-referral';
import { unblockPartnerCode } from '../packages/db/scripts/partner-code-unblock.mjs';
const secret = 'test-referral-secret';
const url = process.env.DATABASE_URL;
describe.skipIf(!url)('PostgreSQL partner attribution', () => {
  let pool: Pool, service: PartnerService;
  const schema = `partner_${randomBytes(8).toString('hex')}`;
  const owner = randomUUID(), visitor = randomUUID(), other = randomUUID(), codeId = randomUUID(), otherCode = randomUUID();
  let now = new Date('2026-09-23T00:00:00Z');
  const prefix = '192.0.2.0/24';
  const apply = (code = 'CODE123', source: 'explicit' | 'cookie' | 'guest_link' = 'explicit', account = visitor, ip = prefix) => service.apply(account, { code }, ip, source === 'explicit' ? '' : referralCookie('', code, source, false, secret, now.getTime())!);
  const attribution = async () => (await pool.query('SELECT * FROM attribution WHERE account_id=$1', [visitor])).rows[0];
  const seed = async (source: string, status = 'pending') => pool.query(`INSERT INTO attribution(account_id,partner_code_id,source,status)
    VALUES($1,$2,$3,$4)`, [visitor, otherCode, source, status]);
  const accounts = async (n: number) => {
    const ids = Array.from({ length: n }, () => randomUUID());
    for (const id of ids) await pool.query("INSERT INTO account(id,email,password_hash) VALUES($1,$2,'test-only')", [id, `${id}@example.test`]);
    return ids;
  };
  const events = async (n: number, ip = prefix, at = now) => {
    for (const id of await accounts(n)) await pool.query(`INSERT INTO growth_event(type,account_id,partner_code_id,ip_prefix,day,created_at)
      VALUES('code_applied',$1,$2,$3::cidr,'2026-09-23',$4)`, [id, codeId, ip, at]);
  };
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Requires isolated *_test database');
    await ensureTestDatabase(url);
    pool = createPool(url, schema);
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
    service = new PartnerService(pool, secret, () => now);
  });
  beforeEach(async () => {
    now = new Date('2026-09-23T00:00:00Z');
    await pool.query('TRUNCATE account CASCADE');
    for (const id of [owner, visitor, other]) await pool.query("INSERT INTO account(id,email,password_hash) VALUES($1,$2,'test-only')", [id, `${id}@example.test`]);
    for (const [account, id, code] of [[owner, codeId, 'CODE123'], [other, otherCode, 'OTHER12']]) {
      await pool.query(`WITH p AS (INSERT INTO partner(account_id,display_name) VALUES($1,'Партнёр') RETURNING id)
        INSERT INTO partner_code(id,partner_id,code,status) SELECT $2,id,$3,'active' FROM p`, [account, id, code]);
    }
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });
  it('cookie to explicit returns replaced_source and changes exactly the existing row', async () => {
    await seed('cookie'); const before = await attribution();
    expect(await apply()).toMatchObject({ id: before.id, partner_code_id: codeId, source: 'explicit', replaced_source: 'cookie' });
    expect((await pool.query('SELECT count(*) FROM attribution')).rows[0].count).toBe('1');
  });
  it('explicit to any returns 409 and preserves every column', async () => {
    await seed('explicit'); const before = await attribution();
    for (const source of ['explicit', 'guest_link', 'cookie'] as const) await expect(apply('CODE123', source)).rejects.toMatchObject({ status: 409 });
    expect(await attribution()).toEqual(before);
  });
  it('guest_link to cookie returns 409 and preserves attribution', async () => {
    await seed('guest_link'); const before = await attribution();
    await expect(apply('CODE123', 'cookie')).rejects.toMatchObject({ status: 409 }); expect(await attribution()).toEqual(before);
  });
  it('invalid code returns 422 without cookie fallback or any changed column', async () => {
    await seed('cookie'); const before = await attribution();
    await expect(apply('INVALID')).rejects.toMatchObject({ status: 422 }); expect(await attribution()).toEqual(before);
    expect((await pool.query('SELECT count(*) FROM growth_event')).rows[0].count).toBe('0');
  });
  it('50th successful application blocks subsequent applications', async () => {
    await seed('cookie'); const before = await attribution(); await events(49);
    expect(await apply()).toMatchObject({ status: 'pending' });
    expect((await pool.query('SELECT status,blocked_reason FROM partner_code WHERE id=$1', [codeId])).rows[0])
      .toEqual({ status: 'blocked', blocked_reason: 'antifraud_ip_burst' });
    expect(await attribution()).toMatchObject({ id: before.id, partner_code_id: codeId });
    await expect(apply('CODE123', 'explicit', other, '198.51.100.0/24')).rejects.toMatchObject({ status: 422 });
    expect((await pool.query("SELECT count(*) FROM growth_event WHERE type='code_applied'")).rows[0].count).toBe('50');
    expect((await pool.query('SELECT status FROM account WHERE id=$1', [owner])).rows[0].status).toBe('active');
  });
  it('RT-002 distinct accounts: 17 accounts with three sources produce 51 events without blocking', async () => {
    for (const id of await accounts(17)) for (const source of ['cookie', 'guest_link', 'explicit'] as const) {
      await expect(apply('CODE123', source, id)).resolves.toMatchObject({ status: 'pending' });
    }
    expect((await pool.query("SELECT count(*) n,count(DISTINCT account_id) distinct_n FROM growth_event WHERE type='code_applied'")).rows[0])
      .toEqual({ n: '51', distinct_n: '17' });
    expect((await service.dashboard(owner)).codes[0]!.status).toBe('active');
  });
  it('RT-002 49 distinct accounts remain active, the 50th blocks', async () => {
    const ids = await accounts(50);
    for (const id of ids.slice(0, 49)) await apply('CODE123', 'explicit', id);
    expect((await service.dashboard(owner)).codes[0]!.status).toBe('active');
    await apply('CODE123', 'explicit', ids[49]!);
    expect((await service.dashboard(owner)).codes[0]!.status).toBe('blocked');
  });
  it('RT-002 unblock window excludes 50 old events and blocks after 50 new distinct accounts', async () => {
    const old = await accounts(50);
    for (const id of old) await apply('CODE123', 'explicit', id);
    expect((await service.dashboard(owner)).codes[0]!.status).toBe('blocked');
    // Old events exactly at unblocked_at are excluded too.
    await unblockPartnerCode(pool, 'CODE123', '  Проверено  ', now);
    expect((await service.dashboard(owner)).codes[0]).toMatchObject({
      status: 'active', blocked_reason: null, unblocked_at: now.toISOString(), unblock_reason: 'Проверено',
    });
    expect((await pool.query('SELECT blocked_at FROM partner_code WHERE id=$1', [codeId])).rows[0].blocked_at).toBeNull();
    now = new Date(now.getTime() + 1);
    const fresh = await accounts(50);
    await apply('CODE123', 'explicit', fresh[0]!);
    expect((await service.dashboard(owner)).codes[0]!.status).toBe('active');
    for (const id of fresh.slice(1)) await apply('CODE123', 'explicit', id);
    expect((await service.dashboard(owner)).codes[0]!.status).toBe('blocked');
  });
  it('RT-002 unblock accepts manual blocks, rejects invalid reasons and active or missing codes', async () => {
    await pool.query("UPDATE partner_code SET status='blocked',blocked_reason='manual',blocked_at=$2 WHERE id=$1", [codeId, now]);
    for (const reason of ['', '   ', 'x'.repeat(501)]) {
      await expect(unblockPartnerCode(pool, 'CODE123', reason, now)).rejects.toThrow('Причина');
      expect((await service.dashboard(owner)).codes[0]!.status).toBe('blocked');
    }
    await unblockPartnerCode(pool, 'CODE123', 'x'.repeat(500), now);
    await expect(unblockPartnerCode(pool, 'CODE123', 'Причина', now)).rejects.toThrow('не заблокирован');
    await expect(unblockPartnerCode(pool, 'MISSING', 'Причина', now)).rejects.toThrow('не найден');
  });
  it('RT-009 partner_deleted cannot be replaced and preserves every column', async () => {
    await pool.query("INSERT INTO attribution(account_id,source,status) VALUES($1,'cookie','partner_deleted')", [visitor]);
    const before = await attribution();
    await expect(apply()).rejects.toMatchObject({ status: 409 });
    expect(await attribution()).toEqual(before);
  });
  it('RT-009 CHECK rejects null code for activated; status has exactly one enum CHECK', async () => {
    await expect(pool.query("INSERT INTO attribution(account_id,source,status) VALUES($1,'cookie','activated')", [visitor]))
      .rejects.toMatchObject({ code: '23514', constraint: 'attribution_partner_deleted_null' });
    const checks = (await pool.query(`SELECT conname FROM pg_constraint
      WHERE conrelid='attribution'::regclass AND contype='c'
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='attribution'::regclass AND attname='status')]`)).rows;
    expect(checks).toEqual([{ conname: 'attribution_status_check' }]);
    const fk = (await pool.query("SELECT confdeltype FROM pg_constraint WHERE conrelid='attribution'::regclass AND conname='attribution_partner_code_id_fkey'")).rows;
    expect(fk).toEqual([{ confdeltype: 'n' }]);
    await seed('cookie');
    await expect(pool.query('DELETE FROM partner_code WHERE id=$1', [otherCode]))
      .rejects.toMatchObject({ code: '23514', constraint: 'attribution_partner_deleted_null' });
  });
  it('self referral is rejected and excluded from registrations', async () => {
    expect(await apply('CODE123', 'explicit', owner)).toMatchObject({ status: 'rejected', reject_reason: 'self_referral' });
    expect((await service.dashboard(owner)).counters.registrations).toBe(0);
    expect((await service.dashboard(owner)).statuses).toContainEqual({ partner_code_id: codeId, source: 'explicit', status: 'rejected', count: 1 });
  });
  it('RT-002 fifty conflicting requests from one account never block the code or add counting events', async () => {
    await seed('explicit'); const before = await attribution();
    const results = await Promise.allSettled(Array.from({ length: 50 }, () => apply()));
    expect(results.every(result => result.status === 'rejected' && result.reason.status === 409)).toBe(true);
    expect(await attribution()).toEqual(before);
    expect((await pool.query("SELECT status FROM partner_code WHERE id=$1", [codeId])).rows[0].status).toBe('active');
    expect((await pool.query("SELECT count(*) FROM growth_event WHERE type='code_applied'")).rows[0].count).toBe('0');
  });
  it('RT-003 self referral preserves activated attribution and adds no counting event', async () => {
    await pool.query(`INSERT INTO attribution(account_id,partner_code_id,source,status) VALUES($1,$2,'cookie','activated')`, [owner, otherCode]);
    const before = (await pool.query('SELECT * FROM attribution WHERE account_id=$1', [owner])).rows[0];
    await expect(apply('CODE123', 'explicit', owner)).rejects.toMatchObject({ status: 409 });
    expect((await pool.query('SELECT * FROM attribution WHERE account_id=$1', [owner])).rows[0]).toEqual(before);
    expect((await pool.query("SELECT count(*) FROM growth_event WHERE type='code_applied'")).rows[0].count).toBe('0');
  });
  it('foreign partner code returns 403 including unknown UUID', async () => {
    await expect(service.dashboard(other, codeId)).rejects.toMatchObject({ status: 403 });
    await expect(service.dashboard(other, randomUUID())).rejects.toMatchObject({ status: 403 });
    expect((await service.dashboard(owner, codeId)).codes.map(c => c.id)).toEqual([codeId]);
  });
  it('60 concurrent requests by 55 accounts block once after exactly 50 successes', async () => {
    await pool.query('CREATE TABLE test_blocks(id uuid, blocked_at timestamptz)');
    await pool.query(`CREATE FUNCTION test_block_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.blocked_at IS DISTINCT FROM OLD.blocked_at THEN INSERT INTO test_blocks VALUES(NEW.id,NEW.blocked_at); END IF; RETURN NEW; END $$`);
    await pool.query('CREATE TRIGGER test_block AFTER UPDATE ON partner_code FOR EACH ROW EXECUTE FUNCTION test_block_audit()');
    try {
      const accounts = Array.from({ length: 55 }, () => randomUUID());
      for (const id of accounts) await pool.query("INSERT INTO account(id,email,password_hash) VALUES($1,$2,'test-only')", [id, `${id}@example.test`]);
      const results = await Promise.allSettled([...accounts, ...accounts.slice(0, 5)].map((id, i) => apply('CODE123', 'explicit', id, ipPrefix(`192.0.2.${i + 1}`))));
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(50);
      for (const r of results) if (r.status === 'rejected') {
        expect([409, 422]).toContain(r.reason.status);
        if (r.reason.status === 422) expect(r.reason.details).toEqual({ reason: 'code_blocked' });
      }
      expect((await pool.query('SELECT * FROM test_blocks')).rows).toEqual([{ id: codeId, blocked_at: now }]);
      expect((await pool.query("SELECT count(*) FROM growth_event WHERE type='code_applied'")).rows[0].count).toBe('50');
      expect((await pool.query('SELECT count(*) FROM attribution WHERE partner_code_id=$1', [codeId])).rows[0].count).toBe('50');
    } finally {
      await pool.query('DROP TRIGGER test_block ON partner_code'); await pool.query('DROP FUNCTION test_block_audit()'); await pool.query('DROP TABLE test_blocks');
    }
  });
  it('concurrent explicit choices leave one winner across different codes', async () => {
    const results = await Promise.allSettled([apply(), apply('OTHER12')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected').map(r => r.reason.status)).toEqual([409]);
  });
  it('rejected attribution cannot be revived', async () => {
    await seed('cookie', 'rejected'); const before = await attribution();
    await expect(apply()).rejects.toMatchObject({ status: 409 }); expect(await attribution()).toEqual(before);
  });
  it('guest registration event commits once, excludes self referral and conflicts', async () => {
    await apply('CODE123', 'guest_link');
    await expect(apply('CODE123', 'guest_link')).rejects.toMatchObject({ status: 409 });
    await apply('CODE123', 'guest_link', owner);
    const rows = (await pool.query("SELECT account_id,partner_code_id FROM growth_event WHERE type='guest_registered'")).rows;
    expect(rows).toEqual([{ account_id: visitor, partner_code_id: codeId }]);
  });
  it('rolling ten-minute boundary excludes old events and different prefixes; IPv6 uses /64', async () => {
    await events(49, prefix, new Date(now.getTime() - 600_000));
    await events(49, '198.51.100.0/24');
    expect(await apply()).toMatchObject({ status: 'pending' });
    const ipv6 = ipPrefix('2001:db8:1:2::1'); await events(49, ipv6);
    expect(await apply('CODE123', 'explicit', other, ipPrefix('2001:db8:1:2::ffff'))).toMatchObject({ status: 'pending' });
  });
  it('database exception rolls back event and attribution together', async () => {
    await pool.query(`CREATE FUNCTION test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$`);
    await pool.query('CREATE TRIGGER test_fail BEFORE INSERT ON attribution FOR EACH ROW EXECUTE FUNCTION test_fail()');
    try {
      await expect(apply()).rejects.toThrow('injected');
      expect((await pool.query('SELECT count(*) FROM growth_event')).rows[0].count).toBe('0');
    } finally { await pool.query('DROP TRIGGER test_fail ON attribution'); await pool.query('DROP FUNCTION test_fail()'); }
  });
  it('dashboard has five independent aggregates with no row multiplication', async () => {
    await apply();
    const video = randomUUID(), clip = randomUUID(), link = randomUUID();
    await pool.query(`INSERT INTO video(id,account_id,idempotency_key,source,declared_bytes,status) VALUES($1,$2,$3,'upload',100,'done')`, [video, visitor, randomUUID()]);
    await pool.query(`INSERT INTO clip(id,video_id,"index",start_seconds,end_seconds,title,status,watermarked) VALUES($1,$2,1,0,25,'Клип','done',true)`, [clip, video]);
    await pool.query('INSERT INTO clip_link(id,clip_id,code,unique_view_count) VALUES($1,$2,$3,2)', [link, clip, '23456789AB']);
    await pool.query(`INSERT INTO growth_event(type,clip_link_id,partner_code_id,ip_prefix,day)
      VALUES('link_view',$1,$2,'192.0.2.0/24','2026-09-23'),('link_view',$1,$2,'198.51.100.0/24','2026-09-23')`, [link, codeId]);
    expect((await service.dashboard(owner)).counters).toEqual({ visits: 2, registrations: 1, uploaded: 1, shared: 1, guests: 0 });
    expect((await service.dashboard(other)).counters).toEqual({ visits: 0, registrations: 0, uploaded: 0, shared: 0, guests: 0 });
  });
  it('personal code creation is serialized and blocked code is never regenerated', async () => {
    const create = async () => {
      const tx = await pool.connect(); try { await tx.query('BEGIN'); const result = await ensurePartnerCode(tx, visitor); await tx.query('COMMIT'); return result; }
      catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
    };
    const results = await Promise.all(Array.from({ length: 10 }, create));
    expect(new Set(results.map(r => r.id)).size).toBe(1);
    await pool.query("UPDATE partner_code SET status='blocked' WHERE id=$1", [results[0]!.id]);
    expect(await create()).toEqual(results[0]);
  });
});
