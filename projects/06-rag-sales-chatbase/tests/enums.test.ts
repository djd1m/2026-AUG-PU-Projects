// Закрытость перечислений держит БД: CHECK миграции обязан совпадать с единственным источником в коде
// (coding-style «SQL»). Образец идеи — N5 tests/enums.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as enums from '../packages/rag/src/enums';

const sql = readFileSync('packages/db/migrations/001_init.sql', 'utf8');
function checkValues(column: string): string[] {
  const match = new RegExp(`${column}[^\\n]*?CHECK \\(${column.split('.').pop()} IN \\(([^)]*)\\)`, 's').exec(sql);
  if (!match) throw new Error(`CHECK для ${column} не найден — проверка НЕ ВЫПОЛНЕНА`);
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}
const cases: Array<[string, readonly string[]]> = [
  ['plan', enums.ACCOUNT_PLAN], ['kind', enums.SOURCE_KIND],
  ['scope', enums.QUOTA_SCOPE], ['type', enums.GROWTH_EVENT_TYPE], ['source', enums.ATTRIBUTION_SOURCE],
  ['failure_reason', enums.INDEX_JOB_FAILURE_REASON],
];
describe('CHECK миграции = перечисления канона §4', () => {
  it.each(cases)('%s', (column, values) => { expect(checkValues(column)).toEqual([...values]); });
  // small-talk (A-N6-074): исход расширяется ДОБАВЛЯЮЩИМИ миграциями (013 дописывает 'small_talk' к текущему набору, не
  // перечисляя его). Здесь — 001 + добавленные значения; итоговый CHECK настоящей БД сверяет tests/small-talk.integration.test.ts.
  it('outcome: CHECK 001 + значения добавляющих миграций = QUESTION_OUTCOME', () => {
    const added = readdirSync('packages/db/migrations').filter((f) => f.endsWith('.sql')).sort()
      .flatMap((f) => [...readFileSync(`packages/db/migrations/${f}`, 'utf8').matchAll(/ARRAY\[''([a-z_]+)''::text, /g)].map((m) => m[1]!));
    expect(added).toContain('small_talk');
    expect([...checkValues('outcome'), ...added].sort()).toEqual([...enums.QUESTION_OUTCOME].sort());
  });
  it('статусы: account, bot, source, index_job, attribution', () => {
    const statuses = [...sql.matchAll(/status text NOT NULL[^,]*CHECK \(status IN \(([^)]*)\)\)/g)].map((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]));
    for (const values of [enums.ACCOUNT_STATUS, enums.BOT_STATUS, enums.SOURCE_STATUS, enums.INDEX_JOB_STATUS]) {
      expect(statuses).toContainEqual([...values]);
    }
  });
  // account-erasure: статус атрибуции расширен миграцией 010 (partner_deleted) — действует ПОСЛЕДНЯЯ замена ограничения.
  it('статус attribution: последнее attribution_status_check миграций = ATTRIBUTION_STATUS', () => {
    const migrations = readdirSync('packages/db/migrations').filter((f) => f.endsWith('.sql')).sort()
      .map((f) => readFileSync(`packages/db/migrations/${f}`, 'utf8')).join('\n');
    const all = [...migrations.matchAll(/CONSTRAINT attribution_status_check CHECK \(status IN \(([^)]*)\)\)/g)];
    if (!all.length) throw new Error('attribution_status_check не найден — проверка НЕ ВЫПОЛНЕНА');
    expect([...all.at(-1)![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...enums.ATTRIBUTION_STATUS]);
  });
  // gate-onboarding (миграция 011, A-N6-066): исход not_verified — действует ПОСЛЕДНЯЯ замена question_log_outcome_check;
  // первое определение — inline CHECK в 001 (имя по умолчанию), оно обязано быть подмножеством действующего.
  it('question_log.outcome: последнее question_log_outcome_check миграций = QUESTION_OUTCOME', () => {
    const migrations = readdirSync('packages/db/migrations').filter((f) => f.endsWith('.sql')).sort()
      .map((f) => readFileSync(`packages/db/migrations/${f}`, 'utf8')).join('\n');
    const all = [...migrations.matchAll(/CONSTRAINT question_log_outcome_check\s+CHECK \(outcome IN \(([^)]*)\)\)/g)];
    if (!all.length) throw new Error('question_log_outcome_check не найден — проверка НЕ ВЫПОЛНЕНА');
    expect([...all.at(-1)![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...enums.QUESTION_OUTCOME]);
    expect(enums.QUESTION_OUTCOME).toEqual(expect.arrayContaining(checkValues('outcome')));
  });
  // carry_over ревью foundation M1: статус попытки объявлен в коде и совпадает с CHECK таблицы job_attempt
  // (сверка по ТЕЛУ таблицы, а не «где-нибудь в файле»: набор running/done/failed есть и у других таблиц).
  it('job_attempt.status = JOB_ATTEMPT_STATUS', () => {
    const body = /CREATE TABLE job_attempt \(([\s\S]*?)\n\);/.exec(sql)?.[1];
    if (!body) throw new Error('таблица job_attempt не найдена — проверка НЕ ВЫПОЛНЕНА');
    const check = /status text NOT NULL CHECK \(status IN \(([^)]*)\)\)/.exec(body)?.[1];
    if (!check) throw new Error('CHECK статуса job_attempt не найден — проверка НЕ ВЫПОЛНЕНА');
    expect([...check.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...enums.JOB_ATTEMPT_STATUS]);
  });
  it('ровно 27 сущностей канона §4 по ВСЕМ миграциям (19 + 4 оплаты A-N6-040 + 4 партнёрки A-N6-043) и 10 scope', () => {
    const all = readdirSync('packages/db/migrations').filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(`packages/db/migrations/${f}`, 'utf8')).join('\n');
    // Служебные журналы — не сущности канона (закрытый список): index_start — журнал запусков индексации для суточного
    // предела (source-lifecycle, A-N6-050). Любая другая новая таблица сдвинет список и уронит тест.
    // erasure_audit — журнал стирания аккаунтов без ПДн (account-erasure, миграция 010).
    const SERVICE = ['index_start', 'erasure_audit', 'upload_orphan'];   // upload_orphan — файл удалённого источника до стирания (шестое ревью)
    const all_tables = [...all.matchAll(/^CREATE TABLE (\w+)/gm)].map((m) => m[1]!);
    expect(SERVICE.every((t) => all_tables.includes(t))).toBe(true);
    const tables = all_tables.filter((t) => !SERVICE.includes(t));
    expect(tables.sort()).toEqual(['account', 'allowed_origin', 'attribution', 'bot', 'chunk', 'commission_entry', 'growth_event', 'index_job', 'job_attempt',
      'operator_action', 'page', 'partner_audit', 'partner_code', 'partner_code_use', 'partner_payout_details', 'payment', 'payment_event', 'payment_intent',
      'preview', 'pro_interest', 'question_log', 'quota_counter', 'session', 'source', 'studio_invite', 'visitor_session', 'widget_install']);
    expect(enums.QUOTA_SCOPE).toHaveLength(10);
  });
});
describe('Неизвестное читается как самое строгое (fail-closed)', () => {
  it.each([null, undefined, '', 'NOBADGE', ' nobadge', 'nobadge ', 'premium', 0, 1, true, {}, ['nobadge']])('план %j → free', (bad) => {
    expect(enums.readAccountPlan(bad)).toBe('free');
  });
  it('статусы: неизвестное → deleted / failed', () => {
    expect(enums.readAccountStatus('ACTIVE')).toBe('deleted');
    expect(enums.readBotStatus(null)).toBe('deleted');
    expect(enums.readIndexJobStatus('done ')).toBe('failed');
    expect(enums.readAccountPlan('studio')).toBe('studio');
    for (const bad of ['deferred', 'RUNNING', ' done', null, 1]) expect(enums.readJobAttemptStatus(bad)).toBe('failed');
    expect(enums.readFailureReason('timeout')).toBe('internal');
  });
});
// budget-truncation (A-N6-052) и crawl-coverage (A-N6-070): пометка усечения задачи — закрытый набор в коде и тот же CHECK
// в ПОСЛЕДНЕЙ миграции, которая его задаёт (009 → 012): старый CHECK без новых значений отверг бы запись done.
describe('index_job.truncated_by', () => {
  it('последний CHECK truncated_by в миграциях = INDEX_JOB_TRUNCATION; 009 — подмножество (значения не удалялись)', () => {
    const lists = ['009_budget_truncation.sql', '012_crawl_coverage.sql'].map((file) => {
      const match = /CHECK \(truncated_by IN \(([^)]*)\)\)/.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
      if (!match) throw new Error(`CHECK truncated_by в ${file} не найден — проверка НЕ ВЫПОЛНЕНА`);
      return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    });
    expect(lists[1]).toEqual([...enums.INDEX_JOB_TRUNCATION]);
    for (const old of lists[0]!) expect(lists[1]).toContain(old);
    expect(enums.readIndexJobTruncation('page_budget')).toBe('page_budget');
    expect(enums.readIndexJobTruncation('crawl_limit')).toBe('crawl_limit');
  });
  it('NULL — не усечена; известное — как есть; непустое неизвестное — unknown, а не «прочитано целиком»', () => {
    expect(enums.readIndexJobTruncation(null)).toBeNull();
    expect(enums.readIndexJobTruncation(undefined)).toBeNull();
    expect(enums.readIndexJobTruncation('embed_budget')).toBe('embed_budget');
    expect(enums.readIndexJobTruncation('series_embed_budget')).toBe('series_embed_budget');
    for (const bad of ['', 'EMBED_BUDGET', ' embed_budget', 'budget', 0, 1, true, {}, ['embed_budget']]) {
      expect(enums.readIndexJobTruncation(bad), JSON.stringify(bad)).toBe('unknown');
    }
  });
});
