// FR-007 — тарифы. Инвариант: решение о badge принимает сервер по значению из БД,
// и не существует входа, которым клиент мог бы на него повлиять (ADR-002).

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { TIERS, badgeRequiredFor, isTier, tierSummary } from '../src/lib/tariff';

describe('badgeRequiredFor — единственный источник правила', () => {
  it('free требует badge, paid — нет', () => {
    expect(badgeRequiredFor('free')).toBe(true);
    expect(badgeRequiredFor('paid')).toBe(false);
  });

  it('ЛЮБОЕ неопознанное значение трактуется как free (fail-closed)', () => {
    for (const bad of [null, undefined, '', 'PAID', ' paid', 'premium', 0, 1, true, {}, ['paid']]) {
      expect(badgeRequiredFor(bad), JSON.stringify(bad)).toBe(true);
    }
  });

  it('функция принимает РОВНО один аргумент — влиять клиенту нечем', () => {
    // Это и есть реализация инварианта: второго параметра, куда можно было бы
    // передать hide_badge, физически не существует.
    expect(badgeRequiredFor.length).toBe(1);
  });

  it('тарифов ровно два — Specification FR-007', () => {
    expect(TIERS).toEqual(['free', 'paid']);
  });

  it('isTier не пропускает мусор', () => {
    expect(isTier('free')).toBe(true);
    expect(isTier('paid')).toBe(true);
    for (const bad of ['Free', 'trial', '', null, 1]) expect(isTier(bad), String(bad)).toBe(false);
  });

  it('описание тарифа называет ровно то различие, что есть в MVP', () => {
    expect(tierSummary('free').badge).toContain('показывается');
    expect(tierSummary('paid').badge).toContain('скрыт');
  });
});

// ── Слой 1: правило не должно расползтись по коду ──────────────────────────────
// Как только сравнение с 'paid' появится вторым местом, два места разойдутся,
// и badge исчезнет в одной из веток. Проверяем это разбором исходников, а не
// договорённостью.

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('правило тарифа не продублировано', () => {
  const SRC = path.resolve(__dirname, '../src');
  const files = sourceFiles(SRC);

  it('сравнение с "paid" встречается только в lib/tariff.ts', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith(path.join('lib', 'tariff.ts'))) continue;
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // Ищем именно СРАВНЕНИЕ, а не строку 'paid' в SQL или в типе.
      if (/[!=]==?\s*['"]paid['"]|['"]paid['"]\s*[!=]==?/.test(code)) {
        offenders.push(path.relative(SRC, file));
      }
    }
    expect(offenders, `правило продублировано в: ${offenders.join(', ')}`).toEqual([]);
  });

  it('ни один роут не читает тариф или badge из пользовательского ввода', () => {
    const offenders: string[] = [];
    for (const file of files.filter((f) => f.includes(`${path.sep}api${path.sep}`))) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // searchParams.get('tier') / body.badge_required / form.get('hide_badge') и т.п.
      if (/(searchParams\.get|\.get)\(\s*['"](tier|hide_badge|badge_required|badge)['"]/.test(code)) {
        offenders.push(path.relative(SRC, file));
      }
      if (/\b(body|input|payload)\s*(as[^;]*)?\)?\s*\.\s*(tier|badge_required|hide_badge)\b/.test(code)) {
        offenders.push(path.relative(SRC, file));
      }
    }
    expect(offenders, `тариф читается из ввода в: ${offenders.join(', ')}`).toEqual([]);
  });
});
