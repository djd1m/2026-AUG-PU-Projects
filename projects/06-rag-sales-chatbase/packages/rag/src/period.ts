// из N4: projects/04-calorie-vision-cal-ai/apps/api/src/quota/keys.ts (moscowDay) — перенесено; добавлен месяц
// для bot_month_answers (quota_counter.period = 'YYYY-MM'). Сутки и месяц — Europe/Moscow (канон §7),
// а не UTC: иначе вопрос в 23:50 МСК списывался бы на завтрашние сутки.
const format = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
export function moscowDay(at: Date): string {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) throw new Error('Непригодный момент времени для периода квоты');
  return format.format(at);
}
export const moscowMonth = (at: Date): string => moscowDay(at).slice(0, 7);
