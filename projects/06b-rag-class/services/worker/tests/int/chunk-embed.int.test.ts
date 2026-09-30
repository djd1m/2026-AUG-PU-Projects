import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Limits } from '@n6b/db';
import { isoDay, ownerPool, runDate, servicePool } from '../../../../packages/db/tests/int/helpers';
import { constructGateway } from '../../../../packages/rag/src/paid-call';
import { FakeProvider, type FakeOutcome } from '../../../../packages/rag/src/provider/fake';
import { splitIntoChunks } from '../../../../packages/rag/src/chunk';
import { acquireLease } from '../../src/lease';
import { batchTokens, chunkAndEmbedSource } from '../../src/embed';
import { createIndexRunner, TEXT_EMBED_LIMIT, TEXT_EMBED_UNAVAILABLE } from '../../src/index-runner';
import { runOnce } from '../../src/loop';
import { JobLeaseLost, TEXT_NOT_CONNECTED } from '../../src/runner';
import { isolateQueue, jobRow, seedBot } from './helpers';

// chunk-embed на настоящем Postgres + pgvector (Pseudocode «Chunk and embed»; SC-US-017-2; FR-n6b-16). Модель — только
// fake: реальных вызовов OpenRouter нет. Путь тот же, что в проде: runOnce → createIndexRunner → chunkAndEmbedSource →
// PaidGateway.embedIndexBatch (резерв embed:account + embed:global ДО вызова) → запись chunk под fence.
// Каждый тест берёт свои сутки (runDate): общий ключ embed:global иначе делили бы тесты.

const owner = ownerPool();
const app = servicePool(10);
afterAll(async () => { await owner.end(); await app.end(); });
beforeEach(async () => { await isolateQueue(owner); });

const LIMITS: Limits = { answerVisitorDay: 30, answerBotDay: 300, answerGlobalDay: 3000, sandboxAccountDay: 100,
  sandboxGlobalDay: 2000, embedTokensAccountDay: 2_000_000, embedTokensGlobalDay: 20_000_000 };
const EN = 'Returns are accepted within fourteen days if the packaging and the receipt are kept intact by the buyer.';
const RU = 'Возврат товара возможен в течение четырнадцати дней при сохранении упаковки, чека и товарного вида.';
const ruText = (tag: string, n: number) => Array.from({ length: n }, (_, i) => `${tag} ${i + 1}. ${RU} ${RU}`).join('\n');
const text = (tag: string, n: number) => Array.from({ length: n }, (_, i) => `${tag} ${i + 1}. ${EN} ${EN} ${EN}`).join('\n');

let day = 0;
function setup(opts: { embed?: Partial<Limits>; outcomes?: FakeOutcome[]; batchSize?: number } = {}) {
  day += 1;
  const at = runDate(day);
  const provider = new FakeProvider({ outcomes: opts.outcomes });
  const gateway = constructGateway({ pool: app, provider, limits: { ...LIMITS, ...opts.embed }, now: () => at });
  const runner = createIndexRunner({ pool: app, gateway, extractors: { site: async () => null }, batchSize: opts.batchSize });
  return { provider, gateway, runner, at, day: isoDay(at), run: () => runOnce({ pool: app, runner, log: () => undefined }) };
}

async function seedSource(docs: string[]): Promise<{ accountId: string; botId: string; sourceId: string; docIds: string[] }> {
  const { accountId, botId } = await seedBot(owner);
  const sourceId = (await owner.query<{ id: string }>(
    "INSERT INTO source (bot_id, account_id, kind, url) VALUES ($1, $2, 'site', 'https://embed.test/' || gen_random_uuid()) RETURNING id",
    [botId, accountId])).rows[0]!.id;
  const docIds: string[] = [];
  for (const [i, t] of docs.entries()) {
    docIds.push((await owner.query<{ id: string }>(`INSERT INTO document (source_id, account_id, locator_url, title, text, content_sha256)
      VALUES ($1, $2, $3, 'p', $4, md5($4)) RETURNING id`, [sourceId, accountId, `https://embed.test/p${i}`, t])).rows[0]!.id);
  }
  return { accountId, botId, sourceId, docIds };
}
const enqueue = async (s: { accountId: string; sourceId: string }) => (await owner.query<{ id: string }>(
  'INSERT INTO index_job (source_id, account_id) VALUES ($1, $2) RETURNING id', [s.sourceId, s.accountId])).rows[0]!.id;
const used = async (scope: string, d: string) => Number((await owner.query(
  'SELECT coalesce(sum(used), 0)::int AS n FROM quota_counter WHERE scope = $1 AND day = $2', [scope, d])).rows[0].n);
const chunks = async (sourceId: string) => (await owner.query<{ text: string; text_sha256: string; tokens: number; dims: number }>(
  `SELECT c.text, c.text_sha256, c.tokens, vector_dims(c.embedding) AS dims FROM chunk c JOIN document d ON d.id = c.document_id
   WHERE d.source_id = $1 ORDER BY c.text`, [sourceId])).rows;
const calls = async (accountId: string) => (await owner.query<{ state: string }>(
  "SELECT state FROM model_call_log WHERE account_id = $1 AND kind = 'embed_index'", [accountId])).rows.map((r) => r.state);
const preset = (scope: string, d: string, n: number) =>
  owner.query('INSERT INTO quota_counter (scope, day, used) VALUES ($1, $2, $3)', [scope, d, n]);
const need = (docs: string[]) => batchTokens(docs.flatMap((d) => splitIntoChunks(d)));

describe('chunk-embed: нарезка → эмбеддинги через дверь → chunk', () => {
  it('первый прогон: части ≤ 500 токенов записаны с vector(1536), резерв = точная оценка, батчи по размеру', async () => {
    const docs = [text('A', 40), ruText('B', 30)]; // русский: токенов больше ⌈длина/4⌉ — резерв обязан быть точным

    const s = await seedSource(docs);
    const env = setup({ batchSize: 2 });
    const job = await enqueue(s);
    const r = await env.run();
    expect(r).toMatchObject({ kind: 'finished', jobId: job, outcome: { state: 'succeeded' }, write: 'written' });
    const rows = await chunks(s.sourceId);
    const parts = docs.flatMap((d) => splitIntoChunks(d));
    expect(rows.length).toBe(parts.length);
    expect(rows.every((c) => c.dims === 1536 && c.tokens > 0 && c.tokens <= 500)).toBe(true);
    // Батчи не пересекают документы в подсчёте, но могут их объединять: ⌈частей / 2⌉ вызовов.
    expect(env.provider.calls.embed).toBe(Math.ceil(parts.length / 2));
    expect(await calls(s.accountId)).toEqual(Array(env.provider.calls.embed).fill('succeeded'));
    const spent = await used(`embed:account:${s.accountId}`, env.day);
    const ru = splitIntoChunks(docs[1]!);
    expect(ru.reduce((x, p) => x + p.tokens, 0)).toBeGreaterThan(Math.ceil(ru.reduce((x, p) => x + p.text.length, 0) / 4));
    expect(spent).toBeGreaterThanOrEqual(parts.reduce((x, p) => x + p.tokens, 0));
    expect(spent).toBe(await used('embed:global', env.day));
    expect((await jobRow(owner, job)).state).toBe('succeeded');
  });

  it('резерв = точная оценка js-tiktoken, а не ⌈длина/4⌉: русский текст не проходит под заниженным n', async () => {
    const doc = ruText('R', 30);
    const parts = splitIntoChunks(doc);
    const exact = parts.reduce((x, p) => x + p.tokens, 0);
    const floor = Math.ceil(parts.reduce((x, p) => x + p.text.length, 0) / 4);
    expect(exact).toBeGreaterThan(floor); // иначе тест не различал бы оценки
    const s = await seedSource([doc]);
    const env = setup({ batchSize: 2 });
    await enqueue(s);
    await env.run();
    let expected = 0; // независимый расчёт: по батчам max(Σ токенов, ⌈Σ длин / 4⌉)
    for (let i = 0; i < parts.length; i += 2) {
      const b = parts.slice(i, i + 2);
      expected += Math.max(b.reduce((x, p) => x + p.tokens, 0), Math.ceil(b.reduce((x, p) => x + p.text.length, 0) / 4));
    }
    expect(await used(`embed:account:${s.accountId}`, env.day)).toBe(expected);
    expect(expected).toBeGreaterThanOrEqual(exact);
  });

  it('SC-US-017-2: переобход без изменений → 0 новых эмбеддингов и 0 списаний, задача «готово»', async () => {
    const s = await seedSource([text('C', 30)]);
    const env = setup();
    await enqueue(s);
    await env.run();
    const before = { rows: await chunks(s.sourceId), spent: await used(`embed:account:${s.accountId}`, env.day),
      global: await used('embed:global', env.day), log: (await calls(s.accountId)).length, embed: env.provider.calls.embed };
    const again = await enqueue(s); // «переобойти» — новая задача того же источника (SC-US-017-2)
    const r = await env.run();
    expect(r).toMatchObject({ kind: 'finished', jobId: again, outcome: { state: 'succeeded' } });
    expect(env.provider.calls.embed).toBe(before.embed);
    expect(await used(`embed:account:${s.accountId}`, env.day)).toBe(before.spent);
    expect(await used('embed:global', env.day)).toBe(before.global);
    expect((await calls(s.accountId)).length).toBe(before.log);
    expect(await chunks(s.sourceId)).toEqual(before.rows);
  });

  it('SC-US-017-2: изменённый абзац → эмбеддятся только новые части, устаревшие удаляются', async () => {
    const original = text('D', 30);
    const s = await seedSource([original]);
    const env = setup();
    await enqueue(s);
    await env.run();
    const oldRows = await chunks(s.sourceId);
    const changed = original.replace('D 17.', 'D 17 (изменено).');
    await owner.query('UPDATE document SET text = $2, content_sha256 = md5($2) WHERE id = $1', [s.docIds[0], changed]);
    const callsBefore = env.provider.calls.embed;
    await enqueue(s);
    await env.run();
    const fresh = splitIntoChunks(changed);
    const rows = await chunks(s.sourceId);
    expect(rows.map((r) => r.text_sha256).sort()).toEqual(fresh.map((p) => p.sha256).sort());
    const reused = oldRows.filter((o) => rows.some((r) => r.text_sha256 === o.text_sha256)).length;
    expect(reused).toBeGreaterThan(0);
    expect(fresh.length - reused).toBeLessThanOrEqual(2);
    expect(env.provider.calls.embed - callsBefore).toBe(1); // один батч на 1–2 новые части
  });

  it('FR-n6b-16: embed:account исчерпан → отказ ДО вызова, задача failed с причиной; завтра повтор продолжает', async () => {
    const docs = [text('E', 20)];
    const s = await seedSource(docs);
    const tokens = need(docs);
    const env = setup({ embed: { embedTokensAccountDay: tokens + 10 } });
    await preset(`embed:account:${s.accountId}`, env.day, 11); // остаток tokens − 1
    const job = await enqueue(s);
    const r = await env.run();
    expect(r).toMatchObject({ kind: 'finished', outcome: { state: 'failed', error: TEXT_EMBED_LIMIT } });
    expect(env.provider.calls.embed).toBe(0);
    expect(await calls(s.accountId)).toEqual([]);
    expect(await chunks(s.sourceId)).toEqual([]);
    expect(await used(`embed:account:${s.accountId}`, env.day)).toBe(11);
    expect(await used('embed:global', env.day)).toBe(0);
    expect((await jobRow(owner, job)).error).toBe(TEXT_EMBED_LIMIT);

    // «Повторить» на следующие сутки (Worker lease loop шаг 9): тот же job_id, продолжение.
    await owner.query("UPDATE index_job SET state = 'queued', attempts = 0, error = NULL, run_started_at = NULL WHERE id = $1", [job]);
    const tomorrow = setup({ embed: { embedTokensAccountDay: tokens + 10 } });
    const r2 = await tomorrow.run();
    expect(r2).toMatchObject({ kind: 'finished', jobId: job, outcome: { state: 'succeeded' } });
    expect(tomorrow.provider.calls.embed).toBe(1);
    expect((await chunks(s.sourceId)).length).toBe(splitIntoChunks(docs[0]!).length);
  });

  it('частичный прогон: второй батч упёрся в предел — первый сохранён; повтор платит только за остаток', async () => {
    const docs = [text('F', 40)];
    const parts = splitIntoChunks(docs[0]!);
    expect(parts.length).toBeGreaterThanOrEqual(4);
    const first = batchTokens(parts.slice(0, 2));
    const env = setup({ batchSize: 2, embed: { embedTokensAccountDay: first + 1 } });
    const s = await seedSource(docs);
    const job = await enqueue(s);
    const r = await env.run();
    expect(r).toMatchObject({ outcome: { state: 'failed', error: TEXT_EMBED_LIMIT } });
    expect(env.provider.calls.embed).toBe(1);
    expect((await chunks(s.sourceId)).length).toBe(2);
    await owner.query("UPDATE index_job SET state = 'queued', attempts = 0, error = NULL, run_started_at = NULL WHERE id = $1", [job]);
    const next = setup({ batchSize: 2 });
    await next.run();
    expect(next.provider.calls.embed).toBe(Math.ceil((parts.length - 2) / 2));
    const rest = parts.slice(2);
    let expected = 0;
    for (let i = 0; i < rest.length; i += 2) expected += batchTokens(rest.slice(i, i + 2));
    expect(await used(`embed:account:${s.accountId}`, next.day)).toBe(expected); // уже записанные 2 части не оплачены
    expect((await chunks(s.sourceId)).length).toBe(parts.length);
  });

  it('FR-n6b-16: embed:global исчерпан → отказ до вызова даже при нетронутом пределе аккаунта', async () => {
    const s = await seedSource([text('G', 10)]);
    const env = setup();
    await preset('embed:global', env.day, LIMITS.embedTokensGlobalDay);
    await enqueue(s);
    const r = await env.run();
    expect(r).toMatchObject({ outcome: { state: 'failed', error: TEXT_EMBED_LIMIT } });
    expect(env.provider.calls.embed).toBe(0);
    expect(await used(`embed:account:${s.accountId}`, env.day)).toBe(0);
    expect(await chunks(s.sourceId)).toEqual([]);
  });

  it('конкурентно: два батча одного аккаунта на остатке одного → ровно один вызов, предел не превышен', async () => {
    const d1 = [text('H', 8)];
    const d2 = [text('I', 8)];
    const t1 = need(d1);
    const t2 = need(d2);
    const { accountId, botId } = await seedBot(owner);
    const mk = async (t: string) => {
      const src = (await owner.query<{ id: string }>("INSERT INTO source (bot_id, account_id, kind, url) VALUES ($1, $2, 'site', $3) RETURNING id",
        [botId, accountId, `https://embed.test/${t}-${Math.random()}`])).rows[0]!.id;
      await owner.query(`INSERT INTO document (source_id, account_id, locator_url, title, text, content_sha256)
        VALUES ($1, $2, 'https://embed.test/x', 'x', $3, md5($3))`, [src, accountId, t]);
      return src;
    };
    const s1 = await mk(d1[0]!);
    const s2 = await mk(d2[0]!);
    const limit = Math.max(t1, t2) + Math.min(t1, t2) - 1; // каждый по отдельности влезает, оба — нет
    const env = setup({ embed: { embedTokensAccountDay: limit } });
    await enqueue({ accountId, sourceId: s1 });
    await enqueue({ accountId, sourceId: s2 });
    const results = await Promise.all([env.run(), env.run()]);
    const states = results.map((r) => (r.kind === 'finished' ? r.outcome.state : r.kind)).sort();
    expect(states).toEqual(['failed', 'succeeded']);
    expect(env.provider.calls.embed).toBe(1);
    expect(await used(`embed:account:${accountId}`, env.day)).toBeLessThanOrEqual(limit);
    expect(await calls(accountId)).toEqual(['succeeded']);
  });

  it('провайдер недоступен → failed «сервис эмбеддингов недоступен», попытка засчитана, частей нет', async () => {
    const s = await seedSource([text('J', 6)]);
    const env = setup({ outcomes: ['unavailable'] });
    await enqueue(s);
    const r = await env.run();
    expect(r).toMatchObject({ outcome: { state: 'failed', error: TEXT_EMBED_UNAVAILABLE } });
    expect(await calls(s.accountId)).toEqual(['failed']);
    expect(await used(`embed:account:${s.accountId}`, env.day)).toBeGreaterThan(0);
    expect(await chunks(s.sourceId)).toEqual([]);
  });

  it('fence: аренду забрали во время вызова модели → ни одной строки chunk, JobLeaseLost', async () => {
    const s = await seedSource([text('K', 6)]);
    const env = setup();
    await enqueue(s);
    const job = (await acquireLease(app))!;
    expect(job.sourceId).toBe(s.sourceId);
    await owner.query('UPDATE index_job SET lease_fence = lease_fence + 1 WHERE id = $1', [job.id]); // перехват
    const ctx = { job, signal: new AbortController().signal, progress: async () => undefined, checkpoint: async () => undefined };
    await expect(chunkAndEmbedSource(ctx, { pool: app, gateway: env.gateway })).rejects.toBeInstanceOf(JobLeaseLost);
    expect(env.provider.calls.embed).toBe(1); // вызов оплачен (счёт по попыткам), но записи нет
    expect(await chunks(s.sourceId)).toEqual([]);
  });

  it('извлечение для типа источника не подключено → честный отказ, эмбеддинги не зовутся', async () => {
    const { accountId, botId } = await seedBot(owner);
    const src = (await owner.query<{ id: string }>(
      "INSERT INTO source (bot_id, account_id, kind, file_name) VALUES ($1, $2, 'pdf', 'a.pdf') RETURNING id", [botId, accountId])).rows[0]!.id;
    const env = setup();
    await enqueue({ accountId, sourceId: src });
    const r = await env.run();
    expect(r).toMatchObject({ outcome: { state: 'failed', error: TEXT_NOT_CONNECTED } });
    expect(env.provider.calls.embed).toBe(0);
  });
});
