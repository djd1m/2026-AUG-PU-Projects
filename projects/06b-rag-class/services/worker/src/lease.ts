// Аренда задачи индексации, fence и контрольная точка (Pseudocode «Worker lease loop» шаги 1, 4, 6, 7; ADR-005).
// Перенос N4 #13 — projects/04-calorie-vision-cal-ai/apps/recognizer/src/lease.ts, адаптирован:
//   * захват ОДНОЙ инструкцией UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1) вместо SELECT + UPDATE;
//   * статусы index_job (queued/running/succeeded/failed) вместо recognition; предел — attempts < 3 на ЗАПУСК
//     («Повторить» обнуляет attempts), а lease_fence растёт монотонно всю жизнь задачи и не сбрасывается никогда;
//   * running с истёкшей арендой перезахватывается (у N4 задание оставалось queued), run_started_at при этом прежний;
//   * отбор по created_at (бюджет N4 «30 с от создания») убран: потолок здесь от run_started_at, считает БД;
//   * партнёрской атрибуции и полей распознавания нет; различение «перезахват/уборщик» не нужно вызывающему — 'lost'.
// Почему fence, а не время (N4): истёкшая аренда не значит, что первый исполнитель мёртв. После закрытия транзакции
// захвата исполнителей разделяет только срок аренды, а запись результата — НОМЕР захвата. Каждая запись исполнителя
// условна по (id, lease_fence, state='running'): проигравший не пишет ни прогресс, ни исход.

import { JOB_CEILING_MINUTES, JOB_LEASE_SECONDS, JOB_MAX_ATTEMPTS, type Pool, withService } from '@n6b/db';

export interface LeasedJob {
  readonly id: string;
  readonly sourceId: string;
  readonly accountId: string;
  readonly kind: 'site' | 'pdf';
  readonly url: string | null;
  readonly fileName: string | null;
  /** Номер захвата: каждая запись исполнителя условна по нему. */
  readonly fence: number;
  readonly attempts: number;
  /** Прогресс прошлого запуска — повтор продолжает с него (SC-US-004-3). */
  readonly progressDone: number;
  readonly progressTotal: number | null;
}

// Кандидат: queued, либо running с истёкшей арендой (исполнитель пропал), и не больше трёх захватов за запуск.
// run_started_at ставится только при захвате ИЗ queued — перезахват отсчёт потолка не сбрасывает (FR-n6b-4).
export const LEASE_SQL = `
  UPDATE index_job j
  SET state = 'running',
      leased_until = now() + make_interval(secs => $1),
      lease_fence = j.lease_fence + 1,
      attempts = j.attempts + 1,
      run_started_at = CASE WHEN j.state = 'queued' THEN now() ELSE j.run_started_at END
  WHERE j.id = (
    SELECT c.id FROM index_job c
    WHERE (c.state = 'queued' OR (c.state = 'running' AND c.leased_until < now()))
      AND c.attempts < $2
    ORDER BY c.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1)
  RETURNING j.id, j.source_id, j.account_id, j.lease_fence, j.attempts, j.progress_done, j.progress_total`;

/** Берёт аренду и ЗАКРЫВАЕТ транзакцию: во время работы соединение пула не удерживается. */
export function acquireLease(pool: Pool): Promise<LeasedJob | null> {
  return withService(pool, async (c) => {
    const row = (await c.query<{ id: string; source_id: string; account_id: string; lease_fence: number; attempts: number;
      progress_done: number; progress_total: number | null }>(LEASE_SQL, [JOB_LEASE_SECONDS, JOB_MAX_ATTEMPTS])).rows[0];
    if (!row) return null;
    const src = (await c.query<{ kind: 'site' | 'pdf'; url: string | null; file_name: string | null }>(
      'SELECT kind, url, file_name FROM source WHERE id = $1 AND account_id = $2', [row.source_id, row.account_id])).rows[0];
    if (!src) throw new Error('источник задачи не найден: составной FK нарушен');
    return { id: row.id, sourceId: row.source_id, accountId: row.account_id, kind: src.kind, url: src.url,
      fileName: src.file_name, fence: row.lease_fence, attempts: row.attempts, progressDone: row.progress_done,
      progressTotal: row.progress_total };
  });
}

export type Checkpoint = 'ok' | 'lost' | 'over-ceiling';

// Продление аренды и проверка потолка одной инструкцией; время — часы БД, отсчёт — от run_started_at, не от created_at.
export const CHECKPOINT_SQL = `
  UPDATE index_job SET leased_until = now() + make_interval(secs => $3)
  WHERE id = $1 AND lease_fence = $2 AND state = 'running'
  RETURNING (now() - run_started_at) > make_interval(mins => $4) AS over`;

/** Контрольная точка (шаг 4 и 6): 'lost' — задачу забрали (fence) или закрыл уборщик; 'over-ceiling' — прошло 15 мин. */
export async function checkpointLease(pool: Pool, job: Pick<LeasedJob, 'id' | 'fence'>): Promise<Checkpoint> {
  const res = await withService(pool, (c) => c.query<{ over: boolean }>(CHECKPOINT_SQL,
    [job.id, job.fence, JOB_LEASE_SECONDS, JOB_CEILING_MINUTES]));
  const row = res.rows[0];
  if (!row) return 'lost';
  return row.over ? 'over-ceiling' : 'ok';
}

const count = (v: unknown, what: string, nullable = false): number | null => {
  if (nullable && v === null) return null;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > 2_147_483_647) {
    throw new Error(`${what} не целое ≥ 0: прогресс не записан`);
  }
  return v;
};

/** Прогресс «N из M» (шаг 5). false — аренда потеряна, писать дальше нельзя. */
export async function reportProgress(pool: Pool, job: Pick<LeasedJob, 'id' | 'fence'>, done: number,
  total: number | null): Promise<boolean> {
  const d = count(done, 'progress_done');
  const t = count(total, 'progress_total', true);
  if (t !== null && d! > t) throw new Error('progress_done больше progress_total: прогресс не записан');
  const res = await withService(pool, (c) => c.query(`UPDATE index_job SET progress_done = $3, progress_total = $4
    WHERE id = $1 AND lease_fence = $2 AND state = 'running'`, [job.id, job.fence, d, t]));
  return res.rowCount === 1;
}

export type JobOutcome =
  | { readonly state: 'succeeded'; readonly note?: string | null }
  | { readonly state: 'failed'; readonly error: string };

export const OWNER_TEXT_MAX = 500;
const ownerText = (s: string | null | undefined): string | null =>
  s === null || s === undefined ? null : String(s).slice(0, OWNER_TEXT_MAX);

/** Исход (шаг 7): 'written' — записан; 'lost' — строку забрал другой захват или уборщик, чужой исход не трётся. */
export async function finishJob(pool: Pool, job: Pick<LeasedJob, 'id' | 'fence'>, outcome: JobOutcome): Promise<'written' | 'lost'> {
  if (outcome.state === 'failed' && !outcome.error) throw new Error('отказ без причины: владельцу нечего показать');
  const res = await withService(pool, (c) => c.query(`UPDATE index_job
    SET state = $3, error = $4, note = $5, finished_at = now(), leased_until = NULL
    WHERE id = $1 AND lease_fence = $2 AND state = 'running'`,
  [job.id, job.fence, outcome.state, outcome.state === 'failed' ? ownerText(outcome.error) : null,
    outcome.state === 'succeeded' ? ownerText(outcome.note) : null]));
  return res.rowCount === 1 ? 'written' : 'lost';
}
