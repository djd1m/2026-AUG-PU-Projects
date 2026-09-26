// Обработчик источника «сайт» внутри задачи индексации (RunIndexJob п.2–5, ADR-009) — написано заново.
// Каждая посещённая единица — одна транзакция: прогресс с проверкой фенса (он же пульс для сторожа) +
// строка page либо счётчик пропуска. 0 строк по фенсу → StaleAttemptError → откат и немедленная остановка
// обхода: опоздавшая попытка не дописывает и не нагружает сайт дальше.
// chunk-embed: новая/изменённая страница → ChunkDocument → EmbedAndStore (векторы — ДО транзакции, сеть не
// держит соединение пула) → writeIndexedPage: строка page и её фрагменты в ОДНОЙ транзакции с фенсом.
// Страница «без изменений» (известный content_hash) не эмбеддится заново — у неё фрагменты уже есть,
// потому что хэш и фрагменты записываются только вместе.
import { recordProgressTx, resetAttemptCountersTx, transaction, writeIndexedPage, type Lease, type Pool } from '@n6/db';
import { chunkDocument, readAccountPlan } from '@n6/rag';
import type { Embedder } from '../embed/embed-and-store';
import { StepFailure, type SourceProcessor } from '../run-index-job';
import { CrawlFailure, crawlSite, type CrawlOptions } from './crawl-site';
import { PAGES_BY_PLAN } from './limits';
import type { NetOptions } from './safe-get';

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
    let result;
    try {
      result = await crawlSite({
        ...options.crawl, rootUrl: row.root_url, pageBudget, userAgent: options.userAgent, net: options.net,
        knownHashes: new Set(known.rows.map((r) => r.content_hash)),
        onVisit: async (visit, progress) => {
          if (visit.kind === 'page') {
            const chunks = chunkDocument({ title: visit.page.title, blocks: visit.page.blocks });
            const vectors = await options.embedder.embed(lease, chunks);
            const written = await writeIndexedPage(pool, lease, { urlOrPage: visit.page.url, title: visit.page.title, contentHash: visit.page.contentHash },
              chunks.map((c, i) => ({ ...c, embedding: vectors[i]! })), { pagesTotal: progress.pagesTotal });
            chunksWritten += written.inserted;
            return;
          }
          await transaction(pool, async (tx) => {
            await recordProgressTx(tx, lease, { pagesDone: visit.kind === 'skipped' ? 0 : 1, pagesTotal: progress.pagesTotal });
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
    // В журнал — только счётчики: ни тел страниц, ни их текста, ни адресов.
    const skipped = Object.entries(result.skipped).map(([reason, n]) => `${reason}=${n}`).join(', ') || 'нет';
    log(`worker-index: обход задачи ${lease.indexJobId}: прочитано ${result.pagesRead}, без изменений ${result.pagesUnchanged}, `
      + `фрагментов ${chunksWritten}; пропущено: ${skipped}; запросов ${result.requests}; остановка: ${result.stoppedBy}`);
  };
}
