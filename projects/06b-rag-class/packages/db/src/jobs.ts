// Источник и задача индексации — сторона кабинета (Pseudocode «Create source and enqueue index job», шаг 9 «Worker lease
// loop»; ADR-005; long-running-job.md). Всё под withTenant: чужой бот и чужая задача не видны RLS и дают 404.
//
// Идемпотентный ключ — два уровня (docs/features/index-jobs/01_plan.md §2.1):
//   источник сайта — (bot_id, нормализованный url), 004_source_site_key.sql;
//   живая задача    — (source_id) WHERE state IN ('queued','running'), 001_init.sql.
// Обе вставки — ON CONFLICT DO NOTHING и чтение победителя. Конфликтующая незакоммиченная вставка заставляет ждать её
// COMMIT, следующий SELECT (READ COMMITTED, новый снимок) видит победителя: N одновременных POST → одна задача.
// Ручка (job_id) возвращается до начала работы: здесь работы нет вовсе, её берёт воркер (services/worker/src/lease.ts).

import type { Pool } from './pool.js';
import { withTenant } from './tenant.js';

/** Не более трёх захватов на запуск: CHECK index_job.attempts BETWEEN 0 AND 3 (001_init.sql). */
export const JOB_MAX_ATTEMPTS = 3;
/** Аренда исполнителя; пульс продлевает её каждые JOB_RENEW_EVERY_MS. */
export const JOB_LEASE_SECONDS = 120;
export const JOB_RENEW_EVERY_MS = 30_000;
/** Потолок задачи от run_started_at (FR-n6b-4, docs/long-job-contract.md). */
export const JOB_CEILING_MINUTES = 15;
export const SITE_URL_MAX = 2048;

/** Что видит пользователь: queued и running — одно «выполняется» (Architecture, сверка IndexJob.state). */
export type JobUserState = 'running' | 'succeeded' | 'failed';

export interface JobView {
  readonly job_id: string;
  readonly source_id: string;
  readonly state: JobUserState;
  readonly progress_done: number;
  readonly progress_total: number | null;
  readonly fragments: number;
  readonly error: string | null;
  readonly note: string | null;
}

/** Неизвестное значение состояния — не «готово»: закрытое множество, иначе отказ (honest-configuration CFG-I3). */
export function userStateOf(stored: unknown): JobUserState {
  switch (stored) {
    case 'queued':
    case 'running': return 'running';
    case 'succeeded': return 'succeeded';
    case 'failed': return 'failed';
    default: throw new Error(`неизвестное состояние задачи: ${String(stored)}`);
  }
}

/**
 * URL источника-сайта: http/https, порт 80/443 или не указан, без учётных данных, ≤ 2048 символов; #фрагмент отрезается
 * (он не меняет страницу и не должен давать второй источник). Непригодное — null (422). Проверку адресов на частные
 * сети (SSRF, шаг 2 алгоритма) делает crawl-site перед первым сетевым запросом: в этой фиче сети нет.
 */
export function normalizeSiteUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text === '' || text.length > SITE_URL_MAX) return null;
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!['', '80', '443'].includes(url.port)) return null;
  if (url.username || url.password || !url.hostname) return null;
  url.hash = '';
  return url.href.length > SITE_URL_MAX ? null : url.href;
}

export interface Enqueued {
  readonly jobId: string;
  readonly sourceId: string;
  /** false — вернулась уже живая задача источника (повтор запроса). */
  readonly created: boolean;
}

/** POST /api/bots/{id}/sources {url}: null — бот не виден аккаунту (404). url — результат normalizeSiteUrl. */
export function enqueueSiteSource(pool: Pool, accountId: string, botId: string, url: string): Promise<Enqueued | null> {
  return withTenant(pool, accountId, async (c) => {
    const bot = await c.query<{ account_id: string }>('SELECT account_id FROM bot WHERE id = $1', [botId]);
    const owner = bot.rows[0]?.account_id;
    if (!owner) return null;
    await c.query(`INSERT INTO source (bot_id, account_id, kind, url) VALUES ($1, $2, 'site', $3)
      ON CONFLICT (bot_id, url) WHERE kind = 'site' DO NOTHING`, [botId, owner, url]);
    const src = await c.query<{ id: string; account_id: string }>(
      "SELECT id, account_id FROM source WHERE bot_id = $1 AND kind = 'site' AND url = $2", [botId, url]);
    const source = src.rows[0];
    if (!source) throw new Error('источник не найден после вставки: идемпотентный ключ источника не сработал');
    // Живая задача могла завершиться между конфликтом и чтением — тогда следующая вставка пройдёт. Три круга с запасом.
    for (let round = 0; round < 3; round += 1) {
      const ins = await c.query<{ id: string }>(`INSERT INTO index_job (source_id, account_id) VALUES ($1, $2)
        ON CONFLICT (source_id) WHERE state IN ('queued', 'running') DO NOTHING RETURNING id`, [source.id, source.account_id]);
      if (ins.rows[0]) return { jobId: ins.rows[0].id, sourceId: source.id, created: true };
      const live = await c.query<{ id: string }>(
        "SELECT id FROM index_job WHERE source_id = $1 AND state IN ('queued', 'running')", [source.id]);
      if (live.rows[0]) return { jobId: live.rows[0].id, sourceId: source.id, created: false };
    }
    throw new Error('живая задача источника не найдена после конфликта: идемпотентный ключ не сработал');
  });
}

interface JobRow {
  id: string; source_id: string; state: string; progress_done: number; progress_total: number | null;
  error: string | null; note: string | null; fragments: string;
}

const toView = (r: JobRow): JobView => ({ job_id: r.id, source_id: r.source_id, state: userStateOf(r.state),
  progress_done: r.progress_done, progress_total: r.progress_total, fragments: Number(r.fragments), error: r.error,
  note: r.note });

const JOB_SELECT = `SELECT j.id, j.source_id, j.state, j.progress_done, j.progress_total, j.error, j.note,
  (SELECT count(*) FROM chunk ch JOIN document d ON d.id = ch.document_id WHERE d.source_id = j.source_id) AS fragments
  FROM index_job j`;

/** GET /api/jobs/{job_id}: null — задачи нет или она чужая (404, существование не раскрывается). */
export function readJob(pool: Pool, accountId: string, jobId: string): Promise<JobView | null> {
  return withTenant(pool, accountId, async (c) => {
    const row = (await c.query<JobRow>(`${JOB_SELECT} WHERE j.id = $1`, [jobId])).rows[0];
    return row ? toView(row) : null;
  });
}

export type RetryResult = 'retried' | 'not-found' | 'not-failed' | 'source-busy';

/**
 * POST /api/jobs/{job_id}/retry (шаг 9): упавшая задача снова в очереди с ТЕМ ЖЕ job_id. attempts и run_started_at
 * сбрасываются (новый запуск — новый отсчёт потолка), progress_done сохраняется: повтор продолжает, а не начинает заново.
 * Живую или готовую задачу повторить нельзя (409). Если у источника уже есть другая живая задача — тоже 409.
 */
export function retryJob(pool: Pool, accountId: string, jobId: string): Promise<RetryResult> {
  // Кабинет не имеет UPDATE на index_job (005_index_job_cabinet_grants.sql, 08_review.md F-7): переход failed → queued
  // делает функция n6b_retry_job, и только его. Ответ функции — закрытое множество; иное — исключение (CFG-I3).
  return withTenant(pool, accountId, async (c) => {
    const r = (await c.query<{ r: string }>('SELECT n6b_retry_job($1) AS r', [jobId])).rows[0]?.r;
    if (r === 'retried' || r === 'not-found' || r === 'not-failed' || r === 'source-busy') return r;
    throw new Error(`n6b_retry_job вернула нераспознанный ответ: ${String(r)}`);
  });
}

export interface CabinetSource {
  readonly bot_id: string;
  readonly bot_name: string;
  readonly source_id: string | null;
  readonly kind: string | null;
  readonly locator: string | null;
  readonly job: JobView | null;
}

/** Экран кабинета: боты аккаунта, их источники и ПОСЛЕДНЯЯ задача каждого источника. */
export function listCabinetSources(pool: Pool, accountId: string): Promise<CabinetSource[]> {
  return withTenant(pool, accountId, async (c) => {
    const rows = await c.query<{ bot_id: string; bot_name: string; source_id: string | null; kind: string | null;
      locator: string | null; job_id: string | null } & Partial<JobRow>>(`
      SELECT b.id AS bot_id, b.name AS bot_name, s.id AS source_id, s.kind, coalesce(s.url, s.file_name) AS locator,
             j.id AS job_id, j.state, j.progress_done, j.progress_total, j.error, j.note,
             (SELECT count(*) FROM chunk ch JOIN document d ON d.id = ch.document_id WHERE d.source_id = s.id) AS fragments
      FROM bot b
      LEFT JOIN source s ON s.bot_id = b.id
      LEFT JOIN LATERAL (SELECT * FROM index_job x WHERE x.source_id = s.id ORDER BY x.created_at DESC LIMIT 1) j ON true
      ORDER BY b.created_at, b.id, s.created_at, s.id`);
    return rows.rows.map((r) => ({ bot_id: r.bot_id, bot_name: r.bot_name, source_id: r.source_id, kind: r.kind,
      locator: r.locator, job: r.job_id ? toView({ ...(r as JobRow), id: r.job_id, source_id: r.source_id! }) : null }));
  });
}
