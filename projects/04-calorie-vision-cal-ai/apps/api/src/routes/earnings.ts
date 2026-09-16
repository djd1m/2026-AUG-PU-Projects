// `GET /api/v1/partner/earnings` — деньги партнёра (FR-CAB-1).
//
// Партнёр видит СУММЫ и факты платежей, но НЕ видит, кто заплатил: ни имени, ни контакта,
// ни идентификатора аккаунта. Иначе партнёрская программа становится каналом утечки данных
// о питании — специальной категории персональных данных (ADR-009).
//
// Обе суммы показываются ЗАРАНЕЕ: «к выплате 5-го» и «перенесено на следующее 5-е».
// Перенос, обнаруженный по факту, читается как пропавшие деньги (ADR-014).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, ok, previewNextPayout, balanceMinor, type CommissionEntry } from '@n4/shared';
import { requireSession } from './scans.js';

export interface EarningsDeps {
  readonly pool: DbPool;
}

interface EntryRow {
  readonly kind: 'accrual' | 'clawback' | 'payout';
  readonly amount_minor: number;
  readonly available_at: Date;
  readonly created_at: Date;
}

export function registerEarningsRoute(app: FastifyInstance, deps: EarningsDeps): void {
  app.get('/api/v1/partner/earnings', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null || session.accountId === null) {
      return reply.code(401).send(fail('unauthenticated', 'вход обязателен'));
    }

    // Партнёр разрешается на СЕРВЕРЕ из аккаунта сессии. Идентификатор партнёра из запроса
    // не читается вовсе — читать его значило бы дать смотреть чужие деньги.
    const partner = await deps.pool.query<{ id: string; commission_rate_bp: number }>(
      `SELECT id, commission_rate_bp FROM partner WHERE account_id = $1`,
      [session.accountId],
    );
    const partnerRow = partner.rows[0];
    if (partnerRow === undefined) {
      return reply.code(403).send(fail('not_partner', 'вызывающий не является партнёром'));
    }

    const entries = await deps.pool.query<EntryRow>(
      `SELECT kind::text AS kind, amount_minor, available_at, created_at
       FROM commission_entry WHERE partner_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [partnerRow.id],
    );
    const all: CommissionEntry[] = entries.rows.map((row) => ({
      kind: row.kind,
      amountMinor: row.amount_minor,
      availableAt: row.available_at,
    }));

    const now = new Date();
    const preview = previewNextPayout(all, now);
    const paidOut = all.filter((e) => e.kind === 'payout').reduce((sum, e) => sum + e.amountMinor, 0);
    const accrued = all.filter((e) => e.kind === 'accrual').reduce((sum, e) => sum + e.amountMinor, 0);
    const clawedBack = all.filter((e) => e.kind === 'clawback').reduce((sum, e) => sum + e.amountMinor, 0);

    return reply.code(200).send(ok({
      // Ставка показывается партнёру: обязательство бессрочно, и он вправе видеть его условие.
      commission_rate_bp: partnerRow.commission_rate_bp,
      accrued_total_minor: accrued,
      clawed_back_total_minor: clawedBack,
      paid_out_total_minor: -paidOut,
      balance_minor: balanceMinor(all),
      due_next_payout_minor: preview.dueMinor,
      deferred_to_following_minor: preview.deferredMinor,
      next_payout_date: preview.payoutDate.toISOString(),
      // Записи БЕЗ плательщика: суммы и даты, ничего о том, кто именно платил.
      entries: entries.rows.map((row) => ({
        kind: row.kind,
        amount_minor: row.amount_minor,
        available_at: row.available_at.toISOString(),
        created_at: row.created_at.toISOString(),
      })),
    }));
  });
}
