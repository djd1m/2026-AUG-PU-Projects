// Задача индексации на НАСТОЯЩЕМ Postgres (ADR-009, FR-INDEX-003, SC-US-016-3): идентификатор до работы,
// идемпотентность по Idempotency-Key, фенс попыток, сторож, три состояния + «нет ответа».
// Конкурентные прогоны 2 и 3 из .claude/rules/testing.md. Образец формы — tests/quota.concurrency.test.ts
// (своя схема на прогон; он — из N5 tests/database.integration.test.ts).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPool, transaction, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import {
  closeFailedTx, completeIndexJob, createSourceJob, failIndexJob, leaseIndexJob, readIndexJob, recordProgress, retryAutomatically,
  retryIndexJob, StaleAttemptError,
} from '../packages/db/src/index-jobs';
import { runIndexJob, StepFailure } from '../apps/worker/src/run-index-job';
import { watchdogTick } from '../apps/worker/src/watchdog';
import type { IndexMessage } from '../packages/queue/src/index';
import { ensureTestDatabase } from '../scripts/test-db.mjs';

const databaseUrl = process.env.DATABASE_URL;
const all = <T>(n: number, f: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => f(i)));
const minutes = (n: number, from = new Date()) => new Date(from.getTime() - n * 60_000);

describe.skipIf(!databaseUrl)('Задача индексации на настоящем Postgres: фенс, идемпотентность, сторож', () => {
  let pool: Pool;
  const schema = `index_job_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
  });
  afterAll(async () => {
    if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); }
  });

  const account = async () => (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash) VALUES ($1, 'x') RETURNING id`,
    [`u${randomBytes(6).toString('hex')}@example.org`])).rows[0]!.id;
  const bot = async (owner: string | null, status = owner ? 'active' : 'draft', createdAt = new Date()) =>
    (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, created_at) VALUES ($1, $2, $3, 'Компания', $4) RETURNING id`,
      [owner, status, randomBytes(16).toString('base64url').slice(0, 22), createdAt])).rows[0]!.id;
  const job = async (id: string) => (await pool.query('SELECT * FROM index_job WHERE id = $1', [id])).rows[0];
  const attempts = async (id: string) => (await pool.query('SELECT fence::int, series_no, status FROM job_attempt WHERE index_job_id = $1 ORDER BY fence', [id])).rows;
  const newJob = async (owner?: string) => {
    const botId = await bot(owner ?? await account());
    return { botId, ...(await createSourceJob(pool, { botId, kind: 'site', rootUrl: 'https://my.example', idempotencyKey: randomUUID() })) };
  };

  it('идентификатор ДО работы: задача queued, fence 0, ни одной попытки; сообщение транспорта — generation 0', async () => {
    const created = await newJob();
    expect(created.created).toBe(true);
    const row = await job(created.indexJobId);
    expect([row.status, Number(row.current_fence), row.pages_done]).toEqual(['queued', 0, 0]);
    expect(await attempts(created.indexJobId)).toEqual([]);
  });

  it('прогон 2: 10 одновременных создания с одним Idempotency-Key → одна задача, один источник, один и тот же id', async () => {
    const botId = await bot(await account()), key = randomUUID();
    const results = await all(10, () => createSourceJob(pool, { botId, kind: 'site', rootUrl: 'https://my.example', idempotencyKey: key }));
    expect(new Set(results.map((r) => r.indexJobId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(Number((await pool.query('SELECT count(*) FROM source WHERE bot_id = $1', [botId])).rows[0].count)).toBe(1); // сирот нет
    expect(Number((await pool.query('SELECT count(*) FROM index_job WHERE bot_id = $1', [botId])).rows[0].count)).toBe(1);
  });

  it('два воркера на ОДНОМ фенсе (двойная доставка сообщения): ровно одна аренда, вторая — stale; один результат', async () => {
    const { indexJobId } = await newJob();
    const message = { index_job_id: indexJobId, generation: 0 };
    const leases = await all(2, () => leaseIndexJob(pool, message));
    const won = leases.filter((l) => l !== null);
    expect(won).toHaveLength(1);
    expect(won[0]!.fence).toBe(1);
    // Проигравший действует так, будто аренда его (ошибка вызывающего): его запись отвергается фенсом.
    const loser = { indexJobId, fence: message.generation };
    await expect(recordProgress(pool, loser, { pagesDone: 1 })).rejects.toBeInstanceOf(StaleAttemptError);
    await expect(completeIndexJob(pool, loser)).rejects.toBeInstanceOf(StaleAttemptError);
    await recordProgress(pool, won[0]!, { pagesDone: 3, chunksDone: 12, pagesTotal: 5 });
    await completeIndexJob(pool, won[0]!);
    const row = await job(indexJobId);
    expect([row.status, row.pages_done, row.chunks_done]).toEqual(['done', 3, 12]);
    expect(await attempts(indexJobId)).toEqual([{ fence: 1, series_no: 1, status: 'done' }]);
  });

  it('прогон 3: старая попытка «ожила» после новой → её запись отброшена (0 строк, откат), результат новой цел', async () => {
    const { indexJobId } = await newJob();
    const old = (await leaseIndexJob(pool, { index_job_id: indexJobId, generation: 0 }))!;
    await recordProgress(pool, old, { pagesDone: 2 });
    // Автоматический повтор передаёт задачу следующей попытке той же серии.
    const next = await retryAutomatically(pool, old, 'unreachable');
    expect(next).toEqual({ retry: true, message: { index_job_id: indexJobId, generation: 1 } });
    const fresh = (await leaseIndexJob(pool, (next as { message: IndexMessage }).message))!;
    expect([fresh.fence, fresh.seriesNo, fresh.attemptNo]).toEqual([2, 1, 2]);
    // Старая и новая пишут одновременно: проходит только новая.
    const outcomes = await Promise.allSettled([recordProgress(pool, old, { pagesDone: 100, chunksDone: 100 }), recordProgress(pool, fresh, { pagesDone: 1, chunksDone: 4 })]);
    expect(outcomes[0].status).toBe('rejected');
    expect((outcomes[0] as PromiseRejectedResult).reason).toBeInstanceOf(StaleAttemptError);
    expect(outcomes[1].status).toBe('fulfilled');
    await expect(failIndexJob(pool, old, 'internal')).rejects.toBeInstanceOf(StaleAttemptError);
    const row = await job(indexJobId);
    expect([row.status, row.pages_done, row.chunks_done, Number(row.current_fence)]).toEqual(['running', 3, 4, 2]);
  });

  it('≤ 2 автоматических попыток серии: третья — отказ с причиной, а не новая попытка', async () => {
    const { indexJobId } = await newJob();
    const first = (await leaseIndexJob(pool, { index_job_id: indexJobId, generation: 0 }))!;
    const again = await retryAutomatically(pool, first, 'embedding_unavailable');
    const second = (await leaseIndexJob(pool, (again as { message: IndexMessage }).message))!;
    expect(await retryAutomatically(pool, second, 'embedding_unavailable')).toEqual({ retry: false });
    const row = await job(indexJobId);
    expect([row.status, row.failure_reason]).toEqual(['failed', 'embedding_unavailable']);
    expect((await attempts(indexJobId)).map((a) => a.status)).toEqual(['failed', 'failed']);
  });

  it('«Повторить»: тот же index_job_id, новая серия; чужой аккаунт — null (404); не отказавшая — null', async () => {
    const owner = await account();
    const { indexJobId } = await newJob(owner);
    expect(await retryIndexJob(pool, indexJobId, owner)).toBeNull(); // queued — нечего повторять
    const lease = (await leaseIndexJob(pool, { index_job_id: indexJobId, generation: 0 }))!;
    await failIndexJob(pool, lease, 'unreachable');
    expect(await retryIndexJob(pool, indexJobId, await account())).toBeNull();
    const message = (await retryIndexJob(pool, indexJobId, owner))!;
    expect(message).toEqual({ index_job_id: indexJobId, generation: 2 });
    const second = (await leaseIndexJob(pool, message))!;
    expect([second.seriesNo, second.attemptNo, second.fence]).toEqual([2, 1, 3]);
    expect((await job(indexJobId)).failure_reason).toBeNull();
  });

  it('SC-US-016-3: воркер умер — «нет ответа» до сторожа, failed(stalled) после; опоздавший не допишет', async () => {
    const owner = await account();
    const { indexJobId, sourceId } = await newJob(owner);
    const lease = (await leaseIndexJob(pool, { index_job_id: indexJobId, generation: 0 }))!;
    await pool.query('UPDATE index_job SET updated_at = $2 WHERE id = $1', [indexJobId, minutes(6)]);
    expect((await readIndexJob(pool, indexJobId, { accountId: owner }))!.state).toBe('no_response');
    const result = await watchdogTick(pool, async () => {});
    expect(result.stalled).toBeGreaterThanOrEqual(1);
    const view = (await readIndexJob(pool, indexJobId, { accountId: owner }))!;
    expect([view.state, view.reason]).toEqual(['failed', 'stalled']);
    expect((await pool.query('SELECT status FROM source WHERE id = $1', [sourceId])).rows[0].status).toBe('failed');
    await expect(recordProgress(pool, lease, { pagesDone: 1 })).rejects.toBeInstanceOf(StaleAttemptError);
  });

  it('сторож: предел задачи 15 мин при живом пульсе → failed(stalled); queued без движения 2 мин → повторная доставка', async () => {
    const { indexJobId } = await newJob();
    await leaseIndexJob(pool, { index_job_id: indexJobId, generation: 0 });
    await pool.query('UPDATE job_attempt SET started_at = $2 WHERE index_job_id = $1', [indexJobId, minutes(16)]);
    const waiting = await newJob();
    await pool.query('UPDATE index_job SET updated_at = $2 WHERE id = $1', [waiting.indexJobId, minutes(3)]);
    const sent: IndexMessage[] = [];
    const result = await watchdogTick(pool, async (m) => { sent.push(m); });
    expect(result.overdue).toBeGreaterThanOrEqual(1);
    expect([(await job(indexJobId)).status, (await job(indexJobId)).failure_reason]).toEqual(['failed', 'stalled']);
    expect(sent).toContainEqual({ index_job_id: waiting.indexJobId, generation: 0 });
  });

  it('сторож: черновик предпросмотра старше 24 ч удалён каскадом; свежий и активный — нет', async () => {
    const old = await bot(null, 'draft', minutes(25 * 60)), fresh = await bot(null, 'draft'), active = await bot(await account(), 'active', minutes(25 * 60));
    await createSourceJob(pool, { botId: old, kind: 'site', rootUrl: 'https://old.example', idempotencyKey: randomUUID(), budget: { pageBudget: 20, embedBudget: 40_000 } });
    await watchdogTick(pool, async () => {});
    const left = (await pool.query('SELECT id FROM bot WHERE id = ANY($1)', [[old, fresh, active]])).rows.map((r) => r.id);
    expect(left.sort()).toEqual([fresh, active].sort());
    expect(Number((await pool.query('SELECT count(*) FROM index_job WHERE bot_id = $1', [old])).rows[0].count)).toBe(0);
  });

  it('ReadIndexJob: три различимых состояния по id; чужой и несуществующий — одинаково null; черновик — по боту предпросмотра', async () => {
    const owner = await account();
    const running = await newJob(owner), done = await newJob(owner), failed = await newJob(owner);
    for (const j of [running, done, failed]) await leaseIndexJob(pool, { index_job_id: j.indexJobId, generation: 0 });
    await recordProgress(pool, { indexJobId: running.indexJobId, fence: 1 }, { pagesDone: 17, pagesTotal: 50 });
    await completeIndexJob(pool, { indexJobId: done.indexJobId, fence: 1 });
    await failIndexJob(pool, { indexJobId: failed.indexJobId, fence: 1 }, 'robots_disallowed');
    const states = await Promise.all([running, done, failed].map(async (j) => (await readIndexJob(pool, j.indexJobId, { accountId: owner }))!));
    expect(states.map((s) => s.state)).toEqual(['running', 'done', 'failed']);
    expect(states[0]).toMatchObject({ pages_done: 17, pages_total: 50 });
    expect(states[2]!.reason).toBe('robots_disallowed');
    expect(await readIndexJob(pool, running.indexJobId, { accountId: await account() })).toBeNull();
    expect(await readIndexJob(pool, randomUUID(), { accountId: owner })).toBeNull();
    expect(await readIndexJob(pool, 'не-uuid', { accountId: owner })).toBeNull();
    const draft = await bot(null);
    const preview = await createSourceJob(pool, { botId: draft, kind: 'site', rootUrl: 'https://p.example', idempotencyKey: randomUUID(), budget: { pageBudget: 20, embedBudget: 40_000 } });
    expect((await readIndexJob(pool, preview.indexJobId, { previewBotId: draft }))!.state).toBe('running');
    expect(await readIndexJob(pool, preview.indexJobId, { previewBotId: running.botId })).toBeNull();
    expect((await job(preview.indexJobId))).toMatchObject({ page_budget: 20, embed_budget: 40_000 });
  });

  it('runIndexJob: успех, отказ шага, повтор через очередь, устаревшее сообщение пропускается', async () => {
    const ok = await newJob(), bad = await newJob(), flaky = await newJob();
    const sent: IndexMessage[] = [];
    const deps = (process: () => Promise<void>) => ({ pool, enqueue: async (m: IndexMessage) => { sent.push(m); }, process });
    expect(await runIndexJob(deps(async () => {}), { index_job_id: ok.indexJobId, generation: 0 })).toBe('done');
    expect(await runIndexJob(deps(async () => {}), { index_job_id: ok.indexJobId, generation: 0 })).toBe('skipped');
    expect(await runIndexJob(deps(async () => { throw new StepFailure('no_text'); }), { index_job_id: bad.indexJobId, generation: 0 })).toBe('failed');
    expect((await job(bad.indexJobId)).failure_reason).toBe('no_text');
    expect(await runIndexJob(deps(async () => { throw new StepFailure('embedding_unavailable', true); }), { index_job_id: flaky.indexJobId, generation: 0 })).toBe('retry');
    expect(sent).toEqual([{ index_job_id: flaky.indexJobId, generation: 1 }]);
    expect(await runIndexJob(deps(async () => { throw new Error('неожиданное'); }), sent[0]!)).toBe('failed');
    expect((await job(flaky.indexJobId)).failure_reason).toBe('internal');
  });

  it('carry_over ревью: closeFailedTx не переводит done/failed в failed и не трогает фенс — 0 строк = no-op', async () => {
    const done = await newJob(), failed = await newJob();
    const a = (await leaseIndexJob(pool, { index_job_id: done.indexJobId, generation: 0 }))!;
    await completeIndexJob(pool, a);
    const b = (await leaseIndexJob(pool, { index_job_id: failed.indexJobId, generation: 0 }))!;
    await failIndexJob(pool, b, 'no_text');
    for (const id of [done.indexJobId, failed.indexJobId]) await transaction(pool, (tx) => closeFailedTx(tx, id, 'stalled', new Date()));
    const d = await job(done.indexJobId), f = await job(failed.indexJobId);
    expect([d.status, d.failure_reason, Number(d.current_fence)]).toEqual(['done', null, 1]);
    expect([f.status, f.failure_reason, Number(f.current_fence)]).toEqual(['failed', 'no_text', 1]);
    expect((await pool.query('SELECT status FROM source WHERE id = $1', [done.sourceId])).rows[0].status).toBe('ready');
    expect(await attempts(done.indexJobId)).toEqual([{ fence: 1, series_no: 1, status: 'done' }]);
  });
});
