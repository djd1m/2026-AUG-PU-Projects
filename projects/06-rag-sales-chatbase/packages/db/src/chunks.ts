// Фрагменты: запись страницы вместе с её фрагментами (EmbedAndStore п.4) и поиск ближайших (NFR-SEC-001) —
// написано заново (ADR-016: донора нет).
// ИНВАРИАНТ ЗАПИСИ: строка page (её content_hash — «известная страница» для продолжения по хэшу) и её
// фрагменты пишутся ОДНОЙ транзакцией с проверкой фенса ПЕРВЫМ оператором. Раздельно нельзя: страница с
// хэшем без фрагментов навсегда пропускается «Повторить» как «без изменений», а сырой PDF к тому времени
// удалён (ADR-018). Эмбеддинги считаются ДО этой транзакции: сетевой вызов не держит соединение пула
// (security-operation-order: «вызов ВНЕ транзакции»).
// ИНВАРИАНТ ПОИСКА: WHERE c.bot_id = $1 в ТОМ ЖЕ SQL, ДО ORDER BY … LIMIT (не фильтр после LIMIT), и точный
// перебор внутри бота (A-N6-028): чужой вектор не возвращается, свой — не теряется.
import type { Pool, PoolClient } from 'pg';
import { CHUNK_MAX_TOKENS, EMBED_BATCH_MAX, SEARCH_TOP_K, isEmbeddingOfDimension } from '@n6/rag';
import { isUuid, recordProgressTx, StaleAttemptError, type Lease } from './index-jobs.js';
import { transaction } from './quota.js';

export interface PageRecord { urlOrPage: string; title: string; contentHash: string }
export interface ChunkRecord { ordinal: number; contextPath: string; text: string; tokenCount: number; embedding: readonly number[] }
export interface WrittenPage { pageId: string; inserted: number; deleted: number }
type AttemptRef = Pick<Lease, 'indexJobId' | 'fence' | 'botId' | 'sourceId'>;

const vectorLiteral = (embedding: readonly number[]) => `[${embedding.join(',')}]`;

function validateChunks(chunks: readonly ChunkRecord[]): void {
  chunks.forEach((c, i) => {
    if (c.ordinal !== i) throw new Error('Фрагменты страницы: порядковые номера обязаны идти 0..k-1');
    if (typeof c.text !== 'string' || !c.text) throw new Error('Фрагмент без текста');
    if (!Number.isSafeInteger(c.tokenCount) || c.tokenCount < 1 || c.tokenCount > CHUNK_MAX_TOKENS) throw new Error('Фрагмент: число токенов вне 1–600');
    // Та же проверка, что у клиента шлюза и EmbedAndStore: вектор другой длины в колонку vector(1536) не идёт.
    if (!isEmbeddingOfDimension(c.embedding)) throw new Error('Фрагмент: вектор не 1536 конечных чисел');
  });
}

// Прогресс с фенсом (он же пульс сторожа) — ПЕРВЫМ: он блокирует строку задачи, и конкурирующая попытка
// с чужим фенсом получает 0 строк и откат до того, как тронет page/chunk.
export async function upsertPageTx(tx: PoolClient, lease: AttemptRef, page: PageRecord, progress: { pagesTotal?: number } = {}): Promise<string> {
  await recordProgressTx(tx, lease, { pagesDone: 1, pagesTotal: progress.pagesTotal });
  const row = await tx.query<{ id: string }>(`INSERT INTO page (source_id, bot_id, url_or_page, title, content_hash) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (source_id, url_or_page) DO UPDATE SET title = EXCLUDED.title, content_hash = EXCLUDED.content_hash, skipped_reason = NULL
    RETURNING id`, [lease.sourceId, lease.botId, page.urlOrPage, page.title.slice(0, 500), page.contentHash]);
  return row.rows[0]!.id;
}

// Прежние фрагменты страницы заменяются целиком (изменившаяся страница, повтор): дублей нет по построению,
// UNIQUE (page_id, ordinal) — второй рубеж.
export async function replaceChunksTx(tx: PoolClient, lease: AttemptRef, pageId: string, chunks: readonly ChunkRecord[]): Promise<{ inserted: number; deleted: number }> {
  validateChunks(chunks);
  const deleted = (await tx.query('DELETE FROM chunk WHERE page_id = $1 AND bot_id = $2', [pageId, lease.botId])).rowCount ?? 0;
  for (let from = 0; from < chunks.length; from += EMBED_BATCH_MAX) {
    const batch = chunks.slice(from, from + EMBED_BATCH_MAX);
    const values: unknown[] = [];
    const rows = batch.map((c, i) => {
      values.push(lease.botId, lease.sourceId, pageId, c.ordinal, c.contextPath, c.text, c.tokenCount, vectorLiteral(c.embedding));
      const p = i * 8;
      return `($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}, $${p + 8}::vector)`;
    });
    await tx.query(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding) VALUES ${rows.join(', ')}`, values);
  }
  // chunks_done — число фрагментов источника (база — в начале попытки, resetAttemptCountersTx).
  const job = await tx.query(`UPDATE index_job SET chunks_done = chunks_done + $3, updated_at = now()
    WHERE id = $1 AND current_fence = $2 AND status = 'running'`, [lease.indexJobId, lease.fence, chunks.length - deleted]);
  if (!job.rowCount) throw new StaleAttemptError(lease.indexJobId, lease.fence);
  return { inserted: chunks.length, deleted };
}

export async function writeIndexedPage(pool: Pool, lease: AttemptRef, page: PageRecord, chunks: readonly ChunkRecord[], progress: { pagesTotal?: number } = {}): Promise<WrittenPage> {
  validateChunks(chunks);
  return transaction(pool, async (tx) => {
    const pageId = await upsertPageTx(tx, lease, page, progress);
    const counts = await replaceChunksTx(tx, lease, pageId, chunks);
    return { pageId, ...counts };
  });
}

// Начало попытки: страницы пересчитываются заново, фрагменты — от числа уже записанных у источника.
export async function resetAttemptCountersTx(tx: PoolClient, lease: AttemptRef, pagesTotal: number | null): Promise<void> {
  const reset = await tx.query(`UPDATE index_job SET pages_done = 0, pages_total = $3, updated_at = now(),
    chunks_done = (SELECT count(*)::int FROM chunk WHERE bot_id = $4 AND source_id = $5)
    WHERE id = $1 AND current_fence = $2 AND status = 'running'`, [lease.indexJobId, lease.fence, pagesTotal, lease.botId, lease.sourceId]);
  if (!reset.rowCount) throw new StaleAttemptError(lease.indexJobId, lease.fence);
  await tx.query('UPDATE source SET pages_skipped = 0 WHERE id = $1', [lease.sourceId]);
}

// Пульс и фенс перед КАЖДОЙ оплачиваемой попыткой эмбеддинга: опоздавшая попытка не платит за пачку, которую
// всё равно не запишет. Предпросмотр (embed_budget задан) списывает бюджет задачи тем же оператором
// «UPDATE … WHERE used + n <= предел RETURNING» (EmbedAndStore п.1); пустой RETURNING — отказ.
export async function touchAndChargeJobBudgetTx(tx: PoolClient, lease: Pick<Lease, 'indexJobId' | 'fence'>, tokens: number): Promise<{ budgeted: boolean; granted: boolean }> {
  if (!Number.isSafeInteger(tokens) || tokens <= 0) throw new Error('Непригодная величина списания бюджета задачи');
  const job = await tx.query<{ embed_budget: number | null }>(`UPDATE index_job SET updated_at = now()
    WHERE id = $1 AND current_fence = $2 AND status = 'running' RETURNING embed_budget`, [lease.indexJobId, lease.fence]);
  if (!job.rowCount) throw new StaleAttemptError(lease.indexJobId, lease.fence);
  if (job.rows[0]!.embed_budget === null) return { budgeted: false, granted: true };
  const charged = await tx.query(`UPDATE index_job SET embed_used = embed_used + $2
    WHERE id = $1 AND embed_used::bigint + $2 <= embed_budget RETURNING embed_used`, [lease.indexJobId, tokens]);
  return { budgeted: true, granted: Boolean(charged.rowCount) };
}

export interface ChunkHit {
  chunkId: string; pageId: string; sourceId: string; urlOrPage: string; pageTitle: string; contextPath: string; text: string; similarity: number;
}
// Один текст запроса на всё: тест изоляции выполняет EXPLAIN именно его, а не похожего SQL.
// ТОЧНЫЙ перебор фрагментов ОДНОГО бота (A-N6-028), а не HNSW с фильтром: прогон в образе показал, что путь
// HNSW + WHERE bot_id + hnsw.iterative_scan = relaxed_order вернул 0 из 3 своих фрагментов бота, когда 300
// векторов чужого бота ближе к вопросу (изоляция цела, полнота — нет: «не знаю» при наличии ответа).
// MATERIALIZED-выборка по bot_id не может увидеть чужую строку по построению и не даёт планировщику
// упорядоченный обход HNSW; цена — O(фрагментов бота) расстояний, у бота их тысячи (пределы плана).
export const SEARCH_CHUNKS_SQL = `WITH own AS MATERIALIZED (
         SELECT c.id, c.embedding <=> $2::vector AS distance FROM chunk c WHERE c.bot_id = $1
       ), nearest AS (SELECT id, distance FROM own ORDER BY distance, id LIMIT $3)
       SELECT c.id, c.page_id, c.source_id, p.url_or_page, p.title, c.context_path, c.text, n.distance
       FROM nearest n JOIN chunk c ON c.id = n.id AND c.bot_id = $1 JOIN page p ON p.id = c.page_id
       ORDER BY n.distance, c.id`;
// Поиск ближайших фрагментов ОДНОГО бота. Порог min_similarity применяет вызывающий (rag-answer).
export async function searchChunks(pool: Pool, botId: string, embedding: readonly number[], topK = SEARCH_TOP_K): Promise<ChunkHit[]> {
  if (!isUuid(botId)) throw new Error('Непригодный bot_id поиска');
  if (!isEmbeddingOfDimension(embedding)) throw new Error('Вектор вопроса не 1536 конечных чисел');
  if (!Number.isSafeInteger(topK) || topK < 1 || topK > 20) throw new Error('Непригодный top_k');
  const result = await pool.query<{ id: string; page_id: string; source_id: string; url_or_page: string; title: string; context_path: string; text: string; distance: number }>(
    SEARCH_CHUNKS_SQL, [botId, vectorLiteral(embedding), topK]);
  return result.rows.map((r) => ({ chunkId: r.id, pageId: r.page_id, sourceId: r.source_id, urlOrPage: r.url_or_page, pageTitle: r.title,
    contextPath: r.context_path, text: r.text, similarity: 1 - Number(r.distance) }));
}
