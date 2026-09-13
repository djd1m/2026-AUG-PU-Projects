// ManualUnblockPartnerCode (FR-partner-codes-and-cabinet-7, AC-partner-codes-and-cabinet-11).
//
// ЕДИНСТВЕННЫЙ путь во ВСЕЙ фиче, меняющий `partner_code.status` из `blocked` в `active`.
// Административная операция, вызывается оператором вручную; вне продуктового API этой
// недели (нет HTTP-маршрута) — namespace-функция для CLI/консоли администратора.
//
// Автоматического снятия НЕТ ни в коде, ни в фоновой задаче, ни в TTL: порог 50/10 минут
// при автоснятии перестаёт быть порогом и становится задержкой (`.claude/rules/security.md`,
// anti-fraud). Это единственное место в файловом дереве фичи, где встречается литерал
// `status = 'active'` рядом с `partner_code` — страж `manual-unblock-guard.test.ts`
// проверяет, что второго такого места нет НИГДЕ в `apps/api/src` (испытан внедрённым
// дефектом — обе строки квитанции в `05_completion.md`).

import type { DbPool } from '@n4/db';
import type { Logger } from '@n4/shared';

export type ManualUnblockOutcome = { readonly outcome: 'unblocked' } | { readonly outcome: 'not_blocked' };

const SELECT_STATUS = `SELECT status::text AS status FROM partner_code WHERE id = $1`;
const UNBLOCK = `UPDATE partner_code SET status = 'active', blocked_reason = NULL, blocked_at = NULL WHERE id = $1`;

export async function manualUnblockPartnerCode(
  pool: DbPool,
  logger: Logger,
  input: { readonly partnerCodeId: string; readonly operatorId: string },
): Promise<ManualUnblockOutcome> {
  const statusRow = await pool.query<{ status: string }>(SELECT_STATUS, [input.partnerCodeId]);
  if (statusRow.rows[0]?.status !== 'blocked') return { outcome: 'not_blocked' };

  await pool.query(UNBLOCK, [input.partnerCodeId]);
  logger.info('manual_unblock', { partner_code_id: input.partnerCodeId, operator_id: input.operatorId });
  return { outcome: 'unblocked' };
}
