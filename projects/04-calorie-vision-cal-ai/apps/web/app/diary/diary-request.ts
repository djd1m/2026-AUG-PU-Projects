// `GET /api/v1/diary?date=YYYY-MM-DD` — маршрут 4 канона (`routes/diary.ts`). Чистая функция по
// тому же приёму, что и остальные сетевые обёртки этой фичи: строит запрос и разбирает ответ без
// DOM, дата — считается арифметикой строк `YYYY-MM-DD`, без часового пояса (тот же приём, что
// `compute-soft-streak.ts::subtractDays` на сервере — календарные сутки уже даны в
// `Europe/Moscow` в самой строке, повторно применять таймзону к готовой дате нельзя).

export interface DiaryTotals {
  readonly kcal: number;
  readonly protein: number;
  readonly fat: number;
  readonly carb: number;
}

export interface DiaryItem {
  readonly label_ru?: string;
  readonly mass_g?: number;
  readonly kcal?: number | null;
  readonly unmatched?: boolean;
}

export interface DiaryEntry {
  readonly entry_id: string;
  readonly recognition_id: string;
  readonly eaten_on: string;
  readonly meal_slot: string;
  readonly items: readonly DiaryItem[];
  readonly kcal_total: number;
  readonly protein_total: number;
  readonly fat_total: number;
  readonly carb_total: number;
  readonly user_corrected: boolean;
}

export interface DiaryDay {
  readonly date: string;
  readonly entries: readonly DiaryEntry[];
  readonly totals: DiaryTotals;
  readonly by_meal: Record<string, DiaryTotals>;
  readonly streak: { readonly days: number; readonly frozen_days: readonly string[] };
}

export function buildDiaryUrl(date: string): string {
  return `/api/v1/diary?date=${encodeURIComponent(date)}`;
}

export type DiaryDayOutcome =
  | { readonly kind: 'ok'; readonly day: DiaryDay }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'invalid_date' }
  | { readonly kind: 'error'; readonly message: string };

interface DiaryBody {
  readonly data?: DiaryDay;
}

export async function parseDiaryDayResponse(response: Response): Promise<DiaryDayOutcome> {
  if (response.status === 200) {
    const body = (await response.json().catch(() => null)) as DiaryBody | null;
    if (body?.data === undefined) return { kind: 'error', message: 'Сервер ответил без данных дня — попробуйте ещё раз.' };
    return { kind: 'ok', day: body.data };
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  if (response.status === 422) return { kind: 'invalid_date' };
  return { kind: 'error', message: `Сервер ответил неожиданно (${response.status}) — попробуйте ещё раз.` };
}

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/** Календарная дата «сегодня» по Москве — ТА ЖЕ формула, что и в `Intl`-форматировании
 * `limit/screen.tsx::formatResetAt`, только для целой даты, а не времени суток. */
export function moscowDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Сдвиг календарной даты на `deltaDays` (может быть отрицательным) — чистая арифметика по
 * компонентам строки, без повторного обращения к часовому поясу (тот же приём, что
 * `compute-soft-streak.ts::subtractDays` на сервере). */
export function shiftCalendarDate(date: string, deltaDays: number): string {
  if (!DATE_FORMAT.test(date)) return date;
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10));
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + deltaDays));
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** «Вперёд дальше сегодня — нельзя» (задача N4, экран дня): кнопка «вперёд» доступна, только
 * пока текущая дата СТРОГО раньше сегодняшней. Сравнение строк `YYYY-MM-DD` лексикографически
 * совпадает с хронологическим порядком (тот же приём, что `getDiaryDay.ts` на сервере). */
export function canGoForward(date: string, today: string): boolean {
  return date < today;
}

const MEAL_SLOT_LABELS: Record<string, string> = {
  breakfast: 'завтрак',
  lunch: 'обед',
  dinner: 'ужин',
  snack: 'перекус',
};

/** Неопознанный `meal_slot` — самый общий подписанный вариант, а не пустая строка
 * (`fail-closed-defaults`: неопознанное значение не должно выглядеть как «поле отсутствует»). */
export function mealSlotLabel(slot: string): string {
  return MEAL_SLOT_LABELS[slot] ?? 'приём пищи';
}
