// OWN-012, путь плательщика: активная подписка — единственный источник «оплачен».
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { hasActiveSubscription, resolveTier } from '../../apps/api/src/subscription/is-pro.js';
import { migratedPool, truncateAll } from '../helpers/db.js';

let pool: DbPool;
beforeAll(async () => { pool = await migratedPool('n4-tests-subscription-tier'); }, 60_000);
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await truncateAll(pool); });

async function account(): Promise<string> {
  return (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash) VALUES ('p@example.com', 'x') RETURNING id`)).rows[0]!.id;
}
async function subscription(accountId: string, status: string, endsInDays: number): Promise<void> {
  await pool.query(
    `INSERT INTO subscription (account_id, status, price_minor, current_period_start, current_period_end, provider)
     VALUES ($1, $2::subscription_status, 100000, now() + make_interval(days => $3) - interval '30 days', now() + make_interval(days => $3), 'fake')`,
    [accountId, status, endsInDays],
  );
}

describe('resolveTier / hasActiveSubscription', () => {
  it('анонимная сессия и аккаунт без подписки — free', async () => {
    expect(await resolveTier(pool, null)).toBe('free');
    expect(await resolveTier(pool, await account())).toBe('free');
  });
  it('активная подписка с неистёкшим периодом — paid', async () => {
    const id = await account();
    await subscription(id, 'active', 10);
    expect(await hasActiveSubscription(pool, id)).toBe(true);
    expect(await resolveTier(pool, id)).toBe('paid');
  });
  it('активная по статусу, но период кончился — free (истечение не ждёт уборщика)', async () => {
    const id = await account();
    await subscription(id, 'active', -1);
    expect(await resolveTier(pool, id)).toBe('free');
  });
  it('past_due / canceled / expired — free', async () => {
    for (const status of ['past_due', 'canceled', 'expired']) {
      await truncateAll(pool);
      const id = await account();
      await subscription(id, status, 10);
      expect(await resolveTier(pool, id), status).toBe('free');
    }
  });
});
