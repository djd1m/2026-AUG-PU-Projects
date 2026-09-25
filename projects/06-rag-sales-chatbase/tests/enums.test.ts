// Закрытость перечислений держит БД: CHECK миграции обязан совпадать с единственным источником в коде
// (coding-style «SQL»). Образец идеи — N5 tests/enums.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as enums from '../packages/rag/src/enums';

const sql = readFileSync('packages/db/migrations/001_init.sql', 'utf8');
function checkValues(column: string): string[] {
  const match = new RegExp(`${column}[^\\n]*?CHECK \\(${column.split('.').pop()} IN \\(([^)]*)\\)`, 's').exec(sql);
  if (!match) throw new Error(`CHECK для ${column} не найден — проверка НЕ ВЫПОЛНЕНА`);
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}
const cases: Array<[string, readonly string[]]> = [
  ['plan', enums.ACCOUNT_PLAN], ['kind', enums.SOURCE_KIND], ['outcome', enums.QUESTION_OUTCOME],
  ['scope', enums.QUOTA_SCOPE], ['type', enums.GROWTH_EVENT_TYPE], ['source', enums.ATTRIBUTION_SOURCE],
  ['failure_reason', enums.INDEX_JOB_FAILURE_REASON],
];
describe('CHECK миграции = перечисления канона §4', () => {
  it.each(cases)('%s', (column, values) => { expect(checkValues(column)).toEqual([...values]); });
  it('статусы: account, bot, source, index_job, attribution', () => {
    const statuses = [...sql.matchAll(/status text NOT NULL[^,]*CHECK \(status IN \(([^)]*)\)\)/g)].map((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]));
    for (const values of [enums.ACCOUNT_STATUS, enums.BOT_STATUS, enums.SOURCE_STATUS, enums.INDEX_JOB_STATUS, enums.ATTRIBUTION_STATUS]) {
      expect(statuses).toContainEqual([...values]);
    }
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
  it('ровно 19 сущностей канона и 10 scope', () => {
    const tables = [...sql.matchAll(/^CREATE TABLE (\w+)/gm)].map((m) => m[1]);
    expect(tables.sort()).toEqual(['account', 'allowed_origin', 'attribution', 'bot', 'chunk', 'growth_event', 'index_job', 'job_attempt',
      'page', 'partner_code', 'preview', 'pro_interest', 'question_log', 'quota_counter', 'session', 'source', 'studio_invite',
      'visitor_session', 'widget_install']);
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
