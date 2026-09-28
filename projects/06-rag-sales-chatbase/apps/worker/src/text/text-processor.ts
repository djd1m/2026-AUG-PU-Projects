// Обработчик источника «текстовый файл по адресу» внутри задачи индексации (text-source, A-N6-080; RunIndexJob п.2–5,
// ADR-009, ADR-010) — написано заново по форме pdf/pdf-processor.ts и crawl/site-processor.ts.
// Загрузка (fetch-text.ts) → разбор на разделы (split-text.ts) → каждый раздел — «страница»: ChunkDocument → EmbedAndStore
// (квота и бюджет серии на КАЖДУЮ попытку, векторы ДО транзакции) → writeIndexedPage (строка page и её фрагменты одной
// транзакцией с фенсом). Раздел считается в предел страниц тарифа (50/300): лишние не читаются, задача done с пометкой
// page_budget и числом известных разделов (как crawl-coverage). Неизменный раздел (тот же адрес#якорь и content_hash) не
// эмбеддится — «Обновить» неизменного файла не тратит ни одного токена. Исчезнувшие разделы — только после полного прохода.
import { capPageChunks, pruneUnseenPages, recordProgressTx, resetAttemptCountersTx, transaction, writeIndexedPage, type Lease, type Pool } from '@n6/db';
import { chunkDocument, readAccountPlan, type IndexJobTruncation } from '@n6/rag';
import { EmbedBudgetExhausted, type Embedder } from '../embed/embed-and-store';
import { StepFailure, type SourceProcessor } from '../run-index-job';
import { PAGES_BY_PLAN } from '../crawl/limits';
import type { NetOptions } from '../crawl/safe-get';
import { UNREAD_SAMPLE_MAX } from '../crawl/frontier';
import { fetchTextFile, TextFetchFailure, type FetchTextOptions } from './fetch-text';
import { sectionDisplay, sectionUrl, splitTextFile } from './split-text';

// Меньше — «текста не нашлось» (тот же порог, что у страницы краулера, CRAWL_MIN_TEXT_CHARS).
export const TEXT_MIN_CHARS = 200;

export interface TextProcessorOptions {
  pool: Pool; userAgent: string; embedder: Embedder; net?: NetOptions;
  fetch?: Partial<Pick<FetchTextOptions, 'pauseMs' | 'timeoutMs' | 'maxBytes' | 'sleep' | 'clock'>>;
  log?: (line: string) => void;
}

export function createTextProcessor(options: TextProcessorOptions): SourceProcessor {
  const { pool } = options;
  const log = options.log ?? ((line: string) => console.log(line));
  const fail = (lease: Lease, code: string, reason: ConstructorParameters<typeof StepFailure>[0]): never => {
    log(`worker-index: текстовый файл задачи ${lease.indexJobId} отказал: ${code} → ${reason}`);
    throw new StepFailure(reason);
  };
  return async (lease: Lease) => {
    const source = await pool.query<{ kind: string; root_url: string | null; plan: unknown }>(`SELECT s.kind, s.root_url, a.plan
      FROM source s JOIN bot b ON b.id = s.bot_id LEFT JOIN account a ON a.id = b.account_id
      WHERE s.id = $1 AND s.bot_id = $2`, [lease.sourceId, lease.botId]);
    const row = source.rows[0];
    if (!row || row.kind !== 'text' || !row.root_url) return fail(lease, 'text_source_mismatch', 'internal');
    // Бюджет: у задачи (предпросмотр) — её; иначе по плану аккаунта, неизвестный план → free (50).
    const pageBudget = lease.pageBudget ?? PAGES_BY_PLAN[readAccountPlan(row.plan)];
    const startedAt = Date.now();
    let file;
    try {
      file = await fetchTextFile({ ...options.fetch, url: row.root_url, userAgent: options.userAgent, net: options.net });
    } catch (error) {
      if (error instanceof TextFetchFailure) return fail(lease, error.code, error.reason);
      throw error;
    }
    const { sections, emptySections } = splitTextFile(file.text);
    const textChars = sections.reduce((n, s) => n + s.blocks.reduce((m, b) => m + b.text.length, 0), 0);
    if (!sections.length || textChars < TEXT_MIN_CHARS) return fail(lease, 'text_too_short', 'no_text');

    // Адрес «страницы» — от ЗАПРОШЕННОГО адреса файла (root_url), а не от цели перенаправления: иначе смена CDN
    // перезаписала бы все разделы как новые. Перенаправление уже проверено CheckAddress и robots.txt.
    const fileUrl = new URL(row.root_url);
    fileUrl.hash = '';
    const known = new Set((await pool.query<{ url_or_page: string; content_hash: string }>(
      'SELECT url_or_page, content_hash FROM page WHERE source_id = $1', [lease.sourceId])).rows.map((r) => `${r.url_or_page}\u0000${r.content_hash}`));
    const reading = sections.slice(0, pageBudget);
    await transaction(pool, (tx) => resetAttemptCountersTx(tx, lease, reading.length));
    const seenUrls: string[] = [], seenHashes = new Set<string>();
    let read = 0, unchanged = 0, duplicate = 0, chunksWritten = 0, stoppedAt = -1;
    let truncated: IndexJobTruncation | null = null;
    for (let index = 0; index < reading.length; index++) {
      const section = reading[index]!;
      const label = sectionUrl(fileUrl, section.anchor);
      const kind = seenHashes.has(section.contentHash) ? 'duplicate' : known.has(`${label}\u0000${section.contentHash}`) ? 'unchanged' : 'page';
      seenHashes.add(section.contentHash);
      if (kind !== 'duplicate') seenUrls.push(label);
      if (kind === 'page') {
        // Предел фрагментов раздела — ДО эмбеддинга: лишнее не оплачивается.
        const { kept: chunks, dropped } = capPageChunks(chunkDocument({ title: section.title, blocks: section.blocks }));
        let vectors: number[][];
        try {
          vectors = await options.embedder.embed(lease, chunks);
        } catch (error) {
          // Собственный бюджет исчерпан (A-N6-052): раздел не пишется, записанные остаются — done с пометкой; ноль — отказ.
          if (!(error instanceof EmbedBudgetExhausted)) throw error;
          if (read + unchanged === 0) return fail(lease, 'text_budget_before_first_section', 'quota_refused');
          truncated = error.truncation;
          stoppedAt = index;
          break;
        }
        chunksWritten += (await writeIndexedPage(pool, lease, { urlOrPage: label, title: section.title, contentHash: section.contentHash, chunksDropped: dropped },
          chunks.map((c, i) => ({ ...c, embedding: vectors[i]! })))).inserted;
        read++;
      } else {
        await transaction(pool, async (tx) => {
          await recordProgressTx(tx, lease, { pagesDone: kind === 'unchanged' ? 1 : 0 });
          if (kind === 'duplicate') await tx.query('UPDATE source SET pages_skipped = pages_skipped + 1 WHERE id = $1', [lease.sourceId]);
        });
        if (kind === 'unchanged') unchanged++; else duplicate++;
      }
    }
    // Полный проход (все разделы файла, без остановки бюджетом) — исчезнувшие разделы удаляются вместе с фрагментами.
    const complete = truncated === null && reading.length === sections.length;
    const pruned = complete ? await pruneUnseenPages(pool, lease, seenUrls, [...seenHashes]) : { pages: 0, chunks: 0 };
    if (!truncated && reading.length < sections.length) truncated = 'page_budget';
    const unreadFrom = stoppedAt >= 0 ? stoppedAt : reading.length;
    const coverage = truncated ? { pagesKnown: sections.length,
      unreadSample: sections.slice(unreadFrom, unreadFrom + UNREAD_SAMPLE_MAX).map((s) => sectionDisplay(fileUrl, s.anchor)) } : null;
    // Размер и sha256 последнего прочитанного файла — под фенсом: прогресс с фенсом (он же блокировка строки задачи) ПЕРВЫМ
    // в той же транзакции, как у страниц; опоздавшая попытка получает StaleAttemptError и откат (ревью Codex круг 1).
    await transaction(pool, async (tx) => {
      await recordProgressTx(tx, lease, {});
      await tx.query('UPDATE source SET content_bytes = $2, content_sha256 = $3 WHERE id = $1', [lease.sourceId, file.bytes, file.sha256]);
    });
    // В журнал — только счётчики: ни текста, ни адреса файла.
    log(`worker-index: текстовый файл задачи ${lease.indexJobId}: ${file.bytes} байт, разделов ${sections.length} (без текста ${emptySections}), `
      + `прочитано ${read}, без изменений ${unchanged}, дублей ${duplicate}, фрагментов ${chunksWritten}, запросов ${file.requests}; `
      + `удалено исчезнувших разделов ${pruned.pages}; ${Date.now() - startedAt} мс${truncated ? `; усечено ${truncated}` : ''}`);
    return { truncated, coverage };
  };
}
