import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as e from '../packages/shared/src/enums';

export function checkSqlEnums(sql: string): void {
  for (const [key, values] of Object.entries(e.SQL_ENUMS)) {
    const [table, column] = key.split('.');
    const body = sql.match(new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
    const replacement = table === 'clip' && column === 'failure_reason'
      ? readFileSync('packages/db/migrations/013_watermark_geometry.sql', 'utf8') : body;
    const check = replacement?.match(new RegExp(`CHECK \\(${column} IN \\(([^)]+)\\)\\)`))?.[1];
    expect(check, key).toBeDefined();
    const actual = [...(check ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(actual.sort(), key).toEqual([...values].sort());
  }
}
const garbage = [null, undefined, '', 'PAID', ' paid', 'premium', 0, 1, true, {}, ['paid']];
describe('Закрытые перечисления', () => {
  it.each(garbage.map((v) => [v]))('Мусор %j читается fail-closed', (value) => {
    expect(e.readPlan(value)).toBe('free'); expect(e.readAccountStatus(value)).toBe('deleted');
    expect(e.readVideoStatus(value)).toBe('failed'); expect(e.readClipStatus(value)).toBe('failed');
    expect(e.readJobStatus(value)).toBe('failed'); expect(e.readAttributionStatus(value)).toBe('rejected');
    expect(e.readPartnerCodeStatus(value)).toBe('blocked');
  });
  it('Только точное paid разрешает платный тариф', () => { expect(e.readPlan('paid')).toBe('paid'); });
  it('Каждый CHECK равен массиву единственного источника', () => checkSqlEnums(readFileSync('packages/db/migrations/001_init.sql', 'utf8')));
  it('Мутация CHECK обнаруживается стражем', () => {
    const sql = readFileSync('packages/db/migrations/001_init.sql', 'utf8');
    expect(() => checkSqlEnums(sql.replace("'free', 'paid'", "'free', 'premium'"))).toThrow();
  });
});
