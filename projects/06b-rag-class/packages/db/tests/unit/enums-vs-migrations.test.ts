import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { accountKindOf, CHECKED_SETS, planOf } from '../../src/enums';

// Страж слоя 1: закрытые множества объявлены один раз (enums.ts), миграция обязана с ними совпадать.
const SQL = readFileSync(path.resolve(__dirname, '../../migrations/001_init.sql'), 'utf8');

function checkSet(name: string): string[] | null {
  const m = SQL.match(new RegExp(`CONSTRAINT ${name}\\s+CHECK \\(\\w+ IN \\(([^)]*)\\)\\)`));
  return m ? [...m[1]!.matchAll(/'([^']*)'/g)].map((x) => x[1]!) : null;
}

describe('enums.ts ↔ CHECK миграций', () => {
  it.each(Object.entries(CHECKED_SETS))('%s совпадает с enums.ts', (name, values) => {
    expect(checkSet(name), `CHECK ${name} не найден в 001_init.sql`).toEqual([...values]);
  });

  it('в миграции нет CHECK … IN (…) вне реестра CHECKED_SETS', () => {
    const declared = [...SQL.matchAll(/CONSTRAINT (\w+)\s+CHECK \(\w+ IN \(/g)].map((m) => m[1]);
    expect(declared.filter((n) => !(n! in CHECKED_SETS))).toEqual([]);
  });

  it('account.plan — text без CHECK: неопознанный тариф читается как free, а не роняет запись (ADR-006)', () => {
    expect(SQL).toMatch(/\n\s+plan\s+text NOT NULL DEFAULT 'free', --/);
  });
});

describe('fail-closed толкование', () => {
  it('ЛЮБОЙ неопознанный план → free', () => {
    for (const bad of [null, undefined, '', 'PAID', ' start', 'premium', 0, 1, true, {}, ['start'], 'Start']) {
      expect(planOf(bad), JSON.stringify(bad)).toBe('free');
    }
    expect(planOf('start')).toBe('start');
    expect(planOf('studio')).toBe('studio');
  });

  it('тип аккаунта при регистрации: неизвестное → owner', () => {
    for (const bad of [null, undefined, '', 'admin', 'STUDIO', 1, {}, ['studio']]) {
      expect(accountKindOf(bad), JSON.stringify(bad)).toBe('owner');
    }
    expect(accountKindOf('studio')).toBe('studio');
  });
});
