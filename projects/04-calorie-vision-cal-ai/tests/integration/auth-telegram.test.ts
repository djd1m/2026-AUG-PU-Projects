// POST /api/v1/auth/telegram — TelegramLogin (AC-consent-and-telegram-auth-1/2/6/8/20).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';
import { buildInitData } from '../helpers/telegram.js';
import { createShareCardGuarded } from '../../apps/api/src/share/share-card-repository.js';
import { runErasureJob, type PhotoStorePort } from '../../apps/recognizer/src/consent/erasure-job.js';
import { computeConsentTextHash } from '../../apps/api/src/consent/known-versions.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-auth-telegram');
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

async function createAnonymousSession(): Promise<{ token: string }> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.9' } });
  return { token: cookieValue(response.headers['set-cookie']) };
}

async function seedDiaryEntries(sessionId: string, count: number): Promise<void> {
  // `diary-and-streak` добавила `UNIQUE (recognition_id)` на `diary_entry`
  // (`006_diary_entry_recognition_unique.sql`) — ОДНА запись дневника на ОДИН скан, как и в
  // продукте (`ConfirmDiaryEntry` создаёт ровно одну строку за подтверждение). Каждой записи
  // нужен СВОЙ `recognition`, а не общий на все `count`.
  for (let i = 0; i < count; i += 1) {
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, status) VALUES ($1, 'done') RETURNING id`,
      [sessionId],
    );
    await pool.query(
      `INSERT INTO diary_entry (owner_key, recognition_id, eaten_on, meal_slot, items, kcal_total, protein_total, fat_total, carb_total, source_snapshot)
       VALUES ($1, $2, CURRENT_DATE, 'lunch', '[]'::jsonb, 100, 1, 1, 1, '{}'::jsonb)`,
      [sessionId, recognition.rows[0]!.id],
    );
  }
}

describe('POST /api/v1/auth/telegram', () => {
  it('AC-1: успешный вход переносит дневник целиком (3 записи)', async () => {
    const { token } = await createAnonymousSession();
    // ID сессии нужен для посева дневника — читаем напрямую по факту единственной строки.
    const sessions = await pool.query<{ id: string }>('SELECT id FROM device_session');
    const sessionId = sessions.rows[0]!.id;
    await seedDiaryEntries(sessionId, 3);

    const initData = buildInitData('700001');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: initData },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { account_id: string; migrated_entries: number } };
    expect(body.data.migrated_entries).toBe(3);
    // RV-13/AC-1: «с установкой cookie» относится и к УЖЕ существующей анонимной сессии, не
    // только к вновь выпущенной.
    expect(response.headers['set-cookie']).toBeDefined();
    expect(cookieValue(response.headers['set-cookie'])).toBe(token);

    const remaining = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE owner_key = $1', [sessionId]);
    expect(remaining.rows[0]?.n).toBe(0);
    const migrated = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE owner_key = $1', [body.data.account_id]);
    expect(migrated.rows[0]?.n).toBe(3);

    // RV-06: анонимное recognition, созданное seedDiaryEntries, обязано перейти во владение
    // аккаунта при входе — иначе эразура искала бы активные/удаляемые сканы мимо него.
    const recognition = await pool.query<{ account_id: string | null }>('SELECT account_id FROM recognition WHERE device_session_id = $1', [sessionId]);
    expect(recognition.rows[0]?.account_id).toBe(body.data.account_id);
  });

  it('AC-6: вход с другого устройства не теряет и не дублирует дневник ОБОИХ устройств', async () => {
    // RV-consent-and-telegram-auth-08 (третий обзор): раньше устройство A начинало с ПУСТОГО
    // дневника — тест не мог отличить «дневник A сохранён» от «дневника A никогда не было».
    // Теперь ОБА устройства несут записи ДО входа B.
    const sessionA = await createAnonymousSession();
    const sessionsBefore = await pool.query<{ id: string }>('SELECT id FROM device_session ORDER BY created_at');
    const sessionAId = sessionsBefore.rows[0]!.id;
    await seedDiaryEntries(sessionAId, 4);

    const initData = buildInitData('700002');
    const loginA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionA.token}`, 'content-type': 'application/json' },
      payload: { init_data: initData },
    });
    expect(loginA.statusCode).toBe(200);
    const loginABody = loginA.json() as { data: { account_id: string; migrated_entries: number } };
    expect(loginABody.data.migrated_entries).toBe(4);
    const accountId = loginABody.data.account_id;

    const sessionB = await createAnonymousSession();
    const sessions = await pool.query<{ id: string }>('SELECT id FROM device_session ORDER BY created_at');
    const sessionBId = sessions.rows[1]!.id;
    await seedDiaryEntries(sessionBId, 2);

    const initDataB = buildInitData('700002', { authDateSecondsAgo: 5, queryId: 'from-device-b' });
    const loginB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionB.token}`, 'content-type': 'application/json' },
      payload: { init_data: initDataB },
    });

    expect(loginB.statusCode).toBe(200);
    const bodyB = loginB.json() as { data: { account_id: string; migrated_entries: number } };
    expect(bodyB.data.account_id).toBe(accountId);
    // Перенос сессии B ЗАТРАГИВАЕТ только записи B (`WHERE owner_key = session_id`) — уже
    // перенесённые записи A (`owner_key = accountId`) не совпадают с предикатом.
    expect(bodyB.data.migrated_entries).toBe(2);

    // ОБЩИЙ итог — 4 (A) + 2 (B) = 6, а не только последняя миграция: доказывает, что вход B
    // НЕ затёр и НЕ продублировал уже перенесённый дневник A.
    const total = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE owner_key = $1', [accountId]);
    expect(total.rows[0]?.n).toBe(6);
  });

  it('AC-20: повторный вход после erased создаёт новый аккаунт, старые данные не восстанавливаются', async () => {
    const session1 = await createAnonymousSession();
    const login1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session1.token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('700003') },
    });
    const firstAccountId = (login1.json() as { data: { account_id: string } }).data.account_id;
    await pool.query(`UPDATE account SET status = 'erased' WHERE id = $1`, [firstAccountId]);

    const session2 = await createAnonymousSession();
    const login2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session2.token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('700003', { authDateSecondsAgo: 5, queryId: 'after-erase' }) },
    });

    expect(login2.statusCode).toBe(200);
    const secondAccountId = (login2.json() as { data: { account_id: string; migrated_entries: number } }).data.account_id;
    expect(secondAccountId).not.toBe(firstAccountId);

    const accounts = await pool.query('SELECT count(*)::int AS n FROM account WHERE telegram_user_id = $1', ['700003']);
    expect(accounts.rows[0]?.n).toBe(2);
  });

  it('RV-07: несколько erased-строк с одним telegram_user_id — вход находит/создаёт АКТУАЛЬНУЮ, никогда старую erased', async () => {
    // Две УЖЕ erased строки посеяны напрямую (имитация истории удалений до этого теста).
    await pool.query(
      `INSERT INTO account (telegram_user_id, tier, status) VALUES ($1, 'free', 'erased'), ($1, 'free', 'erased')`,
      ['700006'],
    );

    const session = await createAnonymousSession();
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session.token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('700006') },
    });

    expect(login.statusCode).toBe(200);
    const newAccountId = (login.json() as { data: { account_id: string } }).data.account_id;
    const erasedIds = await pool.query<{ id: string }>(`SELECT id FROM account WHERE telegram_user_id = $1 AND status = 'erased'`, ['700006']);
    expect(erasedIds.rows.map((r) => r.id)).not.toContain(newAccountId);

    // Второй вход (НОВАЯ initData) обязан найти ТУ ЖЕ новую активную строку, а не одну из старых.
    const secondSession = await createAnonymousSession();
    const secondLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${secondSession.token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('700006', { authDateSecondsAgo: 5, queryId: 'second-active-login' }) },
    });
    expect(secondLogin.statusCode).toBe(200);
    expect((secondLogin.json() as { data: { account_id: string } }).data.account_id).toBe(newAccountId);

    const total = await pool.query('SELECT count(*)::int AS n FROM account WHERE telegram_user_id = $1', ['700006']);
    expect(total.rows[0]?.n).toBe(3);
  });

  it('DEC-A-019: согласие анонимной сессии переносится на аккаунт при входе', async () => {
    const { token } = await createAnonymousSession();
    const consentResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/consent',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: {
        decision: 'grant',
        consent_version: '2026-09-v1',
        consent_text_hash: (await import('../../apps/api/src/consent/known-versions.js')).computeConsentTextHash('2026-09-v1'),
      },
    });
    expect(consentResponse.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('700004') },
    });
    expect(login.statusCode).toBe(200);
    const accountId = (login.json() as { data: { account_id: string } }).data.account_id;

    const account = await pool.query<{ consent_at: Date | null }>('SELECT consent_at FROM account WHERE id = $1', [accountId]);
    expect(account.rows[0]?.consent_at).not.toBeNull();
  });

  it('AC-2: подделанная подпись отклоняется 401, ничего не создано', async () => {
    const { token } = await createAnonymousSession();
    const initData = buildInitData('700005').replace(/hash=[0-9a-f]+/, `hash=${'0'.repeat(64)}`);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: initData },
    });

    expect(response.statusCode).toBe(401);
    const accounts = await pool.query('SELECT count(*)::int AS n FROM account');
    expect(accounts.rows[0]?.n).toBe(0);
  });

  it('AC-7: пустой init_data отклоняется 422, не 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { 'content-type': 'application/json' },
      payload: { init_data: '' },
    });

    expect(response.statusCode).toBe(422);
  });

  function spyPhotoStore(): PhotoStorePort {
    return { async purgeObject(): Promise<void> {} };
  }

  it('review3 RV-01 (blocker): анонимная карточка → вход → withdraw → erase_all → RunErasureJob БЕЗ ошибки внешнего ключа', async () => {
    // Сценарий ДОСЛОВНО из находки: `share_card` создаётся анонимному владельцу с согласием
    // (репозиторий это разрешает), карточка НЕ мигрирует при входе — тогда withdraw/erase_all
    // отзывают по `owner_key = account_id` и её не находят, а RunErasureJob падает на
    // `ON DELETE RESTRICT` (`share_card.recognition_id → recognition`), потому что карточка,
    // всё ещё ссылающаяся на recognition, не даёт его удалить.
    const { token } = await createAnonymousSession();
    const consent = await app.inject({
      method: 'POST',
      url: '/api/v1/consent',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { decision: 'grant', consent_version: '2026-09-v1', consent_text_hash: computeConsentTextHash('2026-09-v1') },
    });
    expect(consent.statusCode).toBe(200);

    const sessionRow = await pool.query<{ id: string }>('SELECT id FROM device_session LIMIT 1');
    const sessionId = sessionRow.rows[0]!.id;
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, status) VALUES ($1, 'done') RETURNING id`,
      [sessionId],
    );
    const recognitionId = recognition.rows[0]!.id;

    // Карточка создаётся АНОНИМНОМУ владельцу — репозиторий это разрешает согласившейся сессии.
    const cardResult = await createShareCardGuarded(pool, {
      owner: { table: 'device_session', id: sessionId },
      recognitionId,
      objectKey: 'review3-card-anon',
      badgeRendered: true,
    });
    expect(cardResult.outcome).toBe('created');
    const cardBeforeLogin = await pool.query<{ owner_key: string }>('SELECT owner_key FROM share_card WHERE recognition_id = $1', [
      recognitionId,
    ]);
    expect(cardBeforeLogin.rows[0]?.owner_key).toBe(sessionId);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('991001') },
    });
    expect(login.statusCode).toBe(200);
    const accountId = (login.json() as { data: { account_id: string } }).data.account_id;

    // Доказывает саму правку: карточка перенесена НА АККАУНТ в транзакции входа.
    const cardAfterLogin = await pool.query<{ owner_key: string }>('SELECT owner_key FROM share_card WHERE recognition_id = $1', [
      recognitionId,
    ]);
    expect(cardAfterLogin.rows[0]?.owner_key).toBe(accountId);

    // withdraw_consent теперь ВИДИТ карточку (owner_key = accountId) и закрывает её.
    const withdraw = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { confirm: true, scope: 'withdraw_consent' },
    });
    expect(withdraw.statusCode).toBe(200);
    const cardAfterWithdraw = await pool.query<{ revoked_at: Date | null }>('SELECT revoked_at FROM share_card WHERE recognition_id = $1', [
      recognitionId,
    ]);
    expect(cardAfterWithdraw.rows[0]?.revoked_at).not.toBeNull();

    const eraseAll = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { confirm: true, scope: 'erase_all' },
    });
    expect(eraseAll.statusCode).toBe(200);

    // РАНЬШЕ: DELETE FROM recognition падал здесь на ON DELETE RESTRICT — неперенесённая
    // карточка держала ссылку. Теперь — завершается без ошибки, account переходит в erased.
    const result = await runErasureJob({ pool, photoStore: spyPhotoStore(), logger: createLogger({ service: 'test', sink: () => {} }) });
    expect(result.erased).toBe(1);
    const account = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId]);
    expect(account.rows[0]?.status).toBe('erased');
    const cardsLeft = await pool.query('SELECT count(*)::int AS n FROM share_card WHERE recognition_id = $1', [recognitionId]);
    expect(cardsLeft.rows[0]?.n).toBe(0);
  });

  it('review3 RV-05 (high): вход в erasing-аккаунт ОТКАЗЫВАЕТСЯ 409, НЕ присоединяет новую сессию/дневник', async () => {
    const session1 = await createAnonymousSession();
    const login1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session1.token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('991002') },
    });
    expect(login1.statusCode).toBe(200);
    const accountId = (login1.json() as { data: { account_id: string } }).data.account_id;

    const eraseAll = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session1.token}`, 'content-type': 'application/json' },
      payload: { confirm: true, scope: 'erase_all' },
    });
    expect(eraseAll.statusCode).toBe(200);
    const statusAfterErase = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId]);
    expect(statusAfterErase.rows[0]?.status).toBe('erasing');

    // Сценарий находки: ДРУГАЯ анонимная сессия с НОВЫМ дневником входит ТЕМ ЖЕ telegram_user_id
    // ПОКА аккаунт ещё erasing (RunErasureJob мог уже удалить старые строки, но ещё не
    // закоммитить `erased`).
    const session2 = await createAnonymousSession();
    const sessions = await pool.query<{ id: string }>('SELECT id FROM device_session ORDER BY created_at');
    const session2Id = sessions.rows[1]!.id;
    await seedDiaryEntries(session2Id, 2);

    const login2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session2.token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('991002', { authDateSecondsAgo: 5, queryId: 'during-erasing' }) },
    });

    expect(login2.statusCode).toBe(409);
    expect((login2.json() as { error: { code: string } }).error.code).toBe('account_erasing');
    // НИКАКОЙ Set-Cookie на отказе — клиент не получает подтверждение несостоявшегося входа.
    expect(login2.headers['set-cookie']).toBeUndefined();

    // Сессия 2 осталась НЕСВЯЗАННОЙ, её дневник НЕ мигрировал на erasing-аккаунт.
    const session2Row = await pool.query<{ account_id: string | null }>('SELECT account_id FROM device_session WHERE id = $1', [session2Id]);
    expect(session2Row.rows[0]?.account_id).toBeNull();
    const migratedToErasing = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE owner_key = $1', [accountId]);
    expect(migratedToErasing.rows[0]?.n).toBe(0);
    const stillOnSession2 = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE owner_key = $1', [session2Id]);
    expect(stillOnSession2.rows[0]?.n).toBe(2);

    // Второй телеграм-аккаунт НЕ создан — тот же единственный erasing-аккаунт остаётся один.
    const accounts = await pool.query('SELECT count(*)::int AS n FROM account WHERE telegram_user_id = $1', ['991002']);
    expect(accounts.rows[0]?.n).toBe(1);
  });

  it('review3 RV-04 (high): повтор ТОЙ ЖЕ initData ПОСЛЕ настоящей эразуры НЕ авторизует — заявка на повтор ключуется telegram_user_id, а не заменённым account_id', async () => {
    const session1 = await createAnonymousSession();
    const initData = buildInitData('991003');
    const login1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session1.token}`, 'content-type': 'application/json' },
      payload: { init_data: initData },
    });
    expect(login1.statusCode).toBe(200);
    const accountId1 = (login1.json() as { data: { account_id: string } }).data.account_id;

    const eraseAll = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session1.token}`, 'content-type': 'application/json' },
      payload: { confirm: true, scope: 'erase_all' },
    });
    expect(eraseAll.statusCode).toBe(200);

    // НАСТОЯЩАЯ эразура — не имитация статуса: без фотографий завершается за один прогон.
    const result = await runErasureJob({ pool, photoStore: spyPhotoStore(), logger: createLogger({ service: 'test', sink: () => {} }) });
    expect(result.erased).toBe(1);
    const accountAfterErasure = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId1]);
    expect(accountAfterErasure.rows[0]?.status).toBe('erased');

    // Повтор ТОЙ ЖЕ строки initData (ещё свежа — не старше 24 ч) ДРУГОЙ анонимной сессией.
    // РАНЬШЕ (ключ по account_id): пара (новый account_id, hash) не существовала в истории —
    // повтор проходил как успешный вход, создавая рабочую сессию на удалённых данных.
    //
    // RV-02 (четвёртый обзор): ПОЛНЫЙ снимок `account` ДО попытки — в этом сценарии
    // `findActiveAccountByTelegramId` не находит `accountId1` (он уже `erased`), поэтому шаг 1
    // маршрута ВСТАВЛЯЕТ новую строку `account` ДО того, как `claimReplay` обнаружит повтор.
    // Раньше колбэк `withTransaction` ВОЗВРАЩАЛ `{kind:'replayed'}` штатным значением — транзакция
    // коммитилась, и эта новая строка оставалась в БД несмотря на честный `401` клиенту.
    const accountsBefore = await pool.query<{ id: string; status: string }>('SELECT id, status FROM account ORDER BY id');

    const session2 = await createAnonymousSession();
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session2.token}`, 'content-type': 'application/json' },
      payload: { init_data: initData },
    });

    expect(replay.statusCode).toBe(401);
    expect((replay.json() as { error: { code: string } }).error.code).toBe('initdata_replayed');
    // Cookie сессии 2 НЕ переустановлен по итогам повтора — вход не состоялся.
    const session2Row = await pool.query<{ account_id: string | null }>(
      'SELECT account_id FROM device_session WHERE cookie_token_hash = $1',
      [(await import('../../apps/api/src/session/create-device-session.js')).hashSessionToken(session2.token)],
    );
    expect(session2Row.rows[0]?.account_id).toBeNull();

    // РЕГРЕССИЯ RV-02: снимок `account` ПОСЛЕ отказа совпадает с снимком ДО — ни одна строка
    // `account`, вставленная шагом 1 этой (отказавшей) попытки, не пережила откат транзакции.
    const accountsAfter = await pool.query<{ id: string; status: string }>('SELECT id, status FROM account ORDER BY id');
    expect(accountsAfter.rows).toEqual(accountsBefore.rows);
    expect(accountsAfter.rows).toHaveLength(1);
  });
});
