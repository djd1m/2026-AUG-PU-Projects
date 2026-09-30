import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { answerKeys, type CallOwner, embedKeys, finishCall, type Limits, type QuotaKey, sandboxKeys, visitorKey, withService } from '@n6b/db';
import { env, ownerPool, seedTenant, servicePool, uniq } from '../../../db/tests/int/helpers';
import { FakeProvider, type FakeOutcome } from '../../src/provider/fake';
import { ModelCallFailed } from '../../src/provider/port';
import { PaidGateway } from '../../src/paid-call';

// spend-ceilings на настоящем Postgres (01_plan.md §3, §9): атомарность резерва ДО платного вызова, счёт по попыткам,
// конкурентность. Модель — только fake. Каждый тест берёт свои сутки (now) или свои ключи: общие ключи
// (answer:global, answer:sandbox:global) иначе делили бы счётчик между тестами.

const owner = ownerPool();
const app = servicePool(10);
afterAll(async () => { await owner.end(); await app.end(); });

const LIMITS: Limits = { answerVisitorDay: 30, answerBotDay: 300, answerGlobalDay: 3000, sandboxAccountDay: 100,
  sandboxGlobalDay: 2000, embedTokensAccountDay: 2_000_000, embedTokensGlobalDay: 20_000_000 };
const SECRET = 'v'.repeat(48);
const NOBODY: CallOwner = { accountId: null, botId: null };

let dayCounter = 0;
/** Уникальные сутки теста: 2030-01-01 + N дней, полдень по Москве. */
function freshDay(): { now: () => Date; day: string } {
  dayCounter += 1;
  const at = new Date(Date.UTC(2030, 0, dayCounter, 9, 0, 0));
  return { now: () => at, day: at.toISOString().slice(0, 10) };
}

const used = async (scope: string, day: string): Promise<number> =>
  Number((await owner.query('SELECT coalesce(sum(used), 0)::int AS n FROM quota_counter WHERE scope = $1 AND day = $2',
    [scope, day])).rows[0].n);
const preset = (scope: string, day: string, n: number) =>
  owner.query('INSERT INTO quota_counter (scope, day, used) VALUES ($1, $2, $3)', [scope, day, n]);
const logRows = async (accountId: string) => (await owner.query<{ kind: string; state: string; tokens_in: number | null }>(
  'SELECT kind, state, tokens_in FROM model_call_log WHERE account_id = $1 ORDER BY created_at', [accountId])).rows;

function settle<T>(ps: Promise<T>[]) {
  return Promise.allSettled(ps).then((rs) => ({
    ok: rs.filter((r) => r.status === 'fulfilled').length,
    refused: rs.filter((r) => r.status === 'rejected' && (r.reason as Error).name === 'QuotaRefused').length,
    other: rs.filter((r) => r.status === 'rejected' && (r.reason as Error).name !== 'QuotaRefused')
      .map((r) => String((r as PromiseRejectedResult).reason)),
  }));
}

async function ask(gw: PaidGateway, keys: QuotaKey[], who: CallOwner = NOBODY) {
  const attempt = await gw.beginAnswer(keys, who);
  await attempt.embedQuestion('вопрос');
}

describe('исчерпание: отказ ДО платного вызова (SC-US-016-1, T-7)', () => {
  it('SC-US-016-1: 31-й вопрос посетителя → QuotaRefused, провайдер 0 раз, журнал без строки', async () => {
    const t = await seedTenant(owner);
    const { now, day } = freshDay();
    const fake = new FakeProvider();
    const keys = answerKeys(LIMITS, visitorKey(SECRET, '203.0.113.7', t.botId), t.botId);
    await preset(keys[0]!.scope, day, 30);
    await expect(ask(new PaidGateway({ pool: app, provider: fake, now }), keys, t))
      .rejects.toMatchObject({ name: 'QuotaRefused', scope: keys[0]!.scope });
    expect(fake.total).toBe(0);
    expect(await logRows(t.accountId)).toEqual([]);
    expect(await used(keys[1]!.scope, day)).toBe(0);
  });

  it('T-4: общий потолок исчерпан при свободном личном → личный и ботовый НЕ увеличены (откат всей транзакции)', async () => {
    const t = await seedTenant(owner);
    const { now, day } = freshDay();
    const fake = new FakeProvider();
    const keys = answerKeys(LIMITS, visitorKey(SECRET, '198.51.100.1', t.botId), t.botId);
    await preset('answer:global', day, 3000);
    await expect(ask(new PaidGateway({ pool: app, provider: fake, now }), keys, t))
      .rejects.toMatchObject({ name: 'QuotaRefused', scope: 'answer:global' });
    expect(await used(keys[0]!.scope, day)).toBe(0);
    expect(await used(keys[1]!.scope, day)).toBe(0);
    expect(fake.total).toBe(0);
  });
});

describe('счёт по попыткам (SC-US-016-3, SC-US-005-4, T-8)', () => {
  it.each<FakeOutcome>(['timeout', 'unavailable', 'error-in-200', 'schema'])(
    'SC-US-016-3: исход %s → ModelCallFailed (503), резерв остался списан, журнал failed', async (outcome) => {
      const t = await seedTenant(owner);
      const { now, day } = freshDay();
      const fake = new FakeProvider({ outcomes: [outcome] });
      const keys = sandboxKeys(LIMITS, t.accountId);
      const attempt = await new PaidGateway({ pool: app, provider: fake, now }).beginAnswer(keys, t);
      const error = await attempt.embedQuestion('вопрос').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ModelCallFailed);
      expect(fake.total).toBe(1);
      expect(await used(keys[0]!.scope, day)).toBe(1);
      expect(await used(keys[1]!.scope, day)).toBe(1);
      expect(await logRows(t.accountId)).toEqual([{ kind: 'embed_question', state: 'failed', tokens_in: null }]);
    });

  it('успех: эмбеддинг и генерация под ОДНИМ резервом, два исхода succeeded с токенами; повтор вызова запрещён', async () => {
    const t = await seedTenant(owner);
    const { now, day } = freshDay();
    const fake = new FakeProvider();
    const keys = sandboxKeys(LIMITS, t.accountId);
    const attempt = await new PaidGateway({ pool: app, provider: fake, now }).beginAnswer(keys, t);
    expect(await attempt.embedQuestion('вопрос')).toHaveLength(1536);
    expect((await attempt.generate([{ role: 'user', content: 'q' }])).tokensOut).toBe(20);
    await expect(attempt.embedQuestion('ещё')).rejects.toThrow(/уже вызван/);
    await expect(attempt.generate([])).rejects.toThrow(/уже вызвана/);
    expect(fake.calls).toEqual({ embed: 1, answer: 1 });
    expect(await used(keys[0]!.scope, day)).toBe(1);
    expect((await logRows(t.accountId)).map((r) => `${r.kind}:${r.state}`))
      .toEqual(['embed_question:succeeded', 'answer:succeeded']);
  });

  it('T-10: второй исход той же попытки отвергнут (UPDATE … WHERE state=started)', async () => {
    const t = await seedTenant(owner);
    const { now } = freshDay();
    await new PaidGateway({ pool: app, provider: new FakeProvider(), now }).embedIndexBatch(
      embedKeys(LIMITS, t.accountId, 10), t, ['a']);
    const { rows } = await owner.query<{ id: string }>('SELECT id FROM model_call_log WHERE account_id = $1', [t.accountId]);
    expect(await withService(app, (c) => finishCall(c, rows[0]!.id, 'failed'))).toBe(false);
    expect((await logRows(t.accountId))[0]!.state).toBe('succeeded');
  });

  it('T-9: крах процесса между COMMIT резерва и исходом → строка started и списанный резерв', () => {
    const scope = uniq('test:crash');
    return seedTenant(owner).then(async (t) => {
      const child = spawnSync(process.execPath, ['--import', 'tsx', path.join(__dirname, 'crash-child.ts')], {
        env: { PATH: process.env.PATH ?? '', CHILD_SERVICE_URL: env().serviceUrl, CHILD_SCOPE: scope,
          CHILD_ACCOUNT: t.accountId, CHILD_BOT: t.botId },
        encoding: 'utf8', timeout: 30_000 });
      expect(child.status, child.stderr).toBe(137);
      expect(await logRows(t.accountId)).toEqual([{ kind: 'embed_question', state: 'started', tokens_in: null }]);
      expect(Number((await owner.query('SELECT sum(used)::int AS n FROM quota_counter WHERE scope = $1', [scope]))
        .rows[0].n)).toBe(1);
    });
  });
});

describe('конкурентность на настоящем Postgres (ADR-010, shared-resource-verification)', () => {
  it('T-5a: остаток посетителя 3, 50 параллельных попыток → ровно 3 вызова, 47 отказов, used = 30', async () => {
    const t = await seedTenant(owner);
    const { now, day } = freshDay();
    const fake = new FakeProvider();
    const gw = new PaidGateway({ pool: app, provider: fake, now });
    const keys = answerKeys(LIMITS, visitorKey(SECRET, '203.0.113.50', t.botId), t.botId);
    await preset(keys[0]!.scope, day, 27);
    const r = await settle(Array.from({ length: 50 }, () => ask(gw, keys, t)));
    expect(r).toEqual({ ok: 3, refused: 47, other: [] });
    expect(fake.total).toBe(3);
    expect(await used(keys[0]!.scope, day)).toBe(30);
    expect(await used(keys[1]!.scope, day)).toBe(3);
    expect(await used('answer:global', day)).toBe(3);
  });

  it('SC-US-016-4 (T-5b): общий потолок песочницы остаток 5, 20 аккаунтов → 5 вызовов; у 15 отказавших личный не увеличен',
    async () => {
      const { now, day } = freshDay();
      const fake = new FakeProvider();
      const gw = new PaidGateway({ pool: app, provider: fake, now });
      await preset('answer:sandbox:global', day, 1995);
      const tenants = await Promise.all(Array.from({ length: 20 }, () => seedTenant(owner)));
      const r = await settle(tenants.map((t) => ask(gw, sandboxKeys(LIMITS, t.accountId), t)));
      expect(r).toEqual({ ok: 5, refused: 15, other: [] });
      expect(fake.total).toBe(5);
      expect(await used('answer:sandbox:global', day)).toBe(2000);
      const personal = await Promise.all(tenants.map((t) => used(`answer:sandbox:${t.accountId}`, day)));
      expect(personal.filter((n) => n === 1)).toHaveLength(5);
      expect(personal.filter((n) => n === 0)).toHaveLength(15);
    });

  it('T-5c: embed:global остаток 1000 токенов, 10 батчей по 300 → проходят ровно 3, used ≤ предела', async () => {
    const { now, day } = freshDay();
    const fake = new FakeProvider();
    const gw = new PaidGateway({ pool: app, provider: fake, now });
    await preset('embed:global', day, LIMITS.embedTokensGlobalDay - 1000);
    const tenants = await Promise.all(Array.from({ length: 10 }, () => seedTenant(owner)));
    const r = await settle(tenants.map((t) => gw.embedIndexBatch(embedKeys(LIMITS, t.accountId, 300), t, ['x'])));
    expect(r).toEqual({ ok: 3, refused: 7, other: [] });
    expect(await used('embed:global', day)).toBe(LIMITS.embedTokensGlobalDay - 100);
  });

  it('T-5d: 50 прогонов × 30 параллельных попыток на пересекающихся ключах — ни одного deadlock', async () => {
    const t = await seedTenant(owner);
    const gw = new PaidGateway({ pool: app, provider: new FakeProvider(), now: freshDay().now });
    const errors: string[] = [];
    for (let run = 0; run < 50; run += 1) {
      const r = await settle(Array.from({ length: 30 }, (_, i) =>
        ask(gw, answerKeys(LIMITS, visitorKey(SECRET, `10.${run}.${i}.1`, t.botId), t.botId), t)));
      errors.push(...r.other);
      if (r.ok + r.refused !== 30) break;
    }
    expect(errors).toEqual([]);
  }, 120_000);

  it('T-5e: 25 разных посетителей одного бота одновременно при пределе бота 300 → проходят все 25', async () => {
    const t = await seedTenant(owner);
    const { now, day } = freshDay();
    const gw = new PaidGateway({ pool: app, provider: new FakeProvider(), now });
    const r = await settle(Array.from({ length: 25 }, (_, i) =>
      ask(gw, answerKeys(LIMITS, visitorKey(SECRET, `192.0.${i}.9`, t.botId), t.botId), t)));
    expect(r).toEqual({ ok: 25, refused: 0, other: [] });
    expect(await used(`answer:bot:${t.botId}`, day)).toBe(25);
  });

  it('T-6: 200 параллельных при пуле 10 — соединений ≤ 10, вызовы провайдера идут БЕЗ удержания соединения', async () => {
    const pool = servicePool(10);
    try {
      const { now } = freshDay();
      const fake = new FakeProvider({ delayMs: 150 });
      const gw = new PaidGateway({ pool, provider: fake, now });
      let maxConnections = 0;
      const probe = setInterval(() => { maxConnections = Math.max(maxConnections, pool.totalCount); }, 5);
      const r = await settle(Array.from({ length: 200 }, () =>
        gw.embedIndexBatch([{ scope: uniq('test:t6'), limit: 5 }], NOBODY, ['x'])));
      clearInterval(probe);
      expect(r).toEqual({ ok: 200, refused: 0, other: [] });
      expect(maxConnections).toBeLessThanOrEqual(10);
      // Держи транзакция соединение во время вызова — одновременно в провайдере было бы не больше 10 вызовов.
      expect(fake.maxInFlight).toBeGreaterThan(10);
    } finally {
      await pool.end();
    }
  }, 60_000);
});
