// `POST /api/v1/auth/telegram` — TelegramLogin (FR-consent-and-telegram-auth-2/3,
// маршрут 9 канона).
//
// Порядок ОБЯЗАТЕЛЕН (`security-operation-order.md`): подпись и свежесть проверяются ВНЕ
// транзакции (чистая функция `verifyTelegramInitData`); заявка на повтор initData (DEC-A-016,
// RV-consent-and-telegram-auth-03/04) — ПЕРВАЯ мутация внутри транзакции, ДО того, как
// затрагивается `device_session`: отказ `401` не создаёт и не обновляет ни одной сессии
// (RV-04). Сбой на любом шаге транзакции откатывает ВСЁ (FR-consent-and-telegram-auth-2).

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

type LoginOutcome =
  | { readonly kind: 'replayed' }
  | { readonly kind: 'success'; readonly accountId: string; readonly migratedEntries: number; readonly cookieToken: string };

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
 * Атомарная заявка на повтор (RV-03): ОДИН `INSERT … ON CONFLICT DO NOTHING`. Ноль затронутых
 * строк — эта подпись УЖЕ использована этим владельцем (когда угодно ранее, без окна: свежесть
 * `initData` уже ограничена 24 часами `verifyTelegramInitData`, так что точный повтор одной и
 * той же подписи физически не может пройти позже этого срока). Хранится ИСТОРИЯ, а не
 * единственный слот — иначе последовательность «вход A → вход B → повтор A» перезаписывала
 * слот входом B и пропускала повтор A (заслуженный дефект, воспроизведён review-report.md).
 */
async function claimReplay(client: DbClient, accountId: string, hash: string): Promise<boolean> {
  const claimed = await client.query(
    `INSERT INTO telegram_login_replay (account_id, hash) VALUES ($1, $2)
     ON CONFLICT (account_id, hash) WHERE account_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [accountId, hash],
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

    const outcome = await withTransaction<LoginOutcome>(pool, async (client) => {
      // 1. Найти или создать аккаунт — ЕЩЁ НИ ОДНА сессия не тронута.
      const existingAccount = await findActiveAccountByTelegramId(client, verified.telegramUserId);

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
          accountId = retryRow.id;
        }
      }

      // 2. Заявка на повтор — ПЕРВАЯ и ЕДИНСТВЕННАЯ мутация до этой точки (RV-04): отказ
      // откатывает транзакцию БЕЗ создания или изменения account (кроме уже неизбежной вставки
      // на легитимном первом входе — см. комментарий алгоритма) и БЕЗ касания device_session.
      if (!(await claimReplay(client, accountId, canonicalHash))) {
        return { kind: 'replayed' };
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

      // Перенос ВЛАДЕНИЯ анонимными распознаваниями (RV-06): без этого шага эразура искала
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

    if (outcome.kind === 'replayed') {
      // Именованная причина отказа — не путается с проверкой подписи/свежести выше.
      return reply.code(401).send(fail('initdata_replayed', 'эта строка initData уже была использована'));
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
