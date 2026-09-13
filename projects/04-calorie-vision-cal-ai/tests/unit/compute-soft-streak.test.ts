// ComputeSoftStreak (FR-diary-and-streak-7, AC-diary-and-streak-15/16). Часы фиксированы через
// сконструированный набор дат — таймзона здесь не участвует (вызывающий код уже передаёт
// московскую календарную дату, `get-diary-day.ts`), проверяется только арифметика окна.

import { describe, expect, it } from 'vitest';
import { computeSoftStreak, subtractDays } from '../../apps/api/src/diary/compute-soft-streak.js';

const TODAY = '2026-09-13';

function fakePool(days: readonly string[]) {
  return {
    query: async () => ({ rows: days.map((eaten_on) => ({ eaten_on })), rowCount: days.length }),
  } as unknown as import('@n4/db').DbPool;
}

describe('ComputeSoftStreak', () => {
  it('один пропущенный день не обнуляет стрик и помечается замороженным', async () => {
    // Записи T-6..T-2 (пять дней), T-1 пуст, сегодня (T) — с записью.
    const days = [TODAY, subtractDays(TODAY, 2), subtractDays(TODAY, 3), subtractDays(TODAY, 4), subtractDays(TODAY, 5), subtractDays(TODAY, 6)];
    const result = await computeSoftStreak(fakePool(days), 'owner-1', TODAY);

    expect(result.days).toBe(6);
    expect(result.frozenDays).toEqual([subtractDays(TODAY, 1)]);
  });

  it('два пропущенных дня подряд обнуляют стрик до единицы', async () => {
    // T-1 и T-2 пусты, сегодня (T) — с записью. Более старые дни не участвуют — обрыв случился
    // раньше, чем до них дошла бы очередь.
    const days = [TODAY];
    const result = await computeSoftStreak(fakePool(days), 'owner-1', TODAY);

    expect(result.days).toBe(1);
    expect(result.frozenDays).toEqual([]);
  });

  it('стрик не заходит дальше окна в 60 суток', async () => {
    // Непрерывная цепочка на 90 дней назад — окно обязано остановиться на 60-м, а не пройти
    // насквозь: массив дней ИСКУССТВЕННО содержит записи и за пределами окна, чтобы отличить
    // «стража нет» (вернул бы 90) от «окно применено» (вернёт 60).
    const days: string[] = [];
    for (let offset = 0; offset <= 90; offset += 1) days.push(subtractDays(TODAY, offset));
    const result = await computeSoftStreak(fakePool(days), 'owner-1', TODAY);

    expect(result.days).toBe(60);
  });

  it('сегодня без записи, вчера с записью — сегодняшний день сам считается изолированным пропуском', async () => {
    // Тот же механизм заморозки, что и для любого другого дня окна (`compute-soft-streak.ts`
    // не выделяет «сегодня» особым случаем): T-1 есть, T отсутствует — T замораживается,
    // счёт продолжается с T-1.
    const result = await computeSoftStreak(fakePool([subtractDays(TODAY, 1)]), 'owner-1', TODAY);

    expect(result.days).toBe(1);
    expect(result.frozenDays).toEqual([TODAY]);
  });

  it('пустое окно (ни одной записи за 60 суток) даёт нулевой стрик без заморозок', async () => {
    const result = await computeSoftStreak(fakePool([]), 'owner-1', TODAY);

    expect(result.days).toBe(0);
    expect(result.frozenDays).toEqual([]);
  });
});
