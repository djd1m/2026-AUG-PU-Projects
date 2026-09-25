// Атомарная квота на НАСТОЯЩЕМ Postgres (ADR-008, FR-LIMIT-001…003): конкурентные прогоны 1, 4, 5 и 6
// из .claude/rules/testing.md. Последовательный тест зеленеет при сломанной реализации — здесь всё
// одновременно. Образец формы — N5 tests/database.integration.test.ts (своя схема на прогон).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { consumeQuota, transaction, chargeQuota, type QuotaCharge } from '../packages/db/src/quota';
import { indexEmbedCharges, previewAnswerCharges, previewCreateCharges, visitorAnswerCharges } from '../packages/db/src/ceilings';
import { loadCeilings } from '../packages/rag/src/config';
import { RetryableCallError, meteredCall, spendRecorder } from '../packages/rag/src/spend';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { environment } from './fixtures/environment';

const databaseUrl = process.env.DATABASE_URL;
const base = loadCeilings(environment());
const now = new Date('2026-09-25T12:00:00+03:00');
const all = <T>(n: number, f: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => f(i)));

describe.skipIf(!databaseUrl)('Квота на настоящем Postgres: два оператора, откат всех scope, конкурентность', () => {
  let pool: Pool;
  const schema = `quota_${randomBytes(8).toString('hex')}`;
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
  const used = async (scope: string, key: string, period = '2026-09-25') =>
    Number((await pool.query('SELECT used FROM quota_counter WHERE scope=$1 AND scope_key=$2 AND period=$3', [scope, key, period])).rows[0]?.used ?? 0);
  const visitor = (over: Partial<Parameters<typeof visitorAnswerCharges>[1]> = {}) =>
    ({ visitorSession: randomUUID(), ipPrefix: `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.0/24`, botId: randomUUID(), plan: 'free', now, ...over });

  it('прогон 1: 20 одновременных вопросов при остатке 1 → ровно 1 списание и 1 вызов модели, 19 отказов visitor_answers', async () => {
    const input = visitor();
    for (let i = 0; i < 19; i++) expect((await consumeQuota(pool, visitorAnswerCharges(base, input))).granted).toBe(true);
    let calls = 0, peak = 0;
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'n6-q-')), 'model-spend.jsonl');
    const sampler = setInterval(() => { peak = Math.max(peak, pool.totalCount); }, 1);
    const results = await all(20, async () => meteredCall({
      charge: () => consumeQuota(pool, visitorAnswerCharges(base, input)), spend: spendRecorder(file),
      event: { call: 'answer', model: 'anthropic/claude-haiku-4.5', request_id: randomUUID(), unit: 'calls', quantity: 1 },
      run: async () => { calls++; return { value: 'ответ' }; },
    }));
    clearInterval(sampler);
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'refused' && r.scope === 'visitor_answers')).toHaveLength(19);
    expect(calls).toBe(1);
    expect(readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('"phase":"attempt"'))).toHaveLength(1);
    expect(await used('visitor_answers', input.visitorSession)).toBe(20);
    // отказ откатил ВСЕ scope: ip/бот/глобально списаны ровно 20 раз, не 39
    expect(await used('ip_answers', input.ipPrefix)).toBe(20);
    expect(await used('bot_day_answers', input.botId)).toBe(20);
    expect(await used('bot_month_answers', input.botId, '2026-09')).toBe(20);
    // ожидающие не растят занятые соединения: не больше пула (10), никто не упал по таймауту соединения
    expect(peak).toBeLessThanOrEqual(10);
  });

  it('N одновременных списаний на границе: 40 при пределе 7 → ровно 7, счётчик = 7', async () => {
    const charge: QuotaCharge = { scope: 'global_answers', scopeKey: 'all', period: '2030-01-01', n: 1, limit: 7 };
    const results = await all(40, () => consumeQuota(pool, [charge]));
    expect(results.filter((r) => r.granted)).toHaveLength(7);
    expect(await used('global_answers', 'all', '2030-01-01')).toBe(7);
  });

  it('первое списание на СВЕЖЕЙ строке больше предела — отказ (однооператорная форма его пропустила бы)', async () => {
    const accountId = randomUUID();
    const ceilings = { ...base, account_embed_tokens: 5000 };
    expect(await consumeQuota(pool, indexEmbedCharges(ceilings, { accountId, tokens: 5001, now }))).toEqual({ granted: false, scope: 'account_embed_tokens', scopeKey: accountId });
    expect(await used('account_embed_tokens', accountId)).toBe(0);
    expect((await consumeQuota(pool, indexEmbedCharges(ceilings, { accountId, tokens: 5000, now }))).granted).toBe(true);
    expect(await used('account_embed_tokens', accountId)).toBe(5000);
  });

  it('отказ широкого scope откатывает узкие: исчерпан global_answers → visitor/ip/бот не тронуты', async () => {
    const period = '2031-02-03', at = new Date(`${period}T12:00:00+03:00`);
    const ceilings = { ...base, global_answers: 1 };
    expect((await consumeQuota(pool, visitorAnswerCharges(ceilings, visitor({ now: at })))).granted).toBe(true);
    const input = visitor({ now: at });
    expect(await consumeQuota(pool, visitorAnswerCharges(ceilings, input))).toMatchObject({ granted: false, scope: 'global_answers' });
    for (const [scope, key] of [['visitor_answers', input.visitorSession], ['ip_answers', input.ipPrefix], ['bot_day_answers', input.botId]]) {
      expect(await used(scope!, key!, period), scope).toBe(0);
    }
    expect(await used('bot_month_answers', input.botId, '2031-02')).toBe(0);
  });

  it('отказ внутри транзакции вызывающего: откат до точки сохранения, транзакция пригодна (refused_limit пишется)', async () => {
    const charge: QuotaCharge = { scope: 'global_answers', scopeKey: 'all', period: '2032-01-01', n: 2, limit: 1 };
    const decision = await transaction(pool, async (tx) => {
      const d = await chargeQuota(tx, [charge]);
      await tx.query('SELECT 1'); // транзакция не в состоянии aborted
      return d;
    });
    expect(decision.granted).toBe(false);
  });

  it('счёт по попыткам на настоящем счётчике: отказ модели не возвращает списанное, повтор списывает заново', async () => {
    const input = visitor();
    const ceilings = { ...base, visitor_answers: 2 };
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'n6-q-')), 'model-spend.jsonl');
    let calls = 0;
    const result = await meteredCall({ retries: 5, pauseMs: 1,
      charge: () => consumeQuota(pool, visitorAnswerCharges(ceilings, input)), spend: spendRecorder(file),
      event: { call: 'answer', model: 'anthropic/claude-haiku-4.5', request_id: randomUUID(), unit: 'calls', quantity: 1 },
      run: async () => { calls++; throw new RetryableCallError('provider_error', '503'); } });
    expect(result).toEqual({ status: 'refused', scope: 'visitor_answers', attempts: 2 });
    expect(calls).toBe(2);
    expect(await used('visitor_answers', input.visitorSession)).toBe(2);
    expect(readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('"phase":"attempt"'))).toHaveLength(2);
  });

  it('прогон 6, добросовестный NAT: 60 разных посетителей за одним префиксом одновременно → 60 без ложных отказов, 61-й — ip_answers', async () => {
    const ipPrefix = '192.0.2.0/24', botId = randomUUID();
    const results = await all(60, () => consumeQuota(pool, visitorAnswerCharges(base, visitor({ ipPrefix, botId, plan: 'nobadge' }))));
    expect(results.every((r) => r.granted)).toBe(true);
    expect(await consumeQuota(pool, visitorAnswerCharges(base, visitor({ ipPrefix, botId, plan: 'nobadge' })))).toMatchObject({ granted: false, scope: 'ip_answers' });
    // посетитель за ДРУГИМ префиксом не наказан чужим исчерпанием
    expect((await consumeQuota(pool, visitorAnswerCharges(base, visitor({ botId, plan: 'nobadge' })))).granted).toBe(true);
  });

  it('разные посетители не блокируют друг друга: исчерпанная сессия не мешает 20 другим одновременно', async () => {
    const botId = randomUUID(), ipPrefix = '198.51.100.0/24', exhausted = randomUUID();
    const ceilings = { ...base, visitor_answers: 1 };
    await consumeQuota(pool, visitorAnswerCharges(ceilings, visitor({ visitorSession: exhausted, botId, ipPrefix })));
    const results = await all(21, (i) => consumeQuota(pool, visitorAnswerCharges(ceilings, visitor({ botId, ipPrefix, ...(i === 0 ? { visitorSession: exhausted } : {}) }))));
    expect(results[0]).toMatchObject({ granted: false, scope: 'visitor_answers' });
    expect(results.slice(1).every((r) => r.granted)).toBe(true);
  });

  it('предел бота по плану: free — 50 в сутки; «NOBADGE» читается как free', async () => {
    const botId = randomUUID();
    const results = await all(55, () => consumeQuota(pool, visitorAnswerCharges(base, visitor({ botId, plan: 'NOBADGE' }))));
    expect(results.filter((r) => r.granted)).toHaveLength(50);
    expect(results.filter((r) => !r.granted && r.scope === 'bot_day_answers')).toHaveLength(5);
  });

  it('прогон 4: 5 одновременных созданий предпросмотра с одного браузера при CREATE=1 → 1; создание не тратит 10 ответов', async () => {
    const browserSession = randomBytes(18).toString('base64url'), ipPrefix = '203.0.113.0/24';
    const results = await all(5, () => consumeQuota(pool, previewCreateCharges(base, { browserSession, ipPrefix, now })));
    expect(results.filter((r) => r.granted)).toHaveLength(1);
    expect(results.filter((r) => !r.granted && r.scope === 'preview_session')).toHaveLength(4);
    for (let i = 1; i <= 10; i++) expect((await consumeQuota(pool, previewAnswerCharges(base, { browserSession, now }))).granted, `ответ ${i}`).toBe(true);
    expect(await consumeQuota(pool, previewAnswerCharges(base, { browserSession, now }))).toMatchObject({ granted: false, scope: 'preview_session' });
    expect(await used('preview_session', `${browserSession}:create`)).toBe(1);
    expect(await used('preview_session', `${browserSession}:answers`)).toBe(10);
  });

  it('прогон 5: две задачи одного аккаунта у потолка account_embed_tokens → сумма списанного ≤ предела', async () => {
    const accountId = randomUUID(), period = '2033-03-03', at = new Date(`${period}T12:00:00+03:00`);
    const ceilings = { ...base, account_embed_tokens: 100_000 };
    const results = await all(20, () => consumeQuota(pool, indexEmbedCharges(ceilings, { accountId, tokens: 7000, now: at })));
    const granted = results.filter((r) => r.granted).length;
    expect(granted).toBe(14); // 14 × 7000 = 98 000 ≤ 100 000 < 15 × 7000
    expect(await used('account_embed_tokens', accountId, period)).toBe(granted * 7000);
    expect(await used('global_embed_tokens', 'all', period)).toBe(granted * 7000);
  });
});
