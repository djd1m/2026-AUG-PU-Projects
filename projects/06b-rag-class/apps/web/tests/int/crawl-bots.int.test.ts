import { afterAll, describe, expect, it, vi } from 'vitest';
import { type Pool } from '@n6b/db';
import { createBotHandler } from '@/server/bots-handler';
import { createSourceHandler } from '@/server/jobs-handler';
import { ownerPool, tenantPool } from '../../../../packages/db/tests/int/helpers';
import { seedBot } from '../../../../services/worker/tests/int/helpers';
const owner = ownerPool();
const tenant = tenantPool();
afterAll(async () => { await Promise.all([owner.end(), tenant.end()]); });
const BASE = 'https://n6b.example.test';
const post = (body: unknown) => new Request(BASE + '/api/bots', { method: 'POST',
  headers: { origin: BASE, cookie: `n6b_session=${'a'.repeat(43)}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const resolver = async () => [{ address: '93.184.216.34', family: 4 }];
describe('создание bot/source/job атомарно и RLS', () => {
  it('SC-US-002-1: 202 bot_id/public_id/job_id, всё queued до обхода; без URL 201', async () => {
    const { accountId } = await seedBot(owner);
    const handler = createBotHandler({ tenantPool: tenant, publicBaseUrl: BASE, authenticate: async () => accountId, resolver });
    const start = Date.now();
    const response = await handler(post({ name: 'Сайт', site_url: 'https://fixture.test/' }));
    expect(response.status).toBe(202); expect(Date.now() - start).toBeLessThan(1000);
    const { data } = await response.json();
    expect(data.public_id).toHaveLength(12);
    const row = (await owner.query(`SELECT b.id, s.url, j.state, j.attempts, j.run_started_at FROM bot b
      JOIN source s ON s.bot_id=b.id JOIN index_job j ON j.source_id=s.id WHERE b.id=$1 AND j.id=$2`, [data.bot_id, data.job_id])).rows[0];
    expect(row).toMatchObject({ url: 'https://fixture.test/', state: 'queued', attempts: 0, run_started_at: null });
    expect((await handler(post({ name: 'Без сайта' }))).status).toBe(201);
  });
  it('SC-US-002-3: обе ручки закрывают mixed/failure DNS, чужой бот 404 до DNS', async () => {
    const a = await seedBot(owner); const b = await seedBot(owner);
    for (const resolve of [async () => { throw new Error('DNS'); },
      async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]]) {
      const lookup = vi.fn(resolve);
      const deps = { tenantPool: tenant, publicBaseUrl: BASE, authenticate: async () => a.accountId, resolver: lookup };
      expect((await createBotHandler(deps)(post({ name: 'X', site_url: 'https://fixture.test' }))).status).toBe(422);
      expect((await createSourceHandler(deps)(post({ url: 'https://fixture.test' }), a.botId)).status).toBe(422);
      lookup.mockClear();
      expect((await createSourceHandler(deps)(post({ url: 'http://127.0.0.1/' }), b.botId)).status).toBe(404);
      expect(lookup).not.toHaveBeenCalled();
    }
    expect((await owner.query('SELECT count(*)::int AS n FROM source WHERE bot_id=$1', [a.botId])).rows[0].n).toBe(0);
  });
  it('ошибка постановки job откатывает bot и source (проверка реальной транзакции)', async () => {
    const { accountId } = await seedBot(owner);
    const fault = new Proxy(tenant, { get(target, key) {
      if (key !== 'connect') return Reflect.get(target, key);
      return async () => {
        const client = await target.connect();
        return new Proxy(client, { get(c, k) {
          if (k === 'query') return (sql: string, args?: unknown[]) => {
            if (sql.startsWith('INSERT INTO index_job')) throw new Error('fixture enqueue fault');
            return c.query(sql, args);
          };
          const value = Reflect.get(c, k); return typeof value === 'function' ? value.bind(c) : value;
        } });
      };
    } }) as Pool;
    const handler = createBotHandler({ tenantPool: fault, publicBaseUrl: BASE,
      authenticate: async () => accountId, resolver, log: () => {} });
    expect((await handler(post({ name: 'Откат', site_url: 'https://fixture.test/' }))).status).toBe(503);
    expect((await owner.query("SELECT count(*)::int AS n FROM bot WHERE name='Откат' AND account_id=$1", [accountId])).rows[0].n).toBe(0);
  });
});
