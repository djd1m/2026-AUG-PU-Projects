import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { ownerPool, servicePool, seedTenant } from '../../../../packages/db/tests/int/helpers';
import { retainRecentData } from '../../src/retention';
const owner = ownerPool(); const service = servicePool();
afterAll(async () => { await Promise.all([owner.end(), service.end()]); });
/** Fixtures inserted in cleanup's real transaction use its exact now(), avoiding clock drift at strict boundaries. */
function seeded(afterSetup: (c: pg.PoolClient) => Promise<void>): pg.Pool {
  return new Proxy(service, { get(pool, key) {
    if (key === 'connect') return async () => {
      const c = await pool.connect();
      return new Proxy(c, { get(client, prop) {
        if (prop === 'query') return async (sql: string, values?: unknown[]) => {
          const r = await client.query(sql, values);
          if (sql === 'SET LOCAL ROLE n6b_service') await afterSetup(client);
          return r;
        };
        const value = Reflect.get(client, prop); return typeof value === 'function' ? value.bind(client) : value;
      } });
    };
    const value = Reflect.get(pool, key); return typeof value === 'function' ? value.bind(pool) : value;
  } });
}
describe('SRC-05/06 NFR-n6b-4 real retention cutoffs and locking', () => {
  it('deletes strictly older30days; keeps exact boundary/recent; Moscow day-2/recent/auth-hour counters unchanged', async () => {
    const a = await seedTenant(owner); const tag = randomUUID();
    const questions: string[] = []; const scopes = [tag+'-old',tag+'-boundary',tag+'-recent','auth:addr:'+tag.replaceAll('-','')+':2026-10-03T08'];
    const input = seeded(async (c) => {
      const r = await c.query<{ id: string }>(`INSERT INTO question_log(bot_id,account_id,channel,question,outcome,created_at)
        SELECT $1,$2,'widget',$3,'answered',now()-age::interval
        FROM unnest(ARRAY['30 days 1 microsecond','30 days','29 days']) age RETURNING id`, [a.botId,a.accountId,tag]);
      questions.push(...r.rows.map((v) => v.id));
      for (const [i,scope] of scopes.entries()) await c.query(`INSERT INTO quota_counter(scope,day,used)
        VALUES($1,(now() AT TIME ZONE 'Europe/Moscow')::date-$2,17)`, [scope,[3,2,0,0][i]]);
    });
    const report = await retainRecentData(input); expect(report.skipped).toBe(false); expect(report.questions).toBeGreaterThanOrEqual(1);
    expect((await owner.query('SELECT id FROM question_log WHERE id=ANY($1::uuid[]) ORDER BY created_at', [questions])).rows.map((r) => r.id))
      .toEqual(questions.slice(1));
    expect((await owner.query('SELECT scope,used FROM quota_counter WHERE scope=ANY($1::text[]) ORDER BY scope', [scopes])).rows)
      .toEqual(scopes.slice(1).sort().map((scope) => ({ scope, used: 17 })));
    expect((await retainRecentData(service)).skipped).toBe(false);
    expect((await owner.query('SELECT used FROM quota_counter WHERE scope=$1', [scopes[3]])).rows[0].used).toBe(17);
  });
  it('cross-worker advisory lock skips a second cleanup; rollback restores tentative cleanup on failure', async () => {
    const c = await owner.connect();
    try {
      await c.query('BEGIN'); await c.query('SELECT pg_advisory_xact_lock(15615,1)');
      expect(await retainRecentData(service)).toEqual({ questions: 0, counters: 0, skipped: true });
    } finally { await c.query('ROLLBACK'); c.release(); }
    const a = await seedTenant(owner);
    const old = (await owner.query<{ id: string }>(`INSERT INTO question_log(bot_id,account_id,channel,question,outcome,created_at)
      VALUES($1,$2,'demo','rollback retention','answered',now()-interval '31 days') RETURNING id`, [a.botId,a.accountId])).rows[0]!.id;
    const failing = new Proxy(service, { get(pool,key) {
      if (key === 'connect') return async () => {
        const client = await pool.connect(); return new Proxy(client, { get(c,prop) {
          if (prop === 'query') return async (sql: string, values?: unknown[]) => {
            if (sql.includes('DELETE FROM quota_counter')) throw new Error('injected retention failure');
            return c.query(sql,values);
          };
          const value=Reflect.get(c,prop);return typeof value==='function'?value.bind(c):value;
        } });
      };
      const value=Reflect.get(pool,key);return typeof value==='function'?value.bind(pool):value;
    } });
    await expect(retainRecentData(failing)).rejects.toThrow('injected retention failure');
    expect((await owner.query('SELECT id FROM question_log WHERE id=$1',[old])).rowCount).toBe(1);
  });
});
