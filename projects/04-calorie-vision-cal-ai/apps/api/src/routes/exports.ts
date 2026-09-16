// Маршруты выгрузки (пункт 5): партнёр выгружает СВОИ движения, владелец — движения всех
// партнёров. Расширение списка маршрутов канона объявлено в `docs/decisions-autonomous.md`.
//
// Партнёр не видит ни плательщиков, ни идентификаторов платежей — тот же запрет, что и в
// кабинете (`earnings.ts`): записи о деньгах без сведений о том, кто именно платил.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, type Logger } from '@n4/shared';
import { requireSession } from './scans.js';
import { requireOwner, type OwnerLists } from './admin.js';
import { COMMISSION_KIND_LABEL, csvDocument, exportFileName, moscowDateCell, rublesCell } from '../export/csv.js';

export interface ExportsDeps {
  readonly pool: DbPool;
  readonly logger: Logger;
  readonly owners: OwnerLists;
}

interface EntryRow {
  readonly kind: string;
  readonly amount_minor: number;
  readonly created_at: Date;
  readonly available_at: Date;
}

function sendCsv(reply: FastifyReply, fileName: string, body: string): FastifyReply {
  return reply
    .code(200)
    .header('Content-Type', 'text/csv; charset=utf-8')
    // `attachment` с именем: без него браузер покажет CSV текстом во вкладке.
    .header('Content-Disposition', `attachment; filename="${fileName}"`)
    .header('Cache-Control', 'no-store')
    .send(body);
}

export function registerExportRoutes(app: FastifyInstance, deps: ExportsDeps): void {
  app.get('/api/v1/partner/earnings/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null || session.accountId === null) return reply.code(401).send(fail('unauthenticated', 'вход обязателен'));
    const partner = await deps.pool.query<{ id: string }>(`SELECT id FROM partner WHERE account_id = $1`, [session.accountId]);
    const partnerId = partner.rows[0]?.id;
    if (partnerId === undefined) return reply.code(403).send(fail('not_partner', 'вызывающий не является партнёром'));

    const entries = await deps.pool.query<EntryRow>(
      `SELECT kind::text AS kind, amount_minor, created_at, available_at
       FROM commission_entry WHERE partner_id = $1 ORDER BY created_at`,
      [partnerId],
    );
    const csv = csvDocument(
      ['Дата', 'Тип', 'Сумма, ₽', 'Доступно с'],
      entries.rows.map((row) => [
        moscowDateCell(row.created_at),
        COMMISSION_KIND_LABEL[row.kind] ?? row.kind,
        rublesCell(row.amount_minor),
        moscowDateCell(row.available_at),
      ]),
    );
    return sendCsv(reply, exportFileName('tarelka-nachisleniya'), csv);
  });

  app.get('/api/v1/admin/export/commissions', async (request: FastifyRequest, reply: FastifyReply) => {
    if ((await requireOwner(request, { pool: deps.pool, owners: deps.owners })) === null) {
      return reply.code(404).send(fail('not_found', 'маршрут не найден'));
    }
    const rows = await deps.pool.query<EntryRow & { display_name: string; contact: string }>(
      `SELECT p.display_name, p.contact, ce.kind::text AS kind, ce.amount_minor, ce.created_at, ce.available_at
       FROM commission_entry ce JOIN partner p ON p.id = ce.partner_id
       ORDER BY p.display_name, ce.created_at`,
    );
    const csv = csvDocument(
      ['Партнёр', 'Контакт', 'Дата', 'Тип', 'Сумма, ₽', 'Доступно с'],
      rows.rows.map((row) => [
        row.display_name,
        row.contact,
        moscowDateCell(row.created_at),
        COMMISSION_KIND_LABEL[row.kind] ?? row.kind,
        rublesCell(row.amount_minor),
        moscowDateCell(row.available_at),
      ]),
    );
    return sendCsv(reply, exportFileName('tarelka-dvizheniya'), csv);
  });
}
