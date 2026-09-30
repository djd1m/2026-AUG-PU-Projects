import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { retryJob } from '../../src/jobs';
import { withTenant } from '../../src/tenant';
import { ownerPool, seedTenant, type Tenant, tenantPool } from './helpers';

// index-jobs 08_review.md F-7 (005_index_job_cabinet_grants.sql): роль кабинета на index_job — минимум. Служебные колонки
// (состояние, аренда, попытки, прогресс) кабинет не пишет; «Повторить» — только функцией n6b_retry_job; вставка задачи на
// чужой или несуществующий источник — один и тот же 23503, есть ли у чужого источника живая задача или нет.

const owner = ownerPool();
const cabinet = tenantPool(4);
let a: Tenant;
let b: Tenant;
let bIdleSource: string; // источник B без задачи

beforeAll(async () => {
  a = await seedTenant(owner);
  b = await seedTenant(owner);
  bIdleSource = (await owner.query<{ id: string }>(
    "INSERT INTO source (bot_id, account_id, kind, url) VALUES ($1, $2, 'site', 'https://idle.test/') RETURNING id",
    [b.botId, b.accountId])).rows[0]!.id;
});
afterAll(async () => { await owner.end(); await cabinet.end(); });

const pgCode = (p: Promise<unknown>) => p.then(() => 'accepted', (e: { code?: string; constraint?: string }) =>
  `${e.code ?? '?'}${e.constraint ? `:${e.constraint}` : ''}`);
const asA = (sql: string, params: unknown[]) => pgCode(withTenant(cabinet, a.accountId, (c) => c.query(sql, params)));

describe('F-7: кабинет не пишет служебные колонки index_job', () => {
  it('UPDATE своей задачи — нет права ни на одну колонку: state, lease_fence, progress_done, attempts', async () => {
    for (const set of ["state = 'succeeded'", 'lease_fence = lease_fence + 1', 'progress_done = 999', 'attempts = 0']) {
      expect(await asA(`UPDATE index_job SET ${set} WHERE id = $1`, [a.jobId]), set).toBe('42501');
    }
    expect(await owner.query('SELECT state, lease_fence, progress_done FROM index_job WHERE id = $1', [a.jobId]))
      .toMatchObject({ rows: [{ state: 'queued', lease_fence: 0, progress_done: 0 }] });
  });

  it('INSERT со служебной колонкой — отказ права; только (source_id, account_id) принимается', async () => {
    const own = (await owner.query<{ id: string }>(
      "INSERT INTO source (bot_id, account_id, kind, url) VALUES ($1, $2, 'site', $3) RETURNING id",
      [a.botId, a.accountId, `https://own.test/${randomUUID()}`])).rows[0]!.id;
    for (const col of ['state', 'lease_fence', 'progress_done', 'attempts', 'run_started_at']) {
      const v = col === 'state' ? "'succeeded'" : col === 'run_started_at' ? 'now()' : '1';
      expect(await asA(`INSERT INTO index_job (source_id, account_id, ${col}) VALUES ($1, $2, ${v})`, [own, a.accountId]), col)
        .toBe('42501');
    }
    const row = await withTenant(cabinet, a.accountId, async (c) => (await c.query<{ state: string; attempts: number }>(
      'INSERT INTO index_job (source_id, account_id) VALUES ($1, $2) RETURNING state, attempts', [own, a.accountId])).rows[0]);
    expect(row).toEqual({ state: 'queued', attempts: 0 });
  });

  it('права по каталогу: UPDATE на index_job у n6b_tenant нет, INSERT — ровно две колонки', async () => {
    const r = await owner.query<{ upd: boolean; cols: string[] }>(`
      SELECT has_any_column_privilege('n6b_tenant', 'index_job', 'UPDATE') AS upd,
             ARRAY(SELECT attname::text FROM pg_attribute WHERE attrelid = 'index_job'::regclass AND attnum > 0
                   AND NOT attisdropped AND has_column_privilege('n6b_tenant', 'index_job', attname, 'INSERT')
                   ORDER BY attname) AS cols`);
    expect(r.rows[0]).toEqual({ upd: false, cols: ['account_id', 'source_id'] });
  });
});

describe('F-7: вставка на чужой источник не раскрывает, есть ли у него живая задача', () => {
  it('чужой с живой задачей, чужой без задачи, несуществующий — один ответ 23503 при любом account_id', async () => {
    const outcomes = new Set<string>();
    for (const src of [b.sourceId, bIdleSource, randomUUID()]) {
      for (const acc of [a.accountId, b.accountId]) {
        for (const tail of ['', " ON CONFLICT (source_id) WHERE state IN ('queued', 'running') DO NOTHING"]) {
          const got = await asA(`INSERT INTO index_job (source_id, account_id) VALUES ($1, $2)${tail}`, [src, acc]);
          expect(got, `${src === b.sourceId ? 'живая' : src === bIdleSource ? 'без задачи' : 'нет'} / ${acc === a.accountId ? 'A' : 'B'}${tail ? ' / on conflict' : ''}`)
            .toBe('23503:index_job_source_fk');
          outcomes.add(got);
        }
      }
    }
    expect([...outcomes]).toEqual(['23503:index_job_source_fk']);
  });
});

describe('F-7: «Повторить» — только функцией, только своей упавшей задачи', () => {
  it('чужая упавшая и несуществующая — одинаковый not-found, чужая строка не тронута; своя упавшая → retried', async () => {
    await owner.query("UPDATE index_job SET state = 'failed', attempts = 3, error = 'x' WHERE id = ANY($1)", [[a.jobId, b.jobId]]);
    expect(await retryJob(cabinet, a.accountId, b.jobId)).toBe('not-found');
    expect(await retryJob(cabinet, a.accountId, randomUUID())).toBe('not-found');
    expect((await owner.query('SELECT state, attempts FROM index_job WHERE id = $1', [b.jobId])).rows[0])
      .toEqual({ state: 'failed', attempts: 3 });
    expect(await retryJob(cabinet, a.accountId, a.jobId)).toBe('retried');
    expect(await retryJob(cabinet, a.accountId, a.jobId)).toBe('not-failed');
    expect((await owner.query('SELECT state, attempts, error FROM index_job WHERE id = $1', [a.jobId])).rows[0])
      .toEqual({ state: 'queued', attempts: 0, error: null });
  });
});
