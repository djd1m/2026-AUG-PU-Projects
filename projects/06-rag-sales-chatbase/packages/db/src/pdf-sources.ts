// CreateSource для PDF (Pseudocode п.1, 2, 4; FR-SOURCE-003; SC-US-004-3) — написано заново (нет в донорах,
// ADR-016). Предел числа PDF по плану проверяется ДВАЖДЫ: дёшево до приёма тела (отказ «до загрузки»)
// и атомарно в транзакции создания под FOR UPDATE строки бота — две одновременные загрузки при
// остатке 1 не дают четвёртый PDF на free (shared-resource-verification: считать-потом-писать без
// блокировки проходит последовательный тест и падает на параллельном).
import type { Pool } from 'pg';
import { PDFS_BY_PLAN, readAccountPlan, type AccountPlan } from '@n6/rag';
import { transaction } from './quota.js';
import { createSourceJobTx, isUuid } from './index-jobs.js';

export interface OwnedBot { plan: AccountPlan; pdfCount: number }
// PDF, занимающие место по плану: всё, кроме отказавших (отказ не индексирован и не отвечает).
const COUNT_PDFS = `SELECT count(*)::int AS n FROM source WHERE bot_id = $1 AND kind = 'pdf' AND status <> 'failed'`;

// Бот активен и принадлежит аккаунту; неизвестный план — free (самый строгий предел).
// Чужой, черновик, удалённый и несуществующий бот — одинаково null (канон: «Чужой ресурс — 404»).
export async function readOwnedBotForPdf(pool: Pool, botId: string, accountId: string): Promise<OwnedBot | null> {
  if (!isUuid(botId) || !isUuid(accountId)) return null;
  const bot = await pool.query<{ plan: unknown }>(`SELECT a.plan FROM bot b JOIN account a ON a.id = b.account_id
    WHERE b.id = $1 AND b.account_id = $2 AND b.status = 'active' AND a.status = 'active'`, [botId, accountId]);
  if (!bot.rowCount) return null;
  const count = await pool.query<{ n: number }>(COUNT_PDFS, [botId]);
  return { plan: readAccountPlan(bot.rows[0]!.plan), pdfCount: count.rows[0]!.n };
}

export async function findJobByIdempotencyKey(pool: Pool, botId: string, idempotencyKey: string): Promise<string | null> {
  if (!isUuid(botId) || !isUuid(idempotencyKey)) return null;
  const job = await pool.query<{ id: string }>('SELECT id FROM index_job WHERE bot_id = $1 AND idempotency_key = $2', [botId, idempotencyKey]);
  return job.rows[0]?.id ?? null;
}

export interface CreatePdfSourceInput { accountId: string; botId: string; fileName: string; idempotencyKey: string; indexJobId: string }
export type CreatePdfSourceResult =
  | { kind: 'created' | 'existing'; indexJobId: string }
  | { kind: 'plan_limit'; plan: AccountPlan; limit: number }
  | { kind: 'not_found' };

export function pdfLimitFor(plan: AccountPlan): number {
  return PDFS_BY_PLAN[plan];
}

export async function createPdfSource(pool: Pool, input: CreatePdfSourceInput, now = new Date()): Promise<CreatePdfSourceResult> {
  if (!isUuid(input.botId) || !isUuid(input.accountId)) return { kind: 'not_found' };
  return transaction(pool, async (tx) => {
    // Блокировка строки бота сериализует создание источников ЭТОГО бота; держится только на время
    // коротких операторов ниже — тело файла к этому моменту уже принято и записано (не под блокировкой).
    const bot = await tx.query<{ plan: unknown }>(`SELECT a.plan FROM bot b JOIN account a ON a.id = b.account_id
      WHERE b.id = $1 AND b.account_id = $2 AND b.status = 'active' AND a.status = 'active' FOR UPDATE OF b`, [input.botId, input.accountId]);
    if (!bot.rowCount) return { kind: 'not_found' } as const;
    // Повтор с тем же ключом — та же задача, даже если предел уже исчерпан ЕЮ ЖЕ.
    const existing = await tx.query<{ id: string }>('SELECT id FROM index_job WHERE bot_id = $1 AND idempotency_key = $2',
      [input.botId, input.idempotencyKey]);
    if (existing.rowCount) return { kind: 'existing', indexJobId: existing.rows[0]!.id } as const;
    const plan = readAccountPlan(bot.rows[0]!.plan);
    const limit = pdfLimitFor(plan);
    const count = await tx.query<{ n: number }>(COUNT_PDFS, [input.botId]);
    if (count.rows[0]!.n >= limit) return { kind: 'plan_limit', plan, limit } as const;
    const created = await createSourceJobTx(tx, { botId: input.botId, kind: 'pdf', fileName: input.fileName,
      idempotencyKey: input.idempotencyKey, indexJobId: input.indexJobId }, now);
    return { kind: created.created ? 'created' : 'existing', indexJobId: created.indexJobId } as const;
  });
}
