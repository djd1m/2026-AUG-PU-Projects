import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createJobHandler, createRetryHandler, createSourceHandler, type JobsDeps } from '@/server/jobs-handler';
import { ownerPool, servicePool, tenantPool } from '../../../../packages/db/tests/int/helpers';
import { runOnce } from '../../../../services/worker/src/loop';
import { dispatchRunner, type JobRunner } from '../../../../services/worker/src/runner';
import { isolateQueue, seedBot } from '../../../../services/worker/tests/int/helpers';

// FR-n6b-4 через HTTP-ручки на настоящем Postgres: кабинет под RLS (n6b_app_tenant), воркер — n6b_app_service.
// Строки «КВИТАНЦИЯ» печатаются в журнал прогона и переносятся в docs/long-job-contract.md с настоящими job_id.
const BASE = 'https://n6b.example.test';
const owner = ownerPool();
const cabinet = tenantPool(10);
const worker = servicePool(4);
afterAll(async () => { await Promise.all([owner.end(), cabinet.end(), worker.end()]); });

const sessions = new Map<string, string>();
function login(accountId: string): string {
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, accountId);
  return token;
}
const deps: JobsDeps = { resolver: async () => [{ address: '93.184.216.34', family: 4 }], tenantPool: cabinet, publicBaseUrl: BASE, log: () => undefined,
  authenticate: async (t) => sessions.get(t) ?? null };
const postSource = createSourceHandler(deps);
const getJob = createJobHandler(deps);
const retry = createRetryHandler(deps);
const post = (token: string, body: unknown) => new Request(`${BASE}/api/bots/x/sources`, { method: 'POST',
  headers: { origin: BASE, cookie: `n6b_session=${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const get = (token: string) => new Request(`${BASE}/api/jobs/x`, { headers: { cookie: `n6b_session=${token}` } });
const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as { data?: Record<string, unknown> } });
const receipt = (state: string, jobId: string, body: unknown) =>
  console.log(`КВИТАНЦИЯ ${state}: GET /api/jobs/${jobId} → ${JSON.stringify(body)}, job_id=${jobId}, ${new Date().toISOString()}`);

describe('POST источника → 202 {job_id} до работы (SC-US-002-1, SC-US-004-4)', () => {
  it('202 с job_id; задача в очереди, прогресс 0, работа не начата; GET → «выполняется»', async () => {
    const { accountId, botId } = await seedBot(owner);
    const token = login(accountId);
    const t0 = Date.now();
    const res = await read(await postSource(post(token, { url: 'https://example.ru/' }), botId));
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(res.status).toBe(202);
    const jobId = res.body.data!.job_id as string;
    expect((await owner.query('SELECT state, attempts, run_started_at FROM index_job WHERE id = $1', [jobId])).rows[0])
      .toEqual({ state: 'queued', attempts: 0, run_started_at: null });
    const view = await read(await getJob(get(token), jobId));
    expect(view).toMatchObject({ status: 200, body: { data: { job_id: jobId, state: 'running', progress_done: 0 } } });
  });

  it('конкурентно: 20 одновременных POST одного источника (с разными #фрагментами) → один источник, одна задача, один job_id', async () => {
    const { accountId, botId } = await seedBot(owner);
    const token = login(accountId);
    // Пул прогрет: 10 соединений открыты заранее, иначе установка соединений разводит запросы во времени и гонки нет
    // (проверено мутацией «прочитать, потом вставить» — на холодном пуле она зеленела).
    await Promise.all(Array.from({ length: 10 }, () => cabinet.query('SELECT pg_sleep(0.05)')));
    for (const page of ['price', 'delivery', 'contacts']) {
      const all = await Promise.all(Array.from({ length: 20 }, (_, i) =>
        postSource(post(token, { url: `https://Example.ru/${page}#p${i}` }), botId).then(read)));
      expect(all.map((r) => r.status), page).toEqual(Array(20).fill(202));
      expect(new Set(all.map((r) => r.body.data!.job_id)).size).toBe(1);
    }
    const counts = (await owner.query(`SELECT (SELECT count(*)::int FROM source WHERE bot_id = $1) AS sources,
      (SELECT count(*)::int FROM index_job j JOIN source s ON s.id = j.source_id WHERE s.bot_id = $1) AS jobs`, [botId])).rows[0];
    expect(counts).toEqual({ sources: 3, jobs: 3 });
  });

  it('повтор после завершения задачи ставит новую задачу того же источника (живой нет — ключ свободен)', async () => {
    const { accountId, botId } = await seedBot(owner);
    const token = login(accountId);
    const first = (await read(await postSource(post(token, { url: 'https://a.example/' }), botId))).body.data!.job_id;
    await owner.query("UPDATE index_job SET state = 'succeeded' WHERE id = $1", [first]);
    const second = (await read(await postSource(post(token, { url: 'https://a.example/' }), botId))).body.data!.job_id;
    expect(second).not.toBe(first);
  });

  it('чужой бот и чужая задача → 404; ничего не создаётся', async () => {
    const a = await seedBot(owner);
    const b = await seedBot(owner);
    const tokenB = login(b.accountId);
    expect((await postSource(post(tokenB, { url: 'https://x.example/' }), a.botId)).status).toBe(404);
    expect((await owner.query('SELECT count(*)::int AS n FROM source WHERE bot_id = $1', [a.botId])).rows[0].n).toBe(0);
    const jobA = (await read(await postSource(post(login(a.accountId), { url: 'https://x.example/' }), a.botId))).body.data!.job_id as string;
    expect((await getJob(get(tokenB), jobA)).status).toBe(404);
    expect((await retry(post(tokenB, {}), jobA)).status).toBe(404);
  });
});

describe('«Повторить» (SC-US-004-3)', () => {
  it('упавшая → 202 с тем же job_id; живая и готовая → 409; прогресс сохранён', async () => {
    const { accountId, botId } = await seedBot(owner);
    const token = login(accountId);
    const jobId = (await read(await postSource(post(token, { url: 'https://r.example/' }), botId))).body.data!.job_id as string;
    expect((await retry(post(token, {}), jobId)).status).toBe(409); // жива
    await owner.query("UPDATE index_job SET state = 'failed', error = 'сбой', attempts = 3, progress_done = 7 WHERE id = $1", [jobId]);
    const r = await read(await retry(post(token, {}), jobId));
    expect(r).toEqual({ status: 202, body: { data: { job_id: jobId } } });
    expect((await owner.query('SELECT state, attempts, progress_done, error FROM index_job WHERE id = $1', [jobId])).rows[0])
      .toEqual({ state: 'queued', attempts: 0, progress_done: 7, error: null });
    await owner.query("UPDATE index_job SET state = 'succeeded' WHERE id = $1", [jobId]);
    expect((await retry(post(token, {}), jobId)).status).toBe(409);
  });

  it('конкурентно: 10 одновременных «Повторить» → ровно один 202, остальные 409, задача одна', async () => {
    const { accountId, botId } = await seedBot(owner);
    const token = login(accountId);
    const jobId = (await read(await postSource(post(token, { url: 'https://c.example/' }), botId))).body.data!.job_id as string;
    await owner.query("UPDATE index_job SET state = 'failed', error = 'сбой' WHERE id = $1", [jobId]);
    const codes = await Promise.all(Array.from({ length: 10 }, () => retry(post(token, {}), jobId).then((x) => x.status)));
    expect(codes.filter((c) => c === 202)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(9);
  });

  it('у источника уже есть другая живая задача → 409, а не вторая живая', async () => {
    const { accountId, botId } = await seedBot(owner);
    const token = login(accountId);
    const old = (await read(await postSource(post(token, { url: 'https://d.example/' }), botId))).body.data!.job_id as string;
    await owner.query("UPDATE index_job SET state = 'failed', error = 'сбой' WHERE id = $1", [old]);
    await postSource(post(token, { url: 'https://d.example/' }), botId);
    expect((await read(await retry(post(token, {}), old)))).toMatchObject({ status: 409 });
  });
});

describe('три состояния по job_id — квитанция для docs/long-job-contract.md', () => {
  it('выполняется → готово; выполняется → ошибка + «Повторить» → выполняется', async () => {
    await isolateQueue(owner);
    const { accountId, botId } = await seedBot(owner);
    const token = login(accountId);
    const okId = (await read(await postSource(post(token, { url: 'https://ok.example/' }), botId))).body.data!.job_id as string;
    const running = await read(await getJob(get(token), okId));
    expect(running.body.data!.state).toBe('running');
    receipt('выполняется', okId, running.body.data);

    const pages: JobRunner = { run: async (ctx) => {
      await ctx.progress(1, 2);
      const mid = await read(await getJob(get(token), okId));
      expect(mid.body.data).toMatchObject({ state: 'running', progress_done: 1, progress_total: 2 });
      receipt('выполняется (прогресс)', okId, mid.body.data);
      await ctx.checkpoint();
      await ctx.progress(2, 2);
      return { state: 'succeeded', note: 'обойдено 2 из 2' };
    } };
    expect(await runOnce({ pool: worker, runner: pages, log: () => undefined })).toMatchObject({ jobId: okId, write: 'written' });
    const done = await read(await getJob(get(token), okId));
    expect(done.body.data).toMatchObject({ state: 'succeeded', progress_done: 2, progress_total: 2, error: null });
    receipt('успех', okId, done.body.data);

    const failId = (await read(await postSource(post(token, { url: 'https://fail.example/' }), botId))).body.data!.job_id as string;
    expect(await runOnce({ pool: worker, runner: dispatchRunner({}), log: () => undefined })).toMatchObject({ jobId: failId });
    const failed = await read(await getJob(get(token), failId));
    expect(failed.body.data).toMatchObject({ state: 'failed' });
    expect(failed.body.data!.error).toMatch(/не подключена/);
    receipt('отказ', failId, failed.body.data);
    expect((await read(await retry(post(token, {}), failId))).body.data!.job_id).toBe(failId);
    const again = await read(await getJob(get(token), failId));
    expect(again.body.data).toMatchObject({ state: 'running', error: null });
    receipt('отказ → Повторить → выполняется', failId, again.body.data);
  });
});
