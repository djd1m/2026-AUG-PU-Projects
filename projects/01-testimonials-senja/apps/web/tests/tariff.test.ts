// FR-007 — тарифы. Инвариант: решение о badge принимает сервер по значению из БД,
// и не существует входа, которым клиент мог бы на него повлиять (ADR-002).

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PAID_PERIOD_DAYS, TIERS, badgeRequiredFor, extendPaidUntil, isPaid, isTier, tierSummary } from '../src/lib/tariff';

describe('badgeRequiredFor — единственный источник правила', () => {
  const FUTURE = new Date(Date.now() + 5 * 24 * 3600_000);
  const PAST = new Date(Date.now() - 1000);

  it('free требует badge; paid не требует, только пока срок не истёк', () => {
    expect(badgeRequiredFor('free', FUTURE)).toBe(true);
    expect(badgeRequiredFor('paid', FUTURE)).toBe(false);
    expect(badgeRequiredFor('paid', PAST), 'просроченная оплата обязана вернуть badge').toBe(true);
  });

  it('ЛЮБОЕ неопознанное значение ТАРИФА трактуется как free (fail-closed)', () => {
    for (const bad of [null, undefined, '', 'PAID', ' paid', 'premium', 0, 1, true, {}, ['paid']]) {
      expect(badgeRequiredFor(bad, FUTURE), JSON.stringify(bad)).toBe(true);
    }
  });

  it('ЛЮБОЕ неопознанное значение СРОКА трактуется как «не оплачено» (fail-closed)', () => {
    // Вторая ось того же правила, и она опаснее первой: `new Date('мусор')` даёт Invalid
    // Date, у которого getTime() это NaN, а любое сравнение с NaN ложно. Наивная проверка
    // `until > now` пропустила бы мусор как действующую оплату — то есть сняла бы badge
    // и вместе с ним единственный канал роста.
    for (const bad of [null, undefined, '', '   ', 'вчера', 'not-a-date', 0, 1, true, {}, [],
                       new Date('мусор')]) {
      expect(badgeRequiredFor('paid', bad), JSON.stringify(String(bad))).toBe(true);
    }
  });

  it('оба аргумента приходят ИЗ БАЗЫ — клиенту по-прежнему влиять нечем', () => {
    // Прежняя редакция закрепляла инвариант формой «ровно один аргумент». Аргументов стало
    // два, и форма устарела — но СМЫСЛ не изменился: второй тоже читается из projects, а не
    // из запроса. Форму заменяем честно, а не подгоняем число под код: третий параметр
    // (момент времени) имеет значение по умолчанию и в .length не входит.
    expect(badgeRequiredFor.length).toBe(2);
    // А то, что ни один роут не берёт эти значения из ввода, стережёт разбор исходников ниже.
  });

  it('isPaid — зеркало правила, включая срок', () => {
    expect(isPaid('paid', FUTURE)).toBe(true);
    expect(isPaid('paid', PAST)).toBe(false);
    expect(isPaid('free', FUTURE)).toBe(false);
  });

  it('продление НЕ сжигает остаток: считается от большего из «сейчас» и текущего срока', () => {
    const now = new Date('2026-09-02T12:00:00Z');
    const day = 24 * 3600_000;

    // Оплата за 5 дней до конца: остаток обязан сохраниться, иначе досрочная оплата
    // наказывает того, кто платит вовремя.
    const rest = new Date(now.getTime() + 5 * day);
    expect(extendPaidUntil(rest, now).getTime())
      .toBe(rest.getTime() + PAID_PERIOD_DAYS * day);

    // Просроченный и никогда не плативший считаются от «сейчас», а не от старой даты:
    // иначе первая оплата после долгого перерыва выдала бы срок в прошлом.
    const expired = new Date(now.getTime() - 100 * day);
    expect(extendPaidUntil(expired, now).getTime()).toBe(now.getTime() + PAID_PERIOD_DAYS * day);
    expect(extendPaidUntil(null, now).getTime()).toBe(now.getTime() + PAID_PERIOD_DAYS * day);
    expect(extendPaidUntil('мусор', now).getTime()).toBe(now.getTime() + PAID_PERIOD_DAYS * day);
  });

  it('продаётся ровно тот срок, что назван владельцем (DEC-001)', () => {
    expect(PAID_PERIOD_DAYS).toBe(30);
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
      if (/(searchParams\.get|\.get)\(\s*['"](tier|hide_badge|badge_required|badge|paid_until)['"]/.test(code)) {
        offenders.push(path.relative(SRC, file));
      }
      if (/\b(body|input|payload)\s*(as[^;]*)?\)?\s*\.\s*(tier|badge_required|hide_badge|paid_until)\b/.test(code)) {
        offenders.push(path.relative(SRC, file));
      }
    }
    expect(offenders, `тариф читается из ввода в: ${offenders.join(', ')}`).toEqual([]);
  });
});
