import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { loadLimits } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { remainingLimits } from '../apps/web/src/server/limits';
import { InterestService } from '../apps/web/src/server/interest';
const url = process.env.DATABASE_URL;
describe.skipIf(!url)('PostgreSQL limits and interest', () => {
  let pool: Pool, service: InterestService;
  const schema = `limits_${randomBytes(8).toString('hex')}`, owner = randomUUID(), other = randomUUID();
  const now = new Date('2026-09-23T20:59:59Z');
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Requires isolated *_test database');
    await ensureTestDatabase(url);
    pool = createPool(url, schema);
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
    service = new InterestService(pool, () => now);
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE account,quota_counter CASCADE');
    for (const id of [owner, other]) await pool.query("INSERT INTO account(id,email,password_hash) VALUES($1,$2,'test')", [id, `${id}@example.test`]);
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });
  it('quota display isolates account and Moscow day and omits global/refund counters', async () => {
    await pool.query(`INSERT INTO quota_counter(scope,scope_key,day,used) VALUES
      ('user_minutes',$1,'2026-09-23',12),('user_minutes',$2,'2026-09-23',90),
      ('user_uploads',$1,'2026-09-22',2),('user_upload_refunds',$1,'2026-09-23',2),('global_minutes','all','2026-09-23',600)`, [owner, other]);
    const limits = loadLimits(environment());
    expect(await remainingLimits(pool, limits, owner, now)).toEqual({ uploads: 2, minutes: 78, selections: 2, resets_at: '2026-09-23T21:00:00.000Z' });
    expect(await remainingLimits(pool, limits, owner, new Date('2026-09-23T21:00:00Z'))).toEqual({ uploads: 2, minutes: 90, selections: 2, resets_at: '2026-09-24T21:00:00.000Z' });
  });
  it('20 simultaneous presses produce one interest per account and count every source separately', async () => {
    const sources = ['clip_card', 'guest_page', 'partner_dashboard'];
    await Promise.all([...Array.from({ length: 20 }, (_, i) => service.create(owner, { source_screen: sources[i % 3] })),
      service.create(other, { source_screen: 'guest_page' })]);
    expect((await pool.query('SELECT account_id,count(*)::int AS n FROM pro_interest GROUP BY account_id')).rows)
      .toEqual(expect.arrayContaining([{ account_id: owner, n: 1 }, { account_id: other, n: 1 }]));
    expect((await pool.query("SELECT source_screen,count(*)::int AS n FROM growth_event WHERE account_id=$1 AND type='interest' GROUP BY source_screen", [owner])).rows)
      .toEqual(expect.arrayContaining([{ source_screen: 'clip_card', n: 7 }, { source_screen: 'guest_page', n: 7 }, { source_screen: 'partner_dashboard', n: 6 }]));
    expect((await pool.query('SELECT contact FROM pro_interest WHERE account_id=$1', [owner])).rows[0].contact).toBe(`${owner}@example.test`);
  });
  it('repeat updates contact and timestamp without duplicating or replacing first source', async () => {
    await service.create(owner, { source_screen: 'clip_card' });
    const next = new Date('2026-09-23T21:00:01Z');
    await new InterestService(pool, () => next).create(owner, { source_screen: 'guest_page', contact: 'new@example.test' });
    expect((await pool.query('SELECT contact,source_screen,last_pressed_at FROM pro_interest')).rows)
      .toEqual([{ contact: 'new@example.test', source_screen: 'clip_card', last_pressed_at: next }]);
    expect((await pool.query("SELECT day::text FROM growth_event WHERE created_at=$1", [next])).rows[0].day).toBe('2026-09-24');
  });
  it('event failure rolls back the interest upsert', async () => {
    await pool.query("ALTER TABLE growth_event ADD CONSTRAINT test_reject_interest CHECK(type <> 'interest')");
    try {
      await expect(service.create(owner, { source_screen: 'clip_card' })).rejects.toThrow();
      expect((await pool.query('SELECT count(*)::int AS n FROM pro_interest')).rows[0].n).toBe(0);
    } finally { await pool.query('ALTER TABLE growth_event DROP CONSTRAINT test_reject_interest'); }
  });
  it('inactive and nonexistent accounts cannot record interest', async () => {
    await pool.query("UPDATE account SET status='erasing' WHERE id=$1", [owner]);
    for (const account of [owner, randomUUID()]) await expect(service.create(account, { source_screen: 'clip_card' })).rejects.toMatchObject({ status: 404 });
    expect((await pool.query('SELECT count(*)::int AS n FROM pro_interest')).rows[0].n).toBe(0);
  });
});
