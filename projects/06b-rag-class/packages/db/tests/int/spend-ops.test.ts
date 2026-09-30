import { afterAll, describe, expect, it } from 'vitest';
import { runOps } from '../../src/ops-cli';
import { recordLimited, resetQuota, ResetRefused } from '../../src/quota-admin';
import type { Limits } from '../../src/quota-keys';
import { spendToday } from '../../src/spend-today';
import { withService } from '../../src/tenant';
import { env, isoDay, ownerPool, runDate, seedTenant, servicePool } from './helpers';

// Сброс оператором с журналом (OWN-06B-010), запись отказа по пределу с каналом (OWN-06B-012), сводка расхода (01_plan.md
// §6, T-13). Ключи — настоящих форм, сутки — свои у каждого теста, чтобы не делить счётчик с другими файлами. База суток
// случайна на прогон (08_review.md F-5): повтор на той же БД без `down -v` не упирается в строки прошлого прогона.
const D = [1, 2, 3, 4, 5].map((n) => isoDay(runDate(n)));

const owner = ownerPool();
const app = servicePool(4);
afterAll(async () => { await owner.end(); await app.end(); });

const LIMITS: Limits = { answerVisitorDay: 30, answerBotDay: 300, answerGlobalDay: 3000, sandboxAccountDay: 100,
  sandboxGlobalDay: 2000, embedTokensAccountDay: 2_000_000, embedTokensGlobalDay: 20_000_000 };
const preset = (scope: string, day: string, n: number) =>
  owner.query('INSERT INTO quota_counter (scope, day, used) VALUES ($1, $2, $3)', [scope, day, n]);
const usedOf = async (scope: string, day: string) =>
  (await owner.query<{ used: number }>('SELECT used FROM quota_counter WHERE scope = $1 AND day = $2', [scope, day]))
    .rows[0]?.used;

describe('reset-quota: один названный ключ, журнал в той же транзакции (OWN-06B-010)', () => {
  it('сброс ключа песочницы: used → 0, запись кто/когда/ключ/прежнее значение', async () => {
    const t = await seedTenant(owner);
    const scope = `answer:sandbox:${t.accountId}`;
    await preset(scope, D[0]!, 100);
    const previous = await resetQuota(app, { scope, day: D[0]!, operator: 'ops@n6b', reason: 'демо на занятии' });
    expect(previous).toBe(100);
    expect(await usedOf(scope, D[0]!)).toBe(0);
    const log = await owner.query('SELECT scope, day::text, previous_used, operator, reason FROM quota_reset_log WHERE scope = $1',
      [scope]);
    expect(log.rows).toEqual([{ scope, day: D[0], previous_used: 100, operator: 'ops@n6b', reason: 'демо на занятии' }]);
  });

  it.each([
    ['шаблон', 'answer:%'], ['звёздочка', 'answer:*'], ['пусто', ''], ['неизвестная форма', 'test:anything'],
    ['пробел в конце', 'answer:global '],
  ])('отказ на ключе вне закрытого списка (%s) — ничего не меняется', async (_, scope) => {
    // Строка с таким ключом СУЩЕСТВУЕТ: отказ обязан прийти от проверки формы, а не от «сбрасывать нечего».
    if (scope) await preset(scope, D[1]!, 5);
    await expect(resetQuota(app, { scope, day: D[1]!, operator: 'ops' }))
      .rejects.toThrow(/не из закрытого списка форм/);
    if (scope) expect(await usedOf(scope, D[1]!)).toBe(5);
  });

  it('отказ без оператора и на несуществующем счётчике; журнал не пишется', async () => {
    await preset('answer:global', D[2]!, 7);
    await expect(resetQuota(app, { scope: 'answer:global', day: D[2]!, operator: '  ' }))
      .rejects.toThrow(/оператор/);
    await expect(resetQuota(app, { scope: 'answer:global', day: D[3]!, operator: 'ops' }))
      .rejects.toThrow(/нечего/);
    expect(await usedOf('answer:global', D[2]!)).toBe(7);
    expect((await owner.query('SELECT 1 FROM quota_reset_log WHERE day IN ($1::date, $2::date)', [D[2], D[3]])).rowCount).toBe(0);
  });

  it('журнал сброса не правится и не удаляется служебной ролью', async () => {
    await expect(withService(app, (c) => c.query('DELETE FROM quota_reset_log'))).rejects.toThrow(/permission denied/);
    await expect(withService(app, (c) => c.query("UPDATE quota_reset_log SET operator = 'x'")))
      .rejects.toThrow(/permission denied/);
  });

  it('CLI: коды 0/1/2, секрет строки подключения не печатается', async () => {
    await preset('embed:global', D[4]!, 42);
    const out: string[] = [];
    const err: string[] = [];
    const run = (argv: string[], e: Record<string, string | undefined>) =>
      runOps(argv, e, (l) => out.push(l), (l) => err.push(l));
    const good = { DATABASE_URL_SERVICE: env().serviceUrl };
    expect(await run(['reset-quota', '--scope', 'embed:global', '--day', D[4]!, '--operator', 'ops'], good)).toBe(0);
    expect(out.join('\n')).toContain('было 42');
    expect(await run(['reset-quota', '--scope', 'embed:*', '--operator', 'ops'], good)).toBe(1);
    expect(await run(['reset-quota', '--scope', 'embed:global'], good)).toBe(1);
    expect(await run(['reset-all'], good)).toBe(2);
    expect(await run(['reset-quota', '--scope', 'embed:global', '--operator', 'ops'], {})).toBe(1);
    expect([...out, ...err].join('\n')).not.toContain(env().servicePassword);
  });
});

describe('отказ по пределу пишется с каналом (OWN-06B-012)', () => {
  it('question_log.outcome=limited с каналом widget; неизвестный канал — ошибка кода', async () => {
    const t = await seedTenant(owner);
    await withService(app, (c) => recordLimited(c, { botId: t.botId, accountId: t.accountId, channel: 'widget',
      visitorKey: 'a'.repeat(32), originHost: 'client.example', question: 'q'.repeat(600) }));
    const { rows } = await owner.query("SELECT channel, length(question) AS len FROM question_log WHERE bot_id = $1 AND outcome = 'limited'",
      [t.botId]);
    expect(rows).toEqual([{ channel: 'widget', len: 500 }]);
    await expect(withService(app, (c) => recordLimited(c, { botId: t.botId, accountId: t.accountId,
      channel: 'email' as 'widget', visitorKey: null, originHost: null, question: 'q' }))).rejects.toThrow(/канал/);
  });
});

describe('где виден расход: spendToday (01_plan.md §6)', () => {
  it('T-13: пустые сутки — «нет данных» (null), а не 0 %', async () => {
    const s = await spendToday(app, LIMITS, new Date('2032-06-01T09:00:00Z'));
    expect(s.day).toBe('2032-06-01');
    expect(s.globals.map((g) => [g.used, g.share])).toEqual([[null, null], [null, null], [null, null]]);
    expect(s.failedShareLastHour).toBeNull();
    expect(s.estimatedUsd).toBeNull();
    expect(s.unknownOutcome).toBe(0);
    expect(s.alerts).toEqual([]);
  });

  it('доля глобального ключа и тревога ≥ 80 %; попытки по видам и исходам за сегодня', async () => {
    const at = new Date();
    const t = await seedTenant(owner);
    const today = (await spendToday(app, LIMITS, at)).day;
    await owner.query("DELETE FROM quota_counter WHERE scope = 'answer:sandbox:global' AND day = $1", [today]);
    await preset('answer:sandbox:global', today, 1700);
    await owner.query(`INSERT INTO model_call_log (kind, account_id, state, tokens_in, tokens_out, created_at) VALUES
      ('answer', $1, 'succeeded', 1000000, 0, now()), ('answer', $1, 'started', NULL, NULL, now() - interval '10 minutes')`,
    [t.accountId]);
    const s = await spendToday(app, LIMITS, at);
    const sandbox = s.globals.find((g) => g.scope === 'answer:sandbox:global')!;
    expect(sandbox).toMatchObject({ used: 1700, limit: 2000, share: 0.85, alert: true });
    expect(s.alerts.join('\n')).toContain('answer:sandbox:global: 1700/2000');
    expect(s.attempts.answer!.succeeded).toBeGreaterThanOrEqual(1);
    expect(s.unknownOutcome).toBeGreaterThanOrEqual(1);
    expect(s.estimatedUsd).toBeGreaterThanOrEqual(0.4);
  });

  it('F-4: попытка, повисшая в 23:59 МСК, после полуночи остаётся «исход неизвестен»; старше 48 ч — нет', async () => {
    const t = await seedTenant(owner);
    // 23:59 МСК = 20:59Z суток runDate(40); сводка — в 00:10 МСК следующих суток (21:10Z).
    const hung = runDate(40, 20, 59);
    const at = runDate(40, 21, 10);
    const old = new Date(at.getTime() - 49 * 3600_000);
    const fresh = new Date(at.getTime() - 30_000);
    await owner.query(`INSERT INTO model_call_log (kind, account_id, state, created_at) VALUES
      ('answer', $1, 'started', $2), ('embed_question', $1, 'started', $3), ('answer', $1, 'started', $4)`,
    [t.accountId, hung.toISOString(), old.toISOString(), fresh.toISOString()]);
    const s = await spendToday(app, LIMITS, at);
    expect(s.day).not.toBe(isoDay(hung));
    // Ровно одна: 23:59 вчерашних суток; 49 ч назад — вне окна; 30 с назад — ещё не «неизвестен» (< 90 с).
    expect(s.unknownOutcome).toBe(1);
  });
});
