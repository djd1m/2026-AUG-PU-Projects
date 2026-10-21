import { type Pool, withService } from '@n6b/db';

export const RETENTION_EVERY_MS = 24 * 60 * 60 * 1000;
export const RETENTION_BATCH_SIZE = 1000;
export const RETENTION_MAX_BATCHES = 20;
export interface RetentionReport { questions: number; counters: number; skipped: boolean; more?: boolean }

/** Bounded transactions and a cross-process lock; quota days use the same Moscow boundary as reservation. */
export function retainRecentData(pool: Pool): Promise<RetentionReport> {
  return withService(pool, async (c) => {
    const lock = await c.query<{ held: boolean }>('SELECT pg_try_advisory_xact_lock(15615, 1) AS held');
    if (!lock.rows[0]?.held) return { questions: 0, counters: 0, skipped: true };
    await c.query("SET LOCAL statement_timeout = '5s'");
    const report = { questions: 0, counters: 0, skipped: false, more: false };
    for (let batch = 0; batch < RETENTION_MAX_BATCHES; batch += 1) {
      const questions = await c.query(`WITH expired AS (
        SELECT id FROM question_log WHERE created_at < now() - interval '30 days'
        ORDER BY created_at, id LIMIT $1 FOR UPDATE SKIP LOCKED)
        DELETE FROM question_log q USING expired e WHERE q.id = e.id`, [RETENTION_BATCH_SIZE]);
      const counters = await c.query(`WITH expired AS (
        SELECT id FROM quota_counter WHERE day < (now() AT TIME ZONE 'Europe/Moscow')::date - 2
        ORDER BY day, id LIMIT $1 FOR UPDATE SKIP LOCKED)
        DELETE FROM quota_counter q USING expired e WHERE q.id = e.id`, [RETENTION_BATCH_SIZE]);
      report.questions += questions.rowCount ?? 0;
      report.counters += counters.rowCount ?? 0;
      report.more = (questions.rowCount ?? 0) === RETENTION_BATCH_SIZE || (counters.rowCount ?? 0) === RETENTION_BATCH_SIZE;
      if (!report.more) break;
    }
    return report;
  });
}

/** Startup + daily; stop prevents new runs and awaits the existing transaction before pool shutdown. */
export function startRetention(pool: Pool, log: (line: string) => void,
  cleanup: (pool: Pool) => Promise<RetentionReport> = retainRecentData): { stop: () => Promise<void> } {
  let stopped = false;
  let active: Promise<void> | undefined;
  let continuation: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    if (stopped || active) return;
    active = Promise.resolve().then(() => cleanup(pool)).then((r) => {
      if (!r.skipped) log(`worker: retention questions=${r.questions} counters=${r.counters}`);
      // Drain a large backlog in bounded transactions while leaving the job loop/pool available between them.
      if (r.more && !stopped) continuation = setTimeout(run, 1000);
    }, (e: unknown) => log(`worker: retention failed: ${(e as Error).name}`)).finally(() => { active = undefined; });
  };
  run();
  const timer = setInterval(run, RETENTION_EVERY_MS);
  return { stop: async () => { stopped = true; clearInterval(timer); clearTimeout(continuation); await active; } };
}
