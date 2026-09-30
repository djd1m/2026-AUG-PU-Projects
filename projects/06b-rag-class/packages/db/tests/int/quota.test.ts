import { afterAll, describe, expect, it } from 'vitest';
import { moscowDay, moscowHour, QuotaRefused, reserveQuota, reserveQuotaNow } from '../../src/quota';
import { withService } from '../../src/tenant';
import { appPool, ownerPool, uniq } from './helpers';

const owner = ownerPool();
const app = appPool(10);
afterAll(async () => { await owner.end(); await app.end(); });

const used = async (scope: string) =>
  Number((await owner.query('SELECT coalesce(sum(used), 0)::int AS n FROM quota_counter WHERE scope = $1', [scope]))
    .rows[0].n);

describe('атомарная квота (N4 #14, shared-resource-verification)', () => {
  it('конкурентно: 50 одновременных резервов при пределе 3 → ровно 3 разрешены', async () => {
    const scope = uniq('test:parallel');
    const results = await Promise.all(Array.from({ length: 50 }, () => reserveQuotaNow(app, [{ scope, limit: 3 }])));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(await used(scope)).toBe(3);
  });

  it('все ключи попытки в одной транзакции: отказ второго ключа откатывает первый', async () => {
    const first = uniq('test:first');
    const second = uniq('test:second');
    await reserveQuotaNow(app, [{ scope: second, limit: 1 }]);
    const r = await reserveQuotaNow(app, [{ scope: first, limit: 10 }, { scope: second, limit: 1 }]);
    expect(r).toEqual({ ok: false, scope: second });
    expect(await used(first)).toBe(0);
  });

  it('непригодный предел — исключение, а не «без ограничений»', async () => {
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(reserveQuotaNow(app, [{ scope: uniq('test:bad'), limit }])).rejects.toThrow(/непригодный предел/);
    }
    await expect(reserveQuotaNow(app, [])).rejects.toThrow(/без ключей/);
  });

  it('резерв больше предела отвергается сразу', async () => {
    await expect(withService(app, (c) => reserveQuota(c, [{ scope: uniq('test:n'), limit: 2, n: 3 }], moscowDay())))
      .rejects.toBeInstanceOf(QuotaRefused);
  });

  it('сутки и час — по Москве', () => {
    const at = new Date('2026-09-30T21:30:00Z'); // 00:30 МСК следующего дня
    expect(moscowDay(at)).toBe('2026-10-01');
    expect(moscowHour(at)).toBe('2026-10-01T00');
  });
});
