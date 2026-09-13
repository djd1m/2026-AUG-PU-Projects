// AC-share-card-and-growth-events-12 (FR-9, «Стык 2») — гонка «отзыв согласия ↔ создание
// карточки». Последовательный тест не отличает атомарный `SELECT … FOR UPDATE` от «прочитать,
// потом записать» (`shared-resource-verification.md`) — здесь ДВЕ транзакции сталкиваются за
// ОДНУ и ту же строку `device_session` ПОД УПРАВЛЯЕМЫМ барьером (`pg_stat_activity`, не пауза
// наугад), а не свободным `Promise.all`.
//
// Интерливинг E8 (блокировка ОТЗЫВА раньше — «карточка рождается уже закрытой»/`refused`, БЕЗ
// строки-сироты) реализован здесь ПОЛНОСТЬЮ, барьером, против РЕАЛЬНОГО
// `createShareCardGuarded`. Интерливинг E7 (блокировка СОЗДАНИЯ раньше — «карточка создаётся,
// ЗАТЕМ сметается отзывом») ПОКРЫТ той же техникой в СОСЕДНЕЙ фиче:
// `tests/integration/account-delete.test.ts` → «review3 RV-03 (high)» — тот тест держит лок
// `account` в РУЧНОЙ транзакции (эмулируя `createShareCardGuarded`, уже прошедший проверку) и
// гоняет РЕАЛЬНЫЙ `DELETE /api/v1/account {scope: withdraw_consent}` против него; assertion
// («после COMMIT ручной стороны карточка отозвана») — ТА ЖЕ гарантия FR-9, что здесь. Дублировать
// его здесь означало бы заново реализовать чужой барьер ради того же вывода — вместо этого он назван
// явно, а не пропущен молча (`.claude/rules/replicate-pipeline.md` — гипотеза без подтверждения
// не промотируется, но здесь наоборот: чужой ПОДТВЕРЖДЁННЫЙ тест переиспользуется, а не копируется).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { createShareCardGuarded } from '../../apps/api/src/share/share-card-repository.js';
import { generateSessionToken, hashSessionToken } from '../../apps/api/src/session/create-device-session.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-share-card-consent-race');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

async function seedSessionWithConsent(): Promise<string> {
  const row = await pool.query<{ id: string }>(
    `INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at, consent_at)
     VALUES ($1, '203.0.113.0/24', now() + interval '7 days', now()) RETURNING id`,
    [hashSessionToken(generateSessionToken())],
  );
  return row.rows[0]!.id;
}

async function waitUntilBlocked(deadlineMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const waiting = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE wait_event_type = 'Lock' AND pid != pg_backend_pid() AND datname = current_database()`,
    );
    if ((waiting.rows[0]?.n ?? 0) > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

describe('AC-12 (E8): блокировка ОТЗЫВА раньше создания — createShareCardGuarded видит consent_at NULL', () => {
  it('createShareCardGuarded возвращает refused, share_card НЕ создаётся, строки-сироты нет', async () => {
    const sessionId = await seedSessionWithConsent();
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, status) VALUES ($1, 'done') RETURNING id`,
      [sessionId],
    );
    const recognitionId = recognition.rows[0]!.id;

    // «Отзыв» — ручная транзакция, ДЕРЖАЩАЯ лок device_session ПЕРВЫМ оператором (та же
    // семантика, что реальный RunErasureJob/withdraw_consent: лок раньше решения).
    const revokeClient = await pool.connect();
    try {
      await revokeClient.query('BEGIN');
      await revokeClient.query('SELECT consent_at FROM device_session WHERE id = $1 FOR UPDATE', [sessionId]);

      // createShareCardGuarded запускается ПОКА лок отзыва удержан — его собственный ПЕРВЫЙ
      // оператор (`enforceConsentBeforeDiaryWrite` → `SELECT … FOR UPDATE`) обязан заблокироваться
      // на ТОЙ ЖЕ строке.
      const createPromise = createShareCardGuarded(pool, {
        owner: { table: 'device_session', id: sessionId },
        recognitionId,
        objectKey: `share-cards/${recognitionId}.jpg`,
        badgeRendered: true,
      });

      const observedBlocked = await waitUntilBlocked();
      expect(observedBlocked).toBe(true); // страж на сам барьер — иначе тест ничего не доказывает

      // Отзыв побеждает: обнуляет consent_at и коммитит ДО того, как createShareCardGuarded
      // получит лок.
      await revokeClient.query('UPDATE device_session SET consent_at = NULL WHERE id = $1', [sessionId]);
      await revokeClient.query('COMMIT');

      const result = await createPromise;
      expect(result).toEqual({ outcome: 'refused', reason: 'consent_required' });

      const row = await pool.query('SELECT id FROM share_card WHERE recognition_id = $1', [recognitionId]);
      expect(row.rowCount).toBe(0); // НИ строки-сироты, ни строки вовсе — «отказ = ничего не создано»
    } finally {
      revokeClient.release();
    }
  }, 20_000);

  it('НЕТ ни одного прогона, где после коммита отзыва найдена ОТКРЫТАЯ карточка (revoked_at IS NULL) — 10 повторов барьера', async () => {
    for (let i = 0; i < 10; i += 1) {
      await truncateAll(pool);
      const sessionId = await seedSessionWithConsent();
      const recognition = await pool.query<{ id: string }>(
        `INSERT INTO recognition (device_session_id, status) VALUES ($1, 'done') RETURNING id`,
        [sessionId],
      );
      const recognitionId = recognition.rows[0]!.id;

      const revokeClient = await pool.connect();
      try {
        await revokeClient.query('BEGIN');
        await revokeClient.query('SELECT consent_at FROM device_session WHERE id = $1 FOR UPDATE', [sessionId]);
        const createPromise = createShareCardGuarded(pool, {
          owner: { table: 'device_session', id: sessionId },
          recognitionId,
          objectKey: `share-cards/${recognitionId}-${i}.jpg`,
          badgeRendered: true,
        });
        expect(await waitUntilBlocked()).toBe(true);
        await revokeClient.query('UPDATE device_session SET consent_at = NULL WHERE id = $1', [sessionId]);
        await revokeClient.query('COMMIT');
        await createPromise;
      } finally {
        revokeClient.release();
      }

      const openCard = await pool.query('SELECT id FROM share_card WHERE recognition_id = $1 AND revoked_at IS NULL', [recognitionId]);
      expect(openCard.rowCount, `прогон ${i}`).toBe(0);
    }
  }, 60_000);
});
