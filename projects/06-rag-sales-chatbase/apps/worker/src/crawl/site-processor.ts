// Обработчик источника «сайт» внутри задачи индексации (RunIndexJob п.2–5, ADR-009) — написано заново.
// Каждая посещённая единица — одна транзакция: прогресс с проверкой фенса (он же пульс для сторожа) +
// строка page либо счётчик пропуска. 0 строк по фенсу → StaleAttemptError → откат и немедленная остановка
// обхода: опоздавшая попытка не дописывает и не нагружает сайт дальше.
// Граница с chunk-embed: здесь страница записывается со своим content_hash; фрагменты и эмбеддинги
// (ChunkDocument, EmbedAndStore) подключаются той фичей в ТУ ЖЕ транзакцию страницы.
import { recordProgressTx, StaleAttemptError, transaction, type Lease, type Pool } from '@n6/db';
import { readAccountPlan } from '@n6/rag';
import { StepFailure, type SourceProcessor } from '../run-index-job';
import { CrawlFailure, crawlSite, type CrawlOptions } from './crawl-site';
import { PAGES_BY_PLAN } from './limits';
import type { NetOptions } from './safe-get';

export interface SiteProcessorOptions {
  pool: Pool; userAgent: string; net?: NetOptions;
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
    // Новая попытка пересчитывает страницы заново (без изменений тоже засчитываются): счётчики — с нуля.
    await transaction(pool, async (tx) => {
      const reset = await tx.query(`UPDATE index_job SET pages_done = 0, pages_total = NULL, updated_at = now()
        WHERE id = $1 AND current_fence = $2 AND status = 'running'`, [lease.indexJobId, lease.fence]);
      if (!reset.rowCount) throw new StaleAttemptError(lease.indexJobId, lease.fence);
      await tx.query('UPDATE source SET pages_skipped = 0 WHERE id = $1', [lease.sourceId]);
    });
    let result;
    try {
      result = await crawlSite({
        ...options.crawl, rootUrl: row.root_url, pageBudget, userAgent: options.userAgent, net: options.net,
        knownHashes: new Set(known.rows.map((r) => r.content_hash)),
        onVisit: (visit, progress) => transaction(pool, async (tx) => {
          await recordProgressTx(tx, lease, { pagesDone: visit.kind === 'skipped' ? 0 : 1, pagesTotal: progress.pagesTotal });
          if (visit.kind === 'page') {
            await tx.query(`INSERT INTO page (source_id, bot_id, url_or_page, title, content_hash) VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (source_id, url_or_page) DO UPDATE SET title = EXCLUDED.title, content_hash = EXCLUDED.content_hash, skipped_reason = NULL`,
            [lease.sourceId, lease.botId, visit.page.url, visit.page.title.slice(0, 500), visit.page.contentHash]);
          } else if (visit.kind === 'skipped') {
            await tx.query('UPDATE source SET pages_skipped = pages_skipped + 1 WHERE id = $1', [lease.sourceId]);
          }
        }),
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
      + `пропущено: ${skipped}; запросов ${result.requests}; остановка: ${result.stoppedBy}`);
  };
}
