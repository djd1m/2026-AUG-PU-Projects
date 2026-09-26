// из N5: projects/05-podcast-clips-opus/packages/db/src/attempts.ts — адаптировано: фенс живёт в строке
// index_job (current_fence), а не в video.fence; попытка — строка job_attempt UNIQUE (index_job_id, fence)
// (у N5 UNIQUE (video_id, fence)); аренда под FOR UPDATE строки задачи, ≤ 2 автоматических попыток серии
// (N5 attempt_no >= 2 → null). Написано заново (у N5 нет): создание с Idempotency-Key под SAVEPOINT,
// ReadIndexJob с состоянием «нет ответа», «Повторить» — новая серия того же index_job_id (ADR-009).
// Каждая запись результата — WHERE id = $1 AND current_fence = $2: 0 строк = попытка устарела, откат.
import type { Pool, PoolClient } from 'pg';
import { readFailureReason, readIndexJobStatus, type IndexJobFailureReason } from '@n6/rag';
import { transaction } from './quota.js';

// Числа канона §7 «Задача индексации». Дублируют @n6/queue намеренно НЕ импортом: db не зависит от
// транспорта. tests/index-job.fence.test.ts сверяет обе копии — одно число, два места, один страж.
export const INDEX_JOB_STALLED_AFTER_MS = 5 * 60_000;
export const INDEX_JOB_MAX_AUTOMATIC_ATTEMPTS = 2;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

// Опоздавшая попытка: её фенс перехвачен (сторож, «Повторить», вторая доставка). Не ошибка системы —
// ожидаемый исход; вызывающий обязан ПРЕКРАТИТЬ работу и ничего не дописывать.
export class StaleAttemptError extends Error {
  constructor(readonly indexJobId: string, readonly fence: number) {
    super(`Попытка устарела: задача ${indexJobId}, фенс ${fence} перехвачен`);
    this.name = 'StaleAttemptError';
  }
}

export interface CreateSourceJobInput {
  botId: string; kind: 'site' | 'pdf'; rootUrl?: string; fileName?: string; idempotencyKey: string;
  budget?: { pageBudget: number; embedBudget: number };
}
export interface CreatedJob { indexJobId: string; sourceId: string; created: boolean }

// CreateSource п.4 (каркас; CheckAddress и приём PDF — фичи crawler и pdf-source): источник и задача в
// ТРАНЗАКЦИИ ВЫЗЫВАЮЩЕГО. Конкурент с тем же ключом блокируется на уникальном индексе до COMMIT первого
// и получает DO NOTHING; его источник откатывается до точки сохранения — сирот не остаётся.
export async function createSourceJobTx(tx: PoolClient, input: CreateSourceJobInput, now = new Date()): Promise<CreatedJob> {
  if (!isUuid(input.botId)) throw new Error('Непригодный bot_id');
  if (!isUuid(input.idempotencyKey)) throw new Error('Idempotency-Key обязан быть UUID');
  if ((input.kind === 'site') === !input.rootUrl || (input.kind === 'pdf') === !input.fileName) throw new Error('Источник: site требует url, pdf — имя файла');
  const budget = input.budget;
  if (budget && ![budget.pageBudget, budget.embedBudget].every((n) => Number.isSafeInteger(n) && n > 0)) throw new Error('Непригодный бюджет задачи');
  await tx.query('SAVEPOINT create_source_job');
  const source = await tx.query<{ id: string }>(`INSERT INTO source (bot_id, kind, root_url, file_name, created_at)
    VALUES ($1, $2, $3, $4, $5) RETURNING id`, [input.botId, input.kind, input.rootUrl ?? null, input.fileName ?? null, now]);
  const sourceId = source.rows[0]!.id;
  const job = await tx.query<{ id: string }>(`INSERT INTO index_job (bot_id, source_id, idempotency_key, page_budget, embed_budget, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $6) ON CONFLICT (bot_id, idempotency_key) DO NOTHING RETURNING id`,
  [input.botId, sourceId, input.idempotencyKey, budget?.pageBudget ?? null, budget?.embedBudget ?? null, now]);
  if (job.rowCount) {
    await tx.query('RELEASE SAVEPOINT create_source_job');
    return { indexJobId: job.rows[0]!.id, sourceId, created: true };
  }
  await tx.query('ROLLBACK TO SAVEPOINT create_source_job');
  await tx.query('RELEASE SAVEPOINT create_source_job');
  const existing = await tx.query<{ id: string; source_id: string }>(
    'SELECT id, source_id FROM index_job WHERE bot_id = $1 AND idempotency_key = $2', [input.botId, input.idempotencyKey]);
  if (!existing.rowCount) throw new Error('Конфликт ключа повторности без существующей задачи: состояние БД непоследовательно');
  return { indexJobId: existing.rows[0]!.id, sourceId: existing.rows[0]!.source_id, created: false };
}
// Идентификатор возвращается ДО постановки в очередь; ставит вызывающий ПОСЛЕ коммита ({ generation: 0 }).
export const createSourceJob = (pool: Pool, input: CreateSourceJobInput, now = new Date()) =>
  transaction(pool, (tx) => createSourceJobTx(tx, input, now));

export interface Lease {
  indexJobId: string; botId: string; sourceId: string; fence: number; seriesNo: number; attemptNo: number;
  pageBudget: number | null; embedBudget: number | null;
}
export interface IndexMessageLike { index_job_id: string; generation: number }

// RunIndexJob п.1. Сообщение несёт generation = current_fence на момент постановки; устаревшее сообщение
// (фенс уже ушёл вперёд) аренды не получает. Две одновременные доставки одного сообщения сериализуются
// FOR UPDATE: первая поднимает фенс, вторая видит чужой фенс и выходит — «один результат, второй stale».
// queued → новая серия (создание, «Повторить», переиндексация); running → автоматический повтор той же серии.
export async function leaseIndexJob(pool: Pool, message: IndexMessageLike, now = new Date()): Promise<Lease | null> {
  if (!isUuid(message.index_job_id) || !Number.isSafeInteger(message.generation) || message.generation < 0) return null;
  return transaction(pool, async (tx) => {
    const job = await tx.query<{ status: string; current_fence: string; bot_id: string; source_id: string; page_budget: number | null; embed_budget: number | null }>(
      'SELECT status, current_fence, bot_id, source_id, page_budget, embed_budget FROM index_job WHERE id = $1 FOR UPDATE', [message.index_job_id]);
    const row = job.rows[0];
    if (!row || Number(row.current_fence) !== message.generation) return null;
    const status = readIndexJobStatus(row.status);
    if (status !== 'queued' && status !== 'running') return null;
    const last = await tx.query<{ series: number }>('SELECT COALESCE(max(series_no), 0)::int AS series FROM job_attempt WHERE index_job_id = $1', [message.index_job_id]);
    const seriesNo = status === 'queued' ? last.rows[0]!.series + 1 : Math.max(1, last.rows[0]!.series);
    const tried = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM job_attempt WHERE index_job_id = $1 AND series_no = $2', [message.index_job_id, seriesNo]);
    const attemptNo = tried.rows[0]!.n + 1;
    if (attemptNo > INDEX_JOB_MAX_AUTOMATIC_ATTEMPTS) {
      // Серия исчерпана доставками без закрытия (воркер умирал): закрыть честно, а не ждать сторожа.
      await closeFailedTx(tx, message.index_job_id, 'stalled', now);
      return null;
    }
    const fence = message.generation + 1;
    await tx.query(`UPDATE job_attempt SET status = 'failed', finished_at = $2 WHERE index_job_id = $1 AND status = 'running'`, [message.index_job_id, now]);
    await tx.query(`INSERT INTO job_attempt (index_job_id, fence, series_no, status, started_at, created_at)
      VALUES ($1, $2, $3, 'running', $4, $4)`, [message.index_job_id, fence, seriesNo, now]);
    await tx.query(`UPDATE index_job SET status = 'running', current_fence = $2, failure_reason = NULL, updated_at = $3 WHERE id = $1`,
      [message.index_job_id, fence, now]);
    await tx.query(`UPDATE source SET status = 'indexing' WHERE id = $1`, [row.source_id]);
    return { indexJobId: message.index_job_id, botId: row.bot_id, sourceId: row.source_id, fence, seriesNo, attemptNo,
      pageBudget: row.page_budget, embedBudget: row.embed_budget };
  });
}

// Закрытие отказом с подъёмом фенса: опоздавший держатель ничего не допишет. Вызывающий держит строку
// (аренда здесь, сторож — apps/worker/src/watchdog.ts под FOR UPDATE SKIP LOCKED).
// Условие статуса — В САМОЙ функции, а не только у вызывающих (ревью index-job-core, MEDIUM): завершённая
// задача (done/failed) не переводится в failed; 0 строк — уже закрыта, ничего не делать.
export async function closeFailedTx(tx: PoolClient, id: string, reason: IndexJobFailureReason, now: Date): Promise<void> {
  const job = await tx.query<{ source_id: string }>(`UPDATE index_job SET status = 'failed', failure_reason = $2,
    current_fence = current_fence + 1, updated_at = $3 WHERE id = $1 AND status IN ('queued', 'running') RETURNING source_id`, [id, reason, now]);
  if (!job.rowCount) return;
  await tx.query(`UPDATE job_attempt SET status = 'failed', finished_at = $2 WHERE index_job_id = $1 AND status = 'running'`, [id, now]);
  await tx.query(`UPDATE source SET status = 'failed' WHERE id = $1`, [job.rows[0]!.source_id]);
}

export interface Progress { pagesDone?: number; chunksDone?: number; pagesTotal?: number }
// Отметка прогресса — она же пульс для сторожа (updated_at). Вызывается В ТРАНЗАКЦИИ записи результата
// страницы: 0 строк → StaleAttemptError → откат вместе с фрагментами (EmbedAndStore п.4).
export async function recordProgressTx(tx: PoolClient, lease: Pick<Lease, 'indexJobId' | 'fence'>, delta: Progress = {}, now = new Date()): Promise<void> {
  const pagesDone = delta.pagesDone ?? 0, chunksDone = delta.chunksDone ?? 0;
  if (![pagesDone, chunksDone].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error('Непригодный прирост прогресса');
  if (delta.pagesTotal !== undefined && !(Number.isSafeInteger(delta.pagesTotal) && delta.pagesTotal >= 0)) throw new Error('Непригодное число страниц');
  const result = await tx.query(`UPDATE index_job SET pages_done = pages_done + $3, chunks_done = chunks_done + $4,
    pages_total = COALESCE($5, pages_total), updated_at = $6
    WHERE id = $1 AND current_fence = $2 AND status = 'running'`,
  [lease.indexJobId, lease.fence, pagesDone, chunksDone, delta.pagesTotal ?? null, now]);
  if (!result.rowCount) throw new StaleAttemptError(lease.indexJobId, lease.fence);
}
export const recordProgress = (pool: Pool, lease: Pick<Lease, 'indexJobId' | 'fence'>, delta: Progress = {}, now = new Date()) =>
  transaction(pool, (tx) => recordProgressTx(tx, lease, delta, now));

// RunIndexJob п.5: успех. Фенс проверяется ПЕРВЫМ оператором; 0 строк — откат всей транзакции.
export async function completeIndexJob(pool: Pool, lease: Pick<Lease, 'indexJobId' | 'fence'>, now = new Date()): Promise<void> {
  await transaction(pool, async (tx) => {
    const job = await tx.query<{ source_id: string; pages_done: number }>(`UPDATE index_job SET status = 'done', updated_at = $3
      WHERE id = $1 AND current_fence = $2 AND status = 'running' RETURNING source_id, pages_done`, [lease.indexJobId, lease.fence, now]);
    if (!job.rowCount) throw new StaleAttemptError(lease.indexJobId, lease.fence);
    await tx.query(`UPDATE job_attempt SET status = 'done', finished_at = $3 WHERE index_job_id = $1 AND fence = $2`, [lease.indexJobId, lease.fence, now]);
    await tx.query(`UPDATE source SET status = 'ready', pages_indexed = $2 WHERE id = $1`, [job.rows[0]!.source_id, job.rows[0]!.pages_done]);
  });
}

// RunIndexJob п.4: отказ с причиной из закрытого списка; уже вставленные фрагменты СОХРАНЯЮТСЯ.
export async function failIndexJob(pool: Pool, lease: Pick<Lease, 'indexJobId' | 'fence'>, reason: IndexJobFailureReason, now = new Date()): Promise<void> {
  const checked = readFailureReason(reason);
  await transaction(pool, async (tx) => {
    const job = await tx.query<{ source_id: string }>(`UPDATE index_job SET status = 'failed', failure_reason = $3, updated_at = $4
      WHERE id = $1 AND current_fence = $2 AND status = 'running' RETURNING source_id`, [lease.indexJobId, lease.fence, checked, now]);
    if (!job.rowCount) throw new StaleAttemptError(lease.indexJobId, lease.fence);
    await tx.query(`UPDATE job_attempt SET status = 'failed', finished_at = $3 WHERE index_job_id = $1 AND fence = $2`, [lease.indexJobId, lease.fence, now]);
    await tx.query(`UPDATE source SET status = 'failed' WHERE id = $1`, [job.rows[0]!.source_id]);
  });
}

// RunIndexJob п.6: автоматический повтор шага. Возвращает сообщение для постановки (generation = мой фенс:
// аренду получит только оно) либо закрывает задачу отказом, если серия исчерпана.
export async function retryAutomatically(pool: Pool, lease: Pick<Lease, 'indexJobId' | 'fence'>, reason: IndexJobFailureReason, now = new Date()):
Promise<{ retry: true; message: IndexMessageLike } | { retry: false }> {
  const checked = readFailureReason(reason);
  return transaction(pool, async (tx) => {
    const job = await tx.query(`UPDATE index_job SET updated_at = $3 WHERE id = $1 AND current_fence = $2 AND status = 'running' RETURNING id`,
      [lease.indexJobId, lease.fence, now]);
    if (!job.rowCount) throw new StaleAttemptError(lease.indexJobId, lease.fence);
    const tried = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM job_attempt WHERE index_job_id = $1
      AND series_no = (SELECT series_no FROM job_attempt WHERE index_job_id = $1 AND fence = $2)`, [lease.indexJobId, lease.fence]);
    await tx.query(`UPDATE job_attempt SET status = 'failed', finished_at = $3 WHERE index_job_id = $1 AND fence = $2`, [lease.indexJobId, lease.fence, now]);
    if (tried.rows[0]!.n < INDEX_JOB_MAX_AUTOMATIC_ATTEMPTS) return { retry: true, message: { index_job_id: lease.indexJobId, generation: lease.fence } };
    const failed = await tx.query<{ source_id: string }>(`UPDATE index_job SET status = 'failed', failure_reason = $2 WHERE id = $1 RETURNING source_id`, [lease.indexJobId, checked]);
    await tx.query(`UPDATE source SET status = 'failed' WHERE id = $1`, [failed.rows[0]!.source_id]);
    return { retry: false };
  });
}

// «Повторить» (FR-INDEX-003): тот же index_job_id, новая серия; фенс поднимается, чтобы опоздавший держатель
// прежней серии не дописал. Только отказавшая задача и только владелец бота; иначе null (404).
export async function retryIndexJob(pool: Pool, indexJobId: string, accountId: string, now = new Date()): Promise<IndexMessageLike | null> {
  if (!isUuid(indexJobId) || !isUuid(accountId)) return null;
  const result = await pool.query<{ current_fence: string }>(`UPDATE index_job j SET status = 'queued', failure_reason = NULL,
    current_fence = j.current_fence + 1, updated_at = $3
    FROM bot b WHERE j.id = $1 AND b.id = j.bot_id AND b.account_id = $2 AND b.status <> 'deleted' AND j.status = 'failed'
    RETURNING j.current_fence`, [indexJobId, accountId, now]);
  return result.rowCount ? { index_job_id: indexJobId, generation: Number(result.rows[0]!.current_fence) } : null;
}

// ReadIndexJob. Три состояния плюс «нет ответа»: молчание — НЕ «выполняется» (long-running-job).
export type IndexJobState = 'running' | 'done' | 'failed' | 'no_response';
export interface IndexJobView {
  index_job_id: string; state: IndexJobState; pages_done: number; pages_total: number | null; chunks_done: number;
  reason?: IndexJobFailureReason;
}
export interface IndexJobRow {
  id: string; status: unknown; failure_reason: unknown; pages_done: number; pages_total: number | null; chunks_done: number; updated_at: Date;
}
export function indexJobView(row: IndexJobRow, now = new Date()): IndexJobView {
  const base = { index_job_id: row.id, pages_done: row.pages_done, pages_total: row.pages_total, chunks_done: row.chunks_done };
  const status = readIndexJobStatus(row.status);
  if (status === 'done') return { ...base, state: 'done' };
  if (status === 'failed') return { ...base, state: 'failed', reason: row.status === 'failed' ? readFailureReason(row.failure_reason) : 'internal' };
  const silentFor = now.getTime() - row.updated_at.getTime();
  if (!(silentFor <= INDEX_JOB_STALLED_AFTER_MS)) return { ...base, state: 'no_response' }; // NaN (нет отметки) — тоже «нет ответа»
  return { ...base, state: 'running' };
}

// Доступ: владелец бота (сессия) или держатель токена предпросмотра (bot черновика). Чужое — null → 404,
// как несуществующее (канон: «Чужой ресурс — 404»).
export type IndexJobAccess = { accountId: string } | { previewBotId: string };
export async function readIndexJob(pool: Pool, indexJobId: string, access: IndexJobAccess, now = new Date()): Promise<IndexJobView | null> {
  if (!isUuid(indexJobId)) return null;
  const accountId = 'accountId' in access ? access.accountId : null, previewBotId = 'previewBotId' in access ? access.previewBotId : null;
  if (!isUuid(accountId ?? previewBotId)) return null;
  const result = await pool.query<IndexJobRow>(`SELECT j.id, j.status, j.failure_reason, j.pages_done, j.pages_total, j.chunks_done, j.updated_at
    FROM index_job j JOIN bot b ON b.id = j.bot_id
    WHERE j.id = $1 AND b.status <> 'deleted' AND (b.account_id = $2::uuid OR (b.status = 'draft' AND b.id = $3::uuid))`,
  [indexJobId, accountId, previewBotId]);
  return result.rowCount ? indexJobView(result.rows[0]!, now) : null;
}
