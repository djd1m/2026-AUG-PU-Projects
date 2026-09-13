// `POST /api/v1/auth/telegram` — TelegramLogin (FR-consent-and-telegram-auth-2/3,
// маршрут 9 канона).
//
// Порядок ОБЯЗАТЕЛЕН (`security-operation-order.md`): подпись и свежесть проверяются ВНЕ
// транзакции (чистая функция `verifyTelegramInitData`); заявка на повтор initData (DEC-A-016,
// RV-consent-and-telegram-auth-03/04) — ПЕРВАЯ мутация внутри транзакции, ДО того, как
// затрагивается `device_session`: отказ `401` не создаёт и не обновляет ни одной сессии
// (RV-04). Сбой на любом шаге транзакции откатывает ВСЁ (FR-consent-and-telegram-auth-2).
//
// Правка RV-consent-and-telegram-auth-02 (четвёртый обзор): отказ `replayed`/`erasing` ОБЯЗАН
// быть исключением, а не штатным возвратом (`packages/db/src/pool.ts`,
// `withTransaction`: «штатный возврат из колбэка КОММИТИТ транзакцию вместе со всем, что успело
// записаться до неудачной проверки»). Раньше это было нарушено ИМЕННО в сценарии «вход → эразура
// → повтор той же initData»: после эразуры `findActiveAccountByTelegramId` не находит старый
// аккаунт, шаг 1 ВСТАВЛЯЕТ новый (легитимно, до проверки повтора), шаг 2 `claimReplay`
// обнаруживает повтор (история ключуется `telegram_user_id`, переживающим эразуру) и колбэк
// ВОЗВРАЩАЛ `{kind:'replayed'}` — обычное значение, которое `withTransaction` коммитил. Ответ
// клиенту был честным `401`, но в БД оставалась НОВАЯ строка `account`, созданная отказавшим
// входом. Теперь оба отказа выбрасываются как исключения (`LoginReplayedError`,
// `AccountErasingError`) — транзакция откатывается ЦЕЛИКОМ, включая уже вставленный `account`,
// и разбирается ПОСЛЕ `withTransaction` вне транзакции.

import type { FastifyInstance } from 'fastify';
import { withTransaction, type DbClient, type DbPool } from '@n4/db';
import { CANON, fail, ok, type ApiConfig, type Logger } from '@n4/shared';
import { verifyTelegramInitData } from '../auth/verify-init-data.js';
import { createOrReuseDeviceSession, SESSION_COOKIE_NAME } from '../session/create-device-session.js';
import { clientAddressFrom, toIpPrefix } from '../session/ip-prefix.js';

interface AuthTelegramBody {
  readonly init_data?: string;
}

interface AccountLookupRow {
  readonly id: string;
  readonly status: 'active' | 'erasing' | 'erased';
}

/**
 * RV-02 (четвёртый обзор): отказ «эта initData уже использована». Выбрасывается ВНУТРИ
 * транзакции — НИКОГДА не возвращается штатным значением колбэка `withTransaction` (см. правку
 * в шапке файла) — иначе аккаунт, вставленный шагом 1 ДО обнаружения повтора, коммитился бы
 * вместе с отказом.
 */
class LoginReplayedError extends Error {}

/**
 * Отказ «аккаунт уже удаляется». Тот же принцип: исключение, не значение — на пути гонки
 * (строка 141 ниже) отказ обнаруживается ПОСЛЕ попытки вставки текущей транзакции.
 */
class AccountErasingError extends Error {}

type LoginOutcome =
  // RV-consent-and-telegram-auth-05 (третий обзор): вход в аккаунт со статусом `erasing`
  // ОТКАЗЫВАЕТСЯ, транзакция откатывается — ни сессия, ни дневник, ни распознавания НЕ
  // присоединяются к аккаунту, который уже удаляется. Без этого отказа `RunErasureJob` мог
  // удалить строки БД (шаг 1), затем анонимная сессия входила в ЭТОТ ЖЕ `erasing`-аккаунт и
  // переносила НОВЫЙ дневник/распознавания, а задача коммитила `erased`, не перепроверяя
  // таблицы, — перенесённые данные оставались у терминального аккаунта, который больше не
  // выбирается ни одним прогоном. Блокировка строки `account` (`findAccountByTelegramId`,
  // `FOR UPDATE`) на ОБЕИХ сторонах — здесь и в `RunErasureJob`'s финальном `UPDATE … SET
  // status = 'erased'` — упорядочивает исход однозначно: либо вход видит ещё `erasing` и
  // отказывает (эразура завершится позже, ничего нового не присоединено), либо эразура уже
  // зафиксировала `erased` и вход находит `status != 'erased'` пустым — создаёт НОВЫЙ
  // аккаунт (AC-consent-and-telegram-auth-20), а не старый. Окна «второе присоединяется
  // между удалением строк и коммитом erased» больше нет: присоединяться было НЕЧЕМ.
  { readonly kind: 'success'; readonly accountId: string; readonly migratedEntries: number; readonly cookieToken: string };

/**
 * Находит АКТУАЛЬНЫЙ (не `erased`) аккаунт по `telegram_user_id` (RV-consent-and-telegram-auth-07):
 * после эразуры допустимы НЕСКОЛЬКО строк с одним `telegram_user_id` (частичный уникальный
 * индекс исключает только `erased`-строки из уникальности, но не удаляет их физически), и
 * `SELECT … LIMIT 1` без фильтра статуса мог выбрать ЛЮБУЮ из них, включая старую `erased`.
 */
async function findActiveAccountByTelegramId(client: DbClient, telegramUserId: string): Promise<AccountLookupRow | undefined> {
  const result = await client.query<AccountLookupRow>(
    `SELECT id, status FROM account WHERE telegram_user_id = $1 AND status != 'erased' FOR UPDATE`,
    [telegramUserId],
  );
  return result.rows[0];
}

/**
 * Атомарная заявка на повтор (RV-03 второго обзора): ОДИН `INSERT … ON CONFLICT DO NOTHING`.
 * Ноль затронутых строк — эта подпись УЖЕ использована этим владельцем (когда угодно ранее,
 * без окна: свежесть `initData` уже ограничена 24 часами `verifyTelegramInitData`, так что
 * точный повтор одной и той же подписи физически не может пройти позже этого срока). Хранится
 * ИСТОРИЯ, а не единственный слот — иначе последовательность «вход A → вход B → повтор A»
 * перезаписывала слот входом B и пропускала повтор A (заслуженный дефект).
 *
 * RV-consent-and-telegram-auth-04 (третий обзор): ключ повтора — `telegram_user_id`, НЕ
 * `account_id`. Частичный уникальный индекс `account_telegram_user_id_active_unique`
 * (миграция 002) исключает ТОЛЬКО `erased`-строки из уникальности `telegram_user_id` — после
 * реальной эразуры повторный вход тем же `telegram_user_id` создаёт НОВЫЙ `account_id`
 * (AC-consent-and-telegram-auth-20). Ключуясь по СТАРОМУ `account_id`, заявка на повтор не
 * мешала БАЙТ-В-БАЙТ той же строке `initData` (ещё не просроченной 24-часовым окном свежести)
 * авторизовать заново уже под НОВЫМ аккаунтом: пара `(новый account_id, hash)` в таблице
 * попросту не существовала. `telegram_user_id` НЕ меняется НИ эразурой, НИ созданием новой
 * строки `account` — история повторов ключуется им, независимо от того, какой `account_id`
 * действует сейчас (миграция 004).
 */
async function claimReplay(client: DbClient, accountId: string, telegramUserId: string, hash: string): Promise<boolean> {
  const claimed = await client.query(
    `INSERT INTO telegram_login_replay (account_id, telegram_user_id, hash) VALUES ($1, $2, $3)
     ON CONFLICT (telegram_user_id, hash) WHERE telegram_user_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [accountId, telegramUserId, hash],
  );
  return claimed.rows.length > 0;
}

export function registerAuthTelegramRoute(app: FastifyInstance, pool: DbPool, config: ApiConfig, logger: Logger): void {
  app.post<{ Body: AuthTelegramBody }>('/api/v1/auth/telegram', async (request, reply) => {
    const verified = verifyTelegramInitData(request.body?.init_data, config.telegramBotToken);

    if (!verified.ok) {
      // ЕДИНАЯ точка возврата отказа для ОБЕИХ причин («signature», «stale») —
      // NFR-consent-and-telegram-auth-1, AC-consent-and-telegram-auth-4: одно выражение, а
      // не отдельная ранняя ветка для просроченной свежести.
      return reply
        .code(verified.reason === 'missing' ? 422 : 401)
        .send(
          verified.reason === 'missing'
            ? fail('missing_init_data', 'init_data отсутствует')
            : fail('unauthorized', 'вход не подтверждён'),
        );
    }

    const canonicalHash = verified.hash;
    const presentedToken = request.cookies[SESSION_COOKIE_NAME];
    // RV-consent-and-telegram-auth-11: тот же нормализатор, что `auth-device.ts`/`consent.ts` —
    // маршрут не изобретает свой разбор `X-Forwarded-For` и своё усечение адреса (IPv4 → /24,
    // IPv6 → /48). Полный адрес нигде не хранится ни в этом маршруте, ни в остальном продукте.
    const ipPrefix = toIpPrefix(clientAddressFrom(request.headers['x-forwarded-for'], request.ip));

    let outcome: LoginOutcome;
    try {
      outcome = await withTransaction<LoginOutcome>(pool, async (client) => {
      // 1. Найти или создать аккаунт — ЕЩЁ НИ ОДНА сессия не тронута.
      const existingAccount = await findActiveAccountByTelegramId(client, verified.telegramUserId);

      // RV-05 (третий обзор): аккаунт, уже отправленный на удаление, НЕ принимает новые
      // присоединения — отказ ДО любой мутации, строка `account` уже заблокирована
      // (`FOR UPDATE` внутри `findActiveAccountByTelegramId`) тем же локом, который держит
      // `RunErasureJob` на финальном переходе в `erased`.
      if (existingAccount !== undefined && existingAccount.status === 'erasing') {
        throw new AccountErasingError();
      }

      let accountId: string;
      if (existingAccount !== undefined) {
        accountId = existingAccount.id;
      } else {
        // Частичный уникальный индекс `(telegram_user_id) WHERE status != 'erased'`
        // (миграция 002) — удалённый аккаунт НЕ переиспользуется (AC-consent-and-telegram-auth-20).
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO account (telegram_user_id, tier, status)
           VALUES ($1, 'free', 'active')
           ON CONFLICT (telegram_user_id) WHERE status != 'erased' DO NOTHING
           RETURNING id`,
          [verified.telegramUserId],
        );
        const insertedRow = inserted.rows[0];
        if (insertedRow !== undefined) {
          accountId = insertedRow.id;
        } else {
          // Гонка двух параллельных первых входов (VC-03): конкурент уже вставил строку.
          const retryRow = await findActiveAccountByTelegramId(client, verified.telegramUserId);
          if (retryRow === undefined) throw new Error('гонка вставки account не разрешена повторным чтением');
          if (retryRow.status === 'erasing') throw new AccountErasingError();
          accountId = retryRow.id;
        }
      }

      // 2. Заявка на повтор — ПЕРВАЯ и ЕДИНСТВЕННАЯ мутация до этой точки (RV-04 второго
      // обзора): отказ откатывает транзакцию БЕЗ создания или изменения account (кроме уже
      // неизбежной вставки на легитимном первом входе — см. комментарий алгоритма) и БЕЗ
      // касания device_session. Ключ — `telegram_user_id` (RV-04 третьего обзора), не
      // `accountId`, который заменяется новым после эразуры.
      if (!(await claimReplay(client, accountId, verified.telegramUserId, canonicalHash))) {
        // RV-02 (четвёртый обзор): ИСКЛЮЧЕНИЕ, не `return` — на пути «после эразуры» строка
        // `account` уже могла быть ВСТАВЛЕНА шагом 1 выше (легитимно, до этой проверки); только
        // исключение откатывает её вместе с отказом (см. `withTransaction`, `security-operation-
        // order.md`).
        throw new LoginReplayedError();
      }

      // 3. ТОЛЬКО теперь — сессия устройства. Захватываем СОСТОЯНИЕ ДО связывания (RV-05):
      // перенос согласия ниже разрешён ТОЛЬКО если эта КОНКРЕТНАЯ сессия ранее не была связана
      // ни с одним аккаунтом — иначе withdraw_consent, обнуливший account.consent_at, был бы
      // молча отменён историческим согласием уже связанной сессии на следующем входе.
      const sessionOutcome = await createOrReuseDeviceSession(client, {
        presentedToken,
        ipPrefix,
      });
      const sessionId = sessionOutcome.session.id;
      const sessionWasUnlinked = sessionOutcome.session.account_id === null;
      const cookieToken = sessionOutcome.issuedToken ?? presentedToken ?? '';

      // Сессия СВЯЗЫВАЕТСЯ, не заменяется; cookie остаётся тем же значением.
      await client.query(`UPDATE device_session SET account_id = $2 WHERE id = $1`, [sessionId, accountId]);

      // Перенос дневника ЦЕЛИКОМ, добавлением к уже перенесённому (AC-consent-and-telegram-auth-6).
      const migrated = await client.query(`UPDATE diary_entry SET owner_key = $2 WHERE owner_key = $1`, [sessionId, accountId]);

      // Перенос ВЛАДЕНИЯ анонимными карточками (RV-consent-and-telegram-auth-01, третий обзор):
      // без этого шага анонимная карточка (`share_card.owner_key = session_id`, репозиторий
      // разрешает создание анонимному владельцу с согласием) переживала вход НЕ ПЕРЕНЕСЁННОЙ.
      // Два наблюдаемых следствия: (1) `withdraw_consent`/`erase_all` отзывают карточки по
      // `owner_key = account_id` (`account-delete.ts`) и эту карточку молча пропускали;
      // (2) `RunErasureJob` удаляет `share_card` по `owner_key = account_id` ДО `recognition`
      // именно затем, чтобы снять ссылку `ON DELETE RESTRICT` (миграция 001) — неперенесённая
      // карточка эту ссылку не снимала, и `DELETE FROM recognition` падал на КАЖДОМ прогоне,
      // оставляя аккаунт `erasing` навсегда. Перенос — в ТОЙ ЖЕ транзакции входа, что и дневник.
      await client.query(`UPDATE share_card SET owner_key = $2 WHERE owner_key = $1`, [sessionId, accountId]);

      // Перенос ВЛАДЕНИЯ анонимными распознаваниями (RV-06 второго обзора): без этого шага эразура искала
      // активные/удаляемые сканы ТОЛЬКО по `recognition.account_id` и пропускала распознавания,
      // созданные анонимно ДО входа, — они переживали `erase_all`, а их `queued`-статус не
      // откладывал удаление фотографий.
      await client.query(`UPDATE recognition SET account_id = $2 WHERE device_session_id = $1 AND account_id IS NULL`, [
        sessionId,
        accountId,
      ]);

      // Перенос согласия анонимной сессии на аккаунт (DEC-A-019) — ТОЛЬКО при ПЕРВОМ связывании
      // ЭТОЙ сессии (RV-05) и только если у аккаунта своего согласия ещё нет; поля device_session
      // не обнуляются.
      if (sessionWasUnlinked) {
        await client.query(
          `UPDATE account SET consent_version = ds.consent_version, consent_text_hash = ds.consent_text_hash, consent_at = ds.consent_at
           FROM device_session ds
           WHERE account.id = $1 AND ds.id = $2 AND account.consent_at IS NULL AND ds.consent_at IS NOT NULL`,
          [accountId, sessionId],
        );
      }

      return { kind: 'success', accountId, migratedEntries: migrated.rowCount ?? 0, cookieToken };
      });
    } catch (error) {
      if (error instanceof LoginReplayedError) {
        // Именованная причина отказа — не путается с проверкой подписи/свежести выше. Транзакция
        // уже откачена целиком `withTransaction` (RV-02, четвёртый обзор) — ни один `account`,
        // вставленный до этой точки, не остался в БД.
        return reply.code(401).send(fail('initdata_replayed', 'эта строка initData уже была использована'));
      }
      if (error instanceof AccountErasingError) {
        // RV-05 (третий обзор): именованная причина, отдельная от replay — аккаунт существует,
        // подпись подлинна, но данные уже удаляются и присоединение новых запрещено.
        return reply.code(409).send(fail('account_erasing', 'аккаунт удаляется, вход временно недоступен'));
      }
      throw error;
    }

    // Cookie переустанавливается ВСЕГДА при успехе (RV-13, AC-consent-and-telegram-auth-1
    // «с установкой cookie»), а не только при выпуске новой сессии: клиент, пришедший с уже
    // существующей анонимной сессией, обязан получить тот же `Set-Cookie` заново (значение то
    // же самое — токен не меняется, `TelegramLogin` шаг 8 проектного алгоритма).
    if (outcome.cookieToken !== '') {
      reply.setCookie(SESSION_COOKIE_NAME, outcome.cookieToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: CANON.anonymousDiaryDays * 24 * 60 * 60,
      });
    }

    logger.info('telegram_login_succeeded', { migrated_entries: outcome.migratedEntries });
    return reply.code(200).send(ok({ account_id: outcome.accountId, migrated_entries: outcome.migratedEntries }));
  });
}
