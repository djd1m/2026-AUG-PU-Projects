// Реквизиты выплаты: партнёр задаёт свои, владелец выгружает реестр к выплате (пункт 3).
//
// Автоматической отправки денег здесь нет и быть не может без договора на выплаты (DEC-A-062).
// Сделано то, что от договора не зависит: адресат перевода и файл, по которому перевод делается.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, ok, previewNextPayout, type Logger } from '@n4/shared';
import { requireSession } from './scans.js';
import { requireOwner, type OwnerLists } from './admin.js';
import { maskPhone, validatePayoutDetails, type PayoutMethod } from '../payouts/payout-details.js';
import { csvDocument, exportFileName, moscowDateCell, rublesCell } from '../export/csv.js';

export interface PayoutDetailsDeps {
  readonly pool: DbPool;
  readonly logger: Logger;
  readonly owners: OwnerLists;
  readonly holdDays: number;
}

const ERROR_TEXT: Record<string, string> = {
  invalid_method: 'способ выплаты — «sbp» либо «other»',
  invalid_phone: 'телефон для СБП обязателен и должен быть российским мобильным',
  invalid_bank: 'название банка не длиннее 100 знаков',
  invalid_note: 'описание способа обязательно и не длиннее 300 знаков',
  card_number_refused: 'номера карт не принимаются и не хранятся: укажите телефон для СБП',
};

export function registerPayoutDetailsRoutes(app: FastifyInstance, deps: PayoutDetailsDeps): void {
  app.put('/api/v1/partner/payout-details', async (request: FastifyRequest<{ Body: { method?: unknown; phone?: unknown; bank?: unknown; note?: unknown } }>, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null || session.accountId === null) return reply.code(401).send(fail('unauthenticated', 'вход обязателен'));
    const partner = await deps.pool.query<{ id: string }>(`SELECT id FROM partner WHERE account_id = $1`, [session.accountId]);
    const partnerId = partner.rows[0]?.id;
    if (partnerId === undefined) return reply.code(403).send(fail('not_partner', 'вызывающий не является партнёром'));

    const body = request.body ?? {};
    const result = validatePayoutDetails({
      method: body.method as PayoutMethod,
      phone: typeof body.phone === 'string' ? body.phone : null,
      bank: typeof body.bank === 'string' ? body.bank : null,
      note: typeof body.note === 'string' ? body.note : null,
    });
    if (!result.ok) return reply.code(422).send(fail(result.error, ERROR_TEXT[result.error] ?? 'реквизиты не приняты'));

    await deps.pool.query(
      `UPDATE partner SET payout_method = $2::payout_method, payout_phone = $3, payout_bank = $4, payout_note = $5, payout_updated_at = now() WHERE id = $1`,
      [partnerId, result.value.method, result.value.phone, result.value.bank, result.value.note],
    );
    // В журнал уходит ФАКТ, а не реквизиты: телефон партнёра — его персональные данные.
    deps.logger.info('payout_details_updated', { partner_id: partnerId });
    return reply.code(200).send(ok({
      method: result.value.method,
      phone_masked: result.value.phone === null ? null : maskPhone(result.value.phone),
      bank: result.value.bank,
      note: result.value.note,
    }));
  });

  app.get('/api/v1/partner/payout-details', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null || session.accountId === null) return reply.code(401).send(fail('unauthenticated', 'вход обязателен'));
    const row = await deps.pool.query<{ payout_method: PayoutMethod | null; payout_phone: string | null; payout_bank: string | null; payout_note: string | null }>(
      `SELECT payout_method, payout_phone, payout_bank, payout_note FROM partner WHERE account_id = $1`,
      [session.accountId],
    );
    const partner = row.rows[0];
    if (partner === undefined) return reply.code(403).send(fail('not_partner', 'вызывающий не является партнёром'));
    return reply.code(200).send(ok({
      method: partner.payout_method,
      // Наружу — МАСКА, а не телефон: экран показывает «задано ли», а не сами данные.
      phone_masked: partner.payout_phone === null ? null : maskPhone(partner.payout_phone),
      bank: partner.payout_bank,
      note: partner.payout_note,
    }));
  });

  // РЕЕСТР К ВЫПЛАТЕ — то, чем сегодня заменяется автоматическая отправка: владелец берёт файл
  // и делает переводы. Полные реквизиты здесь НЕ маскируются: без них файл бесполезен, а
  // получатель — сам владелец, у которого эти данные и так есть основание обрабатывать.
  app.get('/api/v1/admin/export/payout-register', async (request: FastifyRequest, reply: FastifyReply) => {
    if ((await requireOwner(request, { pool: deps.pool, owners: deps.owners })) === null) {
      return reply.code(404).send(fail('not_found', 'маршрут не найден'));
    }
    const partners = await deps.pool.query<{
      id: string; display_name: string; contact: string;
      payout_method: PayoutMethod | null; payout_phone: string | null; payout_bank: string | null; payout_note: string | null;
    }>(`SELECT id, display_name, contact, payout_method, payout_phone, payout_bank, payout_note FROM partner ORDER BY display_name`);

    const now = new Date();
    const rows: (string | number | null)[][] = [];
    for (const partner of partners.rows) {
      const entries = await deps.pool.query<{ kind: string; amount_minor: number; available_at: Date }>(
        `SELECT kind::text AS kind, amount_minor, available_at FROM commission_entry WHERE partner_id = $1`,
        [partner.id],
      );
      const preview = previewNextPayout(
        entries.rows.map((e) => ({ kind: e.kind as 'accrual' | 'clawback' | 'payout', amountMinor: e.amount_minor, availableAt: e.available_at })),
        now,
      );
      // Партнёры без денег к выплате в реестр не попадают: строка «0,00 ₽» — работа для глаз.
      if (preview.dueMinor <= 0) continue;
      rows.push([
        partner.display_name,
        partner.contact,
        partner.payout_method === 'sbp' ? 'СБП' : partner.payout_method === 'other' ? 'иное' : 'НЕ ЗАДАНЫ',
        partner.payout_phone ?? '',
        partner.payout_bank ?? '',
        partner.payout_note ?? '',
        rublesCell(preview.dueMinor),
        moscowDateCell(preview.payoutDate),
      ]);
    }

    const csv = csvDocument(
      ['Партнёр', 'Контакт', 'Способ', 'Телефон СБП', 'Банк', 'Примечание', 'К выплате, ₽', 'Дата выплаты'],
      rows,
    );
    return reply
      .code(200)
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${exportFileName('tarelka-reestr-vyplat')}"`)
      .header('Cache-Control', 'no-store')
      .send(csv);
  });
}
