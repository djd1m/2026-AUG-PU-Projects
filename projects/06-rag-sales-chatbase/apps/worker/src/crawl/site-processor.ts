// Обработчик источника «сайт» внутри задачи индексации (RunIndexJob п.2–5, ADR-009) — написано заново.
// Каждая посещённая единица — одна транзакция: прогресс с проверкой фенса (он же пульс для сторожа) +
// строка page либо счётчик пропуска. 0 строк по фенсу → StaleAttemptError → откат и немедленная остановка
// обхода: опоздавшая попытка не дописывает и не нагружает сайт дальше.
// chunk-embed: новая/изменённая страница → ChunkDocument → EmbedAndStore (векторы — ДО транзакции, сеть не
// держит соединение пула) → writeIndexedPage: строка page и её фрагменты в ОДНОЙ транзакции с фенсом.
// Страница «без изменений» (известный content_hash) не эмбеддится заново — у неё фрагменты уже есть,
// потому что хэш и фрагменты записываются только вместе.
import { capPageChunks, pruneUnseenPages, recordProgressTx, resetAttemptCountersTx, transaction, writeIndexedPage, type Lease, type Pool } from '@n6/db';
import { chunkDocument, readAccountPlan, type IndexJobTruncation } from '@n6/rag';
import { EmbedBudgetExhausted, type Embedder } from '../embed/embed-and-store';
import { StepFailure, type SourceProcessor } from '../run-index-job';
import { CrawlFailure, crawlSite, StopCrawl, type CrawlOptions, type SkipReason } from './crawl-site';
import { PAGES_BY_PLAN } from './limits';
import type { NetOptions } from './safe-get';

// Пропуски, после которых «не увидели» ≠ «страницы нет»: сеть, таймаут, не-2xx сайта (кроме 404/410 — это `gone`).
// При любом из них, а также при неполном обнаружении (sitemap не прочитан, очередь переполнена) обход не считается
// полным, и исчезнувшие страницы НЕ удаляются (source-lifecycle). Остальные причины детерминированы: страница
// удалена (404/410), запрещена robots, noindex, пуста, ушла за сайт — её прежние фрагменты удалять правильно.
export const TRANSIENT_SKIPS: readonly SkipReason[] = ['robots_unreachable', 'unreachable', 'timeout', 'too_many_redirects', 'http_error'];

export interface SiteProcessorOptions {
  pool: Pool; userAgent: string; embedder: Embedder; net?: NetOptions;
  crawl?: Partial<Pick<CrawlOptions, 'pauseMs' | 'timeoutMs' | 'maxBytes' | 'timeBudgetMs' | 'sleep' | 'clock'>>;
  log?: (line: string) => void;
}

export function createSiteProcessor(options: SiteProcessorOptions): SourceProcessor {
  const { pool } = options;
  const log = options.log ?? ((line: string) => console.log(line));
  return async (lease: Lease) => {
    const source = await pool.query<{ kind: string; root_url: string | null; plan: unknown }>(`SELECT s.kind, s.root_url, a.plan
      FROM source s JOIN bot b ON b.id = s.bot_id LEFT JOIN account a ON a.id = b.account_id
      WHERE s.id = $1 AND s.bot_id = $2`, [lease.sourceId, lease.botId]);
    const row = source.rows[0];
    if (!row || row.kind !== 'site' || !row.root_url) throw new StepFailure('internal');
    // Бюджет: у предпросмотра — в задаче (20); иначе по плану аккаунта, неизвестный план → free (50).
    const pageBudget = lease.pageBudget ?? PAGES_BY_PLAN[readAccountPlan(row.plan)];
    const known = await pool.query<{ content_hash: string }>('SELECT content_hash FROM page WHERE source_id = $1', [lease.sourceId]);
    // Новая попытка пересчитывает страницы заново (без изменений тоже засчитываются): счётчики — с нуля,
    // фрагменты — от числа уже записанных у источника.
    await transaction(pool, (tx) => resetAttemptCountersTx(tx, lease, null));
    let chunksWritten = 0;
    let transient = 0;
    let truncated: IndexJobTruncation | null = null;
    const seenUrls = new Set<string>();
    const seenHashes = new Set<string>();
    let result;
    try {
      result = await crawlSite({
        ...options.crawl, rootUrl: row.root_url, pageBudget, userAgent: options.userAgent, net: options.net,
        knownHashes: new Set(known.rows.map((r) => r.content_hash)),
        onVisit: async (visit, progress) => {
          if (visit.kind === 'page') {
            seenUrls.add(visit.page.url);
            // Предел фрагментов страницы — ДО эмбеддинга: лишнее не оплачивается и не держит транзакцию страницы.
            const { kept: chunks, dropped } = capPageChunks(chunkDocument({ title: visit.page.title, blocks: visit.page.blocks }));
            if (dropped) log(`worker-index: задача ${lease.indexJobId}: страница прочитана не целиком — отброшено фрагментов ${dropped}`);
            let vectors: number[][];
            try {
              vectors = await options.embedder.embed(lease, chunks);
            } catch (error) {
              // Собственный бюджет задачи исчерпан (A-N6-052): обход останавливается, страница не пишется, прочитанное
              // остаётся — задача done с пометкой, а не failed целиком.
              if (!(error instanceof EmbedBudgetExhausted)) throw error;
              truncated = error.truncation;
              throw new StopCrawl('embed_budget');
            }
            const written = await writeIndexedPage(pool, lease, { urlOrPage: visit.page.url, title: visit.page.title, contentHash: visit.page.contentHash, chunksDropped: dropped },
              chunks.map((c, i) => ({ ...c, embedding: vectors[i]! })), { pagesTotal: progress.pagesTotal });
            chunksWritten += written.inserted;
            return;
          }
          if (visit.kind === 'unchanged') { seenHashes.add(visit.contentHash); seenUrls.add(visit.url); }
          if (visit.kind === 'skipped' && TRANSIENT_SKIPS.includes(visit.reason)) transient += 1;
          await transaction(pool, async (tx) => {
            await recordProgressTx(tx, lease, { pagesDone: visit.kind === 'skipped' ? 0 : 1, pagesTotal: progress.pagesTotal });
            // Неизменное содержимое переехало на другой адрес (ревью Codex находка 4): адрес страницы актуализируется —
            // иначе бот ссылается на старый, уже недоступный. Строка с новым адресом уже есть — не трогаем (UNIQUE).
            if (visit.kind === 'unchanged') await tx.query(`UPDATE page SET url_or_page = $3 WHERE id = (SELECT id FROM page
              WHERE source_id = $1 AND content_hash = $2 AND url_or_page <> $3 ORDER BY id LIMIT 1)
              AND NOT EXISTS (SELECT 1 FROM page WHERE source_id = $1 AND url_or_page = $3)`, [lease.sourceId, visit.contentHash, visit.url]);
            if (visit.kind === 'skipped') await tx.query('UPDATE source SET pages_skipped = pages_skipped + 1 WHERE id = $1', [lease.sourceId]);
          });
        },
      });
    } catch (error) {
      if (error instanceof CrawlFailure) {
        log(`worker-index: обход задачи ${lease.indexJobId} отказал: ${error.reason}`);
        throw new StepFailure(error.reason);
      }
      throw error;
    }
    // Исчезнувшие страницы — только после ПОЛНОГО обхода без временных пропусков (иначе «не увидели» ≠ «нет»).
    let pruned = { pages: 0, chunks: 0 };
    if (result.stoppedBy === 'exhausted' && transient === 0 && !result.discoveryIncomplete) pruned = await pruneUnseenPages(pool, lease, [...seenUrls], [...seenHashes]);
    // crawl-coverage (A-N6-070): обход остановлен пределом страниц или потолком запросов/времени — задача done с пометкой,
    // pages_total = известные адреса, а не прочитанные («50 из 50» выдавал усечённый обход за полный). Бюджет эмбеддингов
    // (truncated) главнее: он и остановил обход.
    if (!truncated && result.stoppedBy === 'page_budget') truncated = 'page_budget';
    if (!truncated && (result.stoppedBy === 'request_cap' || result.stoppedBy === 'time_budget')) truncated = 'crawl_limit';
    const coverage = result.stoppedBy === 'exhausted' ? null : { pagesKnown: result.pagesKnown, unreadSample: result.unreadSample };
    // В журнал — только счётчики: ни тел страниц, ни их текста, ни адресов.
    const skipped = Object.entries(result.skipped).map(([reason, n]) => `${reason}=${n}`).join(', ') || 'нет';
    log(`worker-index: обход задачи ${lease.indexJobId}: прочитано ${result.pagesRead}, без изменений ${result.pagesUnchanged}, `
      + `фрагментов ${chunksWritten}; известно адресов ${result.pagesKnown}; пропущено: ${skipped}; запросов ${result.requests}; остановка: ${result.stoppedBy}; `
      + `удалено исчезнувших страниц ${pruned.pages} (фрагментов ${pruned.chunks})${truncated ? `; усечено бюджетом ${truncated}` : ''}`);
    return { truncated, coverage };
  };
}
