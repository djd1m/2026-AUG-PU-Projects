// Жизненный цикл источника (фича source-lifecycle, FR-INDEX-004, ADR-009; Pseudocode DeleteSource, RunIndexJob п.2).
// Донор — N5 apps/web/src/server/video-retry.ts (повтор под FOR UPDATE строки владельца) и суточные слоты загрузки
// N5 packages/db/src/quota.ts — АДАПТИРОВАНО: блокируется строка бота, слот отказавшего запуска НЕ возвращается
// (перенос ревью pdf-source MEDIUM-1). Удаление написано заново: мягкое удаление N5 (deleted_at) оставило бы
// фрагменты в поиске, а FR-INDEX-004 требует удалить их в той же транзакции.
//
// ПОРЯДОК БЛОКИРОВОК (ревью Codex находка 1): «задачи источника → строка бота», как у воркера — запись страницы
// держит строку index_job (прогресс с фенсом) и затем берёт строку бота (внешний ключ page/chunk → bot и триггер
// снятия отметки «проверено», миграция 004). Обратный порядок давал взаимную блокировку удаления или «Обновить» с
// воркером. Владение проверяется ДО блокировок обычным чтением и ещё раз под блокировкой строки бота.
//
// ИНВАРИАНТ: каждый запуск индексации (сайт, PDF, «Повторить», «Обновить») проходит recordIndexStartTx ПОД
// блокировкой строки бота — счёт «прочитать, потом записать» безопасен только потому, что второй запуск того же
// бота ждёт блокировку (shared-resource-verification: конкурентный тест в tests/source-lifecycle.integration.test.ts).
import type { Pool, PoolClient } from 'pg';
import { INDEX_STARTS_PER_BOT_DAY } from '@n6/rag';
import { OWNED } from './bots.js';
import { isUuid } from './index-jobs.js';
import { transaction } from './quota.js';

export type IndexStartKind = 'site' | 'pdf' | 'retry' | 'reindex';
// Начало суток МСК — по часам БД, а не процесса (web и worker-index — разные часы, ревью quota-and-spend M2).
const MSK_DAY_START = `(date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')`;

// Сколько запусков у бота сегодня. Для дешёвой проверки ДО приёма тела PDF; решающая — recordIndexStartTx.
export async function indexStartsToday(db: Pool | PoolClient, botId: string): Promise<number> {
  const row = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM index_start WHERE bot_id = $1 AND created_at >= ${MSK_DAY_START}`, [botId]);
  return row.rows[0]!.n;
}

// Записать запуск, если сегодняшний предел бота не исчерпан. Вызывающий ОБЯЗАН держать FOR UPDATE строки бота.
// false — предел исчерпан, ничего не записано. Строки старше двух суток этого бота убираются тем же ходом.
export async function recordIndexStartTx(tx: PoolClient, botId: string, kind: IndexStartKind): Promise<boolean> {
  if (await indexStartsToday(tx, botId) >= INDEX_STARTS_PER_BOT_DAY) return false;
  await tx.query(`DELETE FROM index_start WHERE bot_id = $1 AND created_at < now() - interval '2 days'`, [botId]);
  await tx.query('INSERT INTO index_start (bot_id, kind) VALUES ($1, $2)', [botId, kind]);
  return true;
}

const pair = (a: unknown, b: unknown) => isUuid(a) && isUuid(b);

// Источник владельца без блокировок: чужой, несуществующий, бот удалён или аккаунт не активен — null.
async function ownedSource(tx: PoolClient, sourceId: string, accountId: string): Promise<{ kind: string; bot_id: string } | null> {
  const source = (await tx.query<{ kind: string; bot_id: string }>('SELECT kind, bot_id FROM source WHERE id = $1', [sourceId])).rows[0];
  if (!source) return null;
  const owned = await tx.query(`SELECT 1 FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED}`, [source.bot_id, accountId]);
  return owned.rowCount ? source : null;
}
// Строка бота под FOR UPDATE — ПОСЛЕ задач источника (порядок блокировок выше); повторная проверка владения.
async function lockOwnedBot(tx: PoolClient, botId: string, accountId: string): Promise<boolean> {
  const bot = await tx.query(`SELECT b.id FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED} FOR UPDATE OF b`, [botId, accountId]);
  return Boolean(bot.rowCount);
}

export type ReindexSourceResult =
  | { kind: 'queued'; message: { index_job_id: string; generation: number } }
  | { kind: 'running'; indexJobId: string }
  | { kind: 'pdf_reupload' }
  | { kind: 'daily_limit'; limit: number }
  | null;

// «Обновить» готовый сайт и «Повторить» отказавший (POST /api/sources/{id}/reindex): та же задача, новая серия —
// статус queued, фенс +1 (опоздавший держатель прежней серии не допишет), счётчики серии с нуля. Неизменные
// страницы пропускаются по content_hash (site-processor), новые фрагменты снимают отметку «проверено» (миграция 004).
// Задача ещё идёт — тот же index_job_id без второй серии и без траты запуска (повтор ПРОДОЛЖАЕТ, а не начинает
// заново). PDF удалён с тома после done и failed (ADR-018) — нужна новая загрузка. Чужой и несуществующий — null.
// Сохранённый предпросмотр (ревью Codex находка 3): бот уже владельца, поэтому бюджеты предпросмотра задачи
// (page_budget 20, embed_budget 120 000 и накопленный embed_used) снимаются — дальше платит аккаунт с бюджетом серии.
export function reindexSource(pool: Pool, sourceId: string, accountId: string, now = new Date()): Promise<ReindexSourceResult> {
  if (!pair(sourceId, accountId)) return Promise.resolve(null);
  return transaction(pool, async (tx) => {
    const source = await ownedSource(tx, sourceId, accountId);
    if (!source) return null;
    const job = (await tx.query<{ id: string; status: string }>(`SELECT id, status FROM index_job WHERE source_id = $1
      ORDER BY created_at DESC, id LIMIT 1 FOR UPDATE`, [sourceId])).rows[0];
    if (!job) return null;
    if (job.status === 'queued' || job.status === 'running') return { kind: 'running', indexJobId: job.id } as const;
    if (source.kind === 'pdf') return { kind: 'pdf_reupload' } as const;
    if (!(await lockOwnedBot(tx, source.bot_id, accountId))) return null;
    if (!(await recordIndexStartTx(tx, source.bot_id, job.status === 'failed' ? 'retry' : 'reindex'))) {
      return { kind: 'daily_limit', limit: INDEX_STARTS_PER_BOT_DAY } as const;
    }
    const updated = (await tx.query<{ current_fence: string }>(`UPDATE index_job SET status = 'queued', failure_reason = NULL, truncated_by = NULL,
      current_fence = current_fence + 1, pages_done = 0, pages_total = NULL, series_embed_used = 0,
      page_budget = NULL, embed_budget = NULL, embed_used = 0, updated_at = $2
      WHERE id = $1 AND status IN ('done', 'failed') RETURNING current_fence`, [job.id, now])).rows[0]!;
    await tx.query(`UPDATE source SET status = 'pending' WHERE id = $1`, [sourceId]);
    return { kind: 'queued', message: { index_job_id: job.id, generation: Number(updated.current_fence) } } as const;
  });
}

// DeleteSource (Pseudocode): одна транзакция — задачи источника под FOR UPDATE и фенс +1 у активных (опоздавший
// воркер получает 0 строк и откатывает страницу), затем строка бота, затем удаление источника; страницы, фрагменты,
// задачи и попытки уходят каскадом ТОЙ ЖЕ транзакцией, поэтому следующий поиск фрагментов источника не видит
// (SC-US-014-2). Сырой PDF незавершённой задачи удаляет подметание тома (pdf/uploads.ts: у файла нет живой задачи).
// Отметку «проверено» удаление не снимает: меньше материала не порождает новых ответов.
export function deleteSource(pool: Pool, sourceId: string, accountId: string): Promise<{ deleted: true; chunks: number } | null> {
  if (!pair(sourceId, accountId)) return Promise.resolve(null);
  return transaction(pool, async (tx) => {
    const source = await ownedSource(tx, sourceId, accountId);
    if (!source) return null;
    await tx.query('SELECT id FROM index_job WHERE source_id = $1 ORDER BY id FOR UPDATE', [sourceId]);
    await tx.query(`UPDATE index_job SET current_fence = current_fence + 1, updated_at = now()
      WHERE source_id = $1 AND status IN ('queued', 'running')`, [sourceId]);
    if (!(await lockOwnedBot(tx, source.bot_id, accountId))) return null;
    const chunks = (await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM chunk WHERE source_id = $1', [sourceId])).rows[0]!.n;
    const removed = await tx.query('DELETE FROM source WHERE id = $1 AND bot_id = $2', [sourceId, source.bot_id]);
    return removed.rowCount ? { deleted: true, chunks } as const : null;
  });
}
