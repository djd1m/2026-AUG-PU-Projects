// NormalizeAndFindCode (FR-partner-codes-and-cabinet-1, AC-partner-codes-and-cabinet-1).
//
// Форма — РОВНО `^[A-Z0-9]{4,12}$`, тот же `CHECK`, что на `partner_code.code`
// (`packages/db/migrations/001_init.sql`). Код не найден ИЛИ не проходит форму → `invalid`,
// и вызывающий код НЕ открывает транзакцию на этом исходе (нечего откатывать — ни одна
// строка ещё не тронута, `02_pseudocode.md` шаг 1).

import type { DbClient, DbPool } from '@n4/db';

const CODE_SHAPE = /^[A-Z0-9]{4,12}$/;

export interface PartnerCodeRow {
  readonly id: string;
  readonly partner_id: string;
  readonly code: string;
  readonly status: 'active' | 'blocked';
  /** `partner.account_id` владельца кода — NULL, если партнёр ещё не связан с аккаунтом. */
  readonly owner_account_id: string | null;
}

export type NormalizeOutcome = { readonly kind: 'found'; readonly code: PartnerCodeRow } | { readonly kind: 'invalid' };

/** Обрезка пробелов по краям и верхний регистр — шаг 1 `NormalizeAndFindCode`. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

const FIND_CODE = `
  SELECT pc.id, pc.partner_id, pc.code, pc.status::text AS status, p.account_id AS owner_account_id
  FROM partner_code pc
  JOIN partner p ON p.id = pc.partner_id
  WHERE pc.code = $1
`;

export async function normalizeAndFindCode(executor: DbPool | DbClient, raw: string): Promise<NormalizeOutcome> {
  const normalized = normalizeCode(raw);
  if (!CODE_SHAPE.test(normalized)) return { kind: 'invalid' };
  const result = await executor.query<PartnerCodeRow>(FIND_CODE, [normalized]);
  const row = result.rows[0];
  if (row === undefined) return { kind: 'invalid' };
  return { kind: 'found', code: row };
}
