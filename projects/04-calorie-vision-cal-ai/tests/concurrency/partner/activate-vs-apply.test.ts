// RV-partner-codes-and-cabinet-02 (правка после ревью): `ActivateAttributionOnRecognition`
// (`packages/db/src/partner-attribution.ts`) держала строку `attribution` (`FOR UPDATE`)
// ДО codeLock, а `ApplyPartnerCode` берёт codeLock ДО строки — обратный порядок давал
// РЕАЛЬНЫЙ deadlock: активация держит attribution и ждёт codeLock, повторное применение
// ТОГО ЖЕ кода держит codeLock и ждёт attribution. Тест — управляемое пересечение на
// настоящем PostgreSQL: обе операции одновременно для ОДНОЙ сессии и ОДНОГО кода. Критерий
// — ни один вызов не падает ошибкой `40P01 deadlock detected`, и итоговое состояние
// консистентно независимо от порядка выигрыша.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withTransaction, type DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { applyPartnerCode } from '../../../apps/api/src/partner/apply-partner-code.js';
import { activateAttributionOnRecognition } from '../../../apps/api/src/partner/activate-attribution.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { attributionOf, seedDeviceSession, seedPartner, seedPartnerCode } from '../../helpers/partner.js';

let pool: DbPool;
const logger = createLogger({ service: 'test', sink: () => {} });

beforeAll(async () => {
  pool = await migratedPool('n4-tests-activate-vs-apply');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

describe('конкурентное пересечение: активация и повторное применение ТОГО ЖЕ кода одной сессией', () => {
  it('ни один вызов не падает deadlock (40P01); итог — activated РОВНО один раз, повтор применения — conflict', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'RACEACT1');
    const session = await seedDeviceSession(pool, 'race-activate');

    // Pending-атрибуция уже существует (обычный путь ApplyPartnerCode, шаг 9).
    const first = await applyPartnerCode(
      { rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'seed' },
      { pool, logger },
    );
    expect(first).toEqual({ outcome: 'applied' });

    // Управляемое пересечение: активация (codeLock -> sessionLock, после правки RV-02) и
    // ПОВТОРНОЕ применение ТОГО ЖЕ кода (codeLock -> sessionLock, штатный порядок
    // ApplyPartnerCode) — одновременно, реальные параллельные транзакции.
    const results = await Promise.allSettled([
      withTransaction(pool, (client) => activateAttributionOnRecognition(client, session.id)),
      applyPartnerCode(
        { rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'race' },
        { pool, logger },
      ),
    ]);

    for (const result of results) {
      expect(result.status).toBe('fulfilled');
      if (result.status === 'rejected') {
        // Явно назвать ошибку в отчёте теста, если сериализация всё же подвела.
        expect(String(result.reason)).not.toMatch(/deadlock detected|40P01/);
      }
    }

    const [activateResult, applyResult] = results;
    if (activateResult.status === 'fulfilled') {
      expect(activateResult.value).toEqual({ outcome: 'activated' });
    }
    if (applyResult.status === 'fulfilled') {
      // DEC-A-058: исход не изменился, к нему добавилось поле `sameCode` — повтор по ТОЙ ЖЕ
      // ссылке отличается от чужого кода. Поэтому `toMatchObject`, а не `toEqual`; само
      // различение стережёт отдельный тест `same_code`, иначе ослабленное ожидание пусто.
      expect(applyResult.value).toMatchObject({ outcome: 'conflict' }); // тот же код поверх explicit — конфликт (AC-4)
      expect(applyResult.value).toMatchObject({ sameCode: true });
    }

    const attribution = await attributionOf(pool, session.id);
    expect(attribution).toMatchObject({ status: 'activated' });
    expect(attribution?.activated_at).not.toBeNull();

    const events = await pool.query("SELECT count(*)::int AS n FROM growth_event WHERE type = 'activation' AND device_session_id = $1", [session.id]);
    expect(events.rows[0]?.n).toBe(1);
  }, 30_000);
});
