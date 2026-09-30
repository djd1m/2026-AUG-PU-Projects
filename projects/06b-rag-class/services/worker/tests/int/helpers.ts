import { randomBytes } from 'node:crypto';
import type pg from 'pg';

// Фикстуры фичи index-jobs: аккаунт, бот, источник сайта и задачи — вставка владельцем БД (в обход RLS).
export async function seedBot(owner: pg.Pool): Promise<{ accountId: string; botId: string }> {
  const acc = await owner.query<{ id: string }>(
    "INSERT INTO account (email, password_hash) VALUES ($1, 'x') RETURNING id", [`${randomBytes(6).toString('hex')}@jobs.test`]);
  const accountId = acc.rows[0]!.id;
  const bot = await owner.query<{ id: string }>("INSERT INTO bot (account_id, public_id, name) VALUES ($1, $2, 'bot') RETURNING id",
    [accountId, randomBytes(9).toString('base64url')]);
  return { accountId, botId: bot.rows[0]!.id };
}

export async function seedJobs(owner: pg.Pool, n: number, state = 'queued'): Promise<{ accountId: string; jobIds: string[] }> {
  const { accountId, botId } = await seedBot(owner);
  const jobIds: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const src = await owner.query<{ id: string }>(
      "INSERT INTO source (bot_id, account_id, kind, url) VALUES ($1, $2, 'site', $3) RETURNING id",
      [botId, accountId, `https://jobs.test/${randomBytes(4).toString('hex')}`]);
    const job = await owner.query<{ id: string }>(
      'INSERT INTO index_job (source_id, account_id, state) VALUES ($1, $2, $3) RETURNING id', [src.rows[0]!.id, accountId, state]);
    jobIds.push(job.rows[0]!.id);
  }
  return { accountId, jobIds };
}

/**
 * Очередь общая на всю БД, как в проде: захват берёт самую старую задачу любого аккаунта. Живые задачи прежних файлов
 * (seedTenant) закрываются, чтобы тест захвата видел только свои. Прочие файлы засевают свои строки сами.
 */
export async function isolateQueue(owner: pg.Pool): Promise<void> {
  await owner.query("UPDATE index_job SET state = 'failed', error = 'изоляция теста', leased_until = NULL WHERE state IN ('queued', 'running')");
}

/** Аренда «истекла» — как если бы исполнитель пропал: срок в прошлом, строка остаётся running. */
export async function expireLease(owner: pg.Pool, jobId: string): Promise<void> {
  await owner.query("UPDATE index_job SET leased_until = now() - interval '1 second' WHERE id = $1", [jobId]);
}

export async function jobRow(owner: pg.Pool, jobId: string) {
  return (await owner.query<{ state: string; attempts: number; lease_fence: number; run_started_at: Date | null;
    progress_done: number; progress_total: number | null; error: string | null; note: string | null;
    leased_until: Date | null }>('SELECT * FROM index_job WHERE id = $1', [jobId])).rows[0]!;
}
