import type { QuotaScope } from '@clipmaker/shared/enums';

// Five refusal entries for six accounting scopes. Refunds share the upload refusal.
export const quotaMessages = {
  user_rerenders: 'Пересборки на сегодня исчерпаны',
  user_uploads: 'Загрузки на сегодня исчерпаны',
  user_minutes: 'Минуты на сегодня исчерпаны',
  user_llm: 'Обработки на сегодня исчерпаны',
  global_minutes: 'Сервис перегружен, попробуйте позже',
  global_llm: 'Сервис перегружен, попробуйте позже',
} satisfies Record<Exclude<QuotaScope, 'user_upload_refunds'>, string>;

export function resetLabel(at: string): string {
  return `${new Date(at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} МСК`;
}
export interface RemainingLimits {
  uploads: number; minutes: number; selections: number; resets_at: string;
}
