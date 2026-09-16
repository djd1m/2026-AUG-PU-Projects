// Уведомления в кабинете (пункт 4, DEC-A-059).
//
// `GET /api/v1/notifications` — непрочитанные текущего аккаунта; `POST /api/v1/notifications/read`
// помечает прочитанными. Прочитанные не возвращаются вовсе: кабинет показывает то, что человек
// ещё не видел, а история денег живёт в «Движениях» и в выгрузке.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, ok, type Logger } from '@n4/shared';
import { requireSession } from './scans.js';
import { notificationText, type NotificationKind } from '../notifications/notify.js';

export interface NotificationsDeps {
  readonly pool: DbPool;
  readonly logger: Logger;
}

const MAX_RETURNED = 20;

export function registerNotificationsRoutes(app: FastifyInstance, deps: NotificationsDeps): void {
  app.get('/api/v1/notifications', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    // Анонимная сессия — не ошибка: уведомлений у неё быть не может, и пустой список честнее
    // отказа. Кабинет вызывает этот маршрут на каждом открытии, в том числе до входа.
    if (session === null || session.accountId === null) return reply.code(200).send(ok({ unread: 0, items: [] }));

    const rows = await deps.pool.query<{ id: string; kind: NotificationKind; amount_minor: number | null; created_at: Date }>(
      `SELECT id, kind::text AS kind, amount_minor, created_at
       FROM notification WHERE account_id = $1 AND read_at IS NULL
       ORDER BY created_at DESC LIMIT ${MAX_RETURNED}`,
      [session.accountId],
    );
    return reply.code(200).send(ok({
      unread: rows.rows.length,
      items: rows.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        amount_minor: row.amount_minor,
        created_at: row.created_at.toISOString(),
        text: notificationText(row.kind, row.amount_minor),
      })),
    }));
  });

  app.post('/api/v1/notifications/read', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null || session.accountId === null) return reply.code(401).send(fail('unauthenticated', 'вход обязателен'));
    // Пометка ТОЛЬКО своих и ТОЛЬКО непрочитанных: повторный вызов не сдвигает время прочтения
    // и не трогает чужие строки (владение проверяется в самом запросе, а не до него).
    const updated = await deps.pool.query(
      `UPDATE notification SET read_at = now() WHERE account_id = $1 AND read_at IS NULL`,
      [session.accountId],
    );
    return reply.code(200).send(ok({ marked: updated.rowCount ?? 0 }));
  });
}
