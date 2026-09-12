// `POST /api/v1/auth/telegram` — TelegramLogin (FR-consent-and-telegram-auth-2/3,
// маршрут 9 канона).
//
// Порядок ОБЯЗАТЕЛЕН (`security-operation-order.md`): подпись и свежесть проверяются ВНЕ
// транзакции (чистая функция `verifyTelegramInitData`); повтор `initData` (DEC-A-016)
// проверяется ВНУТРИ ОДНОЙ транзакции, ПОСЛЕ подтверждённой подписи и ДО поиска/создания
// аккаунта — сверять повтор нечего без подтверждённой подписи. Сбой на любом шаге транзакции
// откатывает ВСЁ: ни аккаунт, ни связывание, ни перенос дневника не сохраняются частично
// (FR-consent-and-telegram-auth-2).

import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { withTransaction, type DbClient, type DbPool } from '@n4/db';
import { CANON, fail, ok, type ApiConfig, type Logger } from '@n4/shared';
import { verifyTelegramInitData } from '../auth/verify-init-data.js';
import { createOrReuseDeviceSession, SESSION_COOKIE_NAME } from '../session/create-device-session.js';

interface AuthTelegramBody {
  readonly init_data?: string;
}

interface AccountLookupRow {
  readonly id: string;
  readonly status: 'active' | 'erasing' | 'erased';
  readonly last_telegram_auth_hash: string | null;
  readonly last_telegram_auth_at: Date | null;
}

interface SessionReplayRow {
  readonly last_telegram_auth_hash: string | null;
  readonly last_telegram_auth_at: Date | null;
}

type LoginOutcome =
  | { readonly kind: 'replayed' }
  | { readonly kind: 'success'; readonly accountId: string; readonly migratedEntries: number; readonly issuedToken?: string };

function withinReplayWindow(hash: string, storedHash: string | null, storedAt: Date | null, now: Date): boolean {
  if (storedHash === null || storedAt === null) return false;
  if (storedHash !== hash) return false;
  return now.getTime() - storedAt.getTime() < 24 * 60 * 60 * 1000;
}

async function findAccountByTelegramId(client: DbClient, telegramUserId: string): Promise<AccountLookupRow | undefined> {
  const result = await client.query<AccountLookupRow>(
    `SELECT id, status, last_telegram_auth_hash, last_telegram_auth_at FROM account WHERE telegram_user_id = $1 FOR UPDATE`,
    [telegramUserId],
  );
  return result.rows[0];
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

    const replayHash = createHash('sha256').update(verified.hash, 'utf8').digest('hex');
    const presentedToken = request.cookies[SESSION_COOKIE_NAME];
    const forwardedFor = request.headers['x-forwarded-for'];
    const lastForwarded = Array.isArray(forwardedFor) ? forwardedFor[forwardedFor.length - 1] : forwardedFor?.split(',').pop()?.trim();

    const outcome = await withTransaction<LoginOutcome>(pool, async (client) => {
      const sessionOutcome = await createOrReuseDeviceSession(client, {
        presentedToken,
        ipPrefix: lastForwarded ?? 'unknown',
      });
      const sessionId = sessionOutcome.session.id;

      const existingAccount = await findAccountByTelegramId(client, verified.telegramUserId);

      if (existingAccount !== undefined) {
        if (withinReplayWindow(replayHash, existingAccount.last_telegram_auth_hash, existingAccount.last_telegram_auth_at, new Date())) {
          return { kind: 'replayed' };
        }
      } else {
        const sessionRow = await client.query<SessionReplayRow>(
          `SELECT last_telegram_auth_hash, last_telegram_auth_at FROM device_session WHERE id = $1 FOR UPDATE`,
          [sessionId],
        );
        const session = sessionRow.rows[0];
        if (session !== undefined && withinReplayWindow(replayHash, session.last_telegram_auth_hash, session.last_telegram_auth_at, new Date())) {
          return { kind: 'replayed' };
        }
      }

      let accountId: string;
      if (existingAccount !== undefined && existingAccount.status !== 'erased') {
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
          const retryRow = await findAccountByTelegramId(client, verified.telegramUserId);
          if (retryRow === undefined) throw new Error('гонка вставки account не разрешена повторным чтением');
          if (withinReplayWindow(replayHash, retryRow.last_telegram_auth_hash, retryRow.last_telegram_auth_at, new Date())) {
            // Это тот же initData, которым конкурент только что выиграл гонку — не чужая победа.
            return { kind: 'replayed' };
          }
          accountId = retryRow.id;
        }
      }

      // Сессия СВЯЗЫВАЕТСЯ, не заменяется; cookie остаётся тем же значением.
      await client.query(`UPDATE device_session SET account_id = $2 WHERE id = $1`, [sessionId, accountId]);

      // Перенос дневника ЦЕЛИКОМ, добавлением к уже перенесённому (AC-consent-and-telegram-auth-6).
      const migrated = await client.query(`UPDATE diary_entry SET owner_key = $2 WHERE owner_key = $1`, [sessionId, accountId]);

      // Перенос согласия анонимной сессии на аккаунт (DEC-A-019) — только если у аккаунта
      // своего согласия ещё нет; поля device_session не обнуляются.
      await client.query(
        `UPDATE account SET consent_version = ds.consent_version, consent_text_hash = ds.consent_text_hash, consent_at = ds.consent_at
         FROM device_session ds
         WHERE account.id = $1 AND ds.id = $2 AND account.consent_at IS NULL AND ds.consent_at IS NOT NULL`,
        [accountId, sessionId],
      );

      await client.query(`UPDATE account SET last_telegram_auth_hash = $2, last_telegram_auth_at = now() WHERE id = $1`, [
        accountId,
        replayHash,
      ]);

      return { kind: 'success', accountId, migratedEntries: migrated.rowCount ?? 0, issuedToken: sessionOutcome.issuedToken };
    });

    if (outcome.kind === 'replayed') {
      // Именованная причина отказа — не путается с проверкой подписи/свежести выше.
      return reply.code(401).send(fail('initdata_replayed', 'эта строка initData уже была использована'));
    }

    if (outcome.issuedToken !== undefined) {
      reply.setCookie(SESSION_COOKIE_NAME, outcome.issuedToken, {
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
