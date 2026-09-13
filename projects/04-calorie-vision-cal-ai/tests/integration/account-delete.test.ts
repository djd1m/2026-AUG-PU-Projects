// DELETE /api/v1/account — RevokeConsentOrErase (AC-consent-and-telegram-auth-12/13/14/17).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';
import { buildInitData } from '../helpers/telegram.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-account-delete');
  app = buildServer({ config: testApiConfig(), pool, logger: createLogger({ service: 'api-test', sink: () => {} }) });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

function cookieValue(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (raw === undefined) throw new Error('Set-Cookie отсутствует');
  return raw.split(';')[0]?.split('=')[1] ?? '';
}

async function loggedInAccount(telegramUserId: string): Promise<{ token: string; accountId: string }> {
  const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.40' } });
  const token = cookieValue(device.headers['set-cookie']);
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/telegram',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
    payload: { init_data: buildInitData(telegramUserId) },
  });
  const accountId = (login.json() as { data: { account_id: string } }).data.account_id;
  return { token, accountId };
}

async function seedCardsAndDiary(accountId: string, cards: number, entries: number): Promise<void> {
  const session = await pool.query<{ id: string }>('SELECT id FROM device_session WHERE account_id = $1 LIMIT 1', [accountId]);
  const sessionId = session.rows[0]!.id;
  // ОДНА строка `recognition` НА карточку (`share-card-and-growth-events`, миграция 007:
  // `UNIQUE (recognition_id)` на `share_card` — до неё эта фикстура заводила несколько
  // карточек на ОДИН `recognition_id`, что база теперь честно отвергает; продовый код уже
  // предполагал ровно это ограничение, фикстура просто пользовалась его отсутствием).
  for (let i = 0; i < cards; i += 1) {
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, account_id, status) VALUES ($1, $2, 'done') RETURNING id`,
      [sessionId, accountId],
    );
    await pool.query(`INSERT INTO share_card (owner_key, recognition_id, object_key) VALUES ($1, $2, $3)`, [accountId, recognition.rows[0]!.id, `card-${i}-${accountId}`]);
  }
  // `diary-and-streak` добавила `UNIQUE (recognition_id)` на `diary_entry`
  // (`006_diary_entry_recognition_unique.sql`) — ОДНА запись дневника на ОДИН скан. Каждой
  // записи нужен СВОЙ `recognition`; `share_card` выше такого ограничения не несёт, там общий
  // `recognitionId` остаётся законным.
  for (let i = 0; i < entries; i += 1) {
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, account_id, status) VALUES ($1, $2, 'done') RETURNING id`,
      [sessionId, accountId],
    );
    await pool.query(
      `INSERT INTO diary_entry (owner_key, recognition_id, eaten_on, meal_slot, items, kcal_total, protein_total, fat_total, carb_total, source_snapshot)
       VALUES ($1, $2, CURRENT_DATE, 'lunch', '[]'::jsonb, 100, 1, 1, 1, '{}'::jsonb)`,
      [accountId, recognition.rows[0]!.id],
    );
  }
}

describe('DELETE /api/v1/account', () => {
  it('AC-12: withdraw_consent закрывает карточки немедленно, не трогает дневник, обнуляет consent_at', async () => {
    const { token, accountId } = await loggedInAccount('930001');
    await pool.query(`UPDATE account SET consent_at = now() WHERE id = $1`, [accountId]);
    await seedCardsAndDiary(accountId, 3, 5);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { confirm: true, scope: 'withdraw_consent' },
    });

    expect(response.statusCode).toBe(200);
    const cards = await pool.query('SELECT count(*)::int AS n FROM share_card WHERE owner_key = $1 AND revoked_at IS NOT NULL', [accountId]);
    expect(cards.rows[0]?.n).toBe(3);
    const diary = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE owner_key = $1', [accountId]);
    expect(diary.rows[0]?.n).toBe(5);
    const account = await pool.query<{ consent_at: Date | null }>('SELECT consent_at FROM account WHERE id = $1', [accountId]);
    expect(account.rows[0]?.consent_at).toBeNull();
  });

  it('AC-13: erase_all отвечает синхронно и переводит account в erasing', async () => {
    const { token, accountId } = await loggedInAccount('930002');
    await seedCardsAndDiary(accountId, 2, 5);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { confirm: true, scope: 'erase_all' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { accepted: boolean; erase_deadline: string } };
    expect(body.data.accepted).toBe(true);
    expect(body.data.erase_deadline).toBeTruthy();

    const account = await pool.query<{ status: string; deletion_requested_at: Date | null }>('SELECT status, deletion_requested_at FROM account WHERE id = $1', [accountId]);
    expect(account.rows[0]?.status).toBe('erasing');
    expect(account.rows[0]?.deletion_requested_at).not.toBeNull();

    const cards = await pool.query('SELECT count(*)::int AS n FROM share_card WHERE owner_key = $1 AND revoked_at IS NOT NULL', [accountId]);
    expect(cards.rows[0]?.n).toBe(2);
  });

  it('AC-14: повторный erase_all во время erasing даёт 409, дедлайн не сдвигается', async () => {
    const { token, accountId } = await loggedInAccount('930003');
    await seedCardsAndDiary(accountId, 1, 0);

    const first = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { confirm: true, scope: 'erase_all' },
    });
    const firstDeadline = (first.json() as { data: { erase_deadline: string } }).data.erase_deadline;

    const second = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { confirm: true, scope: 'erase_all' },
    });

    expect(second.statusCode).toBe(409);
    const account = await pool.query<{ deletion_requested_at: Date }>('SELECT deletion_requested_at FROM account WHERE id = $1', [accountId]);
    expect(new Date(account.rows[0]!.deletion_requested_at).getTime() + 72 * 60 * 60 * 1000).toBe(new Date(firstDeadline).getTime());
  });

  it('AC-17: без confirm — 422, статус не меняется', async () => {
    const { token, accountId } = await loggedInAccount('930004');

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { scope: 'erase_all' },
    });

    expect(response.statusCode).toBe(422);
    const account = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId]);
    expect(account.rows[0]?.status).toBe('active');
  });

  it('без сессии, связанной с аккаунтом — 401', async () => {
    const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.41' } });
    const token = cookieValue(device.headers['set-cookie']);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { confirm: true, scope: 'erase_all' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('Authorization: Bearer с тем же токеном сессии работает так же, как cookie', async () => {
    const { token, accountId } = await loggedInAccount('930005');

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { confirm: true, scope: 'withdraw_consent' },
    });

    expect(response.statusCode).toBe(200);
    const account = await pool.query<{ consent_at: Date | null }>('SELECT consent_at FROM account WHERE id = $1', [accountId]);
    expect(account.rows[0]?.consent_at).toBeNull();
  });

  it('review3 RV-03 (high): УПРАВЛЯЕМЫЙ барьер — карточка, создающаяся параллельно (уже держит блокировку account), коммитится ДО withdraw_consent — ОБЯЗАНА быть закрыта, не пережить отзыв', async () => {
    // Раньше карточки закрывались (`UPDATE share_card`) ДО блокировки строки `account` —
    // конкурентный `createShareCardGuarded`, уже держащий блокировку account (согласие
    // проверено GRANTED) и готовящий INSERT, был этим шагом НЕ ВИДЕН (он не трогал account и
    // потому ничем не блокировался). Барьер ниже принудительно ставит держателя блокировки
    // account ПЕРВЫМ и коммитит его СРЕДИ жизни промиса DELETE — воспроизводит ТОЧНОЕ
    // чередование из находки, а не полагается на удачу планировщика ОС.
    const { token, accountId } = await loggedInAccount('930010');
    await pool.query(`UPDATE account SET consent_at = now() WHERE id = $1`, [accountId]);
    const session = await pool.query<{ id: string }>('SELECT id FROM device_session WHERE account_id = $1 LIMIT 1', [accountId]);
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, account_id, status) VALUES ($1, $2, 'done') RETURNING id`,
      [session.rows[0]!.id, accountId],
    );
    const recognitionId = recognition.rows[0]!.id;

    const lockClient = await pool.connect();
    try {
      await lockClient.query('BEGIN');
      // Имитирует enforceConsentBeforeDiaryWrite, УЖЕ прошедший проверку (GRANTED) и
      // держащий блокировку account перед INSERT новой карточки.
      await lockClient.query('SELECT consent_at FROM account WHERE id = $1 FOR UPDATE', [accountId]);

      // Карточка вставляется (та же незакоммиченная транзакция, лок account ещё удерживается)
      // ДО того, как DELETE вообще стартует — это и есть управляемый барьер: с ПРАВИЛЬНЫМ
      // порядком (account заблокирован первым) DELETE не может добраться до `UPDATE share_card`
      // раньше нашего COMMIT ни при каком планировщике ОС, потому что его САМАЯ ПЕРВАЯ операция
      // упирается в удерживаемый лок account. Со СТАРЫМ порядком (карточки закрываются до
      // блокировки account) DELETE способен выполнить `UPDATE share_card` НЕМЕДЛЕННО — карточка
      // ещё не закоммичена и потому НЕВИДИМА для него (READ COMMITTED), и отозвать её после
      // этой точки уже НЕЧЕМ, каким бы ни было дальнейшее чередование.
      const card = await lockClient.query<{ id: string }>(
        `INSERT INTO share_card (owner_key, recognition_id, object_key) VALUES ($1, $2, $3) RETURNING id`,
        [accountId, recognitionId, 'review3-rv03-card'],
      );

      const deletePromise = app.inject({
        method: 'DELETE',
        url: '/api/v1/account',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
        payload: { confirm: true, scope: 'withdraw_consent' },
      });

      // Детерминированное ожидание БЕЗ фиксированной паузы: коммитим ТОЛЬКО когда DELETE
      // РЕАЛЬНО упёрся в удерживаемый лок account (виден в `pg_stat_activity` как
      // `wait_event_type = 'Lock'`). Это верно для ЛЮБОГО порядка операций внутри DELETE: если
      // блокировка запрошена ПЕРВОЙ (правка) — она видна почти сразу; если ПОСЛЕ `UPDATE
      // share_card` (старый порядок) — она видна ровно тогда, когда та `UPDATE` уже выполнена.
      // В обоих случаях к моменту, когда мы это наблюдаем, всё, что DELETE собирался сделать
      // ДО обращения к account, уже случилось — коммитить раньше этого момента бессмысленно,
      // ждать дольше не нужно.
      const deadline = Date.now() + 5_000;
      let observedBlocked = false;
      while (Date.now() < deadline) {
        const waiting = await pool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity
           WHERE wait_event_type = 'Lock' AND pid != pg_backend_pid() AND datname = current_database()`,
        );
        if ((waiting.rows[0]?.n ?? 0) > 0) {
          observedBlocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(observedBlocked).toBe(true); // страж на сам барьер: если ложь — тест ничего не доказывает

      await lockClient.query('COMMIT');

      const deleteResponse = await deletePromise;
      expect(deleteResponse.statusCode).toBe(200);

      const cardRow = await pool.query<{ revoked_at: Date | null }>('SELECT revoked_at FROM share_card WHERE id = $1', [card.rows[0]!.id]);
      expect(cardRow.rows[0]?.revoked_at).not.toBeNull();
    } finally {
      lockClient.release();
    }
  });

  it('RV-05: отозванное согласие НЕ восстанавливается повторным входом (анонимное согласие → вход → withdraw → вход с новой initData)', async () => {
    const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.42' } });
    const token = cookieValue(device.headers['set-cookie']);
    const { computeConsentTextHash } = await import('../../apps/api/src/consent/known-versions.js');

    // 1. Согласие даётся АНОНИМНО, до первого входа через Telegram.
    await app.inject({
      method: 'POST',
      url: '/api/v1/consent',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { decision: 'grant', consent_version: '2026-09-v1', consent_text_hash: computeConsentTextHash('2026-09-v1') },
    });

    // 2. Первый вход — согласие переносится на аккаунт (сессия ещё НЕ была связана).
    const firstLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('930006', { authDateSecondsAgo: 30, queryId: 'first' }) },
    });
    expect(firstLogin.statusCode).toBe(200);
    const accountId = (firstLogin.json() as { data: { account_id: string } }).data.account_id;
    const afterFirstLogin = await pool.query<{ consent_at: Date | null }>('SELECT consent_at FROM account WHERE id = $1', [accountId]);
    expect(afterFirstLogin.rows[0]?.consent_at).not.toBeNull();

    // 3. Пользователь ОТЗЫВАЕТ согласие.
    const withdraw = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { confirm: true, scope: 'withdraw_consent' },
    });
    expect(withdraw.statusCode).toBe(200);
    const afterWithdraw = await pool.query<{ consent_at: Date | null }>('SELECT consent_at FROM account WHERE id = $1', [accountId]);
    expect(afterWithdraw.rows[0]?.consent_at).toBeNull();

    // 4. ПОВТОРНЫЙ вход, НОВАЯ initData, ТА ЖЕ (уже связанная) сессия — раньше это восстанавливало
    // consent_at из device_session.consent_at, которое отзыв не трогал.
    const secondLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('930006', { authDateSecondsAgo: 5, queryId: 'second' }) },
    });
    expect(secondLogin.statusCode).toBe(200);
    const afterSecondLogin = await pool.query<{ consent_at: Date | null }>('SELECT consent_at FROM account WHERE id = $1', [accountId]);
    expect(afterSecondLogin.rows[0]?.consent_at).toBeNull();
  });
});
