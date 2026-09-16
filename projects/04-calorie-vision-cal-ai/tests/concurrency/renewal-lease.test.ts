// Аренда продления: N воркеров на M подписок — ни одна не списана дважды, ни одна не
// потеряна. Разделяемый ресурс проверяется КОНКУРЕНТНО (`shared-resource-verification.md`):
// последовательный прогон зеленеет и при аренде, и без неё.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { createFakePaymentProvider } from '../../apps/api/src/payments/fake.js';
import { initiateRenewal, leaseDueSubscription, MAX_RENEWAL_ATTEMPTS, type RenewalDeps } from '../../apps/api/src/renewals/renew.js';
import { migratedPool, truncateAll } from '../helpers/db.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-renewal-lease');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

function deps(): RenewalDeps {
  return {
    pool,
    payments: createFakePaymentProvider({ feeBp: 300 }),
    priceMinor: 100_000,
    appOrigin: 'https://tarelka.example',
    leaseSeconds: 30,
    logger: createLogger({ service: 'renewal-test', sink: () => {} }),
  };
}

/** Подписка с ИСТЁКШИМ периодом — то есть подлежащая продлению прямо сейчас. */
async function seedDueSubscription(): Promise<string> {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO account (telegram_user_id, status) VALUES ($1, 'active') RETURNING id`,
    [Math.floor(Math.random() * 1_000_000_000)],
  );
  const subscription = await pool.query<{ id: string }>(
    `INSERT INTO subscription (account_id, status, price_minor, current_period_start, current_period_end, provider)
     VALUES ($1, 'active', 100000, now() - interval '31 days', now() - interval '1 minute', 'fake') RETURNING id`,
    [account.rows[0]!.id],
  );
  return subscription.rows[0]!.id;
}

describe('аренда продления', () => {
  it('10 воркеров на 3 подписки: каждая арендована РОВНО одним, ни одна не потеряна', async () => {
    const ids = await Promise.all([seedDueSubscription(), seedDueSubscription(), seedDueSubscription()]);
    const shared = deps();

    const leased = await Promise.all(
      Array.from({ length: 10 }, () => leaseDueSubscription(shared, randomUUID())),
    );

    const taken = leased.filter((l): l is NonNullable<typeof l> => l !== undefined).map((l) => l.id);
    // Ровно три аренды: больше означало бы двойное списание, меньше — потерянную подписку.
    expect(taken).toHaveLength(3);
    expect(new Set(taken).size).toBe(3);
    expect(new Set(taken)).toEqual(new Set(ids));
  }, 60_000);

  it('повторная аренда той же подписки невозможна, пока аренда не истекла', async () => {
    await seedDueSubscription();
    const shared = deps();
    expect(await leaseDueSubscription(shared, randomUUID())).toBeDefined();
    // Второй воркер не видит занятую строку — предикат аренды, а не координация в памяти.
    expect(await leaseDueSubscription(shared, randomUUID())).toBeUndefined();
  }, 30_000);

  it('идемпотентный ключ продления: повтор воркера НЕ создаёт второй платёж', async () => {
    const id = await seedDueSubscription();
    const shared = deps();
    const leased = (await leaseDueSubscription(shared, randomUUID()))!;

    const first = await initiateRenewal(shared, leased);
    // Тот же fence — тот же ключ: повтор попадает в ТО ЖЕ намерение.
    const second = await initiateRenewal(shared, leased);
    expect(first.kind).toBe('initiated');
    expect(second).toEqual(first);

    const intents = await pool.query<{ c: string }>(`SELECT count(*) c FROM payment_intent`);
    expect(Number(intents.rows[0]!.c)).toBe(1);
    expect(id).toBeDefined();
  }, 30_000);

  it('недоступность провайдера НЕ увеличивает счётчик неудач подписки', async () => {
    await seedDueSubscription();
    const broken: RenewalDeps = { ...deps(), payments: createFakePaymentProvider({ unavailable: true }) };
    const leased = (await leaseDueSubscription(broken, randomUUID()))!;

    const outcome = await initiateRenewal(broken, leased);
    expect(outcome.kind).toBe('provider_unavailable');

    // Трёхчасовой сбой платёжной системы не должен закрыть все подписки разом.
    const row = await pool.query<{ failed_renewals: number; status: string }>(
      `SELECT failed_renewals, status::text AS status FROM subscription`,
    );
    expect(row.rows[0]!.failed_renewals).toBe(0);
    expect(row.rows[0]!.status).toBe('active');
  }, 30_000);

  it('подписка, исчерпавшая попытки, больше не арендуется', async () => {
    await seedDueSubscription();
    await pool.query(`UPDATE subscription SET failed_renewals = $1`, [MAX_RENEWAL_ATTEMPTS]);
    expect(await leaseDueSubscription(deps(), randomUUID())).toBeUndefined();
  }, 30_000);
});
