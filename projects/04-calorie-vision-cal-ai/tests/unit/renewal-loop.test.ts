// Цикл продлений: свойства САМОГО цикла, а не аренды (её проверяет конкурентный тест).
// Слой unit: планировщик проверяется подменой зависимостей, база для этого не нужна.

import { describe, expect, it, vi } from 'vitest';
import { runRenewalPass } from '../../apps/api/src/renewals/loop.js';
import type { RenewalDeps } from '../../apps/api/src/renewals/renew.js';
import { createLogger } from '@n4/shared';

function depsWith(overrides: Partial<RenewalDeps> = {}): RenewalDeps {
  return {
    pool: {} as RenewalDeps['pool'],
    payments: {} as RenewalDeps['payments'],
    priceMinor: 100_000,
    appOrigin: 'https://tarelka.example',
    leaseSeconds: 30,
    logger: createLogger({ service: 'test', sink: () => {} }),
    ...overrides,
  };
}

// Подменяем модуль аренды: цикл проверяется без базы, а сама аренда — отдельным
// конкурентным тестом на настоящем PostgreSQL.
vi.mock('../../apps/api/src/renewals/renew.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../apps/api/src/renewals/renew.js')>();
  return { ...actual, leaseDueSubscription: vi.fn(), initiateRenewal: vi.fn() };
});

const { leaseDueSubscription, initiateRenewal } = await import('../../apps/api/src/renewals/renew.js');

describe('проход цикла продлений', () => {
  it('останавливается, когда продлевать нечего — не крутит вхолостую до batchSize', async () => {
    vi.mocked(leaseDueSubscription).mockResolvedValue(undefined);
    const handled = await runRenewalPass(depsWith(), { intervalMs: 1000, batchSize: 50 });
    expect(handled).toBe(0);
    expect(leaseDueSubscription).toHaveBeenCalledTimes(1);
  });

  it('обрабатывает не больше batchSize за проход: всплеск просрочек не держит процесс', async () => {
    vi.mocked(leaseDueSubscription).mockResolvedValue({ id: 's', account_id: 'a', fence: 1, failed_renewals: 0 });
    vi.mocked(initiateRenewal).mockResolvedValue({ kind: 'initiated', intentId: 'i' });
    const handled = await runRenewalPass(depsWith(), { intervalMs: 1000, batchSize: 5 });
    expect(handled).toBe(5);
  });

  it('недоступность провайдера прекращает ВЕСЬ проход, а не только одну подписку', async () => {
    vi.mocked(leaseDueSubscription).mockResolvedValue({ id: 's', account_id: 'a', fence: 1, failed_renewals: 0 });
    vi.mocked(initiateRenewal).mockResolvedValue({ kind: 'provider_unavailable' });
    // Иначе двадцать подписок — двадцать стуков в лежащий сервис и двадцать таймаутов.
    const handled = await runRenewalPass(depsWith(), { intervalMs: 1000, batchSize: 20 });
    expect(handled).toBe(1);
  });
});
