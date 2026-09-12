// `DELETE /api/v1/account` — RevokeConsentOrErase (FR-consent-and-telegram-auth-8/9,
// маршрут 13 канона).
//
// Аутентификация (решение исполнителя, задокументировано в `05_completion.md`): ни один
// документ Phase 1/Phase 3 не вводит отдельного механизма выпуска bearer-токена, а
// `docs/Pseudocode.md` (маршрут 13) описывает `Authorization: Bearer <token>` для клиента
// Mini App как «ТОТ ЖЕ cookie» (строка 371) — то есть ТОТ ЖЕ токен сессии, переданный вторым
// способом там, где WebView не хранит cookie надёжно. Реализация принимает токен ИЗ cookie
// ИЛИ из заголовка `Authorization: Bearer` — один и тот же секрет, две формы доставки — и
// требует, чтобы сессия была связана с аккаунтом (`device_session.account_id IS NOT NULL`).
//
// Карточки закрываются ОБОИМИ значениями `scope` в ОДНОЙ транзакции с переходом статуса —
// повторный `erase_all` во время `erasing` коммитит закрытие карточек ЭТИМ вызовом (оно
// необратимо и не ошибка), но НЕ сдвигает `deletion_requested_at` (04_refinement.md, шаг 4
// `RevokeConsentOrErase`; AC-consent-and-telegram-auth-14).

import type { FastifyInstance } from 'fastify';
import { withTransaction, type DbPool } from '@n4/db';
import { fail, ok, type Logger } from '@n4/shared';
import { hashSessionToken, SESSION_COOKIE_NAME } from '../session/create-device-session.js';

interface DeleteAccountBody {
  readonly confirm?: boolean;
  readonly scope?: 'withdraw_consent' | 'erase_all';
}

type DeleteOutcome =
  | { readonly kind: 'withdrawn'; readonly cardsRevokedAt: Date; readonly cardsCount: number }
  | { readonly kind: 'already_erasing'; readonly cardsRevokedAt: Date; readonly cardsCount: number }
  | { readonly kind: 'erasing'; readonly cardsRevokedAt: Date; readonly cardsCount: number; readonly eraseDeadline: Date };

function bearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) return undefined;
  const match = /^Bearer\s+(.+)$/.exec(value);
  return match?.[1];
}

export function registerAccountDeleteRoute(app: FastifyInstance, pool: DbPool, logger: Logger): void {
  app.delete<{ Body: DeleteAccountBody }>('/api/v1/account', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME] ?? bearerToken(request.headers.authorization);
    if (token === undefined || token.trim() === '') {
      return reply.code(401).send(fail('unauthorized', 'вход обязателен'));
    }

    const sessionResult = await pool.query<{ account_id: string | null }>(
      'SELECT account_id FROM device_session WHERE cookie_token_hash = $1',
      [hashSessionToken(token)],
    );
    const accountId = sessionResult.rows[0]?.account_id;
    if (accountId === null || accountId === undefined) {
      return reply.code(401).send(fail('unauthorized', 'вход обязателен'));
    }

    const body = request.body ?? {};
    if (body.confirm !== true || (body.scope !== 'withdraw_consent' && body.scope !== 'erase_all')) {
      return reply.code(422).send(fail('confirmation_required', 'confirm: true и корректный scope обязательны'));
    }
    const scope = body.scope;

    const outcome = await withTransaction<DeleteOutcome>(pool, async (client) => {
      // Шаг общий для ОБОИХ scope: FR-GROWTH-006 требует закрытия карточек при отзыве
      // согласия, а `erase_all` логически включает отзыв.
      const revoked = await client.query<{ id: string }>(
        `UPDATE share_card SET revoked_at = now() WHERE owner_key = $1 AND revoked_at IS NULL RETURNING id`,
        [accountId],
      );
      const cardsRevokedAt = new Date();
      const cardsCount = revoked.rowCount ?? 0;

      if (scope === 'withdraw_consent') {
        // consent_version/consent_text_hash НЕ стираются — только consent_at (DEC-A-016).
        await client.query(`UPDATE account SET consent_at = NULL WHERE id = $1`, [accountId]);
        return { kind: 'withdrawn', cardsRevokedAt, cardsCount };
      }

      const statusRow = await client.query<{ status: string }>(`SELECT status FROM account WHERE id = $1 FOR UPDATE`, [accountId]);
      const status = statusRow.rows[0]?.status;
      if (status === 'erasing') {
        // Карточки, закрытые ЭТИМ вызовом, остаются закрытыми (коммит выше) — закрытие
        // необратимо и не ошибка; новую строку в очередь удаления НЕ ставим.
        return { kind: 'already_erasing', cardsRevokedAt, cardsCount };
      }

      const updated = await client.query<{ deletion_requested_at: Date }>(
        `UPDATE account SET status = 'erasing', deletion_requested_at = now() WHERE id = $1 RETURNING deletion_requested_at`,
        [accountId],
      );
      const deletionRequestedAt = updated.rows[0]?.deletion_requested_at ?? new Date();
      const eraseDeadline = new Date(deletionRequestedAt.getTime() + 72 * 60 * 60 * 1000);
      return { kind: 'erasing', cardsRevokedAt, cardsCount, eraseDeadline };
    });

    logger.info('account_delete_processed', { scope, cards_revoked: outcome.cardsCount, outcome: outcome.kind });

    if (outcome.kind === 'already_erasing') {
      return reply.code(409).send(fail('erasure_already_running', 'удаление уже запущено'));
    }
    if (outcome.kind === 'withdrawn') {
      return reply.code(200).send(ok({ accepted: true, cards_revoked_at: outcome.cardsRevokedAt.toISOString(), erase_deadline: null }));
    }
    return reply
      .code(200)
      .send(ok({ accepted: true, cards_revoked_at: outcome.cardsRevokedAt.toISOString(), erase_deadline: outcome.eraseDeadline.toISOString() }));
  });
}
