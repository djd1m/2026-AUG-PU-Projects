// `diary-request.ts` — дата-арифметика и разбор `GET /api/v1/diary` (задача N4, экран дня).

import { describe, expect, it } from 'vitest';
import {
  buildDiaryUrl,
  canGoForward,
  mealSlotLabel,
  moscowDateString,
  parseDiaryDayResponse,
  shiftCalendarDate,
} from '../../apps/web/app/diary/diary-request';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('buildDiaryUrl', () => {
  it('GET /api/v1/diary?date=...', () => {
    expect(buildDiaryUrl('2026-09-13')).toBe('/api/v1/diary?date=2026-09-13');
  });
});

describe('shiftCalendarDate', () => {
  it('на день назад/вперёд — чистая арифметика по компонентам, не по локальной таймзоне', () => {
    expect(shiftCalendarDate('2026-09-13', -1)).toBe('2026-09-12');
    expect(shiftCalendarDate('2026-09-13', 1)).toBe('2026-09-14');
  });

  it('переход через границу месяца/года', () => {
    expect(shiftCalendarDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftCalendarDate('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('canGoForward', () => {
  it('можно, если дата СТРОГО раньше сегодняшней', () => {
    expect(canGoForward('2026-09-12', '2026-09-13')).toBe(true);
  });

  it('нельзя, если дата — сегодня; вперёд дальше сегодня запрещено (задача N4)', () => {
    expect(canGoForward('2026-09-13', '2026-09-13')).toBe(false);
  });

  it('нельзя для даты в будущем (по построению её и не должно быть, но проверяем явно)', () => {
    expect(canGoForward('2026-09-14', '2026-09-13')).toBe(false);
  });
});

describe('mealSlotLabel', () => {
  it('переводит четыре канонических значения', () => {
    expect(mealSlotLabel('breakfast')).toBe('завтрак');
    expect(mealSlotLabel('lunch')).toBe('обед');
    expect(mealSlotLabel('dinner')).toBe('ужин');
    expect(mealSlotLabel('snack')).toBe('перекус');
  });

  it('неопознанное значение — самый общий вариант, а не пустая строка (fail-closed-defaults)', () => {
    expect(mealSlotLabel('midnight-feast')).toBe('приём пищи');
  });
});

describe('parseDiaryDayResponse', () => {
  it('200 -> ok с data целиком', async () => {
    const day = { date: '2026-09-13', entries: [], totals: { kcal: 0, protein: 0, fat: 0, carb: 0 }, by_meal: {}, streak: { days: 0, frozen_days: [] } };
    expect(await parseDiaryDayResponse(jsonResponse({ data: day }, 200))).toEqual({ kind: 'ok', day });
  });

  it('401 -> unauthenticated', async () => {
    expect(await parseDiaryDayResponse(jsonResponse({}, 401))).toEqual({ kind: 'unauthenticated' });
  });

  it('422 -> invalid_date', async () => {
    expect(await parseDiaryDayResponse(jsonResponse({}, 422))).toEqual({ kind: 'invalid_date' });
  });

  it('неопознанный код -> error', async () => {
    const outcome = await parseDiaryDayResponse(jsonResponse({}, 500));
    expect(outcome.kind).toBe('error');
  });
});

describe('moscowDateString', () => {
  it('форматирует как YYYY-MM-DD', () => {
    expect(moscowDateString(new Date('2026-09-13T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
