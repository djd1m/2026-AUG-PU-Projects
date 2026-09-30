import { afterAll, describe, expect, it } from 'vitest';
import { runOps } from '../../src/ops-cli';
import { recordLimited, resetQuota, ResetRefused } from '../../src/quota-admin';
import type { Limits } from '../../src/quota-keys';
import { spendToday } from '../../src/spend-today';
import { withService } from '../../src/tenant';
import { env, ownerPool, seedTenant, servicePool } from './helpers';

// Сброс оператором с журналом (OWN-06B-010), запись отказа по пределу с каналом (OWN-06B-012), сводка расхода (01_plan.md
// §6, T-13). Ключи — настоящих форм, сутки — свои у каждого теста, чтобы не делить счётчик с другими файлами.

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
    await preset(scope, '2031-02-01', 100);
    const previous = await resetQuota(app, { scope, day: '2031-02-01', operator: 'ops@n6b', reason: 'демо на занятии' });
    expect(previous).toBe(100);
    expect(await usedOf(scope, '2031-02-01')).toBe(0);
    const log = await owner.query('SELECT scope, day::text, previous_used, operator, reason FROM quota_reset_log WHERE scope = $1',
      [scope]);
    expect(log.rows).toEqual([{ scope, day: '2031-02-01', previous_used: 100, operator: 'ops@n6b', reason: 'демо на занятии' }]);
  });

  it.each([
    ['шаблон', 'answer:%'], ['звёздочка', 'answer:*'], ['пусто', ''], ['неизвестная форма', 'test:anything'],
    ['пробел в конце', 'answer:global '],
  ])('отказ на ключе вне закрытого списка (%s) — ничего не меняется', async (_, scope) => {
    // Строка с таким ключом СУЩЕСТВУЕТ: отказ обязан прийти от проверки формы, а не от «сбрасывать нечего».
    if (scope) await preset(scope, '2031-02-02', 5);
    await expect(resetQuota(app, { scope, day: '2031-02-02', operator: 'ops' }))
      .rejects.toThrow(/не из закрытого списка форм/);
    if (scope) expect(await usedOf(scope, '2031-02-02')).toBe(5);
  });

  it('отказ без оператора и на несуществующем счётчике; журнал не пишется', async () => {
    await preset('answer:global', '2031-02-03', 7);
    await expect(resetQuota(app, { scope: 'answer:global', day: '2031-02-03', operator: '  ' }))
      .rejects.toThrow(/оператор/);
    await expect(resetQuota(app, { scope: 'answer:global', day: '2031-02-04', operator: 'ops' }))
      .rejects.toThrow(/нечего/);
    expect(await usedOf('answer:global', '2031-02-03')).toBe(7);
    expect((await owner.query("SELECT 1 FROM quota_reset_log WHERE day IN ('2031-02-03', '2031-02-04')")).rowCount).toBe(0);
  });

  it('журнал сброса не правится и не удаляется служебной ролью', async () => {
    await expect(withService(app, (c) => c.query('DELETE FROM quota_reset_log'))).rejects.toThrow(/permission denied/);
    await expect(withService(app, (c) => c.query("UPDATE quota_reset_log SET operator = 'x'")))
      .rejects.toThrow(/permission denied/);
  });

  it('CLI: коды 0/1/2, секрет строки подключения не печатается', async () => {
    await preset('embed:global', '2031-02-05', 42);
    const out: string[] = [];
    const err: string[] = [];
    const run = (argv: string[], e: Record<string, string | undefined>) =>
      runOps(argv, e, (l) => out.push(l), (l) => err.push(l));
    const good = { DATABASE_URL_SERVICE: env().serviceUrl };
    expect(await run(['reset-quota', '--scope', 'embed:global', '--day', '2031-02-05', '--operator', 'ops'], good)).toBe(0);
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
});
