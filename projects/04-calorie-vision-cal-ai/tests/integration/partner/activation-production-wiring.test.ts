// RV-partner-codes-and-cabinet-01 (правка после ревью, blocker): ДО правки
// `activateAttributionOnRecognition` не вызывалась НИКАКИМ продакшен-путём — успешное
// распознавание оставляло `pending`-атрибуцию нетронутой навсегда. Этот тест НЕ вызывает
// функцию активации напрямую (это делают AC-12/13/14 в `activate-attribution.test.ts`):
// он проходит НАСТОЯЩИЙ путь завершения распознавания — `acquireLease` + РЕАЛЬНЫЙ
// `recordResult` из `apps/recognizer/src/lease.ts`, ровно та функция, что вызывает
// `apps/recognizer/src/recognize/recognize-scan.ts` в проде.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { acquireLease, recordResult } from '../../../apps/recognizer/src/lease.js';
import { applyPartnerCode } from '../../../apps/api/src/partner/apply-partner-code.js';
import { migratedPool, seedPhoto, truncateAll } from '../../helpers/db.js';
import { attributionOf, seedDeviceSession, seedPartner, seedPartnerCode } from '../../helpers/partner.js';

let pool: DbPool;
const logger = createLogger({ service: 'test', sink: () => {} });

beforeAll(async () => {
  pool = await migratedPool('n4-tests-activation-production-wiring');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

async function queueRecognition(deviceSessionId: string, marker: string): Promise<string> {
  const photoId = await seedPhoto(pool, deviceSessionId, marker);
  const created = await pool.query<{ id: string }>(
    `INSERT INTO recognition (device_session_id, photo_id, status, idempotency_key) VALUES ($1, $2, 'queued', $3) RETURNING id`,
    [deviceSessionId, photoId, randomUUID()],
  );
  const id = created.rows[0]?.id;
  if (id === undefined) throw new Error('recognition не создан');
  return id;
}

const DONE_RECORD = {
  status: 'done' as const,
  confidence: 0.9,
  items: [],
  modelEstimateKcal: 300,
  modelUsed: 'haiku-4.5' as const,
  failureReason: null,
  escalated: false,
  attemptNo: 1,
  // Три числа источника приехали из фичи `source-and-correct` уже после того, как этот тест
  // был написан: `recordResult` пишет их в той же строке, что и статус. Здесь они NULL
  // осознанно — тест про АКТИВАЦИЮ атрибуции, а не про подсчёт калорий, и подстановка
  // правдоподобных чисел сделала бы вид, что он проверяет и это тоже.
  dbKcalTotal: null,
  discrepancyRatio: null,
  conflictFlag: false,
};

describe('RV-01: настоящее завершение распознавания активирует партнёрскую атрибуцию', () => {
  it('recordResult(status=done) реальным путём переводит pending-атрибуцию в activated и пишет growth_event(activation)', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'WIRED111');
    const session = await seedDeviceSession(pool, 'wired-done');
    const applied = await applyPartnerCode(
      { rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'seed' },
      { pool, logger },
    );
    expect(applied).toEqual({ outcome: 'applied' });
    expect((await attributionOf(pool, session.id))?.status).toBe('pending');

    const recognitionId = await queueRecognition(session.id, 'wired-done');
    const leased = await acquireLease(pool, randomUUID());
    expect(leased?.id).toBe(recognitionId);

    const writeOutcome = await recordResult(pool, { id: recognitionId, fence: leased!.fence }, DONE_RECORD);
    expect(writeOutcome).toBe('written');

    const attribution = await attributionOf(pool, session.id);
    expect(attribution?.status).toBe('activated');
    expect(attribution?.activated_at).not.toBeNull();

    const events = await pool.query("SELECT count(*)::int AS n FROM growth_event WHERE type = 'activation' AND device_session_id = $1", [session.id]);
    expect(events.rows[0]?.n).toBe(1);
  });

  it('повторное успешное распознавание ТОЙ ЖЕ сессии — идемпотентно, второе activation-событие не создаётся', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'WIRED222');
    const session = await seedDeviceSession(pool, 'wired-twice');
    await applyPartnerCode(
      { rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'seed' },
      { pool, logger },
    );

    const firstRecognitionId = await queueRecognition(session.id, 'wired-twice-1');
    const firstLease = await acquireLease(pool, randomUUID());
    await recordResult(pool, { id: firstRecognitionId, fence: firstLease!.fence }, DONE_RECORD);

    const secondRecognitionId = await queueRecognition(session.id, 'wired-twice-2');
    const secondLease = await acquireLease(pool, randomUUID());
    expect(secondLease?.id).toBe(secondRecognitionId);
    const secondWriteOutcome = await recordResult(pool, { id: secondRecognitionId, fence: secondLease!.fence }, DONE_RECORD);
    expect(secondWriteOutcome).toBe('written'); // второе распознавание пишется штатно…

    const attribution = await attributionOf(pool, session.id);
    expect(attribution?.status).toBe('activated'); // …но атрибуция не трогается повторно (already_settled внутри)
    const events = await pool.query("SELECT count(*)::int AS n FROM growth_event WHERE type = 'activation' AND device_session_id = $1", [session.id]);
    expect(events.rows[0]?.n).toBe(1);
  });

  it('сессия без атрибуции (нет кода) — обычное распознавание проходит штатно, no_attribution не создаёт события', async () => {
    const session = await seedDeviceSession(pool, 'wired-no-code');
    const recognitionId = await queueRecognition(session.id, 'wired-no-code');
    const leased = await acquireLease(pool, randomUUID());
    const writeOutcome = await recordResult(pool, { id: recognitionId, fence: leased!.fence }, DONE_RECORD);
    expect(writeOutcome).toBe('written');

    const events = await pool.query("SELECT count(*)::int AS n FROM growth_event WHERE type = 'activation' AND device_session_id = $1", [session.id]);
    expect(events.rows[0]?.n).toBe(0);
  });

  it('устаревший fence (проигравший воркер) НЕ активирует и не пишет recognition — общий откат: ни статус, ни атрибуция не меняются', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'WIRED333');
    const session = await seedDeviceSession(pool, 'wired-stale');
    await applyPartnerCode(
      { rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'seed' },
      { pool, logger },
    );

    const recognitionId = await queueRecognition(session.id, 'wired-stale');
    const firstOwner = await acquireLease(pool, randomUUID());
    // Аренда истекает, второй воркер перезахватывает — fence растёт.
    await pool.query("UPDATE recognition SET leased_until = now() - interval '1 minute' WHERE id = $1", [recognitionId]);
    const secondOwner = await acquireLease(pool, randomUUID());
    expect(secondOwner?.fence).toBe(2);

    // Первый (проигравший) воркер пытается записать результат СВОИМ устаревшим fence —
    // UPDATE не находит строку (fence не совпадает), транзакция откатывается ЦЕЛИКОМ:
    // активация НЕ вызывается вовсе (не только не коммитится).
    const staleOutcome = await recordResult(pool, { id: recognitionId, fence: firstOwner!.fence }, DONE_RECORD);
    expect(staleOutcome).toBe('stale_lease_result');

    const attribution = await attributionOf(pool, session.id);
    expect(attribution?.status).toBe('pending'); // не тронута проигравшей попыткой
  });
});
