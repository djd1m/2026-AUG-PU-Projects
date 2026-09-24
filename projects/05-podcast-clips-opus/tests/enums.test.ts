import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as e from '../packages/shared/src/enums';

export function checkSqlEnums(sql: string): void {
  for (const [key, values] of Object.entries(e.SQL_ENUMS)) {
    const [table, column] = key.split('.');
    // Process CREATE/ALTER statements in migration order, scoped to each table.
    const definitions = [...sql.replace(/--[^\n]*/g, '').matchAll(/(?:CREATE TABLE|ALTER TABLE)\s+(\w+)\s+([^;]+);/g)]
      .filter(m => m[1] === table)
      .flatMap(m => [...m[2]!.matchAll(new RegExp(`CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]+)\\)\\s*\\)`, 'g'))]);
    const check = definitions.at(-1)?.[1];
    expect(check, key).toBeDefined();
    const actual = [...(check ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(actual.sort(), key).toEqual([...values].sort());
  }
}
const migrations = () => readdirSync('packages/db/migrations').filter(f => /^\d+_.*\.sql$/.test(f)).sort()
  .map(f => readFileSync(`packages/db/migrations/${f}`, 'utf8')).join('\n');
const garbage = [null, undefined, '', 'PAID', ' paid', 'premium', 0, 1, true, {}, ['paid']];
describe('Закрытые перечисления', () => {
  it.each(garbage.map((v) => [v]))('Мусор %j читается fail-closed', (value) => {
    expect(e.readPlan(value)).toBe('free'); expect(e.readAccountStatus(value)).toBe('deleted');
    expect(e.readVideoStatus(value)).toBe('failed'); expect(e.readClipStatus(value)).toBe('failed');
    expect(e.readJobStatus(value)).toBe('failed'); expect(e.readAttributionStatus(value)).toBe('rejected');
    expect(e.readPartnerCodeStatus(value)).toBe('blocked');
  });
  it('Только точное paid разрешает платный тариф', () => { expect(e.readPlan('paid')).toBe('paid'); });
  it('Каждый CHECK равен массиву единственного источника', () => checkSqlEnums(migrations()));
  it('RT-009 four statuses and stale attribution CHECK mutation', () => {
    expect(e.ATTRIBUTION_STATUS).toHaveLength(4);
    expect(e.readAttributionStatus('partner_deleted')).toBe('partner_deleted');
    expect(() => checkSqlEnums(migrations().replace("CHECK (status IN ('pending','activated','rejected','partner_deleted'))",
      "CHECK (status IN ('pending','activated','rejected'))"))).toThrow();
  });
  it('Мутация CHECK обнаруживается стражем', () => {
    const sql = migrations();
    expect(() => checkSqlEnums(sql.replace("'free', 'paid'", "'free', 'premium'"))).toThrow();
  });
});
